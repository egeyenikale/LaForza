# Vercel deployment runbook

La Forza deploys from one GitHub repository as two Vercel projects. The
frontend proxies `/backend/*` to the API, while the backend persists all
off-chain state in Upstash Redis. Base Sepolia remains the on-chain source of
truth for token balances and escrow settlement.

## 1. Push the repository

Both Vercel projects must point to the same GitHub repository and branch.

## 2. Create the backend project

1. Import the repository into Vercel as a new project named, for example,
   `laforza-api`.
2. Set **Root Directory** to `backend`.
3. Enable the project setting that allows build files outside the root
   directory. The backend build needs `packages/`, `contracts/`, and the root
   workspace lockfile.
4. Keep the install command from `backend/vercel.json`: `cd .. && npm ci`.
   Both Vercel projects install from the root workspace so shared build tools
   and packages are always present.
5. Keep the build command from `backend/vercel.json`: `npm run vercel-build`.
6. Add an Upstash Redis database from Vercel Marketplace and connect it to this
   backend project. Vercel should inject `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.
7. Add these backend environment variables:

```text
CHAIN_RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
CORS_ORIGIN=https://YOUR-FRONTEND.vercel.app
LOG_LEVEL=info
STORAGE_PREFIX=laforza:production
WDK_VAULT_PASSPHRASE=GENERATE_A_UNIQUE_32_PLUS_CHARACTER_SECRET
```

Use different `STORAGE_PREFIX` values for Preview and Production if preview
deployments must not share wallets or offers. Never add the WDK secret to a
`NEXT_PUBLIC_*` variable.

Deploy and verify:

```text
https://YOUR-BACKEND.vercel.app/health
```

The response must include `"status":"ok"`, `"storage":"redis"`, and
`"network":84532`. A Vercel deployment without Redis or without a unique WDK
vault secret intentionally fails at startup rather than silently losing data.

## 3. Create the frontend project

1. Import the same repository again as a second Vercel project named, for
   example, `laforza-web`.
2. Set **Root Directory** to `frontend`.
3. Enable access to files outside the root directory so the shared domain
   package can be built.
4. Keep the install command from `frontend/vercel.json`: `cd .. && npm ci`.
   This installs the root npm workspace, including the TypeScript compiler used
   to build `packages/domain`, rather than installing only the frontend folder.
5. Add the server-only variable:

```text
BACKEND_API_ORIGIN=https://YOUR-BACKEND.vercel.app
```

Do not set `NEXT_PUBLIC_API_BASE_URL` for the normal deployment. The browser
uses `/backend/api/v1`, and Next.js forwards it to `BACKEND_API_ORIGIN`. This
keeps the browser on one origin and avoids hard-coded preview URLs and CORS
failures.

Deploy, open `/app`, connect MetaMask, and switch to Base Sepolia. The connected
wallet must have Base Sepolia ETH before it can deploy the test token and escrow.

## 3.1 Contract deployment and test USDt

Do not configure a deployer private key in either Vercel project. Contract
deployment deliberately happens from the connected buyer's MetaMask account:

1. MetaMask deploys the six-decimal `MockUSDT` contract on Base Sepolia.
2. MetaMask deploys the versioned `DeadlineEscrow` for the selected player and
   exact buyer, seller, player, verifier, amount, and deadlines.
3. The faucet calls the token's on-chain `mint` function. The minted balance is
   therefore held by the connected address and can be inspected on BaseScan; it
   is not a UI-only balance.
4. Funding performs real ERC-20 `approve` and `transferFrom` calls. The signing
   bonus is transferred to the player during funding, and the milestone amount
   is transferred to the selling club when the WDK verifier releases it.

This is real testnet settlement using a La Forza test token, not official
mainnet Tether USDt. The open mint function is intentional for hackathon
testing and must be replaced with an access-controlled issuer before any
production-value deployment.

## 4. Production smoke test

1. `/health` reports Redis and chain 84532.
2. `/app` loads the six-player catalog.
3. A second MetaMask wallet can register as a club/tester and submit a signed
   offer; refresh the page and confirm the offer remains.
4. The buyer wallet deploys/reuses test USDt and `DeadlineEscrow`.
5. Refresh or wait for a backend cold start; the active deal must still load.
6. Complete signatures, approve/fund, and release the milestone; verify every
   transaction in the Base Sepolia explorer.

## Security boundary

This hosted configuration is testnet-only. The backend refuses the local
server-side deployer path on public networks and Vercel refuses any chain other
than Base Sepolia. Before a mainnet launch, replace the shared operator WDK
vault with per-organization authentication, KMS/HSM-backed secret handling,
role authorization, audit retention, rate limiting, and a legal/compliance
review of the transfer workflow.

# La Forza

**Policy-bound football deals. Self-custodial keys. Verifiable test USD₮ settlement.**

La Forza is a working football registration deal room built for the Tether
Developers Cup. A buying-club agent negotiates inside a human-authored mandate;
buyer, seller, and player sign one canonical authorization; a Solidity escrow
then pays a signing bonus and an evidence-backed milestone.

## Run the complete demo

Requirements: Node.js 22.17+ and npm 10.9+.

```bash
npm install
npm run demo
```

Open [http://localhost:3000](http://localhost:3000). The root route is the
standalone landing page; **Try Demo** opens the working application at
[http://localhost:3000/app](http://localhost:3000/app). `/app` opens directly on
the Transfer Desk; it does not repeat the grass landing hero. The command starts:

- a local Hardhat EVM chain on `127.0.0.1:8545`;
- the Fastify API on `127.0.0.1:4000`;
- the Next.js deal room on `localhost:3000`.

The application requires the MetaMask browser extension. It adds/switches to the
local EVM chain (`31337`) through the standard EIP-1193 prompt. The connected
address becomes the escrow buyer and receives local test ETH plus 50,000 test
USD₮ when a deal is deployed.

### Public Base Sepolia mode

```bash
npm run demo:testnet
```

This starts Fastify and Next.js against the official Base Sepolia RPC (chain
`84532`). The connected MetaMask account deploys both `MockUSDT` and
`DeadlineEscrow`, funds the WDK verifier with test gas, and mints 50,000
six-decimal La Forza test USD₮. Contract and transaction links open on the Base
Sepolia explorer. The account must already hold Base Sepolia ETH from a faucet.
No deployer private key is requested or stored by La Forza.

The `/app` route is split into six working areas:

- **Overview** — current file, progress, latest evidence, and released value;
- **Players** — a selectable four-player shortlist with football and contract context;
- **Offers** — incoming asks, rejected proposals, the active counter, and its status;
- **Deal room** — the seven policy, signature, funding, and release actions;
- **Ledger** — events, EIP-712 digest, balances, and transaction hashes;
- **About** — the product problem, control model, track honesty, and local run guide.

Connect MetaMask, select a player, and click the seven deal-room actions in order.
They demonstrate a policy rejection, a human approval boundary, a real MetaMask
EIP-712 buyer signature, WDK counterparty signatures, MetaMask ERC-20 approval and
escrow funding, and WDK verifier-only milestone release. Every amount is
**test USD₮** with no real value. Public mode creates persistent Base Sepolia
records, but the token is not issued or endorsed by Tether.

## Why this is a real WDK entry

WDK is load-bearing in three places:

1. **Policy-bound authorization** — `@tetherto/wdk` simulates and enforces the
   buying club's `signTypedData` rules. A 1,100 USD₮ proposal is denied by the
   1,000 USD₮ ceiling. A 900 USD₮ proposal requires approval of its exact digest.
2. **Self-custodial counterparties** — seller, player, and verifier are distinct
   `@tetherto/wdk-wallet-evm` accounts. Their BIP-39 phrases are AES-256-GCM
   encrypted locally with the server-side `WDK_VAULT_PASSPHRASE` and never
   returned by the API. The buyer is the user's connected MetaMask account.
3. **Split execution boundary** — MetaMask signs and broadcasts the buyer's exact
   ERC-20 approval and escrow funding calls. A narrowly scoped WDK policy permits
   the verifier to release only the proven milestone. The UI exposes transaction
   hashes, connected account, token address, network, and balances.

The TypeScript protocol package and Solidity contract independently compute the
same EIP-712 digest. Contract tests fail if the two formats drift.

## Track position

La Forza targets **WDK (Wallets)** and the football/global-tournament theme.
It does not claim Pears or QVAC usage. This is intentional: one deeply integrated,
judge-runnable track is stronger than decorative SDK labels.

## Repository layout

```text
frontend/          Separate landing page, /app workspace, MetaMask EIP-1193 client
backend/           Player catalog, offer book, WDK policies, vault, event log
packages/domain/   Shared validation and deterministic deal state machine
packages/protocol/ Canonical EIP-712 authorization and milestone hashing
contracts/         DeadlineEscrow, MockUSDT, and adversarial contract tests
docs/              Architecture, trust boundaries, and demo runbook
```

## Quality gates

```bash
npm run check
npm run verify:metamask
```

The suite covers the domain state machine, policy verdicts, recovered WDK and
external-buyer signatures, encrypted vault behavior, append-only events,
protocol hashes, and escrow permissions/invariants. `verify:metamask` runs the
same external EVM signature/approve/fund path used by MetaMask against Hardhat.

## Safety boundary

This is a hackathon prototype, not a FIFA transfer registry, legal contract
service, custody provider, or production payment system. The local mode's
checked-in Hardhat deployer key is public test material and must never receive
real assets. Base Sepolia mode creates public testnet records only.

See [the architecture](docs/architecture.md) and [demo runbook](docs/demo-scope.md).

## Deploy to Vercel

The repository is prepared as two Vercel projects with root directories
`backend` and `frontend`. The hosted backend requires Upstash Redis; it persists
the encrypted WDK vault, signed offer marketplace, event history, normal API
deals, and the active Base Sepolia runtime across serverless cold starts. The
frontend reaches it through a same-origin `/backend/*` rewrite.

Follow the complete [Vercel deployment runbook](docs/vercel-deployment.md).
The backend intentionally refuses to boot on Vercel without Redis, a unique
`WDK_VAULT_PASSPHRASE`, and `CHAIN_ID=84532`; this prevents an apparently live
deployment from silently losing state or using the unsafe local demo defaults.

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

Open [http://localhost:3000](http://localhost:3000). The command starts:

- a local Hardhat EVM chain on `127.0.0.1:8545`;
- the Fastify API on `127.0.0.1:4000`;
- the Next.js deal room on `localhost:3000`.

Click the seven deal-room actions in order. They demonstrate a policy rejection,
a human approval boundary, three EIP-712 signatures, a WDK token approval, escrow
funding, and verifier-only milestone release. Every amount is local **test USD₮**;
there are no real funds.

## Why this is a real WDK entry

WDK is load-bearing in three places:

1. **Policy-bound authorization** — `@tetherto/wdk` simulates and enforces the
   buying club's `signTypedData` rules. A 1,100 USD₮ proposal is denied by the
   1,000 USD₮ ceiling. A 900 USD₮ proposal requires approval of its exact digest.
2. **Self-custodial signers** — buyer, seller, player, and verifier are distinct
   `@tetherto/wdk-wallet-evm` accounts. Their BIP-39 phrases are AES-256-GCM
   encrypted locally with a passkey and never returned by the API.
3. **Wallet execution** — narrowly scoped WDK policies allow only the exact test
   token approval, canonical escrow funding call, and evidence-bound milestone
   release. The UI exposes the resulting transaction hashes and balances.

The TypeScript protocol package and Solidity contract independently compute the
same EIP-712 digest. Contract tests fail if the two formats drift.

## Track position

La Forza targets **WDK (Wallets)** and the football/global-tournament theme.
It does not claim Pears or QVAC usage. This is intentional: one deeply integrated,
judge-runnable track is stronger than decorative SDK labels.

## Repository layout

```text
frontend/          Next.js football deal room and live demo controls
backend/           Fastify API, WDK policies, encrypted wallet vault, event log
packages/domain/   Shared validation and deterministic deal state machine
packages/protocol/ Canonical EIP-712 authorization and milestone hashing
contracts/         DeadlineEscrow, MockUSDT, and adversarial contract tests
docs/              Architecture, trust boundaries, and demo runbook
```

## Quality gates

```bash
npm run check
```

The suite covers the domain state machine, policy verdicts, recovered WDK
signatures, encrypted vault behavior, append-only events, protocol hashes, and
escrow permissions/invariants.

## Safety boundary

This is a local-chain hackathon prototype, not a FIFA transfer registry, legal
contract service, custody provider, or production payment system. The checked-in
Hardhat deployer key is public test material and must never receive real assets.

See [the architecture](docs/architecture.md) and [demo runbook](docs/demo-scope.md).

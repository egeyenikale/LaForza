# LaForza / DEADLINE

**Two clubs. Two policy-bound agent wallets. One signed deal before the window closes.**

DEADLINE is a self-custodial football deal room built for the Tether Developers Cup. Club agents negotiate inside human-defined budgets, all parties sign the same terms, and a smart-contract escrow releases USD₮ against explicit milestones.

## Repository layout

```text
frontend/          Next.js deal-room interface; never owns backend or counterparty keys
backend/           Fastify orchestration API and deterministic negotiation state machine
packages/domain/   Shared schemas, money types, policies, and state transitions
contracts/         Solidity escrow and deployment code (introduced as an isolated workspace)
docs/              Architecture decisions, threat model, and demo runbook
```

The boundaries are deliberate:

- **Domain** decides whether an offer or transition is valid.
- **Agent policy** decides whether an agent is allowed to propose/sign it.
- **WDK** creates accounts, signs typed data, and prepares wallet execution.
- **The smart contract** enforces custody and milestone payouts on-chain.
- **The frontend** renders signed facts; it is never the source of financial truth.

## Local development

Requirements: Node.js 22.17 or later and npm 10.9 or later.

```bash
cp .env.example .env
npm install
npm run dev:backend
npm run dev:frontend
```

Run all quality gates:

```bash
npm run check
npm run build
```

## Safety posture

This is a testnet prototype for grassroots and academy loan/bonus agreements, not a FIFA transfer registry or legal-contract service. No production keys, mnemonics, or funded credentials belong in this repository.

See [docs/architecture.md](docs/architecture.md) for the system design and invariants.

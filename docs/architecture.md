# Architecture

## Product boundary

DEADLINE demonstrates a single verifiable flow:

1. A selling club publishes minimum acceptable deal terms.
2. A buying-club agent negotiates under a human-authored wallet policy.
3. An over-budget offer is rejected before signing.
4. Buyer, seller, and player sign one canonical deal payload.
5. USD₮ is locked in escrow.
6. Signing and appearance milestones release deterministic payouts.

It does not claim to replace governing bodies, identity checks, employment law, or regulated transfer infrastructure.

## Components

```text
┌──────────────────────────┐
│ Next.js deal-room UI     │
└────────────┬─────────────┘
             │ HTTPS / JSON
┌────────────▼─────────────┐
│ Fastify orchestration    │
│ - deal state machine     │
│ - policy evaluation      │
│ - typed payload builder  │
└───────┬─────────┬────────┘
        │         │
        │         └─────────────┐
┌───────▼────────┐     ┌────────▼──────────┐
│ Tether WDK     │     │ DealEscrow.sol    │
│ local signing  │     │ on-chain custody  │
└────────────────┘     └───────────────────┘
```

## Trust boundaries

- A local WDK policy is a pre-execution guard, not on-chain authorization.
- The escrow contract independently enforces funded amounts and milestone release ceilings.
- The backend may coordinate and relay public data but cannot fabricate participant signatures.
- Every offer includes a nonce, expiry, chain ID, and deal ID to prevent replay across deals or networks.
- Monetary values use integer micro-USD₮ units. Floating-point values are forbidden in the domain.
- State changes are append-only events; projections can be rebuilt from those events.

## Domain state machine

```text
DRAFT → NEGOTIATING → AWAITING_SIGNATURES → READY_TO_FUND
                                           ↓
                                      FUNDED → ACTIVE → COMPLETED

Any pre-funding state may become CANCELLED. Funded cancellation requires the contract's refund path.
```

## Initial deployment target

- Ethereum Sepolia
- Test USD₮ with six decimals
- ERC-4337/gasless execution where the selected WDK module supports it
- EIP-712 deal and offer signatures

# Architecture

## One canonical deal

La Forza proves one narrow flow end to end:

1. A buyer agent rejects 1,100 USD₮ because the club mandate stops at 1,000.
2. A 900 USD₮ counteroffer reaches the explicit 750 USD₮ human threshold.
3. The sporting director approves one exact EIP-712 digest in MetaMask.
4. The MetaMask buyer and WDK seller/player sign that same digest.
5. The buyer's MetaMask account approves test USD₮ and funds the escrow.
6. The contract immediately releases a 250 test USD₮ signing bonus.
7. The named verifier submits evidence and releases the 650 test USD₮ milestone.

## Components

```text
┌────────────────────────────┐
│ Next.js /app deal room     │
│ MetaMask EIP-1193 buyer    │
└─────────────┬──────────────┘
              │ HTTP / JSON + direct EVM writes
┌─────────────▼──────────────┐
│ Fastify orchestration      │
│ encrypted vault · events   │
└──────┬───────────┬─────────┘
       │           │ JSON-RPC reads/deploy
┌──────▼───────┐   ▼
│ Tether WDK   │   Local Hardhat EVM
│ policy/sign  │──▶ MockUSDT + DeadlineEscrow
│ verify/send  │
└──────────────┘
```

## Trust boundaries and invariants

- The frontend never receives a seed phrase or private key.
- WDK BIP-39 phrases are encrypted with passkey-derived scrypt keys and
  AES-256-GCM. Only addresses, salts, IVs, tags, and ciphertext are persisted.
- The MetaMask private key never enters La Forza; the browser requests accounts,
  typed-data signatures, token approval, and escrow funding via EIP-1193.
- Human approval is bound to the exact authorization digest, not merely an
  amount or UI session.
- WDK's policy proxy defaults to denial. The verifier's short-lived WDK session
  permits only the exact evidence-bound `releaseMilestone` call.
- Buyer, seller, and player signatures cover chain ID, escrow address, deal ID,
  actors, token, amounts, milestone root, and both deadlines.
- The contract rechecks all three signatures before custody changes.
- Only the named verifier can release the named milestone; double release and
  zero evidence are rejected.
- Money uses integer micro-USD₮ units. Floating-point values never cross a
  financial boundary.
- Demo events are append-only JSONL. On-chain balances remain the settlement
  source of truth.

## Track boundary

The current entry uses WDK deeply and does not claim Pears or QVAC. A future P2P
transport could replicate signed public events, but it is not part of this
submission proof and is not represented in the UI.

## Deployment boundary

The judge path is a deterministic local Hardhat chain using a six-decimal
`MockUSDT`. The local deployer key is public test material. Moving to a testnet
requires explicit RPC, funded test gas, deployed token addresses, a deployment
record, and separate operational review; none of that is implied by this demo.

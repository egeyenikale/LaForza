# DeadlineEscrow

`DeadlineEscrow.sol` is the on-chain custody boundary for one accepted football
deal. The local WDK policy decides whether an agent may sign; the contract never
trusts that local decision and verifies the signed terms independently.

## Enforced invariants

- Buyer, seller, and player must approve the same EIP-712 authorization.
- EOA and ERC-1271 smart-account signatures are both supported.
- Signing bonus plus all milestone allocations must equal the funded amount.
- Funding happens once, before the funding deadline, from the named buyer.
- The signing bonus is released to the player immediately after funding.
- Only the named verifier may release a milestone, once, with a non-zero
  evidence hash.
- Unreleased funds return to the buyer after the settlement deadline.
- All token movement uses OpenZeppelin `SafeERC20` and reentrancy guards.

Milestone evidence is an attestation boundary: the contract records its hash and
enforces the payout ceiling, but it does not claim to know whether an appearance
occurred. The demo makes the verifier role explicit.

## Commands

```bash
npm run build --workspace @laforza/contracts
npm test --workspace @laforza/contracts
```

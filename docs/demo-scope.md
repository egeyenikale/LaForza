# Judge demo runbook

## Start

```bash
npm install
npm run demo
```

Open `http://localhost:3000`, click **Try Demo**, and connect MetaMask on `/app`.
Approve the prompt to add/switch to **LaForza Local EVM** (`31337`). Enter the
**Players** tab, choose a player, and select **Start this deal**. The WDK vault
passphrase is an operator-side environment setting and is not shown to football
users. The connected address becomes the buyer and receives local test gas plus
2,000 six-decimal test USD₮.

For public explorer-verifiable records, start with `npm run demo:testnet`
instead. MetaMask switches to Base Sepolia (`84532`) and the connected account
deploys the test token plus escrow itself. This requires faucet-funded Base
Sepolia ETH. The resulting contract and transaction links remain visible on the
public explorer.

## Seven visible proofs

1. **Try 1,100 USD₮** — WDK reports `DENY` and the `deny-over-budget` rule.
2. **Counter at 900 USD₮** — WDK requires human sporting-director approval.
3. **Director approves** — MetaMask signs only the approved canonical EIP-712 digest.
4. **Seller signs** — the selling-club WDK account signs the same digest.
5. **Player signs** — the player account completes the required signer set.
6. **Fund escrow** — MetaMask prompts for the ERC-20 approval and escrow funding
   transactions. The player balance becomes 250 test USD₮.
7. **Verify appearance** — the verifier broadcasts milestone evidence. The seller
   balance becomes 650 test USD₮ and the escrow balance returns to zero.

The connected account, chain, test ETH, test USD₮, audit trail, actor balances,
contract addresses, authorization digest, and all three write transaction
hashes are visible on the page. The local faucet can mint another 500 test USD₮.

The **Offers** tab preserves the initial club ask, the policy-rejected proposal,
and the active 900 test USD₮ counter as separate commercial records. Its state
progresses through human approval, signatures, funding, and settlement.

## Expected final state

```text
Buyer      1,100 test USD₮
Seller       650 test USD₮
Player       250 test USD₮
Escrow         0 test USD₮
Released      900 test USD₮
```

## Explicitly out of scope

- Mainnet or real USD₮
- FIFA/association registration or legal enforceability
- KYC, employment-law, or securities claims
- A cloud custodian or hosted signing service
- Pears and QVAC track claims
- More than one verifier/evidence design

Public mode uses La Forza's mintable six-decimal demo token. It is not an
official Tether deployment and must never be represented as one.

## Automated external-wallet verification

With `npm run demo` already running:

```bash
npm run verify:metamask
```

The script uses an external Hardhat EVM signer to exercise the exact typed-data,
token approval, escrow funding, and WDK release path used by the browser. It is a
repeatable integration check; interactive browser approvals still occur only in
MetaMask.

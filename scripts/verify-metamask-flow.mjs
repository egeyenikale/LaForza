import assert from "node:assert/strict";

import { Contract, JsonRpcProvider, NonceManager, Wallet } from "ethers";

const API = process.env.API_BASE ?? "http://127.0.0.1:4000/api/v1";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const PASSKEY = "laforza-local-demo";
const TEST_BUYER_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const tokenAbi = [
  "function approve(address spender, uint256 amount) returns (bool)",
];
const escrowAbi = [
  "function fund(bytes buyerSignature, bytes sellerSignature, bytes playerSignature)",
];

async function post(path, body) {
  const response = await fetch(`${API}/demo/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `${path} failed`);
  return result;
}

const provider = new JsonRpcProvider(RPC, 31337);
const buyerWallet = new Wallet(TEST_BUYER_PRIVATE_KEY, provider);
const buyer = new NonceManager(buyerWallet);
const buyerAddress = await buyer.getAddress();

let state = await post("bootstrap", {
  passkey: PASSKEY,
  playerId: "mert-kaya",
  buyerAddress,
});
assert.equal(state.custodyMode, "METAMASK");
assert.equal(
  state.authorization.buyer.toLowerCase(),
  buyerAddress.toLowerCase(),
);

await post("attempt-over-budget", { passkey: PASSKEY });
state = await post("review-counter", { passkey: PASSKEY });

const buyerSignature = await buyer.signTypedData(
  {
    name: "LaForza Deadline",
    version: "1",
    chainId: state.network.chainId,
    verifyingContract: state.contracts.escrow,
  },
  {
    DealAuthorization: [
      { name: "dealId", type: "bytes32" },
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "player", type: "address" },
      { name: "token", type: "address" },
      { name: "totalAmount", type: "uint256" },
      { name: "signingBonus", type: "uint256" },
      { name: "milestoneRoot", type: "bytes32" },
      { name: "fundingDeadline", type: "uint64" },
      { name: "settlementDeadline", type: "uint64" },
    ],
  },
  state.authorization,
);

await post("approve/metamask", { signature: buyerSignature });
await post("sign/seller", { passkey: PASSKEY });
state = await post("sign/player", { passkey: PASSKEY });
assert.ok(state.execution);

const token = new Contract(state.contracts.token, tokenAbi, buyer);
const approval = await token.getFunction("approve")(
  state.contracts.escrow,
  BigInt(state.deal.totalAmountMicroUsdt),
);
await approval.wait();

const escrow = new Contract(state.contracts.escrow, escrowAbi, buyer);
const funding = await escrow.getFunction("fund")(
  state.execution.buyerSignature,
  state.execution.sellerSignature,
  state.execution.playerSignature,
);
await funding.wait();

await post("fund/metamask", {
  approvalTxHash: approval.hash,
  fundingTxHash: funding.hash,
});
state = await post("release", { passkey: PASSKEY });

assert.equal(state.chainState.funded, true);
assert.equal(state.chainState.releasedAmountMicroUsdt, "900000000");
assert.equal(state.chainState.balances.BUYER, "1100000000");
assert.equal(state.chainState.balances.SELLER, "650000000");
assert.equal(state.chainState.balances.PLAYER, "250000000");
assert.equal(state.chainState.balances.ESCROW, "0");

console.log(
  JSON.stringify(
    {
      verified: true,
      custodyMode: state.custodyMode,
      buyer: buyerAddress,
      token: state.contracts.token,
      escrow: state.contracts.escrow,
      approval: state.transactions.approval,
      funding: state.transactions.funding,
      release: state.transactions.release,
      balances: state.chainState.balances,
    },
    null,
    2,
  ),
);

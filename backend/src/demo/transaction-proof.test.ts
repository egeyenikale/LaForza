import { Interface } from "ethers";
import { describe, expect, it } from "vitest";

import {
  provesBuyerApproval,
  provesEscrowFunding,
} from "./transaction-proof.js";

const token = "0x1000000000000000000000000000000000000001";
const escrow = "0x2000000000000000000000000000000000000002";
const buyer = "0x3000000000000000000000000000000000000003";
const other = "0x4000000000000000000000000000000000000004";
const dealId = `0x${"ab".repeat(32)}`;

const log = (
  address: string,
  abi: string,
  event: string,
  values: readonly unknown[],
) => {
  const contractInterface = new Interface([abi]);
  const encoded = contractInterface.encodeEventLog(
    contractInterface.getEvent(event)!,
    [...values],
  );
  return { address, topics: encoded.topics, data: encoded.data };
};

describe("MetaMask transaction proofs", () => {
  it("accepts a nested buyer approval without trusting receipt.from", () => {
    const logs = [
      log(
        token,
        "event Approval(address indexed owner, address indexed spender, uint256 value)",
        "Approval",
        [buyer, escrow, 900n],
      ),
    ];

    expect(
      provesBuyerApproval(logs, {
        token,
        buyer,
        escrow,
        minimumAmount: 900n,
      }),
    ).toBe(true);
    expect(
      provesBuyerApproval(logs, {
        token,
        buyer: other,
        escrow,
        minimumAmount: 900n,
      }),
    ).toBe(false);
  });

  it("requires the exact escrow, deal, buyer, and amount funding event", () => {
    const logs = [
      log(
        escrow,
        "event DealFunded(bytes32 indexed dealId, address indexed buyer, uint256 amount)",
        "DealFunded",
        [dealId, buyer, 900n],
      ),
    ];

    expect(
      provesEscrowFunding(logs, { escrow, dealId, buyer, amount: 900n }),
    ).toBe(true);
    expect(
      provesEscrowFunding(logs, {
        escrow,
        dealId,
        buyer: other,
        amount: 900n,
      }),
    ).toBe(false);
  });
});

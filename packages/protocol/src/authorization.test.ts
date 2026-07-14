import { keccak256, toUtf8Bytes } from "ethers";
import { describe, expect, it } from "vitest";

import {
  buildDealAuthorizationTypedData,
  hashDealAuthorization,
  hashMilestones,
} from "./authorization.js";

describe("deal authorization protocol", () => {
  it("builds one deterministic EIP-712 payload", () => {
    const milestoneRoot = hashMilestones([
      {
        id: keccak256(toUtf8Bytes("appearance-10")),
        threshold: 10n,
        amount: 650_000_000n,
        beneficiary: "0x2222222222222222222222222222222222222222",
      },
    ]);
    const envelope = {
      chainId: 31_337,
      verifyingContract: "0x1111111111111111111111111111111111111111",
      authorization: {
        dealId: keccak256(toUtf8Bytes("deadline-demo")),
        buyer: "0x3333333333333333333333333333333333333333",
        seller: "0x2222222222222222222222222222222222222222",
        player: "0x4444444444444444444444444444444444444444",
        token: "0x5555555555555555555555555555555555555555",
        totalAmount: 900_000_000n,
        signingBonus: 250_000_000n,
        milestoneRoot,
        fundingDeadline: 2_000_000_000n,
        settlementDeadline: 2_000_086_400n,
      },
    };

    const first = hashDealAuthorization(envelope);
    const second = hashDealAuthorization(envelope);
    const typedData = buildDealAuthorizationTypedData(envelope);

    expect(first).toBe(second);
    expect(first).toMatch(/^0x[0-9a-f]{64}$/);
    expect(typedData.message.milestoneRoot).toBe(milestoneRoot);
  });
});

import type { AgentPolicy } from "@laforza/domain";
import {
  buildDealAuthorizationTypedData,
  hashDealAuthorization,
  type DealAuthorizationEnvelope,
} from "@laforza/protocol";
import { keccak256, toUtf8Bytes, verifyTypedData } from "ethers";
import { describe, expect, it } from "vitest";

import { WdkDealAgent } from "./wdk-deal-agent.js";

const counterparty = "0x2222222222222222222222222222222222222222";
const escrow = "0x1111111111111111111111111111111111111111";
const now = new Date("2026-07-15T00:00:00.000Z");

const policy: AgentPolicy = {
  maxDealMicroUsdt: 1_000_000_000,
  humanApprovalThresholdMicroUsdt: 750_000_000,
  allowedCounterparties: [counterparty],
  expiresAt: "2026-07-16T00:00:00.000Z",
};

function envelope(totalAmount: bigint): DealAuthorizationEnvelope {
  return {
    chainId: 11_155_111,
    verifyingContract: escrow,
    authorization: {
      dealId: keccak256(toUtf8Bytes("deadline-demo")),
      buyer: "0x3333333333333333333333333333333333333333",
      seller: counterparty,
      player: "0x4444444444444444444444444444444444444444",
      token: "0x5555555555555555555555555555555555555555",
      totalAmount,
      signingBonus: 250_000_000n,
      milestoneRoot: keccak256(toUtf8Bytes("milestones")),
      fundingDeadline: 1_784_150_000n,
      settlementDeadline: 1_784_236_400n,
    },
  };
}

describe("WDK deal agent", () => {
  it("denies an authorization above the club's hard maximum", async () => {
    const result = await new WdkDealAgent().evaluateAuthorization({
      policy,
      envelope: envelope(1_100_000_000n),
      counterparty,
      now,
    });

    expect(result).toMatchObject({
      decision: "DENY",
      matched_rule: "deny-over-budget",
      reason: "Authorization exceeds the club's maximum deal mandate",
    });
  });

  it("routes a mid-sized authorization to human approval", async () => {
    const result = await new WdkDealAgent().evaluateAuthorization({
      policy,
      envelope: envelope(900_000_000n),
      counterparty,
      now,
    });

    expect(result).toMatchObject({
      decision: "DENY",
      matched_rule: "require-human-approval",
      reason: "Authorization requires human sporting-director approval",
    });
  });

  it("signs only the exact human-approved EIP-712 authorization", async () => {
    const approvedEnvelope = envelope(900_000_000n);
    const digest = hashDealAuthorization(approvedEnvelope);
    const result = await new WdkDealAgent().evaluateAuthorization({
      policy,
      envelope: approvedEnvelope,
      counterparty,
      now,
      humanApprovedDigest: digest,
      sign: true,
    });
    const typedData = buildDealAuthorizationTypedData(approvedEnvelope);
    const recovered = verifyTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
      result.signature!,
    );

    expect(result.decision).toBe("ALLOW");
    expect(result.authorizationDigest).toBe(digest);
    expect(recovered.toLowerCase()).toBe(result.agentAddress.toLowerCase());
  });
});

import type { AgentPolicy, Offer } from "@laforza/domain";
import { verifyTypedData } from "ethers";
import { describe, expect, it } from "vitest";

import { buildOfferTypedData } from "./deal-typed-data.js";
import { WdkDealAgent } from "./wdk-deal-agent.js";

const counterparty = "0x2222222222222222222222222222222222222222";
const escrow = "0x1111111111111111111111111111111111111111";
const now = new Date("2026-07-15T00:00:00.000Z");

const policy: AgentPolicy = {
  maxDealMicroUsdt: 1_500_000_000,
  humanApprovalThresholdMicroUsdt: 1_000_000_000,
  allowedCounterparties: [counterparty],
  expiresAt: "2026-07-16T00:00:00.000Z",
};

function offer(totalMicroUsdt: number): Offer {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    dealId: "22222222-2222-4222-8222-222222222222",
    proposer: "BUYING_CLUB",
    counterparty,
    totalMicroUsdt,
    signingBonusMicroUsdt: 250_000_000,
    milestones: [
      {
        id: "appearance-10",
        label: "Ten first-team appearances",
        kind: "APPEARANCE",
        threshold: 10,
        amountMicroUsdt: 250_000_000,
      },
    ],
    nonce: 1,
    expiresAt: "2026-07-15T12:00:00.000Z",
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("WDK deal agent", () => {
  it("denies an offer above the club's hard maximum", async () => {
    const result = await new WdkDealAgent().evaluateOffer({
      policy,
      offer: offer(1_600_000_000),
      chainId: 11_155_111,
      verifyingContract: escrow,
      now,
    });

    expect(result).toMatchObject({
      decision: "DENY",
      matched_rule: "deny-over-budget",
      reason: "Offer exceeds the club's maximum deal mandate",
    });
  });

  it("routes a mid-sized offer to human approval", async () => {
    const result = await new WdkDealAgent().evaluateOffer({
      policy,
      offer: offer(1_200_000_000),
      chainId: 11_155_111,
      verifyingContract: escrow,
      now,
    });

    expect(result).toMatchObject({
      decision: "DENY",
      matched_rule: "require-human-approval",
      reason: "Offer requires human sporting-director approval",
    });
  });

  it("signs an allowed EIP-712 offer with the policy-governed WDK account", async () => {
    const allowedOffer = offer(900_000_000);
    const result = await new WdkDealAgent().evaluateOffer({
      policy,
      offer: allowedOffer,
      chainId: 11_155_111,
      verifyingContract: escrow,
      now,
      sign: true,
    });
    const typedData = buildOfferTypedData(allowedOffer, 11_155_111, escrow);
    const recovered = verifyTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
      result.signature!,
    );

    expect(result.decision).toBe("ALLOW");
    expect(result.matched_rule).toBe("allow-mandated-offer");
    expect(recovered.toLowerCase()).toBe(result.agentAddress.toLowerCase());
  });
});

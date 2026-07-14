import { policyEvaluationRequestSchema } from "@laforza/domain";
import type { FastifyPluginAsync } from "fastify";

import { WdkDealAgent } from "../agents/wdk-deal-agent.js";

export const registerPolicyRoutes: FastifyPluginAsync = async (app) => {
  const agent = new WdkDealAgent();

  app.post("/policies/evaluate-offer", async (request) => {
    const input = policyEvaluationRequestSchema.parse(request.body);
    const result = await agent.evaluateAuthorization({
      policy: input.policy,
      counterparty: input.counterparty,
      envelope: {
        chainId: input.chainId,
        verifyingContract: input.verifyingContract,
        authorization: {
          ...input.authorization,
          totalAmount: BigInt(input.authorization.totalAmount),
          signingBonus: BigInt(input.authorization.signingBonus),
          fundingDeadline: BigInt(input.authorization.fundingDeadline),
          settlementDeadline: BigInt(input.authorization.settlementDeadline),
        },
      },
      ...(input.humanApprovedDigest
        ? { humanApprovedDigest: input.humanApprovedDigest }
        : {}),
    });

    return { data: result };
  });

  app.post("/policies/sign-offer", async (request) => {
    const input = policyEvaluationRequestSchema.parse(request.body);
    const result = await agent.evaluateAuthorization({
      policy: input.policy,
      counterparty: input.counterparty,
      envelope: {
        chainId: input.chainId,
        verifyingContract: input.verifyingContract,
        authorization: {
          ...input.authorization,
          totalAmount: BigInt(input.authorization.totalAmount),
          signingBonus: BigInt(input.authorization.signingBonus),
          fundingDeadline: BigInt(input.authorization.fundingDeadline),
          settlementDeadline: BigInt(input.authorization.settlementDeadline),
        },
      },
      ...(input.humanApprovedDigest
        ? { humanApprovedDigest: input.humanApprovedDigest }
        : {}),
      sign: true,
    });

    return { data: result };
  });
};

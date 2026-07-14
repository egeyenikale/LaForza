import { policyEvaluationRequestSchema } from "@laforza/domain";
import type { FastifyPluginAsync } from "fastify";

import { WdkDealAgent } from "../agents/wdk-deal-agent.js";

export const registerPolicyRoutes: FastifyPluginAsync = async (app) => {
  const agent = new WdkDealAgent();

  app.post("/policies/evaluate-offer", async (request) => {
    const input = policyEvaluationRequestSchema.parse(request.body);
    const result = await agent.evaluateOffer(input);

    return { data: result };
  });

  app.post("/policies/sign-offer", async (request) => {
    const input = policyEvaluationRequestSchema.parse(request.body);
    const result = await agent.evaluateOffer({ ...input, sign: true });

    return { data: result };
  });
};

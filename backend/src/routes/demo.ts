import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { DemoService } from "../demo/demo-service.js";

const passkeySchema = z.object({
  passkey: z.string().min(12).max(200),
});

const bootstrapSchema = passkeySchema.extend({
  playerId: z.string().min(2).max(80).default("mert-kaya"),
  buyerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
});

const metamaskSignatureSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
});

const metamaskFundingSchema = z.object({
  approvalTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  fundingTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export const registerDemoRoutes: FastifyPluginAsync<{
  demoService: DemoService;
}> = async (app, { demoService }) => {
  app.get("/demo/state", async () => demoService.state());
  app.get("/demo/players", async () => ({ players: demoService.players() }));

  app.post("/demo/bootstrap", async (request, reply) => {
    const parsed = bootstrapSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    try {
      return await demoService.bootstrap(
        parsed.data.passkey,
        parsed.data.playerId,
        parsed.data.buyerAddress,
      );
    } catch (error) {
      request.log.warn({ error }, "demo bootstrap failed");
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Demo bootstrap failed",
      });
    }
  });

  const action = (
    path: string,
    handler: (passkey: string) => Promise<Record<string, unknown>>,
  ) => {
    app.post(path, async (request, reply) => {
      const parsed = passkeySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
      try {
        return await handler(parsed.data.passkey);
      } catch (error) {
        request.log.warn({ error }, "demo action failed");
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "Demo action failed",
        });
      }
    });
  };

  action("/demo/attempt-over-budget", (passkey) =>
    demoService.attemptOverBudget(passkey),
  );
  action("/demo/review-counter", (passkey) =>
    demoService.reviewCounter(passkey),
  );
  action("/demo/approve", (passkey) =>
    demoService.approveAndSignBuyer(passkey),
  );

  app.post("/demo/approve/metamask", async (request, reply) => {
    const parsed = metamaskSignatureSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    try {
      return await demoService.recordMetamaskBuyerSignature(
        parsed.data.signature,
      );
    } catch (error) {
      request.log.warn({ error }, "MetaMask signature validation failed");
      return reply.code(400).send({
        error:
          error instanceof Error
            ? error.message
            : "Signature validation failed",
      });
    }
  });
  action("/demo/sign/seller", (passkey) =>
    demoService.signParty("SELLER", passkey),
  );
  action("/demo/sign/player", (passkey) =>
    demoService.signParty("PLAYER", passkey),
  );
  action("/demo/fund", (passkey) => demoService.fund(passkey));
  app.post("/demo/fund/metamask", async (request, reply) => {
    const parsed = metamaskFundingSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(parsed.error.flatten());
    try {
      return await demoService.recordMetamaskFunding(
        parsed.data.approvalTxHash,
        parsed.data.fundingTxHash,
      );
    } catch (error) {
      request.log.warn({ error }, "MetaMask funding validation failed");
      return reply.code(400).send({
        error:
          error instanceof Error ? error.message : "Funding validation failed",
      });
    }
  });
  action("/demo/release", (passkey) => demoService.releaseMilestone(passkey));
};

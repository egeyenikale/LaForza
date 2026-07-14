import { createDealSchema, dealSchema, type Deal } from "@laforza/domain";
import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";

const deals = new Map<string, Deal>();

export const registerDealRoutes: FastifyPluginAsync = async (app) => {
  app.get("/deals", async () => ({ data: [...deals.values()] }));

  app.get<{ Params: { id: string } }>("/deals/:id", async (request, reply) => {
    const deal = deals.get(request.params.id);
    if (!deal) return reply.code(404).send({ error: "Deal not found" });
    return { data: deal };
  });

  app.post("/deals", async (request, reply) => {
    const input = createDealSchema.parse(request.body);
    const now = new Date().toISOString();
    const deal = dealSchema.parse({
      ...input,
      id: randomUUID(),
      status: "DRAFT",
      acceptedOffer: null,
      createdAt: now,
      updatedAt: now,
    });

    deals.set(deal.id, deal);
    return reply.code(201).send({ data: deal });
  });
};

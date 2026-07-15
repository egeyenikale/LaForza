import { createDealSchema, dealSchema, type Deal } from "@laforza/domain";
import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";

import type { StorageBackend } from "../storage/storage-backend.js";

const readDeals = async (storage: StorageBackend): Promise<Deal[]> => {
  const content = await storage.read("deals");
  return content ? (JSON.parse(content) as Deal[]) : [];
};

export const registerDealRoutes: FastifyPluginAsync<{
  storage: StorageBackend;
}> = async (app, { storage }) => {
  app.get("/deals", async () => ({ data: await readDeals(storage) }));

  app.get<{ Params: { id: string } }>("/deals/:id", async (request, reply) => {
    const deal = (await readDeals(storage)).find(
      (candidate) => candidate.id === request.params.id,
    );
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

    await storage.withLock("deals", async () => {
      const deals = await readDeals(storage);
      deals.push(deal);
      await storage.write("deals", JSON.stringify(deals));
    });
    return reply.code(201).send({ data: deal });
  });
};

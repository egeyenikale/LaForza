import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import { DemoService } from "./demo/demo-service.js";
import { registerDealRoutes } from "./routes/deals.js";
import { registerDemoRoutes } from "./routes/demo.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { createStorage } from "./storage/create-storage.js";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  const storage = createStorage(config);
  const demoService = new DemoService(config, storage);

  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
  });

  app.get("/health", async () => ({
    service: "laforza-backend",
    status: "ok",
    storage: demoService.storageMode(),
    network: config.CHAIN_ID,
    timestamp: new Date().toISOString(),
  }));

  await app.register(registerDealRoutes, { prefix: "/api/v1", storage });
  await app.register(registerPolicyRoutes, { prefix: "/api/v1" });
  await app.register(registerDemoRoutes, {
    prefix: "/api/v1",
    demoService,
  });

  return app;
}

import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import { DemoService } from "./demo/demo-service.js";
import { registerDealRoutes } from "./routes/deals.js";
import { registerDemoRoutes } from "./routes/demo.js";
import { registerPolicyRoutes } from "./routes/policies.js";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
  });

  app.get("/health", async () => ({
    service: "laforza-backend",
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  await app.register(registerDealRoutes, { prefix: "/api/v1" });
  await app.register(registerPolicyRoutes, { prefix: "/api/v1" });
  await app.register(registerDemoRoutes, {
    prefix: "/api/v1",
    demoService: new DemoService(config),
  });

  return app;
}

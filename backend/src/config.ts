import { z } from "zod";

const configSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(source);
}

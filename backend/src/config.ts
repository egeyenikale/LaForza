import { resolve } from "node:path";
import { z } from "zod";

const configSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  CHAIN_RPC_URL: z.string().url().default("http://127.0.0.1:8545"),
  CHAIN_ID: z.coerce.number().int().positive().default(31337),
  DATA_DIR: z.string().default(resolve(process.cwd(), "../.data")),
  CONTRACT_ARTIFACTS_DIR: z
    .string()
    .default(resolve(process.cwd(), "../contracts/artifacts")),
  WDK_VAULT_PASSPHRASE: z.string().min(12).default("laforza-local-demo"),
  LOCAL_DEPLOYER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .default(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    ),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(source);
}

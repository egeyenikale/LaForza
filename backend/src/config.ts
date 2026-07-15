import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  STORAGE_PREFIX: z
    .string()
    .regex(/^[a-zA-Z0-9:_-]+$/)
    .default("laforza:production"),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(20).optional(),
  KV_REST_API_URL: z.string().url().optional(),
  KV_REST_API_TOKEN: z.string().min(20).optional(),
  CONTRACT_ARTIFACTS_DIR: z.string().optional(),
  WDK_VAULT_PASSPHRASE: z.string().min(12).default("laforza-local-demo"),
  LOCAL_DEPLOYER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .default(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    ),
});

type ParsedAppConfig = z.infer<typeof configSchema>;

export type AppConfig = Omit<ParsedAppConfig, "CONTRACT_ARTIFACTS_DIR"> & {
  CONTRACT_ARTIFACTS_DIR: string;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(source);
  const config: AppConfig = {
    ...parsed,
    CONTRACT_ARTIFACTS_DIR:
      parsed.CONTRACT_ARTIFACTS_DIR ??
      resolve(
        backendRoot,
        source.VERCEL ? "contract-artifacts" : "../contracts/artifacts",
      ),
    ...(source.VERCEL
      ? { CHAIN_RPC_URL: "https://sepolia.base.org" }
      : undefined),
    UPSTASH_REDIS_REST_URL:
      parsed.UPSTASH_REDIS_REST_URL ?? parsed.KV_REST_API_URL,
    UPSTASH_REDIS_REST_TOKEN:
      parsed.UPSTASH_REDIS_REST_TOKEN ?? parsed.KV_REST_API_TOKEN,
  };
  const hasRedisUrl = Boolean(config.UPSTASH_REDIS_REST_URL);
  const hasRedisToken = Boolean(config.UPSTASH_REDIS_REST_TOKEN);
  if (hasRedisUrl !== hasRedisToken) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together",
    );
  }
  if (source.VERCEL && !hasRedisUrl) {
    throw new Error(
      "Vercel backend requires Upstash Redis so wallet vaults, offers, events, and active deals survive cold starts",
    );
  }
  if (source.VERCEL && !source.WDK_VAULT_PASSPHRASE) {
    throw new Error(
      "Vercel backend requires a unique WDK_VAULT_PASSPHRASE secret; the local demo default is not allowed",
    );
  }
  if (source.VERCEL && config.CHAIN_ID !== 84532) {
    throw new Error(
      "The hosted La Forza demo is intentionally restricted to Base Sepolia (CHAIN_ID=84532)",
    );
  }
  return config;
}

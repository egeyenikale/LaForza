import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const hostedBaseConfig = {
  VERCEL: "1",
  CHAIN_ID: "84532",
  CHAIN_RPC_URL: "https://sepolia.base.org",
  WDK_VAULT_PASSPHRASE: "a-unique-production-vault-secret",
};

describe("hosted configuration", () => {
  it("refuses stateless Vercel deployments", () => {
    expect(() => loadConfig(hostedBaseConfig)).toThrow(
      "Vercel backend requires Upstash Redis",
    );
  });

  it("accepts a Redis-backed Base Sepolia deployment", () => {
    const config = loadConfig({
      ...hostedBaseConfig,
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "a-token-with-at-least-twenty-characters",
      STORAGE_PREFIX: "laforza:test",
    });

    expect(config).toMatchObject({
      CHAIN_ID: 84532,
      STORAGE_PREFIX: "laforza:test",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    });
  });
});

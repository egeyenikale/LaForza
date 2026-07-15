import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

const config = {
  HOST: "127.0.0.1",
  PORT: 4000,
  LOG_LEVEL: "silent" as const,
  CORS_ORIGIN: "http://localhost:3000",
  CHAIN_RPC_URL: "http://127.0.0.1:8545",
  CHAIN_ID: 31337,
  DATA_DIR: "/tmp/laforza-test",
  CONTRACT_ARTIFACTS_DIR: "/tmp/laforza-artifacts",
  LOCAL_DEPLOYER_PRIVATE_KEY:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
};

describe("backend", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("reports health without external dependencies", async () => {
    const app = await buildApp(config);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "laforza-backend",
    });
  });

  it("exposes the selectable football player catalog", async () => {
    const app = await buildApp(config);
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/demo/players",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().players).toHaveLength(4);
    expect(response.json().players[0]).toMatchObject({
      id: "mert-kaya",
      position: "Centre Forward",
      currentClub: "Bosphorus United",
    });
  });

  it("advertises the configured public Base Sepolia network before a deal exists", async () => {
    const app = await buildApp({
      ...config,
      CHAIN_RPC_URL: "https://sepolia.base.org",
      CHAIN_ID: 84532,
      DATA_DIR: "/tmp/laforza-base-test",
    });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/demo/state",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      initialized: false,
      network: {
        name: "Base Sepolia",
        chainId: 84532,
        publicTestnet: true,
        explorerUrl: "https://sepolia-explorer.base.org",
      },
    });
  });
});

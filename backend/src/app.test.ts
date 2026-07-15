import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Wallet } from "ethers";
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
  STORAGE_PREFIX: "laforza:test",
  CONTRACT_ARTIFACTS_DIR: "/tmp/laforza-artifacts",
  WDK_VAULT_PASSPHRASE: "laforza-test-vault",
  LOCAL_DEPLOYER_PRIVATE_KEY:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
};

describe("backend", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  const dataDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await Promise.all(
      dataDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
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
    expect(response.json().players).toHaveLength(6);
    expect(response.json().players[0]).toMatchObject({
      id: "mert-kaya",
      position: "Centre Forward",
      currentClub: "Bosphorus United",
    });
  });

  it("persists wallet-signed counterparties and player offers", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "laforza-marketplace-"));
    dataDirectories.push(dataDirectory);
    const app = await buildApp({ ...config, DATA_DIR: dataDirectory });
    apps.push(app);
    const wallet = Wallet.createRandom();
    const registration = {
      requestId: crypto.randomUUID(),
      name: "Northstar Test Club",
      role: "TESTER" as const,
      walletAddress: wallet.address,
      createdAt: new Date().toISOString(),
    };
    const registrationSignature = await wallet.signMessage(
      JSON.stringify({
        domain: "laforza.marketplace",
        action: "REGISTER_COUNTERPARTY",
        ...registration,
      }),
    );
    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/demo/marketplace/counterparties",
      payload: { ...registration, signature: registrationSignature },
    });
    expect(registered.statusCode).toBe(200);
    const counterparty = registered.json().marketplace.counterparties[0];
    expect(counterparty).toMatchObject({
      name: "Northstar Test Club",
      role: "TESTER",
      walletAddress: wallet.address,
    });

    const offer = {
      requestId: crypto.randomUUID(),
      counterpartyId: counterparty.id as string,
      playerId: "amina-yilmaz",
      walletAddress: wallet.address,
      amountMicroUsdt: "1250000000",
      signingBonusMicroUsdt: "250000000",
      note: "Subject to medical and international registration approval.",
      createdAt: new Date().toISOString(),
    };
    const offerSignature = await wallet.signMessage(
      JSON.stringify({
        domain: "laforza.marketplace",
        action: "SUBMIT_OFFER",
        ...offer,
      }),
    );
    const submitted = await app.inject({
      method: "POST",
      url: "/api/v1/demo/marketplace/offers",
      payload: { ...offer, signature: offerSignature },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().marketplace.offers[0]).toMatchObject({
      playerId: "amina-yilmaz",
      from: "Northstar Test Club",
      fromWallet: wallet.address,
      amountMicroUsdt: "1250000000",
      status: "RECEIVED",
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

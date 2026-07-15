import WDK from "@tetherto/wdk";
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
} from "node:crypto";
import { promisify } from "node:util";

import type { StorageBackend } from "../storage/storage-backend.js";

const scrypt = promisify(scryptCallback);

export const walletRoles = ["BUYER", "SELLER", "PLAYER", "VERIFIER"] as const;
export type WalletRole = (typeof walletRoles)[number];

type EncryptedWallet = {
  role: WalletRole;
  address: string;
  saltBase64: string;
  ivBase64: string;
  authTagBase64: string;
  encryptedSeedBase64: string;
};

type VaultFile = {
  version: 1;
  createdAt: string;
  encryption: "scrypt-aes-256-gcm";
  wallets: EncryptedWallet[];
};

export type PublicWallet = Pick<EncryptedWallet, "role" | "address">;

function assertPasskey(passkey: string): void {
  if (passkey.length < 12) {
    throw new Error("Passkey must contain at least 12 characters");
  }
}

async function deriveKey(passkey: string, salt: Buffer): Promise<Buffer> {
  return (await scrypt(passkey, salt, 32)) as Buffer;
}

async function addressFromSeed(seedPhrase: string): Promise<string> {
  const wdk = new WDK(seedPhrase).registerWallet("evm", WalletManagerEvm, {});
  try {
    const account = await wdk.getAccount("evm", 0);
    return await account.getAddress();
  } finally {
    wdk.dispose();
  }
}

export class LocalWalletVault {
  constructor(
    private readonly storage: StorageBackend,
    private readonly key = "wallet-vault",
  ) {}

  async exists(): Promise<boolean> {
    return (await this.storage.read(this.key)) !== null;
  }

  async create(passkey: string): Promise<PublicWallet[]> {
    assertPasskey(passkey);
    return this.storage.withLock(this.key, async () => {
      if (await this.exists()) return this.list(passkey);

      const wallets: EncryptedWallet[] = [];
      for (const role of walletRoles) {
        const seedPhrase = WDK.getRandomSeedPhrase(24);
        const plaintext = Buffer.from(seedPhrase, "utf8");
        const salt = randomBytes(16);
        const iv = randomBytes(12);
        const key = await deriveKey(passkey, salt);

        try {
          const cipher = createCipheriv("aes-256-gcm", key, iv);
          const encryptedSeed = Buffer.concat([
            cipher.update(plaintext),
            cipher.final(),
          ]);
          wallets.push({
            role,
            address: await addressFromSeed(seedPhrase),
            saltBase64: salt.toString("base64"),
            ivBase64: iv.toString("base64"),
            authTagBase64: cipher.getAuthTag().toString("base64"),
            encryptedSeedBase64: encryptedSeed.toString("base64"),
          });
          encryptedSeed.fill(0);
        } finally {
          plaintext.fill(0);
          key.fill(0);
        }
      }

      const vault: VaultFile = {
        version: 1,
        createdAt: new Date().toISOString(),
        encryption: "scrypt-aes-256-gcm",
        wallets,
      };
      await this.storage.write(this.key, JSON.stringify(vault));

      return wallets.map(({ role, address }) => ({ role, address }));
    });
  }

  async list(passkey: string): Promise<PublicWallet[]> {
    const vault = await this.readAndUnlock(passkey);
    return vault.wallets.map(({ role, address }) => ({ role, address }));
  }

  async withSeed<T>(
    role: WalletRole,
    passkey: string,
    operation: (seedPhrase: string, address: string) => Promise<T>,
  ): Promise<T> {
    assertPasskey(passkey);
    const vault = await this.readVault();
    const wallet = vault.wallets.find((candidate) => candidate.role === role);
    if (!wallet) throw new Error(`Wallet role not found: ${role}`);

    const salt = Buffer.from(wallet.saltBase64, "base64");
    const iv = Buffer.from(wallet.ivBase64, "base64");
    const authTag = Buffer.from(wallet.authTagBase64, "base64");
    const encryptedSeed = Buffer.from(wallet.encryptedSeedBase64, "base64");
    const key = await deriveKey(passkey, salt);
    let plaintext: Buffer | undefined;

    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([
        decipher.update(encryptedSeed),
        decipher.final(),
      ]);
      return await operation(plaintext.toString("utf8"), wallet.address);
    } catch (error) {
      if (
        error instanceof Error &&
        /authenticate|bad decrypt/i.test(error.message)
      ) {
        throw new Error("Decryption failed: invalid passkey or vault data");
      }
      throw error;
    } finally {
      plaintext?.fill(0);
      key.fill(0);
      encryptedSeed.fill(0);
      authTag.fill(0);
    }
  }

  private async readAndUnlock(passkey: string): Promise<VaultFile> {
    assertPasskey(passkey);
    const vault = await this.readVault();
    const first = vault.wallets[0];
    if (!first) throw new Error("Wallet vault is empty");

    await this.withSeed(first.role, passkey, async () => undefined);
    return vault;
  }

  private async readVault(): Promise<VaultFile> {
    const content = await this.storage.read(this.key);
    if (!content) throw new Error("Wallet vault does not exist");
    const parsed = JSON.parse(content) as VaultFile;
    if (
      parsed.version !== 1 ||
      parsed.encryption !== "scrypt-aes-256-gcm" ||
      !Array.isArray(parsed.wallets)
    ) {
      throw new Error("Unsupported wallet vault format");
    }
    return parsed;
  }
}

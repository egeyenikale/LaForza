import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LocalWalletVault } from "./local-wallet-vault.js";

describe("LocalWalletVault", () => {
  it("persists only encrypted WDK seeds and unlocks them with the passkey", async () => {
    const directory = await mkdtemp(join(tmpdir(), "laforza-vault-"));
    const path = join(directory, "wallets.json");
    const vault = new LocalWalletVault(path);
    const passkey = "tournament-demo-passkey";

    const created = await vault.create(passkey);
    const persisted = await readFile(path, "utf8");
    const listed = await vault.list(passkey);

    expect(created).toHaveLength(4);
    expect(new Set(created.map(({ address }) => address)).size).toBe(4);
    expect(listed).toEqual(created);
    expect(persisted).toContain("encryptedSeedBase64");
    expect(persisted).not.toContain(passkey);

    await expect(vault.list("wrong-passkey-value")).rejects.toThrow(
      "Decryption failed",
    );
  });
});

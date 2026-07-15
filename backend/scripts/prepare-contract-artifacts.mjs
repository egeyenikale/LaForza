import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const artifacts = [
  "contracts/test/MockUSDT.sol/MockUSDT.json",
  "contracts/DeadlineEscrow.sol/DeadlineEscrow.json",
];

for (const artifact of artifacts) {
  const source = resolve("../contracts/artifacts", artifact);
  const destination = resolve("contract-artifacts", artifact);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log(`Prepared ${artifacts.length} contract artifacts for Vercel.`);

import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

const host = "linux-x64";
const nodeModulesRoot = resolve("../node_modules");
const destinationRoot = resolve("prebuilds", host);
const copiedDestinations = new Map();

await rm(resolve("prebuilds"), { recursive: true, force: true });
await mkdir(destinationRoot, { recursive: true });

async function existingDirectoryEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function packageDirectories(nodeModulesDirectory) {
  const directories = [];
  for (const entry of await existingDirectoryEntries(nodeModulesDirectory)) {
    if (!entry.isDirectory() || entry.name === ".bin") continue;
    const entryPath = join(nodeModulesDirectory, entry.name);
    if (!entry.name.startsWith("@")) {
      directories.push(entryPath);
      continue;
    }
    for (const scopedEntry of await existingDirectoryEntries(entryPath)) {
      if (scopedEntry.isDirectory()) {
        directories.push(join(entryPath, scopedEntry.name));
      }
    }
  }
  return directories;
}

async function copyUnique(source, destination) {
  const previousSource = copiedDestinations.get(destination);
  if (previousSource) {
    const [previousContents, contents] = await Promise.all([
      readFile(previousSource),
      readFile(source),
    ]);
    if (!previousContents.equals(contents)) {
      throw new Error(
        `Conflicting native prebuilds for ${basename(destination)}: ${previousSource} and ${source}`,
      );
    }
    return false;
  }

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  copiedDestinations.set(destination, source);
  return true;
}

async function copyPackagePrebuilds(packageDirectory) {
  const packageJsonPath = join(packageDirectory, "package.json");
  const packageJsonEntries = await existingDirectoryEntries(packageDirectory);
  if (!packageJsonEntries.some((entry) => entry.name === "package.json")) {
    return 0;
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const sourceDirectory = join(packageDirectory, "prebuilds", host);
  let copied = 0;

  for (const entry of await existingDirectoryEntries(sourceDirectory)) {
    if (!entry.isFile()) continue;
    const extension = extname(entry.name);
    if (extension !== ".node" && extension !== ".bare") continue;

    const source = join(sourceDirectory, entry.name);
    if (await copyUnique(source, join(destinationRoot, entry.name)))
      copied += 1;

    if (typeof packageJson.version === "string" && packageJson.version) {
      const stem = entry.name.slice(0, -extension.length);
      const versionedName = `${stem}@${packageJson.version}${extension}`;
      if (await copyUnique(source, join(destinationRoot, versionedName))) {
        copied += 1;
      }
    }
  }

  return copied;
}

async function collectPrebuilds(nodeModulesDirectory) {
  let copied = 0;
  for (const packageDirectory of await packageDirectories(
    nodeModulesDirectory,
  )) {
    copied += await copyPackagePrebuilds(packageDirectory);
    copied += await collectPrebuilds(join(packageDirectory, "node_modules"));
  }
  return copied;
}

const copied = await collectPrebuilds(nodeModulesRoot);
if (copied === 0) {
  throw new Error(
    `No ${host} native prebuilds were found in ${nodeModulesRoot}`,
  );
}

console.log(`Prepared ${copied} ${host} native prebuild files for Vercel.`);

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Redis } from "@upstash/redis";

export interface StorageBackend {
  readonly kind: "file" | "redis";
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  withLock<T>(key: string, operation: () => Promise<T>): Promise<T>;
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class FileStorageBackend implements StorageBackend {
  readonly kind = "file" as const;
  readonly #mutations = new Map<string, Promise<unknown>>();

  constructor(private readonly directory: string) {}

  async read(key: string): Promise<string | null> {
    try {
      return await readFile(this.#path(key), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write(key: string, value: string): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const destination = this.#path(key);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
  }

  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#mutations.get(key) ?? Promise.resolve();
    let result!: T;
    const current = previous.then(async () => {
      result = await operation();
    });
    this.#mutations.set(
      key,
      current.catch(() => undefined),
    );
    await current;
    return result;
  }

  #path(key: string): string {
    if (!/^[a-z0-9-]+$/i.test(key)) throw new Error("Invalid storage key");
    return join(this.directory, `${key}.json`);
  }
}

export class RedisStorageBackend implements StorageBackend {
  readonly kind = "redis" as const;
  readonly #redis: Redis;

  constructor(
    url: string,
    token: string,
    private readonly prefix: string,
  ) {
    this.#redis = new Redis({ url, token, automaticDeserialization: false });
  }

  async read(key: string): Promise<string | null> {
    return (await this.#redis.get<string>(this.#key(key))) ?? null;
  }

  async write(key: string, value: string): Promise<void> {
    await this.#redis.set(this.#key(key), value);
  }

  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const lockKey = this.#key(`lock:${key}`);
    const owner = randomUUID();
    let acquired = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      acquired =
        (await this.#redis.set(lockKey, owner, { nx: true, px: 30_000 })) ===
        "OK";
      if (acquired) break;
      await sleep(50 + attempt * 5);
    }
    if (!acquired) throw new Error(`Storage is busy: ${key}`);

    try {
      return await operation();
    } finally {
      await this.#redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        [lockKey],
        [owner],
      );
    }
  }

  #key(key: string): string {
    return `${this.prefix}:${key}`;
  }
}

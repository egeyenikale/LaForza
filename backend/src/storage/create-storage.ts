import type { AppConfig } from "../config.js";
import {
  FileStorageBackend,
  RedisStorageBackend,
  type StorageBackend,
} from "./storage-backend.js";

export function createStorage(config: AppConfig): StorageBackend {
  if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
    return new RedisStorageBackend(
      config.UPSTASH_REDIS_REST_URL,
      config.UPSTASH_REDIS_REST_TOKEN,
      config.STORAGE_PREFIX,
    );
  }
  return new FileStorageBackend(config.DATA_DIR);
}

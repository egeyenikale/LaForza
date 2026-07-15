import { randomUUID } from "node:crypto";

import type { StorageBackend } from "../storage/storage-backend.js";

export type DemoEvent = {
  id: string;
  type: string;
  at: string;
  detail: Record<string, unknown>;
};

export class EventStore {
  constructor(
    private readonly storage: StorageBackend,
    private readonly key = "events",
  ) {}

  async append(
    type: string,
    detail: Record<string, unknown> = {},
  ): Promise<DemoEvent> {
    const event: DemoEvent = {
      id: randomUUID(),
      type,
      at: new Date().toISOString(),
      detail,
    };
    await this.storage.withLock(this.key, async () => {
      const events = await this.list();
      events.push(event);
      await this.storage.write(this.key, JSON.stringify(events));
    });
    return event;
  }

  async list(): Promise<DemoEvent[]> {
    const content = await this.storage.read(this.key);
    return content ? (JSON.parse(content) as DemoEvent[]) : [];
  }

  async clear(): Promise<void> {
    await this.storage.write(this.key, "[]");
  }
}

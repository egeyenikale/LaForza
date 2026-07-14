import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export type DemoEvent = {
  id: string;
  type: string;
  at: string;
  detail: Record<string, unknown>;
};

export class EventStore {
  constructor(private readonly filePath: string) {}

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
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return event;
  }

  async list(): Promise<DemoEvent[]> {
    try {
      const content = await readFile(this.filePath, "utf8");
      return content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as DemoEvent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async clear(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, "", { encoding: "utf8", mode: 0o600 });
  }
}

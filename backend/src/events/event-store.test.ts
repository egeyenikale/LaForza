import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EventStore } from "./event-store.js";

describe("EventStore", () => {
  it("rebuilds the ordered demo timeline from JSONL events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "laforza-events-"));
    const store = new EventStore(join(directory, "events.jsonl"));

    await store.append("POLICY_DENIED", { amount: "1100" });
    await store.append("HUMAN_APPROVED", { amount: "900" });

    const events = await store.list();
    expect(events.map(({ type }) => type)).toEqual([
      "POLICY_DENIED",
      "HUMAN_APPROVED",
    ]);
  });
});

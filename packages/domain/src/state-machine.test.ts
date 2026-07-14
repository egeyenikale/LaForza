import { describe, expect, it } from "vitest";

import { assertTransition, canTransition } from "./state-machine.js";

describe("deal state machine", () => {
  it("allows the happy-path lifecycle", () => {
    expect(canTransition("DRAFT", "NEGOTIATING")).toBe(true);
    expect(canTransition("NEGOTIATING", "AWAITING_SIGNATURES")).toBe(true);
    expect(canTransition("READY_TO_FUND", "FUNDED")).toBe(true);
    expect(canTransition("ACTIVE", "COMPLETED")).toBe(true);
  });

  it("does not allow a funded deal to disappear into a local cancellation", () => {
    expect(() => assertTransition("FUNDED", "CANCELLED")).toThrow(
      "Invalid deal transition: FUNDED -> CANCELLED",
    );
  });
});

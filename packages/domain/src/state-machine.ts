import type { DealStatus } from "./schemas.js";

const transitions = {
  DRAFT: ["NEGOTIATING", "CANCELLED"],
  NEGOTIATING: ["AWAITING_SIGNATURES", "CANCELLED"],
  AWAITING_SIGNATURES: ["NEGOTIATING", "READY_TO_FUND", "CANCELLED"],
  READY_TO_FUND: ["FUNDED", "CANCELLED"],
  FUNDED: ["ACTIVE"],
  ACTIVE: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
} satisfies Record<DealStatus, readonly DealStatus[]>;

export function canTransition(from: DealStatus, to: DealStatus): boolean {
  return (transitions[from] as readonly DealStatus[]).includes(to);
}

export function assertTransition(from: DealStatus, to: DealStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid deal transition: ${from} -> ${to}`);
  }
}

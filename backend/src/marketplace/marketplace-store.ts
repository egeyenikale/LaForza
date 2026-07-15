import { randomUUID } from "node:crypto";

import type { StorageBackend } from "../storage/storage-backend.js";

export type CounterpartyRole = "CLUB" | "AGENT" | "SCOUT" | "TESTER";

export type MarketplaceCounterparty = {
  id: string;
  requestId: string;
  name: string;
  role: CounterpartyRole;
  walletAddress: string;
  signature: string;
  createdAt: string;
};

export type MarketplaceOffer = {
  id: string;
  requestId: string;
  playerId: string;
  counterpartyId: string;
  from: string;
  fromWallet: string;
  to: string;
  amountMicroUsdt: string;
  signingBonusMicroUsdt: string;
  note: string;
  status: "RECEIVED";
  signature: string;
  createdAt: string;
};

type MarketplaceData = {
  counterparties: MarketplaceCounterparty[];
  offers: MarketplaceOffer[];
};

const emptyMarketplace = (): MarketplaceData => ({
  counterparties: [],
  offers: [],
});

export class MarketplaceStore {
  constructor(
    private readonly storage: StorageBackend,
    private readonly key = "marketplace",
  ) {}

  async read(): Promise<MarketplaceData> {
    const content = await this.storage.read(this.key);
    return content
      ? (JSON.parse(content) as MarketplaceData)
      : emptyMarketplace();
  }

  async register(
    input: Omit<MarketplaceCounterparty, "id">,
  ): Promise<MarketplaceCounterparty> {
    return this.#mutate(async (data) => {
      if (
        data.counterparties.some(
          (counterparty) => counterparty.requestId === input.requestId,
        ) ||
        data.offers.some((offer) => offer.requestId === input.requestId)
      ) {
        throw new Error("This signed request has already been used");
      }
      const existing = data.counterparties.find(
        (counterparty) =>
          counterparty.walletAddress.toLowerCase() ===
          input.walletAddress.toLowerCase(),
      );
      const counterparty: MarketplaceCounterparty = {
        ...input,
        id: existing?.id ?? randomUUID(),
      };
      data.counterparties = data.counterparties.filter(
        (candidate) => candidate.id !== counterparty.id,
      );
      data.counterparties.push(counterparty);
      return counterparty;
    });
  }

  async addOffer(
    input: Omit<MarketplaceOffer, "id">,
  ): Promise<MarketplaceOffer> {
    return this.#mutate(async (data) => {
      if (
        data.counterparties.some(
          (counterparty) => counterparty.requestId === input.requestId,
        ) ||
        data.offers.some((offer) => offer.requestId === input.requestId)
      ) {
        throw new Error("This signed request has already been used");
      }
      const offer: MarketplaceOffer = { ...input, id: randomUUID() };
      data.offers.push(offer);
      return offer;
    });
  }

  async #mutate<T>(
    mutation: (data: MarketplaceData) => Promise<T> | T,
  ): Promise<T> {
    return this.storage.withLock(this.key, async () => {
      const data = await this.read();
      const result = await mutation(data);
      await this.storage.write(this.key, JSON.stringify(data));
      return result;
    });
  }
}

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
  #mutation = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(): Promise<MarketplaceData> {
    try {
      return JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as MarketplaceData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyMarketplace();
      }
      throw error;
    }
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
    let result!: T;
    const operation = this.#mutation.then(async () => {
      const data = await this.read();
      result = await mutation(data);
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(data, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, this.filePath);
    });
    this.#mutation = operation.catch(() => undefined);
    await operation;
    return result;
  }
}

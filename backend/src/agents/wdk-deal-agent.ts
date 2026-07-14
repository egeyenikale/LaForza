import type { AgentPolicy, Offer } from "@laforza/domain";
import WDK, { type Policy, type SimulationResult } from "@tetherto/wdk";
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";

import { buildOfferTypedData, hashOfferTypedData } from "./deal-typed-data.js";

type OfferTypedData = ReturnType<typeof buildOfferTypedData>;

type PolicyAccount = {
  getAddress(): Promise<string>;
  signTypedData(typedData: OfferTypedData): Promise<string>;
  simulate: {
    signTypedData(typedData: OfferTypedData): Promise<SimulationResult>;
  };
};

type PolicyInput = {
  domain?: {
    chainId?: number | string | bigint;
    verifyingContract?: string;
  };
  message?: {
    counterparty?: string;
    totalMicroUsdt?: number | string | bigint;
    expiresAt?: number | string | bigint;
  };
};

export type DealPolicyResult = SimulationResult & {
  agentAddress: string;
  offerDigest: string;
  signature?: string;
};

function asBigInt(value: unknown): bigint | null {
  if (
    typeof value !== "bigint" &&
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function typedDataFrom(params: unknown): PolicyInput {
  return (params ?? {}) as PolicyInput;
}

export function buildWdkDealPolicy(
  policy: AgentPolicy,
  chainId: number,
  verifyingContract: string,
  now: Date,
): Policy {
  const contract = normalizeAddress(verifyingContract);
  const counterparties = new Set(
    policy.allowedCounterparties.map(normalizeAddress),
  );
  const maximum = BigInt(policy.maxDealMicroUsdt);
  const approvalThreshold = BigInt(policy.humanApprovalThresholdMicroUsdt);
  const policyExpiry = BigInt(
    Math.floor(new Date(policy.expiresAt).getTime() / 1000),
  );
  const currentTime = BigInt(Math.floor(now.getTime() / 1000));

  return {
    id: "deadline-agent-deal-policy",
    name: "DEADLINE football deal mandate",
    scope: "project",
    wallet: "sepolia",
    rules: [
      {
        name: "allow-mandated-offer",
        operation: "signTypedData",
        action: "ALLOW",
        reason: "Offer is inside the club mandate",
        conditions: [
          ({ params }) => {
            const typedData = typedDataFrom(params);
            const amount = asBigInt(typedData.message?.totalMicroUsdt);
            const offerExpiry = asBigInt(typedData.message?.expiresAt);
            const counterparty = typedData.message?.counterparty;

            return (
              String(typedData.domain?.chainId) === String(chainId) &&
              normalizeAddress(typedData.domain?.verifyingContract ?? "") ===
                contract &&
              amount !== null &&
              amount <= approvalThreshold &&
              offerExpiry !== null &&
              offerExpiry <= policyExpiry &&
              currentTime <= policyExpiry &&
              typeof counterparty === "string" &&
              counterparties.has(normalizeAddress(counterparty))
            );
          },
        ],
      },
      {
        name: "deny-over-budget",
        operation: "signTypedData",
        action: "DENY",
        reason: "Offer exceeds the club's maximum deal mandate",
        conditions: [
          ({ params }) => {
            const amount = asBigInt(
              typedDataFrom(params).message?.totalMicroUsdt,
            );
            return amount !== null && amount > maximum;
          },
        ],
      },
      {
        name: "require-human-approval",
        operation: "signTypedData",
        action: "DENY",
        reason: "Offer requires human sporting-director approval",
        conditions: [
          ({ params }) => {
            const amount = asBigInt(
              typedDataFrom(params).message?.totalMicroUsdt,
            );
            return (
              amount !== null && amount > approvalThreshold && amount <= maximum
            );
          },
        ],
      },
      {
        name: "deny-unapproved-counterparty",
        operation: "signTypedData",
        action: "DENY",
        reason: "Counterparty is outside the club's allowlist",
        conditions: [
          ({ params }) => {
            const counterparty = typedDataFrom(params).message?.counterparty;
            return (
              typeof counterparty !== "string" ||
              !counterparties.has(normalizeAddress(counterparty))
            );
          },
        ],
      },
      {
        name: "deny-wrong-deal-domain",
        operation: "signTypedData",
        action: "DENY",
        reason: "Offer targets an unapproved chain or escrow contract",
        conditions: [
          ({ params }) => {
            const domain = typedDataFrom(params).domain;
            return (
              String(domain?.chainId) !== String(chainId) ||
              normalizeAddress(domain?.verifyingContract ?? "") !== contract
            );
          },
        ],
      },
      {
        name: "deny-expired-mandate",
        operation: "signTypedData",
        action: "DENY",
        reason: "The club mandate or offer has expired",
        conditions: [
          ({ params }) => {
            const offerExpiry = asBigInt(
              typedDataFrom(params).message?.expiresAt,
            );
            return (
              currentTime > policyExpiry ||
              offerExpiry === null ||
              offerExpiry > policyExpiry
            );
          },
        ],
      },
    ],
  };
}

export class WdkDealAgent {
  readonly #seed: string;

  constructor(seed = WDK.getRandomSeedPhrase(12)) {
    this.#seed = seed;
  }

  async evaluateOffer(input: {
    policy: AgentPolicy;
    offer: Offer;
    chainId: number;
    verifyingContract: string;
    now?: Date;
    sign?: boolean;
  }): Promise<DealPolicyResult> {
    const typedData = buildOfferTypedData(
      input.offer,
      input.chainId,
      input.verifyingContract,
    );
    const wdk = new WDK(this.#seed)
      .registerWallet("sepolia", WalletManagerEvm, {})
      .registerPolicy(
        buildWdkDealPolicy(
          input.policy,
          input.chainId,
          input.verifyingContract,
          input.now ?? new Date(),
        ),
      );

    try {
      const account = (await wdk.getAccount(
        "sepolia",
        0,
      )) as unknown as PolicyAccount;
      const verdict = await account.simulate.signTypedData(typedData);
      const signature =
        verdict.decision === "ALLOW" && input.sign
          ? await account.signTypedData(typedData)
          : undefined;

      return {
        ...verdict,
        agentAddress: await account.getAddress(),
        offerDigest: hashOfferTypedData(typedData),
        ...(signature ? { signature } : {}),
      };
    } finally {
      wdk.dispose();
    }
  }
}

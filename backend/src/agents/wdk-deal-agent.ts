import type { AgentPolicy } from "@laforza/domain";
import {
  buildDealAuthorizationTypedData,
  hashDealAuthorization,
  type DealAuthorizationEnvelope,
} from "@laforza/protocol";
import WDK, { type Policy, type SimulationResult } from "@tetherto/wdk";
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";
import { TypedDataEncoder } from "ethers";

type AuthorizationTypedData = ReturnType<
  typeof buildDealAuthorizationTypedData
>;

type PolicyAccount = {
  getAddress(): Promise<string>;
  signTypedData(typedData: AuthorizationTypedData): Promise<string>;
  simulate: {
    signTypedData(typedData: AuthorizationTypedData): Promise<SimulationResult>;
  };
};

type PolicyInput = AuthorizationTypedData;

export type DealPolicyResult = SimulationResult & {
  agentAddress: string;
  authorizationDigest: string;
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

function digestFromPolicyParams(params: unknown): string | null {
  const typedData = typedDataFrom(params);
  try {
    return TypedDataEncoder.hash(
      typedData.domain,
      typedData.types,
      typedData.message,
    );
  } catch {
    return null;
  }
}

export function buildWdkDealPolicy(input: {
  policy: AgentPolicy;
  envelope: DealAuthorizationEnvelope;
  counterparty: string;
  now: Date;
  humanApprovedDigest?: string;
}): Policy {
  const contract = normalizeAddress(input.envelope.verifyingContract);
  const counterparties = new Set(
    input.policy.allowedCounterparties.map(normalizeAddress),
  );
  const counterparty = normalizeAddress(input.counterparty);
  const maximum = BigInt(input.policy.maxDealMicroUsdt);
  const approvalThreshold = BigInt(
    input.policy.humanApprovalThresholdMicroUsdt,
  );
  const policyExpiry = BigInt(
    Math.floor(new Date(input.policy.expiresAt).getTime() / 1000),
  );
  const currentTime = BigInt(Math.floor(input.now.getTime() / 1000));
  const approvedDigest = input.humanApprovedDigest?.toLowerCase();

  const hasHumanApproval = (params: unknown): boolean => {
    const digest = digestFromPolicyParams(params)?.toLowerCase();
    return digest !== null && digest === approvedDigest;
  };

  return {
    id: "deadline-agent-deal-policy",
    name: "DEADLINE tournament deal mandate",
    scope: "project",
    wallet: "evm",
    rules: [
      {
        name: "allow-mandated-authorization",
        operation: "signTypedData",
        action: "ALLOW",
        reason: "Authorization is inside the club mandate",
        conditions: [
          ({ params }) => {
            const typedData = typedDataFrom(params);
            const amount = asBigInt(typedData.message?.totalAmount);
            const fundingDeadline = asBigInt(
              typedData.message?.fundingDeadline,
            );

            return (
              String(typedData.domain?.chainId) ===
                String(input.envelope.chainId) &&
              normalizeAddress(typedData.domain?.verifyingContract ?? "") ===
                contract &&
              amount !== null &&
              amount <= maximum &&
              (amount <= approvalThreshold || hasHumanApproval(params)) &&
              fundingDeadline !== null &&
              fundingDeadline <= policyExpiry &&
              currentTime <= policyExpiry &&
              counterparties.has(counterparty)
            );
          },
        ],
      },
      {
        name: "deny-over-budget",
        operation: "signTypedData",
        action: "DENY",
        reason: "Authorization exceeds the club's maximum deal mandate",
        conditions: [
          ({ params }) => {
            const amount = asBigInt(typedDataFrom(params).message?.totalAmount);
            return amount !== null && amount > maximum;
          },
        ],
      },
      {
        name: "require-human-approval",
        operation: "signTypedData",
        action: "DENY",
        reason: "Authorization requires human sporting-director approval",
        conditions: [
          ({ params }) => {
            const amount = asBigInt(typedDataFrom(params).message?.totalAmount);
            return (
              amount !== null &&
              amount > approvalThreshold &&
              amount <= maximum &&
              !hasHumanApproval(params)
            );
          },
        ],
      },
      {
        name: "deny-unapproved-counterparty",
        operation: "signTypedData",
        action: "DENY",
        reason: "Counterparty is outside the club's allowlist",
        conditions: [() => !counterparties.has(counterparty)],
      },
      {
        name: "deny-wrong-deal-domain",
        operation: "signTypedData",
        action: "DENY",
        reason: "Authorization targets an unapproved chain or escrow contract",
        conditions: [
          ({ params }) => {
            const domain = typedDataFrom(params).domain;
            return (
              String(domain?.chainId) !== String(input.envelope.chainId) ||
              normalizeAddress(domain?.verifyingContract ?? "") !== contract
            );
          },
        ],
      },
      {
        name: "deny-expired-mandate",
        operation: "signTypedData",
        action: "DENY",
        reason: "The club mandate or funding window has expired",
        conditions: [
          ({ params }) => {
            const deadline = asBigInt(
              typedDataFrom(params).message?.fundingDeadline,
            );
            return (
              currentTime > policyExpiry ||
              deadline === null ||
              deadline > policyExpiry
            );
          },
        ],
      },
    ],
  };
}

export class WdkDealAgent {
  readonly #seed: string | Uint8Array;

  constructor(seed: string | Uint8Array = WDK.getRandomSeedPhrase(12)) {
    this.#seed = seed;
  }

  async evaluateAuthorization(input: {
    policy: AgentPolicy;
    envelope: DealAuthorizationEnvelope;
    counterparty: string;
    now?: Date;
    humanApprovedDigest?: string;
    sign?: boolean;
  }): Promise<DealPolicyResult> {
    const typedData = buildDealAuthorizationTypedData(input.envelope);
    const wdk = new WDK(this.#seed)
      .registerWallet("evm", WalletManagerEvm, {})
      .registerPolicy(
        buildWdkDealPolicy({
          policy: input.policy,
          envelope: input.envelope,
          counterparty: input.counterparty,
          now: input.now ?? new Date(),
          ...(input.humanApprovedDigest
            ? { humanApprovedDigest: input.humanApprovedDigest }
            : {}),
        }),
      );

    try {
      const account = (await wdk.getAccount(
        "evm",
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
        authorizationDigest: hashDealAuthorization(input.envelope),
        ...(signature ? { signature } : {}),
      };
    } finally {
      wdk.dispose();
    }
  }
}

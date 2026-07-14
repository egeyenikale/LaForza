import {
  AbiCoder,
  getAddress,
  keccak256,
  TypedDataEncoder,
  type TypedDataDomain,
  type TypedDataField,
} from "ethers";

export type DealMilestoneAuthorization = {
  id: string;
  threshold: bigint;
  amount: bigint;
  beneficiary: string;
};

export type DealAuthorization = {
  dealId: string;
  buyer: string;
  seller: string;
  player: string;
  token: string;
  totalAmount: bigint;
  signingBonus: bigint;
  milestoneRoot: string;
  fundingDeadline: bigint;
  settlementDeadline: bigint;
};

export type DealAuthorizationEnvelope = {
  chainId: bigint | number;
  verifyingContract: string;
  authorization: DealAuthorization;
};

export const dealAuthorizationTypes: Record<string, TypedDataField[]> = {
  DealAuthorization: [
    { name: "dealId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "player", type: "address" },
    { name: "token", type: "address" },
    { name: "totalAmount", type: "uint256" },
    { name: "signingBonus", type: "uint256" },
    { name: "milestoneRoot", type: "bytes32" },
    { name: "fundingDeadline", type: "uint64" },
    { name: "settlementDeadline", type: "uint64" },
  ],
};

export function hashMilestones(
  milestones: readonly DealMilestoneAuthorization[],
): string {
  const normalized = milestones.map((milestone) => ({
    id: milestone.id,
    threshold: milestone.threshold,
    amount: milestone.amount,
    beneficiary: getAddress(milestone.beneficiary),
  }));

  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      [
        "tuple(bytes32 id,uint64 threshold,uint128 amount,address beneficiary)[]",
      ],
      [normalized],
    ),
  );
}

export function buildDealAuthorizationTypedData(
  envelope: DealAuthorizationEnvelope,
): {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  message: DealAuthorization;
} {
  return {
    domain: {
      name: "LaForza Deadline",
      version: "1",
      chainId: envelope.chainId,
      verifyingContract: getAddress(envelope.verifyingContract),
    },
    types: dealAuthorizationTypes,
    message: {
      ...envelope.authorization,
      buyer: getAddress(envelope.authorization.buyer),
      seller: getAddress(envelope.authorization.seller),
      player: getAddress(envelope.authorization.player),
      token: getAddress(envelope.authorization.token),
    },
  };
}

export function hashDealAuthorization(
  envelope: DealAuthorizationEnvelope,
): string {
  const typedData = buildDealAuthorizationTypedData(envelope);
  return TypedDataEncoder.hash(
    typedData.domain,
    typedData.types,
    typedData.message,
  );
}

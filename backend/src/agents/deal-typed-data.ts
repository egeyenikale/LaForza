import type { Offer } from "@laforza/domain";
import { keccak256, toUtf8Bytes, TypedDataEncoder } from "ethers";

const proposerRole = {
  BUYING_CLUB: 0,
  SELLING_CLUB: 1,
} as const;

export const offerTypes = {
  Offer: [
    { name: "dealId", type: "bytes32" },
    { name: "proposerRole", type: "uint8" },
    { name: "counterparty", type: "address" },
    { name: "totalMicroUsdt", type: "uint256" },
    { name: "signingBonusMicroUsdt", type: "uint256" },
    { name: "milestonesHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "expiresAt", type: "uint64" },
  ],
};

function hashMilestones(offer: Offer): string {
  const canonicalMilestones = offer.milestones.map((milestone) => ({
    amountMicroUsdt: milestone.amountMicroUsdt,
    id: milestone.id,
    kind: milestone.kind,
    label: milestone.label,
    threshold: milestone.threshold,
  }));

  return keccak256(toUtf8Bytes(JSON.stringify(canonicalMilestones)));
}

export function buildOfferTypedData(
  offer: Offer,
  chainId: number,
  verifyingContract: string,
) {
  return {
    domain: {
      name: "LaForza Deadline",
      version: "1",
      chainId,
      verifyingContract,
    },
    types: offerTypes,
    message: {
      dealId: keccak256(toUtf8Bytes(offer.dealId)),
      proposerRole: proposerRole[offer.proposer],
      counterparty: offer.counterparty,
      totalMicroUsdt: BigInt(offer.totalMicroUsdt),
      signingBonusMicroUsdt: BigInt(offer.signingBonusMicroUsdt),
      milestonesHash: hashMilestones(offer),
      nonce: BigInt(offer.nonce),
      expiresAt: BigInt(Math.floor(new Date(offer.expiresAt).getTime() / 1000)),
    },
  };
}

export function hashOfferTypedData(
  typedData: ReturnType<typeof buildOfferTypedData>,
): string {
  return TypedDataEncoder.hash(
    typedData.domain,
    typedData.types,
    typedData.message,
  );
}

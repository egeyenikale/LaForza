import { z } from "zod";

export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Expected an EVM address");

export const microUsdtSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const dealStatusSchema = z.enum([
  "DRAFT",
  "NEGOTIATING",
  "AWAITING_SIGNATURES",
  "READY_TO_FUND",
  "FUNDED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

export const partyRoleSchema = z.enum([
  "BUYING_CLUB",
  "SELLING_CLUB",
  "PLAYER",
]);

export const milestoneSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  kind: z.enum(["SIGNING", "APPEARANCE", "GOAL"]),
  threshold: z.number().int().positive(),
  amountMicroUsdt: microUsdtSchema.positive(),
});

export const agentPolicySchema = z
  .object({
    maxDealMicroUsdt: microUsdtSchema.positive(),
    humanApprovalThresholdMicroUsdt: microUsdtSchema.positive(),
    allowedCounterparties: z.array(addressSchema).max(32),
    expiresAt: z.string().datetime(),
  })
  .refine(
    ({ humanApprovalThresholdMicroUsdt, maxDealMicroUsdt }) =>
      humanApprovalThresholdMicroUsdt <= maxDealMicroUsdt,
    {
      message: "Human approval threshold cannot exceed the maximum deal value",
      path: ["humanApprovalThresholdMicroUsdt"],
    },
  );

export const offerSchema = z.object({
  id: z.string().uuid(),
  dealId: z.string().uuid(),
  proposer: partyRoleSchema.exclude(["PLAYER"]),
  counterparty: addressSchema,
  totalMicroUsdt: microUsdtSchema.positive(),
  signingBonusMicroUsdt: microUsdtSchema,
  milestones: z.array(milestoneSchema).max(8),
  nonce: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const policyEvaluationRequestSchema = z.object({
  policy: agentPolicySchema,
  offer: offerSchema,
  chainId: z.number().int().positive(),
  verifyingContract: addressSchema,
});

export const dealSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(3).max(120),
  playerName: z.string().min(2).max(80),
  buyingClub: addressSchema,
  sellingClub: addressSchema,
  player: addressSchema,
  chainId: z.number().int().positive(),
  status: dealStatusSchema,
  acceptedOffer: offerSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createDealSchema = dealSchema.pick({
  title: true,
  playerName: true,
  buyingClub: true,
  sellingClub: true,
  player: true,
  chainId: true,
});

export type Address = z.infer<typeof addressSchema>;
export type AgentPolicy = z.infer<typeof agentPolicySchema>;
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type Deal = z.infer<typeof dealSchema>;
export type DealStatus = z.infer<typeof dealStatusSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type PartyRole = z.infer<typeof partyRoleSchema>;
export type PolicyEvaluationRequest = z.infer<
  typeof policyEvaluationRequestSchema
>;

import type { AgentPolicy } from "@laforza/domain";
import {
  hashDealAuthorization,
  hashMilestones,
  type DealAuthorizationEnvelope,
  type DealMilestoneAuthorization,
} from "@laforza/protocol";
import WDK, { type Policy } from "@tetherto/wdk";
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";
import {
  Contract,
  ContractFactory,
  getAddress,
  Interface,
  JsonRpcProvider,
  NonceManager,
  Wallet,
  id,
  keccak256,
  parseEther,
  recoverAddress,
  toUtf8Bytes,
  type InterfaceAbi,
  type TransactionReceipt,
} from "ethers";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { WdkDealAgent } from "../agents/wdk-deal-agent.js";
import type { AppConfig } from "../config.js";
import { EventStore } from "../events/event-store.js";
import { demoPlayers, playerById, type DemoPlayer } from "./player-catalog.js";
import {
  LocalWalletVault,
  type PublicWallet,
  type WalletRole,
} from "../wallets/local-wallet-vault.js";

const USDT = 1_000_000n;
const TOTAL_AMOUNT = 900n * USDT;
const SIGNING_BONUS = 250n * USDT;
const MILESTONE_AMOUNT = 650n * USDT;
const BUYER_MAXIMUM = 1_000n * USDT;
const HUMAN_APPROVAL_THRESHOLD = 750n * USDT;

type Artifact = {
  abi: InterfaceAbi;
  bytecode: string;
};

type DemoSignatures = Partial<Record<"BUYER" | "SELLER" | "PLAYER", string>>;

type DemoOffer = {
  id: string;
  direction: "INCOMING" | "OUTGOING";
  from: string;
  to: string;
  amountMicroUsdt: string;
  signingBonusMicroUsdt: string;
  status:
    | "RECEIVED"
    | "REJECTED_BY_POLICY"
    | "AWAITING_HUMAN_APPROVAL"
    | "APPROVED"
    | "FULLY_SIGNED"
    | "FUNDED"
    | "SETTLED";
  createdAt: string;
  note: string;
};

type DemoRuntime = {
  wallets: PublicWallet[];
  buyerAddress: string;
  custodyMode: "WDK" | "METAMASK";
  tokenAddress: string;
  escrowAddress: string;
  envelope: DealAuthorizationEnvelope;
  milestone: DealMilestoneAuthorization;
  signatures: DemoSignatures;
  humanApprovedDigest?: string;
  transactions: Record<string, string>;
  selectedPlayer: DemoPlayer;
  offers: DemoOffer[];
};

export type ExternalDeploymentInput = {
  playerId: string;
  buyerAddress: string;
  tokenAddress: string;
  escrowAddress: string;
  tokenDeployTxHash: string;
  escrowDeployTxHash: string;
  verifierFundingTxHash: string;
  mintTxHash: string;
};

type EvmWdkAccount = {
  approve(input: {
    token: string;
    spender: string;
    amount: bigint;
  }): Promise<{ hash: string }>;
  sendTransaction(input: {
    to: string;
    value: bigint;
    data: string;
  }): Promise<{ hash: string }>;
};

function roleAddress(wallets: PublicWallet[], role: WalletRole): string {
  const wallet = wallets.find((candidate) => candidate.role === role);
  if (!wallet) throw new Error(`Missing ${role} wallet`);
  return wallet.address;
}

function jsonBigInt(value: bigint): string {
  return value.toString();
}

function publicRuntimeWallets(runtime: DemoRuntime): PublicWallet[] {
  return runtime.wallets.map((wallet) =>
    wallet.role === "BUYER"
      ? { ...wallet, address: runtime.buyerAddress }
      : wallet,
  );
}

export class DemoService {
  readonly #provider: JsonRpcProvider;
  readonly #vault: LocalWalletVault;
  readonly #events: EventStore;
  #runtime?: DemoRuntime;

  constructor(private readonly config: AppConfig) {
    this.#provider = new JsonRpcProvider(config.CHAIN_RPC_URL, config.CHAIN_ID);
    this.#vault = new LocalWalletVault(join(config.DATA_DIR, "wallets.json"));
    this.#events = new EventStore(join(config.DATA_DIR, "events.jsonl"));
  }

  players(): readonly DemoPlayer[] {
    return demoPlayers;
  }

  async participants(
    passkey: string,
    playerId = "mert-kaya",
  ): Promise<Record<string, unknown>> {
    await this.#provider.getBlockNumber();
    const selectedPlayer = playerById(playerId);
    const wallets = (await this.#vault.exists())
      ? await this.#vault.list(passkey)
      : await this.#vault.create(passkey);
    return {
      network: this.#networkInfo(),
      selectedPlayer,
      participants: {
        seller: roleAddress(wallets, "SELLER"),
        player: roleAddress(wallets, "PLAYER"),
        verifier: roleAddress(wallets, "VERIFIER"),
      },
      terms: {
        totalAmountMicroUsdt: jsonBigInt(TOTAL_AMOUNT),
        signingBonusMicroUsdt: jsonBigInt(SIGNING_BONUS),
        milestoneAmountMicroUsdt: jsonBigInt(MILESTONE_AMOUNT),
        milestoneId: id("appearance-1"),
      },
    };
  }

  async artifacts(): Promise<Record<string, unknown>> {
    const [token, escrow] = await Promise.all([
      this.#readArtifact("contracts/test/MockUSDT.sol/MockUSDT.json"),
      this.#readArtifact("contracts/DeadlineEscrow.sol/DeadlineEscrow.json"),
    ]);
    return { token, escrow };
  }

  async adoptExternalDeployment(
    passkey: string,
    input: ExternalDeploymentInput,
  ): Promise<Record<string, unknown>> {
    const selectedPlayer = playerById(input.playerId);
    const wallets = (await this.#vault.exists())
      ? await this.#vault.list(passkey)
      : await this.#vault.create(passkey);
    const buyer = getAddress(input.buyerAddress);
    const seller = roleAddress(wallets, "SELLER");
    const player = roleAddress(wallets, "PLAYER");
    const verifier = roleAddress(wallets, "VERIFIER");
    const tokenAddress = getAddress(input.tokenAddress);
    const escrowAddress = getAddress(input.escrowAddress);

    const [tokenArtifact, escrowArtifact] = await Promise.all([
      this.#readArtifact("contracts/test/MockUSDT.sol/MockUSDT.json"),
      this.#readArtifact("contracts/DeadlineEscrow.sol/DeadlineEscrow.json"),
    ]);
    const token = new Contract(tokenAddress, tokenArtifact.abi, this.#provider);
    const escrow = new Contract(
      escrowAddress,
      escrowArtifact.abi,
      this.#provider,
    );
    const milestone: DealMilestoneAuthorization = {
      id: id("appearance-1"),
      threshold: 1n,
      amount: MILESTONE_AMOUNT,
      beneficiary: seller,
    };
    const [
      tokenCode,
      escrowCode,
      tokenDecimals,
      contractToken,
      contractBuyer,
      contractSeller,
      contractPlayer,
      contractVerifier,
      dealId,
      totalAmount,
      signingBonus,
      milestoneRoot,
      fundingDeadline,
      settlementDeadline,
      contractDigest,
    ] = await Promise.all([
      this.#provider.getCode(tokenAddress),
      this.#provider.getCode(escrowAddress),
      token.getFunction("decimals")(),
      escrow.getFunction("token")(),
      escrow.getFunction("buyer")(),
      escrow.getFunction("seller")(),
      escrow.getFunction("player")(),
      escrow.getFunction("verifier")(),
      escrow.getFunction("dealId")(),
      escrow.getFunction("totalAmount")(),
      escrow.getFunction("signingBonus")(),
      escrow.getFunction("milestoneRoot")(),
      escrow.getFunction("fundingDeadline")(),
      escrow.getFunction("settlementDeadline")(),
      escrow.getFunction("authorizationDigest")(),
    ]);
    if (tokenCode === "0x" || escrowCode === "0x") {
      throw new Error("Public testnet contracts were not found");
    }
    if (BigInt(tokenDecimals) !== 6n) {
      throw new Error("Test USDt must use six decimals");
    }
    const addressChecks = [
      [String(contractToken), tokenAddress, "token"],
      [String(contractBuyer), buyer, "buyer"],
      [String(contractSeller), seller, "seller"],
      [String(contractPlayer), player, "player"],
      [String(contractVerifier), verifier, "verifier"],
    ] as const;
    for (const [actual, expected, field] of addressChecks) {
      if (getAddress(actual) !== getAddress(expected)) {
        throw new Error(`Escrow ${field} does not match the prepared deal`);
      }
    }
    if (
      BigInt(totalAmount) !== TOTAL_AMOUNT ||
      BigInt(signingBonus) !== SIGNING_BONUS ||
      String(milestoneRoot) !== hashMilestones([milestone])
    ) {
      throw new Error("Escrow commercial terms do not match La Forza terms");
    }

    const envelope: DealAuthorizationEnvelope = {
      chainId: this.config.CHAIN_ID,
      verifyingContract: escrowAddress,
      authorization: {
        dealId: String(dealId),
        buyer,
        seller,
        player,
        token: tokenAddress,
        totalAmount: BigInt(totalAmount),
        signingBonus: BigInt(signingBonus),
        milestoneRoot: String(milestoneRoot),
        fundingDeadline: BigInt(fundingDeadline),
        settlementDeadline: BigInt(settlementDeadline),
      },
    };
    if (String(contractDigest) !== hashDealAuthorization(envelope)) {
      throw new Error("Public testnet authorization digest mismatch");
    }

    const receipts = await Promise.all(
      [
        input.tokenDeployTxHash,
        input.escrowDeployTxHash,
        input.verifierFundingTxHash,
        input.mintTxHash,
      ].map((hash) => this.#wait(hash)),
    );
    if (
      receipts.some(
        (receipt) => receipt.from.toLowerCase() !== buyer.toLowerCase(),
      )
    ) {
      throw new Error("Every deployment transaction must come from the buyer");
    }
    if (getAddress(receipts[0]!.contractAddress!) !== tokenAddress) {
      throw new Error("Token deployment receipt does not match the token");
    }
    if (getAddress(receipts[1]!.contractAddress!) !== escrowAddress) {
      throw new Error("Escrow deployment receipt does not match the escrow");
    }
    if (getAddress(receipts[2]!.to!) !== verifier) {
      throw new Error(
        "Verifier gas transaction does not fund the WDK verifier",
      );
    }
    if (getAddress(receipts[3]!.to!) !== tokenAddress) {
      throw new Error("Mint transaction does not target test USDt");
    }

    const now = Date.now();
    this.#runtime = {
      wallets,
      buyerAddress: buyer,
      custodyMode: "METAMASK",
      tokenAddress,
      escrowAddress,
      envelope,
      milestone,
      signatures: {},
      transactions: {
        tokenDeployment: input.tokenDeployTxHash,
        escrowDeployment: input.escrowDeployTxHash,
        verifierGas: input.verifierFundingTxHash,
        mint: input.mintTxHash,
      },
      selectedPlayer,
      offers: [
        {
          id: `offer-${now}-seller-ask`,
          direction: "INCOMING",
          from: selectedPlayer.currentClub,
          to: "Atlas FC",
          amountMicroUsdt: "950000000",
          signingBonusMicroUsdt: jsonBigInt(SIGNING_BONUS),
          status: "RECEIVED",
          createdAt: new Date().toISOString(),
          note: `Initial asking terms for ${selectedPlayer.name}`,
        },
      ],
    };
    await this.#events.clear();
    await this.#events.append("PUBLIC_TESTNET_DEAL_DEPLOYED", {
      chainId: this.config.CHAIN_ID,
      buyer,
      tokenAddress,
      escrowAddress,
      playerId: selectedPlayer.id,
      tokenDeployTxHash: input.tokenDeployTxHash,
      escrowDeployTxHash: input.escrowDeployTxHash,
    });
    return this.state();
  }

  async bootstrap(
    passkey: string,
    playerId = "mert-kaya",
    externalBuyerAddress?: string,
  ): Promise<Record<string, unknown>> {
    await this.#provider.getBlockNumber();
    const selectedPlayer = playerById(playerId);
    const wallets = (await this.#vault.exists())
      ? await this.#vault.list(passkey)
      : await this.#vault.create(passkey);
    const buyer = externalBuyerAddress
      ? getAddress(externalBuyerAddress)
      : roleAddress(wallets, "BUYER");
    const seller = roleAddress(wallets, "SELLER");
    const player = roleAddress(wallets, "PLAYER");
    const verifier = roleAddress(wallets, "VERIFIER");

    const deployer = new NonceManager(
      new Wallet(this.config.LOCAL_DEPLOYER_PRIVATE_KEY, this.#provider),
    );
    const [tokenArtifact, escrowArtifact] = await Promise.all([
      this.#readArtifact("contracts/test/MockUSDT.sol/MockUSDT.json"),
      this.#readArtifact("contracts/DeadlineEscrow.sol/DeadlineEscrow.json"),
    ]);
    const token = await new ContractFactory(
      tokenArtifact.abi,
      tokenArtifact.bytecode,
      deployer,
    ).deploy();
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();

    const now = Math.floor(Date.now() / 1000);
    const fundingDeadline = BigInt(now + 2 * 60 * 60);
    const settlementDeadline = BigInt(now + 24 * 60 * 60);
    const milestone: DealMilestoneAuthorization = {
      id: id("appearance-1"),
      threshold: 1n,
      amount: MILESTONE_AMOUNT,
      beneficiary: seller,
    };
    const dealId = id(`laforza-${selectedPlayer.id}-${now}`);
    const escrow = await new ContractFactory(
      escrowArtifact.abi,
      escrowArtifact.bytecode,
      deployer,
    ).deploy(
      tokenAddress,
      buyer,
      seller,
      player,
      verifier,
      dealId,
      TOTAL_AMOUNT,
      SIGNING_BONUS,
      fundingDeadline,
      settlementDeadline,
      [milestone],
    );
    await escrow.waitForDeployment();
    const escrowAddress = await escrow.getAddress();

    for (const address of [buyer, verifier]) {
      const funding = await deployer.sendTransaction({
        to: address,
        value: parseEther("5"),
      });
      await funding.wait();
    }
    const mint = await token.getFunction("mint")(buyer, 2_000n * USDT);
    await mint.wait();

    const envelope: DealAuthorizationEnvelope = {
      chainId: this.config.CHAIN_ID,
      verifyingContract: escrowAddress,
      authorization: {
        dealId,
        buyer,
        seller,
        player,
        token: tokenAddress,
        totalAmount: TOTAL_AMOUNT,
        signingBonus: SIGNING_BONUS,
        milestoneRoot: hashMilestones([milestone]),
        fundingDeadline,
        settlementDeadline,
      },
    };
    const contractDigest = await escrow.getFunction("authorizationDigest")();
    const localDigest = hashDealAuthorization(envelope);
    if (contractDigest !== localDigest) {
      throw new Error("Canonical authorization digest mismatch");
    }

    this.#runtime = {
      wallets,
      buyerAddress: buyer,
      custodyMode: externalBuyerAddress ? "METAMASK" : "WDK",
      tokenAddress,
      escrowAddress,
      envelope,
      milestone,
      signatures: {},
      transactions: {},
      selectedPlayer,
      offers: [
        {
          id: `offer-${now}-seller-ask`,
          direction: "INCOMING",
          from: selectedPlayer.currentClub,
          to: "Atlas FC",
          amountMicroUsdt: "950000000",
          signingBonusMicroUsdt: jsonBigInt(SIGNING_BONUS),
          status: "RECEIVED",
          createdAt: new Date().toISOString(),
          note: `Initial asking terms for ${selectedPlayer.name}`,
        },
      ],
    };
    await this.#events.clear();
    await this.#events.append("DEMO_BOOTSTRAPPED", {
      chainId: this.config.CHAIN_ID,
      tokenAddress,
      escrowAddress,
      authorizationDigest: localDigest,
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      custodyMode: externalBuyerAddress ? "METAMASK" : "WDK",
      note: "Local test chain only — no real funds",
    });
    return this.state();
  }

  async attemptOverBudget(passkey: string): Promise<Record<string, unknown>> {
    const runtime = this.#requireRuntime();
    const envelope: DealAuthorizationEnvelope = {
      ...runtime.envelope,
      authorization: {
        ...runtime.envelope.authorization,
        totalAmount: 1_100n * USDT,
      },
    };
    const result = await this.#evaluateBuyer(passkey, envelope);
    runtime.offers.push({
      id: `offer-${Date.now()}-over-budget`,
      direction: "OUTGOING",
      from: "Atlas FC Agent",
      to: runtime.selectedPlayer.currentClub,
      amountMicroUsdt: "1100000000",
      signingBonusMicroUsdt: jsonBigInt(SIGNING_BONUS),
      status: "REJECTED_BY_POLICY",
      createdAt: new Date().toISOString(),
      note: result.reason ?? "Club mandate rejected this proposal",
    });
    await this.#events.append("POLICY_DENIED_OVER_BUDGET", {
      amountMicroUsdt: "1100000000",
      decision: result.decision,
      reason: result.reason,
      rule: result.matched_rule,
    });
    return this.state();
  }

  async reviewCounter(passkey: string): Promise<Record<string, unknown>> {
    const runtime = this.#requireRuntime();
    const result = await this.#evaluateBuyer(passkey, runtime.envelope);
    runtime.offers.push({
      id: `offer-${Date.now()}-counter`,
      direction: "OUTGOING",
      from: "Atlas FC Agent",
      to: runtime.selectedPlayer.currentClub,
      amountMicroUsdt: jsonBigInt(TOTAL_AMOUNT),
      signingBonusMicroUsdt: jsonBigInt(SIGNING_BONUS),
      status: "AWAITING_HUMAN_APPROVAL",
      createdAt: new Date().toISOString(),
      note: "Counter terms fit the mandate but cross the approval threshold",
    });
    await this.#events.append("HUMAN_APPROVAL_REQUIRED", {
      amountMicroUsdt: jsonBigInt(TOTAL_AMOUNT),
      decision: result.decision,
      reason: result.reason,
      authorizationDigest: result.authorizationDigest,
    });
    return this.state();
  }

  async approveAndSignBuyer(passkey: string): Promise<Record<string, unknown>> {
    const runtime = this.#requireRuntime();
    if (runtime.custodyMode === "METAMASK") {
      throw new Error("Connected MetaMask must sign the buyer authorization");
    }
    const digest = hashDealAuthorization(runtime.envelope);
    runtime.humanApprovedDigest = digest;
    const result = await this.#evaluateBuyer(
      passkey,
      runtime.envelope,
      digest,
      true,
    );
    if (!result.signature)
      throw new Error("Buyer authorization was not signed");
    runtime.signatures.BUYER = result.signature;
    this.#updateAcceptedOffer(runtime, "APPROVED");
    await this.#events.append("BUYER_AUTHORIZATION_SIGNED", {
      signer: roleAddress(runtime.wallets, "BUYER"),
      authorizationDigest: digest,
      policyDecision: result.decision,
    });
    return this.state();
  }

  async recordMetamaskBuyerSignature(
    signature: string,
  ): Promise<Record<string, unknown>> {
    const runtime = this.#requireRuntime();
    if (runtime.custodyMode !== "METAMASK") {
      throw new Error("This deal is not controlled by MetaMask");
    }
    const acceptedOffer = [...runtime.offers]
      .reverse()
      .find(
        (offer) =>
          offer.amountMicroUsdt === jsonBigInt(TOTAL_AMOUNT) &&
          offer.status === "AWAITING_HUMAN_APPROVAL",
      );
    if (!acceptedOffer) {
      throw new Error("The counteroffer is not awaiting human approval");
    }
    const digest = hashDealAuthorization(runtime.envelope);
    const recovered = recoverAddress(digest, signature);
    if (recovered.toLowerCase() !== runtime.buyerAddress.toLowerCase()) {
      throw new Error("Signature does not belong to the connected buyer");
    }
    runtime.humanApprovedDigest = digest;
    runtime.signatures.BUYER = signature;
    this.#updateAcceptedOffer(runtime, "APPROVED");
    await this.#events.append("BUYER_AUTHORIZATION_SIGNED", {
      signer: runtime.buyerAddress,
      authorizationDigest: digest,
      wallet: "MetaMask / EIP-1193",
      policyDecision: "HUMAN_APPROVED",
    });
    return this.state();
  }

  async signParty(
    role: "SELLER" | "PLAYER",
    passkey: string,
  ): Promise<Record<string, unknown>> {
    const runtime = this.#requireRuntime();
    const counterparty = runtime.buyerAddress;
    const policy = this.#partyPolicy(counterparty, runtime.envelope);
    const result = await this.#vault.withSeed(role, passkey, (seed) =>
      new WdkDealAgent(seed).evaluateAuthorization({
        policy,
        envelope: runtime.envelope,
        counterparty,
        sign: true,
      }),
    );
    if (!result.signature)
      throw new Error(`${role} authorization was not signed`);
    runtime.signatures[role] = result.signature;
    if (role === "PLAYER") this.#updateAcceptedOffer(runtime, "FULLY_SIGNED");
    await this.#events.append(`${role}_AUTHORIZATION_SIGNED`, {
      signer: roleAddress(runtime.wallets, role),
      authorizationDigest: result.authorizationDigest,
      policyDecision: result.decision,
    });
    return this.state();
  }

  async fund(passkey: string): Promise<Record<string, unknown>> {
    const runtime = this.#requireRuntime();
    if (runtime.custodyMode === "METAMASK") {
      throw new Error("Connected MetaMask must approve and fund this escrow");
    }
    const { BUYER, SELLER, PLAYER } = runtime.signatures;
    if (!BUYER || !SELLER || !PLAYER) {
      throw new Error("Buyer, seller, and player signatures are required");
    }
    const escrowInterface = await this.#escrowInterface();
    const fundData = escrowInterface.encodeFunctionData("fund", [
      BUYER,
      SELLER,
      PLAYER,
    ]);
    const transactions = await this.#vault.withSeed(
      "BUYER",
      passkey,
      async (seed) => {
        const approvalWdk = new WDK(seed)
          .registerWallet("evm", WalletManagerEvm, {
            provider: this.config.CHAIN_RPC_URL,
            chainId: this.config.CHAIN_ID,
            transactionMaxFee: parseEther("1"),
          })
          .registerPolicy(this.#buyerApprovalPolicy(runtime));
        let approvalHash: string;
        try {
          const account = (await approvalWdk.getAccount(
            "evm",
            0,
          )) as unknown as EvmWdkAccount;
          const approval = await account.approve({
            token: runtime.tokenAddress,
            spender: runtime.escrowAddress,
            amount: TOTAL_AMOUNT,
          });
          await this.#wait(approval.hash);
          approvalHash = approval.hash;
        } finally {
          approvalWdk.dispose();
        }

        const fundingWdk = new WDK(seed)
          .registerWallet("evm", WalletManagerEvm, {
            provider: this.config.CHAIN_RPC_URL,
            chainId: this.config.CHAIN_ID,
            transactionMaxFee: parseEther("1"),
          })
          .registerPolicy(this.#buyerFundingPolicy(runtime, fundData));
        try {
          const account = (await fundingWdk.getAccount(
            "evm",
            0,
          )) as unknown as EvmWdkAccount;
          const funding = await account.sendTransaction({
            to: runtime.escrowAddress,
            value: 0n,
            data: fundData,
          });
          await this.#wait(funding.hash);
          return { approval: approvalHash, funding: funding.hash };
        } finally {
          fundingWdk.dispose();
        }
      },
    );
    runtime.transactions.approval = transactions.approval;
    runtime.transactions.funding = transactions.funding;
    this.#updateAcceptedOffer(runtime, "FUNDED");
    await this.#events.append("ESCROW_FUNDED", {
      approveTxHash: transactions.approval,
      fundingTxHash: transactions.funding,
      signingBonusMicroUsdt: jsonBigInt(SIGNING_BONUS),
    });
    return this.state();
  }

  async recordMetamaskFunding(
    approvalTxHash: string,
    fundingTxHash: string,
  ): Promise<Record<string, unknown>> {
    const runtime = this.#requireRuntime();
    if (runtime.custodyMode !== "METAMASK") {
      throw new Error("This deal is not controlled by MetaMask");
    }
    const approvalReceipt = await this.#wait(approvalTxHash);
    const fundingReceipt = await this.#wait(fundingTxHash);
    if (
      approvalReceipt.from.toLowerCase() !== runtime.buyerAddress.toLowerCase()
    ) {
      throw new Error("Approval transaction was not sent by the buyer");
    }
    if (
      fundingReceipt.from.toLowerCase() !== runtime.buyerAddress.toLowerCase()
    ) {
      throw new Error("Funding transaction was not sent by the buyer");
    }
    if (
      approvalReceipt.to?.toLowerCase() !== runtime.tokenAddress.toLowerCase()
    ) {
      throw new Error("Approval transaction does not target test USDt");
    }
    if (
      fundingReceipt.to?.toLowerCase() !== runtime.escrowAddress.toLowerCase()
    ) {
      throw new Error("Funding transaction does not target this escrow");
    }
    const escrowArtifact = await this.#readArtifact(
      "contracts/DeadlineEscrow.sol/DeadlineEscrow.json",
    );
    const escrow = new Contract(
      runtime.escrowAddress,
      escrowArtifact.abi,
      this.#provider,
    );
    if (!(await escrow.getFunction("funded")())) {
      throw new Error("Escrow is not funded on-chain");
    }
    runtime.transactions.approval = approvalTxHash;
    runtime.transactions.funding = fundingTxHash;
    this.#updateAcceptedOffer(runtime, "FUNDED");
    await this.#events.append("ESCROW_FUNDED", {
      approveTxHash: approvalTxHash,
      fundingTxHash,
      buyer: runtime.buyerAddress,
      wallet: "MetaMask / EIP-1193",
      signingBonusMicroUsdt: jsonBigInt(SIGNING_BONUS),
    });
    return this.state();
  }

  async releaseMilestone(passkey: string): Promise<Record<string, unknown>> {
    const runtime = this.#requireRuntime();
    const escrowInterface = await this.#escrowInterface();
    const evidenceHash = keccak256(
      toUtf8Bytes("LaForza demo match report: appearance verified"),
    );
    const data = escrowInterface.encodeFunctionData("releaseMilestone", [
      runtime.milestone.id,
      evidenceHash,
    ]);
    const transactionHash = await this.#vault.withSeed(
      "VERIFIER",
      passkey,
      async (seed) => {
        const wdk = new WDK(seed)
          .registerWallet("evm", WalletManagerEvm, {
            provider: this.config.CHAIN_RPC_URL,
            chainId: this.config.CHAIN_ID,
            transactionMaxFee: parseEther("1"),
          })
          .registerPolicy(this.#verifierExecutionPolicy(runtime, data));
        try {
          const account = (await wdk.getAccount(
            "evm",
            0,
          )) as unknown as EvmWdkAccount;
          const transaction = await account.sendTransaction({
            to: runtime.escrowAddress,
            value: 0n,
            data,
          });
          await this.#wait(transaction.hash);
          return transaction.hash;
        } finally {
          wdk.dispose();
        }
      },
    );
    runtime.transactions.release = transactionHash;
    this.#updateAcceptedOffer(runtime, "SETTLED");
    await this.#events.append("MILESTONE_RELEASED", {
      transactionHash,
      milestoneId: runtime.milestone.id,
      evidenceHash,
      amountMicroUsdt: jsonBigInt(MILESTONE_AMOUNT),
    });
    return this.state();
  }

  async state(): Promise<Record<string, unknown>> {
    const events = await this.#events.list();
    if (!this.#runtime)
      return {
        initialized: false,
        network: this.#networkInfo(),
        players: demoPlayers,
        offers: [],
        events,
      };
    const runtime = this.#runtime;
    const tokenArtifact = await this.#readArtifact(
      "contracts/test/MockUSDT.sol/MockUSDT.json",
    );
    const escrowArtifact = await this.#readArtifact(
      "contracts/DeadlineEscrow.sol/DeadlineEscrow.json",
    );
    const token = new Contract(
      runtime.tokenAddress,
      tokenArtifact.abi,
      this.#provider,
    );
    const escrow = new Contract(
      runtime.escrowAddress,
      escrowArtifact.abi,
      this.#provider,
    );
    const visibleWallets = publicRuntimeWallets(runtime);
    const balances = Object.fromEntries(
      await Promise.all(
        visibleWallets.map(async ({ role, address }) => [
          role,
          jsonBigInt(await token.getFunction("balanceOf")(address)),
        ]),
      ),
    );
    balances.ESCROW = jsonBigInt(
      await token.getFunction("balanceOf")(runtime.escrowAddress),
    );

    return {
      initialized: true,
      network: this.#networkInfo(),
      custodyMode: runtime.custodyMode,
      deal: {
        title: `Atlas FC × ${runtime.selectedPlayer.currentClub} — International Registration`,
        playerName: runtime.selectedPlayer.name,
        totalAmountMicroUsdt: jsonBigInt(TOTAL_AMOUNT),
        signingBonusMicroUsdt: jsonBigInt(SIGNING_BONUS),
        milestoneAmountMicroUsdt: jsonBigInt(MILESTONE_AMOUNT),
        authorizationDigest: hashDealAuthorization(runtime.envelope),
        humanApprovalThresholdMicroUsdt: jsonBigInt(HUMAN_APPROVAL_THRESHOLD),
        maximumMandateMicroUsdt: jsonBigInt(BUYER_MAXIMUM),
      },
      authorization: {
        dealId: runtime.envelope.authorization.dealId,
        buyer: runtime.envelope.authorization.buyer,
        seller: runtime.envelope.authorization.seller,
        player: runtime.envelope.authorization.player,
        token: runtime.envelope.authorization.token,
        totalAmount: jsonBigInt(runtime.envelope.authorization.totalAmount),
        signingBonus: jsonBigInt(runtime.envelope.authorization.signingBonus),
        milestoneRoot: runtime.envelope.authorization.milestoneRoot,
        fundingDeadline: jsonBigInt(
          runtime.envelope.authorization.fundingDeadline,
        ),
        settlementDeadline: jsonBigInt(
          runtime.envelope.authorization.settlementDeadline,
        ),
      },
      contracts: {
        token: runtime.tokenAddress,
        escrow: runtime.escrowAddress,
      },
      wallets: visibleWallets,
      players: demoPlayers,
      selectedPlayer: runtime.selectedPlayer,
      offers: runtime.offers,
      signatures: Object.keys(runtime.signatures),
      execution:
        runtime.signatures.BUYER &&
        runtime.signatures.SELLER &&
        runtime.signatures.PLAYER
          ? {
              buyerSignature: runtime.signatures.BUYER,
              sellerSignature: runtime.signatures.SELLER,
              playerSignature: runtime.signatures.PLAYER,
            }
          : undefined,
      humanApproved: Boolean(runtime.humanApprovedDigest),
      transactions: runtime.transactions,
      chainState: {
        funded: await escrow.getFunction("funded")(),
        releasedAmountMicroUsdt: jsonBigInt(
          await escrow.getFunction("releasedAmount")(),
        ),
        balances,
      },
      events,
    };
  }

  async #evaluateBuyer(
    passkey: string,
    envelope: DealAuthorizationEnvelope,
    humanApprovedDigest?: string,
    sign = false,
  ) {
    const runtime = this.#requireRuntime();
    const counterparty = roleAddress(runtime.wallets, "SELLER");
    return this.#vault.withSeed("BUYER", passkey, (seed) =>
      new WdkDealAgent(seed).evaluateAuthorization({
        policy: this.#buyerPolicy(counterparty, runtime.envelope),
        envelope,
        counterparty,
        ...(humanApprovedDigest ? { humanApprovedDigest } : {}),
        sign,
      }),
    );
  }

  #buyerPolicy(
    counterparty: string,
    envelope: DealAuthorizationEnvelope,
  ): AgentPolicy {
    return {
      maxDealMicroUsdt: Number(BUYER_MAXIMUM),
      humanApprovalThresholdMicroUsdt: Number(HUMAN_APPROVAL_THRESHOLD),
      allowedCounterparties: [counterparty],
      expiresAt: new Date(
        Number(envelope.authorization.fundingDeadline) * 1000,
      ).toISOString(),
    };
  }

  #networkInfo(): Record<string, unknown> {
    if (this.config.CHAIN_ID === 84532) {
      return {
        name: "Base Sepolia",
        chainId: 84532,
        rpcUrl: this.config.CHAIN_RPC_URL,
        explorerUrl: "https://sepolia-explorer.base.org",
        publicTestnet: true,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        disclaimer:
          "Public Base Sepolia records. La Forza test USDt is not official Tether.",
      };
    }
    return {
      name: "LaForza Local EVM",
      chainId: this.config.CHAIN_ID,
      rpcUrl: this.config.CHAIN_RPC_URL,
      explorerUrl: null,
      publicTestnet: false,
      nativeCurrency: {
        name: "Test Ether",
        symbol: "ETH",
        decimals: 18,
      },
      disclaimer: "Demo-only test USDt. No real funds or mainnet assets.",
    };
  }

  #partyPolicy(
    counterparty: string,
    envelope: DealAuthorizationEnvelope,
  ): AgentPolicy {
    return {
      maxDealMicroUsdt: Number(BUYER_MAXIMUM),
      humanApprovalThresholdMicroUsdt: Number(BUYER_MAXIMUM),
      allowedCounterparties: [counterparty],
      expiresAt: new Date(
        Number(envelope.authorization.fundingDeadline) * 1000,
      ).toISOString(),
    };
  }

  #buyerApprovalPolicy(runtime: DemoRuntime): Policy {
    return {
      id: "buyer-approval-policy",
      name: "Exact token approval only",
      scope: "project",
      wallet: "evm",
      rules: [
        {
          name: "allow-exact-usdt-approval",
          operation: "approve",
          action: "ALLOW",
          conditions: [
            ({ params }) => {
              const input = params as Record<string, unknown>;
              return (
                String(input.token).toLowerCase() ===
                  runtime.tokenAddress.toLowerCase() &&
                String(input.spender).toLowerCase() ===
                  runtime.escrowAddress.toLowerCase() &&
                BigInt(String(input.amount)) === TOTAL_AMOUNT
              );
            },
          ],
        },
      ],
    };
  }

  #buyerFundingPolicy(runtime: DemoRuntime, fundData: string): Policy {
    return {
      id: "buyer-funding-policy",
      name: "Canonical escrow funding only",
      scope: "project",
      wallet: "evm",
      rules: [
        {
          name: "allow-canonical-fund-call",
          operation: "sendTransaction",
          action: "ALLOW",
          conditions: [
            ({ params }) => {
              const input = params as Record<string, unknown>;
              return (
                String(input.to).toLowerCase() ===
                  runtime.escrowAddress.toLowerCase() &&
                BigInt(String(input.value)) === 0n &&
                input.data === fundData
              );
            },
          ],
        },
      ],
    };
  }

  #verifierExecutionPolicy(runtime: DemoRuntime, data: string): Policy {
    return {
      id: "verifier-execution-policy",
      name: "Verifier can release only the proven milestone",
      scope: "project",
      wallet: "evm",
      rules: [
        {
          name: "allow-exact-milestone-release",
          operation: "sendTransaction",
          action: "ALLOW",
          conditions: [
            ({ params }) => {
              const input = params as Record<string, unknown>;
              return (
                String(input.to).toLowerCase() ===
                  runtime.escrowAddress.toLowerCase() &&
                BigInt(String(input.value)) === 0n &&
                input.data === data
              );
            },
          ],
        },
      ],
    };
  }

  #requireRuntime(): DemoRuntime {
    if (!this.#runtime) throw new Error("Demo is not initialized");
    return this.#runtime;
  }

  #updateAcceptedOffer(
    runtime: DemoRuntime,
    status: DemoOffer["status"],
  ): void {
    const offer = [...runtime.offers]
      .reverse()
      .find(
        ({ amountMicroUsdt }) => amountMicroUsdt === jsonBigInt(TOTAL_AMOUNT),
      );
    if (!offer) throw new Error("Accepted counteroffer was not found");
    offer.status = status;
  }

  async #readArtifact(relativePath: string): Promise<Artifact> {
    const content = await readFile(
      join(this.config.CONTRACT_ARTIFACTS_DIR, relativePath),
      "utf8",
    );
    return JSON.parse(content) as Artifact;
  }

  async #escrowInterface(): Promise<Interface> {
    const artifact = await this.#readArtifact(
      "contracts/DeadlineEscrow.sol/DeadlineEscrow.json",
    );
    return new Interface(artifact.abi);
  }

  async #wait(hash: string): Promise<TransactionReceipt> {
    const receipt = await this.#provider.waitForTransaction(hash);
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction failed: ${hash}`);
    }
    return receipt;
  }
}

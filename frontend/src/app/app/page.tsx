"use client";

import {
  AbiCoder,
  BrowserProvider,
  Contract,
  ContractFactory,
  formatEther,
  getAddress,
  getCreateAddress,
  id,
  Interface,
  keccak256,
  parseEther,
  parseUnits,
  type Eip1193Provider,
  type InterfaceAbi,
} from "ethers";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/backend/api/v1";
const TEST_USDT_UNIT = 1_000_000n;
const TEST_USDT_FAUCET_AMOUNT = 50_000n * TEST_USDT_UNIT;

type Tab = "overview" | "players" | "offers" | "deal" | "ledger" | "about";

type DemoPlayer = {
  id: string;
  name: string;
  initials: string;
  position: string;
  age: number;
  nationality: string;
  currentClub: string;
  overall: number;
  potential: number;
  marketValue: string;
  contractUntil: string;
  appearances: number;
  goals: number;
  assists: number;
  availability: string;
  accent: string;
};

type DemoOffer = {
  id: string;
  direction: "INCOMING" | "OUTGOING";
  from: string;
  to: string;
  amountMicroUsdt: string;
  signingBonusMicroUsdt: string;
  status: string;
  createdAt: string;
  note: string;
};

type DemoEvent = {
  id: string;
  type: string;
  at: string;
  detail: Record<string, unknown>;
};

type MarketplaceCounterparty = {
  id: string;
  name: string;
  role: "CLUB" | "AGENT" | "SCOUT" | "TESTER";
  walletAddress: string;
  createdAt: string;
};

type MarketplaceOffer = {
  id: string;
  playerId: string;
  counterpartyId: string;
  from: string;
  fromWallet: string;
  to: string;
  amountMicroUsdt: string;
  signingBonusMicroUsdt: string;
  note: string;
  status: "RECEIVED";
  createdAt: string;
};

type DemoState = {
  initialized: boolean;
  custodyMode?: "WDK" | "METAMASK";
  network?: {
    name: string;
    chainId: number;
    rpcUrl: string;
    explorerUrl: string | null;
    publicTestnet: boolean;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    disclaimer: string;
  };
  deal?: {
    title: string;
    playerName: string;
    totalAmountMicroUsdt: string;
    signingBonusMicroUsdt: string;
    milestoneAmountMicroUsdt: string;
    authorizationDigest: string;
    humanApprovalThresholdMicroUsdt: string;
    maximumMandateMicroUsdt: string;
  };
  contracts?: { token: string; escrow: string };
  authorization?: {
    dealId: string;
    buyer: string;
    seller: string;
    player: string;
    token: string;
    totalAmount: string;
    signingBonus: string;
    milestoneRoot: string;
    fundingDeadline: string;
    settlementDeadline: string;
  };
  execution?: {
    buyerSignature: string;
    sellerSignature: string;
    playerSignature: string;
  };
  wallets?: Array<{ role: string; address: string }>;
  players?: DemoPlayer[];
  selectedPlayer?: DemoPlayer;
  offers?: DemoOffer[];
  marketplace?: {
    counterparties: MarketplaceCounterparty[];
    offers: MarketplaceOffer[];
  };
  signatures?: string[];
  humanApproved?: boolean;
  transactions?: Record<string, string>;
  chainState?: {
    funded: boolean;
    releasedAmountMicroUsdt: string;
    balances: Record<string, string>;
  };
  events: DemoEvent[];
};

type DeploymentArtifacts = {
  token: {
    abi: InterfaceAbi;
    bytecode: string;
    deployedBytecode: string;
  };
  escrow: {
    abi: InterfaceAbi;
    bytecode: string;
    deployedBytecode: string;
  };
};

type PreparedParticipants = {
  participants: { seller: string; player: string; verifier: string };
  terms: {
    totalAmountMicroUsdt: string;
    signingBonusMicroUsdt: string;
    milestoneAmountMicroUsdt: string;
    milestoneId: string;
  };
};

type InjectedProvider = Eip1193Provider & {
  isMetaMask?: boolean;
  providers?: InjectedProvider[];
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
};

type Eip6963ProviderDetail = {
  info: {
    name: string;
    rdns: string;
  };
  provider: InjectedProvider;
};

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

let cachedMetaMaskProvider: InjectedProvider | undefined;

const legacyMetaMaskProvider = () => {
  if (typeof window === "undefined") return undefined;
  const injected = window.ethereum;
  if (!injected) return undefined;
  const providers = injected.providers ?? [];
  return (
    providers.find((provider) => provider.isMetaMask) ??
    (injected.isMetaMask ? injected : undefined)
  );
};

const resolveMetaMaskProvider = async (): Promise<InjectedProvider> => {
  if (cachedMetaMaskProvider) return cachedMetaMaskProvider;
  if (typeof window === "undefined") {
    throw new Error("MetaMask is only available in the browser");
  }

  const announced = await new Promise<InjectedProvider | undefined>(
    (resolve) => {
      let settled = false;
      let fallback = legacyMetaMaskProvider();
      const finish = (provider?: InjectedProvider) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("eip6963:announceProvider", onAnnounce);
        resolve(provider);
      };
      const onAnnounce = (event: Event) => {
        const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
        if (detail?.info?.rdns === "io.metamask") {
          finish(detail.provider);
        } else if (!fallback && detail?.provider?.isMetaMask) {
          fallback = detail.provider;
        }
      };
      window.addEventListener("eip6963:announceProvider", onAnnounce);
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      window.setTimeout(() => finish(fallback), 300);
    },
  );

  if (!announced) {
    throw new Error(
      "MetaMask was not detected. Unlock MetaMask, disable conflicting wallet extensions for this site, then reload.",
    );
  }
  cachedMetaMaskProvider = announced;
  return announced;
};

const readableWalletError = (error: unknown, fallback: string) => {
  const nested = error as {
    message?: string;
    error?: { message?: string };
    info?: { error?: { message?: string } };
  };
  const message =
    nested?.info?.error?.message ??
    nested?.error?.message ??
    nested?.message ??
    fallback;
  if (message.includes("reading 'length'")) {
    return "MetaMask returned an ambiguous deployment response. The transaction may still have been mined; wait a few seconds and retry so La Forza can recover it from Base Sepolia.";
  }
  return message;
};

const BASE_SEPOLIA_BLOCKSCOUT_API =
  "https://base-sepolia.blockscout.com/api/v2";

type ExplorerCreation = {
  hash: string;
  nonce: number;
  result: string;
  created_contract?: { hash: string } | null;
  from?: { hash: string } | null;
};

type RecoveredDeployment = {
  address: string;
  transactionHash: string;
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const walletErrorMessage = (error: unknown) => {
  const nested = error as {
    message?: string;
    error?: { message?: string };
    info?: { error?: { message?: string } };
  };
  return (
    nested?.info?.error?.message ??
    nested?.error?.message ??
    nested?.message ??
    ""
  );
};

const isAmbiguousDeploymentError = (error: unknown) =>
  walletErrorMessage(error).includes("reading 'length'");

const explorerCreations = async (
  owner: string,
): Promise<ExplorerCreation[]> => {
  try {
    const response = await fetch(
      `${BASE_SEPOLIA_BLOCKSCOUT_API}/addresses/${owner}/transactions`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { items?: ExplorerCreation[] };
    return (body.items ?? []).filter(
      (transaction) =>
        transaction.result === "success" &&
        Boolean(transaction.created_contract?.hash),
    );
  } catch {
    return [];
  }
};

const validateCreation = async (
  provider: BrowserProvider,
  owner: string,
  creation: ExplorerCreation,
): Promise<RecoveredDeployment | undefined> => {
  const contractAddress = creation.created_contract?.hash;
  if (!contractAddress) return undefined;
  const receipt = await provider.getTransactionReceipt(creation.hash);
  if (
    !receipt ||
    receipt.status !== 1 ||
    !receipt.contractAddress ||
    receipt.from.toLowerCase() !== owner.toLowerCase() ||
    receipt.contractAddress.toLowerCase() !== contractAddress.toLowerCase()
  ) {
    return undefined;
  }
  return { address: receipt.contractAddress, transactionHash: receipt.hash };
};

const findExistingTestToken = async (
  provider: BrowserProvider,
  owner: string,
  artifact: DeploymentArtifacts["token"],
): Promise<RecoveredDeployment | undefined> => {
  const expectedRuntimeHash = keccak256(artifact.deployedBytecode);
  for (const creation of await explorerCreations(owner)) {
    const candidate = creation.created_contract?.hash;
    if (!candidate) continue;
    const runtimeCode = await provider.getCode(candidate);
    if (
      runtimeCode === "0x" ||
      keccak256(runtimeCode) !== expectedRuntimeHash
    ) {
      continue;
    }
    const validated = await validateCreation(provider, owner, creation);
    if (validated) return validated;
  }
  return undefined;
};

const findExistingEscrow = async (
  provider: BrowserProvider,
  owner: string,
  artifact: DeploymentArtifacts["escrow"],
  expected: {
    token: string;
    buyer: string;
    seller: string;
    player: string;
    verifier: string;
    totalAmount: bigint;
    signingBonus: bigint;
    milestoneRoot: string;
    now: number;
  },
): Promise<RecoveredDeployment | undefined> => {
  for (const creation of await explorerCreations(owner)) {
    const candidate = creation.created_contract?.hash;
    if (
      !candidate ||
      candidate.toLowerCase() === expected.token.toLowerCase()
    ) {
      continue;
    }
    try {
      const escrow = new Contract(candidate, artifact.abi, provider);
      const [
        token,
        buyer,
        seller,
        player,
        verifier,
        totalAmount,
        signingBonus,
        milestoneRoot,
        fundingDeadline,
        funded,
        signatureSchemeVersion,
      ] = await Promise.all([
        escrow.getFunction("token")(),
        escrow.getFunction("buyer")(),
        escrow.getFunction("seller")(),
        escrow.getFunction("player")(),
        escrow.getFunction("verifier")(),
        escrow.getFunction("totalAmount")(),
        escrow.getFunction("signingBonus")(),
        escrow.getFunction("milestoneRoot")(),
        escrow.getFunction("fundingDeadline")(),
        escrow.getFunction("funded")(),
        escrow.getFunction("SIGNATURE_SCHEME_VERSION")(),
      ]);
      const matches =
        String(token).toLowerCase() === expected.token.toLowerCase() &&
        String(buyer).toLowerCase() === expected.buyer.toLowerCase() &&
        String(seller).toLowerCase() === expected.seller.toLowerCase() &&
        String(player).toLowerCase() === expected.player.toLowerCase() &&
        String(verifier).toLowerCase() === expected.verifier.toLowerCase() &&
        BigInt(totalAmount) === expected.totalAmount &&
        BigInt(signingBonus) === expected.signingBonus &&
        String(milestoneRoot) === expected.milestoneRoot &&
        BigInt(fundingDeadline) > BigInt(expected.now) &&
        BigInt(signatureSchemeVersion) === 2n &&
        funded === false;
      if (!matches) continue;
      const validated = await validateCreation(provider, owner, creation);
      if (validated) return validated;
    } catch {
      // Other contracts created by this wallet are not La Forza escrows.
    }
  }
  return undefined;
};

const recoverExpectedCreation = async (
  provider: BrowserProvider,
  owner: string,
  expectedAddress: string,
): Promise<RecoveredDeployment | undefined> => {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if ((await provider.getCode(expectedAddress)) !== "0x") {
      for (
        let explorerAttempt = 0;
        explorerAttempt < 12;
        explorerAttempt += 1
      ) {
        const creation = (await explorerCreations(owner)).find(
          (transaction) =>
            transaction.created_contract?.hash.toLowerCase() ===
            expectedAddress.toLowerCase(),
        );
        if (creation) {
          const validated = await validateCreation(provider, owner, creation);
          if (validated) return validated;
        }
        await wait(1_000);
      }
      return undefined;
    }
    await wait(1_000);
  }
  return undefined;
};

const deployRecoverably = async (
  provider: BrowserProvider,
  owner: string,
  factory: ContractFactory,
  args: readonly unknown[],
): Promise<RecoveredDeployment> => {
  const nonce = await provider.getTransactionCount(owner, "pending");
  const expectedAddress = getCreateAddress({ from: owner, nonce });
  try {
    const contract = await factory.deploy(...args);
    const transaction = contract.deploymentTransaction();
    if (!transaction) throw new Error("Contract deployment was not sent");
    await contract.waitForDeployment();
    return {
      address: await contract.getAddress(),
      transactionHash: transaction.hash,
    };
  } catch (error) {
    if (!isAmbiguousDeploymentError(error)) throw error;
    const recovered = await recoverExpectedCreation(
      provider,
      owner,
      expectedAddress,
    );
    if (recovered) return recovered;
    throw error;
  }
};

const LOCAL_CHAIN = {
  chainId: 31337,
  chainHex: "0x7a69",
  name: "LaForza Local EVM",
  rpcUrl: "http://127.0.0.1:8545",
  explorerUrl: null,
  publicTestnet: false,
  nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
};

const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address account, uint256 amount)",
] as const;

const escrowAbi = [
  "function fund(bytes buyerSignature, bytes sellerSignature, bytes playerSignature)",
  "function funded() view returns (bool)",
  "function buyer() view returns (address)",
  "function fundingDeadline() view returns (uint64)",
  "function totalAmount() view returns (uint256)",
  "function SIGNATURE_SCHEME_VERSION() view returns (uint8)",
  "error AlreadyFunded()",
  "error DealExpired()",
  "error InvalidSignature(address expectedSigner)",
  "error NotBuyer()",
] as const;

const fundingRevertMessage = (error: unknown): string | undefined => {
  const nested = error as {
    data?: string;
    error?: { data?: string };
    info?: { error?: { data?: string | { data?: string } } };
  };
  const infoData = nested.info?.error?.data;
  const data =
    nested.data ??
    nested.error?.data ??
    (typeof infoData === "string" ? infoData : infoData?.data);
  if (!data) return undefined;
  try {
    const parsed = new Interface(escrowAbi).parseError(data);
    if (!parsed) return undefined;
    if (parsed.name === "AlreadyFunded") return "This escrow is already funded";
    if (parsed.name === "DealExpired") {
      return "The funding deadline expired. Start a new deal to create a fresh escrow";
    }
    if (parsed.name === "NotBuyer") {
      return "Only the MetaMask buyer that deployed this escrow can fund it";
    }
    if (parsed.name === "InvalidSignature") {
      return `The escrow rejected the authorization signature for ${String(parsed.args[0])}`;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

type ActionDefinition = {
  id: string;
  index: string;
  title: string;
  detail: string;
  endpoint: string;
  event: string;
  tone?: "danger" | "success";
  enabled: (state: DemoState) => boolean;
};

const tabs: Array<{ id: Tab; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "Command centre" },
  { id: "players", label: "Players", hint: "Scout & select" },
  { id: "offers", label: "Offers", hint: "Inbox & outbox" },
  { id: "deal", label: "Deal room", hint: "Execute terms" },
  { id: "ledger", label: "Ledger", hint: "Proof & payments" },
  { id: "about", label: "About", hint: "Purpose & stack" },
];

const actionDefinitions: ActionDefinition[] = [
  {
    id: "over-budget",
    index: "01",
    title: "Try 1,100 USD₮",
    detail: "Prove the club mandate blocks an oversized offer before signing.",
    endpoint: "attempt-over-budget",
    event: "POLICY_DENIED_OVER_BUDGET",
    tone: "danger",
    enabled: (state) => state.initialized,
  },
  {
    id: "review",
    index: "02",
    title: "Counter at 900 USD₮",
    detail: "Create a valid counter that crosses the human approval threshold.",
    endpoint: "review-counter",
    event: "HUMAN_APPROVAL_REQUIRED",
    enabled: (state) => hasEvent(state, "POLICY_DENIED_OVER_BUDGET"),
  },
  {
    id: "approve",
    index: "03",
    title: "Director approves",
    detail: "Approve this exact digest from the connected MetaMask buyer.",
    endpoint: "approve",
    event: "BUYER_AUTHORIZATION_SIGNED",
    enabled: (state) => hasEvent(state, "HUMAN_APPROVAL_REQUIRED"),
  },
  {
    id: "seller",
    index: "04",
    title: "Seller signs",
    detail: "The current club signs the same canonical EIP-712 terms.",
    endpoint: "sign/seller",
    event: "SELLER_AUTHORIZATION_SIGNED",
    enabled: (state) => state.signatures?.includes("BUYER") ?? false,
  },
  {
    id: "player",
    index: "05",
    title: "Player signs",
    detail: "The selected player completes the required signer set.",
    endpoint: "sign/player",
    event: "PLAYER_AUTHORIZATION_SIGNED",
    enabled: (state) => state.signatures?.includes("SELLER") ?? false,
  },
  {
    id: "fund",
    index: "06",
    title: "Fund escrow",
    detail: "MetaMask approves test USD₮, funds escrow, and pays the bonus.",
    endpoint: "fund",
    event: "ESCROW_FUNDED",
    tone: "success",
    enabled: (state) => (state.signatures?.length ?? 0) === 3,
  },
  {
    id: "release",
    index: "07",
    title: "Verify appearance",
    detail: "The verifier releases 650 test USD₮ against evidence.",
    endpoint: "release",
    event: "MILESTONE_RELEASED",
    tone: "success",
    enabled: (state) => state.chainState?.funded ?? false,
  },
];

function hasEvent(state: DemoState, event: string): boolean {
  return state.events.some(({ type }) => type === event);
}

function shortHex(value?: string, leading = 8): string {
  if (!value) return "—";
  return `${value.slice(0, leading)}…${value.slice(-6)}`;
}

function usdt(value?: string): string {
  if (!value) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Number(BigInt(value)) / 1_000_000,
  );
}

function words(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function explorerHref(
  explorerUrl: string | null | undefined,
  kind: "address" | "tx",
  value: string | undefined,
): string | undefined {
  if (!explorerUrl || !value) return undefined;
  return `${explorerUrl}/${kind}/${value}`;
}

type CounterpartyRegistrationRequest = {
  requestId: string;
  name: string;
  role: MarketplaceCounterparty["role"];
  walletAddress: string;
  createdAt: string;
};

type MarketplaceOfferRequest = {
  requestId: string;
  counterpartyId: string;
  playerId: string;
  walletAddress: string;
  amountMicroUsdt: string;
  signingBonusMicroUsdt: string;
  note: string;
  createdAt: string;
};

const counterpartyRegistrationMessage = (
  input: CounterpartyRegistrationRequest,
) =>
  JSON.stringify({
    domain: "laforza.marketplace",
    action: "REGISTER_COUNTERPARTY",
    ...input,
  });

const marketplaceOfferMessage = (input: MarketplaceOfferRequest) =>
  JSON.stringify({
    domain: "laforza.marketplace",
    action: "SUBMIT_OFFER",
    ...input,
  });

export default function HomePage() {
  const [state, setState] = useState<DemoState>({
    initialized: false,
    events: [],
    offers: [],
  });
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedPlayerId, setSelectedPlayerId] = useState("mert-kaya");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletEth, setWalletEth] = useState("0");
  const [walletUsdt, setWalletUsdt] = useState("0");

  const loadState = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/demo/state`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Backend state is unavailable");
      const nextState = (await response.json()) as DemoState;
      setState(nextState);
      if (nextState.selectedPlayer)
        setSelectedPlayerId(nextState.selectedPlayer.id);
      else if (nextState.players?.[0])
        setSelectedPlayerId(nextState.players[0].id);
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const refreshWallet = useCallback(
    async (address: string, nextState: DemoState = state) => {
      const injected = await resolveMetaMaskProvider();
      const provider = new BrowserProvider(injected);
      const [balance, network] = await Promise.all([
        provider.getBalance(address),
        provider.getNetwork(),
      ]);
      setWalletEth(Number(formatEther(balance)).toFixed(3));
      setWalletChainId(Number(network.chainId));
      if (nextState.contracts?.token) {
        const token = new Contract(
          nextState.contracts.token,
          erc20Abi,
          provider,
        );
        const tokenBalance = (await token.getFunction("balanceOf")(
          address,
        )) as bigint;
        setWalletUsdt(usdt(tokenBalance.toString()));
      } else {
        setWalletUsdt("0");
      }
    },
    [state],
  );

  const switchToDemoNetwork = useCallback(async () => {
    const injected = await resolveMetaMaskProvider();
    const network = state.network ?? LOCAL_CHAIN;
    const chainHex = `0x${network.chainId.toString(16)}`;
    try {
      await injected.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainHex }],
      });
    } catch (switchError) {
      if ((switchError as { code?: number }).code !== 4902) throw switchError;
      await injected.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainHex,
            chainName: network.name,
            rpcUrls: [network.rpcUrl],
            nativeCurrency: network.nativeCurrency,
            ...(network.explorerUrl
              ? { blockExplorerUrls: [network.explorerUrl] }
              : {}),
          },
        ],
      });
    }
    setWalletChainId(network.chainId);
  }, [state.network]);

  const connectWallet = useCallback(async (): Promise<string | undefined> => {
    setBusy("wallet-connect");
    setError(null);
    try {
      const injected = await resolveMetaMaskProvider();
      await switchToDemoNetwork();
      const accounts = (await injected.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("MetaMask did not return an account");
      setWalletAddress(address);
      await refreshWallet(address);
      return address;
    } catch (walletError) {
      setError(readableWalletError(walletError, "MetaMask connection failed"));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [refreshWallet, switchToDemoNetwork]);

  useEffect(() => {
    let injected: InjectedProvider | undefined;
    let cancelled = false;
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      const address = accounts?.[0] ?? null;
      setWalletAddress(address);
      if (address) void refreshWallet(address);
      else {
        setWalletEth("0");
        setWalletUsdt("0");
      }
    };
    const onChainChanged = (...args: unknown[]) => {
      const chainId = args[0];
      if (typeof chainId === "string") setWalletChainId(Number(chainId));
    };
    void resolveMetaMaskProvider()
      .then((provider) => {
        if (cancelled) return;
        injected = provider;
        injected.on?.("accountsChanged", onAccountsChanged);
        injected.on?.("chainChanged", onChainChanged);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      injected?.removeListener?.("accountsChanged", onAccountsChanged);
      injected?.removeListener?.("chainChanged", onChainChanged);
    };
  }, [refreshWallet]);

  const runAction = async (
    endpoint: string,
    id: string,
    extra: Record<string, unknown> = {},
  ) => {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/demo/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(extra),
      });
      const result = (await response.json()) as DemoState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Action failed");
      setState(result);
      setBackendOnline(true);
      if (result.selectedPlayer) setSelectedPlayerId(result.selectedPlayer.id);
      return result;
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Action failed",
      );
    } finally {
      setBusy(null);
    }
  };

  const registerCounterparty = async (input: {
    name: string;
    role: MarketplaceCounterparty["role"];
    walletAddress: string;
  }) => {
    const connectedAddress = walletAddress ?? (await connectWallet());
    if (!connectedAddress) return;
    setBusy("counterparty-register");
    setError(null);
    try {
      if (getAddress(input.walletAddress) !== getAddress(connectedAddress)) {
        throw new Error(
          "Switch MetaMask to the wallet entered in the form before registering it.",
        );
      }
      await switchToDemoNetwork();
      const provider = new BrowserProvider(await resolveMetaMaskProvider());
      const signer = await provider.getSigner();
      const request: CounterpartyRegistrationRequest = {
        requestId: crypto.randomUUID(),
        name: input.name.trim(),
        role: input.role,
        walletAddress: input.walletAddress,
        createdAt: new Date().toISOString(),
      };
      const signature = await signer.signMessage(
        counterpartyRegistrationMessage(request),
      );
      const response = await fetch(
        `${API_BASE}/demo/marketplace/counterparties`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...request, signature }),
        },
      );
      const result = (await response.json()) as DemoState & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Counterparty registration failed");
      }
      setState(result);
      setBackendOnline(true);
    } catch (registrationError) {
      setError(
        readableWalletError(
          registrationError,
          "Counterparty registration failed",
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const submitMarketplaceOffer = async (input: {
    counterpartyId: string;
    playerId: string;
    amountUsdt: string;
    signingBonusUsdt: string;
    note: string;
  }) => {
    const connectedAddress = walletAddress ?? (await connectWallet());
    if (!connectedAddress) return;
    setBusy("marketplace-offer");
    setError(null);
    try {
      const profile = state.marketplace?.counterparties.find(
        ({ id }) => id === input.counterpartyId,
      );
      if (!profile) throw new Error("Register a wallet profile first");
      if (getAddress(profile.walletAddress) !== getAddress(connectedAddress)) {
        throw new Error(
          "Switch MetaMask to the wallet that owns this counterparty profile.",
        );
      }
      await switchToDemoNetwork();
      const request: MarketplaceOfferRequest = {
        requestId: crypto.randomUUID(),
        counterpartyId: profile.id,
        playerId: input.playerId,
        walletAddress: profile.walletAddress,
        amountMicroUsdt: parseUnits(input.amountUsdt, 6).toString(),
        signingBonusMicroUsdt: parseUnits(
          input.signingBonusUsdt || "0",
          6,
        ).toString(),
        note: input.note.trim(),
        createdAt: new Date().toISOString(),
      };
      const provider = new BrowserProvider(await resolveMetaMaskProvider());
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(
        marketplaceOfferMessage(request),
      );
      const response = await fetch(`${API_BASE}/demo/marketplace/offers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, signature }),
      });
      const result = (await response.json()) as DemoState & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Offer submission failed");
      }
      setState(result);
      setBackendOnline(true);
    } catch (offerError) {
      setError(readableWalletError(offerError, "Offer submission failed"));
    } finally {
      setBusy(null);
    }
  };

  const deployPublicTestnetDeal = async (address: string) => {
    if (!state.network?.publicTestnet) {
      throw new Error("Public testnet mode is not active");
    }
    setBusy("public-deploy");
    setError(null);
    try {
      await switchToDemoNetwork();
      const injected = await resolveMetaMaskProvider();
      const provider = new BrowserProvider(injected);
      const signer = await provider.getSigner();
      const balance = await provider.getBalance(address);
      if (balance === 0n) {
        throw new Error(
          "Base Sepolia ETH is required for deployment. Fund this address from a Base Sepolia faucet first.",
        );
      }

      const [participantsResponse, artifactsResponse] = await Promise.all([
        fetch(`${API_BASE}/demo/participants`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playerId: selectedPlayerId,
            buyerAddress: address,
          }),
        }),
        fetch(`${API_BASE}/demo/artifacts`, { cache: "no-store" }),
      ]);
      const participants = (await participantsResponse.json()) as
        PreparedParticipants | { error?: string };
      const artifacts = (await artifactsResponse.json()) as
        DeploymentArtifacts | { error?: string };
      if (!participantsResponse.ok) {
        throw new Error(
          "error" in participants
            ? (participants.error ?? "Participant preparation failed")
            : "Participant preparation failed",
        );
      }
      if (!artifactsResponse.ok || !("token" in artifacts)) {
        throw new Error("Contract artifacts are unavailable");
      }
      const prepared = participants as PreparedParticipants;

      const tokenFactory = new ContractFactory(
        artifacts.token.abi,
        artifacts.token.bytecode,
        signer,
      );
      const tokenDeployment =
        (await findExistingTestToken(provider, address, artifacts.token)) ??
        (await deployRecoverably(provider, address, tokenFactory, []));
      const tokenAddress = tokenDeployment.address;
      const token = new Contract(tokenAddress, artifacts.token.abi, signer);

      const latestBlock = await provider.getBlock("latest");
      if (!latestBlock) throw new Error("Could not read the testnet clock");
      const fundingDeadline = BigInt(latestBlock.timestamp + 7 * 24 * 60 * 60);
      const settlementDeadline = BigInt(
        latestBlock.timestamp + 30 * 24 * 60 * 60,
      );
      const milestone = {
        id: prepared.terms.milestoneId,
        threshold: 1n,
        amount: BigInt(prepared.terms.milestoneAmountMicroUsdt),
        beneficiary: prepared.participants.seller,
      };
      const milestoneRoot = keccak256(
        AbiCoder.defaultAbiCoder().encode(
          [
            "tuple(bytes32 id,uint64 threshold,uint128 amount,address beneficiary)[]",
          ],
          [[milestone]],
        ),
      );
      const dealId = id(
        `laforza-${selectedPlayerId}-${address}-${latestBlock.timestamp}`,
      );
      const escrowFactory = new ContractFactory(
        artifacts.escrow.abi,
        artifacts.escrow.bytecode,
        signer,
      );
      const escrowArguments = [
        tokenAddress,
        address,
        prepared.participants.seller,
        prepared.participants.player,
        prepared.participants.verifier,
        dealId,
        BigInt(prepared.terms.totalAmountMicroUsdt),
        BigInt(prepared.terms.signingBonusMicroUsdt),
        fundingDeadline,
        settlementDeadline,
        [milestone],
      ] as const;
      const escrowDeployment =
        (await findExistingEscrow(provider, address, artifacts.escrow, {
          token: tokenAddress,
          buyer: address,
          seller: prepared.participants.seller,
          player: prepared.participants.player,
          verifier: prepared.participants.verifier,
          totalAmount: BigInt(prepared.terms.totalAmountMicroUsdt),
          signingBonus: BigInt(prepared.terms.signingBonusMicroUsdt),
          milestoneRoot,
          now: latestBlock.timestamp,
        })) ??
        (await deployRecoverably(
          provider,
          address,
          escrowFactory,
          escrowArguments,
        ));
      const escrowAddress = escrowDeployment.address;

      let verifierFundingTxHash: string | undefined;
      const verifierBalance = await provider.getBalance(
        prepared.participants.verifier,
      );
      if (verifierBalance < parseEther("0.00005")) {
        const verifierFunding = await signer.sendTransaction({
          to: prepared.participants.verifier,
          value: parseEther("0.0001"),
        });
        await verifierFunding.wait();
        verifierFundingTxHash = verifierFunding.hash;
      }

      let mintTxHash: string | undefined;
      const buyerTokenBalance = (await token.getFunction("balanceOf")(
        address,
      )) as bigint;
      if (buyerTokenBalance < TEST_USDT_FAUCET_AMOUNT) {
        const mint = await token.getFunction("mint")(
          address,
          TEST_USDT_FAUCET_AMOUNT,
        );
        await mint.wait();
        mintTxHash = mint.hash;
      }

      const response = await fetch(`${API_BASE}/demo/adopt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: selectedPlayerId,
          buyerAddress: address,
          tokenAddress,
          escrowAddress,
          tokenDeployTxHash: tokenDeployment.transactionHash,
          escrowDeployTxHash: escrowDeployment.transactionHash,
          ...(verifierFundingTxHash ? { verifierFundingTxHash } : {}),
          ...(mintTxHash ? { mintTxHash } : {}),
        }),
      });
      const result = (await response.json()) as DemoState & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Testnet deployment validation failed");
      }
      setState(result);
      setBackendOnline(true);
      await refreshWallet(address, result);
    } catch (deploymentError) {
      setError(
        readableWalletError(
          deploymentError,
          "Public testnet deployment failed",
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const startMetamaskDeal = async () => {
    const address = walletAddress ?? (await connectWallet());
    if (!address) return;
    await switchToDemoNetwork();
    if (state.network?.publicTestnet) {
      await deployPublicTestnetDeal(address);
      return;
    }
    const result = await runAction("bootstrap", "bootstrap", {
      playerId: selectedPlayerId,
      buyerAddress: address,
    });
    if (result) await refreshWallet(address, result);
  };

  const signBuyerWithMetamask = async () => {
    if (!state.authorization || !state.contracts || !state.network) {
      setError("Deploy the MetaMask deal first");
      return;
    }
    setBusy("approve");
    setError(null);
    try {
      await switchToDemoNetwork();
      const injected = await resolveMetaMaskProvider();
      const provider = new BrowserProvider(injected);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      if (
        signerAddress.toLowerCase() !== state.authorization.buyer.toLowerCase()
      ) {
        throw new Error(
          "Switch MetaMask to the buyer account used for this deal",
        );
      }
      const signature = await signer.signTypedData(
        {
          name: "LaForza Deadline",
          version: "1",
          chainId: state.network.chainId,
          verifyingContract: state.contracts.escrow,
        },
        {
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
        },
        state.authorization,
      );
      const response = await fetch(`${API_BASE}/demo/approve/metamask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signature }),
      });
      const result = (await response.json()) as DemoState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Signature rejected");
      setState(result);
      await refreshWallet(signerAddress, result);
    } catch (signatureError) {
      setError(
        readableWalletError(signatureError, "MetaMask signature failed"),
      );
    } finally {
      setBusy(null);
    }
  };

  const fundWithMetamask = async () => {
    if (!state.contracts || !state.execution || !state.deal) {
      setError("All three signatures are required before funding");
      return;
    }
    setBusy("fund");
    setError(null);
    try {
      await switchToDemoNetwork();
      const injected = await resolveMetaMaskProvider();
      const provider = new BrowserProvider(injected);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      if (
        state.authorization &&
        signerAddress.toLowerCase() !== state.authorization.buyer.toLowerCase()
      ) {
        throw new Error(
          "Switch MetaMask to the buyer account used for this deal",
        );
      }
      const token = new Contract(state.contracts.token, erc20Abi, signer);
      const escrow = new Contract(state.contracts.escrow, escrowAbi, signer);
      const requiredAmount = BigInt(state.deal.totalAmountMicroUsdt);
      const latestBlock = await provider.getBlock("latest");
      if (!latestBlock)
        throw new Error("Could not read the Base Sepolia clock");
      let signatureVersion: bigint;
      try {
        signatureVersion = (await escrow.getFunction(
          "SIGNATURE_SCHEME_VERSION",
        )()) as bigint;
      } catch {
        throw new Error(
          "This escrow was created before MetaMask EIP-7702 support. Open Players and start the deal again once; La Forza will deploy the corrected escrow.",
        );
      }
      const [alreadyFunded, contractBuyer, fundingDeadline] = await Promise.all(
        [
          escrow.getFunction("funded")() as Promise<boolean>,
          escrow.getFunction("buyer")() as Promise<string>,
          escrow.getFunction("fundingDeadline")() as Promise<bigint>,
        ],
      );
      if (BigInt(signatureVersion) !== 2n) {
        throw new Error(
          "This escrow was created before MetaMask EIP-7702 support. Start a new deal once; La Forza will deploy the corrected escrow.",
        );
      }
      if (contractBuyer.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(
          "Only the MetaMask buyer that created this deal can fund it",
        );
      }

      const recordFunding = async (
        approvalTxHash?: string,
        fundingTxHash?: string,
      ) => {
        const response = await fetch(`${API_BASE}/demo/fund/metamask`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(approvalTxHash ? { approvalTxHash } : {}),
            ...(fundingTxHash ? { fundingTxHash } : {}),
          }),
        });
        const result = (await response.json()) as DemoState & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error ?? "Funding proof rejected");
        }
        setState(result);
        await refreshWallet(signerAddress, result);
      };

      if (alreadyFunded) {
        await recordFunding();
        return;
      }
      if (BigInt(latestBlock.timestamp) > BigInt(fundingDeadline)) {
        throw new Error(
          "The funding deadline expired. Start a new deal to create a fresh escrow.",
        );
      }

      const [buyerBalance, currentAllowance] = (await Promise.all([
        token.getFunction("balanceOf")(signerAddress),
        token.getFunction("allowance")(signerAddress, state.contracts.escrow),
      ])) as [bigint, bigint];
      if (buyerBalance < requiredAmount) {
        throw new Error(
          `Insufficient test USD₮. This deal needs ${usdt(requiredAmount.toString())}; use the 50,000 test USD₮ faucet first.`,
        );
      }

      let approvalTxHash: string | undefined;
      if (currentAllowance < requiredAmount) {
        const approval = await token.getFunction("approve")(
          state.contracts.escrow,
          requiredAmount,
        );
        const approvalReceipt = await approval.wait();
        if (!approvalReceipt) throw new Error("Token approval was not mined");
        approvalTxHash = approval.hash;
      }

      const fundingArguments = [
        state.execution.buyerSignature,
        state.execution.sellerSignature,
        state.execution.playerSignature,
      ] as const;
      try {
        await escrow.getFunction("fund").staticCall(...fundingArguments);
      } catch (preflightError) {
        throw new Error(
          fundingRevertMessage(preflightError) ??
            readableWalletError(
              preflightError,
              "Escrow funding preflight failed",
            ),
        );
      }

      try {
        const funding = await escrow.getFunction("fund")(...fundingArguments, {
          gasLimit: 650_000n,
        });
        const fundingReceipt = await funding.wait();
        if (!fundingReceipt) throw new Error("Escrow funding was not mined");
        await recordFunding(approvalTxHash, funding.hash);
      } catch (broadcastError) {
        await wait(2_500);
        if ((await escrow.getFunction("funded")()) === true) {
          await recordFunding(approvalTxHash);
          return;
        }
        throw broadcastError;
      }
    } catch (fundingError) {
      setError(
        fundingRevertMessage(fundingError) ??
          readableWalletError(fundingError, "MetaMask funding failed"),
      );
    } finally {
      setBusy(null);
    }
  };

  const mintTestUsdt = async () => {
    if (!state.contracts?.token || !walletAddress) {
      setError("Connect MetaMask and deploy a deal before using the faucet");
      return;
    }
    setBusy("faucet");
    setError(null);
    try {
      await switchToDemoNetwork();
      const injected = await resolveMetaMaskProvider();
      const provider = new BrowserProvider(injected);
      const signer = await provider.getSigner();
      const token = new Contract(state.contracts.token, erc20Abi, signer);
      const transaction = await token.getFunction("mint")(
        walletAddress,
        TEST_USDT_FAUCET_AMOUNT,
      );
      await transaction.wait();
      await refreshWallet(walletAddress);
      await loadState();
    } catch (faucetError) {
      setError(readableWalletError(faucetError, "Test USDt faucet failed"));
    } finally {
      setBusy(null);
    }
  };

  const addTestUsdtToMetaMask = async () => {
    if (!state.contracts?.token) {
      setError("Deploy a deal before adding its test token to MetaMask");
      return;
    }
    setBusy("token-import");
    setError(null);
    try {
      await switchToDemoNetwork();
      const injected = await resolveMetaMaskProvider();
      const accepted = await injected.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: state.contracts.token,
            symbol: "USDT",
            decimals: 6,
          },
        },
      });
      if (accepted === false) {
        throw new Error("MetaMask token import was cancelled");
      }
    } catch (tokenImportError) {
      setError(
        readableWalletError(tokenImportError, "MetaMask token import failed"),
      );
    } finally {
      setBusy(null);
    }
  };

  const goTo = (tab: Tab) => {
    setActiveTab(tab);
    window.setTimeout(
      () =>
        document
          .querySelector("#workspace")
          ?.scrollIntoView({ behavior: "smooth" }),
      0,
    );
  };

  const completed = useMemo(
    () =>
      actionDefinitions.filter(({ event }) => hasEvent(state, event)).length,
    [state],
  );
  const selectedPlayer =
    state.players?.find(({ id }) => id === selectedPlayerId) ??
    state.players?.[0];
  const latestOffer = state.offers?.at(-1);

  return (
    <main className="app-page">
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="brand-logo-mark">
            <Image
              alt="La Forza emblem"
              height={96}
              src="/images/laforza-logo-transparent.png"
              width={137}
            />
          </span>
          <span>LA FORZA</span>
        </Link>
        <div className="nav-links">
          <button onClick={() => goTo("players")}>Players</button>
          <button onClick={() => goTo("offers")}>Offers</button>
          <button onClick={() => goTo("deal")}>Deal room</button>
          <button onClick={() => goTo("ledger")}>Ledger</button>
        </div>
        <button
          className={`nav-wallet ${walletAddress ? "connected" : ""}`}
          onClick={() => void connectWallet()}
        >
          <span className={walletAddress ? "live-dot" : "live-dot offline"} />
          {busy === "wallet-connect"
            ? "CONNECTING…"
            : walletAddress
              ? shortHex(walletAddress, 6)
              : "CONNECT METAMASK"}
        </button>
      </nav>

      <section className="workspace" id="workspace">
        <aside className="workspace-tabs" aria-label="Application sections">
          <div className="workspace-title">
            <Image
              alt="La Forza — Deals. Trust. Future."
              className="desk-brand-logo"
              height={180}
              priority
              src="/images/laforza-logo-transparent.png"
              width={257}
            />
            <span>LF / OPS</span>
            <strong>Transfer desk</strong>
          </div>
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              <small>{tab.hint}</small>
            </button>
          ))}
          <div className="workspace-health">
            <span>DEAL STATUS</span>
            <strong>
              {!state.initialized
                ? "NO ACTIVE DEAL"
                : (latestOffer?.status.replaceAll("_", " ") ?? "DEPLOYED")}
            </strong>
          </div>
        </aside>

        <div className="workspace-panel">
          <WalletDock
            address={walletAddress}
            chainId={walletChainId}
            expectedChainId={state.network?.chainId ?? LOCAL_CHAIN.chainId}
            networkName={state.network?.name ?? LOCAL_CHAIN.name}
            publicTestnet={state.network?.publicTestnet ?? false}
            explorerUrl={state.network?.explorerUrl}
            eth={walletEth}
            usdtBalance={walletUsdt}
            tokenAddress={state.contracts?.token}
            dealBuyer={state.authorization?.buyer}
            busy={busy}
            backendOnline={backendOnline}
            onConnect={() => void connectWallet()}
            onSwitch={() => void switchToDemoNetwork()}
            onFaucet={() => void mintTestUsdt()}
            onImportToken={() => void addTestUsdtToMetaMask()}
            onOpenPlayers={() => goTo("players")}
          />
          {activeTab === "overview" && (
            <Overview state={state} completed={completed} onNavigate={goTo} />
          )}

          {activeTab === "players" && (
            <PlayersPanel
              players={state.players ?? []}
              selectedPlayerId={selectedPlayerId}
              activePlayerId={
                walletAddress &&
                state.authorization?.buyer.toLowerCase() ===
                  walletAddress.toLowerCase()
                  ? state.selectedPlayer?.id
                  : undefined
              }
              busy={busy}
              backendOnline={backendOnline}
              walletConnected={Boolean(walletAddress)}
              onSelect={setSelectedPlayerId}
              onStart={() => void startMetamaskDeal()}
              onOpenDeal={() => goTo("deal")}
            />
          )}

          {activeTab === "offers" && (
            <OffersPanel
              offers={state.offers ?? []}
              marketplace={state.marketplace}
              players={state.players ?? []}
              player={selectedPlayer}
              walletAddress={walletAddress}
              busy={busy}
              onConnect={() => void connectWallet()}
              onRegister={(input) => void registerCounterparty(input)}
              onSubmitOffer={(input) => void submitMarketplaceOffer(input)}
              onReviewPlayer={(playerId) => {
                setSelectedPlayerId(playerId);
                goTo("players");
              }}
              onNavigate={goTo}
            />
          )}

          {activeTab === "deal" && (
            <DealPanel
              state={state}
              selectedPlayer={selectedPlayer}
              busy={busy}
              completed={completed}
              backendOnline={backendOnline}
              onStart={() => void startMetamaskDeal()}
              onAction={(action) => {
                if (
                  action.id === "approve" &&
                  state.custodyMode === "METAMASK"
                ) {
                  void signBuyerWithMetamask();
                } else if (
                  action.id === "fund" &&
                  state.custodyMode === "METAMASK"
                ) {
                  void fundWithMetamask();
                } else {
                  void runAction(action.endpoint, action.id);
                }
              }}
            />
          )}

          {activeTab === "ledger" && (
            <LedgerPanel state={state} onRefresh={loadState} />
          )}
          {activeTab === "about" && <AboutPanel />}

          {error ? <div className="error-banner">! {error}</div> : null}
        </div>
      </section>

      <footer>
        <span>LA FORZA / TETHER DEVELOPERS CUP</span>
        <span>
          {state.network?.publicTestnet
            ? "BASE SEPOLIA RECORDS · DEMO USD₮ · NO REAL VALUE"
            : "LOCAL TEST ASSETS ONLY · NO REAL FUNDS"}
        </span>
      </footer>
    </main>
  );
}

function WalletDock(props: {
  address: string | null;
  chainId: number | null;
  expectedChainId: number;
  networkName: string;
  publicTestnet: boolean;
  explorerUrl: string | null | undefined;
  eth: string;
  usdtBalance: string;
  tokenAddress: string | undefined;
  dealBuyer: string | undefined;
  busy: string | null;
  backendOnline: boolean | null;
  onConnect: () => void;
  onSwitch: () => void;
  onFaucet: () => void;
  onImportToken: () => void;
  onOpenPlayers: () => void;
}) {
  const correctNetwork = props.chainId === props.expectedChainId;
  const correctBuyer =
    !props.address ||
    !props.dealBuyer ||
    props.address.toLowerCase() === props.dealBuyer.toLowerCase();
  return (
    <section className="wallet-dock" aria-label="Connected EVM wallet">
      <div className="wallet-dock-title">
        <span className="section-label">SELF-CUSTODY SESSION</span>
        <strong>
          {props.address ? "MetaMask connected" : "Connect a real EVM wallet"}
        </strong>
        <small>
          {props.address ? (
            explorerHref(props.explorerUrl, "address", props.address) ? (
              <a
                href={explorerHref(props.explorerUrl, "address", props.address)}
                rel="noreferrer"
                target="_blank"
              >
                {shortHex(props.address, 10)} ↗
              </a>
            ) : (
              shortHex(props.address, 10)
            )
          ) : (
            "Your account will be written into the escrow as the buyer."
          )}
        </small>
      </div>
      <div className="wallet-stat">
        <span>NETWORK</span>
        <strong className={correctNetwork ? "ok" : "warn"}>
          {props.chainId ? props.networkName : "Not connected"}
        </strong>
        <small>
          Expected {props.expectedChainId} ·{" "}
          {props.publicTestnet ? "PUBLIC TESTNET" : "LOCAL"}
        </small>
      </div>
      <div className="wallet-stat">
        <span>GAS</span>
        <strong>{props.eth} ETH</strong>
        <small>
          {props.publicTestnet ? "Public testnet gas" : "Local test gas"}
        </small>
      </div>
      <div className="wallet-stat">
        <span>TEST USD₮</span>
        <strong>{props.usdtBalance}</strong>
        <small>
          {props.tokenAddress ? shortHex(props.tokenAddress) : "Deploy first"}
        </small>
      </div>
      <div className="wallet-dock-actions">
        {!props.address ? (
          <button onClick={props.onConnect} disabled={props.busy !== null}>
            {props.busy === "wallet-connect"
              ? "Connecting…"
              : "Connect MetaMask"}
          </button>
        ) : !correctNetwork ? (
          <button onClick={props.onSwitch}>Switch network</button>
        ) : !props.tokenAddress ? (
          <button onClick={props.onOpenPlayers}>
            Deploy token via a deal →
          </button>
        ) : (
          <div className="wallet-action-buttons">
            <button
              className="secondary"
              onClick={props.onFaucet}
              disabled={props.busy !== null}
            >
              {props.busy === "faucet" ? "Minting…" : "+ 50,000 test USD₮"}
            </button>
            <button
              onClick={props.onImportToken}
              disabled={props.busy !== null}
            >
              {props.busy === "token-import"
                ? "Adding token…"
                : "Add token to MetaMask"}
            </button>
          </div>
        )}
        <small className={props.backendOnline ? "ok" : "warn"}>
          {props.backendOnline
            ? `● ${props.publicTestnet ? "BASE SEPOLIA" : "LOCAL EVM"} ONLINE`
            : "● BACKEND OFFLINE"}
        </small>
      </div>
      {!correctBuyer ? (
        <p className="wallet-warning">
          This deal belongs to {shortHex(props.dealBuyer)}. Switch MetaMask
          account or deploy a new deal.
        </p>
      ) : null}
    </section>
  );
}

function PanelHeader({
  kicker,
  title,
  copy,
}: {
  kicker: string;
  title: string;
  copy: string;
}) {
  return (
    <header className="panel-heading">
      <span className="section-label">{kicker}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </header>
  );
}

function Overview({
  state,
  completed,
  onNavigate,
}: {
  state: DemoState;
  completed: number;
  onNavigate: (tab: Tab) => void;
}) {
  const lastEvent = state.events.at(-1);
  return (
    <>
      <PanelHeader
        kicker="COMMAND CENTRE"
        title="One view of the whole deal."
        copy="The sporting team sees the shortlist, offer state, required approvals, signatures, and settlement proof without switching systems."
      />
      <div className="metric-grid">
        <article>
          <span>SHORTLIST</span>
          <strong>{state.players?.length ?? 0}</strong>
          <small>scouted players</small>
        </article>
        <article>
          <span>OFFERS</span>
          <strong>{state.offers?.length ?? 0}</strong>
          <small>immutable records</small>
        </article>
        <article>
          <span>PROGRESS</span>
          <strong>{completed}/7</strong>
          <small>deal proofs</small>
        </article>
        <article>
          <span>RELEASED</span>
          <strong>{usdt(state.chainState?.releasedAmountMicroUsdt)}</strong>
          <small>test USD₮</small>
        </article>
      </div>
      <div className="overview-grid">
        <article className="overview-feature">
          <span className="section-label">WHY IT EXISTS</span>
          <h3>
            Transfer work is fragmented across chat, spreadsheets, signatures,
            and bank screens.
          </h3>
          <p>
            La Forza turns those disconnected steps into one controlled
            workflow. The agent can negotiate, but WDK policy and human approval
            retain authority.
          </p>
          <button className="inline-button" onClick={() => onNavigate("about")}>
            Read product purpose →
          </button>
        </article>
        <article className="active-deal-card">
          <span className="section-label">ACTIVE FILE</span>
          {state.initialized ? (
            <>
              <h3>{state.selectedPlayer?.name}</h3>
              <p>
                {state.selectedPlayer?.position} ·{" "}
                {state.selectedPlayer?.currentClub}
              </p>
              <dl>
                <div>
                  <dt>Latest event</dt>
                  <dd>{lastEvent ? words(lastEvent.type) : "Deployed"}</dd>
                </div>
                <div>
                  <dt>Signatures</dt>
                  <dd>{state.signatures?.length ?? 0}/3</dd>
                </div>
                <div>
                  <dt>Escrow</dt>
                  <dd>{state.chainState?.funded ? "FUNDED" : "WAITING"}</dd>
                </div>
              </dl>
              <button
                className="inline-button light"
                onClick={() => onNavigate("deal")}
              >
                Continue deal →
              </button>
            </>
          ) : (
            <>
              <h3>No active player</h3>
              <p>Select a player to deploy the local deal file.</p>
              <button
                className="inline-button light"
                onClick={() => onNavigate("players")}
              >
                Open shortlist →
              </button>
            </>
          )}
        </article>
      </div>
    </>
  );
}

const pitchPositions: Record<string, { x: number; y: number; zone: string }> = {
  Goalkeeper: { x: 50, y: 89, zone: "Goal area" },
  "Left Back": { x: 18, y: 75, zone: "Left defensive channel" },
  "Right Back": { x: 82, y: 75, zone: "Right defensive channel" },
  "Centre Back": { x: 50, y: 78, zone: "Central defence" },
  "Defensive Midfielder": { x: 50, y: 62, zone: "Holding midfield" },
  "Central Midfielder": { x: 50, y: 51, zone: "Central midfield" },
  "Attacking Midfielder": { x: 50, y: 39, zone: "Between the lines" },
  "Left Winger": { x: 18, y: 27, zone: "Left attacking channel" },
  "Right Winger": { x: 82, y: 27, zone: "Right attacking channel" },
  "Centre Forward": { x: 50, y: 17, zone: "Central attack" },
};

function PositionPitch({ player }: { player: DemoPlayer }) {
  const position = pitchPositions[player.position] ?? {
    x: 50,
    y: 50,
    zone: "Flexible role",
  };
  return (
    <div
      aria-label={`${player.name}: ${player.position}, ${position.zone}`}
      className="position-pitch"
      role="img"
    >
      <span className="pitch-goal pitch-goal-top" />
      <span className="pitch-goal pitch-goal-bottom" />
      <span className="pitch-box pitch-box-top" />
      <span className="pitch-box pitch-box-bottom" />
      <span
        className="position-marker"
        style={{ left: `${position.x}%`, top: `${position.y}%` }}
      >
        <i />
        <b>{player.position}</b>
      </span>
      <small>{position.zone}</small>
    </div>
  );
}

function PlayersPanel(props: {
  players: DemoPlayer[];
  selectedPlayerId: string;
  activePlayerId: string | undefined;
  busy: string | null;
  backendOnline: boolean | null;
  walletConnected: boolean;
  onSelect: (id: string) => void;
  onStart: () => void;
  onOpenDeal: () => void;
}) {
  const selected = props.players.find(
    ({ id }) => id === props.selectedPlayerId,
  );
  return (
    <>
      <PanelHeader
        kicker="SCOUTING DESK"
        title="Select the next deal."
        copy="Compare football context first. The selected player becomes part of the canonical deal ID and appears throughout the offer, signature, and settlement flow."
      />
      <div className="player-grid">
        {props.players.map((player) => {
          const selectedCard = player.id === props.selectedPlayerId;
          const active = player.id === props.activePlayerId;
          return (
            <button
              className={`player-card ${selectedCard ? "selected" : ""}`}
              key={player.id}
              onClick={() => props.onSelect(player.id)}
            >
              <div className="player-card-top">
                <span
                  className="player-avatar"
                  style={{ background: player.accent }}
                >
                  {player.initials}
                </span>
                <span className="rating">
                  {player.overall}
                  <small>OVR</small>
                </span>
              </div>
              <span className="availability">
                {active
                  ? "ACTIVE DEAL"
                  : player.availability.replaceAll("_", " ")}
              </span>
              <h3>{player.name}</h3>
              <p>
                {player.position} · {player.age} · {player.nationality}
              </p>
              <strong className="current-club">{player.currentClub}</strong>
              <div className="player-stats">
                <span>
                  <b>{player.appearances}</b>Apps
                </span>
                <span>
                  <b>{player.goals}</b>Goals
                </span>
                <span>
                  <b>{player.assists}</b>Assists
                </span>
                <span>
                  <b>{player.potential}</b>Potential
                </span>
              </div>
              <footer>
                <span>{player.marketValue}</span>
                <span>Contract {player.contractUntil}</span>
              </footer>
            </button>
          );
        })}
      </div>
      {selected && (
        <section className="selected-player-profile">
          <PositionPitch player={selected} />
          <div className="selected-player-copy">
            <span className="section-label">POSITION INTELLIGENCE</span>
            <div className="selected-player-heading">
              <span
                className="player-avatar"
                style={{ background: selected.accent }}
              >
                {selected.initials}
              </span>
              <div>
                <h2>{selected.name}</h2>
                <p>
                  {selected.position} · {selected.currentClub}
                </p>
              </div>
            </div>
            <dl className="selected-player-facts">
              <div>
                <dt>Primary role</dt>
                <dd>{selected.position}</dd>
              </div>
              <div>
                <dt>Nationality</dt>
                <dd>{selected.nationality}</dd>
              </div>
              <div>
                <dt>Market value</dt>
                <dd>{selected.marketValue}</dd>
              </div>
              <div>
                <dt>Contract</dt>
                <dd>Until {selected.contractUntil}</dd>
              </div>
            </dl>
            <p className="profile-note">
              The red marker shows the player&apos;s primary operating zone.
              Deal terms, club approvals and wallet signatures remain attached
              to this exact player record.
            </p>
          </div>
        </section>
      )}
      <div className="selection-bar">
        <div>
          <span className="section-label">SELECTED TARGET</span>
          <strong>{selected?.name ?? "Choose a player"}</strong>
          <small>{selected?.currentClub}</small>
        </div>
        {props.activePlayerId === props.selectedPlayerId ? (
          <button className="launch-button" onClick={props.onOpenDeal}>
            Open active deal →
          </button>
        ) : (
          <button
            className="launch-button"
            disabled={
              !props.backendOnline ||
              !props.walletConnected ||
              props.busy !== null ||
              !selected
            }
            onClick={props.onStart}
          >
            {props.busy === "bootstrap" || props.busy === "public-deploy"
              ? "Deploying…"
              : !props.walletConnected
                ? "Connect MetaMask first"
                : props.activePlayerId
                  ? "Replace active deal →"
                  : "Start this deal →"}
          </button>
        )}
      </div>
    </>
  );
}

function OffersPanel({
  offers,
  marketplace,
  players,
  player,
  walletAddress,
  busy,
  onConnect,
  onRegister,
  onSubmitOffer,
  onReviewPlayer,
  onNavigate,
}: {
  offers: DemoOffer[];
  marketplace: DemoState["marketplace"];
  players: DemoPlayer[];
  player: DemoPlayer | undefined;
  walletAddress: string | null;
  busy: string | null;
  onConnect: () => void;
  onRegister: (input: {
    name: string;
    role: MarketplaceCounterparty["role"];
    walletAddress: string;
  }) => void;
  onSubmitOffer: (input: {
    counterpartyId: string;
    playerId: string;
    amountUsdt: string;
    signingBonusUsdt: string;
    note: string;
  }) => void;
  onReviewPlayer: (playerId: string) => void;
  onNavigate: (tab: Tab) => void;
}) {
  const [counterpartyName, setCounterpartyName] = useState("");
  const [counterpartyRole, setCounterpartyRole] =
    useState<MarketplaceCounterparty["role"]>("CLUB");
  const [manualWallet, setManualWallet] = useState(walletAddress ?? "");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [offerPlayerId, setOfferPlayerId] = useState(
    player?.id ?? players[0]?.id ?? "",
  );
  const [offerAmount, setOfferAmount] = useState("900");
  const [signingBonus, setSigningBonus] = useState("250");
  const [offerNote, setOfferNote] = useState(
    "Formal transfer proposal subject to medical and registration approval.",
  );
  const counterparties = marketplace?.counterparties ?? [];
  const marketplaceOffers = marketplace?.offers ?? [];
  const sentOffers = walletAddress
    ? marketplaceOffers.filter(
        ({ fromWallet }) =>
          fromWallet.toLowerCase() === walletAddress.toLowerCase(),
      )
    : [];

  const signedOfferList = (
    visibleOffers: MarketplaceOffer[],
    emptyCopy: string,
    directionLabel: string,
  ) =>
    visibleOffers.length === 0 ? (
      <p className="registry-empty">{emptyCopy}</p>
    ) : (
      <div className="marketplace-offer-list">
        {[...visibleOffers].reverse().map((offer) => {
          const target = players.find(({ id }) => id === offer.playerId);
          return (
            <article key={offer.id}>
              <div>
                <span>{directionLabel}</span>
                <h4>{offer.from}</h4>
                <code>{shortHex(offer.fromWallet, 7)}</code>
              </div>
              <div>
                <small>PLAYER SUBJECT</small>
                <strong>{target?.name ?? offer.playerId}</strong>
                <span>{target?.position}</span>
              </div>
              <div>
                <small>PROPOSED TERMS</small>
                <strong>{usdt(offer.amountMicroUsdt)} test USD₮</strong>
                <span>{usdt(offer.signingBonusMicroUsdt)} signing bonus</span>
              </div>
              <div>
                <span className="offer-status status-received">
                  SIGNATURE VERIFIED
                </span>
                <time>{new Date(offer.createdAt).toLocaleString("en-GB")}</time>
                <button
                  className="offer-review-button"
                  onClick={() => onReviewPlayer(offer.playerId)}
                >
                  Review player →
                </button>
              </div>
              <p>{offer.note}</p>
            </article>
          );
        })}
      </div>
    );
  const ownedCounterparties = walletAddress
    ? counterparties.filter(
        ({ walletAddress: registeredWallet }) =>
          registeredWallet.toLowerCase() === walletAddress.toLowerCase(),
      )
    : [];

  useEffect(() => {
    if (walletAddress) setManualWallet(walletAddress);
  }, [walletAddress]);

  useEffect(() => {
    if (!counterpartyId && ownedCounterparties[0]) {
      setCounterpartyId(ownedCounterparties[0].id);
    }
  }, [counterpartyId, ownedCounterparties]);

  useEffect(() => {
    if (player) setOfferPlayerId(player.id);
  }, [player]);

  return (
    <>
      <PanelHeader
        kicker="SIGNED OFFER EXCHANGE"
        title="Real wallets. Verifiable proposals."
        copy="Clubs, agents, scouts and testers register a wallet identity with MetaMask, then sign every player offer. Pasted addresses alone never become trusted counterparties."
      />

      <div className="marketplace-compose">
        <form
          className="marketplace-form"
          onSubmit={(event) => {
            event.preventDefault();
            onRegister({
              name: counterpartyName,
              role: counterpartyRole,
              walletAddress: manualWallet,
            });
          }}
        >
          <header>
            <span>01 / WALLET IDENTITY</span>
            <h3>Register a counterparty</h3>
            <p>
              Enter the wallet manually, then prove ownership with the same
              account in MetaMask.
            </p>
          </header>
          <label>
            Organization or tester name
            <input
              onChange={(event) => setCounterpartyName(event.target.value)}
              placeholder="e.g. Northstar FC"
              required
              value={counterpartyName}
            />
          </label>
          <div className="form-split">
            <label>
              Role
              <select
                onChange={(event) =>
                  setCounterpartyRole(
                    event.target.value as MarketplaceCounterparty["role"],
                  )
                }
                value={counterpartyRole}
              >
                <option value="CLUB">Club</option>
                <option value="AGENT">Agent</option>
                <option value="SCOUT">Scout</option>
                <option value="TESTER">Tester</option>
              </select>
            </label>
            <label>
              EVM wallet
              <input
                onChange={(event) => setManualWallet(event.target.value)}
                placeholder="0x…"
                required
                value={manualWallet}
              />
            </label>
          </div>
          {!walletAddress ? (
            <button className="launch-button" onClick={onConnect} type="button">
              Connect MetaMask →
            </button>
          ) : (
            <button
              className="launch-button"
              disabled={
                busy !== null ||
                counterpartyName.trim().length < 2 ||
                !/^0x[a-fA-F0-9]{40}$/.test(manualWallet)
              }
              type="submit"
            >
              {busy === "counterparty-register"
                ? "Waiting for signature…"
                : "Sign & register wallet →"}
            </button>
          )}
        </form>

        <form
          className="marketplace-form marketplace-form-dark"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitOffer({
              counterpartyId,
              playerId: offerPlayerId,
              amountUsdt: offerAmount,
              signingBonusUsdt: signingBonus,
              note: offerNote,
            });
          }}
        >
          <header>
            <span>02 / SIGNED PROPOSAL</span>
            <h3>Send terms to Atlas FC</h3>
            <p>
              A selling club or player agent proposes transfer terms to the
              Atlas FC transfer desk. The player is the subject of the deal, not
              the direct recipient of this payment proposal.
            </p>
          </header>
          <div className="form-split">
            <label>
              Acting as
              <select
                onChange={(event) => setCounterpartyId(event.target.value)}
                required
                value={counterpartyId}
              >
                <option value="">Select registered identity</option>
                {ownedCounterparties.map((counterparty) => (
                  <option key={counterparty.id} value={counterparty.id}>
                    {counterparty.name} / {counterparty.role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Player
              <select
                onChange={(event) => setOfferPlayerId(event.target.value)}
                required
                value={offerPlayerId}
              >
                {players.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} / {candidate.position}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-split">
            <label>
              Offer / test USD₮
              <input
                inputMode="decimal"
                min="1"
                onChange={(event) => setOfferAmount(event.target.value)}
                required
                step="0.000001"
                type="number"
                value={offerAmount}
              />
            </label>
            <label>
              Signing bonus / test USD₮
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) => setSigningBonus(event.target.value)}
                required
                step="0.000001"
                type="number"
                value={signingBonus}
              />
            </label>
          </div>
          <label>
            Conditions
            <textarea
              maxLength={280}
              onChange={(event) => setOfferNote(event.target.value)}
              required
              rows={3}
              value={offerNote}
            />
          </label>
          <button
            className="launch-button"
            disabled={
              busy !== null ||
              !counterpartyId ||
              !offerPlayerId ||
              offerNote.trim().length < 3
            }
            type="submit"
          >
            {busy === "marketplace-offer"
              ? "Signing proposal…"
              : "Sign & send to Atlas FC →"}
          </button>
        </form>
      </div>

      <section className="counterparty-registry">
        <div className="registry-heading">
          <div>
            <span className="section-label">VERIFIED DIRECTORY</span>
            <h3>Registered counterparties</h3>
          </div>
          <strong>{counterparties.length}</strong>
        </div>
        {counterparties.length === 0 ? (
          <p className="registry-empty">
            No verified wallet profiles yet. Connect the first tester wallet
            above.
          </p>
        ) : (
          <div className="counterparty-list">
            {counterparties.map((counterparty) => (
              <article key={counterparty.id}>
                <span>{counterparty.role}</span>
                <strong>{counterparty.name}</strong>
                <code>{shortHex(counterparty.walletAddress, 8)}</code>
                <small>✓ OWNERSHIP SIGNED</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="marketplace-inbox sent-offers">
        <div className="registry-heading">
          <div>
            <span className="section-label">CONNECTED WALLET / OUTBOX</span>
            <h3>Offers sent by me</h3>
          </div>
          <strong>{sentOffers.length}</strong>
        </div>
        {signedOfferList(
          sentOffers,
          walletAddress
            ? "This connected wallet has not sent an offer yet."
            : "Connect MetaMask to see offers signed by that wallet.",
          "↑ SENT TO ATLAS FC",
        )}
      </section>

      <section className="marketplace-inbox">
        <div className="registry-heading">
          <div>
            <span className="section-label">ATLAS FC / SHARED INBOX</span>
            <h3>All incoming transfer proposals</h3>
          </div>
          <strong>{marketplaceOffers.length}</strong>
        </div>
        {signedOfferList(
          marketplaceOffers,
          "No selling club, agent or tester has sent terms to Atlas FC yet.",
          "↓ RECEIVED BY ATLAS FC",
        )}
      </section>

      <div className="deal-history-heading">
        <span className="section-label">ACTIVE DEAL HISTORY</span>
        <h3>Policy and settlement records</h3>
      </div>
      {offers.length === 0 ? (
        <div className="empty-state">
          <span>↔</span>
          <h3>No canonical deal file yet</h3>
          <p>
            Marketplace offers are non-custodial proposals. Select one player
            and deploy a deal to begin escrow execution.
          </p>
          <button
            className="launch-button"
            onClick={() => onNavigate("players")}
          >
            Choose player →
          </button>
        </div>
      ) : (
        <>
          <div className="offer-summary">
            <div>
              <span>PLAYER</span>
              <strong>{player?.name}</strong>
            </div>
            <div>
              <span>CURRENT CLUB</span>
              <strong>{player?.currentClub}</strong>
            </div>
            <div>
              <span>RECORDS</span>
              <strong>{offers.length}</strong>
            </div>
            <div>
              <span>LATEST STATUS</span>
              <strong>{offers.at(-1)?.status.replaceAll("_", " ")}</strong>
            </div>
          </div>
          <div className="offer-table">
            <div className="offer-table-head">
              <span>Direction / parties</span>
              <span>Terms</span>
              <span>Created</span>
              <span>Status</span>
            </div>
            {[...offers].reverse().map((offer) => (
              <article key={offer.id}>
                <div>
                  <span
                    className={`direction ${offer.direction.toLowerCase()}`}
                  >
                    {offer.direction === "INCOMING"
                      ? "↓ INCOMING"
                      : "↑ OUTGOING"}
                  </span>
                  <strong>
                    {offer.from} → {offer.to}
                  </strong>
                  <small>{offer.note}</small>
                </div>
                <div>
                  <strong>{usdt(offer.amountMicroUsdt)} USD₮</strong>
                  <small>
                    {usdt(offer.signingBonusMicroUsdt)} signing bonus
                  </small>
                </div>
                <time>
                  {new Date(offer.createdAt).toLocaleTimeString("en-GB")}
                </time>
                <span
                  className={`offer-status status-${offer.status.toLowerCase()}`}
                >
                  {offer.status.replaceAll("_", " ")}
                </span>
              </article>
            ))}
          </div>
          <button
            className="inline-button offer-continue"
            onClick={() => onNavigate("deal")}
          >
            Continue in deal room →
          </button>
        </>
      )}
    </>
  );
}

function DealPanel(props: {
  state: DemoState;
  selectedPlayer: DemoPlayer | undefined;
  busy: string | null;
  completed: number;
  backendOnline: boolean | null;
  onStart: () => void;
  onAction: (action: ActionDefinition) => void;
}) {
  if (!props.state.initialized) {
    return (
      <>
        <PanelHeader
          kicker="DEAL ROOM"
          title="Deploy the selected file."
          copy="Your connected MetaMask address becomes the buyer. Encrypted WDK accounts remain the seller, player, and verifier while the contracts deploy to the local EVM."
        />
        <div className="bootstrap-panel">
          <div>
            <span className="section-label">SELECTED PLAYER</span>
            <h3>{props.selectedPlayer?.name ?? "Choose a player first"}</h3>
            <p>
              {props.selectedPlayer?.position} ·{" "}
              {props.selectedPlayer?.currentClub}
            </p>
          </div>
          <button
            className="launch-button"
            disabled={
              !props.backendOnline ||
              props.busy !== null ||
              !props.selectedPlayer
            }
            onClick={props.onStart}
          >
            {props.busy === "bootstrap" || props.busy === "public-deploy"
              ? "Deploying…"
              : "Deploy MetaMask deal →"}
          </button>
        </div>
      </>
    );
  }
  const { state } = props;
  return (
    <>
      <header className="section-heading">
        <div>
          <span className="section-label">LIVE DEAL / LF-001</span>
          <h2>{state.selectedPlayer?.name}</h2>
          <p>
            {state.selectedPlayer?.position} · Atlas FC negotiating with{" "}
            {state.selectedPlayer?.currentClub}
          </p>
        </div>
        <div className="progress-block">
          <span>DEAL PROGRESS</span>
          <strong>{props.completed} / 7</strong>
        </div>
      </header>
      <div className="deal-scoreboard">
        <article className="club-panel buyer-panel">
          <span>BUYING CLUB / POLICY AGENT</span>
          <h3>Atlas FC</h3>
          <dl>
            <div>
              <dt>Maximum mandate</dt>
              <dd>1,000 USD₮</dd>
            </div>
            <div>
              <dt>Human approval</dt>
              <dd>≥ 750 USD₮</dd>
            </div>
            <div>
              <dt>Wallet</dt>
              <dd>{shortHex(state.wallets?.[0]?.address)}</dd>
            </div>
          </dl>
        </article>
        <div className="versus">
          <span>TRANSFER</span>
          <strong>↔</strong>
          <span>WINDOW</span>
        </div>
        <article className="club-panel seller-panel">
          <span>SELLING CLUB / BENEFICIARY</span>
          <h3>{state.selectedPlayer?.currentClub}</h3>
          <dl>
            <div>
              <dt>Accepted deal</dt>
              <dd>900 USD₮</dd>
            </div>
            <div>
              <dt>Appearance release</dt>
              <dd>650 USD₮</dd>
            </div>
            <div>
              <dt>Wallet</dt>
              <dd>{shortHex(state.wallets?.[1]?.address)}</dd>
            </div>
          </dl>
        </article>
      </div>
      <div className="deal-strip">
        <span>PLAYER / {state.deal?.playerName}</span>
        <strong>250 USD₮ SIGNING + 650 USD₮ MILESTONE</strong>
        <code>{shortHex(state.deal?.authorizationDigest, 12)}</code>
      </div>
      <div className="console-layout">
        <div className="action-stack">
          {actionDefinitions.map((action) => {
            const done = hasEvent(state, action.event);
            const enabled = action.enabled(state) && !done;
            return (
              <button
                className={`action-card ${done ? "done" : ""} ${action.tone ?? ""}`}
                disabled={!enabled || props.busy !== null}
                key={action.id}
                onClick={() => props.onAction(action)}
              >
                <span className="action-index">
                  {done ? "✓" : action.index}
                </span>
                <span className="action-copy">
                  <strong>{action.title}</strong>
                  <small>{action.detail}</small>
                </span>
                <span className="action-status">
                  {props.busy === action.id
                    ? "RUNNING"
                    : done
                      ? "PROVED"
                      : enabled
                        ? "RUN →"
                        : "LOCKED"}
                </span>
              </button>
            );
          })}
        </div>
        <ChainConsole state={state} />
      </div>
    </>
  );
}

function ChainConsole({ state }: { state: DemoState }) {
  return (
    <aside className="chain-console">
      <header>
        <span>ON-CHAIN STATE</span>
        <b>{state.network?.name}</b>
      </header>
      <div className="balance-grid">
        {state.wallets?.slice(0, 3).map((wallet) => (
          <div key={wallet.role}>
            <span>{wallet.role}</span>
            <strong>{usdt(state.chainState?.balances[wallet.role])}</strong>
            <small>test USD₮</small>
          </div>
        ))}
        <div>
          <span>ESCROW</span>
          <strong>{usdt(state.chainState?.balances.ESCROW)}</strong>
          <small>{state.chainState?.funded ? "funded" : "waiting"}</small>
        </div>
      </div>
      <dl className="contract-list">
        <div>
          <dt>Token</dt>
          <dd>
            {explorerHref(
              state.network?.explorerUrl,
              "address",
              state.contracts?.token,
            ) ? (
              <a
                href={explorerHref(
                  state.network?.explorerUrl,
                  "address",
                  state.contracts?.token,
                )}
                rel="noreferrer"
                target="_blank"
              >
                {shortHex(state.contracts?.token)} ↗
              </a>
            ) : (
              shortHex(state.contracts?.token)
            )}
          </dd>
        </div>
        <div>
          <dt>Escrow</dt>
          <dd>
            {explorerHref(
              state.network?.explorerUrl,
              "address",
              state.contracts?.escrow,
            ) ? (
              <a
                href={explorerHref(
                  state.network?.explorerUrl,
                  "address",
                  state.contracts?.escrow,
                )}
                rel="noreferrer"
                target="_blank"
              >
                {shortHex(state.contracts?.escrow)} ↗
              </a>
            ) : (
              shortHex(state.contracts?.escrow)
            )}
          </dd>
        </div>
        <div>
          <dt>Signatures</dt>
          <dd>{state.signatures?.length ?? 0} / 3</dd>
        </div>
        <div>
          <dt>Released</dt>
          <dd>{usdt(state.chainState?.releasedAmountMicroUsdt)} USD₮</dd>
        </div>
      </dl>
      {Object.entries(state.transactions ?? {}).map(([name, hash]) => (
        <div className="transaction" key={hash}>
          <span>{name.toUpperCase()} TX</span>
          {explorerHref(state.network?.explorerUrl, "tx", hash) ? (
            <a
              href={explorerHref(state.network?.explorerUrl, "tx", hash)}
              rel="noreferrer"
              target="_blank"
            >
              <code>{shortHex(hash, 12)} ↗</code>
            </a>
          ) : (
            <code>{shortHex(hash, 12)}</code>
          )}
        </div>
      ))}
    </aside>
  );
}

function LedgerPanel({
  state,
  onRefresh,
}: {
  state: DemoState;
  onRefresh: () => Promise<void>;
}) {
  return (
    <>
      <div className="ledger-heading">
        <PanelHeader
          kicker="PROOF LEDGER"
          title="Follow every signed fact."
          copy="This view separates commercial events from blockchain execution, while keeping their digest and transaction references together."
        />
        <button className="inline-button" onClick={() => void onRefresh()}>
          Refresh state ↻
        </button>
      </div>
      <div className="ledger-layout">
        <div className="event-log">
          {state.events.length === 0 ? (
            <div className="empty-state compact">
              <h3>No evidence yet</h3>
              <p>Start a player deal to create the audit trail.</p>
            </div>
          ) : (
            [...state.events].reverse().map((event) => (
              <article key={event.id}>
                <time>{new Date(event.at).toLocaleTimeString("en-GB")}</time>
                <span
                  className={
                    event.type.includes("DENIED")
                      ? "event-dot red"
                      : "event-dot"
                  }
                />
                <div>
                  <strong>{words(event.type)}</strong>
                  <small>
                    {Object.entries(event.detail)
                      .slice(0, 2)
                      .map(
                        ([key, value]) =>
                          `${key}: ${shortHex(String(value), 10)}`,
                      )
                      .join(" · ")}
                  </small>
                </div>
              </article>
            ))
          )}
        </div>
        <div>
          <ChainConsole state={state} />
          <div className="digest-card">
            <span>CANONICAL AUTHORIZATION</span>
            <code>
              {state.deal?.authorizationDigest ??
                "Deploy a deal to create the EIP-712 digest"}
            </code>
            <p>
              The same digest is checked by WDK policy, signed by three parties,
              and recomputed inside the Solidity escrow.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function AboutPanel() {
  return (
    <>
      <PanelHeader
        kicker="PRODUCT PURPOSE"
        title="A controlled operating system for football deals."
        copy="La Forza is not a betting app and does not pretend to replace a federation. It demonstrates how self-custodial programmable money can make club negotiations safer and easier to audit."
      />
      <div className="purpose-flow">
        <article>
          <span>THE PROBLEM</span>
          <h3>Commercial context gets lost.</h3>
          <p>
            Shortlists live in scouting tools, offers arrive in messages,
            approvals sit in email, signatures use another service, and payment
            proof arrives later.
          </p>
        </article>
        <article>
          <span>THE PRODUCT</span>
          <h3>One deal file.</h3>
          <p>
            Player context, every proposal, the club mandate, human approval,
            signatures, escrow state, evidence, and payout receipts remain
            connected.
          </p>
        </article>
        <article>
          <span>THE CONTROL</span>
          <h3>Humans retain authority.</h3>
          <p>
            The agent can prepare terms, but cannot exceed budget, approve its
            own exception, change counterparties, or send arbitrary wallet
            transactions.
          </p>
        </article>
      </div>
      <div className="deal-history-heading">
        <span className="section-label">WHO SENDS WHAT TO WHOM?</span>
        <h3>The commercial and settlement flow</h3>
      </div>
      <div className="architecture-grid party-flow">
        <article>
          <span>01 / SELLING SIDE</span>
          <h3>Club or agent → Atlas FC</h3>
          <p>
            A verified external wallet signs proposed transfer terms for one
            player. This is an off-chain commercial offer, not a payment.
          </p>
        </article>
        <article>
          <span>02 / BUYING CLUB</span>
          <h3>Atlas FC opens the deal</h3>
          <p>
            Atlas selects the player, applies its spending mandate, and deploys
            the exact escrow terms from its MetaMask buyer account.
          </p>
        </article>
        <article>
          <span>03 / REQUIRED SIGNERS</span>
          <h3>Buyer + seller + player</h3>
          <p>
            All three approve the same EIP-712 digest. The player is a required
            deal signer, rather than the direct recipient of the club offer.
          </p>
        </article>
        <article>
          <span>04 / SETTLEMENT</span>
          <h3>Escrow → player and club</h3>
          <p>
            Test USD₮ releases the signing bonus to the player and the milestone
            amount to the selling club after verifier evidence.
          </p>
        </article>
      </div>
      <div className="architecture-grid">
        <article>
          <span>01</span>
          <h3>Policy engine</h3>
          <p>
            WDK denies 1,100 USD₮ and requires an exact human-approved digest
            above 750.
          </p>
        </article>
        <article>
          <span>02</span>
          <h3>Self-custody</h3>
          <p>
            The buyer signs from MetaMask. Seller, player, and verifier use
            encrypted local WDK accounts with narrow policies.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>Escrow execution</h3>
          <p>
            MetaMask deploys, approves, and funds. WDK permits only the exact
            evidence-backed release.
          </p>
        </article>
        <article className="honesty-card">
          <span>TRACK FOCUS</span>
          <h3>WDK, deeply.</h3>
          <p>
            Pears and QVAC are not claimed because they are not required for
            this proof.
          </p>
        </article>
      </div>
      <section className="run-card">
        <div>
          <span className="section-label">RUN MODES</span>
          <h3>Local proof or public Base Sepolia.</h3>
          <p>
            The public mode writes contracts and receipts to a real testnet.
          </p>
        </div>
        <pre>
          <code>
            <span>$</span> npm install{"\n"}
            <span>$</span> npm run demo{"\n"}
            <span>$</span> npm run demo:testnet{"\n"}
            <span>→</span> http://localhost:3000
          </code>
        </pre>
      </section>
    </>
  );
}

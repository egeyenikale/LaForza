"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";

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

type DemoState = {
  initialized: boolean;
  network?: { name: string; chainId: number; disclaimer: string };
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
  wallets?: Array<{ role: string; address: string }>;
  players?: DemoPlayer[];
  selectedPlayer?: DemoPlayer;
  offers?: DemoOffer[];
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
    detail: "Approve this exact digest; the buyer WDK wallet signs it.",
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
    detail: "WDK approves test USD₮, funds escrow, and pays the signing bonus.",
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

export default function HomePage() {
  const [state, setState] = useState<DemoState>({
    initialized: false,
    events: [],
    offers: [],
  });
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedPlayerId, setSelectedPlayerId] = useState("mert-kaya");
  const [passkey, setPasskey] = useState("laforza-local-demo");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

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
        body: JSON.stringify({ passkey, ...extra }),
      });
      const result = (await response.json()) as DemoState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Action failed");
      setState(result);
      setBackendOnline(true);
      if (result.selectedPlayer) setSelectedPlayerId(result.selectedPlayer.id);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Action failed",
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
    <main>
      <nav className="nav">
        <button className="brand brand-button" onClick={() => goTo("overview")}>
          <span className="brand-mark">LF</span>
          <span>LA FORZA</span>
        </button>
        <div className="nav-links">
          <button onClick={() => goTo("players")}>Players</button>
          <button onClick={() => goTo("offers")}>Offers</button>
          <button onClick={() => goTo("deal")}>Deal room</button>
          <button onClick={() => goTo("ledger")}>Ledger</button>
        </div>
        <div className="nav-meta">
          <span className={backendOnline ? "live-dot" : "live-dot offline"} />
          <span>
            {backendOnline ? "LOCAL STACK ONLINE" : "START npm run demo"}
          </span>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-shade" />
        <div className="hero-content">
          <div className="eyebrow">FOOTBALL OPERATIONS / TETHER WDK</div>
          <h1>
            From shortlist
            <br />
            <em>to signed settlement.</em>
          </h1>
          <p className="hero-copy">
            Select a player, inspect every offer, enforce the club mandate,
            collect three signatures, and follow each test USD₮ movement from
            one workspace.
          </p>
          <div className="actions">
            <button className="primary-button" onClick={() => goTo("players")}>
              Open player shortlist <span>↘</span>
            </button>
            <button
              className="text-link link-button"
              onClick={() => goTo("about")}
            >
              What is La Forza?
            </button>
          </div>
          <div className="hero-proof">
            <span>{state.players?.length ?? 4} / SCOUTED PLAYERS</span>
            <span>{state.offers?.length ?? 0} / OFFER RECORDS</span>
            <span>{completed} / 7 DEAL PROOFS</span>
          </div>
        </div>
      </section>

      <section className="ticker" aria-label="Product summary">
        <span>PLAYER DISCOVERY</span>
        <i>✦</i>
        <span>OFFER CONTROL</span>
        <i>✦</i>
        <span>SELF-CUSTODY</span>
        <i>✦</i>
        <span>PROGRAMMABLE TEST USD₮</span>
      </section>

      <section className="workspace" id="workspace">
        <aside className="workspace-tabs" aria-label="Application sections">
          <div className="workspace-title">
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
          {activeTab === "overview" && (
            <Overview state={state} completed={completed} onNavigate={goTo} />
          )}

          {activeTab === "players" && (
            <PlayersPanel
              players={state.players ?? []}
              selectedPlayerId={selectedPlayerId}
              activePlayerId={state.selectedPlayer?.id}
              passkey={passkey}
              busy={busy}
              backendOnline={backendOnline}
              onPasskey={setPasskey}
              onSelect={setSelectedPlayerId}
              onStart={() =>
                void runAction("bootstrap", "bootstrap", {
                  playerId: selectedPlayerId,
                })
              }
              onOpenDeal={() => goTo("deal")}
            />
          )}

          {activeTab === "offers" && (
            <OffersPanel
              offers={state.offers ?? []}
              player={state.selectedPlayer}
              onNavigate={goTo}
            />
          )}

          {activeTab === "deal" && (
            <DealPanel
              state={state}
              selectedPlayer={selectedPlayer}
              passkey={passkey}
              busy={busy}
              completed={completed}
              backendOnline={backendOnline}
              onPasskey={setPasskey}
              onStart={() =>
                void runAction("bootstrap", "bootstrap", {
                  playerId: selectedPlayerId,
                })
              }
              onAction={(action) => void runAction(action.endpoint, action.id)}
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
        <span>LOCAL TEST ASSETS ONLY · NO REAL FUNDS</span>
      </footer>
    </main>
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

function PlayersPanel(props: {
  players: DemoPlayer[];
  selectedPlayerId: string;
  activePlayerId: string | undefined;
  passkey: string;
  busy: string | null;
  backendOnline: boolean | null;
  onPasskey: (value: string) => void;
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
      <div className="selection-bar">
        <div>
          <span className="section-label">SELECTED TARGET</span>
          <strong>{selected?.name ?? "Choose a player"}</strong>
          <small>{selected?.currentClub}</small>
        </div>
        <label>
          Local vault passkey
          <input
            type="password"
            value={props.passkey}
            onChange={(event) => props.onPasskey(event.target.value)}
          />
        </label>
        {props.activePlayerId === props.selectedPlayerId ? (
          <button className="launch-button" onClick={props.onOpenDeal}>
            Open active deal →
          </button>
        ) : (
          <button
            className="launch-button"
            disabled={
              !props.backendOnline ||
              props.busy !== null ||
              props.passkey.length < 12 ||
              !selected
            }
            onClick={props.onStart}
          >
            {props.busy === "bootstrap"
              ? "Deploying…"
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
  player,
  onNavigate,
}: {
  offers: DemoOffer[];
  player: DemoPlayer | undefined;
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <>
      <PanelHeader
        kicker="OFFER CONTROL"
        title="Every proposal, not just the winner."
        copy="Incoming asks, outgoing counters, policy rejections, approvals, signatures, funding, and settlement stay visible as one commercial history."
      />
      {offers.length === 0 ? (
        <div className="empty-state">
          <span>↔</span>
          <h3>No offer file yet</h3>
          <p>Select a player and start a deal to open the inbox.</p>
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
  passkey: string;
  busy: string | null;
  completed: number;
  backendOnline: boolean | null;
  onPasskey: (value: string) => void;
  onStart: () => void;
  onAction: (action: ActionDefinition) => void;
}) {
  if (!props.state.initialized) {
    return (
      <>
        <PanelHeader
          kicker="DEAL ROOM"
          title="Deploy the selected file."
          copy="The backend will create four encrypted WDK seats and deploy MockUSDT plus the escrow to the local chain."
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
          <label>
            Local vault passkey
            <input
              type="password"
              value={props.passkey}
              onChange={(event) => props.onPasskey(event.target.value)}
            />
          </label>
          <button
            className="launch-button"
            disabled={
              !props.backendOnline ||
              props.busy !== null ||
              props.passkey.length < 12 ||
              !props.selectedPlayer
            }
            onClick={props.onStart}
          >
            {props.busy === "bootstrap" ? "Deploying…" : "Deploy local deal →"}
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
          <dd>{shortHex(state.contracts?.token)}</dd>
        </div>
        <div>
          <dt>Escrow</dt>
          <dd>{shortHex(state.contracts?.escrow)}</dd>
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
          <code>{shortHex(hash, 12)}</code>
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
            Four encrypted local seed phrases. Each actor signs from its own WDK
            address.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>Escrow execution</h3>
          <p>
            Exact policies permit token approval, funding, and evidence-backed
            release only.
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
          <span className="section-label">RUN LOCALLY</span>
          <h3>One command. One real flow.</h3>
          <p>Starts Hardhat, Fastify, and Next.js together.</p>
        </div>
        <pre>
          <code>
            <span>$</span> npm install{"\n"}
            <span>$</span> npm run demo{"\n"}
            <span>→</span> http://localhost:3000
          </code>
        </pre>
      </section>
    </>
  );
}

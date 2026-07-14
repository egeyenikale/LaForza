"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";

type DemoEvent = {
  id: string;
  type: string;
  at: string;
  detail: Record<string, unknown>;
};

type DemoState = {
  initialized: boolean;
  network?: {
    name: string;
    chainId: number;
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
  wallets?: Array<{ role: string; address: string }>;
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

const actionDefinitions: ActionDefinition[] = [
  {
    id: "over-budget",
    index: "01",
    title: "Try 1,100 USD₮",
    detail: "Prove the mandate rejects an oversized offer before signing.",
    endpoint: "attempt-over-budget",
    event: "POLICY_DENIED_OVER_BUDGET",
    tone: "danger",
    enabled: (state) => state.initialized,
  },
  {
    id: "review",
    index: "02",
    title: "Counter at 900 USD₮",
    detail: "The amount is allowed, but crosses the human approval threshold.",
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
    detail: "The selling club signs the identical canonical EIP-712 terms.",
    endpoint: "sign/seller",
    event: "SELLER_AUTHORIZATION_SIGNED",
    enabled: (state) => state.signatures?.includes("BUYER") ?? false,
  },
  {
    id: "player",
    index: "05",
    title: "Player signs",
    detail: "The player completes the contract's required signer set.",
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
    detail: "The named verifier releases 650 test USD₮ against evidence.",
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

function eventLabel(type: string): string {
  return type
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

export default function HomePage() {
  const [state, setState] = useState<DemoState>({
    initialized: false,
    events: [],
  });
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
      setState((await response.json()) as DemoState);
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const runAction = async (endpoint: string, id: string) => {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/demo/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passkey }),
      });
      const result = (await response.json()) as DemoState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Action failed");
      setState(result);
      setBackendOnline(true);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Action failed",
      );
    } finally {
      setBusy(null);
    }
  };

  const completed = useMemo(
    () =>
      actionDefinitions.filter(({ event }) => hasEvent(state, event)).length,
    [state],
  );

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="LaForza home">
          <span className="brand-mark">LF</span>
          <span>LA FORZA</span>
        </a>
        <div className="nav-links">
          <a href="#deal-room">Deal room</a>
          <a href="#architecture">Architecture</a>
          <a href="#run">Run locally</a>
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
          <div className="eyebrow">TETHER DEVELOPERS CUP / WDK TRACK</div>
          <h1>
            Football deals,
            <br />
            <em>without surrendering the keys.</em>
          </h1>
          <p className="hero-copy">
            A self-custodial deal room where club agents negotiate inside human
            mandates, every party signs the same terms, and test USD₮ settles
            through verifiable milestones.
          </p>
          <div className="actions">
            <a className="primary-button" href="#deal-room">
              Run the live deal <span>↘</span>
            </a>
            <a
              className="text-link"
              href="https://github.com/egeyenikale/LaForza"
              target="_blank"
              rel="noreferrer"
            >
              GitHub / source ↗
            </a>
          </div>
          <div className="hero-proof">
            <span>01 / POLICY-BOUND WDK</span>
            <span>02 / 3-PARTY EIP-712</span>
            <span>03 / ON-CHAIN ESCROW</span>
          </div>
        </div>
      </section>

      <section className="ticker" aria-label="Product summary">
        <span>SELF-CUSTODY</span>
        <i>✦</i>
        <span>HUMAN APPROVAL</span>
        <i>✦</i>
        <span>PROGRAMMABLE TEST USD₮</span>
        <i>✦</i>
        <span>FOOTBALL FIRST</span>
      </section>

      <section className="deal-room" id="deal-room">
        <header className="section-heading">
          <div>
            <span className="section-label">LIVE DEMO / LF-001</span>
            <h2>The registration room</h2>
            <p>
              Every click below executes backend code. Funding actions write to
              the local Hardhat chain through WDK wallets.
            </p>
          </div>
          <div className="progress-block">
            <span>DEAL PROGRESS</span>
            <strong>{completed} / 7</strong>
          </div>
        </header>

        {!state.initialized ? (
          <div className="bootstrap-panel">
            <div>
              <span className="section-label">SECURE LOCAL SESSION</span>
              <h3>Open four self-custodial seats</h3>
              <p>
                The passkey encrypts buyer, seller, player, and verifier WDK
                seed phrases on this machine. It is never persisted by the API.
              </p>
            </div>
            <label>
              Local vault passkey
              <input
                type="password"
                value={passkey}
                minLength={12}
                onChange={(event) => setPasskey(event.target.value)}
              />
            </label>
            <button
              className="launch-button"
              disabled={busy !== null || passkey.length < 12 || !backendOnline}
              onClick={() => void runAction("bootstrap", "bootstrap")}
            >
              {busy === "bootstrap" ? "Deploying…" : "Deploy local deal →"}
            </button>
          </div>
        ) : (
          <>
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
                <h3>Bosphorus United</h3>
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
                      disabled={!enabled || busy !== null}
                      key={action.id}
                      onClick={() => void runAction(action.endpoint, action.id)}
                    >
                      <span className="action-index">
                        {done ? "✓" : action.index}
                      </span>
                      <span className="action-copy">
                        <strong>{action.title}</strong>
                        <small>{action.detail}</small>
                      </span>
                      <span className="action-status">
                        {busy === action.id
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

              <aside className="chain-console">
                <header>
                  <span>ON-CHAIN STATE</span>
                  <b>{state.network?.name}</b>
                </header>
                <div className="balance-grid">
                  {state.wallets?.slice(0, 3).map((wallet) => (
                    <div key={wallet.role}>
                      <span>{wallet.role}</span>
                      <strong>
                        {usdt(state.chainState?.balances[wallet.role])}
                      </strong>
                      <small>test USD₮</small>
                    </div>
                  ))}
                  <div>
                    <span>ESCROW</span>
                    <strong>{usdt(state.chainState?.balances.ESCROW)}</strong>
                    <small>
                      {state.chainState?.funded ? "funded" : "waiting"}
                    </small>
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
                    <dd>
                      {usdt(state.chainState?.releasedAmountMicroUsdt)} USD₮
                    </dd>
                  </div>
                </dl>
                {Object.entries(state.transactions ?? {}).map(
                  ([name, hash]) => (
                    <div className="transaction" key={hash}>
                      <span>{name.toUpperCase()} TX</span>
                      <code>{shortHex(hash, 12)}</code>
                    </div>
                  ),
                )}
              </aside>
            </div>
          </>
        )}

        {error ? <div className="error-banner">! {error}</div> : null}
      </section>

      <section className="event-section">
        <header>
          <span className="section-label">AUDIT TRAIL</span>
          <h2>What actually happened</h2>
        </header>
        <div className="event-log">
          {state.events.length === 0 ? (
            <p className="empty-event">
              Run the demo to create signed evidence.
            </p>
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
                  <strong>{eventLabel(event.type)}</strong>
                  <code>
                    {shortHex(
                      String(
                        event.detail.transactionHash ??
                          event.detail.authorizationDigest ??
                          "",
                      ),
                      12,
                    )}
                  </code>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="architecture" id="architecture">
        <header>
          <span className="section-label">TRACK HONESTY</span>
          <h2>WDK is the load-bearing stack.</h2>
        </header>
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
              Four encrypted local seed phrases. Each actor signs from its own
              WDK-derived address.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Wallet execution</h3>
            <p>
              Exact-operation policies permit only token approval, escrow
              funding, and verified release.
            </p>
          </article>
          <article className="honesty-card">
            <span>FOCUS</span>
            <h3>No decorative tracks</h3>
            <p>
              This build enters WDK. Pears and QVAC are not claimed because they
              are not required for this proof.
            </p>
          </article>
        </div>
      </section>

      <section className="run-section" id="run">
        <div>
          <span className="section-label">JUDGE-RUNNABLE</span>
          <h2>One command. One real deal.</h2>
          <p>
            Node 22.17+ is required. The command starts Hardhat, Fastify, and
            Next.js together.
          </p>
        </div>
        <pre>
          <code>
            <span>$</span> npm install{"\n"}
            <span>$</span> npm run demo{"\n"}
            <span>→</span> http://localhost:3000
          </code>
        </pre>
      </section>

      <footer>
        <span>LA FORZA / TETHER DEVELOPERS CUP</span>
        <span>LOCAL TEST ASSETS ONLY · NO REAL FUNDS</span>
      </footer>
    </main>
  );
}

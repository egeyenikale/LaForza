const facts = [
  [
    "01",
    "Policy-bound",
    "Agents negotiate only inside human-authored wallet limits.",
  ],
  [
    "02",
    "Multi-party signed",
    "Buyer, seller, and player approve the same canonical terms.",
  ],
  [
    "03",
    "Milestone settled",
    "USD₮ releases against explicit, auditable deal events.",
  ],
] as const;

export default function HomePage() {
  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="DEADLINE home">
          <span className="brand-mark">D</span>
          <span>DEADLINE</span>
        </a>
        <div className="nav-meta">
          <span>SEPOLIA</span>
          <span className="live-dot" />
          <span>TRANSFER WINDOW OPEN</span>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow">AGENTIC FOOTBALL FINANCE / TETHER WDK</div>
        <h1>
          The deal closes.
          <br />
          <em>Not your control.</em>
        </h1>
        <p className="hero-copy">
          Club agents negotiate, sign, and settle football deals in USD₮—inside
          strict human budgets, with self-custodial wallets and on-chain
          milestones.
        </p>
        <div className="actions">
          <a className="primary-button" href="#deal-room">
            Enter deal room <span>↗</span>
          </a>
          <a
            className="text-link"
            href="https://github.com/egeyenikale/LaForza"
          >
            View source
          </a>
        </div>
      </section>

      <section className="ticker" aria-label="Product summary">
        <span>SELF-CUSTODY</span>
        <i>◆</i>
        <span>POLICY ENFORCEMENT</span>
        <i>◆</i>
        <span>EIP-712 OFFERS</span>
        <i>◆</i>
        <span>PROGRAMMABLE USD₮</span>
      </section>

      <section className="deal-room" id="deal-room">
        <header>
          <div>
            <span className="section-label">LIVE DEAL / LF-001</span>
            <h2>Striker loan agreement</h2>
          </div>
          <div className="countdown">
            <span>WINDOW CLOSES IN</span>
            <strong>07:59:42</strong>
          </div>
        </header>

        <div className="room-grid">
          <article className="club-card club-card--dark">
            <span>BUYING CLUB AGENT</span>
            <h3>Istanbul United</h3>
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
                <dt>Wallet status</dt>
                <dd className="safe">POLICY ACTIVE</dd>
              </div>
            </dl>
          </article>

          <div className="deal-arrow" aria-hidden="true">
            ↔
          </div>

          <article className="club-card">
            <span>SELLING CLUB AGENT</span>
            <h3>Lisbon Athletic</h3>
            <dl>
              <div>
                <dt>Asking amount</dt>
                <dd>900 USD₮</dd>
              </div>
              <div>
                <dt>Signing release</dt>
                <dd>500 USD₮</dd>
              </div>
              <div>
                <dt>Terms status</dt>
                <dd>COUNTERED</dd>
              </div>
            </dl>
          </article>
        </div>

        <div className="blocked-event">
          <span className="blocked-icon">!</span>
          <div>
            <strong>1,100 USD₮ offer blocked before signing</strong>
            <p>
              Policy LF-BUY-01: total exceeds the agent&apos;s 1,000 USD₮
              mandate.
            </p>
          </div>
          <code>WDK / DENY</code>
        </div>
      </section>

      <section className="principles">
        {facts.map(([number, title, detail]) => (
          <article key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{detail}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

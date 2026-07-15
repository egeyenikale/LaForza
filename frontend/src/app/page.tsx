import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="landing-page">
      <nav className="nav landing-nav">
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
          <a href="#product">Product</a>
          <a href="#control">Control</a>
          <a href="#stack">Stack</a>
        </div>
        <Link className="nav-demo-link" href="/app">
          TRY DEMO →
        </Link>
      </nav>

      <section className="hero landing-hero">
        <div className="hero-shade" />
        <div className="hero-content landing-hero-content">
          <div className="landing-hero-copy">
            <div className="eyebrow">FOOTBALL OPERATIONS / TETHER WDK</div>
            <h1>
              The transfer desk,
              <br />
              <em>finally on-chain.</em>
            </h1>
            <p className="hero-copy">
              Select a player, negotiate within a club mandate, sign from a real
              MetaMask account, and settle test USD₮ through a programmable EVM
              escrow.
            </p>
            <div className="actions">
              <Link className="primary-button" href="/app">
                Try the live demo <span>↗</span>
              </Link>
              <a className="text-link" href="#product">
                See how it works
              </a>
            </div>
            <div className="hero-proof">
              <span>REAL METAMASK SIGNATURES</span>
              <span>6-DECIMAL TEST USD₮</span>
              <span>EVM ESCROW RECEIPTS</span>
            </div>
          </div>
        </div>
      </section>

      <section className="ticker" aria-label="Product capabilities">
        <span>PLAYER DISCOVERY</span>
        <i>✦</i>
        <span>OFFER CONTROL</span>
        <i>✦</i>
        <span>SELF-CUSTODY</span>
        <i>✦</i>
        <span>PROGRAMMABLE TEST USD₮</span>
      </section>

      <section className="landing-section" id="product">
        <div className="landing-section-copy">
          <span className="section-label">ONE TRANSFER FILE</span>
          <h2>Follow the deal, not six disconnected tools.</h2>
          <p>
            La Forza keeps the shortlist, incoming ask, counteroffer, human
            approval, signatures, escrow funding, evidence and payout receipts
            in one operating surface.
          </p>
          <Link className="inline-button" href="/app">
            Open the transfer desk →
          </Link>
        </div>
        <div className="landing-number-grid">
          <article>
            <b>01</b>
            <span>Choose a player</span>
            <p>Inspect football and contract context before money moves.</p>
          </article>
          <article>
            <b>02</b>
            <span>Control the offer</span>
            <p>WDK policy rejects oversized terms and escalates exceptions.</p>
          </article>
          <article>
            <b>03</b>
            <span>Sign & settle</span>
            <p>MetaMask funds the exact approved EVM escrow in test USD₮.</p>
          </article>
        </div>
      </section>

      <section className="landing-control" id="control">
        <div>
          <span className="section-label">THE CONTROL MODEL</span>
          <h2>Agents prepare. Humans authorize. Contracts enforce.</h2>
        </div>
        <dl>
          <div>
            <dt>1,000 USD₮</dt>
            <dd>Maximum club mandate</dd>
          </div>
          <div>
            <dt>750 USD₮</dt>
            <dd>Human approval threshold</dd>
          </div>
          <div>
            <dt>3 signatures</dt>
            <dd>Buyer, club and player</dd>
          </div>
        </dl>
      </section>

      <section className="landing-stack" id="stack">
        <article>
          <span>WDK</span>
          <h3>Policy-bound football actors</h3>
          <p>
            Seller, player and verifier use encrypted WDK EVM accounts with
            narrow transaction permissions.
          </p>
        </article>
        <article>
          <span>METAMASK</span>
          <h3>The fan-facing self-custody boundary</h3>
          <p>
            The connected club account signs EIP-712 terms and submits the token
            approval and escrow funding transactions itself.
          </p>
        </article>
        <article>
          <span>SOLIDITY</span>
          <h3>Money follows the evidence</h3>
          <p>
            A three-signature escrow pays the signing bonus immediately and
            releases the milestone only after verification.
          </p>
        </article>
      </section>

      <section className="landing-cta">
        <span className="section-label">LOCAL EVM / REAL WALLET PROMPTS</span>
        <h2>Ready to run the transfer?</h2>
        <p>No mainnet funds. Every asset in the demo is a local test token.</p>
        <Link className="primary-button" href="/app">
          Launch La Forza <span>↗</span>
        </Link>
      </section>

      <footer>
        <span>LA FORZA / TETHER DEVELOPERS CUP</span>
        <span>LANDING / APP ROUTE: /APP</span>
      </footer>
    </main>
  );
}

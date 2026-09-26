import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/guardian/SiteNav";
import { Reveal } from "@/components/guardian/Reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GUARDIAN — MCP Governance Gateway" },
      {
        name: "description",
        content:
          "GUARDIAN scores every MCP tool call, demands human approval when risk requires it, detects approval fatigue, and can hit the emergency stop.",
      },
      { property: "og:title", content: "GUARDIAN — MCP Governance Gateway" },
      {
        property: "og:description",
        content:
          "A governance layer between AI agents and their tools: risk scoring, human approval, integrity hashing, audit trail.",
      },
    ],
  }),
  component: Landing,
});

const PANELS = [
  {
    no: "01",
    title: "Risk Engine",
    body: "Scores actions from context, sensitivity and impact — deterministically, every time.",
  },
  {
    no: "02",
    title: "Human Gate",
    body: "Critical actions wait for an explicit human decision. No silent execution.",
  },
  {
    no: "03",
    title: "Circuit Breaker",
    body: "Suspicious request bursts pause automated execution until an operator resets it.",
  },
];

const FLOW = [
  { no: "01", label: "MCP Request", note: "Agent asks for a tool" },
  { no: "02", label: "Risk Scan", note: "Weights, modifiers, drift" },
  { no: "03", label: "Human Approval", note: "Read-time floor enforced" },
  { no: "04", label: "Hash / Integrity", note: "SHA-256 canonical payload" },
  { no: "05", label: "Execute / Block", note: "Outcome written to audit" },
];

const POWERS = [
  { letter: "R", title: "Risk Engine", body: "Base score plus weighted rules for destruction, credentials, privilege, bulk and production scope." },
  { letter: "A", title: "Approval Manager", body: "Suspends the call, opens a session, and releases execution only on an explicit human decision." },
  { letter: "F", title: "Fatigue Detector", body: "Counts prompts in a rolling ten-minute window and escalates when the operator is being worn down." },
  { letter: "C", title: "Circuit Breaker", body: "Detects request bursts and pauses all automated execution until manually re-armed." },
  { letter: "H", title: "Hash Manager", body: "Canonical SHA-256 of the payload at approval and at execution — mismatch means blocked." },
  { letter: "L", title: "Audit Logger", body: "Every score, rule hit, z-score, timing verdict and outcome recorded in an append-only feed." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      {/* ---------------------------- HERO ---------------------------- */}
      <section className="relative overflow-hidden border-b-2 border-foreground">
        <div className="pointer-events-none absolute inset-0 grid-floor opacity-60" />
        <div className="pointer-events-none absolute -right-1/4 -top-1/2 h-[140vh] w-[140vh] rays opacity-25" />
        <div className="pointer-events-none absolute inset-0 halftone opacity-30" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-[60vh] w-[60vh] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div>
            <span className="label-tag text-gold">Issue #01 — Human In The Loop</span>
            <h1 className="mt-6 text-[3.3rem] leading-[0.88] sm:text-7xl lg:text-8xl">
              When AI <span className="glitch-text text-primary">acts,</span>
              <br />
              who watches?
            </h1>
            <p className="mt-7 max-w-xl text-base text-muted-foreground sm:text-lg">
              A governance gateway that evaluates MCP actions, asks humans for approval when risk
              demands it, detects approval fatigue, and can hit the emergency stop.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link to="/demo" className="btn-hero">
                Enter the Control Room
              </Link>
              <a href="#threat" className="btn-ghost">
                See the Mission
              </a>
            </div>
          </div>

          {/* guardian core */}
          <div className="relative mx-auto flex h-[320px] w-[320px] items-center justify-center sm:h-[420px] sm:w-[420px]">
            <div className="absolute inset-0 spin-slow rounded-full border-2 border-dashed border-foreground/40" />
            <div className="absolute inset-8 spin-rev rounded-full border border-primary/70" />
            <div className="absolute inset-16 spin-slow rounded-full border-2 border-gold/50" />
            <div className="absolute inset-24 rounded-full bg-primary/25 blur-3xl" />
            <div className="float-slow relative flex h-40 w-40 flex-col items-center justify-center rounded-full border-2 border-primary bg-background text-center sm:h-48 sm:w-48">
              <span className="font-display text-xl leading-tight text-primary sm:text-2xl">
                HUMAN
                <br />
                IN THE
                <br />
                LOOP
              </span>
            </div>
          </div>
        </div>

        <div className="warn-stripes h-3 w-full opacity-80" />
      </section>

      {/* --------------------------- THREAT --------------------------- */}
      <section id="threat" className="relative border-b-2 border-foreground px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <span className="label-tag text-primary">Panel 01 — The Threat</span>
            <h2 className="mt-5 text-5xl sm:text-7xl">
              Too many
              <br />
              <span className="text-primary">yes buttons.</span>
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <div className="panel mt-10 max-w-3xl p-6 sm:p-8">
              <span className="label-tag text-gold">Approval Fatigue</span>
              <p className="mt-4 text-lg text-foreground/90">
                Continuous approval requests can condition a reviewer to approve without meaningful
                scrutiny. The tenth prompt gets a fraction of the attention the first one did — and
                that is exactly where the damaging action slips through.
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PANELS.map((p, i) => (
              <Reveal key={p.no} delay={i * 120}>
                <article className="panel-soft group h-full p-6 transition-transform hover:-translate-y-1 hover:border-primary">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-5xl text-primary/70">{p.no}</span>
                    <span className="label-tag text-muted-foreground">Module</span>
                  </div>
                  <h3 className="mt-4 text-2xl">{p.title}</h3>
                  <p className="mt-3 text-sm text-muted-foreground">{p.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------- HOW IT WORKS ---------------------- */}
      <section id="how" className="relative overflow-hidden border-b-2 border-foreground px-4 py-20 sm:px-6">
        <div className="pointer-events-none absolute inset-0 speedlines opacity-[0.06]" />
        <div className="relative mx-auto max-w-7xl">
          <Reveal>
            <span className="label-tag text-primary">Panel 02 — How It Works</span>
            <h2 className="mt-5 text-5xl sm:text-7xl">
              Every action
              <br />
              leaves a trail.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-5">
            {FLOW.map((step, i) => {
              const emphasised = step.no === "03";
              return (
                <Reveal key={step.no} delay={i * 140}>
                  <div
                    className={`${emphasised ? "panel-hot" : "panel-soft"} flex h-full flex-col justify-between p-5`}
                  >
                    <span
                      className={`font-display text-4xl ${emphasised ? "text-primary" : "text-foreground/40"}`}
                    >
                      {step.no}
                    </span>
                    <div className="mt-6">
                      <h3 className={`text-xl ${emphasised ? "text-primary" : ""}`}>{step.label}</h3>
                      <p className="mt-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        {step.note}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ----------------------------- POWERS ------------------------- */}
      <section id="powers" className="border-b-2 border-foreground px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <span className="label-tag text-primary">Panel 03 — Powers</span>
            <h2 className="mt-5 text-5xl sm:text-7xl">Six systems. One gate.</h2>
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {POWERS.map((p, i) => (
              <Reveal key={p.letter} delay={i * 90}>
                <article className="group relative h-full overflow-hidden border-2 border-foreground bg-panel p-6 transition-all hover:border-primary hover:shadow-[8px_8px_0_0_var(--primary)]">
                  <div className="absolute -right-3 -top-6 font-display text-[7rem] leading-none text-foreground/5 transition-colors group-hover:text-primary/20">
                    {p.letter}
                  </div>
                  <div className="relative">
                    <span className="flex h-12 w-12 items-center justify-center border-2 border-primary font-display text-2xl text-primary">
                      {p.letter}
                    </span>
                    <h3 className="mt-5 text-2xl">{p.title}</h3>
                    <p className="mt-3 text-sm text-muted-foreground">{p.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------ CTA --------------------------- */}
      <section className="relative overflow-hidden px-4 py-24 sm:px-6">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[80vh] w-[80vh] -translate-x-1/2 -translate-y-1/2 rays opacity-20" />
        <div className="relative mx-auto max-w-4xl text-center">
          <h2 className="text-5xl sm:text-7xl">
            Ready to
            <br />
            <span className="text-primary">see it work?</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
            The control room runs the real governance engine — live risk scoring, approval sessions,
            read-time floors, integrity hashes and an audit feed.
          </p>
          <Link to="/demo" className="btn-hero mt-10">
            Launch Live Demo ↗
          </Link>
        </div>
      </section>

      <footer className="border-t-2 border-foreground px-4 py-8 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground sm:px-6">
        GUARDIAN // MCP Governance Gateway — original identity, no affiliation with any comic
        publisher.
      </footer>
    </div>
  );
}

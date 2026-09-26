import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAuditLogs,
  resolveApprovalSession,
  sendToolCall,
  setBreaker,
  type InterceptResponse,
} from "@/lib/guardian/api";
import { buildToolCall, TOOL_CALL_CATALOG } from "@/lib/guardian/catalog";
import { zoneLabel, type AuditRecord, type SystemStats } from "@/lib/guardian/types";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Control Room — GUARDIAN Governance Gateway" },
      {
        name: "description",
        content:
          "Live GUARDIAN control room: intercepted MCP tool calls, risk meter, human approval gate, circuit breaker and audit feed.",
      },
      { property: "og:title", content: "Control Room — GUARDIAN" },
      {
        property: "og:description",
        content: "Watch MCP tool calls get scored, suspended, approved or blocked in real time.",
      },
    ],
  }),
  component: ControlRoom,
});

type EventItem = { time: string; label: string; detail: string; tone: "info" | "good" | "bad" | "warn" };

const SAFETY_SYSTEMS = ["Risk Engine", "Approval Manager", "Hash Manager", "Audit Logger"];

function now() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function ControlRoom() {
  const [decision, setDecision] = useState<InterceptResponse | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    requests: 0,
    highRisk: 0,
    approvals: 0,
    rejections: 0,
    breakerTripped: false,
    fatigueCount: 0,
    fatigued: false,
  });
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<{ text: string; tone: "good" | "bad" | "warn" } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [readSeconds, setReadSeconds] = useState(0);
  const [busy, setBusy] = useState(false);

  const counter = useRef(42);
  const index = useRef(0);
  const shownAt = useRef(0);

  const addEvent = useCallback((label: string, detail: string, tone: EventItem["tone"] = "info") => {
    setEvents((prev) => [{ time: now(), label, detail, tone }, ...prev].slice(0, 40));
  }, []);

  const refreshLogs = useCallback(async () => {
    try {
      const data = await fetchAuditLogs();
      setLogs(data.logs);
      setStats(data.stats);
    } catch {
      /* preview offline */
    }
  }, []);

  /** Sends the next tool call from the catalog through the governance gateway. */
  const loadRequest = useCallback(async () => {
    setOutcome(null);
    setBusy(false);
    counter.current += 1;
    const call = buildToolCall(index.current, counter.current);
    index.current = (index.current + 1) % TOOL_CALL_CATALOG.length;

    const result = await sendToolCall(call);
    setDecision(result);
    shownAt.current = Date.now();
    setReadSeconds(0);

    addEvent("REQUEST RECEIVED", call.toolName, "info");
    addEvent("RISK ENGINE", `Score: ${result.riskScore} · ${zoneLabel(result.zone)}`, "info");

    if (result.status === "EXECUTED") {
      addEvent("AUTO CLEARANCE", "Low risk — executed without human review", "good");
      setOutcome({ text: "AUTO EXECUTED", tone: "good" });
      scheduleNext();
    } else if (result.status === "REJECTED") {
      addEvent("BLOCKED", result.reason, "bad");
      setOutcome({ text: "BLOCKED", tone: "bad" });
    } else {
      addEvent("APPROVAL REQUIRED", "Human decision required", "warn");
    }
    refreshLogs();
  }, [addEvent, refreshLogs]);

  /** Arms the 10–20s countdown before the next request arrives. */
  const scheduleNext = useCallback(() => {
    setCountdown(10 + Math.floor(Math.random() * 11));
  }, []);

  // Countdown ticker -> loads next request at zero.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      loadRequest();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, loadRequest]);

  // Read-time ticker for the approval gate.
  useEffect(() => {
    if (!decision || (decision.status !== "SUSPENDED" && decision.status !== "HARD_FLAGGED")) return;
    const t = setInterval(() => setReadSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [decision]);

  // First request on mount.
  useEffect(() => {
    loadRequest();
    const poll = setInterval(refreshLogs, 5000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(action: "APPROVE" | "REJECT") {
    if (!decision?.sessionId || busy) return;
    setBusy(true);
    const { result } = await resolveApprovalSession(decision.sessionId, action);

    if (result.status === "TOO_FAST") {
      setToast("Approval Fatigue Guard: read-time floor violated. Action blocked.");
      addEvent("FATIGUE GUARD", "Clicked too fast to read the payload", "bad");
      setTimeout(() => setToast(null), 4000);
      setBusy(false);
      refreshLogs();
      return;
    }

    if (result.status === "EXPIRED") {
      setToast("Session expired. Loading the next request.");
      addEvent("SESSION EXPIRED", "Approval window closed", "warn");
      setTimeout(() => setToast(null), 3500);
      scheduleNext();
      return;
    }

    if (result.status === "TAMPERED") {
      addEvent("INTEGRITY ALERT", "Payload altered during suspension", "bad");
      setOutcome({ text: "EXECUTION BLOCKED", tone: "bad" });
    } else if (result.status === "APPROVED") {
      addEvent("HUMAN DECISION", "APPROVED", "good");
      addEvent("HASH VERIFIED", "Integrity check passed", "good");
      addEvent("EXECUTION", "Action authorized", "good");
      setOutcome({ text: "EXECUTION AUTHORIZED", tone: "good" });
    } else {
      addEvent("HUMAN DECISION", "REJECTED", "bad");
      addEvent("EXECUTION", "Action blocked", "bad");
      setOutcome({ text: "EXECUTION BLOCKED", tone: "bad" });
    }

    refreshLogs();
    scheduleNext();
  }

  async function onBurst() {
    const s = await setBreaker("TRIP");
    setStats(s);
    setCountdown(null);
    setDecision(null);
    setOutcome({ text: "CIRCUIT BREAKER TRIPPED", tone: "bad" });
    addEvent("CIRCUIT BREAKER", "Request burst detected — automated execution paused", "bad");
    setToast("CIRCUIT BREAKER TRIPPED — automated execution paused.");
    setTimeout(() => setToast(null), 4500);
    refreshLogs();
  }

  async function onReset() {
    const s = await setBreaker("RESET");
    setStats(s);
    addEvent("CIRCUIT BREAKER", "Reset by operator — request flow resumed", "good");
    setOutcome(null);
    loadRequest();
  }

  const awaitingHuman =
    decision?.status === "SUSPENDED" || decision?.status === "HARD_FLAGGED";
  const floorSec = decision?.timingFloors ? Math.ceil(decision.timingFloors.hardFloorMs / 1000) : 0;
  const readReady = readSeconds >= floorSec;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b-2 border-foreground bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="font-display text-xl sm:text-2xl">
            GUARDIAN <span className="text-primary">// CONTROL ROOM</span>
          </Link>
          <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest">
            <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-online" />
            <span>System Online</span>
            <span className="text-muted-foreground">Governance Gate Active</span>
          </div>
        </div>
        <div className="warn-stripes h-2 w-full opacity-70" />
      </header>

      {toast && (
        <div className="sticky top-[76px] z-40 border-y-2 border-primary bg-primary/20 px-4 py-3 text-center font-display uppercase tracking-widest text-primary-foreground flash-alert">
          {toast}
        </div>
      )}

      <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
        {/* stats */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Requests" value={String(stats.requests)} />
          <StatCard label="High Risk" value={String(stats.highRisk)} tone="hot" />
          <StatCard label="Approvals" value={String(stats.approvals)} />
          <StatCard
            label="Circuit Breaker"
            value={stats.breakerTripped ? "TRIPPED" : "ARMED"}
            tone={stats.breakerTripped ? "hot" : "ok"}
          />
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* request + approval */}
          <div className="space-y-6">
            <section className={`${awaitingHuman ? "panel-hot" : "panel-soft"} p-5 sm:p-7`}>
              {stats.breakerTripped ? (
                <div className="py-10 text-center">
                  <h2 className="text-4xl text-primary sm:text-5xl">Automated execution paused</h2>
                  <p className="mt-4 text-muted-foreground">
                    The circuit breaker is tripped. No MCP request will be processed until an
                    operator re-arms the gate.
                  </p>
                  <button onClick={onReset} className="btn-hero mt-8">
                    Reset Breaker
                  </button>
                </div>
              ) : decision ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="label-tag text-muted-foreground">Request ID</span>
                      <p className="mt-2 font-mono text-lg text-gold">{decision.toolCall.id}</p>
                    </div>
                    <div className="text-right">
                      <span className="label-tag text-muted-foreground">Actor / Environment</span>
                      <p className="mt-2 font-mono text-sm">
                        {decision.toolCall.actorId} · {decision.toolCall.environment}
                      </p>
                    </div>
                  </div>

                  <h2 className="mt-6 text-4xl sm:text-5xl">{decision.toolCall.toolName}</h2>

                  <div className="mt-5 grid gap-5 md:grid-cols-[1.2fr_1fr]">
                    <div>
                      <span className="label-tag text-muted-foreground">Arguments</span>
                      <pre className="mt-2 max-h-52 overflow-auto border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground/90">
                        {JSON.stringify(decision.toolCall.arguments, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <span className="label-tag text-muted-foreground">Risk</span>
                      <div className="mt-2 flex items-end gap-3">
                        <span className="font-display text-6xl text-primary">
                          {decision.riskScore}
                        </span>
                        <span className="pb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                          Zone {zoneLabel(decision.zone)}
                        </span>
                      </div>
                      <div className="mt-3 h-3 w-full border border-border bg-background">
                        <div
                          className="h-full bg-primary transition-[width] duration-700"
                          style={{ width: `${Math.min(100, decision.riskScore)}%` }}
                        />
                      </div>

                      <span className="label-tag mt-5 inline-block text-muted-foreground">
                        Rules Fired
                      </span>
                      <ul className="mt-2 space-y-1 font-mono text-xs">
                        {decision.ruleHits.length === 0 && (
                          <li className="text-muted-foreground">No rules fired</li>
                        )}
                        {decision.ruleHits.map((r) => (
                          <li key={r.ruleId} className="flex justify-between gap-3">
                            <span>{r.ruleId.replace(/_/g, " ")}</span>
                            <span className={r.weight < 0 ? "text-online" : "text-primary"}>
                              {r.weight > 0 ? `+${r.weight}` : r.weight}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <p className="mt-5 break-all font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                    SHA-256 {decision.canonicalHash}
                  </p>

                  {/* human gate */}
                  {awaitingHuman && (
                    <div className="mt-6 border-t-2 border-primary pt-6">
                      <h3 className="text-3xl text-primary">Human decision required</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        This action is waiting for an explicit administrator decision.{" "}
                        {readReady
                          ? "Read-time floor satisfied."
                          : `Minimum review time ${floorSec}s — ${Math.max(0, floorSec - readSeconds)}s remaining.`}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-4">
                        <button
                          onClick={() => decide("APPROVE")}
                          disabled={busy}
                          className="btn-hero disabled:opacity-50"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => decide("REJECT")}
                          disabled={busy}
                          className="btn-ghost disabled:opacity-50"
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {outcome && (
                    <div
                      className={`mt-6 border-2 p-4 text-center font-display text-2xl uppercase tracking-widest ${
                        outcome.tone === "good"
                          ? "border-online text-online"
                          : outcome.tone === "warn"
                            ? "border-gold text-gold"
                            : "border-primary text-primary"
                      }`}
                    >
                      {outcome.text}
                    </div>
                  )}
                </>
              ) : (
                <p className="py-16 text-center font-mono uppercase tracking-widest text-muted-foreground">
                  Awaiting interception…
                </p>
              )}
            </section>

            {/* breaker + fatigue */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="panel-soft p-5">
                <span className="label-tag text-muted-foreground">Circuit Breaker Drill</span>
                <p className="mt-3 text-sm text-muted-foreground">
                  Simulate 20 tool calls inside the 10-second detection window.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button onClick={onBurst} className="btn-hero !px-4 !py-2 !text-sm">
                    ⚡ Simulate Request Burst
                  </button>
                  <button onClick={onReset} className="btn-ghost !px-4 !py-2 !text-sm">
                    Reset Breaker
                  </button>
                </div>
              </div>

              <div className="panel-soft p-5">
                <span className="label-tag text-muted-foreground">Approval Fatigue</span>
                <p
                  className={`mt-3 font-display text-3xl ${stats.fatigued ? "text-primary" : "text-online"}`}
                >
                  {stats.fatigued ? "ELEVATED" : "NORMAL"}
                </p>
                <p className="mt-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {stats.fatigueCount} prompts / 10 min window
                </p>
                {stats.fatigued && (
                  <p className="mt-2 text-sm text-primary">Rapid approval pattern detected.</p>
                )}
              </div>
            </section>
          </div>

          {/* right column */}
          <div className="space-y-6">
            <section className="panel-soft p-5">
              <div className="flex items-center justify-between">
                <span className="label-tag text-muted-foreground">Next Request</span>
                <span className="font-display text-3xl text-gold">
                  {stats.breakerTripped ? "—" : countdown !== null ? `${countdown}s` : "LIVE"}
                </span>
              </div>
            </section>

            <section className="panel-soft p-5">
              <span className="label-tag text-muted-foreground">Safety Systems</span>
              <ul className="mt-4 space-y-2 font-mono text-xs uppercase tracking-widest">
                {SAFETY_SYSTEMS.map((s) => (
                  <li key={s} className="flex items-center justify-between">
                    <span>{s}</span>
                    <span className="flex items-center gap-2 text-online">
                      <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-online" />
                      Online
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between">
                  <span>Circuit Breaker</span>
                  <span className={stats.breakerTripped ? "text-primary" : "text-online"}>
                    {stats.breakerTripped ? "Tripped" : "Armed"}
                  </span>
                </li>
              </ul>
            </section>

            <section className="panel-soft flex max-h-[520px] flex-col p-5">
              <span className="label-tag text-muted-foreground">Event Log</span>
              <ul className="mt-4 space-y-3 overflow-auto pr-1">
                {events.map((e, i) => (
                  <li key={`${e.time}-${i}`} className="rise-in border-l-2 border-border pl-3">
                    <p className="font-mono text-[0.65rem] tracking-widest text-muted-foreground">
                      {e.time}
                    </p>
                    <p
                      className={`font-display text-sm uppercase tracking-widest ${
                        e.tone === "good"
                          ? "text-online"
                          : e.tone === "bad"
                            ? "text-primary"
                            : e.tone === "warn"
                              ? "text-gold"
                              : "text-foreground"
                      }`}
                    >
                      {e.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{e.detail}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel-soft max-h-[360px] overflow-auto p-5">
              <span className="label-tag text-muted-foreground">Audit Trail</span>
              <ul className="mt-4 space-y-2 font-mono text-[0.68rem]">
                {logs.map((l) => (
                  <li key={l.id + l.timestamp} className="flex justify-between gap-2 border-b border-border pb-1">
                    <span className="truncate">{l.toolName}</span>
                    <span className="text-muted-foreground">S{l.computedScore}</span>
                    <span
                      className={l.outcome === "EXECUTED" ? "text-online" : "text-primary"}
                    >
                      {l.outcome}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "hot" | "ok";
}) {
  return (
    <div className="panel-soft p-5">
      <span className="label-tag text-muted-foreground">{label}</span>
      <p
        className={`mt-3 font-display text-4xl ${
          tone === "hot" ? "text-primary" : tone === "ok" ? "text-online" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

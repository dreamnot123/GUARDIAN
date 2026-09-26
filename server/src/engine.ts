// GUARDIAN governance engine — server-only.
// Direct port of the mcp-governance-proxy backend (risk engine, timing engine,
// fatigue tracker, integrity monitor, session store, audit logger, interceptor)
// plus a circuit breaker for burst detection.

import { createHash } from "node:crypto";
import type {
  ApprovalResolution,
  AuditRecord,
  GovernanceDecision,
  MCPToolCall,
  RiskAnalysisResult,
  RuleHit,
  SystemStats,
  TimingFloors,
  TimingVerdict,
  Zone,
} from "./types.js";

export const GOVERNANCE_CONFIG = {
  S0_BASE_SCORE: 20,
  WEIGHTS: {
    READ_ONLY: -25,
    METADATA: -20,
    CREATE: 10,
    UPDATE: 15,
    DESTRUCTIVE_WRITE: 30,
    CREDENTIAL_ACCESS: 40,
    FINANCIAL_TRANSACTION: 35,
    PRIVILEGE_CHANGE: 40,
    CODE_EXECUTION: 35,
    NETWORK_CALL: 15,
    COMMUNICATION: 10,
    BULK_OPERATION: 20,
    PRODUCTION_SCOPE: 25,
  },
  SENSITIVE_ACTION_TYPES: [
    "CREDENTIAL_ACCESS",
    "FINANCIAL_TRANSACTION",
    "PRIVILEGE_CHANGE",
  ],
  TIMING: {
    GLOBAL_MIN_FLOOR_MS: 2000,
    PROSE_WPM_HARD: 344,
    PROSE_WPM_SOFT: 260,
    CODE_LINE_SEC_HARD: 1.2,
    CODE_LINE_SEC_SOFT: 2.0,
    CODE_LINE_MIN_HARD_SEC: 6.0,
    CODE_LINE_MIN_SOFT_SEC: 10.0,
    FIELD_SEC_HARD: 1.5,
    FIELD_SEC_SOFT: 3.0,
  },
  ZONES: {
    ZONE_1_MAX: 30,
    ZONE_2_MAX: 60,
    MAX_FATIGUE_COUNT_10MIN: 5,
  },
  BREAKER: {
    BURST_WINDOW_MS: 10_000,
    BURST_LIMIT: 20,
  },
  DRIFT_LAMBDA: 5.0,
};

const W = GOVERNANCE_CONFIG.WEIGHTS;

const RULE_FOR_ACTION: Record<
  string,
  { ruleId: string; description: string; weight: number } | undefined
> = {
  READ_ONLY: { ruleId: "READ_ONLY_DISCOUNT", description: "Read-only operation discount", weight: W.READ_ONLY },
  METADATA: { ruleId: "METADATA_DISCOUNT", description: "Metadata check discount", weight: W.METADATA },
  CREATE: { ruleId: "CREATE_RESOURCE", description: "Create new resource", weight: W.CREATE },
  UPDATE: { ruleId: "UPDATE_RESOURCE", description: "Update existing resource", weight: W.UPDATE },
  DESTRUCTIVE_WRITE: { ruleId: "DESTRUCTIVE_WRITE", description: "Destructive write or deletion", weight: W.DESTRUCTIVE_WRITE },
  CREDENTIAL_ACCESS: { ruleId: "CREDENTIAL_ACCESS", description: "Credential or secret access", weight: W.CREDENTIAL_ACCESS },
  FINANCIAL_TRANSACTION: { ruleId: "FINANCIAL_TRANSACTION", description: "Financial transaction execution", weight: W.FINANCIAL_TRANSACTION },
  PRIVILEGE_CHANGE: { ruleId: "PRIVILEGE_CHANGE", description: "Privilege or permission modification", weight: W.PRIVILEGE_CHANGE },
  CODE_EXECUTION: { ruleId: "CODE_EXECUTION", description: "Arbitrary command or code execution", weight: W.CODE_EXECUTION },
  NETWORK_CALL: { ruleId: "NETWORK_CALL", description: "External network request", weight: W.NETWORK_CALL },
  COMMUNICATION: { ruleId: "COMMUNICATION_SEND", description: "External message or communication dispatch", weight: W.COMMUNICATION },
};

/* ------------------------------- risk engine ------------------------------ */

function calculateZScore(history: number[]): number {
  if (!history || history.length < 5) return 0;
  const mean = history.reduce((s, v) => s + v, 0) / history.length;
  const variance = history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return ((history[history.length - 1] ?? mean) - mean) / stdDev;
}

export function evaluateRisk(toolCall: MCPToolCall, history: number[] = []): RiskAnalysisResult {
  const baseScore = GOVERNANCE_CONFIG.S0_BASE_SCORE;
  const ruleHits: RuleHit[] = [];
  const actionType = (toolCall.actionType || "READ_ONLY").toUpperCase();
  const isSensitive = GOVERNANCE_CONFIG.SENSITIVE_ACTION_TYPES.includes(actionType);

  const rule = RULE_FOR_ACTION[actionType];
  const isDiscount = actionType === "READ_ONLY" || actionType === "METADATA";
  if (rule && (!isDiscount || !isSensitive)) ruleHits.push({ ...rule });

  if (toolCall.metadata?.isBulk) {
    ruleHits.push({
      ruleId: "BULK_OPERATION",
      description: "Bulk data operation modifier",
      weight: W.BULK_OPERATION,
    });
  }
  if (toolCall.environment === "production") {
    ruleHits.push({
      ruleId: "PRODUCTION_ENV",
      description: "Production environment modifier",
      weight: W.PRODUCTION_SCOPE,
    });
  }

  const zScore = calculateZScore(history);
  const driftTerm = GOVERNANCE_CONFIG.DRIFT_LAMBDA * Math.abs(zScore);
  const weightsSum = ruleHits.reduce((acc, h) => acc + h.weight, 0);
  const finalScore = Math.max(0, Math.round(baseScore + weightsSum + driftTerm));

  let zone: Zone = "ZONE_1";
  if (finalScore >= GOVERNANCE_CONFIG.ZONES.ZONE_2_MAX) zone = "ZONE_3_4";
  else if (finalScore >= GOVERNANCE_CONFIG.ZONES.ZONE_1_MAX) zone = "ZONE_2";

  return { baseScore, finalScore, ruleHits, zScore, zone, suppressReadOnlyDiscount: isSensitive };
}

/* ------------------------------ timing engine ----------------------------- */

export function calculateFloors(toolCall: MCPToolCall): TimingFloors {
  const payloadStr = JSON.stringify(toolCall.arguments || {}, null, 2);
  const wordCount = (payloadStr.match(/\b\w+\b/g) || []).length;
  const lineCount = (payloadStr.match(/\n/g) || []).length + 1;
  const fieldCount = Object.keys(toolCall.arguments || {}).length;
  const T = GOVERNANCE_CONFIG.TIMING;

  const proseSecHard = (wordCount / T.PROSE_WPM_HARD) * 60;
  const proseSecSoft = (wordCount / T.PROSE_WPM_SOFT) * 60;

  let codeSecHard = lineCount * T.CODE_LINE_SEC_HARD;
  let codeSecSoft = lineCount * T.CODE_LINE_SEC_SOFT;
  if (toolCall.actionType === "CODE_EXECUTION") {
    codeSecHard = Math.max(codeSecHard, T.CODE_LINE_MIN_HARD_SEC);
    codeSecSoft = Math.max(codeSecSoft, T.CODE_LINE_MIN_SOFT_SEC);
  }

  const fieldSecHard = fieldCount * T.FIELD_SEC_HARD;
  const fieldSecSoft = fieldCount * T.FIELD_SEC_SOFT;

  const hardFloorMs = Math.max(
    T.GLOBAL_MIN_FLOOR_MS,
    Math.round((proseSecHard + codeSecHard + fieldSecHard) * 1000),
  );
  const softFloorMs = Math.max(
    hardFloorMs + 1000,
    Math.round((proseSecSoft + codeSecSoft + fieldSecSoft) * 1000),
  );

  return { hardFloorMs, softFloorMs, wordCount, lineCount, fieldCount };
}

export function evaluateTiming(tShown: number, tClick: number, floors: TimingFloors): TimingVerdict {
  const delta = tClick - tShown;
  if (delta < floors.hardFloorMs) return "TOO_FAST";
  if (delta < floors.softFloorMs) return "FAST";
  return "TIMELY";
}

/* --------------------------------- state ---------------------------------- */

interface SuspendedSession {
  sessionId: string;
  toolCall: MCPToolCall;
  riskResult: RiskAnalysisResult;
  canonicalHash: string;
  tShown: number;
  timingFloors: TimingFloors;
  requiresReConfirmation: boolean;
  confirmationAttempts: number;
}

interface GuardianState {
  sessions: Map<string, SuspendedSession>;
  actorHistory: Map<string, number[]>;
  promptTimestamps: Map<string, number[]>;
  requestTimestamps: number[];
  logs: AuditRecord[];
  breakerTripped: boolean;
  stats: { requests: number; highRisk: number; approvals: number; rejections: number };
}

const globalRef = globalThis as unknown as { __guardian?: GuardianState };

function state(): GuardianState {
  if (!globalRef.__guardian) {
    globalRef.__guardian = {
      sessions: new Map(),
      actorHistory: new Map(),
      promptTimestamps: new Map(),
      requestTimestamps: [],
      logs: [],
      breakerTripped: false,
      stats: { requests: 0, highRisk: 0, approvals: 0, rejections: 0 },
    };
  }
  return globalRef.__guardian;
}

/* ------------------------------ integrity --------------------------------- */

function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    out[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return out;
}

export function canonicalHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(sortKeys(payload))).digest("hex");
}

/* ------------------------------- fatigue ---------------------------------- */

const FATIGUE_WINDOW_MS = 10 * 60 * 1000;

function recordPrompt(actorId: string): number {
  const s = state();
  const now = Date.now();
  const active = (s.promptTimestamps.get(actorId) || []).filter((t) => now - t <= FATIGUE_WINDOW_MS);
  active.push(now);
  s.promptTimestamps.set(actorId, active);
  return active.length;
}

function fatigueCount(actorId: string): number {
  const now = Date.now();
  return (state().promptTimestamps.get(actorId) || []).filter((t) => now - t <= FATIGUE_WINDOW_MS)
    .length;
}

function isFatigued(actorId: string): boolean {
  return fatigueCount(actorId) >= GOVERNANCE_CONFIG.ZONES.MAX_FATIGUE_COUNT_10MIN;
}

/* -------------------------------- audit ----------------------------------- */

function log(record: AuditRecord): void {
  const s = state();
  s.logs.unshift(record);
  if (s.logs.length > 100) s.logs.pop();
}

export function getRecentLogs(): AuditRecord[] {
  return state().logs.slice(0, 40);
}

export function getStats(actorId = "agent_01"): SystemStats {
  const s = state();
  return {
    ...s.stats,
    breakerTripped: s.breakerTripped,
    fatigueCount: fatigueCount(actorId),
    fatigued: isFatigued(actorId),
  };
}

/* --------------------------- circuit breaker ------------------------------ */

function recordRequestForBreaker(): void {
  const s = state();
  const now = Date.now();
  s.requestTimestamps = s.requestTimestamps.filter(
    (t) => now - t <= GOVERNANCE_CONFIG.BREAKER.BURST_WINDOW_MS,
  );
  s.requestTimestamps.push(now);
  if (s.requestTimestamps.length >= GOVERNANCE_CONFIG.BREAKER.BURST_LIMIT) s.breakerTripped = true;
}

export function simulateBurst(count = 20): SystemStats {
  const s = state();
  const now = Date.now();
  for (let i = 0; i < count; i++) s.requestTimestamps.push(now);
  s.breakerTripped = true;
  log({
    id: `audit_${Date.now()}`,
    timestamp: new Date().toISOString(),
    toolName: "circuit_breaker",
    actorId: "guardian",
    computedScore: 100,
    ruleHits: [],
    zScore: 0,
    zone: "ZONE_3_4",
    outcome: "HARD_FLAGGED",
    outcomeReason: `Request burst detected (${count} calls / ${GOVERNANCE_CONFIG.BREAKER.BURST_WINDOW_MS / 1000}s). Automated execution paused.`,
  });
  return getStats();
}

export function resetBreaker(): SystemStats {
  const s = state();
  s.breakerTripped = false;
  s.requestTimestamps = [];
  log({
    id: `audit_${Date.now()}`,
    timestamp: new Date().toISOString(),
    toolName: "circuit_breaker",
    actorId: "guardian",
    computedScore: 0,
    ruleHits: [],
    zScore: 0,
    zone: "ZONE_1",
    outcome: "EXECUTED",
    outcomeReason: "Circuit breaker reset by operator. Request flow resumed.",
  });
  return getStats();
}

/* ------------------------------ interceptor ------------------------------- */

export function intercept(toolCall: MCPToolCall): GovernanceDecision {
  const s = state();
  const timestamp = Date.now();
  const actorId = toolCall.actorId || "anonymous_actor";
  const hash = canonicalHash(toolCall.arguments || {});

  if (s.breakerTripped) {
    log({
      id: `audit_${timestamp}`,
      timestamp: new Date(timestamp).toISOString(),
      toolName: toolCall.toolName,
      actorId,
      computedScore: 0,
      ruleHits: [],
      zScore: 0,
      zone: "ZONE_3_4",
      outcome: "REJECTED",
      outcomeReason: "Circuit breaker is tripped. Automated execution paused.",
    });
    return {
      status: "BLOCKED",
      reason: "Circuit breaker is tripped. Automated execution paused.",
      riskScore: 0,
      zone: "ZONE_3_4",
      ruleHits: [],
      canonicalHash: hash,
      toolCall,
      fatigueCount: fatigueCount(actorId),
      fatigued: isFatigued(actorId),
      breakerTripped: true,
    };
  }

  recordRequestForBreaker();
  s.stats.requests += 1;

  const history = s.actorHistory.get(actorId) || [];
  const riskResult = evaluateRisk(toolCall, history);
  history.push(riskResult.finalScore);
  if (history.length > 50) history.shift();
  s.actorHistory.set(actorId, history);

  const promptCount = recordPrompt(actorId);
  const fatigued = isFatigued(actorId);
  const floors = calculateFloors(toolCall);

  if (riskResult.zone === "ZONE_3_4") s.stats.highRisk += 1;

  if (riskResult.zone === "ZONE_1" && !fatigued) {
    s.stats.approvals += 0;
    log({
      id: `audit_${timestamp}`,
      timestamp: new Date(timestamp).toISOString(),
      toolName: toolCall.toolName,
      actorId,
      computedScore: riskResult.finalScore,
      ruleHits: riskResult.ruleHits,
      zScore: riskResult.zScore,
      zone: "ZONE_1",
      hashExecution: hash,
      outcome: "EXECUTED",
      outcomeReason: "Low-risk action passed automated clearance.",
    });
    return {
      status: "APPROVED",
      reason: "Low-risk action passed automated clearance.",
      riskScore: riskResult.finalScore,
      zone: "ZONE_1",
      ruleHits: riskResult.ruleHits,
      canonicalHash: hash,
      timingFloors: floors,
      toolCall,
      fatigueCount: promptCount,
      fatigued,
      breakerTripped: false,
    };
  }

  const sessionId = `sess_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;
  s.sessions.set(sessionId, {
    sessionId,
    toolCall,
    riskResult,
    canonicalHash: hash,
    tShown: timestamp,
    timingFloors: floors,
    requiresReConfirmation: fatigued,
    confirmationAttempts: 0,
  });

  const reason =
    riskResult.zone === "ZONE_3_4"
      ? "High-risk action suspended. Requires explicit human review."
      : fatigued
        ? "Action escalated to suspension due to rapid prompt velocity / fatigue threshold."
        : "Action flagged for operator review.";

  log({
    id: `audit_${timestamp}`,
    timestamp: new Date(timestamp).toISOString(),
    toolName: toolCall.toolName,
    actorId,
    computedScore: riskResult.finalScore,
    ruleHits: riskResult.ruleHits,
    zScore: riskResult.zScore,
    zone: riskResult.zone,
    hashApproval: hash,
    outcome: "HARD_FLAGGED",
    outcomeReason: reason,
  });

  return {
    status: "SUSPENDED",
    sessionId,
    reason,
    riskScore: riskResult.finalScore,
    zone: riskResult.zone,
    ruleHits: riskResult.ruleHits,
    canonicalHash: hash,
    timingFloors: floors,
    toolCall,
    fatigueCount: promptCount,
    fatigued,
    breakerTripped: false,
  };
}

export function resolveApproval(
  sessionId: string,
  action: "APPROVE" | "REJECT",
  tClick: number,
): ApprovalResolution {
  const s = state();
  const session = s.sessions.get(sessionId);
  if (!session) {
    return { success: false, message: "Approval session not found or expired.", status: "EXPIRED" };
  }

  if (action === "REJECT") {
    s.sessions.delete(sessionId);
    s.stats.rejections += 1;
    log({
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      toolName: session.toolCall.toolName,
      actorId: session.toolCall.actorId,
      computedScore: session.riskResult.finalScore,
      ruleHits: session.riskResult.ruleHits,
      zScore: session.riskResult.zScore,
      zone: session.riskResult.zone,
      hashApproval: session.canonicalHash,
      outcome: "REJECTED",
      outcomeReason: "Action rejected by operator. Execution blocked.",
    });
    return { success: true, message: "Execution blocked by operator.", status: "REJECTED" };
  }

  const verdict = evaluateTiming(session.tShown, tClick, session.timingFloors);
  if (verdict === "TOO_FAST") {
    session.confirmationAttempts += 1;
    return {
      success: false,
      verdict,
      status: "TOO_FAST",
      message: `Approval clicked too quickly. Minimum review time is ${Math.round(
        session.timingFloors.hardFloorMs / 1000,
      )}s — read the payload before deciding.`,
    };
  }

  // Integrity: re-hash the payload at execution time and compare with the
  // hash the human approved.
  const executionHash = canonicalHash(session.toolCall.arguments || {});
  const integrityVerified = executionHash === session.canonicalHash;

  s.sessions.delete(sessionId);
  s.stats.approvals += 1;

  log({
    id: `audit_${Date.now()}`,
    timestamp: new Date().toISOString(),
    toolName: session.toolCall.toolName,
    actorId: session.toolCall.actorId,
    computedScore: session.riskResult.finalScore,
    ruleHits: session.riskResult.ruleHits,
    zScore: session.riskResult.zScore,
    zone: session.riskResult.zone,
    timingVerdict: verdict,
    hashApproval: session.canonicalHash,
    hashExecution: executionHash,
    outcome: integrityVerified ? "EXECUTED" : "HARD_FLAGGED",
    outcomeReason: integrityVerified
      ? "Action approved and released for execution."
      : "Integrity mismatch — payload changed after approval. Execution blocked.",
  });

  return {
    success: true,
    verdict,
    status: "ACCEPTED",
    message: integrityVerified
      ? "Execution authorized."
      : "Integrity check failed. Execution blocked.",
    executionHash,
    integrityVerified,
  };
}

/* ------------------------------- pending ---------------------------------- */

export function getPendingSessions() {
  return Array.from(state().sessions.values()).map((s) => ({
    sessionId: s.sessionId,
    toolCall: s.toolCall,
    riskResult: s.riskResult,
    canonicalHash: s.canonicalHash,
    tShown: s.tShown,
    timingFloors: s.timingFloors,
    requiresReConfirmation: s.requiresReConfirmation,
    confirmationAttempts: s.confirmationAttempts,
  }));
}

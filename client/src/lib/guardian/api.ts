// Client for the GUARDIAN governance server (see ../../../../server).
// Set VITE_GUARDIAN_API_URL to point at a different server instance.

import type {
  ApprovalResolution,
  AuditRecord,
  GovernanceDecision,
  MCPToolCall,
  SystemStats,
} from "./types";

const EXTERNAL = import.meta.env["VITE_GUARDIAN_API_URL"] as string | undefined;
const BASE = (EXTERNAL || "http://localhost:3000").replace(/\/$/, "");

export type InterceptStatus = "EXECUTED" | "REJECTED" | "SUSPENDED" | "HARD_FLAGGED";

export type InterceptResponse = Omit<GovernanceDecision, "status"> & { status: InterceptStatus };

export type ResolutionStatus = "APPROVED" | "REJECTED" | "TOO_FAST" | "EXPIRED" | "TAMPERED";

export type ResolutionResponse = Omit<ApprovalResolution, "status"> & {
  status: ResolutionStatus;
  reason: string;
};

export async function sendToolCall(toolCall: MCPToolCall): Promise<InterceptResponse> {
  const res = await fetch(`${BASE}/intercept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...toolCall, timestamp: Date.now(), payload: toolCall.arguments }),
  });
  return (await res.json()) as InterceptResponse;
}

export async function resolveApprovalSession(
  sessionId: string,
  action: "APPROVE" | "REJECT",
): Promise<{ httpStatus: number; result: ResolutionResponse }> {
  const tClick = Date.now();
  const res = await fetch(`${BASE}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, action, tClick }),
  });
  return { httpStatus: res.status, result: (await res.json()) as ResolutionResponse };
}

export async function fetchAuditLogs(): Promise<{ logs: AuditRecord[]; stats: SystemStats }> {
  const res = await fetch(`${BASE}/logs`);
  return (await res.json()) as { logs: AuditRecord[]; stats: SystemStats };
}

export async function fetchPendingQueue(): Promise<unknown[]> {
  const res = await fetch(`${BASE}/pending`);
  const data = (await res.json()) as { sessions: unknown[] };
  return data.sessions;
}

export async function setBreaker(action: "TRIP" | "RESET"): Promise<SystemStats> {
  const res = await fetch(`${BASE}/breaker`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = (await res.json()) as { stats: SystemStats };
  return data.stats;
}

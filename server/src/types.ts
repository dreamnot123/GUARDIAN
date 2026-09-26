// Shared, browser-safe types for the GUARDIAN governance gateway.
// Ported from github.com/mfarhanz/mcp-governance-proxy

export type ActionType =
  | "READ_ONLY"
  | "METADATA"
  | "CREATE"
  | "UPDATE"
  | "DESTRUCTIVE_WRITE"
  | "CREDENTIAL_ACCESS"
  | "FINANCIAL_TRANSACTION"
  | "PRIVILEGE_CHANGE"
  | "CODE_EXECUTION"
  | "NETWORK_CALL"
  | "COMMUNICATION";

export type Zone = "ZONE_1" | "ZONE_2" | "ZONE_3_4";

export type TimingVerdict = "TOO_FAST" | "FAST" | "TIMELY";

export interface MCPToolCall {
  id: string;
  toolName: string;
  actorId: string;
  environment: "production" | "staging" | "development";
  arguments: Record<string, unknown>;
  actionType: ActionType;
  metadata?: {
    isBulk?: boolean;
    targetScope?: string;
    description?: string;
  };
}

export interface RuleHit {
  ruleId: string;
  description: string;
  weight: number;
}

export interface RiskAnalysisResult {
  baseScore: number;
  finalScore: number;
  ruleHits: RuleHit[];
  zScore: number;
  zone: Zone;
  suppressReadOnlyDiscount: boolean;
}

export interface TimingFloors {
  hardFloorMs: number;
  softFloorMs: number;
  wordCount: number;
  lineCount: number;
  fieldCount: number;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  toolName: string;
  actorId: string;
  computedScore: number;
  ruleHits: RuleHit[];
  zScore: number;
  zone: Zone;
  timingVerdict?: TimingVerdict;
  hashApproval?: string;
  hashExecution?: string;
  outcome: "EXECUTED" | "REJECTED" | "HARD_FLAGGED";
  outcomeReason: string;
}

export interface GovernanceDecision {
  status: "APPROVED" | "SUSPENDED" | "REJECTED" | "BLOCKED";
  sessionId?: string;
  reason: string;
  riskScore: number;
  zone: Zone;
  ruleHits: RuleHit[];
  canonicalHash: string;
  timingFloors?: TimingFloors;
  toolCall: MCPToolCall;
  fatigueCount: number;
  fatigued: boolean;
  breakerTripped: boolean;
}

export interface ApprovalResolution {
  success: boolean;
  message: string;
  verdict?: TimingVerdict;
  status: "ACCEPTED" | "REJECTED" | "TOO_FAST" | "EXPIRED";
  executionHash?: string;
  integrityVerified?: boolean;
}

export interface SystemStats {
  requests: number;
  highRisk: number;
  approvals: number;
  rejections: number;
  breakerTripped: boolean;
  fatigueCount: number;
  fatigued: boolean;
}

export function zoneLabel(zone: Zone): string {
  if (zone === "ZONE_1") return "1 — LOW RISK";
  if (zone === "ZONE_2") return "2 — ELEVATED";
  return "3 — HIGH RISK";
}

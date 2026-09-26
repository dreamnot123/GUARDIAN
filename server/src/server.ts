// GUARDIAN governance server — plain Node HTTP, no framework.
// Endpoints: POST /intercept, POST /approve, GET /pending, GET /logs, GET|POST /breaker
import http from "node:http";
import {
  intercept,
  resolveApproval,
  getPendingSessions,
  getRecentLogs,
  getStats,
  simulateBurst,
  resetBreaker,
} from "./engine.js";
import type { MCPToolCall } from "./types.js";

const PORT = Number(process.env.PORT ?? 3000);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function send(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(data));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  const { pathname } = new URL(req.url ?? "/", "http://localhost");

  try {
    if (req.method === "POST" && pathname === "/intercept") {
      const body = await readJson(req);
      if (!body.toolName || !body.actionType) {
        return send(res, 400, { error: "Missing required fields: toolName and actionType are mandatory." });
      }
      const toolCall: MCPToolCall = {
        id: body.id || `call_${Date.now()}`,
        toolName: body.toolName,
        actorId: body.actorId || "anonymous_actor",
        environment: body.environment || "production",
        actionType: body.actionType,
        arguments: body.arguments || body.payload || {},
        metadata: body.metadata || {},
      };
      const decision = intercept(toolCall);
      const status =
        decision.status === "APPROVED"
          ? "EXECUTED"
          : decision.status === "BLOCKED" || decision.status === "REJECTED"
            ? "REJECTED"
            : decision.zone === "ZONE_3_4"
              ? "HARD_FLAGGED"
              : "SUSPENDED";
      return send(res, 200, { ...decision, status, id: toolCall.id });
    }

    if (req.method === "POST" && pathname === "/approve") {
      const body = await readJson(req);
      if (!body.sessionId || !body.action) {
        return send(res, 400, { error: "Missing required fields: sessionId and action are mandatory." });
      }
      const r = resolveApproval(body.sessionId, body.action, body.tClick || Date.now());
      const status =
        r.status === "ACCEPTED" ? (r.integrityVerified === false ? "TAMPERED" : "APPROVED") : r.status;
      const success = status === "APPROVED" || status === "REJECTED";
      return send(res, success ? 200 : status === "EXPIRED" ? 404 : 400, {
        ...r,
        success,
        status,
        reason: r.message,
      });
    }

    if (req.method === "GET" && pathname === "/pending") {
      return send(res, 200, { sessions: getPendingSessions() });
    }

    if (req.method === "GET" && pathname === "/logs") {
      return send(res, 200, { logs: getRecentLogs(), stats: getStats() });
    }

    if (pathname === "/breaker") {
      if (req.method === "GET") return send(res, 200, { stats: getStats() });
      if (req.method === "POST") {
        const body = await readJson(req);
        const stats = body.action === "RESET" ? resetBreaker() : simulateBurst(body.count || 20);
        return send(res, 200, { stats });
      }
    }

    send(res, 404, { error: "Not found" });
  } catch (err) {
    send(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
  }
});

server.listen(PORT, () => {
  console.log(`GUARDIAN governance server listening on http://localhost:${PORT}`);
});

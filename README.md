# GUARDIAN — MCP Governance Gateway

> When AI acts, who watches?

GUARDIAN is a deterministic governance layer that sits between an AI agent and its MCP tools.
Every tool call is risk-scored, high-risk actions wait for a human, reflexive "yes" clicks are
detected, and the exact approved payload is hash-locked so it can't change before it runs.

## Repository structure

```text
guardian/
├── client/                 # Web app: landing page + live control room
│   ├── src/
│   │   ├── routes/         # index.tsx (landing), demo.tsx (control room)
│   │   ├── components/     # guardian/ UI pieces + shared ui/ components
│   │   ├── lib/guardian/   # api.ts (server client), types.ts, catalog.ts (demo tool calls)
│   │   └── styles.css      # design system
│   └── .env.example
└── server/                 # Governance engine + HTTP API (Node, zero runtime deps)
    ├── src/
    │   ├── engine.ts       # risk engine, timing floors, fatigue, integrity, audit, breaker
    │   ├── types.ts        # shared governance types
    │   └── server.ts       # HTTP endpoints
    └── .env.example
```

## Quick start

Requires Node.js 20+.

```bash
# 1. Start the server (http://localhost:3000)
cd server
npm install
npm run dev

# 2. In another terminal, start the client (http://localhost:8080)
cd client
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:8080 and click **Live Demo**.

## API

| Method | Path         | Body                                            | Returns |
| ------ | ------------ | ----------------------------------------------- | ------- |
| POST   | `/intercept` | `{ toolName, actionType, environment?, arguments?, metadata? }` | `EXECUTED` \| `REJECTED` \| `SUSPENDED` \| `HARD_FLAGGED` (+ `sessionId`, risk score, rules fired) |
| POST   | `/approve`   | `{ sessionId, action: "APPROVE" \| "REJECT", tClick }` | `APPROVED` \| `REJECTED` \| `TOO_FAST` \| `EXPIRED` \| `TAMPERED` |
| GET    | `/pending`   | —                                               | `{ sessions }` |
| GET    | `/logs`      | —                                               | `{ logs, stats }` |
| GET/POST | `/breaker` | `{ action: "TRIP" \| "RESET" }`                | `{ stats }` |

Example:

```bash
curl -X POST http://localhost:3000/intercept \
  -H "Content-Type: application/json" \
  -d '{"toolName":"db.drop_table","actionType":"DELETE","environment":"production"}'
```

## How it works

1. **Risk engine** — base score plus weighted rules (destruction, credentials, privilege, bulk, production).
2. **Zones** — low risk executes, medium needs approval, high risk is hard-flagged.
3. **Timing floors** — approvals faster than a minimum read time are rejected as `TOO_FAST`.
4. **Fatigue detector** — too many prompts in a 10-minute window escalates friction.
5. **Integrity hash** — canonical SHA-256 of the payload at approval and at execution; mismatch = `TAMPERED`.
6. **Circuit breaker** — request bursts pause all automated execution until reset.
7. **Audit log** — every decision is recorded.

No AI is used in the decision path — every outcome traces to a named rule or formula.

## Tech

- **Client:** React 19, TanStack Start, Vite, Tailwind CSS
- **Server:** Node.js, TypeScript, built-in `http` and `crypto`

## Credits

Governance design based on [mcp-governance-proxy](https://github.com/mfarhanz/mcp-governance-proxy).

## Deploying

**Client (Vercel):** import the repo, set **Root Directory** to `client`, framework preset "Other"
(build command `npm run build`). Add env var `VITE_GUARDIAN_API_URL` = your server's public URL.

**Server (Render / Railway / any Node host):** root directory `server`, build `npm install && npm run build`,
start `npm start`. The engine keeps state in memory, so it needs a long-running process —
don't deploy it as serverless functions.

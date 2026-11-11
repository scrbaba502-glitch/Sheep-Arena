# A² Sheep Arena — Cloudflare authoritative multiplayer backend

This is the isolated multiplayer migration track. The existing Vercel game remains on the default branch and is not changed by this draft PR.

## Implemented

- Cloudflare Worker routes for health checks, room creation, joining by six-character invite code, and WebSocket upgrades.
- One SQLite-backed Durable Object per room, with two player slots and server-issued player tokens.
- WebSocket Hibernation-compatible handlers, presence, emoji events, ping/pong, and delayed cleanup for empty rooms.
- Server-owned 7×7 match-3 boards, legal-swap validation, match detection, cascades, gravity/refill, critical hits, damage, rage, HP, and chokeslam stun.
- Serialized Durable Object state events to prevent overlapping move races, plus move sequence checks, message-size limits, per-second message limits, and a minimum action interval.
- Reconnect snapshots that restore each player's board, HP, rage, stun duration, and next move sequence; browser session tokens are stored locally for same-device reload recovery.
- Client heartbeat and automatic reconnect attempts, with a temporary opponent-disconnect grace period.
- Synchronized rematch reset after both players accept.
- A browser adapter in `cloudflare-client.js`. The existing PeerJS path remains the fallback until a Worker URL is configured.

## Security boundary

Clients send **swap coordinates**, not damage numbers or HP values. The Durable Object validates each move and calculates board changes and combat outcomes. The server also validates the rage ability and applies stun. This is a much stronger anti-cheat boundary than the old PeerJS client-reported attack relay.

This is not yet a production launch: the frontend/server protocol still needs two-device integration testing against a deployed Worker, reconnect testing under real network changes, and quota/latency observation.

## Local development

Requirements: Node.js 20+ and npm.

```sh
cd cloudflare
npm install
npm run typecheck
npm test
npm audit --audit-level=high
node validate-frontend.mjs
npm run dev
```

Worker routes:

- `GET /health`
- `POST /api/rooms` — create a room; returns `code`, `player`, and `playerToken`.
- `POST /api/rooms/:code/join` — claim the second player slot; returns `player` and `playerToken`.
- `GET /api/rooms/:code/ws?token=...` — upgrade to WebSocket.

When a Worker is eventually deployed, configure the frontend with its HTTPS URL before the main game script runs (or set `localStorage.setItem("a2cfapi", "https://YOUR-WORKER.workers.dev")`). Until then, the adapter stays inactive and the existing PeerJS path remains available.

Set `ALLOWED_ORIGIN` to the exact frontend origin or a comma-separated allowlist of exact origins (for example, production plus the Vercel branch preview). Avoid broad wildcard origins in production. Keep player tokens private and never put them in shareable invite URLs; share only the room code.

## Deployment status

Not deployed. No Cloudflare account, zone, secrets, or production Worker has been configured by this repository change. The Vercel production frontend and the default GitHub branch remain untouched.

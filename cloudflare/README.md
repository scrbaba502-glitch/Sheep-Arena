# A² Sheep Arena — Cloudflare realtime backend

This directory contains the **separate backend migration track**. It does not change the current Vercel game or remove PeerJS from the live frontend.

## Current scope

- Cloudflare Worker routes for health checks, room creation, joining by six-character invite code, and WebSocket upgrades.
- One SQLite-backed Durable Object identity per room code.
- Two player slots per room, server-issued session tokens, message-size and message-rate limits.
- Presence, emoji, ping/pong, and attack-event relay.
- WebSocket Hibernation-compatible event handlers and delayed cleanup for empty rooms.
- Exact-origin CORS configuration through `ALLOWED_ORIGIN`.

## Important security boundary

This is the **transport and room-lifecycle foundation**, not the completed authoritative game simulation. The current browser game calculates match-3 clears, chains, critical hits, and damage locally. The backend currently bounds and relays attack values, but cannot truthfully prevent a modified client from reporting dishonest damage.

Before replacing PeerJS in production, the next stage must move the board rules and combat calculation to server-owned state (or implement a verifiable action protocol), then add reconnect/resume semantics and integration tests. Do not describe the current attack relay as cheat-proof.

## Local development

Requirements: Node.js 20+ and npm.

```sh
cd cloudflare
npm install
npm run typecheck
npm run dev
```

Worker routes:

- `GET /health`
- `POST /api/rooms` — create a room; returns `code`, `player`, and `playerToken`.
- `POST /api/rooms/:code/join` — claim the second player slot; returns `player` and `playerToken`.
- `GET /api/rooms/:code/ws?token=...` — upgrade to WebSocket.

For production, set `ALLOWED_ORIGIN` to the exact deployed frontend origin. Keep player tokens private and never put them in shareable invite URLs; share only the room code.

## Deployment status

Not deployed. No Cloudflare account, zone, secrets, or production Worker has been configured by this repository change.

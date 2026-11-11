import { DurableObject } from "cloudflare:workers";
import { createBoard, resolveMove, type Board } from "./game-engine";

export interface Env {
  MATCH_ROOMS: DurableObjectNamespace<MatchRoom>;
  ALLOWED_ORIGIN?: string;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function json(data: unknown, status = 200, origin = "*"): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "vary": "Origin"
    }
  });
}

function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function validCode(value: string): boolean {
  return value.length === CODE_LENGTH && [...value].every((c) => CODE_ALPHABET.includes(c));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsOrigin = allowedOrigin === "*" || requestOrigin === allowedOrigin ? allowedOrigin : "null";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": corsOrigin,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type,authorization",
          "access-control-max-age": "86400",
          "vary": "Origin"
        }
      });
    }

    if (requestOrigin && corsOrigin === "null") {
      return json({ error: "origin_not_allowed" }, 403, "null");
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "a2-sheep-arena-realtime", transport: "websocket" }, 200, corsOrigin);
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();
        const id = env.MATCH_ROOMS.idFromName(code);
        const stub = env.MATCH_ROOMS.get(id);
        const response = await stub.fetch("https://match-room.internal/create", { method: "POST" });
        if (response.status === 201) {
          const payload = await response.json() as Record<string, unknown>;
          return json({ ...payload, code }, 201, corsOrigin);
        }
        if (response.status !== 409) return json({ error: "room_create_failed" }, 503, corsOrigin);
      }
      return json({ error: "room_code_unavailable" }, 503, corsOrigin);
    }

    const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/join$/i);
    if (joinMatch && request.method === "POST") {
      const code = joinMatch[1].toUpperCase();
      if (!validCode(code)) return json({ error: "invalid_room_code" }, 400, corsOrigin);
      const stub = env.MATCH_ROOMS.get(env.MATCH_ROOMS.idFromName(code));
      const response = await stub.fetch("https://match-room.internal/join", { method: "POST" });
      return new Response(response.body, {
        status: response.status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": corsOrigin, "vary": "Origin" }
      });
    }

    const wsMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/ws$/i);
    if (wsMatch && request.method === "GET") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return json({ error: "websocket_upgrade_required" }, 426, corsOrigin);
      }
      const code = wsMatch[1].toUpperCase();
      if (!validCode(code)) return json({ error: "invalid_room_code" }, 400, corsOrigin);
      const stub = env.MATCH_ROOMS.get(env.MATCH_ROOMS.idFromName(code));
      const internalUrl = new URL(request.url);
      internalUrl.pathname = "/ws";
      return stub.fetch(new Request(internalUrl, request));
    }

    return json({ error: "not_found" }, 404, corsOrigin);
  }
};

type PlayerId = "p1" | "p2";
type PlayerAttachment = { playerId: PlayerId; lastMessageAt: number; messageWindowAt: number; messageCount: number };
type PlayerPresence = { name?: string; hat?: string; ready?: boolean };
type ServerPlayerState = { board: Board; hp: number; rage: number; seq: number; lastMoveAt: number; stunnedUntil: number };
type MatchState = { status: "active" | "finished"; players: Record<PlayerId, ServerPlayerState>; winner?: PlayerId; startedAt: number };

const MAX_MESSAGE_BYTES = 2048;
const MAX_MESSAGES_PER_SECOND = 12;
const ROOM_IDLE_MS = 2 * 60 * 1000;

export class MatchRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === "/create" && request.method === "POST") {
      const existing = await this.ctx.storage.get<boolean>("created");
      if (existing) return new Response("{}", { status: 409 });
      const token = crypto.randomUUID();
      await this.ctx.storage.put("created", true);
      await this.ctx.storage.put("players", { p1: token, p2: null });
      await this.ctx.storage.put("presence", { p1: {}, p2: {} });
      await this.ctx.storage.put("lastActivity", Date.now());
      await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
      return Response.json({ playerToken: token, player: "p1" }, { status: 201 });
    }

    if (path === "/join" && request.method === "POST") {
      const players = await this.ctx.storage.get<{ p1: string; p2: string | null }>("players");
      if (!players) return Response.json({ error: "room_not_found" }, { status: 404 });
      if (players.p2) return Response.json({ error: "room_full" }, { status: 409 });
      const token = crypto.randomUUID();
      players.p2 = token;
      await this.ctx.storage.put("players", players);
      await this.ctx.storage.put("lastActivity", Date.now());
      await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
      return Response.json({ playerToken: token, player: "p2" }, { status: 200 });
    }

    if (path === "/ws" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const token = new URL(request.url).searchParams.get("token");
      if (!token) return Response.json({ error: "missing_token" }, { status: 401 });
      const players = await this.ctx.storage.get<{ p1: string; p2: string | null }>("players");
      if (!players) return Response.json({ error: "room_not_found" }, { status: 404 });
      const playerId: PlayerId | null = token === players.p1 ? "p1" : token === players.p2 ? "p2" : null;
      if (!playerId) return Response.json({ error: "invalid_token" }, { status: 401 });

      for (const existing of this.ctx.getWebSockets()) {
        const current = existing.deserializeAttachment() as PlayerAttachment | null;
        if (current?.playerId === playerId) this.close(existing, 4001, "session_replaced");
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId, lastMessageAt: 0, messageWindowAt: Date.now(), messageCount: 0 } satisfies PlayerAttachment);
      server.send(JSON.stringify({ type: "connected", player: playerId, protocol: 1 }));
      const presence = (await this.ctx.storage.get<Record<PlayerId, PlayerPresence>>("presence")) ?? { p1: {}, p2: {} };
      const connectedPlayers = this.ctx.getWebSockets().map((active) => (active.deserializeAttachment() as PlayerAttachment | null)?.playerId).filter(Boolean);
      server.send(JSON.stringify({ type: "room_snapshot", presence, connectedPlayers }));
      await this.ctx.storage.put("lastActivity", Date.now());
      this.broadcast({ type: "peer_state", player: playerId, connected: true }, server);
      if (this.ctx.getWebSockets().length === 2) await this.ensureMatch();
      else await this.sendMatchState(server, playerId, "match_snapshot");
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as PlayerAttachment | null;
    if (!attachment) return this.close(socket, 1008, "invalid_session");

    const size = typeof raw === "string" ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
    if (size > MAX_MESSAGE_BYTES) return this.close(socket, 1009, "message_too_large");

    const now = Date.now();
    if (now - attachment.messageWindowAt >= 1000) {
      attachment.messageWindowAt = now;
      attachment.messageCount = 0;
    }
    attachment.messageCount++;
    if (attachment.messageCount > MAX_MESSAGES_PER_SECOND) return this.close(socket, 1008, "rate_limited");
    socket.serializeAttachment(attachment);

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as Record<string, unknown>;
    } catch {
      return this.close(socket, 1007, "invalid_json");
    }

    if (!message || typeof message.type !== "string") return;
    const player = attachment.playerId;

    if (message.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", at: now }));
      return;
    }

    if (message.type === "presence") {
      const data = message.data as Record<string, unknown> | undefined;
      const clean: PlayerPresence = {};
      if (typeof data?.name === "string") clean.name = data.name.slice(0, 14);
      if (typeof data?.hat === "string") clean.hat = data.hat.slice(0, 8);

      if (typeof data?.ready === "boolean") clean.ready = data.ready;
      const presence = (await this.ctx.storage.get<Record<PlayerId, PlayerPresence>>("presence")) ?? { p1: {}, p2: {} };
      presence[player] = { ...presence[player], ...clean };
      await this.ctx.storage.put("presence", presence);
      this.broadcast({ type: "presence", player, data: clean }, socket);
      if (clean.ready) {
        const game = await this.ctx.storage.get<MatchState>("match");
        if (game?.status === "finished" && presence.p1.ready && presence.p2.ready) {
          presence.p1.ready = false; presence.p2.ready = false;
          await this.ctx.storage.put("presence", presence);
          this.broadcast({ type: "presence", player: "p1", data: { ready: false } });
          this.broadcast({ type: "presence", player: "p2", data: { ready: false } });
          await this.ctx.storage.delete("match");
          await this.ensureMatch();
          this.broadcast({ type: "rematch_started" });
        }
      }
      return;
    }

    if (message.type === "emoji") {
      const index = Number((message.data as Record<string, unknown> | undefined)?.index);
      if (!Number.isInteger(index) || index < 0 || index > 3) return;
      this.broadcast({ type: "emoji", player, data: { index } }, socket);
      return;
    }

    if (message.type === "move") {
      const data = message.data as Record<string, unknown> | undefined;
      const from = Number(data?.from), to = Number(data?.to), seq = Number(data?.seq);
      if (!Number.isInteger(from) || !Number.isInteger(to) || !Number.isInteger(seq) || seq < 1) {
        socket.send(JSON.stringify({ type: "move_rejected", reason: "invalid_move_payload" })); return;
      }
      const game = await this.ctx.storage.get<MatchState>("match");
      if (!game || game.status !== "active") {
        socket.send(JSON.stringify({ type: "move_rejected", reason: "match_not_active", seq })); return;
      }
      const own = game.players[player], rivalId: PlayerId = player === "p1" ? "p2" : "p1";
      const rival = game.players[rivalId];
      if (seq !== own.seq + 1) {
        socket.send(JSON.stringify({ type: "move_rejected", reason: "sequence_mismatch", seq, expectedSeq: own.seq + 1 })); return;
      }
      const now = Date.now();
      if (now < own.stunnedUntil) {
        socket.send(JSON.stringify({ type: "move_rejected", reason: "player_stunned", seq, expectedSeq: own.seq + 1 })); return;
      }
      if (now - own.lastMoveAt < 120) {
        socket.send(JSON.stringify({ type: "move_rejected", reason: "move_too_fast", seq, expectedSeq: own.seq + 1 })); return;
      }
      const result = resolveMove(own.board, from, to, 9, own.rage, crypto.getRandomValues(new Uint32Array(1))[0]);
      if (!result.accepted) {
        socket.send(JSON.stringify({ type: "move_rejected", reason: result.reason, seq, expectedSeq: own.seq + 1 })); return;
      }
      own.board = result.board; own.rage = result.rage; own.seq = seq; own.lastMoveAt = now;
      const damage = result.attacks.reduce((sum, attack) => sum + attack.damage, 0);
      const stunMs = result.attacks.some(attack => attack.kind === "slam") ? 2600 : 0;
      rival.hp = Math.max(0, rival.hp - damage);
      if (stunMs) rival.stunnedUntil = now + stunMs;
      if (rival.hp <= 0) { game.status = "finished"; game.winner = player; }
      await this.ctx.storage.put("match", game);
      socket.send(JSON.stringify({ type: "move_result", seq, board: own.board, rage: own.rage, attacks: result.attacks, hp: own.hp, opponentHp: rival.hp, chains: result.chains, status: game.status }));
      this.sendToPlayer(rivalId, { type: "incoming_attack", player, attacks: result.attacks, damage, hp: rival.hp, opponentHp: own.hp, stunMs, status: game.status });
      if (game.status === "finished") this.broadcast({ type: "match_over", winner: game.winner, hp: { p1: game.players.p1.hp, p2: game.players.p2.hp } });
      return;
    }

    if (message.type === "special") {
      const game = await this.ctx.storage.get<MatchState>("match");
      if (!game || game.status !== "active") {
        socket.send(JSON.stringify({ type: "special_rejected", reason: "match_not_active" })); return;
      }
      const own = game.players[player], rivalId: PlayerId = player === "p1" ? "p2" : "p1";
      const rival = game.players[rivalId], now = Date.now();
      if (own.rage < 100) {
        socket.send(JSON.stringify({ type: "special_rejected", reason: "rage_not_ready" })); return;
      }
      if (now < own.stunnedUntil || now - own.lastMoveAt < 120) {
        socket.send(JSON.stringify({ type: "special_rejected", reason: "action_not_ready" })); return;
      }
      own.rage = 0; own.lastMoveAt = now; rival.hp = Math.max(0, rival.hp - 46);
      rival.stunnedUntil = now + 2600;
      if (rival.hp <= 0) { game.status = "finished"; game.winner = player; }
      await this.ctx.storage.put("match", game);
      socket.send(JSON.stringify({ type: "special_result", kind: "slam", damage: 46, rage: own.rage, hp: own.hp, opponentHp: rival.hp, status: game.status }));
      this.sendToPlayer(rivalId, {
        type: "incoming_attack", player, attacks: [{ kind: "slam", damage: 46, chain: 0, cleared: 0, critical: false }],
        damage: 46, hp: rival.hp, opponentHp: own.hp, stunMs: 2600, status: game.status
      });
      if (game.status === "finished") this.broadcast({ type: "match_over", winner: game.winner, hp: { p1: game.players.p1.hp, p2: game.players.p2.hp } });
      return;
    }

    if (message.type === "rematch") {
      this.broadcast({ type: "rematch", player }, socket);
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = socket.deserializeAttachment() as PlayerAttachment | null;
    if (attachment) {
      const replacementActive = this.ctx.getWebSockets().some((active) => {
        if (active === socket) return false;
        const current = active.deserializeAttachment() as PlayerAttachment | null;
        return current?.playerId === attachment.playerId;
      });
      if (!replacementActive) this.broadcast({ type: "peer_state", player: attachment.playerId, connected: false });
    }
    await this.scheduleCleanup();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1011, "socket_error");
  }

  async alarm(): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length > 0) {
      await this.ctx.storage.put("lastActivity", Date.now());
      await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_MS);
      return;
    }
    const lastActivity = (await this.ctx.storage.get<number>("lastActivity")) ?? 0;
    if (Date.now() - lastActivity >= ROOM_IDLE_MS) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(lastActivity + ROOM_IDLE_MS);
  }

  private async ensureMatch(): Promise<void> {
    const existing = await this.ctx.storage.get<MatchState>("match");
    if (existing) {
      for (const socket of this.ctx.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as PlayerAttachment | null;
        if (attachment) await this.sendMatchState(socket, attachment.playerId, "match_snapshot");
      }
      return;
    }
    const seeds = crypto.getRandomValues(new Uint32Array(2));
    const match: MatchState = {
      status: "active", startedAt: Date.now(),
      players: {
        p1: { board: createBoard(seeds[0]), hp: 150, rage: 0, seq: 0, lastMoveAt: 0, stunnedUntil: 0 },
        p2: { board: createBoard(seeds[1]), hp: 150, rage: 0, seq: 0, lastMoveAt: 0, stunnedUntil: 0 }
      }
    };
    await this.ctx.storage.put("match", match);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as PlayerAttachment | null;
      if (attachment) await this.sendMatchState(socket, attachment.playerId, "match_started");
    }
  }

  private async sendMatchState(socket: WebSocket, playerId: PlayerId, type: string): Promise<void> {
    const game = await this.ctx.storage.get<MatchState>("match");
    if (!game) return;
    const rivalId: PlayerId = playerId === "p1" ? "p2" : "p1";
    const own = game.players[playerId], rival = game.players[rivalId];
    try {
      socket.send(JSON.stringify({
        type, player: playerId, board: own.board, hp: own.hp, opponentHp: rival.hp,
        rage: own.rage, nextSeq: own.seq + 1, stunRemaining: Math.max(0, own.stunnedUntil - Date.now()),
        status: game.status, winner: game.winner ?? null
      }));
    } catch { /* socket may have closed while snapshot was prepared */ }
  }

  private sendToPlayer(playerId: PlayerId, payload: unknown): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as PlayerAttachment | null;
      if (attachment?.playerId === playerId) {
        try { socket.send(encoded); } catch { /* closed socket */ }
      }
    }
  }

  private broadcast(payload: unknown, except?: WebSocket): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except) {
        try { socket.send(encoded); } catch { /* closed socket is removed by runtime */ }
      }
    }
  }

  private close(socket: WebSocket, code: number, reason: string): void {
    try { socket.close(code, reason); } catch { /* already closed */ }
  }

  private async scheduleCleanup(): Promise<void> {
    if (this.ctx.getWebSockets().length === 0) {
      await this.ctx.storage.put("lastActivity", Date.now());
      await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_MS);
    }
  }
}

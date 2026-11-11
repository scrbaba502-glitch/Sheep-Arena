import { DurableObject } from "cloudflare:workers";

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
type PlayerPresence = { name?: string; hat?: string; hp?: number; ready?: boolean };

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
      server.send(JSON.stringify({ type: "room_snapshot", presence }));
      await this.ctx.storage.put("lastActivity", Date.now());
      this.broadcast({ type: "peer_state", player: playerId, connected: true }, server);
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
      if (Number.isInteger(data?.hp)) clean.hp = Math.max(0, Math.min(150, Number(data?.hp)));
      if (typeof data?.ready === "boolean") clean.ready = data.ready;
      const presence = (await this.ctx.storage.get<Record<PlayerId, PlayerPresence>>("presence")) ?? { p1: {}, p2: {} };
      presence[player] = { ...presence[player], ...clean };
      await this.ctx.storage.put("presence", presence);
      this.broadcast({ type: "presence", player, data: clean }, socket);
      return;
    }

    if (message.type === "emoji") {
      const index = Number((message.data as Record<string, unknown> | undefined)?.index);
      if (!Number.isInteger(index) || index < 0 || index > 3) return;
      this.broadcast({ type: "emoji", player, data: { index } }, socket);
      return;
    }

    if (message.type === "attack") {
      const data = message.data as Record<string, unknown> | undefined;
      const kind = data?.kind;
      const damage = Number(data?.damage);
      if (!["punch", "rifle", "slam"].includes(String(kind)) || !Number.isFinite(damage) || damage < 0 || damage > 130) return;
      // Transport-stage validation only. Damage is still client-reported until the
      // match-3 board and combat calculation are moved into authoritative server code.
      this.broadcast({ type: "attack", player, data: { kind, damage: Math.round(damage) } }, socket);
      return;
    }

    if (message.type === "rematch") {
      this.broadcast({ type: "rematch", player }, socket);
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = socket.deserializeAttachment() as PlayerAttachment | null;
    if (attachment) this.broadcast({ type: "peer_state", player: attachment.playerId, connected: false });
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

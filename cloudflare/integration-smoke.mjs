import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";

const withTimeout = (promise, label, ms = 12000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Timed out waiting for " + label)), ms);
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});
const PORT = 8787;
const BASE = "http://127.0.0.1:" + PORT;
const child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--ip", "127.0.0.1", "--port", String(PORT), "--log-level", "error"], {
  cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" }
});
let output = "";
const rawPeers = [], adapterRooms = [];
let cleanupAdapters = false;
child.stdout.on("data", chunk => { output = (output + chunk.toString()).slice(-4000); });
child.stderr.on("data", chunk => { output = (output + chunk.toString()).slice(-4000); });

class SocketPeer {
  constructor(url) {
    this.queue = [];
    this.waiters = [];
    this.ws = new WebSocket(url);
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("WebSocket connection failed")), { once: true });
    });
    this.ws.addEventListener("message", event => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      const index = this.waiters.findIndex(waiter => waiter.predicate(message));
      if (index >= 0) {
        const waiter = this.waiters.splice(index, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else this.queue.push(message);
    });
  }
  next(predicate, timeoutMs = 10000) {
    const index = this.queue.findIndex(predicate);
    if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error("Timed out waiting for WebSocket message"));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }
  send(payload) { this.ws.send(JSON.stringify(payload)); }
  close() { try { this.ws.close(1000, "smoke_test_done"); } catch {} }
}

function firstLegalSwap(board) {
  const hasMatch = values => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      const i = r * 7 + c;
      if (values[i] >= 0 && values[i] === values[i + 1] && values[i] === values[i + 2]) return true;
    }
    for (let c = 0; c < 7; c++) for (let r = 0; r < 5; r++) {
      const i = r * 7 + c;
      if (values[i] >= 0 && values[i] === values[i + 7] && values[i] === values[i + 14]) return true;
    }
    return false;
  };
  for (let i = 0; i < 49; i++) for (const j of [i + 1, i + 7]) {
    if (j >= 49 || (j === i + 1 && i % 7 === 6)) continue;
    const copy = [...board]; [copy[i], copy[j]] = [copy[j], copy[i]];
    if (hasMatch(copy)) return [i, j];
  }
  throw new Error("Server generated a board without a legal swap");
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error("Wrangler exited early: " + output);
    try {
      const response = await fetch(BASE + "/health");
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Wrangler did not become ready: " + output);
}

try {
  await waitForServer();
  console.log("Local Worker is ready; exercising room and WebSocket flows.");
  console.log("Health endpoint is reachable.");
  const health = await (await fetch(BASE + "/health")).json();
  if (!health.ok) throw new Error("Health endpoint returned an invalid response");

  const blocked = await fetch(BASE + "/api/rooms", { method: "POST", headers: { origin: "https://not-allowed.example", "content-type": "application/json" }, body: "{}" });
  if (blocked.status !== 403) throw new Error("Origin allowlist did not reject an unknown origin");

  const createdResponse = await fetch(BASE + "/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (createdResponse.status !== 201) throw new Error("Room creation failed: " + createdResponse.status);
  const created = await createdResponse.json();
  const joinedResponse = await fetch(BASE + "/api/rooms/" + created.code + "/join", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!joinedResponse.ok) throw new Error("Second player could not join");
  const joined = await joinedResponse.json();
  const full = await fetch(BASE + "/api/rooms/" + created.code + "/join", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (full.status !== 409) throw new Error("Room accepted more than two players");

  console.log("Room creation and room-capacity checks passed.");
  const wsUrl = player => "ws://127.0.0.1:" + PORT + "/api/rooms/" + created.code + "/ws?token=" + encodeURIComponent(player.playerToken);
  const p1 = new SocketPeer(wsUrl(created)), p2 = new SocketPeer(wsUrl(joined));
  rawPeers.push(p1, p2);
  await Promise.all([p1.opened, p2.opened]);
  await Promise.all([
    p1.next(m => m.type === "connected"), p2.next(m => m.type === "connected"),
    p1.next(m => m.type === "room_snapshot"), p2.next(m => m.type === "room_snapshot")
  ]);
  const [start1, start2] = await Promise.all([
    p1.next(m => m.type === "match_started"),
    p2.next(m => m.type === "match_started")
  ]);
  if (start1.board.length !== 49 || start2.board.length !== 49) throw new Error("Match start did not provide both boards");
  console.log("Raw WebSocket two-player match started.");

  p1.send({ type: "move", data: { from: 0, to: 8, seq: 1 } });
  const invalid = await p1.next(m => m.type === "move_rejected");
  if (invalid.reason !== "not_adjacent") throw new Error("Illegal swap was not rejected");

  p1.send({ type: "special" });
  const special = await p1.next(m => m.type === "special_rejected");
  if (special.reason !== "rage_not_ready") throw new Error("Server did not validate rage ability readiness");

  const [from, to] = firstLegalSwap(start1.board);
  p1.send({ type: "move", data: { from, to, seq: 1 } });
  const [move, incoming] = await Promise.all([
    p1.next(m => m.type === "move_result"),
    p2.next(m => m.type === "incoming_attack")
  ]);
  if (!move.board || move.board.length !== 49 || !move.attacks.length) throw new Error("Accepted move returned incomplete authoritative state");
  if (incoming.damage <= 0 || incoming.hp >= 150) throw new Error("Server did not apply authoritative attack damage");

  p2.send({ type: "attack", data: { k: "slam", d: 9999 } });
  const disconnected = p2.next(m => m.type === "peer_state" && m.player === "p1" && !m.connected);
  p1.close();
  await disconnected;
  const resumed = new SocketPeer(wsUrl(created));
  rawPeers.push(resumed);
  await resumed.opened;
  await Promise.all([
    resumed.next(m => m.type === "connected"),
    resumed.next(m => m.type === "room_snapshot")
  ]);
  const snapshot = await resumed.next(m => m.type === "match_snapshot");
  const reconnected = await p2.next(m => m.type === "peer_state" && m.player === "p1" && m.connected);
  if (!reconnected.connected || snapshot.hp !== 150 || snapshot.board.length !== 49) throw new Error("Reconnect did not restore authoritative state");
  console.log("Raw WebSocket reconnect and snapshot checks passed.");

  resumed.close();
  p2.close();

  const memory = new Map();
  const localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); }
  };
  const browserContext = {
    window: {}, localStorage, fetch, WebSocket, console,
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  vm.runInNewContext(readFileSync("../cloudflare-client.js", "utf8"), browserContext, { filename: "cloudflare-client.js" });
  const adapter = browserContext.window.A2Cloudflare;
  adapter.configure(BASE);
  console.log("Starting browser adapter integration.");
  const client1Promise = adapter.createRoom().then(room => { if (cleanupAdapters) room.leave(); else adapterRooms.push(room); return room; });
  const client1 = await withTimeout(client1Promise, "browser adapter room creation");
  const ready1 = new Promise(resolve => client1.on("match_started", resolve));
  const client2Promise = adapter.joinRoom(client1.code).then(room => { if (cleanupAdapters) room.leave(); else adapterRooms.push(room); return room; });
  const client2 = await withTimeout(client2Promise, "browser adapter room join");
  const ready2 = new Promise(resolve => client2.on("match_started", resolve));
  const [clientMatch1, clientMatch2] = await withTimeout(Promise.all([ready1, ready2]), "browser adapter match start");
  console.log("Browser adapter synchronized both clients.");
  let specialRejected = false;
  try { await withTimeout(client1.special(), "browser adapter special response", 5000); } catch (error) { specialRejected = error.reason === "rage_not_ready"; }
  if (!specialRejected) throw new Error("Browser adapter did not surface server special-action validation");
  console.log("Browser adapter special-action validation passed.");
  const [moveFrom, moveTo] = firstLegalSwap(clientMatch1.board);
  const incomingAttack = new Promise(resolve => client2.on("incoming_attack", resolve));
  const [clientMove, clientAttack] = await withTimeout(Promise.all([client1.move(moveFrom, moveTo), incomingAttack]), "browser adapter move and incoming attack");
  if (clientMove.board.length !== 49 || clientAttack.damage <= 0) throw new Error("Browser adapter did not complete an authoritative move");
  console.log("Browser adapter move and incoming attack passed.");
  client1.leave();
  client2.leave();
  console.log("Cloudflare Worker smoke test passed: CORS, room limits, two-player start, move validation, server damage, rage validation, reconnect snapshots, and browser adapter.");
} catch (error) {
  console.error(error);
  console.error(output);
  process.exitCode = 1;
} finally {
  cleanupAdapters = true;
  for (const room of adapterRooms) { try { room.leave(); } catch {} }
  for (const peer of rawPeers) peer.close();
  if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(3000)]);
}

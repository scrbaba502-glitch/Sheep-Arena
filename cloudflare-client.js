(function () {
  "use strict";
  const STORAGE_KEY = "a2cfapi";
  const baseUrl = () => String(window.A2_SHEEP_ARENA_API || localStorage.getItem(STORAGE_KEY) || "").trim().replace(/\/+$/, "");
  const json = async (url, options) => {
    const response = await fetch(url, { cache: "no-store", ...options, headers: { "content-type": "application/json", ...(options && options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Cloudflare request failed (" + response.status + ")");
    return body;
  };
  const api = {
    configured() { return !!baseUrl(); },
    configure(url) {
      const value = String(url || "").trim().replace(/\/+$/, "");
      if (!/^https:\/\//i.test(value)) throw new Error("Use the HTTPS URL of your Cloudflare Worker.");
      localStorage.setItem(STORAGE_KEY, value);
      return value;
    },
    async createRoom() {
      const base = baseUrl();
      if (!base) throw new Error("Cloudflare Worker URL is not configured.");
      const session = await json(base + "/api/rooms", { method: "POST", body: "{}" });
      return this.connect(base, session);
    },
    async joinRoom(code) {
      const base = baseUrl();
      if (!base) throw new Error("Cloudflare Worker URL is not configured.");
      const session = await json(base + "/api/rooms/" + encodeURIComponent(code) + "/join", { method: "POST", body: "{}" });
      return this.connect(base, { ...session, code });
    },
    connect(base, session) {
      return new Promise((resolve, reject) => {
        const wsUrl = base.replace(/^https:/i, "wss:") + "/api/rooms/" + encodeURIComponent(session.code) + "/ws?token=" + encodeURIComponent(session.playerToken);
        const ws = new WebSocket(wsUrl);
        const events = Object.create(null), peerListeners = [];
        const me = { peer: "me", isMe: true, presence: {} };
        let rival = null, closed = false, seq = 1, pendingMove = null, matchInfo = null;
        const fire = (name, payload) => (events[name] || []).forEach(fn => { try { fn(payload); } catch (error) { console.error(error); } });
        const peerList = () => rival ? [me, rival] : [me];
        const firePeers = () => peerListeners.forEach(fn => { try { fn(peerList()); } catch (error) { console.error(error); } });
        const send = payload => {
          if (ws.readyState !== WebSocket.OPEN) throw new Error("Multiplayer connection is not ready.");
          ws.send(JSON.stringify(payload));
        };
        const room = {
          code: session.code,
          player: session.player,
          presence(data) {
            Object.assign(me.presence, data || {});
            return Promise.resolve().then(() => send({ type: "presence", data: {
              name: me.presence.n || me.presence.name,
              hat: me.presence.ht || me.presence.hat,
              ready: !!(me.presence.rd || me.presence.ready)
            } }));
          },
          emit(type, data) {
            if (type === "emo") return Promise.resolve().then(() => send({ type: "emoji", data: { index: Number(data && data.e) } }));
            if (type === "rematch") return Promise.resolve().then(() => send({ type: "rematch" }));
            return Promise.resolve();
          },
          move(from, to) {
            if (pendingMove) return Promise.reject(new Error("A move is already being processed."));
            const current = seq++;
            return new Promise((resolveMove, rejectMove) => {
              pendingMove = { seq: current, resolve: resolveMove, reject: rejectMove };
              try { send({ type: "move", data: { from, to, seq: current } }); }
              catch (error) { pendingMove = null; seq--; rejectMove(error); }
            });
          },
          on(name, fn) { (events[name] = events[name] || []).push(fn); },
          onPeers(fn) { peerListeners.push(fn); },
          peers: peerList,
          leave() { closed = true; try { ws.close(1000, "left_room"); } catch (_) {} }
        };
        ws.onopen = () => resolve(room);
        ws.onerror = () => { if (!room.__opened) reject(new Error("Could not connect to the Cloudflare multiplayer server.")); };
        ws.onclose = event => {
          closed = true;
          if (pendingMove) { pendingMove.reject(new Error("Connection lost while processing move.")); pendingMove = null; }
          if (rival) { rival = null; firePeers(); }
          fire("closed", { code: event.code, reason: event.reason });
        };
        ws.onmessage = event => {
          let message;
          try { message = JSON.parse(event.data); } catch (_) { return; }
          const type = message.type;
          if (type === "room_snapshot") {
            const presence = message.presence || {};
            const other = session.player === "p1" ? presence.p2 : presence.p1;
            if (other && Object.keys(other).length) rival = { peer: "cloud-rival", isMe: false, presence: { v: 1, n: other.name || "Rival", ht: other.hat || "" } };
            return;
          }
          if (type === "peer_state") {
            if (message.player !== session.player) {
              if (message.connected) {
                rival = rival || { peer: "cloud-rival", isMe: false, presence: { v: 1, n: "Rival", ht: "" } };
              } else rival = null;
              firePeers();
            }
            return;
          }
          if (type === "presence" && message.player !== session.player) {
            const data = message.data || {};
            rival = rival || { peer: "cloud-rival", isMe: false, presence: { v: 1 } };
            if (data.name) rival.presence.n = data.name;
            if (data.hat) rival.presence.ht = data.hat;
            firePeers();
            return;
          }
          if (type === "match_started" || type === "match_snapshot") {
            matchInfo = message;
            rival = rival || { peer: "cloud-rival", isMe: false, presence: { v: 1, n: "Rival", ht: "" } };
            firePeers();
            fire(type, message);
            room.__opened = true;
            return;
          }
          if (type === "move_result" || type === "move_rejected") {
            if (pendingMove && (!message.seq || message.seq === pendingMove.seq)) {
              const pending = pendingMove; pendingMove = null;
              if (type === "move_result") pending.resolve(message);
              else { seq = Number(message.expectedSeq || pending.seq); pending.reject(Object.assign(new Error(message.reason || "Move rejected."), { reason: message.reason })); }
            }
            fire(type, message);
            return;
          }
          if (type === "incoming_attack" || type === "match_over" || type === "emoji" || type === "rematch") {
            fire(type, message);
            return;
          }
          if (type === "connected") {
            room.__opened = true;
            fire("connected", message);
          }
        };
      });
    }
  };
  window.A2Cloudflare = api;
})();
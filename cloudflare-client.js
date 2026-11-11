(function () {
  "use strict";
  const STORAGE_KEY = "a2cfapi";
  const sessionKey = code => "a2cf_session_" + String(code || "").toUpperCase();
  const baseUrl = () => String(window.A2_SHEEP_ARENA_API || localStorage.getItem(STORAGE_KEY) || "").trim().replace(/\/+$/, "");
  const saveSession = (base, session) => {
    try { localStorage.setItem(sessionKey(session.code), JSON.stringify({ ...session, base })); } catch (_) {}
  };
  const readSession = code => {
    try { return JSON.parse(localStorage.getItem(sessionKey(code)) || "null"); } catch (_) { return null; }
  };
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
      if (!/^https:\/\//i.test(value) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)) throw new Error("Use an HTTPS Worker URL (HTTP is allowed only for localhost testing).");
      localStorage.setItem(STORAGE_KEY, value);
      return value;
    },
    async createRoom() {
      const base = baseUrl();
      if (!base) throw new Error("Cloudflare Worker URL is not configured.");
      const session = await json(base + "/api/rooms", { method: "POST", body: "{}" });
      saveSession(base, session);
      return this.connect(base, session);
    },
    async joinRoom(code) {
      const saved = readSession(code);
      if (saved && saved.playerToken && saved.base) return this.connect(saved.base, saved);
      const base = baseUrl();
      if (!base) throw new Error("Cloudflare Worker URL is not configured.");
      const session = { ...(await json(base + "/api/rooms/" + encodeURIComponent(code) + "/join", { method: "POST", body: "{}" })), code };
      saveSession(base, session);
      return this.connect(base, session);
    },
    async resumeRoom(code) {
      const saved = readSession(code);
      if (!saved || !saved.playerToken || !saved.base) return null;
      return this.connect(saved.base, saved);
    },
    connect(base, session) {
      return new Promise((resolve, reject) => {
        const wsUrl = base.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:") + "/api/rooms/" + encodeURIComponent(session.code) + "/ws?token=" + encodeURIComponent(session.playerToken);
        const events = Object.create(null), peerListeners = [], lastStateMessage = Object.create(null);
        const me = { peer: "me", isMe: true, presence: {} };
        let ws = null, rival = null, seq = 1, pendingMove = null, pendingSpecial = null;
        let intentionalClose = false, resolved = false, reconnectAttempts = 0, reconnectTimer = null, heartbeatTimer = null, lastPongAt = Date.now();
        const fire = (name, payload) => {
          if (name === "match_started" || name === "match_snapshot") lastStateMessage[name] = payload;
          (events[name] || []).forEach(fn => { try { fn(payload); } catch (error) { console.error(error); } });
        };
        const peerList = () => rival ? [me, rival] : [me];
        const firePeers = () => peerListeners.forEach(fn => { try { fn(peerList()); } catch (error) { console.error(error); } });
        const send = payload => {
          if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("Multiplayer connection is reconnecting.");
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
          special() {
            if (pendingSpecial) return Promise.reject(new Error("A special move is already being processed."));
            return new Promise((resolveSpecial, rejectSpecial) => {
              pendingSpecial = { resolve: resolveSpecial, reject: rejectSpecial };
              try { send({ type: "special" }); }
              catch (error) { pendingSpecial = null; rejectSpecial(error); }
            });
          },
          on(name, fn) {
            (events[name] = events[name] || []).push(fn);
            if (lastStateMessage[name]) Promise.resolve().then(() => { try { fn(lastStateMessage[name]); } catch (error) { console.error(error); } });
          },
          onPeers(fn) { peerListeners.push(fn); },
          peers: peerList,
          isConnected() { return !!ws && ws.readyState === WebSocket.OPEN; },
          leave() {
            intentionalClose = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            try { localStorage.removeItem(sessionKey(session.code)); } catch (_) {}
            try { ws && ws.close(1000, "left_room"); } catch (_) {}
          }
        };

        const attach = socket => {
          ws = socket;
          socket.onopen = () => {
            lastPongAt = Date.now();
            if (!heartbeatTimer) heartbeatTimer = setInterval(() => {
              if (intentionalClose) return;
              if (ws && ws.readyState === WebSocket.OPEN) {
                if (Date.now() - lastPongAt > 150000) { try { ws.close(4000, "heartbeat_timeout"); } catch (_) {} return; }
                try { send({ type: "ping" }); } catch (_) {}
              }
            }, 60000);
            if (!resolved) { resolved = true; resolve(room); }
            else fire("reconnected");
          };
          socket.onerror = () => {
            if (!resolved) {
              intentionalClose = true;
              reject(new Error("Could not connect to the Cloudflare multiplayer server."));
            }
          };
          socket.onclose = event => {
            if (socket !== ws || intentionalClose) return;
            if (pendingMove) { pendingMove.reject(new Error("Connection interrupted; board will resynchronize.")); pendingMove = null; }
            if (pendingSpecial) { pendingSpecial.reject(new Error("Connection interrupted; match will resynchronize.")); pendingSpecial = null; }
            if ((event.code === 4001 && event.reason === "session_replaced") || [1002, 1007, 1008, 1009].includes(event.code)) {
              fire("closed", { code: event.code, reason: event.reason, fatal: true });
              return;
            }
            fire("reconnecting", { code: event.code, reason: event.reason, attempt: reconnectAttempts + 1 });
            if (reconnectAttempts >= 8) {
              if (!resolved) reject(new Error("Could not connect to the Cloudflare multiplayer server."));
              fire("closed", { code: event.code, reason: event.reason, fatal: true });
              return;
            }
            const delay = Math.min(1000 * Math.pow(1.7, reconnectAttempts++), 10000);
            reconnectTimer = setTimeout(() => {
              if (intentionalClose) return;
              try { attach(new WebSocket(wsUrl)); }
              catch (error) { fire("reconnecting", { error: String(error), attempt: reconnectAttempts }); }
            }, delay);
          };
          socket.onmessage = event => {
            let message;
            try { message = JSON.parse(event.data); } catch (_) { return; }
            const type = message.type;
            if (type === "pong") { lastPongAt = Date.now(); return; }
            if (type === "room_snapshot") {
              const presence = message.presence || {};
              const otherPlayer = session.player === "p1" ? "p2" : "p1";
              const other = presence[otherPlayer];
              if (other) {
                rival = rival || { peer: "cloud-rival", isMe: false, presence: { v: 1 } };
                rival.presence.n = other.name || "Rival";
                rival.presence.ht = other.hat || "";
                rival.connected = Array.isArray(message.connectedPlayers) && message.connectedPlayers.includes(otherPlayer);
                firePeers();
              }
              return;
            }
            if (type === "peer_state") {
              if (message.player !== session.player) {
                rival = rival || { peer: "cloud-rival", isMe: false, presence: { v: 1, n: "Rival", ht: "" } };
                rival.connected = !!message.connected;
                firePeers();
              }
              return;
            }
            if (type === "presence" && message.player !== session.player) {
              const data = message.data || {};
              rival = rival || { peer: "cloud-rival", isMe: false, presence: { v: 1 } };
              if (data.name) rival.presence.n = data.name;
              if (data.hat) rival.presence.ht = data.hat;
              if (typeof data.ready === "boolean") rival.presence.rd = data.ready ? 1 : 0;
              firePeers();
              return;
            }
            if (type === "match_started" || type === "match_snapshot") {
              seq = Number(message.nextSeq || 1);
              rival = rival || { peer: "cloud-rival", isMe: false, presence: { v: 1, n: "Rival", ht: "" } };
              rival.connected = true;
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
            if (type === "special_result" || type === "special_rejected") {
              if (pendingSpecial) {
                const pending = pendingSpecial; pendingSpecial = null;
                if (type === "special_result") pending.resolve(message);
                else pending.reject(Object.assign(new Error(message.reason || "Special move rejected."), { reason: message.reason }));
              }
              fire(type, message);
              return;
            }
            if (type === "incoming_attack" || type === "match_over" || type === "emoji" || type === "rematch" || type === "rematch_started") {
              fire(type, message);
              return;
            }
            if (type === "connected") {
              reconnectAttempts = 0;
              room.__opened = true;
              fire("connected", message);
            }
          };
        };

        try { attach(new WebSocket(wsUrl)); }
        catch (error) { reject(error); }
      });
    }
  };
  window.A2Cloudflare = api;
})();
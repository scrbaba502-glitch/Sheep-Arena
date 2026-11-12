/* A² Sheep Arena — 3D volcano ring: humanoid sheep fighters, lava, crowd, particles, cinematic camera.
   Reads the game's own animation state (A, P, E …) every frame, so game logic stays untouched. */
(function () {
"use strict";
const m4 = R3C.m4;
const GAP = 3.4, RUSH = GAP * 0.66, FX = GAP / 2;
const cl = v => Math.max(0, Math.min(1, v)), lerp = (a, b, t) => a + (b - a) * t;
const lin = h => { const n = parseInt(h.slice(1), 16); return [Math.pow((n >> 16 & 255) / 255, 2.2), Math.pow((n >> 8 & 255) / 255, 2.2), Math.pow((n & 255) / 255, 2.2)]; };
const rnd = (a, b) => a + Math.random() * (b - a);
const hash = n => { const x = Math.sin(n * 127.1) * 43758.5; return x - Math.floor(x); };

const WOOL = ["#f4ecd8", "#cfd6e6", "#e9c99a", "#4a444a", "#f3c1cc", "#bfe8c6"].map(lin);
const CROWD = ["#c0392b", "#e2b043", "#2a6fdb", "#f5f0e6", "#6a2c91"].map(lin);
const COL = { gold: lin("#e2b043"), dark: lin("#2b2528"), snout: lin("#5a5156"), black: lin("#0d0b0c"), red: lin("#c4272b"), horn: lin("#e8dcc0"),
  rock: lin("#2b1a16"), white: [1, 1, 1], skin: lin("#3a3236") };

const bk = A => A.b || A.k;
const SUB = { flurry: [.2, .35], tornado: [.3, .42, .54], crowdrush: [.35, .5, .65] };
const INTRO = { boss: { land: 1.0, dur: 1.8 }, jump: { land: .85, dur: 1.1 }, run: { land: .8, dur: .9 } };
const introKind = S => S.boss ? "boss" : (S.eStyle % 3 === 0 ? "jump" : "run");
let R = null, mats = null, st = null, ringTex = null, onLowCb = null, onDownCb = null, auto = true, frameAcc = 0, frameN = 0;

/* ---------- procedural ring mat texture ---------- */
function makeRingTex() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 600; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 600); g.addColorStop(0, "#16225a"); g.addColorStop(1, "#2c43a0"); x.fillStyle = g; x.fillRect(0, 0, 1024, 600);
  x.fillStyle = "rgba(255,255,255,.05)"; for (let i = -4; i < 14; i++) { x.fillRect(i * 90, 0, 45, 600); }
  x.strokeStyle = "#e2b043"; x.lineWidth = 14; x.strokeRect(14, 14, 996, 572); x.strokeStyle = "#c4272b"; x.lineWidth = 6; x.strokeRect(34, 34, 956, 532);
  x.beginPath(); x.arc(512, 300, 190, 0, 7); x.strokeStyle = "rgba(226,176,67,.55)"; x.lineWidth = 8; x.stroke();
  x.fillStyle = "rgba(243,210,122,.85)"; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = "900 230px Cinzel, Georgia, serif"; x.fillText("A²", 512, 290);
  x.font = "800 44px Cinzel, Georgia, serif"; x.fillStyle = "rgba(243,210,122,.7)"; x.fillText("SHEEP ARENA", 512, 480);
  x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(512 - 2, 34, 4, 90); x.fillRect(512 - 2, 476, 4, 90);
  return R.canvasTex(c, true);
}

/* ---------- particles ---------- */
const MAXP = 900;
const parts = []; const bufA = new Float32Array(MAXP * 8), bufB = new Float32Array(MAXP * 8);
function sp(x, y, z, vx, vy, vz, life, s0, s1, c, a, add, g, drag) {
  if (parts.length >= MAXP) parts.shift();
  parts.push({ x, y, z, vx, vy, vz, l: life, m: life, s0, s1, c, a, add, g: g || 0, d: drag || 0 });
}
function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.l -= dt;
    if (p.l <= 0) { parts.splice(i, 1); continue; }
    p.vy += p.g * dt; const k = Math.max(0, 1 - p.d * dt); p.vx *= k; p.vy *= k; p.vz *= k;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
}
function drawParts(imm) {
  let na = 0, nb = 0;
  const put = (buf, n, p, age) => {
    const o = n * 8, a = p.a * (1 - age) * Math.min(1, age * 12 + .25);
    buf[o] = p.x; buf[o+1] = p.y; buf[o+2] = p.z; buf[o+3] = lerp(p.s0, p.s1, age);
    buf[o+4] = p.c[0]; buf[o+5] = p.c[1]; buf[o+6] = p.c[2]; buf[o+7] = a;
  };
  for (const p of parts) { const age = 1 - p.l / p.m; if (p.add) put(bufB, nb++, p, age); else put(bufA, na++, p, age); }
  for (const p of imm) { if (nb < MAXP) put(bufB, nb++, p, 0); }
  R.points(bufA, na, false); R.points(bufB, nb, true);
}

/* ---------- effects triggered by the game ---------- */
const rings = [];
function burst(x, y, z, n, speed, c, grav) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, u = rnd(-.3, 1), r = Math.sqrt(1 - u * u) * speed * rnd(.4, 1);
    sp(x, y, z, Math.cos(a) * r, u * speed * rnd(.4, 1) + speed * .25, Math.sin(a) * r * .6, rnd(.35, .9), rnd(.08, .16), .02, c, 1, true, grav === undefined ? -9 : grav, .6); }
}
function impact(k, who, ko) {
  if (!st) return;
  const tgt = who === "p" ? "e" : "p", ad = who === "p" ? 1 : -1, c = st.chest[tgt] || [ad * FX, 1.4, 0];
  if (k === "parry") { st.flashL = { x: c[0], y: c[1] + .3, z: 1.6, i: 6, c: [3, 2.6, 1.2] }; st.seq++; burst(c[0], c[1], c[2], 40, 6, [3, 2.6, 1]); rings.push({ x: c[0], y: c[1], z: c[2], t: 0, life: .35, max: 2.6, c: [3, 2.6, 1.2], flat: false }); st.ab = .8; return; }
  const big = k === "slam" || k === "splash" || k === "piledriver" || k === "lavawave" || k === "finisher", mid = k === "dropkick" || k === "tornado" || k === "ramcharge" || k === "crowdrush", fl = big ? [3, 1.5, .4] : [3, 2.4, 1.2];
  st.flashL = { x: c[0], y: c[1] + .3, z: 1.6, i: big ? 9 : mid ? 6.5 : 4.5, c: fl };
  st.seq++;
  burst(c[0], c[1], c[2], big ? 70 : mid ? 44 : 26, big ? 7 : mid ? 5.5 : 4.5, [3, 1.6, .5]);
  burst(c[0], c[1], c[2], big ? 24 : 8, big ? 4 : 2.5, [3, 3, 2.2], -4);
  rings.push({ x: c[0], y: big ? .05 : c[1], z: c[2], t: 0, life: big ? .8 : .4, max: big ? 5 : mid ? 2.4 : 1.6, c: big ? [3, 1.1, .2] : [3, 2.4, 1.4], flat: big });
  if (big) { for (let i = 0; i < 16; i++) sp(c[0] + rnd(-.6, .6), .15, c[2] + rnd(-.4, .4), rnd(-1.5, 1.5), rnd(.5, 1.6), rnd(-.8, .8), rnd(.8, 1.6), .5, 1.6, [.5, .27, .17], .45, false, 0, 1.2); }
  st.ab = big ? 1 : .5;
}
function lavaSplash(x) {
  for (let i = 0; i < 90; i++) sp(x + rnd(-.6, .6), -1.2, rnd(-.6, .6), rnd(-3, 3), rnd(4, 11), rnd(-2, 2), rnd(.9, 1.8), rnd(.15, .3), .02, [3.4, 1.4, .3], 1, true, -10, .2);
  for (let i = 0; i < 18; i++) sp(x + rnd(-1, 1), -1, rnd(-.8, .8), rnd(-1, 1), rnd(1, 3), rnd(-1, 1), rnd(1.4, 2.4), .8, 2.4, [.12, .05, .04], .6, false, 0, .8);
  rings.push({ x, y: -1.3, z: 0, t: 0, life: 1.2, max: 6, c: [3, 1.2, .2], flat: true });
  st.flashL = { x, y: 0, z: 1.5, i: 9, c: [3, 1.2, .3] }; st.ab = 1;
}

/* ---------- pose from the game's animation timeline ---------- */
function poseOf(who, S) {
  const me = who === "p", A = S.A, T = S.T, ph = me ? 0 : 1.7;
  const o = { dx: 0, dy: 0, rot: 0, yawAdd: 0, lean: .14, head: 0, aS: [.55, .75], aE: [1.65, 1.5], h: [[.38, .32], [-.32, .38]],
    gun: 0, mf: 0, glow: 0, hide: 0, hurt: 0, stars: 0, aZ: [0, 0] };
  const bob = (Math.sin(T * .0065 + ph) * .5 + .5);
  o.h[0][1] += bob * .14; o.h[1][1] += bob * .14; o.aS[0] += Math.sin(T * .004 + ph) * .1; o.aS[1] += Math.cos(T * .005 + ph) * .1; o.lean += bob * .03;
  if (!S.over && !S.A && S.intro < 3) {
    const kind = introKind(S), kd = INTRO[kind], t = S.intro;
    if (t < kd.dur) {
      if (!me) {
        if (kind === "boss") {
          const f = cl(t / kd.land); o.dy = (1 - f * f) * 5.5; o.aS = [2.4, 2.4]; o.aE = [.5, .5]; o.head = -.25;
          if (t >= kd.land) { const c = cl((t - kd.land) / .25), up = cl((t - kd.land - .3) / .2);
            o.h = [[.5, .6 * (1 - c * .6)], [-.45, .6 * (1 - c * .6)]]; o.lean = .3 - .2 * c; o.aS = [lerp(.5, 2.6, up), lerp(.5, 2.6, up)]; o.aE = [.35, .35]; o.head = -.35 * up; o.dy = Math.sin(t * 30) * .03 * up; }
        } else if (kind === "jump") {
          const f = cl(t / kd.land); o.dx = 5 * (1 - f); o.dy = Math.sin(f * Math.PI) * 2.4; o.aS = [2.2, 2.2]; o.aE = [.6, .6]; o.rot = f < 1 ? f * 6.283 : 0;
        } else {
          const f = cl(t / kd.land), sw = Math.sin(T * .03); o.dx = 5.5 * (1 - f); o.dy = Math.abs(sw) * .1; o.lean = .35;
          o.h = [[sw * .9 + .1, .5], [-sw * .9 + .1, .5]]; o.aS = [.8 + sw, .8 - sw]; o.aE = [1.2, 1.2];
        }
      } else { const f = cl(t / .7); o.aS = [lerp(2.4, .55, f), lerp(2.4, .75, f)]; o.aE = [lerp(.5, 1.65, f), lerp(.5, 1.5, f)]; o.dy = Math.abs(Math.sin(t * 9)) * .15 * (1 - f); }
    }
  }
  const hp = me ? S.P.hp : S.E.hp, ohp = me ? S.E.hp : S.P.hp;
  if (S.over && hp <= 0) { o.rot = me ? 1.45 : -1.45; o.dy = .32; o.aS = [.2, .35]; o.aE = [.2, .2]; o.h = [[.1, .1], [-.1, .1]]; o.lean = 0; o.hide = (!me && S.lavaKO) ? 1 : 0; o.dead = 1; return o; }
  if (S.over && ohp <= 0) { o.aS = [2.7 + Math.sin(T * .012) * .2, 2.9]; o.aE = [.35, .25]; o.dy = Math.abs(Math.sin(T * .011 + ph)) * .35; o.lean = -.05; }
  const stunned = me ? S.pst > 0 : S.estun > 0;
  if (stunned && !(A && A.who !== who && bk(A) === "slam")) { o.head = .35 + Math.sin(T * .01) * .15; o.aS = [.15, .25]; o.aE = [.3, .2]; o.lean = .3; o.rot = Math.sin(T * .006) * .06; o.stars = 1; }
  if (!A) return o;
  const t = A.t / A.d, im = A.imp, k = A.k, att = A.who === who, ad = A.who === "p" ? 1 : -1;
  const hitFlinch = (amt, hs, up) => { const u = cl((t - im) / .35), s = Math.sin(u * Math.PI); o.dx = ad * s * amt; o.head = -hs * s; o.lean = .14 - .3 * s; o.hurt = t > im ? 1 - u : 0; o.dy = (up || 0) * s; if (up) o.rot = -ad * .5 * s;
    if (A.ko) { o.rot = -ad * cl(u * 1.5) * 1.45; o.dy = .32 * cl(u * 1.5); o.lean = 0; } };
  if (A.parried && !att) { const s = Math.sin(cl((t - im + .12) / .4) * Math.PI); o.dx = ad * .5 * s; o.lean = .14 - .4 * s; o.head = .3 * s; o.aS = [1.5, 1.3]; o.aE = [1.1, 1.2]; o.glow = .5 * s; return o; }
  if (A._vr === undefined) { A._i = S.seq % 2; A._vr = (A.dmg >= 14 ? 2 : (S.seq % 3 === 1 ? 1 : 0)); }
  const vr = A._vr, ai = A._i;
  if (k === "punch") {
    if (att) {
      const u = t < .45 ? t / .45 : cl(1 - (t - .45) / .4), ext = cl(u * 1.3), wind = cl(t / .2) * (1 - cl((t - .2) / .15)), out = ai ? 1 : -1;
      o.dx = ad * u * GAP * (vr === 0 ? .55 : .5); o.h[0] = [.38 + .6 * u, .3]; o.h[1] = [-.32 - .4 * u, .22];
      if (vr === 0) { o.aS[ai] = lerp(.7, 1.55, ext) - wind * .6; o.aE[ai] = lerp(1.6, .04, ext) + wind * .6; o.lean = .14 + .34 * ext - wind * .12; o.yawAdd = (me ? 1 : -1) * .25 * ext; }
      else if (vr === 1) { o.aS[ai] = lerp(.9, 1.5, ext) - wind * .3; o.aE[ai] = lerp(1.7, .5, ext) + wind * .2; o.aZ[ai] = out * lerp(.8, -.25, ext); o.lean = .14 + .2 * ext - wind * .1; o.yawAdd = (me ? 1 : -1) * .55 * ext; }
      else { o.aS[ai] = lerp(-.35, 2.7, ext); o.aE[ai] = lerp(.7, .2, ext); o.lean = lerp(-.12, .38, ext); o.dy = Math.sin(ext * Math.PI) * .38; o.h[0] = [.5 * u + .38, .3 + .4 * (1 - ext)]; o.yawAdd = (me ? 1 : -1) * .2 * ext; }
    } else if (t > im) hitFlinch(vr === 2 ? .35 : .5, vr === 2 ? .8 : .55, vr === 2 ? 1.0 : 0);
  } else if (k === "rifle") {
    if (att) { const kick = t > .3 && t < .5 ? Math.sin((t - .3) / .2 * Math.PI) : 0;
      o.gun = 1; o.aS = [1.38, 1.22]; o.aE = [.22, .48]; o.dx = -ad * .22 * kick; o.lean = .05 - .12 * kick; o.mf = (t > .3 && t < .5) ? 1 : 0; o.h = [[.3, .25], [-.3, .3]]; }
    else if (t > im) hitFlinch(.7, .5);
  } else if (k === "flurry") {
    const pulse = c => cl(1 - Math.abs(t - c) / .09);
    if (att) {
      const e0 = Math.max(pulse(.2), pulse(.5)), e1 = pulse(.35), rush = cl(t / .2) * (1 - cl((t - .75) / .25));
      o.dx = ad * GAP * .5 * rush; o.aS = [lerp(.55, 1.55, e0), lerp(.75, 1.55, e1)]; o.aE = [lerp(1.65, .04, e0), lerp(1.5, .04, e1)];
      o.lean = .14 + .25 * Math.max(e0, e1); o.h = [[.38 + .6 * rush, .3], [-.32 - .4 * rush, .22]]; o.yawAdd = (me ? 1 : -1) * (e0 - e1) * .35;
    } else if (t > .2) {
      const hs = Math.max(pulse(.2), pulse(.35), pulse(.5)), sh = Math.sin(t * 70) * .08 * cl((t - .2) / .1) * (1 - cl((t - im) / .1));
      o.dx = ad * (.18 * cl((t - .2) / .3) + sh); o.head = -.5 * hs; o.lean = .14 - .15 * hs; o.hurt = hs * .8;
      if (t > im) { hitFlinch(.8, .6); o.dx += ad * .18 * (1 - cl((t - im) / .35)); }
    }
  } else if (k === "dropkick") {
    if (att) {
      const p = cl(t / .55), r = cl((t - .65) / .35), air = Math.sin(cl(t / .75) * Math.PI);
      o.dx = ad * GAP * .78 * p * (1 - r); o.dy = air * 1.15; o.rot = ad * .9 * air; o.lean = -.1 * air;
      o.h = [[lerp(.38, 1.3, air), .1], [lerp(-.32, 1.1, air), .25]]; o.aS = [lerp(.55, -.2, air), lerp(.75, .1, air)]; o.aE = [lerp(1.65, .6, air), 1];
    } else if (t > im) hitFlinch(1.1, .8, .25);
  } else if (k === "tornado") {
    const sw = cl((t - .12) / .62);
    if (att) {
      o.dx = ad * GAP * .55 * cl((t - .05) / .3) * (1 - cl((t - .8) / .2)); o.dy = Math.sin(cl((t - .1) / .7) * Math.PI) * .3;
      o.yawAdd = (me ? 1 : -1) * sw * 6.283 * 3; o.aS = [1.57, 1.57]; o.aE = [.05, .05]; o.lean = .15; o.glow = .6 * Math.sin(sw * Math.PI); o.h = [[.4, .3], [-.4, .3]];
    } else if (t > .3) {
      const dec = 1 - cl((t - im) / .2), hs = (Math.sin(t * 55) * .5 + .5) * dec, jit = Math.sin(t * 60) * .1 * (1 - cl((t - im) / .1));
      o.dx = ad * (.2 + jit); o.head = -.4 * hs; o.hurt = hs * .6;
      if (t > im) { hitFlinch(1.0, .8, .5); o.dx += ad * .2 * (1 - cl((t - im) / .35)); }
    }
  } else if (k === "ramcharge") {
    if (att) {
      const rush = cl((t - .25) / .25) - cl((t - .7) / .3), cr = cl(t / .22) * (1 - cl((t - .25) / .05));
      o.dx = ad * GAP * .8 * rush - ad * .3 * cr; o.head = .5; o.lean = .14 + .5 * cr + .55 * cl((t - .25) / .1) * (1 - cl((t - .7) / .2)); o.aS = [-.3, -.3]; o.aE = [.3, .3];
      o.glow = cl(t / .2) * (1 - cl((t - .75) / .2)) * .8; o.h = [[.5 * rush + .3, .3 + .3 * cr], [-.4 * rush - .3, .3 + .3 * cr]];
    } else if (t > im) {
      const u = cl((t - im) / .5), fl = Math.sin(u * Math.PI);
      o.dx = ad * fl * 3.5; o.dy = fl * 2.2; o.rot = -ad * fl * 2.4; o.head = -.6 * fl; o.hurt = 1 - u; o.aS = [2.2, 2.2]; o.aE = [.4, .4];
      if (A.ko) { const v = cl((t - im) / (1 - im)); o.dx = ad * v * 8; o.dy = .32 + Math.sin(v * Math.PI) * 1.8 - v * v * 3.2; o.rot = -ad * (1.45 + v * 2.5); o.hide = t > .97 ? 1 : 0; }
    }
  } else if (k === "lavawave") {
    if (att) {
      const c = cl(t / .3), up = cl((t - .25) / .2), pd = cl((t - .5) / .07), back = 1 - cl((t - .8) / .2);
      o.glow = c * (1 - cl((t - .75) / .2)); o.h = [[.5, .3 + .6 * c * (1 - pd)], [-.45, .3 + .6 * c * (1 - pd)]];
      o.dx = ad * .8 * cl((t - .3) / .2) * back; o.dy = Math.sin(cl((t - .3) / .22) * Math.PI) * 1.4;
      o.aS = [lerp(.7, 2.9, up) * (1 - pd) + .25 * pd, lerp(.7, 2.9, up) * (1 - pd) + .25 * pd]; o.aE = [.2, .2]; o.lean = .14 - .3 * c * (1 - pd) + .7 * pd * back;
    } else if (t > im) {
      hitFlinch(.6, .7, 1.3);
      if (A.ko && t > .82) { const v = cl((t - .82) / .18); o.dx = ad * v * 7.5; o.dy = .32 + Math.sin(v * Math.PI) * 1.3 - v * v * 4.4; o.rot = -ad * (1.45 + v * 2.2); o.hide = t > .97 ? 1 : 0; }
    }
  } else if (k === "hatrang") {
    if (att) {
      const w = cl(t / .2), th = cl((t - .2) / .1), cat = cl((t - .82) / .12);
      o.aS[0] = lerp(.7, 2.3, w); o.aS[0] = lerp(o.aS[0], 1.5, th); o.aE[0] = lerp(1.6, .05, th); o.aS[0] = lerp(o.aS[0], 2.5, cat); o.aE[0] = lerp(o.aE[0], .2, cat);
      o.lean = .14 + .25 * th - .15 * w * (1 - th); o.yawAdd = (me ? 1 : -1) * .35 * th * (1 - cat); o.nohat = (t > .22 && t < .9) ? 1 : 0;
    } else if (t > im) hitFlinch(.5, .8);
  } else if (k === "woolbomb") {
    if (att) {
      const c = cl(t / .3), bu = cl((t - .3) / .12) * (1 - cl((t - .5) / .25));
      o.aS = [lerp(.55, .3, c) + 1.9 * bu, lerp(.75, .3, c) + 1.9 * bu]; o.aE = [lerp(1.65, 2.2, c) - 2.1 * bu, lerp(1.5, 2.2, c) - 2.1 * bu];
      o.lean = .14 - .3 * c + .35 * bu; o.dy = bu * .45; o.h = [[.4, .3 + .3 * c * (1 - bu)], [-.35, .3 + .3 * c * (1 - bu)]]; o.glow = .3 * bu;
    } else if (t > im) { const f = 1 - cl((t - .92) / .08), sh = Math.sin(t * 55);
      o.aS = [1.7, 1.7]; o.aE = [2.3, 2.3]; o.head = -.3 + sh * .15; o.dx = ad * (.3 + .08 * sh) * f; o.lean = .14 - .2 * f; o.hurt = .3 * f; }
  } else if (k === "crowdrush") {
    if (att) { const f = 1 - cl((t - .85) / .15); o.aS = [lerp(.55, 2.6, cl(t / .15) * f), lerp(.75, 2.6, cl(t / .15) * f)]; o.aE = [lerp(1.65, .3, cl(t / .15) * f), lerp(1.5, .3, cl(t / .15) * f)];
      o.glow = .5 * f; o.dy = Math.abs(Math.sin(t * 20)) * .12 * f; o.lean = .0; }
    else if (t > .3) { const pu = c => cl(1 - Math.abs(t - c) / .07), hs = Math.max(pu(.35), pu(.5), pu(.65));
      o.dx = ad * .2 * cl((t - .3) / .3); o.head = -.5 * hs; o.lean = .14 - .15 * hs; o.hurt = hs * .8; if (t > im) hitFlinch(.9, .7, .4); }
  } else if (k === "splash") {
    if (att) {
      const p = cl((t - .25) / .55), rise = cl((t - .88) / .12), ret = 1 - cl((t - .93) / .07), flat = cl((t - .4) / .3) * (1 - rise);
      const c = t < .25 ? cl(t / .25) : 1 - cl((t - .25) / .08);
      o.glow = cl(t / .25) * (1 - cl((t - .8) / .1)); o.h = [[.5, .3 + .6 * c], [-.45, .3 + .6 * c]]; o.lean = .14 - .25 * c;
      o.dx = ad * GAP * .8 * p * ret; o.dy = (Math.sin(p * Math.PI) * 3.3 + .4 * flat) * (1 - rise); o.rot = -ad * 1.45 * flat; o.dz = .55 * flat;
      if (t >= .25) { o.aS = [2.8, 2.8]; o.aE = [.1, .1]; o.lean = 0; }
    } else {
      const lan = cl((t - .8) / .05), rec = 1 - cl((t - .93) / .07);
      o.rot = -ad * 1.45 * lan * rec; o.dy = .32 * lan * rec; o.dz = -.25 * lan * rec; o.hurt = t > im ? 1 - cl((t - im) / .3) : 0; o.head = .4 * lan;
      if (t > .65 && t < .8) { o.aS = [1.9, 1.9]; o.aE = [.4, .4]; o.head = -.3; }
      if (A.ko && t > .82) { const v = cl((t - .82) / .18); o.dx = ad * v * 7.5; o.dy = .32 + Math.sin(v * Math.PI) * 1.3 - v * v * 4.4; o.rot = -ad * (1.45 + v * 2.2); o.dz = 0; o.hide = t > .97 ? 1 : 0; }
    }
  } else {
    const pull = GAP - RUSH - .25 + 1.0;
    if (att) {
      o.glow = cl(t / .2) * (1 - cl((t - .9) / .1));
      const rush = cl((t - .2) / .25) - cl((t - .85) / .15); o.dx = ad * RUSH * rush; o.dy = Math.sin(cl((t - .2) / .25) * Math.PI) * .22;
      const reach = cl((t - .25) / .2), lift = cl((t - .45) / .2), down = cl((t - .7) / .08), back = 1 - cl((t - .85) / .15);
      let s = lerp(.7, 1.5, reach); s = lerp(s, 2.9, lift); s = lerp(s, 1.2, down);
      o.aS = [s, s]; o.aE = [lerp(1.6, .05, reach) * (1 - lift) + .08, lerp(1.6, .05, reach) * (1 - lift) + .08];
      o.lean = .14 + .25 * reach - .6 * lift + .85 * down * back; o.h = [[.55 * rush + .38, .3], [-.4 * rush - .32, .25]];
    } else {
      const u = cl((t - .45) / .2), dn = cl((t - .7) / .08), rec = 1 - cl((t - .92) / .08);
      const pd = k === "piledriver", fin = k === "finisher", fr = pd ? 3.1 : 1.45;
      o.dx = (-ad * pull * u + ad * 1.5 * dn) * rec; o.dy = (.32 + 2.38 * (1 - dn) + (pd ? .5 * (1 - dn) : 0)) * u * rec; o.rot = -ad * fr * u * rec;
      o.aS = [2.5 * u + .5 * (1 - u), 2.7 * u + .5 * (1 - u)]; o.aE = [.3, .2]; o.lean = 0; o.head = .4 * u; o.hurt = t > im ? 1 - cl((t - im) / .3) : 0;
      if (A.ko && fin && t > .7) { const v = cl((t - .7) / .3); o.dx = -ad * pull - ad * (FX - pull + 1) * v; o.dy = 2.7 + Math.sin(v * Math.PI * .5) * 14; o.dz = -v * 48; o.rot = -ad * (1.45 + v * 8); o.hide = t > .97 ? 1 : 0; o.hurt = 1; }
      else if (A.ko && t > .78) { const v = cl((t - .78) / .22); o.dx = ad * (-pull + 1.5 + v * 7.2); o.dy = .32 + Math.sin(v * Math.PI) * 1.3 - v * v * 4.4; o.rot = -ad * (fr + v * 2.2); o.hide = t > .97 ? 1 : 0; }
    }
  }
  return o;
}

/* ---------- fighter ---------- */
const wTufts = [], hTufts = [];
(function () {
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283 + hash(i) * .6, h = .1 + hash(i + 40) * .95; wTufts.push([Math.cos(a) * .3, h, Math.sin(a) * .28, .2 + hash(i + 9) * .06, i * 3.1]); }
  for (let i = 0; i < 6; i++) wTufts.push([hash(i + 70) * .3 - .15, .15 + i * .17, (i % 2 ? 1 : -1) * .3, .19, 90 + i]);
  [[-.06, .27, 0, .15], [.04, .26, .16, .12], [.04, .26, -.16, .12], [-.14, .12, .2, .13], [-.14, .12, -.2, .13], [-.2, .17, 0, .14]].forEach((v, i) => hTufts.push([...v, 200 + i]));
})();

function drawFighter(o) {
  const pz = o.pose, sc = o.sc, w = o.wool;
  const Rm = m4.mul(m4.T(o.x + pz.dx, pz.dy, pz.dz || 0), m4.mul(m4.RZ(pz.rot), m4.mul(m4.RY(o.yaw + pz.yawAdd), m4.S(sc))));
  const xf = p => [Rm[0]*p[0] + Rm[4]*p[1] + Rm[8]*p[2] + Rm[12], Rm[1]*p[0] + Rm[5]*p[1] + Rm[9]*p[2] + Rm[13], Rm[2]*p[0] + Rm[6]*p[1] + Rm[10]*p[2] + Rm[14]];
  const ell = (mesh, c, r, mat) => R.draw(mesh, m4.mul(Rm, m4.mul(m4.T(c[0], c[1], c[2]), m4.S(r[0], r[1], r[2]))), mat);
  const seg = (mesh, a, b, r, mat) => R.draw(mesh, m4.mul(Rm, m4.seg(a, b, r)), mat);
  const glow = pz.glow, hurt = pz.hurt;
  const em = [glow * .16 + hurt * .5, glow * .04 + hurt * .08, hurt * .06];
  const wm = (seed, fur) => ({ c: w, fur: fur === undefined ? .6 : fur, furF: 5, rim: 1.1, seed, em });
  const dm = { c: COL.skin, rim: .9, spec: 24, em: [hurt * .5, 0, 0] };
  // legs
  const L1 = .5, L2 = .5, legs = [];
  let minY = 9;
  for (let i = 0; i < 2; i++) { const h = pz.h[i][0], k = pz.h[i][1], knee = [Math.sin(h) * L1, -Math.cos(h) * L1], foot = [knee[0] + Math.sin(h - k) * L2, knee[1] - Math.cos(h - k) * L2]; legs.push({ knee, foot }); minY = Math.min(minY, foot[1]); }
  const hipY = -minY + .05, hip = [0, hipY, 0], z0 = [-.2, .2];
  for (let i = 0; i < 2; i++) {
    const z = z0[i], lg = legs[i], hp = [0, hipY, z], kn = [lg.knee[0], hipY + lg.knee[1], z], ft = [lg.foot[0], hipY + lg.foot[1], z];
    seg(R.mesh.sphere, hp, kn, .16, wm(30 + i, .5)); seg(R.mesh.sphere, kn, ft, .115, dm);
    ell(R.mesh.sphereLo, [ft[0] + .09, ft[1] + .07, z], [.2, .1, .14], { c: COL.black, spec: 40, rim: .6 });
  }
  const lean = pz.lean, cs = Math.cos(lean), sn = Math.sin(lean);
  const U = (x, y, z) => [hip[0] + x * cs + y * sn, hip[1] - x * sn + y * cs, z];
  // trunks + belt
  ell(R.mesh.sphereLo, U(0, .08, 0), [.37, .27, .34], { c: o.trunk, spec: 30, rim: .6, em });
  ell(R.mesh.sphereLo, U(0, .3, 0), [.385, .075, .35], { c: COL.gold, spec: 60, rim: .8 });
  // torso (wool body)
  ell(R.mesh.sphere, U(0, .62, 0), [.42, .5, .37], wm(1));
  for (const t of wTufts) ell(R.mesh.sphereLo, U(t[0] * 1.1, t[1] + .22, t[2] * 1.2), [t[3], t[3], t[3]], wm(t[4]));
  // arms
  const sh = [U(.02, 1.0, -.46), U(.02, 1.0, .46)];
  const hands = [];
  for (let i = 0; i < 2; i++) {
    const s = pz.aS[i], e = pz.aE[i], a = sh[i], el = [a[0] + Math.sin(s) * .5, a[1] - Math.cos(s) * .5, a[2] + (i ? .04 : -.04) + pz.aZ[i] * .6], ang = s + e,
      hd = [el[0] + Math.sin(ang) * .5, el[1] - Math.cos(ang) * .5, el[2] + (i ? -.06 : .06) + pz.aZ[i] * .6]; hands.push(hd);
    ell(R.mesh.sphereLo, a, [.22, .22, .22], wm(50 + i));
    seg(R.mesh.sphere, a, el, .15, wm(52 + i, .5)); seg(R.mesh.sphere, el, hd, .12, wm(54 + i, .4));
    ell(R.mesh.sphereLo, [hd[0] + Math.sin(ang) * .07, hd[1] - Math.cos(ang) * .07, hd[2]], [.2, .2, .2], { c: o.glove, spec: 50, rim: .7, em });
  }
  // head
  const hc = U(.1, 1.5, 0), ha = pz.head + lean * .4, hcs = Math.cos(ha), hsn = Math.sin(ha);
  const HP = (x, y, z) => [hc[0] + x * hcs + y * hsn, hc[1] - x * hsn + y * hcs, z];
  const head = [HP(0, 0, 0), [.27, .31, .26]];
  ell(R.mesh.sphere, head[0], head[1], { c: COL.skin, rim: 1, spec: 20, em: [hurt * .5, 0, 0] });
  for (const t of hTufts) ell(R.mesh.sphereLo, HP(t[0], t[1], t[2]), [t[3], t[3], t[3]], wm(t[4]));
  ell(R.mesh.sphereLo, HP(.26, -.08, 0), [.2, .15, .15], { c: COL.snout, rim: .8, spec: 16 });
  ell(R.mesh.sphereLo, HP(.43, -.03, 0), [.055, .045, .06], { c: COL.black, spec: 80 });
  for (const z of [-.15, .15]) {
    ell(R.mesh.sphereLo, HP(.2, .07, z), [.075, .075, .075], { c: COL.white, em: [.5, .5, .5] });
    ell(R.mesh.sphereLo, HP(.245, .07, z), [.045, .05, .045], { c: COL.red, em: [2.6, .1, .05] });
    ell(R.mesh.sphereLo, HP(.275, .07, z), [.022, .028, .022], { c: COL.black });
    seg(R.mesh.sphereLo, HP(.12, .2 + (z > 0 ? 0 : 0), z * 1.1), HP(.29, .14, z * .85), .028, { c: COL.black });
    seg(R.mesh.sphereLo, HP(-.04, .08, z * 1.7), HP(-.14, -.1, z * 2.2), .07, { c: COL.skin, rim: .8 });
  }
  if (o.horns) for (const z of [-1, 1]) {
    const pts = [[-.02, .26, .12], [-.08, .4, .22], [-.2, .43, .32], [-.3, .33, .36], [-.31, .2, .32]];
    for (let i = 0; i < pts.length; i++) ell(R.mesh.sphereLo, HP(pts[i][0], pts[i][1], pts[i][2] * z), [.1 - i * .012, .1 - i * .012, .1 - i * .012], { c: COL.horn, spec: 50, rim: .8 });
  }
  // rifle
  let muzzle = null;
  if (pz.gun) {
    const gb = U(-.15, .98, .08), gt = U(1.35, 1.04, .08); muzzle = xf(gt);
    seg(R.mesh.cyl, gb, gt, .075, { c: [.22, .22, .25], spec: 90, rim: 1 });
    seg(R.mesh.cyl, U(-.3, .9, .08), U(.25, .98, .08), .11, { c: lin("#5a3d12"), spec: 20 });
    ell(R.mesh.sphereLo, U(.62, 1.15, .08), [.15, .08, .06], { c: [.22, .22, .25], spec: 60 });
  }
  const out = { chest: xf(U(0, .62, 0)), head: xf(HP(0, .42, 0)), muzzle, hands: hands.map(xf), hat: null };
  if (o.hat) { const tex = R.emojiTex(o.hat); if (tex) out.hat = { tex, p: xf(HP(0, .56, 0)), s: .36 * sc, hid: !!pz.nohat }; }
  return out;
}

/* ---------- environment ---------- */
let crowd = [];
function buildCrowd() {
  crowd = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 14; i++) {
    const x = -7.6 + i * (15.2 / 13) + (r ? .55 : 0) + (hash(i + r * 31) - .5) * .3, z = -5.4 - r * 1.8, y = .35 + r * .6;
    crowd.push({ x, y, z, jersey: CROWD[(hash(i * 3 + r * 17) * 5) | 0], ph: hash(i + r * 7) * 9, seed: i + r * 20 });
  }
}
function drawEnv(S) {
  const t = S.T / 1000, ch = S.cheer > 0 ? Math.min(1, S.cheer) : 0, M = m4;
  // lava
  R.draw(R.mesh.quad, M.mul(M.T(0, -1.4, -8), M.mul(M.RX(-Math.PI / 2), M.S(80, 80, 1))), { mode: 1, c: [1, 1, 1] });
  // volcano and mountains
  const rock = (x, y, z, sx, sy, sz, seed, em) => R.draw(R.mesh.cone, M.mul(M.T(x, y, z), M.S(sx, sy, sz)), { mode: 2, c: COL.rock, em: [em === undefined ? 1 : em, 0, 0], seed, rim: 0 });
  rock(0, 6.6, -52, 24, 8, 24, 3.1, .8); rock(-11, 3.4, -46, 11, 5.4, 9, 4.4, .7); rock(12, 3, -47, 12, 4.8, 9, 6.6, .7); rock(-4, 5, -44, 7, 7.2, 6, 8.8, .8); rock(6, 4.2, -43, 6, 6, 6, 1.7, .8); rock(-34, 3.4, -38, 13, 5, 13, 7.3, .6); rock(36, 3, -40, 14, 4.6, 14, 11.7, .6);
  rock(-9.5, 1.2, -3, 1.3, 2.6, 1.3, 2.2, .7); rock(10.5, .9, -2.5, 1.5, 2.3, 1.5, 5.5, .7); rock(-12, .4, 4, 1.6, 1.8, 1.6, 8.1, .6); rock(13, .8, 5, 1.4, 2.1, 1.4, 9.4, .6);
  // ring apron + mat + trim
  R.draw(R.mesh.box, M.mul(M.T(0, -.78, 0), M.S(4.65, .5, 3.05)), { c: lin("#5a0f12"), spec: 20, rim: .5, em: [.35, .06, .02] });
  R.draw(R.mesh.box, M.mul(M.T(0, -.27, 0), M.S(4.7, .06, 3.1)), { c: COL.gold, spec: 70, rim: .6 });
  R.draw(R.mesh.box, M.mul(M.T(0, -.25, 0), M.S(4.4, .25, 2.8)), { mode: 3, tex: ringTex, c: [1, 1, 1], spec: 60, rim: .2 });
  // posts and ropes
  const PX = 4.4, PZ = 2.8, rh = [.55, .95, 1.35], rc = [COL.red, [1.2, 1.15, 1.05], COL.red];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    R.draw(R.mesh.cyl, M.mul(M.T(sx * PX, 1.0, sz * PZ), M.S(.11, 1.05, .11)), { c: COL.gold, spec: 80, rim: .8 });
    for (const h of rh) R.draw(R.mesh.box, M.mul(M.T(sx * PX, h, sz * PZ), M.S(.17, .1, .17)), { c: COL.red, spec: 20 });
    R.draw(R.mesh.sphereLo, M.mul(M.T(sx * PX, 2.12, sz * PZ), M.S(.16)), { c: [3, 1.2, .3], em: [3, 1.2, .3] });
  }
  rh.forEach((h, i) => {
    const m = { c: rc[i], spec: 40, rim: .6 };
    R.draw(R.mesh.cyl, M.mul(M.mul(M.T(0, h, -PZ), M.RZ(Math.PI / 2)), M.S(.045, PX, .045)), m);
    for (const sx of [-1, 1]) R.draw(R.mesh.cyl, M.mul(M.mul(M.T(sx * PX, h, 0), M.RX(Math.PI / 2)), M.S(.045, PZ, .045)), m);
  });
  // crowd stands + sheep spectators
  for (let r = 0; r < 2; r++) R.draw(R.mesh.box, M.mul(M.T(0, -.1 + r * .6, -5.5 - r * 1.8), M.S(8.4, .5, .9)), { c: lin("#241014"), rim: .2 });
  for (const c of crowd) {
    const j = ch > 0 ? Math.abs(Math.sin(t * 11 + c.ph)) * .32 * ch : Math.sin(t * 2 + c.ph) * .03, y = c.y + j;
    R.draw(R.mesh.sphereLo, M.mul(M.T(c.x, y + .35, c.z), M.S(.3, .34, .28)), { c: c.jersey, rim: 1 });
    R.draw(R.mesh.sphereLo, M.mul(M.T(c.x, y + .66, c.z), M.S(.3, .17, .27)), { c: WOOL[0], fur: .5, furF: 5, seed: c.seed, rim: 1 });
    R.draw(R.mesh.sphereLo, M.mul(M.T(c.x, y + .72, c.z + .2), M.S(.17, .2, .16)), { c: COL.skin, rim: 1 });
    if (ch > 0) for (const sx of [-1, 1]) R.draw(R.mesh.sphereLo, M.mul(M.T(c.x + sx * .36, y + .75 + Math.sin(t * 13 + c.ph + sx) * .12, c.z), M.S(.1)), { c: WOOL[0], rim: 1 });
  }
}

/* ---------- main frame ---------- */
function frame(dt, S) {
  if (!R || R.lost) return false;
  const T = S.T, t = T / 1000;
  S.seq = st.seq; st.t += dt; if (!st.hold) st.intro += dt; S.intro = st.intro;
  // cheap auto quality
  if (auto && dt > 0 && dt < .2 && !document.hidden) {
    frameAcc += dt; if (++frameN >= 150) {
      const avg = frameAcc / frameN; frameAcc = 0; frameN = 0;
      if (R.quality >= 2 && avg > .036) { R.setQuality(1); resizeTo(st.cw, st.ch, st.dpr); onDownCb && onDownCb(); }
      else if (R.quality < 2 && avg > .05) onLowCb && onLowCb();
    }
  }
  const poses = { p: poseOf("p", S), e: poseOf("e", S) };
  const aspect = R.w / R.h, fov = 40 * Math.PI / 180, tanx = Math.tan(fov / 2) * aspect;
  let D = Math.max(8.5, Math.min(15, FX / (.4 * tanx)));
  const A = S.A; let ph = 0, adC = 0;
  if (A) { const tt = A.t / A.d; adC = A.who === "p" ? 1 : -1; ph = A.k === "splash" ? 0 : bk(A) === "slam" ? Math.sin(Math.PI * cl((tt - .15) / .8)) : Math.sin(Math.PI * cl(tt)) * .45; }
  const kd = INTRO[introKind(S)], inIntro = !S.over && st.intro < kd.dur, introK = inIntro ? cl(1 - st.intro / kd.dur) : 0;
  if (!st.landed && st.intro >= kd.land && !S.over) { st.landed = true; const bs = introKind(S) === "boss";
    if (bs) { burst(FX, .2, 0, 70, 6.5, [3, 1.5, .4]); rings.push({ x: FX, y: .05, z: 0, t: 0, life: .9, max: 6.5, c: [3, 1.1, .2], flat: true }); st.kick = 1; st.flashL = { x: FX, y: 1, z: 1.6, i: 9, c: [3, 1.2, .3] }; st.ab = 1;
      for (let i = 0; i < 14; i++) sp(FX + rnd(-1, 1), .15, rnd(-.6, .6), rnd(-2, 2), rnd(.4, 1.4), rnd(-1, 1), rnd(.8, 1.5), .5, 1.6, [.5, .27, .17], .45, false, 0, 1.2); }
    else if (introKind(S) === "jump") { burst(FX, .2, 0, 24, 4, [3, 1.8, .6]); rings.push({ x: FX, y: .05, z: 0, t: 0, life: .5, max: 2.4, c: [3, 1.6, .5], flat: true }); st.kick = .3; } }
  const shk = (S.shake || 0) + st.kick * 18; st.kick *= Math.pow(.01, dt);
  const koT = (A && A.ko && bk(A) !== "slam") ? cl((A.t / A.d - A.imp) / .25) : 0; D -= 1.8 * koT; D += 2.4 * introK;
  const spK = (A && A.k === "splash") ? Math.sin(Math.PI * cl((A.t / A.d - .2) / .65)) : 0; D += 3.4 * spK;
  const koK = (A && bk(A) === "slam" && A.ko && A.k !== "finisher") ? cl((A.t / A.d - .72) / .15) : 0; D += 4.2 * koK; const fK = (A && A.k === "finisher" && A.ko) ? cl((A.t / A.d - .7) / .3) : 0; D += 3.2 * fK;
  const eye = [Math.sin(t * .35) * .35 + adC * ph * 1.1 + (Math.random() - .5) * shk * .018, 3.0 + introK * .8 - ph * (A && bk(A) === "slam" ? .85 : .2) + (Math.random() - .5) * shk * .018, D - ph * (A && bk(A) === "slam" ? 2.6 : .9)];
  const spX = (A && A.k === "splash") ? cl((A.t / A.d - .5) / .25) * (1 - cl((A.t / A.d - .93) / .07)) : 0;
  const target = [adC * ph * .5 - adC * fK * 1.5 + adC * koK * 1.6 + adC * koT * .9 + adC * spX * 1.4, 1.75 - koK * .5 + fK * 6 + spK * 1.5 + (introKind(S) === "boss" ? introK * 1.4 : 0), -fK * 9];
  /* lights */
  const lights = [];
  if (st.flashL) { st.flashL.i *= Math.pow(.02, dt); if (st.flashL.i < .2) st.flashL = null; else lights.push(st.flashL); }
  for (const w of ["p", "e"]) if (poses[w].glow > .05) lights.push({ x: (w === "p" ? -FX : FX) + poses[w].dx, y: 1.5, z: 1.4, i: 1.6 * poses[w].glow, c: [3, 1.1, .2] });
  R.begin({ eye, target, fov }, t, lights);

  drawEnv(S);
  // fighters
  const style = S.eStyle | 0, boss = !!S.boss, imm = [];
  const out = {};
  const defs = {
    p: { x: -FX, yaw: -.32, sc: 1.14, wool: WOOL[0], trunk: lin("#b9852a"), glove: lin("#d9302c"), hat: S.pHat, horns: false },
    e: { x: FX, yaw: Math.PI + .32, sc: boss ? 1.5 : 1.18, wool: boss ? lin("#2e2024") : WOOL[style % 6], trunk: boss ? lin("#3a0a0a") : lin("#7a1b1b"), glove: lin("#2b6cff"), hat: S.eHat, horns: boss || style % 3 === 0 }
  };
  for (const w of ["p", "e"]) {
    const o = Object.assign({}, defs[w], { pose: poses[w] });
    if (!poses[w].hide) { out[w] = drawFighter(o); st.chest[w] = out[w].chest; }
    // contact shadow
    if (!poses[w].hide && poses[w].dy > -.2) R.draw(R.mesh.sphereLo, m4.mul(m4.T(defs[w].x + poses[w].dx, .02, 0), m4.S(.75 * o.sc * (1 - poses[w].dy * .2), .01, .5 * o.sc)), { c: [0, 0, 0], alpha: .5 * cl(1 - poses[w].dy * .6), blend: 1, rim: 0 });
  }
  // multi-hit moves: extra mini impacts + whirlwind
  if (A && SUB[A.k]) { if (A._sub === undefined) A._sub = 0; const c = st.chest[A.who === "p" ? "e" : "p"], tl = SUB[A.k];
    while (A._sub < tl.length && A.t / A.d >= tl[A._sub]) { A._sub++; if (c) { burst(c[0], c[1], c[2], 12, 3.5, [3, 2.2, .8]); st.kick = Math.max(st.kick, .22); st.ab = Math.max(st.ab, .35); st.flashL = { x: c[0], y: c[1] + .3, z: 1.6, i: 3.5, c: [3, 2.4, 1.2] }; } } }
  if (A && A.k === "tornado") { const tt = A.t / A.d; if (tt > .12 && tt < .78) { const ax = (A.who === "p" ? -FX : FX) + poses[A.who].dx;
    for (let q = 0; q < 3; q++) { const a = Math.random() * 6.283; sp(ax + Math.cos(a) * 1.3, rnd(.2, 2.2), Math.sin(a) * .9, -Math.sin(a) * 3, 0, Math.cos(a) * 3, .35, .22, .02, [3, 2.2, 1], .8, true, 0, 1.5); } } }
  // new-move effects
  if (A) {
    const tt = A.t / A.d, att = A.who, tg = att === "p" ? "e" : "p", ad = att === "p" ? 1 : -1, c = st.chest[tg], ax = (att === "p" ? -FX : FX) + poses[att].dx;
    if (A.k === "lavawave" && tt > .5 && tt < .74 && c) { const f = (tt - .5) / .24, wx = lerp(ax, c[0], f);
      for (let q = 0; q < 8; q++) sp(wx + rnd(-.3, .3), .1, rnd(-1.1, 1.1), ad * rnd(.5, 2), rnd(1.5, 4.5), 0, rnd(.3, .6), .22, .02, [3.4, 1.4, .3], 1, true, -6, .5);
      st.flashL = { x: wx, y: .4, z: 1.2, i: 4, c: [3, 1.2, .3] };
      if (!A._w) { A._w = 1; rings.push({ x: ax, y: .05, z: 0, t: 0, life: .7, max: 4, c: [3, 1.1, .2], flat: true }); st.kick = Math.max(st.kick, .5); st.ab = 1; } }
    const hh = out[att] && (out[att].hat || (out[att].head && { tex: R.emojiTex("🎩"), p: [out[att].head[0], out[att].head[1] + .5, out[att].head[2]], s: .41 }));
    if (A.k === "hatrang" && hh && c) { const h = hh, u = tt < .55 ? cl((tt - .2) / .35) : 1 - cl((tt - .55) / .35);
      if (tt > .2 && tt < .9) { const ey = u * Math.PI, px = lerp(h.p[0], c[0], u), py = lerp(h.p[1], c[1] + .4, u) + Math.sin(ey) * .5, pz = lerp(h.p[2], c[2], u);
        R.billboard(h.tex, [px, py, pz], h.s * (.55 + .45 * Math.abs(Math.cos(tt * 40))) * 1.2, h.s * 1.2, 1.1);
        for (let q = 0; q < 2; q++) sp(px, py, pz, rnd(-.5, .5), rnd(-.2, .6), rnd(-.3, .3), .3, .14, .02, [3, 2.4, .8], 1, true, 0, 2); } }
    if (A.k === "woolbomb" && c) { const WC = [.95, .92, .85];
      if (tt > .3 && tt < .5) for (let q = 0; q < 6; q++) sp(ax, 1.3 + rnd(-.3, .3), rnd(-.3, .3), ad * rnd(5, 9), rnd(-.5, 1), rnd(-.5, .5), rnd(.4, .7), .28, .5, WC, .9, false, 0, .5);
      if (tt > A.imp && tt < .95) { const h = out[tg] && out[tg].head; if (h) for (let q = 0; q < 2; q++) sp(h[0] + rnd(-.3, .3), h[1] + rnd(-.2, .3), h[2] + rnd(-.2, .3), rnd(-.4, .4), rnd(0, .6), rnd(-.3, .3), rnd(.4, .8), .3, .45, WC, .9, false, 0, 1.5); }
      if (!A._w && tt >= A.imp) { A._w = 1; for (let q = 0; q < 40; q++) sp(c[0] + rnd(-.3, .3), c[1] + rnd(0, .6), c[2], rnd(-3, 3), rnd(-1, 3), rnd(-1.5, 1.5), rnd(.6, 1.1), .35, .55, WC, .9, false, -1.5, 1.2); } }
    if (A.k === "crowdrush" && c) { const S0 = [[-5, 1.6, -4, .12], [0, 1.8, -4.4, .27], [4.8, 1.6, -4, .42]], body = { c: WOOL[0], fur: .6, furF: 5, rim: 1.1, seed: 7 };
      for (const [sx, sy, sz, s0] of S0) { const u = cl((tt - s0) / .23); if (u > 0 && u < 1) { const x = lerp(sx, c[0], u), y = lerp(sy, c[1], u) + Math.sin(u * Math.PI) * 1.3, z = lerp(sz, c[2], u);
        R.draw(R.mesh.sphere, m4.mul(m4.T(x, y, z), m4.S(.5, .45, .45)), body); R.draw(R.mesh.sphere, m4.mul(m4.T(x - ad * .0, y + .05, z + .4), m4.S(.2, .22, .2)), { c: lin("#2a1c18"), rim: 0 });
        sp(x, y, z, rnd(-.3, .3), rnd(-.3, .3), 0, .3, .12, .02, [2.5, 2, 1], .8, true, 0, 2); } } }
    if (A.k === "finisher" && A.ko && tt > .93 && !A._w) { A._w = 1; burst(0, 14.5, -50, 90, 14, [3.4, 1.4, .3], -6); rings.push({ x: 0, y: 14.4, z: -51, t: 0, life: 1.2, max: 14, c: [3, 1.2, .2], flat: true }); st.flashL = { x: 0, y: 8, z: 4, i: 9, c: [3, 1.2, .3] }; st.ab = 1; st.kick = 1; }
  }
  // light shafts
  for (const [x, z, rz] of [[-3.5, -1, .18], [3.8, -1.5, -.2], [0, -3, 0]]) {
    R.draw(R.mesh.shaft, m4.mul(m4.mul(m4.T(x, 4.6, z), m4.RZ(rz)), m4.S(1.5, 5.2, 1.5)), { mode: 4, c: [1, .72, .4], em: [.5, 0, 0], blend: 2, alpha: 1 });
  }
  // hats
  for (const w of ["p", "e"]) if (out[w] && out[w].hat && !out[w].hat.hid) R.billboard(out[w].hat.tex, out[w].hat.p, out[w].hat.s, out[w].hat.s, 1.1);
  // stun stars
  for (const w of ["p", "e"]) if (out[w] && poses[w].stars) for (let k = 0; k < 3; k++) { const a = t * 6 + k * 2.09, h = out[w].head; imm.push({ x: h[0] + Math.cos(a) * .42, y: h[1] + .15, z: h[2] + Math.sin(a) * .22, s0: .24, c: [3, 2.6, .6], a: 1 }); }
  // muzzle flash + bullets
  if (A && A.k === "rifle") {
    const att = A.who, tg = att === "p" ? "e" : "p", tt = A.t / A.d, m = out[att] && out[att].muzzle, c = st.chest[tg];
    if (m && poses[att].mf) { imm.push({ x: m[0], y: m[1], z: m[2], s0: 1.3, c: [3.4, 2.4, .8], a: 1 }); st.flashL = { x: m[0], y: m[1], z: m[2] + 1.2, i: 4, c: [3, 2, .6] }; }
    if (m && c) for (let b = 0; b < 3; b++) { const u = (tt - .3 - b * .06) / .22; if (u > 0 && u < 1) for (let q = 0; q < 6; q++) { const uu = Math.max(0, u - q * .03); imm.push({ x: lerp(m[0], c[0], uu), y: lerp(m[1], c[1], uu), z: lerp(m[2], c[2], uu), s0: .2 - q * .02, c: [3, 2.4, .8], a: 1 - q * .15 }); } }
  }
  // slam KO into lava
  if (A && A.ko && ((bk(A) === "slam" && A.k !== "finisher") || A.k === "ramcharge")) { if (st.splashFor !== A) { if (A.t / A.d > .9) { st.splashFor = A; const tg = A.who === "p" ? "e" : "p", ad = A.who === "p" ? 1 : -1; lavaSplash(ad * 5.2); } } }
  // slam charge embers
  for (const w of ["p", "e"]) if (poses[w].glow > .3 && Math.random() < .8) sp((w === "p" ? -FX : FX) + poses[w].dx + rnd(-.5, .5), rnd(.2, 1.2), rnd(-.3, .3), rnd(-.4, .4), rnd(1.5, 3.5), 0, rnd(.4, .8), .12, .02, [3, 1.2, .25], 1, true, 0, .3);
  // ambient: lava embers, crater column, brazier flames
  st.acc += dt * 60;
  while (st.acc >= 1) {
    st.acc -= 1;
    if (Math.random() < .55) sp(rnd(-10, 10), -1.2, rnd(-6, 4), rnd(-.3, .5), rnd(1.2, 3.2), rnd(-.2, .2), rnd(3, 5.5), rnd(.05, .11), .02, [3, 1.1, .25], 1, true, .15, .1);
    if (Math.random() < .22) sp(rnd(-3, 3), 14.4, -52, rnd(-3, 3), rnd(7, 13), rnd(-1, 2), rnd(2.2, 3.4), .6, .05, [3.4, 1.3, .3], 1, true, -4.5, .1);
    if (Math.random() < .12) sp(rnd(-3, 3), 14.6, -52, rnd(-1, 1), rnd(2, 4), rnd(0, 2), rnd(5, 8), 4, 14, [.16, .07, .06], .5, false, 0, .2);
    if (Math.random() < .5) { const sx = Math.random() < .5 ? -1 : 1, sz = Math.random() < .5 ? -1 : 1; sp(sx * 4.4 + rnd(-.05, .05), 2.2, sz * 2.8, rnd(-.1, .1), rnd(1, 2.2), rnd(-.1, .1), rnd(.5, .9), .3, .02, [3, 1.1, .2], .9, true, 0, .5); }
  }
  // crater glow
  imm.push({ x: 0, y: 14.4, z: -51, s0: 30, c: [1.5, .42, .08], a: .55 });
  // shock rings
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; const u = r.t / r.life; if (u >= 1) { rings.splice(i, 1); continue; }
    const rad = r.max * (1 - Math.pow(1 - u, 3)), a = (1 - u) * (1 - u);
    const M = r.flat ? m4.mul(m4.T(r.x, r.y, r.z), m4.S(rad, rad * (r.flat ? .6 : 1), rad)) : m4.mul(m4.T(r.x, r.y, r.z), m4.mul(m4.RX(Math.PI / 2), m4.S(rad)));
    R.draw(R.mesh.torus, M, { c: [0, 0, 0], em: r.c, alpha: a, blend: 2, rim: 0 });
  }
  stepParts(dt); drawParts(imm);
  st.ab = Math.max(0, st.ab - dt * 3);
  R.end({ bloom: .55 + (S.flash || 0) * .4 + koT * .35, exp: .98, ab: st.ab * .012 + shk * .0003 + koT * .006, flash: (S.flash || 0) * .35 });
  return true;
}

function resizeTo(w, h, dpr) { st.cw = w; st.ch = h; st.dpr = dpr; R.resize(w, h, dpr); }

window.Ring3D = {
  init(canvas, o) {
    o = o || {}; onLowCb = o.onLow; onDownCb = o.onDown; auto = o.auto !== false && !window.A2_NO_AUTO;
    try {
      R = R3C.create(canvas, { onLost: o.onLost, preserve: o.preserve });
      if (!R) return false;
      st = { t: 0, intro: 99, landed: true, kick: 0, seq: 0, chest: {}, flashL: null, ab: 0, acc: 0, splashFor: null, cw: canvas.clientWidth, ch: canvas.clientHeight, dpr: window.devicePixelRatio || 1 };
      if (o.quality !== undefined) R.setQuality(o.quality);
      ringTex = makeRingTex(); buildCrowd();
      return true;
    } catch (e) { console.error("Ring3D init failed", e); R = null; return false; }
  },
  resize(w, h, dpr) { if (R) resizeTo(w, h, dpr); },
  frame(dt, S) { try { return frame(dt, S); } catch (e) { console.error("Ring3D frame failed", e); return false; } },
  impact(k, who, ko) { try { impact(k, who, ko); } catch (e) { console.error(e); } },
  setQuality(q) { if (R) { R.setQuality(q); resizeTo(st.cw, st.ch, st.dpr); } },
  get quality() { return R ? R.quality : 0; },
  get post() { return R ? R.post : false; },
  _pose: (w, S) => poseOf(w, S),
  _intro(v) { if (st) { st.hold = v >= 0; if (v >= 0) { st.intro = v; st.landed = v > 1.2; } } },
  dbg() { return { parts: parts.length, rings: rings.length, splash: st && !!st.splashFor }; },
  reset() { parts.length = 0; rings.length = 0; if (st) { st.flashL = null; st.splashFor = null; st.intro = 0; st.landed = false; st.kick = 0; } }
};
})();

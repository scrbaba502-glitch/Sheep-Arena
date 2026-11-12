/* A² Sheep Arena — tiny WebGL2 engine (no dependencies).
   Provides: matrices, procedural meshes, one "uber" shader (wool fur / lava / rock / textured),
   additive + alpha particles, HDR render target with bloom + tonemapping. */
(function () {
"use strict";

/* ---------------- math (column-major) ---------------- */
const m4 = {
  id: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      const b0 = b[c*4], b1 = b[c*4+1], b2 = b[c*4+2], b3 = b[c*4+3];
      for (let r = 0; r < 4; r++) o[c*4+r] = a[r]*b0 + a[4+r]*b1 + a[8+r]*b2 + a[12+r]*b3;
    }
    return o;
  },
  T(x, y, z) { const o = m4.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
  S(x, y, z) { const o = m4.id(); o[0] = x; o[5] = y === undefined ? x : y; o[10] = z === undefined ? x : z; return o; },
  RX(a) { const c = Math.cos(a), s = Math.sin(a), o = m4.id(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
  RY(a) { const c = Math.cos(a), s = Math.sin(a), o = m4.id(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  RZ(a) { const c = Math.cos(a), s = Math.sin(a), o = m4.id(); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  },
  look(e, t, u) {
    let zx = e[0]-t[0], zy = e[1]-t[1], zz = e[2]-t[2], l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = u[1]*zz - u[2]*zy, xy = u[2]*zx - u[0]*zz, xz = u[0]*zy - u[1]*zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
    const o = m4.id();
    o[0] = xx; o[1] = yx; o[2] = zx; o[4] = xy; o[5] = yy; o[6] = zy; o[8] = xz; o[9] = yz; o[10] = zz;
    o[12] = -(xx*e[0] + xy*e[1] + xz*e[2]); o[13] = -(yx*e[0] + yy*e[1] + yz*e[2]); o[14] = -(zx*e[0] + zy*e[1] + zz*e[2]);
    return o;
  },
  /* model matrix of a unit mesh stretched along p0->p1 with radius r (mesh spans y -1..1) */
  seg(p0, p1, r) {
    const dx = p1[0]-p0[0], dy = p1[1]-p0[1], dz = p1[2]-p0[2], len = Math.hypot(dx, dy, dz) || 1e-6;
    const yx = dx/len, yy = dy/len, yz = dz/len;
    let ax = 0, ay = 0, az = 1; if (Math.abs(yz) > .9) { ax = 1; az = 0; }
    let xx = yy*az - yz*ay, xy = yz*ax - yx*az, xz = yx*ay - yy*ax, l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const zx = xy*yz - xz*yy, zy = xz*yx - xx*yz, zz = xx*yy - xy*yx, h = len / 2;
    return new Float32Array([xx*r, xy*r, xz*r, 0,  yx*h, yy*h, yz*h, 0,  zx*r, zy*r, zz*r, 0,
      (p0[0]+p1[0])/2, (p0[1]+p1[1])/2, (p0[2]+p1[2])/2, 1]);
  }
};

/* ---------------- shaders ---------------- */
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUv;
uniform mat4 uVP, uM;
out vec3 vW, vN, vO; out vec2 vUv;
void main(){ vec4 w=uM*vec4(aPos,1.); vW=w.xyz; vN=transpose(inverse(mat3(uM)))*aNor; vO=aPos; vUv=aUv; gl_Position=uVP*w; }`;

const NOISE = `
float h31(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
uniform int uOct;
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){if(i>=uOct)break;s+=a*vn(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}`;

const FS = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec3 vO; in vec2 vUv;
out vec4 oC;
uniform vec3 uCam; uniform float uT, uPost, uFogK;
uniform vec3 uCol, uEm; uniform float uFur, uSpec, uRim, uSeed, uAlpha, uFurF;
uniform int uMode; uniform sampler2D uTex;
uniform vec4 uPL[2]; uniform vec3 uPLc[2];
${NOISE}
void main(){
  vec3 N=normalize(vN), V=normalize(uCam-vW), col; float d=length(uCam-vW);
  if(uMode==1){
    vec2 p=vW.xz*.26; float t=uT*.11;
    float n=fbm(vec3(p+vec2(t*.5,-t*.3),t*.4));
    float m=fbm(vec3(p*2.1+n*1.6-vec2(t*.7,0.),t*.6+7.));
    float vein=pow(1.-abs(2.*n-1.),3.);
    float heat=clamp(vein*1.15+m*.6-.25,0.,1.5);
    vec3 c=mix(vec3(.025,.007,.006),vec3(.95,.13,.02),smoothstep(.12,.55,heat));
    c=mix(c,vec3(2.8,1.05,.2),smoothstep(.5,.95,heat));
    c=mix(c,vec3(3.4,2.5,1.1),smoothstep(.95,1.35,heat));
    col=c*uCol;
    for(int i=0;i<2;i++){vec3 dl=uPL[i].xyz-vW;col+=uPLc[i]*uPL[i].w*.5/(1.+dot(dl,dl)*.08);}
  } else if(uMode==4){
    float edge=pow(abs(dot(N,V)),1.6);
    col=uCol*uEm.x*pow(vUv.y,1.6)*edge*(.75+.25*vn(vec3(vUv*6.,uT*.4)));
  } else {
    vec3 base=uCol; vec3 em=uEm;
    if(uMode==3) base*=texture(uTex,vUv).rgb;
    if(uMode==2){
      vec3 p=vO*2.6+uSeed; float n=fbm(p); float e=.1;
      N=normalize(N+(vec3(n)-vec3(vn(p+vec3(e,0,0)),vn(p+vec3(0,e,0)),vn(p+vec3(0,0,e))))*3.);
      base*=.45+1.2*n;
      float vv=pow(1.-abs(2.*fbm(vO*2.1+uSeed+vec3(0.,uT*.04,0.))-1.),7.);
      em=vec3(3.2,.8,.12)*vv*uEm.x*(.7+.3*sin(uT*.9+vO.y*4.+uSeed))*smoothstep(-.6,.9,vO.y+.4);
    }
    if(uFur>0.){
      vec3 p=vO*uFurF+vec3(uSeed); float e=.12; float c0=vn(p);
      N=normalize(N+uFur*vec3(c0-vn(p+vec3(e,0,0)),c0-vn(p+vec3(0,e,0)),c0-vn(p+vec3(0,0,e)))*4.);
      base*=.8+.4*c0;
    }
    vec3 L=normalize(vec3(-.35,.9,.55)); float w=.35; float ndl=max((dot(N,L)+w)/(1.+w),0.);
    vec3 key=vec3(1.,.92,.8)*1.55*ndl;
    float up=N.y*.5+.5;
    vec3 hemi=mix(vec3(1.35,.4,.1)*.8,vec3(.26,.22,.34),up);
    float ao=mix(.45,1.,smoothstep(-.2,.8,vW.y));
    vec3 lit=(key+hemi)*ao;
    for(int i=0;i<2;i++){vec3 dl=uPL[i].xyz-vW;float dd=dot(dl,dl);lit+=uPLc[i]*uPL[i].w/(1.+dd*1.1)*max(dot(N,normalize(dl))*.6+.4,0.);}
    col=base*lit+em;
    float fr=pow(1.-max(dot(N,V),0.),3.)*uRim;
    col+=vec3(1.,.45,.14)*fr*(.45+.55*max(dot(N,normalize(vec3(0.,.3,-1.))),0.))*2.2;
    col+=vec3(.3,.5,1.)*fr*max(dot(N,normalize(vec3(-1.,.2,.3))),0.)*.6;
    if(uSpec>.5){vec3 H=normalize(L+V);col+=vec3(1.,.9,.8)*pow(max(dot(N,H),0.),uSpec)*ndl*.7;}
  }
  if(uMode!=4){float f=1.-exp(-pow(d*uFogK,1.4));if(uMode==2)f*=.5;col=mix(col,vec3(.3,.08,.04),clamp(f,0.,1.));}
  if(uPost<.5){col=pow(aces(col),vec3(1./2.2));}
  oC=vec4(col,uAlpha);
}`;

const FS_VERT = `#version 300 es
out vec2 vUv; void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); vUv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;

const FS_SKY = `#version 300 es
precision highp float; in vec2 vUv; out vec4 oC;
uniform float uT, uPost, uAsp; ${NOISE}
void main(){
  vec2 uv=vUv; float y=uv.y;
  vec3 hor=vec3(1.0,.26,.06)*.7, mid=vec3(.2,.045,.04), top=vec3(.015,.006,.014);
  vec3 c=mix(hor,mid,smoothstep(0.,.5,y)); c=mix(c,top,smoothstep(.3,1.,y));
  float cl=fbm(vec3(uv.x*3.*uAsp+uT*.012,uv.y*3.,uT*.03));
  c+=vec3(.55,.14,.05)*smoothstep(.42,.85,cl)*(1.-y)*1.1;
  c+=vec3(.05,.02,.04)*smoothstep(.5,.9,fbm(vec3(uv*5.+3.,uT*.02)))*y;
  if(uPost<.5){c=pow(aces(c),vec3(1./2.2));}
  oC=vec4(c,1.);
}`;

const VS_PT = `#version 300 es
layout(location=0) in vec4 aP; layout(location=1) in vec4 aC;
uniform mat4 uVP; uniform float uPx, uMax; out vec4 vC;
void main(){ gl_Position=uVP*vec4(aP.xyz,1.); gl_PointSize=clamp(aP.w*uPx/max(gl_Position.w,.01),1.,uMax); vC=aC; }`;
const FS_PT = `#version 300 es
precision highp float; in vec4 vC; out vec4 oC; uniform float uPost;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){ float r=length(gl_PointCoord-.5)*2.; float a=clamp(1.-r,0.,1.); a*=a;
  vec3 c=vC.rgb; if(uPost<.5){c=pow(aces(c),vec3(1./2.2));} oC=vec4(c,vC.a*a); }`;

const VS_BB = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=2) in vec2 aUv;
uniform mat4 uVP; uniform vec3 uC, uR, uU; uniform vec2 uSz; out vec2 vUv;
void main(){ vUv=aUv; gl_Position=uVP*vec4(uC+uR*aPos.x*uSz.x+uU*aPos.y*uSz.y,1.); }`;
const FS_BB = `#version 300 es
precision highp float; in vec2 vUv; out vec4 oC; uniform sampler2D uTex; uniform float uPost, uBright;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){ vec4 t=texture(uTex,vUv); if(t.a<.08)discard; vec3 c=t.rgb*uBright; if(uPost<.5){c=pow(aces(c),vec3(1./2.2));} oC=vec4(c,t.a); }`;

const FS_BRIGHT = `#version 300 es
precision highp float; in vec2 vUv; out vec4 oC; uniform sampler2D uS; uniform float uThr;
void main(){ vec3 c=texture(uS,vUv).rgb; float l=max(c.r,max(c.g,c.b)); float k=clamp((l-uThr)/(l+.0001),0.,1.); oC=vec4(c*k,1.); }`;
const FS_BLUR = `#version 300 es
precision highp float; in vec2 vUv; out vec4 oC; uniform sampler2D uS; uniform vec2 uDir;
void main(){ vec3 c=texture(uS,vUv).rgb*.227027;
  c+=(texture(uS,vUv+uDir*1.3846).rgb+texture(uS,vUv-uDir*1.3846).rgb)*.3162162;
  c+=(texture(uS,vUv+uDir*3.2308).rgb+texture(uS,vUv-uDir*3.2308).rgb)*.0702703; oC=vec4(c,1.); }`;
const FS_COMP = `#version 300 es
precision highp float; in vec2 vUv; out vec4 oC;
uniform sampler2D uS, uA, uB; uniform float uBloom, uExp, uAb, uFlash, uVig, uTime; uniform vec3 uFlashC; uniform vec2 uRes;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  vec2 d=(vUv-.5)*uAb; vec3 c;
  c.r=texture(uS,vUv+d).r; c.g=texture(uS,vUv).g; c.b=texture(uS,vUv-d).b;
  c+=(texture(uA,vUv).rgb*.6+texture(uB,vUv).rgb*1.1)*uBloom;
  c+=uFlashC*uFlash; c*=uExp; c=pow(aces(c),vec3(1./2.2));
  float v=smoothstep(1.2,.3,length((vUv-.5)*vec2(1.,.85))*1.3); c*=mix(1.,v,uVig);
  float g=fract(sin(dot(vUv*uRes+uTime,vec2(12.9898,78.233)))*43758.5453); c+=(g-.5)*.018;
  oC=vec4(c,1.);
}`;

/* ---------------- mesh builders ---------------- */
function upload(gl, v, idx) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, n: idx.length };
}
function mSphere(gl, la, lo) {
  const v = [], idx = [];
  for (let i = 0; i <= la; i++) for (let j = 0; j <= lo; j++) {
    const th = i / la * Math.PI, ph = j / lo * Math.PI * 2, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
    v.push(x, y, z, x, y, z, j / lo, 1 - i / la);
  }
  for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const a = i * (lo + 1) + j, b = a + lo + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  return upload(gl, v, idx);
}
function mBox(gl) {
  const v = [], idx = [], F = [[0,0,1,1,0,0,0,1,0],[0,0,-1,-1,0,0,0,1,0],[1,0,0,0,0,-1,0,1,0],[-1,0,0,0,0,1,0,1,0],[0,1,0,1,0,0,0,0,-1],[0,-1,0,1,0,0,0,0,1]];
  F.forEach((f, k) => {
    const n = [f[0], f[1], f[2]], u = [f[3], f[4], f[5]], w = [f[6], f[7], f[8]];
    for (const [a, b] of [[-1,-1],[1,-1],[1,1],[-1,1]])
      v.push(n[0]+u[0]*a+w[0]*b, n[1]+u[1]*a+w[1]*b, n[2]+u[2]*a+w[2]*b, n[0], n[1], n[2], (a+1)/2, (b+1)/2);
    idx.push(k*4, k*4+1, k*4+2, k*4, k*4+2, k*4+3);
  });
  return upload(gl, v, idx);
}
function mCyl(gl, seg, rt, rb, caps) {
  const v = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), n = Math.hypot(1, (rb - rt) / 2), ny = (rb - rt) / 2 / n;
    v.push(c*rt, 1, s*rt, c/n, ny, s/n, j/seg, 1);
    v.push(c*rb, -1, s*rb, c/n, ny, s/n, j/seg, 0);
  }
  for (let j = 0; j < seg; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  if (caps) for (const [y, r, ny] of [[1, rt, 1], [-1, rb, -1]]) {
    const base = v.length / 8; v.push(0, y, 0, 0, ny, 0, .5, .5);
    for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; v.push(Math.cos(a)*r, y, Math.sin(a)*r, 0, ny, 0, .5 + Math.cos(a)*.5, .5 + Math.sin(a)*.5); }
    for (let j = 0; j < seg; j++) idx.push(base, base + 1 + j, base + 2 + j);
  }
  return upload(gl, v, idx);
}
function mTorus(gl, R, r, seg, ts) {
  const v = [], idx = [];
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= ts; j++) {
    const a = i / seg * Math.PI * 2, b = j / ts * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
    v.push((R + r*Math.cos(b))*cx, r*Math.sin(b), (R + r*Math.cos(b))*sz, Math.cos(b)*cx, Math.sin(b), Math.cos(b)*sz, i/seg, j/ts);
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < ts; j++) { const a = i * (ts + 1) + j, b = a + ts + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return upload(gl, v, idx);
}
function mQuad(gl) { return upload(gl, [-1,-1,0,0,0,1,0,0, 1,-1,0,0,0,1,1,0, 1,1,0,0,0,1,1,1, -1,1,0,0,0,1,0,1], [0,1,2,0,2,3]); }

/* ---------------- renderer ---------------- */
function create(canvas, opts) {
  opts = opts || {};
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: true, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  if (!gl) return null;
  const R = { gl, canvas, w: 1, h: 1, dpr: 1, post: false, quality: 2, lost: false };
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); R.lost = true; opts.onLost && opts.onLost(); });

  function compile(vs, fs) {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
    const loc = {};
    return { p, u(n) { return n in loc ? loc[n] : (loc[n] = gl.getUniformLocation(p, n)); } };
  }
  let P;
  try {
    P = { lit: compile(VS, FS), sky: compile(FS_VERT, FS_SKY), pt: compile(VS_PT, FS_PT), bb: compile(VS_BB, FS_BB),
      bright: compile(FS_VERT, FS_BRIGHT), blur: compile(FS_VERT, FS_BLUR), comp: compile(FS_VERT, FS_COMP) };
  } catch (e) { console.error(e); return null; }

  R.mesh = { sphere: mSphere(gl, 18, 26), sphereLo: mSphere(gl, 10, 14), box: mBox(gl), cyl: mCyl(gl, 20, 1, 1, true), cone: mCyl(gl, 28, .06, 1, true),
    torus: mTorus(gl, 1, .06, 48, 8), quad: mQuad(gl), shaft: mCyl(gl, 24, .04, 1, false) };
  const emptyVao = gl.createVertexArray();
  const ptBuf = gl.createBuffer(), ptVao = gl.createVertexArray();
  gl.bindVertexArray(ptVao); gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(null);
  const maxPt = Math.min(256, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64);
  const floatRT = !!gl.getExtension("EXT_color_buffer_float") || !!gl.getExtension("EXT_color_buffer_half_float");
  gl.getExtension("OES_texture_float_linear");

  /* render targets */
  function rt(w, h, depth) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb = null;
    if (depth) { rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb); }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, rb, w, h, ok };
  }
  const freeRT = t => { if (!t) return; gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); t.rb && gl.deleteRenderbuffer(t.rb); };
  let RT = null;
  function buildTargets() {
    if (RT) Object.values(RT).forEach(freeRT); RT = null;
    if (!floatRT || R.quality < 2) { R.post = false; return; }
    const w = R.w, h = R.h, hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    RT = { scene: rt(w, h, true), a0: rt(hw, hh), a1: rt(hw, hh), b0: rt(qw, qh), b1: rt(qw, qh) };
    R.post = Object.values(RT).every(t => t.ok);
    if (!R.post) { Object.values(RT).forEach(freeRT); RT = null; }
  }

  R.resize = function (cssW, cssH, dpr) {
    const cap = R.quality >= 2 ? 2 : 1.25;
    R.dpr = Math.max(.5, Math.min(dpr || 1, cap));
    R.w = Math.max(2, Math.round(cssW * R.dpr)); R.h = Math.max(2, Math.round(cssH * R.dpr));
    canvas.width = R.w; canvas.height = R.h; buildTargets();
  };
  R.setQuality = function (q) { R.quality = q; R.resize(R.w / R.dpr, R.h / R.dpr, R.dpr); };

  /* textures */
  const texCache = {};
  R.canvasTex = function (c, mip) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  R.emojiTex = function (s) {
    if (!s) return null;
    if (texCache[s]) return texCache[s];
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    x.font = "100px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(s, 64, 70);
    return (texCache[s] = R.canvasTex(c, true));
  };

  /* frame state */
  let VP = m4.id(), camPos = [0, 2, 10], camR = [1, 0, 0], camU = [0, 1, 0], pxK = 600, time = 0;
  let PL = [[0, -5, 0, 0], [0, -5, 0, 0]], PLc = [[1, .5, .2], [1, .5, .2]];
  R.cam = () => ({ pos: camPos, right: camR, up: camU });
  R.project = function (p) { const v = VP, x = p[0], y = p[1], z = p[2], w = v[3]*x + v[7]*y + v[11]*z + v[15]; return [((v[0]*x + v[4]*y + v[8]*z + v[12]) / w * .5 + .5), (1 - ((v[1]*x + v[5]*y + v[9]*z + v[13]) / w * .5 + .5)), w]; };

  const blank = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  const unbindAll = () => { for (let i = 2; i >= 0; i--) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, blank); } };
  R.begin = function (cam, t, lights) {
    unbindAll(); time = t; const asp = R.w / R.h, fov = cam.fov;
    const view = m4.look(cam.eye, cam.target, [0, 1, 0]);
    VP = m4.mul(m4.persp(fov, asp, .5, 140), view);
    camPos = cam.eye; camR = [view[0], view[4], view[8]]; camU = [view[1], view[5], view[9]];
    pxK = R.h / (2 * Math.tan(fov / 2));
    PL = [[0, -9, 0, 0], [0, -9, 0, 0]]; PLc = [[1, .5, .2], [1, .5, .2]];
    (lights || []).slice(0, 2).forEach((l, i) => { PL[i] = [l.x, l.y, l.z, l.i]; PLc[i] = l.c; });
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.post ? RT.scene.fb : null);
    gl.viewport(0, 0, R.w, R.h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.useProgram(P.sky.p); gl.bindVertexArray(emptyVao);
    gl.uniform1f(P.sky.u("uT"), time); gl.uniform1f(P.sky.u("uPost"), R.post ? 1 : 0); gl.uniform1f(P.sky.u("uAsp"), asp); gl.uniform1i(P.sky.u("uOct"), R.quality >= 2 ? 4 : 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  };

  const blend = m => {
    if (m === 0) { gl.disable(gl.BLEND); gl.depthMask(true); }
    else { gl.enable(gl.BLEND); gl.depthMask(false); if (m === 1) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE); }
  };
  R.blend = blend;
  const DEF = { c: [1, 1, 1], em: [0, 0, 0] };
  let lastProg = null;
  R.draw = function (mesh, M, m) {
    const p = P.lit;
    if (lastProg !== p) {
      gl.useProgram(p.p); lastProg = p;
      gl.uniformMatrix4fv(p.u("uVP"), false, VP); gl.uniform3fv(p.u("uCam"), camPos);
      gl.uniform1f(p.u("uT"), time); gl.uniform1f(p.u("uPost"), R.post ? 1 : 0); gl.uniform1f(p.u("uFogK"), .018);
      gl.uniform1i(p.u("uOct"), R.quality >= 2 ? 4 : 2); gl.uniform1i(p.u("uTex"), 0);
      gl.uniform4fv(p.u("uPL"), new Float32Array([...PL[0], ...PL[1]])); gl.uniform3fv(p.u("uPLc"), new Float32Array([...PLc[0], ...PLc[1]]));
    }
    m = m || DEF;
    gl.uniformMatrix4fv(p.u("uM"), false, M);
    gl.uniform3fv(p.u("uCol"), m.c || DEF.c); gl.uniform3fv(p.u("uEm"), m.em || DEF.em);
    gl.uniform1f(p.u("uFur"), m.fur || 0); gl.uniform1f(p.u("uFurF"), m.furF || 5); gl.uniform1f(p.u("uSpec"), m.spec || 0);
    gl.uniform1f(p.u("uRim"), m.rim === undefined ? .5 : m.rim); gl.uniform1f(p.u("uSeed"), m.seed || 0);
    gl.uniform1f(p.u("uAlpha"), m.alpha === undefined ? 1 : m.alpha); gl.uniform1i(p.u("uMode"), m.mode || 0);
    if (m.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.tex); }
    if (m.blend) blend(m.blend);
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
    if (m.blend) blend(0);
  };

  /* particles: flat arrays of [x,y,z,size, r,g,b,a] */
  R.points = function (arr, n, additive) {
    if (!n) return;
    const p = P.pt; gl.useProgram(p.p); lastProg = p;
    gl.uniformMatrix4fv(p.u("uVP"), false, VP); gl.uniform1f(p.u("uPx"), pxK); gl.uniform1f(p.u("uMax"), maxPt); gl.uniform1f(p.u("uPost"), R.post ? 1 : 0);
    gl.bindVertexArray(ptVao); gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf); gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    blend(additive ? 2 : 1); gl.drawArrays(gl.POINTS, 0, n); blend(0);
  };
  R.billboard = function (tex, c, w, h, bright) {
    const p = P.bb; gl.useProgram(p.p); lastProg = p;
    gl.uniformMatrix4fv(p.u("uVP"), false, VP); gl.uniform3fv(p.u("uC"), c); gl.uniform3fv(p.u("uR"), camR); gl.uniform3fv(p.u("uU"), camU);
    gl.uniform2f(p.u("uSz"), w, h); gl.uniform1f(p.u("uPost"), R.post ? 1 : 0); gl.uniform1f(p.u("uBright"), bright || 1.2); gl.uniform1i(p.u("uTex"), 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindVertexArray(R.mesh.quad.vao); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };

  function fs(prog, tex, set) {
    gl.useProgram(prog.p); gl.bindVertexArray(emptyVao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    set && set(prog); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  R.end = function (fx) {
    lastProg = null; fx = fx || {};
    if (!R.post) return;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const pass = (t, prog, src, set) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); fs(prog, src, set); };
    const blur = (a, b, src) => {
      pass(a, P.blur, src, p => { gl.uniform1i(p.u("uS"), 0); gl.uniform2f(p.u("uDir"), 1 / a.w, 0); });
      pass(b, P.blur, a.tex, p => { gl.uniform1i(p.u("uS"), 0); gl.uniform2f(p.u("uDir"), 0, 1 / b.h); });
    };
    pass(RT.a0, P.bright, RT.scene.tex, p => { gl.uniform1i(p.u("uS"), 0); gl.uniform1f(p.u("uThr"), 1.0); });
    blur(RT.a1, RT.a0, RT.a0.tex);            // a0 holds blurred half-res
    pass(RT.b0, P.blur, RT.a0.tex, p => { gl.uniform1i(p.u("uS"), 0); gl.uniform2f(p.u("uDir"), 1 / RT.b0.w, 0); });
    pass(RT.b1, P.blur, RT.b0.tex, p => { gl.uniform1i(p.u("uS"), 0); gl.uniform2f(p.u("uDir"), 0, 1 / RT.b1.h); });
    blur(RT.b0, RT.b1, RT.b1.tex);            // b1 holds wide blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.w, R.h);
    gl.useProgram(P.comp.p); gl.bindVertexArray(emptyVao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, RT.scene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, RT.a0.tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, RT.b1.tex);
    const c = P.comp; gl.uniform1i(c.u("uS"), 0); gl.uniform1i(c.u("uA"), 1); gl.uniform1i(c.u("uB"), 2);
    gl.uniform1f(c.u("uBloom"), fx.bloom === undefined ? .55 : fx.bloom); gl.uniform1f(c.u("uExp"), fx.exp || .98); gl.uniform1f(c.u("uAb"), fx.ab || 0);
    gl.uniform1f(c.u("uFlash"), fx.flash || 0); gl.uniform3fv(c.u("uFlashC"), fx.flashC || [1, .85, .6]); gl.uniform1f(c.u("uVig"), .85);
    gl.uniform1f(c.u("uTime"), time % 7); gl.uniform2f(c.u("uRes"), R.w, R.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    unbindAll();
    gl.enable(gl.DEPTH_TEST);
  };

  R.resize(canvas.clientWidth || 300, canvas.clientHeight || 300, window.devicePixelRatio || 1);
  return R;
}

window.R3C = { create, m4 };
})();

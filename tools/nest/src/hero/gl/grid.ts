// WebGL2 renderer for the hero cell grid (item_270). Same layers and bloom as paint() in scene.ts:
// each layer clears its blank runs, then draws its cell backgrounds, then its glyphs, all as instanced
// quads (one draw call per step). Glyphs come from an atlas rendered with the table font.
// The result is drawn onto the table canvas with one drawImage; paint() keeps the 2D path as fallback.

type RGB = [number, number, number]
export interface GridLike { cols: number; rows: number; z: Float32Array; ch: (string | null)[]; col: RGB[]; a: Float32Array; bg?: Float32Array; k?: number }
export interface GridLayer { g: GridLike; keep: (z: number) => boolean; m: DOMMatrix }
export interface GridFrame { w: number; h: number; dpr: number; cw: number; ch: number; font: number; layers: GridLayer[]; bloom: { div: number; wide: number; tight: number; gain?: number } }
export interface GridGL { canvas: HTMLCanvasElement; render: (f: GridFrame) => boolean; lost: () => boolean }

const VS = `#version 300 es
layout(location=0) in vec2 aC;layout(location=1) in vec4 aR;layout(location=2) in vec4 aCol;layout(location=3) in float aSlot;
uniform vec3 uM0,uM1;uniform vec2 uRes,uSlot,uAtlas;uniform float uPer;
out vec2 vUv;out vec4 vCol;out float vG;
void main(){
  vec2 p=aR.xy+aC*aR.zw;vec2 d=vec2(dot(uM0,vec3(p,1.)),dot(uM1,vec3(p,1.)));
  // Glyph quads start on a whole device pixel so the atlas is not resampled half a pixel off.
  if(aSlot>=0.){vec2 o=vec2(dot(uM0,vec3(aR.xy,1.)),dot(uM1,vec3(aR.xy,1.)));d+=floor(o+.5)-o;}
  gl_Position=vec4(d.x/uRes.x*2.-1.,1.-d.y/uRes.y*2.,0,1);
  vG=aSlot;vCol=aCol;
  vec2 s=vec2(mod(aSlot,uPer),floor(aSlot/uPer));vUv=(s+aC)*uSlot/uAtlas;
}`
const FS = `#version 300 es
precision highp float;uniform sampler2D uT;in vec2 vUv;in vec4 vCol;in float vG;out vec4 o;
void main(){float c=vG<0.?1.:texture(uT,vUv).a;float a=vCol.a*c;o=vec4(vCol.rgb*a,a);}`
const QVS = `#version 300 es
layout(location=0) in vec2 aC;void main(){gl_Position=vec4(aC*2.-1.,0,1);}`
const COPY_FS = `#version 300 es
precision highp float;uniform sampler2D uSrc;uniform vec2 uRes;out vec4 o;
void main(){o=texture(uSrc,gl_FragCoord.xy/uRes);}`
const BLUR_FS = `#version 300 es
precision highp float;uniform sampler2D uSrc;uniform vec2 uRes,uDir;uniform float uSigma,uStep;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec4 s=vec4(0);float ws=0.;
  for(int i=-12;i<=12;i++){float x=float(i)*uStep;float w=exp(-x*x/(2.*uSigma*uSigma));s+=texture(uSrc,uv+uDir*x/uRes)*w;ws+=w;}
  o=s/ws;}`
// Same blend as paint(): the two blooms add ('lighter', clamped), the sharp layer goes over them.
const COMP_FS = `#version 300 es
precision highp float;uniform sampler2D uL,uW,uS;uniform vec2 uRes;uniform float uKw,uKs;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec4 L=texture(uL,uv);vec4 b=min(texture(uW,uv)*uKw+texture(uS,uv)*uKs,vec4(1.));o=L+b*(1.-L.a);}`

const PER = 16, FLOATS = 9

export function createGrid(): GridGL | null {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false })
  if (!ctx) return null
  const gl: WebGL2RenderingContext = ctx
  let isLost = false
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); isLost = true })

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  type Prog = { p: WebGLProgram; U: Record<string, WebGLUniformLocation | null> }
  const prog = (vs: string, fs: string): Prog => {
    const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
    const U: Prog['U'] = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i)!.name; U[nm] = gl.getUniformLocation(p, nm) }
    return { p, U }
  }
  let P: Record<'cell' | 'copy' | 'blur' | 'comp', Prog>
  try { P = { cell: prog(VS, FS), copy: prog(QVS, COPY_FS), blur: prog(QVS, BLUR_FS), comp: prog(QVS, COMP_FS) } }
  catch (e) { console.warn('grid: shader', e); return null }

  // Unit quad (two triangles) shared by the instanced cells and the full-screen passes.
  const vao = gl.createVertexArray()!; gl.bindVertexArray(vao)
  const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib)
  const B = FLOATS * 4
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, B, 0); gl.vertexAttribDivisor(1, 1)
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, B, 16); gl.vertexAttribDivisor(2, 1)
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, B, 32); gl.vertexAttribDivisor(3, 1)
  let inst = new Float32Array(FLOATS * 16384)
  const at = (o: number) => { gl.vertexAttribPointer(1, 4, gl.FLOAT, false, B, o); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, B, o + 16); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, B, o + 32) }

  const tex = (w: number, h: number) => {
    const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }
  const fbo = (t: WebGLTexture) => { const f = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f }
  type Tgt = { t: WebGLTexture; f: WebGLFramebuffer; w: number; h: number }
  const target = (w: number, h: number): Tgt => { const t = tex(w, h); return { t, f: fbo(t), w, h } }
  const drop = (x: Tgt) => { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f) }
  let S: { L: Tgt; q1: Tgt; q2: Tgt; wide: Tgt; tight: Tgt; div: number } | undefined

  // Glyph atlas per font size (CSS px) and dpr; glyphs are added as they first appear.
  interface Atlas { key: string; cv: HTMLCanvasElement; x: CanvasRenderingContext2D; t: WebGLTexture; slot: number[]; map: Map<string, number>; dirty: boolean; px: number; dpr: number; dev: number[] }
  const atlases = new Map<string, Atlas>()
  const atlasFor = (font: number, dpr: number): Atlas => {
    const key = `${font.toFixed(2)}@${dpr}`
    let A = atlases.get(key)
    if (A) return A
    // Slot in device px (whole pixels); slot[] is the same size in CSS px for the quads.
    const dw = Math.ceil((font * 1.3 + 2) * dpr), dh = Math.ceil((font * 1.7 + 2) * dpr)
    const cv = document.createElement('canvas'); cv.width = dw * PER; cv.height = dh * PER
    const x = cv.getContext('2d')!
    A = { key, cv, x, t: tex(cv.width, cv.height), slot: [dw / dpr, dh / dpr], dev: [dw, dh], map: new Map(), dirty: true, px: font, dpr }
    atlases.set(key, A)
    return A
  }
  const slotOf = (A: Atlas, ch: string) => {
    let s = A.map.get(ch)
    if (s !== undefined) return s
    s = A.map.size
    if (s >= PER * PER) return 0
    A.map.set(ch, s)
    const [sw, sh] = A.dev, x = A.x
    x.setTransform(1, 0, 0, 1, 0, 0)
    x.font = `500 ${(A.px * A.dpr).toFixed(2)}px 'Fira Code', ui-monospace, monospace`; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillStyle = '#fff'
    x.fillText(ch, (s % PER) * sw + sw / 2, Math.floor(s / PER) * sh + sh / 2)
    A.dirty = true
    return s
  }
  // Fonts that load later would leave fallback glyphs in the atlas: start over.
  document.fonts?.addEventListener?.('loadingdone', () => { for (const A of atlases.values()) gl.deleteTexture(A.t); atlases.clear() })

  const q = (c: number) => (c & 0xf8) / 255
  const qa = (a: number) => Math.max(0, Math.min(63, Math.round(a * 63))) / 63

  // Per layer: clears, backgrounds and glyphs go to three lists, then into one buffer in that order.
  let L3 = [new Float32Array(0), new Float32Array(0), new Float32Array(0)]
  function fill(g: GridLike, keep: (z: number) => boolean, cw: number, ch: number, A: Atlas) {
    const cap = g.cols * g.rows * FLOATS
    if (L3[0].length < cap) L3 = [new Float32Array(cap), new Float32Array(cap), new Float32Array(cap)]
    const [C, R, G] = L3
    let ic = 0, ib = 0, ig = 0
    const sw = A.slot[0], sh = A.slot[1]
    const put = (o: Float32Array, at: number, x: number, y: number, w: number, h: number, r: number, gg: number, b: number, al: number, sl: number) => {
      o[at] = x; o[at + 1] = y; o[at + 2] = w; o[at + 3] = h; o[at + 4] = r; o[at + 5] = gg; o[at + 6] = b; o[at + 7] = al; o[at + 8] = sl
    }
    for (let r = 0; r < g.rows; r++) {
      let run = -1
      for (let c = 0; c <= g.cols; c++) {
        const i = r * g.cols + c, t = c < g.cols ? g.ch[i] : null
        if (t === ' ' && keep(g.z[i])) { if (run < 0) run = c; continue }
        if (run >= 0) { put(C, ic, run * cw - 0.5, r * ch - 0.5, (c - run) * cw + 1, ch + 1, 0, 0, 0, 1, -1); ic += FLOATS; run = -1 }
        if (!t || !keep(g.z[i])) continue
        const col = g.col[i], cr = q(col[0]), cg = q(col[1]), cb = q(col[2]), bg = g.bg?.[i] ?? 0
        if (bg > 0) { put(R, ib, c * cw, r * ch, cw, ch, cr, cg, cb, qa(bg), -1); ib += FLOATS }
        put(G, ig, c * cw + cw / 2 - sw / 2, r * ch + ch / 2 + 0.5 - sh / 2, sw, sh, cr, cg, cb, qa(g.a[i]), slotOf(A, t)); ig += FLOATS
      }
    }
    const n = ic + ib + ig
    if (inst.length < n) inst = new Float32Array(n * 2)
    inst.set(C.subarray(0, ic), 0); inst.set(R.subarray(0, ib), ic); inst.set(G.subarray(0, ig), ic + ib)
    return { clears: ic / FLOATS, rest: (ib + ig) / FLOATS }
  }

  const quad = () => gl.drawArrays(gl.TRIANGLES, 0, 6)
  const pass = (p: Prog, t: Tgt | null, w: number, h: number) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.f : null); gl.viewport(0, 0, w, h); gl.useProgram(p.p) }
  const bindT = (p: Prog, name: string, unit: number, t: WebGLTexture) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.U[name], unit) }
  const blur = (src: Tgt, dst: Tgt, dx: number, dy: number, sigma: number) => {
    const p = P.blur; pass(p, dst, dst.w, dst.h); bindT(p, 'uSrc', 0, src.t)
    gl.uniform2f(p.U.uRes, dst.w, dst.h); gl.uniform2f(p.U.uDir, dx, dy); gl.uniform1f(p.U.uSigma, sigma); gl.uniform1f(p.U.uStep, Math.max(0.35, (sigma * 3) / 12))
    quad()
  }

  function render(f: GridFrame): boolean {
    if (isLost) return false
    const W = Math.max(1, Math.round(f.w)), H = Math.max(1, Math.round(f.h)), div = f.bloom.div
    if (canvas.width !== W || canvas.height !== H || !S || S.L.w !== W || S.L.h !== H || S.div !== div) {
      canvas.width = W; canvas.height = H
      if (S) [S.L, S.q1, S.q2, S.wide, S.tight].forEach(drop)
      const qw = Math.max(1, Math.ceil(W / div)), qh = Math.max(1, Math.ceil(H / div))
      S = { L: target(W, H), q1: target(qw, qh), q2: target(qw, qh), wide: target(qw, qh), tight: target(qw, qh), div }
    }
    gl.bindVertexArray(vao)
    pass(P.cell, S.L, W, H)
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    const p = P.cell
    gl.uniform2f(p.U.uRes, W, H); gl.uniform1f(p.U.uPer, PER)
    for (const L of f.layers) {
      const k = L.g.k ?? 1, A = atlasFor(f.font * k, f.dpr)
      const cnt = fill(L.g, L.keep, f.cw * k, f.ch * k, A)
      bindT(p, 'uT', 0, A.t)
      if (A.dirty) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, A.cv); A.dirty = false }
      gl.uniform2f(p.U.uSlot, A.dev[0], A.dev[1]); gl.uniform2f(p.U.uAtlas, A.cv.width, A.cv.height)
      const m = L.m
      gl.uniform3f(p.U.uM0, m.a, m.c, m.e); gl.uniform3f(p.U.uM1, m.b, m.d, m.f)
      gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, (cnt.clears + cnt.rest) * FLOATS), gl.STREAM_DRAW)
      at(0)
      if (cnt.clears) { gl.blendFunc(gl.ZERO, gl.ZERO); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, cnt.clears) }
      // Instanced draws start at instance 0: point the attributes past the clears.
      at(cnt.clears * B)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      if (cnt.rest) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, cnt.rest)
    }
    gl.disable(gl.BLEND)
    // Bloom: downscale to 1/div, blur at that size, composite.
    let c = P.copy
    // One bilinear step like paint()'s drawImage: each 1/div pixel samples its middle texels only.
    pass(c, S.q1, S.q1.w, S.q1.h); bindT(c, 'uSrc', 0, S.L.t); gl.uniform2f(c.U.uRes, S.q1.w, S.q1.h); quad()
    blur(S.q1, S.q2, 1, 0, f.bloom.wide); blur(S.q2, S.wide, 0, 1, f.bloom.wide)
    blur(S.q1, S.q2, 1, 0, f.bloom.tight); blur(S.q2, S.tight, 0, 1, f.bloom.tight)
    c = P.comp; pass(c, null, W, H)
    bindT(c, 'uL', 0, S.L.t); bindT(c, 'uW', 1, S.wide.t); bindT(c, 'uS', 2, S.tight.t)
    gl.uniform2f(c.U.uRes, W, H); gl.uniform1f(c.U.uKw, 0.55 * (f.bloom.gain ?? 1)); gl.uniform1f(c.U.uKs, 0.6 * (f.bloom.gain ?? 1))
    quad()
    return true
  }
  return { canvas, render, lost: () => isLost }
}

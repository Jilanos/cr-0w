// Small 3D and colour helpers shared by the holotable renderers (scene.ts, planets.ts).

export type RGB = [number, number, number]
export interface V3 { x: number; y: number; z: number }
export const V = (x: number, y: number, z: number): V3 => ({ x, y, z })
export const add = (a: V3, b: V3) => V(a.x + b.x, a.y + b.y, a.z + b.z)
export const sub = (a: V3, b: V3) => V(a.x - b.x, a.y - b.y, a.z - b.z)
export const mul = (a: V3, s: number) => V(a.x * s, a.y * s, a.z * s)
export const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: V3, b: V3) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
export const norm = (a: V3) => mul(a, 1 / Math.sqrt(dot(a, a)))
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
export const LIGHT = norm(V(-0.55, 0.75, -0.6))

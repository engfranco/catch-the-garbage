// 3D model builders. Everything is assembled from a handful of shared unit
// geometries (box, sphere, cylinder…) that are scaled per part, with materials
// cached by their parameters, so hundreds of objects share very little GPU memory.
import * as THREE from '../lib/three.module.min.js';
import { glowTexture } from './textures.js';

export function rand(a, b) { return a + Math.random() * (b - a); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Lighten (amt > 0) / darken (amt < 0) a numeric hex colour
export function shadeHex(hex, amt) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

// ---- Shared unit geometries ----
function makePrism() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0); shape.lineTo(0.5, 0); shape.lineTo(0, 1); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.computeVertexNormals();
  return g;
}
function starShape(outer, inner) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0.25, 0.25);
  s.bezierCurveTo(0.25, 0.25, 0.2, 0, 0, 0);
  s.bezierCurveTo(-0.3, 0, -0.3, 0.35, -0.3, 0.35);
  s.bezierCurveTo(-0.3, 0.55, -0.1, 0.77, 0.25, 0.95);
  s.bezierCurveTo(0.6, 0.77, 0.8, 0.55, 0.8, 0.35);
  s.bezierCurveTo(0.8, 0.35, 0.8, 0, 0.5, 0);
  s.bezierCurveTo(0.35, 0, 0.25, 0.25, 0.25, 0.25);
  return s;
}
// Randomly displace vertices (duplicated vertices move together thanks to the position hash)
function lumpy(base, amount, seed) {
  const g = base.clone();
  const pos = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const kx = Math.round(v.x * 1000), ky = Math.round(v.y * 1000), kz = Math.round(v.z * 1000);
    const h = Math.sin(kx * 12.9898 + ky * 78.233 + kz * 37.719 + seed * 91.7) * 43758.5453;
    const r = h - Math.floor(h);
    v.multiplyScalar(1 + (r - 0.5) * 2 * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 24, 16),
  halfSphere: new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  cone: new THREE.ConeGeometry(0.5, 1, 24),
  prism: makePrism(),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  octa: new THREE.OctahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.07, 8, 28),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 16),
  ring: new THREE.RingGeometry(0.75, 1, 48),
  disc: new THREE.CircleGeometry(0.75, 48),
  plane: new THREE.PlaneGeometry(1, 1)
};
const starGeo = (() => {
  const g = new THREE.ExtrudeGeometry(starShape(0.56, 0.25), { depth: 0.18, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  g.center(); return g;
})();
const heartGeo = (() => {
  const g = new THREE.ExtrudeGeometry(heartShape(), { depth: 0.26, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  g.center(); g.rotateZ(Math.PI); return g;
})();
const bagGeos = [0, 1, 2].map(i => lumpy(new THREE.SphereGeometry(0.5, 14, 10), 0.2, i + 1));
const asteroidGeos = [0, 1, 2].map(i => lumpy(new THREE.DodecahedronGeometry(0.5, 1), 0.28, i + 7));
let latheGeo = null, beamGeo = null;

// ---- Material cache ----
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = String(color) + '|' + JSON.stringify(opts);
  let m = matCache.get(key);
  if (m) return m;
  const transparent = !!opts.transparent || (opts.opacity !== undefined && opts.opacity < 1);
  m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    flatShading: !!opts.flat
  });
  if (transparent) m.depthWrite = opts.depthWrite ?? true;
  matCache.set(key, m);
  return m;
}

export const M = {
  RUBBER: mat(0x141518, { roughness: 0.95 }),
  HUB: mat(0x9aa0a6, { metalness: 0.85, roughness: 0.3 }),
  GLASS: mat(0x9ed0ff, { metalness: 0.4, roughness: 0.05, opacity: 0.55 }),
  GLASS_DARK: mat(0x1f3b5c, { metalness: 0.6, roughness: 0.08, opacity: 0.85 }),
  CHROME: mat(0xd6dde3, { metalness: 0.95, roughness: 0.18 }),
  DARK: mat(0x2a2d31, { roughness: 0.8, metalness: 0.2 }),
  BLACK: mat(0x0a0a0a, { roughness: 0.6 }),
  WHITE: mat(0xf4f4f4, { roughness: 0.6 }),
  HEADLIGHT: mat(0xfff8e0, { emissive: 0xfff1c4, emissiveIntensity: 3, roughness: 0.2 }),
  TAILLIGHT: mat(0xff3b30, { emissive: 0xff1a10, emissiveIntensity: 2.2, roughness: 0.3 }),
  SKIN: mat(0xf1c6a5, { roughness: 0.7 }),
  CONCRETE: mat(0xb7b5ae, { roughness: 0.9 }),
  BARK: mat(0x5b3d2a, { roughness: 0.95 }),
  STEEL: mat(0x6f7c86, { metalness: 0.7, roughness: 0.4 }),
  LIGHT_STEEL: mat(0xaebac4, { metalness: 0.6, roughness: 0.4 }),
  LAMP_ON: mat(0xfff3cf, { emissive: 0xffe2a0, emissiveIntensity: 2.5, roughness: 0.3 }),
  LAMP_OFF: mat(0xe9e9e9, { roughness: 0.4 }),
  WINDOW_DAY: mat(0xa9d7ef, { metalness: 0.6, roughness: 0.1 }),
  WINDOW_NIGHT: mat(0xffe2a0, { emissive: 0xffc46a, emissiveIntensity: 1.6, roughness: 0.2 })
};

// Create a mesh from a shared geometry: position / scale / rotation / shadow flags in one call
export function part(geo, material, p = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(p.x || 0, p.y || 0, p.z || 0);
  m.scale.set(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1);
  m.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
  m.castShadow = p.cast !== false;
  m.receiveShadow = p.receive !== false;
  return m;
}

// Soft additive glow sprite (lights, pickups)
const glowMats = new Map();
export function glow(color, size, x = 0, y = 0, z = 0, opacity = 0.8) {
  const key = color + '|' + opacity;
  let gm = glowMats.get(key);
  if (!gm) {
    gm = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    glowMats.set(key, gm);
  }
  const s = new THREE.Sprite(gm);
  s.position.set(x, y, z);
  s.scale.set(size, size, 1);
  return s;
}

// Merge all static child meshes of a group into one mesh per material.
// Cuts draw calls by ~5x for houses, vehicles and trees. Children flagged
// userData.noMerge (animated parts) and non-mesh children are left alone.
function concatGeometries(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
export function mergeChildren(group) {
  const byMat = new Map();
  for (const c of [...group.children]) {
    if (!c.isMesh || c.userData.noMerge) continue;
    c.updateMatrix();
    const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    g.applyMatrix4(c.matrix);
    let rec = byMat.get(c.material);
    if (!rec) byMat.set(c.material, rec = { geos: [], cast: false });
    rec.geos.push(g);
    rec.cast = rec.cast || c.castShadow;
    group.remove(c);
  }
  for (const [material, rec] of byMat) {
    const mesh = new THREE.Mesh(concatGeometries(rec.geos), material);
    mesh.castShadow = rec.cast; mesh.receiveShadow = true;
    mesh.userData.merged = true;
    group.add(mesh);
  }
  return group;
}
// Free GPU buffers created by mergeChildren when an object is discarded
export function disposeMerged(root) {
  root.traverse(o => { if (o.isMesh && o.userData.merged) o.geometry.dispose(); });
}

function wheel(r, w, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  g.add(part(G.cyl, M.RUBBER, { sx: r * 2, sy: w, sz: r * 2, rz: Math.PI / 2 }));
  g.add(part(G.cyl, M.HUB, { sx: r * 1.15, sy: w + 0.03, sz: r * 1.15, rz: Math.PI / 2, cast: false }));
  return g;
}

// =====================================================================
// Player's garbage truck (forward is -z)
// =====================================================================
export function buildTruck() {
  const g = new THREE.Group();
  const green = mat(0x2f9e4f, { roughness: 0.4, metalness: 0.3 });
  const greenDark = mat(0x1f6f38, { roughness: 0.45, metalness: 0.3 });
  const red = mat(0xd8392c, { roughness: 0.35, metalness: 0.35 });
  const redDark = mat(0xa8291f, { roughness: 0.4, metalness: 0.3 });

  g.add(part(G.box, M.DARK, { y: 0.55, z: 0.3, sx: 2.0, sy: 0.35, sz: 5.0 }));
  // cab
  g.add(part(G.box, red, { y: 1.5, z: -1.65, sx: 2.2, sy: 1.5, sz: 1.5 }));
  g.add(part(G.box, redDark, { y: 2.3, z: -1.65, sx: 2.1, sy: 0.12, sz: 1.45, cast: false }));
  g.add(part(G.box, M.GLASS, { y: 1.85, z: -2.4, sx: 1.9, sy: 0.72, sz: 0.08, rx: 0.16, cast: false }));
  g.add(part(G.box, M.GLASS, { x: -1.11, y: 1.85, z: -1.5, sx: 0.06, sy: 0.6, sz: 0.85, cast: false }));
  g.add(part(G.box, M.GLASS, { x: 1.11, y: 1.85, z: -1.5, sx: 0.06, sy: 0.6, sz: 0.85, cast: false }));
  g.add(part(G.box, M.DARK, { y: 1.02, z: -2.42, sx: 1.5, sy: 0.42, sz: 0.08, cast: false }));
  g.add(part(G.box, M.CHROME, { y: 0.62, z: -2.46, sx: 2.3, sy: 0.24, sz: 0.2 }));
  g.add(part(G.box, M.HEADLIGHT, { x: -0.8, y: 1.12, z: -2.43, sx: 0.36, sy: 0.26, sz: 0.06, cast: false }));
  g.add(part(G.box, M.HEADLIGHT, { x: 0.8, y: 1.12, z: -2.43, sx: 0.36, sy: 0.26, sz: 0.06, cast: false }));
  for (const s of [-1, 1]) {
    g.add(part(G.box, M.DARK, { x: s * 1.17, y: 1.95, z: -2.2, sx: 0.12, sy: 0.3, sz: 0.06, cast: false }));
    g.add(part(G.box, M.DARK, { x: s * 1.26, y: 1.95, z: -2.2, sx: 0.06, sy: 0.3, sz: 0.3, cast: false }));
  }
  // container
  g.add(part(G.box, green, { y: 1.95, z: 0.85, sx: 2.3, sy: 2.0, sz: 2.9 }));
  for (const z of [-0.45, 0.2, 0.85, 1.5, 2.15]) g.add(part(G.box, greenDark, { y: 1.95, z, sx: 2.38, sy: 2.06, sz: 0.08, cast: false }));
  g.add(part(G.box, greenDark, { y: 2.98, z: 0.85, sx: 2.38, sy: 0.08, sz: 2.96, cast: false }));
  // rear hopper
  g.add(part(G.box, greenDark, { y: 1.3, z: 2.6, sx: 2.3, sy: 1.6, sz: 0.7, rx: 0.2 }));
  g.add(part(G.box, M.DARK, { y: 0.75, z: 2.95, sx: 2.2, sy: 0.3, sz: 0.2, cast: false }));
  g.add(part(G.box, M.TAILLIGHT, { x: -0.95, y: 0.95, z: 2.98, sx: 0.25, sy: 0.18, sz: 0.06, cast: false }));
  g.add(part(G.box, M.TAILLIGHT, { x: 0.95, y: 0.95, z: 2.98, sx: 0.25, sy: 0.18, sz: 0.06, cast: false }));
  // wheels (front pair + two rear axles)
  const wheels = [];
  for (const [x, z] of [[-1.05, -1.65], [1.05, -1.65], [-1.05, 1.0], [1.05, 1.0], [-1.05, 1.9], [1.05, 1.9]]) wheels.push(wheel(0.46, 0.36, x, 0.46, z));
  wheels.forEach(w => g.add(w));
  // headlights (spotlight only switched on for night planets)
  const spot = new THREE.SpotLight(0xfff1cf, 0, 55, 0.5, 0.5, 1.4);
  spot.position.set(0, 1.3, -2.3);
  spot.target.position.set(0, -0.6, -26);
  g.add(spot); g.add(spot.target);
  const glows = [glow(0xfff1c4, 1.8, -0.8, 1.12, -2.5, 0.9), glow(0xfff1c4, 1.8, 0.8, 1.12, -2.5, 0.9)];
  glows.forEach(s => g.add(s));
  mergeChildren(g);
  return { group: g, wheels, spot, glows, w: 2.3, l: 5.4 };
}

// =====================================================================
// Traffic: car / rover / spaceship (forward is -z)
// =====================================================================
export function buildCar(style, e, night) {
  if (style === 'rover') return buildRover(night);
  if (style === 'spaceship') return buildSpaceship(e.color);
  const g = new THREE.Group();
  const paint = mat(e.color, { roughness: 0.3, metalness: 0.55 });
  const kind = e.body;
  const L = kind === 'suv' ? 4.4 : kind === 'hatch' ? 3.6 : 4.2;
  const bodyH = kind === 'suv' ? 0.75 : 0.55;
  const cabL = kind === 'suv' ? 2.6 : kind === 'hatch' ? 1.9 : 2.0;
  const cabZ = kind === 'hatch' ? 0.35 : 0.15;
  const y0 = kind === 'suv' ? 0.72 : 0.62;
  g.add(part(G.box, paint, { y: y0, sx: 1.9, sy: bodyH, sz: L }));
  g.add(part(G.box, M.DARK, { y: 0.36, sx: 1.92, sy: 0.22, sz: L - 0.1, cast: false }));
  g.add(part(G.box, paint, { y: y0 + bodyH / 2 + 0.3, z: cabZ, sx: 1.7, sy: 0.62, sz: cabL }));
  const gy = y0 + bodyH / 2 + 0.32;
  g.add(part(G.box, M.GLASS_DARK, { y: gy, z: cabZ - cabL / 2 - 0.02, sx: 1.6, sy: 0.52, sz: 0.06, rx: 0.3, cast: false }));
  g.add(part(G.box, M.GLASS_DARK, { y: gy, z: cabZ + cabL / 2 + 0.02, sx: 1.6, sy: 0.52, sz: 0.06, rx: -0.3, cast: false }));
  g.add(part(G.box, M.GLASS_DARK, { x: -0.86, y: gy, z: cabZ, sx: 0.04, sy: 0.42, sz: cabL - 0.3, cast: false }));
  g.add(part(G.box, M.GLASS_DARK, { x: 0.86, y: gy, z: cabZ, sx: 0.04, sy: 0.42, sz: cabL - 0.3, cast: false }));
  g.add(part(G.box, M.CHROME, { y: 0.42, z: -L / 2 - 0.02, sx: 1.95, sy: 0.18, sz: 0.12, cast: false }));
  g.add(part(G.box, M.CHROME, { y: 0.42, z: L / 2 + 0.02, sx: 1.95, sy: 0.18, sz: 0.12, cast: false }));
  g.add(part(G.box, M.DARK, { y: y0 + 0.05, z: -L / 2 - 0.02, sx: 1.2, sy: 0.22, sz: 0.06, cast: false }));
  const glows = [];
  for (const s of [-1, 1]) {
    g.add(part(G.box, M.HEADLIGHT, { x: s * 0.65, y: y0 + 0.08, z: -L / 2 - 0.03, sx: 0.4, sy: 0.2, sz: 0.06, cast: false }));
    g.add(part(G.box, M.TAILLIGHT, { x: s * 0.65, y: y0 + 0.08, z: L / 2 + 0.03, sx: 0.4, sy: 0.18, sz: 0.06, cast: false }));
    g.add(part(G.box, paint, { x: s * 1.0, y: gy - 0.05, z: cabZ - cabL / 2 + 0.2, sx: 0.12, sy: 0.14, sz: 0.2, cast: false }));
    glows.push(glow(0xfff1c4, night ? 1.6 : 0.9, s * 0.65, y0 + 0.08, -L / 2 - 0.12, night ? 0.9 : 0.4));
    glows.push(glow(0xff2a20, night ? 1.1 : 0.6, s * 0.65, y0 + 0.08, L / 2 + 0.12, night ? 0.8 : 0.35));
  }
  glows.forEach(s => g.add(s));
  const wheels = [];
  for (const [x, z] of [[-0.93, -L * 0.32], [0.93, -L * 0.32], [-0.93, L * 0.32], [0.93, L * 0.32]]) wheels.push(wheel(0.36, 0.26, x, 0.36, z));
  wheels.forEach(w => g.add(w));
  mergeChildren(g);
  return { group: g, wheels, glows, w: 1.9, l: L, hover: 0 };
}

function buildRover(night) {
  const g = new THREE.Group();
  const body = mat(0xdfe4e8, { metalness: 0.6, roughness: 0.4 });
  const panel = mat(0x1d2f7a, { metalness: 0.75, roughness: 0.2 });
  g.add(part(G.box, body, { y: 0.95, sx: 2.0, sy: 0.45, sz: 3.0 }));
  g.add(part(G.box, panel, { y: 1.2, sx: 2.4, sy: 0.06, sz: 2.5 }));
  for (const x of [-0.8, 0, 0.8]) g.add(part(G.box, M.WHITE, { x, y: 1.235, sx: 0.03, sy: 0.01, sz: 2.5, cast: false, receive: false }));
  for (const z of [-0.8, 0, 0.8]) g.add(part(G.box, M.WHITE, { z, y: 1.235, sx: 2.4, sy: 0.01, sz: 0.03, cast: false, receive: false }));
  // mast with stereo cameras
  g.add(part(G.cyl, M.CHROME, { x: 0.5, y: 1.85, z: -0.9, sx: 0.08, sy: 1.3, sz: 0.08 }));
  g.add(part(G.box, M.WHITE, { x: 0.5, y: 2.55, z: -0.9, sx: 0.5, sy: 0.26, sz: 0.26 }));
  g.add(part(G.cyl, M.BLACK, { x: 0.38, y: 2.55, z: -1.05, sx: 0.1, sy: 0.06, sz: 0.1, rx: Math.PI / 2, cast: false }));
  g.add(part(G.cyl, M.BLACK, { x: 0.62, y: 2.55, z: -1.05, sx: 0.1, sy: 0.06, sz: 0.1, rx: Math.PI / 2, cast: false }));
  // antenna dish
  g.add(part(G.cyl, M.CHROME, { x: -0.6, y: 1.5, z: 0.8, sx: 0.06, sy: 0.6, sz: 0.06 }));
  g.add(part(G.cone, M.WHITE, { x: -0.6, y: 1.95, z: 0.8, sx: 0.9, sy: 0.35, sz: 0.9, rx: Math.PI, rz: 0.4 }));
  const glows = [];
  for (const s of [-1, 1]) {
    g.add(part(G.box, M.HEADLIGHT, { x: s * 0.7, y: 0.95, z: -1.52, sx: 0.3, sy: 0.18, sz: 0.05, cast: false }));
    glows.push(glow(0xfff1c4, night ? 1.4 : 0.8, s * 0.7, 0.95, -1.6, night ? 0.9 : 0.4));
  }
  glows.forEach(s => g.add(s));
  const wheels = [];
  for (const z of [-1.1, 0, 1.1]) for (const s of [-1, 1]) {
    g.add(part(G.box, M.STEEL, { x: s * 0.95, y: 0.72, z, sx: 0.55, sy: 0.1, sz: 0.16, rz: s * -0.45 }));
    wheels.push(wheel(0.45, 0.34, s * 1.2, 0.45, z));
  }
  wheels.forEach(w => g.add(w));
  mergeChildren(g);
  return { group: g, wheels, glows, w: 2.6, l: 3.2, hover: 0 };
}

function buildSpaceship(color) {
  const g = new THREE.Group();
  const hull = mat(0xd9dee3, { metalness: 0.8, roughness: 0.25 });
  const accent = mat(color, { metalness: 0.6, roughness: 0.3 });
  g.add(part(G.cyl, hull, { rx: Math.PI / 2, sx: 1.4, sy: 3.0, sz: 1.4 }));
  g.add(part(G.cone, hull, { z: -2.1, rx: -Math.PI / 2, sx: 1.4, sy: 1.2, sz: 1.4 }));
  g.add(part(G.cyl, accent, { rx: Math.PI / 2, sx: 1.44, sy: 0.3, sz: 1.44, z: -1.2, cast: false }));
  g.add(part(G.sphere, M.GLASS, { y: 0.5, z: -0.6, sx: 0.9, sy: 0.7, sz: 1.3, cast: false }));
  g.add(part(G.box, accent, { x: -1.05, y: -0.15, z: 1.1, sx: 1.3, sy: 0.08, sz: 1.1, rz: 0.3 }));
  g.add(part(G.box, accent, { x: 1.05, y: -0.15, z: 1.1, sx: 1.3, sy: 0.08, sz: 1.1, rz: -0.3 }));
  g.add(part(G.box, accent, { y: 1.0, z: 1.2, sx: 0.08, sy: 1.1, sz: 1.0 }));
  g.add(part(G.cyl, M.DARK, { z: 1.62, rx: Math.PI / 2, sx: 1.0, sy: 0.3, sz: 1.0 }));
  g.add(part(G.cyl, mat(0xff7a1a, { emissive: 0xff5a00, emissiveIntensity: 3.5 }), { z: 1.8, rx: Math.PI / 2, sx: 0.7, sy: 0.08, sz: 0.7, cast: false }));
  const glows = [glow(0xff8a2a, 2.6, 0, 0, 2.1, 0.9)];
  glows.forEach(s => g.add(s));
  mergeChildren(g);
  return { group: g, wheels: [], glows, w: 2.0, l: 4.6, hover: 1.05 };
}

// =====================================================================
// Pedestrians: person / astronaut / alien (forward is -z)
// =====================================================================
export function buildPerson(style, e) {
  const g = new THREE.Group();
  const isAstro = style === 'astronaut', isAlien = style === 'alien';
  const skin = isAlien ? mat(e.bodyColor, { roughness: 0.6 }) : isAstro ? M.WHITE : M.SKIN;
  const shirt = isAlien ? skin : isAstro ? M.WHITE : mat(e.shirtColor, { roughness: 0.85 });
  const pants = isAlien ? skin : isAstro ? M.WHITE : mat(e.pantsColor, { roughness: 0.9 });
  const shoe = isAstro ? M.DARK : M.BLACK;
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.13, 0.85, 0);
    leg.add(part(G.box, pants, { y: -0.42, sx: isAstro ? 0.26 : 0.22, sy: 0.84, sz: 0.24 }));
    leg.add(part(G.box, shoe, { y: -0.86, z: -0.05, sx: 0.25, sy: 0.1, sz: 0.36, cast: false }));
    g.add(leg); legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(s * 0.38, 1.52, 0);
    arm.add(part(G.box, shirt, { y: -0.22, sx: 0.16, sy: 0.44, sz: 0.18 }));
    arm.add(part(G.box, isAstro ? M.WHITE : skin, { y: -0.56, sx: 0.15, sy: 0.26, sz: 0.16, cast: false }));
    g.add(arm); arms.push(arm);
  }
  g.add(part(G.box, shirt, { y: 1.22, sx: isAstro ? 0.64 : 0.56, sy: 0.72, sz: isAstro ? 0.36 : 0.3 }));
  if (isAstro) {
    g.add(part(G.box, M.LIGHT_STEEL, { y: 1.25, z: 0.3, sx: 0.5, sy: 0.6, sz: 0.28 }));
    g.add(part(G.box, mat(0x3a7bd5, { roughness: 0.5 }), { y: 1.3, z: -0.18, sx: 0.3, sy: 0.2, sz: 0.06, cast: false }));
    g.add(part(G.sphere, M.WHITE, { y: 1.82, s: 0.5 }));
    g.add(part(G.sphere, mat(0x1b2f6b, { metalness: 0.9, roughness: 0.1 }), { y: 1.82, z: -0.1, sx: 0.36, sy: 0.3, sz: 0.3, cast: false }));
  } else if (isAlien) {
    g.add(part(G.sphere, skin, { y: 1.9, sx: 0.5, sy: 0.64, sz: 0.5 }));
    const eyeXs = e.eyeCount === 1 ? [0] : e.eyeCount === 2 ? [-0.1, 0.1] : [-0.14, 0, 0.14];
    for (const ex of eyeXs) g.add(part(G.sphere, M.BLACK, { x: ex, y: 1.95, z: -0.2, sx: e.eyeCount === 1 ? 0.16 : 0.1, sy: e.eyeCount === 1 ? 0.2 : 0.14, sz: 0.08, cast: false }));
    const bulb = mat(0xffe34d, { emissive: 0xffd000, emissiveIntensity: 1.5 });
    for (const s of [-1, 1]) {
      g.add(part(G.cyl, skin, { x: s * 0.12, y: 2.32, sx: 0.03, sy: 0.3, sz: 0.03, rz: s * -0.3, cast: false }));
      g.add(part(G.sphere, bulb, { x: s * 0.17, y: 2.48, s: 0.08, cast: false }));
    }
  } else {
    g.add(part(G.cyl, skin, { y: 1.58, sx: 0.12, sy: 0.1, sz: 0.12, cast: false }));
    g.add(part(G.sphere, skin, { y: 1.78, s: 0.38 }));
    g.add(part(G.halfSphere, mat(e.hairColor, { roughness: 0.9 }), { y: 1.8, sx: 0.4, sy: 0.3, sz: 0.4, cast: false }));
    g.add(part(G.sphere, M.BLACK, { x: -0.07, y: 1.8, z: -0.17, s: 0.04, cast: false }));
    g.add(part(G.sphere, M.BLACK, { x: 0.07, y: 1.8, z: -0.17, s: 0.04, cast: false }));
  }
  mergeChildren(g);
  return { group: g, legs, arms, w: 0.7, l: 0.7 };
}

// =====================================================================
// Animals (forward is -z; rotated by the game to face their direction)
// =====================================================================
export function buildDog(e) {
  const g = new THREE.Group();
  const fur = mat(e.bodyColor, { roughness: 0.9 });
  const furDark = mat(shadeHex(e.bodyColor, -0.35), { roughness: 0.9 });
  g.add(part(G.capsule, fur, { y: 0.52, rx: Math.PI / 2, sx: 0.44, sy: 0.5, sz: 0.44 }));
  g.add(part(G.sphere, fur, { y: 0.74, z: -0.5, s: 0.38 }));
  g.add(part(G.box, fur, { y: 0.66, z: -0.72, sx: 0.2, sy: 0.17, sz: 0.24, cast: false }));
  g.add(part(G.sphere, M.BLACK, { y: 0.7, z: -0.85, s: 0.09, cast: false }));
  for (const s of [-1, 1]) {
    g.add(part(G.sphere, M.BLACK, { x: s * 0.1, y: 0.8, z: -0.65, s: 0.06, cast: false }));
    g.add(part(G.box, furDark, { x: s * 0.17, y: 0.88, z: -0.45, sx: 0.1, sy: 0.22, sz: 0.1, rz: s * 0.35, cast: false }));
  }
  g.add(part(G.cyl, fur, { y: 0.78, z: 0.42, sx: 0.08, sy: 0.4, sz: 0.08, rx: -0.8 }));
  const legs = [];
  for (const [x, z] of [[-0.15, -0.28], [0.15, -0.28], [-0.15, 0.28], [0.15, 0.28]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.42, z);
    leg.add(part(G.box, fur, { y: -0.2, sx: 0.12, sy: 0.4, sz: 0.12 }));
    g.add(leg); legs.push(leg);
  }
  mergeChildren(g);
  return { group: g, legs, w: 1.1, l: 0.6 };
}

export function buildChicken(e) {
  const g = new THREE.Group();
  const feather = mat(e.bodyColor, { roughness: 0.9 });
  const wingMat = mat(shadeHex(e.bodyColor, -0.15), { roughness: 0.9 });
  const orange = mat(0xf29a1f, { roughness: 0.7 });
  const red = mat(0xe03a2f, { roughness: 0.7 });
  g.add(part(G.sphere, feather, { y: 0.42, sx: 0.44, sy: 0.4, sz: 0.58 }));
  for (const s of [-1, 1]) g.add(part(G.sphere, wingMat, { x: s * 0.2, y: 0.44, z: 0.02, sx: 0.12, sy: 0.26, sz: 0.4, cast: false }));
  for (const [ry, h] of [[-0.35, 0.3], [0, 0.36], [0.35, 0.3]]) g.add(part(G.box, feather, { y: 0.62, z: 0.32, sx: 0.05, sy: h, sz: 0.22, rx: -0.7, ry, cast: false }));
  const head = new THREE.Group(); head.position.set(0, 0.74, -0.27);
  head.add(part(G.sphere, feather, { s: 0.26 }));
  head.add(part(G.cone, orange, { z: -0.19, rx: -Math.PI / 2, sx: 0.1, sy: 0.16, sz: 0.1, cast: false }));
  head.add(part(G.box, red, { y: 0.15, sx: 0.05, sy: 0.1, sz: 0.16, cast: false }));
  head.add(part(G.sphere, red, { y: -0.1, z: -0.12, s: 0.08, cast: false }));
  for (const s of [-1, 1]) head.add(part(G.sphere, M.BLACK, { x: s * 0.09, y: 0.04, z: -0.09, s: 0.04, cast: false }));
  g.add(head);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.08, 0.28, 0);
    leg.add(part(G.cyl, orange, { y: -0.14, sx: 0.04, sy: 0.28, sz: 0.04, cast: false }));
    leg.add(part(G.box, orange, { y: -0.28, z: -0.04, sx: 0.1, sy: 0.02, sz: 0.16, cast: false }));
    g.add(leg); legs.push(leg);
  }
  mergeChildren(g); mergeChildren(head);
  return { group: g, legs, head, w: 0.7, l: 0.5 };
}

export function buildFrog() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const green = mat(0x3f9e3f, { roughness: 0.5 });
  const greenDark = mat(0x2d7a2d, { roughness: 0.5 });
  const belly = mat(0xcfe6a8, { roughness: 0.6 });
  body.add(part(G.sphere, green, { y: 0.24, sx: 0.64, sy: 0.38, sz: 0.76 }));
  body.add(part(G.sphere, belly, { y: 0.18, z: -0.06, sx: 0.52, sy: 0.26, sz: 0.62, cast: false }));
  for (const s of [-1, 1]) {
    body.add(part(G.sphere, green, { x: s * 0.2, y: 0.46, z: -0.18, s: 0.2 }));
    body.add(part(G.sphere, M.WHITE, { x: s * 0.2, y: 0.47, z: -0.22, s: 0.14, cast: false }));
    body.add(part(G.sphere, M.BLACK, { x: s * 0.2, y: 0.48, z: -0.28, s: 0.07, cast: false }));
    body.add(part(G.sphere, greenDark, { x: s * 0.36, y: 0.12, z: 0.18, sx: 0.3, sy: 0.16, sz: 0.44, ry: s * 0.35 }));
    body.add(part(G.sphere, greenDark, { x: s * 0.26, y: 0.07, z: -0.3, sx: 0.16, sy: 0.08, sz: 0.2, cast: false }));
    body.add(part(G.sphere, greenDark, { x: s * 0.14, y: 0.4, z: 0.05, s: 0.07, cast: false }));
  }
  mergeChildren(body);
  g.add(body);
  return { group: g, body, w: 0.8, l: 0.7 };
}

// =====================================================================
// Heart thieves: raccoon (1), skunk (2), trash monster (3). Forward is -z.
// =====================================================================
export function buildRaccoon() {
  const g = new THREE.Group();
  const fur = mat(0x7d7d82, { roughness: 0.9 });
  const dark = mat(0x26262a, { roughness: 0.9 });
  const light = mat(0xdadada, { roughness: 0.9 });
  g.add(part(G.capsule, fur, { y: 0.42, rx: Math.PI / 2, sx: 0.46, sy: 0.55, sz: 0.46 }));
  g.add(part(G.sphere, fur, { y: 0.6, z: -0.52, s: 0.4 }));
  g.add(part(G.box, dark, { y: 0.64, z: -0.7, sx: 0.42, sy: 0.14, sz: 0.1, cast: false }));
  g.add(part(G.box, light, { y: 0.52, z: -0.74, sx: 0.16, sy: 0.12, sz: 0.16, cast: false }));
  g.add(part(G.sphere, M.BLACK, { y: 0.54, z: -0.83, s: 0.07, cast: false }));
  for (const sgn of [-1, 1]) {
    g.add(part(G.sphere, M.WHITE, { x: sgn * 0.1, y: 0.64, z: -0.72, s: 0.08, cast: false }));
    g.add(part(G.sphere, M.BLACK, { x: sgn * 0.1, y: 0.64, z: -0.77, s: 0.04, cast: false }));
    g.add(part(G.box, dark, { x: sgn * 0.14, y: 0.8, z: -0.5, sx: 0.1, sy: 0.14, sz: 0.06, rz: sgn * 0.3, cast: false }));
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.5, 0.45); tail.rotation.x = -0.95;
  for (let i = 0; i < 5; i++) tail.add(part(G.cyl, i % 2 ? dark : fur, { y: i * 0.14 + 0.07, sx: 0.22 - i * 0.015, sy: 0.14, sz: 0.22 - i * 0.015 }));
  g.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.16, -0.3], [0.16, -0.3], [-0.16, 0.3], [0.16, 0.3]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.32, z);
    leg.add(part(G.box, dark, { y: -0.16, sx: 0.12, sy: 0.32, sz: 0.12 }));
    g.add(leg); legs.push(leg);
  }
  mergeChildren(g); mergeChildren(tail);
  return { group: g, legs, body: null, w: 1.1, l: 0.6 };
}

export function buildSkunk() {
  const g = new THREE.Group();
  const black = mat(0x141416, { roughness: 0.9 });
  const white = mat(0xf2f2f2, { roughness: 0.9 });
  g.add(part(G.capsule, black, { y: 0.38, rx: Math.PI / 2, sx: 0.42, sy: 0.5, sz: 0.42 }));
  g.add(part(G.box, white, { y: 0.585, z: 0.05, sx: 0.14, sy: 0.04, sz: 0.9, cast: false }));
  g.add(part(G.sphere, black, { y: 0.5, z: -0.5, s: 0.34 }));
  g.add(part(G.box, white, { y: 0.66, z: -0.5, sx: 0.08, sy: 0.03, sz: 0.3, cast: false }));
  for (const sgn of [-1, 1]) {
    g.add(part(G.sphere, M.WHITE, { x: sgn * 0.09, y: 0.55, z: -0.66, s: 0.06, cast: false }));
    g.add(part(G.sphere, M.BLACK, { x: sgn * 0.09, y: 0.55, z: -0.7, s: 0.03, cast: false }));
    g.add(part(G.sphere, black, { x: sgn * 0.12, y: 0.68, z: -0.45, s: 0.08, cast: false }));
  }
  g.add(part(G.sphere, mat(0xe57373, { roughness: 0.6 }), { y: 0.47, z: -0.69, s: 0.06, cast: false }));
  const tail = new THREE.Group(); tail.position.set(0, 0.52, 0.42); tail.rotation.x = -1.1;
  tail.add(part(G.sphere, black, { y: 0.5, sx: 0.55, sy: 1.05, sz: 0.45 }));
  tail.add(part(G.sphere, white, { y: 0.52, z: -0.15, sx: 0.16, sy: 0.9, sz: 0.2, cast: false }));
  mergeChildren(tail);
  g.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.15, -0.28], [0.15, -0.28], [-0.15, 0.28], [0.15, 0.28]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.3, z);
    leg.add(part(G.box, black, { y: -0.15, sx: 0.11, sy: 0.3, sz: 0.11 }));
    g.add(leg); legs.push(leg);
  }
  mergeChildren(g);
  return { group: g, legs, tail, w: 1.0, l: 0.6 };
}

export function buildTrashMonster() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const trash = mat(0x3f4d33, { roughness: 0.85 });
  const trashDark = mat(0x262e1e, { roughness: 0.9 });
  const lump = (geo, x, y, z, sx, sy, sz, m) => {
    const b = new THREE.Mesh(geo, m); b.castShadow = true; b.receiveShadow = true;
    b.position.set(x, y, z); b.scale.set(sx, sy, sz); body.add(b);
  };
  lump(bagGeos[0], 0, 0.85, 0, 2.3, 1.7, 2.1, trash);
  lump(bagGeos[1], 0.55, 1.65, 0.1, 1.5, 1.3, 1.4, trashDark);
  lump(bagGeos[2], -0.6, 1.55, -0.15, 1.3, 1.2, 1.2, trash);
  for (const sgn of [-1, 1]) {
    body.add(part(G.sphere, M.WHITE, { x: sgn * 0.4, y: 1.8, z: -0.8, s: 0.44, cast: false }));
    body.add(part(G.sphere, M.BLACK, { x: sgn * 0.4, y: 1.8, z: -1.0, s: 0.2, cast: false }));
    body.add(part(G.box, trashDark, { x: sgn * 0.4, y: 2.08, z: -0.9, sx: 0.5, sy: 0.1, sz: 0.1, rz: -sgn * 0.45, cast: false }));
    const arm = new THREE.Group(); arm.position.set(sgn * 1.05, 1.15, 0);
    arm.add(part(G.sphere, trash, { x: sgn * 0.25, y: -0.25, z: -0.35, s: 0.5 }));
    arm.add(part(G.sphere, trashDark, { x: sgn * 0.35, y: -0.4, z: -0.6, s: 0.28, cast: false }));
    body.add(arm);
  }
  body.add(part(G.box, trashDark, { y: 1.2, z: -0.95, sx: 0.95, sy: 0.36, sz: 0.2, cast: false }));
  for (const x of [-0.3, 0, 0.3]) body.add(part(G.box, M.WHITE, { x, y: 1.32, z: -1.02, sx: 0.12, sy: 0.18, sz: 0.08, cast: false }));
  body.add(part(G.box, mat(0xb98b5a, { roughness: 0.9 }), { x: 0.75, y: 0.5, z: -0.6, sx: 0.5, sy: 0.4, sz: 0.45, ry: 0.5 }));
  body.add(part(G.cyl, mat(0x2e8b57, { metalness: 0.3, roughness: 0.1, opacity: 0.85 }), { x: -0.85, y: 1.0, z: 0.4, sx: 0.18, sy: 0.6, sz: 0.18, rz: 0.6 }));
  body.add(part(G.cyl, mat(0x8a98a3, { metalness: 0.7, roughness: 0.35 }), { x: 0.25, y: 2.25, z: 0.3, sx: 0.3, sy: 0.45, sz: 0.3, rz: 0.4 }));
  body.add(part(G.cyl, mat(0xffe066, { roughness: 0.6 }), { x: -0.2, y: 2.15, z: -0.4, sx: 0.12, sy: 0.5, sz: 0.12, rz: -0.9, rx: 0.4, cast: false }));
  body.add(glow(0x9ccc65, 5, 0, 1.4, 0, 0.35));
  mergeChildren(body);
  g.add(body);
  return { group: g, body, legs: [], w: 2.0, l: 1.9 };
}

// Little hearts that float above a thief while it carries your lives
export function buildHeartMarker(n) {
  const g = new THREE.Group();
  const pink = mat(0xff3d7f, { roughness: 0.3, metalness: 0.2, emissive: 0xff1f5f, emissiveIntensity: 0.9 });
  for (let i = 0; i < n; i++) {
    const h = new THREE.Mesh(heartGeo, pink);
    h.scale.setScalar(0.42);
    h.position.x = (i - (n - 1) / 2) * 0.55;
    h.castShadow = false;
    g.add(h);
  }
  g.add(glow(0xff5c9a, 1.6 + n * 0.5, 0, 0, 0, 0.6));
  return g;
}

// =====================================================================
// UFO, asteroid
// =====================================================================
export function buildUFO() {
  const g = new THREE.Group();
  if (!latheGeo) {
    const pts = [[0, -0.2], [0.7, -0.32], [1.3, -0.14], [1.6, 0.0], [1.3, 0.16], [0.75, 0.3], [0, 0.34]].map(p => new THREE.Vector2(p[0], p[1]));
    latheGeo = new THREE.LatheGeometry(pts, 40);
  }
  if (!beamGeo) beamGeo = new THREE.CylinderGeometry(0.45, 1.7, 1, 32, 1, true);
  const saucer = new THREE.Mesh(latheGeo, mat(0xb9c2c9, { metalness: 0.9, roughness: 0.25 }));
  saucer.castShadow = true;
  g.add(saucer);
  g.add(part(G.halfSphere, M.GLASS, { y: 0.3, s: 1.2, cast: false }));
  g.add(part(G.sphere, mat(0x7cfc00, { roughness: 0.6 }), { y: 0.55, sx: 0.3, sy: 0.4, sz: 0.3, cast: false }));
  g.add(part(G.sphere, M.BLACK, { y: 0.62, z: -0.12, s: 0.1, cast: false }));
  const lights = [];
  const lightMats = [mat(0xffe34d, { emissive: 0xffd000, emissiveIntensity: 3 }), mat(0xff6a1a, { emissive: 0xff4500, emissiveIntensity: 3 })];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const l = part(G.sphere, lightMats[i % 2], { x: Math.cos(a) * 1.42, y: -0.02, z: Math.sin(a) * 1.42, s: 0.14, cast: false, receive: false });
    l.userData.noMerge = true;
    g.add(l); lights.push(l);
  }
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x7cf5e0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(beam);
  g.add(glow(0x7cf5e0, 3.5, 0, -0.4, 0, 0.5));
  beam.userData.noMerge = true;
  mergeChildren(g);
  return { group: g, lights, lightMats, beam, w: 3.2, l: 3.2 };
}

export function buildAsteroid() {
  const g = new THREE.Group();            // sits on the ground at the impact point
  const rockGroup = new THREE.Group();    // the falling rock + fire trail
  const rock = new THREE.Mesh(pick(asteroidGeos), mat(0x4a3528, { roughness: 0.95, flat: true, emissive: 0x4a1800, emissiveIntensity: 0.7 }));
  rock.castShadow = true;
  rock.scale.setScalar(1.6);
  rockGroup.add(rock);
  const fireA = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const fireB = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const t = part(G.sphere, i % 2 ? fireA : fireB, { y: 1.0 + i * 1.2, sx: 1.7 - i * 0.3, sy: 2.4, sz: 1.7 - i * 0.3, cast: false, receive: false });
    rockGroup.add(t);
  }
  rockGroup.add(glow(0xff9a3a, 6, 0, 0, 0, 0.8));
  g.add(rockGroup);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(G.ring, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  const discMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(G.disc, discMat); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04;
  g.add(ring); g.add(disc);
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const boom = part(G.sphere, boomMat, { y: 0.6, cast: false, receive: false }); boom.visible = false;
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = part(G.sphere, coreMat, { y: 0.6, cast: false, receive: false }); core.visible = false;
  g.add(boom); g.add(core);
  const light = new THREE.PointLight(0xff8a3a, 0, 32, 1.6); light.position.y = 1.5;
  g.add(light);
  return { group: g, rockGroup, rock, ring, disc, boom, core, light, disposables: [fireA, fireB, ringMat, discMat, boomMat, coreMat] };
}

// =====================================================================
// Pickups
// =====================================================================
export function buildGarbage(type) {
  const g = new THREE.Group();
  const bagMat = mat(0x1f2024, { roughness: 0.45, metalness: 0.15 });
  const knotMat = mat(0x3b3c42, { roughness: 0.6 });
  const addBag = (x, z, s) => {
    const b = new THREE.Mesh(pick(bagGeos), bagMat); b.castShadow = true; b.receiveShadow = true;
    b.position.set(x, 0.42 * s, z); b.scale.set(s, s * 0.92, s); b.rotation.y = Math.random() * Math.PI; g.add(b);
    g.add(part(G.sphere, knotMat, { x, y: 0.84 * s, z, s: 0.18 * s, cast: false }));
  };
  if (type === 'bag') {
    addBag(0, 0, 1);
  } else if (type === 'can') {
    const metal = mat(0x73838f, { metalness: 0.75, roughness: 0.35 });
    const metalDark = mat(0x4a5560, { metalness: 0.75, roughness: 0.4 });
    g.add(part(G.cyl, metal, { y: 0.42, sx: 0.68, sy: 0.84, sz: 0.68 }));
    g.add(part(G.cyl, metalDark, { y: 0.3, sx: 0.72, sy: 0.05, sz: 0.72, cast: false }));
    g.add(part(G.cyl, metalDark, { y: 0.58, sx: 0.72, sy: 0.05, sz: 0.72, cast: false }));
    g.add(part(G.cyl, metalDark, { y: 0.88, sx: 0.78, sy: 0.1, sz: 0.78 }));
    g.add(part(G.torus, metalDark, { y: 0.98, s: 0.28, cast: false }));
  } else {
    addBag(-0.22, 0.1, 0.75); addBag(0.25, -0.12, 0.65);
    g.add(part(G.box, mat(0xb98b5a, { roughness: 0.9 }), { x: 0.05, y: 0.18, z: 0.3, sx: 0.5, sy: 0.36, sz: 0.4, ry: 0.4 }));
    g.add(part(G.cyl, mat(0x2e8b57, { metalness: 0.3, roughness: 0.1, opacity: 0.8 }), { x: -0.35, y: 0.1, z: -0.3, sx: 0.16, sy: 0.5, sz: 0.16, rz: Math.PI / 2, ry: 0.5 }));
  }
  mergeChildren(g);
  return { group: g, w: 0.9, l: 0.9 };
}

export function buildStar() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(starGeo, mat(0xffd23f, { metalness: 0.75, roughness: 0.2, emissive: 0xffa500, emissiveIntensity: 0.7 }));
  m.castShadow = true; g.add(m);
  g.add(glow(0xffd23f, 3.2, 0, 0, 0, 0.75));
  return { group: g, mesh: m, w: 1.1, l: 1.1 };
}

export function buildHeart() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(heartGeo, mat(0xff3d7f, { roughness: 0.3, metalness: 0.2, emissive: 0xff1f5f, emissiveIntensity: 0.8 }));
  m.castShadow = true; g.add(m);
  g.add(glow(0xff5c9a, 3.2, 0, 0, 0, 0.75));
  return { group: g, mesh: m, w: 1.1, l: 1.1 };
}

// =====================================================================
// Scenery: houses (front faces -z), decorations, lamps
// =====================================================================
const WALL_COLORS = [0xe8c9a0, 0xd98c6a, 0xe6d7a8, 0x9fc5c9, 0xdcc1d8, 0xb7a9c9, 0xaecbe6, 0xc6d9b0, 0xf1ece0, 0xc9b79c, 0xd6b4a0];
const ROOF_COLORS = [0x5a3b32, 0x3f3a45, 0x2e3a4a, 0x4d3f36, 0x6b4a3a, 0x44524a, 0x7a3b2e];

export function buildHouse(style, night, pathLength) {
  const g = new THREE.Group();
  const anim = [];
  const windowMat = night ? M.WINDOW_NIGHT : M.WINDOW_DAY;

  if (style === 'house') {
    const w = rand(5.5, 7), d = rand(5, 6), h = rand(3, 3.8);
    const wall = mat(pick(WALL_COLORS), { roughness: 0.85 });
    const roof = mat(pick(ROOF_COLORS), { roughness: 0.9 });
    g.add(part(G.box, wall, { y: h / 2, sx: w, sy: h, sz: d }));
    g.add(part(G.prism, roof, { y: h - 0.05, sx: w + 0.7, sy: rand(1.6, 2.2), sz: d + 0.7 }));
    g.add(part(G.box, M.WHITE, { y: h - 0.02, sx: w + 0.72, sy: 0.18, sz: d + 0.72, cast: false }));
    g.add(part(G.box, mat(0x8a5a44, { roughness: 0.9 }), { x: w * 0.3, y: h + 1.1, z: d * 0.1, sx: 0.55, sy: 1.6, sz: 0.55 }));
    const slots = [-w / 3, 0, w / 3];
    const doorSlot = Math.floor(Math.random() * 3);
    const doorX = slots[doorSlot];
    g.add(part(G.box, mat(pick([0x5d4037, 0x7b3f00, 0x2c3e50, 0x8e1b1b]), { roughness: 0.6 }), { x: doorX, y: 1.0, z: -d / 2 - 0.04, sx: 1.0, sy: 2.0, sz: 0.08, cast: false }));
    g.add(part(G.sphere, mat(0xd4af37, { metalness: 0.9, roughness: 0.2 }), { x: doorX + 0.35, y: 1.0, z: -d / 2 - 0.1, s: 0.08, cast: false }));
    g.add(part(G.box, M.WHITE, { x: doorX, y: 2.15, z: -d / 2 - 0.03, sx: 1.2, sy: 0.12, sz: 0.1, cast: false }));
    for (let i = 0; i < 3; i++) {
      if (i === doorSlot) continue;
      const x = slots[i];
      g.add(part(G.box, M.WHITE, { x, y: 1.9, z: -d / 2 - 0.03, sx: 1.15, sy: 1.15, sz: 0.06, cast: false }));
      g.add(part(G.box, windowMat, { x, y: 1.9, z: -d / 2 - 0.07, sx: 0.95, sy: 0.95, sz: 0.04, cast: false }));
      g.add(part(G.box, M.WHITE, { x, y: 1.9, z: -d / 2 - 0.1, sx: 0.06, sy: 0.95, sz: 0.02, cast: false }));
      g.add(part(G.box, M.WHITE, { x, y: 1.9, z: -d / 2 - 0.1, sx: 0.95, sy: 0.06, sz: 0.02, cast: false }));
    }
    // side windows
    for (const s of [-1, 1]) {
      g.add(part(G.box, M.WHITE, { x: s * (w / 2 + 0.03), y: 1.9, z: d * 0.15, sx: 0.06, sy: 1.1, sz: 1.1, cast: false }));
      g.add(part(G.box, windowMat, { x: s * (w / 2 + 0.07), y: 1.9, z: d * 0.15, sx: 0.04, sy: 0.9, sz: 0.9, cast: false }));
    }
    const L = Math.max(0.5, pathLength - d / 2);
    g.add(part(G.box, M.CONCRETE, { x: doorX, y: 0.1, z: -d / 2 - 0.45, sx: 1.7, sy: 0.2, sz: 0.9, cast: false }));
    g.add(part(G.box, mat(0xa8a49c, { roughness: 0.95 }), { x: doorX, y: 0.015, z: -d / 2 - L / 2, sx: 1.3, sy: 0.03, sz: L, cast: false }));
    // mailbox by the sidewalk
    const mb = -d / 2 - L + 0.35;
    g.add(part(G.cyl, M.BARK, { x: doorX + 1.3, y: 0.55, z: mb, sx: 0.1, sy: 1.1, sz: 0.1 }));
    g.add(part(G.box, mat(pick([0x2c3e50, 0x1565c0, 0x8e1b1b]), { metalness: 0.5, roughness: 0.4 }), { x: doorX + 1.3, y: 1.25, z: mb, sx: 0.3, sy: 0.3, sz: 0.5, cast: false }));
    // hedge along the front
    const hedge = mat(0x3e7d3a, { roughness: 0.95 });
    for (const s of [-1, 1]) g.add(part(G.box, hedge, { x: s * (w / 2 - 0.4), y: 0.35, z: -d / 2 - 0.7, sx: w / 2 - 1.6, sy: 0.7, sz: 0.6 }));
  } else if (style === 'dome') {
    const domeMat = mat(0xd8ecf6, { metalness: 0.3, roughness: 0.08, opacity: 0.5, side: THREE.DoubleSide });
    g.add(part(G.cyl, M.CONCRETE, { y: 0.15, sx: 6.4, sy: 0.3, sz: 6.4 }));
    g.add(part(G.box, M.LIGHT_STEEL, { y: 1.1, sx: 2.4, sy: 1.6, sz: 2.4 }));
    g.add(part(G.box, windowMat, { y: 1.2, z: -1.22, sx: 1.4, sy: 0.5, sz: 0.04, cast: false }));
    g.add(part(G.cyl, mat(0x4caf50, { roughness: 0.8 }), { x: 1.6, y: 0.55, z: 1.2, sx: 1.2, sy: 0.5, sz: 1.2, cast: false }));
    g.add(part(G.sphere, mat(0x66bb6a, { roughness: 0.9 }), { x: 1.6, y: 1.1, z: 1.2, sx: 1.0, sy: 0.9, sz: 1.0 }));
    g.add(part(G.halfSphere, domeMat, { y: 0.3, s: 6.0, cast: false }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      g.add(part(G.torus, M.LIGHT_STEEL, { y: 0.3, sx: 6.0, sy: 6.0, sz: 6.0, ry: a, cast: false }));
    }
    g.add(part(G.box, M.DARK, { y: 0.9, z: -3.0, sx: 1.5, sy: 1.7, sz: 1.0 }));
    g.add(part(G.box, windowMat, { y: 1.1, z: -3.52, sx: 0.8, sy: 0.6, sz: 0.04, cast: false }));
    g.add(part(G.cyl, M.CHROME, { y: 3.9, sx: 0.08, sy: 1.6, sz: 0.08 }));
    const beacon = part(G.sphere, mat(0xff5252, { emissive: 0xff1744, emissiveIntensity: 2.5 }), { y: 4.75, s: 0.22, cast: false });
    beacon.userData.noMerge = true;
    g.add(beacon);
    anim.push((t) => { beacon.visible = Math.sin(t * 4) > -0.2; });
  } else if (style === 'mars') {
    const rock = mat(0x8b3a1a, { roughness: 0.95, flat: true });
    g.add(part(G.cone, rock, { y: 2.0, sx: 6.2, sy: 4.0, sz: 6.2 }));
    g.add(part(G.cone, mat(0x7a2f14, { roughness: 0.95, flat: true }), { x: 2.6, y: 0.9, z: 1.4, sx: 2.4, sy: 1.8, sz: 2.4 }));
    g.add(part(G.cyl, M.DARK, { y: 0.8, z: -2.5, sx: 1.4, sy: 1.6, sz: 1.4, rx: Math.PI / 2 }));
    for (const s of [-1, 1]) g.add(part(G.cyl, windowMat, { x: s * 1.3, y: 1.6, z: -2.1, sx: 0.7, sy: 0.6, sz: 0.7, rx: Math.PI / 2, cast: false }));
    g.add(part(G.cyl, M.CHROME, { y: 4.4, sx: 0.08, sy: 1.0, sz: 0.08 }));
    g.add(part(G.sphere, mat(0xffe34d, { emissive: 0xffd000, emissiveIntensity: 2 }), { y: 4.95, s: 0.2, cast: false }));
    g.add(part(G.box, mat(0x1d2f7a, { metalness: 0.75, roughness: 0.2 }), { x: -2.4, y: 1.0, z: -1.0, sx: 1.6, sy: 0.06, sz: 1.2, rz: 0.5 }));
  } else if (style === 'space') {
    const platform = new THREE.Group();
    platform.add(part(G.box, M.STEEL, { y: 1.8, sx: 6.6, sy: 0.5, sz: 5.6 }));
    platform.add(part(G.box, M.LIGHT_STEEL, { y: 3.2, sx: 4.6, sy: 2.2, sz: 3.6 }));
    platform.add(part(G.box, M.DARK, { y: 4.4, sx: 4.7, sy: 0.2, sz: 3.7, cast: false }));
    const strip = mat(0x7cf5ff, { emissive: 0x4dd0e1, emissiveIntensity: 1.8, roughness: 0.2 });
    platform.add(part(G.box, strip, { y: 3.4, z: -1.83, sx: 4.0, sy: 0.5, sz: 0.06, cast: false }));
    for (const s of [-1, 1]) platform.add(part(G.box, strip, { x: s * 2.33, y: 3.4, sx: 0.06, sy: 0.5, sz: 3.0, cast: false }));
    const under = mat(0x7cf5ff, { emissive: 0x00e5ff, emissiveIntensity: 2.5 });
    platform.add(part(G.cyl, under, { y: 1.5, sx: 3.4, sy: 0.12, sz: 3.4, cast: false, receive: false }));
    platform.add(glow(0x4dd0e1, 7, 0, 1.2, 0, 0.55));
    platform.add(part(G.cyl, M.CHROME, { y: 5.2, sx: 0.08, sy: 1.6, sz: 0.08 }));
    const beacon = part(G.sphere, mat(0xff5252, { emissive: 0xff1744, emissiveIntensity: 2.5 }), { y: 6.05, s: 0.22, cast: false });
    beacon.userData.noMerge = true;
    platform.add(beacon);
    mergeChildren(platform);
    g.add(platform);
    const phase = Math.random() * Math.PI * 2;
    anim.push((t) => { platform.position.y = Math.sin(t * 0.8 + phase) * 0.25; beacon.visible = Math.sin(t * 5 + phase) > 0; });
  } else { // 'ice'
    const ice = mat(0xe3f6fb, { roughness: 0.3, metalness: 0.05 });
    const iceDark = mat(0xb9dfe9, { roughness: 0.35 });
    g.add(part(G.halfSphere, ice, { s: 5.6 }));
    g.add(part(G.torus, iceDark, { y: 1.4, sx: 5.3, sy: 5.3, sz: 5.3, rx: Math.PI / 2, cast: false }));
    g.add(part(G.torus, iceDark, { y: 2.4, sx: 4.3, sy: 4.3, sz: 4.3, rx: Math.PI / 2, cast: false }));
    g.add(part(G.cyl, ice, { y: 0.75, z: -3.0, sx: 1.7, sy: 1.8, sz: 1.7, rx: Math.PI / 2 }));
    g.add(part(G.cyl, M.DARK, { y: 0.75, z: -3.92, sx: 1.25, sy: 0.08, sz: 1.25, rx: Math.PI / 2, cast: false }));
    g.add(part(G.sphere, windowMat, { x: 1.6, y: 1.8, z: -2.1, s: 0.6, cast: false }));
    g.add(part(G.sphere, windowMat, { x: -1.6, y: 1.8, z: -2.1, s: 0.6, cast: false }));
    g.add(part(G.octa, mat(0x9fe8ff, { roughness: 0.15, metalness: 0.1, emissive: 0x1aa3c4, emissiveIntensity: 0.4, opacity: 0.9 }), { x: 2.6, y: 0.9, z: 1.8, sx: 0.8, sy: 2.2, sz: 0.8, rz: 0.2 }));
  }
  mergeChildren(g);
  return { group: g, anim };
}

export function buildDeco(style, planetName, big = false) {
  const g = new THREE.Group();
  if (style === 'tree') {
    const s = big ? rand(1.6, 2.4) : rand(0.8, 1.3);
    if (Math.random() < 0.65) {
      const leaf = mat(pick([0x3e8e41, 0x2f7d32, 0x4caf50, 0x558b2f]), { roughness: 0.95 });
      const leafDark = mat(0x2e6b31, { roughness: 0.95 });
      g.add(part(G.cyl, M.BARK, { y: 0.8 * s, sx: 0.4 * s, sy: 1.6 * s, sz: 0.4 * s }));
      g.add(part(G.sphere, leaf, { y: 2.3 * s, s: 2.4 * s }));
      g.add(part(G.sphere, leafDark, { x: 0.7 * s, y: 2.8 * s, z: 0.3 * s, s: 1.7 * s }));
      g.add(part(G.sphere, leaf, { x: -0.6 * s, y: 2.7 * s, z: -0.4 * s, s: 1.6 * s }));
    } else {
      const pine = mat(pick([0x1b5e20, 0x2e7d32, 0x1f6b3a]), { roughness: 0.95 });
      g.add(part(G.cyl, M.BARK, { y: 0.6 * s, sx: 0.36 * s, sy: 1.2 * s, sz: 0.36 * s }));
      g.add(part(G.cone, pine, { y: 1.9 * s, sx: 2.2 * s, sy: 2.0 * s, sz: 2.2 * s }));
      g.add(part(G.cone, pine, { y: 2.9 * s, sx: 1.7 * s, sy: 1.8 * s, sz: 1.7 * s }));
      g.add(part(G.cone, pine, { y: 3.8 * s, sx: 1.2 * s, sy: 1.6 * s, sz: 1.2 * s }));
    }
  } else if (style === 'rock') {
    const base = planetName === 'Mars' ? 0x8f3a1c : planetName === 'Pluto' ? 0x7d7d96 : 0x6f6f6f;
    const n = Math.random() < 0.5 ? 1 : 2;
    const s = big ? rand(2.5, 4.5) : rand(0.8, 1.6);
    for (let i = 0; i < n; i++) {
      const rock = mat(shadeHex(base, rand(-0.2, 0.15)), { roughness: 0.95, flat: true });
      g.add(part(G.dodeca, rock, { x: i * 0.9 * s, y: 0.35 * s, z: rand(-0.4, 0.4) * s, sx: rand(1, 1.6) * s, sy: rand(0.6, 1.1) * s, sz: rand(1, 1.5) * s, ry: rand(0, 3), rz: rand(-0.3, 0.3) }));
    }
  } else if (style === 'crystal') {
    const n = 2 + Math.floor(Math.random() * 2);
    const s = big ? rand(2.0, 3.5) : rand(0.8, 1.4);
    for (let i = 0; i < n; i++) {
      const cm = mat(pick([0x9fe8ff, 0x7fd8f5, 0xbdf0ff]), { roughness: 0.15, metalness: 0.1, emissive: 0x1aa3c4, emissiveIntensity: 0.35, opacity: 0.9 });
      g.add(part(G.octa, cm, { x: (i - 1) * 0.6 * s, y: 0.9 * s, z: rand(-0.3, 0.3) * s, sx: rand(0.5, 0.8) * s, sy: rand(1.6, 3) * s, sz: rand(0.5, 0.8) * s, rz: rand(-0.35, 0.35), rx: rand(-0.2, 0.2) }));
    }
  } else { // alien plant
    const s = big ? rand(1.8, 3) : rand(0.8, 1.4);
    const stem = mat(0x7b1fa2, { roughness: 0.7 });
    const bulb = mat(pick([0xce93d8, 0xf48fb1, 0xb39ddb]), { roughness: 0.5, emissive: 0x4a148c, emissiveIntensity: 0.25 });
    g.add(part(G.cyl, stem, { y: 0.9 * s, sx: 0.22 * s, sy: 1.8 * s, sz: 0.22 * s }));
    g.add(part(G.sphere, bulb, { y: 2.0 * s, s: 1.1 * s }));
    g.add(part(G.sphere, bulb, { x: 0.5 * s, y: 1.6 * s, s: 0.7 * s }));
    g.add(part(G.sphere, bulb, { x: -0.45 * s, y: 1.7 * s, z: 0.3 * s, s: 0.6 * s }));
  }
  g.rotation.y = Math.random() * Math.PI * 2;
  mergeChildren(g);
  return { group: g };
}

export function buildLamp(night) {
  const g = new THREE.Group();
  g.add(part(G.cyl, M.DARK, { y: 2.3, sx: 0.16, sy: 4.6, sz: 0.16 }));
  g.add(part(G.cyl, M.DARK, { y: 0.15, sx: 0.4, sy: 0.3, sz: 0.4, cast: false }));
  g.add(part(G.box, M.DARK, { x: 0.65, y: 4.5, sx: 1.4, sy: 0.1, sz: 0.1 }));
  g.add(part(G.box, night ? M.LAMP_ON : M.LAMP_OFF, { x: 1.25, y: 4.38, sx: 0.55, sy: 0.18, sz: 0.32, cast: false }));
  if (night) g.add(glow(0xffe0a0, 3.2, 1.25, 4.3, 0, 0.8));
  mergeChildren(g);
  return { group: g };
}

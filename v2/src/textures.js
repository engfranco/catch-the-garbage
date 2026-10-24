// Procedurally generated textures (canvas → THREE.CanvasTexture).
// Everything is drawn at runtime so the game ships with no image files.
import * as THREE from '../lib/three.module.min.js';

const cache = new Map();

function rand(a, b) { return a + Math.random() * (b - a); }
function makeCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }
// Lighten (amt > 0) or darken (amt < 0) a hex colour; amt in [-1, 1]
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
  return `rgb(${clamp255(f(r))},${clamp255(f(g))},${clamp255(f(b))})`;
}
function rgba(hex, a, amt = 0) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
  return `rgba(${clamp255(f(r))},${clamp255(f(g))},${clamp255(f(b))},${a})`;
}

// Draw a filled circle that wraps around the tile edges so the texture tiles seamlessly.
function wrappedDot(ctx, size, x, y, r, style) {
  ctx.fillStyle = style;
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx, py = y + dy;
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function wrappedEllipse(ctx, size, x, y, rx, ry, rot, style) {
  ctx.fillStyle = style;
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx, py = y + dy;
      const r = Math.max(rx, ry);
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
      ctx.beginPath(); ctx.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// Fine grain: many tiny lighter / darker specks.
function speckle(ctx, size, base, count, minR, maxR, lightAmt, darkAmt, alpha) {
  for (let i = 0; i < count; i++) {
    const amt = Math.random() < 0.5 ? rand(0, lightAmt) : -rand(0, darkAmt);
    wrappedDot(ctx, size, Math.random() * size, Math.random() * size, rand(minR, maxR), rgba(base, alpha, amt));
  }
}

function finish(canvas, { repeat = [1, 1], anisotropy = 1 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

// ---- Ground (yards). One tile = 8 x 8 world units. ----
export function groundTexture(planet, anisotropy) {
  const key = 'ground:' + planet.name;
  if (cache.has(key)) return cache.get(key);
  const size = 512;
  const c = makeCanvas(size); const ctx = c.getContext('2d');
  const base = planet.ground;
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);

  if (planet.groundStyle === 'grass') {
    // soft patches, then thousands of tiny blades
    for (let i = 0; i < 40; i++) wrappedEllipse(ctx, size, Math.random() * size, Math.random() * size, rand(30, 90), rand(20, 60), rand(0, 3), rgba(base, 0.35, rand(-0.25, 0.2)));
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const amt = Math.random() < 0.5 ? rand(0.05, 0.35) : -rand(0.05, 0.35);
      ctx.strokeStyle = rgba(base, 0.7, amt);
      ctx.lineWidth = rand(0.6, 1.4);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand(-2, 2), y - rand(3, 7)); ctx.stroke();
    }
  } else if (planet.groundStyle === 'regolith') {
    speckle(ctx, size, base, 6000, 0.5, 2.2, 0.25, 0.35, 0.6);
    // craters: dark floor, light rim
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = rand(10, 42);
      wrappedDot(ctx, size, x + r * 0.08, y + r * 0.1, r * 1.12, rgba(base, 0.55, 0.22));
      wrappedDot(ctx, size, x, y, r, rgba(base, 0.75, -0.35));
      wrappedDot(ctx, size, x + r * 0.18, y + r * 0.18, r * 0.72, rgba(base, 0.5, -0.12));
    }
    speckle(ctx, size, base, 500, 1.5, 4, 0.0, 0.5, 0.5);
  } else if (planet.groundStyle === 'dust') {
    speckle(ctx, size, base, 7000, 0.5, 2.5, 0.22, 0.3, 0.55);
    // pebbles with highlight and shadow
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = rand(1.5, 5);
      wrappedEllipse(ctx, size, x + 1, y + 1.5, r * 1.1, r * 0.7, 0, 'rgba(0,0,0,0.35)');
      wrappedEllipse(ctx, size, x, y, r, r * 0.7, rand(0, 3), rgba(base, 0.95, rand(-0.3, 0.1)));
      wrappedDot(ctx, size, x - r * 0.3, y - r * 0.25, r * 0.3, rgba(base, 0.6, 0.35));
    }
    // wind streaks
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = shade(base, rand(0.1, 0.3)); ctx.lineWidth = rand(1, 3);
      const y = Math.random() * size;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(size * 0.3, y + rand(-20, 20), size * 0.6, y + rand(-20, 20), size, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (planet.groundStyle === 'sand') {
    speckle(ctx, size, base, 7000, 0.5, 2, 0.2, 0.2, 0.5);
    // ripples
    ctx.globalAlpha = 0.25;
    for (let y = 0; y < size; y += 14) {
      ctx.strokeStyle = shade(base, 0.25); ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const yy = y + Math.sin((x / size) * Math.PI * 4 + y * 0.1) * 4;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.strokeStyle = shade(base, -0.25); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const yy = y + 4 + Math.sin((x / size) * Math.PI * 4 + y * 0.1) * 4;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (planet.groundStyle === 'ice') {
    speckle(ctx, size, base, 4000, 0.5, 3, 0.45, 0.15, 0.45);
    for (let i = 0; i < 25; i++) wrappedEllipse(ctx, size, Math.random() * size, Math.random() * size, rand(40, 120), rand(20, 60), rand(0, 3), rgba(base, 0.25, rand(0.1, 0.5)));
    // cracks
    for (let i = 0; i < 18; i++) {
      let x = Math.random() * size, y = Math.random() * size;
      ctx.strokeStyle = rgba(base, 0.7, Math.random() < 0.5 ? 0.6 : -0.4); ctx.lineWidth = rand(0.8, 2);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 8; s++) { x += rand(-30, 30); y += rand(-30, 30); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  const tex = finish(c, { repeat: [1, 1], anisotropy });
  cache.set(key, tex);
  return tex;
}

// ---- Sidewalk slab. One tile = 2.5 x 2.5 world units. ----
export function sidewalkTexture(planet, anisotropy) {
  const key = 'sidewalk:' + planet.name;
  if (cache.has(key)) return cache.get(key);
  const size = 256;
  const c = makeCanvas(size); const ctx = c.getContext('2d');
  const base = planet.sidewalk;
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, base, 5000, 0.4, 1.6, 0.18, 0.25, 0.5);
  // a few darker stains
  for (let i = 0; i < 6; i++) wrappedEllipse(ctx, size, Math.random() * size, Math.random() * size, rand(15, 40), rand(10, 30), rand(0, 3), rgba(base, 0.18, -0.3));
  // grout lines around the slab
  ctx.strokeStyle = shade(base, -0.45); ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, size, size);
  ctx.strokeStyle = shade(base, 0.25); ctx.lineWidth = 1.5;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  const tex = finish(c, { repeat: [1, 1], anisotropy });
  cache.set(key, tex);
  return tex;
}

// ---- Road. One tile = 10 units wide x 7.5 units long (one centre dash per tile). ----
export function roadTexture(planet, anisotropy) {
  const key = 'road:' + planet.name;
  if (cache.has(key)) return cache.get(key);
  const w = 512, h = 384;
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  const base = planet.road;
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  // asphalt grain (wrap horizontally and vertically)
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rand(0.4, 1.5);
    const amt = Math.random() < 0.5 ? rand(0.05, 0.35) : -rand(0.05, 0.4);
    ctx.fillStyle = rgba(base, 0.6, amt);
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const px = x + dx, py = y + dy;
      if (px < -3 || px > w + 3 || py < -3 || py > h + 3) continue;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // darker wheel tracks in each lane
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (const cx of [w * 0.17, w * 0.33, w * 0.67, w * 0.83]) ctx.fillRect(cx - 18, 0, 36, h);
  // tar seams / cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * w, y = Math.random() * h;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += rand(-25, 25); y += rand(-25, 25); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // edge lines (world x = ±4.7, 0.16 wide)
  const edgeInset = (0.3 / 10) * w, edgeW = (0.16 / 10) * w;
  ctx.fillStyle = planet.edgeLine;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(edgeInset, 0, edgeW, h);
  ctx.fillRect(w - edgeInset - edgeW, 0, edgeW, h);
  // centre dash: 2.5 units long of the 7.5 unit tile, 0.2 wide
  const dashW = (0.2 / 10) * w, dashLen = (2.5 / 7.5) * h;
  ctx.fillStyle = planet.divider;
  ctx.fillRect(w / 2 - dashW / 2, (h - dashLen) / 2, dashW, dashLen);
  // slight paint wear
  ctx.globalAlpha = 0.25; ctx.fillStyle = base;
  for (let i = 0; i < 300; i++) {
    ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, rand(0.5, 2), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = finish(c, { repeat: [1, 1], anisotropy });
  cache.set(key, tex);
  return tex;
}

// ---- Soft radial glow used for lights, stars, hearts ----
export function glowTexture() {
  if (cache.has('glow')) return cache.get('glow');
  const size = 128;
  const c = makeCanvas(size); const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set('glow', tex);
  return tex;
}

// ---- Planet surfaces for the big spheres in the sky (equirectangular) ----
export function planetTexture(kind) {
  const key = 'planet:' + kind;
  if (cache.has(key)) return cache.get(key);
  const w = 1024, h = 512;
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');

  if (kind === 'earth') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9fd3ff'); g.addColorStop(0.5, '#1f5fc2'); g.addColorStop(1, '#9fd3ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // continents: clusters of green/brown blobs
    for (let i = 0; i < 9; i++) {
      const cx = Math.random() * w, cy = rand(h * 0.15, h * 0.85);
      for (let j = 0; j < 14; j++) {
        const x = cx + rand(-90, 90), y = cy + rand(-50, 50);
        ctx.fillStyle = Math.random() < 0.7 ? `rgb(${Math.round(rand(60, 110))},${Math.round(rand(120, 160))},${Math.round(rand(50, 80))})` : `rgb(${Math.round(rand(150, 190))},${Math.round(rand(130, 150))},${Math.round(rand(80, 100))})`;
        ctx.beginPath(); ctx.ellipse((x + w) % w, y, rand(25, 70), rand(18, 45), rand(0, 3), 0, Math.PI * 2); ctx.fill();
      }
    }
    // polar caps
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(0, 0, w, h * 0.07); ctx.fillRect(0, h * 0.93, w, h * 0.07);
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 90; i++) {
      ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, rand(20, 80), rand(6, 16), rand(-0.3, 0.3), 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'jupiter' || kind === 'saturn') {
    const bands = kind === 'jupiter'
      ? ['#c9a27a', '#e8d2b4', '#a86a44', '#f0dcc0', '#b9825a', '#dcc3a0', '#8f5a3a', '#e6cfae', '#c49a70', '#f1e2c8', '#a9714a', '#d9bf9c']
      : ['#e2d2a8', '#f1e6c6', '#d4bf8f', '#efe2c0', '#c9b082', '#ecdcb8', '#dbc795', '#f3e9cf'];
    const bh = h / bands.length;
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.beginPath();
      ctx.moveTo(0, i * bh);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, i * bh + Math.sin(x / w * Math.PI * 6 + i) * bh * 0.25);
      ctx.lineTo(w, (i + 1) * bh + bh * 0.3); ctx.lineTo(0, (i + 1) * bh + bh * 0.3);
      ctx.closePath(); ctx.fill();
    }
    // turbulence streaks
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 300; i++) {
      ctx.strokeStyle = Math.random() < 0.5 ? '#fff' : '#6b4226'; ctx.lineWidth = rand(1, 4);
      const y = Math.random() * h, x = Math.random() * w;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 40, y + rand(-8, 8), x + 80, y + rand(-8, 8), x + rand(60, 160), y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (kind === 'jupiter') {
      // Great Red Spot
      ctx.fillStyle = '#b8503a';
      ctx.beginPath(); ctx.ellipse(w * 0.62, h * 0.6, 70, 38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d0735a';
      ctx.beginPath(); ctx.ellipse(w * 0.62, h * 0.6, 48, 24, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else { // 'moon' – a grey cratered body (Charon, Phobos…)
    const base = '#9a9a9a';
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      const amt = Math.random() < 0.5 ? rand(0, 0.25) : -rand(0, 0.35);
      ctx.fillStyle = rgba(base, 0.6, amt);
      ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, rand(1, 6), 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = rand(8, 40);
      ctx.fillStyle = rgba(base, 0.6, 0.25); ctx.beginPath(); ctx.arc(x + r * 0.1, y + r * 0.1, r * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(base, 0.8, -0.35); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(base, 0.5, -0.1); ctx.beginPath(); ctx.arc(x + r * 0.2, y + r * 0.2, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

// ---- Saturn ring bands (1-D gradient across the ring radius) ----
export function ringTexture() {
  if (cache.has('rings')) return cache.get('rings');
  const w = 512, h = 8;
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0.00, 'rgba(210,190,150,0.0)');
  g.addColorStop(0.08, 'rgba(210,190,150,0.5)');
  g.addColorStop(0.30, 'rgba(235,215,175,0.85)');
  g.addColorStop(0.46, 'rgba(200,180,140,0.7)');
  g.addColorStop(0.50, 'rgba(120,100,80,0.05)');   // Cassini division
  g.addColorStop(0.55, 'rgba(230,210,170,0.8)');
  g.addColorStop(0.80, 'rgba(215,195,155,0.75)');
  g.addColorStop(0.92, 'rgba(190,170,135,0.4)');
  g.addColorStop(1.00, 'rgba(190,170,135,0.0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // fine ringlets
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * w;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, 0, rand(0.5, 2), h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set('rings', tex);
  return tex;
}

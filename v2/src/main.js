// Catch the Garbage! 3D — game logic
import * as THREE from '../lib/three.module.min.js';
import { getPlanet, DIFFICULTIES, SIDEWALK_OUT, SPAWN_Z, DESPAWN_Z, MOBILE } from './config.js';
import { initAudio, resumeAudio, sfx } from './audio.js';
import { World } from './world.js';
import * as Models from './models.js';

const { rand, pick } = Models;

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const scoreEl = $('score'), livesEl = $('lives'), levelNumEl = $('levelNum');
const planetNameEl = $('planetName'), planetEmojiEl = $('planetEmoji');
const hud = $('hud'), hint = $('hint');
const startScreen = $('startScreen'), gameOverScreen = $('gameOverScreen'), pauseScreen = $('pauseScreen');
const startBtn = $('startBtn'), playAgainBtn = $('playAgainBtn'), pauseBtn = $('pauseBtn'), resumeBtn = $('resumeBtn'), restartBtn = $('restartBtn');
const finalScoreEl = $('finalScore'), bagsCollectedEl = $('bagsCollected'), planetsVisitedEl = $('planetsVisited'), highScoreEl = $('highScore');
const endEmoji = $('endEmoji'), endTitle = $('endTitle'), endModeEl = $('endMode');
const startHsEl = $('startHighScore'), startHsVal = $('startHs'), startHsMode = $('startHsMode');
const diffBtns = document.querySelectorAll('.diff-btn');
const gameDiv = $('game');
const touchControls = $('touchControls');
const HS_KEY = 'ctg3d_highscore_v1';   // suffixed with the difficulty key
const DIFF_KEY = 'ctg3d_difficulty';
const PARAMS = new URLSearchParams(location.search);
const START_LEVEL = Math.max(1, Math.min(99, parseInt(PARAMS.get('level') || '1', 10) || 1));
const DEBUG = PARAMS.has('debug');
const GOD = DEBUG && PARAMS.has('god');   // debug only: never lose lives
const DEBUG_THIEF = DEBUG ? PARAMS.get('thief') : null;   // debug only: ?thief=raccoon|skunk|monster spawns that thief back to back
const debugEl = $('debug');
if (DEBUG) debugEl.classList.remove('hidden');

// ---- Renderer / scene ----
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  $('webglError').classList.remove('hidden');
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 1600);
const world = new World(renderer, scene, camera);

let W = 1, H = 1;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.fov = W / H < 1 ? 66 : 52;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- Truck ----
const truckModel = Models.buildTruck();
scene.add(truckModel.group);
const TRUCK_MIN_X = -(SIDEWALK_OUT - 0.95), TRUCK_MAX_X = SIDEWALK_OUT - 0.95;
const TRUCK_MIN_Z = -20, TRUCK_MAX_Z = 0;
const truck = { x: 2.5, z: -4, targetX: 2.5, targetZ: -4, vx: 0, yaw: 0, w: 2.3, l: 5.2, bounce: 0 };

// ---- Particles (one instanced mesh) ----
class ParticleSystem {
  constructor(max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(Models.G.box, new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, white);
    this.mesh.count = 0;
    this.list = [];
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
  }
  burst(x, y, z, color, count = 12, spd = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.list.length >= this.max) break;
      this.list.push({
        x, y, z,
        vx: (Math.random() - 0.5) * 11 * spd, vy: rand(3, 9) * spd, vz: (Math.random() - 0.5) * 11 * spd,
        life: 1, decay: rand(0.9, 1.7), size: rand(0.12, 0.32), color: c,
        rot: rand(0, Math.PI), rotV: rand(-7, 7)
      });
    }
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.vy -= 22 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.rotV * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      p.life -= dt * p.decay;
      if (p.life <= 0) L.splice(i, 1);
    }
    const d = this.dummy;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rot, p.rot * 0.7, 0);
      d.scale.setScalar(p.size * Math.max(0.01, p.life));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.mesh.setColorAt(i, p.color);
    }
    this.mesh.count = L.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
const particles = new ParticleSystem(360);

// ---- Game state ----
const STATE = { READY: 0, PLAYING: 1, OVER: 2 };
let state = STATE.READY;
let score = 0, lives = 3, level = 1, bagsCollected = 0, planetsVisited = 1;
let stolenOutstanding = 0;   // hearts currently carried off by thieves (shown as 🤍 in the HUD)
const highScores = { easy: 0, medium: 0, hard: 0 };
for (const k in highScores) {
  try { highScores[k] = parseInt(localStorage.getItem(HS_KEY + '_' + k) || '0', 10) || 0; } catch (e) { /* ignore */ }
}
// difficulty: ?mode=easy|medium|hard wins, then the remembered choice, then medium
let diff = DIFFICULTIES.medium;
{
  let saved = null;
  try { saved = localStorage.getItem(DIFF_KEY); } catch (e) { /* ignore */ }
  const fromUrl = PARAMS.get('mode');
  diff = DIFFICULTIES[fromUrl] || DIFFICULTIES[saved] || DIFFICULTIES.medium;
}
function refreshStartHighScore() {
  const hs = highScores[diff.key];
  startHsEl.classList.toggle('hidden', hs <= 0);
  startHsVal.textContent = hs;
  startHsMode.textContent = diff.emoji + ' ' + diff.name;
}
function selectDifficulty(key, persist = true) {
  diff = DIFFICULTIES[key] || DIFFICULTIES.medium;
  diffBtns.forEach(b => b.classList.toggle('selected', b.dataset.diff === diff.key));
  if (persist) { try { localStorage.setItem(DIFF_KEY, diff.key); } catch (e) { /* ignore */ } }
  refreshStartHighScore();
}
diffBtns.forEach(b => b.addEventListener('click', () => { initAudio(); selectDifficulty(b.dataset.diff); }));
let invulnTimer = 0, cameraShake = 0;
let paused = false;
let baseSpeed = 18, speed = baseSpeed;
let entities = [];
let spawnTimer = {};
let gameTime = 0;
let lastTime = 0;

// ---- Input ----
const keys = {};
const NUDGE = { ArrowLeft: [-0.6, 0], a: [-0.6, 0], A: [-0.6, 0], ArrowRight: [0.6, 0], d: [0.6, 0], D: [0.6, 0], ArrowUp: [0, -0.8], w: [0, -0.8], W: [0, -0.8], ArrowDown: [0, 0.8], s: [0, 0.8], S: [0, 0.8] };
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  // a quick tap moves the truck a little even if the key is released before the next frame
  const n = NUDGE[e.key];
  if (n && !e.repeat && state === STATE.PLAYING && !paused) { truck.targetX += n[0]; truck.targetZ += n[1]; }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Tap / drag anywhere on the ground to steer the truck there
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();
let pointerActive = false;
function onPointer(e) {
  if (state !== STATE.PLAYING || paused) return;
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
    truck.targetX = hitPoint.x;
    truck.targetZ = hitPoint.z;
  }
}
gameDiv.addEventListener('pointerdown', e => {
  if (e.target.closest('.ctrl-btn') || e.target.closest('button')) return;
  pointerActive = true; onPointer(e);
});
gameDiv.addEventListener('pointermove', e => { if (pointerActive) onPointer(e); });
gameDiv.addEventListener('pointerup', () => { pointerActive = false; });
gameDiv.addEventListener('pointerleave', () => { pointerActive = false; });
gameDiv.addEventListener('touchstart', () => { initAudio(); }, { passive: true });
document.addEventListener('touchmove', e => { if (state === STATE.PLAYING) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd <= 350) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

document.querySelectorAll('.ctrl-btn').forEach(btn => {
  const key = btn.dataset.key;
  const press = (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); keys[key] = true; btn.classList.add('pressed'); };
  const release = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } keys[key] = false; btn.classList.remove('pressed'); };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});

// ---- Helpers ----
function pedStyleFor(planet) { return planet.pedStyle === 'alien' ? 'astronaut' : planet.pedStyle; }
function addEntity(e, built) {
  e.group = built.group; e.model = built;
  if (e.w === undefined) e.w = built.w;
  if (e.l === undefined) e.l = built.l;
  e.y = e.y || 0;
  e.group.position.set(e.x, e.y, e.z);
  scene.add(e.group);
  entities.push(e);
  return e;
}
function removeEntityAt(i) {
  const e = entities[i];
  scene.remove(e.group);
  Models.disposeMerged(e.group);
  if (e.model && e.model.disposables) e.model.disposables.forEach(m => m.dispose());
  entities.splice(i, 1);
}
function clearEntities() { while (entities.length) removeEntityAt(entities.length - 1); }
function overlapsTruck(e, shrink = 0.85) {
  const tw = truck.w * 0.9 / 2, tl = truck.l * 0.85 / 2;
  const ew = e.w * shrink / 2, el = e.l * shrink / 2;
  return Math.abs(e.x - truck.x) < tw + ew && Math.abs(e.z - truck.z) < tl + el;
}
const projV = new THREE.Vector3();
function toScreen(x, y, z) {
  projV.set(x, y, z).project(camera);
  if (projV.z > 1) return null;
  return { x: (projV.x + 1) / 2 * W, y: (1 - projV.y) / 2 * H };
}
function spawnFloater(x, y, z, text, color) {
  const p = toScreen(x, y, z);
  if (!p) return;
  const f = document.createElement('div');
  f.className = 'floater';
  f.textContent = text;
  f.style.left = p.x + 'px'; f.style.top = p.y + 'px'; f.style.color = color;
  gameDiv.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}
function spawnLevelUp(n) {
  const p = getPlanet(n);
  const el = document.createElement('div');
  el.className = 'levelup';
  el.innerHTML = '<div class="lvl-text">LEVEL ' + n + '!</div>' +
                 '<div class="planet-emoji">' + p.emoji + '</div>' +
                 '<div class="planet-text">Welcome to ' + p.name + '!</div>';
  gameDiv.appendChild(el);
  setTimeout(() => el.remove(), 2400);
  sfx.levelUp();
}
function shakeCamera(amount) { cameraShake = Math.max(cameraShake, amount); }

// ---- Spawners ----
const CAR_COLORS = [0x2f6fd0, 0x8e44ad, 0xc0392b, 0xe67e22, 0x16a085, 0x2c3e50, 0xf1f1f1, 0x7f8c8d, 0xf1c40f, 0x1b5e20];
function spawnCar() {
  const planet = getPlanet(level);
  const onComing = Math.random() >= diff.sameLaneChance;
  const e = {
    type: 'car', onComing,
    rel: onComing ? rand(8, 14) * diff.trafficSpeed : -Math.min(rand(5, 9), speed - 4),
    x: onComing ? -rand(1.4, 3.9) : rand(1.4, 3.9), z: SPAWN_Z,
    color: pick(CAR_COLORS), body: pick(['sedan', 'sedan', 'suv', 'hatch']), bob: Math.random() * Math.PI * 2
  };
  addEntity(e, Models.buildCar(planet.carStyle, e, planet.night));
  e.y = e.model.hover;
  e.group.rotation.y = onComing ? Math.PI : 0;
}
function spawnPerson() {
  const planet = getPlanet(level);
  const fromLeft = Math.random() < 0.5;
  const e = {
    type: 'person', x: fromLeft ? -8.7 : 8.7, z: SPAWN_Z,
    vx: (fromLeft ? 1 : -1) * rand(1.5, 2.4) * diff.crosserSpeed, triggerZ: rand(-90, -28), walking: false, walkPhase: Math.random() * 6,
    shirtColor: pick([0xe74c3c, 0x3498db, 0x27ae60, 0xf39c12, 0x9b59b6, 0xec407a, 0xf5f5f5]),
    pantsColor: pick([0x2c3e50, 0x34495e, 0x795548, 0x1565c0, 0x4e342e]),
    hairColor: pick([0x2b1b12, 0x5a3a1e, 0xd9a441, 0x8c8c8c, 0x1a1a1a, 0xb5541c])
  };
  addEntity(e, Models.buildPerson(pedStyleFor(planet), e));
  e.group.rotation.y = e.vx > 0 ? -Math.PI / 2 : Math.PI / 2;
}
function spawnAlien() {
  const fromLeft = Math.random() < 0.5;
  const e = {
    type: 'alien', x: fromLeft ? -8.7 : 8.7, z: SPAWN_Z,
    vx: (fromLeft ? 1 : -1) * rand(1.3, 2.3) * diff.crosserSpeed, triggerZ: rand(-90, -28), walking: false, walkPhase: Math.random() * 6,
    bodyColor: pick([0x7cfc00, 0x00fa9a, 0xba55d3, 0x40e0d0, 0xff69b4]), eyeCount: pick([1, 2, 3]), float: Math.random() * Math.PI * 2
  };
  addEntity(e, Models.buildPerson('alien', e));
  e.group.rotation.y = e.vx > 0 ? -Math.PI / 2 : Math.PI / 2;
}
function spawnDog() {
  const fromLeft = Math.random() < 0.5;
  const e = {
    type: 'dog', x: (fromLeft ? -1 : 1) * rand(11, 16), z: SPAWN_Z,
    vx: (fromLeft ? 1 : -1) * rand(5, 8) * diff.crosserSpeed, triggerZ: rand(-80, -25), walking: false, runPhase: 0,
    bodyColor: pick([0x8b4513, 0xd2691e, 0xf4a460, 0x696969, 0xf5f5f5, 0x3e2723])
  };
  addEntity(e, Models.buildDog(e));
  e.group.rotation.y = e.vx > 0 ? -Math.PI / 2 : Math.PI / 2;
}
function spawnChicken() {
  const fromLeft = Math.random() < 0.5;
  const e = {
    type: 'chicken', x: (fromLeft ? -1 : 1) * rand(9, 13), z: SPAWN_Z,
    vx: (fromLeft ? 1 : -1) * rand(3, 5) * diff.crosserSpeed, triggerZ: rand(-80, -25), walking: false, walkPhase: 0, headBob: 0,
    cluckTimer: rand(800, 2500), bodyColor: pick([0xffffff, 0xffffff, 0xf5deb3, 0xa0522d])
  };
  addEntity(e, Models.buildChicken(e));
  e.group.rotation.y = e.vx > 0 ? -Math.PI / 2 : Math.PI / 2;
  if (Math.random() < 0.4) sfx.cluck();
}
function spawnFrog() {
  const fromLeft = Math.random() < 0.5;
  const e = {
    type: 'frog', x: (fromLeft ? -1 : 1) * rand(9, 12), z: SPAWN_Z,
    hopDir: fromLeft ? 1 : -1, triggerZ: rand(-85, -25), walking: false,
    hopState: 'wait', hopTimer: 0, hopDuration: 320, hopWaitDuration: rand(280, 520),
    hopFromX: 0, hopToX: 0, hopFromZ: 0, hopToZ: 0, hopProgress: 0, hopOffZ: 0,
    ribbitTimer: rand(1000, 3000)
  };
  addEntity(e, Models.buildFrog());
  e.group.rotation.y = e.hopDir > 0 ? -Math.PI / 2 : Math.PI / 2;
  if (Math.random() < 0.5) sfx.ribbit();
}
function spawnUFO() {
  const fromLeft = Math.random() < 0.5;
  const e = {
    type: 'ufo', x: fromLeft ? -34 : 34, z: rand(-30, -6), y: 3.4,
    vx: (fromLeft ? 1 : -1) * rand(6, 10) * diff.crosserSpeed, bobPhase: Math.random() * 6, spin: 0
  };
  addEntity(e, Models.buildUFO());
  sfx.ufo();
}
function spawnAsteroid() {
  const fallDuration = 1600;
  const e = {
    type: 'asteroid', x: rand(-6, 6), z: truck.z - speed * (fallDuration / 1000) + rand(diff.asteroidAhead[0], diff.asteroidAhead[1]),
    fall: 0, fallDuration, exploded: false, boomT: 0, rotV: rand(-2, 2)
  };
  addEntity(e, Models.buildAsteroid());
}
function spawnGarbage() {
  const side = Math.random() < 0.5 ? -1 : 1;
  const e = { type: 'garbage', x: side * rand(5.5, 7.0), z: SPAWN_Z, bagType: pick(['bag', 'bag', 'can', 'pile']) };
  addEntity(e, Models.buildGarbage(e.bagType));
  e.group.rotation.y = Math.random() * Math.PI * 2;
}
function spawnStar() {
  const e = { type: 'star', x: rand(-4, 4), z: SPAWN_Z, y: 1.0, rotation: 0, pulse: 0 };
  addEntity(e, Models.buildStar());
}
function spawnHeart() {
  const e = { type: 'heart', x: rand(-4, 4), z: SPAWN_Z, y: 1.1, pulse: 0, bob: 0 };
  addEntity(e, Models.buildHeart());
}

// ---- Heart thieves ----
// They sneak toward the truck, grab hearts on contact and run off down the road
// with the hearts floating above them. Catch them to get the hearts back.
const THIEF = {
  raccoon: { steal: 1, maxVx: 6.0, zig: 2.4, zigAmp: 2.8, markerY: 1.35, spawnX: [9, 13], trigger: [-80, -45], build: () => Models.buildRaccoon(), sound: () => sfx.chitter() },
  skunk:   { steal: 2, maxVx: 2.8, zig: 1.4, zigAmp: 2.2, markerY: 1.35, spawnX: [8.5, 10.5], trigger: [-125, -90], build: () => Models.buildSkunk(), sound: () => sfx.spray() },
  monster: { steal: 3, maxVx: 3.2, zig: 1.0, zigAmp: 3.0, markerY: 3.1, spawnX: [9, 11.5], trigger: [-110, -75], build: () => Models.buildTrashMonster(), sound: () => sfx.growl() }
};
const THIEF_MIN_Z = -21.5;   // a fleeing thief hovers here: just within reach of a truck pushed fully forward
function thiefActive() { return entities.some(e => e.type === 'thief'); }
function spawnThief(kind) {
  const k = THIEF[kind];
  const fromLeft = Math.random() < 0.5;
  const e = {
    type: 'thief', kind, steal: k.steal, x: (fromLeft ? -1 : 1) * rand(k.spawnX[0], k.spawnX[1]), z: SPAWN_Z,
    dir: fromLeft ? 1 : -1, vx: 0, triggerZ: rand(k.trigger[0], k.trigger[1]), walking: false, state: 'approach',
    phase: 0, fleeT: 0, fleeX0: 0, stolen: 0, markers: null, soundT: rand(1, 3)
  };
  addEntity(e, k.build());
  e.group.rotation.y = e.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  k.sound();
}
function stealHearts(e) {
  const k = THIEF[e.kind];
  const n = Math.min(e.steal, lives - 1);   // thieves never take your last heart
  lives -= n; e.stolen = n; stolenOutstanding += n;
  e.state = 'flee'; e.fleeT = 0;
  e.z = Math.max(truck.z - 7, THIEF_MIN_Z);
  e.fleeX0 = Math.max(-3, Math.min(3, e.x));
  truck.targetZ = Math.max(truck.targetZ, -4);   // the shove: a truck pushed forward gets bumped back
  e.markers = Models.buildHeartMarker(n);
  e.markers.position.y = k.markerY;
  e.group.add(e.markers);
  sfx.steal(); k.sound(); shakeCamera(0.4);
  particles.burst(e.x, 1.2, e.z, 0xff4081, 16, 1.2);
  spawnFloater(truck.x, 3.4, truck.z, '-' + n + ' ❤️ Stolen!', '#c2185b');
  if (DEBUG) console.log('hearts stolen by', e.kind, n, 'at', (gameTime / 1000).toFixed(2) + 's');
  updateUI();
}
function recoverHearts(e) {
  const n = e.stolen;
  lives = Math.min(diff.maxLives, lives + n); stolenOutstanding -= n; score += 15 * n;
  e.state = 'caught'; e.stolen = 0;
  if (e.markers) { e.group.remove(e.markers); e.markers = null; }
  e.vx = (e.x >= 0 ? 1 : -1) * 12;
  sfx.heart(); shakeCamera(0.2);
  particles.burst(e.x, 1.4, e.z, 0xff4081, 26, 1.4);
  spawnFloater(e.x, 2.6, e.z, '+' + n + ' ❤️ Got them back!', '#ff4081');
  if (DEBUG) console.log('hearts recovered from', e.kind, n, 'at', (gameTime / 1000).toFixed(2) + 's');
  updateUI();
}
function thiefEscaped(e) {
  stolenOutstanding -= e.stolen;
  sfx.escaped();
  spawnFloater(truck.x, 3.4, truck.z, e.stolen + ' ❤️ gone…', '#7f8c8d');
  if (DEBUG) console.log(e.kind, 'escaped with', e.stolen, 'at', (gameTime / 1000).toFixed(2) + 's');
  updateUI();
}
function bonkThief(e) {   // only one heart left, nothing to steal: the thief just bounces off
  e.state = 'caught'; e.vx = (e.x >= 0 ? 1 : -1) * 12;
  sfx.cluck(); particles.burst(e.x, 1.0, e.z, 0xbdbdbd, 10, 1);
  spawnFloater(e.x, 2.4, e.z, 'Bonk!', '#7f8c8d');
}

// ---- Game flow ----
function applyPlanetVisuals() {
  const planet = getPlanet(level);
  world.applyPlanet(planet);
  truckModel.spot.intensity = planet.night ? 120 : 0;
  truckModel.glows.forEach(g => { g.visible = true; g.material.opacity = planet.night ? 0.95 : 0.45; });
  // re-skin traffic & pedestrians that are already on the road
  for (const e of entities) {
    if (e.type !== 'car' && e.type !== 'person') continue;
    scene.remove(e.group);
    const built = e.type === 'car' ? Models.buildCar(planet.carStyle, e, planet.night) : Models.buildPerson(pedStyleFor(planet), e);
    e.group = built.group; e.model = built; e.w = built.w; e.l = built.l;
    if (e.type === 'car') { e.y = built.hover; e.group.rotation.y = e.onComing ? Math.PI : 0; }
    else e.group.rotation.y = e.vx > 0 ? -Math.PI / 2 : Math.PI / 2;
    e.group.position.set(e.x, e.y, e.z);
    scene.add(e.group);
  }
}

function startGame() {
  initAudio(); resumeAudio();
  state = STATE.PLAYING;
  paused = false;
  pauseScreen.classList.add('hidden');
  score = 0; lives = diff.lives; level = START_LEVEL; bagsCollected = 0; planetsVisited = START_LEVEL;
  stolenOutstanding = 0;
  clearEntities();
  particles.list.length = 0;
  invulnTimer = 0; cameraShake = 0;
  baseSpeed = diff.baseSpeed + START_LEVEL * diff.speedPerLevel; speed = baseSpeed;
  gameTime = (START_LEVEL - 1) * diff.levelDuration;
  spawnTimer = { car: 0, person: 1500, dog: 3000, asteroid: 0, garbage: 0, star: 8000, chicken: 4000, frog: 2500, alien: 2000, ufo: 3000, heart: 12000, raccoon: 5000, skunk: 0, monster: 0 };
  truck.x = 2.5; truck.z = -4; truck.targetX = truck.x; truck.targetZ = truck.z; truck.vx = 0; truck.yaw = 0;
  truckModel.group.visible = true;
  applyPlanetVisuals();
  updatePlanetUI(); updateUI();
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  touchControls.classList.remove('hidden');
  hint.classList.remove('hidden');
  hint.style.opacity = '1';
  setTimeout(() => { hint.style.opacity = '0'; }, 5000);
  setTimeout(() => { hint.classList.add('hidden'); }, 6000);
}

function endGame() {
  state = STATE.OVER;
  sfx.gameOver();
  if (score > highScores[diff.key]) {
    highScores[diff.key] = score;
    try { localStorage.setItem(HS_KEY + '_' + diff.key, String(score)); } catch (e) { /* ignore */ }
  }
  endModeEl.textContent = diff.emoji + ' ' + diff.name;
  refreshStartHighScore();
  finalScoreEl.textContent = score;
  bagsCollectedEl.textContent = bagsCollected;
  planetsVisitedEl.textContent = planetsVisited;
  highScoreEl.textContent = highScores[diff.key];
  if (planetsVisited >= 5 || score >= 500) { endEmoji.textContent = '🏆'; endTitle.textContent = 'COSMIC HERO!'; }
  else if (score >= 250) { endEmoji.textContent = '🎉'; endTitle.textContent = 'Awesome!'; }
  else if (score >= 100) { endEmoji.textContent = '😊'; endTitle.textContent = 'Good Job!'; }
  else { endEmoji.textContent = '🚛'; endTitle.textContent = 'Try Again!'; }
  hud.classList.add('hidden');
  touchControls.classList.add('hidden');
  hint.classList.add('hidden');
  gameOverScreen.classList.remove('hidden');
  for (const k in keys) keys[k] = false;
  clearEntities();
}

function updateUI() {
  scoreEl.textContent = score;
  livesEl.textContent = ('❤️'.repeat(Math.max(0, lives)) + '🤍'.repeat(Math.max(0, stolenOutstanding))) || '0';
  levelNumEl.textContent = level;
}
function updatePlanetUI() {
  const p = getPlanet(level);
  planetNameEl.textContent = p.name;
  planetEmojiEl.textContent = p.emoji;
}

function hitTruck(what) {
  if (invulnTimer > 0 || GOD) return;
  if (DEBUG) console.log('hit by', what, 'at', (gameTime / 1000).toFixed(2) + 's', 'lives', lives - 1);
  lives--; invulnTimer = diff.invuln; shakeCamera(0.7);
  spawnFloater(truck.x, 3.2, truck.z, 'Ouch!', '#e74c3c');
  updateUI();
  if (lives <= 0) endGame();
}

// ---- Truck & camera visuals ----
function updateTruckVisual(dt, spd) {
  truck.bounce += dt * 14;
  const g = truckModel.group;
  g.position.set(truck.x, Math.sin(truck.bounce) * 0.015, truck.z);
  const targetYaw = -Math.max(-0.32, Math.min(0.32, truck.vx * 0.035));
  truck.yaw += (targetYaw - truck.yaw) * Math.min(1, dt * 10);
  g.rotation.y = truck.yaw;
  g.rotation.z = Math.max(-0.07, Math.min(0.07, truck.vx * 0.01));
  const w = spd / 0.46 * dt;
  for (const wh of truckModel.wheels) wh.rotation.x += w;
  if (state === STATE.PLAYING && invulnTimer > 0) g.visible = Math.floor(invulnTimer / 100) % 2 === 0;
  else g.visible = true;
}
const camPos = new THREE.Vector3(1.4, 6.4, 9);
const camDesired = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
function updateCamera(dt) {
  const tx = truck.x * 0.55;
  camDesired.set(tx, 6.4, 10.5 + truck.z * 0.35);
  camPos.lerp(camDesired, 1 - Math.exp(-dt * 5));
  camera.position.copy(camPos);
  if (cameraShake > 0) {
    camera.position.x += (Math.random() - 0.5) * cameraShake;
    camera.position.y += (Math.random() - 0.5) * cameraShake;
    cameraShake = Math.max(0, cameraShake - dt * 2.2);
  }
  lookTarget.set(tx * 0.85, 1.3, truck.z - 18);
  camera.lookAt(lookTarget);
}

// ---- Main update ----
function update(dt) {
  const t = performance.now() / 1000;

  if (state !== STATE.PLAYING || paused) {
    // attract mode: keep the world rolling gently behind the menus
    if (!paused) {
      const idle = 9;
      world.update(dt, idle, t);
      updateTruckVisual(dt, idle);
      updateCamera(dt);
      particles.update(dt);
    }
    return;
  }

  gameTime += dt * 1000;
  const newLevel = 1 + Math.floor(gameTime / diff.levelDuration);
  if (newLevel !== level) {
    level = newLevel;
    planetsVisited = Math.max(planetsVisited, level);
    spawnLevelUp(level);
    updatePlanetUI();
    applyPlanetVisuals();
  }
  baseSpeed = diff.baseSpeed + level * diff.speedPerLevel;
  speed = baseSpeed;

  // steering
  const moveSpeed = 15;
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) truck.targetX -= moveSpeed * dt;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) truck.targetX += moveSpeed * dt;
  if (keys['ArrowUp'] || keys['w'] || keys['W']) truck.targetZ -= moveSpeed * dt;
  if (keys['ArrowDown'] || keys['s'] || keys['S']) truck.targetZ += moveSpeed * dt;
  truck.targetX = Math.max(TRUCK_MIN_X, Math.min(TRUCK_MAX_X, truck.targetX));
  truck.targetZ = Math.max(TRUCK_MIN_Z, Math.min(TRUCK_MAX_Z, truck.targetZ));
  const px = truck.x;
  truck.x += (truck.targetX - truck.x) * (1 - Math.exp(-dt * 8));
  truck.z += (truck.targetZ - truck.z) * (1 - Math.exp(-dt * 6));
  truck.vx = (truck.x - px) / Math.max(dt, 0.001);
  updateTruckVisual(dt, speed);

  world.update(dt, speed, t);

  // spawning
  const planet = getPlanet(level);
  const levelMul = 1 + (level - 1) * diff.levelRamp;
  const hz = diff.hazardRate, pk = diff.pickupRate;
  for (const k in spawnTimer) spawnTimer[k] += dt * 1000 * levelMul;
  if (spawnTimer.car >= rand(900, 1600) * hz) { spawnTimer.car = 0; spawnCar(); }
  if (planet.pedStyle === 'person' || planet.pedStyle === 'astronaut') {
    if (spawnTimer.person >= rand(2200, 4200) * hz) { spawnTimer.person = 0; spawnPerson(); }
  }
  if (planet.allowAliens) {
    if (spawnTimer.alien >= rand(2200, 4000) * hz) { spawnTimer.alien = 0; spawnAlien(); }
    if (spawnTimer.ufo >= rand(7000, 11000) * diff.ufoRate) { spawnTimer.ufo = 0; spawnUFO(); }
  }
  if (spawnTimer.dog >= rand(3500, 6500) * hz) { spawnTimer.dog = 0; spawnDog(); }
  if (spawnTimer.chicken >= rand(3000, 5500) * hz) { spawnTimer.chicken = 0; spawnChicken(); }
  if (spawnTimer.frog >= rand(2500, 4800) * hz) { spawnTimer.frog = 0; spawnFrog(); }
  if (spawnTimer.asteroid >= rand(5000, 9000) * diff.asteroidRate) { spawnTimer.asteroid = 0; spawnAsteroid(); }
  if (spawnTimer.garbage >= rand(700, 1300) * pk) { spawnTimer.garbage = 0; spawnGarbage(); }
  if (spawnTimer.star >= rand(9000, 14000) * pk) { spawnTimer.star = 0; spawnStar(); }
  if (spawnTimer.heart >= rand(15000, 22000) * diff.heartRate) { spawnTimer.heart = 0; spawnHeart(); }
  if (DEBUG_THIEF && THIEF[DEBUG_THIEF]) {
    if (!thiefActive()) spawnThief(DEBUG_THIEF);
  } else if (!thiefActive()) {   // one thief at a time keeps the chase readable
    const tr = diff.thiefRate;
    if (spawnTimer.raccoon >= rand(14000, 22000) * tr) { spawnTimer.raccoon = 0; spawnThief('raccoon'); }
    else if (spawnTimer.skunk >= rand(18000, 28000) * tr) { spawnTimer.skunk = 0; spawnThief('skunk'); }
    else if (level >= diff.monsterMinLevel && spawnTimer.monster >= rand(30000, 45000) * tr) { spawnTimer.monster = 0; spawnThief('monster'); }
  }

  if (invulnTimer > 0) invulnTimer -= dt * 1000;

  // entities
  const dtMs = dt * 1000;
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    const m = e.model;

    if (e.type === 'asteroid') {
      e.z += speed * dt;
      e.fall += dtMs;
      const ft = Math.min(1, e.fall / e.fallDuration);
      if (!e.exploded) {
        m.rockGroup.position.y = 70 * (1 - ft * ft) + 0.8;
        m.rock.rotation.x += e.rotV * dt; m.rock.rotation.y += e.rotV * 0.7 * dt;
        const rs = 1 + ft * 2.6;
        m.ring.scale.setScalar(rs); m.disc.scale.setScalar(rs);
        m.ring.material.opacity = 0.45 + Math.sin(e.fall / 70) * 0.25;
        if (ft >= 1) {
          e.exploded = true; e.boomT = 0;
          sfx.asteroid(); shakeCamera(0.9);
          particles.burst(e.x, 0.8, e.z, 0xff6b35, 30, 2);
          particles.burst(e.x, 0.8, e.z, 0xffd700, 20, 1.6);
          particles.burst(e.x, 0.5, e.z, 0x5a3a28, 16, 1.4);
          m.rockGroup.visible = false; m.ring.visible = false; m.disc.visible = false;
          m.boom.visible = true; m.core.visible = true;
          m.light.intensity = 90;
        }
      }
      if (e.exploded) {
        e.boomT += dtMs;
        const bt = e.boomT / 600;
        m.boom.scale.setScalar(1 + bt * 8); m.boom.material.opacity = 0.9 * (1 - bt);
        m.core.scale.setScalar(0.6 + bt * 4); m.core.material.opacity = 0.95 * (1 - bt);
        m.light.intensity = 90 * (1 - bt);
        if (e.boomT < 300 && invulnTimer <= 0) {
          const dx = truck.x - e.x, dz = truck.z - e.z;
          if (Math.sqrt(dx * dx + dz * dz) < 3.8) { hitTruck('asteroid'); if (state !== STATE.PLAYING) break; }
        }
        if (e.boomT > 600) { removeEntityAt(i); continue; }
      }
      e.group.position.set(e.x, 0, e.z);
      if (e.z > DESPAWN_Z) removeEntityAt(i);
      continue;
    }

    if (e.type === 'thief') {
      const k = THIEF[e.kind];
      const legsRun = (rate, amp) => {
        e.phase += dt * rate;
        const a = Math.sin(e.phase) * amp;
        if (m.legs.length === 4) { m.legs[0].rotation.x = a; m.legs[3].rotation.x = a; m.legs[1].rotation.x = -a; m.legs[2].rotation.x = -a; }
      };
      if (e.state === 'approach') {
        e.z += (speed + (e.kind === 'monster' ? 2.5 : 0)) * dt;
        if (!e.walking && e.z >= e.triggerZ) e.walking = true;
        if (e.walking) {
          const maxVx = k.maxVx * diff.crosserSpeed;
          const dx = truck.x - e.x;
          if (e.z < truck.z + 2) e.vx = Math.abs(dx) < 0.25 ? 0 : Math.sign(dx) * Math.min(maxVx, Math.abs(dx) * 4);  // home in on our lane
          else e.vx = e.dir * maxVx;                                                                                // missed us: keep crossing
          e.x += e.vx * dt;
          e.group.rotation.y = e.vx > 0.3 ? -Math.PI / 2 : e.vx < -0.3 ? Math.PI / 2 : Math.PI;
          if (Math.abs(e.vx) > 0.3 || e.kind === 'monster') legsRun(e.kind === 'skunk' ? 9 : 16, 0.8);
        }
        e.soundT -= dt;
        if (e.soundT <= 0) { e.soundT = rand(2.5, 5); if (e.z > -70) k.sound(); }
        if (e.kind === 'skunk' && m.tail) m.tail.rotation.x = -1.1 + Math.sin(t * 3) * 0.15;
        if (invulnTimer <= 0 && overlapsTruck(e)) {
          if (lives > 1) stealHearts(e); else bonkThief(e);
        }
      } else if (e.state === 'flee') {
        e.fleeT += dt;
        const escaping = e.fleeT > diff.chaseTime;
        e.z -= (escaping ? 28 : diff.thiefRecede) * dt;
        if (!escaping && e.z < THIEF_MIN_Z) e.z = THIEF_MIN_Z;
        e.x = Math.max(-4.3, Math.min(4.3, e.fleeX0 + Math.sin(e.fleeT * k.zig) * k.zigAmp));
        e.group.rotation.y = -Math.cos(e.fleeT * k.zig) * 0.7;   // facing away, leaning into the zig-zag
        legsRun(e.kind === 'skunk' ? 12 : 20, 0.9);
        if (e.markers) { e.markers.position.y = k.markerY + Math.sin(t * 5) * 0.12; e.markers.rotation.y = t * 2.5; }
        if (e.z < truck.z - 80) { thiefEscaped(e); removeEntityAt(i); continue; }
        if (e.fleeT > 0.8 && overlapsTruck(e, 1.1)) recoverHearts(e);   // short grace so the shove plays out first
      } else {   // caught or bonked: scurry off sideways
        e.z += speed * dt;
        e.x += e.vx * dt;
        e.group.rotation.y = e.vx > 0 ? -Math.PI / 2 : Math.PI / 2;
        legsRun(20, 0.9);
      }
      if (e.kind === 'monster') {
        const bob = Math.abs(Math.sin(e.phase * 0.5));
        m.body.position.y = bob * 0.18; m.body.scale.set(1 + bob * 0.04, 1 - bob * 0.06, 1 + bob * 0.04);
      }
      e.group.position.set(e.x, 0, e.z);
      if (e.state !== 'flee' && (Math.abs(e.x) > 30 || e.z > DESPAWN_Z)) { removeEntityAt(i); continue; }
      continue;
    }

    if (e.type === 'frog') {
      e.z += speed * dt;
      if (!e.walking && e.z >= e.triggerZ) e.walking = true;
      let hopY = 0;
      const body = m.body;
      if (e.walking) {
        e.hopTimer += dtMs;
        if (e.hopState === 'wait') {
          const squash = Math.min(1, e.hopTimer / e.hopWaitDuration);
          body.scale.set(1 + squash * 0.1, 1 - squash * 0.15, 1 + squash * 0.1);
          if (e.hopTimer >= e.hopWaitDuration) {
            e.hopTimer = 0; e.hopState = 'hop'; e.hopProgress = 0;
            e.hopFromX = e.x; e.hopToX = e.x + rand(1.4, 2.6) * diff.crosserSpeed * e.hopDir;
            e.hopFromZ = e.hopOffZ; e.hopToZ = e.hopOffZ + (Math.random() < 0.4 ? rand(-0.7, 0.7) : 0);
            if (Math.random() < 0.15) sfx.ribbit();
          }
        } else {
          e.hopProgress = Math.min(1, e.hopTimer / e.hopDuration);
          const hp = e.hopProgress, s = Math.sin(hp * Math.PI);
          e.x = e.hopFromX + (e.hopToX - e.hopFromX) * hp;
          const newOff = e.hopFromZ + (e.hopToZ - e.hopFromZ) * hp;
          e.z += newOff - e.hopOffZ; e.hopOffZ = newOff;
          hopY = s * 0.9;
          body.scale.set(1 - s * 0.1, 1 + s * 0.25, 1 - s * 0.1);
          if (hp >= 1) { e.hopState = 'wait'; e.hopTimer = 0; e.hopWaitDuration = rand(180, 380); }
        }
      }
      e.group.position.set(e.x, hopY, e.z);
      if (Math.abs(e.x) > 30 || e.z > DESPAWN_Z) { removeEntityAt(i); continue; }
      if (invulnTimer <= 0 && overlapsTruck(e)) {
        hitTruck('frog'); sfx.crash();
        if (state !== STATE.PLAYING) break;
        particles.burst(e.x, 0.6, e.z, 0x7cfc00, 18, 1.2);
        removeEntityAt(i);
      }
      continue;
    }

    // ---- everything else ----
    if (e.type === 'car') {
      e.z += (speed + e.rel) * dt;
      const w = (speed + e.rel) / 0.36 * dt;
      for (const wh of m.wheels) wh.rotation.x += e.onComing ? -w : w;
      if (m.hover) { e.bob += dt * 3; e.y = m.hover + Math.sin(e.bob) * 0.12; e.group.rotation.z = Math.sin(e.bob * 0.7) * 0.04; }
      if (Math.random() < dt * 0.05) sfx.honk();
    } else if (e.type === 'person' || e.type === 'alien' || e.type === 'dog' || e.type === 'chicken') {
      e.z += speed * dt;
      if (!e.walking && e.z >= e.triggerZ) e.walking = true;
      if (e.walking) e.x += e.vx * dt;
      if (e.type === 'person' || e.type === 'alien') {
        if (e.walking) e.walkPhase += dt * 9; else e.walkPhase += dt * 1.5;
        const sw = e.walking ? Math.sin(e.walkPhase) * 0.7 : Math.sin(e.walkPhase) * 0.06;
        m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
        m.arms[0].rotation.x = -sw * 0.8; m.arms[1].rotation.x = sw * 0.8;
        if (e.type === 'alien') { e.float += dt * 4; e.y = 0.15 + Math.sin(e.float) * 0.12; }
      } else if (e.type === 'dog') {
        if (e.walking) {
          e.runPhase += dt * 16;
          const a = Math.sin(e.runPhase) * 0.9;
          m.legs[0].rotation.x = a; m.legs[3].rotation.x = a; m.legs[1].rotation.x = -a; m.legs[2].rotation.x = -a;
          e.y = Math.abs(Math.sin(e.runPhase)) * 0.1;
        }
      } else {
        if (e.walking) e.walkPhase += dt * 12;
        e.headBob += dt * (e.walking ? 14 : 3);
        const a = e.walking ? Math.sin(e.walkPhase) * 0.8 : 0;
        m.legs[0].rotation.x = a; m.legs[1].rotation.x = -a;
        m.head.position.z = -0.27 - Math.max(0, Math.sin(e.headBob)) * 0.08;
        m.head.position.y = 0.74 - Math.max(0, Math.sin(e.headBob)) * 0.04;
        e.cluckTimer -= dtMs;
        if (e.cluckTimer <= 0) { e.cluckTimer = rand(1500, 3500); if (Math.random() < 0.5) sfx.cluck(); }
      }
    } else if (e.type === 'ufo') {
      e.x += e.vx * dt;
      e.bobPhase += dt * 2.5; e.spin += dt * 1.4;
      e.y = 3.4 + Math.sin(e.bobPhase) * 0.35;
      e.group.rotation.y = e.spin;
      m.beam.scale.y = e.y; m.beam.position.y = -e.y / 2 - 0.1;
      const blink = Math.floor(t * 6) % 2;
      for (let k = 0; k < m.lights.length; k++) m.lights[k].material = m.lightMats[(k + blink) % 2];
      m.beam.material.opacity = 0.14 + Math.sin(t * 7) * 0.04;
    } else if (e.type === 'garbage') {
      e.z += speed * dt;
    } else if (e.type === 'star') {
      e.z += speed * dt;
      e.rotation += dt * 2.2; e.pulse += dt * 5;
      m.mesh.rotation.y = e.rotation;
      e.y = 1.0 + Math.sin(e.pulse) * 0.12;
      const ps = 1 + Math.sin(e.pulse) * 0.08; m.mesh.scale.setScalar(ps);
    } else if (e.type === 'heart') {
      e.z += speed * dt;
      e.pulse += dt * 7; e.bob += dt * 4;
      e.y = 1.1 + Math.sin(e.bob) * 0.15;
      m.mesh.rotation.y += dt * 1.6;
      const ps = 1 + Math.sin(e.pulse) * 0.12; m.mesh.scale.setScalar(ps);
    }

    e.group.position.set(e.x, e.y, e.z);

    if (e.z > DESPAWN_Z || Math.abs(e.x) > 40) { removeEntityAt(i); continue; }

    const dangerous = e.type === 'car' || e.type === 'person' || e.type === 'alien' || e.type === 'dog' || e.type === 'chicken' || e.type === 'ufo';
    if (invulnTimer > 0 && dangerous) continue;

    if (overlapsTruck(e)) {
      if (e.type === 'garbage') {
        score += 10; bagsCollected++;
        sfx.pickup(); particles.burst(e.x, 0.8, e.z, 0x27ae60, 14, 1.1);
        spawnFloater(e.x, 1.6, e.z, '+10', '#27ae60');
        removeEntityAt(i); updateUI();
      } else if (e.type === 'star') {
        score += 50;
        sfx.bonus(); particles.burst(e.x, 1.2, e.z, 0xffd700, 26, 1.4);
        spawnFloater(e.x, 2.0, e.z, '+50 ⭐', '#ffd700');
        removeEntityAt(i); updateUI();
      } else if (e.type === 'heart') {
        if (lives < diff.maxLives) lives++;
        score += 25;
        sfx.heart(); particles.burst(e.x, 1.2, e.z, 0xff4081, 22, 1.3);
        spawnFloater(e.x, 2.0, e.z, '+❤️ Life!', '#ff4081');
        removeEntityAt(i); updateUI();
      } else {
        hitTruck(e.type); sfx.crash();
        if (state !== STATE.PLAYING) break;
        let pColor = 0xe74c3c;
        if (e.type === 'chicken') pColor = 0xffffff;
        if (e.type === 'alien') pColor = e.bodyColor;
        if (e.type === 'ufo') pColor = 0x9b59b6;
        if (e.type === 'car') pColor = e.color;
        particles.burst(e.x, 1.0, e.z, pColor, 20, 1.4);
        removeEntityAt(i);
      }
    }
  }

  particles.update(dt);
  updateCamera(dt);
}

// ---- Loop ----
let dbgFrames = 0, dbgAccum = 0;
function loop(tms) {
  const dt = Math.min(0.05, (tms - lastTime) / 1000 || 0.016);
  lastTime = tms;
  update(dt);
  renderer.render(scene, camera);
  if (DEBUG) {
    dbgFrames++; dbgAccum += dt;
    if (dbgAccum >= 0.5) {
      const r = renderer.info.render;
      debugEl.textContent = `${Math.round(dbgFrames / dbgAccum)} fps · ${entities.length} ents · ${r.calls} calls · ${(r.triangles / 1000).toFixed(0)}k tris · truck ${truck.x.toFixed(1)},${truck.z.toFixed(1)}`;
      dbgFrames = 0; dbgAccum = 0;
    }
  }
  requestAnimationFrame(loop);
}

// ---- Pause ----
function pauseGame() {
  if (state !== STATE.PLAYING || paused) return;
  paused = true;
  for (const k in keys) keys[k] = false;
  document.querySelectorAll('.ctrl-btn.pressed').forEach(b => b.classList.remove('pressed'));
  pauseScreen.classList.remove('hidden');
  pauseBtn.textContent = '▶';
  pauseBtn.setAttribute('aria-label', 'Resume');
}
function resumeGame() {
  if (!paused) return;
  paused = false;
  pauseScreen.classList.add('hidden');
  pauseBtn.textContent = '⏸';
  pauseBtn.setAttribute('aria-label', 'Pause');
  resumeAudio();
}
function togglePause() { paused ? resumeGame() : pauseGame(); }

pauseBtn.addEventListener('click', togglePause);
resumeBtn.addEventListener('click', resumeGame);
restartBtn.addEventListener('click', () => { resumeGame(); startGame(); });
window.addEventListener('keydown', e => {
  if (state !== STATE.PLAYING) return;
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { e.preventDefault(); togglePause(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === STATE.PLAYING && !paused) pauseGame();
});

startBtn.addEventListener('click', startGame);
playAgainBtn.addEventListener('click', startGame);

// ---- Boot ----
applyPlanetVisuals();
camera.position.copy(camPos);
camera.lookAt(0, 1.3, -22);
// a ?mode= link also becomes the remembered choice, so a parent can set it up once
selectDifficulty(diff.key, PARAMS.get('mode') in DIFFICULTIES);
if (DEBUG) {
  // Test hook: step the simulation synchronously (independent of requestAnimationFrame)
  window.__ctg = {
    start: () => startGame(),
    press: (key, down = true) => { keys[key] = down; },
    step: (ms, stepMs = 16) => {
      resumeGame();
      for (let left = ms; left > 0; left -= stepMs) update(Math.min(left, stepMs) / 1000);
      renderer.render(scene, camera);
    },
    snapshot: () => ({
      state, lives, score, stolenOutstanding, level, invuln: Math.round(invulnTimer), truck: { x: +truck.x.toFixed(2), z: +truck.z.toFixed(2) },
      entities: entities.map(e => ({ type: e.type, kind: e.kind, state: e.state, stolen: e.stolen, x: +e.x.toFixed(1), z: +e.z.toFixed(1) }))
    })
  };
}
startBtn.disabled = false;
startBtn.textContent = '▶ Blast Off!';
requestAnimationFrame(loop);

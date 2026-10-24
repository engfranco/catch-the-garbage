// The environment: sky, lights, ground strips and recycling scenery.
import * as THREE from '../lib/three.module.min.js';
import { ROAD_HALF, SIDEWALK_W, SIDEWALK_OUT, YARD_OUT, HOUSE_X, STRIP_Z_NEAR, STRIP_Z_FAR, MOBILE } from './config.js';
import { groundTexture, sidewalkTexture, roadTexture, planetTexture, ringTexture, glowTexture } from './textures.js';
import { buildHouse, buildDeco, buildLamp, disposeMerged, G, part, rand } from './models.js';

const SCENERY_FAR = -190;   // scenery wraps between these two z values
const SCENERY_NEAR = 36;
const HOUSE_SPACING = MOBILE ? 20 : 18;
const DECO_SPACING = MOBILE ? 11 : 9;
const FAR_DECO_SPACING = MOBILE ? 10 : 7;
const LAMP_SPACING = 30;

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = wp.xyz - cameraPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAG = (withOutput) => `
  uniform vec3 topColor; uniform vec3 bottomColor; uniform float exponent;
  varying vec3 vDir;
  void main() {
    float h = normalize(vDir).y;
    float t = pow(max(h, 0.0), exponent);
    gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
    ${withOutput ? '#include <tonemapping_fragment>\n#include <colorspace_fragment>' : ''}
  }`;

function makeSkyMaterial(withOutput) {
  return new THREE.ShaderMaterial({
    uniforms: { topColor: { value: new THREE.Color('#2f6fd0') }, bottomColor: { value: new THREE.Color('#cfe3f3') }, exponent: { value: 0.6 } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG(withOutput),
    side: THREE.BackSide, depthWrite: false, fog: false
  });
}

// Rewrite RingGeometry UVs so u runs across the ring radius (for banded ring textures)
function radialRing(inner, outer, segments) {
  const g = new THREE.RingGeometry(inner, outer, segments, 1);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const v = new THREE.Vector2();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i));
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;
  return g;
}

export class World {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.planet = null; this.night = false;
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.time = 0;

    // ---- Sky group follows the camera ----
    this.skyGroup = new THREE.Group();
    scene.add(this.skyGroup);
    this.skyMat = makeSkyMaterial(true);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.skyGroup.add(this.sky);

    // stars
    const starCount = 900;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random(), v = Math.random();
      const theta = u * Math.PI * 2, phi = Math.acos(1 - v);          // upper hemisphere, more near zenith
      const r = 640;
      sp[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      sp[i * 3 + 1] = Math.max(8, r * Math.cos(phi) * 0.95);
      sp[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.skyGroup.add(this.stars);

    // sun disc
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff1d8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sunSprite.scale.set(140, 140, 1);
    this.skyGroup.add(this.sunSprite);

    // big planet (sphere + optional ring) and the Saturn sky arc
    this.bigPlanet = new THREE.Group();
    this.bigSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, fog: false }));
    this.bigSphere.material.envMapIntensity = 0;
    this.bigPlanet.add(this.bigSphere);
    this.bigRing = new THREE.Mesh(radialRing(1.35, 2.35, 96), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    this.bigRing.rotation.x = Math.PI / 2 - 0.45;
    this.bigPlanet.add(this.bigRing);
    this.skyGroup.add(this.bigPlanet);
    this.skyArc = new THREE.Mesh(radialRing(1, 1.42, 160), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false, depthWrite: false }));
    this.skyArc.scale.setScalar(340);
    this.skyArc.position.set(0, -150, -40);
    this.skyArc.rotation.set(-Math.PI / 2 + 0.62, 0, 0.1);
    this.skyGroup.add(this.skyArc);

    // ---- Lights ----
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const S = MOBILE ? 1024 : 2048;
    this.sun.shadow.mapSize.set(S, S);
    const sc = this.sun.shadow.camera;
    sc.left = -44; sc.right = 44; sc.top = 44; sc.bottom = -44; sc.near = 10; sc.far = 320;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.target.position.set(0, 0, -30);
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x8fbfe8, 0x5e9a3c, 0.4);
    scene.add(this.hemi);

    // ---- Environment scene for reflections (rendered into a PMREM once per planet) ----
    this.envScene = new THREE.Scene();
    this.envSkyMat = makeSkyMaterial(false);
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(700, 24, 12), this.envSkyMat));
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshBasicMaterial({ color: 0x5e9a3c }));
    this.envGround.rotation.x = -Math.PI / 2; this.envGround.position.y = -3;
    this.envScene.add(this.envGround);
    this.envSun = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 5.5) }));
    this.envScene.add(this.envSun);

    // ---- Ground strips ----
    const len = STRIP_Z_NEAR - STRIP_Z_FAR, zc = (STRIP_Z_NEAR + STRIP_Z_FAR) / 2;
    const yardW = YARD_OUT - SIDEWALK_OUT;
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    this.sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    this.roadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 });
    const strip = (w, x, material) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), material);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0, zc); m.receiveShadow = true;
      scene.add(m); return m;
    };
    strip(yardW, -(SIDEWALK_OUT + yardW / 2), this.groundMat);
    strip(yardW, (SIDEWALK_OUT + yardW / 2), this.groundMat);
    strip(SIDEWALK_W, -(ROAD_HALF + SIDEWALK_W / 2), this.sidewalkMat);
    strip(SIDEWALK_W, (ROAD_HALF + SIDEWALK_W / 2), this.sidewalkMat);
    strip(ROAD_HALF * 2, 0, this.roadMat);
    this.curbMat = new THREE.MeshStandardMaterial({ color: 0xa09e98, roughness: 0.9 });
    for (const s of [-1, 1]) {
      const curb = part(G.box, this.curbMat, { x: s * (ROAD_HALF + 0.12), y: 0.06, z: zc, sx: 0.26, sy: 0.12, sz: len, cast: false });
      scene.add(curb);
    }
    this.stripLen = len;

    // ---- Scenery pools ----
    this.houses = []; this.decos = []; this.lamps = [];
    const span = SCENERY_NEAR - SCENERY_FAR;
    for (let z = SCENERY_NEAR; z > SCENERY_FAR; z -= HOUSE_SPACING) {
      for (const side of [-1, 1]) this.houses.push({ side, z: z + rand(-1.5, 1.5), obj: null, anim: [] });
    }
    for (let z = SCENERY_NEAR; z > SCENERY_FAR; z -= DECO_SPACING) {
      for (const side of [-1, 1]) this.decos.push({ side, z: z + rand(-3, 3), far: false, obj: null, x: 0, active: true });
    }
    for (let z = SCENERY_NEAR; z > SCENERY_FAR; z -= FAR_DECO_SPACING) {
      for (const side of [-1, 1]) this.decos.push({ side, z: z + rand(-3, 3), far: true, obj: null, x: 0, active: true });
    }
    let lampSide = -1;
    for (let z = SCENERY_NEAR; z > SCENERY_FAR; z -= LAMP_SPACING) {
      this.lamps.push({ side: lampSide, z, obj: null }); lampSide = -lampSide;
    }
    this.span = span;
  }

  // ---- Switch everything to a planet's look ----
  applyPlanet(planet) {
    this.planet = planet; this.night = planet.night;
    const scene = this.scene;

    // sky + fog
    this.skyMat.uniforms.topColor.value.set(planet.skyTop);
    this.skyMat.uniforms.bottomColor.value.set(planet.skyHorizon);
    this.skyMat.uniforms.exponent.value = planet.skyExponent;
    this.envSkyMat.uniforms.topColor.value.set(planet.skyTop);
    this.envSkyMat.uniforms.bottomColor.value.set(planet.skyHorizon);
    this.envSkyMat.uniforms.exponent.value = planet.skyExponent;
    if (!scene.fog) scene.fog = new THREE.Fog(planet.skyHorizon, 45, 150);
    scene.fog.color.set(planet.skyHorizon);
    scene.fog.near = MOBILE ? 45 : 55; scene.fog.far = MOBILE ? 140 : 175;
    this.stars.visible = planet.stars;
    this.starMat.opacity = planet.night ? 0.95 : 0.5;

    // sun
    const d = new THREE.Vector3(...planet.sun.dir).normalize();
    this.sun.color.set(planet.sun.color);
    this.sun.intensity = planet.sun.intensity;
    this.sun.position.copy(d).multiplyScalar(130).add(this.sun.target.position);
    this.sunSprite.position.copy(d).multiplyScalar(620);
    this.sunSprite.material.color.set(planet.sun.color);
    this.sunSprite.scale.setScalar(planet.night ? 70 : 150);
    this.envSun.position.copy(d).multiplyScalar(600);
    this.hemi.color.set(planet.hemi.sky); this.hemi.groundColor.set(planet.hemi.ground); this.hemi.intensity = planet.hemi.intensity;
    this.envGround.material.color.set(planet.ground);

    // environment map for reflections / ambient
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.04, 1, 2000);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = planet.envIntensity;

    // big planet in the sky
    if (planet.bigPlanet) {
      const bp = planet.bigPlanet;
      this.bigPlanet.visible = true;
      this.bigPlanet.position.set(...bp.pos);
      this.bigPlanet.scale.setScalar(bp.radius);
      this.bigSphere.material.map = planetTexture(bp.kind);
      this.bigSphere.material.needsUpdate = true;
      this.bigSphere.rotation.y = Math.random() * Math.PI * 2;
      this.bigRing.visible = bp.kind === 'saturn';
    } else {
      this.bigPlanet.visible = false;
    }
    this.skyArc.visible = !!planet.rings;

    // ground textures
    this.groundMat.map = groundTexture(planet, this.aniso);
    this.groundMat.map.repeat.set((YARD_OUT - SIDEWALK_OUT) / 8, this.stripLen / 8);
    this.groundMat.roughness = planet.groundStyle === 'ice' ? 0.35 : 0.95;
    this.groundMat.needsUpdate = true;
    this.sidewalkMat.map = sidewalkTexture(planet, this.aniso);
    this.sidewalkMat.map.repeat.set(1, this.stripLen / 2.5);
    this.sidewalkMat.needsUpdate = true;
    this.roadMat.map = roadTexture(planet, this.aniso);
    this.roadMat.map.repeat.set(1, this.stripLen / 7.5);
    this.roadMat.roughness = planet.groundStyle === 'ice' ? 0.5 : 0.85;
    this.roadMat.needsUpdate = true;
    this.curbMat.color.set(planet.sidewalk).multiplyScalar(0.8);

    // rebuild all scenery in the new style
    for (const h of this.houses) this.rebuildHouse(h);
    for (const d of this.decos) this.rebuildDeco(d);
    for (const l of this.lamps) this.rebuildLamp(l);
  }

  rebuildHouse(h) {
    if (h.obj) { disposeMerged(h.obj); this.scene.remove(h.obj); }
    const built = buildHouse(this.planet.houseStyle, this.night, HOUSE_X - SIDEWALK_OUT);
    h.obj = built.group; h.anim = built.anim;
    h.obj.position.set(h.side * HOUSE_X, 0, h.z);
    h.obj.rotation.y = h.side < 0 ? -Math.PI / 2 : Math.PI / 2;
    this.scene.add(h.obj);
  }
  rebuildDeco(d) {
    if (d.obj) { disposeMerged(d.obj); this.scene.remove(d.obj); }
    d.active = Math.random() < (d.far ? 0.85 : 0.7);
    if (!d.active) { d.obj = null; return; }
    let x, scale = 1;
    if (d.far) { x = rand(32, 75); }
    else if (Math.random() < 0.3) { x = rand(8.3, 9.1); scale = 0.45; }
    else { x = rand(16.5, 26); }
    const built = buildDeco(this.planet.decoStyle, this.planet.name, d.far);
    d.obj = built.group; d.x = d.side * x;
    d.obj.scale.setScalar(scale);
    d.obj.position.set(d.x, 0, d.z);
    this.scene.add(d.obj);
  }
  rebuildLamp(l) {
    if (l.obj) { disposeMerged(l.obj); this.scene.remove(l.obj); }
    const built = buildLamp(this.night);
    l.obj = built.group;
    l.obj.position.set(l.side * (SIDEWALK_OUT - 0.35), 0, l.z);
    l.obj.rotation.y = l.side < 0 ? 0 : Math.PI;
    this.scene.add(l.obj);
  }

  // ---- Per-frame: scroll the ground, move & recycle scenery ----
  update(dt, speed, t) {
    const dz = speed * dt;
    this.time = t;
    if (this.groundMat.map) this.groundMat.map.offset.y += dz / 8;
    if (this.sidewalkMat.map) this.sidewalkMat.map.offset.y += dz / 2.5;
    if (this.roadMat.map) this.roadMat.map.offset.y += dz / 7.5;

    for (const h of this.houses) {
      h.z += dz;
      if (h.z > SCENERY_NEAR) { h.z -= this.span; this.rebuildHouse(h); }
      else h.obj.position.z = h.z;
      for (const fn of h.anim) fn(t);
    }
    for (const d of this.decos) {
      d.z += dz;
      if (d.z > SCENERY_NEAR) { d.z -= this.span; this.rebuildDeco(d); }
      else if (d.obj) d.obj.position.z = d.z;
    }
    for (const l of this.lamps) {
      l.z += dz;
      if (l.z > SCENERY_NEAR) { l.z -= this.span; this.rebuildLamp(l); }
      else l.obj.position.z = l.z;
    }
    this.skyGroup.position.copy(this.camera.position);
    if (this.stars.visible) this.starMat.opacity = (this.planet.night ? 0.85 : 0.45) + Math.sin(t * 2.1) * 0.1;
    if (this.bigPlanet.visible) this.bigSphere.rotation.y += dt * 0.01;
  }
}

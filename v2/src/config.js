// ---- World layout (units are roughly metres) ----
export const ROAD_HALF = 5;                       // road is 10 units wide, two lanes
export const SIDEWALK_W = 2.5;
export const SIDEWALK_OUT = ROAD_HALF + SIDEWALK_W; // 7.5 → outer edge of the sidewalk
export const YARD_OUT = 120;                      // how far the yards extend sideways
export const HOUSE_X = 12.5;                      // centre line of the houses
export const STRIP_Z_NEAR = 40;                   // ground strips span this z range
export const STRIP_Z_FAR = -280;
export const SPAWN_Z = -130;                      // where new things appear
export const DESPAWN_Z = 24;                      // where they are removed (behind the camera)
export const LEVEL_DURATION = 22000;              // ms per planet

export const MOBILE = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

// ---- Difficulty profiles ----
// Every knob that makes the game harder lives here. The start screen lets the
// player pick one; the choice is remembered between sessions.
export const DIFFICULTIES = {
  easy: {
    key: 'easy', name: 'Sunday Drive', emoji: '🌱',
    lives: 5, maxLives: 7,
    baseSpeed: 11, speedPerLevel: 1.3,      // world speed = baseSpeed + level * speedPerLevel
    hazardRate: 1.9,                        // multiplier on the time between cars / animals / people
    pickupRate: 0.8, heartRate: 0.6,        // trash & stars a bit more often, hearts much more often
    asteroidRate: 2.4, ufoRate: 1.8,
    sameLaneChance: 0.15,                   // share of cars driving in our lane (the sneaky ones)
    trafficSpeed: 0.7, crosserSpeed: 0.7,   // oncoming traffic and road-crossers move slower
    invuln: 3000,                           // ms of safety after a hit
    levelDuration: 30000, levelRamp: 0.07,  // slower planet changes, gentler ramp-up
    asteroidAhead: [-38, -16],              // asteroids land this far ahead of the truck
    thiefRate: 1.7, chaseTime: 12,          // thieves are rarer and you get longer to catch them
    thiefRecede: 1.3, monsterMinLevel: 3    // how fast a fleeing thief pulls away; trash monsters appear from this level
  },
  medium: {
    key: 'medium', name: 'Regular Route', emoji: '🚛',
    lives: 3, maxLives: 5,
    baseSpeed: 16, speedPerLevel: 2.2,
    hazardRate: 1, pickupRate: 1, heartRate: 1, asteroidRate: 1, ufoRate: 1,
    sameLaneChance: 0.3, trafficSpeed: 1, crosserSpeed: 1,
    invuln: 2000, levelDuration: 22000, levelRamp: 0.13,
    asteroidAhead: [-30, -8],
    thiefRate: 1, chaseTime: 9, thiefRecede: 2.0, monsterMinLevel: 2
  },
  hard: {
    key: 'hard', name: 'Rush Hour', emoji: '🔥',
    lives: 3, maxLives: 5,
    baseSpeed: 19, speedPerLevel: 2.8,
    hazardRate: 0.72, pickupRate: 1, heartRate: 1.5, asteroidRate: 0.8, ufoRate: 0.8,
    sameLaneChance: 0.35, trafficSpeed: 1.25, crosserSpeed: 1.25,
    invuln: 1500, levelDuration: 18000, levelRamp: 0.17,
    asteroidAhead: [-26, -6],
    thiefRate: 0.75, chaseTime: 7, thiefRecede: 2.8, monsterMinLevel: 1
  }
};

// ---- Planets ----
// Each planet describes its sky, lighting, ground materials and which
// building / vehicle / pedestrian styles are used on it.
export const PLANETS = [
  {
    name: 'Earth', emoji: '🌍',
    skyTop: '#2158b8', skyHorizon: '#b9d3ea', skyExponent: 0.35,
    sun: { color: '#fff1d8', intensity: 2.6, dir: [-0.55, 0.75, -0.35] },
    hemi: { sky: '#8fbfe8', ground: '#5e9a3c', intensity: 0.35 },
    envIntensity: 0.55,
    ground: '#5e9a3c', sidewalk: '#b9b8b3', road: '#3a3d42', divider: '#f2c230', edgeLine: '#e8e8e8',
    groundStyle: 'grass', stars: false, night: false,
    houseStyle: 'house', carStyle: 'car', pedStyle: 'person', allowAliens: false, decoStyle: 'tree',
    bigPlanet: null, rings: false
  },
  {
    name: 'Moon', emoji: '🌕',
    skyTop: '#000004', skyHorizon: '#0c0c1e', skyExponent: 0.9,
    sun: { color: '#ffffff', intensity: 3.0, dir: [-0.6, 0.6, -0.5] },
    hemi: { sky: '#141428', ground: '#2a2a2a', intensity: 0.25 },
    envIntensity: 0.3,
    ground: '#8d8d8d', sidewalk: '#c6c8ca', road: '#4a4a4e', divider: '#ffffff', edgeLine: '#ffffff',
    groundStyle: 'regolith', stars: true, night: true,
    houseStyle: 'dome', carStyle: 'rover', pedStyle: 'astronaut', allowAliens: false, decoStyle: 'rock',
    bigPlanet: { kind: 'earth', radius: 38, pos: [190, 170, -460] }, rings: false
  },
  {
    name: 'Mars', emoji: '🔴',
    skyTop: '#4a1a0c', skyHorizon: '#cf8d66', skyExponent: 0.6,
    sun: { color: '#ffd3a8', intensity: 2.2, dir: [-0.5, 0.7, -0.45] },
    hemi: { sky: '#8a3a1a', ground: '#b5431a', intensity: 0.35 },
    envIntensity: 0.5,
    ground: '#b5431a', sidewalk: '#d99c7a', road: '#5c2f1f', divider: '#f2c230', edgeLine: '#f3d9c6',
    groundStyle: 'dust', stars: false, night: false,
    houseStyle: 'mars', carStyle: 'rover', pedStyle: 'alien', allowAliens: true, decoStyle: 'rock',
    bigPlanet: { kind: 'moon', radius: 14, pos: [-170, 150, -470] }, rings: false
  },
  {
    name: 'Jupiter', emoji: '🪐',
    skyTop: '#4a2c12', skyHorizon: '#d9a26b', skyExponent: 0.6,
    sun: { color: '#ffe2b8', intensity: 2.0, dir: [-0.5, 0.65, -0.5] },
    hemi: { sky: '#a0623a', ground: '#c9955e', intensity: 0.35 },
    envIntensity: 0.5,
    ground: '#c9955e', sidewalk: '#ecd6b5', road: '#5e3f25', divider: '#f2c230', edgeLine: '#f6e6cf',
    groundStyle: 'sand', stars: false, night: false,
    houseStyle: 'space', carStyle: 'spaceship', pedStyle: 'alien', allowAliens: true, decoStyle: 'plant',
    bigPlanet: { kind: 'jupiter', radius: 150, pos: [-160, 70, -500] }, rings: false
  },
  {
    name: 'Saturn', emoji: '🪐',
    skyTop: '#2e2238', skyHorizon: '#a596b0', skyExponent: 0.6,
    sun: { color: '#fff0d8', intensity: 1.9, dir: [-0.55, 0.6, -0.45] },
    hemi: { sky: '#6e5a78', ground: '#c9ad7c', intensity: 0.35 },
    envIntensity: 0.5,
    ground: '#c9ad7c', sidewalk: '#ece0c4', road: '#5a4631', divider: '#f2c230', edgeLine: '#f3ead6',
    groundStyle: 'sand', stars: true, night: false,
    houseStyle: 'space', carStyle: 'spaceship', pedStyle: 'alien', allowAliens: true, decoStyle: 'plant',
    bigPlanet: { kind: 'saturn', radius: 48, pos: [200, 150, -440] }, rings: true
  },
  {
    name: 'Uranus', emoji: '🔵',
    skyTop: '#15404f', skyHorizon: '#a7dbe6', skyExponent: 0.6,
    sun: { color: '#dcf4ff', intensity: 2.0, dir: [-0.5, 0.7, -0.4] },
    hemi: { sky: '#5fb4c8', ground: '#78cfe3', intensity: 0.35 },
    envIntensity: 0.5,
    ground: '#78cfe3', sidewalk: '#d6f1f6', road: '#2f6b78', divider: '#ffffff', edgeLine: '#ffffff',
    groundStyle: 'ice', stars: false, night: false,
    houseStyle: 'ice', carStyle: 'spaceship', pedStyle: 'alien', allowAliens: true, decoStyle: 'crystal',
    bigPlanet: null, rings: false
  },
  {
    name: 'Neptune', emoji: '💙',
    skyTop: '#061233', skyHorizon: '#3f62d6', skyExponent: 0.7,
    sun: { color: '#c8d6ff', intensity: 1.7, dir: [-0.55, 0.6, -0.5] },
    hemi: { sky: '#2c4ec0', ground: '#3b5bea', intensity: 0.3 },
    envIntensity: 0.4,
    ground: '#3b5bea', sidewalk: '#a9bdff', road: '#17224f', divider: '#ffffff', edgeLine: '#ffffff',
    groundStyle: 'ice', stars: true, night: true,
    houseStyle: 'ice', carStyle: 'spaceship', pedStyle: 'alien', allowAliens: true, decoStyle: 'crystal',
    bigPlanet: null, rings: false
  },
  {
    name: 'Pluto', emoji: '🌑',
    skyTop: '#000008', skyHorizon: '#262650', skyExponent: 0.85,
    sun: { color: '#e6e6ff', intensity: 1.6, dir: [-0.6, 0.55, -0.5] },
    hemi: { sky: '#1a1a3e', ground: '#a3a3c2', intensity: 0.25 },
    envIntensity: 0.3,
    ground: '#a3a3c2', sidewalk: '#d5d5e6', road: '#45455f', divider: '#ffffff', edgeLine: '#ffffff',
    groundStyle: 'regolith', stars: true, night: true,
    houseStyle: 'ice', carStyle: 'spaceship', pedStyle: 'alien', allowAliens: true, decoStyle: 'rock',
    bigPlanet: { kind: 'moon', radius: 32, pos: [-150, 180, -450] }, rings: false
  }
];

export function getPlanet(level) {
  return PLANETS[(level - 1) % PLANETS.length];
}

// Urbania — a small low-poly 3D city builder (three.js).
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Builder, GEO, prep, glowMat, rng, pick, STYLES, setStyle, resBuilding, comBuilding, offBuilding, indBuilding, serviceBuilding, windRotor, constructionSite, ruinSite } from './buildings.js';

/* ---------------------------------------------------------------- config */
const N = 44;                       // grid size in tiles
const HALF = N / 2;
const SAVE_KEY = 'urbania-3d-v1';
const MIN_PER_SEC = [0, 6, 18, 48]; // game minutes per real second for each speed

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('es-ES');
const money = (n) => `${fmt(n)} €`;
const signed = (n) => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const I = (x, z) => z * N + x;
const inside = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
const W = (v) => v - HALF + 0.5;
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const hash = (a, b = 0) => rng(a * 7919 + b * 104729 + 17)();

const ZONES = {
  res: { label: 'Vivienda', icon: '🏠', color: '#86c96a', cap: [0, 6, 16, 40], noun: 'habitantes' },
  com: { label: 'Comercio', icon: '🏪', color: '#6aaeea', cap: [0, 6, 14, 30], noun: 'empleos' },
  off: { label: 'Oficinas', icon: '🏢', color: '#a58cef', cap: [0, 10, 26, 60], noun: 'empleos' },
  ind: { label: 'Industria', icon: '🏭', color: '#eec05a', cap: [0, 12, 24, 40], noun: 'empleos' },
};
// fund: budget line that pays the upkeep · radius: coverage for approval · cap: power/water output
// smoke: [radius, strength] for polluters · tourism: base income per day · leisure: counts as "ocio"
const SERVICES = {
  police: { label: 'Comisaría', icon: '🛡️', cost: 3000, upkeep: 600, radius: 9, fund: 'police' },
  fire: { label: 'Bomberos', icon: '🚒', cost: 3000, upkeep: 650, radius: 9, fund: 'fire' },
  health: { label: 'Centro de salud', icon: '🏥', cost: 5000, upkeep: 900, radius: 9, fund: 'health' },
  school: { label: 'Escuela', icon: '🏫', cost: 4000, upkeep: 800, radius: 9, fund: 'school' },
  bus: { label: 'Estación de autobuses', icon: '🚌', cost: 6000, upkeep: 700, radius: 12, fund: 'transport' },
  cityhall: { label: 'Ayuntamiento', icon: '🏛️', cost: 8000, upkeep: 500, fund: 'admin', unique: true },
  park: { label: 'Parque', icon: '⛲', cost: 400, upkeep: 60, radius: 5, fund: 'park', noPower: true },
  plaza: { label: 'Plaza mayor', icon: '🎪', cost: 1500, upkeep: 120, radius: 6, fund: 'leisure', leisure: true, tourism: 150, noPower: true },
  zoo: { label: 'Zoológico', icon: '🦒', cost: 9000, upkeep: 700, radius: 11, fund: 'leisure', leisure: true, tourism: 1100 },
  stadium: { label: 'Estadio', icon: '🏟️', cost: 14000, upkeep: 1000, radius: 12, fund: 'leisure', leisure: true, tourism: 1600 },
  museum: { label: 'Museo', icon: '🖼️', cost: 7000, upkeep: 500, radius: 10, fund: 'leisure', leisure: true, tourism: 700 },
  power: { label: 'Central de gas', icon: '🔥', cost: 6000, upkeep: 500, cap: 140, fund: 'utilities', smoke: [6, 0.6], plant: 'power' },
  coal: { label: 'Central de carbón', icon: '🏭', cost: 4500, upkeep: 350, cap: 240, fund: 'utilities', smoke: [9, 1.2], plant: 'power' },
  solar: { label: 'Parque solar', icon: '☀️', cost: 7000, upkeep: 150, cap: 60, fund: 'utilities', plant: 'power', green: true },
  wind: { label: 'Aerogenerador', icon: '🌬️', cost: 5500, upkeep: 120, cap: 50, fund: 'utilities', plant: 'power', green: true },
  water: { label: 'Torre de agua', icon: '💧', cost: 4000, upkeep: 300, cap: 140, fund: 'utilities', plant: 'water' },
};
const FUNDS = [
  ['police', 'Policía', '🛡️', '#3f6fb5'], ['fire', 'Bomberos', '🚒', '#d24a3a'], ['health', 'Salud', '➕', '#3a9a6a'],
  ['school', 'Educación', '🎓', '#d99a2b'], ['park', 'Parques', '🌳', '#4f9a4f'], ['leisure', 'Ocio y cultura', '🎡', '#b06bd0'],
  ['utilities', 'Energía, agua y limpieza', '⚡', '#b08a4a'], ['roads', 'Calles', '🛣️', '#555'], ['transport', 'Transporte público', '🚌', '#e0a83a'], ['admin', 'Administración', '🏛️', '#8a6f52'],
];

const PARTIES = {
  izquierda: { label: 'Izquierda', name: 'Partido del Pueblo', icon: '🌹', color: '#d33a2f', lean: -1, taxLimit: 16,
    pitch: 'Servicios públicos fuertes, vivienda asequible y medio ambiente. Tus vecinos valoran más los servicios y aguantan impuestos de hasta el 16 %, pero las empresas llegan algo más despacio.' },
  centro: { label: 'Centro', name: 'Unión Vecinal', icon: '🤝', color: '#d99a2b', lean: 0, taxLimit: 14,
    pitch: 'Ni de unos ni de otros: gestión y sentido común. Ganas aprobación con leyes de consenso y pierdes un poco con las muy ideológicas.' },
  derecha: { label: 'Derecha', name: 'Partido del Progreso', icon: '🦅', color: '#3f6fb5', lean: 1, taxLimit: 12,
    pitch: 'Impuestos bajos, empresas y seguridad. Las empresas crecen más rápido, pero tus votantes se enfadan si los impuestos pasan del 12 %.' },
};

// lean: -1 izquierda · 0 consenso · 1 derecha. cost: € al día mientras la ley está en vigor.
const LAWS = [
  { id: 'transporte', icon: '🚌', name: 'Transporte público gratuito', lean: -1, cost: 1200, bonus: 3, effect: '+3 aprobación · 40 % menos coches · 1.200 €/día' },
  { id: 'sanidad', icon: '🩺', name: 'Sanidad universal', lean: -1, cost: 0, bonus: 2, effect: 'Salud llega un 30 % más lejos · su coste sube un 40 % · +2 aprobación' },
  { id: 'educacion', icon: '📚', name: 'Educación gratuita', lean: -1, cost: 0, bonus: 2, effect: 'Más viviendas de nivel 3 · coste de educación +30 % · +2 aprobación' },
  { id: 'alquiler', icon: '🔑', name: 'Alquiler controlado', lean: -1, cost: 0, bonus: 3, effect: 'Más demanda de vivienda · el impuesto de vivienda rinde un 15 % menos · +3 aprobación' },
  { id: 'verde', icon: '🌱', name: 'Pacto verde', lean: -1, cost: 0, bonus: 1, effect: 'Solar y eólica un 40 % más baratas · prohíbe nuevas centrales de carbón · humo −30 %' },
  { id: 'empresas', icon: '💼', name: 'Rebaja fiscal a empresas', lean: 1, cost: 0, bonus: 0, effect: 'Comercio, oficinas e industria crecen un 40 % más rápido · rinden un 20 % menos' },
  { id: 'manodura', icon: '🚓', name: 'Mano dura contra el crimen', lean: 1, cost: 0, bonus: 1, effect: 'La policía llega un 40 % más lejos · su coste sube un 30 %' },
  { id: 'privatizar', icon: '🏷️', name: 'Privatizar servicios', lean: 1, cost: 0, bonus: 0, effect: 'Todos los servicios cuestan un 25 % menos · llegan un 15 % menos lejos' },
  { id: 'industria', icon: '🏗️', name: 'Vía libre a la industria', lean: 1, cost: 0, bonus: 0, effect: 'Industria con un 30 % más de empleos · su humo llega más lejos' },
  { id: 'horarios', icon: '🕘', name: 'Libertad de horarios comerciales', lean: 1, cost: 0, bonus: 0, effect: 'Las tiendas dan un 25 % más de empleo y rinden un 15 % más' },
  { id: 'turismo', icon: '📸', name: 'Plan de turismo', lean: 0, cost: 600, bonus: 0, effect: 'El turismo deja un 60 % más · 600 €/día' },
  { id: 'reciclaje', icon: '♻️', name: 'Reciclaje obligatorio', lean: 0, cost: 0, bonus: 1, effect: 'Humo −40 % · energía y limpieza cuestan un 15 % más · +1 aprobación' },
  { id: 'silencio', icon: '🤫', name: 'Ordenanza del silencio', lean: 0, cost: 0, bonus: 2, effect: 'El comercio crece un 20 % más despacio · +2 aprobación' },
  { id: 'fiestas', icon: '🎉', name: 'Fiestas patronales', lean: 0, cost: 900, bonus: 3, effect: '+3 aprobación · 900 €/día' },
];
const LAW_BY_ID = Object.fromEntries(LAWS.map((l) => [l.id, l]));
const LAW_FEE = 1000;
const ELECTION_EVERY = 10;

const CATEGORIES = [
  { id: 'look', label: 'Mirar', icon: '🖐️', tools: [{ id: 'look' }] },
  { id: 'roads', label: 'Calles', icon: '🛣️', tools: [{ id: 'road', label: 'Calle', icon: '🛣️', mode: 'line', cost: 25, hint: 'Arrastra para trazar. Sobre el río se hace un puente (100 €).' }] },
  { id: 'util', label: 'Energía y agua', icon: '⚡', tools: ['power', 'coal', 'solar', 'wind', 'water'].map((s) => ({ id: s, svc: s, mode: 'one' })) },
  { id: 'zones', label: 'Zonas', icon: '▦', tools: Object.keys(ZONES).map((z) => ({ id: z, zone: z, mode: 'rect', cost: 10, hint: 'Arrastra para marcar. Los edificios crecen solos si hay calle, luz y agua.' })) },
  { id: 'services', label: 'Servicios', icon: '🏛️', tools: ['police', 'fire', 'health', 'school', 'bus', 'cityhall'].map((s) => ({ id: s, svc: s, mode: 'one' })) },
  { id: 'leisure', label: 'Ocio', icon: '🎡', tools: [...['park', 'plaza', 'zoo', 'stadium', 'museum'].map((s) => ({ id: s, svc: s, mode: 'one' })), { id: 'trees', label: 'Árboles', icon: '🌲', mode: 'rect', cost: 15, hint: 'Planta árboles en terreno libre.' }] },
  { id: 'demolish', label: 'Demoler', icon: '🧨', tools: [{ id: 'bulldoze', label: 'Demoler', icon: '🧨', mode: 'rect', cost: 10, hint: 'Arrastra para despejar. 10 € por casilla.' }] },
];
for (const c of CATEGORIES) for (const t of c.tools) {
  if (t.svc) Object.assign(t, { label: SERVICES[t.svc].label, icon: SERVICES[t.svc].icon, cost: SERVICES[t.svc].cost });
  if (t.zone) Object.assign(t, { label: ZONES[t.zone].label, icon: ZONES[t.zone].icon });
}

const NEIGHBOURS = ['Peñaclara', 'Robledal', 'Villarrío', 'San Fermín del Llano', 'Los Almendros', 'Fuentehonda'];
const NAMES = ['Lucía', 'Don Miguel', 'Carmen', 'Javi', 'Rosa', 'Andrés', 'Marta', 'Paco', 'Inés', 'Tomás', 'Aitana', 'Doña Pilar', 'Rubén', 'Nerea', 'Óscar', 'Elena'];

/* ---------------------------------------------------------------- terrain */
const riverZ = (x) => 6.5 + Math.sin(x * 0.16) * 2.6 + Math.sin(x * 0.05 + 1) * 1.6;
const RIVER_W = 1.25;
const WATER = new Uint8Array(N * N);
for (let z = 0; z < N; z++) for (let x = 0; x < N; x++)
  if (Math.abs(z + 0.5 - riverZ(x + 0.5)) < RIVER_W) WATER[I(x, z)] = 1;

function forestNoise(x, z) {
  return Math.sin(x * 0.23 + 1) * Math.cos(z * 0.19) + Math.sin((x - z) * 0.11) * 0.8 + Math.cos(z * 0.07 + x * 0.04) * 0.4;
}
function initialTree(i) {
  const x = i % N, z = (i / N) | 0;
  if (WATER[i]) return false;
  const centre = Math.hypot(x - HALF, z - HALF - 4) < 9;
  if (forestNoise(x, z) > (centre ? 1.5 : 0.8)) return true;
  return hash(i, 3) < (centre ? 0.01 : 0.05);
}

/* ---------------------------------------------------------------- state */
function newState() {
  return {
    name: 'Villanueva', style: 'clasico', money: 60000, minutes: 7 * 60, day: 1, approval: 62, speed: 1,
    taxes: { res: 12, com: 12, off: 12, ind: 12 },
    funding: Object.fromEntries(FUNDS.map(([k]) => [k, 100])),
    party: null, laws: {}, nextElection: 1 + ELECTION_EVERY, terms: 0, history: [],
    loan: null, weather: 'sun', tutorial: 0, tutorialHidden: false, budgetSeen: false, best: 0,
    tiles: Array.from({ length: N * N }, (_, i) => ({ t: 0, z: null, lv: 0, s: null, v: 0, tree: initialTree(i) })),
  };
}
// returns a full state from saved data, or null if it is not a valid save
function fromSave(s) {
  if (!s || !Array.isArray(s.tiles) || s.tiles.length !== N * N) return null;
  const fresh = newState();
  // merge nested settings so saves from older versions pick up new budget lines
  return Object.assign(fresh, s, { funding: { ...fresh.funding, ...s.funding }, taxes: { ...fresh.taxes, ...s.taxes }, laws: { ...s.laws } });
}
function load() {
  try { return fromSave(JSON.parse(localStorage.getItem(SAVE_KEY))) || newState(); } catch { /* corrupt or unavailable storage */ }
  return newState();
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* storage unavailable */ } }
let S = load();
setStyle(S.style);

/* ---------------------------------------------------------------- renderer */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
$('view').append(renderer.domElement);

const scene = new THREE.Scene();
const SKY_DAY = new THREE.Color(0xcfe3ea), SKY_DUSK = new THREE.Color(0xf0b48a), SKY_NIGHT = new THREE.Color(0x2c3a5e), SKY_RAIN = new THREE.Color(0x9aa7ad);
const TOP_DAY = new THREE.Color(0x6fa8dc), TOP_DUSK = new THREE.Color(0x7a6fa8), TOP_NIGHT = new THREE.Color(0x0e1630), TOP_RAIN = new THREE.Color(0x7d8a92);
scene.fog = new THREE.Fog(SKY_DAY.clone(), 75, 170);

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 600);
camera.position.set(24, 30, 34);
const controls = new MapControls(camera, renderer.domElement);
controls.target.set(0, 0, 3);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 7;
controls.maxDistance = 80;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.22;
controls.zoomToCursor = true;
controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
controls.listenToKeyEvents(window);
controls.keyPanSpeed = 18;

const hemi = new THREE.HemisphereLight(0xe6f1ff, 0x6f8a4c, 1.15);
const sun = new THREE.DirectionalLight(0xfff0d4, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.camera.layers.enable(1); // layer 1: invisible cloud shapes that only cast shadows
scene.add(hemi, sun, sun.target);

/* sky dome with a vertical gradient (horizon colour doubles as fog colour) */
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: TOP_DAY.clone() }, horizon: { value: SKY_DAY.clone() } },
  vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.45, h)), 1.0); }',
}));
sky.renderOrder = -1;
scene.add(sky);

/* terrain: flat where you build, rolling hills beyond the edge of the map, flat along the river */
function terrainHeight(x, z) {
  const edge = Math.max(Math.abs(x), Math.abs(z)) - (HALF + 2);
  if (edge <= 0) return 0;
  const rz = riverZ(x + HALF) - HALF, river = clamp((Math.abs(z - rz) - RIVER_W - 1.5) / 6, 0, 1);
  const n = (Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) + Math.sin((x + z) * 0.05) * 0.8 + 1.8) / 3.6;
  return Math.pow(Math.min(edge / 12, 1), 1.5) * (0.8 + n * 5) * river;
}
{
  const G = 220, geo = new THREE.PlaneGeometry(G, G, 140, 140);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(0x93b96c), b = new THREE.Color(0x7aa458), hill = new THREE.Color(0x6f9a52), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = terrainHeight(x, z);
    p.setY(i, h);
    const n = (Math.sin(x * 0.21) * Math.cos(z * 0.17) + 1) / 2 * 0.7 + hash(i, 9) * 0.3;
    c.copy(a).lerp(b, n).lerp(hill, clamp(h / 5, 0, 0.7));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // a ring of distant low-poly mountains, softened by the fog
  const r = rng(77), mat = new THREE.MeshStandardMaterial({ color: 0x7d9a7a, roughness: 1, flatShading: true });
  for (let k = 0; k < 22; k++) {
    const ang = (k / 22) * Math.PI * 2 + r() * 0.2, dist = 95 + r() * 25, hgt = 8 + r() * 14;
    const m = new THREE.Mesh(new THREE.ConeGeometry(10 + r() * 10, hgt, 5 + Math.floor(r() * 3)), mat);
    m.position.set(Math.cos(ang) * dist, hgt / 2 - 1, Math.sin(ang) * dist);
    m.rotation.y = r() * 3;
    scene.add(m);
  }

  const grid = new THREE.GridHelper(N, N, 0x2b2622, 0x2b2622);
  grid.material.transparent = true;
  grid.material.opacity = 0.06;
  grid.position.y = 0.012;
  scene.add(grid);
  scene.userData.grid = grid;
}

/* river: sandy bank + animated water strip following riverZ */
function riverStrip(width, y, material) {
  const pts = [], from = -70, to = N + 70, step = 0.5;
  for (let x = from; x <= to; x += step) {
    const z = riverZ(x), dz = (riverZ(x + 0.01) - z) / 0.01, len = Math.hypot(1, dz);
    const nx = -dz / len, nz = 1 / len;
    pts.push([x - HALF + nx * width, z - HALF + nz * width, x - HALF - nx * width, z - HALF - nz * width]);
  }
  const pos = [], uv = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, bx, bz] = pts[i], [cx, cz, dx, dzz] = pts[i + 1];
    pos.push(ax, y, az, cx, y, cz, bx, y, bz, bx, y, bz, cx, y, cz, dx, y, dzz);
    uv.push(0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
riverStrip(RIVER_W + 0.45, 0.008, new THREE.MeshStandardMaterial({ color: 0xd9caa0, roughness: 1, side: THREE.DoubleSide }));
const waterMat = new THREE.ShaderMaterial({
  fog: true, side: THREE.DoubleSide,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uLight: { value: 1 }, uDeep: { value: new THREE.Color(0x2f6f9f) }, uShallow: { value: new THREE.Color(0x6fb6d8) },
    uSky: { value: new THREE.Color(0xcfe3ea) }, uSun: { value: new THREE.Vector3(0, 1, 0) },
  }]),
  vertexShader: `varying vec2 vUv; varying vec3 vW;
    #include <fog_pars_vertex>
    void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `uniform float uTime; uniform float uLight; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSun;
    varying vec2 vUv; varying vec3 vW;
    #include <fog_pars_fragment>
    void main() {
      float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
      vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.8, across));
      float w1 = sin(vW.x * 2.3 + uTime * 1.1) * cos(vW.z * 3.1 - uTime * 0.8);
      float w2 = sin((vW.x + vW.z) * 5.7 - uTime * 1.9) * 0.5;
      vec3 n = normalize(vec3((w1 + w2) * 0.12, 1.0, (w1 - w2) * 0.12));
      vec3 v = normalize(cameraPosition - vW);
      float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      col = mix(col, uSky, fres * 0.6);
      float spec = pow(max(dot(reflect(-normalize(uSun), n), v), 0.0), 60.0);
      col += vec3(1.0, 0.95, 0.85) * spec * 1.4 * uLight;
      float foam = smoothstep(0.18, 0.0, across) * (0.5 + 0.5 * sin(vW.x * 6.0 + uTime * 2.0 + vW.z * 3.0));
      col = mix(col, vec3(0.92), foam * 0.35);
      gl_FragColor = vec4(col * (0.2 + 0.8 * uLight), 1.0);
      #include <fog_fragment>
    }`,
});
riverStrip(RIVER_W + 0.1, 0.02, waterMat);

/* drifting clouds that only cast soft moving shadows on the city */
const cloudShapes = [];
{
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const r = rng(321);
  for (let k = 0; k < 7; k++) {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + r() * 2.5, 1), mat);
      m.position.set((r() - 0.5) * 6, 0, (r() - 0.5) * 4);
      m.castShadow = true;
      m.layers.set(1);
      g.add(m);
    }
    g.position.set((r() - 0.5) * 80, 16 + r() * 4, (r() - 0.5) * 80);
    scene.add(g);
    cloudShapes.push(g);
  }
}
function updateClouds(dt) {
  for (const g of cloudShapes) {
    g.position.x += dt * (S.speed ? 0.6 + S.speed * 0.3 : 0.15);
    if (g.position.x > 55) g.position.x = -55;
  }
}

/* ---------------------------------------------------------------- post-processing & quality */
// alta: ambient occlusion + bloom + tilt-shift · media: bloom + tilt-shift · baja: plain render
const GFX_KEY = 'urbania-gfx';
const GFX_LEVELS = { alta: 'Alta', media: 'Media', baja: 'Baja' };
let gfx = (() => { try { return localStorage.getItem(GFX_KEY); } catch { return null; } })();
const gfxChosen = !!gfx;
if (!GFX_LEVELS[gfx]) gfx = matchMedia('(pointer: coarse)').matches ? 'media' : 'alta';

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.blendIntensity = 0.85;
gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 12 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.45, 0.92);
composer.addPass(bloom);
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uFocus: { value: 0.5 },
    uBand: { value: 0.16 }, uBlur: { value: 4 }, uSat: { value: 1.08 }, uVig: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uBlur; uniform float uSat; uniform float uVig;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float amt = smoothstep(uBand, uBand + 0.38, abs(vUv.y - uFocus)) * uBlur;
      if (amt > 0.05) {
        vec4 acc = c;
        for (int i = 1; i < 16; i++) {
          float a = float(i) * 2.39996, r = sqrt(float(i) / 16.0);
          acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r * amt / uRes);
        }
        c = acc / 16.0;
      }
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      float d = length((vUv - 0.5) * vec2(1.2, 1.0));
      c.rgb *= mix(1.0, smoothstep(0.95, 0.35, d), uVig);
      gl_FragColor = c;
    }`,
});
composer.addPass(finish);
composer.addPass(new OutputPass());

function applyGfx(level, announce = false) {
  gfx = level;
  const dpr = Math.min(devicePixelRatio, level === 'alta' ? 2 : level === 'media' ? 1.5 : 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  finish.uniforms.uRes.value.set(innerWidth * dpr, innerHeight * dpr);
  gtao.enabled = level === 'alta';
  const size = level === 'baja' ? 1024 : 2048;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  const sel = document.getElementById('gfxSel');
  if (sel) sel.value = level;
  if (announce) news(`Calidad gráfica ajustada a «${GFX_LEVELS[level].toLowerCase()}» para que el juego vaya fluido.`, 'AJUSTES');
}
applyGfx(gfx);

// if frames are consistently slow, step quality down (unless the player picked it)
let perfTime = 0, perfFrames = 0, perfSlow = 0;
function watchPerformance(dt) {
  if (gfxChosen || gfx === 'baja') return;
  perfTime += dt; perfFrames++;
  if (perfTime < 2) return;
  const ms = (perfTime / perfFrames) * 1000;
  perfTime = 0; perfFrames = 0;
  perfSlow = ms > 30 ? perfSlow + 1 : 0;
  if (perfSlow >= 3) { perfSlow = 0; applyGfx(gfx === 'alta' ? 'media' : 'baja', true); }
}

function renderFrame() {
  sky.position.copy(camera.position);
  if (gfx === 'baja') { renderer.render(scene, camera); return; }
  // keep the focus band of the tilt-shift on the point the camera looks at
  const p = controls.target.clone().project(camera);
  finish.uniforms.uFocus.value = clamp(p.y * 0.5 + 0.5, 0.25, 0.75);
  const dist = camera.position.distanceTo(controls.target);
  finish.uniforms.uBlur.value = clamp(9 - dist / 10, 2.5, 7) * renderer.getPixelRatio();
  composer.render();
}

/* ---------------------------------------------------------------- roads */
const isRoad = (x, z) => inside(x, z) && S.tiles[I(x, z)].t === 'road';

// bus stops: straight road tiles picked deterministically, only once there is a bus station.
// Returns the pavement side (index into DIRS) where the shelter stands, or -1.
let busNetwork = false;
function busStopSide(x, z) {
  if (!busNetwork || hash(I(x, z), 7) >= 0.1 || WATER[I(x, z)]) return -1;
  const conn = DIRS.map(([dx, dz]) => isRoad(x + dx, z + dz));
  if (conn.filter(Boolean).length !== 2 || conn[0] !== conn[2]) return -1;
  return conn[0] ? 1 : 0;
}
const isBusStop = (x, z) => busStopSide(x, z) >= 0;

function roadBuilder(x, z) {
  const b = new Builder(), conn = DIRS.map(([dx, dz]) => isRoad(x + dx, z + dz)), deg = conn.filter(Boolean).length;
  const bridge = WATER[I(x, z)] === 1, y = bridge ? 0.1 : 0;
  if (bridge) {
    b.box(0, 0, 0, 1, 0.1, 1, 0x9a948a);
    DIRS.forEach(([dx, dz], k) => {
      if (conn[k]) return;
      if (dx) b.box(dx * 0.47, y, 0, 0.04, 0.12, 1, 0xd8d2c4);
      else b.box(0, y, dz * 0.47, 1, 0.12, 0.04, 0xd8d2c4);
    });
  }
  b.box(0, y, 0, 1, 0.025, 1, 0x4b4e56);
  DIRS.forEach(([dx, dz], k) => {
    if (conn[k] || bridge) return;
    if (dx) b.box(dx * 0.45, y, 0, 0.1, 0.045, 1, 0xd5cfc2);
    else b.box(0, y, dz * 0.45, 1, 0.045, 0.1, 0xd5cfc2);
  });
  const ty = y + 0.026;
  if (deg >= 3) {
    DIRS.forEach(([dx, dz], k) => {
      if (!conn[k]) return;
      for (let s = -0.3; s <= 0.31; s += 0.12) {
        if (dz) b.box(s, ty, dz * 0.36, 0.06, 0.004, 0.14, 0xf2efe6);
        else b.box(dx * 0.36, ty, s, 0.14, 0.004, 0.06, 0xf2efe6);
      }
    });
  } else {
    DIRS.forEach(([dx, dz], k) => {
      if (!conn[k]) return;
      for (const t of [0.1, 0.36]) b.box(dx * t, ty, dz * t, dx ? 0.14 : 0.03, 0.004, dz ? 0.14 : 0.03, 0xf0cf60);
    });
  }
  const stop = busStopSide(x, z);
  if (stop >= 0) {
    const [dx, dz] = DIRS[stop], px = dx * 0.43, pz = dz * 0.43, w = dx ? 0.08 : 0.3, d = dx ? 0.3 : 0.08;
    b.box(px, 0.045, pz, w, 0.18, d, 0x9fc6db).box(px, 0.225, pz, w + 0.03, 0.02, d + 0.03, 0x3f6fb5);
    b.box(px + (dx ? 0 : 0.17), 0.045, pz + (dz ? 0 : 0.17), 0.02, 0.26, 0.02, 0x3b3f46).box(px + (dx ? 0 : 0.17), 0.3, pz + (dz ? 0 : 0.17), 0.06, 0.06, 0.01, 0xe0a83a);
  } else if (!bridge && (x * 7 + z * 3) % 4 === 0) {
    const k = conn.findIndex((c) => !c);
    if (k >= 0) {
      const [dx, dz] = DIRS[k], px = dx ? dx * 0.45 : 0.4, pz = dz ? dz * 0.45 : 0.4;
      b.box(px, 0, pz, 0.025, 0.5, 0.025, 0x3b3f46).box(px, 0.5, pz, 0.07, 0.035, 0.07, 0xfff2c4, 1);
    }
  }
  // street furniture that casts shadows: parked cars and pavement trees on straight streets
  if (!bridge && deg === 2 && conn[0] === conn[2] && stop < 0) {
    const props = new Builder(), r = rng(I(x, z) * 17 + 3), alongZ = conn[0];
    for (const side of [-1, 1]) {
      const along = (r() - 0.5) * 0.5;
      if (r() < 0.3) {
        const col = pick(r, PARKED), [px, pz] = alongZ ? [side * 0.345, along] : [along, side * 0.345], ry = alongZ ? 0 : Math.PI / 2;
        props.add(GEO.box, col, px, 0.02, pz, 0.12, 0.065, 0.24, ry).add(GEO.box, 0x2e3a48, px, 0.085, pz, 0.108, 0.05, 0.12, ry);
      }
      if (r() < 0.4) {
        const t = (r() - 0.5) * 0.7, [tx, tz] = alongZ ? [side * 0.455, t] : [t, side * 0.455];
        props.tree(tx, tz, 0.5 + r() * 0.15, pick(r, [0x6c9c4c, 0x5d8f45, 0x7fa955]));
      }
    }
    b.props = props;
  }
  return b;
}
const PARKED = [0xd8342a, 0x2f5fb5, 0xf2efe6, 0x3b3f46, 0xe0a83a, 0x4f9a5a, 0x9aa0a6, 0x8a5fbf];

/* ---------------------------------------------------------------- trees (instanced) */
const TREE_SLOTS = 3, DECOR = [];
for (let k = 0; k < 4200; k++) {
  const r = rng(k + 999), x = (r() - 0.5) * 150, z = (r() - 0.5) * 150;
  if (Math.abs(x) < HALF + 0.5 && Math.abs(z) < HALF + 0.5) continue;
  if (Math.abs(z + HALF - riverZ(x + HALF)) < RIVER_W + 0.6) continue;
  if (forestNoise(x, z) + r() * 0.8 > 0.6) DECOR.push([x, z, r]);
}
const TREE_CAP = N * N * TREE_SLOTS + DECOR.length;
const trunkMesh = new THREE.InstancedMesh(prep(new THREE.CylinderGeometry(0.04, 0.06, 0.32, 5).translate(0, 0.16, 0)), new THREE.MeshStandardMaterial({ color: 0x7a5638, flatShading: true }), TREE_CAP);
const crownMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
const roundMesh = new THREE.InstancedMesh(prep(new THREE.IcosahedronGeometry(0.27, 0).translate(0, 0.52, 0)), crownMat, TREE_CAP);
const coneMesh = new THREE.InstancedMesh(prep(new THREE.ConeGeometry(0.21, 0.72, 6).translate(0, 0.6, 0)), crownMat, TREE_CAP);
for (const m of [trunkMesh, roundMesh, coneMesh]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const GREENS = [0x6c9c4c, 0x5d8f45, 0x7fa955, 0x4f7f3f, 0x8bb35e], AUTUMN = [0xd9733f, 0xc94f3a, 0xe0a83a], BLOSSOM = 0xe39ab8;

function treeSlot(slot, x, z, r, on, y = 0) {
  if (!on) { trunkMesh.setMatrixAt(slot, ZERO); roundMesh.setMatrixAt(slot, ZERO); coneMesh.setMatrixAt(slot, ZERO); return; }
  const s = 0.75 + r() * 0.6, cone = r() < 0.4, roll = r();
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, r() * 6.28, 0)), _s.set(s, s * (0.9 + r() * 0.3), s));
  trunkMesh.setMatrixAt(slot, _m);
  (cone ? coneMesh : roundMesh).setMatrixAt(slot, _m);
  (cone ? roundMesh : coneMesh).setMatrixAt(slot, ZERO);
  _c.set(roll < 0.06 ? pick(r, AUTUMN) : roll < 0.075 ? BLOSSOM : pick(r, GREENS));
  (cone ? coneMesh : roundMesh).setColorAt(slot, _c);
  (cone ? roundMesh : coneMesh).setColorAt(slot, _c);
}
function setTrees(i, on) {
  const x = i % N, z = (i / N) | 0, r = rng(i * 13 + 5), count = 1 + Math.floor(r() * TREE_SLOTS);
  for (let k = 0; k < TREE_SLOTS; k++) {
    const px = W(x) + (r() - 0.5) * 0.7, pz = W(z) + (r() - 0.5) * 0.7;
    treeSlot(i * TREE_SLOTS + k, px, pz, rng(i * 31 + k), on && k < count);
  }
  treesDirty = true;
}
let treesDirty = true;
DECOR.forEach(([x, z, r], k) => treeSlot(N * N * TREE_SLOTS + k, x, z, r, true, terrainHeight(x, z) - 0.05));

/* ---------------------------------------------------------------- zone overlay + cursor (instanced) */
const overlay = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4, roughness: 1, depthWrite: false }), N * N);
overlay.position.y = 0.03;
overlay.receiveShadow = true;
scene.add(overlay);
function setOverlay(i, color) {
  if (!color) overlay.setMatrixAt(i, ZERO);
  else {
    overlay.setMatrixAt(i, _m.makeTranslation(W(i % N), 0, W((i / N) | 0)));
    overlay.setColorAt(i, _c.set(color));
  }
  overlayDirty = true;
}
let overlayDirty = true;

const cursor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.08, 0.98).translate(0, 0.04, 0),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }), N * N);
cursor.count = 0;
scene.add(cursor);

let emitters = [], emittersDirty = true;

/* ---------------------------------------------------------------- tile objects, batched into chunks */
// Static tiles are merged per CH×CH chunk to keep draw calls low. A building that is
// still playing its "grow" animation lives in its own group until the animation ends.
const CH = 8, NC = Math.ceil(N / CH);
const chunks = Array.from({ length: NC * NC }, () => ({ group: null, smoke: [] }));
const dirtyChunks = new Set();
const animating = new Map(); // tile index -> group
const chunkOf = (i) => Math.floor((i / N | 0) / CH) * NC + Math.floor((i % N) / CH);

function facing(x, z) {
  const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (let k = 0; k < 4; k++) if (isRoad(x + DIRS[k][0], z + DIRS[k][1])) return angles[k];
  return angles[Math.floor(hash(I(x, z), 4) * 4)];
}

function tileBuilder(i) {
  const x = i % N, z = (i / N) | 0, T = S.tiles[i];
  if (T.t === 'road') return roadBuilder(x, z);
  if (T.t === 'zone' && T.ruin) { const b = new Builder(); ruinSite(b, rng(i * 97 + T.v)); return b; }
  if (T.t !== 'svc' && !(T.t === 'zone' && T.lv > 0)) return null;
  const b = new Builder(), r = rng(i * 97 + T.v * 13 + T.lv);
  if (T.t === 'svc') serviceBuilding(b, T.s, r);
  else if (T.build > 0) constructionSite(b, T.z, T.lv, r, 1 - T.build / (T.bt || 1));
  else ({ res: resBuilding, com: comBuilding, off: offBuilding, ind: indBuilding })[T.z](b, T.lv, r);
  return b;
}
function tileMatrix(i) {
  const x = i % N, z = (i / N) | 0, ry = S.tiles[i].t === 'road' ? 0 : facing(x, z);
  return new THREE.Matrix4().compose(_v.set(W(x), 0, W(z)), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1));
}
function disposeGroup(g) {
  scene.remove(g);
  g.traverse((o) => o.geometry && o.geometry.dispose());
}
function buildChunk(c) {
  const ch = chunks[c], cx = c % NC, cz = (c / NC) | 0, bld = new Builder(), road = new Builder();
  for (let z = cz * CH; z < Math.min(N, cz * CH + CH); z++) for (let x = cx * CH; x < Math.min(N, cx * CH + CH); x++) {
    const i = I(x, z);
    if (animating.has(i)) continue;
    const b = tileBuilder(i);
    if (!b) continue;
    (S.tiles[i].t === 'road' ? road : bld).merge(b, tileMatrix(i));
    if (b.props) bld.merge(b.props, tileMatrix(i));
  }
  if (ch.group) disposeGroup(ch.group);
  ch.group = new THREE.Group();
  ch.group.add(bld.build(true), road.build(false));
  ch.smoke = bld.smoke;
  scene.add(ch.group);
  emittersDirty = true;
}

const rotors = new Map(); // tile index -> spinning wind turbine rotor
function refreshTile(i, animate = false) {
  const T = S.tiles[i];
  if (rotors.has(i)) { scene.remove(rotors.get(i)); rotors.delete(i); }
  if (T.t === 'svc' && T.s === 'wind') {
    const holder = new THREE.Group(), rotor = windRotor();
    holder.position.set(W(i % N), 0, W((i / N) | 0));
    holder.rotation.y = facing(i % N, (i / N) | 0);
    rotor.position.set(0, 1.62, 0.08);
    holder.add(rotor);
    holder.userData.rotor = rotor;
    scene.add(holder);
    rotors.set(i, holder);
  }
  if (animating.has(i)) { disposeGroup(animating.get(i)); animating.delete(i); }
  if (animate && T.t !== 'road') {
    const b = tileBuilder(i);
    if (b) {
      const g = new Builder().merge(b, tileMatrix(i)).build(true);
      g.scale.set(1, 0.01, 1);
      g.userData.grow = 0;
      scene.add(g);
      animating.set(i, g);
    }
  }
  dirtyChunks.add(chunkOf(i));
  setTrees(i, T.tree && !T.t);
  setOverlay(i, T.t === 'zone' && T.lv === 0 && !T.ruin ? ZONES[T.z].color : null);
}
function refreshAround(i) {
  const x = i % N, z = (i / N) | 0;
  refreshTile(i);
  for (const [dx, dz] of DIRS) if (inside(x + dx, z + dz) && S.tiles[I(x + dx, z + dz)].t) refreshTile(I(x + dx, z + dz));
}
function rebuildAll() {
  for (const g of animating.values()) disposeGroup(g);
  animating.clear();
  for (let i = 0; i < N * N; i++) refreshTile(i);
}

/* ---------------------------------------------------------------- simulation */
const nearRoad = (x, z, r = 2) => {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (isRoad(x + dx, z + dz)) return true;
  return false;
};
const fundQ = (k) => clamp(S.funding[k] / 100, 0, 1.5);
const law = (id) => !!S.laws[id];
const party = () => PARTIES[S.party] || PARTIES.centro;

function radiusOf(k) {
  let r = SERVICES[k].radius * clamp(fundQ(SERVICES[k].fund), 0.4, 1.3);
  if (k === 'health' && law('sanidad')) r *= 1.3;
  if (k === 'police' && law('manodura')) r *= 1.4;
  if (law('privatizar')) r *= 0.85;
  return r;
}
function upkeepOf(k) {
  let u = SERVICES[k].upkeep * fundQ(SERVICES[k].fund);
  if (k === 'health' && law('sanidad')) u *= 1.4;
  if (k === 'school' && law('educacion')) u *= 1.3;
  if (k === 'police' && law('manodura')) u *= 1.3;
  if (SERVICES[k].fund === 'utilities' && law('reciclaje')) u *= 1.15;
  if (law('privatizar')) u *= 0.75;
  return u;
}
function buildCost(t) {
  let c = t.cost;
  if (t.svc && SERVICES[t.svc].green && law('verde')) c *= 0.6;
  return Math.round(c);
}
function growthFactor(z) {
  let f = clamp(1.4 - S.taxes[z] / 20, 0.15, 1.2);
  if (z !== 'res') {
    if (law('empresas')) f *= 1.4;
    if (S.party === 'derecha') f *= 1.2;
    if (S.party === 'izquierda') f *= 0.9;
  }
  if (z === 'com' && law('silencio')) f *= 0.8;
  return f;
}

let D = null; // derived stats, refreshed every game hour and after edits
function compute() {
  const d = {
    pop: 0, jobs: { com: 0, off: 0, ind: 0 }, jobsTotal: 0, powerUse: 0, powerCap: 0, waterUse: 0, waterCap: 0,
    roads: 0, svc: {}, svcList: [], zoneTiles: { res: 0, com: 0, off: 0, ind: 0 }, buildings: 0, building: 0, emptyLots: 0, cov: {}, smoke: 0,
  };
  const homes = [], polluters = [];
  const indRange = law('industria') ? 2 : 0;
  S.tiles.forEach((T, i) => {
    const x = i % N, z = (i / N) | 0;
    if (T.t === 'road') d.roads++;
    else if (T.t === 'svc') {
      const def = SERVICES[T.s];
      d.svc[T.s] = (d.svc[T.s] || 0) + 1;
      d.svcList.push([T.s, x, z]);
      const eff = 0.5 + 0.5 * Math.min(1, fundQ('utilities'));
      if (def.plant === 'power') d.powerCap += def.cap * eff;
      else if (def.plant === 'water') d.waterCap += def.cap * eff;
      else if (!def.noPower) { d.powerUse += 3; d.waterUse += 3; }
      if (def.smoke) polluters.push([x, z, def.smoke[0], def.smoke[1]]);
    } else if (T.t === 'zone') {
      d.zoneTiles[T.z]++;
      if (!T.lv) { d.emptyLots++; return; }
      d.buildings++;
      if (T.build > 0) d.building++;
      let v = ZONES[T.z].cap[T.build > 0 ? T.prev || 0 : T.lv];
      if (T.z === 'ind' && law('industria')) v = Math.round(v * 1.3);
      if (T.z === 'com' && law('horarios')) v = Math.round(v * 1.25);
      if (T.z === 'res') { d.pop += v; if (v) homes.push([x, z, v]); }
      else { d.jobs[T.z] += v; d.jobsTotal += v; }
      d.powerUse += T.lv * ({ res: 2, com: 3, off: 4, ind: 5 })[T.z];
      d.waterUse += T.lv * ({ res: 3, com: 2, off: 2, ind: 4 })[T.z];
      if (T.z === 'ind') polluters.push([x, z, 3 + T.lv + indRange, 1]);
    }
  });
  const covered = (kinds) => {
    const list = d.svcList.filter(([s]) => kinds.includes(s)).map(([s, x, z]) => [x, z, radiusOf(s)]);
    let c = 0;
    for (const [hx, hz, p] of homes) if (list.some(([sx, sz, r]) => Math.hypot(sx - hx, sz - hz) <= r)) c += p;
    return d.pop ? c / d.pop : 0;
  };
  for (const k of ['police', 'fire', 'health', 'school', 'park', 'bus']) d.cov[k] = covered([k]);
  const hasBus = !!d.svc.bus;
  if (hasBus !== busNetwork) { busNetwork = hasBus; for (let c = 0; c < chunks.length; c++) dirtyChunks.add(c); }
  d.cov.leisure = covered(Object.keys(SERVICES).filter((k) => SERVICES[k].leisure));
  let smoky = 0;
  for (const [hx, hz, p] of homes) {
    let w = 0;
    for (const [px, pz, r, s] of polluters) if (Math.hypot(px - hx, pz - hz) <= r) w = Math.max(w, s);
    smoky += p * w;
  }
  d.smoke = (d.pop ? smoky / d.pop : 0) * (law('verde') ? 0.7 : 1) * (law('reciclaje') ? 0.6 : 1);
  d.workers = d.pop * 0.55;
  d.employed = Math.min(d.workers, d.jobsTotal);
  d.filled = d.jobsTotal ? Math.min(1, d.workers / d.jobsTotal) : 0;
  d.powerOk = d.powerUse <= d.powerCap;
  d.waterOk = d.waterUse <= d.waterCap;
  d.demand = {
    res: d.jobsTotal * 1.8 + 120 - d.pop + (law('alquiler') ? 25 : 0),
    com: d.pop * 0.3 + 16 - d.jobs.com,
    off: d.pop > 120 ? d.pop * 0.25 + 12 - d.jobs.off : 0,
    ind: d.pop * 0.3 + 30 - d.jobs.ind,
  };
  // electorate: business-heavy cities lean right, well-served ones lean left
  const biz = d.jobsTotal ? (d.jobs.off + d.jobs.ind) / d.jobsTotal : 0.5;
  const lawLean = LAWS.reduce((a, l) => a + (law(l.id) ? l.lean : 0), 0);
  d.right = clamp(0.5 + (biz - 0.5) * 0.3 - (d.cov.health + d.cov.school - 1) * 0.06 + lawLean * 0.02, 0.25, 0.75);
  d.fin = finances(d);
  d.rows = approvalRows(d);
  d.goal = clamp(Math.round(d.rows.reduce((a, r) => a + r[2], 0)), 0, 100);
  d.vote = voteShare(d);
  return d;
}

function finances(d) {
  const tourismBase = d.svcList.reduce((a, [s]) => a + (SERVICES[s].tourism || 0), 0);
  const income = {
    res: d.pop * S.taxes.res * 0.9 * (law('alquiler') ? 0.85 : 1),
    com: d.jobs.com * d.filled * S.taxes.com * 1.2 * (law('empresas') ? 0.8 : 1) * (law('horarios') ? 1.15 : 1),
    off: d.jobs.off * d.filled * S.taxes.off * 1.5 * (law('empresas') ? 0.8 : 1),
    ind: d.jobs.ind * d.filled * S.taxes.ind * 1.1 * (law('empresas') ? 0.8 : 1),
    tourism: tourismBase * clamp(d.pop / 400, 0.2, 1.5) * (0.5 + S.approval / 100) * fundQ('leisure') * (law('turismo') ? 1.6 : 1),
  };
  const expense = Object.fromEntries(FUNDS.map(([k]) => [k, 0]));
  for (const [s] of d.svcList) expense[SERVICES[s].fund] += upkeepOf(s);
  expense.roads = d.roads * 6 * fundQ('roads');
  const laws = LAWS.reduce((a, l) => a + (law(l.id) ? l.cost : 0), 0);
  const loan = S.loan ? S.loan.perDay : 0;
  const inc = Object.values(income).reduce((a, b) => a + b, 0), exp = Object.values(expense).reduce((a, b) => a + b, 0) + loan + laws;
  return { income, expense, loan, laws, inc, exp, net: inc - exp };
}

function approvalRows(d) {
  const rows = [['🏛️', 'Base: la gente siempre espera algo más del ayuntamiento', 60]];
  if (!d.pop) return rows;
  const care = S.party === 'izquierda' ? 1.2 : S.party === 'derecha' ? 0.9 : 1;
  const svc = [['health', '➕', 'El médico está cerca'], ['school', '🎓', 'Buenas escuelas en el barrio'],
    ['police', '🛡️', 'Con la policía cerca se duerme tranquilo'], ['fire', '🚒', 'Los bomberos llegan a tiempo'], ['park', '🌳', 'Hay parques donde pasear']];
  for (const [k, ic, label] of svc) rows.push([ic, label, 5 * d.cov[k] * Math.min(1, fundQ(k)) * care]);
  if (d.cov.bus > 0) rows.push(['🚌', 'Hay autobús para ir al trabajo', 3 * d.cov.bus * Math.min(1, fundQ('transport')) * (law('transporte') ? 1.3 : 1)]);
  if (d.cov.leisure > 0) rows.push(['🎡', 'Ocio y cultura cerca de casa', 4 * d.cov.leisure * Math.min(1, fundQ('leisure'))]);
  const ratio = d.workers ? d.jobsTotal / d.workers : 1;
  rows.push(ratio >= 1 ? ['💼', 'Hay trabajo para todos', 3] : ['💼', 'Falta trabajo', -Math.round((1 - ratio) * 10)]);
  if (d.smoke > 0.01) rows.push(['🏭', 'Humo de las chimeneas: la gente tose', -8 * d.smoke]);
  if (!d.powerOk) rows.push(['⚡', 'Apagones en las casas', -12 * (1 - d.powerCap / d.powerUse)]);
  if (!d.waterOk) rows.push(['💧', 'Grifos secos', -12 * (1 - d.waterCap / d.waterUse)]);
  const limit = party().taxLimit;
  const high = Object.values(S.taxes).reduce((a, t) => a + Math.max(0, t - limit), 0);
  if (high) rows.push(['🏷️', `Impuestos por encima del ${limit} %`, -high * 1.5]);
  else if (Object.values(S.taxes).every((t) => t <= (S.party === 'derecha' ? 10 : 9))) rows.push(['🏷️', 'Impuestos bajos', 2]);
  const cuts = FUNDS.reduce((a, [k]) => a + Math.max(0, 70 - S.funding[k]), 0);
  if (cuts) rows.push(['✂️', 'Recortes en los servicios', -cuts / 10]);
  const popular = LAWS.reduce((a, l) => a + (law(l.id) ? l.bonus : 0), 0);
  if (popular) rows.push(['📜', 'Leyes que gustan a los vecinos', popular]);
  if (S.party) {
    const lean = party().lean;
    const fit = LAWS.reduce((a, l) => {
      if (!law(l.id)) return a;
      if (lean === 0) return a + (l.lean === 0 ? 1 : -0.5);
      return a + (l.lean === lean ? 1 : l.lean === -lean ? -1.5 : 0);
    }, 0);
    if (fit) rows.push([party().icon, fit > 0 ? 'Cumples tu programa electoral' : 'Tus votantes no entienden tus leyes', fit]);
  }
  if (S.tiles.some((T) => T.fire > 0)) rows.push(['🔥', 'Hay un incendio en la ciudad', -3]);
  else if (S.burnDay && S.day - S.burnDay < 2) rows.push(['🔥', 'Un edificio ardió hace poco', -2]);
  if (S.money < 0) rows.push(['📉', 'La ciudad está en números rojos', -8]);
  const sum = rows.reduce((a, r) => a + r[2], 0), rounded = rows.reduce((a, r) => a + Math.round(r[2]), 0);
  if (Math.round(sum) !== rounded) rows.push(['≈', 'Otros y redondeo', Math.round(sum) - rounded]);
  return rows;
}

// share of the vote your list would get if elections were held today
function voteShare(d) {
  const lean = S.party ? party().lean : 0;
  const affinity = lean === 1 ? d.right : lean === -1 ? 1 - d.right : 0.55;
  return clamp(Math.round(S.approval * 0.8 + (affinity - 0.5) * 30 + 8), 5, 95);
}

// game hours a building of each zone/level spends under construction
const BUILD_HOURS = { res: [0, 4, 6, 10], com: [0, 5, 7, 10], off: [0, 6, 10, 16], ind: [0, 5, 8, 12] };
const POWER_PER_LV = { res: 2, com: 3, off: 4, ind: 5 }, WATER_PER_LV = { res: 3, com: 2, off: 2, ind: 4 };
function startBuilding(i, T, lv) {
  T.prev = T.lv; T.lv = lv; T.v = Math.floor(Math.random() * 1000); T.tree = false;
  T.bt = T.build = BUILD_HOURS[T.z][lv];
  refreshTile(i);
}
function growth(d) {
  if (!d.powerCap || !d.waterCap) return;
  // new buildings only start if the grid can supply them, so growth never causes blackouts
  let power = d.powerCap - d.powerUse, water = d.waterCap - d.waterUse;
  const fits = (z) => power >= POWER_PER_LV[z] && water >= WATER_PER_LV[z];
  const take = (z) => { power -= POWER_PER_LV[z]; water -= WATER_PER_LV[z]; };
  const order = [...S.tiles.keys()].sort(() => Math.random() - 0.5);
  const demand = { ...d.demand }, spawned = { res: 0, com: 0, off: 0, ind: 0 };
  const mood = clamp(S.approval / 70, 0.3, 1.3);
  for (const i of order) {
    const T = S.tiles[i];
    if (T.t !== 'zone' || demand[T.z] <= 0 || spawned[T.z] >= 10) continue;
    const x = i % N, z = (i / N) | 0;
    if (T.ruin) { if (S.day >= T.ruin) { T.ruin = 0; refreshTile(i); } continue; }
    if (!nearRoad(x, z) || T.build > 0) continue;
    if (!fits(T.z)) continue;
    if (T.lv === 0) {
      if (Math.random() < 0.3 * clamp(demand[T.z] / 30, 0.15, 1) * growthFactor(T.z) * mood) {
        startBuilding(i, T, 1); take(T.z);
        demand[T.z] -= ZONES[T.z].cap[1]; spawned[T.z]++;
      }
    } else if (T.lv < 3 && S.approval >= (T.lv === 2 ? 70 : 55)) {
      if (T.z === 'off' && d.pop < 300) continue;
      const boost = T.z === 'res' && T.lv === 2 && law('educacion') ? 1.5 : 1;
      if (Math.random() < 0.02 * growthFactor(T.z) * boost) {
        startBuilding(i, T, T.lv + 1); take(T.z);
        demand[T.z] -= ZONES[T.z].cap[T.lv] - ZONES[T.z].cap[T.lv - 1]; spawned[T.z]++;
      }
    }
  }
  if (S.approval < 30) for (const i of order.slice(0, 40)) {
    const T = S.tiles[i];
    if (T.t === 'zone' && T.lv > 1 && Math.random() < 0.05) { T.lv--; refreshTile(i); news(`Malestar vecinal: algunas familias se marchan de ${S.name}.`, 'AVISO'); }
  }
}

function advanceConstruction() {
  S.tiles.forEach((T, i) => {
    if (!(T.build > 0)) return;
    T.build--;
    if (T.build <= 0) { T.build = 0; T.prev = 0; refreshTile(i, true); }
    else if (T.build % 2 === 0) refreshTile(i);
  });
}
function hourTick() {
  advanceConstruction();
  D = compute();
  fireTick(D);
  growth(D);
  D = compute();
  S.money += D.fin.net / 24;
  const step = 2;
  S.approval = S.approval < D.goal ? Math.min(D.goal, S.approval + step) : Math.max(D.goal, S.approval - step);
  if (S.loan) {
    S.loan.left -= S.loan.perDay / 24;
    if (S.loan.left <= 0) { S.loan = null; news('Préstamo devuelto. El banco os felicita.'); }
  }
  hourlyNews(D);
  checkTutorial(D);
}

function dayTick() {
  S.day++;
  S.weather = Math.random() < 0.22 ? 'rain' : 'sun';
  if (S.day >= S.nextElection) return election();
  const left = S.nextElection - S.day;
  if (left === 2) return news(`Quedan 2 días para las elecciones. Intención de voto: ${D ? D.vote : '?'} %.`, 'ELECCIONES');
  if (S.weather === 'rain') news(`Día ${S.day}: se esperan lluvias durante toda la jornada.`, 'TIEMPO');
  else if (Math.random() < 0.5) news(`Ciudades vecinas: ${pick(Math.random, NEIGHBOURS)} ${pick(Math.random, [
    'estrena mercado de abastos.', 'sufre una sequía: se secaron los pozos.', 'ha subido los impuestos y sus vecinos se quejan.',
    'inaugura un carril bici junto al río.', 'celebra sus fiestas patronales.', 'abre un zoológico y le roba turistas a todo el valle.'])}`, 'VECINOS');
}

function election() {
  S.nextElection = S.day + ELECTION_EVERY;
  D = compute();
  if (D.pop < 30) { news('Elecciones aplazadas: la ciudad aún no tiene censo suficiente.', 'ELECCIONES'); return; }
  const mine = clamp(D.vote + Math.round((Math.random() - 0.5) * 8), 5, 95);
  const won = mine >= 50;
  const others = Object.keys(PARTIES).filter((k) => k !== (S.party || 'centro'));
  const split = 0.35 + Math.random() * 0.3, a = Math.round((100 - mine) * split);
  const result = { day: S.day, mine, won, rivals: [[others[0], a], [others[1], 100 - mine - a]] };
  S.history.push(result);
  if (won) { S.terms++; S.approval = Math.min(100, S.approval + 3); }
  news(won ? `¡${party().name} gana las elecciones con el ${mine} % de los votos!` : `${party().name} pierde las elecciones (${mine} %).`, 'ELECCIONES');
  setSpeed(0);
  showElection(result);
}

/* ---------------------------------------------------------------- news ticker */
let lastWarn = {};
function news(text, tag = 'NOTICIAS') {
  $('tickerTag').textContent = tag;
  $('tickerText').textContent = text;
}
function hourlyNews(d) {
  const warn = (key, text, every = 6) => {
    const now = S.day * 24 + Math.floor(S.minutes / 60);
    if ((lastWarn[key] ?? -99) + every > now) return false;
    lastWarn[key] = now; news(text, 'AVISO'); return true;
  };
  const milestones = [50, 100, 250, 500, 1000, 2000, 4000, 8000];
  const m = milestones.filter((v) => d.pop >= v).pop();
  if (m && m > S.best) { S.best = m; news(`¡${S.name} ya tiene ${fmt(m)} habitantes!`, 'CIUDAD'); return; }
  if (d.zoneTiles.res && !d.powerCap) return void warn('power0', 'Sin central eléctrica no se mudará nadie. Busca ⚡ en "Energía y agua".');
  if (d.zoneTiles.res && !d.waterCap) return void warn('water0', 'Sin torre de agua no se mudará nadie. Busca 💧 en "Energía y agua".');
  if (!d.powerOk && warn('power', 'Apagones: la ciudad consume más luz de la que produce.')) return;
  if (!d.waterOk && warn('water', 'Falta agua: construye otra torre de agua.')) return;
  if (S.money < 0 && warn('money', 'Las cuentas están en rojo. Revisa el presupuesto.')) return;
  if (d.pop > 40 && d.cov.health < 0.5 && warn('health', 'Los vecinos piden un centro de salud más cerca.', 12)) return;
  if (d.pop > 40 && d.cov.school < 0.5 && warn('school', 'Las familias quieren una escuela en su barrio.', 12)) return;
  if (d.smoke > 0.3 && warn('smoke', 'El humo de las fábricas llega a las casas. Separa la industria.', 12)) return;
  if (d.pop > 150 && !d.svc.cityhall && warn('hall', 'Sin ayuntamiento no puedes aprobar leyes. Búscalo en "Servicios".', 24)) return;
  if (d.pop > 250 && d.cov.leisure < 0.3 && warn('fun', 'Los vecinos se aburren: piden una plaza, un museo o un zoológico.', 24)) return;
}

/* ---------------------------------------------------------------- tutorial */
const STEPS = [
  { title: 'Traza tu primera calle', text: 'Abre "Calles" en la barra de abajo y arrastra sobre el terreno.', done: (d) => d.roads >= 8, tool: 'road' },
  { title: 'Marca zonas de vivienda', text: 'En "Zonas", elige Vivienda y arrastra junto a la calle.', done: (d) => d.zoneTiles.res >= 6, tool: 'res' },
  { title: 'Luz y agua', text: 'Las casas no crecen sin servicios básicos. Coloca una central eléctrica y una torre de agua cerca de una calle.', done: (d) => d.powerCap > 0 && d.waterCap > 0, tool: 'power' },
  { title: 'Crea empleo', text: 'Marca zonas de Comercio e Industria. Pon la industria lejos de las casas: su humo molesta.', done: (d) => d.zoneTiles.com + d.zoneTiles.ind >= 6, tool: 'com' },
  { title: 'Cuida a los vecinos', text: 'Un centro de salud y una escuela cerca de las casas suben mucho la aprobación.', done: (d) => d.svc.health && d.svc.school, tool: 'health' },
  { title: 'Construye el ayuntamiento', text: 'Está en "Servicios". Desde él podrás aprobar leyes en 🏛️ Política.', done: (d) => d.svc.cityhall, tool: 'cityhall' },
  { title: 'Aprueba tu primera ley', text: 'Abre 🏛️ Política y aprueba una ley. Las que encajan con tu partido gustan a tus votantes.', done: () => LAWS.some((l) => law(l.id)), action: () => openModal('politicsModal') },
  { title: 'Revisa el presupuesto', text: 'Ajusta impuestos y fondos en 📊 Presupuesto. Más impuestos, más dinero, pero menos crecimiento.', done: () => S.budgetSeen, action: () => openModal('budgetModal') },
  { title: '¡Tu ciudad está en marcha!', text: `Cada ${ELECTION_EVERY} días hay elecciones: vigila la ❤️ aprobación y la intención de voto. Añade ocio (zoológico, estadio, museo) para atraer turistas.` },
];
function renderAdvisor() {
  const st = STEPS[S.tutorial];
  $('advisor').style.display = S.tutorialHidden || !st ? 'none' : '';
  if (!st) return;
  $('advTitle').textContent = `${Math.min(S.tutorial + 1, STEPS.length)}/${STEPS.length} · ${st.title}`;
  $('advText').textContent = st.text;
  const acts = $('advActions');
  acts.innerHTML = '';
  if (st.tool) { const b = el('button', 'btn primary', 'Muéstramelo'); b.onclick = () => selectTool(st.tool); acts.append(b); }
  if (st.action) { const b = el('button', 'btn primary', 'Abrir'); b.onclick = st.action; acts.append(b); }
  if (!st.done) { const b = el('button', 'btn', 'Entendido'); b.onclick = () => { S.tutorialHidden = true; renderAdvisor(); }; acts.append(b); }
}
function checkTutorial(d) {
  let changed = false;
  while (STEPS[S.tutorial]?.done && STEPS[S.tutorial].done(d)) { S.tutorial++; changed = true; }
  if (changed) renderAdvisor();
}
$('advisorClose').onclick = () => { S.tutorialHidden = true; renderAdvisor(); };

/* ---------------------------------------------------------------- tools & input */
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const TOOL_BY_ID = Object.fromEntries(CATEGORIES.flatMap((c) => c.tools.map((t) => [t.id, { ...t, cat: c.id }])));
let tool = TOOL_BY_ID.look;

function renderToolbar() {
  const bar = $('toolbar');
  bar.innerHTML = '';
  CATEGORIES.forEach((c, n) => {
    const b = el('button', 'tb', `<span class="ic">${c.icon}</span>${c.label}`);
    b.title = `${c.label} (${n + 1})`;
    b.setAttribute('aria-pressed', tool.cat === c.id);
    b.onclick = () => selectTool(tool.cat === c.id && c.id !== 'look' ? 'look' : c.tools[0].id);
    bar.append(b);
  });
  const ub = el('button', 'tb', '<span class="ic">↶</span>Deshacer');
  ub.title = 'Deshacer lo último que has construido hoy (Ctrl+Z)';
  ub.onclick = undo;
  bar.append(ub);
  const sub = $('subtools'), cat = CATEGORIES.find((c) => c.id === tool.cat);
  sub.innerHTML = '';
  sub.classList.toggle('open', cat.id !== 'look');
  if (cat.id === 'look') return;
  for (const t of cat.tools) {
    const b = el('button', 'st', `<span class="ic">${t.icon}</span><span>${t.label}<small>${t.mode === 'one' ? money(buildCost(t)) : `${money(t.cost)} / casilla`}</small></span>`);
    b.setAttribute('aria-pressed', tool.id === t.id);
    b.title = t.hint || '';
    b.onclick = () => selectTool(t.id);
    sub.append(b);
  }
  if (cat.id === 'zones' && D) {
    const dem = el('div', 'demand');
    dem.title = 'Demanda: vivienda, comercio, oficinas, industria';
    for (const z of Object.keys(ZONES)) {
      const v = clamp(D.demand[z] / 60, 0, 1);
      const i = el('i'); i.style.height = `${4 + v * 22}px`; i.style.background = ZONES[z].color; dem.append(i);
    }
    sub.append(dem);
  }
}
function selectTool(id) {
  tool = TOOL_BY_ID[id];
  controls.mouseButtons.LEFT = tool.id === 'look' ? THREE.MOUSE.PAN : -1;
  controls.touches.ONE = tool.id === 'look' ? THREE.TOUCH.PAN : -1;
  scene.userData.grid.material.opacity = tool.id === 'look' ? 0.06 : 0.16;
  drag = null;
  cursor.count = 0;
  renderToolbar();
}

const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function tileAt(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, p)) return null;
  const x = Math.floor(p.x + HALF), z = Math.floor(p.z + HALF);
  return inside(x, z) ? [x, z] : null;
}

function pathTiles(a, b, mode) {
  if (!a || !b) return [];
  const out = [];
  if (mode === 'one') return [I(...b)];
  if (mode === 'line') {
    const [ax, az] = a, [bx, bz] = b, sx = Math.sign(bx - ax), sz = Math.sign(bz - az);
    let x = ax, z = az;
    out.push(I(x, z));
    while (x !== bx) { x += sx; out.push(I(x, z)); }
    while (z !== bz) { z += sz; out.push(I(x, z)); }
    return out;
  }
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [z0, z1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push(I(x, z));
  return out;
}

// returns { ok, cost } for applying the current tool at tile i
function evaluate(i) {
  const T = S.tiles[i], treeCost = T.tree && !T.t ? 5 : 0;
  switch (tool.id) {
    case 'road':
      if (T.t === 'road') return { ok: true, cost: 0, skip: true };
      if (T.t === 'svc') return { ok: false, why: 'Hay un edificio' };
      return { ok: true, cost: (WATER[i] ? 100 : 25) + treeCost };
    case 'trees':
      if (T.t || WATER[i] || T.tree) return { ok: true, cost: 0, skip: true };
      return { ok: true, cost: 15 };
    case 'bulldoze':
      if (!T.t && !T.tree) return { ok: true, cost: 0, skip: true };
      return { ok: true, cost: 10 };
    default:
      if (tool.zone) {
        if (WATER[i]) return { ok: false, why: 'Es agua' };
        if (T.t === 'road' || T.t === 'svc' || (T.t === 'zone' && T.z === tool.zone)) return { ok: true, cost: 0, skip: true };
        return { ok: true, cost: 10 + treeCost };
      }
      if (WATER[i]) return { ok: false, why: 'No se puede construir sobre el agua' };
      if (T.t && !(T.t === 'zone' && T.lv === 0)) return { ok: false, why: 'La casilla está ocupada' };
      if (SERVICES[tool.svc].unique && D?.svc[tool.svc]) return { ok: false, why: 'Solo puede haber uno en la ciudad' };
      if (tool.svc === 'coal' && law('verde')) return { ok: false, why: 'Prohibido por el Pacto verde' };
      return { ok: true, cost: buildCost(tool) + treeCost, warn: nearRoad(i % N, (i / N) | 0, 1) ? '' : 'Necesita una calle al lado para funcionar' };
  }
}

function apply(list) {
  if (tool.id === 'look') return;
  const evals = list.map((i) => [i, evaluate(i)]).filter(([, e]) => e.ok && !e.skip);
  const cost = evals.reduce((a, [, e]) => a + e.cost, 0);
  if (!evals.length) return;
  if (cost > S.money) { news(`Fondos insuficientes: necesitas ${money(cost)}.`, 'AVISO'); return; }
  undoStack.push({ money: S.money, day: S.day, tiles: evals.map(([i]) => [i, { ...S.tiles[i] }]) });
  if (undoStack.length > 30) undoStack.shift();
  S.money -= cost;
  const touched = new Set(), clear = { lv: 0, prev: 0, build: 0, fire: 0, saved: false, ruin: 0 };
  for (const [i] of evals) {
    const T = S.tiles[i];
    if (tool.id === 'road') Object.assign(T, clear, { t: 'road', z: null, s: null, tree: false });
    else if (tool.id === 'trees') T.tree = true;
    else if (tool.id === 'bulldoze') Object.assign(T, clear, { t: 0, z: null, s: null, tree: false });
    else if (tool.zone) Object.assign(T, clear, { t: 'zone', z: tool.zone, s: null, tree: false });
    else Object.assign(T, clear, { t: 'svc', s: tool.svc, z: null, tree: false, v: Math.floor(Math.random() * 1000) });
    touched.add(i);
  }
  fireDirty = true;
  for (const i of touched) refreshAround(i);
  for (const i of touched) if (S.tiles[i].t === 'svc') refreshTile(i, true);
  D = compute();
  checkTutorial(D);
  updateHud();
  save();
}

// undo the last build action (same game day only, so growth since then is not rolled back)
const undoStack = [];
function undo() {
  const last = undoStack.pop();
  if (!last) return news('No hay nada que deshacer.', 'AVISO');
  if (last.day !== S.day) { undoStack.length = 0; return news('Solo se puede deshacer lo construido hoy.', 'AVISO'); }
  S.money = last.money;
  for (const [i, T] of last.tiles) S.tiles[i] = T;
  for (const [i] of last.tiles) refreshAround(i);
  fireDirty = true;
  D = compute(); updateHud(); save();
  news('Deshecho.', 'AJUSTES');
}

let drag = null, hoverTile = null;
const tip = $('tooltip');
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || tool.id === 'look') return;
  const t = tileAt(e);
  if (!t) return;
  drag = { a: t, b: t };
  renderer.domElement.setPointerCapture(e.pointerId);
  updateCursor(e);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  hoverTile = tileAt(e);
  if (drag && hoverTile) drag.b = hoverTile;
  updateCursor(e);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!drag) return;
  apply(pathTiles(drag.a, drag.b, tool.mode));
  drag = null;
  updateCursor(e);
});
renderer.domElement.addEventListener('pointerleave', () => { tip.style.display = 'none'; if (!drag) cursor.count = 0; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

const OK = new THREE.Color(0x4fb86a), BAD = new THREE.Color(0xd8452f), NEUTRAL = new THREE.Color(0xb8b2a6);
function updateCursor(e) {
  const t = drag ? drag.b : hoverTile;
  if (!t) { cursor.count = 0; tip.style.display = 'none'; return; }
  const list = tool.id === 'look' ? [I(...t)] : pathTiles(drag ? drag.a : t, t, tool.mode);
  let cost = 0, bad = '', warn = '';
  cursor.count = list.length;
  list.forEach((i, k) => {
    const ev = tool.id === 'look' ? { ok: true } : evaluate(i);
    if (ev.ok && !ev.skip) cost += ev.cost;
    if (!ev.ok) bad = ev.why;
    if (ev.warn) warn = ev.warn;
    const y = S.tiles[i].t === 'road' && WATER[i] ? 0.1 : 0;
    cursor.setMatrixAt(k, _m.makeTranslation(W(i % N), y, W((i / N) | 0)));
    cursor.setColorAt(k, tool.id === 'look' ? NEUTRAL : ev.ok ? (tool.id === 'bulldoze' ? BAD : OK) : BAD);
  });
  cursor.instanceMatrix.needsUpdate = true;
  if (cursor.instanceColor) cursor.instanceColor.needsUpdate = true;
  tip.innerHTML = tool.id === 'look' ? describe(I(...t))
    : `<b>${tool.icon} ${tool.label}</b>${list.length > 1 ? `${list.length} casillas · ` : ''}${money(cost)}${cost > S.money ? ' <span class="bad">(no te llega)</span>' : ''}${bad ? `<br><span class="bad">${bad}</span>` : ''}${warn ? `<br><span class="bad">${warn}</span>` : ''}`;
  tip.style.display = tip.innerHTML ? 'block' : 'none';
  tip.style.left = `${Math.min(e.clientX + 16, innerWidth - 270)}px`;
  tip.style.top = `${e.clientY + 16}px`;
}
function describe(i) {
  const T = S.tiles[i], x = i % N, z = (i / N) | 0;
  if (T.t === 'road') return `<b>🛣️ ${WATER[i] ? 'Puente' : 'Calle'}</b>`;
  if (T.t === 'svc') {
    const s = SERVICES[T.s];
    const extra = s.cap ? `Produce ${s.cap} ${s.plant === 'power' ? '⚡' : '💧'}${s.smoke ? ' · contamina' : ''} · ${money(upkeepOf(T.s))}/día`
      : s.radius ? `Radio: ${Math.round(radiusOf(T.s))} casillas · ${money(upkeepOf(T.s))}/día${s.tourism ? ' · atrae turistas' : ''}`
      : `Aquí se aprueban las leyes · ${money(upkeepOf(T.s))}/día`;
    return `<b>${s.icon} ${s.label}</b>${extra}${nearRoad(x, z, 1) ? '' : '<br><span class="bad">Sin calle al lado</span>'}`;
  }
  if (T.t === 'zone') {
    const Z = ZONES[T.z];
    if (!T.lv) {
      const why = !nearRoad(x, z) ? 'Necesita una calle cerca' : !D?.powerCap ? 'Necesita luz' : !D?.waterCap ? 'Necesita agua'
        : D.powerCap - D.powerUse < 5 ? '<span class="bad">Sin luz de sobra: construye otra central</span>'
        : D.waterCap - D.waterUse < 4 ? '<span class="bad">Sin agua de sobra: construye otra torre</span>'
        : D?.demand[T.z] <= 0 ? 'No hay demanda ahora mismo' : 'Esperando a que alguien construya';
      return `<b>${Z.icon} Zona de ${Z.label.toLowerCase()}</b>${why}`;
    }
    const names = { res: ['', 'Casa', 'Casa grande', 'Edificio de viviendas'], com: ['', 'Tienda', 'Comercio', 'Galerías'], off: ['', 'Oficinas', 'Edificio de oficinas', 'Torre de oficinas'], ind: ['', 'Taller', 'Fábrica', 'Complejo industrial'] };
    if (T.ruin) return '<b>🏚️ Ruinas</b>Se reconstruirá en unos días';
    if (T.fire > 0) return `<b>🔥 ¡En llamas!</b>${T.saved ? 'Los bomberos lo están apagando' : 'Sin bomberos cerca: puede quemarse entero'}`;
    if (T.build > 0) return `<b>🏗️ En obras: ${names[T.z][T.lv].toLowerCase()}</b>Faltan ${T.build} h · nivel ${T.lv}`;
    return `<b>${Z.icon} ${names[T.z][T.lv]}</b>Nivel ${T.lv} · ${Z.cap[T.lv]} ${Z.noun}`;
  }
  if (WATER[i]) return '<b>🌊 Río</b>Solo se puede cruzar con un puente.';
  return T.tree ? '<b>🌳 Arboleda</b>' : '';
}

/* keyboard */
let lastSpeed = S.speed || 1;
addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
  const n = Number(e.key);
  if (n >= 1 && n <= CATEGORIES.length) selectTool(CATEGORIES[n - 1].tools[0].id);
  else if (e.key === 'Escape') { if (document.querySelector('.modal.open')) closeModals(); else selectTool('look'); }
  else if (e.code === 'Space') { e.preventDefault(); setSpeed(S.speed ? 0 : lastSpeed); }
  else if (e.key === 'q' || e.key === 'e') rotateCamera(e.key === 'q' ? 1 : -1);
});
function rotateCamera(dir) {
  const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), dir * Math.PI / 8);
  camera.position.copy(controls.target).add(off);
}

/* ---------------------------------------------------------------- HUD, modals */
function setSpeed(v) {
  if (v) lastSpeed = v;
  S.speed = v;
  document.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.speed) === v));
}
document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => setSpeed(Number(b.dataset.speed))));

function partOfDay(h) { return h < 6 ? 'madrugada' : h < 13 ? 'mañana' : h < 20 ? 'tarde' : 'noche'; }
function updateHud() {
  if (!D) return;
  const h = Math.floor(S.minutes / 60), m = Math.floor(S.minutes % 60);
  $('cityName').textContent = S.name;
  $('sPop').textContent = fmt(D.pop);
  $('sMoney').textContent = money(S.money);
  $('sMoney').style.color = S.money < 0 ? 'var(--accent)' : '';
  $('sDelta').textContent = `${signed(D.fin.net)} al día`;
  $('sApproval').textContent = `${Math.round(S.approval)} %`;
  $('sClock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  $('sDay').textContent = `día ${S.day} · ${partOfDay(h)}${S.weather === 'rain' ? ' · 🌧️' : ''}`;
  $('sPower').textContent = `${fmt(D.powerUse)}/${fmt(D.powerCap)}`;
  $('sPower').style.color = D.powerOk ? '' : 'var(--accent)';
  $('sWater').textContent = `${fmt(D.waterUse)}/${fmt(D.waterCap)}`;
  $('sWater').style.color = D.waterOk ? '' : 'var(--accent)';
  $('sJobs').textContent = `${fmt(Math.min(D.workers, D.jobsTotal))}/${fmt(D.jobsTotal)}`;
  if ($('approvalModal').classList.contains('open')) renderApproval();
  if ($('budgetModal').classList.contains('open')) renderBudgetNumbers();
  renderAlerts();
  placeTicker();
  const days = S.nextElection - S.day;
  $('sVote').textContent = `${D.vote} % voto`;
  $('sVote').style.color = D.vote >= 50 ? '' : 'var(--accent)';
  $('sElection').textContent = days <= 1 ? 'elecciones mañana' : `elecciones en ${days} días`;
}

// persistent problem chips under the top bar; each one leads to its fix
function renderAlerts() {
  const out = [], d = D;
  if (d.emptyLots && !d.powerCap) out.push(['⚡', 'Sin central eléctrica no se muda nadie', 'power']);
  else if (!d.powerOk) out.push(['⚡', 'Apagones: la ciudad gasta más luz de la que produce', 'power']);
  else if (d.emptyLots && d.powerCap - d.powerUse < 5) out.push(['⚡', 'Red eléctrica al límite: la ciudad no puede crecer', 'power']);
  if (d.emptyLots && !d.waterCap) out.push(['💧', 'Sin torre de agua no se muda nadie', 'water']);
  else if (!d.waterOk) out.push(['💧', 'Grifos secos: falta agua', 'water']);
  else if (d.emptyLots && d.waterCap - d.waterUse < 4) out.push(['💧', 'Agua al límite: la ciudad no puede crecer', 'water']);
  if (S.money < 0) out.push(['📉', 'Números rojos: revisa el presupuesto', 'budget']);
  const key = out.map((a) => a[1]).join('|');
  if (key === renderAlerts.key) return;
  renderAlerts.key = key;
  $('alerts').innerHTML = out.map(([ic, text, fix]) => `<button class="alert" data-fix="${fix}">${ic} ${text} <b>Arreglar →</b></button>`).join('');
}
renderAlerts.key = null;
$('alerts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fix]');
  if (!b) return;
  if (b.dataset.fix === 'budget') openModal('budgetModal'); else selectTool(b.dataset.fix);
});

function openModal(id) {
  closeModals();
  $(id).classList.add('open');
  if (id === 'approvalModal') renderApproval();
  if (id === 'budgetModal') { S.budgetSeen = true; renderBudget(); if (D) checkTutorial(D); }
  if (id === 'politicsModal') renderPolitics();
  if (id === 'partyModal') renderParties();
  if (id === 'citizensModal') renderCitizens();
}
function closeModals() { document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open')); }
document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); }));
$('openApproval').onclick = () => openModal('approvalModal');
$('openBudget').onclick = () => openModal('budgetModal');
$('apToBudget').onclick = () => openModal('budgetModal');

function renderApproval() {
  const a = Math.round(S.approval), g = D.goal;
  $('apVal').textContent = `${a} %`;
  $('apVal').style.color = a >= 60 ? 'var(--green)' : a >= 40 ? '#d99a2b' : 'var(--accent)';
  $('apTrend').textContent = `${a === g ? 'estable' : a < g ? 'subiendo' : 'bajando'}, meta ${g} %`;
  $('apMark').style.left = `${g}%`;
  $('apGoalTitle').textContent = `Cómo se forma la meta de ${g} %`;
  $('apRows').innerHTML = D.rows.map(([ic, label, v]) => {
    const r = Math.round(v);
    return `<li class="${r < 0 ? 'neg' : ''}"><span>${ic}</span><span>${label}</span><b class="${r > 0 && label.indexOf('Base') ? 'pos' : ''}">${label.startsWith('Base') ? r : (r > 0 ? '+' : '') + r}</b></li>`;
  }).join('') + `<li class="total"><span></span><span>= meta</span><b>${g}</b></li>`
    + (D.pop ? '' : '<li><span>ℹ️</span><span class="note">Cuando lleguen los primeros vecinos verás aquí qué les gusta y qué no.</span><b></b></li>');
}

function renderBudget() {
  const taxRows = $('taxRows'), fundRows = $('fundRows');
  taxRows.innerHTML = '';
  for (const [z, Z] of Object.entries(ZONES)) {
    const row = el('div', 'slider');
    row.style.setProperty('--c', Z.color);
    row.innerHTML = `<label for="tax-${z}">${Z.label}</label><input id="tax-${z}" type="range" min="0" max="25" value="${S.taxes[z]}"><output>${S.taxes[z]} %</output><span data-tax="${z}"></span>`;
    row.querySelector('input').oninput = (e) => { S.taxes[z] = Number(e.target.value); row.querySelector('output').textContent = `${S.taxes[z]} %`; D = compute(); renderBudgetNumbers(); updateHud(); };
    taxRows.append(row);
  }
  fundRows.innerHTML = '';
  for (const [k, label, ic, c] of FUNDS) {
    const row = el('div', 'slider');
    row.style.setProperty('--c', c);
    row.innerHTML = `<label for="fund-${k}">${ic} ${label}</label><input id="fund-${k}" type="range" min="0" max="150" step="5" value="${S.funding[k]}"><output>${S.funding[k]} %</output><span data-fund="${k}"></span>`;
    row.querySelector('input').oninput = (e) => { S.funding[k] = Number(e.target.value); row.querySelector('output').textContent = `${S.funding[k]} %`; D = compute(); renderBudgetNumbers(); updateHud(); };
    fundRows.append(row);
  }
  renderBudgetNumbers();
}
function renderBudgetNumbers() {
  const f = D.fin;
  $('bIncome').textContent = signed(f.inc);
  $('bExpense').textContent = `−${fmt(f.exp)}`;
  $('bBalance').textContent = signed(f.net);
  $('bBalanceBox').className = f.net >= 0 ? 'ok' : 'bad';
  $('bBalanceNote').textContent = f.net >= 0 ? 'los fondos crecen' : 'los fondos bajan';
  document.querySelectorAll('[data-tax]').forEach((s) => (s.textContent = signed(f.income[s.dataset.tax])));
  document.querySelectorAll('[data-fund]').forEach((s) => (s.textContent = `−${fmt(f.expense[s.dataset.fund])}`));
  $('bTourism').textContent = signed(f.income.tourism);
  $('bLaws').textContent = `−${fmt(f.laws)}`;
  $('loanText').textContent = S.loan ? `Quedan ${money(S.loan.left)} por devolver (${money(S.loan.perDay)} al día).` : 'Recibes 25.000 € y devuelves 28.000 € en 20 días (12 %).';
  $('loanBtn').disabled = !!S.loan;
}
$('loanBtn').onclick = () => {
  if (S.loan) return;
  S.money += 25000;
  S.loan = { left: 28000, perDay: 1400 };
  news('El banco concede un préstamo de 25.000 € a la ciudad.');
  D = compute(); renderBudgetNumbers(); updateHud(); save();
};

/* politics: party, laws, elections */
const LEAN_LABEL = { '-1': ['Izquierda', '#d33a2f'], 0: ['Consenso', '#d99a2b'], 1: ['Derecha', '#3f6fb5'] };
$('openPolitics').onclick = () => openModal('politicsModal');
$('openCitizens').onclick = () => openModal('citizensModal');

function renderParties() {
  $('partyCards').innerHTML = Object.entries(PARTIES).map(([k, p]) => `
    <article class="party ${S.party === k ? 'on' : ''}" style="--c:${p.color}">
      <div class="party-head"><span class="party-icon">${p.icon}</span><div><b>${p.name}</b><small>${p.label}</small></div></div>
      <p>${p.pitch}</p>
      <button class="btn ${S.party === k ? '' : 'primary'}" data-party="${k}" ${S.party === k ? 'disabled' : ''}>${S.party === k ? 'Tu partido' : 'Presentarme con este partido'}</button>
    </article>`).join('');
  $('partyNote').textContent = S.party ? 'Cambiar de partido a mitad de mandato cuesta 10 puntos de aprobación: los vecinos no se fían de los chaqueteros.' : 'Podrás cambiar más adelante, pero tendrá un coste.';
}
$('partyCards').addEventListener('click', (e) => {
  const b = e.target.closest('[data-party]');
  if (!b) return;
  const k = b.dataset.party;
  if (S.party && !confirm(`¿Cambiarte a ${PARTIES[k].name}? Perderás 10 puntos de aprobación.`)) return;
  if (S.party) S.approval = Math.max(0, S.approval - 10);
  S.party = k;
  news(`${S.name}: la alcaldía se presenta con ${PARTIES[k].name}.`, 'POLÍTICA');
  D = compute(); updateHud(); save();
  openModal('politicsModal');
});

function renderPolitics() {
  const p = party(), hall = !!D.svc.cityhall, days = S.nextElection - S.day;
  $('polParty').innerHTML = S.party
    ? `<span class="party-icon" style="--c:${p.color}">${p.icon}</span><div><b>${p.name}</b><small>${p.label} · ${S.terms} ${S.terms === 1 ? 'mandato ganado' : 'mandatos ganados'}</small></div>`
    : '<span class="party-icon">❔</span><div><b>Sin partido</b><small>Te presentas como independiente</small></div>';
  $('polVote').textContent = `${D.vote} %`;
  $('polVote').className = D.vote >= 50 ? 'pos' : 'negc';
  $('polDays').textContent = days <= 0 ? 'hoy' : `en ${days} ${days === 1 ? 'día' : 'días'}`;
  $('polLean').innerHTML = `<span style="color:#d33a2f">${Math.round((1 - D.right) * 100)} % izq.</span> · <span style="color:#3f6fb5">${Math.round(D.right * 100)} % der.</span>`;
  $('polLeanBar').style.setProperty('--r', `${D.right * 100}%`);
  $('lawWarn').style.display = hall ? 'none' : '';
  $('lawList').innerHTML = LAWS.map((l) => {
    const on = law(l.id), [lean, c] = LEAN_LABEL[l.lean];
    const blocked = !on && (!hall || S.money < LAW_FEE);
    return `<article class="law ${on ? 'on' : ''}">
      <div class="law-head"><span class="ic">${l.icon}</span><b>${l.name}</b><span class="lean" style="--c:${c}">${lean}</span></div>
      <p>${l.effect}</p>
      <button class="btn ${on ? '' : 'primary'}" data-law="${l.id}" ${blocked ? 'disabled' : ''}>${on ? 'Derogar' : `Aprobar · ${money(LAW_FEE)}`}</button>
    </article>`;
  }).join('');
  $('polHistory').innerHTML = S.history.length
    ? S.history.slice(-6).reverse().map((h) => `<li><span>${h.won ? '🏆' : '❌'}</span><span>Día ${h.day}: ${h.won ? 'ganaste' : 'perdiste'}</span><b>${h.mine} %</b></li>`).join('')
    : '<li><span>🗳️</span><span class="note">Todavía no ha habido elecciones.</span><b></b></li>';
}
$('lawList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-law]');
  if (!b) return;
  const l = LAW_BY_ID[b.dataset.law];
  if (law(l.id)) { delete S.laws[l.id]; news(`El pleno deroga la ley: ${l.name.toLowerCase()}.`, 'POLÍTICA'); }
  else {
    if (!D.svc.cityhall || S.money < LAW_FEE) return;
    S.money -= LAW_FEE; S.laws[l.id] = S.day;
    news(`El pleno aprueba: ${l.name.toLowerCase()}.`, 'POLÍTICA');
  }
  D = compute(); checkTutorial(D); renderPolitics(); updateHud(); save();
});
$('polChangeParty').onclick = () => openModal('partyModal');

function showElection(r) {
  const rows = [[S.party || 'centro', r.mine, true], ...r.rivals.map(([k, v]) => [k, v, false])].sort((a, b) => b[1] - a[1]);
  $('elTitle').textContent = r.won ? '🏆 ¡Has ganado las elecciones!' : '❌ Has perdido las elecciones';
  $('elText').textContent = r.won
    ? `Los vecinos de ${S.name} te dan ${S.terms === 1 ? 'su confianza' : 'otro mandato'}. Próximas elecciones el día ${S.nextElection}.`
    : 'La oposición te deja seguir en funciones, pero tendrás que repetir elecciones en 5 días y pagar otra campaña.';
  $('elBars').innerHTML = rows.map(([k, v, me]) => `<div class="vote"><span>${PARTIES[k].icon} ${PARTIES[k].name}${me ? ' (tú)' : ''}</span>
    <div class="bar"><i style="width:${v}%;background:${PARTIES[k].color}"></i></div><b>${v} %</b></div>`).join('');
  $('elActions').innerHTML = r.won
    ? '<button class="btn primary" data-el="go">¡A gobernar!</button>'
    : '<button class="btn primary" data-el="again">Repetir campaña (−10.000 €)</button><button class="btn" data-el="new">Empezar otra ciudad</button>';
  openModal('electionModal');
}
$('elActions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-el]');
  if (!b) return;
  if (b.dataset.el === 'again') { S.money -= 10000; S.nextElection = S.day + 5; S.approval = Math.max(0, S.approval - 5); }
  if (b.dataset.el === 'new') { closeModals(); return void newCity(true); }
  closeModals(); setSpeed(lastSpeed || 1); updateHud(); save();
});

/* citizens */
function citizenQuotes(d) {
  const out = [], add = (good, text) => out.push([good, text]);
  const unemployed = d.workers ? 1 - d.employed / d.workers : 0;
  if (d.cov.health < 0.5) add(0, 'El centro de salud me pilla lejísimos. Si me pongo mala, ¿qué hago?'); else add(1, 'Tener el médico a dos calles es una tranquilidad.');
  if (d.cov.school < 0.5) add(0, 'Mis hijos tardan media hora en llegar al colegio.'); else add(1, 'El colegio del barrio es estupendo.');
  if (d.cov.police < 0.5) add(0, 'Por la noche no me atrevo a salir: no se ve un policía.');
  if (d.cov.fire < 0.5) add(0, 'Si hay un incendio, ¿cuánto tardarán los bomberos?');
  if (d.cov.park < 0.5) add(0, 'Echo de menos un parque para sacar al perro.');
  if (d.pop > 100 && d.cov.leisure < 0.3) add(0, 'Aquí no hay nada que hacer el fin de semana.');
  if (d.cov.leisure >= 0.5) add(1, D.svc.zoo ? '¡Los domingos llevamos a los niños al zoo!' : D.svc.stadium ? 'Los partidos en el estadio son lo mejor de la semana.' : 'Qué ambiente hay en la plaza por las tardes.');
  if (d.smoke > 0.2) add(0, 'El humo de las fábricas me hace toser.');
  if (!d.powerOk) add(0, 'Otra vez sin luz. ¡Así no se puede vivir!');
  if (!d.waterOk) add(0, 'Hoy no ha salido agua del grifo.');
  if (unemployed > 0.1) add(0, 'Llevo meses buscando trabajo y nada.'); else if (d.pop) add(1, 'He encontrado trabajo cerca de casa.');
  if (Object.values(S.taxes).some((t) => t > party().taxLimit)) add(0, 'Con estos impuestos no llego a fin de mes.');
  if (S.money < 0) add(0, 'Dicen que el ayuntamiento está en la ruina…');
  const lawQuotes = {
    transporte: [1, 'Con el bus gratis me ahorro un dineral.'], sanidad: [1, 'Me atendieron sin pagar nada. Así da gusto.'],
    educacion: [1, 'Este año los libros del cole nos han salido gratis.'], alquiler: [1, 'Por fin un alquiler que puedo pagar.'],
    verde: [1, 'Me encanta que la ciudad apueste por las renovables.'], empresas: [1, 'He abierto mi negocio gracias a la rebaja fiscal.'],
    manodura: [1, 'Ahora se ve policía en cada esquina.'], privatizar: [0, 'Desde que privatizaron, todo va más lento.'],
    industria: [0, 'Han abierto otra fábrica al lado de casa. Qué peste.'], horarios: [1, 'Poder comprar un domingo es una maravilla.'],
    turismo: [1, 'Mi bar se llena de turistas.'], reciclaje: [1, 'Las calles están más limpias que nunca.'],
    silencio: [1, 'Por fin duermo sin ruido.'], fiestas: [1, '¡Qué fiestas más bonitas este año!'],
  };
  for (const l of LAWS) if (law(l.id)) add(...lawQuotes[l.id]);
  const r = rng(S.day * 31 + Math.floor(d.pop / 50));
  return out.sort(() => r() - 0.5).slice(0, 6).map(([good, text]) => [good, `${pick(r, NAMES)}, ${18 + Math.floor(r() * 60)}`, text]);
}
function renderCitizens() {
  const d = D, kids = Math.round(d.pop * 0.2), old = Math.round(d.pop * 0.18), adults = d.pop - kids - old;
  const unemployed = Math.max(0, Math.round(d.workers - d.employed));
  $('ctPop').textContent = fmt(d.pop);
  $('ctJobs').textContent = fmt(d.employed);
  $('ctUnemp').textContent = `${fmt(unemployed)} (${d.workers ? Math.round((unemployed / d.workers) * 100) : 0} %)`;
  $('ctAges').innerHTML = [['🧒 Niños', kids, '#f0cf60'], ['🧑 Adultos', adults, '#6aaeea'], ['🧓 Mayores', old, '#a58cef']].map(([l, v, c]) =>
    `<div class="vote"><span>${l}</span><div class="bar"><i style="width:${d.pop ? (v / d.pop) * 100 : 0}%;background:${c}"></i></div><b>${fmt(v)}</b></div>`).join('')
    + `<p class="note">${fmt(Math.round(kids * d.cov.school))} de ${fmt(kids)} niños tienen escuela cerca.</p>`;
  $('ctLean').innerHTML = `<div class="lean-bar" style="--r:${d.right * 100}%"><i></i></div>
    <p class="note"><span style="color:#d33a2f">${Math.round((1 - d.right) * 100)} % votaría izquierda</span> · <span style="color:#3f6fb5">${Math.round(d.right * 100)} % derecha</span>. Las ciudades con muchas oficinas e industria tiran a la derecha; las que tienen buenos servicios, a la izquierda.</p>`;
  $('ctQuotes').innerHTML = d.pop
    ? citizenQuotes(d).map(([good, who, text]) => `<li class="${good ? '' : 'neg'}"><span>${good ? '😊' : '😠'}</span><span><i class="serif">«${text}»</i><br><small class="note">${who} años</small></span><b></b></li>`).join('')
    : '<li><span>🏡</span><span class="note">Todavía no vive nadie aquí.</span><b></b></li>';
}

/* menu */
$('menuBtn').onclick = (e) => { e.stopPropagation(); $('menu').classList.toggle('open'); };
addEventListener('click', (e) => { if (!e.target.closest('#menu')) $('menu').classList.remove('open'); });
$('renameCity').onclick = () => {
  const name = prompt('¿Cómo se llama tu ciudad?', S.name);
  if (name && name.trim()) { S.name = name.trim().slice(0, 28); updateHud(); save(); }
};
$('gfxSel').innerHTML = Object.entries(GFX_LEVELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('gfxSel').value = gfx;
$('gfxSel').onchange = (e) => { try { localStorage.setItem(GFX_KEY, e.target.value); } catch { /* storage unavailable */ } applyGfx(e.target.value); };
$('styleSel').innerHTML = Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
$('styleSel').value = S.style;
$('styleSel').onchange = (e) => {
  S.style = e.target.value;
  setStyle(S.style);
  for (let c = 0; c < chunks.length; c++) dirtyChunks.add(c);
  news(`${S.name} adopta el estilo ${STYLES[S.style].label.toLowerCase()}.`, 'CIUDAD');
  save();
};
function newCity(skipConfirm = false) {
  if (!skipConfirm && !confirm('¿Empezar una ciudad nueva? Se perderá la actual.')) return;
  S = newState();
  setStyle(S.style);
  $('styleSel').value = S.style;
  rebuildAll(); agents.length = 0; walkers.length = 0; undoStack.length = 0; fireDirty = true;
  D = compute(); setSpeed(1); renderAdvisor(); updateHud(); save();
  news('Una nueva ciudad empieza hoy. ¡Suerte, alcaldía!');
  openModal('partyModal');
}
$('newCity').onclick = () => newCity();
$('undoBtn').onclick = undo;
for (const [id, modal] of [['menuBudget', 'budgetModal'], ['menuPolitics', 'politicsModal'], ['menuCitizens', 'citizensModal']]) $(id).onclick = () => openModal(modal);
$('exportCity').onclick = () => {
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${S.name.replace(/[^\w-]+/g, '_')}-dia${S.day}.urbania.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('importCity').onclick = () => $('importFile').click();
$('importFile').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let next = null;
  try { next = fromSave(JSON.parse(await file.text())); } catch { /* not JSON */ }
  if (!next) return news('Ese archivo no es una partida de Urbania.', 'AVISO');
  S = next; setStyle(S.style); $('styleSel').value = S.style;
  undoStack.length = 0; agents.length = 0; walkers.length = 0;
  rebuildAll(); D = compute(); fireDirty = true; setSpeed(S.speed || 1); renderAdvisor(); updateHud(); save();
  news(`Partida cargada: ${S.name}, día ${S.day}.`, 'AJUSTES');
};

/* ---------------------------------------------------------------- living details */
/* ---------------------------------------------------------------- traffic: cars, buses, vans, trucks, emergency vehicles */
// One InstancedMesh per vehicle shape (body tinted per instance) plus one for its headlights.
function vehicleType(cap, build) {
  const b = new Builder();
  build(b);
  const g = b.build(true), [body, lights] = g.children;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true });
  const mesh = new THREE.InstancedMesh(body.geometry, mat, cap);
  const glow = new THREE.InstancedMesh(lights.geometry, glowMat, cap);
  for (const m of [mesh, glow]) { m.count = 0; m.castShadow = m === mesh; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
  return { mesh, glow, list: [] };
}
const WHITE = 0xffffff, GLASS = 0x2e3a48, TYRE = 0x222222, LAMP = 0xfff2c4;
const VEH = {
  car: vehicleType(220, (b) => {
    b.box(0, 0.018, 0, 0.075, 0.042, 0.14, WHITE).box(0, 0.06, -0.012, 0.066, 0.036, 0.075, GLASS);
    for (const [x, z] of [[-0.036, 0.045], [0.036, 0.045], [-0.036, -0.045], [0.036, -0.045]]) b.box(x, 0, z, 0.012, 0.026, 0.026, TYRE);
    b.box(-0.025, 0.03, 0.071, 0.016, 0.012, 0.004, LAMP, 1).box(0.025, 0.03, 0.071, 0.016, 0.012, 0.004, LAMP, 1);
  }),
  van: vehicleType(50, (b) => {
    b.box(0, 0.02, -0.03, 0.082, 0.1, 0.15, WHITE).box(0, 0.02, 0.07, 0.08, 0.07, 0.06, WHITE).box(0, 0.06, 0.1, 0.07, 0.03, 0.004, GLASS);
    b.box(-0.026, 0.035, 0.101, 0.016, 0.012, 0.004, LAMP, 1).box(0.026, 0.035, 0.101, 0.016, 0.012, 0.004, LAMP, 1);
  }),
  truck: vehicleType(30, (b) => {
    b.box(0, 0.02, -0.035, 0.09, 0.11, 0.2, WHITE).box(0, 0.02, 0.1, 0.088, 0.09, 0.07, WHITE).box(0, 0.075, 0.136, 0.078, 0.03, 0.004, GLASS);
    b.box(0, 0.13, -0.035, 0.03, 0.012, 0.19, 0xd8d2c4);
    b.box(-0.03, 0.04, 0.137, 0.016, 0.012, 0.004, LAMP, 1).box(0.03, 0.04, 0.137, 0.016, 0.012, 0.004, LAMP, 1);
  }),
  bus: vehicleType(30, (b) => {
    b.box(0, 0.02, 0, 0.088, 0.105, 0.34, WHITE).box(0, 0.07, 0, 0.09, 0.035, 0.32, GLASS).box(0, 0.07, 0.17, 0.08, 0.035, 0.004, GLASS);
    b.box(0, 0.125, 0, 0.07, 0.01, 0.2, 0xe8e4dc);
    b.box(-0.03, 0.04, 0.171, 0.018, 0.012, 0.004, LAMP, 1).box(0.03, 0.04, 0.171, 0.018, 0.012, 0.004, LAMP, 1);
  }),
};
const VEH_SCALE = 1.8; // vehicles are modelled small; this brings them to the scale of the houses
const sirens = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.016, 0.02), new THREE.MeshBasicMaterial(), 40);
sirens.count = 0; sirens.frustumCulled = false; scene.add(sirens);
const CAR_COLOURS = [0xd8342a, 0x2f5fb5, 0xf2efe6, 0x3b3f46, 0xe0a83a, 0x4f9a5a, 0x8a5fbf, 0x9aa0a6, 0xf2efe6, 0x2b2b2b];
const SIREN_RED = new THREE.Color(0xff3b30), SIREN_BLUE = new THREE.Color(0x3d7bff), SIREN_OFF = new THREE.Color(0x555555);
// role -> vehicle shape, colour, speed, siren roof height
const ROLES = {
  car: { type: 'car', speed: 1.1 }, taxi: { type: 'car', colour: 0xf0c419, speed: 1.15 },
  delivery: { type: 'van', speed: 0.9 }, garbage: { type: 'truck', colour: 0x4f9a5a, speed: 0.55 },
  bus: { type: 'bus', speed: 0.75 }, police: { type: 'car', colour: 0x2f4f8f, speed: 1.3, siren: 0.1 },
  ambulance: { type: 'van', colour: 0xf4f4f4, speed: 1.3, siren: 0.13 }, fire: { type: 'truck', colour: 0xd8342a, speed: 1.2, siren: 0.15 },
};

function roadNeighbours(i) {
  const x = i % N, z = (i / N) | 0;
  return DIRS.map(([dx, dz]) => [x + dx, z + dz]).filter(([a, b]) => isRoad(a, b)).map(([a, b]) => I(a, b));
}
const isJunction = (i) => roadNeighbours(i).length >= 3;

const agents = [];
let roadCache = null, roadCacheKey = -1, trafficClock = 0;
function roadTiles() {
  if (roadCacheKey !== D.roads) {
    roadCache = S.tiles.map((T, i) => (T.t === 'road' && roadNeighbours(i).length ? i : -1)).filter((i) => i >= 0);
    roadCacheKey = D.roads;
  }
  return roadCache;
}
function nearestRoad(x, z) {
  for (let r = 1; r <= 3; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++)
    if (isRoad(x + dx, z + dz) && roadNeighbours(I(x + dx, z + dz)).length) return I(x + dx, z + dz);
  return -1;
}
function spawn(role, at = -1) {
  const roads = roadTiles();
  if (!roads.length) return;
  const from = at >= 0 ? at : pick(Math.random, roads), opts = roadNeighbours(from);
  if (!opts.length) return;
  const R = ROLES[role];
  agents.push({ role, from, to: pick(Math.random, opts), t: Math.random() * 0.5, v: R.speed * (0.85 + Math.random() * 0.3), wait: 0,
    colour: new THREE.Color(R.colour ?? (role === 'bus' ? pick(Math.random, [0xd8342a, 0xe0a83a, 0x3f9a5a]) : role === 'delivery' ? pick(Math.random, [0xf2efe6, 0xe0a83a, 0x3f6fb5]) : pick(Math.random, CAR_COLOURS))),
    alarm: Math.random() < 0.35 });
}
function wanted(d) {
  const h = S.minutes / 60, rush = (h >= 7 && h < 9.5) || (h >= 17 && h < 19.5);
  const dayF = rush ? 1 : h >= 6 && h < 22 ? 0.7 : 0.25;
  const depots = d.svc.bus || 0;
  const cars = d.pop ? Math.min(200, Math.round((d.roads / 3 + d.pop / 18) * dayF * (law('transporte') ? 0.6 : 1) * (depots ? 0.85 : 1))) : 0;
  return {
    car: Math.round(cars * 0.9), taxi: Math.round(cars * 0.1),
    delivery: !d.pop ? 0 : h >= 6 && h < 21 ? Math.min(45, Math.round((d.jobs.com + d.jobs.ind) / 35)) : 2,
    garbage: d.pop > 60 && h >= 5 && h < 11 ? Math.min(6, Math.ceil(d.pop / 500)) : 0,
    bus: Math.min(30, depots * 3 * (law('transporte') ? 2 : 1) * (h >= 1 && h < 5 ? 0.5 : 1)),
    police: (d.svc.police || 0) * 2, ambulance: d.svc.health || 0, fire: d.svc.fire || 0,
  };
}
function stationOf(role) {
  const kind = { police: 'police', ambulance: 'health', fire: 'fire', bus: 'bus', garbage: 'water' }[role];
  if (!kind) return -1;
  const list = D.svcList.filter(([s]) => s === kind);
  if (!list.length) return -1;
  const [, x, z] = pick(Math.random, list);
  return nearestRoad(x, z);
}
function updateTraffic(dt) {
  if (!D) return;
  const want = wanted(D), have = {};
  for (const a of agents) have[a.role] = (have[a.role] || 0) + 1;
  for (const role of Object.keys(ROLES)) {
    const n = have[role] || 0, w = Math.floor(want[role]);
    if (n < w) for (let k = n; k < Math.min(w, n + 6); k++) spawn(role, stationOf(role));
    else if (n > w) agents.splice(agents.findIndex((a) => a.role === role), 1);
  }
  const k = S.speed ? Math.min(3, S.speed) : 0;
  trafficClock += dt * k;
  const greenX = Math.floor(trafficClock / 4) % 2 === 0;
  for (const T of Object.values(VEH)) T.list.length = 0;
  let sirenN = 0;
  for (let n = agents.length - 1; n >= 0; n--) {
    const a = agents[n], R = ROLES[a.role];
    if (S.tiles[a.from].t !== 'road' || S.tiles[a.to].t !== 'road') { agents.splice(n, 1); continue; }
    const dx = (a.to % N) - (a.from % N), dz = ((a.to / N) | 0) - ((a.from / N) | 0);
    let step = dt * a.v * k * (a.path ? 1.6 : 1);
    if (a.wait > 0) { a.wait -= dt * k; step = 0; }
    // stop at red lights before junctions (emergency vehicles on call ignore them)
    const red = isJunction(a.to) && (dx !== 0) !== greenX && !(R.siren && a.alarm);
    if (red && a.t < 0.55 && a.t + step >= 0.55) { a.t = 0.55; step = 0; }
    else if (red && a.t === 0.55) step = 0;
    a.t += step;
    if (a.t >= 1) {
      if (a.role === 'bus' && isBusStop(a.to % N, (a.to / N) | 0)) a.wait = 2.5;
      if (a.path) {
        if (!a.path.length) engineArrived(a);
        else { const next = a.path.shift(); a.from = a.to; a.to = S.tiles[next]?.t === 'road' ? next : a.from; a.t = 0; if (a.to === a.from) a.path = null; }
      }
      if (a.path) { /* on a mission: route already chosen */ } else {
      if (R.siren && Math.random() < 0.04) a.alarm = !a.alarm;
      const opts = roadNeighbours(a.to).filter((o) => o !== a.from);
      a.from = a.to; a.to = opts.length ? pick(Math.random, opts) : a.from; a.t = 0;
      if (a.to === a.from) { const back = roadNeighbours(a.from); if (back.length) a.to = back[0]; }
      }
    }
    const fx = W(a.from % N), fz = W((a.from / N) | 0), tx = W(a.to % N), tz = W((a.to / N) | 0);
    const ddx = tx - fx, ddz = tz - fz, len = Math.hypot(ddx, ddz) || 1;
    const y = (WATER[a.from] || WATER[a.to] ? 0.1 : 0) + 0.025;
    _v.set(fx + ddx * a.t - (ddz / len) * 0.2, y, fz + ddz * a.t + (ddx / len) * 0.2);
    _m.compose(_v, _q.setFromEuler(_e.set(0, Math.atan2(ddx, ddz), 0)), _s.set(VEH_SCALE, VEH_SCALE, VEH_SCALE));
    const T = VEH[R.type], idx = T.list.length;
    T.list.push(a);
    T.mesh.setMatrixAt(idx, _m); T.glow.setMatrixAt(idx, _m); T.mesh.setColorAt(idx, a.colour);
    if (R.siren && sirenN < 40) {
      const m2 = _m.clone().multiply(new THREE.Matrix4().makeTranslation(0, R.siren, 0));
      sirens.setMatrixAt(sirenN, m2);
      const flash = Math.floor(performance.now() / 180 + n) % 2;
      sirens.setColorAt(sirenN, a.alarm ? (flash ? SIREN_RED : SIREN_BLUE) : SIREN_OFF);
      sirenN++;
    }
  }
  for (const T of Object.values(VEH)) {
    T.mesh.count = T.glow.count = T.list.length;
    T.mesh.instanceMatrix.needsUpdate = T.glow.instanceMatrix.needsUpdate = true;
    if (T.mesh.instanceColor) T.mesh.instanceColor.needsUpdate = true;
  }
  sirens.count = sirenN;
  sirens.instanceMatrix.needsUpdate = true;
  if (sirens.instanceColor) sirens.instanceColor.needsUpdate = true;
}

/* boats on the river and birds in the sky */
const boats = [];
for (let k = 0; k < 5; k++) {
  const b = new Builder(), sail = k % 2 === 0;
  b.box(0, -0.02, 0, 0.12, 0.05, 0.3, pick(Math.random, [0xf2efe6, 0xd8342a, 0x3f6fb5])).box(0, 0.03, -0.03, 0.1, 0.012, 0.22, 0xb9864f);
  if (sail) b.box(0, 0.04, 0, 0.01, 0.34, 0.01, 0x7a5638).add(GEO.gable, 0xf8f6f0, 0, 0.08, 0.02, 0.004, 0.28, 0.16, Math.PI / 2);
  else b.box(0, 0.04, -0.04, 0.08, 0.07, 0.1, 0xf2efe6).box(0, 0.07, 0.01, 0.082, 0.025, 0.04, GLASS);
  const g = b.build(true);
  scene.add(g);
  boats.push({ g, x: -30 + k * 22, dir: k % 2 ? 1 : -1, v: 0.6 + Math.random() * 0.5, lane: (k % 2 ? 1 : -1) * 0.45 });
}
function updateBoats(dt) {
  const k = S.speed ? Math.min(3, S.speed) : 0.3;
  for (const b of boats) {
    b.x += dt * b.v * b.dir * k;
    if (b.x > N + 40 || b.x < -40) b.dir *= -1;
    const z = riverZ(b.x), dz = riverZ(b.x + 0.1) - z;
    b.g.position.set(b.x - HALF, 0.02 + Math.sin(performance.now() / 600 + b.x) * 0.006, z - HALF + b.lane);
    b.g.rotation.y = Math.atan2(0.1 * b.dir, dz * b.dir);
  }
}
const BIRDS = 27;
const birds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.008, 0.05), new THREE.MeshStandardMaterial({ color: 0x3b3f46 }), BIRDS);
birds.frustumCulled = false;
scene.add(birds);
const flocks = [0, 1, 2].map((f) => ({ cx: (f - 1) * 14, cz: (f - 1) * 8, r: 10 + f * 4, a: f * 2, y: 5 + f * 1.5, v: 0.08 + f * 0.02 }));
function updateBirds(dt) {
  const tNow = performance.now() / 1000;
  flocks.forEach((f, fi) => {
    f.a += dt * f.v;
    const x = f.cx + Math.cos(f.a) * f.r, z = f.cz + Math.sin(f.a) * f.r, heading = -f.a;
    for (let k = 0; k < 9; k++) {
      const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
      const ox = k ? side * row * 0.35 : 0, oz = -row * 0.35;
      const c = Math.cos(heading), s = Math.sin(heading);
      const flap = 0.55 + Math.abs(Math.sin(tNow * 9 + k + fi)) * 0.45;
      _m.compose(_v.set(x + ox * c - oz * s, f.y + Math.sin(tNow + k) * 0.08, z + ox * s + oz * c), _q.setFromEuler(_e.set(0, heading, 0)), _s.set(flap, 1, 1));
      birds.setMatrixAt(fi * 9 + k, _m);
    }
  });
  birds.instanceMatrix.needsUpdate = true;
}

// pedestrians walk along the pavements of the road network
const PEOPLE = 240, SKIN = [0xf1c9a5, 0xd9a47a, 0x9a6a4a, 0x6b4a33], CLOTHES = [0xd8342a, 0x2f5fb5, 0x4f9a5a, 0xe0a83a, 0x8a5fbf, 0x3b3f46, 0xf2efe6];
const peopleMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.022, 0.05, 2, 6).translate(0, 0.047, 0),
  new THREE.MeshStandardMaterial({ roughness: 0.8 }), PEOPLE);
const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 4).translate(0, 0.105, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), PEOPLE);
for (const m of [peopleMesh, headMesh]) { m.castShadow = true; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
const walkers = [];
function updatePeople(dt) {
  if (!D) return;
  const h = S.minutes / 60, target = D.pop ? Math.min(PEOPLE, Math.floor((D.pop / 5) * (h >= 7 && h < 22 ? 1 : 0.3)) + 4) : 0;
  if (walkers.length < target) {
    const roads = S.tiles.map((T, i) => (T.t === 'road' && !WATER[i] ? i : -1)).filter((i) => i >= 0 && roadNeighbours(i).length);
    if (roads.length) {
      const from = pick(Math.random, roads), k = walkers.length;
      walkers.push({ from, to: pick(Math.random, roadNeighbours(from)), t: Math.random(), side: Math.random() < 0.5 ? 1 : -1, v: 0.18 + Math.random() * 0.12, phase: Math.random() * 6 });
      peopleMesh.setColorAt(k, _c.set(pick(Math.random, CLOTHES)));
      headMesh.setColorAt(k, _c.set(pick(Math.random, SKIN)));
      peopleMesh.instanceColor.needsUpdate = headMesh.instanceColor.needsUpdate = true;
    }
  } else if (walkers.length > target) walkers.pop();
  const k = S.speed ? Math.min(3, S.speed) : 0;
  walkers.forEach((w, n) => {
    w.t += dt * w.v * k;
    if (w.t >= 1 || S.tiles[w.to].t !== 'road') {
      if (S.tiles[w.to].t !== 'road' || S.tiles[w.from].t !== 'road') { w.t = 1.01; return; }
      const opts = roadNeighbours(w.to).filter((o) => o !== w.from && !WATER[o]);
      w.from = w.to; w.to = opts.length ? pick(Math.random, opts) : w.from; w.t = 0;
    }
    const fx = W(w.from % N), fz = W((w.from / N) | 0), tx = W(w.to % N), tz = W((w.to / N) | 0);
    const dx = tx - fx, dz = tz - fz, len = Math.hypot(dx, dz) || 1, off = 0.43 * w.side;
    const bob = Math.abs(Math.sin((w.phase += dt * 9 * k))) * 0.01;
    _m.compose(_v.set(fx + dx * w.t - (dz / len) * off, 0.045 + bob, fz + dz * w.t + (dx / len) * off), _q.setFromEuler(_e.set(0, Math.atan2(dx, dz), 0)), _s.set(1.3, 1.3, 1.3));
    peopleMesh.setMatrixAt(n, _m); headMesh.setMatrixAt(n, _m);
  });
  peopleMesh.count = headMesh.count = walkers.length;
  peopleMesh.instanceMatrix.needsUpdate = headMesh.instanceMatrix.needsUpdate = true;
}

const smokeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const puffs = [];
for (let k = 0; k < 140; k++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xe8e4dc, transparent: true, depthWrite: false, opacity: 0 }));
  s.visible = false; scene.add(s); puffs.push({ s, life: 0 });
}
let emitClock = 0;
function updateSmoke(dt) {
  if (emittersDirty) {
    emitters = [];
    for (const ch of chunks) emitters.push(...ch.smoke);
    emittersDirty = false;
  }
  emitClock += dt * (S.speed ? 1 : 0.2);
  while (emitClock > 0.12 && emitters.length) {
    emitClock -= 0.12;
    const p = puffs.find((q) => q.life <= 0);
    if (!p) break;
    p.s.position.copy(pick(Math.random, emitters));
    p.life = 1; p.s.visible = true;
  }
  for (const p of puffs) {
    if (p.life <= 0) continue;
    p.life -= dt * 0.35;
    p.s.position.y += dt * 0.35; p.s.position.x += dt * 0.12;
    const sc = 0.2 + (1 - p.life) * 0.7;
    p.s.scale.set(sc, sc, sc);
    p.s.material.opacity = Math.max(0, p.life) * 0.55;
    if (p.life <= 0) p.s.visible = false;
  }
}

/* fires: buildings occasionally catch fire; fire engines drive there along the shortest road route */
const FIRE_HOURS = 5;
const FIRE_HEIGHT = { res: [0, 0.35, 0.65, 1.4], com: [0, 0.4, 0.62, 0.75], off: [0, 0.75, 1.45, 2.4], ind: [0, 0.4, 0.5, 0.55] };
function roadPath(from, to) {
  const prev = new Map([[from, -1]]), queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const n of roadNeighbours(cur)) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
  }
  if (!prev.has(to)) return null;
  const path = [];
  for (let c = to; c !== from; c = prev.get(c)) path.unshift(c);
  return path;
}
function fireCovered(x, z) {
  return D.svcList.some(([s, sx, sz]) => s === 'fire' && Math.hypot(sx - x, sz - z) <= radiusOf('fire'));
}
function fireTick(d) {
  let burning = 0;
  S.tiles.forEach((T, i) => {
    if (!(T.fire > 0)) return;
    burning++;
    T.fire--;
    const x = i % N, z = (i / N) | 0;
    // an engine on its way always makes it within the station's radius
    if (!T.saved && T.fire <= 2 && fireCovered(x, z)) T.saved = true;
    if (T.fire <= 0) {
      T.fire = 0;
      if (T.saved) { news('Los bomberos apagan el incendio a tiempo. No hay heridos.', 'SUCESOS'); }
      else {
        news(`El fuego destruye un edificio de ${S.name}. Los vecinos piden un parque de bomberos.`, 'SUCESOS');
        T.lv = 0; T.prev = 0; T.build = 0; T.ruin = S.day + 2;
        S.burnDay = S.day;
      }
      T.saved = false;
      refreshTile(i);
      fireDirty = true;
    } else if (T.saved && T.fire > 1) T.fire = 1;
  });
  if (burning >= 2 || !d.pop) return;
  const cand = [];
  S.tiles.forEach((T, i) => { if (T.t === 'zone' && T.lv > 0 && !(T.build > 0) && !(T.fire > 0)) cand.push(i); });
  for (const i of cand) {
    const x = i % N, z = (i / N) | 0, covered = fireCovered(x, z);
    // ~1 fire every 2–3 days in a city of 200 buildings; fire cover makes it three times rarer
    const risk = 0.00008 * (covered ? 0.3 : 1) * (S.tiles[i].z === 'ind' ? 2 : 1) * (law('industria') ? 1.5 : 1);
    if (Math.random() >= risk) continue;
    startFire(i, covered);
    break;
  }
}
function startFire(i, covered) {
  const T = S.tiles[i], x = i % N, z = (i / N) | 0;
  T.fire = FIRE_HOURS; T.saved = false;
  fireDirty = true;
  const names = { res: 'una vivienda', com: 'un comercio', off: 'unas oficinas', ind: 'una fábrica' };
  news(`🔥 Incendio en ${names[T.z]}${covered ? '. Los bomberos ya van de camino.' : ' y no hay bomberos cerca.'}`, 'SUCESOS');
  if (!covered) return;
  const goal = nearestRoad(x, z);
  const engines = agents.filter((a) => a.role === 'fire');
  if (goal < 0 || !engines.length) { T.saved = true; return; }
  let best = null, bestLen = Infinity;
  for (const a of engines) { const p = roadPath(a.to, goal); if (p && p.length < bestLen) { best = a; bestLen = p.length; best.plan = p; } }
  if (!best) { T.saved = true; return; }
  best.path = best.plan; best.alarm = true; best.target = i;
}
// called by traffic when an engine on a mission reaches the end of its route
function engineArrived(a) {
  const T = S.tiles[a.target];
  if (T && T.fire > 0) { T.saved = true; T.fire = Math.min(T.fire, 1); }
  a.path = null; a.target = -1; a.wait = 3;
}

const flameTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 40, 2, 32, 34, 30);
  grd.addColorStop(0, 'rgba(255,240,180,1)'); grd.addColorStop(0.35, 'rgba(255,150,40,0.9)'); grd.addColorStop(1, 'rgba(220,40,10,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const flames = [], blackSmoke = [];
for (let k = 0; k < 60; k++) {
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  f.visible = false; scene.add(f); flames.push({ s: f, life: 0 });
  const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x3b3a38, transparent: true, depthWrite: false, opacity: 0 }));
  sm.visible = false; scene.add(sm); blackSmoke.push({ s: sm, life: 0 });
}
let fireDirty = true, fireSpots = [], fireClock = 0;
function updateFires(dt) {
  if (fireDirty) {
    fireSpots = [];
    S.tiles.forEach((T, i) => {
      if (T.fire > 0) fireSpots.push(new THREE.Vector3(W(i % N), FIRE_HEIGHT[T.z][T.lv] || 0.4, W((i / N) | 0)));
    });
    fireDirty = false;
  }
  fireClock += dt;
  while (fireClock > 0.05 && fireSpots.length) {
    fireClock -= 0.05;
    const at = pick(Math.random, fireSpots);
    const f = flames.find((q) => q.life <= 0), sm = Math.random() < 0.4 && blackSmoke.find((q) => q.life <= 0);
    if (f) { f.s.position.set(at.x + (Math.random() - 0.5) * 0.4, at.y * (0.4 + Math.random() * 0.7), at.z + (Math.random() - 0.5) * 0.4); f.life = 1; f.s.visible = true; }
    if (sm) { sm.s.position.set(at.x, at.y + 0.1, at.z); sm.life = 1; sm.s.visible = true; }
  }
  if (!fireSpots.length) fireClock = 0;
  for (const f of flames) {
    if (f.life <= 0) continue;
    f.life -= dt * 1.6;
    f.s.position.y += dt * 0.5;
    const sc = 0.12 + f.life * 0.22;
    f.s.scale.set(sc, sc * 1.4, sc);
    f.s.material.opacity = Math.max(0, f.life);
    if (f.life <= 0) f.s.visible = false;
  }
  for (const p of blackSmoke) {
    if (p.life <= 0) continue;
    p.life -= dt * 0.3;
    p.s.position.y += dt * 0.6; p.s.position.x += dt * 0.15;
    const sc = 0.3 + (1 - p.life) * 1.1;
    p.s.scale.set(sc, sc, sc);
    p.s.material.opacity = Math.max(0, p.life) * 0.7;
    if (p.life <= 0) p.s.visible = false;
  }
}

const RAIN = 1400;
const rain = (() => {
  const pos = new Float32Array(RAIN * 6);
  for (let k = 0; k < RAIN; k++) {
    const x = (Math.random() - 0.5) * 50, y = Math.random() * 22, z = (Math.random() - 0.5) * 50;
    pos.set([x, y, z, x + 0.05, y - 0.45, z], k * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xdfe8ef, transparent: true, opacity: 0.55 }));
  l.visible = false; l.frustumCulled = false; scene.add(l);
  return l;
})();
function updateRain(dt) {
  rain.visible = S.weather === 'rain';
  if (!rain.visible) return;
  rain.position.set(controls.target.x, 0, controls.target.z);
  const p = rain.geometry.attributes.position;
  for (let k = 0; k < RAIN; k++) {
    let y = p.array[k * 6 + 1] - dt * 14;
    if (y < 0) y += 22;
    p.array[k * 6 + 1] = y; p.array[k * 6 + 4] = y - 0.45;
  }
  p.needsUpdate = true;
}

/* ---------------------------------------------------------------- day / night lighting */
const tmpSky = new THREE.Color(), tmpTop = new THREE.Color(), HEMI_DAY = new THREE.Color(0xe6f1ff);
function updateLighting() {
  const h = S.minutes / 60, ang = ((h - 6) / 12) * Math.PI, elev = Math.sin(ang);
  const day = clamp(elev * 1.6 + 0.15, 0, 1), dusk = clamp(1 - Math.abs(elev) * 3, 0, 1) * (elev > -0.2 ? 1 : 0);
  const wet = S.weather === 'rain' ? 1 : 0;
  sun.position.set(Math.cos(ang) * 40, Math.max(8, elev * 50), 22);
  sun.intensity = (0.5 + 1.95 * day) * (wet ? 0.55 : 1);
  sun.color.setHex(0x9fb4ff).lerp(new THREE.Color(0xfff0d4), day).lerp(new THREE.Color(0xffb27a), dusk * 0.7);
  hemi.intensity = 0.5 + 0.7 * day;
  hemi.color.setHex(0x8fa6d8).lerp(HEMI_DAY, day);
  tmpSky.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.6);
  tmpTop.copy(TOP_NIGHT).lerp(TOP_DAY, day).lerp(TOP_DUSK, dusk * 0.5);
  if (wet) { tmpSky.lerp(SKY_RAIN, 0.6 * day); tmpTop.lerp(TOP_RAIN, 0.7 * day); }
  sky.material.uniforms.horizon.value.copy(tmpSky);
  sky.material.uniforms.top.value.copy(tmpTop);
  scene.fog.color.copy(tmpSky);
  const night = clamp(1 - day * 1.4, 0, 1);
  glowMat.emissiveIntensity = night * 0.95;
  bloom.strength = 0.12 + night * 0.75;
  bloom.threshold = 0.95 - night * 0.12;
  const w = waterMat.uniforms;
  w.uTime.value = performance.now() / 1000;
  w.uLight.value = 0.15 + 0.85 * day;
  w.uSky.value.copy(tmpSky);
  w.uSun.value.copy(sun.position).normalize();
  scene.fog.near = 75; scene.fog.far = 170;
}

/* ---------------------------------------------------------------- main loop */
const clock = new THREE.Clock();
let saveTimer = 0, hudTimer = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (S.speed) {
    const before = Math.floor(S.minutes / 60);
    S.minutes += dt * MIN_PER_SEC[S.speed];
    if (S.minutes >= 1440) { S.minutes -= 1440; dayTick(); }
    const after = Math.floor(S.minutes / 60);
    if (after !== before) hourTick();
  }
  for (const [i, g] of animating) {
    g.userData.grow = Math.min(1, g.userData.grow + dt * 2.2);
    const t = g.userData.grow, ease = 1 - Math.pow(1 - t, 3);
    g.scale.set(1, Math.max(0.01, ease * (1 + Math.sin(t * Math.PI) * 0.12)), 1);
    if (t >= 1) { disposeGroup(g); animating.delete(i); dirtyChunks.add(chunkOf(i)); }
  }
  for (const c of [...dirtyChunks].slice(0, dirtyChunks.size > 6 ? dirtyChunks.size : 3)) { dirtyChunks.delete(c); buildChunk(c); }
  updateTraffic(dt);
  updatePeople(dt);
  updateBoats(dt);
  updateBirds(dt);
  for (const h of rotors.values()) h.userData.rotor.rotation.z += dt * (S.speed ? 1.6 + S.speed * 0.4 : 0.4);
  updateSmoke(dt);
  updateFires(dt);
  updateRain(dt);
  updateLighting();
  if (treesDirty) {
    for (const m of [trunkMesh, roundMesh, coneMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    treesDirty = false;
  }
  if (overlayDirty) { overlay.instanceMatrix.needsUpdate = true; if (overlay.instanceColor) overlay.instanceColor.needsUpdate = true; overlayDirty = false; }
  updateClouds(dt);
  controls.update();
  renderFrame();
  watchPerformance(dt);
  hudTimer += dt; saveTimer += dt;
  if (hudTimer > 0.25) { hudTimer = 0; updateHud(); }
  if (saveTimer > 15) { saveTimer = 0; save(); }
  requestAnimationFrame(frame);
}

function placeTicker() {
  const bar = document.querySelector('.topbar').getBoundingClientRect();
  if (innerWidth > 900) document.querySelector('.ticker').style.top = `${bar.bottom + 8}px`;
  $('alerts').style.top = `${bar.bottom + (innerWidth > 900 ? 52 : 8)}px`;
}
addEventListener('resize', () => {
  placeTicker();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyGfx(gfx);
});
addEventListener('beforeunload', save);

/* ---------------------------------------------------------------- boot */
rebuildAll();
D = compute();
setSpeed(S.speed ?? 1);
selectTool('look');
renderAdvisor();
updateHud();
placeTicker();
news(D.pop ? `Bienvenido de nuevo a ${S.name}.` : 'Bienvenida, alcaldía. Empieza trazando una calle junto al río.');
if (!S.party) openModal('partyModal');
window.__urbania = { renderer, election, LAWS, agents, startFire, fireCovered, get state() { return S; }, get stats() { return D; }, apply: (id, a, b) => { selectTool(id); apply(pathTiles(a, b, tool.mode)); }, hourTick, setSpeed };
frame();

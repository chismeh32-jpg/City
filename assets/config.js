// Urbania — constants, game data (zones, services, parties, laws, tools), terrain and small shared helpers.
import * as THREE from 'three';
import { rng } from './buildings.js';

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

// tiny DOM helpers shared by every part of the game
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
// show a headline in the news ticker
function news(text, tag = 'NOTICIAS') {
  $('tickerTag').textContent = tag;
  $('tickerText').textContent = text;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const hash = (a, b = 0) => rng(a * 7919 + b * 104729 + 17)();

const ZONES = {
  res: { label: 'Vivienda', icon: '🏠', ico: 'house', color: '#86c96a', cap: [0, 6, 16, 40], noun: 'habitantes' },
  com: { label: 'Comercio', icon: '🏪', ico: 'shop', color: '#6aaeea', cap: [0, 6, 14, 30], noun: 'empleos' },
  off: { label: 'Oficinas', icon: '🏢', ico: 'office', color: '#a58cef', cap: [0, 10, 26, 60], noun: 'empleos' },
  ind: { label: 'Industria', icon: '🏭', ico: 'factory', color: '#eec05a', cap: [0, 12, 24, 40], noun: 'empleos' },
};
// fund: budget line that pays the upkeep · radius: coverage for approval · cap: power/water output
// smoke: [radius, strength] for polluters · tourism: base income per day · leisure: counts as "ocio"
const SERVICES = {
  police: { label: 'Comisaría', icon: '🛡️', ico: 'shield', cost: 3000, upkeep: 600, radius: 9, fund: 'police' },
  fire: { label: 'Bomberos', icon: '🚒', ico: 'firetruck', cost: 3000, upkeep: 650, radius: 9, fund: 'fire' },
  health: { label: 'Centro de salud', icon: '🏥', ico: 'health', cost: 5000, upkeep: 900, radius: 9, fund: 'health' },
  school: { label: 'Escuela', icon: '🏫', ico: 'school', cost: 4000, upkeep: 800, radius: 9, fund: 'school' },
  bus: { label: 'Estación de autobuses', icon: '🚌', ico: 'bus', cost: 6000, upkeep: 700, radius: 12, fund: 'transport' },
  cityhall: { label: 'Ayuntamiento', icon: '🏛️', ico: 'columns', cost: 8000, upkeep: 500, fund: 'admin', unique: true },
  park: { label: 'Parque', icon: '⛲', ico: 'fountain', cost: 400, upkeep: 60, radius: 5, fund: 'park', noPower: true },
  plaza: { label: 'Plaza mayor', icon: '🎪', ico: 'kiosk', cost: 1500, upkeep: 120, radius: 6, fund: 'leisure', leisure: true, tourism: 150, noPower: true },
  zoo: { label: 'Zoológico', icon: '🦒', ico: 'paw', cost: 9000, upkeep: 700, radius: 11, fund: 'leisure', leisure: true, tourism: 1100 },
  stadium: { label: 'Estadio', icon: '🏟️', ico: 'stadium', cost: 14000, upkeep: 1000, radius: 12, fund: 'leisure', leisure: true, tourism: 1600 },
  museum: { label: 'Museo', icon: '🖼️', ico: 'museum', cost: 7000, upkeep: 500, radius: 10, fund: 'leisure', leisure: true, tourism: 700 },
  power: { label: 'Central de gas', icon: '🔥', ico: 'flame', cost: 6000, upkeep: 500, cap: 140, fund: 'utilities', smoke: [6, 0.6], plant: 'power' },
  coal: { label: 'Central de carbón', icon: '🏭', ico: 'factory', cost: 4500, upkeep: 350, cap: 240, fund: 'utilities', smoke: [9, 1.2], plant: 'power' },
  solar: { label: 'Parque solar', icon: '☀️', ico: 'solar', cost: 7000, upkeep: 150, cap: 60, fund: 'utilities', plant: 'power', green: true },
  wind: { label: 'Aerogenerador', icon: '🌬️', ico: 'wind', cost: 5500, upkeep: 120, cap: 50, fund: 'utilities', plant: 'power', green: true },
  water: { label: 'Torre de agua', icon: '💧', ico: 'tower', cost: 4000, upkeep: 300, cap: 140, fund: 'utilities', plant: 'water' },
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
  { id: 'look', label: 'Mirar', icon: '🖐️', ico: 'hand', tools: [{ id: 'look' }] },
  { id: 'roads', label: 'Calles', icon: '🛣️', ico: 'road', tools: [{ id: 'road', label: 'Calle', icon: '🛣️', ico: 'road', mode: 'line', cost: 25, hint: 'Arrastra para trazar. Sobre el río se hace un puente (100 €).' }] },
  { id: 'util', label: 'Energía y agua', icon: '⚡', ico: 'bolt', tools: ['power', 'coal', 'solar', 'wind', 'water'].map((s) => ({ id: s, svc: s, mode: 'one' })) },
  { id: 'zones', label: 'Zonas', icon: '▦', ico: 'zones', tools: Object.keys(ZONES).map((z) => ({ id: z, zone: z, mode: 'rect', cost: 10, hint: 'Arrastra para marcar. Los edificios crecen solos si hay calle, luz y agua.' })) },
  { id: 'services', label: 'Servicios', icon: '🏛️', ico: 'columns', tools: ['police', 'fire', 'health', 'school', 'bus', 'cityhall'].map((s) => ({ id: s, svc: s, mode: 'one' })) },
  { id: 'leisure', label: 'Ocio', icon: '🎡', ico: 'ferris', tools: [...['park', 'plaza', 'zoo', 'stadium', 'museum'].map((s) => ({ id: s, svc: s, mode: 'one' })), { id: 'trees', label: 'Árboles', icon: '🌲', ico: 'tree', mode: 'rect', cost: 15, hint: 'Planta árboles en terreno libre.' }] },
  { id: 'demolish', label: 'Demoler', icon: '🧨', ico: 'demolish', tools: [{ id: 'bulldoze', label: 'Demoler', icon: '🧨', ico: 'demolish', mode: 'rect', cost: 10, hint: 'Arrastra para despejar. 10 € por casilla.' }] },
];
for (const c of CATEGORIES) for (const t of c.tools) {
  if (t.svc) Object.assign(t, { label: SERVICES[t.svc].label, icon: SERVICES[t.svc].icon, ico: SERVICES[t.svc].ico, cost: SERVICES[t.svc].cost });
  if (t.zone) Object.assign(t, { label: ZONES[t.zone].label, icon: ZONES[t.zone].icon, ico: ZONES[t.zone].ico });
}

// line icon from the SVG sprite in jugar.html
const ic = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

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

export { N, HALF, SAVE_KEY, MIN_PER_SEC, $, fmt, money, signed, clamp, I, inside, W, DIRS, el, news, _m, _q, _e, _v, _s, _c, hash, ZONES, SERVICES, FUNDS, PARTIES, LAWS, LAW_BY_ID, LAW_FEE, ELECTION_EVERY, CATEGORIES, ic, NEIGHBOURS, NAMES, riverZ, RIVER_W, WATER, forestNoise, initialTree };

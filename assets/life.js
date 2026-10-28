// Urbania — street life: traffic and commuting, pedestrians, boats, birds, smoke, fires and rain.
import * as THREE from 'three';
import { Builder, GEO, glowMat, pick } from './buildings.js';
import { HW_Z, SERVICES, DIRS, HALF, I, N, W, WATER, _c, _e, _m, _q, _s, _v, news, riverZ } from './config.js';
import { S, load } from './state.js';
import { controls, renderer, scene } from './scene.js';
import { chunks, isBusStop, isRoad, refreshTile, smokeEmitters } from './world.js';
import { D, law, radiusOf } from './sim.js';
import { sfx } from './audio.js';

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
  return { mesh, glow, list: [], cap };
}
const WHITE = 0xffffff, GLASS = 0x2e3a48, TYRE = 0x222222, LAMP = 0xfff2c4, TAIL = 0xff2a1a;
const VEH = {
  car: vehicleType(1500, (b) => {
    b.box(0, 0.018, 0, 0.075, 0.042, 0.14, WHITE).box(0, 0.06, -0.012, 0.066, 0.036, 0.075, GLASS);
    for (const [x, z] of [[-0.036, 0.045], [0.036, 0.045], [-0.036, -0.045], [0.036, -0.045]]) b.box(x, 0, z, 0.012, 0.026, 0.026, TYRE);
    b.box(-0.025, 0.03, 0.071, 0.016, 0.012, 0.004, LAMP, 1).box(0.025, 0.03, 0.071, 0.016, 0.012, 0.004, LAMP, 1);
    b.box(-0.027, 0.03, -0.0715, 0.014, 0.01, 0.004, TAIL, 1).box(0.027, 0.03, -0.0715, 0.014, 0.01, 0.004, TAIL, 1);
  }),
  van: vehicleType(280, (b) => {
    b.box(0, 0.02, -0.03, 0.082, 0.1, 0.15, WHITE).box(0, 0.02, 0.07, 0.08, 0.07, 0.06, WHITE).box(0, 0.06, 0.1, 0.07, 0.03, 0.004, GLASS);
    b.box(-0.026, 0.035, 0.101, 0.016, 0.012, 0.004, LAMP, 1).box(0.026, 0.035, 0.101, 0.016, 0.012, 0.004, LAMP, 1);
    b.box(-0.03, 0.04, -0.106, 0.014, 0.014, 0.004, TAIL, 1).box(0.03, 0.04, -0.106, 0.014, 0.014, 0.004, TAIL, 1);
  }),
  truck: vehicleType(220, (b) => {
    b.box(0, 0.02, -0.035, 0.09, 0.11, 0.2, WHITE).box(0, 0.02, 0.1, 0.088, 0.09, 0.07, WHITE).box(0, 0.075, 0.136, 0.078, 0.03, 0.004, GLASS);
    b.box(0, 0.13, -0.035, 0.03, 0.012, 0.19, 0xd8d2c4);
    b.box(-0.03, 0.04, 0.137, 0.016, 0.012, 0.004, LAMP, 1).box(0.03, 0.04, 0.137, 0.016, 0.012, 0.004, LAMP, 1);
    b.box(-0.035, 0.04, -0.136, 0.014, 0.014, 0.004, TAIL, 1).box(0.035, 0.04, -0.136, 0.014, 0.014, 0.004, TAIL, 1);
  }),
  bus: vehicleType(90, (b) => {
    b.box(0, 0.02, 0, 0.088, 0.105, 0.34, WHITE).box(0, 0.07, 0, 0.09, 0.035, 0.32, GLASS).box(0, 0.07, 0.17, 0.08, 0.035, 0.004, GLASS);
    b.box(0, 0.125, 0, 0.07, 0.01, 0.2, 0xe8e4dc);
    b.box(-0.03, 0.04, 0.171, 0.018, 0.012, 0.004, LAMP, 1).box(0.03, 0.04, 0.171, 0.018, 0.012, 0.004, LAMP, 1);
    b.box(-0.032, 0.04, -0.171, 0.014, 0.016, 0.004, TAIL, 1).box(0.032, 0.04, -0.171, 0.014, 0.016, 0.004, TAIL, 1);
  }),
};
const VEH_SCALE = 1.8; // vehicles are modelled small; this brings them to the scale of the houses
// headlight beams on the road at night: one soft cone per vehicle (local +z is the front)
const FRONT = { car: 0.072, van: 0.102, truck: 0.138, bus: 0.172 };
const beamMat = new THREE.MeshBasicMaterial({
  map: (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, 'rgba(255,240,205,.9)'); grd.addColorStop(1, 'rgba(255,240,205,0)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(24, 0); g.lineTo(40, 0); g.lineTo(64, 128); g.lineTo(0, 128); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })(),
  transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
});
const beams = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.3).rotateX(-Math.PI / 2).translate(0, 0.0045, 0.15), beamMat, 2100);
beams.count = 0; beams.frustumCulled = false; beams.renderOrder = 2; scene.add(beams);
const _beam = new THREE.Matrix4(), _beamOff = new THREE.Matrix4();
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
  tourist: { type: 'car', speed: 1.2 }, cargo: { type: 'truck', speed: 0.85 },
};

// road neighbours of each tile, cached until the road network changes
let nbrCache = [], nbrKey = -1;
function roadNeighbours(i) {
  const key = D ? D.roads : -1;
  if (key !== nbrKey) { nbrCache = []; nbrKey = key; }
  let list = nbrCache[i];
  if (!list) {
    const x = i % N, z = (i / N) | 0;
    list = nbrCache[i] = [];
    for (const [dx, dz] of DIRS) if (isRoad(x + dx, z + dz)) list.push(I(x + dx, z + dz));
  }
  return list;
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
  const R = ROLES[role];
  let from = at >= 0 ? at : pick(Math.random, roads), path = null;
  if (role === 'car') { // commuters drive a real trip between home and work
    const trip = commuteTrip();
    if (trip) [from, path] = trip;
  }
  if (role === 'tourist' || role === 'cargo') { // visitors and lorries come and go by the motorway
    const trip = regionTrip(role);
    if (!trip) return;
    [from, path] = trip;
  }
  const opts = roadNeighbours(from);
  if (!opts.length) return;
  const first = path && path.length ? path.shift() : pick(Math.random, opts);
  agents.push({ role, from, to: first, t: path ? 0 : Math.random() * 0.5, v: R.speed * (0.85 + Math.random() * 0.3), wait: 0,
    path, commute: !!path,
    colour: new THREE.Color(R.colour ?? (role === 'cargo' ? pick(Math.random, [0x3f6fb5, 0xd8342a, 0xf2efe6, 0x4f9a5a, 0xe0a83a]) : role === 'bus' ? pick(Math.random, [0xd8342a, 0xe0a83a, 0x3f9a5a]) : role === 'delivery' ? pick(Math.random, [0xf2efe6, 0xe0a83a, 0x3f6fb5]) : pick(Math.random, CAR_COLOURS))),
    alarm: Math.random() < 0.35 });
}

/* commuting: trips between homes and workplaces, routed around busy streets */
const roadLoad = new Float32Array(N * N); // smoothed number of vehicles on each road tile
let tripCache = null, tripCacheKey = '';
function tripEnds() {
  const key = `${D.buildings}|${D.roads}`;
  if (key !== tripCacheKey) {
    const homes = [], jobs = [], shops = [], factories = [], sights = [];
    S.tiles.forEach((T, i) => {
      if (T.t === 'svc' && SERVICES[T.s].tourism) { const r = nearestRoad(i % N, (i / N) | 0); if (r >= 0) sights.push(r); }
      if (T.t !== 'zone' || !T.lv || T.build > 0) return;
      const r = nearestRoad(i % N, (i / N) | 0);
      if (r < 0) return;
      if (T.z === 'res') homes.push(r); else { jobs.push(r); if (T.z === 'com') shops.push(r); if (T.z === 'ind') factories.push(r); }
    });
    tripCache = { homes, jobs, shops, factories, sights };
    tripCacheKey = key;
  }
  return tripCache;
}
// trips to or from the edge of the map: tourists to the sights (or shops), lorries to the factories
function regionTrip(role) {
  if (!D.connected) return null;
  const { factories, sights, shops } = tripEnds(), edge = HW_Z * N;
  const ends = role === 'cargo' ? factories : sights.length ? sights : shops;
  if (!ends.length) return null;
  const end = pick(Math.random, ends), inbound = Math.random() < 0.55;
  const [a, b] = inbound ? [edge, end] : [end, edge];
  const path = routeBetween(a, b);
  return path && path.length > 1 ? [a, path] : null;
}
function commuteTrip() {
  const { homes, jobs, shops } = tripEnds();
  if (!homes.length || !jobs.length) return null;
  const h = S.minutes / 60, home = pick(Math.random, homes);
  const work = h >= 14 && h < 22 ? null : pick(Math.random, jobs);
  // mornings: home → work · evenings: work → home · otherwise errands to the shops
  let a, b;
  if (h >= 5 && h < 12) [a, b] = [home, work];
  else if (h >= 14 && h < 22) [a, b] = [pick(Math.random, jobs), home];
  else [a, b] = [home, shops.length ? pick(Math.random, shops) : work];
  if (a === b) return null;
  const path = routeBetween(a, b);
  return path && path.length > 1 ? [a, path] : null;
}
// A* over road tiles with typed arrays (fast enough for thousands of trips on the big map);
// busy tiles cost more so traffic spreads over alternative streets, avenues cost less
const gScore = new Float32Array(N * N), cameFrom = new Int32Array(N * N), seen = new Uint32Array(N * N);
const heapF = [], heapI = [];
let searchId = 0;
function heapPush(f, i) {
  let k = heapF.length;
  heapF.push(f); heapI.push(i);
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heapF[p] <= f) break;
    heapF[k] = heapF[p]; heapI[k] = heapI[p]; k = p;
  }
  heapF[k] = f; heapI[k] = i;
}
function heapPop() {
  const top = heapI[0], lf = heapF.pop(), li = heapI.pop(), n = heapF.length;
  if (n) {
    let k = 0;
    for (;;) {
      const l = k * 2 + 1, r = l + 1;
      let m = -1, mf = lf;
      if (l < n && heapF[l] < mf) { m = l; mf = heapF[l]; }
      if (r < n && heapF[r] < mf) m = r;
      if (m < 0) break;
      heapF[k] = heapF[m]; heapI[k] = heapI[m]; k = m;
    }
    heapF[k] = lf; heapI[k] = li;
  }
  return top;
}
const routeCache = new Map();
let routeCacheKey = -1;
function routeBetween(from, to) {
  if (routeCacheKey !== nbrKey || routeCache.size > 3000) { routeCache.clear(); routeCacheKey = nbrKey; }
  const ck = from * 16384 + to, hit = routeCache.get(ck);
  if (hit && Math.random() < 0.85) return hit.slice(); // mostly reuse, sometimes re-plan around new jams
  const tx = to % N, tz = (to / N) | 0;
  const h = (i) => (Math.abs((i % N) - tx) + Math.abs(((i / N) | 0) - tz)) * 0.85;
  searchId++;
  heapF.length = heapI.length = 0;
  seen[from] = searchId; gScore[from] = 0; cameFrom[from] = -1;
  heapPush(h(from), from);
  let found = false;
  while (heapF.length) {
    const cur = heapPop();
    if (cur === to) { found = true; break; }
    const gc = gScore[cur];
    for (const n of roadNeighbours(cur)) {
      const av = S.tiles[n].av ? 0.5 : 1; // avenues carry twice the traffic and are preferred
      const ng = gc + 1 + roadLoad[n] * 0.6 * av - (av < 1 ? 0.15 : 0);
      if (seen[n] !== searchId || ng < gScore[n]) {
        seen[n] = searchId; gScore[n] = ng; cameFrom[n] = cur;
        heapPush(ng + h(n), n);
      }
    }
  }
  if (!found) return null;
  const path = [];
  for (let c = to; c !== from; c = cameFrom[c]) path.push(c);
  path.reverse();
  routeCache.set(ck, path);
  return path.slice();
}

function wanted(d) {
  const h = S.minutes / 60, rush = (h >= 7 && h < 9.5) || (h >= 17 && h < 19.5);
  const dayF = rush ? 1 : h >= 6 && h < 22 ? 0.6 : 0.2;
  const depots = d.svc.bus || 0;
  // buses take commuters off the road: the more homes a bus station covers, the fewer cars
  const busShare = Math.min(0.7, (depots ? 0.35 * (d.cov.bus || 0) : 0) + 0.4 * (d.cov.metro || 0)) * (law('transporte') ? 1.4 : 1);
  const cars = d.pop ? Math.min(1400, Math.round((d.roads / 4 + d.pop / 9) * dayF * (1 - busShare) * (law('transporte') ? 0.75 : 1))) : 0;
  return {
    car: Math.round(cars * 0.9), taxi: Math.round(cars * 0.1),
    delivery: !d.pop ? 0 : h >= 6 && h < 21 ? Math.min(240, Math.round((d.jobs.com + d.jobs.ind) / 35)) : 2,
    garbage: h >= 5 && h < 12 ? Math.min(40, ((d.svc.landfill || 0) + (d.svc.incinerator || 0)) * 3) : 0,
    tourist: d.connected && h >= 7 && h < 23 ? Math.min(160, Math.round(d.fin.income.tourism / 25)) : 0,
    cargo: d.connected && h >= 5 && h < 22 ? Math.min(170, Math.round(d.jobs.ind / 18)) : 0,
    bus: Math.min(80, depots * 3 * (law('transporte') ? 2 : 1) * (h >= 1 && h < 5 ? 0.5 : 1)),
    police: (d.svc.police || 0) * 2, ambulance: d.svc.health || 0, fire: d.svc.fire || 0,
  };
}
function stationOf(role) {
  const kinds = { police: ['police'], ambulance: ['health', 'hospital'], fire: ['fire'], bus: ['bus'], garbage: ['landfill', 'incinerator'] }[role];
  if (!kinds) return -1;
  const list = D.svcList.filter(([s]) => kinds.includes(s));
  if (!list.length) return -1;
  const [, x, z] = pick(Math.random, list);
  return nearestRoad(x, z);
}
// share of road tiles that are jammed (smoothed), used by the approval index and tooltips
function congestion() {
  let busy = 0, used = 0;
  for (const i of roadTiles()) { if (roadLoad[i] > 0.3) used++; if (roadLoad[i] > (S.tiles[i].av ? 5.2 : 2.6)) busy++; }
  return used > 8 ? busy / used : 0;
}
const trafficLabel = (i) => { const l = roadLoad[i] / (S.tiles[i].av ? 2 : 1); return l > 2.6 ? '<span class="bad">atasco</span>' : l > 1.2 ? 'denso' : 'fluido'; };

function updateTraffic(dt) {
  if (!D) return;
  const want = wanted(D), have = {};
  for (const a of agents) have[a.role] = (have[a.role] || 0) + 1;
  for (const role of Object.keys(ROLES)) {
    const n = have[role] || 0, w = Math.floor(want[role]);
    if (n < w) for (let k = n; k < Math.min(w, n + (role === 'car' ? 8 : 6)); k++) spawn(role, stationOf(role));
    else if (n > w) { const idx = agents.findIndex((a) => a.role === role && !(a.target >= 0)); if (idx >= 0) agents.splice(idx, 1); }
  }
  const k = S.speed ? Math.min(3, S.speed) : 0;
  trafficClock += dt * k;
  const greenX = Math.floor(trafficClock / 4) % 2 === 0;

  // queues: on each street segment a vehicle never gets closer than a car length to the one ahead
  const lanes = new Map(), load = new Uint16Array(N * N);
  for (const a of agents) {
    const key = a.from * 4 + DIRS.findIndex(([dx, dz]) => a.from + dx + dz * N === a.to);
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key).push(a);
    load[a.to]++;
  }
  for (const list of lanes.values()) {
    list.sort((p, q) => q.t - p.t);
    for (let j = 0; j < list.length; j++) list[j].leader = j ? list[j - 1] : null;
  }
  for (const i of roadTiles()) roadLoad[i] += (load[i] - roadLoad[i]) * Math.min(1, dt * 0.8);

  for (const T of Object.values(VEH)) T.list.length = 0;
  let sirenN = 0, beamN = 0;
  for (let n = agents.length - 1; n >= 0; n--) {
    const a = agents[n], R = ROLES[a.role];
    if (S.tiles[a.from].t !== 'road' || S.tiles[a.to].t !== 'road') { agents.splice(n, 1); continue; }
    const dx = (a.to % N) - (a.from % N);
    let step = dt * a.v * k * (a.target >= 0 && a.path ? 1.6 : 1) * (S.tiles[a.from].av && S.tiles[a.to].av ? 1.25 : 1);
    if (a.wait > 0) { a.wait -= dt * k; step = 0; }
    // stop at red lights before junctions (emergency vehicles on call ignore them)
    const red = isJunction(a.to) && (dx !== 0) !== greenX && !(R.siren && a.alarm);
    if (red && a.t < 0.55 && a.t + step >= 0.55) { a.t = 0.55; step = 0; }
    else if (red && a.t === 0.55) step = 0;
    const gap = R.type === 'bus' ? 0.46 : R.type === 'truck' ? 0.38 : 0.3;
    if (a.leader && !(R.siren && a.alarm)) step = Math.max(0, Math.min(step, a.leader.t - gap - a.t));
    a.t += step;
    if (a.t >= 1) {
      if (a.role === 'bus' && isBusStop(a.to % N, (a.to / N) | 0)) a.wait = 2.5;
      if (a.path) {
        if (!a.path.length) {
          if (a.commute) { agents.splice(n, 1); continue; } // arrived home or at work
          engineArrived(a);
        } else { const next = a.path.shift(); a.from = a.to; a.to = S.tiles[next]?.t === 'road' ? next : a.from; a.t = 0; if (a.to === a.from) a.path = null; }
      }
      if (!a.path) {
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
    if (idx >= T.cap) continue; // more vehicles than instances: the extra ones still drive, unseen
    T.list.push(a);
    T.mesh.setMatrixAt(idx, _m); T.glow.setMatrixAt(idx, _m); T.mesh.setColorAt(idx, a.colour);
    if (beamMat.opacity > 0.01 && beamN < 2100) beams.setMatrixAt(beamN++, _beam.copy(_m).multiply(_beamOff.makeTranslation(0, 0, FRONT[R.type])));
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
  beams.count = beamN;
  beams.instanceMatrix.needsUpdate = true;
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
const PEOPLE = 1600, SKIN = [0xf1c9a5, 0xd9a47a, 0x9a6a4a, 0x6b4a33], CLOTHES = [0xd8342a, 0x2f5fb5, 0x4f9a5a, 0xe0a83a, 0x8a5fbf, 0x3b3f46, 0xf2efe6];
const peopleMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.022, 0.05, 2, 6).translate(0, 0.047, 0),
  new THREE.MeshStandardMaterial({ roughness: 0.8 }), PEOPLE);
const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 4).translate(0, 0.105, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), PEOPLE);
for (const m of [peopleMesh, headMesh]) { m.castShadow = true; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
const walkers = [];
// how far people wander from the middle of each leisure tile
const STROLL = { park: 0.38, plaza: 0.36, zoo: 0.3, museum: 0.25, stadium: 0.3, ferris: 0.34 };
function updatePeople(dt) {
  if (!D) return;
  const h = S.minutes / 60, target = D.pop ? Math.min(PEOPLE, Math.floor((D.pop / 5) * (h >= 7 && h < 22 ? 1 : 0.3)) + 4) : 0;
  // up to a few new people per frame: most walk the pavements, some stroll around parks and squares
  for (let s = 0; s < 8 && walkers.length < target; s++) {
    const roads = roadTiles().filter((i) => !WATER[i]);
    if (!roads.length) break;
    const k = walkers.length, leisure = D.svcList.filter(([kind]) => STROLL[kind]);
    if (leisure.length && Math.random() < 0.3) {
      const [kind, x, z] = pick(Math.random, leisure);
      walkers.push({ park: [W(x), W(z), STROLL[kind]], ang: Math.random() * 6.28, r: 0.12 + Math.random() * STROLL[kind], v: (0.25 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : -1), phase: Math.random() * 6 });
    } else {
      const from = pick(Math.random, roads);
      walkers.push({ from, to: pick(Math.random, roadNeighbours(from)), t: Math.random(), side: Math.random() < 0.5 ? 1 : -1, v: 0.18 + Math.random() * 0.12, phase: Math.random() * 6 });
    }
    peopleMesh.setColorAt(k, _c.set(pick(Math.random, CLOTHES)));
    headMesh.setColorAt(k, _c.set(pick(Math.random, SKIN)));
    peopleMesh.instanceColor.needsUpdate = headMesh.instanceColor.needsUpdate = true;
  }
  if (walkers.length > target) walkers.length = Math.max(target, walkers.length - 8);
  const k = S.speed ? Math.min(3, S.speed) : 0;
  walkers.forEach((w, n) => {
    if (w.park) { // strolling in circles around a park, square or attraction
      const [cx, cz] = w.park;
      w.ang += dt * w.v * k / Math.max(0.15, w.r);
      const bob = Math.abs(Math.sin((w.phase += dt * 9 * k))) * 0.01;
      _m.compose(_v.set(cx + Math.cos(w.ang) * w.r, 0.045 + bob, cz + Math.sin(w.ang) * w.r), _q.setFromEuler(_e.set(0, -w.ang + (w.v > 0 ? 0 : Math.PI), 0)), _s.set(1.3, 1.3, 1.3));
      peopleMesh.setMatrixAt(n, _m); headMesh.setMatrixAt(n, _m);
      return;
    }
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

// A pool of soft round particles drawn as one THREE.Points (one draw call for the whole pool).
// Each particle has a position, velocity, size (world units), opacity and remaining life (1 → 0).
class Particles {
  constructor(max, map, { color = 0xffffff, additive = false } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.life = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: map }, color: { value: new THREE.Color(color) }, viewH: { value: 800 } },
      vertexShader: `attribute float size; attribute float alpha; uniform float viewH; varying float vA;
        void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = size * projectionMatrix[1][1] * viewH * 0.5 / max(-mv.z, 0.1); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA;
        void main() { vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(color * t.rgb, a); }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx = 0, vy = 0, vz = 0) {
    for (let k = 0; k < this.max; k++) {
      const i = (this.next + k) % this.max;
      if (this.life[i] > 0) continue;
      this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.life[i] = 1;
      this.next = (i + 1) % this.max;
      return;
    }
  }
  // decay: life lost per second · look(life) → [size, alpha]
  update(dt, decay, look) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt * decay;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      const [s, al] = look(Math.max(0, this.life[i]));
      this.size[i] = s; this.alpha[i] = this.life[i] > 0 ? al : 0;
    }
    this.material.uniforms.viewH.value = renderer.domElement.height;
    const at = this.points.geometry.attributes;
    at.position.needsUpdate = at.size.needsUpdate = at.alpha.needsUpdate = true;
  }
}

const chimneySmoke = new Particles(160, smokeTex, { color: 0xe8e4dc });
let emitClock = 0;
function updateSmoke(dt) {
  if (smokeEmitters.dirty) {
    smokeEmitters.list = [];
    for (const ch of chunks) smokeEmitters.list.push(...ch.smoke);
    smokeEmitters.dirty = false;
  }
  const emitters = smokeEmitters.list;
  emitClock += dt * (S.speed ? 1 : 0.2);
  while (emitClock > 0.12 && emitters.length) {
    emitClock -= 0.12;
    const p = pick(Math.random, emitters);
    chimneySmoke.emit(p.x, p.y, p.z, 0.12, 0.35, 0);
  }
  if (!emitters.length) emitClock = 0;
  chimneySmoke.update(dt, 0.35, (l) => [0.2 + (1 - l) * 0.7, l * 0.55]);
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
  sfx('siren');
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
const flames = new Particles(70, flameTex, { additive: true });

/* fireworks where the camera is looking, to celebrate a promotion or an election win */
const sparkTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const sparks = [0xff5a4a, 0xffd25a, 0x6fb6ff, 0x7dff9a, 0xff8fe0].map((c) => new Particles(600, sparkTex, { color: c, additive: true }));
const rocketTrail = new Particles(160, sparkTex, { color: 0xffe2a8, additive: true });
const rockets = [], showAt = new THREE.Vector3();
let showLeft = 0, showClock = 0;
function fireworks(seconds = 10) {
  showAt.copy(controls.target);
  showLeft = seconds;
}
function updateFireworks(dt) {
  if (showLeft > 0) {
    showLeft -= dt; showClock -= dt;
    if (showClock <= 0) {
      showClock = 0.3 + Math.random() * 0.5;
      rockets.push({ x: showAt.x + (Math.random() - 0.5) * 8, y: 0.6, z: showAt.z + (Math.random() - 0.5) * 8, vy: 5.2 + Math.random() * 1.8, t: 0.8 + Math.random() * 0.35 });
    }
  }
  for (let k = rockets.length - 1; k >= 0; k--) {
    const r = rockets[k];
    r.t -= dt; r.y += r.vy * dt; r.vy -= 4 * dt;
    rocketTrail.emit(r.x, r.y, r.z, (Math.random() - 0.5) * 0.2, -0.4, (Math.random() - 0.5) * 0.2);
    if (r.t > 0) continue;
    const P = pick(Math.random, sparks), speed = 1.8 + Math.random() * 0.9;
    for (let i = 0; i < 110; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      P.emit(r.x, r.y, r.z, Math.cos(a) * s * speed, u * speed, Math.sin(a) * s * speed);
    }
    rockets.splice(k, 1);
    sfx('boom');
  }
  for (const P of sparks) {
    for (let i = 0; i < P.max; i++) {
      if (P.life[i] <= 0) continue;
      P.vel[i * 3] *= 1 - dt * 1.1; P.vel[i * 3 + 2] *= 1 - dt * 1.1;
      P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * (1 - dt * 1.1) - 1.6 * dt;
    }
    P.update(dt, 0.5, (l) => [0.12 + 0.12 * l, Math.min(1, l * 1.8) * (0.65 + 0.35 * Math.random())]);
  }
  rocketTrail.update(dt, 2.4, (l) => [0.07 * l + 0.02, l * 0.9]);
}
const blackSmoke = new Particles(60, smokeTex, { color: 0x3b3a38 });
let fireDirty = true, fireSpots = [], fireClock = 0;
function markFires() { fireDirty = true; }
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
    flames.emit(at.x + (Math.random() - 0.5) * 0.4, at.y * (0.4 + Math.random() * 0.7), at.z + (Math.random() - 0.5) * 0.4, 0, 0.5, 0);
    if (Math.random() < 0.35) blackSmoke.emit(at.x, at.y + 0.1, at.z, 0.12, 0.5, 0);
  }
  if (!fireSpots.length) fireClock = 0;
  flames.update(dt, 1.6, (l) => [0.14 + l * 0.24, l]);
  blackSmoke.update(dt, 0.35, (l) => [0.25 + (1 - l) * 0.65, l * 0.5]);
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

export { fireworks, updateFireworks, sparks, rocketTrail, beamMat, beams, vehicleType, WHITE, GLASS, TYRE, LAMP, VEH, VEH_SCALE, sirens, CAR_COLOURS, SIREN_RED, SIREN_BLUE, SIREN_OFF, ROLES, roadNeighbours, isJunction, agents, roadCache, roadCacheKey, trafficClock, roadTiles, nearestRoad, spawn, roadLoad, tripCache, tripCacheKey, tripEnds, commuteTrip, routeBetween, wanted, stationOf, congestion, trafficLabel, updateTraffic, boats, updateBoats, BIRDS, birds, flocks, updateBirds, PEOPLE, SKIN, CLOTHES, peopleMesh, headMesh, walkers, updatePeople, smokeTex, Particles, chimneySmoke, emitClock, updateSmoke, FIRE_HOURS, FIRE_HEIGHT, roadPath, fireCovered, fireTick, startFire, engineArrived, flameTex, flames, blackSmoke, fireDirty, fireSpots, fireClock, markFires, updateFires, RAIN, rain, updateRain };

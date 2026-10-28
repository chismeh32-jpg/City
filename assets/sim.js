// Urbania — the city simulation: stats, budget, approval, votes, growth, construction, days and elections.
import { pick } from './buildings.js';
import { HW_Z, ELECTION_EVERY, FUNDS, I, LAWS, N, NEIGHBOURS, PARTIES, RANKS, RANK_REWARD, SERVICES, UNLOCK, WATER, ZONES, clamp, ic, inside, news } from './config.js';
import { S } from './state.js';
import { busNetwork, chunks, dirtyChunks, isRoad, refreshTile, setBusNetwork } from './world.js';
import { showRankUp } from './panels.js';
import { checkTutorial, hourlyNews, setSpeed, showElection } from './ui.js';
import { congestion, fireTick, roadCache, roadLoad } from './life.js';

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
  if ((k === 'health' || k === 'hospital') && law('sanidad')) r *= 1.3;
  if (k === 'police' && law('manodura')) r *= 1.4;
  if (law('privatizar')) r *= 0.85;
  return r;
}
function upkeepOf(k) {
  let u = SERVICES[k].upkeep * fundQ(SERVICES[k].fund);
  if ((k === 'health' || k === 'hospital') && law('sanidad')) u *= 1.4;
  if (SERVICES[k].fund === 'school' && law('educacion')) u *= 1.3;
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

/* land value and pollution fields (one value per tile, recomputed with the stats) */
// add a value that fades with distance around (x, z); mode 'max' keeps the strongest source instead
function stamp(field, x, z, r, amount, max = false) {
  const R = Math.ceil(r);
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const tx = x + dx, tz = z + dz, dist = Math.hypot(dx, dz);
    if (!inside(tx, tz) || dist > r) continue;
    const v = amount * (1 - dist / (r + 1)), i = I(tx, tz);
    field[i] = max ? Math.max(field[i], v) : field[i] + v;
  }
}
// static bonus for living near the river, computed once
const RIVERSIDE = (() => {
  const f = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) if (WATER[i]) stamp(f, i % N, (i / N) | 0, 4, 1, true);
  for (let i = 0; i < N * N; i++) if (WATER[i]) f[i] = 0;
  return f;
})();
const LAND_FOR_LEVEL = { res: [0, 0, 35, 55], com: [0, 0, 30, 50], off: [0, 0, 35, 50], ind: [0, 0, 0, 0] };
function computeFields(d, polluters) {
  const land = new Float32Array(N * N).fill(32), pol = new Float32Array(N * N);
  const polFactor = (law('verde') ? 0.7 : 1) * (law('reciclaje') ? 0.6 : 1);
  for (const [x, z, r, sv] of polluters) stamp(pol, x, z, r, sv * polFactor, true);
  for (const [s, x, z] of d.svcList) {
    const def = SERVICES[s];
    if (s === 'park') stamp(land, x, z, 5, 18);
    else if (def.leisure) stamp(land, x, z, Math.min(8, def.radius * 0.7), s === 'plaza' ? 12 : 14);
    else if (def.radius) stamp(land, x, z, def.radius * 0.6, s === 'bus' ? 5 : 7);
  }
  for (let i = 0; i < N * N; i++) {
    const T = S.tiles[i];
    if (T.tree) stamp(land, i % N, (i / N) | 0, 2, 2.5);
    if (T.t === 'zone' && T.z === 'com' && T.lv > 0 && !(T.build > 0)) stamp(land, i % N, (i / N) | 0, 3, 2);
    if (T.t === 'road' && roadLoad[i] > (T.av ? 3 : 1.5)) stamp(land, i % N, (i / N) | 0, 1.5, -6);
  }
  const trash = (d.trashPile || 0) * 10; // rubbish in the streets drags every neighbourhood down
  for (let i = 0; i < N * N; i++) land[i] = WATER[i] ? 0 : clamp(land[i] + RIVERSIDE[i] * 14 - pol[i] * 45 - trash, 0, 100);
  d.land = land; d.pol = pol;
}

// is any of the city's own streets reachable from the motorway? (flood fill over road tiles)
const seenRoad = new Uint8Array(N * N);
function highwayConnected() {
  seenRoad.fill(0);
  const stack = [HW_Z * N];
  seenRoad[HW_Z * N] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % N, z = (i / N) | 0;
    if (!S.tiles[i].hw) return true;
    for (const [dx, dz] of NEIGHBOURS4) {
      const nx = x + dx, nz = z + dz, n = nz * N + nx;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N || seenRoad[n] || S.tiles[n].t !== 'road') continue;
      seenRoad[n] = 1;
      stack.push(n);
    }
  }
  return false;
}
const NEIGHBOURS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let D = null; // derived stats, refreshed every game hour and after edits
function refresh() { D = compute(); return D; }
function compute() {
  const d = {
    pop: 0, jobs: { com: 0, off: 0, ind: 0 }, jobsTotal: 0, powerUse: 0, powerCap: 0, waterUse: 0, waterCap: 0,
    roads: 0, svc: {}, svcList: [], zoneTiles: { res: 0, com: 0, off: 0, ind: 0 }, buildings: 0, building: 0, emptyLots: 0, cov: {}, smoke: 0, trashCap: 0, trashUse: 0,
  };
  const homes = [], polluters = [], planned = { res: 0, com: 0, off: 0, ind: 0 };
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
      if (def.power) d.powerCap += def.power * eff; // the incinerator burns rubbish into electricity
      if (def.trash) d.trashCap += def.trash * eff;
      if (def.smoke) polluters.push([x, z, def.smoke[0], def.smoke[1]]);
    } else if (T.t === 'zone') {
      d.zoneTiles[T.z]++;
      if (!T.lv) { d.emptyLots++; return; }
      d.buildings++;
      if (T.build > 0) d.building++;
      planned[T.z] += ZONES[T.z].cap[T.lv]; // includes buildings still under construction
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
  for (const k of ['police', 'fire', 'school', 'park', 'bus']) d.cov[k] = covered([k]);
  d.cov.health = covered(['health', 'hospital']);
  d.cov.high = covered(['highschool']);
  d.cov.uni = covered(['university']);
  d.cov.metro = (d.svc.metro || 0) >= 2 ? covered(['metro']) : 0; // a metro needs at least two stations
  // education: primary schools, secondary schools and the university all count
  d.edu = clamp(0.25 + 0.35 * d.cov.school + 0.25 * d.cov.high + 0.15 * d.cov.uni, 0, 1);
  // rubbish: small villages take it to the neighbours; from 150 people it piles up without a dump
  d.trashUse = d.pop >= 150 ? d.pop * 0.06 + d.jobsTotal * 0.04 : 0;
  d.trashPile = clamp((S.trash || 0) / (d.pop * 0.3 + 20), 0, 1);
  d.connected = highwayConnected();
  const hasBus = !!d.svc.bus;
  if (hasBus !== busNetwork) { setBusNetwork(hasBus); for (let c = 0; c < chunks.length; c++) dirtyChunks.add(c); }
  d.cov.leisure = covered(Object.keys(SERVICES).filter((k) => SERVICES[k].leisure));
  computeFields(d, polluters);
  let smoky = 0, landW = 0;
  for (const [hx, hz, p] of homes) { smoky += p * Math.min(1.2, d.pol[I(hx, hz)]); landW += p * d.land[I(hx, hz)]; }
  d.smoke = d.pop ? smoky / d.pop : 0;
  d.landAvg = d.pop ? landW / d.pop : 0; // average land value where people live
  d.workers = d.pop * 0.55;
  d.employed = Math.min(d.workers, d.jobsTotal);
  d.filled = d.jobsTotal ? Math.min(1, d.workers / d.jobsTotal) : 0;
  d.powerOk = d.powerUse <= d.powerCap;
  d.waterOk = d.waterUse <= d.waterCap;
  // demand counts what is already being built, so the pipeline of construction sites does not overshoot.
  // Job demand adds up to ~60 % of residents, close to the 55 % who work, so jobs no longer pile up empty.
  const plannedJobs = planned.com + planned.off + planned.ind;
  d.demand = {
    res: plannedJobs * 1.8 + 120 - planned.res + (law('alquiler') ? 25 : 0),
    com: d.pop * 0.2 + 16 - planned.com,
    off: d.pop > 120 ? (d.pop * 0.15 + 10) * (0.6 + 0.7 * d.edu) - planned.off : 0, // offices want an educated city
    ind: d.pop * 0.22 + 30 - planned.ind + (d.connected ? 20 : 0), // factories sell to the region by motorway
  };
  // electorate: business-heavy cities lean right, well-served ones lean left
  const biz = d.jobsTotal ? (d.jobs.off + d.jobs.ind) / d.jobsTotal : 0.5;
  const lawLean = LAWS.reduce((a, l) => a + (law(l.id) ? l.lean : 0), 0);
  d.right = clamp(0.5 + (biz - 0.5) * 0.3 - (d.cov.health + d.cov.school - 1) * 0.06 + lawLean * 0.02, 0.25, 0.75);
  d.jam = typeof congestion === 'function' && roadCache ? congestion() : 0;
  d.fin = finances(d);
  d.rows = approvalRows(d);
  d.goal = clamp(Math.round(d.rows.reduce((a, r) => a + r[2], 0)), 0, 100);
  d.vote = voteShare(d);
  return d;
}

function finances(d) {
  const tourismBase = d.svcList.reduce((a, [s]) => a + (SERVICES[s].tourism || 0), 0);
  const income = {
    res: d.pop * S.taxes.res * 0.9 * (0.7 + (d.landAvg || 40) / 100 * 0.6) * (law('alquiler') ? 0.85 : 1),
    com: d.jobs.com * d.filled * S.taxes.com * 1.2 * (law('empresas') ? 0.8 : 1) * (law('horarios') ? 1.15 : 1),
    off: d.jobs.off * d.filled * S.taxes.off * 1.5 * (law('empresas') ? 0.8 : 1),
    ind: d.jobs.ind * d.filled * S.taxes.ind * 1.1 * (law('empresas') ? 0.8 : 1),
    tourism: tourismBase * clamp(d.pop / 400, 0.2, 1.5) * (0.5 + S.approval / 100) * fundQ('leisure') * (law('turismo') ? 1.6 : 1) * (d.connected ? 1 : 0.45),
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
  if (d.cov.high > 0) rows.push(['🎓', 'Los jóvenes estudian el bachillerato cerca', 3 * d.cov.high * Math.min(1, fundQ('school'))]);
  if (d.cov.uni > 0) rows.push(['🏛️', 'La ciudad tiene universidad', 2 + 2 * d.cov.uni]);
  if (d.cov.metro > 0) rows.push(['🚇', 'El metro llega al barrio', 3 * d.cov.metro * Math.min(1, fundQ('transport'))]);
  if (d.trashPile > 0.05) rows.push(['🗑️', 'Basura sin recoger en las calles', -14 * d.trashPile]);
  if (S.disasterDay != null && S.day - S.disasterDay <= 2) rows.push(['🚨', 'La ciudad se recupera de un desastre', -6]);
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
  if (d.jam > 0.12) rows.push(['🚗', 'Atascos para ir a trabajar', -Math.min(6, d.jam * 20)]);
  if (S.tiles.some((T) => T.fire > 0)) rows.push(['🔥', 'Hay un incendio en la ciudad', -3]);
  else if (S.burnDay && S.day - S.burnDay < 2) rows.push(['🔥', 'Un edificio ardió hace poco', -2]);
  if (S.money < 0) rows.push(['📉', 'La ciudad está en números rojos', -8]);
  const sum = rows.reduce((a, r) => a + r[2], 0), rounded = rows.reduce((a, r) => a + Math.round(r[2]), 0);
  if (Math.round(sum) !== rounded) rows.push(['≈', 'Otros y redondeo', Math.round(sum) - rounded]);
  return rows;
}

// share of the vote your list would get if elections were held today
// share of the vote your list would get if elections were held today, with its reasons
function voteShare(d) {
  const lean = S.party ? party().lean : 0;
  const affinity = lean === 1 ? d.right : lean === -1 ? 1 - d.right : 0.55;
  const jobsRatio = d.workers ? Math.min(1, d.jobsTotal / d.workers) : 1;
  d.voteRows = [
    ['❤️', 'Aprobación de tu gestión', S.approval * 0.75],
    [party().icon, 'Encaje de tu partido con lo que vota la ciudad', (affinity - 0.5) * 30],
    ['🗳️', 'Voto fiel de tu partido', 4],
  ];
  if (S.terms) d.voteRows.push(['⏳', `Desgaste tras ${S.terms} ${S.terms === 1 ? 'mandato' : 'mandatos'}`, -3 * S.terms]);
  if (d.fin.net < 0) d.voteRows.push(['📉', 'Las cuentas pierden dinero cada día', -4]);
  if (jobsRatio < 0.95) d.voteRows.push(['💼', 'Paro en la ciudad', -(1 - jobsRatio) * 15]);
  return clamp(Math.round(d.voteRows.reduce((a, r) => a + r[2], 0)), 5, 95);
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
      if (d.land[i] < LAND_FOR_LEVEL[T.z][T.lv + 1]) continue; // nicer buildings need a nicer neighbourhood
      // businesses only grow when there is demand for all the jobs the bigger building adds
      if (T.z !== 'res' && demand[T.z] < ZONES[T.z].cap[T.lv + 1] - ZONES[T.z].cap[T.lv]) continue;
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
// city rank from population; reaching a new one pays a reward and unlocks buildings
function rankFor(pop) { let r = 0; RANKS.forEach(([p], k) => { if (pop >= p) r = k; }); return r; }
function checkRank(d, silent = false) {
  const r = rankFor(d.pop), from = S.rank ?? 0;
  if (S.rank == null) { S.rank = r; return; } // older saves: grant the rank they already have
  if (r <= from) return;
  S.rank = r;
  if (silent) return;
  let reward = 0;
  for (let k = from + 1; k <= r; k++) reward += RANK_REWARD[k];
  S.money += reward;
  showRankUp(r, reward, from);
}
const isLocked = (key) => (UNLOCK[key] || 0) > (S.rank ?? 0);
// one sample per day for the statistics charts
function sampleStats(d) {
  S.stats.push({ day: S.day, pop: d.pop, money: Math.round(S.money), net: Math.round(d.fin.net), approval: Math.round(S.approval),
    unemployment: d.workers ? Math.round((1 - d.employed / d.workers) * 100) : 0, land: Math.round(d.landAvg || 0), smoke: Math.round(d.smoke * 100), jam: Math.round(d.jam * 100) });
  if (S.stats.length > 150) S.stats.shift();
}

function hourTick() {
  advanceConstruction();
  D = compute();
  fireTick(D);
  growth(D);
  D = compute();
  S.money += D.fin.net / 24;
  // rubbish piles up when the dumps are full, and is cleared slowly when there is room again
  S.trash = Math.max(0, (S.trash || 0) + (D.trashUse - D.trashCap) / 24 * (D.trashUse > D.trashCap ? 1 : 0.6));
  const step = 2;
  S.approval = S.approval < D.goal ? Math.min(D.goal, S.approval + step) : Math.max(D.goal, S.approval - step);
  if (S.loan) {
    S.loan.left -= S.loan.perDay / 24;
    if (S.loan.left <= 0) { S.loan = null; news('Préstamo devuelto. El banco os felicita.'); }
  }
  hourlyNews(D);
  checkTutorial(D);
  checkRank(D);
}

function dayTick() {
  if (D) sampleStats(D);
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

export { highwayConnected, nearRoad, fundQ, law, party, radiusOf, upkeepOf, buildCost, growthFactor, stamp, RIVERSIDE, LAND_FOR_LEVEL, computeFields, D, refresh, compute, finances, approvalRows, voteShare, BUILD_HOURS, POWER_PER_LV, WATER_PER_LV, startBuilding, growth, advanceConstruction, rankFor, checkRank, isLocked, sampleStats, hourTick, dayTick, election };

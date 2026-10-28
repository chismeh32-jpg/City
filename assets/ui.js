// Urbania — the interface: news, tutorial, tools and input, HUD, panels, politics, citizens and menu.
import * as THREE from 'three';
import { rng, pick, STYLES, setStyle } from './buildings.js';
import { $, CATEGORIES, ELECTION_EVERY, FUNDS, HALF, I, LAWS, LAW_BY_ID, LAW_FEE, N, NAMES, PARTIES, RANKS, SERVICES, UNLOCK, W, WATER, ZONES, _m, clamp, el, fmt, ic, inside, money, news, signed, PLOT, PLOTS, PLOTS_FOR_RANK, plotOf, plotPrice } from './config.js';
import { S, fromSave, newState, save, setState } from './state.js';
import { GFX_KEY, GFX_LEVELS, applyGfx, camera, controls, gfx, perfVisible, renderer, scene, setPerfVisible } from './scene.js';
import { chunks, cursor, dirtyChunks, drawPlots, rebuildAll, refreshAround, refreshTile } from './world.js';
import { D, buildCost, isLocked, law, nearRoad, party, radiusOf, refresh, upkeepOf } from './sim.js';
import { sfx } from './audio.js';
import { LAYERS, currentLayer, layerFor, restoreLayer, setLayer, showRange } from './layers.js';
import { bar, closeInspector, inspect, renderInspector, renderStats, takePhoto, togglePhotoMode, toggleSound } from './panels.js';
import { agents, fireworks, markFires, trafficLabel, walkers } from './life.js';

/* ---------------------------------------------------------------- news ticker */
let lastWarn = {};
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
  if (d.trashUse > d.trashCap && warn('trash', 'La basura se acumula en las calles: construye un vertedero en "Energía, agua y basura".', 24)) return;
  if (!d.connected && d.pop > 250 && warn('hw', 'Conecta tu ciudad con la autopista del oeste: llegarán turistas y la industria podrá vender fuera.', 36)) return;
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
  { title: 'Construye el ayuntamiento', text: 'Se desbloquea al llegar a 100 habitantes (rango Pueblo) y está en "Servicios". Desde él podrás aprobar leyes en Política (arriba a la derecha).', done: (d) => d.svc.cityhall, tool: 'cityhall' },
  { title: 'Aprueba tu primera ley', text: 'Abre Política (arriba a la derecha) y aprueba una ley. Las que encajan con tu partido gustan a tus votantes.', done: () => LAWS.some((l) => law(l.id)), action: () => openModal('politicsModal') },
  { title: 'Revisa el presupuesto', text: 'Ajusta impuestos y fondos en Presupuesto (arriba a la derecha). Más impuestos, más dinero, pero menos crecimiento.', done: () => S.budgetSeen, action: () => openModal('budgetModal') },
  { title: '¡Tu ciudad está en marcha!', text: `Cada ${ELECTION_EVERY} días hay elecciones: vigila la aprobación y la intención de voto. Añade ocio (zoológico, estadio, museo) para atraer turistas.` },
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
const TOOL_BY_ID = Object.fromEntries(CATEGORIES.flatMap((c) => c.tools.map((t) => [t.id, { ...t, cat: c.id }])));
let tool = TOOL_BY_ID.look;

function renderToolbar() {
  const bar = $('toolbar');
  bar.innerHTML = '';
  CATEGORIES.forEach((c, n) => {
    const b = el('button', 'tb', `<span class="ic">${ic(c.ico)}</span>${c.label}`);
    b.title = `${c.label} (${n + 1})`;
    b.setAttribute('aria-pressed', tool.cat === c.id);
    b.onclick = () => selectTool(tool.cat === c.id && c.id !== 'look' ? 'look' : c.tools[0].id);
    bar.append(b);
  });
  const lb = el('button', 'tb', `<span class="ic">${ic('layers')}</span>Capas`);
  lb.title = 'Capas de información (L)';
  lb.setAttribute('aria-pressed', layerPanel);
  lb.onclick = () => { layerPanel = !layerPanel; sfx('click'); if (tool.id !== 'look') selectTool('look'); else renderToolbar(); };
  bar.append(lb);
  const ub = el('button', 'tb', `<span class="ic">${ic('undo')}</span>Deshacer`);
  ub.title = 'Deshacer lo último que has construido hoy (Ctrl+Z)';
  ub.onclick = undo;
  bar.append(ub);
  const sub = $('subtools'), cat = CATEGORIES.find((c) => c.id === tool.cat);
  sub.innerHTML = '';
  sub.classList.toggle('open', cat.id !== 'look' || layerPanel);
  sub.classList.toggle('layers', cat.id === 'look');
  if (cat.id === 'look') {
    if (!layerPanel) return;
    for (const [id, L] of [[null, { label: 'Sin capa', ico: 'hand' }], ...Object.entries(LAYERS)]) {
      const b = el('button', 'st', `<span class="ic">${ic(L.ico)}</span><span>${L.short || L.label}</span>`);
      b.title = L.label;
      b.setAttribute('aria-pressed', currentLayer() === id);
      b.onclick = () => { setLayer(id); sfx('click'); renderToolbar(); };
      sub.append(b);
    }
    return;
  }
  for (const t of cat.tools) {
    const locked = isLocked(unlockKey(t));
    const b = el('button', 'st' + (locked ? ' locked' : ''), `<span class="ic">${ic(locked ? 'lock' : t.ico)}</span><span>${t.label}<small>${locked ? `${RANKS[UNLOCK[unlockKey(t)]][1]}: ${fmt(RANKS[UNLOCK[unlockKey(t)]][0])} hab.` : t.mode === 'one' ? money(buildCost(t)) : `${money(t.cost)} / casilla`}</small></span>`);
    b.setAttribute('aria-pressed', tool.id === t.id);
    b.title = locked ? lockText(t) : t.hint || '';
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
let layerPanel = false;
function selectTool(id) {
  tool = TOOL_BY_ID[id];
  if (id !== 'look') layerPanel = false;
  // placing a service shows where it would reach; other tools bring back the player's layer
  const def = tool.svc && SERVICES[tool.svc];
  if (def && def.radius) setLayer(layerFor(tool.svc), true);
  else restoreLayer();
  showRange(0, 0, 0);
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
  if (mode === 'plot') { // every tile of the plot under the pointer, the hovered one first
    const p = plotOf(I(...b)), px = (p % PLOTS) * PLOT, pz = ((p / PLOTS) | 0) * PLOT;
    out.push(I(...b));
    for (let z = pz; z < pz + PLOT; z++) for (let x = px; x < px + PLOT; x++) if (I(x, z) !== out[0]) out.push(I(x, z));
    return out;
  }
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
// key used for unlocks: service id, zone id or tool id
const unlockKey = (t) => t.svc || t.zone || t.id;
function lockText(t) {
  const r = UNLOCK[unlockKey(t)] || 0;
  return `Se desbloquea al ser ${RANKS[r][1].toLowerCase()} (${fmt(RANKS[r][0])} habitantes)`;
}
function evaluate(i) {
  const T = S.tiles[i], treeCost = T.tree && !T.t ? 5 : 0;
  if (isLocked(unlockKey(tool))) return { ok: false, why: lockText(tool) };
  if (tool.id === 'buy') return evaluatePlot(plotOf(i));
  if (!S.owned[plotOf(i)]) return { ok: false, why: 'Terreno sin comprar: cómpralo en «Terrenos»' };
  if (T.hw) return tool.id === 'road' || tool.id === 'avenue' ? { ok: true, cost: 0, skip: true } : { ok: false, why: 'Es la autopista: no se puede tocar' };
  switch (tool.id) {
    case 'avenue':
      if (T.t === 'road' && T.av) return { ok: true, cost: 0, skip: true };
      if (T.t === 'svc') return { ok: false, why: 'Hay un edificio' };
      if (T.t === 'road') return { ok: true, cost: WATER[i] ? 80 : 40 };
      return { ok: true, cost: (WATER[i] ? 150 : 60) + treeCost };
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

// plots: bought one at a time, next to land the city owns, as many as the rank allows
const plotsBought = () => S.owned.filter(Boolean).length - 4;
function evaluatePlot(p) {
  if (S.owned[p]) return { ok: false, why: 'Este terreno ya es tuyo' };
  const px = p % PLOTS, pz = (p / PLOTS) | 0;
  const nextTo = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => px + dx >= 0 && px + dx < PLOTS && pz + dz >= 0 && pz + dz < PLOTS && S.owned[(pz + dz) * PLOTS + px + dx]);
  if (!nextTo) return { ok: false, why: 'Tiene que lindar con tus terrenos' };
  const rank = S.rank ?? 0;
  if (plotsBought() >= PLOTS_FOR_RANK[rank]) {
    const next = PLOTS_FOR_RANK.findIndex((n) => n > plotsBought());
    return { ok: false, why: next > 0 ? `Para comprar más terreno, sube a ${RANKS[next][1].toLowerCase()} (${fmt(RANKS[next][0])} habitantes)` : 'Ya no quedan terrenos por comprar' };
  }
  return { ok: true, cost: plotPrice(plotsBought()) };
}
function buyPlot(i) {
  const p = plotOf(i), ev = evaluatePlot(p);
  if (!ev.ok) { news(ev.why, 'TERRENOS'); return; }
  if (ev.cost > S.money) { news(`Fondos insuficientes: el terreno cuesta ${money(ev.cost)}.`, 'AVISO'); return; }
  S.money -= ev.cost;
  S.owned[p] = true;
  drawPlots();
  sfx('cash');
  news(`${S.name} compra un nuevo terreno por ${money(ev.cost)}. ¡Hay sitio para crecer!`, 'TERRENOS');
  updateHud();
  save();
}

function apply(list) {
  if (tool.id === 'look') return;
  if (tool.id === 'buy') { if (list.length) buyPlot(list[0]); return; }
  const evals = list.map((i) => [i, evaluate(i)]).filter(([, e]) => e.ok && !e.skip);
  const cost = evals.reduce((a, [, e]) => a + e.cost, 0);
  if (!evals.length) return;
  if (cost > S.money) { news(`Fondos insuficientes: necesitas ${money(cost)}.`, 'AVISO'); return; }
  undoStack.push({ money: S.money, day: S.day, tiles: evals.map(([i]) => [i, { ...S.tiles[i] }]) });
  if (undoStack.length > 30) undoStack.shift();
  S.money -= cost;
  const touched = new Set(), clear = { lv: 0, prev: 0, build: 0, fire: 0, saved: false, ruin: 0, av: 0 };
  for (const [i] of evals) {
    const T = S.tiles[i];
    if (tool.id === 'road') Object.assign(T, clear, { t: 'road', z: null, s: null, tree: false });
    else if (tool.id === 'avenue') Object.assign(T, clear, { t: 'road', av: 1, z: null, s: null, tree: false });
    else if (tool.id === 'trees') T.tree = true;
    else if (tool.id === 'bulldoze') Object.assign(T, clear, { t: 0, z: null, s: null, tree: false });
    else if (tool.zone) Object.assign(T, clear, { t: 'zone', z: tool.zone, s: null, tree: false });
    else Object.assign(T, clear, { t: 'svc', s: tool.svc, z: null, tree: false, v: Math.floor(Math.random() * 1000) });
    touched.add(i);
  }
  markFires();
  sfx(tool.id === 'bulldoze' ? 'demolish' : tool.zone || tool.id === 'trees' ? 'zone' : tool.id === 'road' || tool.id === 'avenue' ? 'road' : 'build');
  for (const i of touched) refreshAround(i);
  for (const i of touched) if (S.tiles[i].t === 'svc') refreshTile(i, true);
  refresh();
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
  markFires();
  refresh(); updateHud(); save();
  news('Deshecho.', 'AJUSTES');
}

let drag = null, hoverTile = null;
const tip = $('tooltip');
let press = null; // where a left click started in look mode, to tell clicks from drags
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 0 && tool.id === 'look') press = { x: e.clientX, y: e.clientY, t: performance.now() };
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
  if (press && tool.id === 'look' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6 && performance.now() - press.t < 400) {
    const t = tileAt(e);
    if (t) inspect(I(...t)); else closeInspector();
  }
  press = null;
  if (!drag) return;
  apply(pathTiles(drag.a, drag.b, tool.mode));
  drag = null;
  updateCursor(e);
});
renderer.domElement.addEventListener('pointerleave', () => { tip.style.display = 'none'; showRange(0, 0, 0); if (!drag) cursor.count = 0; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

const OK = new THREE.Color(0x4fb86a), BAD = new THREE.Color(0xd8452f), NEUTRAL = new THREE.Color(0xb8b2a6);
function updateCursor(e) {
  const t = drag ? drag.b : hoverTile;
  if (!t) { cursor.count = 0; tip.style.display = 'none'; showRange(0, 0, 0); return; }
  const def = tool.svc && SERVICES[tool.svc];
  showRange(t[0], t[1], def && def.radius ? radiusOf(tool.svc) : 0);
  const list = tool.id === 'look' ? [I(...t)] : pathTiles(drag ? drag.a : t, t, tool.mode);
  let cost = 0, bad = '', warn = '';
  cursor.count = list.length;
  const plotEv = tool.mode === 'plot' ? evaluate(list[0]) : null; // a plot is judged once, as a whole
  list.forEach((i, k) => {
    const ev = plotEv ? (k ? { ...plotEv, cost: 0 } : plotEv) : tool.id === 'look' ? { ok: true } : evaluate(i);
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
    : `<b>${ic(tool.ico)} ${tool.label}</b>${list.length > 1 && !plotEv ? `${list.length} casillas · ` : ''}${money(cost)}${cost > S.money ? ' <span class="bad">(no te llega)</span>' : ''}${bad ? `<br><span class="bad">${bad}</span>` : ''}${warn ? `<br><span class="bad">${warn}</span>` : ''}`;
  tip.style.display = tip.innerHTML ? 'block' : 'none';
  tip.style.left = `${Math.min(e.clientX + 16, innerWidth - 270)}px`;
  tip.style.top = `${e.clientY + 16}px`;
}
function describe(i) {
  const T = S.tiles[i], x = i % N, z = (i / N) | 0;
  if (T.t === 'road') return `<b>🛣️ ${WATER[i] ? 'Puente' : 'Calle'}</b>Tráfico: ${trafficLabel(i)}`;
  if (T.t === 'svc') {
    const s = SERVICES[T.s];
    const extra = s.cap ? `Produce ${s.cap} ${s.plant === 'power' ? '⚡' : '💧'}${s.smoke ? ' · contamina' : ''} · ${money(upkeepOf(T.s))}/día`
      : s.radius ? `Radio: ${Math.round(radiusOf(T.s))} casillas · ${money(upkeepOf(T.s))}/día${s.tourism ? ' · atrae turistas' : ''}`
      : `Aquí se aprueban las leyes · ${money(upkeepOf(T.s))}/día`;
    return `<b>${ic(s.ico)} ${s.label}</b>${extra}${nearRoad(x, z, 1) ? '' : '<br><span class="bad">Sin calle al lado</span>'}`;
  }
  if (T.t === 'zone') {
    const Z = ZONES[T.z];
    if (!T.lv) {
      const why = !nearRoad(x, z) ? 'Necesita una calle cerca' : !D?.powerCap ? 'Necesita luz' : !D?.waterCap ? 'Necesita agua'
        : D.powerCap - D.powerUse < 5 ? '<span class="bad">Sin luz de sobra: construye otra central</span>'
        : D.waterCap - D.waterUse < 4 ? '<span class="bad">Sin agua de sobra: construye otra torre</span>'
        : D?.demand[T.z] <= 0 ? 'No hay demanda ahora mismo' : 'Esperando a que alguien construya';
      return `<b>${ic(Z.ico)} Zona de ${Z.label.toLowerCase()}</b>${why}`;
    }
    const names = { res: ['', 'Casa', 'Casa grande', 'Edificio de viviendas'], com: ['', 'Tienda', 'Comercio', 'Galerías'], off: ['', 'Oficinas', 'Edificio de oficinas', 'Torre de oficinas'], ind: ['', 'Taller', 'Fábrica', 'Complejo industrial'] };
    if (T.ruin) return '<b>🏚️ Ruinas</b>Se reconstruirá en unos días';
    if (T.fire > 0) return `<b>🔥 ¡En llamas!</b>${T.saved ? 'Los bomberos lo están apagando' : 'Sin bomberos cerca: puede quemarse entero'}`;
    if (T.build > 0) return `<b>🏗️ En obras: ${names[T.z][T.lv].toLowerCase()}</b>Faltan ${T.build} h · nivel ${T.lv}`;
    return `<b>${ic(Z.ico)} ${names[T.z][T.lv]}</b>Nivel ${T.lv} · ${Z.cap[T.lv]} ${Z.noun}`;
  }
  if (WATER[i]) return '<b>🌊 Río</b>Solo se puede cruzar con un puente.';
  return T.tree ? '<b>🌳 Arboleda</b>' : '';
}

// keep the news ticker and alert chips just below the (variable-height) top bar
function placeTicker() {
  const bar = document.querySelector('.topbar').getBoundingClientRect();
  if (innerWidth > 900) document.querySelector('.ticker').style.top = `${bar.bottom + 8}px`;
  $('alerts').style.top = `${bar.bottom + (innerWidth > 900 ? 52 : 8)}px`;
}

/* keyboard */
let lastSpeed = S.speed || 1;
addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
  const n = Number(e.key);
  if (n >= 1 && n <= CATEGORIES.length) selectTool(CATEGORIES[n - 1].tools[0].id);
  else if (e.key === 'Escape') { if (document.querySelector('.modal.open')) closeModals(); else if (document.body.classList.contains('photo')) togglePhotoMode(); else { closeInspector(); selectTool('look'); } }
  else if (e.code === 'Space') { e.preventDefault(); setSpeed(S.speed ? 0 : lastSpeed); }
  else if (e.key === 'q' || e.key === 'e') rotateCamera(e.key === 'q' ? 1 : -1);
  else if (e.key === 'l' || e.key === 'L') { layerPanel = !layerPanel; if (tool.id !== 'look') selectTool('look'); else renderToolbar(); }
  else if (e.key === 'h' || e.key === 'H') togglePhotoMode();
  else if (e.key === 'p' || e.key === 'P') takePhoto();
  else if (e.key === 'm' || e.key === 'M') toggleSound();
  else if (e.key === 'g' || e.key === 'G') openModal('statsModal');
  else if (e.key === '?') openModal('helpModal');
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
  $('cityRank').textContent = RANKS[S.rank ?? 0][1];
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
  renderInspector();
  placeTicker();
  const days = S.nextElection - S.day;
  $('sVote').textContent = `${D.vote} % voto`;
  $('sVote').style.color = D.vote >= 50 ? '' : 'var(--accent)';
  $('sElection').textContent = days <= 1 ? 'elecciones mañana' : `elecciones en ${days} días`;
}

// persistent problem chips under the top bar; each one leads to its fix
function renderAlerts() {
  const out = [], d = D;
  if (d.emptyLots && !d.powerCap) out.push(['bolt', 'Sin central eléctrica no se muda nadie', 'power']);
  else if (!d.powerOk) out.push(['bolt', 'Apagones: la ciudad gasta más luz de la que produce', 'power']);
  else if (d.emptyLots && d.powerCap - d.powerUse < 5) out.push(['bolt', 'Red eléctrica al límite: la ciudad no puede crecer', 'power']);
  if (d.emptyLots && !d.waterCap) out.push(['drop', 'Sin torre de agua no se muda nadie', 'water']);
  else if (!d.waterOk) out.push(['drop', 'Grifos secos: falta agua', 'water']);
  else if (d.emptyLots && d.waterCap - d.waterUse < 4) out.push(['drop', 'Agua al límite: la ciudad no puede crecer', 'water']);
  if (d.trashUse > d.trashCap) out.push(['bin', d.trashCap ? 'Los vertederos no dan abasto: la basura se acumula' : 'No hay vertedero: la basura se acumula en las calles', 'landfill']);
  if (!d.connected && d.pop >= 150) out.push(['highway', 'Conecta una calle con la autopista del oeste para recibir turistas y mercancías', 'road']);
  if (S.money < 0) out.push(['trend', 'Números rojos: revisa el presupuesto', 'budget']);
  const key = out.map((a) => a[1]).join('|');
  if (key === renderAlerts.key) return;
  if (out.length > (renderAlerts.n ?? out.length)) sfx('alert');
  renderAlerts.n = out.length;
  renderAlerts.key = key;
  $('alerts').innerHTML = out.map(([name, text, fix]) => `<button class="alert" data-fix="${fix}">${ic(name)} ${text} <b>Arreglar →</b></button>`).join('');
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
  if (id === 'statsModal') renderStats();
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
    row.querySelector('input').oninput = (e) => { S.taxes[z] = Number(e.target.value); row.querySelector('output').textContent = `${S.taxes[z]} %`; refresh(); renderBudgetNumbers(); updateHud(); };
    taxRows.append(row);
  }
  fundRows.innerHTML = '';
  for (const [k, label, ic, c] of FUNDS) {
    const row = el('div', 'slider');
    row.style.setProperty('--c', c);
    row.innerHTML = `<label for="fund-${k}">${ic} ${label}</label><input id="fund-${k}" type="range" min="0" max="150" step="5" value="${S.funding[k]}"><output>${S.funding[k]} %</output><span data-fund="${k}"></span>`;
    row.querySelector('input').oninput = (e) => { S.funding[k] = Number(e.target.value); row.querySelector('output').textContent = `${S.funding[k]} %`; refresh(); renderBudgetNumbers(); updateHud(); };
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
  refresh(); renderBudgetNumbers(); updateHud(); save();
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
  refresh(); updateHud(); save();
  openModal('politicsModal');
});

function renderPolitics() {
  const p = party(), hall = !!D.svc.cityhall, days = S.nextElection - S.day;
  $('polParty').innerHTML = S.party
    ? `<span class="party-icon" style="--c:${p.color}">${p.icon}</span><div><b>${p.name}</b><small>${p.label} · ${S.terms} ${S.terms === 1 ? 'mandato ganado' : 'mandatos ganados'}</small></div>`
    : '<span class="party-icon">❔</span><div><b>Sin partido</b><small>Te presentas como independiente</small></div>';
  $('polVote').textContent = `${D.vote} %`;
  $('polVote').className = D.vote >= 50 ? 'pos' : 'negc';
  $('polVoteRows').innerHTML = D.voteRows.map(([ic, label, v]) => {
    const r = Math.round(v);
    return `<li class="${r < 0 ? 'neg' : ''}"><span>${ic}</span><span>${label}</span><b>${r > 0 && !label.startsWith('Aprobación') ? '+' : ''}${r}</b></li>`;
  }).join('') + `<li class="total"><span></span><span>= intención de voto (más o menos 4 puntos de margen de error)</span><b>${D.vote} %</b></li>`;
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
    S.money -= LAW_FEE; S.laws[l.id] = S.day; sfx('law');
    news(`El pleno aprueba: ${l.name.toLowerCase()}.`, 'POLÍTICA');
  }
  refresh(); checkTutorial(D); renderPolitics(); updateHud(); save();
});
$('polChangeParty').onclick = () => openModal('partyModal');

function showElection(r) {
  sfx(r.won ? 'win' : 'lose');
  if (r.won) fireworks(10);
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
$('perfToggle').checked = perfVisible;
$('perf').hidden = !perfVisible;
$('perfToggle').onchange = (e) => {
  setPerfVisible(e.target.checked);
  $('perf').hidden = !perfVisible;
  try { localStorage.setItem('urbania-perf', perfVisible ? '1' : '0'); } catch { /* storage unavailable */ }
};
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
  closeInspector();
  setState(newState());
  setStyle(S.style);
  $('styleSel').value = S.style;
  rebuildAll(); agents.length = 0; walkers.length = 0; undoStack.length = 0; markFires();
  refresh(); setSpeed(1); renderAdvisor(); updateHud(); save();
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
  closeInspector();
  setState(next); setStyle(S.style); $('styleSel').value = S.style;
  undoStack.length = 0; agents.length = 0; walkers.length = 0;
  rebuildAll(); refresh(); markFires(); setSpeed(S.speed || 1); renderAdvisor(); updateHud(); save();
  news(`Partida cargada: ${S.name}, día ${S.day}.`, 'AJUSTES');
};

export { lastWarn, hourlyNews, STEPS, renderAdvisor, checkTutorial, TOOL_BY_ID, tool, renderToolbar, layerPanel, selectTool, raycaster, ndc, groundPlane, tileAt, pathTiles, unlockKey, lockText, evaluate, apply, undoStack, undo, drag, hoverTile, tip, press, OK, BAD, NEUTRAL, updateCursor, describe, placeTicker, lastSpeed, rotateCamera, setSpeed, partOfDay, updateHud, renderAlerts, openModal, closeModals, renderApproval, renderBudget, renderBudgetNumbers, LEAN_LABEL, renderParties, renderPolitics, showElection, citizenQuotes, renderCitizens, newCity };

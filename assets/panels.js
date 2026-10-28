// Urbania — extra panels: building inspector, rank-up celebration, statistics charts, photo mode and help.
import * as THREE from 'three';
import { rng, pick } from './buildings.js';
import { $, N, RANKS, SERVICES, UNLOCK, W, WATER, ZONES, clamp, fmt, ic, money, news, signed } from './config.js';
import { S } from './state.js';
import { renderFrame, renderer, scene } from './scene.js';
import { D, LAND_FOR_LEVEL, isLocked, radiusOf, upkeepOf } from './sim.js';
import { isMuted, setMuted, sfx } from './audio.js';
import { layerValue } from './layers.js';
import { TOOL_BY_ID, apply, closeModals, describe, lastSpeed, openModal, renderToolbar, selectTool, setSpeed, tool } from './ui.js';
import { fireworks, roadLoad, trafficLabel } from './life.js';

/* building inspector: click any tile in look mode */
const SURNAMES = ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno', 'Álvarez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos'];
const BUSINESS = { com: ['Ultramarinos', 'Café', 'Panadería', 'Ferretería', 'Librería', 'Floristería'], off: ['Consultora', 'Estudio', 'Gestoría', 'Agencia', 'Aseguradora'], ind: ['Talleres', 'Conservas', 'Maderas', 'Cerámicas', 'Metalúrgica'] };
const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1, 1.02).translate(0, 0.5, 0)), new THREE.LineBasicMaterial({ color: 0xe4553b, toneMapped: false }));
selBox.visible = false;
scene.add(selBox);
let inspected = -1;

function inspect(i) { inspected = i; sfx('click'); renderInspector(); }
function closeInspector() { inspected = -1; $('inspector').hidden = true; selBox.visible = false; renderInspector.last = null; }
const check = (ok, text) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${text}</li>`;
const bar = (v, label) => `<div class="meter-row"><span>${label}</span><div class="mini-bar"><i style="width:${clamp(v, 0, 100)}%"></i></div><b>${Math.round(v)}</b></div>`;

function renderInspector() {
  if (inspected < 0 || !D) return;
  const i = inspected, T = S.tiles[i], x = i % N, z = (i / N) | 0, r = rng(i * 7 + (T.v || 0));
  let title = '', body = '', acts = '', height = 0.3;
  const coverage = () => '<ul class="checks">' + [['cov:health', 'Centro de salud'], ['cov:school', 'Escuela'], ['cov:police', 'Policía'], ['cov:fire', 'Bomberos'], ['cov:park', 'Parque'], ['cov:bus', 'Autobús'], ['cov:leisure', 'Ocio y cultura']]
    .map(([k, label]) => check(layerValue(k, i) > 0, label)).join('') + '</ul>';
  if (T.t === 'road') {
    title = `${ic(T.av ? 'avenue' : 'road')} ${T.av ? 'Avenida' : WATER[i] ? 'Puente' : 'Calle'}`;
    body = `<p>Tráfico: <b>${trafficLabel(i)}</b> · ${Math.round(roadLoad[i])} vehículos ahora mismo.</p>`;
    if (!T.av) acts += isLocked('avenue') ? `<p class="note">${ic('lock')} Las avenidas se desbloquean al ser villa.</p>` : '<button class="btn primary" data-act="avenue">Convertir en avenida · 40 €</button>';
    height = 0.05;
  } else if (T.t === 'svc') {
    const def = SERVICES[T.s];
    title = `${ic(def.ico)} ${def.label}`;
    let covered = 0;
    if (def.radius) S.tiles.forEach((U, k) => { if (U.t === 'zone' && U.z === 'res' && U.lv && Math.hypot((k % N) - x, ((k / N) | 0) - z) <= radiusOf(T.s)) covered += ZONES.res.cap[U.lv]; });
    body = `<p>Mantenimiento: <b>${money(upkeepOf(T.s))}</b> al día · fondos al ${S.funding[def.fund]} %.</p>`
      + (def.cap ? `<p>Produce <b>${def.cap} ${def.plant === 'power' ? 'de luz' : 'de agua'}</b>${def.smoke ? ' y contamina a su alrededor' : ''}.</p>` : '')
      + (def.radius ? `<p>Llega a <b>${Math.round(radiusOf(T.s))} casillas</b> y atiende a <b>${fmt(covered)} vecinos</b>.</p>` : '')
      + (def.tourism ? '<p>Atrae turistas que dejan dinero cada día.</p>' : '')
      + (T.s === 'cityhall' ? '<p>Desde aquí se aprueban las leyes.</p>' : '');
    acts += '<button class="btn" data-act="demolish">Demoler · 10 €</button>';
    height = 0.9;
  } else if (T.t === 'zone') {
    const Z = ZONES[T.z];
    if (!T.lv) {
      title = `${ic(Z.ico)} Solar de ${Z.label.toLowerCase()}`;
      body = `<p>${describe(i).replace(/^<b>.*?<\/b>/, '')}</p>` + bar(D.land[i], 'Valor del suelo') + bar(D.pol[i] * 100, 'Contaminación');
      height = 0.05;
    } else {
      const names = { res: ['', 'Casa', 'Casa grande', 'Edificio de viviendas'], com: ['', 'Tienda', 'Comercio', 'Galerías'], off: ['', 'Oficinas', 'Edificio de oficinas', 'Torre de oficinas'], ind: ['', 'Taller', 'Fábrica', 'Complejo industrial'] };
      const who = T.z === 'res' ? `Viven aquí <b>${Z.cap[T.lv]} personas</b>${T.lv === 1 ? `: la familia ${pick(r, SURNAMES)}` : `, entre ellas los ${pick(r, SURNAMES)} y los ${pick(r, SURNAMES)}`}.`
        : `<b>${pick(r, BUSINESS[T.z])} ${pick(r, SURNAMES)}</b> da trabajo a <b>${Z.cap[T.lv]} personas</b>.`;
      title = `${ic(Z.ico)} ${names[T.z][T.lv]} · nivel ${T.lv}`;
      body = (T.fire > 0 ? `<p class="bad">🔥 ¡En llamas! ${T.saved ? 'Los bomberos lo están apagando.' : 'No hay bomberos cerca.'}</p>` : '')
        + (T.build > 0 ? `<p>🏗️ En obras: faltan <b>${T.build} h</b>.</p>` : `<p>${who}</p>`)
        + bar(D.land[i], 'Valor del suelo') + bar(D.pol[i] * 100, 'Contaminación');
      if (T.z === 'res') body += `<h4>Servicios cerca</h4>${coverage()}`;
      if (T.lv < 3 && T.z !== 'ind') {
        const need = LAND_FOR_LEVEL[T.z][T.lv + 1], appr = T.lv === 2 ? 70 : 55;
        body += `<h4>Para subir a nivel ${T.lv + 1}</h4><ul class="checks">${check(D.land[i] >= need, `Valor del suelo de ${need} o más`)}${check(S.approval >= appr, `Aprobación de ${appr} % o más`)}${check(D.demand[T.z] > 0, 'Demanda en la ciudad')}${check(D.powerCap - D.powerUse >= 4 && D.waterCap - D.waterUse >= 4, 'Luz y agua de sobra')}</ul>`;
      }
      acts += '<button class="btn" data-act="demolish">Demoler · 10 €</button>';
      height = { res: [0, 0.6, 0.9, 1.6], com: [0, 0.5, 0.7, 0.9], off: [0, 0.9, 1.6, 2.8], ind: [0, 0.6, 0.7, 0.8] }[T.z][T.lv];
    }
  } else {
    title = WATER[i] ? `${ic('drop')} Río` : T.tree ? `${ic('tree')} Arboleda` : `${ic('zones')} Terreno libre`;
    body = WATER[i] ? '<p>Solo se puede cruzar con un puente.</p>' : bar(D.land[i], 'Valor del suelo') + bar(D.pol[i] * 100, 'Contaminación');
    height = 0.05;
  }
  // only touch the DOM when something changed, so buttons keep working while the HUD refreshes
  const html = title + body + acts;
  if (html !== renderInspector.last) {
    renderInspector.last = html;
    $('inspTitle').innerHTML = title;
    $('inspBody').innerHTML = body;
    $('inspActions').innerHTML = acts;
  }
  $('inspector').hidden = false;
  selBox.visible = true;
  selBox.position.set(W(x), WATER[i] && T.t === 'road' ? 0.1 : 0, W(z));
  selBox.scale.set(1, Math.max(0.06, height), 1);
}
$('inspClose').onclick = closeInspector;
$('inspActions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || inspected < 0) return;
  const prev = tool.id;
  selectTool(b.dataset.act === 'avenue' ? 'avenue' : 'bulldoze');
  apply([inspected]);
  selectTool(prev);
  renderInspector();
});

/* rank-up celebration */
let rankShown = null; // a second promotion while the first is still on screen joins it
function showRankUp(r, reward, from = r - 1) {
  if (rankShown && $('rankModal').classList.contains('open')) { from = rankShown.from; reward += rankShown.reward; }
  rankShown = { from, reward };
  const [, name] = RANKS[r];
  const unlocked = Object.entries(UNLOCK).filter(([, k]) => k > from && k <= r).map(([key]) => {
    const t = Object.values(TOOL_BY_ID).find((x) => (x.svc || x.zone || x.id) === key);
    return t ? `<li>${ic(t.ico)} ${t.label}</li>` : '';
  }).join('');
  const next = RANKS[r + 1];
  $('rankTitle').innerHTML = `${ic('star')} ¡${S.name} ya es ${name.toLowerCase()}!`;
  $('rankBody').innerHTML = `<p>Los vecinos lo celebran en la plaza. El Estado premia el crecimiento con <b>${money(reward)}</b>.</p>`
    + (unlocked ? `<h3>Nuevos edificios</h3><ul class="unlocks">${unlocked}</ul>` : '')
    + (next ? `<p class="note">Siguiente meta: ${next[1].toLowerCase()} con ${fmt(next[0])} habitantes.</p>` : '<p class="note">Has llegado a lo más alto. ¡Enhorabuena, alcaldía!</p>');
  news(`${S.name} sube de categoría: ahora es ${name.toLowerCase()}.`, 'CIUDAD');
  sfx('rank');
  fireworks(12);
  if (S.speed) rankResume = S.speed;
  setSpeed(0);
  openModal('rankModal');
}
let rankResume = 1;
$('rankOk').onclick = () => { rankShown = null; closeModals(); setSpeed(rankResume); renderToolbar(); };
$('rankModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) { rankShown = null; setSpeed(rankResume); } });

/* statistics: one sample per day */
const CHARTS = [
  ['pop', 'Población', (v) => fmt(v), '#4f9a4f'], ['money', 'Fondos', (v) => money(v), '#d99a2b'],
  ['net', 'Saldo diario', (v) => signed(v), '#3f6fb5'], ['approval', 'Aprobación', (v) => `${v} %`, '#e4553b'],
  ['unemployment', 'Paro', (v) => `${v} %`, '#8a5fbf'], ['land', 'Valor del suelo medio', (v) => v, '#4f9a5a'],
  ['smoke', 'Contaminación en casas', (v) => `${v} %`, '#6b6258'], ['jam', 'Atascos', (v) => `${v} %`, '#b08a4a'],
];
function chart(key, color) {
  const pts = S.stats.map((p) => p[key] ?? 0), w = 260, h = 70;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const xy = pts.map((v, k) => [(k / Math.max(1, pts.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)]);
  const line = xy.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" preserveAspectRatio="none"><polygon points="0,${h} ${line} ${w},${h}" fill="${color}" opacity=".15"/><polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>`;
}
function renderStats() {
  if (S.stats.length < 2) { $('statsBody').innerHTML = '<p class="note">Las gráficas aparecen a partir del segundo día de juego. Acelera el tiempo con los botones de velocidad.</p>'; return; }
  $('statsBody').innerHTML = '<div class="charts">' + CHARTS.map(([key, label, f, color]) => {
    const vals = S.stats.map((p) => p[key] ?? 0), last = vals[vals.length - 1];
    return `<div class="panel chart-card"><small>${label}</small><b>${f(last)}</b>${chart(key, color)}<small class="note">mín. ${f(Math.min(...vals))} · máx. ${f(Math.max(...vals))}</small></div>`;
  }).join('') + `</div><p class="note">Últimos ${S.stats.length} días (desde el día ${S.stats[0].day}).</p>`;
}

/* photo mode, screenshots, sound toggle and help */
function togglePhotoMode() {
  const on = document.body.classList.toggle('photo');
  if (on) { closeInspector(); news('Modo foto: H para volver · P para guardar la imagen.', 'FOTO'); }
}
function takePhoto() {
  renderFrame();
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `${S.name.replace(/[^\w-]+/g, '_')}-dia${S.day}.png`;
  a.click();
  sfx('cash');
}
function toggleSound() {
  setMuted(!isMuted());
  $('soundToggle').checked = !isMuted();
  news(isMuted() ? 'Sonido desactivado.' : 'Sonido activado.', 'AJUSTES');
}
$('soundToggle').checked = !isMuted();
$('soundToggle').onchange = (e) => { setMuted(!e.target.checked); };
$('photoBtn').onclick = togglePhotoMode;
$('snapBtn').onclick = takePhoto;
$('statsBtn').onclick = () => openModal('statsModal');
$('helpBtn').onclick = () => openModal('helpModal');

export { SURNAMES, BUSINESS, selBox, inspected, inspect, closeInspector, check, bar, renderInspector, showRankUp, rankResume, CHARTS, chart, renderStats, togglePhotoMode, takePhoto, toggleSound };

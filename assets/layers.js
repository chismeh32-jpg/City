// Urbania — information layers drawn over the map (land value, pollution, traffic, service coverage)
// and the coverage ring shown while placing a service.
import * as THREE from 'three';
import { N, SERVICES, W, WATER, _c, _m, clamp, el, ic } from './config.js';
import { S } from './state.js';
import { scene } from './scene.js';
import { D, radiusOf } from './sim.js';
import { roadLoad } from './life.js';

const COVERAGE = ['health', 'school', 'police', 'fire', 'park', 'bus'];
const LAYERS = {
  land: { label: 'Valor del suelo', ico: 'coins', legend: ['Bajo', 'Alto'] },
  pollution: { label: 'Contaminación', ico: 'factory', legend: ['Contaminado', 'Limpio'] },
  traffic: { label: 'Tráfico', ico: 'road', legend: ['Atasco', 'Fluido'] },
  ...Object.fromEntries(COVERAGE.map((k) => [`cov:${k}`, { label: `Cobertura: ${SERVICES[k].label.toLowerCase()}`, short: SERVICES[k].label, ico: SERVICES[k].ico, legend: ['Sin servicio', 'Bien cubierto'], kind: [k] }])),
  'cov:leisure': { label: 'Cobertura: ocio y cultura', short: 'Ocio y cultura', ico: 'ferris', legend: ['Sin ocio', 'Bien cubierto'], kind: Object.keys(SERVICES).filter((k) => SERVICES[k].leisure) },
};
const L_BAD = new THREE.Color(0xd8452f), L_MID = new THREE.Color(0xf0c04a), L_GOOD = new THREE.Color(0x3fa45a);
const gradient = (t, out) => (t < 0.5 ? out.copy(L_BAD).lerp(L_MID, t * 2) : out.copy(L_MID).lerp(L_GOOD, (t - 0.5) * 2));

const layerMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }), N * N);
layerMesh.position.y = 0.05;
layerMesh.count = 0;
layerMesh.renderOrder = 2;
scene.add(layerMesh);

let layer = null, userLayer = null, layerClock = 0;
// goodness of a tile for the active layer, 0 (bad) … 1 (good), or null to leave it uncoloured
function layerValue(id, i) {
  if (WATER[i]) return null;
  if (id === 'land') return D.land[i] / 100;
  if (id === 'pollution') return 1 - Math.min(1, D.pol[i]);
  if (id === 'traffic') return S.tiles[i].t === 'road' ? 1 - Math.min(1, roadLoad[i] / (S.tiles[i].av ? 6 : 3)) : null;
  const def = LAYERS[id], x = i % N, z = (i / N) | 0;
  let best = 0;
  for (const [s, sx, sz] of D.svcList) {
    if (!def.kind.includes(s)) continue;
    const r = radiusOf(s), dist = Math.hypot(sx - x, sz - z);
    if (dist <= r) best = Math.max(best, 1 - (dist / r) * 0.6);
  }
  return best;
}
function drawLayer() {
  if (!layer || !D || !D.land) { layerMesh.count = 0; return; }
  let n = 0;
  for (let i = 0; i < N * N; i++) {
    const v = layerValue(layer, i);
    if (v == null) continue;
    _m.makeTranslation(W(i % N), 0, W((i / N) | 0));
    layerMesh.setMatrixAt(n, _m);
    layerMesh.setColorAt(n, gradient(clamp(v, 0, 1), _c));
    n++;
  }
  layerMesh.count = n;
  layerMesh.instanceMatrix.needsUpdate = true;
  if (layerMesh.instanceColor) layerMesh.instanceColor.needsUpdate = true;
}
function renderLegend() {
  const el = document.getElementById('legend');
  if (!layer) { el.hidden = true; return; }
  const L = LAYERS[layer];
  el.hidden = false;
  el.innerHTML = `<b>${ic(L.ico)} ${L.label}</b><div class="legend-bar"></div><div class="legend-ends"><span>${L.legend[0]}</span><span>${L.legend[1]}</span></div>`;
}
// temporary layers (shown while a service tool is selected) do not replace the player's choice
function setLayer(id, temporary = false) {
  if (!temporary) userLayer = id;
  layer = id;
  drawLayer();
  renderLegend();
}
const currentLayer = () => layer;
const restoreLayer = () => setLayer(userLayer, true);
function updateLayer(dt) {
  if (!layer) return;
  layerClock += dt;
  if (layerClock > (layer === 'traffic' ? 0.5 : 2)) { layerClock = 0; drawLayer(); }
}

// ring showing how far a service reaches, drawn at the cursor while placing it
const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xe4553b, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
rangeRing.position.y = 0.07;
rangeRing.visible = false;
scene.add(rangeRing);
function showRange(x, z, r) {
  if (!r) { rangeRing.visible = false; return; }
  rangeRing.visible = true;
  rangeRing.position.set(W(x), 0.07, W(z));
  rangeRing.scale.set(r, 1, r);
}

export { COVERAGE, LAYERS, L_BAD, L_MID, L_GOOD, gradient, layerMesh, layer, userLayer, layerClock, layerValue, drawLayer, renderLegend, setLayer, currentLayer, restoreLayer, updateLayer, rangeRing, showRange };

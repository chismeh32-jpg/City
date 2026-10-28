// Urbania — things that happen to the city: problem icons floating over buildings, and natural disasters
// (meteorite, tornado, earthquake) that ruin buildings, start fires and keep the fire brigade busy.
import * as THREE from 'three';
import { FX } from './buildings.js';
import { $, N, W, hash, news, plotOf } from './config.js';
import { S, save } from './state.js';
import { camera, controls, renderer, scene } from './scene.js';
import { D, nearRoad, refresh } from './sim.js';
import { refreshTile, setTrees } from './world.js';
import { Particles, fireCovered, flameTex, markFires, smokeTex, startFire } from './life.js';
import { sfx } from './audio.js';

/* ---------------------------------------------------------------- problem icons */
// one billboard per building with a problem: no power, no water, rubbish, no road
const ICON_KINDS = 4;
const iconTex = (() => {
  const c = document.createElement('canvas');
  c.width = 64 * ICON_KINDS; c.height = 64;
  const g = c.getContext('2d');
  const disc = (k, ring) => {
    const x = k * 64 + 32;
    g.fillStyle = '#fbf7ee'; g.strokeStyle = ring; g.lineWidth = 6;
    g.beginPath(); g.arc(x, 30, 24, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = ring; g.beginPath(); g.moveTo(x - 7, 52); g.lineTo(x + 7, 52); g.lineTo(x, 62); g.closePath(); g.fill();
    return x;
  };
  let x = disc(0, '#e0a83a'); // power: lightning bolt
  g.fillStyle = '#e0a83a'; g.beginPath();
  for (const [px, py] of [[3, -14], [-8, 3], [-1, 3], [-4, 15], [8, -3], [1, -3]]) g.lineTo(x + px, 30 + py);
  g.closePath(); g.fill();
  x = disc(1, '#3f8fd0'); // water: drop
  g.fillStyle = '#3f8fd0'; g.beginPath(); g.moveTo(x, 15); g.bezierCurveTo(x + 13, 30, x + 10, 42, x, 42); g.bezierCurveTo(x - 10, 42, x - 13, 30, x, 15); g.fill();
  x = disc(2, '#5f8f3f'); // rubbish: bin
  g.fillStyle = '#5f8f3f'; g.fillRect(x - 10, 22, 20, 20); g.fillRect(x - 12, 17, 24, 4); g.fillRect(x - 4, 13, 8, 4);
  x = disc(3, '#6f7780'); // no road: road with a gap
  g.fillStyle = '#6f7780'; g.fillRect(x - 13, 24, 26, 13);
  g.fillStyle = '#fbf7ee'; for (const dx of [-9, -1, 7]) g.fillRect(x + dx, 29, 4, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const ICON_CAP = 900;
const iconGeo = new THREE.BufferGeometry();
iconGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ICON_CAP * 3), 3));
iconGeo.setAttribute('icon', new THREE.BufferAttribute(new Float32Array(ICON_CAP), 1));
iconGeo.setAttribute('phase', new THREE.BufferAttribute(new Float32Array(ICON_CAP), 1));
const iconMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,
  uniforms: { map: { value: iconTex }, uTime: FX.uTime, viewH: { value: 800 } },
  vertexShader: `attribute float icon; attribute float phase; uniform float uTime; uniform float viewH; varying float vIcon;
    void main() {
      vIcon = icon;
      vec3 p = position; p.y += sin(uTime * 2.4 + phase) * 0.06;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(0.45 * projectionMatrix[1][1] * viewH * 0.5 / max(-mv.z, 0.1), 10.0, 44.0);
    }`,
  fragmentShader: `uniform sampler2D map; varying float vIcon;
    void main() {
      vec4 t = texture2D(map, vec2((vIcon + gl_PointCoord.x) / ${ICON_KINDS.toFixed(1)}, 1.0 - gl_PointCoord.y));
      if (t.a < 0.15) discard;
      gl_FragColor = t;
    }`,
});
const icons = new THREE.Points(iconGeo, iconMat);
icons.frustumCulled = false;
icons.renderOrder = 5;
scene.add(icons);
const ROOF = { res: [0.35, 0.75, 1.05, 1.8], com: [0.35, 0.7, 0.9, 1.1], off: [0.35, 1.1, 1.8, 3.0], ind: [0.35, 0.8, 0.9, 1.0] };
let iconClock = 0;
const iconsOn = { value: true };
function updateIcons() {
  if (!D) return;
  const pos = iconGeo.attributes.position.array, kind = iconGeo.attributes.icon.array, ph = iconGeo.attributes.phase.array;
  const powerShort = D.powerOk ? 0 : 1 - D.powerCap / D.powerUse, waterShort = D.waterOk ? 0 : 1 - D.waterCap / D.waterUse;
  let n = 0;
  if (iconsOn.value) for (let i = 0; i < N * N && n < ICON_CAP; i++) {
    const T = S.tiles[i];
    if (T.t !== 'zone' || T.fire > 0 || T.ruin) continue;
    const x = i % N, z = (i / N) | 0;
    let k = -1;
    if (!T.lv) { if (!nearRoad(x, z, 2) && hash(i, 5) < 0.35) k = 3; }
    else if (!(T.build > 0)) {
      if (hash(i, 6) < powerShort) k = 0;
      else if (hash(i, 7) < waterShort) k = 1;
      else if (D.trashPile > 0.12 && hash(i, 8) < D.trashPile * 0.6) k = 2;
    }
    if (k < 0) continue;
    pos[n * 3] = W(x); pos[n * 3 + 1] = (ROOF[T.z][T.lv] || 0.4) + 0.35; pos[n * 3 + 2] = W(z);
    kind[n] = k; ph[n] = hash(i, 9) * 6.28;
    n++;
  }
  iconGeo.setDrawRange(0, n);
  for (const a of ['position', 'icon', 'phase']) iconGeo.attributes[a].needsUpdate = true;
  iconMat.uniforms.viewH.value = renderer.domElement.height;
}

/* ---------------------------------------------------------------- disasters */
const DISASTERS = {
  meteor: { label: 'Meteorito', ico: 'meteor' },
  tornado: { label: 'Tornado', ico: 'tornado' },
  quake: { label: 'Terremoto', ico: 'quake' },
};
const blast = new Particles(260, flameTex, { additive: true });
const dust = new Particles(260, smokeTex, { color: 0x6b6258 });
const debris = new Particles(200, smokeTex, { color: 0x4a443e });
let active = null, shake = 0;
const shakeOff = new THREE.Vector3();

// ruin a building (zone tiles only: public buildings are sturdier) and maybe set it on fire
function damage(i, fireChance = 0) {
  const T = S.tiles[i];
  if (T.t !== 'zone' || !T.lv || T.ruin) return false;
  if (Math.random() < fireChance) { startFire(i, fireCovered(i % N, (i / N) | 0)); return true; }
  T.lv = 0; T.prev = 0; T.build = 0; T.fire = 0; T.ruin = S.day + 3;
  refreshTile(i);
  return true;
}
function builtTiles() {
  const out = [];
  S.tiles.forEach((T, i) => { if (T.t === 'zone' && T.lv > 0 && S.owned[plotOf(i)]) out.push(i); });
  return out;
}
function startDisaster(kind) {
  const targets = builtTiles();
  if (!targets.length || active) return false;
  const i = targets[Math.floor(Math.random() * targets.length)], x = i % N, z = (i / N) | 0;
  S.disasterDay = S.day;
  sfx('siren'); sfx('alert');
  if (kind === 'meteor') {
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshBasicMaterial({ color: 0xffb04a, toneMapped: false }));
    const from = new THREE.Vector3(W(x) - 38, 46, W(z) - 22), to = new THREE.Vector3(W(x), 0.2, W(z));
    head.position.copy(from);
    scene.add(head);
    active = { kind, t: 0, x, z, head, from, to };
    news(`¡Alerta! Un meteorito se dirige hacia ${S.name}. Protección Civil pide calma.`, 'EMERGENCIA');
  } else if (kind === 'tornado') {
    const pts = new Float32Array(900 * 3), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const funnel = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x4f4b46, size: 0.75, map: smokeTex, transparent: true, opacity: 0.8, depthWrite: false }));
    funnel.frustumCulled = false;
    scene.add(funnel);
    const ang = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(W(x) - Math.cos(ang) * 14, 0, W(z) - Math.sin(ang) * 14);
    active = { kind, t: 0, funnel, pos, dir: ang, seeds: Array.from({ length: 900 }, () => [Math.pow(Math.random(), 0.8), Math.random() * 6.28, Math.random()]), hitClock: 0, hits: 0 };
    news(`¡Tornado a las afueras de ${S.name}! Quedaos en casa, lejos de las ventanas.`, 'EMERGENCIA');
  } else {
    active = { kind, t: 0, x, z, rumble: 0 };
    shake = 6;
    let hits = 0;
    for (const j of targets) {
      const d = Math.hypot((j % N) - x, ((j / N) | 0) - z);
      if (d < 14 && Math.random() < 0.13 * (1 - d / 14) && damage(j, 0.15)) hits++;
    }
    news(`¡Terremoto en ${S.name}! ${hits ? `${hits} edificios dañados.` : 'Por suerte, sin daños graves.'} Los bomberos revisan la zona.`, 'EMERGENCIA');
    afterDamage();
  }
  return true;
}
function afterDamage() { markFires(); refresh(); save(); }

function updateDisasters(dt) {
  // camera shake (earthquakes and impacts): undo last frame's offset, then add a new one
  camera.position.sub(shakeOff); controls.target.sub(shakeOff);
  shakeOff.set(0, 0, 0);
  if (shake > 0) {
    shake -= dt;
    const a = Math.min(1, shake) * 0.12;
    shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.5, (Math.random() - 0.5) * a);
    camera.position.add(shakeOff); controls.target.add(shakeOff);
  }
  blast.update(dt, 0.9, (l) => [0.5 + (1 - l) * 1.6, l]);
  dust.update(dt, 0.25, (l) => [0.6 + (1 - l) * 2.2, l * 0.6]);
  debris.update(dt, 0.6, (l) => [0.12, l]);
  for (const P of [debris]) for (let k = 0; k < P.max; k++) if (P.life[k] > 0) P.vel[k * 3 + 1] -= 6 * dt;
  if (!active) return;
  const A = active;
  A.t += dt;
  if (A.kind === 'meteor') {
    const k = Math.min(1, A.t / 2.6), e = k * k;
    A.head.position.lerpVectors(A.from, A.to, e);
    A.head.rotation.x += dt * 4;
    blast.emit(A.head.position.x, A.head.position.y, A.head.position.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6);
    dust.emit(A.head.position.x, A.head.position.y, A.head.position.z, 0, 0.2, 0);
    if (k >= 1) {
      scene.remove(A.head); A.head.geometry.dispose();
      for (let q = 0; q < 120; q++) {
        const a = Math.random() * 6.28, s = 1.5 + Math.random() * 3;
        blast.emit(A.to.x, 0.3, A.to.z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s);
        if (q % 2) dust.emit(A.to.x, 0.3, A.to.z, Math.cos(a) * s * 0.4, 0.6 + Math.random(), Math.sin(a) * s * 0.4);
        if (q % 3 === 0) debris.emit(A.to.x, 0.3, A.to.z, Math.cos(a) * s, 3 + Math.random() * 3, Math.sin(a) * s);
      }
      shake = 1.6;
      sfx('boom'); sfx('boom');
      let hits = 0;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const xx = A.x + dx, zz = A.z + dz, d = Math.hypot(dx, dz);
        if (xx < 0 || zz < 0 || xx >= N || zz >= N) continue;
        const j = zz * N + xx;
        if (d <= 2.2 && damage(j)) hits++;
        else if (d <= 4 && Math.random() < 0.4 && damage(j, 1)) hits++;
        if (d <= 2.2 && S.tiles[j].tree) { S.tiles[j].tree = false; setTrees(j, false); }
      }
      news(`El meteorito impacta en ${S.name}: ${hits} edificios afectados. ¡Todos los equipos de emergencia a la zona!`, 'EMERGENCIA');
      afterDamage();
      active = null;
    }
  } else if (A.kind === 'tornado') {
    // the funnel wanders across the city, wrecking what it touches
    A.dir += (Math.random() - 0.5) * dt * 1.2;
    A.pos.x += Math.cos(A.dir) * dt * 1.5; A.pos.z += Math.sin(A.dir) * dt * 1.5;
    const p = A.funnel.geometry.attributes.position.array;
    A.seeds.forEach(([h, a0, r0], k) => {
      const y = h * 9, rad = 0.2 + h * h * 3 + r0 * 0.35, a = a0 + A.t * (8 - h * 4.5);
      p[k * 3] = A.pos.x + Math.cos(a) * rad; p[k * 3 + 1] = y; p[k * 3 + 2] = A.pos.z + Math.sin(a) * rad;
    });
    A.funnel.geometry.attributes.position.needsUpdate = true;
    if (Math.random() < dt * 20) debris.emit(A.pos.x, 0.2, A.pos.z, (Math.random() - 0.5) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4);
    A.hitClock += dt;
    if (A.hitClock > 0.2) {
      A.hitClock = 0;
      const cx = Math.round(A.pos.x + N / 2 - 0.5), cz = Math.round(A.pos.z + N / 2 - 0.5);
      let changed = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx, zz = cz + dz;
        if (xx < 0 || zz < 0 || xx >= N || zz >= N || Math.hypot(dx, dz) > 1.2) continue;
        const j = zz * N + xx;
        if (damage(j)) { A.hits++; changed = true; }
        if (S.tiles[j].tree && !S.tiles[j].t) { S.tiles[j].tree = false; setTrees(j, false); }
      }
      if (changed) refresh();
    }
    if (Math.random() < dt * 0.6) sfx('alert');
    if (A.t > 22) {
      scene.remove(A.funnel); A.funnel.geometry.dispose();
      news(`El tornado se aleja de ${S.name}. Balance: ${A.hits} edificios destruidos.`, 'EMERGENCIA');
      afterDamage();
      active = null;
    }
  } else if (A.kind === 'quake') {
    A.rumble -= dt;
    if (A.rumble <= 0 && A.t < 5) { A.rumble = 0.45; sfx('boom'); }
    if (Math.random() < dt * 30) {
      const a = Math.random() * 6.28, r = Math.random() * 12;
      dust.emit(W(A.x) + Math.cos(a) * r, 0.1, W(A.z) + Math.sin(a) * r, 0, 0.4, 0);
    }
    if (A.t > 6) active = null;
  }
}
// once a day, with the toggle on and a city big enough to notice, a small chance of a disaster
function rollDisaster() {
  if (!S.disasters || !D || D.pop < 400 || active) return;
  if (Math.random() < 0.05) startDisaster(['meteor', 'tornado', 'quake'][Math.floor(Math.random() * 3)]);
}
const disasterActive = () => !!active;
const currentDisaster = () => active;

$('disasterToggle').checked = S.disasters !== false;
$('disasterToggle').onchange = (e) => { S.disasters = e.target.checked; save(); news(S.disasters ? 'Desastres naturales activados.' : 'Desastres naturales desactivados.', 'AJUSTES'); };
for (const kind of Object.keys(DISASTERS)) {
  $(`dis-${kind}`).onclick = () => {
    if (!startDisaster(kind)) news(active ? 'Ya hay una emergencia en curso.' : 'No hay edificios a los que pueda afectar.', 'AJUSTES');
    $('menu').classList.remove('open');
  };
}
function updateEvents(dt) {
  updateDisasters(dt);
  iconClock += dt;
  if (iconClock > 1) { iconClock = 0; updateIcons(); }
}
export { ICON_KINDS, iconTex, icons, iconsOn, updateIcons, DISASTERS, startDisaster, rollDisaster, disasterActive, currentDisaster, updateEvents };

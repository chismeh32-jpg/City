// Urbania — entry point: day/night lighting, the main loop and boot.
import * as THREE from 'three';
import { glowMat } from './buildings.js';
import { LAWS, MIN_PER_SEC, clamp, news } from './config.js';
import { S, save } from './state.js';
import { SKY_DAY, SKY_DUSK, SKY_NIGHT, SKY_RAIN, TOP_DAY, TOP_DUSK, TOP_NIGHT, TOP_RAIN, applyGfx, bloom, camera, controls, gfx, hemi, renderFrame, renderer, scene, sky, sun, updateClouds, watchPerformance, waterMat } from './scene.js';
import { animating, buildChunk, chunkOf, dirtyChunks, disposeGroup, flushInstances, rebuildAll, rotors } from './world.js';
import { D, dayTick, election, hourTick, refresh } from './sim.js';
import { apply, openModal, pathTiles, placeTicker, renderAdvisor, selectTool, setSpeed, tool, updateHud } from './ui.js';
import { agents, fireCovered, startFire, updateBirds, updateBoats, updateFires, updatePeople, updateRain, updateSmoke, updateTraffic } from './life.js';

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
  flushInstances();
  updateClouds(dt);
  controls.update();
  renderFrame();
  watchPerformance(dt);
  hudTimer += dt; saveTimer += dt;
  if (hudTimer > 0.25) { hudTimer = 0; updateHud(); }
  if (saveTimer > 15) { saveTimer = 0; save(); }
  requestAnimationFrame(frame);
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
refresh();
setSpeed(S.speed ?? 1);
selectTool('look');
renderAdvisor();
updateHud();
placeTicker();
news(D.pop ? `Bienvenido de nuevo a ${S.name}.` : 'Bienvenida, alcaldía. Empieza trazando una calle junto al río.');
if (!S.party) openModal('partyModal');
window.__urbania = { renderer, scene, election, LAWS, agents, startFire, fireCovered, get state() { return S; }, get stats() { return D; }, apply: (id, a, b) => { selectTool(id); apply(pathTiles(a, b, tool.mode)); }, hourTick, setSpeed };
frame();

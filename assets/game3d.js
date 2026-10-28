// Urbania — entry point: day/night lighting, the main loop and boot.
import * as THREE from 'three';
import { FX, glowMat } from './buildings.js';
import { LAWS, MIN_PER_SEC, clamp, news } from './config.js';
import { S, save } from './state.js';
import { SKY_DAY, SKY_DUSK, SKY_NIGHT, SKY_RAIN, TOP_DAY, TOP_DUSK, TOP_NIGHT, TOP_RAIN, applyGfx, bloom, camera, controls, gfx, hemi, renderFrame, renderer, scene, sky, sun, updateClouds, watchPerformance, waterMat, skyUniforms, refreshEnvironment } from './scene.js';
import { flushInstances, poolMat, rebuildAll, rebuildDirtyChunks, rotors, updateGrowth } from './world.js';
import { D, checkRank, dayTick, election, hourTick, refresh } from './sim.js';
import { updateAudio } from './audio.js';
import { updateLayer } from './layers.js';
import { apply, openModal, pathTiles, placeTicker, renderAdvisor, selectTool, setSpeed, tool, updateHud } from './ui.js';
import { beamMat, fireworks, updateFireworks, agents, fireCovered, startFire, updateBirds, updateBoats, updateFires, updatePeople, updateRain, updateSmoke, updateTraffic } from './life.js';

/* ---------------------------------------------------------------- day / night lighting */
const tmpSky = new THREE.Color(), tmpTop = new THREE.Color(), HEMI_DAY = new THREE.Color(0xe6f1ff);
let wet = 0;
function updateLighting(dt) {
  const h = S.minutes / 60, ang = ((h - 6) / 12) * Math.PI, elev = Math.sin(ang);
  const day = clamp(elev * 1.6 + 0.15, 0, 1), dusk = clamp(1 - Math.abs(elev) * 3, 0, 1) * (elev > -0.2 ? 1 : 0);
  const wetSky = S.weather === 'rain' ? 1 : 0;
  sun.position.set(Math.cos(ang) * 40, Math.max(8, elev * 50), 22);
  sun.intensity = (0.5 + 1.95 * day) * (wetSky ? 0.55 : 1);
  sun.color.setHex(0x9fb4ff).lerp(new THREE.Color(0xfff0d4), day).lerp(new THREE.Color(0xffb27a), dusk * 0.7);
  hemi.intensity = (0.5 + 0.7 * day) * (gfx === 'ultra' ? 0.55 : 1);
  hemi.color.setHex(0x8fa6d8).lerp(HEMI_DAY, day);
  tmpSky.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.6);
  tmpTop.copy(TOP_NIGHT).lerp(TOP_DAY, day).lerp(TOP_DUSK, dusk * 0.5);
  if (wetSky) { tmpSky.lerp(SKY_RAIN, 0.6 * day); tmpTop.lerp(TOP_RAIN, 0.7 * day); }
  skyUniforms.horizon.value.copy(tmpSky);
  skyUniforms.top.value.copy(tmpTop);
  skyUniforms.ground.value.setHex(0x5d7448).multiplyScalar(0.25 + 0.75 * day);
  skyUniforms.sunDir.value.copy(sun.position).normalize();
  skyUniforms.sunCol.value.copy(sun.color);
  skyUniforms.uStars.value = wetSky ? 0.15 : 1;
  scene.fog.color.copy(tmpSky);
  const night = clamp(1 - day * 1.4, 0, 1);
  glowMat.emissiveIntensity = night * 0.95;
  // shared effect uniforms: night lights, windows lit by the hour, wet streets after rain, wind
  FX.uTime.value = performance.now() / 1000;
  FX.uNight.value = night;
  const hr = S.minutes / 60;
  FX.uLitShare.value = hr >= 17 || hr < 1 ? 1.15 : hr < 5 ? 0.3 + (5 - hr) * 0.05 : hr < 8 ? 0.75 : 0.9;
  wet = clamp(wet + (wetSky ? dt / 12 : -dt / 40), 0, 1);
  FX.uWet.value = gfx === 'ultra' || gfx === 'alta' ? wet : 0;
  FX.uWind.value = wetSky ? 2.2 : 1;
  poolMat.opacity = night * 0.85;
  beamMat.opacity = night * 0.7;
  bloom.strength = 0.12 + night * 0.75;
  bloom.threshold = 0.95 - night * 0.12;
  const w = waterMat.uniforms;
  w.uTime.value = performance.now() / 1000;
  w.uLight.value = 0.15 + 0.85 * day;
  w.uSky.value.copy(tmpSky);
  w.uSun.value.copy(sun.position).normalize();
  scene.fog.near = 75; scene.fog.far = 170;
  return day;
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
  updateGrowth(dt);
  rebuildDirtyChunks();
  updateTraffic(dt);
  updatePeople(dt);
  updateBoats(dt);
  updateBirds(dt);
  for (const h of rotors.values()) h.userData.rotor.rotation.z += dt * (S.speed ? 1.6 + S.speed * 0.4 : 0.4);
  updateSmoke(dt);
  updateFires(dt);
  updateFireworks(dt);
  updateRain(dt);
  const day = updateLighting(dt);
  refreshEnvironment();
  flushInstances();
  updateClouds(dt);
  controls.update();
  renderFrame();
  watchPerformance(dt);
  hudTimer += dt; saveTimer += dt;
  updateLayer(dt);
  if (hudTimer > 0.25) {
    hudTimer = 0;
    updateHud();
    const dist = camera.position.distanceTo(controls.target);
    updateAudio({ day, rain: S.weather === 'rain', traffic: agents.length, closeness: clamp(1 - (dist - 7) / 60, 0, 1), green: D?.cov?.park || 0 });
  }
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
rebuildDirtyChunks(Infinity); // the whole map appears at once on load
refresh();
checkRank(D, true);
setSpeed(S.speed ?? 1);
selectTool('look');
renderAdvisor();
updateHud();
placeTicker();
news(D.pop ? `Bienvenido de nuevo a ${S.name}.` : 'Bienvenida, alcaldía. Empieza trazando una calle junto al río.');
if (!S.party) openModal('partyModal');
window.__urbania = { renderer, scene, camera, controls, election, LAWS, agents, startFire, fireCovered, get state() { return S; }, get stats() { return D; }, apply: (id, a, b) => { selectTool(id); apply(pathTiles(a, b, tool.mode)); }, hourTick, dayTick, setSpeed, fireworks, updateFireworks, setWet: (v) => { wet = v; } };
frame();

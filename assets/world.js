// Urbania — the 3D map: roads, trees, zone overlays and tile buildings batched into chunks.
import * as THREE from 'three';
import { Builder, FX, GEO, ferrisWheel, prep, rng, pick, resBuilding, comBuilding, offBuilding, indBuilding, serviceBuilding, windRotor, constructionSite, ruinSite } from './buildings.js';
import { DIRS, HALF, I, N, PLOT, PLOTS, RIVER_W, W, WATER, ZONES, _c, _e, _m, _q, _s, _v, forestNoise, hash, inside, riverZ } from './config.js';
import { S } from './state.js';
import { renderer, scene, terrainHeight } from './scene.js';

/* ---------------------------------------------------------------- roads */
const isRoad = (x, z) => inside(x, z) && S.tiles[I(x, z)].t === 'road';

// bus stops: straight road tiles picked deterministically, only once there is a bus station.
// Returns the pavement side (index into DIRS) where the shelter stands, or -1.
let busNetwork = false;
function setBusNetwork(v) { busNetwork = v; }
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
  const ty = y + 0.026, avenueStraight = !!S.tiles[I(x, z)].av && deg === 2 && conn[0] === conn[2];
  if (deg >= 3) {
    DIRS.forEach(([dx, dz], k) => {
      if (!conn[k]) return;
      for (let s = -0.3; s <= 0.31; s += 0.12) {
        if (dz) b.box(s, ty, dz * 0.36, 0.06, 0.004, 0.14, 0xf2efe6);
        else b.box(dx * 0.36, ty, s, 0.14, 0.004, 0.06, 0xf2efe6);
      }
    });
  } else if (avenueStraight) {
    // avenue: planted median and dashed lane lines on both carriageways
    const az = conn[0];
    b.box(0, ty - 0.005, 0, az ? 0.1 : 1, 0.035, az ? 1 : 0.1, 0xd5cfc2).box(0, ty + 0.03, 0, az ? 0.08 : 1, 0.01, az ? 1 : 0.08, 0x8cbf62);
    for (const side of [-1, 1]) for (const t of [-0.32, 0, 0.32]) {
      if (az) b.box(side * 0.25, ty, t, 0.02, 0.004, 0.13, 0xf2efe6);
      else b.box(t, ty, side * 0.25, 0.13, 0.004, 0.02, 0xf2efe6);
    }
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
      b.lights.push([px * 0.45, 0, pz * 0.45]); // pool of light on the street under the lamp
    }
  }
  // trees on the avenue median
  if (avenueStraight && !bridge) {
    const props = new Builder(), r = rng(I(x, z) * 23 + 1);
    props.tree(0, 0, 0.55 + r() * 0.15, pick(r, [0x6c9c4c, 0x5d8f45, 0x7fa955]));
    b.props = props;
  }
  // street furniture that casts shadows: parked cars and pavement trees on straight streets
  else if (!bridge && deg === 2 && conn[0] === conn[2] && stop < 0) {
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
for (let k = 0; k < 7000; k++) {
  const r = rng(k + 999), x = (r() - 0.5) * (N + 110), z = (r() - 0.5) * (N + 110);
  if (Math.abs(x) < HALF + 0.5 && Math.abs(z) < HALF + 0.5) continue;
  if (Math.abs(z + HALF - riverZ(x + HALF)) < RIVER_W + 0.6) continue;
  if (forestNoise(x, z) + r() * 0.8 > 0.6) DECOR.push([x, z, r]);
}
const TREE_CAP = N * N * TREE_SLOTS + DECOR.length;
const trunkMesh = new THREE.InstancedMesh(prep(new THREE.CylinderGeometry(0.04, 0.06, 0.32, 5).translate(0, 0.16, 0)), new THREE.MeshStandardMaterial({ color: 0x7a5638, flatShading: true }), TREE_CAP);
const crownMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
// crowns sway in the wind (more when it rains); the top moves, the base stays put
crownMat.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, { uTime: FX.uTime, uWind: FX.uWind });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 fxBase = instanceMatrix[3].xyz;
      float fxSway = sin(uTime * 1.7 + fxBase.x * 0.8 + fxBase.z * 0.6) + 0.4 * sin(uTime * 3.9 + fxBase.z * 1.3);
      transformed.xz += vec2(fxSway, fxSway * 0.6) * uWind * max(transformed.y - 0.25, 0.0) * 0.09;`);
};
const roundMesh = new THREE.InstancedMesh(prep(new THREE.IcosahedronGeometry(0.27, 0).translate(0, 0.52, 0)), crownMat, TREE_CAP);
const coneMesh = new THREE.InstancedMesh(prep(new THREE.ConeGeometry(0.21, 0.72, 6).translate(0, 0.6, 0)), crownMat, TREE_CAP);
for (const m of [trunkMesh, roundMesh, coneMesh]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
// every possible tree has a slot; only the slots in use are packed into the instanced meshes,
// so empty slots cost nothing to draw
const slotOn = new Uint8Array(TREE_CAP), slotCone = new Uint8Array(TREE_CAP);
const slotMatrix = new Float32Array(TREE_CAP * 16), slotColor = new Float32Array(TREE_CAP * 3);
const GREENS = [0x6c9c4c, 0x5d8f45, 0x7fa955, 0x4f7f3f, 0x8bb35e], AUTUMN = [0xd9733f, 0xc94f3a, 0xe0a83a], BLOSSOM = 0xe39ab8;

function treeSlot(slot, x, z, r, on, y = 0) {
  slotOn[slot] = on ? 1 : 0;
  if (!on) return;
  const s = 0.75 + r() * 0.6, cone = r() < 0.4, roll = r();
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, r() * 6.28, 0)), _s.set(s, s * (0.9 + r() * 0.3), s));
  slotMatrix.set(_m.elements, slot * 16);
  slotCone[slot] = cone ? 1 : 0;
  _c.set(roll < 0.06 ? pick(r, AUTUMN) : roll < 0.075 ? BLOSSOM : pick(r, GREENS));
  slotColor.set([_c.r, _c.g, _c.b], slot * 3);
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
// upload changed instance data for trees and zone overlays once per frame
function flushInstances() {
  if (treesDirty) {
    let t = 0, rc = 0, cc = 0;
    for (let slot = 0; slot < TREE_CAP; slot++) {
      if (!slotOn[slot]) continue;
      const mat = slotMatrix.subarray(slot * 16, slot * 16 + 16), col = slotColor.subarray(slot * 3, slot * 3 + 3);
      trunkMesh.instanceMatrix.array.set(mat, t++ * 16);
      const crown = slotCone[slot] ? coneMesh : roundMesh, k = slotCone[slot] ? cc++ : rc++;
      crown.instanceMatrix.array.set(mat, k * 16);
      crown.setColorAt(k, _c.setRGB(col[0], col[1], col[2]));
    }
    trunkMesh.count = t; roundMesh.count = rc; coneMesh.count = cc;
    for (const m of [trunkMesh, roundMesh, coneMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    treesDirty = false;
  }
  if (lampPools.dirty) flushPools();
  if (overlayDirty) { overlay.instanceMatrix.needsUpdate = true; if (overlay.instanceColor) overlay.instanceColor.needsUpdate = true; overlayDirty = false; }
}

const cursor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.08, 0.98).translate(0, 0.04, 0),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }), N * N);
cursor.count = 0;
scene.add(cursor);

const smokeEmitters = { list: [], dirty: true }; // chimney tops, rebuilt when chunks change

/* pools of warm light under street lamps at night (additive quads on the pavement) */
function glowTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const POOL_CAP = 900;
const poolMat = new THREE.MeshBasicMaterial({
  map: glowTexture((g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,214,150,1)'); grd.addColorStop(0.35, 'rgba(255,190,120,.55)'); grd.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }),
  transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
});
const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.35, 1.35).rotateX(-Math.PI / 2), poolMat, POOL_CAP);
pools.position.y = 0.032; // just above the asphalt and its markings
pools.count = 0;
pools.frustumCulled = false;
pools.renderOrder = 2;
scene.add(pools);
const lampPools = { dirty: true };
function flushPools() {
  let n = 0;
  for (const ch of chunks) for (const p of ch.lights || []) {
    if (n >= POOL_CAP) break;
    pools.setMatrixAt(n++, _m.makeTranslation(p.x, 0, p.z));
  }
  pools.count = n;
  pools.instanceMatrix.needsUpdate = true;
  lampPools.dirty = false;
}

/* ---------------------------------------------------------------- tile objects, batched into chunks */
// Static tiles are merged per CH×CH chunk to keep draw calls low. Buildings that finish in the same
// frame and chunk share one "grow" animation group, so even a burst of completions costs at most
// one extra draw call per chunk; when the animation ends they are merged back into their chunk.
const CH = 8, NC = Math.ceil(N / CH);
const chunks = Array.from({ length: NC * NC }, () => ({ group: null, smoke: [] }));
const dirtyChunks = new Set();
const animating = new Map(); // tile index -> grow batch it belongs to
const growBatches = new Set(); // { group, tiles, grow }
const pendingGrow = new Set(); // tiles that start growing on the next frame
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
    if (animating.has(i) || pendingGrow.has(i)) continue;
    const b = tileBuilder(i);
    if (!b) continue;
    (S.tiles[i].t === 'road' ? road : bld).merge(b, tileMatrix(i));
    if (b.props) bld.merge(b.props, tileMatrix(i));
  }
  if (ch.group) disposeGroup(ch.group);
  if (ch.lite) { disposeGroup(ch.lite); ch.lite = null; }
  ch.group = new THREE.Group();
  ch.group.add(bld.build(true), road.build(false));
  ch.src = [bld, road]; // kept to build the far-away version when the camera moves off
  ch.smoke = bld.smoke;
  ch.lights = [...bld.lights, ...road.lights];
  lampPools.dirty = true;
  scene.add(ch.group);
  smokeEmitters.dirty = true;
  renderer.shadowMap.needsUpdate = true;
}

// level of detail: chunks far from the camera swap to their lite version (built on demand, one per frame)
const LOD_DIST = 62;
let lodClock = 0;
const _lodV = new THREE.Vector3();
function updateLod(camera) {
  if (++lodClock % 8) return;
  let built = 0;
  chunks.forEach((ch, c) => {
    if (!ch.group) return;
    _lodV.set(W((c % NC) * CH + CH / 2), 0, W(((c / NC) | 0) * CH + CH / 2));
    const far = camera.position.distanceTo(_lodV) > LOD_DIST;
    if (far && !ch.lite && ch.src && built < 2) {
      ch.lite = new THREE.Group();
      ch.lite.add(ch.src[0].build(true, true), ch.src[1].build(false, true));
      scene.add(ch.lite);
      built++;
    }
    const useLite = far && !!ch.lite;
    if (ch.group.visible === useLite) { ch.group.visible = !useLite; renderer.shadowMap.needsUpdate = true; }
    if (ch.lite) ch.lite.visible = useLite;
  });
}

const rotors = new Map(); // tile index -> spinning wind turbine rotor
function refreshTile(i, animate = false) {
  const T = S.tiles[i];
  if (rotors.has(i)) { scene.remove(rotors.get(i)); rotors.delete(i); }
  if (T.t === 'svc' && (T.s === 'wind' || T.s === 'ferris')) {
    const ferris = T.s === 'ferris', holder = new THREE.Group(), rotor = ferris ? ferrisWheel() : windRotor();
    holder.position.set(W(i % N), 0, W((i / N) | 0));
    holder.rotation.y = facing(i % N, (i / N) | 0);
    rotor.position.set(0, ferris ? 0.9 : 1.62, ferris ? 0 : 0.08);
    holder.userData.speed = ferris ? 0.18 : 1;
    holder.add(rotor);
    holder.userData.rotor = rotor;
    scene.add(holder);
    rotors.set(i, holder);
  }
  if (animating.has(i)) finishBatch(animating.get(i));
  pendingGrow.delete(i);
  if (animate && T.t !== 'road' && (T.t === 'svc' || T.lv > 0)) pendingGrow.add(i);
  dirtyChunks.add(chunkOf(i));
  setTrees(i, T.tree && !T.t);
  setOverlay(i, T.t === 'zone' && T.lv === 0 && !T.ruin ? ZONES[T.z].color : null);
}
function refreshAround(i) {
  const x = i % N, z = (i / N) | 0;
  refreshTile(i);
  for (const [dx, dz] of DIRS) if (inside(x + dx, z + dz) && S.tiles[I(x + dx, z + dz)].t) refreshTile(I(x + dx, z + dz));
}
// end a grow animation now: its tiles go back into their chunks
function finishBatch(batch) {
  disposeGroup(batch.group);
  growBatches.delete(batch);
  for (const i of batch.tiles) { animating.delete(i); dirtyChunks.add(chunkOf(i)); }
}
// start one grow animation per chunk for the tiles that finished this frame
function startGrowBatches() {
  if (!pendingGrow.size) return;
  const byChunk = new Map();
  for (const i of pendingGrow) {
    if (!byChunk.has(chunkOf(i))) byChunk.set(chunkOf(i), []);
    byChunk.get(chunkOf(i)).push(i);
  }
  pendingGrow.clear();
  for (const tiles of byChunk.values()) {
    const b = new Builder();
    for (const i of tiles) { const t = tileBuilder(i); if (t) b.merge(t, tileMatrix(i)); }
    const group = b.build(true);
    group.scale.set(1, 0.01, 1);
    scene.add(group);
    const batch = { group, tiles, grow: 0 };
    growBatches.add(batch);
    for (const i of tiles) animating.set(i, batch);
  }
}
function updateGrowth(dt) {
  startGrowBatches();
  for (const batch of growBatches) {
    batch.grow = Math.min(1, batch.grow + dt * 2.2);
    const t = batch.grow, ease = 1 - Math.pow(1 - t, 3);
    batch.group.scale.set(1, Math.max(0.01, ease * (1 + Math.sin(t * Math.PI) * 0.12)), 1);
    if (t >= 1) finishBatch(batch);
  }
}
// rebuild dirty chunks within a small time budget per frame (always at least one)
function rebuildDirtyChunks(budgetMs = 6) {
  const t0 = performance.now();
  for (const c of dirtyChunks) {
    dirtyChunks.delete(c);
    buildChunk(c);
    if (performance.now() - t0 > budgetMs) break;
  }
}
/* land the city does not own yet: slightly shaded, with a dashed border around what it owns */
const plotShade = new THREE.InstancedMesh(new THREE.PlaneGeometry(PLOT, PLOT).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x1d2a1a, transparent: true, opacity: 0.22, depthWrite: false }), PLOTS * PLOTS);
plotShade.position.y = 0.05;
plotShade.renderOrder = 1;
scene.add(plotShade);
let plotEdge = null;
function drawPlots() {
  let n = 0;
  const seg = [], owned = (px, pz) => px >= 0 && pz >= 0 && px < PLOTS && pz < PLOTS && S.owned[pz * PLOTS + px];
  for (let pz = 0; pz < PLOTS; pz++) for (let px = 0; px < PLOTS; px++) {
    const x0 = px * PLOT - HALF, z0 = pz * PLOT - HALF;
    if (!owned(px, pz)) { plotShade.setMatrixAt(n++, _m.makeTranslation(x0 + PLOT / 2, 0, z0 + PLOT / 2)); continue; }
    if (!owned(px, pz - 1)) seg.push(x0, 0.07, z0, x0 + PLOT, 0.07, z0);
    if (!owned(px, pz + 1)) seg.push(x0, 0.07, z0 + PLOT, x0 + PLOT, 0.07, z0 + PLOT);
    if (!owned(px - 1, pz)) seg.push(x0, 0.07, z0, x0, 0.07, z0 + PLOT);
    if (!owned(px + 1, pz)) seg.push(x0 + PLOT, 0.07, z0, x0 + PLOT, 0.07, z0 + PLOT);
  }
  plotShade.count = n;
  plotShade.instanceMatrix.needsUpdate = true;
  if (plotEdge) { scene.remove(plotEdge); plotEdge.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  plotEdge = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: 0xfbf7ee, dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.85 }));
  plotEdge.computeLineDistances();
  scene.add(plotEdge);
}

function rebuildAll() {
  drawPlots();
  for (const batch of [...growBatches]) finishBatch(batch);
  pendingGrow.clear();
  for (let i = 0; i < N * N; i++) refreshTile(i);
}

export { LOD_DIST, updateLod, plotShade, drawPlots, poolMat, pools, lampPools, flushPools, glowTexture, isRoad, busNetwork, setBusNetwork, busStopSide, isBusStop, roadBuilder, PARKED, TREE_SLOTS, DECOR, TREE_CAP, trunkMesh, crownMat, roundMesh, coneMesh, ZERO, slotOn, slotCone, slotMatrix, slotColor, GREENS, AUTUMN, BLOSSOM, treeSlot, setTrees, treesDirty, overlay, setOverlay, overlayDirty, flushInstances, cursor, smokeEmitters, CH, NC, chunks, dirtyChunks, animating, growBatches, pendingGrow, chunkOf, facing, tileBuilder, tileMatrix, disposeGroup, buildChunk, rotors, refreshTile, refreshAround, finishBatch, startGrowBatches, updateGrowth, rebuildDirtyChunks, rebuildAll };

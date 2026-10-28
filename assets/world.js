// Urbania — the 3D map: roads, trees, zone overlays and tile buildings batched into chunks.
import * as THREE from 'three';
import { Builder, GEO, prep, rng, pick, resBuilding, comBuilding, offBuilding, indBuilding, serviceBuilding, windRotor, constructionSite, ruinSite } from './buildings.js';
import { DIRS, HALF, I, N, RIVER_W, W, WATER, ZONES, _c, _e, _m, _q, _s, _v, forestNoise, hash, inside, riverZ } from './config.js';
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
  const ty = y + 0.026;
  if (deg >= 3) {
    DIRS.forEach(([dx, dz], k) => {
      if (!conn[k]) return;
      for (let s = -0.3; s <= 0.31; s += 0.12) {
        if (dz) b.box(s, ty, dz * 0.36, 0.06, 0.004, 0.14, 0xf2efe6);
        else b.box(dx * 0.36, ty, s, 0.14, 0.004, 0.06, 0xf2efe6);
      }
    });
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
    }
  }
  // street furniture that casts shadows: parked cars and pavement trees on straight streets
  if (!bridge && deg === 2 && conn[0] === conn[2] && stop < 0) {
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
for (let k = 0; k < 4200; k++) {
  const r = rng(k + 999), x = (r() - 0.5) * 150, z = (r() - 0.5) * 150;
  if (Math.abs(x) < HALF + 0.5 && Math.abs(z) < HALF + 0.5) continue;
  if (Math.abs(z + HALF - riverZ(x + HALF)) < RIVER_W + 0.6) continue;
  if (forestNoise(x, z) + r() * 0.8 > 0.6) DECOR.push([x, z, r]);
}
const TREE_CAP = N * N * TREE_SLOTS + DECOR.length;
const trunkMesh = new THREE.InstancedMesh(prep(new THREE.CylinderGeometry(0.04, 0.06, 0.32, 5).translate(0, 0.16, 0)), new THREE.MeshStandardMaterial({ color: 0x7a5638, flatShading: true }), TREE_CAP);
const crownMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
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
  if (overlayDirty) { overlay.instanceMatrix.needsUpdate = true; if (overlay.instanceColor) overlay.instanceColor.needsUpdate = true; overlayDirty = false; }
}

const cursor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.08, 0.98).translate(0, 0.04, 0),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }), N * N);
cursor.count = 0;
scene.add(cursor);

const smokeEmitters = { list: [], dirty: true }; // chimney tops, rebuilt when chunks change

/* ---------------------------------------------------------------- tile objects, batched into chunks */
// Static tiles are merged per CH×CH chunk to keep draw calls low. A building that is
// still playing its "grow" animation lives in its own group until the animation ends.
const CH = 8, NC = Math.ceil(N / CH);
const chunks = Array.from({ length: NC * NC }, () => ({ group: null, smoke: [] }));
const dirtyChunks = new Set();
const animating = new Map(); // tile index -> group
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
    if (animating.has(i)) continue;
    const b = tileBuilder(i);
    if (!b) continue;
    (S.tiles[i].t === 'road' ? road : bld).merge(b, tileMatrix(i));
    if (b.props) bld.merge(b.props, tileMatrix(i));
  }
  if (ch.group) disposeGroup(ch.group);
  ch.group = new THREE.Group();
  ch.group.add(bld.build(true), road.build(false));
  ch.smoke = bld.smoke;
  scene.add(ch.group);
  smokeEmitters.dirty = true;
  renderer.shadowMap.needsUpdate = true;
}

const rotors = new Map(); // tile index -> spinning wind turbine rotor
function refreshTile(i, animate = false) {
  const T = S.tiles[i];
  if (rotors.has(i)) { scene.remove(rotors.get(i)); rotors.delete(i); }
  if (T.t === 'svc' && T.s === 'wind') {
    const holder = new THREE.Group(), rotor = windRotor();
    holder.position.set(W(i % N), 0, W((i / N) | 0));
    holder.rotation.y = facing(i % N, (i / N) | 0);
    rotor.position.set(0, 1.62, 0.08);
    holder.add(rotor);
    holder.userData.rotor = rotor;
    scene.add(holder);
    rotors.set(i, holder);
  }
  if (animating.has(i)) { disposeGroup(animating.get(i)); animating.delete(i); }
  if (animate && T.t !== 'road') {
    const b = tileBuilder(i);
    if (b) {
      const g = new Builder().merge(b, tileMatrix(i)).build(true);
      g.scale.set(1, 0.01, 1);
      g.userData.grow = 0;
      scene.add(g);
      animating.set(i, g);
    }
  }
  dirtyChunks.add(chunkOf(i));
  setTrees(i, T.tree && !T.t);
  setOverlay(i, T.t === 'zone' && T.lv === 0 && !T.ruin ? ZONES[T.z].color : null);
}
function refreshAround(i) {
  const x = i % N, z = (i / N) | 0;
  refreshTile(i);
  for (const [dx, dz] of DIRS) if (inside(x + dx, z + dz) && S.tiles[I(x + dx, z + dz)].t) refreshTile(I(x + dx, z + dz));
}
function rebuildAll() {
  for (const g of animating.values()) disposeGroup(g);
  animating.clear();
  for (let i = 0; i < N * N; i++) refreshTile(i);
}

export { slotOn, slotCone, slotMatrix, slotColor, isRoad, busNetwork, setBusNetwork, busStopSide, isBusStop, roadBuilder, PARKED, TREE_SLOTS, DECOR, TREE_CAP, trunkMesh, crownMat, roundMesh, coneMesh, ZERO, GREENS, AUTUMN, BLOSSOM, treeSlot, setTrees, treesDirty, overlay, setOverlay, overlayDirty, flushInstances, cursor, smokeEmitters, CH, NC, chunks, dirtyChunks, animating, chunkOf, facing, tileBuilder, tileMatrix, disposeGroup, buildChunk, rotors, refreshTile, refreshAround, rebuildAll };

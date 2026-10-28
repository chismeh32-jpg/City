// Low-poly building models for Urbania, merged into as few meshes as possible.
import * as THREE from 'three';

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

/* ---------------------------------------------------------------- city styles */
// Each style swaps the palettes and roof shapes used by every building.
export const STYLES = {
  clasico: { label: 'Clásico', roof: 'gable', walls: [0xf4ead8, 0xead5b4, 0xdcd0c0, 0xcfdcc6, 0xf1cfae, 0xe9e1d0, 0xb65a42, 0xd8b48c, 0xc9d4de], roofs: [0xb5483b, 0x5d6878, 0x7b4b3a, 0x46614f, 0x343f50, 0x9a5a3c, 0xc0623f], glass: [0x86a9c4, 0x6c8aa3, 0x9fb7c9, 0x7d97a8] },
  moderno: { label: 'Moderno', roof: 'flat', walls: [0xf2f2ee, 0xd7dde3, 0xbfc4c8, 0x9aa0a6, 0xe8e4dc, 0x3b3f46], roofs: [0x5d6878, 0x3b3f46, 0x8d949b], glass: [0x8fb7cf, 0x6c8aa3, 0xa9c6d6] },
  mediterraneo: { label: 'Mediterráneo', roof: 'hip', walls: [0xfaf6ee, 0xf4efe4, 0xf6e7cf, 0xf1dcc0, 0xffffff], roofs: [0xc8643f, 0xb85a3a, 0xd9733f], glass: [0x7fb0d4, 0x5c9fd4] },
  nordico: { label: 'Nórdico', roof: 'gable', walls: [0xc94f3a, 0xe0a83a, 0xa5c4d4, 0xe9d8c4, 0x4f7f6a, 0xf4efe4], roofs: [0x2f3b4c, 0x3b2b2b, 0x46614f], glass: [0x9fb7c9, 0x7d97a8] },
  futurista: { label: 'Futurista', roof: 'flat', walls: [0xe8f4f2, 0xcfe8f0, 0xdfe0ff, 0xb9f0d8, 0x2b3150], roofs: [0x5ee6b0, 0x6ea8ff, 0xb28cff], glass: [0x6ea8ff, 0x5ee6b0, 0xb28cff] },
  tropical: { label: 'Tropical', roof: 'hip', walls: [0xffd166, 0x06d6a0, 0xef476f, 0x8fd3ff, 0xffb4a2, 0xfff1c1], roofs: [0x7a5638, 0x9a6a3c, 0xc0623f], glass: [0x7fd0e0, 0x5cc0d4] },
  industrial: { label: 'Industrial', roof: 'gable', walls: [0xa4553a, 0x8f4a35, 0x6b6b6b, 0xb38b6d, 0x5b5b5b], roofs: [0x2b2b2b, 0x4a4f57, 0x6f7780], glass: [0x6c7a84, 0x5d6878] },
  oriental: { label: 'Oriental', roof: 'hip', walls: [0xf4ead8, 0xc0392b, 0xe9d3a6, 0xd8c3a5, 0x2f3b4c], roofs: [0x1f2d3d, 0x3b2b2b, 0x2f5f4f, 0x9a2f25], glass: [0x7d97a8, 0x9fb7c9] },
  colonial: { label: 'Colonial', roof: 'gable', walls: [0xf0c987, 0xf4e1c1, 0xe8b98a, 0xd9e6d0, 0xf6f0e0, 0xc9e0e6], roofs: [0x6b3e26, 0x8a4b2f, 0x4e8f6e], glass: [0x86a9c4, 0x9fb7c9] },
};
let STYLE = STYLES.clasico;
export function setStyle(id) { STYLE = STYLES[id] || STYLES.clasico; }

/* ---------------------------------------------------------------- merged low-poly builder */
export const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true });
export const glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0xffc977, emissiveIntensity: 0 });

export function prep(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}
export const GEO = {
  box: prep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  cyl: prep(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0)),
  cyl6: prep(new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0)),
  pyramid: prep(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)),
  cone: prep(new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0)),
  ico: prep(new THREE.IcosahedronGeometry(0.5, 0)),
  frustum: prep(new THREE.CylinderGeometry(0.32, 0.5, 1, 14).translate(0, 0.5, 0)),
  gable: (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath();
    return prep(new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5));
  })(),
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _n3 = new THREE.Matrix3();

export class Builder {
  constructor() { this.parts = [[], []]; this.smoke = []; }
  add(geo, color, x, y, z, sx, sy, sz, ry = 0, glow = 0) {
    _e.set(0, ry, 0); _q.setFromEuler(_e);
    this.parts[glow].push([geo, color, _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)).clone()]);
    return this;
  }
  box(x, y, z, w, h, d, color, glow = 0) { return this.add(GEO.box, color, x, y, z, w, h, d, 0, glow); }
  tree(x, z, s, color = 0x6c9c4c) {
    this.add(GEO.cyl6, 0x7a5638, x, 0, z, 0.05 * s, 0.25 * s, 0.05 * s);
    return this.add(GEO.ico, color, x, 0.38 * s, z, 0.34 * s, 0.34 * s, 0.34 * s);
  }
  // windows on all four faces of a w×d block, `floors` rows starting at y0
  windows(cx, cz, w, d, y0, floors, fh, r, lit = 0.5, color = 0x3d4a5c) {
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * fh + fh * 0.35;
      for (const [len, other, axis] of [[w, d, 'x'], [d, w, 'z']]) {
        const n = Math.max(1, Math.floor(len / 0.17));
        for (let k = 0; k < n; k++) {
          const o = -len / 2 + (k + 0.5) * (len / n);
          for (const side of [-1, 1]) {
            const glow = r() < lit ? 1 : 0;
            if (axis === 'x') this.box(cx + o, y, cz + side * (other / 2 + 0.004), 0.075, fh * 0.4, 0.012, color, glow);
            else this.box(cx + side * (other / 2 + 0.004), y, cz + o, 0.012, fh * 0.4, 0.075, color, glow);
          }
        }
      }
    }
  }
  // append another builder's parts, transformed by matrix (used to batch tiles into chunks)
  merge(other, matrix) {
    other.parts.forEach((list, k) => { for (const [g, c, m] of list) this.parts[k].push([g, c, matrix.clone().multiply(m)]); });
    for (const p of other.smoke) this.smoke.push(new THREE.Vector3(...p).applyMatrix4(matrix));
    return this;
  }
  build(shadows = true) {
    const group = new THREE.Group();
    this.parts.forEach((list, k) => {
      if (!list.length) return;
      let count = 0;
      for (const [g] of list) count += g.attributes.position.count;
      const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
      let o = 0;
      for (const [g, color, m] of list) {
        _c.set(color);
        _n3.getNormalMatrix(m);
        const p = g.attributes.position, n = g.attributes.normal;
        for (let i = 0; i < p.count; i++, o += 3) {
          _v.fromBufferAttribute(p, i).applyMatrix4(m);
          pos[o] = _v.x; pos[o + 1] = _v.y; pos[o + 2] = _v.z;
          _v.fromBufferAttribute(n, i).applyMatrix3(_n3).normalize();
          nor[o] = _v.x; nor[o + 1] = _v.y; nor[o + 2] = _v.z;
          col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, k ? glowMat : bodyMat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    group.userData.smoke = this.smoke;
    return group;
  }
}

/* ---------------------------------------------------------------- building designs (local space, front = +z) */
const AWNINGS = [0xd9553f, 0x3f7fbf, 0x4f9a5a, 0xe0a83a, 0x8a5fbf];
const LOT_GRASS = 0x9cc47a, LOT_PAVED = 0xcfc8ba, LOT_IND = 0xb8b09f, PATH = 0xe3dac8, ASPHALT = 0x5a5d64;
const TRIM = 0xf6f1e6, GLASS_DARK = 0x3d4a5c, DOOR = 0x6b4a33, METAL = 0x8d949b, CONCRETE = 0xcfc9bd;
const CAR_TINTS = [0xd8342a, 0x2f5fb5, 0xf2efe6, 0x3b3f46, 0xe0a83a, 0x4f9a5a, 0x9aa0a6];

// one framed window (frame, glass that may light up at night, sill) on the face of a block
function framedWindow(b, r, x, y, z, face, w, h, lit, frame = TRIM) {
  const along = face === 'x' ? [0.012, w] : [w, 0.012];
  b.box(x, y - 0.01, z, along[0] + (face === 'x' ? 0.004 : 0.02), h + 0.02, along[1] + (face === 'x' ? 0.02 : 0.004), frame);
  const gx = face === 'x' ? Math.sign(x) * 0.004 : 0, gz = face === 'z' ? Math.sign(z) * 0.004 : 0;
  b.box(x + gx, y, z + gz, along[0], h, along[1], GLASS_DARK, r() < lit ? 1 : 0);
  b.box(x + gx * 2, y - 0.018, z + gz * 2, face === 'x' ? 0.02 : w + 0.03, 0.012, face === 'x' ? w + 0.03 : 0.02, frame);
}
// framed windows on every face of a w×d block; skips the front-centre ground-floor slot for the door
function framedWindows(b, r, cx, cz, w, d, y0, floors, fh, lit = 0.45, frame = TRIM, skipDoor = true) {
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh + fh * 0.3;
    for (const [len, other, face] of [[w, d, 'z'], [d, w, 'x']]) {
      const n = Math.max(1, Math.floor(len / 0.19));
      for (let k = 0; k < n; k++) {
        const o = -len / 2 + (k + 0.5) * (len / n);
        for (const side of [-1, 1]) {
          if (skipDoor && f === 0 && face === 'z' && side === 1 && Math.abs(o) < 0.08) continue;
          if (face === 'z') framedWindow(b, r, cx + o, y, cz + side * (other / 2 + 0.004), 'z', 0.075, fh * 0.42, lit, frame);
          else framedWindow(b, r, cx + side * (other / 2 + 0.004), y, cz + o, 'x', 0.075, fh * 0.42, lit, frame);
        }
      }
    }
  }
}
function parkedCar(b, r, x, z, ry = 0) {
  const c = pick(r, CAR_TINTS);
  b.add(GEO.box, c, x, 0.02, z, 0.12, 0.06, 0.24, ry).add(GEO.box, 0x2e3a48, x, 0.08, z, 0.108, 0.05, 0.12, ry);
}
function parkingLot(b, r, x, z, w, d, spots) {
  b.box(x, 0.004, z, w, 0.02, d, ASPHALT);
  for (let k = 0; k <= spots; k++) b.box(x - w / 2 + (k * w) / spots, 0.024, z, 0.012, 0.002, d * 0.7, 0xf2efe6);
  for (let k = 0; k < spots; k++) if (r() < 0.65) parkedCar(b, r, x - w / 2 + ((k + 0.5) * w) / spots, z + (r() - 0.5) * 0.04);
}
function roofUnits(b, r, x, y, z, w, d, n = 3) {
  for (let k = 0; k < n; k++) b.box(x + (r() - 0.5) * w * 0.7, y, z + (r() - 0.5) * d * 0.7, 0.07 + r() * 0.05, 0.05, 0.07, 0xb9bec4);
}
function fence(b, x0, x1, z, color = TRIM) {
  b.box((x0 + x1) / 2, 0.03, z, x1 - x0, 0.025, 0.012, color);
  for (let x = x0; x <= x1 + 1e-6; x += 0.07) b.box(x, 0, z, 0.014, 0.065, 0.014, color);
}

function house(b, r, x, z, w, d, floors, opts = {}) {
  const wall = opts.wall ?? pick(r, STYLE.walls), roof = opts.roof ?? pick(r, STYLE.roofs), fh = 0.27, h = fh * floors;
  const frame = wall === 0xffffff || wall === 0xfaf6ee ? 0x6b7b8c : TRIM;
  b.box(x, 0, z, w, 0.04, d, 0xb9ad99); // plinth
  b.box(x, 0.04, z, w, h - 0.04, d, wall);
  if (floors > 1) b.box(x, fh, z, w + 0.012, 0.018, d + 0.012, frame); // string course between floors
  if (STYLE.roof === 'flat') {
    b.box(x, h, z, w + 0.03, 0.05, d + 0.03, roof).box(x - w * 0.15, h + 0.05, z - d * 0.1, w * 0.4, 0.14, d * 0.5, wall);
    b.box(x + w * 0.2, h + 0.05, z + d * 0.15, w * 0.3, 0.012, d * 0.3, 0x2c4f7c); // solar panel
  } else if (STYLE.roof === 'hip') {
    b.box(x, h, z, w + 0.1, 0.02, d + 0.1, roof);
    b.add(GEO.pyramid, roof, x, h + 0.02, z, w + 0.1, 0.18 + 0.03 * floors, d + 0.1);
  } else {
    const turn = !!opts.turn, rh = 0.24 + 0.04 * floors;
    const gw = (turn ? d : w) + 0.1, gd = (turn ? w : d) + 0.1;
    b.add(GEO.gable, roof, x, h, z, gw, rh, gd, turn ? Math.PI / 2 : 0);
    b.add(GEO.box, 0x3b2b2b, x, h + rh - 0.012, z, 0.035, 0.03, gd + 0.01, turn ? Math.PI / 2 : 0); // ridge
    if (turn && w > 0.5) { // dormer on the front slope
      const dz = z + d * 0.18, dy = h + rh * 0.25;
      b.box(x, dy, dz, 0.14, 0.1, 0.12, wall).add(GEO.gable, roof, x, dy + 0.1, dz, 0.18, 0.08, 0.16);
      b.box(x, dy + 0.025, dz + 0.061, 0.07, 0.06, 0.006, GLASS_DARK, r() < 0.5 ? 1 : 0);
    }
  }
  framedWindows(b, r, x, z, w, d, 0.02, floors, fh, 0.45, frame);
  // door with frame and step
  b.box(x, 0.04, z + d / 2 + 0.006, 0.12, 0.2, 0.012, frame).box(x, 0.04, z + d / 2 + 0.01, 0.09, 0.18, 0.012, opts.door ?? DOOR);
  b.box(x, 0, z + d / 2 + 0.04, 0.16, 0.04, 0.07, 0xd8d2c4);
  if (STYLE.roof === 'gable' && r() < 0.6) {
    const cx = x + w * 0.28, cz = z - d * 0.15;
    b.box(cx, h, cz, 0.07, 0.34, 0.07, 0x9c4f3b).box(cx, h + 0.34, cz, 0.09, 0.02, 0.09, 0x6b4a33);
  }
  return h;
}
function porch(b, x, z, w, wall) {
  b.box(x, 0, z, w, 0.04, 0.14, 0xd8d2c4);
  for (const s of [-1, 1]) b.box(x + s * (w / 2 - 0.02), 0.04, z + 0.05, 0.02, 0.2, 0.02, TRIM);
  b.box(x, 0.24, z, w + 0.02, 0.025, 0.16, wall);
}

// flower beds, a side hedge and a letterbox for houses with a garden
function garden(b, r) {
  for (let k = 0; k < 4; k++) if (r() < 0.75) b.box(-0.42 + k * 0.08, 0.02, 0.3 + r() * 0.06, 0.05, 0.035, 0.05, pick(r, [0xe4553b, 0xf0cf60, 0xe39ab8, 0xffffff, 0x8a5fbf]));
  if (r() < 0.55) b.box(r() < 0.5 ? -0.46 : 0.46, 0.02, -0.05, 0.05, 0.09, 0.8, 0x5f8f45);
  b.box(0.22, 0.02, 0.44, 0.015, 0.09, 0.015, 0x6b4a33).box(0.22, 0.11, 0.44, 0.045, 0.035, 0.03, pick(r, [0x3f6fb5, 0xd8342a, 0x4f9a5a]));
}

export function resBuilding(b, lv, r) {
  if (lv === 1) {
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_GRASS);
    const garage = r() < 0.45, hx = garage ? -0.1 : (r() - 0.5) * 0.08, w = garage ? 0.56 : 0.62 + r() * 0.12;
    const wall = pick(r, STYLE.walls);
    b.box(hx, 0.005, 0.37, 0.12, 0.02, 0.26, PATH);
    house(b, r, hx, -0.08, w, 0.5 + r() * 0.08, 1 + (r() < 0.25 ? 1 : 0), { turn: r() < 0.45, wall });
    if (r() < 0.5) porch(b, hx, 0.23, 0.3, wall);
    if (garage) {
      b.box(0.33, 0, -0.02, 0.26, 0.24, 0.36, wall).box(0.33, 0.24, -0.02, 0.29, 0.03, 0.39, 0x8d8579);
      b.box(0.33, 0.02, 0.165, 0.2, 0.17, 0.008, 0xe8e4dc).box(0.33, 0.005, 0.33, 0.2, 0.02, 0.3, 0xbdb7aa);
      if (r() < 0.6) parkedCar(b, r, 0.33, 0.34);
    }
    if (r() < 0.6) b.tree(r() < 0.5 ? -0.4 : 0.4, -0.4, 0.7 + r() * 0.3);
    fence(b, -0.48, -0.08, 0.47); fence(b, 0.08, garage ? 0.2 : 0.48, 0.47);
    garden(b, r);
  } else if (lv === 2) {
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_GRASS);
    b.box(0, 0.005, 0.39, 0.14, 0.02, 0.22, PATH);
    const w = 0.74 + r() * 0.1, wall = pick(r, STYLE.walls);
    house(b, r, 0, -0.06, w, 0.6, 2, { turn: r() < 0.4, wall });
    porch(b, 0, 0.27, 0.36, wall);
    if (r() < 0.45) { // corner turret, victorian style
      const tx = w / 2 - 0.02, tz = 0.16;
      b.add(GEO.cyl, 0xe9d3a6, tx, 0, tz, 0.2, 0.7, 0.2).add(GEO.cone, 0xb5483b, tx, 0.7, tz, 0.26, 0.3, 0.26);
      b.box(tx, 0.98, tz, 0.012, 0.08, 0.012, 0x3b3f46);
    } else if (r() < 0.5) { // side bay window
      b.box(-w / 2 - 0.05, 0.04, -0.06, 0.1, 0.22, 0.22, wall).box(-w / 2 - 0.1, 0.1, -0.06, 0.008, 0.1, 0.16, GLASS_DARK, r() < 0.5 ? 1 : 0);
    }
    if (r() < 0.6) b.tree(-0.4, -0.4, 0.9);
    fence(b, -0.48, -0.09, 0.47); fence(b, 0.09, 0.48, 0.47);
    garden(b, r);
  } else if (r() < 0.35) { // row of town houses with stoops
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
    for (let k = -1; k <= 1; k++) {
      house(b, r, k * 0.31, -0.04, 0.29, 0.62, 3, { turn: true });
      b.box(k * 0.31, 0, 0.3, 0.12, 0.06, 0.08, 0xd8d2c4);
    }
    for (const x of [-0.4, 0, 0.4]) b.tree(x, 0.44, 0.45);
  } else { // apartment block with balconies, cornices and a busy roof
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
    const floors = 4 + Math.floor(r() * 3), fh = 0.26, w = 0.8, d = 0.66, wall = pick(r, STYLE.walls), cz = -0.05;
    b.box(0, 0, cz, w, fh, d, 0x9a8f80); // ground floor base
    b.box(0, fh, cz, w, (floors - 1) * fh, d, wall);
    for (let f = 1; f <= floors; f++) b.box(0, f * fh - 0.012, cz, w + 0.02, 0.022, d + 0.02, TRIM);
    framedWindows(b, r, 0, cz, w, d, fh, floors - 1, fh, 0.5, TRIM, false);
    // shop fronts and entrance canopy on the ground floor
    b.box(0, 0.04, cz + d / 2 + 0.004, w * 0.86, 0.15, 0.012, 0x9fc6db, 1);
    b.box(0, 0.2, cz + d / 2 + 0.06, 0.24, 0.02, 0.12, 0x3b3f46).box(0, 0.02, cz + d / 2 + 0.006, 0.12, 0.17, 0.014, DOOR);
    // balconies on the front
    for (let f = 1; f < floors; f++) for (const x of [-0.24, 0.24]) {
      b.box(x, f * fh + 0.01, cz + d / 2 + 0.05, 0.2, 0.02, 0.1, CONCRETE);
      b.box(x, f * fh + 0.03, cz + d / 2 + 0.098, 0.2, 0.07, 0.006, 0x9fb7c9).box(x, f * fh + 0.1, cz + d / 2 + 0.098, 0.2, 0.008, 0.008, METAL);
    }
    const top = floors * fh;
    b.box(0, top, cz, w + 0.03, 0.05, d + 0.03, 0x8d8579);
    b.box(-0.22, top + 0.05, cz - 0.1, 0.2, 0.16, 0.18, wall);
    b.add(GEO.cyl, 0x9aa0a6, 0.2, top + 0.13, cz - 0.12, 0.14, 0.14, 0.14);
    for (const [px, pz] of [[0.15, -0.17], [0.25, -0.17], [0.15, -0.07], [0.25, -0.07]]) b.box(px, top + 0.05, pz + cz, 0.012, 0.08, 0.012, METAL);
    roofUnits(b, r, 0.1, top + 0.05, cz + 0.15, 0.4, 0.2, 2);
    b.tree(-0.42, 0.42, 0.6).tree(0.42, 0.42, 0.6);
  }
}

export function comBuilding(b, lv, r) {
  const wall = pick(r, STYLE.walls), aw = pick(r, AWNINGS);
  if (lv === 1) {
    const kind = r();
    if (kind < 0.3) { // café with a terrace of umbrellas
      b.box(0, 0, 0, 0.98, 0.02, 0.98, 0xe3d6bd);
      b.box(0, 0, -0.18, 0.72, 0.36, 0.5, wall).box(0, 0.36, -0.18, 0.75, 0.04, 0.53, 0x8d8579);
      b.box(0, 0.05, 0.072, 0.6, 0.18, 0.012, 0x9fc6db, 1);
      framedWindows(b, r, 0, -0.18, 0.72, 0.5, 0.2, 1, 0.2, 0.3, TRIM, false);
      for (let k = 0; k < 6; k++) b.box(-0.3 + k * 0.12, 0.26, 0.13, 0.12, 0.025, 0.12, k % 2 ? 0xf6f1e6 : aw);
      for (const [x, zz] of [[-0.26, 0.32], [0.04, 0.36], [0.3, 0.3]]) {
        b.box(x, 0, zz, 0.012, 0.18, 0.012, METAL).add(GEO.cone, pick(r, AWNINGS), x, 0.15, zz, 0.2, 0.06, 0.2);
        b.add(GEO.cyl, 0xf6f1e6, x, 0.06, zz, 0.08, 0.008, 0.08);
      }
    } else if (kind < 0.5) { // petrol station
      b.box(0, 0, 0, 0.98, 0.02, 0.98, ASPHALT);
      b.box(-0.24, 0, -0.26, 0.42, 0.26, 0.34, 0xf2efe6).box(-0.24, 0.26, -0.26, 0.44, 0.04, 0.36, aw);
      b.box(-0.24, 0.04, -0.088, 0.3, 0.14, 0.008, 0x9fc6db, 1);
      for (const [x, zz] of [[0.12, 0.1], [0.38, 0.1], [0.12, 0.34], [0.38, 0.34]]) b.box(x, 0, zz, 0.025, 0.3, 0.025, 0xe8e4dc);
      b.box(0.25, 0.3, 0.22, 0.4, 0.04, 0.38, aw).box(0.25, 0.32, 0.22, 0.42, 0.02, 0.4, 0xfff2c4, 1);
      for (const x of [0.18, 0.32]) b.box(x, 0.02, 0.22, 0.05, 0.12, 0.04, 0xd8342a);
      b.box(0.42, 0, -0.38, 0.03, 0.5, 0.03, METAL).box(0.42, 0.42, -0.38, 0.12, 0.12, 0.02, aw);
      if (r() < 0.7) parkedCar(b, r, 0.12, 0.22);
    } else { // corner shop with a striped awning
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
      const w = 0.74, d = 0.56, h = 0.38;
      b.box(0, 0, -0.08, w, h, d, wall).box(0, h, -0.08, w + 0.03, 0.04, d + 0.03, 0x8d8579);
      b.box(0, 0.04, 0.2 + 0.004, w * 0.82, 0.18, 0.012, 0x9fc6db, 1).box(0, 0.02, 0.2 + 0.006, 0.12, 0.19, 0.014, DOOR);
      for (let k = 0; k < 6; k++) b.box(-w * 0.45 + (k + 0.5) * (w * 0.9 / 6), 0.26, 0.27, w * 0.9 / 6, 0.025, 0.15, k % 2 ? 0xf6f1e6 : aw);
      b.box(0, h + 0.04, 0.14, 0.42, 0.11, 0.03, aw).box(0, h + 0.065, 0.157, 0.32, 0.05, 0.004, 0xf6f1e6);
      roofUnits(b, r, 0, h + 0.04, -0.15, 0.5, 0.3, 2);
      b.tree(0.42, 0.42, 0.55);
    }
  } else if (lv === 2) {
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
    const w = 0.86, d = 0.5, fh = 0.3, cz = -0.2;
    b.box(0, 0, cz, w, fh * 2, d, wall).box(0, fh * 2, cz, w + 0.03, 0.05, d + 0.03, 0x8d8579);
    b.box(0, fh, cz, w + 0.012, 0.02, d + 0.012, TRIM);
    b.box(0, 0.04, cz + d / 2 + 0.004, w * 0.88, 0.2, 0.012, 0x9fc6db, 1);
    for (let k = -1; k <= 1; k++) b.box(k * 0.28, 0.24, cz + d / 2 + 0.06, 0.24, 0.025, 0.12, pick(r, AWNINGS));
    framedWindows(b, r, 0, cz, w, d, fh, 1, fh, 0.5, TRIM, false);
    b.box(0, fh * 2 + 0.05, cz + d / 2 - 0.02, 0.5, 0.12, 0.03, aw).box(0, fh * 2 + 0.08, cz + d / 2 - 0.003, 0.4, 0.06, 0.004, 0xf6f1e6, 1);
    roofUnits(b, r, 0, fh * 2 + 0.05, cz - 0.05, 0.6, 0.3, 3);
    parkingLot(b, r, 0, 0.28, 0.9, 0.34, 4);
  } else { // shopping centre with a glass atrium and a car park
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
    const w = 0.94, d = 0.56, fh = 0.3, cz = -0.2;
    b.box(0, 0, cz, w, fh * 2.4, d, wall);
    for (let f = 0; f < 2; f++) b.box(0, f * fh + 0.1, cz, w + 0.008, 0.12, d + 0.008, 0x8fb7cf, f === 0 ? 1 : 0);
    b.box(0, 0, cz + d / 2 + 0.03, 0.3, fh * 2.2, 0.08, 0x9fc6db, 1);
    b.box(0, fh * 2.2, cz + d / 2 + 0.03, 0.34, 0.03, 0.1, TRIM);
    b.box(0, fh * 2.4, cz, w + 0.03, 0.05, d + 0.03, aw);
    b.box(-0.28, fh * 2.4 + 0.05, cz + d / 2 - 0.02, 0.3, 0.12, 0.03, aw).box(-0.28, fh * 2.4 + 0.08, cz + d / 2 - 0.003, 0.24, 0.06, 0.004, 0xf6f1e6, 1);
    for (const x of [-0.25, 0.05, 0.3]) b.box(x, fh * 2.4 + 0.05, cz - 0.05, 0.16, 0.04, 0.16, 0x9fc6db);
    parkingLot(b, r, 0, 0.3, 0.94, 0.34, 6);
  }
}

export function offBuilding(b, lv, r) {
  b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
  const glass = pick(r, STYLE.glass), frame = pick(r, [0xe8e4dc, 0x9aa0a6, 0x4a4f57, 0xd6c3a5]);
  const round = lv === 3 && r() < 0.3;
  const floors = lv === 1 ? 3 : lv === 2 ? 6 : 10, fh = 0.24, w = lv === 3 ? 0.62 : 0.72, d = lv === 3 ? 0.62 : 0.66;
  // podium with a glass lobby
  b.box(0, 0, 0, w + 0.12, fh, d + 0.12, 0x6f7780);
  b.box(0, 0.03, (d + 0.12) / 2 + 0.003, w * 0.7, fh * 0.75, 0.012, 0x9fc6db, 1);
  b.box(0, fh * 0.8, (d + 0.12) / 2 + 0.05, w * 0.5, 0.02, 0.1, frame);
  if (round) {
    const H = floors * fh;
    b.add(GEO.cyl, frame, 0, fh, 0, w, H - fh, w);
    for (let f = 1; f < floors; f++) b.add(GEO.cyl, glass, 0, f * fh + 0.05, 0, w + 0.012, fh * 0.6, w + 0.012, 0, r() < 0.25 ? 1 : 0);
    b.add(GEO.cyl, frame, 0, H, 0, w * 0.7, 0.2, w * 0.7).box(0, H + 0.2, 0, 0.015, 0.55, 0.015, 0xcfcfcf);
  } else {
    const H = floors * fh;
    b.box(0, fh, 0, w, H - fh, d, frame);
    for (let f = 1; f < floors; f++) b.box(0, f * fh + 0.05, 0, w + 0.008, fh * 0.62, d + 0.008, glass, r() < 0.25 ? 1 : 0);
    // vertical mullions over the glass
    for (const [len, other, axis] of [[w, d, 'x'], [d, w, 'z']]) {
      const n = Math.floor(len / 0.1);
      for (let k = 1; k < n; k++) {
        const o = -len / 2 + (k * len) / n;
        for (const s of [-1, 1]) {
          if (axis === 'x') b.box(o, fh, s * (other / 2 + 0.008), 0.012, H - fh, 0.012, frame);
          else b.box(s * (other / 2 + 0.008), fh, o, 0.012, H - fh, 0.012, frame);
        }
      }
    }
    b.box(0, H, 0, w + 0.02, 0.04, d + 0.02, frame);
    if (lv === 3) { // set-back crown and helipad or antenna
      b.box(0, H + 0.04, 0, w * 0.7, 0.3, d * 0.7, glass).box(0, H + 0.34, 0, w * 0.74, 0.03, d * 0.74, frame);
      if (r() < 0.5) {
        b.add(GEO.cyl, 0x4a4f57, 0, H + 0.37, 0, w * 0.6, 0.01, w * 0.6);
        b.box(-0.05, H + 0.381, 0, 0.02, 0.002, 0.14, 0xf2efe6).box(0.05, H + 0.381, 0, 0.02, 0.002, 0.14, 0xf2efe6).box(0, H + 0.381, 0, 0.1, 0.002, 0.02, 0xf2efe6);
      } else b.box(0, H + 0.37, 0, 0.02, 0.6, 0.02, 0xcfcfcf).box(0, H + 0.96, 0, 0.04, 0.03, 0.04, 0xff4b4b, 1);
    } else roofUnits(b, r, 0, H + 0.04, 0, w, d, 3);
  }
  if (lv === 1) b.tree(-0.42, 0.42, 0.6).tree(0.42, 0.42, 0.6);
  else for (const x of [-0.42, 0.42]) b.tree(x, 0.44, 0.5);
}

export function indBuilding(b, lv, r) {
  b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_IND);
  const wall = pick(r, [0xd8cfc0, 0xb9a48c, 0xc4c9cc, 0xb65a42]), roof = pick(r, [0x8d949b, 0x6f7780, 0x9a5a3c]);
  const chimney = (x, z, h) => {
    b.add(GEO.cyl, 0xd9d3c7, x, 0, z, 0.1, h, 0.1).add(GEO.cyl, 0xc0392b, x, h - 0.12, z, 0.105, 0.06, 0.105);
    b.smoke.push([x, h + 0.05, z]);
  };
  const container = (x, y, z, ry = 0) => b.add(GEO.box, pick(r, [0xd8342a, 0x2f5fb5, 0x4f9a5a, 0xe0a83a, 0x8d949b]), x, y, z, 0.1, 0.1, 0.24, ry);
  const truck = (x, z) => { b.box(x, 0.02, z, 0.1, 0.12, 0.2, 0xf2efe6).box(x, 0.02, z + 0.14, 0.1, 0.09, 0.07, pick(r, [0xd8342a, 0x2f5fb5, 0x3b3f46])); };
  if (lv === 1) { // workshop with roll-up doors and pallets
    b.box(0, 0, -0.1, 0.8, 0.34, 0.5, wall).add(GEO.gable, roof, 0, 0.34, -0.1, 0.86, 0.16, 0.56);
    for (const x of [-0.2, 0.15]) b.box(x, 0, 0.15 + 0.004, 0.22, 0.24, 0.012, 0x9aa0a6);
    framedWindows(b, r, 0, -0.1, 0.8, 0.5, 0.06, 1, 0.3, 0.3, 0xe8e4dc, false);
    for (let k = 0; k < 3; k++) b.box(-0.38 + k * 0.1, 0, 0.36, 0.08, 0.04 + (k % 2) * 0.04, 0.08, 0xb9864f);
    chimney(0.32, -0.28, 0.8);
    if (r() < 0.6) truck(0.3, 0.3);
  } else if (lv === 2) { // warehouse with loading docks, containers and a silo
    b.box(0, 0, -0.16, 0.9, 0.4, 0.52, wall).box(0, 0.4, -0.16, 0.92, 0.04, 0.54, roof);
    for (const x of [-0.3, -0.1, 0.1, 0.3]) {
      b.box(x, 0, 0.1 + 0.004, 0.14, 0.2, 0.012, 0x6f7780).box(x, 0.2, 0.13, 0.16, 0.015, 0.06, 0x3b3f46);
    }
    b.box(0, 0, 0.13, 0.9, 0.06, 0.05, CONCRETE);
    truck(-0.3, 0.34); if (r() < 0.6) truck(0.1, 0.34);
    container(0.38, 0, 0.32); container(0.38, 0.1, 0.32);
    b.add(GEO.cyl, 0xcfd4d8, -0.36, 0.44, -0.3, 0.16, 0.3, 0.16).add(GEO.cone, 0x9aa0a6, -0.36, 0.74, -0.3, 0.17, 0.08, 0.17);
    chimney(0.33, -0.34, 1.05);
  } else { // factory with saw-tooth roof, cooling tower, tanks and pipes
    b.box(-0.08, 0, -0.12, 0.76, 0.46, 0.66, wall);
    for (let k = 0; k < 4; k++) {
      const x = -0.37 + k * 0.19;
      b.add(GEO.gable, roof, x, 0.46, -0.12, 0.19, 0.14, 0.68).box(x + 0.045, 0.5, -0.12, 0.006, 0.07, 0.6, 0x9fc6db, 1);
    }
    framedWindows(b, r, -0.08, -0.12, 0.76, 0.66, 0.08, 1, 0.34, 0.4, 0xe8e4dc, false);
    b.add(GEO.frustum, 0xe9e4da, 0.36, 0, 0.3, 0.26, 0.7, 0.26);
    b.smoke.push([0.36, 0.75, 0.3]);
    for (const zz of [-0.36, -0.12]) b.add(GEO.cyl, 0xcfd4d8, 0.38, 0, zz, 0.16, 0.36, 0.16);
    b.box(0.31, 0.3, -0.24, 0.16, 0.025, 0.025, METAL).box(0.33, 0.3, 0.06, 0.025, 0.025, 0.24, METAL);
    chimney(-0.36, 0.34, 1.3); chimney(-0.2, 0.34, 1.15);
    container(0.05, 0, 0.36, Math.PI / 2);
  }
}

// what is left after a fire: scorched lot, charred walls and rubble
export function ruinSite(b, r) {
  b.box(0, 0, 0, 0.98, 0.02, 0.98, 0x6b6258);
  for (const [x, z, w, d, h] of [[-0.25, -0.2, 0.04, 0.5, 0.28], [0.1, -0.44, 0.6, 0.04, 0.2], [0.33, -0.1, 0.04, 0.3, 0.14]]) b.box(x, 0.02, z, w, h * (0.6 + r() * 0.6), d, 0x3b3633);
  for (let k = 0; k < 9; k++) b.add(GEO.ico, pick(r, [0x4a4440, 0x5b5550, 0x2f2b28]), (r() - 0.5) * 0.6, 0.02, (r() - 0.5) * 0.6, 0.08 + r() * 0.08, 0.05, 0.08 + r() * 0.08, r() * 3);
  for (const s of [-1, 1]) b.box(s * 0.47, 0, 0.1, 0.012, 0.07, 0.6, 0xe0a83a);
}

// a building under construction: fenced lot, rising frame, scaffolding and a crane for tall ones
export function constructionSite(b, zone, lv, r, progress) {
  b.box(0, 0, 0, 0.98, 0.02, 0.98, 0xa48a6a);
  for (const s of [-1, 1]) { b.box(s * 0.47, 0, 0, 0.012, 0.09, 0.94, 0xe0a83a); b.box(0, 0, s * 0.47, 0.94, 0.09, 0.012, 0xe0a83a); }
  const target = { res: [0, 0.4, 0.7, 1.4], com: [0, 0.42, 0.65, 0.8], off: [0, 0.75, 1.45, 2.6], ind: [0, 0.45, 0.5, 0.6] }[zone][lv];
  const h = Math.max(0.06, target * clamp01(progress)), w = 0.66, d = 0.56;
  b.box(0, 0.02, -0.04, w + 0.06, 0.04, d + 0.06, CONCRETE);
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2]]) b.box(x, 0.06, z - 0.04, 0.035, h, 0.035, 0xb9b2a6);
  for (let y = 0.26; y < h; y += 0.26) b.box(0, 0.06 + y, -0.04, w + 0.04, 0.025, d + 0.04, CONCRETE);
  // scaffolding on the front
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += w / 4) b.box(x, 0.02, d / 2 + 0.02, 0.012, h + 0.05, 0.012, 0xe0a83a);
  for (let y = 0.15; y < h; y += 0.15) b.box(0, 0.02 + y, d / 2 + 0.02, w, 0.012, 0.05, 0xb9864f);
  b.box(-0.36, 0, 0.36, 0.12, 0.08, 0.1, 0x8d949b).box(0.3, 0, 0.36, 0.14, 0.05, 0.08, 0xd8d2c4);
  if (target > 0.9) { // tower crane
    const ch = target + 0.5;
    b.box(0.4, 0, -0.38, 0.05, ch, 0.05, 0xf0c419);
    b.box(0.16, ch, -0.38, 0.8, 0.035, 0.035, 0xf0c419).box(0.6, ch - 0.05, -0.38, 0.12, 0.08, 0.06, 0x6f7780);
    b.box(-0.1, ch - 0.25, -0.38, 0.006, 0.25, 0.006, 0x3b3f46).box(-0.1, ch - 0.28, -0.38, 0.06, 0.03, 0.06, 0xd8342a);
  }
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function serviceBuilding(b, s, r) {
  switch (s) {
    case 'police': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
      b.box(0, 0, -0.1, 0.84, 0.5, 0.6, 0x5d7ea3).box(0, 0.5, -0.1, 0.87, 0.05, 0.63, 0x2f3b4c);
      b.box(0, 0.36, 0.2 + 0.003, 0.84, 0.06, 0.01, 0xf4efe4);
      b.windows(0, -0.1, 0.84, 0.6, 0, 2, 0.24, r, 0.6);
      b.box(-0.1, 0.55, -0.1, 0.08, 0.06, 0.08, 0x3d7bff, 1).box(0.1, 0.55, -0.1, 0.08, 0.06, 0.08, 0xff4b4b, 1);
      car(b, 0.22, 0.36, 0xf4f4f4, 0x2f5fb5);
      b.box(-0.4, 0, 0.38, 0.02, 0.7, 0.02, 0xcfcfcf).box(-0.34, 0.56, 0.38, 0.12, 0.08, 0.01, 0xd8b23a);
      break;
    }
    case 'fire': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
      const brick = 0xa8432f;
      b.box(0.08, 0, -0.1, 0.72, 0.56, 0.58, brick).add(GEO.gable, 0x3b2b2b, 0.08, 0.56, -0.1, 0.76, 0.22, 0.62);
      for (let k = -1; k <= 1; k++) b.box(0.08 + k * 0.22, 0, 0.19 + 0.003, 0.17, 0.26, 0.012, 0xf2efe6);
      b.windows(0.08, -0.1, 0.72, 0.58, 0.3, 1, 0.26, r, 0.5);
      b.box(-0.37, 0, -0.18, 0.22, 1.05, 0.22, brick).add(GEO.pyramid, 0xe2e2e2, -0.37, 1.05, -0.18, 0.28, 0.32, 0.28);
      b.windows(-0.37, -0.18, 0.22, 0.22, 0.5, 2, 0.24, r, 0.3);
      for (const x of [-0.14, 0.3]) car(b, x, 0.36, 0xd8342a, 0xf2efe6, 1.25);
      break;
    }
    case 'health': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
      b.box(0, 0, -0.08, 0.86, 0.78, 0.66, 0xf3f2ee).box(0, 0.78, -0.08, 0.89, 0.04, 0.69, 0xbfc4c8);
      b.windows(0, -0.08, 0.86, 0.66, 0, 3, 0.26, r, 0.6, 0x5f87a6);
      b.box(0, 0.82, -0.08, 0.34, 0.015, 0.1, 0xd33a2f).box(0, 0.82, -0.08, 0.1, 0.015, 0.34, 0xd33a2f);
      b.box(0, 0.5, 0.25 + 0.003, 0.14, 0.04, 0.01, 0xd33a2f).box(0, 0.45, 0.25 + 0.003, 0.04, 0.14, 0.01, 0xd33a2f);
      car(b, 0.3, 0.38, 0xf4f4f4, 0xd33a2f);
      break;
    }
    case 'school': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_GRASS);
      b.box(-0.12, 0, -0.22, 0.72, 0.48, 0.44, 0xe3b25c).add(GEO.gable, 0xb5483b, -0.12, 0.48, -0.22, 0.76, 0.2, 0.48);
      b.box(0.34, 0, 0.02, 0.26, 0.4, 0.5, 0xe3b25c).add(GEO.gable, 0xb5483b, 0.34, 0.4, 0.02, 0.54, 0.18, 0.3, Math.PI / 2);
      b.windows(-0.12, -0.22, 0.72, 0.44, 0, 2, 0.22, r, 0.4);
      b.box(-0.18, 0.005, 0.26, 0.5, 0.012, 0.36, 0x5c9b6b).box(-0.18, 0.012, 0.26, 0.012, 0.004, 0.36, 0xf4efe4);
      b.box(0.42, 0, 0.42, 0.02, 0.7, 0.02, 0xcfcfcf).box(0.48, 0.56, 0.42, 0.12, 0.08, 0.01, 0xd33a2f);
      break;
    }
    case 'park': {
      b.box(0, 0, 0, 0.98, 0.025, 0.98, 0x8cc46a);
      b.box(0, 0.006, 0, 0.98, 0.025, 0.12, PATH).box(0, 0.006, 0, 0.12, 0.025, 0.98, PATH);
      b.add(GEO.cyl, 0xbdb7aa, 0, 0, 0, 0.3, 0.07, 0.3).add(GEO.cyl, 0x6fb3e0, 0, 0.07, 0, 0.24, 0.01, 0.24);
      b.add(GEO.cyl, 0xbdb7aa, 0, 0, 0, 0.05, 0.18, 0.05);
      const colours = [0x6c9c4c, 0x5d8f45, 0xd9733f, 0xe39ab8];
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) b.tree(x, z, 0.9 + r() * 0.3, pick(r, colours));
      b.box(-0.18, 0, 0.1, 0.14, 0.05, 0.04, 0x7a5638).box(0.18, 0, -0.1, 0.14, 0.05, 0.04, 0x7a5638);
      break;
    }
    case 'power': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_IND);
      b.box(0.12, 0, 0.1, 0.62, 0.38, 0.5, 0xa4a9ae).box(0.12, 0.38, 0.1, 0.64, 0.04, 0.52, 0x6f7780);
      for (const [x, z, h] of [[-0.3, -0.25, 1.6], [-0.05, -0.32, 1.35]]) {
        b.add(GEO.cyl, 0xe9e4da, x, 0, z, 0.14, h, 0.14);
        for (let k = 1; k <= 3; k++) b.add(GEO.cyl, 0xc0392b, x, h - k * 0.22, z, 0.145, 0.08, 0.145);
        b.smoke.push([x, h + 0.05, z]);
      }
      for (const x of [0.36, 0.46]) b.box(x, 0, -0.32, 0.03, 0.6, 0.03, 0x6f7780);
      b.box(0.41, 0.55, -0.32, 0.16, 0.02, 0.03, 0x6f7780);
      break;
    }
    case 'water': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_GRASS);
      for (const [x, z] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) b.box(x, 0, z, 0.04, 0.95, 0.04, 0x8d949b);
      b.add(GEO.cyl, 0x7fb0d4, 0, 0.9, 0, 0.56, 0.42, 0.56).add(GEO.cone, 0x5d6878, 0, 1.32, 0, 0.6, 0.2, 0.6);
      b.box(0.3, 0, 0.32, 0.26, 0.2, 0.22, 0xe9e1d0).add(GEO.gable, 0x5d6878, 0.3, 0.2, 0.32, 0.3, 0.1, 0.26);
      break;
    }
    case 'coal': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, 0x8f897d);
      b.box(0.1, 0, 0.12, 0.66, 0.42, 0.46, 0x6b4a3a).add(GEO.gable, 0x3b3f46, 0.1, 0.42, 0.12, 0.7, 0.16, 0.5);
      b.windows(0.1, 0.12, 0.66, 0.46, 0.05, 1, 0.3, r, 0.5, 0x3b3f46);
      for (const [x, z, h] of [[-0.3, -0.28, 1.75], [-0.05, -0.34, 1.55]]) {
        b.add(GEO.cyl, 0x5b5b5b, x, 0, z, 0.16, h, 0.16).add(GEO.cyl, 0x3b3f46, x, h - 0.08, z, 0.17, 0.08, 0.17);
        b.smoke.push([x, h + 0.05, z], [x, h + 0.05, z]);
      }
      b.add(GEO.pyramid, 0x2b2b2b, 0.32, 0, -0.3, 0.32, 0.18, 0.28);
      break;
    }
    case 'solar': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_GRASS);
      for (let k = 0; k < 4; k++) {
        const z = -0.34 + k * 0.22;
        b.box(-0.3, 0, z, 0.02, 0.08, 0.02, 0x8d949b).box(0.3, 0, z, 0.02, 0.08, 0.02, 0x8d949b);
        b.box(0, 0.08, z - 0.03, 0.84, 0.025, 0.08, 0x2c4f7c).box(0, 0.1, z + 0.03, 0.84, 0.025, 0.08, 0x355d91);
      }
      b.box(0.4, 0, 0.42, 0.12, 0.12, 0.1, 0xe9e1d0);
      break;
    }
    case 'wind': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_GRASS);
      b.add(GEO.cyl, 0xf2f2ee, 0, 0, 0, 0.09, 0.8, 0.09).add(GEO.cyl, 0xf2f2ee, 0, 0.8, 0, 0.06, 0.8, 0.06);
      b.box(0, 1.58, -0.04, 0.08, 0.08, 0.2, 0xe9e4da);
      b.box(0.32, 0, 0.3, 0.16, 0.12, 0.12, 0xe9e1d0);
      break;
    }
    case 'cityhall': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
      b.box(0, 0, 0.36, 0.7, 0.04, 0.16, 0xd8d2c4).box(0, 0.04, 0.34, 0.6, 0.04, 0.12, 0xd8d2c4);
      b.box(0, 0, -0.08, 0.92, 0.58, 0.56, 0xefe4cc).box(0, 0.58, -0.08, 0.95, 0.05, 0.59, 0xb8a98c);
      b.add(GEO.gable, 0x9a5a3c, 0, 0.63, -0.08, 0.95, 0.16, 0.59);
      b.windows(0, -0.08, 0.92, 0.56, 0, 2, 0.28, r, 0.6);
      b.box(0, 0, -0.08, 0.24, 1.25, 0.24, 0xefe4cc).add(GEO.pyramid, 0x46614f, 0, 1.25, -0.08, 0.3, 0.32, 0.3);
      b.add(GEO.cyl, 0xf8f6f0, 0, 0.98, 0.04 + 0.005, 0.14, 0.14, 0.02).box(0, 1.02, 0.05 + 0.006, 0.01, 0.05, 0.01, 0x2b2622);
      b.box(0, 1.57, -0.08, 0.015, 0.3, 0.015, 0xcfcfcf).box(0.07, 1.78, -0.08, 0.12, 0.08, 0.01, 0xd33a2f);
      break;
    }
    case 'plaza': {
      b.box(0, 0, 0, 0.98, 0.025, 0.98, 0xe3d6bd);
      b.box(0, 0.005, 0, 0.7, 0.025, 0.7, 0xd2c3a6);
      b.add(GEO.cyl6, 0xbdb7aa, -0.2, 0, -0.2, 0.32, 0.06, 0.32).add(GEO.cyl6, 0x6fb3e0, -0.2, 0.06, -0.2, 0.26, 0.01, 0.26);
      b.add(GEO.cyl6, 0xe9e4da, 0.22, 0.03, 0.2, 0.3, 0.04, 0.3);
      for (const [x, z] of [[0.1, 0.07], [0.34, 0.07], [0.1, 0.33], [0.34, 0.33]]) b.box(x, 0.07, z, 0.015, 0.16, 0.015, 0x7a5638);
      b.add(GEO.cone, 0xc0623f, 0.22, 0.23, 0.2, 0.36, 0.14, 0.36);
      for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42]]) b.tree(x, z, 0.7);
      b.box(-0.2, 0, 0.3, 0.16, 0.05, 0.04, 0x7a5638).box(0.3, 0, -0.25, 0.04, 0.05, 0.16, 0x7a5638);
      break;
    }
    case 'zoo': {
      b.box(0, 0, 0, 0.98, 0.025, 0.98, 0xa8c97a);
      for (const s of [-1, 1]) b.box(s * 0.47, 0, 0, 0.02, 0.07, 0.96, 0x7a5638).box(0, 0, s * 0.47, 0.96, 0.07, 0.02, 0x7a5638);
      b.box(0, 0.006, 0.05, 0.98, 0.022, 0.1, PATH).box(0.05, 0.006, 0, 0.1, 0.022, 0.98, PATH);
      b.add(GEO.cyl, 0x5c9fd4, -0.26, 0.006, -0.28, 0.3, 0.022, 0.24);
      // elephant
      b.box(-0.24, 0.07, 0.26, 0.16, 0.1, 0.09, 0x8d949b).box(-0.13, 0.1, 0.26, 0.07, 0.08, 0.07, 0x8d949b);
      for (const [x, z] of [[-0.3, 0.23], [-0.3, 0.29], [-0.18, 0.23], [-0.18, 0.29]]) b.box(x, 0, z, 0.03, 0.07, 0.03, 0x7d848b);
      // giraffe
      for (const [x, z] of [[0.24, -0.27], [0.24, -0.21], [0.33, -0.27], [0.33, -0.21]]) b.box(x, 0, z, 0.02, 0.12, 0.02, 0xd9a441);
      b.box(0.285, 0.12, -0.24, 0.13, 0.06, 0.07, 0xe0b04f).box(0.34, 0.16, -0.24, 0.03, 0.18, 0.03, 0xe0b04f).box(0.36, 0.33, -0.24, 0.07, 0.04, 0.04, 0xe0b04f);
      // lion rock and enclosure
      b.add(GEO.ico, 0xb9ad99, 0.28, 0.05, 0.28, 0.2, 0.12, 0.16).box(0.24, 0.09, 0.33, 0.06, 0.04, 0.04, 0xd99a2b);
      b.tree(-0.38, -0.05, 0.7).tree(0.4, 0.05, 0.6, 0x5d8f45).tree(-0.05, -0.38, 0.6);
      b.box(0.05, 0, 0.47, 0.18, 0.2, 0.03, 0xd33a2f).box(0.05, 0.2, 0.47, 0.22, 0.04, 0.05, 0xf0cf60);
      break;
    }
    case 'stadium': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
      b.add(GEO.cyl, 0xd9d3c7, 0, 0, 0, 0.96, 0.24, 0.82).add(GEO.cyl, 0xc0392b, 0, 0, 0, 0.9, 0.3, 0.76);
      b.add(GEO.cyl, 0xf2efe6, 0, 0.3, 0, 0.7, 0.006, 0.56).add(GEO.cyl, 0x5aa457, 0, 0.3, 0, 0.64, 0.012, 0.5);
      b.box(0, 0.312, 0, 0.006, 0.002, 0.46, 0xf4efe4).add(GEO.cyl, 0xf4efe4, 0, 0.311, 0, 0.12, 0.002, 0.12);
      for (const [x, z] of [[-0.44, -0.4], [0.44, -0.4], [-0.44, 0.4], [0.44, 0.4]]) b.box(x, 0, z, 0.025, 0.62, 0.025, 0x6f7780).box(x, 0.62, z, 0.09, 0.05, 0.03, 0xfff2c4, 1);
      break;
    }
    case 'bus': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
      b.box(0, 0, -0.18, 0.9, 0.36, 0.5, 0xe9e1d0).box(0, 0.36, -0.18, 0.94, 0.04, 0.54, 0x3f6fb5);
      for (let k = -1; k <= 1; k++) b.box(k * 0.28, 0, 0.07 + 0.003, 0.22, 0.26, 0.012, 0x5d6878);
      for (const x of [-0.28, 0, 0.28]) b.box(x, 0.02, 0.3, 0.085, 0.1, 0.3, pick(r, [0xd8342a, 0xe0a83a, 0x3f9a5a])).box(x, 0.08, 0.3, 0.087, 0.035, 0.28, 0x2e3a48);
      b.box(0.38, 0.36, -0.18, 0.04, 0.32, 0.04, 0xcfcfcf).box(0.38, 0.62, -0.12, 0.16, 0.1, 0.02, 0x3f6fb5);
      break;
    }
    case 'museum': {
      b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
      for (let k = 0; k < 3; k++) b.box(0, k * 0.03, 0.06 - k * 0.03, 0.86 - k * 0.04, 0.03, 0.74 - k * 0.06, 0xe4dccb);
      b.box(0, 0.09, -0.1, 0.72, 0.42, 0.44, 0xf2ede2);
      for (let k = 0; k < 6; k++) b.add(GEO.cyl, 0xf8f6f0, -0.3 + k * 0.12, 0.09, 0.2, 0.05, 0.36, 0.05);
      b.box(0, 0.45, 0.05, 0.78, 0.05, 0.36, 0xe4dccb).add(GEO.gable, 0xe9e1d0, 0, 0.5, 0.05, 0.8, 0.14, 0.38);
      b.box(0, 0.45, -0.3, 0.3, 0.12, 0.2, 0x9fc6db, 1);
      break;
    }
  }
}

// Wind turbine rotor, animated separately from the merged chunk meshes.
const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.7, flatShading: true });
export function windRotor() {
  const group = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.Mesh(GEO.box, bladeMat);
    blade.scale.set(0.035, 0.5, 0.012);
    blade.rotation.z = (k * Math.PI * 2) / 3;
    blade.castShadow = true;
    group.add(blade);
  }
  return group;
}

function car(b, x, z, body, top, len = 1) {
  b.box(x, 0.02, z, 0.12 * len, 0.06, 0.07, body).box(x - 0.01, 0.08, z, 0.07 * len, 0.04, 0.065, top);
}


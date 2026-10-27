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
const LOT_GRASS = 0x9cc47a, LOT_PAVED = 0xcfc8ba, LOT_IND = 0xb8b09f, PATH = 0xe3dac8;

function house(b, r, x, z, w, d, floors, opts = {}) {
  const wall = opts.wall ?? pick(r, STYLE.walls), roof = opts.roof ?? pick(r, STYLE.roofs), fh = 0.27, h = fh * floors;
  b.box(x, 0, z, w, h, d, wall);
  if (STYLE.roof === 'flat') {
    b.box(x, h, z, w + 0.03, 0.05, d + 0.03, roof).box(x - w * 0.15, h + 0.05, z, w * 0.4, 0.14, d * 0.6, wall);
  } else if (STYLE.roof === 'hip') {
    b.add(GEO.pyramid, roof, x, h, z, w + 0.1, 0.18 + 0.03 * floors, d + 0.1);
  } else {
    const along = opts.turn ? Math.PI / 2 : 0;
    b.add(GEO.gable, roof, x, h, z, (opts.turn ? d : w) + 0.08, 0.24 + 0.04 * floors, (opts.turn ? w : d) + 0.08, along);
  }
  b.windows(x, z, w, d, 0, floors, fh, r, 0.45);
  b.box(x, 0, z + d / 2 + 0.004, 0.1, 0.17, 0.014, 0x6b4a33);
  if (STYLE.roof === 'gable' && r() < 0.55) b.box(x + w * 0.28, h, z - d * 0.15, 0.07, 0.32, 0.07, 0x9c4f3b);
  return h;
}

export function resBuilding(b, lv, r) {
  if (lv === 1) {
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_GRASS);
    b.box(0, 0.005, 0.36, 0.14, 0.02, 0.28, PATH);
    house(b, r, (r() - 0.5) * 0.08, -0.06, 0.62 + r() * 0.14, 0.52 + r() * 0.1, 1 + (r() < 0.25 ? 1 : 0), { turn: r() < 0.3 });
    if (r() < 0.6) b.tree(r() < 0.5 ? -0.4 : 0.4, -0.38, 0.7 + r() * 0.3);
    b.box(-0.3, 0, 0.47, 0.36, 0.06, 0.03, 0xf4efe4).box(0.3, 0, 0.47, 0.36, 0.06, 0.03, 0xf4efe4);
  } else if (lv === 2) {
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_GRASS);
    b.box(0, 0.005, 0.38, 0.14, 0.02, 0.24, PATH);
    const w = 0.74 + r() * 0.1;
    house(b, r, 0, -0.05, w, 0.62, 2, { turn: r() < 0.3 });
    if (r() < 0.45) { // corner turret, victorian style
      const tx = w / 2 - 0.02, tz = 0.18;
      b.add(GEO.cyl, 0xe9d3a6, tx, 0, tz, 0.2, 0.68, 0.2).add(GEO.cone, 0xb5483b, tx, 0.68, tz, 0.26, 0.3, 0.26);
    }
    if (r() < 0.6) b.tree(-0.38, -0.36, 0.9);
  } else if (r() < 0.35) { // row of town houses
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
    for (let k = -1; k <= 1; k++) house(b, r, k * 0.3, 0, 0.28, 0.6, 3, { turn: true });
  } else { // apartment block
    b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
    const floors = 4 + Math.floor(r() * 3), fh = 0.26, w = 0.78, d = 0.66, wall = pick(r, STYLE.walls);
    b.box(0, 0, -0.04, w, floors * fh, d, wall);
    b.box(0, floors * fh, -0.04, w + 0.03, 0.05, d + 0.03, 0x8d8579);
    b.box(0.2, floors * fh, -0.1, 0.18, 0.12, 0.16, 0x9aa0a6);
    b.windows(0, -0.04, w, d, 0, floors, fh, r, 0.5);
    for (let f = 1; f < floors; f++) b.box(0, f * fh, d / 2 - 0.04 + 0.03, w * 0.7, 0.02, 0.06, 0xf4efe4);
    b.tree(-0.4, 0.4, 0.7);
  }
}

export function comBuilding(b, lv, r) {
  b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
  const wall = pick(r, STYLE.walls), aw = pick(r, AWNINGS);
  if (lv === 1) {
    const w = 0.72, d = 0.56, h = 0.34;
    b.box(0, 0, -0.08, w, h, d, wall).box(0, h, -0.08, w + 0.03, 0.04, d + 0.03, 0x8d8579);
    b.box(0, 0.05, 0.2 + 0.002, w * 0.8, 0.16, 0.012, 0x9fc6db, 1);
    b.add(GEO.box, aw, 0, 0.24, 0.26, w * 0.9, 0.03, 0.16);
    b.box(0, h + 0.04, 0.12, 0.4, 0.1, 0.03, aw);
    b.tree(0.4, 0.42, 0.6);
  } else if (lv === 2) {
    const w = 0.84, d = 0.66, fh = 0.3;
    b.box(0, 0, -0.06, w, fh * 2, d, wall).box(0, fh * 2, -0.06, w + 0.03, 0.04, d + 0.03, 0x8d8579);
    b.box(0, 0.05, d / 2 - 0.06 + 0.002, w * 0.85, 0.18, 0.012, 0x9fc6db, 1);
    b.add(GEO.box, aw, 0, 0.26, d / 2 - 0.06 + 0.07, w * 0.92, 0.03, 0.14);
    b.windows(0, -0.06, w, d, fh, 1, fh, r, 0.5);
    b.box(-0.2, fh * 2, -0.15, 0.16, 0.1, 0.16, 0x9aa0a6);
  } else {
    const w = 0.92, d = 0.84, fh = 0.3;
    b.box(0, 0, -0.02, w, fh * 3, d, wall);
    for (let f = 0; f < 3; f++) b.box(0, f * fh + 0.08, -0.02, w + 0.01, 0.14, d + 0.01, 0x8fb7cf, f === 0 ? 1 : 0);
    b.box(0, fh * 3, -0.02, w + 0.03, 0.05, d + 0.03, aw);
    b.box(0, fh * 3 + 0.05, d / 2 - 0.1, 0.5, 0.14, 0.04, aw);
  }
}

export function offBuilding(b, lv, r) {
  b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_PAVED);
  const glass = pick(r, STYLE.glass), frame = pick(r, [0xe8e4dc, 0x9aa0a6, 0x4a4f57, 0xd6c3a5]);
  const floors = lv === 1 ? 3 : lv === 2 ? 6 : 10, fh = 0.24, w = lv === 3 ? 0.68 : 0.74, d = lv === 3 ? 0.68 : 0.7;
  b.box(0, 0, 0, w, floors * fh, d, frame);
  for (let f = 0; f < floors; f++) b.box(0, f * fh + 0.07, 0, w + 0.008, fh * 0.5, d + 0.008, glass, r() < 0.25 ? 1 : 0);
  b.box(0, floors * fh, 0, w * 0.6, 0.12, d * 0.6, frame);
  if (lv === 3) {
    b.box(0, floors * fh + 0.12, 0, w * 0.45, 0.4, d * 0.45, glass);
    b.box(0, floors * fh + 0.52, 0, 0.02, 0.5, 0.02, 0xcfcfcf);
  }
  if (lv === 1) b.tree(-0.4, 0.4, 0.6).tree(0.4, 0.4, 0.6);
}

export function indBuilding(b, lv, r) {
  b.box(0, 0, 0, 0.98, 0.02, 0.98, LOT_IND);
  const wall = pick(r, [0xd8cfc0, 0xb9a48c, 0xc4c9cc, 0xb65a42]), roof = pick(r, [0x8d949b, 0x6f7780, 0x9a5a3c]);
  const chimney = (x, z, h) => {
    b.add(GEO.cyl, 0xd9d3c7, x, 0, z, 0.1, h, 0.1).add(GEO.cyl, 0xc0392b, x, h - 0.12, z, 0.105, 0.06, 0.105);
    b.smoke.push([x, h + 0.05, z]);
  };
  if (lv === 1) {
    b.box(0, 0, -0.05, 0.8, 0.34, 0.56, wall).add(GEO.gable, roof, 0, 0.34, -0.05, 0.86, 0.18, 0.6);
    b.box(0, 0, 0.23 + 0.002, 0.26, 0.24, 0.012, 0x6f7780);
    chimney(0.3, -0.25, 0.85);
  } else if (lv === 2) {
    b.box(-0.08, 0, -0.08, 0.7, 0.42, 0.66, wall).add(GEO.gable, roof, -0.08, 0.42, -0.08, 0.74, 0.2, 0.7, Math.PI / 2);
    b.add(GEO.cyl, 0xcfd4d8, 0.36, 0, 0.3, 0.22, 0.4, 0.22).add(GEO.cone, 0x9aa0a6, 0.36, 0.4, 0.3, 0.22, 0.08, 0.22);
    chimney(0.33, -0.3, 1.05); chimney(0.15, -0.3, 0.9);
  } else {
    b.box(0, 0, -0.04, 0.9, 0.46, 0.8, wall);
    for (let k = 0; k < 4; k++) b.add(GEO.gable, roof, -0.34 + k * 0.226, 0.46, -0.04, 0.22, 0.16, 0.82);
    b.add(GEO.cyl, 0xcfd4d8, -0.34, 0, 0.38, 0.18, 0.55, 0.18).add(GEO.cyl, 0xcfd4d8, -0.13, 0, 0.38, 0.18, 0.55, 0.18);
    chimney(0.34, 0.3, 1.3); chimney(0.34, -0.34, 1.15);
  }
}

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


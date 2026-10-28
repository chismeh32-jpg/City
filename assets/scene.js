// Urbania — renderer, camera, lights, sky, terrain, river, clouds, post-processing and graphics quality.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { rng } from './buildings.js';
import { $, HALF, N, RIVER_W, clamp, el, hash, news, riverZ } from './config.js';
import { S } from './state.js';

/* ---------------------------------------------------------------- renderer */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // refreshed on a schedule in renderFrame
renderer.info.autoReset = false;       // counted over all post-processing passes of a frame
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
$('view').append(renderer.domElement);

const scene = new THREE.Scene();
const SKY_DAY = new THREE.Color(0xcfe3ea), SKY_DUSK = new THREE.Color(0xf0b48a), SKY_NIGHT = new THREE.Color(0x2c3a5e), SKY_RAIN = new THREE.Color(0x9aa7ad);
const TOP_DAY = new THREE.Color(0x6fa8dc), TOP_DUSK = new THREE.Color(0x7a6fa8), TOP_NIGHT = new THREE.Color(0x0e1630), TOP_RAIN = new THREE.Color(0x7d8a92);
scene.fog = new THREE.Fog(SKY_DAY.clone(), 75, 170);

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 600);
camera.position.set(24, 30, 34);
const controls = new MapControls(camera, renderer.domElement);
controls.target.set(0, 0, 3);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 7;
controls.maxDistance = 80;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.22;
controls.zoomToCursor = true;
controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
controls.listenToKeyEvents(window);
controls.keyPanSpeed = 18;

const hemi = new THREE.HemisphereLight(0xe6f1ff, 0x6f8a4c, 1.15);
const sun = new THREE.DirectionalLight(0xfff0d4, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 160 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.camera.layers.enable(1); // layer 1: invisible cloud shapes that only cast shadows
scene.add(hemi, sun, sun.target);

/* sky dome with a vertical gradient (horizon colour doubles as fog colour) */
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: TOP_DAY.clone() }, horizon: { value: SKY_DAY.clone() } },
  vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.45, h)), 1.0); }',
}));
sky.renderOrder = -1;
scene.add(sky);

/* terrain: flat where you build, rolling hills beyond the edge of the map, flat along the river */
function terrainHeight(x, z) {
  const edge = Math.max(Math.abs(x), Math.abs(z)) - (HALF + 2);
  if (edge <= 0) return 0;
  const rz = riverZ(x + HALF) - HALF, river = clamp((Math.abs(z - rz) - RIVER_W - 1.5) / 6, 0, 1);
  const n = (Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) + Math.sin((x + z) * 0.05) * 0.8 + 1.8) / 3.6;
  return Math.pow(Math.min(edge / 12, 1), 1.5) * (0.8 + n * 5) * river;
}
{
  const G = 220, geo = new THREE.PlaneGeometry(G, G, 140, 140);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(0x93b96c), b = new THREE.Color(0x7aa458), hill = new THREE.Color(0x6f9a52), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = terrainHeight(x, z);
    p.setY(i, h);
    const n = (Math.sin(x * 0.21) * Math.cos(z * 0.17) + 1) / 2 * 0.7 + hash(i, 9) * 0.3;
    c.copy(a).lerp(b, n).lerp(hill, clamp(h / 5, 0, 0.7));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // a ring of distant low-poly mountains, softened by the fog
  const r = rng(77), mat = new THREE.MeshStandardMaterial({ color: 0x7d9a7a, roughness: 1, flatShading: true });
  for (let k = 0; k < 22; k++) {
    const ang = (k / 22) * Math.PI * 2 + r() * 0.2, dist = 95 + r() * 25, hgt = 8 + r() * 14;
    const m = new THREE.Mesh(new THREE.ConeGeometry(10 + r() * 10, hgt, 5 + Math.floor(r() * 3)), mat);
    m.position.set(Math.cos(ang) * dist, hgt / 2 - 1, Math.sin(ang) * dist);
    m.rotation.y = r() * 3;
    scene.add(m);
  }

  const grid = new THREE.GridHelper(N, N, 0x2b2622, 0x2b2622);
  grid.material.transparent = true;
  grid.material.opacity = 0.06;
  grid.position.y = 0.012;
  scene.add(grid);
  scene.userData.grid = grid;
}

/* river: sandy bank + animated water strip following riverZ */
function riverStrip(width, y, material) {
  const pts = [], from = -70, to = N + 70, step = 0.5;
  for (let x = from; x <= to; x += step) {
    const z = riverZ(x), dz = (riverZ(x + 0.01) - z) / 0.01, len = Math.hypot(1, dz);
    const nx = -dz / len, nz = 1 / len;
    pts.push([x - HALF + nx * width, z - HALF + nz * width, x - HALF - nx * width, z - HALF - nz * width]);
  }
  const pos = [], uv = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, bx, bz] = pts[i], [cx, cz, dx, dzz] = pts[i + 1];
    pos.push(ax, y, az, cx, y, cz, bx, y, bz, bx, y, bz, cx, y, cz, dx, y, dzz);
    uv.push(0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
riverStrip(RIVER_W + 0.45, 0.008, new THREE.MeshStandardMaterial({ color: 0xd9caa0, roughness: 1, side: THREE.DoubleSide }));
const waterMat = new THREE.ShaderMaterial({
  fog: true, side: THREE.DoubleSide,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uLight: { value: 1 }, uDeep: { value: new THREE.Color(0x2f6f9f) }, uShallow: { value: new THREE.Color(0x6fb6d8) },
    uSky: { value: new THREE.Color(0xcfe3ea) }, uSun: { value: new THREE.Vector3(0, 1, 0) },
  }]),
  vertexShader: `varying vec2 vUv; varying vec3 vW;
    #include <fog_pars_vertex>
    void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `uniform float uTime; uniform float uLight; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSun;
    varying vec2 vUv; varying vec3 vW;
    #include <fog_pars_fragment>
    void main() {
      float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
      vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.8, across));
      float w1 = sin(vW.x * 2.3 + uTime * 1.1) * cos(vW.z * 3.1 - uTime * 0.8);
      float w2 = sin((vW.x + vW.z) * 5.7 - uTime * 1.9) * 0.5;
      vec3 n = normalize(vec3((w1 + w2) * 0.12, 1.0, (w1 - w2) * 0.12));
      vec3 v = normalize(cameraPosition - vW);
      float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      col = mix(col, uSky, fres * 0.6);
      float spec = pow(max(dot(reflect(-normalize(uSun), n), v), 0.0), 60.0);
      col += vec3(1.0, 0.95, 0.85) * spec * 1.4 * uLight;
      float foam = smoothstep(0.18, 0.0, across) * (0.5 + 0.5 * sin(vW.x * 6.0 + uTime * 2.0 + vW.z * 3.0));
      col = mix(col, vec3(0.92), foam * 0.35);
      gl_FragColor = vec4(col * (0.2 + 0.8 * uLight), 1.0);
      #include <fog_fragment>
    }`,
});
riverStrip(RIVER_W + 0.1, 0.02, waterMat);

/* drifting clouds that only cast soft moving shadows on the city */
const cloudShapes = [];
{
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const r = rng(321);
  for (let k = 0; k < 7; k++) {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + r() * 2.5, 1), mat);
      m.position.set((r() - 0.5) * 6, 0, (r() - 0.5) * 4);
      m.castShadow = true;
      m.layers.set(1);
      g.add(m);
    }
    g.position.set((r() - 0.5) * 80, 16 + r() * 4, (r() - 0.5) * 80);
    scene.add(g);
    cloudShapes.push(g);
  }
}
function updateClouds(dt) {
  for (const g of cloudShapes) {
    g.position.x += dt * (S.speed ? 0.6 + S.speed * 0.3 : 0.15);
    if (g.position.x > 55) g.position.x = -55;
  }
}

/* ---------------------------------------------------------------- post-processing & quality */
// alta: ambient occlusion + bloom + tilt-shift · media: bloom + tilt-shift · baja: plain render
const GFX_KEY = 'urbania-gfx';
const GFX_LEVELS = { alta: 'Alta', media: 'Media', baja: 'Baja' };
let gfx = (() => { try { return localStorage.getItem(GFX_KEY); } catch { return null; } })();
const gfxChosen = !!gfx;
if (!GFX_LEVELS[gfx]) gfx = matchMedia('(pointer: coarse)').matches ? 'media' : 'alta';

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.blendIntensity = 0.85;
gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 12 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.45, 0.92);
composer.addPass(bloom);
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uFocus: { value: 0.5 },
    uBand: { value: 0.16 }, uBlur: { value: 4 }, uSat: { value: 1.08 }, uVig: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uBlur; uniform float uSat; uniform float uVig;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float amt = smoothstep(uBand, uBand + 0.38, abs(vUv.y - uFocus)) * uBlur;
      if (amt > 0.05) {
        vec4 acc = c;
        for (int i = 1; i < 16; i++) {
          float a = float(i) * 2.39996, r = sqrt(float(i) / 16.0);
          acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r * amt / uRes);
        }
        c = acc / 16.0;
      }
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      float d = length((vUv - 0.5) * vec2(1.2, 1.0));
      c.rgb *= mix(1.0, smoothstep(0.95, 0.35, d), uVig);
      gl_FragColor = c;
    }`,
});
composer.addPass(finish);
composer.addPass(new OutputPass());

function applyGfx(level, announce = false) {
  gfx = level;
  const dpr = Math.min(devicePixelRatio, level === 'alta' ? 2 : level === 'media' ? 1.5 : 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  finish.uniforms.uRes.value.set(innerWidth * dpr, innerHeight * dpr);
  gtao.enabled = level === 'alta';
  const size = level === 'baja' ? 1024 : 2048;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  const sel = document.getElementById('gfxSel');
  if (sel) sel.value = level;
  if (announce) news(`Calidad gráfica ajustada a «${GFX_LEVELS[level].toLowerCase()}» para que el juego vaya fluido.`, 'AJUSTES');
}
applyGfx(gfx);

// if frames are consistently slow, step quality down (unless the player picked it)
let perfTime = 0, perfFrames = 0, perfSlow = 0;
function watchPerformance(dt) {
  if (gfxChosen || gfx === 'baja') return;
  perfTime += dt; perfFrames++;
  if (perfTime < 2) return;
  const ms = (perfTime / perfFrames) * 1000;
  perfTime = 0; perfFrames = 0;
  perfSlow = ms > 30 ? perfSlow + 1 : 0;
  if (perfSlow >= 3) { perfSlow = 0; applyGfx(gfx === 'alta' ? 'media' : 'baja', true); }
}

// performance overlay (menu → Rendimiento): fps, frame time, draw calls and triangles
function setPerfVisible(v) { perfVisible = v; }
let perfVisible = (() => { try { return localStorage.getItem('urbania-perf') === '1'; } catch { return false; } })();
let perfAcc = 0, perfN = 0, perfLast = performance.now(), shadowFrame = 0;
function renderFrame() {
  renderer.info.reset();
  // shadows: every frame on high quality, every 2nd on medium, every 4th on low
  shadowFrame++;
  if (shadowFrame % (gfx === 'alta' ? 1 : gfx === 'media' ? 2 : 4) === 0) renderer.shadowMap.needsUpdate = true;
  sky.position.copy(camera.position);
  renderScene();
  const now = performance.now();
  perfAcc += now - perfLast; perfN++; perfLast = now;
  if (perfVisible && perfAcc > 500) {
    const ms = perfAcc / perfN, el = document.getElementById('perf');
    el.textContent = `${Math.round(1000 / ms)} FPS · ${ms.toFixed(1)} ms · ${renderer.info.render.calls} llamadas · ${(renderer.info.render.triangles / 1000).toFixed(0)}k triángulos · calidad ${GFX_LEVELS[gfx].toLowerCase()}`;
    perfAcc = 0; perfN = 0;
  }
}
function renderScene() {
  if (gfx === 'baja') { renderer.render(scene, camera); return; }
  // keep the focus band of the tilt-shift on the point the camera looks at
  const p = controls.target.clone().project(camera);
  finish.uniforms.uFocus.value = clamp(p.y * 0.5 + 0.5, 0.25, 0.75);
  const dist = camera.position.distanceTo(controls.target);
  finish.uniforms.uBlur.value = clamp(9 - dist / 10, 2.5, 7) * renderer.getPixelRatio();
  composer.render();
}

export { renderer, scene, SKY_DAY, SKY_DUSK, SKY_NIGHT, SKY_RAIN, TOP_DAY, TOP_DUSK, TOP_NIGHT, TOP_RAIN, camera, controls, hemi, sun, sky, terrainHeight, riverStrip, waterMat, cloudShapes, updateClouds, GFX_KEY, GFX_LEVELS, gfx, gfxChosen, composer, gtao, bloom, finish, applyGfx, perfTime, perfFrames, perfSlow, watchPerformance, setPerfVisible, perfVisible, perfAcc, perfN, perfLast, shadowFrame, renderFrame, renderScene };

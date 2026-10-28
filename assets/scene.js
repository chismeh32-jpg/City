// Urbania — renderer, camera, lights, sky, terrain, river, clouds, post-processing and graphics quality.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FX, bodyMat, glassMat, patchSurface, rng } from './buildings.js';
import { HW_Z, $, HALF, N, RIVER_W, clamp, el, hash, news, riverZ } from './config.js';
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

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 1600);
camera.position.set(24, 30, 34);
const controls = new MapControls(camera, renderer.domElement);
controls.target.set(0, 0, 3);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 7;
controls.maxDistance = 160;
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
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 260 }); // follows the view (game3d.js)
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.camera.layers.enable(1); // layer 1: invisible cloud shapes that only cast shadows
scene.add(hemi, sun, sun.target);

/* sky dome with a vertical gradient (horizon colour doubles as fog colour) */
// also: a glow around the sun, a sun disc, stars at night and a darker ground below the horizon
const skyUniforms = {
  top: { value: TOP_DAY.clone() }, horizon: { value: SKY_DAY.clone() }, ground: { value: new THREE.Color(0x5d7448) },
  sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(0xfff0d4) }, uNight: FX.uNight, uStars: { value: 1 },
};
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
  vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunCol; uniform float uNight; uniform float uStars;
    varying vec3 vDir;
    float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y, 0.0, 1.0);
      vec3 col = mix(horizon, top, smoothstep(0.0, 0.45, h));
      col = mix(col, ground, smoothstep(0.0, -0.12, d.y));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      col += sunCol * (pow(s, 8.0) * 0.25 + pow(s, 64.0) * 0.5) * (1.0 - uNight);
      col += sunCol * smoothstep(0.9993, 0.9996, s) * 2.0 * (1.0 - uNight);
      vec3 cell = floor(d * 260.0);
      float star = step(0.9965, hash3(cell)) * smoothstep(0.05, 0.3, d.y);
      col += vec3(0.9, 0.95, 1.0) * star * uNight * uStars * (0.5 + 0.5 * hash3(cell + 7.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);

/* terrain: flat where you build, rolling hills beyond the edge of the map, flat along the river */
function terrainHeight(x, z) {
  const edge = Math.max(Math.abs(x), Math.abs(z)) - (HALF + 2);
  if (edge <= 0) return 0;
  if (x < 0 && Math.abs(z - (HW_Z - HALF + 0.5)) < 4) return 0; // the motorway runs flat to the horizon
  const rz = riverZ(x + HALF) - HALF, river = clamp((Math.abs(z - rz) - RIVER_W - 1.5) / 6, 0, 1);
  const n = (Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) + Math.sin((x + z) * 0.05) * 0.8 + 1.8) / 3.6;
  return Math.pow(Math.min(edge / 12, 1), 1.5) * (0.8 + n * 5) * river;
}
{
  const G = N + 260, geo = new THREE.PlaneGeometry(G, G, 220, 220);
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
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  patchSurface(groundMat, 2.2);
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // a ring of distant low-poly mountains, softened by the fog
  const r = rng(77), mat = new THREE.MeshStandardMaterial({ color: 0x7d9a7a, roughness: 1, flatShading: true });
  for (let k = 0; k < 34; k++) {
    const ang = (k / 34) * Math.PI * 2 + r() * 0.15, dist = HALF + 95 + r() * 35, hgt = 12 + r() * 22;
    const m = new THREE.Mesh(new THREE.ConeGeometry(15 + r() * 14, hgt, 5 + Math.floor(r() * 3)), mat);
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
    tReflect: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflect: { value: 0 },
  }]),
  vertexShader: `varying vec2 vUv; varying vec3 vW; varying vec4 vRefl; uniform mat4 uReflMat;
    #include <fog_pars_vertex>
    void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vRefl = uReflMat * w;
      vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `uniform float uTime; uniform float uLight; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSun;
    uniform sampler2D tReflect; uniform float uReflect;
    varying vec2 vUv; varying vec3 vW; varying vec4 vRefl;
    #include <fog_pars_fragment>
    void main() {
      float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
      vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.8, across));
      float w1 = sin(vW.x * 2.3 + uTime * 1.1) * cos(vW.z * 3.1 - uTime * 0.8);
      float w2 = sin((vW.x + vW.z) * 5.7 - uTime * 1.9) * 0.5;
      vec3 n = normalize(vec3((w1 + w2) * 0.12, 1.0, (w1 - w2) * 0.12));
      vec3 v = normalize(cameraPosition - vW);
      float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      if (uReflect > 0.5) {
        // ultra: real mirror image of the city and sky, rippled by the waves
        vec4 rp = vRefl; rp.xy += n.xz * 0.9 * rp.w * 0.06;
        vec3 refl = texture2DProj(tReflect, rp).rgb;
        col = mix(col * 0.75, refl, 0.35 + 0.5 * fres);
      } else col = mix(col, uSky, fres * 0.6);
      float spec = pow(max(dot(reflect(-normalize(uSun), n), v), 0.0), 60.0);
      col += vec3(1.0, 0.95, 0.85) * spec * 1.4 * uLight;
      float foam = smoothstep(0.18, 0.0, across) * (0.5 + 0.5 * sin(vW.x * 6.0 + uTime * 2.0 + vW.z * 3.0));
      col = mix(col, vec3(0.92), foam * 0.35);
      gl_FragColor = vec4(col * (0.2 + 0.8 * uLight), 1.0);
      #include <fog_fragment>
    }`,
});
const water = riverStrip(RIVER_W + 0.1, 0.02, waterMat);

/* the motorway continues west beyond the map, towards the rest of the region */
{
  const len = 150, z = HW_Z - HALF + 0.5, x = -HALF - len / 2;
  const road = new THREE.Mesh(new THREE.BoxGeometry(len, 0.025, 1), new THREE.MeshStandardMaterial({ color: 0x4b4e56, roughness: 0.9 }));
  road.position.set(x, 0.0125, z);
  road.receiveShadow = true;
  const median = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: 0x8cc46a }));
  median.position.set(x, 0.02, z);
  scene.add(road, median);
}
const WATER_Y = 0.02;

/* drifting clouds that only cast soft moving shadows on the city */
const cloudShapes = [];
{
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const r = rng(321);
  for (let k = 0; k < 16; k++) {
    const g = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + r() * 2.5, 1), mat);
      m.position.set((r() - 0.5) * 6, 0, (r() - 0.5) * 4);
      m.castShadow = true;
      m.layers.set(1);
      g.add(m);
    }
    g.position.set((r() - 0.5) * (N + 60), 16 + r() * 4, (r() - 0.5) * (N + 60));
    scene.add(g);
    cloudShapes.push(g);
  }
}
function updateClouds(dt) {
  for (const g of cloudShapes) {
    g.position.x += dt * (S.speed ? 0.6 + S.speed * 0.3 : 0.15);
    if (g.position.x > HALF + 30) g.position.x = -HALF - 30;
  }
}

/* ---------------------------------------------------------------- post-processing & quality */
// ultra: alta + sky reflections, mirror river, surface grain, 4K shadows and colour grading (for desktop graphics cards)
// alta: ambient occlusion + bloom + tilt-shift · media: bloom + tilt-shift · baja: plain render
const GFX_KEY = 'urbania-gfx';
const GFX_LEVELS = { ultra: 'Ultra', alta: 'Alta', media: 'Media', baja: 'Baja' };
// a dedicated desktop graphics card (or the desktop app) starts on ultra
function strongGpu() {
  if (window.urbaniaDesktop) return true;
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    return /RTX|GTX (10[6-8]0|16[5-6]0)|Radeon RX ?[5-7]\d{3}|RX [5-9]\d{2,3}|Arc A[57]/i.test(name);
  } catch { return false; }
}
let gfx = (() => { try { return localStorage.getItem(GFX_KEY); } catch { return null; } })();
const gfxChosen = !!gfx;
if (!GFX_LEVELS[gfx]) gfx = matchMedia('(pointer: coarse)').matches ? 'media' : strongGpu() ? 'ultra' : 'alta';

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
    uBand: { value: 0.16 }, uBlur: { value: 4 }, uSat: { value: 1.08 }, uVig: { value: 0.35 }, uGrade: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uBlur; uniform float uSat; uniform float uVig; uniform float uGrade;
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
      if (uGrade > 0.0) {
        // ultra colour grade: gentle S-curve, cool shadows, warm highlights
        vec3 g = c.rgb / (1.0 + c.rgb);
        vec3 s = g * g * (3.0 - 2.0 * g);
        g = mix(g, s, 0.35);
        g += vec3(-0.012, 0.0, 0.02) * (1.0 - smoothstep(0.0, 0.45, l)) + vec3(0.022, 0.01, -0.016) * smoothstep(0.45, 1.0, l);
        c.rgb = mix(c.rgb, g / max(1.0 - g, vec3(0.001)), uGrade);
      }
      float d = length((vUv - 0.5) * vec2(1.2, 1.0));
      c.rgb *= mix(1.0, smoothstep(0.95, 0.35, d), uVig);
      gl_FragColor = c;
    }`,
});
composer.addPass(finish);
composer.addPass(new OutputPass());

/* ultra: image-based lighting from the current sky (refreshed every few seconds as the day turns) */
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
let envRT = null;
function envTexture() {
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0, 0.1, 200);
  return envRT.texture;
}
// timed in real seconds, so slow frames never leave a daytime sky lighting the night
let envStamp = performance.now();
function refreshEnvironment() {
  const now = performance.now();
  if (gfx !== 'ultra' || now - envStamp < 2000) return;
  envStamp = now;
  scene.environment = envTexture();
}

/* ultra: the river mirrors the city — the scene is drawn again from below the water into a texture */
const reflRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
const reflCam = new THREE.PerspectiveCamera();
const reflClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y)];
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
function renderReflection() {
  reflCam.copy(camera);
  reflCam.position.set(camera.position.x, 2 * WATER_Y - camera.position.y, camera.position.z);
  reflCam.up.set(0, 1, 0);
  reflCam.lookAt(controls.target.x, 2 * WATER_Y - controls.target.y, controls.target.z);
  reflCam.updateMatrixWorld();
  waterMat.uniforms.uReflMat.value.copy(BIAS).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
  waterMat.uniforms.tReflect.value = reflRT.texture;
  const prev = renderer.getRenderTarget();
  water.visible = false;
  sky.position.copy(reflCam.position);
  renderer.clippingPlanes = reflClip;
  renderer.setRenderTarget(reflRT);
  renderer.clear();
  renderer.render(scene, reflCam);
  renderer.setRenderTarget(prev);
  renderer.clippingPlanes = [];
  sky.position.copy(camera.position);
  water.visible = true;
}

function applyGfx(level, announce = false) {
  gfx = level;
  const ultra = level === 'ultra';
  const dpr = Math.min(devicePixelRatio, ultra || level === 'alta' ? 2 : level === 'media' ? 1.5 : 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);
  finish.uniforms.uRes.value.set(innerWidth * dpr, innerHeight * dpr);
  gtao.enabled = ultra || level === 'alta';
  gtao.updateGtaoMaterial({ samples: ultra ? 16 : 12, radius: ultra ? 0.45 : 0.35 });
  finish.uniforms.uGrade.value = ultra ? 1 : 0;
  FX.uDetail.value = ultra ? 1 : 0;
  waterMat.uniforms.uReflect.value = ultra ? 1 : 0;
  glassMat.metalness = ultra ? 0.45 : 0;
  bodyMat.envMapIntensity = 0.7;
  scene.environment = ultra ? envTexture() : null;
  reflRT.setSize(Math.round(innerWidth * dpr * 0.5), Math.round(innerHeight * dpr * 0.5));
  const size = ultra ? 4096 : level === 'baja' ? 1024 : 2048;
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
  if (perfSlow >= 3) { perfSlow = 0; applyGfx(gfx === 'ultra' ? 'alta' : gfx === 'alta' ? 'media' : 'baja', true); }
}

// performance overlay (menu → Rendimiento): fps, frame time, draw calls and triangles
function setPerfVisible(v) { perfVisible = v; }
let perfVisible = (() => { try { return localStorage.getItem('urbania-perf') === '1'; } catch { return false; } })();
let perfAcc = 0, perfN = 0, perfLast = performance.now(), shadowFrame = 0;
function renderFrame() {
  renderer.info.reset();
  // shadows: every frame on high quality, every 2nd on medium, every 4th on low
  shadowFrame++;
  if (shadowFrame % (gfx === 'ultra' || gfx === 'alta' ? 1 : gfx === 'media' ? 2 : 4) === 0) renderer.shadowMap.needsUpdate = true;
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
  if (gfx === 'ultra') renderReflection();
  composer.render();
}

export { skyUniforms, skyMat, water, WATER_Y, strongGpu, pmrem, envTexture, refreshEnvironment, envStamp, reflRT, renderReflection, renderer, scene, SKY_DAY, SKY_DUSK, SKY_NIGHT, SKY_RAIN, TOP_DAY, TOP_DUSK, TOP_NIGHT, TOP_RAIN, camera, controls, hemi, sun, sky, terrainHeight, riverStrip, waterMat, cloudShapes, updateClouds, GFX_KEY, GFX_LEVELS, gfx, gfxChosen, composer, gtao, bloom, finish, applyGfx, perfTime, perfFrames, perfSlow, watchPerformance, setPerfVisible, perfVisible, perfAcc, perfN, perfLast, shadowFrame, renderFrame, renderScene };

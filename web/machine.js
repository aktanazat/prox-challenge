// Stylized 3D view of the Vulcan OmniPro 220 with named hotspots.
// Exposes window.MachineView = { focus(spec), idle() } and fires
// 'machineview-ready' on document when the scene is up.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACCENT = 0xff6a00;

const container = document.getElementById('machine-canvas');

// ---------- machine dimensions (shared by geometry and panel texture) ----------

const W = 0.66, H = 0.85, D = 1.15;      // chassis extents
const BOTTOM = 0.03;                      // foot height
const CY = BOTTOM + H / 2;                // chassis center y
const FRONT = D / 2;                      // front face z
const PANEL_W = 0.56, PANEL_H = 0.48;
const PANEL_TOP = 0.84, PANEL_CY = PANEL_TOP - PANEL_H / 2;

// canvas uv (0..1, v from top) -> local xy on the front panel plane
function panelXY(u, v) {
  return { x: (u - 0.5) * PANEL_W, y: PANEL_TOP - v * PANEL_H };
}

// ---------- front panel texture: stylized always, photo overlay if it loads ----------

const panelCanvas = document.createElement('canvas');
panelCanvas.width = panelCanvas.height = 512;

function drawStylizedPanel() {
  const c = panelCanvas.getContext('2d');
  c.clearRect(0, 0, 512, 512);
  c.fillStyle = '#101114';
  c.fillRect(0, 0, 512, 512);
  c.strokeStyle = '#2a2e33';
  c.lineWidth = 3;
  c.strokeRect(6, 6, 500, 500);

  // wordmark
  c.fillStyle = '#ff6a00';
  c.font = '800 46px -apple-system, "Helvetica Neue", Arial, sans-serif';
  c.textBaseline = 'alphabetic';
  c.fillText('VULCAN', 26, 62);
  c.fillStyle = '#cfd2d6';
  c.font = '700 22px -apple-system, "Helvetica Neue", Arial, sans-serif';
  c.fillText('OMNIPRO 220', 27, 92);
  c.fillStyle = '#6f757c';
  c.font = '600 15px -apple-system, "Helvetica Neue", Arial, sans-serif';
  c.fillText('MULTIPROCESS · MIG / TIG / STICK', 27, 114);

  // LCD
  c.fillStyle = '#05070a';
  c.fillRect(140, 132, 232, 126);
  c.strokeStyle = '#3a4048';
  c.lineWidth = 2;
  c.strokeRect(140, 132, 232, 126);
  c.fillStyle = '#ff8a33';
  c.font = '600 17px ui-monospace, Menlo, monospace';
  c.fillText('MIG · FLUX 0.030', 154, 158);
  c.font = '700 42px ui-monospace, Menlo, monospace';
  c.fillText('120 A', 154, 208);
  c.fillStyle = '#ba5f14';
  c.font = '700 26px ui-monospace, Menlo, monospace';
  c.fillText('19.0 V', 154, 242);

  // knob dials (3D knobs sit over these)
  for (const kx of [140, 372]) {
    c.strokeStyle = '#3a4048';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(kx, 350, 62, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      c.beginPath();
      c.moveTo(kx + Math.cos(a) * 66, 350 + Math.sin(a) * 66);
      c.lineTo(kx + Math.cos(a) * 74, 350 + Math.sin(a) * 74);
      c.strokeStyle = i === 10 ? '#ff6a00' : '#4a5058';
      c.lineWidth = 2;
      c.stroke();
    }
  }
  c.fillStyle = '#9aa0a6';
  c.font = '700 16px -apple-system, "Helvetica Neue", Arial, sans-serif';
  c.textAlign = 'center';
  c.fillText('WIRE SPEED', 140, 448);
  c.fillText('VOLTAGE', 372, 448);
  c.fillStyle = '#6f757c';
  c.font = '600 14px ui-monospace, Menlo, monospace';
  c.fillText('DUTY CYCLE 30% @ 220 A', 256, 488);
  c.textAlign = 'left';
}

drawStylizedPanel();
const panelTexture = new THREE.CanvasTexture(panelCanvas);
panelTexture.colorSpace = THREE.SRGBColorSpace;
panelTexture.anisotropy = 4;

// ---------- scene ----------

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (err) {
  const note = document.createElement('p');
  note.style.cssText = 'padding:24px;font-size:12px;color:#6f757c;font-family:monospace';
  note.textContent = 'WebGL unavailable — machine view disabled.';
  container.appendChild(note);
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 30);
const HOME_POS = new THREE.Vector3(1.35, 0.95, 1.85);
const HOME_TARGET = new THREE.Vector3(0, 0.45, 0);
camera.position.copy(HOME_POS);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.45;
controls.maxDistance = 5;
controls.maxPolarAngle = Math.PI * 0.55;
controls.autoRotate = !REDUCED;
controls.autoRotateSpeed = 0.7;

scene.add(new THREE.HemisphereLight(0x8896a4, 0x0b0c0e, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(2, 3, 2.5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xaabbc8, 0.4);
rim.position.set(-2.5, 1.5, -1.5);
scene.add(rim);
const glow = new THREE.PointLight(ACCENT, 0.3, 5);
glow.position.set(-1.4, 0.8, 1.2);
scene.add(glow);

// floor
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(2.4, 48),
  new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.002;
scene.add(floor);
const grid = new THREE.GridHelper(4.8, 24, 0x2a2e34, 0x17191d);
grid.position.y = 0.001;
scene.add(grid);

// ---------- machine ----------

const machine = new THREE.Group();
scene.add(machine);

const steel = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.55, metalness: 0.35 });
const darker = new THREE.MeshStandardMaterial({ color: 0x101215, roughness: 0.7, metalness: 0.2 });
const recess = new THREE.MeshStandardMaterial({ color: 0x0c0e10, roughness: 0.85, metalness: 0.1 });
const orange = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.45, metalness: 0.15 });
const brass = new THREE.MeshStandardMaterial({ color: 0xa97142, roughness: 0.35, metalness: 0.75 });
const copper = new THREE.MeshStandardMaterial({ color: 0x9c6b3d, roughness: 0.5, metalness: 0.6 });

// chassis
const chassis = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.04), steel);
chassis.position.y = CY;
machine.add(chassis);

// feet
for (const [fx, fz] of [[-0.26, -0.5], [0.26, -0.5], [-0.26, 0.5], [0.26, 0.5]]) {
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, BOTTOM, 0.08), darker);
  foot.position.set(fx, BOTTOM / 2, fz);
  machine.add(foot);
}

// handle
for (const hz of [-0.28, 0.28]) {
  const riser = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.1, 0.06, 2, 0.015), darker);
  riser.position.set(0, BOTTOM + H + 0.02, hz);
  machine.add(riser);
}
const bar = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.05, 0.68, 2, 0.02), darker);
bar.position.set(0, BOTTOM + H + 0.085, 0);
machine.add(bar);

// front panel (self-lit instrument face)
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(PANEL_W, PANEL_H),
  new THREE.MeshBasicMaterial({ map: panelTexture })
);
panel.position.set(0, PANEL_CY, FRONT + 0.003);
machine.add(panel);

// knobs over the drawn dials (hidden if the product photo texture takes over)
const knobs = new THREE.Group();
for (const u of [140 / 512, 372 / 512]) {
  const { x, y } = panelXY(u, 350 / 512);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.055, 0.045, 24), orange);
  knob.rotation.x = Math.PI / 2;
  knob.position.set(x, y, FRONT + 0.026);
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.036, 0.012), darker);
  pointer.position.set(x, y + 0.026, FRONT + 0.045);
  knobs.add(knob, pointer);
}
machine.add(knobs);

// dinse sockets on the lower front
function makeSocket(x, ringColor) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.048, 0.014, 12, 32),
    new THREE.MeshStandardMaterial({ color: ringColor, roughness: 0.5, metalness: 0.4 })
  );
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 20), brass);
  pin.rotation.x = Math.PI / 2;
  pin.position.z = 0.01;
  g.add(ring, pin);
  g.position.set(x, 0.16, FRONT + 0.005);
  machine.add(g);
  return g;
}
makeSocket(0.16, 0x7a2a24);   // positive: dark red collar
makeSocket(-0.16, 0x22262b);  // negative: black collar

// +/- labels above the sockets
function polarityLabel(text, x) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfd2d6';
  ctx.font = '700 44px -apple-system, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.05, 0.05),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  m.position.set(x, 0.245, FRONT + 0.004);
  machine.add(m);
}
polarityLabel('+', 0.16);
polarityLabel('−', -0.16);

// power switch, lower right front
const switchBase = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.02), darker);
switchBase.position.set(0.24, 0.14, FRONT + 0.008);
machine.add(switchBase);
const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.02), orange);
rocker.position.set(0.24, 0.145, FRONT + 0.02);
rocker.rotation.x = -0.18;
machine.add(rocker);

// gas inlet on the rear
const inletNut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 6), brass);
inletNut.rotation.x = Math.PI / 2;
inletNut.position.set(0.17, 0.68, -FRONT - 0.015);
machine.add(inletNut);
const inletStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 16), brass);
inletStem.rotation.x = Math.PI / 2;
inletStem.position.set(0.17, 0.68, -FRONT - 0.04);
machine.add(inletStem);

// wire-feed bay, open on the left side
const SIDE = -W / 2;
const bay = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.62), recess);
bay.rotation.y = -Math.PI / 2;
bay.position.set(SIDE - 0.0015, 0.49, 0.2);
machine.add(bay);

// spool: two flanges + wire drum + hub
const spoolGroup = new THREE.Group();
for (const off of [-0.033, 0.033]) {
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.012, 36), darker);
  flange.rotation.z = Math.PI / 2;
  flange.position.x = off;
  spoolGroup.add(flange);
}
const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.054, 36), copper);
drum.rotation.z = Math.PI / 2;
spoolGroup.add(drum);
const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.075, 20), orange);
hub.rotation.z = Math.PI / 2;
spoolGroup.add(hub);
spoolGroup.position.set(SIDE - 0.045, 0.5, 0.12);
machine.add(spoolGroup);

// drive block + tension knob
const drive = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.1, 0.12, 2, 0.01), darker);
drive.position.set(SIDE - 0.04, 0.48, 0.42);
machine.add(drive);
const tension = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 20), orange);
tension.rotation.z = Math.PI / 2;
tension.position.set(SIDE - 0.04, 0.62, 0.42);
machine.add(tension);
const tensionStem = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 12), darker);
tensionStem.rotation.z = Math.PI / 2;
tensionStem.position.set(SIDE - 0.02, 0.62, 0.42);
machine.add(tensionStem);

// wire run from spool to drive
(function wireRun() {
  const a = new THREE.Vector3(SIDE - 0.045, 0.615, 0.13);
  const b = new THREE.Vector3(SIDE - 0.04, 0.53, 0.4);
  const dir = b.clone().sub(a);
  const wire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, dir.length(), 8),
    copper
  );
  wire.position.copy(a).addScaledVector(dir, 0.5);
  wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  machine.add(wire);
})();

// polarity terminals inside the bay
for (const tz of [0.28, 0.38]) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.045, 14), brass);
  post.rotation.z = Math.PI / 2;
  post.position.set(SIDE - 0.02, 0.28, tz);
  machine.add(post);
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.02, 0.006, 8, 20),
    new THREE.MeshStandardMaterial({ color: tz > 0.33 ? 0x7a2a24 : 0x22262b, roughness: 0.5 })
  );
  collar.rotation.y = Math.PI / 2;
  collar.position.set(SIDE - 0.045, 0.28, tz);
  machine.add(collar);
}

// ghost wordmark + vents on the right side
(function sideDecal() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(233,235,237,0.09)';
  ctx.font = '800 118px -apple-system, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('VULCAN', 22, 130);
  ctx.fillStyle = 'rgba(255,106,0,0.5)';
  ctx.fillRect(24, 152, 180, 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(330, 180 + i * 12);
    ctx.lineTo(490, 180 + i * 12);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.46),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  m.rotation.y = Math.PI / 2;
  m.position.set(W / 2 + 0.002, 0.52, 0);
  machine.add(m);
})();

// optional photo texture for the front panel; falls back to the drawn panel
if (new URLSearchParams(location.search).get('nophoto') !== '1') {
  const img = new Image();
  img.onload = () => {
    const c = panelCanvas.getContext('2d');
    // crop the front-panel region of the product shot (upper-right of frame)
    c.fillStyle = '#101114';
    c.fillRect(0, 0, 512, 512);
    c.drawImage(img, img.width * 0.46, img.height * 0.2, img.width * 0.4, img.height * 0.34, 0, 0, 512, 512);
    c.fillStyle = 'rgba(8,9,11,0.22)';
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = '#2a2e33';
    c.lineWidth = 4;
    c.strokeRect(4, 4, 504, 504);
    panelTexture.needsUpdate = true;
    knobs.visible = false; // the photo has its own knobs
  };
  img.src = '/product.webp';
}

// ---------- hotspots ----------

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function makeRing(radius) {
  return new THREE.Mesh(
    new THREE.RingGeometry(radius, radius * 1.22, 48),
    new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthTest: false
    })
  );
}

function makeLabelSprite(text, primary) {
  const pad = 26;
  const font = (primary ? 44 : 34) + 'px -apple-system, "Helvetica Neue", Arial, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '700 ' + font;
  const tw = Math.ceil(measure.measureText(text.toUpperCase()).width);
  const cw = Math.min(1024, tw + pad * 2);
  const ch = primary ? 92 : 74;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(10,11,13,0.94)';
  ctx.beginPath();
  ctx.roundRect(1, 1, cw - 2, ch - 2, 10);
  ctx.fill();
  ctx.strokeStyle = primary ? '#ff6a00' : '#3a4048';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = primary ? '#ffffff' : '#cfd2d6';
  ctx.font = '700 ' + font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), cw / 2, ch / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const h = primary ? 0.085 : 0.066;
  sprite.scale.set(h * (cw / ch), h, 1);
  sprite.renderOrder = 999;
  return sprite;
}

const HOTSPOT_DEFS = [
  { id: 'front-panel',        pos: [0, 0.6, 0.58],        n: [0, 0, 1],        view: [0.25, 0.18, 1],  dist: 1.15, r: 0.13, label: 'Front panel' },
  { id: 'socket-positive',    pos: [0.16, 0.16, 0.6],     n: [0, 0, 1],        view: [0.3, -0.02, 1],  dist: 0.8,  r: 0.07, label: 'Positive socket (+)' },
  { id: 'socket-negative',    pos: [-0.16, 0.16, 0.6],    n: [0, 0, 1],        view: [-0.3, -0.02, 1], dist: 0.8,  r: 0.07, label: 'Negative socket (−)' },
  { id: 'polarity-terminals', pos: [-0.36, 0.28, 0.33],   n: [-1, 0, 0],       view: [-1, 0.18, 0.45], dist: 0.95, r: 0.08, label: 'Polarity terminals' },
  { id: 'wire-feed',          pos: [-0.37, 0.48, 0.42],   n: [-1, 0, 0],       view: [-1, 0.25, 0.5],  dist: 1.05, r: 0.08, label: 'Wire feed drive' },
  { id: 'tension-knob',       pos: [-0.37, 0.62, 0.42],   n: [-1, 0, 0],       view: [-1, 0.3, 0.4],   dist: 0.9,  r: 0.06, label: 'Tension knob' },
  { id: 'spool',              pos: [-0.38, 0.5, 0.12],    n: [-1, 0, 0],       view: [-1, 0.25, 0.2],  dist: 1.1,  r: 0.13, label: 'Wire spool' },
  { id: 'power-switch',       pos: [0.24, 0.14, 0.6],     n: [0, 0, 1],        view: [0.45, 0, 1],     dist: 0.8,  r: 0.07, label: 'Power switch' },
  { id: 'gas-inlet',          pos: [0.17, 0.68, -0.6],    n: [0, 0, -1],       view: [0.4, 0.3, -1],   dist: 0.95, r: 0.06, label: 'Gas inlet' }
];

const hotspots = new Map();
for (const def of HOTSPOT_DEFS) {
  const group = new THREE.Group();
  group.position.fromArray(def.pos);
  const normal = new THREE.Vector3().fromArray(def.n).normalize();
  const ring = makeRing(def.r);
  ring.quaternion.setFromUnitVectors(Z, normal);
  ring.visible = false;
  ring.renderOrder = 998;
  group.add(ring);
  machine.add(group);
  hotspots.set(def.id, {
    id: def.id,
    group,
    ring,
    normal,
    view: new THREE.Vector3().fromArray(def.view).normalize(),
    dist: def.dist,
    label: def.label,
    sprite: null
  });
}

const active = new Set();

function activate(h, text, primary, tier = 0) {
  h.ring.visible = true;
  h.ring.material.opacity = primary ? 0.9 : 0.5;
  if (h.sprite) h.group.remove(h.sprite);
  h.sprite = makeLabelSprite(text, primary);
  // narrow canvases get proportionally smaller labels so they stay in frame
  h.sprite.scale.multiplyScalar(Math.min(1, Math.max(0.55, camera.aspect / 2)));
  // annotations stagger upward so labels on the same face never overlap
  h.sprite.position.copy(h.normal).multiplyScalar(0.06)
    .add(UP.clone().multiplyScalar(0.13 + tier * 0.08));
  h.group.add(h.sprite);
  active.add(h);
}

function clearHighlights() {
  for (const h of active) {
    h.ring.visible = false;
    h.ring.scale.setScalar(1);
    if (h.sprite) {
      h.group.remove(h.sprite);
      h.sprite.material.map.dispose();
      h.sprite.material.dispose();
      h.sprite = null;
    }
  }
  active.clear();
}

// ---------- camera tween ----------

let tween = null;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function tweenCamera(toPos, toTarget) {
  if (REDUCED) {
    camera.position.copy(toPos);
    controls.target.copy(toTarget);
    return;
  }
  tween = {
    start: performance.now(),
    dur: 800,
    fromPos: camera.position.clone(),
    toPos,
    fromTarget: controls.target.clone(),
    toTarget
  };
}

function updateTween(now) {
  if (!tween) return;
  const t = Math.min(1, (now - tween.start) / tween.dur);
  const k = easeInOutCubic(t);
  camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
  if (t >= 1) tween = null;
}

// ---------- public API ----------

let idleMode = true;

function focus(spec) {
  if (!spec || typeof spec !== 'object' || typeof spec.target !== 'string') return false;
  const known = hotspots.get(spec.target);
  const anchor = known || hotspots.get('front-panel');
  if (!known) console.warn('MachineView: unknown target', spec.target);

  clearHighlights();
  idleMode = false;
  controls.autoRotate = false;
  activate(anchor, typeof spec.label === 'string' && spec.label ? spec.label : anchor.label, true);

  if (Array.isArray(spec.annotations)) {
    let tier = 0;
    for (const a of spec.annotations) {
      if (!a || typeof a.target !== 'string') continue;
      const h = hotspots.get(a.target);
      if (h && h !== anchor) {
        tier += 1;
        activate(h, typeof a.text === 'string' && a.text ? a.text : h.label, false, tier);
      }
    }
  }

  const worldPos = anchor.group.getWorldPosition(new THREE.Vector3());
  // aim slightly above the anchor so labels staggered upward stay in frame;
  // narrow (portrait) canvases need extra distance so labels fit horizontally
  const aspectComp = Math.min(1.8, Math.max(1, 1.9 / camera.aspect));
  const aim = worldPos.clone().add(UP.clone().multiplyScalar(0.09));
  tweenCamera(aim.clone().addScaledVector(anchor.view, anchor.dist * aspectComp), aim);
  return known !== undefined;
}

function idle() {
  clearHighlights();
  idleMode = true;
  controls.autoRotate = !REDUCED;
  tweenCamera(HOME_POS.clone(), HOME_TARGET.clone());
}

window.MachineView = { focus, idle };
document.dispatchEvent(new CustomEvent('machineview-ready'));

// ---------- interaction pauses the idle orbit ----------

let resumeTimer = 0;
controls.addEventListener('start', () => {
  tween = null;
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
});
controls.addEventListener('end', () => {
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    if (idleMode) controls.autoRotate = !REDUCED;
  }, 8000);
});

// ---------- sizing & render loop ----------

let paused = false;

function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w < 10 || h < 10) {
    paused = true;
    return;
  }
  paused = false;
  renderer.setSize(w, h); // updates canvas CSS size too; buffer scales by DPR
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);
resize();

renderer.setAnimationLoop((now) => {
  if (paused) return;
  updateTween(now);
  controls.update();
  if (!REDUCED && active.size > 0) {
    const phase = 0.5 + 0.5 * Math.sin(now / 250);
    for (const h of active) {
      h.ring.scale.setScalar(1 + 0.25 * phase);
      h.ring.material.opacity = 0.95 - 0.55 * phase;
    }
  }
  renderer.render(scene, camera);
});

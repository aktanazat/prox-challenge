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

// Draws the instrument face. With no state it renders the factory defaults;
// with a live panel state it renders process/voltage/LCD fields, the note and
// the knob captions, plus an optional orange sweep band (sweepK 0..1).
function drawStylizedPanel(state, sweepK) {
  const c = panelCanvas.getContext('2d');
  const clip = (t, maxW) => {
    t = String(t);
    if (c.measureText(t).width <= maxW) return t;
    while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  };
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
  if (!state) {
    c.fillStyle = '#ff8a33';
    c.font = '600 17px ui-monospace, Menlo, monospace';
    c.fillText('MIG · FLUX 0.030', 154, 158);
    c.font = '700 42px ui-monospace, Menlo, monospace';
    c.fillText('120 A', 154, 208);
    c.fillStyle = '#ba5f14';
    c.font = '700 26px ui-monospace, Menlo, monospace';
    c.fillText('19.0 V', 154, 242);
  } else {
    c.fillStyle = '#ff8a33';
    c.font = '700 19px ui-monospace, Menlo, monospace';
    c.fillText(clip([state.process, state.voltage].filter(Boolean).join(' · '), 204), 154, 160);
    let fy = 185;
    for (const key of ['thickness', 'wire', 'material']) {
      c.font = '600 12px ui-monospace, Menlo, monospace';
      c.fillStyle = '#ba5f14';
      c.fillText(key.toUpperCase(), 154, fy);
      c.font = '600 15px ui-monospace, Menlo, monospace';
      c.fillStyle = '#ff8a33';
      c.textAlign = 'right';
      c.fillText(clip(state.lcd[key], 108), 358, fy);
      c.textAlign = 'left';
      fy += 20;
    }
    if (state.note) {
      c.font = '600 11px ui-monospace, Menlo, monospace';
      c.fillStyle = '#ba5f14';
      const words = String(state.note).split(/\s+/);
      const lines = [''];
      for (const w of words) {
        const probe = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
        if (c.measureText(probe).width <= 204) lines[lines.length - 1] = probe;
        else if (lines.length < 2) lines.push(w);
        else { lines[1] = clip(`${lines[1]} ${w}`, 204); break; }
      }
      lines.forEach((ln, i) => ln && c.fillText(ln, 154, 242 + i * 13));
    }
  }
  // update sweep: a soft band wipes across the LCD as new state lands
  if (state && typeof sweepK === 'number' && sweepK < 1) {
    c.save();
    c.beginPath();
    c.rect(141, 133, 230, 124);
    c.clip();
    const x = 130 + sweepK * 260;
    const g = c.createLinearGradient(x - 60, 0, x, 0);
    g.addColorStop(0, 'rgba(255,138,51,0)');
    g.addColorStop(1, 'rgba(255,138,51,0.38)');
    c.fillStyle = g;
    c.fillRect(x - 60, 133, 60, 124);
    c.restore();
  }

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
  c.fillText(clip(state ? state['knob-left'].label.toUpperCase() : 'WIRE SPEED', 150), 140, 448);
  c.fillText(clip(state ? state['knob-right'].label.toUpperCase() : 'VOLTAGE', 150), 372, 448);
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
const bayFill = new THREE.DirectionalLight(0x8896a4, 0.45);
bayFill.position.set(-3, 1.2, 1.8);
scene.add(bayFill);
const glow = new THREE.PointLight(ACCENT, 0.3, 5);
glow.position.set(-1.4, 0.8, 1.2);
scene.add(glow);
// soft key light that tracks the camera subject while the tutorial hand works;
// intensity ramps in the render loop so dark bay/side framings stay legible
const stepLight = new THREE.PointLight(0xdfe6ee, 0, 3.5, 1.6);
scene.add(stepLight);

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
// each knob is a named rotatable group so tutorials can spin it about the panel normal
const knobs = new THREE.Group();
const panelKnobs = new Map();
for (const [kid, u] of [['knob-left', 140 / 512], ['knob-right', 372 / 512]]) {
  const { x, y } = panelXY(u, 350 / 512);
  const g = new THREE.Group();
  g.position.set(x, y, FRONT + 0.026);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.055, 0.045, 24), orange);
  knob.rotation.x = Math.PI / 2;
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.036, 0.012), darker);
  pointer.position.set(0, 0.026, 0.019);
  g.add(knob, pointer);
  knobs.add(g);
  panelKnobs.set(kid, g);
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
// tension knob spins about its x axis; a ridge on the face makes rotation legible
const tensionGroup = new THREE.Group();
tensionGroup.position.set(SIDE - 0.04, 0.62, 0.42);
const tension = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 20), orange);
tension.rotation.z = Math.PI / 2;
const tensionRidge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.042), darker);
tensionRidge.position.set(-0.028, 0.012, 0);
tensionGroup.add(tension, tensionRidge);
machine.add(tensionGroup);
const tensionStem = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 12), darker);
tensionStem.rotation.z = Math.PI / 2;
tensionStem.position.set(SIDE - 0.02, 0.62, 0.42);
machine.add(tensionStem);

// wire run: spline from the spool over both feed guides into the drive.
// Draw range is animatable so the `thread` verb can reveal it progressively.
const wireCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(SIDE - 0.045, 0.615, 0.13),
  new THREE.Vector3(SIDE - 0.052, 0.596, 0.22),
  new THREE.Vector3(SIDE - 0.052, 0.565, 0.30),
  new THREE.Vector3(SIDE - 0.046, 0.545, 0.36),
  new THREE.Vector3(SIDE - 0.04, 0.53, 0.40)
]);
const WIRE_SEGS = 48;
const wireMesh = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, WIRE_SEGS, 0.006, 8, false), copper);
machine.add(wireMesh);
const WIRE_IDX = wireMesh.geometry.index.count / WIRE_SEGS; // indices per tubular segment
function setWireRatio(r) {
  const segs = Math.round(WIRE_SEGS * Math.max(0, Math.min(1, r)));
  wireMesh.visible = segs > 0;
  wireMesh.geometry.setDrawRange(0, segs * WIRE_IDX);
}
// feed guides the wire passes through
for (const t of [0.42, 0.72]) {
  const p = wireCurve.getPoint(t);
  const guide = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.005, 8, 18), darker);
  guide.rotation.x = Math.PI / 2;
  guide.rotation.z = Math.PI / 2;
  guide.position.copy(p);
  machine.add(guide);
}

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

// polarity jumper: lug eye + short cable stub, relocatable between the two lugs
const JUMPER_LUGS = {
  positive: new THREE.Vector3(SIDE - 0.058, 0.28, 0.38),
  negative: new THREE.Vector3(SIDE - 0.058, 0.28, 0.28)
};
const jumperGroup = new THREE.Group();
{
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.007, 8, 20), brass);
  eye.rotation.y = Math.PI / 2;
  const stub = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.02, 0),
      new THREE.Vector3(-0.015, -0.055, -0.02),
      new THREE.Vector3(-0.01, -0.085, -0.055)
    ]), 12, 0.007, 8, false),
    darker
  );
  jumperGroup.add(eye, stub);
  jumperGroup.position.copy(JUMPER_LUGS.positive);
  machine.add(jumperGroup);
}

// side panel: feed-bay cover hinged on the rear vertical edge. HOME is open
// (swung back) so the bay, spool and feed hotspots read exactly as before.
const sidePanelPivot = new THREE.Group();
sidePanelPivot.position.set(SIDE - 0.005, 0.49, -0.15);
const SIDE_PANEL_OPEN = -2.35;
const SIDE_PANEL_CLOSED = 0;
{
  const cover = new THREE.Mesh(new RoundedBoxGeometry(0.105, 0.62, 0.72, 2, 0.02), steel);
  cover.position.set(-0.058, 0, 0.36);
  const covDecal = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.2, 0.03), orange);
  covDecal.position.set(-0.113, 0.18, 0.55);
  const covHandle = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.09, 0.028, 2, 0.008), darker);
  covHandle.position.set(-0.115, -0.1, 0.62);
  sidePanelPivot.add(cover, covDecal, covHandle);
  sidePanelPivot.rotation.y = SIDE_PANEL_OPEN;
  machine.add(sidePanelPivot);
}

// gun-lead bulkhead between the dinse sockets (where the MIG gun lead lands)
const gunBulkhead = new THREE.Group();
{
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.011, 10, 24), darker);
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 16), brass);
  bore.rotation.x = Math.PI / 2;
  gunBulkhead.add(collar, bore);
  gunBulkhead.position.set(0, 0.16, FRONT + 0.005);
  machine.add(gunBulkhead);
}

// cable connectors (DINSE plugs + tube-stub cables), parked on the floor in
// front of the machine until a tutorial seats them
const rubber = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.9, metalness: 0.05 });
function makeConnector(gripLen) {
  const g = new THREE.Group();
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.05, 18), brass);
  pin.rotation.x = Math.PI / 2;
  pin.position.z = -0.028;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.031, gripLen, 18), rubber);
  grip.rotation.x = Math.PI / 2;
  grip.position.z = gripLen / 2 - 0.003;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.0295, 0.004, 8, 20), orange);
  band.position.z = gripLen - 0.02;
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, gripLen - 0.005),
      new THREE.Vector3(0.01, -0.012, gripLen + 0.07),
      new THREE.Vector3(-0.015, -0.028, gripLen + 0.16),
      new THREE.Vector3(0.005, -0.032, gripLen + 0.24)
    ]), 20, 0.011, 8, false),
    rubber
  );
  g.add(pin, grip, band, cable);
  machine.add(g);
  return g;
}
const connectorGround = makeConnector(0.07);
const connectorElectrode = makeConnector(0.07);
const connectorGun = makeConnector(0.085);

// stub MIG torch parked bottom-right; carries the nozzle + contact tip
const TORCH_AXIS = new THREE.Vector3(0, 0.7, -0.714).normalize();
const TORCH_HEAD = new THREE.Vector3(0.55, 0.098, 0.837);
const qTorch = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), TORCH_AXIS);
const nozzle = new THREE.Group();
const contactTip = new THREE.Group();
{
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.023, 0.13, 16), rubber);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.55, 0.024, 0.96);
  machine.add(handle);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.03), orange);
  trigger.position.set(0.55, 0.012, 0.93);
  machine.add(trigger);
  const neck = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.55, 0.028, 0.9),
      new THREE.Vector3(0.55, 0.035, 0.875),
      new THREE.Vector3(0.55, 0.062, 0.872),
      TORCH_HEAD.clone()
    ]), 16, 0.011, 10, false),
    steel
  );
  machine.add(neck);
  const tipMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.05, 10), brass);
  contactTip.add(tipMesh);
  machine.add(contactTip);
  const nozzleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.014, 0.062, 16), copper);
  const nozzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0035, 8, 18), orange);
  nozzleRing.rotation.x = Math.PI / 2;
  nozzleRing.position.y = 0.028;
  nozzle.add(nozzleMesh, nozzleRing);
  machine.add(nozzle);
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
    if (panelStateActive) return; // the settings twin owns the panel texture now
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
  setHover(null); // programmatic camera moves invalidate any stationary hover
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

  // a machine-view artifact arriving mid-tutorial pauses it (resume in player)
  pauseTutorial('machine-view');

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
  pauseTutorial('machine-view');
  clearHighlights();
  idleMode = true;
  controls.autoRotate = !REDUCED;
  tweenCamera(HOME_POS.clone(), HOME_TARGET.clone());
}

/* ================= 3D guided tutorials ================= */
// A tutorial artifact (application/vnd.vulcan.tutorial) drives a stylized
// welding-glove hand through a frozen verb vocabulary. Scene mutations are
// pure functions of (state, action); scrubbing instant-replays them so
// prev/next/replay always land in a deterministic state.

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const CANCEL = Symbol('tutorial-cancel');

// ---------- micro tween engine (driven by the render loop) ----------

const anims = new Set();

function updateAnims(now) {
  for (const a of anims) {
    const t = Math.min(1, (now - a.start) / a.dur);
    a.update(easeInOutCubic(t), t);
    if (t >= 1) {
      anims.delete(a);
      a.resolve();
    }
  }
}

function animate(dur, update) {
  return new Promise((resolve) => {
    if (REDUCED || dur <= 16) {
      update(1, 1);
      resolve();
      return;
    }
    anims.add({ start: performance.now(), dur, update, resolve });
  });
}

function cancelAnims() {
  for (const a of anims) a.resolve(); // resolve without a final update
  anims.clear();
}

// ---------- welding-glove hand rig ----------
// Procedural: rounded-box palm, capsule finger segments, cylinder cuff.
// Fingers extend along local +z, palm faces -y; lookAt() aims the fingers.

const HAND_PARK = V3(1.05, 0.09, 1.28);
const leather = new THREE.MeshStandardMaterial({
  color: 0x3d342b, roughness: 0.8, metalness: 0.05, transparent: true, opacity: 0.9
});
const cuffMat = new THREE.MeshStandardMaterial({
  color: ACCENT, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.9
});

const hand = new THREE.Group();
const fingers = [];
let thumb = null;
const gripAnchor = new THREE.Group();

{
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.05, 16), cuffMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = -0.075;
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.068, 0.028, 0.082, 2, 0.011), leather);
  palm.position.z = -0.008;
  const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.004, 0.01), cuffMat);
  stitch.position.set(0, 0.015, -0.032);
  hand.add(cuff, palm, stitch);

  function fingerSeg(r, len) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), leather);
    m.rotation.x = Math.PI / 2;
    m.position.z = len / 2 + r * 0.4;
    return m;
  }
  // index, middle, ring, pinky
  for (const fx of [-0.024, -0.008, 0.008, 0.024]) {
    const j1 = new THREE.Group();
    j1.position.set(fx, 0.004, 0.03);
    j1.add(fingerSeg(0.0075, 0.024));
    const j2 = new THREE.Group();
    j2.position.z = 0.032;
    j2.add(fingerSeg(0.007, 0.018));
    j1.add(j2);
    hand.add(j1);
    fingers.push({ j1, j2 });
  }
  const tj1 = new THREE.Group();
  tj1.position.set(-0.036, -0.004, 0.006);
  tj1.rotation.y = -0.9;
  tj1.add(fingerSeg(0.0085, 0.02));
  const tj2 = new THREE.Group();
  tj2.position.z = 0.03;
  tj2.add(fingerSeg(0.008, 0.014));
  tj1.add(tj2);
  hand.add(tj1);
  thumb = { j1: tj1, j2: tj2 };

  gripAnchor.position.set(0, -0.026, 0.045);
  hand.add(gripAnchor);
  // small work light ahead of the palm so fingers read on near-black steel
  const handLamp = new THREE.PointLight(0xffc9a0, 0.7, 0.9, 2);
  handLamp.position.set(0, 0.11, 0.09);
  hand.add(handLamp);
  hand.scale.setScalar(1.3);
  hand.position.copy(HAND_PARK);
  scene.add(hand);
}

const POSE_DEFS = {
  relaxed: { main: [0.45, 0.5], index: [0.45, 0.5], thumb: [0.35, 0.3] },
  point:   { main: [1.25, 1.3], index: [0.05, 0.04], thumb: [0.7, 0.5] },
  grip:    { main: [1.05, 1.15], index: [1.0, 1.1], thumb: [0.85, 0.6] }
};

function poseValues(name) {
  const p = POSE_DEFS[name] || POSE_DEFS.relaxed;
  return { f: [p.index, p.main, p.main, p.main], t: p.thumb };
}

function capturePose() {
  return {
    f: fingers.map((fg) => [fg.j1.rotation.x, fg.j2.rotation.x]),
    t: [thumb.j1.rotation.x, thumb.j2.rotation.x]
  };
}

function applyPose(v) {
  fingers.forEach((fg, i) => {
    fg.j1.rotation.x = v.f[i][0];
    fg.j2.rotation.x = v.f[i][1];
  });
  thumb.j1.rotation.x = v.t[0];
  thumb.j2.rotation.x = v.t[1];
}

function lerpPose(a, b, k) {
  const l = (x, y) => x + (y - x) * k;
  return {
    f: a.f.map((p, i) => [l(p[0], b.f[i][0]), l(p[1], b.f[i][1])]),
    t: [l(a.t[0], b.t[0]), l(a.t[1], b.t[1])]
  };
}

let handParked = true;

// eased cubic path with a lifted midpoint; blends the pose while moving
async function moveHand(to, look, poseName, dur, token) {
  handParked = false;
  const from = hand.position.clone();
  const qFrom = hand.quaternion.clone();
  hand.position.copy(to);
  hand.lookAt(look);
  const qTo = hand.quaternion.clone();
  hand.position.copy(from);
  hand.quaternion.copy(qFrom);
  const mid = from.clone().lerp(to, 0.5);
  mid.y += Math.min(0.09, from.distanceTo(to) * 0.25);
  const p0 = capturePose();
  const p1 = poseValues(poseName);
  await animate((dur * 1000) / tut.speed, (k) => {
    const a = from.clone().lerp(mid, k);
    hand.position.copy(a.lerp(mid.clone().lerp(to, k), k));
    hand.quaternion.slerpQuaternions(qFrom, qTo, k);
    applyPose(lerpPose(p0, p1, k));
  });
  if (token) token.check();
}

function parkHandInstant() {
  hand.position.copy(HAND_PARK);
  hand.lookAt(V3(0, 0.5, 0));
  applyPose(poseValues('relaxed'));
  handParked = true;
}

function updateHand(now) {
  if (!handParked || REDUCED) return;
  hand.position.y = HAND_PARK.y + Math.sin(now / 1400) * 0.008;
  hand.position.x = HAND_PARK.x + Math.sin(now / 2300) * 0.006;
}

// ---------- movable-part registry, seats, transforms ----------

const qId = new THREE.Quaternion();
const qYaw = (y) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, y, 0));
const qLie = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));

const PARTS = new Map();
function regPart(id, obj, free, opts = {}) {
  PARTS.set(id, { id, obj, free, spin: opts.spin || 'z', approach: opts.approach || V3(0, 0.8, 0.55).normalize(), seatHome: opts.seatHome || null });
}

regPart('connector-ground', connectorGround, { pos: V3(0.34, 0.036, 0.92), quat: qYaw(2.7) });
regPart('connector-electrode', connectorElectrode, { pos: V3(0.52, 0.036, 0.64), quat: qYaw(2.2) });
regPart('connector-gun', connectorGun, { pos: V3(0.14, 0.038, 1.05), quat: qYaw(3.4) });
regPart('nozzle', nozzle, { pos: V3(0.66, 0.021, 0.74), quat: qLie }, {
  spin: 'y',
  seatHome: { pos: TORCH_HEAD.clone().addScaledVector(TORCH_AXIS, 0.035), quat: qTorch.clone() }
});
regPart('contact-tip', contactTip, { pos: V3(0.72, 0.007, 0.7), quat: qLie }, {
  spin: 'y',
  seatHome: { pos: TORCH_HEAD.clone().addScaledVector(TORCH_AXIS, 0.045), quat: qTorch.clone() }
});

const SEATS = {
  'socket-positive': { pos: V3(0.16, 0.16, FRONT + 0.033), quat: qId, normal: V3(0, 0, 1) },
  'socket-negative': { pos: V3(-0.16, 0.16, FRONT + 0.033), quat: qId, normal: V3(0, 0, 1) },
  'wire-feed':       { pos: V3(0, 0.16, FRONT + 0.033), quat: qId, normal: V3(0, 0, 1) }
};

function canonSeat(name, pid) {
  if (typeof name !== 'string') return null;
  if (name === 'gun-bulkhead') return 'wire-feed';
  if (SEATS[name]) return name;
  if (name === 'torch' && PARTS.get(pid)?.seatHome) return 'torch';
  return null;
}

function seatTransform(pid, seatId) {
  if (seatId === 'torch') return PARTS.get(pid).seatHome;
  return SEATS[seatId] || null;
}

function seatNormal(seatId, pid) {
  if (seatId === 'torch') return TORCH_AXIS.clone();
  return (SEATS[seatId]?.normal || V3(0, 0, 1)).clone();
}

function resolveLug(name, cur) {
  if (typeof name === 'string') {
    if (/pos|\+|red/i.test(name)) return 'positive';
    if (/neg|-|−|black/i.test(name)) return 'negative';
  }
  return cur === 'positive' ? 'negative' : 'positive';
}

// pointable positions for parts that are not free-moving meshes
function pointablePos(id) {
  if (hotspots.has(id)) {
    const h = hotspots.get(id);
    return { pos: h.group.getWorldPosition(new THREE.Vector3()), dir: h.normal.clone() };
  }
  if (PARTS.has(id)) {
    return { pos: PARTS.get(id).obj.getWorldPosition(new THREE.Vector3()), dir: approachFor(id) };
  }
  if (panelKnobs.has(id)) return { pos: panelKnobs.get(id).getWorldPosition(new THREE.Vector3()), dir: V3(0, 0, 1) };
  if (id === 'tension-knob') return { pos: tensionGroup.getWorldPosition(new THREE.Vector3()), dir: V3(-1, 0, 0) };
  if (id === 'power-switch') return { pos: rocker.getWorldPosition(new THREE.Vector3()), dir: V3(0, 0, 1) };
  if (id === 'side-panel') return { pos: panelHandleWorld(), dir: panelOutwardNormal() };
  if (id === 'wire') return { pos: wireCurve.getPoint(0.5).clone(), dir: V3(-1, 0.2, 0).normalize() };
  if (id === 'polarity-jumper') return { pos: jumperGroup.getWorldPosition(new THREE.Vector3()), dir: V3(-1, 0.35, 0.2).normalize() };
  return null;
}

function panelHandleWorld() {
  return V3(-0.115, -0.1, 0.62)
    .applyAxisAngle(UP, sidePanelPivot.rotation.y)
    .add(sidePanelPivot.position);
}

function panelOutwardNormal() {
  return V3(-1, 0, 0).applyAxisAngle(UP, sidePanelPivot.rotation.y);
}

function approachFor(pid) {
  const seatId = tut.live?.seats?.[pid];
  if (seatId) return seatNormal(seatId, pid);
  return PARTS.get(pid).approach.clone();
}

// ---------- step state: pure reducer + instant scene application ----------

function defaultState() {
  return {
    seats: {
      'connector-ground': null, 'connector-electrode': null, 'connector-gun': null,
      nozzle: 'torch', 'contact-tip': 'torch'
    },
    knobs: { 'knob-left': 0, 'knob-right': 0, 'tension-knob': 0 },
    power: false,
    panelOpen: true,
    wire: 1,
    jumper: 'positive'
  };
}

const KNOB_AXES = { 'knob-left': ['z', -1], 'knob-right': ['z', -1], 'tension-knob': ['x', 1] };

function knobObj(kid) {
  return panelKnobs.get(kid) || (kid === 'tension-knob' ? tensionGroup : null);
}

function applyAction(s, a) {
  switch (a.verb) {
    case 'insert': {
      const seatId = canonSeat(a.into, a.part);
      if (seatId && s.seats[a.part] !== undefined) s.seats[a.part] = seatId;
      break;
    }
    case 'remove':
      if (s.seats[a.part] !== undefined) s.seats[a.part] = null;
      break;
    case 'rotate': {
      if (!(a.part in s.knobs)) break;
      const deg = Math.min(360, Math.max(10, Math.abs(Number(a.degrees)) || 90));
      const [, cwSign] = KNOB_AXES[a.part];
      const sign = a.direction === 'ccw' ? -cwSign : cwSign;
      s.knobs[a.part] += sign * (deg * Math.PI) / 180;
      break;
    }
    case 'press':
      if (a.part === 'power-switch') s.power = !s.power;
      break;
    case 'thread':
      s.wire = 1;
      break;
    case 'open':
      if (a.part === 'side-panel') s.panelOpen = true;
      break;
    case 'close':
      if (a.part === 'side-panel') s.panelOpen = false;
      break;
    case 'move':
      if (a.part === 'polarity-jumper') s.jumper = resolveLug(a.to, s.jumper);
      break;
  }
  return s;
}

// The baseline is inferred from the script so first-touch verbs are visible:
// a script that opens the panel starts with it closed, one that threads the
// wire starts unthreaded, one that removes a plug starts with it seated.
function baselineFor(steps) {
  const base = defaultState();
  const seen = { panel: false, wire: false, jumper: false, seats: {} };
  for (const step of steps) {
    for (const a of step.actions) {
      if ((a.verb === 'open' || a.verb === 'close') && a.part === 'side-panel' && !seen.panel) {
        seen.panel = true;
        if (a.verb === 'open') base.panelOpen = false;
      } else if (a.verb === 'thread' && !seen.wire) {
        seen.wire = true;
        base.wire = 0;
      } else if (a.verb === 'move' && a.part === 'polarity-jumper' && !seen.jumper) {
        seen.jumper = true;
        base.jumper = resolveLug(a.to, base.jumper) === 'positive' ? 'negative' : 'positive';
      } else if (a.part && base.seats[a.part] !== undefined && !seen.seats[a.part]) {
        if (a.verb === 'grab' || a.verb === 'insert') seen.seats[a.part] = true;
        else if (a.verb === 'remove' || a.verb === 'twist') {
          seen.seats[a.part] = true;
          const from = canonSeat(a.from ?? a.into, a.part);
          base.seats[a.part] = from || base.seats[a.part] || (PARTS.get(a.part)?.seatHome ? 'torch' : 'socket-positive');
        }
      }
    }
  }
  return base;
}

function computeStates(steps) {
  const clone = (s) => JSON.parse(JSON.stringify(s));
  const states = [baselineFor(steps)];
  for (const step of steps) {
    const s = clone(states[states.length - 1]);
    for (const a of step.actions) applyAction(s, a);
    states.push(s);
  }
  return states;
}

function setTransform(obj, tr) {
  machine.add(obj); // reparent (may be on the hand); transform is set fresh
  obj.position.copy(tr.pos);
  obj.quaternion.copy(tr.quat);
}

function applyState(s, keepHand = false) {
  clearHighlights();
  heldPart = null;
  for (const [pid, seatId] of Object.entries(s.seats)) {
    const p = PARTS.get(pid);
    if (!p) continue;
    setTransform(p.obj, seatId ? seatTransform(pid, seatId) : p.free);
  }
  for (const [kid, val] of Object.entries(s.knobs)) {
    const obj = knobObj(kid);
    if (obj) obj.rotation[KNOB_AXES[kid][0]] = val;
  }
  rocker.rotation.x = s.power ? 0.18 : -0.18;
  sidePanelPivot.rotation.y = s.panelOpen ? SIDE_PANEL_OPEN : SIDE_PANEL_CLOSED;
  setWireRatio(s.wire);
  jumperGroup.position.copy(JUMPER_LUGS[s.jumper]);
  if (!keepHand) parkHandInstant();
}

// ---------- verb runners ----------

let heldPart = null;

function warnSkip(what, a) {
  console.warn(`tutorial: ${what}`, a);
}

async function grabPart(pid, token) {
  const p = PARTS.get(pid);
  const pos = p.obj.getWorldPosition(new THREE.Vector3());
  const dir = approachFor(pid);
  await moveHand(hoverPoint(pos, dir, 0.14), pos, 'point', 0.5, token);
  await moveHand(hoverPoint(pos, dir, 0.085), pos, 'grip', 0.3, token);
  gripAnchor.attach(p.obj);
  heldPart = pid;
}

async function releaseHand(fromPos, dir, token) {
  const back = hoverPoint(fromPos, dir, 0.2).add(V3(0, 0.04, 0));
  await moveHand(back, fromPos, 'relaxed', 0.3, token);
}

// hover points are biased toward screen-right/below so the glove approaches
// at an angle instead of hiding itself along the camera axis
function hoverPoint(pos, dir, dist) {
  const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
  const biased = dir.clone().addScaledVector(right, 0.55).addScaledVector(UP, -0.28).normalize();
  return pos.clone().addScaledVector(biased, dist);
}

const RUNNERS = {
  async point(a, token) {
    const at = pointablePos(a.target) || pointablePos(a.part) || pointablePos('front-panel');
    if (!pointablePos(a.target) && !pointablePos(a.part)) warnSkip('point falling back to front-panel', a);
    await moveHand(
      hoverPoint(at.pos, at.dir, 0.15),
      at.pos, 'point', 0.55, token
    );
    await animate(1000 / tut.speed, () => {});
    token.check();
  },

  async grab(a, token) {
    if (!PARTS.has(a.part)) return warnSkip('unknown part for grab', a);
    await grabPart(a.part, token);
  },

  async insert(a, token) {
    if (!PARTS.has(a.part)) return warnSkip('unknown part for insert', a);
    const seatId = canonSeat(a.into, a.part) || (PARTS.get(a.part).seatHome ? 'torch' : null);
    if (!seatId) return warnSkip('unknown socket for insert', a);
    if (heldPart !== a.part) await grabPart(a.part, token);
    const p = PARTS.get(a.part);
    const seat = seatTransform(a.part, seatId);
    const n = seatNormal(seatId, a.part);
    const hover = hoverPoint(seat.pos, n, 0.17);
    await moveHand(hover, seat.pos, 'grip', 0.55, token);
    machine.attach(p.obj);
    heldPart = null;
    const twist = a.twist === 'cw' ? Math.PI / 2 : a.twist === 'ccw' ? -Math.PI / 2 : 0;
    const spin = p.spin === 'y' ? V3(0, 1, 0) : V3(0, 0, 1);
    // seat rotated by the twist offset, then twist home — so the animated end
    // state is byte-identical to the scrubbed state
    const qSeat0 = twist
      ? seat.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(spin, twist))
      : seat.quat;
    const p0 = p.obj.position.clone();
    const q0 = p.obj.quaternion.clone();
    const handSeat = hoverPoint(seat.pos, n, 0.1);
    await animate(320 / tut.speed, (k) => {
      p.obj.position.lerpVectors(p0, seat.pos, k);
      p.obj.quaternion.slerpQuaternions(q0, qSeat0, k);
      hand.position.lerpVectors(hover, handSeat, k);
    });
    token.check();
    if (twist) {
      const hq = hand.quaternion.clone();
      await animate(400 / tut.speed, (k) => {
        p.obj.quaternion.slerpQuaternions(qSeat0, seat.quat, k);
        hand.quaternion.copy(hq).multiply(
          new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), -twist * 0.6 * Math.sin(k * Math.PI))
        );
      });
      token.check();
    }
    if (tut.live) applyAction(tut.live, a);
    await releaseHand(seat.pos, n, token);
  },

  async remove(a, token) {
    if (!PARTS.has(a.part)) return warnSkip('unknown part for remove', a);
    const p = PARTS.get(a.part);
    const seatId = tut.live?.seats?.[a.part];
    if (!seatId) return warnSkip('part not seated, skipping remove', a);
    const n = seatNormal(seatId, a.part);
    const pos = p.obj.getWorldPosition(new THREE.Vector3());
    await moveHand(hoverPoint(pos, n, 0.13), pos, 'point', 0.45, token);
    await moveHand(hoverPoint(pos, n, 0.085), pos, 'grip', 0.25, token);
    gripAnchor.attach(p.obj);
    const pull = hand.position.clone().addScaledVector(n, 0.18);
    await moveHand(pull, pull.clone().sub(n), 'grip', 0.3, token);
    const free = p.free;
    await moveHand(free.pos.clone().add(V3(0, 0.12, 0)), free.pos, 'grip', 0.55, token);
    machine.attach(p.obj);
    const p0 = p.obj.position.clone();
    const q0 = p.obj.quaternion.clone();
    await animate(220 / tut.speed, (k) => {
      p.obj.position.lerpVectors(p0, free.pos, k);
      p.obj.quaternion.slerpQuaternions(q0, free.quat, k);
    });
    token.check();
    heldPart = null;
    if (tut.live) applyAction(tut.live, a);
    await releaseHand(free.pos, V3(0, 1, 0), token);
  },

  async twist(a, token) {
    if (!PARTS.has(a.part)) return warnSkip('unknown part for twist', a);
    const p = PARTS.get(a.part);
    const pos = p.obj.getWorldPosition(new THREE.Vector3());
    const dir = approachFor(a.part);
    await moveHand(hoverPoint(pos, dir, 0.09), pos, 'grip', 0.5, token);
    const amp = (a.direction === 'ccw' ? -1 : 1) * 0.5;
    const spin = p.spin === 'y' ? V3(0, 1, 0) : V3(0, 0, 1);
    const q0 = p.obj.quaternion.clone();
    const hq = hand.quaternion.clone();
    await animate(600 / tut.speed, (k) => {
      const ang = Math.sin(k * Math.PI) * amp; // wiggle, settling back seated
      p.obj.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromAxisAngle(spin, ang));
      hand.quaternion.copy(hq).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), ang * 0.7));
    });
    token.check();
    await releaseHand(pos, dir, token);
  },

  async rotate(a, token) {
    const obj = knobObj(a.part);
    if (!obj || !tut.live) return warnSkip('unknown knob for rotate', a);
    const [axis] = KNOB_AXES[a.part];
    const at = pointablePos(a.part);
    await moveHand(hoverPoint(at.pos, at.dir, 0.12), at.pos, 'point', 0.45, token);
    await moveHand(hoverPoint(at.pos, at.dir, 0.08), at.pos, 'grip', 0.2, token);
    const from = tut.live.knobs[a.part];
    applyAction(tut.live, a);
    const to = tut.live.knobs[a.part];
    const hq = hand.quaternion.clone();
    await animate(620 / tut.speed, (k) => {
      obj.rotation[axis] = from + (to - from) * k;
      hand.quaternion.copy(hq).multiply(
        new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), (to - from) * 0.35 * Math.sin(k * Math.PI))
      );
    });
    token.check();
    await releaseHand(at.pos, at.dir, token);
  },

  async press(a, token) {
    const at = pointablePos(a.part) || pointablePos(a.target);
    if (!at) return warnSkip('unknown part for press', a);
    await moveHand(hoverPoint(at.pos, at.dir, 0.13), at.pos, 'point', 0.45, token);
    const base = hand.position.clone();
    const isPower = a.part === 'power-switch';
    const r0 = rocker.rotation.x;
    const r1 = isPower ? (tut.live && !tut.live.power ? 0.18 : -0.18) : r0;
    await animate(360 / tut.speed, (k) => {
      hand.position.copy(base).addScaledVector(at.dir, -0.045 * Math.sin(k * Math.PI));
      if (isPower && k > 0.45) rocker.rotation.x = r1;
    });
    token.check();
    if (isPower && tut.live) applyAction(tut.live, a);
    await animate(220 / tut.speed, () => {});
    token.check();
  },

  async thread(a, token) {
    if (a.part && a.part !== 'wire') warnSkip('thread expects part "wire"', a);
    const start = wireCurve.getPoint(0);
    await moveHand(start.clone().add(V3(-0.1, 0.04, 0)), start, 'point', 0.5, token);
    await animate(1300 / tut.speed, (k) => {
      setWireRatio(k);
      const pt = wireCurve.getPoint(k);
      hand.position.copy(pt).add(V3(-0.1, 0.035, 0));
      hand.lookAt(pt);
    });
    token.check();
    if (tut.live) applyAction(tut.live, a);
  },

  async open(a, token) { await swingPanel(a, true, token); },
  async close(a, token) { await swingPanel(a, false, token); },

  async move(a, token) {
    if (a.part !== 'polarity-jumper') return warnSkip('move supports polarity-jumper only', a);
    const dir = V3(-1, 0.35, 0.2).normalize();
    const pos = jumperGroup.getWorldPosition(new THREE.Vector3());
    await moveHand(hoverPoint(pos, dir, 0.12), pos, 'point', 0.45, token);
    await moveHand(hoverPoint(pos, dir, 0.075), pos, 'grip', 0.2, token);
    gripAnchor.attach(jumperGroup);
    applyAction(tut.live || {}, a);
    const dest = JUMPER_LUGS[tut.live ? tut.live.jumper : resolveLug(a.to, 'positive')];
    await moveHand(hoverPoint(dest, dir, 0.075), dest, 'grip', 0.5, token);
    machine.attach(jumperGroup);
    const p0 = jumperGroup.position.clone();
    await animate(180 / tut.speed, (k) => {
      jumperGroup.position.lerpVectors(p0, dest, k);
      jumperGroup.quaternion.slerp(qId, k);
    });
    token.check();
    await releaseHand(dest, dir, token);
  },

  async highlight(a, token) {
    const h = hotspots.get(a.target);
    if (!h) return warnSkip('unknown target for highlight', a);
    activate(h, h.label, true);
    await animate(1000 / tut.speed, () => {});
    token.check();
  },

  async wait(a, token) {
    const ms = Math.min(2000, Math.max(0, Number(a.ms) || 0));
    await animate(ms / tut.speed, () => {});
    token.check();
  }
};

async function swingPanel(a, open, token) {
  if (a.part && a.part !== 'side-panel') return warnSkip('open/close supports side-panel only', a);
  if (tut.live && tut.live.panelOpen === open) {
    return RUNNERS.point({ target: 'wire-feed' }, token); // already there: gesture at it
  }
  let hp = panelHandleWorld();
  await moveHand(hoverPoint(hp, panelOutwardNormal(), 0.11), hp, 'grip', 0.5, token);
  const r0 = sidePanelPivot.rotation.y;
  const r1 = open ? SIDE_PANEL_OPEN : SIDE_PANEL_CLOSED;
  await animate(780 / tut.speed, (k) => {
    sidePanelPivot.rotation.y = r0 + (r1 - r0) * k;
    hp = panelHandleWorld();
    hand.position.copy(hoverPoint(hp, panelOutwardNormal(), 0.11));
    hand.lookAt(hp);
  });
  token.check();
  if (tut.live) applyAction(tut.live, a);
  await releaseHand(hp, panelOutwardNormal(), token);
}

async function runAction(a, token) {
  const fn = RUNNERS[a.verb] || RUNNERS.point;
  try {
    await fn(a, token);
  } catch (e) {
    if (e === CANCEL) throw e;
    console.warn('tutorial: action failed, continuing', a, e);
  }
}

// ---------- script validation (never break the demo) ----------

function normAction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const a = {};
  for (const k of ['verb', 'part', 'target', 'into', 'from', 'to', 'twist', 'direction']) {
    if (typeof raw[k] === 'string') a[k] = raw[k];
  }
  if (raw.degrees !== undefined) a.degrees = Number(raw.degrees);
  if (raw.ms !== undefined) a.ms = Number(raw.ms);
  if (!a.verb || !RUNNERS[a.verb]) {
    console.warn('tutorial: unknown verb, degrading to point', raw);
    return { verb: 'point', target: a.target || a.into || a.part || 'front-panel', part: a.part };
  }
  return a;
}

function normStep(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    caption: typeof raw.caption === 'string' ? raw.caption.slice(0, 160) : '',
    cite: typeof raw.cite === 'string' ? raw.cite : null,
    camera: raw.camera && typeof raw.camera === 'object' && typeof raw.camera.target === 'string'
      ? raw.camera.target : null,
    actions: (Array.isArray(raw.actions) ? raw.actions : []).slice(0, 5).map(normAction).filter(Boolean)
  };
}

// ---------- camera move without labels (tutorial steps) ----------

function viewTarget(tid, opts = {}) {
  const h = hotspots.get(tid);
  if (!h) {
    if (tid) console.warn('tutorial: unknown camera target', tid);
    return false;
  }
  idleMode = false;
  controls.autoRotate = false;
  const worldPos = h.group.getWorldPosition(new THREE.Vector3());
  const aspectComp = Math.min(1.8, Math.max(1, 1.9 / camera.aspect));
  const dist = h.dist * aspectComp * (opts.bias ? 1.18 : 1);
  const aim = worldPos.clone().add(UP.clone().multiplyScalar(0.05));
  const camPos = aim.clone().addScaledVector(h.view, dist);
  if (opts.bias) {
    // tutorial framing: subject in the upper-left two-thirds with surrounding
    // geometry visible — pan the aim toward screen-right/down, lift the camera
    const right = aim.clone().sub(camPos).normalize().cross(UP).normalize();
    aim.addScaledVector(right, 0.14 * dist).addScaledVector(UP, -0.05 * dist);
    camPos.addScaledVector(UP, 0.1 * dist);
  }
  tweenCamera(camPos, aim);
  return true;
}

// ---------- tutorial player ----------

const tut = {
  script: null,
  states: [],
  step: 0,
  live: null,
  playing: false,
  ended: false,
  speed: 1,
  token: null,
  pausedBy: null
};

const playerEl = document.getElementById('tutorial-player');
const tpEls = playerEl ? {
  title: document.getElementById('tp-title'),
  step: document.getElementById('tp-step'),
  caption: document.getElementById('tp-caption'),
  prev: document.getElementById('tp-prev'),
  play: document.getElementById('tp-play'),
  next: document.getElementById('tp-next'),
  replay: document.getElementById('tp-replay'),
  speed: document.getElementById('tp-speed'),
  note: document.getElementById('tp-note'),
  end: document.getElementById('tp-end')
} : null;

function newToken() {
  return {
    cancelled: false,
    check() { if (this.cancelled) throw CANCEL; }
  };
}

function cancelRun() {
  if (tut.token) tut.token.cancelled = true;
  tut.token = null;
  cancelAnims();
}

function emitTutState() {
  document.dispatchEvent(new CustomEvent('vulcan:tutorial-state', {
    detail: {
      title: tut.script?.title || '',
      step: tut.step + 1,
      total: tut.script?.steps.length || 0,
      playing: tut.playing,
      ended: tut.ended,
      pausedBy: tut.pausedBy
    }
  }));
}

function showCaption(i, silent = false) {
  if (!tpEls || !tut.script) return;
  const step = tut.script.steps[i];
  if (!step) return;
  tpEls.caption.textContent = step.caption + (step.cite ? ` [${step.cite}]` : '');
  if (window.VulcanCite) window.VulcanCite.linkify(tpEls.caption);
  if (silent) return;
  document.dispatchEvent(new CustomEvent('vulcan:tutorial-caption', {
    detail: { caption: step.caption, cite: step.cite }
  }));
}

function updatePlayerUI() {
  if (!tpEls || !tut.script) return;
  const total = tut.script.steps.length;
  tpEls.title.textContent = tut.script.title;
  tpEls.title.title = tut.script.intro || '';
  tpEls.step.textContent = `${Math.min(tut.step + 1, total)} / ${total}`;
  tpEls.play.setAttribute('aria-label', tut.playing ? 'Pause tutorial' : 'Play tutorial');
  tpEls.play.setAttribute('aria-pressed', String(tut.playing));
  tpEls.play.classList.toggle('is-playing', tut.playing);
  tpEls.speed.textContent = tut.speed === 1 ? '1×' : '1.5×';
  tpEls.note.hidden = tut.pausedBy !== 'machine-view' && tut.pausedBy !== 'panel-state';
  if (tut.pausedBy === 'machine-view') {
    tpEls.note.textContent = 'Paused — machine view active. Press play to resume.';
  } else if (tut.pausedBy === 'panel-state') {
    tpEls.note.textContent = 'Paused — panel settings updated. Press play to resume.';
  }
  tpEls.end.hidden = !tut.ended;
  tpEls.prev.disabled = tut.step <= 0 && !tut.ended;
  tpEls.next.disabled = tut.step >= total - 1 && !tut.ended;
}

async function runStep(i, token) {
  const step = tut.script.steps[i];
  tut.step = i;
  tut.live = JSON.parse(JSON.stringify(tut.states[i]));
  applyState(tut.states[i], true); // hand flows between steps; parts snap
  showCaption(i);
  updatePlayerUI();
  emitTutState();
  if (step.camera && viewTarget(step.camera, { bias: true })) {
    await animate(750 / tut.speed, () => {});
    token.check();
  }
  for (const a of step.actions) {
    token.check();
    await runAction(a, token);
  }
}

async function playFrom(i) {
  cancelRun();
  const token = newToken();
  tut.token = token;
  tut.playing = true;
  tut.ended = false;
  tut.pausedBy = null;
  try {
    for (let s = i; s < tut.script.steps.length; s++) {
      await runStep(s, token);
      token.check();
      await animate(600, () => {}); // inter-step gap (fixed per contract)
      token.check();
    }
    finishTutorial();
  } catch (e) {
    if (e !== CANCEL) console.warn('tutorial: run aborted', e);
  }
}

function finishTutorial() {
  tut.playing = false;
  tut.ended = true;
  tut.token = null;
  tut.step = tut.script.steps.length - 1;
  if (tpEls) {
    tpEls.caption.textContent = 'Tutorial complete.';
    updatePlayerUI();
  }
  emitTutState();
  moveHand(HAND_PARK, V3(0, 0.5, 0), 'relaxed', 0.6).then(() => { handParked = true; });
}

function pauseTutorial(reason) {
  if (!tut.script || !tut.playing) return;
  cancelRun();
  tut.playing = false;
  tut.pausedBy = reason;
  applyState(tut.states[tut.step]); // snap to the step's deterministic pre-state
  showCaption(tut.step, true);
  updatePlayerUI();
  emitTutState();
}

function gotoStep(i, andPlay) {
  if (!tut.script) return;
  const total = tut.script.steps.length;
  i = Math.max(0, Math.min(total - 1, i));
  cancelRun();
  tut.ended = false;
  tut.pausedBy = null;
  tut.step = i;
  if (andPlay && !REDUCED) {
    playFrom(i);
  } else {
    tut.playing = false;
    // reduced motion shows the step's RESULT; a paused scrub shows its start
    applyState(REDUCED ? tut.states[i + 1] : tut.states[i]);
    tut.live = JSON.parse(JSON.stringify(tut.states[i]));
    showCaption(i);
    const step = tut.script.steps[i];
    if (step.camera) viewTarget(step.camera, { bias: true });
    if (REDUCED) {
      for (const a of step.actions) {
        if (a.verb === 'highlight' && hotspots.has(a.target)) {
          activate(hotspots.get(a.target), hotspots.get(a.target).label, true);
        }
      }
    }
    updatePlayerUI();
    emitTutState();
  }
}

function tutorial(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.steps)) return false;
  const steps = json.steps.slice(0, 12).map(normStep).filter(Boolean);
  if (!steps.length) return false;
  cancelRun();
  tut.script = {
    title: typeof json.title === 'string' && json.title ? json.title.slice(0, 80) : 'Guided tutorial',
    intro: typeof json.intro === 'string' ? json.intro : '',
    steps
  };
  tut.states = computeStates(steps);
  tut.ended = false;
  tut.pausedBy = null;
  idleMode = false;
  controls.autoRotate = false;
  if (playerEl) {
    playerEl.hidden = false;
    tpEls.end.hidden = true;
  }
  if (REDUCED) {
    tut.playing = false;
    gotoStep(0, false);
  } else {
    playFrom(0);
  }
  return true;
}

if (tpEls) {
  tpEls.prev.addEventListener('click', () => gotoStep(tut.step - 1, tut.playing));
  tpEls.next.addEventListener('click', () => gotoStep(tut.step + 1, tut.playing));
  tpEls.play.addEventListener('click', () => {
    if (!tut.script) return;
    if (tut.playing) pauseTutorial('user');
    else if (REDUCED) gotoStep(tut.step, false);
    else playFrom(tut.ended ? 0 : tut.step);
  });
  tpEls.replay.addEventListener('click', () => gotoStep(tut.step, !REDUCED));
  tpEls.speed.addEventListener('click', () => {
    tut.speed = tut.speed === 1 ? 1.5 : 1;
    updatePlayerUI();
  });
  tpEls.end.addEventListener('click', () => {
    if (REDUCED) gotoStep(0, false);
    else playFrom(0);
  });
  playerEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); gotoStep(tut.step - 1, tut.playing); }
    if (e.key === 'ArrowRight') { e.preventDefault(); gotoStep(tut.step + 1, tut.playing); }
  });
}

// place every movable part at its home transform, deterministically
applyState(defaultState());

window.MachineView = { focus, idle, tutorial, panelState, flash };
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

/* ================= panel-state settings twin ================= */
// application/vnd.vulcan.panel-state artifacts re-render the LCD texture,
// spin the panel knobs to plausible positions and float value tags beside
// them. Partial specs merge into the current state; unknown fields drop.

const livePanel = {
  process: 'MIG', voltage: '240V',
  lcd: { thickness: '1/8 in', wire: '0.030 in', material: 'Steel' },
  'knob-left': { label: 'Wire Speed', value: '' },
  'knob-right': { label: 'Voltage', value: '' },
  note: ''
};
let panelStateActive = false;
const knobTags = new Map();

function cleanStr(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function mergePanelSpec(spec) {
  for (const k of ['process', 'voltage', 'note']) {
    const v = cleanStr(spec[k]);
    if (v !== null) livePanel[k] = v;
  }
  if (spec.lcd && typeof spec.lcd === 'object') {
    for (const k of ['thickness', 'wire', 'material']) {
      const v = cleanStr(spec.lcd[k]);
      if (v !== null) livePanel.lcd[k] = v;
    }
  }
  for (const kid of ['knob-left', 'knob-right']) {
    const src = spec[kid];
    if (!src || typeof src !== 'object') continue;
    const label = cleanStr(src.label);
    const value = cleanStr(src.value);
    if (label !== null) livePanel[kid].label = label;
    if (value !== null) livePanel[kid].value = value;
  }
}

// plausible dial fraction for a value string: a leading number maps by its
// decimal magnitude, anything else hashes deterministically into mid-sweep
function knobFrac(value) {
  const n = parseFloat(String(value).replace(/[^0-9.]+/g, ' '));
  if (Number.isFinite(n) && n > 0) {
    const mag = Math.pow(10, Math.ceil(Math.log10(n + 1)));
    return Math.min(0.92, Math.max(0.08, n / mag));
  }
  let h = 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 0.25 + (h % 512) / 1024;
}

function setKnobTag(kid, text) {
  const old = knobTags.get(kid);
  if (old) {
    machine.remove(old);
    old.material.map.dispose();
    old.material.dispose();
    knobTags.delete(kid);
  }
  const g = panelKnobs.get(kid);
  if (!g || !text) return;
  const tag = makeLabelSprite(text, false);
  tag.scale.multiplyScalar(0.8);
  tag.position.copy(g.position).add(V3(0, -0.135, 0.05));
  machine.add(tag);
  knobTags.set(kid, tag);
}

function panelState(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return false;
  mergePanelSpec(spec);
  panelStateActive = true;
  knobs.visible = true; // reclaim the dials from the photo overlay
  pauseTutorial('panel-state');
  clearHighlights();
  viewTarget('front-panel');
  for (const kid of ['knob-left', 'knob-right']) {
    const g = panelKnobs.get(kid);
    const value = livePanel[kid].value;
    setKnobTag(kid, value);
    if (!g || !value) continue;
    // drawn dial sweep is 270° with the pointer up at mid-sweep
    const to = (0.5 - knobFrac(value)) * Math.PI * 1.5;
    const from = g.rotation.z;
    animate(600, (k) => { g.rotation.z = from + (to - from) * k; });
  }
  const draw = (k) => {
    drawStylizedPanel(livePanel, k);
    panelTexture.needsUpdate = true;
  };
  animate(700, draw).then(() => draw(1)); // cancelled sweeps still settle clean
  return true;
}

/* ================= ask-by-touching: raycast hotspots ================= */

const raycaster = new THREE.Raycaster();
const ndcVec = new THREE.Vector2();
const worldVec = new THREE.Vector3();
const hitMeshes = [];
{
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  for (const def of HOTSPOT_DEFS) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(Math.max(def.r * 1.35, 0.075), 12, 8), hitMat);
    mesh.userData.hotspotId = def.id;
    hotspots.get(def.id).group.add(mesh);
    hitMeshes.push(mesh);
  }
}

function pickHotspot(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  ndcVec.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndcVec, camera);
  const hit = raycaster.intersectObjects(hitMeshes, false)[0];
  return hit ? hotspots.get(hit.object.userData.hotspotId) : null;
}

// hover (desktop): pointer cursor + faint ring, name tag after 150 ms
let hovered = null;
let hoverTimer = 0;

function setHover(h) {
  if (h === hovered) return;
  clearTimeout(hoverTimer);
  if (hovered) {
    if (!active.has(hovered)) hovered.ring.visible = false;
    if (hovered.hoverTag) {
      hovered.group.remove(hovered.hoverTag);
      hovered.hoverTag.material.map.dispose();
      hovered.hoverTag.material.dispose();
      hovered.hoverTag = null;
    }
  }
  hovered = h;
  container.style.cursor = h ? 'pointer' : '';
  if (!h) return;
  if (!active.has(h)) {
    h.ring.visible = true;
    h.ring.scale.setScalar(1);
    h.ring.material.opacity = 0.3;
  }
  hoverTimer = setTimeout(() => {
    if (hovered !== h || h.hoverTag) return;
    h.hoverTag = makeLabelSprite(h.label, false);
    h.hoverTag.position.copy(h.normal).multiplyScalar(0.05).add(UP.clone().multiplyScalar(0.1));
    h.group.add(h.hoverTag);
  }, 150);
}

let downAt = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = e.pointerType === 'mouse' && e.button !== 0 ? null : { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointerup', (e) => {
  const d = downAt;
  downAt = null;
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // drag/orbit
  const h = pickHotspot(e);
  if (!h) return; // raycast miss = nothing
  // a click pauses the idle orbit exactly like a drag does
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    if (idleMode) controls.autoRotate = !REDUCED;
  }, 8000);
  const rect = container.getBoundingClientRect();
  const v = h.group.getWorldPosition(worldVec).project(camera);
  document.dispatchEvent(new CustomEvent('vulcan:hotspot-click', {
    detail: {
      id: h.id,
      label: h.label,
      x: (v.x * 0.5 + 0.5) * rect.width,
      y: (0.5 - v.y * 0.5) * rect.height,
      tutorialActive: !!tut.script && !tut.ended
    }
  }));
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons) {
    setHover(null); // orbiting
    return;
  }
  setHover(pickHotspot(e));
});

renderer.domElement.addEventListener('pointerleave', () => setHover(null));

// practice-mode acknowledgment: brief ring flash, no label
function flash(id) {
  const h = hotspots.get(id);
  if (!h || active.has(h)) return;
  h.ring.visible = true;
  if (REDUCED) {
    h.ring.material.opacity = 0.8;
    setTimeout(() => {
      if (!active.has(h) && h !== hovered) h.ring.visible = false;
    }, 400);
    return;
  }
  animate(500, (k) => {
    h.ring.material.opacity = 0.95 * (1 - k);
    h.ring.scale.setScalar(1 + 0.5 * k);
  }).then(() => {
    if (active.has(h)) return;
    h.ring.visible = h === hovered;
    h.ring.material.opacity = 0.3;
    h.ring.scale.setScalar(1);
  });
}

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
  updateAnims(now);
  updateHand(now);
  controls.update();
  // key light rides just off the camera-to-subject axis while a tutorial is
  // active so bay/side framings stay legible without lifting the mood
  const wantLight = tut.script && !tut.ended ? 2.4 : 0;
  stepLight.intensity += (wantLight - stepLight.intensity) * (REDUCED ? 1 : 0.08);
  if (stepLight.intensity > 0.005) {
    stepLight.position.copy(camera.position).lerp(controls.target, 0.7);
    stepLight.position.y += 0.45;
  }
  if (!REDUCED && active.size > 0) {
    const phase = 0.5 + 0.5 * Math.sin(now / 250);
    for (const h of active) {
      h.ring.scale.setScalar(1 + 0.25 * phase);
      h.ring.material.opacity = 0.95 - 0.55 * phase;
    }
  }
  renderer.render(scene, camera);
});

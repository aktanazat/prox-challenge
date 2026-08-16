// Stylized 3D view of the Vulcan OmniPro 220 with named hotspots.
// The machine itself is a GLB (web/models/omnipro220.glb) bound strictly by
// node NAME per the frozen model contract, so re-exports with better geometry
// rebind cleanly. Exposes window.MachineView = { focus(spec), idle() } and
// fires 'machineview-ready' once the model is loaded and bound, so app.js
// pending queues keep working.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACCENT = 0xff6a00;

const container = document.getElementById('machine-canvas');

// ---------- LCD texture: drawn face, LCD region cropped onto the GLB screen ----------

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
// The GLB's lcd_screen quad carries full-face 0-1 UVs over just the LCD
// glass; crop the drawn face's LCD region onto it. glTF UVs expect
// flipY=false (v runs from the top of the canvas).
panelTexture.flipY = false;
panelTexture.offset.set(140 / 512, 132 / 512);
panelTexture.repeat.set(232 / 512, 126 / 512);

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
renderer.toneMappingExposure = 1.3;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// neutral studio IBL so every angle of the near-black chassis reads on the
// dark plate (the rear used to go black-on-black under directionals alone)
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  pmrem.dispose();
}

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

scene.add(new THREE.HemisphereLight(0xc3ccd6, 0x33373c, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(2, 3, 2.5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xb8c6d4, 1.5);
rim.position.set(-2.5, 2.0, -2.2);
scene.add(rim);
const rearFill = new THREE.DirectionalLight(0xaeb9c6, 0.9);
rearFill.position.set(1.9, 1.4, -2.4);
scene.add(rearFill);
const bayFill = new THREE.DirectionalLight(0x9aa8b6, 0.8);
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
  new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.95, envMapIntensity: 0.35 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.002;
scene.add(floor);
const grid = new THREE.GridHelper(4.8, 24, 0x2a2e34, 0x17191d);
grid.position.y = 0.001;
scene.add(grid);

// ---------- machine: GLB-bound registries ----------
// The model loads asynchronously; bindModel() below fills these registries.
// Every runtime path guards against a missing bind, so a load failure
// degrades to the empty floor instead of breaking the app shell.

const machine = new THREE.Group();
scene.add(machine);

const copper = new THREE.MeshStandardMaterial({ color: 0xc27a3a, roughness: 0.35, metalness: 0.7, emissive: 0x2a1404 });

let glbRoot = null;   // scaled GLB scene root
let MACH_TOP = 0.86;  // world-space machine extents (refined at bind)
let MACH_MID = 0.44;
let MACH_FOOT = 1.45; // largest horizontal extent

// rotatables bound by name: kid -> { obj, qHome }. Every knob is authored as
// a disc about its own local Y, so spins compose qHome with a local-Y twist;
// visual angles are tracked here (the reducer owns the canonical values).
const KNOBS = new Map();
const knobAngles = { 'knob-left': 0, 'knob-right': 0, 'knob-center': 0, 'tension-knob': 0 };
const _spinQ = new THREE.Quaternion();
const LOCAL_X = new THREE.Vector3(1, 0, 0);
const LOCAL_Y = new THREE.Vector3(0, 1, 0);

function setKnobAngle(kid, rad) {
  const k = KNOBS.get(kid);
  if (!k) return;
  k.obj.quaternion.copy(k.qHome).multiply(_spinQ.setFromAxisAngle(LOCAL_Y, rad));
  knobAngles[kid] = rad;
}

function knobFaceDir(kid) {
  const k = KNOBS.get(kid);
  if (!k) return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 1, 0)
    .applyQuaternion(k.obj.getWorldQuaternion(new THREE.Quaternion())).normalize();
}

// side door (part_side-panel): authored CLOSED, hinge origin on the rear
// vertical edge; opening swings the front edge out past the machine's left
const DOOR_OPEN = -1.31; // ~75°
let door = null, doorHomeQ = null, doorAngle = 0;
const doorHandleLocal = new THREE.Vector3();

function setDoorAngle(rad) {
  if (!door) return;
  door.quaternion.copy(doorHomeQ).multiply(_spinQ.setFromAxisAngle(LOCAL_Y, rad));
  doorAngle = rad;
}

// power rocker (part_power-switch): nudge about its local pivot axis
let powerNode = null, powerHomeQ = null;

function setPowerRocker(on) {
  if (!powerNode) return;
  powerNode.quaternion.copy(powerHomeQ).multiply(_spinQ.setFromAxisAngle(LOCAL_X, on ? 0.16 : -0.16));
}

// polarity jumper hops between the lug posts (lug_a = positive, the authored park)
let jumperGroup = null, jumperHomeQ = null;
let JUMPER_LUGS = null;

// wire spline through wirepath_0..5. There is no wire mesh in the GLB; the
// tube stays procedural so the `thread` verb keeps its drawRange reveal.
let wireCurve = null, wireMesh = null, WIRE_IDX = 0;
const WIRE_SEGS = 64;

function setWireRatio(r) {
  if (!wireMesh) return;
  const segs = Math.round(WIRE_SEGS * Math.max(0, Math.min(1, r)));
  wireMesh.visible = segs > 0;
  wireMesh.geometry.setDrawRange(0, segs * WIRE_IDX);
}

// stub torch (nozzle/contact-tip seats); axis recomputed from the GLB
let TORCH_AXIS = new THREE.Vector3(0, 0.14, -0.99).normalize();

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
  const font = (primary ? 44 : 34) + 'px Geist, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '600 ' + font;
  const tw = Math.ceil(measure.measureText(text.toUpperCase()).width);
  const cw = Math.min(1024, tw + pad * 2);
  const ch = primary ? 92 : 74;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  // white card with hairline edge, matching the light chrome outside the well
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.beginPath();
  ctx.roundRect(1, 1, cw - 2, ch - 2, 12);
  ctx.fill();
  ctx.strokeStyle = primary ? '#9CA3AF' : '#D1D5DB';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = primary ? '#111827' : '#374151';
  ctx.font = '600 ' + font;
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

// per-hotspot presentation metadata; positions come from the hotspot_* empties
const HOTSPOT_META = {
  'front-panel':        { n: [0, 0.12, 1],  view: [0.25, 0.18, 1],  dist: 1.15, r: 0.13, label: 'Front panel' },
  'socket-positive':    { n: [0, 0.12, 1],  view: [0.3, -0.02, 1],  dist: 0.8,  r: 0.07, label: 'Positive socket (+)' },
  'socket-negative':    { n: [0, 0.12, 1],  view: [-0.3, -0.02, 1], dist: 0.8,  r: 0.07, label: 'Negative socket (−)' },
  'polarity-terminals': { n: [-1, 0, 0],    view: [-1, 0.18, 0.45], dist: 0.95, r: 0.08, label: 'Polarity terminals' },
  'wire-feed':          { n: [-1, 0, 0],    view: [-1, 0.25, 0.5],  dist: 1.05, r: 0.08, label: 'Wire feed drive' },
  'tension-knob':       { n: [-1, 0, 0],    view: [-1, 0.3, 0.4],   dist: 0.9,  r: 0.06, label: 'Tension knob' },
  'spool':              { n: [-1, 0, 0],    view: [-1, 0.25, 0.2],  dist: 1.1,  r: 0.13, label: 'Wire spool' },
  'power-switch':       { n: [0, 0.12, 1],  view: [0.45, 0, 1],     dist: 0.8,  r: 0.07, label: 'Power switch' },
  'gas-inlet':          { n: [0, 0, -1],    view: [0.4, 0.3, -1],   dist: 0.95, r: 0.06, label: 'Gas inlet' }
};

// machine-view artifacts never zoom past this: the part stays ≤ ~40% of the
// frame with the whole working face visible (rings point, the lens doesn't)
const FOCUS_MIN_D = 1.25;

const hotspots = new Map();
const hitMeshes = [];
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function bindHotspot(id, meta, worldPos) {
  const group = new THREE.Group();
  group.position.copy(worldPos);
  const normal = new THREE.Vector3().fromArray(meta.n).normalize();
  const ring = makeRing(meta.r);
  ring.quaternion.setFromUnitVectors(Z, normal);
  ring.visible = false;
  ring.renderOrder = 998;
  group.add(ring);
  // generous invisible hit sphere for ask-by-touching raycasts
  const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(meta.r * 1.35, 0.075), 12, 8), hitMat);
  hit.userData.hotspotId = id;
  group.add(hit);
  hitMeshes.push(hit);
  machine.add(group);
  hotspots.set(id, {
    id, group, ring, normal,
    view: new THREE.Vector3().fromArray(meta.view).normalize(),
    dist: meta.dist,
    label: meta.label,
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

// Camera moves read like a person repositioning: straight blends for small
// moves, but a large heading change walks AROUND the machine (cylindrical
// interpolation about the subject) instead of cutting through it.
function tweenCamera(toPos, toTarget) {
  setHover(null); // programmatic camera moves invalidate any stationary hover
  if (REDUCED) {
    camera.position.copy(toPos);
    controls.target.copy(toTarget);
    return;
  }
  const f = camera.position;
  const a0 = Math.atan2(f.z - toTarget.z, f.x - toTarget.x);
  const a1 = Math.atan2(toPos.z - toTarget.z, toPos.x - toTarget.x);
  const r0 = Math.hypot(f.x - toTarget.x, f.z - toTarget.z);
  const r1 = Math.hypot(toPos.x - toTarget.x, toPos.z - toTarget.z);
  let dA = a1 - a0;
  while (dA > Math.PI) dA -= Math.PI * 2;
  while (dA < -Math.PI) dA += Math.PI * 2;
  tween = {
    start: performance.now(),
    dur: 800,
    fromPos: camera.position.clone(),
    toPos,
    fromTarget: controls.target.clone(),
    toTarget,
    orbit: Math.abs(dA) > Math.PI / 3 && Math.min(r0, r1) > 0.7 ? { a0, dA, r0, r1 } : null
  };
}

function updateTween(now) {
  if (!tween) return;
  const t = Math.min(1, (now - tween.start) / tween.dur);
  const k = easeInOutCubic(t);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
  if (tween.orbit) {
    const o = tween.orbit;
    const ang = o.a0 + o.dA * k;
    const r = o.r0 + (o.r1 - o.r0) * k;
    camera.position.set(
      tween.toTarget.x + Math.cos(ang) * r,
      tween.fromPos.y + (tween.toPos.y - tween.fromPos.y) * k,
      tween.toTarget.z + Math.sin(ang) * r
    );
  } else {
    camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
  }
  if (t >= 1) tween = null;
}

// ---------- public API ----------

let idleMode = true;

function focus(spec) {
  if (!spec || typeof spec !== 'object' || typeof spec.target !== 'string') return false;
  const known = hotspots.get(spec.target);
  const anchor = known || hotspots.get('front-panel');
  if (!anchor) return false; // model failed to bind; degrade silently
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
  // narrow (portrait) canvases need extra distance so labels fit horizontally.
  // Distance is clamped (FOCUS_MIN_D) so the focused part never fills the
  // frame — the whole working face stays visible and the ring points.
  const aspectComp = Math.min(1.8, Math.max(1, 1.9 / camera.aspect));
  const aim = worldPos.clone().add(UP.clone().multiplyScalar(0.09));
  tweenCamera(aim.clone().addScaledVector(anchor.view, Math.max(anchor.dist, FOCUS_MIN_D) * aspectComp), aim);
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
    try {
      a.update(easeInOutCubic(t), t);
    } catch (err) {
      // a poisoned update must not hang its await or break later anims
      anims.delete(a);
      a.resolve();
      console.warn('machine: animation step failed, skipping', err);
      continue;
    }
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
// Free-moving parts are re-parented out of the scaled GLB tree into
// `machine` (identity transform) at bind time, so every free/seat transform
// below is a plain world transform and the verb runners stay world-space.

const PARTS = new Map();
function regPart(id, obj, free, opts = {}) {
  PARTS.set(id, { id, obj, free, spin: opts.spin || 'z', approach: opts.approach || V3(0, 0.8, 0.55).normalize(), seatHome: opts.seatHome || null });
}

// seat transforms come from the seat_* empties at bind time
let SEATS = {};

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
  if (id === 'tension-knob' && KNOBS.has(id)) {
    // reached into the open bay from the machine's left
    return { pos: KNOBS.get(id).obj.getWorldPosition(new THREE.Vector3()), dir: V3(-1, 0.35, 0.25).normalize() };
  }
  if (KNOBS.has(id)) {
    return { pos: KNOBS.get(id).obj.getWorldPosition(new THREE.Vector3()), dir: knobFaceDir(id) };
  }
  if (id === 'power-switch' && powerNode) {
    return { pos: powerNode.getWorldPosition(new THREE.Vector3()), dir: V3(0, 0.12, 1).normalize() };
  }
  if (id === 'side-panel' && door) return { pos: panelHandleWorld(), dir: panelOutwardNormal() };
  if (id === 'wire' && wireCurve) return { pos: wireCurve.getPoint(0.5).clone(), dir: V3(-1, 0.2, 0).normalize() };
  if (id === 'polarity-jumper' && jumperGroup) {
    return { pos: jumperGroup.getWorldPosition(new THREE.Vector3()), dir: V3(-1, 0.35, 0.2).normalize() };
  }
  return null;
}

function panelHandleWorld() {
  return door.localToWorld(doorHandleLocal.clone());
}

function panelOutwardNormal() {
  return V3(-1, 0, 0).applyAxisAngle(UP, doorAngle);
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
    knobs: { 'knob-left': 0, 'knob-right': 0, 'knob-center': 0, 'tension-knob': 0 },
    power: false,
    panelOpen: false,
    wire: 1,
    jumper: 'positive'
  };
}

// axis letter is informational (every knob spins about its own local Y);
// the sign fixes what "cw" means for the reducer
const KNOB_AXES = { 'knob-left': ['y', -1], 'knob-right': ['y', -1], 'knob-center': ['y', -1], 'tension-knob': ['y', -1] };

function knobObj(kid) {
  return KNOBS.get(kid)?.obj || null;
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
        // first-touch visibility: an open-first script starts closed, a
        // close-first script starts open
        base.panelOpen = a.verb === 'close';
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
  for (const [kid, val] of Object.entries(s.knobs)) setKnobAngle(kid, val);
  setPowerRocker(s.power);
  setDoorAngle(s.panelOpen ? DOOR_OPEN : 0);
  setWireRatio(s.wire);
  if (jumperGroup && JUMPER_LUGS) jumperGroup.position.copy(JUMPER_LUGS[s.jumper]);
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
    const at = pointablePos(a.part);
    await moveHand(hoverPoint(at.pos, at.dir, 0.12), at.pos, 'point', 0.45, token);
    await moveHand(hoverPoint(at.pos, at.dir, 0.08), at.pos, 'grip', 0.2, token);
    const from = tut.live.knobs[a.part];
    applyAction(tut.live, a);
    const to = tut.live.knobs[a.part];
    const hq = hand.quaternion.clone();
    await animate(620 / tut.speed, (k) => {
      setKnobAngle(a.part, from + (to - from) * k);
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
    const goingOn = isPower && tut.live ? !tut.live.power : false;
    let flipped = false;
    await animate(360 / tut.speed, (k) => {
      hand.position.copy(base).addScaledVector(at.dir, -0.045 * Math.sin(k * Math.PI));
      if (isPower && !flipped && k > 0.45) { setPowerRocker(goingOn); flipped = true; }
    });
    token.check();
    if (isPower && tut.live) applyAction(tut.live, a);
    await animate(220 / tut.speed, () => {});
    token.check();
  },

  async thread(a, token) {
    if (a.part && a.part !== 'wire') warnSkip('thread expects part "wire"', a);
    if (!wireCurve) return warnSkip('wire path not bound', a);
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
    if (!jumperGroup || !JUMPER_LUGS) return warnSkip('polarity jumper not bound', a);
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
      jumperGroup.quaternion.slerp(jumperHomeQ, k);
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
  if (!door) return warnSkip('side panel not bound', a);
  if (tut.live && tut.live.panelOpen === open) {
    return RUNNERS.point({ target: 'wire-feed' }, token); // already there: gesture at it
  }
  let hp = panelHandleWorld();
  await moveHand(hoverPoint(hp, panelOutwardNormal(), 0.11), hp, 'grip', 0.5, token);
  const r0 = doorAngle;
  const r1 = open ? DOOR_OPEN : 0;
  await animate(780 / tut.speed, (k) => {
    setDoorAngle(r0 + (r1 - r0) * k);
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
// Tutorial framing is first-person: the camera stands where a welder would —
// in front of the face being worked, eyes just above the machine top, looking
// down 10–20° — and never zooms past the whole-machine silhouette. The
// pulsing ring + label do the pointing, not the lens.

function personDistance() {
  const halfH = Math.tan((camera.fov * Math.PI) / 360);
  const need = Math.max(
    (MACH_TOP * 1.3) / (2 * halfH),
    (MACH_FOOT * 1.2) / (2 * halfH * Math.max(0.6, camera.aspect))
  );
  // floor of 2.05 keeps the swung-open door inside the frame bottom even
  // when the camera stands on the door side (eye above the machine, pitched
  // down ~16°) — the whole silhouette plus working door must always fit
  return Math.min(2.9, Math.max(2.05, need));
}

// steps that work the side door need extra standoff: the door swings toward
// a camera standing on the bay side, and its near bottom corner would pass
// under the frame edge at normal person distance
function stepWorksDoor(i) {
  const step = tut.script?.steps[i];
  if (!step) return false;
  return !!tut.states[i]?.panelOpen ||
    step.actions.some((a) => (a.verb === 'open' || a.verb === 'close') && a.part === 'side-panel');
}

function viewTarget(tid, opts = {}) {
  const h = hotspots.get(tid);
  if (!h) {
    if (tid) console.warn('tutorial: unknown camera target', tid);
    return false;
  }
  idleMode = false;
  controls.autoRotate = false;
  const worldPos = h.group.getWorldPosition(new THREE.Vector3());
  if (!opts.person) {
    // machine-view style framing (panel-state twin): clamped like focus()
    const aspectComp = Math.min(1.8, Math.max(1, 1.9 / camera.aspect));
    const aim = worldPos.clone().add(UP.clone().multiplyScalar(0.05));
    tweenCamera(aim.clone().addScaledVector(h.view, Math.max(h.dist, FOCUS_MIN_D) * aspectComp), aim);
    return true;
  }
  // stand on the side the worked face points toward, nudged in front of the part
  const dirH = V3(h.normal.x, 0, h.normal.z);
  if (dirH.lengthSq() < 0.05) dirH.set(0, 0, 1);
  dirH.normalize();
  const partH = V3(worldPos.x, 0, worldPos.z);
  if (partH.lengthSq() > 0.001) dirH.addScaledVector(partH.normalize(), 0.4).normalize();
  // aim mostly at the machine's center so the whole silhouette stays in frame
  const aim = V3(0, MACH_MID, 0).lerp(V3(worldPos.x, Math.min(worldPos.y, MACH_TOP * 0.85), worldPos.z), 0.25);
  const camPos = aim.clone().addScaledVector(dirH, personDistance() + (opts.wide ? 0.55 : 0));
  camPos.y = MACH_TOP + 0.24; // fixed eye height, just above the machine top
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
  if (step.camera && viewTarget(step.camera, { person: true, wide: stepWorksDoor(i) })) {
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
    if (step.camera) viewTarget(step.camera, { person: true, wide: stepWorksDoor(i) });
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

// ---------- GLB load + bind (everything above keys off these registries) ----------

function exposeApi() {
  applyState(defaultState()); // place every movable part deterministically
  window.MachineView = { focus, idle, tutorial, panelState, flash };
  document.dispatchEvent(new CustomEvent('machineview-ready'));
}

function bindModel(gltf) {
  glbRoot = gltf.scene;
  // normalize to the previous procedural machine's footprint so camera
  // constants, hand scale and hand approach paths still compose
  const preBox = new THREE.Box3().setFromObject(glbRoot);
  const S = Math.min(3, Math.max(1.2, 0.86 / Math.max(0.2, preBox.max.y)));
  glbRoot.scale.setScalar(S);
  machine.add(glbRoot);
  glbRoot.updateMatrixWorld(true);

  const nodes = new Map();
  glbRoot.traverse((o) => { if (o.name) nodes.set(o.name, o); });
  const N = (name) => nodes.get(name) || null;
  const wPos = (o) => o.getWorldPosition(new THREE.Vector3());
  const wQuat = (o) => o.getWorldQuaternion(new THREE.Quaternion());

  const box = new THREE.Box3().setFromObject(glbRoot);
  MACH_TOP = box.max.y;
  MACH_MID = box.max.y * 0.52;
  MACH_FOOT = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);

  // materials: the PBR set responds to the studio IBL; the LCD swaps to the
  // live canvas texture (unlit so panel-state stays legible from any angle)
  const seen = new Set();
  glbRoot.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      if ('envMapIntensity' in m) m.envMapIntensity = 0.85;
    }
    if (o.material && o.material.name === 'LCD') {
      o.material = new THREE.MeshBasicMaterial({ map: panelTexture, toneMapped: false });
    }
  });

  // hotspots: hotspot_* empties anchor rings, labels and raycast hit spheres
  for (const [id, meta] of Object.entries(HOTSPOT_META)) {
    const e = N('hotspot_' + id);
    if (e) bindHotspot(id, meta, wPos(e));
    else console.warn('model: missing hotspot node', id);
  }

  // seats (plug fully-seated transforms; the plug axis is the empty's local Y)
  SEATS = {};
  for (const [sid, node] of [
    ['socket-positive', 'seat_socket-positive'],
    ['socket-negative', 'seat_socket-negative'],
    ['wire-feed', 'seat_gun-bulkhead']
  ]) {
    const e = N(node);
    if (!e) { console.warn('model: missing seat node', node); continue; }
    const quat = wQuat(e);
    SEATS[sid] = { pos: wPos(e), quat, normal: V3(0, 1, 0).applyQuaternion(quat).normalize() };
  }

  // cable connectors: plug + cable stub grouped so they travel together;
  // parked poses come from the home_* empties
  const freeOf = (homeName, fallbackObj) => {
    const e = N(homeName);
    if (e) return { pos: wPos(e), quat: wQuat(e) };
    return { pos: wPos(fallbackObj), quat: wQuat(fallbackObj) };
  };
  const bindConnector = (pid) => {
    const main = N('part_' + pid);
    if (!main) { console.warn('model: missing part', pid); return; }
    const g = new THREE.Group();
    g.position.copy(wPos(main));
    g.quaternion.copy(wQuat(main));
    machine.add(g);
    g.updateMatrixWorld(true);
    g.attach(main);
    const cable = N('part_' + pid + '_cable');
    if (cable) g.attach(cable);
    regPart(pid, g, freeOf('home_' + pid, g));
  };
  bindConnector('connector-ground');
  bindConnector('connector-electrode');
  bindConnector('connector-gun');

  // torch consumables: seated as authored; removal parks them on the floor
  // beside the torch, lying down along a plausible horizontal axis
  const nozzleN = N('part_nozzle');
  const tipN = N('part_contact-tip');
  const torchN = N('part_torch-body');
  if (nozzleN && tipN) {
    TORCH_AXIS = wPos(tipN).sub(wPos(nozzleN)).normalize();
    const base = torchN ? wPos(torchN) : wPos(nozzleN);
    const lieQ = new THREE.Quaternion().setFromUnitVectors(TORCH_AXIS, V3(0.88, 0, 0.48).normalize());
    for (const [pid, node, offX, offZ, y] of [
      ['nozzle', nozzleN, 0.3, 0.14, 0.02],
      ['contact-tip', tipN, 0.37, 0.05, 0.008]
    ]) {
      const seatHome = { pos: wPos(node), quat: wQuat(node) };
      machine.attach(node);
      regPart(pid, node, {
        pos: V3(base.x + offX, y, base.z + offZ),
        quat: lieQ.clone().multiply(seatHome.quat)
      }, { spin: 'y', seatHome });
    }
  } else console.warn('model: missing torch consumables');

  // polarity jumper hops between the lug_a/lug_b posts
  jumperGroup = N('part_polarity-jumper');
  const lugA = N('lug_a');
  const lugB = N('lug_b');
  if (jumperGroup && lugA && lugB) {
    machine.attach(jumperGroup);
    jumperHomeQ = jumperGroup.quaternion.clone();
    JUMPER_LUGS = { positive: wPos(lugA), negative: wPos(lugB) };
  } else {
    jumperGroup = null;
    console.warn('model: missing polarity jumper/lugs');
  }

  // rotatables spin in place about their authored local Y
  for (const kid of ['knob-left', 'knob-right', 'knob-center', 'tension-knob']) {
    const node = N('part_' + kid);
    if (node) KNOBS.set(kid, { obj: node, qHome: node.quaternion.clone() });
    else if (kid !== 'knob-center') console.warn('model: missing knob', kid);
  }

  powerNode = N('part_power-switch');
  if (powerNode) powerHomeQ = powerNode.quaternion.clone();
  else console.warn('model: missing power switch');

  door = N('part_side-panel');
  if (door) {
    doorHomeQ = door.quaternion.clone();
    const g = door.geometry;
    g.computeBoundingBox();
    doorHandleLocal.set(
      g.boundingBox.min.x - 0.015,
      g.boundingBox.min.y + (g.boundingBox.max.y - g.boundingBox.min.y) * 0.35,
      g.boundingBox.max.z * 0.9
    );
  } else console.warn('model: missing side panel');

  // wire spline through the wirepath empties (spool → guides → drive → bulkhead)
  const pathPts = [];
  for (let i = 0; i <= 5; i++) {
    const e = N('wirepath_' + i);
    if (e) pathPts.push(wPos(e));
  }
  // Presentation pass: the authored empties sit at hardware bore centers
  // (spool spindle, guide bores, drive rollers), where a tube is swallowed by
  // the meshes. Bring the exposed spans out to just inside the door plane so
  // the thread verb reads as a copper line: start at the spool rim and run
  // the guide spans proud of the bay hardware. The drive entry/exit and the
  // run to the bulkhead stay buried on purpose (a real wire is enclosed there).
  if (door && pathPts.length === 6) {
    const proudX = door.getWorldPosition(new THREE.Vector3()).x + 0.006;
    const spoolN = N('part_spool');
    if (spoolN) {
      const sb = new THREE.Box3().setFromObject(spoolN);
      pathPts[0].y = sb.min.y + 0.012; // come off the spool rim, not the hub
    }
    for (let i = 0; i <= 2; i++) pathPts[i].x = Math.min(pathPts[i].x, proudX);
  }
  if (pathPts.length >= 2) {
    wireCurve = new THREE.CatmullRomCurve3(pathPts);
    // radius is stylized (wire + liner): thick enough to read as a bright
    // copper line from the first-person tutorial distance (~2.6 m)
    wireMesh = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, WIRE_SEGS, 0.009, 8, false), copper);
    machine.add(wireMesh);
    WIRE_IDX = wireMesh.geometry.index.count / WIRE_SEGS;
  } else console.warn('model: missing wirepath empties');

  exposeApi();
}

new GLTFLoader().load(
  '/web/models/omnipro220.glb',
  bindModel,
  undefined,
  (err) => {
    console.error('machine model failed to load; floor-only fallback', err);
    exposeApi(); // app.js queues still drain; every op degrades safely
  }
);

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
  const k = KNOBS.get(kid);
  if (!k || !text) return;
  const tag = makeLabelSprite(text, false);
  tag.scale.multiplyScalar(0.8);
  tag.position.copy(k.obj.getWorldPosition(new THREE.Vector3())).add(V3(0, -0.11, 0.07));
  machine.add(tag);
  knobTags.set(kid, tag);
}

function panelState(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return false;
  mergePanelSpec(spec);
  panelStateActive = true;
  pauseTutorial('panel-state');
  clearHighlights();
  viewTarget('front-panel');
  for (const kid of ['knob-left', 'knob-right']) {
    const value = livePanel[kid].value;
    setKnobTag(kid, value ? `${livePanel[kid].label} · ${value}` : '');
    if (!KNOBS.has(kid) || !value) continue;
    // dial sweep is 270° with the pointer up at mid-sweep
    const to = (0.5 - knobFrac(value)) * Math.PI * 1.5;
    const from = knobAngles[kid];
    animate(600, (k) => { setKnobAngle(kid, from + (to - from) * k); });
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

// three r160's WebGLAnimation only schedules the next frame AFTER this
// callback returns, so an uncaught throw here would kill the loop for the
// rest of the session. Catch, log once, keep looping — and always render.
let loopErrLogged = false;
function logLoopErr(err) {
  if (loopErrLogged) return;
  loopErrLogged = true;
  console.error('machine: render-loop error (loop kept alive)', err);
}

renderer.setAnimationLoop((now) => {
  if (paused) return;
  try {
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
  } catch (err) {
    logLoopErr(err);
  }
  try {
    renderer.render(scene, camera);
  } catch (err) {
    logLoopErr(err);
  }
});

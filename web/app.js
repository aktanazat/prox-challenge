// Vulcan OmniPro 220 Technical Expert — frontend application.
// Talks to the backend over the frozen HTTP/SSE contract; renders streamed
// markdown, tool chips, artifacts (sandboxed shell iframes) and machine views.

'use strict';

/* ================= DOM ================= */

const $ = (id) => document.getElementById(id);
const messagesEl = $('messages');
const chatEmptyEl = $('chat-empty');
const suggestionsEl = $('suggestions');
const inputEl = $('input');
const sendBtn = $('send-btn');
const micBtn = $('mic-btn');
const uploadBtn = $('upload-btn');
const ttsBtn = $('tts-btn');
const fileInput = $('file-input');
const statusDot = $('status-dot');
const statusText = $('status-text');
const stackEl = $('artifact-stack');
const stackEmptyEl = $('stack-empty');
const artifactCountEl = $('artifact-count');
const machinePanel = document.querySelector('.machine-panel');
const machineToggle = $('machine-toggle');
const machineReset = $('machine-reset');
const lightboxEl = $('lightbox');
const lightboxImg = $('lightbox-img');
const lightboxClose = $('lightbox-close');

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ================= status ================= */

const STATUS_LABELS = {
  connecting: 'LINKING',
  reconnecting: 'RELINK',
  online: 'ONLINE',
  working: 'WORKING',
  offline: 'OFFLINE'
};

function setStatus(state) {
  statusDot.dataset.state = state;
  statusText.textContent = STATUS_LABELS[state] || state.toUpperCase();
}

/* ================= markdown ================= */

let purifyHooked = false;
function ensurePurifyHook() {
  if (purifyHooked || typeof DOMPurify === 'undefined') return;
  purifyHooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener');
    }
  });
}

const CITE_RE = /\[(owner[-\s]?manual|manual|quick[-\s]?start(?:[-\s]?guide)?|selection[-\s]?chart)\s+p\.?\s*(\d+)\]/gi;

function citeHref(doc, page) {
  const d = doc.toLowerCase();
  let file;
  if (/^quick/.test(d)) file = 'quick-start-guide.pdf';
  else if (/^selection/.test(d)) file = 'selection-chart.pdf';
  else file = 'owner-manual.pdf';
  return `/files/${file}#page=${page}`;
}

// Turn [manual p.19]-style citations in plain text nodes into links.
function linkifyCitations(rootEl) {
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p || p.closest('a, pre, code')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const targets = [];
  let n;
  while ((n = walker.nextNode())) {
    if (CITE_RE.test(n.nodeValue)) targets.push(n);
    CITE_RE.lastIndex = 0;
  }
  for (const textNode of targets) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const text = textNode.nodeValue;
    for (const m of text.matchAll(CITE_RE)) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('a');
      a.className = 'cite';
      a.href = citeHref(m[1], m[2]);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = m[0];
      frag.appendChild(a);
      last = m.index + m[0].length;
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.replaceWith(frag);
  }
}

// Inline images: click-to-lightbox; broken sources get an explicit state.
function upgradeImages(rootEl) {
  for (const img of rootEl.querySelectorAll('img')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'img-btn';
    btn.setAttribute('aria-label', `View image: ${img.alt || 'figure'}`);
    img.replaceWith(btn);
    btn.appendChild(img);
    btn.addEventListener('click', () => openLightbox(img.src, img.alt, btn));
    img.addEventListener('error', () => {
      const missing = document.createElement('span');
      missing.className = 'img-missing';
      const name = (img.getAttribute('src') || '').split('/').pop() || 'image';
      missing.textContent = `image unavailable · ${name}`;
      btn.replaceWith(missing);
    }, { once: true });
  }
}

function renderMarkdownInto(el, src) {
  ensurePurifyHook();
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    el.textContent = src; // CDN not ready/blocked: degrade to plain text
    return;
  }
  el.innerHTML = DOMPurify.sanitize(marked.parse(src, { gfm: true, breaks: true }));
  linkifyCitations(el);
  upgradeImages(el);
}

/* ================= chat turn model ================= */
// An assistant turn is a sequence of segments: markdown bodies interleaved
// with tool-chip groups, so chips appear exactly where the agent used tools.

let currentTurn = null;
let lastUserText = null;

function hideEmpty() {
  if (chatEmptyEl) chatEmptyEl.remove();
}

function pinnedToBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 90;
}

function scrollIfPinned(wasPinned) {
  if (wasPinned) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function ensureTurn() {
  if (currentTurn) return currentTurn;
  hideEmpty();
  const el = document.createElement('div');
  el.className = 'msg assistant';
  const content = document.createElement('div');
  content.className = 'turn-content';
  el.appendChild(content);
  messagesEl.appendChild(el);
  currentTurn = { el, content, segments: [], toolCount: 0 };
  return currentTurn;
}

function lastSegment(turn) {
  return turn.segments[turn.segments.length - 1] || null;
}

function onTextDelta(text) {
  setStatus('working');
  const turn = ensureTurn();
  let seg = lastSegment(turn);
  if (!seg || seg.kind !== 'md') {
    const el = document.createElement('div');
    el.className = 'md';
    turn.content.appendChild(el);
    seg = { kind: 'md', el, src: '', raf: 0 };
    turn.segments.push(seg);
  }
  seg.src += text;
  if (!seg.raf) {
    seg.raf = requestAnimationFrame(() => {
      seg.raf = 0;
      const pinned = pinnedToBottom();
      renderMarkdownInto(seg.el, seg.src);
      scrollIfPinned(pinned);
    });
  }
  tts.push(text);
}

const TOOL_VERBS = { Read: 'Reading', Grep: 'Searching', Glob: 'Scanning' };

function onTool(ev) {
  setStatus('working');
  const turn = ensureTurn();
  let seg = lastSegment(turn);
  if (!seg || seg.kind !== 'chips') {
    const details = document.createElement('details');
    details.className = 'chips live';
    details.open = true;
    const summary = document.createElement('summary');
    details.appendChild(summary);
    turn.content.appendChild(details);
    seg = { kind: 'chips', el: details, summary, count: 0 };
    turn.segments.push(seg);
  }
  const prev = seg.el.querySelector('.chip.active');
  if (prev) prev.classList.replace('active', 'done');

  const pinned = pinnedToBottom();
  const chip = document.createElement('div');
  chip.className = 'chip active';
  const spin = document.createElement('span');
  spin.className = 'chip-spin';
  const label = document.createElement('span');
  label.textContent = `${TOOL_VERBS[ev.name] || ev.name}`;
  chip.append(spin, label);
  if (ev.detail) {
    const detail = document.createElement('span');
    detail.className = 'chip-detail';
    detail.textContent = ev.detail;
    chip.appendChild(detail);
  }
  seg.el.appendChild(chip);
  seg.count += 1;
  turn.toolCount += 1;
  scrollIfPinned(pinned);
}

function finalizeTurn(meta) {
  const turn = currentTurn;
  currentTurn = null;
  if (!turn) return;
  for (const seg of turn.segments) {
    if (seg.kind !== 'chips') continue;
    seg.el.classList.remove('live');
    seg.el.open = false;
    seg.summary.textContent = plural(seg.count, 'source lookup');
    const activeChip = seg.el.querySelector('.chip.active');
    if (activeChip) activeChip.classList.replace('active', 'done');
  }
  if (meta && (meta.cost_usd != null || meta.duration_ms != null)) {
    const line = document.createElement('div');
    line.className = 'turn-meta mono';
    const parts = [];
    if (typeof meta.cost_usd === 'number') parts.push(`$${meta.cost_usd.toFixed(4)}`);
    if (typeof meta.duration_ms === 'number') parts.push(`${(meta.duration_ms / 1000).toFixed(1)} s`);
    if (turn.toolCount > 0) parts.push(plural(turn.toolCount, 'source'));
    line.textContent = parts.join(' · ');
    turn.el.appendChild(line);
  }
  tts.flush();
}

function onTurnEnd(ev) {
  finalizeTurn(ev);
  setStatus('online');
}

function onServerError(message) {
  finalizeTurn(null);
  hideEmpty();
  const pinned = pinnedToBottom();
  const card = document.createElement('div');
  card.className = 'error-card';
  card.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = message || 'The agent hit an error.';
  card.appendChild(text);
  if (lastUserText) {
    const retry = document.createElement('button');
    retry.className = 'retry-btn';
    retry.textContent = 'RETRY';
    retry.addEventListener('click', () => {
      card.remove();
      sendMessage(lastUserText);
    });
    card.appendChild(retry);
  }
  messagesEl.appendChild(card);
  scrollIfPinned(pinned);
  setStatus('online');
}

function addNotice(text) {
  const el = document.createElement('div');
  el.className = 'msg notice';
  el.textContent = text;
  messagesEl.appendChild(el);
  return el;
}

function renderUserMessage(text, thumbPath) {
  hideEmpty();
  finalizeTurn(null); // a new user turn closes any dangling assistant turn
  const el = document.createElement('div');
  el.className = 'msg user';
  el.textContent = text;
  if (thumbPath) {
    const img = document.createElement('img');
    img.className = 'upload-thumb';
    img.src = `/knowledge/${thumbPath}`;
    img.alt = 'Uploaded weld photo';
    el.appendChild(img);
  }
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function markFailed(msgEl, text) {
  const fail = document.createElement('div');
  fail.className = 'msg-fail';
  const label = document.createElement('span');
  label.textContent = 'Not delivered.';
  const retry = document.createElement('button');
  retry.className = 'retry-btn';
  retry.textContent = 'RETRY';
  retry.addEventListener('click', async () => {
    fail.remove();
    const ok = await postMessage(text);
    if (!ok) markFailed(msgEl, text);
  });
  fail.append(label, retry);
  msgEl.appendChild(fail);
}

/* ================= suggestions ================= */

const DEFAULT_SUGGESTIONS = [
  'Set up flux-core for 1/8 in steel',
  'My weld is porous — why?',
  'How do I switch polarity for MIG?',
  'Show me the wire feed path'
];

function renderSuggestions(items) {
  suggestionsEl.textContent = '';
  if (!Array.isArray(items)) return;
  for (const item of items.slice(0, 4)) {
    if (typeof item !== 'string' || !item) continue;
    const b = document.createElement('button');
    b.className = 'sugg';
    b.textContent = item;
    b.addEventListener('click', () => {
      sendMessage(item);
    });
    suggestionsEl.appendChild(b);
  }
}

/* ================= artifacts ================= */

const MACHINE_MIME = 'application/vnd.vulcan.machine-view';
const REACT_MIME = 'application/vnd.ant.react';

const BADGES = {
  [REACT_MIME]: 'REACT',
  'text/html': 'HTML',
  'image/svg+xml': 'SVG',
  'application/vnd.ant.mermaid': 'MERMAID',
  [MACHINE_MIME]: 'MACHINE'
};

const artifacts = new Map(); // id -> record
let shellHtml = null;
let expandedCard = null;
const backdrop = document.createElement('div');
backdrop.className = 'expand-backdrop';
backdrop.hidden = true;
document.body.appendChild(backdrop);

function updateArtifactCount() {
  const n = artifacts.size;
  artifactCountEl.hidden = n === 0;
  artifactCountEl.textContent = plural(n, 'ARTIFACT').toUpperCase();
  if (n > 0 && stackEmptyEl) stackEmptyEl.remove();
}

function badgeFor(type) {
  return BADGES[type] || 'DATA';
}

function createCard(id, type, title) {
  const card = document.createElement('article');
  card.className = 'artifact-card streaming';
  card.dataset.id = id;

  const head = document.createElement('header');
  head.className = 'card-head';
  const badge = document.createElement('span');
  badge.className = 'type-badge mono';
  badge.textContent = badgeFor(type);
  const titleEl = document.createElement('h3');
  titleEl.className = 'card-title';
  titleEl.textContent = title || id;
  const expand = document.createElement('button');
  expand.className = 'card-expand icon-btn';
  expand.setAttribute('aria-label', 'Expand artifact');
  expand.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11.5 3.5h5v5M8.5 16.5h-5v-5M16.5 3.5L11 9M3.5 16.5L9 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  head.append(badge, titleEl, expand);

  const body = document.createElement('div');
  body.className = 'card-body';
  const progress = document.createElement('div');
  progress.className = 'card-progress mono';
  progress.hidden = true;
  const source = document.createElement('pre');
  source.className = 'card-source mono';
  source.hidden = true;
  const error = document.createElement('div');
  error.className = 'card-error';
  error.hidden = true;
  error.setAttribute('role', 'alert');
  body.append(progress, source, error);

  card.append(head, body);
  stackEl.prepend(card); // newest first

  expand.addEventListener('click', () => toggleExpand(card, expand));
  return { card, body, badge, titleEl, progress, source, error };
}

function toggleExpand(card, btn) {
  const isOpen = card.classList.contains('expanded');
  if (expandedCard && expandedCard !== card) collapseExpanded();
  if (isOpen) {
    collapseExpanded();
    return;
  }
  card.classList.add('expanded');
  backdrop.hidden = false;
  expandedCard = card;
  btn.setAttribute('aria-label', 'Close expanded view');
  const frame = card.querySelector('.card-frame');
  if (frame) {
    frame.dataset.stackHeight = frame.style.height;
    frame.style.height = '';
  }
}

function collapseExpanded() {
  if (!expandedCard) return;
  const card = expandedCard;
  expandedCard = null;
  card.classList.remove('expanded');
  backdrop.hidden = true;
  const btn = card.querySelector('.card-expand');
  if (btn) btn.setAttribute('aria-label', 'Expand artifact');
  const frame = card.querySelector('.card-frame');
  if (frame && frame.dataset.stackHeight) frame.style.height = frame.dataset.stackHeight;
}

backdrop.addEventListener('click', collapseExpanded);

function makeFrame(rec) {
  if (rec.iframe || shellHtml === null) return;
  rec.frameKey = `af-${rec.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const iframe = document.createElement('iframe');
  iframe.className = 'card-frame';
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.title = `Artifact: ${rec.title || rec.id}`;
  iframe.srcdoc = shellHtml.replace(/__FRAME_ID__/g, rec.frameKey);
  iframe.hidden = rec.type === REACT_MIME; // react renders once, on end
  rec.ui.body.appendChild(iframe);
  rec.iframe = iframe;
}

function getOrCreateArtifact(id, type, title) {
  let rec = artifacts.get(id);
  if (rec) {
    // same identifier: update in place, never stack duplicates
    rec.type = type ?? rec.type;
    rec.title = title ?? rec.title;
    rec.source = '';
    rec.done = false;
    rec.ui.badge.textContent = badgeFor(rec.type);
    if (title) rec.ui.titleEl.textContent = title;
    rec.ui.error.hidden = true;
    rec.card.classList.add('streaming');
    return rec;
  }
  const ui = createCard(id, type, title);
  rec = {
    id,
    type,
    title,
    source: '',
    done: false,
    card: ui.card,
    ui,
    iframe: null,
    frameReady: false,
    pending: null,
    debounce: 0,
    watchdog: 0
  };
  artifacts.set(id, rec);
  updateArtifactCount();

  if (type === MACHINE_MIME) {
    const link = document.createElement('button');
    link.className = 'machine-link';
    link.innerHTML = '<span class="target"></span><span class="mv-label">Preparing view…</span>';
    link.addEventListener('click', () => {
      if (rec.spec) focusMachine(rec.spec);
    });
    ui.body.appendChild(link);
    rec.machineLink = link;
  } else {
    makeFrame(rec);
  }
  return rec;
}

// Parent -> shell. Prefers the MessagePort transferred at shell-ready;
// direct WindowProxy postMessage is the fallback (unreliable in some builds).
function sendToShell(rec, payload) {
  const msg = { type: 'render-artifact', payload };
  if (rec.port) {
    rec.port.postMessage(msg);
    return true;
  }
  try {
    rec.iframe.contentWindow.postMessage(msg, '*');
    return true;
  } catch {
    return false;
  }
}

function postRender(rec, final) {
  if (!rec.iframe) makeFrame(rec);
  if (!rec.iframe) {
    // shell fetch failed: no sandbox available
    showArtifactError(rec, 'artifact renderer unavailable (failed to load shell)');
    return;
  }
  const payload = {
    id: rec.id,
    artifactType: rec.type,
    source: rec.source,
    final
  };
  if (!rec.frameReady) {
    rec.pending = payload; // latest wins; flushed on shell-ready
    return;
  }
  if (!sendToShell(rec, payload)) {
    showArtifactError(rec, 'artifact renderer unreachable');
    return;
  }
  if (final) armWatchdog(rec);
}

function armWatchdog(rec) {
  clearTimeout(rec.watchdog);
  rec.watchdog = setTimeout(() => {
    showArtifactError(rec, 'render timed out after 5 s');
  }, 5000);
}

function showArtifactError(rec, message) {
  clearTimeout(rec.watchdog);
  rec.card.classList.remove('streaming');
  rec.ui.error.textContent = message;
  rec.ui.error.hidden = false;
  rec.ui.progress.hidden = true;
  // keep the source preview visible for debugging when we have one
  if (rec.source && rec.type === REACT_MIME) rec.ui.source.hidden = false;
}

function artifactRendered(rec) {
  clearTimeout(rec.watchdog);
  rec.card.classList.remove('streaming');
  rec.ui.error.hidden = true;
  if (rec.iframe) rec.iframe.hidden = false;
  rec.ui.progress.hidden = true;
  rec.ui.source.hidden = true;
}

function onArtifactStart(ev) {
  setStatus('working');
  getOrCreateArtifact(ev.id, ev.artifact_type, ev.title);
}

function onArtifactDelta(ev) {
  setStatus('working');
  // Tolerate a missed artifact_start (e.g. reconnect mid-stream).
  const rec = artifacts.get(ev.id) || getOrCreateArtifact(ev.id, undefined, 'Artifact');
  rec.source += ev.text;

  if (rec.type === REACT_MIME) {
    // Babel per-delta is wasteful: show live progress + dimmed source instead.
    const lines = rec.source.split('\n').length;
    rec.ui.progress.textContent = `writing component · ${plural(lines, 'line')}`;
    rec.ui.progress.hidden = false;
    rec.ui.source.textContent = rec.source;
    rec.ui.source.hidden = false;
    rec.ui.source.scrollTop = rec.ui.source.scrollHeight;
  } else if (rec.type === MACHINE_MIME) {
    // machine views render once, on end
  } else {
    clearTimeout(rec.debounce);
    rec.debounce = setTimeout(() => postRender(rec, false), 150);
  }
}

function onArtifactEnd(ev) {
  const rec = artifacts.get(ev.id);
  if (!rec) return;
  rec.done = true;
  clearTimeout(rec.debounce);

  if (rec.type === MACHINE_MIME) {
    rec.card.classList.remove('streaming');
    let spec = null;
    try {
      spec = JSON.parse(rec.source.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/```\s*$/, ''));
    } catch {
      showArtifactError(rec, 'invalid machine-view payload');
      return;
    }
    rec.spec = spec;
    if (rec.machineLink) {
      rec.machineLink.querySelector('.target').textContent = `→ ${spec.target || '?'}`;
      rec.machineLink.querySelector('.mv-label').textContent = spec.label || 'Machine view';
    }
    focusMachine(spec);
    return;
  }
  postRender(rec, true);
}

// shell -> parent messages. The shell mirrors every message to its transferred
// port and to window; the port is authoritative once established.
function handleShellMessage(rec, d) {
  switch (d.type) {
    case 'shell-ready':
      rec.frameReady = true;
      if (rec.pending) {
        const p = rec.pending;
        rec.pending = null;
        if (sendToShell(rec, p) && p.final) armWatchdog(rec);
      }
      break;
    case 'artifact-resize': {
      const h = Math.max(60, Math.min(Number(d.height) || 0, 640));
      if (!rec.card.classList.contains('expanded')) rec.iframe.style.height = `${h}px`;
      break;
    }
    case 'artifact-progress':
      if (rec.watchdog) armWatchdog(rec); // dependency loading extends the deadline
      break;
    case 'artifact-rendered':
      artifactRendered(rec);
      break;
    case 'artifact-error':
      if (rec.done) showArtifactError(rec, String(d.message || 'render failed'));
      break;
  }
}

window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d.type !== 'string' || typeof d.frame !== 'string') return;
  let rec = null;
  for (const r of artifacts.values()) {
    if (r.iframe && r.frameKey === d.frame) { rec = r; break; }
  }
  if (!rec) return;
  if (d.type === 'shell-ready') {
    const port = e.ports && e.ports[0];
    if (port) {
      rec.port = port;
      port.onmessage = (pe) => handleShellMessage(rec, pe.data || {});
    }
    handleShellMessage(rec, d);
    return;
  }
  if (rec.port) return; // deduped: the port already delivered this message
  handleShellMessage(rec, d);
});

/* ================= machine view ================= */

let pendingFocus = null;

function focusMachine(spec) {
  machinePanel.classList.remove('collapsed');
  machineToggle.setAttribute('aria-expanded', 'true');
  machineToggle.textContent = 'COLLAPSE';
  if (window.MachineView) {
    window.MachineView.focus(spec);
  } else {
    pendingFocus = spec;
  }
  machinePanel.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
}

document.addEventListener('machineview-ready', () => {
  if (pendingFocus) {
    window.MachineView.focus(pendingFocus);
    pendingFocus = null;
  }
});

machineToggle.addEventListener('click', () => {
  const collapsed = machinePanel.classList.toggle('collapsed');
  machineToggle.setAttribute('aria-expanded', String(!collapsed));
  machineToggle.textContent = collapsed ? 'EXPAND' : 'COLLAPSE';
});

machineReset.addEventListener('click', () => {
  if (window.MachineView) window.MachineView.idle();
});

/* ================= lightbox ================= */

let lightboxReturnFocus = null;

function openLightbox(src, alt, trigger) {
  lightboxImg.src = src;
  lightboxImg.alt = alt || 'Expanded image';
  lightboxEl.hidden = false;
  lightboxReturnFocus = trigger || null;
  lightboxClose.focus();
}

function closeLightbox() {
  lightboxEl.hidden = true;
  lightboxImg.src = '';
  if (lightboxReturnFocus) {
    lightboxReturnFocus.focus();
    lightboxReturnFocus = null;
  }
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxEl.addEventListener('click', (e) => {
  if (e.target === lightboxEl) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!lightboxEl.hidden) closeLightbox();
  else if (expandedCard) collapseExpanded();
});

/* ================= TTS ================= */

const tts = {
  enabled: false,
  buf: '',
  push(text) {
    if (!this.enabled) return;
    this.buf += text;
    this.drain(false);
  },
  drain(force) {
    // hold back unterminated code fences entirely
    const fenceCount = (this.buf.match(/```/g) || []).length;
    let speakable = this.buf;
    let held = '';
    if (fenceCount % 2 === 1) {
      const idx = this.buf.lastIndexOf('```');
      speakable = this.buf.slice(0, idx);
      held = this.buf.slice(idx);
    }
    speakable = speakable.replace(/```[\s\S]*?```/g, ' code block omitted. ');
    const parts = speakable.split(/(?<=[.!?])\s+/);
    const remainder = force ? '' : parts.pop() || '';
    for (const sentence of parts) this.speak(sentence);
    this.buf = force ? '' : remainder + held;
  },
  speak(sentence) {
    const clean = sentence
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_#>|~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean || !/[a-zA-Z0-9]/.test(clean)) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  },
  flush() {
    if (this.enabled && this.buf.trim()) this.drain(true);
    this.buf = '';
  },
  toggle() {
    this.enabled = !this.enabled;
    ttsBtn.setAttribute('aria-pressed', String(this.enabled));
    if (!this.enabled) {
      speechSynthesis.cancel();
      this.buf = '';
    }
  }
};

if ('speechSynthesis' in window) {
  ttsBtn.addEventListener('click', () => tts.toggle());
} else {
  ttsBtn.hidden = true;
}

/* ================= speech input ================= */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  let recognizing = false;
  let baseText = '';
  const rec = new SR();
  rec.interimResults = true;
  rec.continuous = false;

  micBtn.addEventListener('click', () => {
    if (recognizing) {
      rec.stop();
      return;
    }
    baseText = inputEl.value ? inputEl.value.replace(/\s*$/, ' ') : '';
    try {
      rec.start();
    } catch {
      return; // already starting
    }
    recognizing = true;
    micBtn.classList.add('recording');
    micBtn.setAttribute('aria-pressed', 'true');
  });

  rec.onresult = (e) => {
    let transcript = '';
    for (const result of e.results) transcript += result[0].transcript;
    inputEl.value = baseText + transcript;
    autosize();
  };
  rec.onend = rec.onerror = () => {
    recognizing = false;
    micBtn.classList.remove('recording');
    micBtn.setAttribute('aria-pressed', 'false');
    inputEl.focus();
  };
} else {
  micBtn.hidden = true; // graceful hide when unsupported
}

/* ================= composer ================= */

function autosize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
}
inputEl.addEventListener('input', autosize);

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submitInput();
  }
});

sendBtn.addEventListener('click', submitInput);

function submitInput() {
  const text = inputEl.value;
  if (!text.trim()) return;
  inputEl.value = '';
  autosize();
  sendMessage(text);
  inputEl.focus();
}

/* ================= upload ================= */

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  uploadBtn.classList.add('busy');
  uploadBtn.disabled = true;
  try {
    const ok = await ensureSession();
    if (!ok) throw new Error('no session');
    const form = new FormData();
    form.append('file', file, file.name);
    const res = await fetch(`/api/session/${sessionId}/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    const { path } = await res.json();
    sendMessage(
      `I uploaded a photo of my weld at ${path} — please look at it and diagnose`,
      { thumbPath: path }
    );
  } catch (err) {
    addNotice(`Photo upload failed: ${err.message}`);
  } finally {
    uploadBtn.classList.remove('busy');
    uploadBtn.disabled = false;
  }
});

/* ================= session + SSE ================= */

let sessionId = null;
let offlineNoticeShown = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createSession() {
  const res = await fetch('/api/session', { method: 'POST' });
  if (!res.ok) throw new Error(`session create failed (${res.status})`);
  const data = await res.json();
  if (!data || typeof data.session_id !== 'string') throw new Error('bad session response');
  sessionId = data.session_id;
  return sessionId;
}

async function ensureSession() {
  if (sessionId) return true;
  try {
    await createSession();
    return true;
  } catch {
    return false;
  }
}

async function postMessage(text) {
  if (!(await ensureSession())) return false;
  const attempt = () => fetch(`/api/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  });
  try {
    let res = await attempt();
    if (res.status === 404) {
      // session reaped server-side: start a fresh one and retry once
      await createSession();
      res = await attempt();
    }
    return res.ok;
  } catch {
    return false;
  }
}

async function sendMessage(text, opts = {}) {
  const trimmed = text.trim();
  if (!trimmed) return;
  lastUserText = trimmed;
  const el = renderUserMessage(trimmed, opts.thumbPath);
  renderSuggestions([]);
  setStatus('working');
  const ok = await postMessage(trimmed);
  if (!ok) {
    setStatus(sessionId ? 'online' : 'offline');
    markFailed(el, trimmed);
  }
}

function handleEvent(ev) {
  if (!ev || typeof ev.type !== 'string') return;
  switch (ev.type) {
    case 'ready': setStatus('online'); break;
    case 'text_delta': if (typeof ev.text === 'string') onTextDelta(ev.text); break;
    case 'artifact_start': if (typeof ev.id === 'string') onArtifactStart(ev); break;
    case 'artifact_delta': if (typeof ev.id === 'string' && typeof ev.text === 'string') onArtifactDelta(ev); break;
    case 'artifact_end': if (typeof ev.id === 'string') onArtifactEnd(ev); break;
    case 'tool': onTool(ev); break;
    case 'suggestions': renderSuggestions(ev.items); break;
    case 'turn_end': onTurnEnd(ev); break;
    case 'error': onServerError(ev.message); break;
    default: break; // unknown event types are ignored by contract
  }
}

// console/simulation hook: window.__vulcan.dispatch(event)
window.__vulcan = { dispatch: handleEvent };

async function consumeStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        handleEvent(JSON.parse(data));
      } catch {
        // malformed frame: skip, never crash the stream
      }
    }
  }
}

async function streamLoop() {
  let backoff = 500;
  for (;;) {
    if (!(await ensureSession())) {
      setStatus('offline');
      if (!offlineNoticeShown) {
        offlineNoticeShown = true;
        addNotice('Backend offline — interface running in preview mode. Retrying connection.');
      }
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 15000);
      continue;
    }
    try {
      const res = await fetch(`/api/session/${sessionId}/stream`, {
        headers: { accept: 'text/event-stream' }
      });
      if (res.status === 404) {
        sessionId = null; // reaped: next loop creates a fresh session
        continue;
      }
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      backoff = 500;
      setStatus('online');
      await consumeStream(res.body);
      // clean end of stream: reconnect, existing UI state is preserved
    } catch {
      // network drop: fall through to backoff
    }
    setStatus('reconnecting');
    await sleep(backoff * (0.75 + Math.random() * 0.5));
    backoff = Math.min(backoff * 2, 15000);
  }
}

/* ================= boot ================= */

(async function boot() {
  renderSuggestions(DEFAULT_SUGGESTIONS);
  if (window.matchMedia('(max-width: 880px)').matches) {
    inputEl.placeholder = 'Ask the expert…';
  }
  autosize();
  setStatus('connecting');
  try {
    const res = await fetch('/web/artifact-shell.html');
    shellHtml = res.ok ? await res.text() : null;
  } catch {
    shellHtml = null;
  }
  streamLoop();
})();

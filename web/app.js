// Vulcan OmniPro 220 Technical Expert — frontend application.
// Talks to the backend over the frozen HTTP/SSE contract; renders streamed
// markdown, tool step-lines, artifacts (sandboxed shell iframes) and machine views.

'use strict';

/* ================= DOM ================= */

const $ = (id) => document.getElementById(id);
const messagesEl = $('messages');
const newBtn = $('new-chat');
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

// Community-sourced field citations: [field: r/Welding ×5], optionally linked
// by a directly following markdown-style (url). Groups 3 (label) / 4 (url)
// follow CITE_RE's groups 1 (doc) / 2 (page).
const CHIP_RE = new RegExp(`${CITE_RE.source}|\\[field:\\s*([^\\]]+)\\](?:\\((\\S+?)\\))?`, 'gi');
const FIELD_TITLE = 'Community-sourced — not from the manual';

function makeFieldChip(el, label) {
  el.classList.add('cite-field');
  el.title = FIELD_TITLE;
  const glyph = document.createElement('span');
  glyph.className = 'field-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '▴';
  el.textContent = '';
  el.append(glyph, document.createTextNode(label));
}

function citeHref(doc, page) {
  const d = doc.toLowerCase();
  let file;
  if (/^quick/.test(d)) file = 'quick-start-guide.pdf';
  else if (/^selection/.test(d)) file = 'selection-chart.pdf';
  else file = 'owner-manual.pdf';
  return `/files/${file}#page=${page}`;
}

// Turn [manual p.19]-style citations and [field: …] community references in
// plain text nodes into chips.
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
    if (CHIP_RE.test(n.nodeValue)) targets.push(n);
    CHIP_RE.lastIndex = 0;
  }
  for (const textNode of targets) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const text = textNode.nodeValue;
    for (const m of text.matchAll(CHIP_RE)) {
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1] !== undefined) {
        const a = document.createElement('a');
        a.className = 'cite';
        a.href = citeHref(m[1], m[2]);
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = m[0];
        frag.appendChild(a);
      } else {
        const el = document.createElement(m[4] ? 'a' : 'span');
        if (m[4]) {
          el.href = m[4];
          el.target = '_blank';
          el.rel = 'noopener';
        }
        makeFieldChip(el, `field: ${m[3].trim()}`);
        frag.appendChild(el);
      }
      last = m.index + m[0].length;
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.replaceWith(frag);
  }
  // Markdown already turned [field: …](url) into a plain link before this
  // pass ran; restyle that anchor as a linked field chip.
  for (const a of rootEl.querySelectorAll('a')) {
    if (a.classList.contains('cite') || a.classList.contains('cite-field')) continue;
    const m = a.textContent.match(/^\s*field:\s*(.+?)\s*$/i);
    if (m) makeFieldChip(a, `field: ${m[1]}`);
  }
}

// machine.js reuses the citation-linkifier for tutorial captions
window.VulcanCite = { linkify: linkifyCitations };

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
// with tool step-lines, so activity appears exactly where the agent used tools.

let currentTurn = null;
let lastUserText = null;

function hideEmpty() {
  const el = $('chat-empty');
  if (el) el.remove();
}

// empty state — the annual-report cover: circle plate with horizon band,
// small editorial greeting, numbered hairline-ruled starter index
function buildEmptyState() {
  const wrap = document.createElement('div');
  wrap.className = 'chat-empty';
  wrap.id = 'chat-empty';
  const plate = document.createElement('div');
  plate.className = 'cover-plate';
  plate.setAttribute('role', 'img');
  plate.setAttribute('aria-label', 'Vulcan OmniPro 220 welder');
  const greet = document.createElement('p');
  greet.className = 'empty-greeting';
  greet.textContent = 'How can I help you today?';
  const list = document.createElement('div');
  list.className = 'starter-list';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Suggested questions');
  DEFAULT_SUGGESTIONS.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'starter';
    const idx = document.createElement('span');
    idx.className = 'starter-idx mono';
    idx.setAttribute('aria-hidden', 'true');
    idx.textContent = String(i + 1).padStart(2, '0');
    const label = document.createElement('span');
    label.className = 'starter-text';
    label.textContent = item;
    b.append(idx, label);
    b.addEventListener('click', () => sendMessage(item));
    list.appendChild(b);
  });
  wrap.append(plate, greet, list);
  return wrap;
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
  currentTurn = { el, content, segments: [], toolCount: 0, sources: new Map() };
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

// step-line glyphs: file for reads, wrench for searches, chevron trailing
const GLYPH_FILE = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5L12.5 5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 1.5V5h3.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const GLYPH_WRENCH = '<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.6 4.2a3.4 3.4 0 0 1-4.5 4.5l-4.3 4.3a1.3 1.3 0 0 1-1.8-1.8l4.3-4.3a3.4 3.4 0 0 1 4.5-4.5L9.5 4.7l1.8 1.8 2.3-2.3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const GLYPH_CHEV_RIGHT = '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GLYPH_CHEV_DOWN = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Map a tool detail (file path or search pattern) to a deduped source entry.
// Page PNGs link to the matching PDF anchor; knowledge files link directly.
const PAGE_RE = /(owner-manual|quick-start|selection-chart)[^/]*?-p(\d+)\.png/i;
const PDF_FILES = {
  'owner-manual': 'owner-manual.pdf',
  'quick-start': 'quick-start-guide.pdf',
  'selection-chart': 'selection-chart.pdf'
};
const DOC_TITLES = {
  'owner-manual': 'Owner’s manual',
  'quick-start': 'Quick-start guide',
  'selection-chart': 'Selection chart'
};

function classifyToolDetail(detail) {
  if (typeof detail !== 'string' || !detail) return null;
  const page = detail.match(PAGE_RE);
  if (page) {
    const doc = page[1].toLowerCase();
    const n = parseInt(page[2], 10);
    return {
      key: `${doc}#${n}`,
      step: `${doc} p.${n}`,
      link: `${DOC_TITLES[doc]} · p.${n}`,
      href: `/files/${PDF_FILES[doc]}#page=${n}`
    };
  }
  if (/[*?[\]{}|]/.test(detail)) return null; // glob/regex pattern, not a file
  const ki = detail.lastIndexOf('knowledge/');
  if (ki < 0) return null;
  const rel = detail.slice(ki + 'knowledge/'.length).replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) return null;
  const base = rel.split('/').pop();
  return { key: `k:${rel}`, step: base, link: base, href: `/knowledge/${rel}`, title: rel };
}

const shortText = (s, n = 44) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function stepText(ev) {
  const verb = TOOL_VERBS[ev.name] || ev.name;
  const src = classifyToolDetail(ev.detail);
  if (src) return `${verb} ${src.step}…`;
  const d = (ev.detail || '').trim();
  if (!d) return `${verb} the manuals…`;
  const t = d.includes('/') && !/[*?[\]{}|\s]/.test(d) ? d.split('/').pop() : d;
  return `${verb} “${shortText(t)}”…`;
}

function onTool(ev) {
  setStatus('working');
  const turn = ensureTurn();
  let seg = lastSegment(turn);
  if (!seg || seg.kind !== 'steps') {
    const el = document.createElement('div');
    el.className = 'steps';
    turn.content.appendChild(el);
    seg = { kind: 'steps', el };
    turn.segments.push(seg);
  }
  const prev = seg.el.querySelector('.step-line.running');
  if (prev) prev.classList.remove('running');

  const pinned = pinnedToBottom();
  const line = document.createElement('div');
  line.className = 'step-line running';
  line.innerHTML = `${ev.name === 'Read' ? GLYPH_FILE : GLYPH_WRENCH}<span class="step-label"></span>${GLYPH_CHEV_RIGHT}`;
  line.querySelector('.step-label').textContent = stepText(ev);
  seg.el.appendChild(line);
  turn.toolCount += 1;
  const src = classifyToolDetail(ev.detail);
  if (src && !turn.sources.has(src.key)) turn.sources.set(src.key, src);
  scrollIfPinned(pinned);
}

// "Used N sources ⌄" — distinct files/pages touched this turn, as links
function buildSourcesExpander(sources) {
  const n = sources.size;
  const details = document.createElement('details');
  details.className = 'sources';
  const summary = document.createElement('summary');
  const label = document.createElement('span');
  label.textContent = `Used ${plural(n, 'source')}`;
  summary.appendChild(label);
  summary.insertAdjacentHTML('beforeend', GLYPH_CHEV_DOWN);
  const list = document.createElement('div');
  list.className = 'source-list';
  for (const src of sources.values()) {
    const a = document.createElement('a');
    a.className = 'source-link';
    a.href = src.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = src.link;
    if (src.title) a.title = src.title;
    list.appendChild(a);
  }
  details.append(summary, list);
  return details;
}

function finalizeTurn(meta) {
  const turn = currentTurn;
  currentTurn = null;
  if (!turn) return;
  const pinned = pinnedToBottom();
  for (const seg of turn.segments) {
    if (seg.kind === 'steps') seg.el.remove();
  }
  if (turn.sources.size > 0) turn.content.appendChild(buildSourcesExpander(turn.sources));
  if (meta && (meta.cost_usd != null || meta.duration_ms != null)) {
    const line = document.createElement('div');
    line.className = 'turn-meta';
    const parts = [];
    if (typeof meta.cost_usd === 'number') parts.push(`$${meta.cost_usd.toFixed(4)}`);
    if (typeof meta.duration_ms === 'number') parts.push(`${(meta.duration_ms / 1000).toFixed(1)} s`);
    line.textContent = parts.join(' · ');
    turn.el.appendChild(line);
  }
  scrollIfPinned(pinned);
  tts.flush();
}

function onTurnEnd(ev) {
  finalizeTurn(ev);
  setStatus('online');
  if (practiceMode && !machineTouchedThisTurn && window.MachineView) {
    window.MachineView.idle();
  }
  machineTouchedThisTurn = false;
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
    retry.textContent = 'Retry';
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
  const job = text.match(/^\[job\]\s*([\s\S]*)$/i);
  if (job) {
    // job/system notes render as the quiet callout pattern, bold lead
    el.className = 'msg job';
    const body = job[1].trim() || 'Job update';
    const dash = body.indexOf(' — ');
    const lead = document.createElement('strong');
    lead.textContent = dash > 0 ? body.slice(0, dash) : body;
    el.appendChild(lead);
    if (dash > 0) el.appendChild(document.createTextNode(body.slice(dash)));
  } else {
    el.className = 'msg user';
    el.textContent = text;
  }
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
  retry.textContent = 'Retry';
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
const TUTORIAL_MIME = 'application/vnd.vulcan.tutorial';
const PANEL_MIME = 'application/vnd.vulcan.panel-state';
const REACT_MIME = 'application/vnd.ant.react';

const BADGES = {
  [REACT_MIME]: 'REACT',
  'text/html': 'HTML',
  'image/svg+xml': 'SVG',
  'application/vnd.ant.mermaid': 'MERMAID',
  [MACHINE_MIME]: 'MACHINE',
  [TUTORIAL_MIME]: 'TUTORIAL',
  [PANEL_MIME]: 'PANEL'
};

const PRINTABLE = new Set(['text/html', REACT_MIME]);

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
  const print = document.createElement('button');
  print.type = 'button';
  print.className = 'card-print';
  print.textContent = 'Print';
  print.setAttribute('aria-label', 'Print artifact');
  print.hidden = !PRINTABLE.has(type);
  head.append(badge, titleEl, print, expand);

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
  print.addEventListener('click', () => {
    const rec = artifacts.get(id);
    if (rec) printArtifact(rec);
  });
  return { card, body, badge, titleEl, progress, source, error, print };
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
    rec.ui.print.hidden = !PRINTABLE.has(rec.type);
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
    watchdog: 0,
    printReply: null
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
  } else if (type === TUTORIAL_MIME) {
    const link = document.createElement('button');
    link.className = 'machine-link tutorial-link';
    link.innerHTML = '<span class="target">TUTORIAL</span><span class="mv-label">Preparing tutorial…</span>';
    link.addEventListener('click', () => {
      machinePanel.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
    });
    const steps = document.createElement('ol');
    steps.className = 'tutorial-steps'; // visible when the card is expanded
    ui.body.append(link, steps);
    rec.tutorialLink = link;
    rec.stepsEl = steps;
  } else if (type === PANEL_MIME) {
    const link = document.createElement('button');
    link.className = 'machine-link panel-link';
    link.innerHTML = '<span class="target">PANEL</span><span class="mv-label">Preparing settings…</span>';
    link.addEventListener('click', () => {
      if (rec.panelSpec) applyPanelState(rec.panelSpec);
    });
    const cite = document.createElement('p');
    cite.className = 'panel-cite mono';
    cite.hidden = true;
    ui.body.append(link, cite);
    rec.panelLink = link;
    rec.citeEl = cite;
  } else {
    makeFrame(rec);
  }
  return rec;
}

// Parent -> shell. Prefers the MessagePort transferred at shell-ready;
// direct WindowProxy postMessage is the fallback (unreliable in some builds).
function postToShell(rec, msg) {
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

function sendToShell(rec, payload) {
  return postToShell(rec, { type: 'render-artifact', payload });
}

/* ---------- print ---------- */

const PRINT_CSS = [
  '@page { margin: 12mm; }',
  'html, body { background: #FFFFFF; color: #000000; }',
  'body { margin: 0; font: 14px/1.5 "Geist", system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; }',
  '.no-print { display: none !important; }',
  'pre { white-space: pre-wrap; overflow-wrap: break-word; }'
].join('\n');

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Fill an already-opened window with printable content and trigger the dialog.
// withTailwind pulls the same CDN build the shell loads, so react artifacts
// keep utility-class fidelity in print.
function writePrintDoc(w, title, bodyHtml, withTailwind) {
  const doc = w.document;
  doc.open();
  doc.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>'
    + escapeHtml(title || 'Artifact')
    + '</title>'
    + (withTailwind ? '<script src="https://cdn.tailwindcss.com/3.4.5"><\/script>' : '')
    + '<style>' + PRINT_CSS + '</style></head><body>'
    + bodyHtml
    + '</body></html>'
  );
  doc.close();
  const go = () => setTimeout(() => {
    try { w.focus(); w.print(); } catch { /* window already closed */ }
  }, withTailwind ? 350 : 50); // let Tailwind JIT / fonts settle first
  if (doc.readyState === 'complete') go();
  else w.addEventListener('load', go, { once: true });
}

function printArtifact(rec) {
  // window.open happens synchronously in the click, keeping popup blockers quiet
  const w = window.open('', '_blank');
  if (!w) return;
  if (rec.type !== REACT_MIME) {
    writePrintDoc(w, rec.title || rec.id, rec.source, false);
    return;
  }
  // React: the sandbox is opaque-origin, so ask the shell for its rendered
  // DOM over the existing channel; raw source in a <pre> is the 1 s fallback.
  let settled = false;
  const finish = (html, tailwind) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    rec.printReply = null;
    writePrintDoc(w, rec.title || rec.id, html, tailwind);
  };
  const timer = setTimeout(() => {
    finish(`<pre>${escapeHtml(rec.source)}</pre>`, false);
  }, 1000);
  rec.printReply = (html) => finish(html, true);
  if (!rec.iframe || !postToShell(rec, { type: 'print-request' })) {
    finish(`<pre>${escapeHtml(rec.source)}</pre>`, false);
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
  } else if (rec.type === MACHINE_MIME || rec.type === TUTORIAL_MIME || rec.type === PANEL_MIME) {
    // machine views, tutorials and panel states render once, on end
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

  if (rec.type === TUTORIAL_MIME) {
    rec.card.classList.remove('streaming');
    let script = null;
    try {
      script = JSON.parse(rec.source.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/```\s*$/, ''));
    } catch {
      script = null;
    }
    if (!script || typeof script !== 'object' || !Array.isArray(script.steps) || !script.steps.length) {
      // malformed payload degrades to a plain code card with an error note
      rec.ui.source.textContent = rec.source;
      rec.ui.source.hidden = false;
      showArtifactError(rec, 'invalid tutorial payload — showing raw source');
      return;
    }
    startTutorial(rec, script);
    return;
  }
  if (rec.type === PANEL_MIME) {
    rec.card.classList.remove('streaming');
    let spec = null;
    try {
      spec = JSON.parse(rec.source.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/```\s*$/, ''));
    } catch {
      spec = null;
    }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      // malformed payload degrades to a plain code card with an error note
      if (rec.panelLink) rec.panelLink.hidden = true;
      rec.ui.source.textContent = rec.source;
      rec.ui.source.hidden = false;
      showArtifactError(rec, 'invalid panel-state payload — showing raw source');
      return;
    }
    if (rec.panelLink) rec.panelLink.hidden = false;
    rec.panelSpec = spec;
    if (rec.panelLink) {
      rec.panelLink.querySelector('.target').textContent = '→ front-panel';
      rec.panelLink.querySelector('.mv-label').textContent =
        [spec.process, spec.voltage].filter((s) => typeof s === 'string' && s).join(' · ') || 'Panel settings';
    }
    if (rec.citeEl) {
      const cite = typeof spec.cite === 'string' && spec.cite.trim();
      rec.citeEl.hidden = !cite;
      if (cite) {
        rec.citeEl.textContent = `[${cite}]`;
        linkifyCitations(rec.citeEl);
      }
    }
    applyPanelState(spec);
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
    case 'print-html':
      if (rec.printReply) rec.printReply(String(d.html ?? ''));
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

/* ================= machine view + tutorials ================= */

let pendingFocus = null;
let pendingTutorial = null;
let pendingPanel = null;
let tutorialRec = null; // artifact card mirroring the running tutorial
// Set when a machine-view/panel-state/tutorial artifact lands during a turn;
// practice mode returns the camera to idle on turn end unless one arrived.
let machineTouchedThisTurn = false;

function focusMachine(spec) {
  machinePanel.classList.remove('collapsed');
  machineToggle.setAttribute('aria-expanded', 'true');
  machineToggle.textContent = 'COLLAPSE';
  machineTouchedThisTurn = true;
  if (window.MachineView) {
    window.MachineView.focus(spec);
  } else {
    pendingFocus = spec;
  }
  machinePanel.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
}

// Route a panel-state spec into the settings twin (mirrors focusMachine).
function applyPanelState(spec) {
  machinePanel.classList.remove('collapsed');
  machineToggle.setAttribute('aria-expanded', 'true');
  machineToggle.textContent = 'COLLAPSE';
  machineTouchedThisTurn = true;
  if (window.MachineView && window.MachineView.panelState) {
    window.MachineView.panelState(spec);
  } else {
    pendingPanel = spec;
  }
  machinePanel.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
}

// Route a parsed tutorial script into the 3D runtime; same-id updates land
// here again and restart the player with the new script.
function startTutorial(rec, script) {
  machineTouchedThisTurn = true;
  tutorialRec = rec;
  if (rec.tutorialLink) {
    rec.tutorialLink.querySelector('.mv-label').textContent =
      typeof script.title === 'string' && script.title ? script.title : 'Guided tutorial';
  }
  if (rec.stepsEl) {
    rec.stepsEl.textContent = '';
    for (const step of script.steps.slice(0, 12)) {
      const li = document.createElement('li');
      li.textContent = (typeof step?.caption === 'string' ? step.caption : '(no caption)')
        + (typeof step?.cite === 'string' ? ` [${step.cite}]` : '');
      rec.stepsEl.appendChild(li);
    }
    linkifyCitations(rec.stepsEl);
  }
  machinePanel.classList.remove('collapsed');
  machineToggle.setAttribute('aria-expanded', 'true');
  machineToggle.textContent = 'COLLAPSE';
  if (window.MachineView && window.MachineView.tutorial) {
    if (!window.MachineView.tutorial(script)) {
      rec.ui.source.textContent = rec.source;
      rec.ui.source.hidden = false;
      showArtifactError(rec, 'tutorial has no playable steps — showing raw source');
      return;
    }
  } else {
    pendingTutorial = script;
  }
  machinePanel.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
}

document.addEventListener('machineview-ready', () => {
  if (pendingFocus) {
    window.MachineView.focus(pendingFocus);
    pendingFocus = null;
  }
  if (pendingTutorial) {
    window.MachineView.tutorial(pendingTutorial);
    pendingTutorial = null;
  }
  if (pendingPanel) {
    window.MachineView.panelState(pendingPanel);
    pendingPanel = null;
  }
});

// the runtime reports player state; mirror it on the tutorial artifact card
document.addEventListener('vulcan:tutorial-state', (e) => {
  if (!tutorialRec || !tutorialRec.tutorialLink) return;
  const d = e.detail || {};
  const label = tutorialRec.tutorialLink.querySelector('.target');
  if (d.ended) label.textContent = '✓ FINISHED';
  else if (d.playing) label.textContent = `▶ STEP ${d.step}/${d.total}`;
  else label.textContent = `⏸ STEP ${d.step}/${d.total}`;
});

// tutorial captions go through the existing TTS path when the toggle is on
document.addEventListener('vulcan:tutorial-caption', (e) => {
  if (!tts.enabled || !('speechSynthesis' in window)) return;
  const caption = e.detail && e.detail.caption;
  if (typeof caption !== 'string' || !caption) return;
  speechSynthesis.cancel(); // captions preempt queued reply speech
  tts.speak(caption);
});

machineToggle.addEventListener('click', () => {
  const collapsed = machinePanel.classList.toggle('collapsed');
  machineToggle.setAttribute('aria-expanded', String(!collapsed));
  machineToggle.textContent = collapsed ? 'EXPAND' : 'COLLAPSE';
});

machineReset.addEventListener('click', () => {
  if (window.MachineView) window.MachineView.idle();
});

/* ================= ask-by-touching + practice mode ================= */

const machineCanvasEl = $('machine-canvas');
const practiceBtn = $('practice-toggle');
const practiceChip = $('practice-chip');
let practiceMode = false;
let popoverEl = null;

function dismissPopover() {
  if (!popoverEl) return;
  popoverEl.remove();
  popoverEl = null;
}

function popoverAction(label, message) {
  const b = document.createElement('button');
  b.className = 'hp-btn';
  b.textContent = label;
  b.addEventListener('click', () => {
    dismissPopover();
    sendMessage(message);
  });
  return b;
}

function showHotspotPopover(d) {
  dismissPopover();
  const pop = document.createElement('div');
  pop.className = 'hotspot-popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', d.label);
  const name = document.createElement('p');
  name.className = 'hp-name';
  name.textContent = d.label;
  const actions = document.createElement('div');
  actions.className = 'hp-actions';
  if (d.tutorialActive) {
    // mid-tutorial clicks answer the running quiz/step — one action only
    actions.append(popoverAction("That's my answer", `[clicked ${d.id}]`));
  } else {
    actions.append(
      popoverAction('What is this?', `[clicked ${d.id}]`),
      popoverAction('Show me how', `[clicked ${d.id} — show me]`)
    );
  }
  pop.append(name, actions);
  machineCanvasEl.appendChild(pop);
  const half = pop.offsetWidth / 2;
  const x = Math.min(Math.max(d.x, half + 8), machineCanvasEl.clientWidth - half - 8);
  const above = d.y - pop.offsetHeight - 16 >= 4;
  pop.classList.toggle('below', !above);
  pop.style.left = `${x}px`;
  pop.style.top = `${above ? d.y - 12 : d.y + 16}px`;
  popoverEl = pop;
  pop.querySelector('.hp-btn').focus({ preventScroll: true });
}

document.addEventListener('vulcan:hotspot-click', (e) => {
  const d = e.detail || {};
  if (typeof d.id !== 'string') return;
  if (practiceMode) {
    // practice answers forward instantly; the ring flash is the only feedback
    dismissPopover();
    if (window.MachineView && window.MachineView.flash) window.MachineView.flash(d.id);
    sendMessage(`[clicked ${d.id}]`);
    return;
  }
  showHotspotPopover(d);
});

// click-away and Escape dismiss the popover
document.addEventListener('pointerdown', (e) => {
  if (popoverEl && !popoverEl.contains(e.target)) dismissPopover();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismissPopover();
});

practiceBtn.addEventListener('click', () => {
  practiceMode = !practiceMode;
  practiceBtn.setAttribute('aria-pressed', String(practiceMode));
  practiceChip.hidden = !practiceMode;
  dismissPopover();
  sendMessage(practiceMode
    ? '[job] practice mode on — quiz me on physical locations, one question at a time'
    : '[job] practice mode off');
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

/* ================= garage mode (hands-free) ================= */
// Forces TTS on, listens continuously, auto-sends after a ≥1.2 s pause and
// scales chat/caption type up. Hidden when SpeechRecognition is unsupported.

const garageBtn = $('garage-toggle');
const garageMic = $('garage-mic');
const garage = { on: false, prevTts: false, rec: null, buf: '', timer: 0, calm: 0, errs: 0, fatal: false };

function garageIndicate(state) {
  garageMic.dataset.state = state;
}

function startGarageRec() {
  const rec = new SR();
  garage.rec = rec;
  garage.fatal = false;
  garage.errs = 0;
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e) => {
    garage.errs = 0;
    garageIndicate('speaking');
    clearTimeout(garage.calm);
    garage.calm = setTimeout(() => {
      if (garage.on && !garage.fatal) garageIndicate('listening');
    }, 700);
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) garage.buf += e.results[i][0].transcript;
    }
    // any speech activity defers the send until the user pauses ≥1.2 s;
    // only finalized results ever send — interims never double-send
    clearTimeout(garage.timer);
    if (garage.buf.trim()) {
      garage.timer = setTimeout(() => {
        const text = garage.buf.trim();
        garage.buf = '';
        if (text) sendMessage(text);
      }, 1200);
    }
  };
  rec.onerror = (e) => {
    garage.errs += 1;
    const fatalKind = ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error);
    if ((fatalKind || garage.errs >= 3) && !garage.fatal) {
      garage.fatal = true; // stop the restart loop; keep TTS + type scale
      garageIndicate('error');
      console.warn('garage mode: speech recognition unavailable —', e.error);
    }
  };
  rec.onend = () => {
    if (!garage.on || garage.rec !== rec || garage.fatal) return;
    setTimeout(() => {
      if (garage.on && garage.rec === rec) {
        try { rec.start(); } catch { /* already restarting */ }
      }
    }, 300);
  };
  try {
    rec.start();
    garageIndicate('listening');
    console.info('garage mode: continuous recognition started');
  } catch (err) {
    garage.fatal = true;
    garageIndicate('error');
    console.warn('garage mode: recognition start failed', err);
  }
}

function setGarage(on) {
  garage.on = on;
  garageBtn.setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('garage-mode', on);
  garageMic.hidden = !on;
  micBtn.disabled = on; // the garage listener owns the mic while active
  if (on) {
    garage.prevTts = tts.enabled;
    if ('speechSynthesis' in window && !tts.enabled) tts.toggle(); // forced on
    if (machinePanel.classList.contains('collapsed')) machineToggle.click();
    startGarageRec();
  } else {
    if ('speechSynthesis' in window && tts.enabled !== garage.prevTts) tts.toggle();
    clearTimeout(garage.timer);
    clearTimeout(garage.calm);
    garage.buf = '';
    const rec = garage.rec;
    garage.rec = null;
    if (rec) {
      try { rec.stop(); } catch { /* already stopped */ }
    }
  }
}

if (SR) {
  console.info('garage mode: SpeechRecognition available — toggle enabled');
  garageBtn.hidden = false;
  garageBtn.addEventListener('click', () => setGarage(!garage.on));
} else {
  console.info('garage mode: SpeechRecognition unsupported — toggle hidden');
}

/* ================= composer ================= */

function updateSendState() {
  sendBtn.disabled = !inputEl.value.trim();
}

function autosize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
  updateSendState();
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
let streamCtl = null; // aborting the live stream forces a reconnect

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
      streamCtl = new AbortController();
      const res = await fetch(`/api/session/${sessionId}/stream`, {
        headers: { accept: 'text/event-stream' },
        signal: streamCtl.signal
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
    } catch (err) {
      if (err && err.name === 'AbortError') {
        setStatus('connecting');
        continue; // "New" swapped sessions — reconnect immediately
      }
      // network drop: fall through to backoff
    }
    setStatus('reconnecting');
    await sleep(backoff * (0.75 + Math.random() * 0.5));
    backoff = Math.min(backoff * 2, 15000);
  }
}

/* ================= "New" — fresh session, clean bench ================= */

async function resetSession() {
  newBtn.disabled = true;
  try {
    await createSession(); // fresh session id — job context stays behind
  } catch {
    addNotice('Could not start a new session — backend unreachable.');
    return;
  } finally {
    newBtn.disabled = false;
  }
  if (streamCtl) streamCtl.abort(); // stream loop reconnects to the new session

  // transcript
  currentTurn = null;
  lastUserText = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  tts.buf = '';
  messagesEl.textContent = '';
  messagesEl.appendChild(buildEmptyState());
  renderSuggestions([]);
  inputEl.value = '';
  autosize();

  // artifacts
  collapseExpanded();
  for (const rec of artifacts.values()) {
    clearTimeout(rec.debounce);
    clearTimeout(rec.watchdog);
  }
  artifacts.clear();
  stackEl.textContent = '';
  stackEl.appendChild(stackEmptyEl);
  updateArtifactCount();

  // machine + modes back to idle
  tutorialRec = null;
  pendingFocus = pendingTutorial = pendingPanel = null;
  const player = $('tutorial-player');
  if (player) player.hidden = true;
  if (window.MachineView) window.MachineView.idle();
  dismissPopover();
  if (practiceMode) {
    practiceMode = false;
    practiceBtn.setAttribute('aria-pressed', 'false');
    practiceChip.hidden = true;
  }
  offlineNoticeShown = false;
}

newBtn.addEventListener('click', resetSession);

/* ================= boot ================= */

(async function boot() {
  messagesEl.appendChild(buildEmptyState());
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

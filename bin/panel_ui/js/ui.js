// DOM helpers, formatting, rich-text segments, icons, toasts, log drawer, dialogs.
// No innerHTML anywhere: server text goes through textContent only (CSP + A12).

import { api } from './api.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

// ---------------------------------------------------------------- icons

const ICONS = {
  today: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  pending: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  decisions: 'M5 4v16M5 5h11l-2 4 2 4H5',
  drafts: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  dossiers: 'M3 6h6l2 2h10v11H3z',
  jobs: 'M5 4l14 8-14 8z',
  accounts: 'M4 19V11M10 19V5M16 19v-6M22 19H2',
  check: 'M5 12l5 5L20 7',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  reply: 'M10 8 4 13l6 5M4 13h11a5 5 0 0 1 5 5v1M14 8l-5 5 5 5',
  folder: 'M3 6h6l2 2h10v11H3z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  chat: 'M4 5h16v11H9l-5 4z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20h4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z',
  collapse: 'M15 6l-6 6 6 6',
  expand: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6 6 18',
  send: 'M4 12l16-8-6 16-3-7z',
  paperclip: 'M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7',
  log: 'M4 6h16M4 12h16M4 18h10',
  keyboard: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

export function icon(name, cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.info);
  svg.append(p);
  return svg;
}

// ---------------------------------------------------------------- formatting

const pad = (n) => String(n).padStart(2, '0');

export function parseDate(s) {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s);
  return isNaN(d) ? null : d;
}

export function fmtDate(s, withTime = true) {
  const d = parseDate(s);
  if (!d) return 'inconnu';
  const now = api.now();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay && withTime) return hm;
  const dm = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return withTime ? `${dm} ${hm}` : dm;
}

export function fmtDay(s) {
  const d = parseDate(s);
  if (!d) return 'inconnu';
  const days = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  return `${days[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function ago(s) {
  const d = parseDate(s);
  if (!d) return 'jamais';
  const sec = Math.round((api.now() - d) / 1000);
  if (sec < 0) return 'dans ' + until(s);
  if (sec < 60) return "à l'instant";
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.round(hr / 24);
  return `il y a ${day} j`;
}

export function until(s) {
  const d = parseDate(s);
  if (!d) return 'inconnu';
  const min = Math.round((d - api.now()) / 60000);
  if (min <= 0) return 'maintenant';
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ${pad(min % 60)}`;
  return `${Math.round(hr / 24)} j`;
}

export function duration(s) {
  if (s == null) return 'inconnu';
  s = Math.round(s);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${pad(s % 60)}`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)}`;
}

export function money(v, status) {
  if (v == null) return status === 'unknown' || !status ? 'coût inconnu' : status;
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' });
}

export function bytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

export function plural(n, one, many) { return `${n} ${n > 1 ? many : one}`; }

export function daysFromNow(s) {
  const d = parseDate(s);
  if (!d) return null;
  const a = new Date(api.now()); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

export function isoDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// ---------------------------------------------------------------- segments

let fileOpener = null;
export function setFileOpener(fn) { fileOpener = fn; }

export function safeHref(href) {
  if (typeof href !== 'string') return null;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

export function segments(list) {
  const frag = document.createDocumentFragment();
  for (const s of list || []) {
    if (!s || typeof s.v !== 'string') continue;
    switch (s.t) {
      case 'strong': frag.append(h('strong', { text: s.v })); break;
      case 'code': frag.append(h('code', { text: s.v })); break;
      case 'link': {
        const href = safeHref(s.href);
        frag.append(href
          ? h('a', { href, target: '_blank', rel: 'noopener noreferrer', text: s.v, onclick: (e) => e.stopPropagation() })
          : h('span', { class: 'link-blocked', title: 'Lien refusé : seul https est autorisé', text: s.v }));
        break;
      }
      case 'file':
        frag.append(h('button', {
          class: 'file-link', type: 'button', title: 'Ouvrir dans Windows', text: s.v,
          onclick: (e) => { e.stopPropagation(); if (fileOpener) fileOpener(s.file_id, s.v); },
        }));
        break;
      default: frag.append(document.createTextNode(s.v));
    }
  }
  return frag;
}

export function segText(list) { return (list || []).map((s) => (s && s.v) || '').join(''); }

// ---------------------------------------------------------------- small widgets

export function btn(label, opts = {}) {
  const b = h('button', {
    type: 'button',
    class: ['btn', opts.primary && 'btn-primary', opts.ghost && 'btn-ghost', opts.danger && 'btn-danger', opts.small && 'btn-small', opts.class],
    title: opts.title || null,
    'aria-keyshortcuts': opts.key || null,
    onclick: opts.onclick || null,
  }, opts.icon ? icon(opts.icon) : null, label ? h('span', { text: label }) : null,
  opts.key ? h('kbd', { text: opts.key }) : null);
  if (opts.disabled) disable(b, opts.disabled);
  return b;
}

// A disabled control always says why (tooltip + visible text next to it when asked).
export function disable(el, reason) {
  el.disabled = true;
  el.classList.add('is-disabled');
  if (typeof reason === 'string') { el.title = reason; el.setAttribute('aria-description', reason); }
  return el;
}

export function chip(text, kind) { return h('span', { class: ['chip', kind && 'chip-' + kind], text }); }

export function emptyState(title, text, action) {
  return h('div', { class: 'state state-empty' }, h('div', { class: 'state-title', text: title }),
    text ? h('p', { class: 'muted', text }) : null, action || null);
}

export function loadingState(text = 'Chargement…') {
  return h('div', { class: 'state state-loading', role: 'status' }, h('span', { class: 'spinner' }), h('span', { text }));
}

export function errorState(err, retry) {
  return h('div', { class: 'state state-error', role: 'alert' },
    h('div', { class: 'state-title', text: 'Chargement impossible' }),
    h('p', { text: err && err.message ? err.message : String(err) }),
    err && err.code ? h('p', { class: 'muted mono', text: err.code }) : null,
    retry ? btn('Réessayer', { icon: 'refresh', onclick: retry }) : null);
}

export function gauge(label, pct, floor, sub) {
  const known = typeof pct === 'number';
  const level = !known ? 'unknown' : pct <= (floor ?? -1) ? 'low' : pct <= (floor ?? 0) * 2 ? 'warn' : 'ok';
  const bar = h('div', { class: 'gauge-bar' });
  const fill = h('div', { class: 'gauge-fill' });
  if (known) fill.style.setProperty('width', Math.max(0, Math.min(100, pct)) + '%');
  bar.append(fill);
  if (typeof floor === 'number') {
    const f = h('div', { class: 'gauge-floor', title: `Plancher ${floor} %` });
    f.style.setProperty('left', floor + '%');
    bar.append(f);
  }
  return h('div', { class: ['gauge', 'gauge-' + level] },
    h('div', { class: 'gauge-head' }, h('span', { text: label }), h('span', { class: 'gauge-val', text: known ? `${pct} %` : 'inconnu' })),
    bar, sub ? h('div', { class: 'gauge-sub muted', text: sub }) : null);
}

// ---------------------------------------------------------------- toasts

const toastRoot = () => document.getElementById('toasts');

export function toast(message, opts = {}) {
  const root = toastRoot();
  if (opts.key) {
    const prev = root.querySelector(`[data-key="${CSS.escape(opts.key)}"]`);
    if (prev) prev.remove();
  }
  const el = h('div', { class: ['toast', 'toast-' + (opts.kind || 'info')], role: opts.kind === 'error' ? 'alert' : 'status',
    dataset: opts.key ? { key: opts.key } : null });
  const text = h('div', { class: 'toast-text' }, h('div', { text: message }), opts.detail ? h('div', { class: 'toast-detail', text: opts.detail }) : null);
  el.append(text);
  let timer = null;
  let tick = null;
  const close = () => { clearTimeout(timer); clearInterval(tick); el.classList.add('leaving'); setTimeout(() => el.remove(), 160); };
  if (opts.action) {
    const a = h('button', { type: 'button', class: 'toast-action', text: opts.action.label,
      onclick: async () => { a.disabled = true; clearInterval(tick); try { await opts.action.run(); } finally { close(); } } });
    el.append(a);
    if (opts.countdown) {
      let left = opts.countdown;
      const count = h('span', { class: 'toast-count', text: `${left}` });
      const ring = h('span', { class: 'toast-ring' });
      ring.style.setProperty('animation-duration', `${left}s`);
      a.append(count);
      el.append(ring);
      tick = setInterval(() => {
        left -= 1;
        count.textContent = `${Math.max(0, left)}`;
        if (left <= 0) { clearInterval(tick); a.disabled = true; a.title = 'Fenêtre d\'annulation dépassée'; }
      }, 1000);
    }
  }
  el.append(h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Fermer', onclick: close }, icon('close')));
  root.append(el);
  const ttl = opts.ttl ?? (opts.countdown ? opts.countdown * 1000 + 600 : opts.kind === 'error' ? 9000 : 4500);
  if (ttl > 0) timer = setTimeout(close, ttl);
  while (root.children.length > 4) root.firstChild.remove();
  return { close, el };
}

export function toastError(err, prefix) {
  const msg = (err && err.message) || String(err);
  return toast(prefix ? `${prefix} : ${msg}` : msg, { kind: 'error', detail: err && err.code ? err.code : null });
}

// ---------------------------------------------------------------- log drawer

const drawer = {
  streams: new Map(),
  el: null,
};

export function initDrawer() {
  drawer.el = document.getElementById('drawer');
  document.getElementById('drawer-toggle').addEventListener('click', () => toggleDrawer());
  document.getElementById('drawer-close').addEventListener('click', () => toggleDrawer(false));
}

export function toggleDrawer(open) {
  const el = drawer.el;
  const next = open ?? !el.classList.contains('open');
  el.classList.toggle('open', next);
  document.getElementById('drawer-toggle').setAttribute('aria-expanded', String(next));
  document.body.classList.toggle('drawer-open', next);
}

export function drawerCount() {
  let n = 0;
  for (const s of drawer.streams.values()) if (s.live) n++;
  const badge = document.getElementById('drawer-badge');
  badge.textContent = n ? String(n) : '';
  badge.hidden = !n;
}

// Opens a log stream in the drawer for an operation or run. Returns nothing; replays and follows.
export function followLog(id, title, url, onDone) {
  const body = document.getElementById('drawer-body');
  let s = drawer.streams.get(id);
  if (s && s.live) { toggleDrawer(true); s.el.scrollIntoView({ block: 'nearest' }); return; }
  if (s) { s.stop && s.stop(); s.el.remove(); }
  const lines = h('ol', { class: 'log-lines' });
  const state = h('span', { class: 'chip chip-run', text: 'en cours' });
  const block = h('section', { class: 'log-block' }, h('header', { class: 'log-head' }, h('strong', { text: title }), state,
    h('span', { class: 'muted mono', text: id })), lines);
  body.prepend(block);
  s = { el: block, live: true, stop: null };
  drawer.streams.set(id, s);
  drawerCount();
  toggleDrawer(true);
  const add = (type, text) => {
    const at = new Date(api.now());
    lines.append(h('li', { class: 'log-' + type }, h('span', { class: 'log-time mono', text: `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}` }),
      h('span', { class: 'log-type', text: type }), h('span', { class: 'log-text', text })));
    lines.scrollTop = lines.scrollHeight;
  };
  if (api.fixtures) add('status', 'mode fixtures : rejeu de run-events.json');
  s.stop = api.stream(url, {
    event(type, data) {
      if (type === 'text') add(type, data.text || '');
      else if (type === 'tool') add(type, `${data.name || 'outil'} · ${data.summary || ''}`);
      else if (type === 'step') add(type, `étape ${data.name} : ${data.status}`);
      else if (type === 'cost') add(type, `${money(data.cost_usd, data.cost_status)}${data.tokens ? ' · ' + data.tokens.toLocaleString('fr-FR') + ' jetons' : ''}`);
      else if (type === 'status') add(type, data.status || '');
      else if (type === 'error') add(type, data.message || data.text || 'erreur');
      else if (type === 'done') add(type, `terminé, code ${data.exit_code ?? 'inconnu'} (${data.status || '?'})`);
    },
    end(data) {
      s.live = false;
      state.textContent = data && data.status === 'succeeded' ? 'terminé' : (data && data.status) || 'terminé';
      state.className = 'chip ' + (data && data.status === 'succeeded' ? 'chip-ok' : 'chip-warn');
      drawerCount();
      if (onDone) onDone(data);
    },
    error() { add('error', 'flux interrompu, reprise automatique'); },
  });
}

// ---------------------------------------------------------------- dialog / menu

export function openDialog(title, content, opts = {}) {
  const dlg = document.getElementById('dialog');
  const body = clear(document.getElementById('dialog-body'));
  document.getElementById('dialog-title').textContent = title;
  body.append(content);
  dlg.classList.toggle('dialog-wide', !!opts.wide);
  if (!dlg.open) dlg.showModal();
  return dlg;
}

export function closeDialog() {
  const dlg = document.getElementById('dialog');
  if (dlg.open) dlg.close();
}

// Popover menu anchored to a button. items: [{label, run, disabled?, hint?}] or a custom node.
export function popMenu(anchor, items) {
  closeMenus();
  const menu = h('div', { class: 'menu', role: 'menu' });
  if (items instanceof Node) menu.append(items);
  else for (const it of items) {
    const b = h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onclick: () => { closeMenus(); it.run(); } },
      h('span', { text: it.label }), it.hint ? h('span', { class: 'muted', text: it.hint }) : null);
    if (it.disabled) disable(b, it.disabled);
    menu.append(b);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  menu.style.setProperty('top', Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 4) + 'px');
  menu.style.setProperty('left', Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px');
  const first = menu.querySelector('button:not([disabled]), input');
  if (first) first.focus();
  setTimeout(() => document.addEventListener('mousedown', outside, { once: true }), 0);
  function outside(e) { if (!menu.contains(e.target)) closeMenus(); else document.addEventListener('mousedown', outside, { once: true }); }
  return menu;
}

export function closeMenus() {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
}

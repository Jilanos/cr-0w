// Chronological view of Relances & échéances: quick filters shared with the
// Échéances list, a 15-day lane timeline and day cards. Filters persist in localStorage.

import { h, btn, chip, fmtDay, isoDay, parseDate, daysFromNow } from './ui.js';
import { api } from './api.js';

export const CATEGORIES = [
  { key: 'followup', label: 'Relances' },
  { key: 'deadline', label: 'Échéances' },
  { key: 'meeting', label: 'Réunions' },
  { key: 'draft', label: 'Brouillons' },
  { key: 'decision', label: 'Décisions' },
];
const RESET = { key: 'reset', label: 'Resets comptes' };
const PRIO = [['red', 'Urgent'], ['yellow', 'Normal'], ['green', 'Bas'], ['blue', 'Info']];
const KEY = 'crow.dueFilters';
const DAYS = 15;

export function loadFilters() {
  let f = {};
  try { f = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { f = {}; }
  return {
    kinds: Array.isArray(f.kinds) ? f.kinds.filter((k) => CATEGORIES.some((c) => c.key === k)) : [],
    late: f.late === true,
    who: typeof f.who === 'string' ? f.who : '',
    prio: typeof f.prio === 'string' ? f.prio : '',
    // Account resets stay hidden unless asked; the older toggle key is honoured.
    resets: f.resets === true || (f.resets === undefined && localStorage.getItem('crow.showResets') === 'true'),
  };
}

export function saveFilters(f) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
    localStorage.setItem('crow.showResets', String(!!f.resets));
  } catch { /* storage off */ }
}

export const categoryOf = (d) => d.category || (d.kind === 'calendar' ? 'meeting' : d.kind === 'reset' ? 'reset' : 'deadline');

export function filterDues(items, f) {
  return items.filter((d) => {
    const cat = categoryOf(d);
    if (cat === 'reset') return f.resets && !f.late && !f.who && !f.prio;
    if (f.kinds.length && !f.kinds.includes(cat)) return false;
    if (f.late && !d.overdue) return false;
    if (f.who && d.who !== f.who) return false;
    if (f.prio && d.prio !== f.prio) return false;
    return true;
  });
}

export const activeCount = (f) => f.kinds.length + (f.late ? 1 : 0) + (f.who ? 1 : 0) + (f.prio ? 1 : 0);

export function filterBar(f, all, onChange) {
  const set = (patch) => { Object.assign(f, patch); saveFilters(f); onChange(); };
  const toggle = (key) => set({ kinds: f.kinds.includes(key) ? f.kinds.filter((k) => k !== key) : [...f.kinds, key] });
  const count = (key) => all.filter((d) => categoryOf(d) === key).length;
  const pill = (label, on, onclick, n, extra) => h('button', {
    type: 'button', class: ['fchip', on && 'on', extra], 'aria-pressed': String(!!on), onclick,
  }, h('span', { text: label }), n != null ? h('span', { class: 'fchip-n', text: String(n) }) : null);
  const people = [...new Set(all.map((d) => d.who).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const late = all.filter((d) => d.overdue).length;
  return h('div', { class: 'fbar', role: 'group', 'aria-label': 'Filtres rapides' },
    CATEGORIES.map((c) => pill(c.label, f.kinds.includes(c.key), () => toggle(c.key), count(c.key))),
    h('span', { class: 'fbar-sep', 'aria-hidden': 'true' }),
    pill('En retard', f.late, () => set({ late: !f.late }), late, 'fchip-late'),
    h('select', { class: 'select fselect', 'aria-label': 'Filtrer par personne', onchange: (e) => set({ who: e.target.value }) },
      h('option', { value: '', text: 'Toutes les personnes' }),
      people.map((p) => h('option', { value: p, text: p, selected: p === f.who }))),
    h('select', { class: 'select fselect', 'aria-label': 'Filtrer par priorité', onchange: (e) => set({ prio: e.target.value }) },
      h('option', { value: '', text: 'Toutes priorités' }),
      PRIO.map(([v, l]) => h('option', { value: v, text: l, selected: v === f.prio }))),
    pill(RESET.label, f.resets, () => set({ resets: !f.resets }), count('reset'), 'fchip-quiet'),
    activeCount(f) ? h('button', { type: 'button', class: 'link-btn small', text: 'Effacer', onclick: () => set({ kinds: [], late: false, who: '', prio: '' }) }) : null);
}

// ---------------------------------------------------------------- SVG timeline

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

function marker(cat, x, y, late, selected) {
  const cls = ['tl-mark', 'tl-' + cat, late && 'tl-late', selected && 'tl-sel'].filter(Boolean).join(' ');
  if (cat === 'deadline') return s('rect', { class: cls, x: x - 5, y: y - 5, width: 10, height: 10, transform: `rotate(45 ${x} ${y})` });
  if (cat === 'meeting') return s('rect', { class: cls, x: x - 7, y: y - 4, width: 14, height: 8, rx: 2 });
  if (cat === 'decision') return s('rect', { class: cls, x: x - 5, y: y - 5, width: 10, height: 10, rx: 1 });
  if (cat === 'reset') return s('path', { class: cls, d: `M${x} ${y - 6} L${x + 6} ${y + 5} L${x - 6} ${y + 5} Z` });
  return s('circle', { class: cls, cx: x, cy: y, r: 6 });
}

function timeOf(d) {
  if (categoryOf(d) !== 'meeting' || d.all_day || !d.start) return '';
  const t = parseDate(d.start);
  return t ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '';
}

export function timeline(items, opts) {
  const { selected, onSelect, keyOf } = opts;
  const now = new Date(api.now());
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const lanes = [...CATEGORIES, RESET].filter((c) => items.some((d) => categoryOf(d) === c.key) || (c.key !== 'reset' && (!opts.kinds.length || opts.kinds.includes(c.key))));
  const W = 1200, L = 104, cols = 2 + DAYS, dx = (W - L - 8) / cols, step = 15, perRow = Math.max(1, Math.floor((dx - 6) / step));
  const colOf = (d) => {
    if (!d.date) return 0;
    if (d.overdue) return 1;
    const n = daysFromNow(d.date);
    return n == null || n < 0 ? 1 : n >= DAYS ? null : 2 + n;
  };
  const cells = new Map();
  for (const d of items) {
    const lane = lanes.findIndex((c) => c.key === categoryOf(d));
    const col = colOf(d);
    if (lane < 0 || col == null) continue;
    const k = lane + ':' + col;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(d);
  }
  const rows = lanes.map((_, i) => Math.max(1, ...[...cells.entries()].filter(([k]) => k.startsWith(i + ':')).map(([, v]) => Math.ceil(v.length / perRow))));
  const laneH = rows.map((r) => 14 + r * step);
  const top = 22;
  const H = top + laneH.reduce((a, b) => a + b, 0) + 4;
  const g = [];
  for (let c = 0; c < cols; c++) {
    const x = L + c * dx;
    const day = new Date(start); day.setDate(start.getDate() + c - 2);
    if (c >= 2 && (day.getDay() === 0 || day.getDay() === 6)) g.push(s('rect', { class: 'tl-weekend', x, y: top, width: dx, height: H - top }));
    if (c === 1) g.push(s('rect', { class: 'tl-latecol', x, y: top, width: dx, height: H - top }));
    g.push(s('line', { class: 'tl-grid', x1: x, x2: x, y1: top, y2: H }));
    const label = c === 0 ? 'sans date' : c === 1 ? 'en retard' : c === 2 ? "auj." : fmtDay(isoDay(day)).replace('.', '');
    g.push(s('text', { class: ['tl-head', c === 1 && 'tl-head-late', c === 2 && 'tl-head-today'].filter(Boolean).join(' '), x: x + dx / 2, y: 14, 'text-anchor': 'middle' }, label));
  }
  let y = top;
  lanes.forEach((lane, i) => {
    g.push(s('line', { class: 'tl-grid', x1: 0, x2: W, y1: y, y2: y }));
    g.push(s('text', { class: 'tl-lane', x: 4, y: y + 4 + laneH[i] / 2 }, lane.label));
    for (let c = 0; c < cols; c++) {
      const list = cells.get(i + ':' + c) || [];
      list.forEach((d, n) => {
        const cx = L + c * dx + 3 + step / 2 + (n % perRow) * step;
        const cy = y + 7 + step / 2 + Math.floor(n / perRow) * step;
        const key = keyOf(d);
        const m = marker(lane.key, cx, cy, d.overdue, key === selected);
        const tip = [d.date ? fmtDay(d.date) : 'sans date', timeOf(d), d.text, d.who && d.who !== d.text ? d.who : null].filter(Boolean).join(' · ');
        const a = s('g', { class: 'tl-hit', tabindex: 0, role: 'button', 'aria-label': tip }, s('title', null, tip), m);
        a.addEventListener('click', () => onSelect(key));
        a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(key); } });
        g.push(a);
      });
    }
    y += laneH[i];
  });
  const frac = (now - start) / 86400000;
  const nx = L + (2 + frac) * dx;
  g.push(s('line', { class: 'tl-now', x1: nx, x2: nx, y1: top - 4, y2: H }));
  return s('svg', { class: 'tl-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Frise des relances, échéances et réunions sur 15 jours' }, g);
}

export function legend() {
  const item = (cat, label, late) => {
    const svg = s('svg', { viewBox: '0 0 18 18', width: 16, height: 16, 'aria-hidden': 'true' }, marker(cat, 9, 9, late, false));
    return h('span', { class: 'tl-legend-item' }, svg, h('span', { text: label }));
  };
  return h('div', { class: 'tl-legend' }, [...CATEGORIES, RESET].map((c) => item(c.key, c.label)), item('followup', 'En retard', true),
    h('span', { class: 'tl-legend-item' }, h('i', { class: 'tl-now-key' }), h('span', { text: 'Maintenant' })));
}

export function dayCards(items, opts) {
  const { selected, onSelect, keyOf } = opts;
  const groups = new Map();
  for (const d of items) {
    const k = !d.date ? 'undated' : d.overdue ? 'late' : d.date;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const order = [...groups.keys()].sort((a, b) => (a === 'late' ? -2 : a === 'undated' ? -1 : 0) - (b === 'late' ? -2 : b === 'undated' ? -1 : 0) || a.localeCompare(b));
  return h('div', { class: 'tl-days' }, order.map((k) => {
    const today = k !== 'late' && k !== 'undated' && daysFromNow(k) === 0;
    const title = k === 'late' ? 'En retard' : k === 'undated' ? 'Sans date' : (today ? "Aujourd'hui · " : '') + fmtDay(k);
    const list = groups.get(k).sort((a, b) => (timeOf(a) || '99').localeCompare(timeOf(b) || '99'));
    return h('section', { class: ['tl-day', k === 'late' && 'late', today && 'today'] }, h('h4', { text: title }),
      h('ul', null, list.map((d) => {
        const key = keyOf(d);
        const cat = categoryOf(d);
        const svg = s('svg', { viewBox: '0 0 18 18', width: 14, height: 14, 'aria-hidden': 'true' }, marker(cat, 9, 9, d.overdue, false));
        return h('li', null, h('button', { type: 'button', class: ['tl-item', key === selected && 'sel'], onclick: () => onSelect(key) }, svg,
          h('span', { class: 'tl-time mono', text: k === 'late' && d.date ? fmtDay(d.date).slice(5) : timeOf(d) }),
          h('span', { class: 'tl-text', text: d.text }),
          d.who && d.who !== d.text ? h('span', { class: 'tl-who muted', text: d.who }) : null));
      })));
  }));
}

export function calendarLine(dues, onSync) {
  const cal = dues && dues.calendar;
  if (!cal) return null;
  const sync = cal.sync || {};
  return h('div', { class: 'tl-cal muted small' }, h('span', { text: cal.note }),
    sync.running ? chip('lecture en cours', 'run') : sync.error ? h('span', { class: 'red-text', text: sync.error }) : null,
    btn(sync.running ? 'Lecture en cours' : "Synchroniser l'agenda", { icon: 'refresh', small: true, disabled: sync.running ? 'Lecture déjà en cours' : null, onclick: onSync }));
}

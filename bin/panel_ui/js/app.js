// App shell: data cache, routing between views, rail, header, list/detail panes,
// keyboard shortcuts and the shared actions (Réglé, Reporter, Annuler, routines, files).

import { api, ApiError } from './api.js';
import {
  h, clear, icon, btn, disable, chip, toast, toastError, emptyState, loadingState, errorState,
  initDrawer, followLog, openDialog, closeDialog, closeMenus, setFileOpener, segText, fmtDate, ago, duration,
} from './ui.js';
import { makeViews } from './views.js';
import { renderChat, focusComposer, setChatDraft } from './chat.js';
import { openSearch } from './search.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem('crow.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('crow.' + k, JSON.stringify(v)); } catch { /* storage off */ } },
};

const PATHS = {
  state: '/api/state', config: '/api/config', pending: '/api/pending', mail: '/api/mail?limit=50',
  folders: '/api/mail/folders', drafts: '/api/drafts', dues: '/api/dues?days=14', runs: '/api/runs?since_hours=24',
  routines: '/api/routines', accounts: '/api/accounts', dossiers: '/api/dossiers', afk: '/api/afk',
  caps: '/api/capabilities', topics: '/api/topics', session: '/api/session',
  operations: '/api/operations',
};

const store = {
  view: LS.get('view', 'today'),
  sel: LS.get('sel', {}),
  filter: '',
  cache: new Map(),       // key -> {data, error, promise, at}
  hidden: new Set(),      // pending ids removed optimistically
  mailMode: LS.get('mailMode', 'inbox'),
  triage: { checked: new Map(), plan: null, op: null, busy: false },
  reply: {},              // mail id -> {open, instructions, model, op, log[]}
  followups: {},
  chatTopic: null,
  pinnedChat: null,
  sinceVisit: undefined,
  showDetail: false,
};

// ---------------------------------------------------------------- data cache

function cached(key) { const e = store.cache.get(key); return e ? e.data : undefined; }
function cacheErr(key) { const e = store.cache.get(key); return e ? e.error : null; }

function load(key, path, opts = {}) {
  const e = store.cache.get(key);
  if (e && !opts.force) {
    if (e.promise) return e.promise;
    if (e.data !== undefined || e.error) return Promise.resolve(e.data);
  }
  const entry = e || {};
  entry.promise = api.get(path || PATHS[key]).then((data) => {
    entry.data = data; entry.error = null; entry.at = Date.now(); entry.promise = null;
    return data;
  }, (err) => {
    entry.error = err; entry.promise = null;
    if (!opts.quiet) console.warn(`chargement ${key} :`, err.message);
    return undefined;
  });
  store.cache.set(key, entry);
  return entry.promise;
}

async function refresh(keys) {
  await Promise.all(keys.map((k) => load(k, null, { force: true, quiet: true })));
}

// ---------------------------------------------------------------- context for views

const ctx = {
  store, cached, cacheErr, load, refresh, api,
  get state() { return cached('state'); },
  get config() { return cached('config'); },
  render, renderDetail, renderList, select, go, openChat, openFile, pendingDone, pendingSnooze, undo, trackOp,
  runRoutine, writable, setView, openConversations, chatActivity,
};

const views = makeViews(ctx);
const ORDER = ['today', 'mail', 'drafts', 'pending', 'decisions', 'dossiers', 'jobs', 'accounts'];

// ---------------------------------------------------------------- rail

function renderRail() {
  const list = clear(document.getElementById('rail-list'));
  const counts = (cached('state') || {}).counts || {};
  for (const name of ORDER) {
    const v = views[name];
    const c = v.count ? v.count(counts) : null;
    const item = h('li', null, h('button', {
      type: 'button', class: ['rail-item', store.view === name && 'active'], 'aria-current': store.view === name ? 'page' : null,
      title: v.title, onclick: () => setView(name),
    }, icon(v.icon), h('span', { class: 'rail-label', text: v.title }),
    c && c.alert ? h('span', { class: 'count count-alert', title: c.alertTitle || null, text: String(c.alert) }) : null,
    c && c.n != null ? h('span', { class: 'count', text: String(c.n) }) : null));
    list.append(item);
  }
}

function initRail() {
  const rail = document.getElementById('rail');
  const collapse = document.getElementById('rail-collapse');
  const setCollapsed = (v) => {
    document.body.classList.toggle('rail-collapsed', v);
    clear(collapse).append(icon(v ? 'expand' : 'collapse'));
    collapse.title = v ? 'Déplier le menu' : 'Replier le menu';
    collapse.setAttribute('aria-label', collapse.title);
    LS.set('railCollapsed', v);
  };
  setCollapsed(LS.get('railCollapsed', false));
  collapse.addEventListener('click', () => setCollapsed(!document.body.classList.contains('rail-collapsed')));

  const navOpen = document.getElementById('nav-open');
  navOpen.append(icon('menu'));
  navOpen.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  rail.addEventListener('click', (e) => { if (e.target.closest('.rail-item')) document.body.classList.remove('nav-open'); });

  const theme = document.getElementById('theme-toggle');
  const applyTheme = (t) => {
    document.documentElement.dataset.theme = t || '';
    if (!t) delete document.documentElement.dataset.theme;
    const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    clear(theme).append(icon(dark ? 'sun' : 'moon'), h('span', { class: 'rail-label', text: dark ? 'Thème clair' : 'Thème sombre' }));
    theme.title = dark ? 'Passer en thème clair' : 'Passer en thème sombre';
  };
  applyTheme(LS.get('theme', null));
  theme.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    LS.set('theme', next);
    applyTheme(next);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(LS.get('theme', null)));

  const help = document.getElementById('help-open');
  help.append(icon('keyboard'), h('span', { class: 'rail-label', text: 'Raccourcis' }), h('kbd', { text: '?' }));
  help.addEventListener('click', showHelp);
}

// ---------------------------------------------------------------- header

function writable() {
  const p = cached('pending');
  const st = cached('state');
  const lock = (p && p.lock) || (st && st.locks && st.locks.pending);
  if (p && p.writable === false || lock) {
    const since = lock && lock.since ? ` depuis ${fmtDate(lock.since)}` : '';
    return { ok: false, queueable: !!lock, reason: lock ? `Mise à jour en cours${since} : clics placés en file` : 'Liste indisponible' };
  }
  return { ok: true, reason: null };
}

function renderHeader() {
  const v = views[store.view];
  document.getElementById('view-title').textContent = v.title;
  document.title = `${v.title} · crow`;
  const filterWrap = document.getElementById('filter-wrap');
  filterWrap.hidden = !!v.wide;

  const st = cached('state');
  const cfg = cached('config');
  const status = clear(document.getElementById('topbar-status'));
  const mode = (st && st.mode) || (cfg && cfg.mode);
  if (mode === 'dry_run') status.append(h('span', { class: 'badge-mode', title: 'Aucune action mail réelle. Les routines s\'exécutent pour de vrai.', text: 'Mode essai' }));
  if (api.fixtures) status.append(h('span', { class: 'badge-fixtures', title: 'Données de fixtures, aucun serveur', text: api.scenario ? `fixtures · ${api.scenario}` : 'fixtures' }));
  if (st) {
    if (st.mail?.connection) status.append(h('span', { class: 'outlook-status muted small', title: st.mail.connection.label, text: st.mail.connection.label }));
    const adm = st.admissions || {};
    const max = (cfg && cfg.max_parallel) || 2;
    const c = st.counts || {};
    const txt = adm.open === false ? 'Lancements suspendus' : `${c.runs_active ?? 0}/${max} runs${c.runs_queued ? ` · ${c.runs_queued} en file` : ''}`;
    status.append(h('button', { type: 'button', class: ['admission', adm.open === false && 'admission-closed'],
      title: adm.reason || 'Runs de fond actifs sur le maximum autorisé', onclick: () => setView('jobs') },
    h('span', { class: 'dot' }), h('span', { text: txt })));
  }

  const actions = clear(document.getElementById('topbar-actions'));
  actions.append(btn('Nouveau chat', { icon: 'chat', small: true, onclick: openConversations }));
  const routines = (cached('routines') || {}).routines || [];
  const defs = (cfg && cfg.routines) || [{ name: 'maj', label: 'Mise à jour' }, { name: 'daily_update', label: 'Mise à jour machine' }];
  const majLock = st && st.locks && (st.locks.maj || st.locks.pending);
  actions.append(btn('Synchro Outlook', { icon: 'refresh', small: true, title: 'Actualiser les mails et l’agenda', onclick: syncOutlook }));
  for (const d of defs) {
    const label = d.name === 'maj' ? 'Maj' : d.label;
    const r = routines.find((x) => x.name === d.name) || {};
    let reason = null;
    if (r.running) reason = `${d.label} déjà en cours`;
    else if (majLock) reason = `Mise à jour en cours depuis ${fmtDate(majLock.since)}`;
    else if (d.name === 'daily_update' && st && st.locks && st.locks.maintenance) reason = 'Maintenance en cours';
    const b = btn(label, { icon: d.name === 'maj' ? 'moon' : 'bolt', small: true, primary: d.name === 'maj',
      title: r.description || d.label, onclick: () => runRoutine(d.name, d.label, r.blocked_reason) });
    if (reason) disable(b, reason);
    else if (r.blocked_reason) { b.classList.add('has-warning'); b.title = r.blocked_reason; }
    actions.append(b);
  }
}

async function syncOutlook() {
  try {
    const op = await api.post('/api/mail/sync', { fast: true });
    toast('Synchro Outlook lancée', { kind: 'info' });
    if (op.calendar_operation_id) {
      const calendar = await api.get(`/api/operations/${encodeURIComponent(op.calendar_operation_id)}`);
      trackOp(calendar, async () => { await refresh(['dues', 'state']); render(); });
    }
    trackOp(op, async (final) => {
      await refresh(['mail', 'folders', 'drafts', 'dues', 'caps', 'state']);
      store.triage.checked.clear(); store.triage.choices?.clear();
      render();
      toast(final?.status === 'succeeded' ? 'Outlook synchronisé' : 'Synchronisation à vérifier', { kind: final?.status === 'succeeded' ? 'ok' : 'warn' });
    }, { log: 'Synchro Outlook' });
  } catch (err) { toastError(err, 'Synchro Outlook'); }
}

function renderBanners() {
  const root = clear(document.getElementById('banners'));
  const w = writable();
  if (!w.ok) root.append(h('div', { class: 'banner banner-lock', role: 'status' }, icon('clock'), h('span', { text: w.reason })));
  const st = cached('state');
  if (st && st.admissions && st.admissions.open === false) {
    root.append(h('div', { class: 'banner banner-warn', role: 'status' }, icon('alert'),
      h('span', { text: st.admissions.reason || 'Nouveaux lancements suspendus' })));
  }
  const err = cacheErr('state');
  if (err) root.append(h('div', { class: 'banner banner-error', role: 'alert' }, icon('alert'),
    h('span', { text: `État du serveur illisible : ${err.message}` })));
}

// ---------------------------------------------------------------- panes

let listEntries = [];

function currentEntries() {
  const v = views[store.view];
  if (!v.items) return [];
  let items = v.items() || [];
  const f = store.filter.trim().toLowerCase();
  if (f) items = items.filter((it) => !it.key || (it.text || '').toLowerCase().includes(f));
  return items;
}

function selectedEntry() {
  const key = store.sel[store.view];
  return listEntries.find((e) => e.key === key && !e.header) || null;
}

function renderList() {
  const v = views[store.view];
  const pane = clear(document.getElementById('pane-list'));
  if (v.wide) return;
  if (v.listHead) { const head = v.listHead(); if (head) pane.append(head); }
  const status = v.status ? v.status() : null;
  if (status === 'loading') { pane.append(loadingState()); listEntries = []; return; }
  if (status && status.error) { pane.append(errorState(status.error, () => { v.reload(); })); listEntries = []; return; }
  listEntries = currentEntries();
  const ul = h('ul', { class: 'list', role: 'listbox', 'aria-label': v.title });
  let rows = 0;
  for (const e of listEntries) {
    if (e.header) { ul.append(h('li', { class: 'list-group', role: 'presentation' }, e.header)); continue; }
    rows++;
    const selected = store.sel[store.view] === e.key;
    const li = h('li', {
      class: ['row', selected && 'selected', e.dim && 'dim', e.cls], role: 'option', 'aria-selected': String(selected),
      tabindex: selected ? '0' : '-1', dataset: { key: e.key },
      onclick: (ev) => { if (ev.target.closest('button, input, select, a, label')) return; select(e.key, { open: true }); },
    }, e.row());
    ul.append(li);
  }
  if (!rows) {
    pane.append(store.filter ? emptyState('Aucun résultat', `Rien ne correspond à « ${store.filter} ».`)
      : (v.empty ? v.empty() : emptyState('Rien ici', null)));
    if (listEntries.length) pane.append(ul);
  } else pane.append(ul);
  if (v.listFoot) { const foot = v.listFoot(); if (foot) pane.append(foot); }
  const sel = pane.querySelector('.row.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function renderDetail() {
  const v = views[store.view];
  const pane = clear(document.getElementById('pane-detail'));
  if (v.wide) { pane.append(v.dashboard()); return; }
  const e = selectedEntry();
  if (v.detailOverride) { const o = v.detailOverride(); if (o) { pane.append(o); return; } }
  if (!e) {
    const status = v.status ? v.status() : null;
    if (status === 'loading') return;
    pane.append(h('div', { class: 'detail-empty' }, icon(v.icon, 'icon-xl'),
      h('p', { text: listEntries.some((x) => !x.header) ? 'Choisis un élément dans la liste.' : 'Rien à afficher.' }),
      h('p', { class: 'muted', text: 'j / k pour naviguer, Entrée pour ouvrir.' })));
    return;
  }
  try {
    pane.append(e.detail());
  } catch (err) {
    console.error(err);
    pane.append(errorState(err));
  }
}

function renderChatPane(force) {
  const v = views[store.view];
  const pane = document.getElementById('pane-chat');
  const e = v.wide ? null : selectedEntry();
  const topic = store.pinnedChat || (e && e.topic?.topic_id ? e.topic : null);
  if (topic?.topic_id) store.pinnedChat = topic;
  const id = topic?.topic_id || null;
  if (!force && store.chatTopic === id && pane.firstChild) return;
  const restoreFocus = document.activeElement?.id === 'chat-input';
  store.chatTopic = id;
  clear(pane);
  renderChat(pane, topic, ctx);
  if (restoreFocus) focusComposer();
}

function render() {
  renderRail();
  renderHeader();
  renderBanners();
  document.body.dataset.view = store.view;
  document.body.classList.toggle('view-wide', !!views[store.view].wide);
  renderList();
  renderDetail();
  renderChatPane(false);
  layoutNarrow();
}

function layoutNarrow() {
  document.body.classList.toggle('show-detail', store.showDetail && !views[store.view].wide);
  document.getElementById('back-btn').hidden = !(store.showDetail && !views[store.view].wide);
}

// ---------------------------------------------------------------- navigation

function select(key, opts = {}) {
  if (store.sel[store.view] !== key || opts.force) {
    store.sel[store.view] = key;
    LS.set('sel', store.sel);
    renderList();
    renderDetail();
    renderChatPane(false);
  }
  if (opts.open) { store.showDetail = true; layoutNarrow(); }
  if (opts.focus) document.getElementById('pane-detail').focus({ preventScroll: true });
}

async function setView(name, key) {
  if (!views[name]) name = 'today';
  closeMenus();
  if (store.view !== name) { store.filter = ''; document.getElementById('filter').value = ''; }
  store.view = name;
  LS.set('view', name);
  if (key) { store.sel[name] = key; LS.set('sel', store.sel); store.showDetail = true; } else store.showDetail = false;
  render();
  const v = views[name];
  if (v.load) {
    await v.load();
    if (store.view === name) {
      if (!key && !store.sel[name]) {
        const first = currentEntries().find((x) => !x.header);
        if (first && window.innerWidth > 720) { store.sel[name] = first.key; LS.set('sel', store.sel); }
      }
      render();
    }
  }
}

function go(view, key) { return setView(view, key); }

async function openSearchResult(entry) {
  if (entry.view === 'conversation') {
    await openTopic(entry.key);
    return;
  }
  store.filter = ''; document.getElementById('filter').value = '';
  if (entry.view === 'pending') store.pendingTab = 'list';
  if (entry.view === 'mail') {
    store.mailMode = 'inbox'; LS.set('mailMode', 'inbox');
    await load('mail', null, { force: true });
    if (!(cached('mail')?.items || []).some(row => row.id === entry.key)) {
      const found = await api.get('/api/mail?id=' + encodeURIComponent(entry.key));
      if (!found.items.length) throw new Error('Ce mail a quitté l’instantané. Relance la recherche.');
      if (found.snapshot_rev !== cached('mail')?.snapshot_rev) throw new Error('La boîte a changé. Relance la recherche.');
      cached('mail').items.push(found.items[0]);
    }
  } else if (entry.view === 'jobs') {
    await load('runs', '/api/runs?since_hours=8760', { force: true });
  } else {
    await refresh(entry.view === 'decisions' ? ['pending', 'afk'] : [entry.view]);
  }
  await setView(entry.view, entry.key);
  if (!selectedEntry()) throw new Error('Cet élément a changé. Relance la recherche.');
  document.getElementById('pane-detail').focus({ preventScroll: true });
}

function searchGlobal() {
  const dialog = document.getElementById('dialog');
  if (dialog.open) { document.getElementById('global-search')?.focus(); return; }
  openSearch(api, openSearchResult);
}

function move(delta) {
  const rows = listEntries.filter((e) => !e.header);
  if (!rows.length) return;
  const cur = rows.findIndex((e) => e.key === store.sel[store.view]);
  const next = cur < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, cur + delta));
  select(rows[next].key);
  const el = document.querySelector(`#pane-list .row[data-key="${CSS.escape(rows[next].key)}"]`);
  if (el) el.focus({ preventScroll: false });
}

function openChat(opts = {}) {
  const e = selectedEntry();
  if (opts.topic) store.pinnedChat = opts.topic;
  else if (e?.topic?.topic_id) store.pinnedChat = e.topic;
  if (opts.prefill && e && e.topic && e.topic.topic_id) setChatDraft(e.topic.topic_id, opts.prefill, opts.intent || 'chat');
  renderChatPane(true);
  document.body.classList.add('chat-open');
  focusComposer();
}

async function openTopic(id) {
  const topic = await api.get('/api/topics/' + encodeURIComponent(id));
  openChat({ topic });
}

async function openConversations() {
  try {
    const [topics, dossiers] = await Promise.all([api.get('/api/topics'), api.get('/api/dossiers')]);
    const title = h('input', { class: 'input', maxlength: 200, placeholder: 'Titre du nouveau sujet', 'aria-label': 'Titre du chat' });
    const dossier = h('select', { class: 'select', 'aria-label': 'Dossier du chat' },
      h('option', { value: '', text: 'Sujet libre' }), dossiers.dossiers.map(d => h('option', { value: d.slug, text: d.title })));
    const error = h('p', { class: 'late', role: 'alert' });
    const create = btn('Créer le chat', { primary: true, onclick: async () => {
      try {
        const topic = await api.post('/api/topics', dossier.value ? { dossier_slug: dossier.value } : { title: title.value });
        closeDialog(); openChat({ topic });
      } catch (err) { error.textContent = err.message; }
    } });
    const recent = topics.topics.filter(t => t.last_message_at || t.kind === 'free');
    openDialog('Nouveau chat et conversations récentes', h('div', { class: 'stack' }, title, dossier, create, error,
      h('h3', { text: 'Conversations récentes' }), recent.length ? recent.map(t => h('button', { type: 'button', class: 'search-result',
        onclick: () => { closeDialog(); openChat({ topic: t }); } }, h('span', { text: t.title }),
        h('span', { class: 'muted small', text: [t.settled ? 'Réglé' : null, fmtDate(t.last_message_at)].filter(Boolean).join(' · ') }))) : emptyState('Aucune conversation', null)));
    title.focus();
  } catch (err) { toastError(err, 'Conversations'); }
}

async function chatActivity() {
  await refresh(['runs', 'state', 'topics']);
  if (store.view === 'today' || store.view === 'jobs') { renderList(); renderDetail(); }
  renderHeader(); renderRail();
}

// ---------------------------------------------------------------- shared actions

async function openFile(fileId, label) {
  try {
    const res = await api.post(`/api/files/${encodeURIComponent(fileId)}/open`, {});
    if (res && res.dry_run) toast(`Mode essai : ${label} non ouvert`, { kind: 'info' });
    else if (res && res.opened === false) toast(`Ouverture refusée : ${label}`, { kind: 'error' });
    else toast(`Ouvert dans Windows : ${label}`, { kind: 'ok' });
  } catch (err) { toastError(err, `Ouverture de ${label}`); }
}

function handleWriteError(err, what) {
  if (err instanceof ApiError && (err.code === 'conflict' || err.code === 'ambiguous')) {
    toast(err.message, { kind: 'error', detail: what });
    refresh(['pending', 'state']).then(render);
    return;
  }
  if (err instanceof ApiError && err.code === 'locked') {
    toast(err.message, { kind: 'warn' });
    refresh(['pending', 'state']).then(render);
    return;
  }
  toastError(err, what);
}

async function pendingDone(item) {
  const w = writable();
  if (!w.ok && !w.queueable) { toast(w.reason, { kind: 'warn' }); return; }
  if (!item || !(item.actions || []).includes('done')) return;
  // Pin before the optimistic selection advance, including a quick action on an unselected row.
  if (!store.pinnedChat && item.topic_id) store.pinnedChat = { topic_id: item.topic_id, title: item.title, kind: 'pending' };
  // Optimistic removal: the row disappears at once, next row gets the selection.
  const rows = listEntries.filter((e) => !e.header);
  const idx = rows.findIndex((e) => e.key === item.id);
  if (w.ok) store.hidden.add(item.id);
  if (w.ok && store.sel[store.view] === item.id) {
    const next = rows[idx + 1] || rows[idx - 1];
    store.sel[store.view] = next && next.key !== item.id ? next.key : null;
  }
  render();
  try {
    const op = await api.post(`/api/pending/${encodeURIComponent(item.id)}/done`, { item_rev: item.item_rev, queue: true });
    await refresh(['pending', 'state', 'dues']);
    if (store.pinnedChat?.topic_id === item.topic_id) {
      store.pinnedChat = await api.get('/api/topics/' + encodeURIComponent(item.topic_id));
      renderChatPane(true);
    }
    store.hidden.delete(item.id);
    render();
    pendingResult(op);
  } catch (err) {
    store.hidden.delete(item.id);
    render();
    handleWriteError(err, item.title);
  }
}

async function pendingSnooze(item, body) {
  const w = writable();
  if (!w.ok && !w.queueable) { toast(w.reason, { kind: 'warn' }); return; }
  try {
    const op = await api.post(`/api/pending/${encodeURIComponent(item.id)}/snooze`, Object.assign({ item_rev: item.item_rev, queue: true }, body));
    await refresh(['pending', 'state', 'dues']);
    render();
    pendingResult(op);
  } catch (err) { handleWriteError(err, item.title); }
}

function pendingResult(op) {
  if (op.status !== 'queued') { undoToast(op); return; }
  toast('Clic en file pendant la mise à jour', { kind: 'info', key: op.operation_id, ttl: 12000,
    action: { label: 'Retirer de la file', run: async () => {
      try { await api.post(op.links.status_url + '/cancel', {}); await refresh(['runs', 'state']); render(); }
      catch (err) { toastError(err, 'Retrait de la file'); }
    } } });
  trackOp(op, async (final) => {
    await refresh(['pending', 'state', 'dues', 'runs']); render();
    if (final.status === 'succeeded') undoToast(final);
    else if (final.status === 'failed') toast(final.error?.message || 'Clic en échec', { kind: 'error', key: op.operation_id });
    else toast('Clic retiré de la file', { kind: 'info', key: op.operation_id });
  });
}

function undoToast(op) {
  const secs = op.undo?.until ? Math.max(0, Math.ceil((Date.parse(op.undo.until) - api.now().getTime()) / 1000)) : 0;
  const can = op.undo?.available && secs > 0;
  toast(op.summary || 'Fait', {
    kind: 'ok', key: op.operation_id,
    detail: op.dry_run ? 'mode essai' : null,
    countdown: can ? secs : null,
    action: can ? { label: 'Annuler', run: () => undo(op) } : null,
  });
}

async function undo(op) {
  try {
    const res = await api.post(`/api/operations/${encodeURIComponent(op.operation_id)}/undo`, {});
    await refresh(['pending', 'state', 'dues', ...(op.kind && op.kind.startsWith('mail.') ? ['mail'] : [])]);
    render();
    toast(res.summary || 'Annulé', { kind: 'ok', key: op.operation_id + ':undo' });
    return res;
  } catch (err) {
    const extra = err.details && err.details.backup ? `Sauvegarde : ${err.details.backup}` : null;
    toast(err.message, { kind: 'error', detail: extra, ttl: 12000 });
    return null;
  }
}

// Follows an asynchronous operation until it settles, then calls back with its final state.
function trackOp(op, onUpdate, opts = {}) {
  if (!op || !op.links) { onUpdate(op); return; }
  const open = ['queued', 'running', 'cancel_requested'];
  if (!open.includes(op.status)) { onUpdate(op); return; }
  const fetchFinal = async () => {
    try { onUpdate(await api.get(op.links.status_url)); } catch (err) { toastError(err, 'Suivi de l\'opération'); }
  };
  if (opts.log) followLog(op.operation_id, opts.log, op.links.events_url, fetchFinal);
  else api.stream(op.links.events_url, { event: opts.onEvent || null, end: fetchFinal });
}

async function runRoutine(name, label, blocked) {
  if (blocked && !window.confirm(`${blocked}\n\nLancer quand même ?`)) return;
  try {
    const op = await api.post(`/api/routines/${encodeURIComponent(name)}`, {});
    toast(op.summary || `${label} lancée`, { kind: 'info', detail: op.dry_run ? 'simulée : commande affichée, non exécutée' : 'exécution réelle, journal en direct' });
    await refresh(['routines', 'state']);
    render();
    trackOp(op, async (final) => {
      await refresh(['routines', 'state', 'runs', 'pending']);
      render();
      if (final) {
        const res = final.result || {};
        const detail = res.simulated ? 'simulée, non exécutée'
          : [`code ${res.exit_code ?? 'inconnu'}`, res.duration_s != null ? duration(res.duration_s) : null, final.status].filter(Boolean).join(' · ');
        toast(final.summary || `${label} terminée`, { kind: final.status === 'succeeded' ? 'ok' : 'warn', detail });
      }
    }, { log: label });
  } catch (err) {
    if (err.code === 'locked') toast(err.message, { kind: 'warn' });
    else toastError(err, label);
  }
}

// ---------------------------------------------------------------- keyboard

function showHelp() {
  const keys = [
    ['j / k', 'élément suivant / précédent'],
    ['Entrée', 'ouvrir le détail'],
    ['e', 'Réglé (liste Relances et Décisions seulement)'],
    ['r', 'ouvrir la consigne de réponse à tous (mail), ne lance rien'],
    ['c', 'aller au chat'],
    ['/', 'filtrer si la liste a le focus, sinon rechercher partout'],
    ['Ctrl+K', 'recherche globale'],
    ['x', 'cocher la proposition (vue Propositions)'],
    ['?', 'cette aide'],
    ['Échap', 'fermer, quitter le champ'],
    ['g puis t, m, p, d, b, f, j, a', 'changer de vue'],
  ];
  openDialog('Raccourcis clavier', h('dl', { class: 'keys' }, keys.map(([k, t]) => [h('dt', null, h('kbd', { text: k })), h('dd', { text: t })])));
}

let gPending = false;
const GO = { t: 'today', m: 'mail', p: 'pending', d: 'decisions', b: 'drafts', f: 'dossiers', j: 'jobs', a: 'accounts' };

function onKey(e) {
  if (e.defaultPrevented) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.altKey) { e.preventDefault(); searchGlobal(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.getElementById('dialog').open) return;
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  if (e.key === 'Escape') {
    if (document.querySelector('.menu')) { closeMenus(); return; }
    if (typing) { t.blur(); if (t.id === 'filter' && store.filter) { store.filter = ''; t.value = ''; renderList(); } return; }
    if (document.body.classList.contains('nav-open')) { document.body.classList.remove('nav-open'); return; }
    if (document.body.classList.contains('chat-open')) { document.body.classList.remove('chat-open'); return; }
    if (store.showDetail) { store.showDetail = false; layoutNarrow(); return; }
    const v = views[store.view];
    if (v.onEscape) v.onEscape();
    return;
  }
  if (typing) return;
  // Controls inside the chat must never trigger actions on a selected pending row.
  if (t?.closest('#pane-chat')) return;
  if (document.getElementById('dialog').open) return;
  if (gPending) {
    gPending = false;
    if (GO[e.key]) { e.preventDefault(); setView(GO[e.key]); }
    return;
  }
  const v = views[store.view];
  switch (e.key) {
    case 'j': e.preventDefault(); move(1); break;
    case 'k': e.preventDefault(); move(-1); break;
    case 'ArrowDown': if (t && t.closest && t.closest('#pane-list')) { e.preventDefault(); move(1); } break;
    case 'ArrowUp': if (t && t.closest && t.closest('#pane-list')) { e.preventDefault(); move(-1); } break;
    case 'Enter': {
      if (t && t.closest && t.closest('button, a')) return;
      const s = selectedEntry();
      if (s) { e.preventDefault(); select(s.key, { open: true, focus: true }); }
      break;
    }
    case 'e': {
      const s = selectedEntry();
      if (v.allowDoneKey && s && s.pending) { e.preventDefault(); pendingDone(s.pending); }
      break;
    }
    case 'r': if (v.onReplyKey) { e.preventDefault(); v.onReplyKey(); } break;
    case 'x': if (v.onToggleKey) { e.preventDefault(); v.onToggleKey(); } break;
    case 'c': e.preventDefault(); openChat(); break;
    case '/':
      e.preventDefault();
      if (!v.wide && t?.closest('#pane-list')) document.getElementById('filter').focus();
      else searchGlobal();
      break;
    case '?': e.preventDefault(); showHelp(); break;
    case 'g': gPending = true; setTimeout(() => { gPending = false; }, 1200); break;
    default: break;
  }
}

// ---------------------------------------------------------------- boot

async function boot() {
  initRail();
  initDrawer();
  document.getElementById('search-open').append(icon('search'));
  document.getElementById('search-open').addEventListener('click', searchGlobal);
  setFileOpener(openFile);
  document.getElementById('drawer-close').append(icon('close'));
  document.getElementById('dialog-close').append(icon('close'));
  document.getElementById('dialog-close').addEventListener('click', closeDialog);
  document.getElementById('back-btn').append(icon('back'));
  document.getElementById('back-btn').addEventListener('click', () => { store.showDetail = false; layoutNarrow(); });
  const chatToggle = document.getElementById('chat-toggle');
  chatToggle.append(icon('chat'));
  chatToggle.addEventListener('click', () => document.body.classList.toggle('chat-open'));
  const filter = document.getElementById('filter');
  filter.addEventListener('input', () => { store.filter = filter.value; renderList(); });
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); filter.blur(); move(0); const r = document.querySelector('#pane-list .row.selected, #pane-list .row'); if (r) r.focus(); }
  });
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', () => { closeMenus(); });

  render();
  try {
    await api.init();
    await load('session', null, { quiet: true });
    const err = cacheErr('session');
    if (err && !api.fixtures) toast(`Session : ${err.message}`, { kind: 'error' });
  } catch (err) {
    clear(document.getElementById('pane-detail')).append(errorState(err, () => location.reload()));
    console.error(err);
    return;
  }
  await Promise.all([load('state'), load('config'), load('routines', null, { quiet: true }), load('pending', null, { quiet: true })]);
  store.sinceVisit = cached('state')?.since_last_visit;
  try { await api.post('/api/state/visit', {}); }
  catch (err) { toastError(err, 'Enregistrement de la visite'); }
  await setView(store.view, store.sel[store.view]);
  store.showDetail = false;
  layoutNarrow();

  if (!api.fixtures) {
    setInterval(async () => {
      if (document.hidden) return;
      await refresh(['state', 'routines', 'runs']);
      renderRail(); renderHeader(); renderBanners();
      if (store.view === 'today' || store.view === 'jobs') { renderList(); renderDetail(); }
    }, 30000);
  }
}

window.addEventListener('error', (e) => { toast(`Erreur d'interface : ${e.message}`, { kind: 'error' }); });
boot();


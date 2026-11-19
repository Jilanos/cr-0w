#!/usr/bin/env node
// Headless Chromium checks for the panel UI in fixtures mode. No dependencies: Node >= 22
// (global WebSocket) talking CDP to a Chromium binary.
//
// It serves bin/panel_ui/ on 127.0.0.1 with the server's CSP headers, opens every view and
// every fixture scenario, drives the main flows (Réglé + Annuler, reply-all, triage, chat,
// routine log), saves screenshots (light, dark, mobile) and fails on any console error.
//
// usage: node dev/shots.mjs [--out DIR] [--chrome PATH] [--only NAME[,NAME]] [--no-shots]
// env:   CHROME=/path/to/chrome (else the newest Playwright Chromium under $HOME/.cache)

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const OUT = path.resolve(opt('--out', path.join(ROOT, 'dev', 'shots')));
const ONLY = (opt('--only', '') || '').split(',').filter(Boolean);
const NO_SHOTS = args.includes('--no-shots');

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

// ---------------------------------------------------------------- static server

function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------------------------------------------------------------- chromium + CDP

export async function findChrome() {
  if (opt('--chrome')) return opt('--chrome');
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(process.env.HOME || '', '.cache', 'ms-playwright');
  if (!existsSync(base)) throw new Error('Chromium introuvable : passer --chrome ou CHROME=');
  const dirs = (await readdir(base)).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-linux64', 'chrome');
    if (existsSync(p)) return p;
  }
  throw new Error('Chromium introuvable : passer --chrome ou CHROME=');
}

export async function launch(bin) {
  const profile = await mkdtemp(path.join(tmpdir(), 'panel-shots-'));
  const proc = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', '--lang=fr-FR', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  const ws = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chromium ne répond pas')), 20000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on('exit', (code) => reject(new Error(`Chromium sorti (${code}) : ${buf.slice(-400)}`)));
  });
  return { proc, ws, profile };
}

export class CDP {
  constructor(url) {
    this.id = 0; this.pending = new Map(); this.handlers = new Map();
    this.sock = new WebSocket(url);
    this.ready = new Promise((r, j) => { this.sock.onopen = r; this.sock.onerror = j; });
    this.sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.method) {
        const key = (msg.sessionId || '') + ':' + msg.method;
        (this.handlers.get(key) || []).forEach((fn) => fn(msg.params));
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.sock.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(sessionId, method, fn) {
    const key = (sessionId || '') + ':' + method;
    if (!this.handlers.has(key)) this.handlers.set(key, []);
    this.handlers.get(key).push(fn);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function newPage(cdp, { width, height, dark, mobile }) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  const errors = [];
  cdp.on(sessionId, 'Runtime.exceptionThrown', (p) => errors.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
  cdp.on(sessionId, 'Runtime.consoleAPICalled', (p) => { if (p.type === 'error' || p.type === 'assert') errors.push('console.error: ' + p.args.map((a) => a.value ?? a.description).join(' ')); });
  cdp.on(sessionId, 'Log.entryAdded', (p) => { if (p.entry.level === 'error') errors.push(`log ${p.entry.source}: ${p.entry.text} ${p.entry.url || ''}`); });
  let loaded = null;
  cdp.on(sessionId, 'Page.loadEventFired', () => { if (loaded) loaded(); });
  await s('Page.enable'); await s('Runtime.enable'); await s('Log.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: !!mobile });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const page = {
    errors, sessionId,
    async goto(url, wait = 900) {
      const p = new Promise((r) => { loaded = r; });
      await s('Page.navigate', { url });
      // Chromium does not consistently emit load for top-level SVG documents.
      // The favicon is only an origin anchor for localStorage in open().
      if (!url.endsWith('/favicon.svg')) await Promise.race([p, sleep(8000)]);
      await sleep(wait);
    },
    async eval(expr) {
      const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n${expr}`);
      return r.result.value;
    },
    async click(selector, text) {
      const ok = await this.eval(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
        const el = ${text ? `els.find((e) => e.textContent.includes(${JSON.stringify(text)}))` : 'els[0]'};
        if (!el) return false; el.scrollIntoView({ block: 'center' }); if (el.matches('input, textarea, select')) el.focus(); el.click(); return true; })()`);
      if (!ok) throw new Error(`élément absent : ${selector}${text ? ' « ' + text + ' »' : ''}`);
      await sleep(250);
    },
    async key(key, wait = 250) {
      const text = key.length === 1 ? key : undefined;
      const code = key.length === 1 ? 'Key' + key.toUpperCase() : key;
      await s('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, windowsVirtualKeyCode: key === 'Enter' ? 13 : key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0) });
      await s('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
      await sleep(wait);
    },
    async type(text) { await s('Input.insertText', { text }); await sleep(100); },
    async shot(name) {
      if (NO_SHOTS) return;
      const { data } = await s('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(OUT, name + '.png'), Buffer.from(data, 'base64'));
    },
    async close() { await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {}); },
  };
  return page;
}

// ---------------------------------------------------------------- scenarios

const DESK = { width: 1440, height: 900 };
const MID = { width: 1024, height: 768 };
const MOBILE = { width: 390, height: 844, mobile: true };

function url(base, opts = {}) {
  const q = new URLSearchParams({ fixtures: '1' });
  if (opts.scenario) q.set('scenario', opts.scenario);
  return `${base}/index.html?${q}`;
}

// Opens the app with a view (and selection) already stored, like a returning user.
async function open(page, base, { view, sel, scenario, mailMode, theme, wait } = {}) {
  await page.goto(`${base}/favicon.svg`, 100);
  await page.eval(`localStorage.clear(); localStorage.setItem('crow.view', ${JSON.stringify(JSON.stringify(view || 'today'))});
    localStorage.setItem('crow.sel', ${JSON.stringify(JSON.stringify(sel || {}))});
    ${mailMode ? `localStorage.setItem('crow.mailMode', ${JSON.stringify(JSON.stringify(mailMode))});` : ''}
    ${theme ? `localStorage.setItem('crow.theme', ${JSON.stringify(JSON.stringify(theme))});` : ''} true`);
  await page.goto(url(base, { scenario }), wait ?? 1100);
}

const has = async (page, sel, text) => page.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].some((e) => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : 'true'})`);
async function expect(page, sel, text, what) {
  if (!(await has(page, sel, text))) throw new Error(`attendu : ${what || sel + (text ? ' « ' + text + ' »' : '')}`);
}

const VIEWS = ['today', 'mail', 'drafts', 'pending', 'decisions', 'dossiers', 'jobs', 'accounts', 'terminal'];

const SCENARIOS = [];
const add = (name, vp, run) => SCENARIOS.push({ name, vp, run });

for (const width of [1280, 1024, 390]) {
  add('header-routines-' + width, { ...DESK, width, mobile: width < 500 }, async (page, base) => {
    await open(page, base, { view: 'pending' });
    await expect(page, '.admission', 'claude 1/3 · worka 0/1 · workb 0/1');
    const controls = await page.eval(`({width:innerWidth,buttons:[...document.querySelectorAll('#topbar-actions button')].map(b=>({label:b.getAttribute('aria-label'),right:b.getBoundingClientRect().right}))})`);
    for (const label of ['Historique', 'Mise à jour outils', 'Save OneDrive']) {
      if (!controls.buttons.some(b => b.label === label && b.right <= controls.width)) throw new Error('Commande inaccessible : ' + label);
    }
  });
}

for (const [theme, viewport] of [['light', DESK], ['dark', { ...DESK, dark: true }], ['mobile', MOBILE]]) {
  add(`search-${theme}`, viewport, async (page, base) => {
    await open(page, base);
    await page.key('/');
    await expect(page, '#dialog[open]', 'Recherche globale');
    await page.type('a'); await sleep(600);
    for (const kind of ['Mails', 'En attente', 'Décisions', 'Dossiers', 'Runs']) await expect(page, '.search-group', kind);
    await page.shot(`search-${theme}`);
    await page.key('Enter', 700);
    await expect(page, '.view-title', 'Mails');
    if (await has(page, '#dialog[open]')) throw new Error('Recherche encore ouverte');
    await page.eval(`document.querySelector('.chat-input')?.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key:'k', ctrlKey:true, bubbles:true, cancelable:true })); true`);
    if (await page.eval('document.activeElement.id') !== 'global-search') throw new Error('Ctrl+K ne donne pas le focus à la recherche');
    await page.type('corbeille'); await sleep(600);
    await page.key('Enter', 700);
    await expect(page, '.detail', 'quelle suite');
    await page.click('#search-open'); await page.type('atelier'); await sleep(600);
    await page.click('.search-result', 'Faisceau série A'); await sleep(500);
    await expect(page, '.view-title', 'Dossiers');
    await page.click('#search-open'); await page.type('routine:maj'); await sleep(600);
    await page.key('Enter', 600); await expect(page, '.report', 'Livré');
  });
}

add('search-filter-empty-stale', DESK, async (page, base) => {
  await open(page, base, { view: 'pending' });
  await page.key('j'); await page.key('/');
  if (await page.eval('document.activeElement.id') !== 'filter') throw new Error('Filtre de liste perdu');
  await page.key('Escape');
  await page.click('.segmented button', 'Échéances');
  await page.click('#search-open'); await page.type('Alpha'); await sleep(600);
  await page.click('.search-result', 'Fournisseur Alpha (J. Martin)'); await sleep(600);
  await expect(page, '.detail h2', 'Fournisseur Alpha (J. Martin)');
  await expect(page, '.segmented button.active', 'Liste');
  await page.click('#search-open'); await page.type('zzzz-unmatched'); await sleep(600);
  await expect(page, '#search-results', 'Aucun résultat');
  await page.key('Enter'); await expect(page, '#dialog[open]', 'Recherche globale');
  await page.key('Escape');
  await page.click('#search-open');
  await page.eval(`(async () => { const {api} = await import('./js/api.js'); const get = api.get.bind(api);
    api.get = async p => { if(p.includes('/api/search?q=old')) { await new Promise(r=>setTimeout(r,600)); return { groups:[{label:'Mails',total:1,items:[{key:'old',title:'Obsolete',view:'mail'}]}],sources:{} }; } return get(p); }; })()`);
  await page.type('old'); await sleep(200);
  await page.eval(`document.getElementById('global-search').value='atelier'; document.getElementById('global-search').dispatchEvent(new Event('input',{bubbles:true})); true`);
  await sleep(900); await expect(page, '.search-result', 'Faisceau série A');
  if (await has(page, '.search-result', 'Obsolete')) throw new Error('Réponse ancienne affichée');
  await page.key('ArrowDown'); await page.key('ArrowUp');
  const active = await page.eval(`document.getElementById('global-search').getAttribute('aria-activedescendant')`);
  if (!active) throw new Error('Résultat clavier absent');
});

add('flow-since-visit', DESK, async (page, base) => {
  await open(page, base, { scenario: 'visit' });
  await expect(page, '.card', 'Depuis ta dernière visite');
  await expect(page, '.card', 'Nouveau sujet');
  await page.shot('since-visit');
  await page.click('.card-row', 'Nouveau sujet');
  await expect(page, '.view-title', 'Mails');
});

add('flow-afk-answer', DESK, async (page, base) => {
  await open(page, base, { view: 'decisions', sel: { decisions: 'afk:1' } });
  await expect(page, '.detail', 'Corbeille');
  await page.shot('decision-before');
  await page.click('.detail .btn', 'attendre un outil compatible');
  await expect(page, '.detail', 'Choix enregistré : attendre un outil compatible');
  await expect(page, '.toast', 'sur la copie');
  await page.shot('decision-answered');
});

add('flow-calendar', DESK, async (page, base) => {
  await open(page, base, { scenario: 'calendar' });
  await expect(page, '.card', 'Calendrier : à jour');
  await page.click('.card-row', 'Revue du projet exemple');
  await expect(page, '.detail', 'Réunion Outlook');
  await expect(page, '.detail', 'Salle projet');
  await page.shot('calendar-detail');
  const link = await page.eval(`document.querySelector('.detail a').href`);
  if (!link.startsWith('https://outlook.')) throw new Error('Lien calendrier invalide');
  const done = await page.eval(`[...document.querySelectorAll('.detail button')].some(b => b.textContent.includes('Réglé'))`);
  if (done) throw new Error('Un rendez-vous ne doit pas proposer Réglé');
});

for (const [name, vp] of [['timeline', DESK], ['timeline-dark', { ...DESK, dark: true }], ['timeline-mobile', MOBILE]]) {
  add(`flow-${name}`, vp, async (page, base) => {
    await open(page, base, { view: 'pending', scenario: 'calendar' });
    await page.click('.seg', 'Chronologie'); await sleep(400);
    await expect(page, '.tl-svg', null, 'frise');
    for (const lane of ['Relances', 'Échéances', 'Réunions', 'Brouillons', 'Décisions']) await expect(page, '.tl-svg .tl-lane', lane);
    if (await has(page, '.tl-item', 'worka')) throw new Error('reset de compte visible par défaut');
    await expect(page, '.tl-item', 'Point fournisseur Beta');
    await page.shot(`${name}`);
    await page.click('.tl-item', 'Point fournisseur Beta'); await sleep(300);
    await expect(page, '.tl-side', 'Réunion Outlook');
    await page.click('.fchip', 'Réunions'); await sleep(300);
    if (await has(page, '.tl-item', 'Câbles Beta')) throw new Error('filtre Réunions sans effet');
    await page.click('.fchip', 'Relances'); await sleep(300);
    await expect(page, '.tl-item', 'Câbles Beta', 'filtres combinables');
    await page.click('.fchip', 'En retard'); await sleep(300);
    if (await has(page, '.tl-item', 'Câbles Beta')) throw new Error('filtre En retard sans effet');
    await expect(page, '.tl-item', 'Fournisseur Alpha');
    await page.shot(`${name}-filtered`);
    await page.goto(url(base, { scenario: 'calendar' }), 1100);
    await expect(page, '.fchip.on', 'En retard', 'filtres mémorisés');
    await expect(page, '.tl-svg', null, 'onglet mémorisé');
    await page.click('.fchip', 'Resets comptes'); await sleep(300);
    await page.click('.fchip', 'En retard'); await sleep(300);
    await page.click('.link-btn', 'Effacer'); await sleep(300);
    await expect(page, '.tl-item', 'worka', 'resets sur demande');
    await page.click('.seg', 'Échéances'); await sleep(300);
    await expect(page, '.list-group', 'Sans date');
    await page.shot(`${name}-list`);
  });
}

add('flow-dossiers', DESK, async (page, base) => {
  await open(page, base, { view: 'dossiers' });
  await expect(page, '.list-group', 'Actifs sur 14 j');
  await expect(page, '.row', 'analyse_ids_bus');
  await page.click('.row', 'analyse_ids_bus'); await sleep(500);
  await expect(page, '.detail', 'Mails liés (1)');
  await expect(page, '.detail', 'Lignes liées (1)');
  await page.shot('dossiers-auto');
  await page.click('.detail button', 'Épingler'); await sleep(500);
  await expect(page, '.list-group', 'Épinglés');
  await page.click('.row', 'Alpha'); await sleep(400);
  await page.click('.detail button', 'Masquer'); await sleep(500);
  if (await has(page, '.row', 'Alpha')) throw new Error('dossier masqué encore listé');
  await page.click('.toggle input'); await sleep(500);
  await expect(page, '.list-group', 'Masqués');
  await page.click('.list-head button', 'Créer un dossier'); await sleep(500);
  await expect(page, '#dialog[open]', 'Créer un dossier depuis un répertoire');
  await page.click('#dialog input[type=search]'); await page.type('faisceau'); await sleep(700);
  await expect(page, '.dir-item', 'WORK/20_Faisceau/serie-a/');
  if (await has(page, '.dir-item', '70_Code')) throw new Error('recherche de répertoire sans effet');
  await page.shot('dossiers-create');
  await page.click('.dir-item', 'serie-a'); await sleep(200);
  await page.click('#dialog button', 'Créer'); await sleep(700);
  await expect(page, '.detail', 'WORK/20_Faisceau/serie-a/');
  await page.shot('dossiers-pinned');
});

// Every view, light and dark, desktop.
for (const dark of [false, true]) {
  for (const v of VIEWS) {
    add(`${dark ? 'dark' : 'light'}-${v}`, { ...DESK, dark }, async (page, base) => {
      await open(page, base, { view: v });
      await expect(page, '.view-title', null, 'titre de vue');
      if (v === 'terminal' || v === 'today') {
        if (await page.eval(`getComputedStyle(document.getElementById('pane-list')).display !== 'none'`)) throw new Error('Liste visible dans une vue pleine largeur');
      }
      if (v === 'terminal') await expect(page, '.terminal-screen', 'Hub prêt');
      else if (v !== 'today') await expect(page, '#pane-list .row', null, `lignes dans ${v}`);
      else await expect(page, '.kpi', null, 'tuiles KPI');
      await page.shot(`${dark ? 'dark' : 'light'}-${v}`);
    });
  }
}

add('flow-done-undo', DESK, async (page, base) => {
  await open(page, base, { view: 'pending', sel: { pending: 'p_k3m9x2qa' } });
  await expect(page, '.detail h2', 'Fournisseur Alpha');
  await page.key('e', 400);
  await expect(page, '.toast', 'Réglé', 'toast Réglé');
  await expect(page, '.toast-action', 'Annuler', 'bouton Annuler');
  if (await has(page, '#pane-list .row:not(.dim)[data-key="p_k3m9x2qa"]')) throw new Error('la ligne réglée est encore dans sa section');
  await expect(page, '#pane-list .row.dim[data-key="p_k3m9x2qa"]', null, 'ligne dans Réglé récemment');
  await page.shot('flow-done-toast');
  await page.click('.toast-action');
  await sleep(500);
  await expect(page, '.toast', 'Annulé', 'toast Annulé');
  await expect(page, '#pane-list .row:not(.dim)[data-key="p_k3m9x2qa"]', null, 'ligne remise à sa place');
});

add('flow-snooze', DESK, async (page, base) => {
  await open(page, base, { view: 'pending', sel: { pending: 'p_7hd2lw0e' } });
  await page.click('.detail .btn', 'Reporter');
  await expect(page, '.menu', '+2 jours ouvrés');
  await page.shot('flow-snooze-menu');
  await page.click('.menu-item', '+1 semaine');
  await sleep(400);
  await expect(page, '.toast', 'Reporté');
});

for (const [name, viewport] of [['desktop', DESK], ['mobile', MOBILE]]) {
  add('flow-terminal-' + name, viewport, async (page, base) => {
    await open(page, base, { view: 'pending', sel: { pending: 'p_7hd2lw0e' } });
    if (await has(page, '#pane-chat')) throw new Error('Ancien chat encore présent');
    await page.eval(`import('./js/api.js').then(({api})=>{
      window.terminalCalls=[]; const post=api.post.bind(api), get=api.get.bind(api);
      api.post=async(p,b)=>{ if(p.startsWith('/api/terminal'))window.terminalCalls.push({path:p,body:b}); if(p.endsWith('/start'))window.hubStopped=false; return post(p,b); };
      api.get=async p=>p==='/api/terminal'&&window.hubStopped ? {running:false,sessions:[]} : get(p);
    })`);

    await page.click('#pane-detail .btn', 'Envoyer au hub');
    await page.click('#dialog textarea'); await page.type('Relance avec mon contexte');
    await page.click('#dialog button', 'Insérer dans le terminal'); await sleep(1500);
    await expect(page, '.view-title', 'Terminal');
    await expect(page, '.terminal-view code', 'tmux attach -t crow-hub-fixture');
    await expect(page, '.terminal-screen', 'Hub prêt');
    if (await has(page, '.terminal-screen script')) throw new Error('Texte terminal interprété comme HTML');
    const calls = () => page.eval('window.terminalCalls');
    const handoff = (await calls()).find(c => c.path.endsWith('/handoff'));
    if (!handoff || handoff.body.note !== 'Relance avec mon contexte') throw new Error('Contexte non transféré');
    if ((await calls()).some(c => c.path.endsWith('/keys'))) throw new Error('Entrée envoyée pendant le transfert');
    await page.click('.terminal-screen'); await page.key('e'); await page.key('Enter'); await sleep(500);
    const keys = (await calls()).filter(c => c.path.endsWith('/keys')).flatMap(c => c.body.keys);
    if (!keys.some(k=>k.text==='e') || !keys.some(k=>k.key==='Enter')) throw new Error('Saisie non transmise');
    await page.eval('window.hubStopped=true'); await sleep(1400);
    await expect(page, '.terminal-view', 'Démarrer le hub');
    await page.click('.terminal-view button', 'Démarrer le hub'); await sleep(1400);
    await expect(page, '.terminal-screen', 'Hub prêt');
    await page.shot('terminal-' + name);
  });
}

add('flow-history-readonly', DESK, async (page, base) => {
  await open(page, base, { view: 'pending' });
  await page.click('#topbar-actions button', 'Historique');
  await expect(page, '#dialog', 'lecture seule');
  await page.click('#dialog .search-result'); await sleep(500);
  await expect(page, '#dialog', 'historique en lecture seule');
  if (await has(page, '#dialog textarea, #chat-input')) throw new Error('Historique modifiable');
});

add('flow-reply-all', DESK, async (page, base) => {
  await open(page, base, { view: 'mail', sel: { mail: 'AAMkAGFAKE0002==' } });
  await expect(page, '.body-text', 'fils 12 et 48');
  await page.key('r', 300);
  await expect(page, '#reply-instructions', null, 'boîte de consigne');
  await page.shot('flow-reply-box');
  await page.click('#reply-instructions');
  await page.type('Confirmer 1 mm² pour les fils 12 et 48, demander le cartouche révision C.');
  await page.click('.reply-box .btn-primary', 'Préparer');
  await sleep(700);
  await expect(page, '.steps', 'Squelette');
  await page.shot('flow-reply-running');
  await sleep(3400);
  await expect(page, '.checks', 'Signature', 'contrôles finaux');
  await page.shot('flow-reply-done');
});

add('flow-triage', DESK, async (page, base) => {
  await open(page, base, { view: 'mail', mailMode: 'triage' });
  await expect(page, '.triage-row', null, 'propositions');
  await expect(page, '#pane-list', 'Confiance haute');
  await page.shot('flow-triage-checked');
  await page.click('.list-foot .link-btn', 'Tout valider (haute confiance)');
  await sleep(300);
  await expect(page, '.detail h2', 'action', 'récapitulatif du lot');
  await page.shot('flow-triage-plan');
  await page.click('.detail .btn-primary', 'Exécuter');
  await sleep(500);
  await expect(page, '.detail', 'Résultat du lot');
  await page.shot('flow-triage-result');
  await page.click('.detail .btn', 'Annuler le lot');
  await sleep(500);
  await expect(page, '.toast', 'Annulé');
});

add('flow-classer', DESK, async (page, base) => {
  await open(page, base, { view: 'mail', sel: { mail: 'AAMkAGFAKE0005==' } });
  await page.click('.detail .btn', 'Classer');
  await expect(page, '.menu', 'Proposition de crow');
  await page.shot('flow-classer-menu');
  await page.click('.folder-picker input');
  await page.type('serie');
  await expect(page, '.folder-option', 'Série A', 'recherche sans accent');
  if (await has(page, '.folder-option', 'Fournisseurs')) throw new Error('Dossier hors recherche');
  await page.click('.folder-option', 'Série A');
  await expect(page, '.folder-chosen', 'Série A');
  await page.shot('flow-classer-search');
  await page.click('.menu .btn-primary', 'Préparer le lot');
  await sleep(400);
  await expect(page, '.detail h2', '1 action');
});

add('flow-routine-log', DESK, async (page, base) => {
  await open(page, base, { view: 'jobs', sel: { jobs: 'routine:maj' } });
  await page.click('.topbar-actions .btn', 'Maj');
  await sleep(1500);
  await expect(page, '.drawer.open .log-lines li', null, 'journal en direct');
  await page.shot('flow-routine-log');
  await sleep(2500);
});

add('flow-keys-help', DESK, async (page, base) => {
  await open(page, base, { view: 'pending' });
  await page.key('j'); await page.key('j'); await page.key('k');
  await page.key('?', 300);
  await expect(page, '#dialog[open]', 'Raccourcis');
  await page.shot('flow-help');
  await page.key('Escape');
  await page.key('/');
  const f = await page.eval(`document.activeElement && document.activeElement.id`);
  if (f !== 'filter') throw new Error('/ ne donne pas le focus au filtre');
  await page.type('Beta');
  await sleep(200);
  const n = await page.eval(`document.querySelectorAll('#pane-list .row').length`);
  if (n !== 2) throw new Error(`filtre « Beta » : ${n} lignes au lieu de 2`);
  await page.key('Escape');
  // e outside the pending lists does nothing
  await page.click('.rail-item', 'Mails');
  await sleep(500);
  await page.key('e', 300);
  if (await has(page, '.toast', 'Réglé')) throw new Error('e a agi hors de la liste En attente');
  await page.key('c', 300);
  if (await has(page, '#chat-input')) throw new Error('Ancien raccourci chat actif');
  await page.key('g'); await page.key('h'); await sleep(1200);
  await expect(page, '.view-title', 'Terminal');
});

add('flow-file-open', DESK, async (page, base) => {
  await open(page, base, { view: 'dossiers', sel: { dossiers: 'faisceau-serie-a' } });
  await expect(page, '.detail', 'Lignes liées');
  await expect(page, '.detail', 'Check_faisceau_2026-11-03.xlsx');
  await expect(page, '.detail', 'modifié depuis');
  await page.shot('recent-files');
  await page.click('.detail .btn-primary', 'Ouvrir le dossier');
  await sleep(300);
  await expect(page, '.toast', 'Windows');
});

add('flow-run-detail', DESK, async (page, base) => {
  await open(page, base, { view: 'jobs', sel: { jobs: 'run:scr_20261118T061500' } });
  await expect(page, '.report', 'Livré');
  await page.shot('flow-run-detail');
  await page.click('.rail-item', 'Comptes');
  await sleep(500);
  await page.click('#pane-list .row', 'Ranger un mail');
  await expect(page, '.evidence', 'Essai réel');
  await page.shot('flow-capability');
});

add('flow-hostile', DESK, async (page, base) => {
  await open(page, base, { view: 'pending' });
  const r = await page.eval(`(async () => {
    const ui = await import('./js/ui.js');
    const box = document.createElement('div');
    box.append(ui.segments([{ t: 'link', v: 'x', href: 'javascript:alert(1)' }, { t: 'text', v: '<img src=x onerror=alert(1)>' },
      { t: 'link', v: 'y', href: 'http://example.com' }, { t: 'link', v: 'z', href: 'https://example.com/a' }]));
    return { links: box.querySelectorAll('a').length, imgs: box.querySelectorAll('img').length, href: box.querySelector('a') && box.querySelector('a').href };
  })()`);
  if (r.links !== 1 || r.imgs !== 0 || r.href !== 'https://example.com/a') throw new Error('rendu de segments hostiles : ' + JSON.stringify(r));
});

// Narrow and mobile layouts.
add('mid-pending-detail', MID, async (page, base) => {
  await open(page, base, { view: 'pending', sel: { pending: 'p_7hd2lw0e' } });
  await page.shot('mid-pending');
  await page.click('.detail .btn', 'Envoyer au hub');
  await page.shot('mid-pending-handoff');
});
for (const dark of [false, true]) {
  const tag = dark ? 'dark' : 'light';
  add(`mobile-${tag}`, { ...MOBILE, dark }, async (page, base) => {
    await open(page, base, { view: 'today' });
    await page.shot(`mobile-${tag}-today`);
    await page.click('#nav-open');
    await sleep(300);
    await page.shot(`mobile-${tag}-nav`);
    await page.click('.rail-item', 'Relances');
    await sleep(700);
    await page.shot(`mobile-${tag}-pending-list`);
    await page.click('#pane-list .row', 'Fournisseur Alpha');
    await sleep(400);
    await expect(page, '.detail h2', 'Fournisseur Alpha');
    await page.shot(`mobile-${tag}-pending-detail`);
    await page.click('.detail .btn', 'Envoyer au hub');
    await sleep(300);
    await page.shot(`mobile-${tag}-handoff`);
    await page.key('Escape');
    await page.click('#nav-open');
    await page.click('.rail-item', 'Mails');
    await sleep(700);
    await page.click('#pane-list .row', 'Plans révision C');
    await sleep(500);
    await page.shot(`mobile-${tag}-mail-detail`);
  });
}

// Every fixture scenario from index.json.
const SCEN = {
  empty: async (page, base) => {
    await open(page, base, { view: 'pending', scenario: 'empty' });
    await expect(page, '.state-empty', 'Liste vide');
    await page.shot('scenario-empty-pending');
    await page.click('.rail-item', 'Mails');
    await sleep(600);
    await expect(page, '.state-empty', 'Boîte vide');
    await page.shot('scenario-empty-mail');
  },
  locked: async (page, base) => {
    await open(page, base, { view: 'pending', scenario: 'locked', sel: { pending: 'p_k3m9x2qa' } });
    await expect(page, '.banner-lock', 'Mise à jour en cours');
    const dis = await page.eval(`[...document.querySelectorAll('.detail .btn')].find((b) => b.textContent.includes('Réglé')).disabled`);
    if (dis) throw new Error('Réglé doit pouvoir rejoindre la file pendant une maj');
    const maj = await page.eval(`[...document.querySelectorAll('.topbar-actions .btn')].find((b) => b.textContent.trim() === 'Maj').disabled`);
    if (!maj) throw new Error('bouton Maj actif pendant une maj');
    await page.click('.detail .btn', 'Réglé');
    await expect(page, '.toast', 'Clic en file');
    await expect(page, '#pane-list .row[data-key="p_k3m9x2qa"]', null, 'ligne conservée pendant la file');
    await page.shot('scenario-locked');
    await sleep(4000);
    await expect(page, '.toast', 'Clic en file');
    await page.click('.toast-action', 'Retirer de la file');
    await sleep(600);
    await expect(page, '.toast', 'Clic retiré');
  },
  partial: async (page, base) => {
    await open(page, base, { view: 'mail', scenario: 'partial' });
    await expect(page, '.fresh-box', 'partielle');
    await page.shot('scenario-partial-mail');
  },
  conflict: async (page, base) => {
    await open(page, base, { view: 'pending', scenario: 'conflict', sel: { pending: 'p_k3m9x2qa' } });
    await page.key('e', 500);
    await expect(page, '.toast-error', 'La ligne a changé');
    await expect(page, '#pane-list .row[data-key="p_k3m9x2qa"]', null, 'ligne remise après 409');
    await page.shot('scenario-conflict');
  },
  consumed: async (page, base) => {
    await open(page, base, { view: 'mail', scenario: 'consumed', mailMode: 'triage' });
    await page.click('.list-foot .link-btn', 'Tout valider (haute confiance)');
    await page.click('.detail .btn-primary', 'Exécuter');
    await sleep(400);
    await expect(page, '.toast', 'déjà été exécuté');
  },
  expired: async (page, base) => {
    await open(page, base, { view: 'mail', scenario: 'expired', mailMode: 'triage' });
    await page.click('.list-foot .link-btn', 'Tout valider (haute confiance)');
    await page.click('.detail .btn-primary', 'Exécuter');
    await sleep(400);
    await expect(page, '.toast', 'expiré');
  },
  nobody: async (page, base) => {
    await open(page, base, { view: 'mail', scenario: 'nobody', sel: { mail: 'AAMkAGFAKE0009==' } });
    await expect(page, '.body-missing', 'Texte non chargé');
    await page.shot('scenario-nobody');
  },
  queued: async (page, base) => {
    await open(page, base, { view: 'jobs', scenario: 'queued' });
    await expect(page, '.view-title', 'Jobs');
  },
  policy: async (page, base) => {
    await open(page, base, { view: 'pending', scenario: 'policy' });
    if (await has(page, '#chat-input')) throw new Error('Chat présent');
  },
  upstream: async (page, base) => {
    await open(page, base, { view: 'jobs', scenario: 'upstream' });
    await expect(page, '.callout-warn', 'cdx illisible');
    await page.shot('scenario-upstream');
  },
  recovered: async (page, base) => {
    await open(page, base, { view: 'today', scenario: 'recovered' });
    const r = await page.eval(`(async () => (await (await import('./js/api.js')).api.get('/api/operations/op_x')).result.recovered)()`);
    if (r !== true) throw new Error('fixture recovered non servie');
  },
  forbidden: async (page, base) => {
    await open(page, base, { view: 'pending', scenario: 'forbidden', sel: { pending: 'p_k3m9x2qa' } });
    await page.key('e', 500);
    await expect(page, '.toast-error', 'Jeton');
  },
  idempotency: async (page, base) => {
    await open(page, base, { view: 'pending', scenario: 'idempotency', sel: { pending: 'p_k3m9x2qa' } });
    await page.key('e', 500);
    await expect(page, '.toast-error', 'request_id');
  },
};
for (const [name, run] of Object.entries(SCEN)) add(`scenario-${name}`, DESK, run);

// Every scenario also loads every view without errors.
add('scenarios-all-views', DESK, async (page, base) => {
  const index = JSON.parse(await readFile(path.join(ROOT, 'fixtures', 'index.json'), 'utf8'));
  for (const scenario of ['', ...Object.keys(index.scenarios)]) {
    console.log('    views · ' + (scenario || 'default'));
    for (const v of VIEWS) {
      await open(page, base, { view: v, scenario, wait: 700 });
      // open the first entry of each list too
      await page.eval(`(() => { const r = document.querySelector('#pane-list .row'); if (r) r.click(); return true; })()`);
      await sleep(250);
    }
  }
});

// ---------------------------------------------------------------- main

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const chrome = await launch(await findChrome());
  const cdp = new CDP(chrome.ws);
  await cdp.ready;
  const results = [];
  const list = ONLY.length ? SCENARIOS.filter((s) => ONLY.some((o) => s.name.includes(o))) : SCENARIOS;
  for (const sc of list) {
    const page = await newPage(cdp, sc.vp);
    let err = null;
    try { await sc.run(page, base); } catch (e) { err = e.message; }
    await sleep(100);
    const errs = page.errors.filter((e) => !/favicon/.test(e));
    results.push({ name: sc.name, ok: !err && !errs.length, err, console: errs });
    await writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`${!err && !errs.length ? 'ok  ' : 'FAIL'} ${sc.name}${err ? '  · ' + err : ''}${errs.length ? '  · console: ' + errs.join(' | ') : ''}`);
    await page.close();
  }
  await writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  chrome.proc.kill();
  server.close();
  await rm(chrome.profile, { recursive: true, force: true }).catch(() => {});
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} scénarios sans erreur · captures : ${OUT}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(2); });
}

// Data layer. Real mode talks to the local server; fixtures mode (?fixtures=1) runs an
// in-memory fake server built from fixtures/index.json, so the UI works with no backend.

export class ApiError extends Error {
  constructor(status, body) {
    const err = (body && body.error) || {};
    super(err.message || `Erreur HTTP ${status}`);
    this.status = status;
    this.code = err.code || 'http_' + status;
    this.retryable = !!err.retryable;
    this.details = err.details || null;
  }
}

const params = new URLSearchParams(location.search);
export const FIXTURES = params.get('fixtures') === '1';
export const SCENARIO = params.get('scenario') || '';

export function requestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

// ---------------------------------------------------------------- real backend

const real = {
  token: null,
  async session() {
    const r = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new ApiError(r.status, body);
    this.token = body.csrf_token;
    return body;
  },
  async request(method, path, body, retried = false) {
    const opts = { method, credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (method !== 'GET') {
      if (!this.token) await this.session();
      opts.headers['X-Crow-Token'] = this.token;
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body || {});
    }
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => null);
    if (r.status === 403 && !retried && data && data.error && data.error.details
        && data.error.details.reason === 'csrf') {
      await this.session();
      return this.request(method, path, body, true);
    }
    if (!r.ok) throw new ApiError(r.status, data);
    return { status: r.status, data };
  },
  stream(url, handlers) {
    const es = new EventSource(url, { withCredentials: true });
    const types = ['status', 'text', 'tool', 'step', 'cost', 'error', 'done'];
    for (const t of types) {
      es.addEventListener(t, (ev) => {
        let data = null;
        try { data = JSON.parse(ev.data); } catch { data = { text: ev.data }; }
        if (handlers.event) handlers.event(t, data, Number(ev.lastEventId) || null);
        if (t === 'done') { es.close(); if (handlers.end) handlers.end(data); }
      });
    }
    es.onerror = () => { if (handlers.error) handlers.error(); };
    return () => es.close();
  },
};

// ---------------------------------------------------------------- fake backend

const fake = {
  index: null,
  files: new Map(),     // fixture file -> mutable parsed JSON
  routes: [],           // compiled routes
  t0: 0,
  nowBase: 0,
  seq: 0,
  ops: new Map(),       // operation_id -> {op, final, onDone, inverse}
  topics: new Map(),    // topic_id -> messages document
  plans: new Map(),     // plan_id -> {plan, consumed}

  async init() {
    const r = await fetch('fixtures/index.json', { cache: 'no-store' });
    this.index = await r.json();
    this.nowBase = Date.parse(this.index.now);
    this.t0 = Date.now();
    const table = Object.assign({}, this.index.routes);
    const scen = SCENARIO && this.index.scenarios[SCENARIO];
    if (SCENARIO && !scen) console.warn(`scénario inconnu : ${SCENARIO}`);
    if (scen) Object.assign(table, scen);
    this.routes = Object.entries(table).map(([key, file]) => {
      const [method, pattern] = key.split(' ');
      const names = [];
      const re = new RegExp('^' + pattern.replace(/\{(\w+)\}/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
      return { method, pattern, re, names, file, params: names.length };
    }).sort((a, b) => a.params - b.params);
    const needed = new Set(this.routes.map((r) => r.file));
    needed.add('run-events.json');
    needed.add('error-plan-consumed.json');
    await Promise.all([...needed].map(async (f) => {
      const res = await fetch('fixtures/' + f, { cache: 'no-store' });
      if (!res.ok) throw new Error(`fixture absente : ${f}`);
      this.files.set(f, await res.json());
    }));
  },

  now() { return new Date(this.nowBase + (Date.now() - this.t0)); },

  match(method, path) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      const p = {};
      r.names.forEach((n, i) => { p[n] = decodeURIComponent(m[i + 1]); });
      return { route: r, p };
    }
    return null;
  },

  // Returns the stored document for a GET route (mutable).
  doc(method, path) {
    const m = this.match(method, path);
    return m ? this.files.get(m.route.file) : null;
  },

  raw(file) {
    const d = this.files.get(file);
    if (d && typeof d === 'object' && 'http_status' in d) return { status: d.http_status, data: d.body };
    return { status: 200, data: d };
  },

  newOp(base, patch) {
    const op = Object.assign(clone(base), patch);
    op.operation_id = `op_fx_${++this.seq}`;
    op.request_id = patch.request_id || op.request_id;
    op.created_at = op.updated_at = this.now().toISOString();
    op.links = { status_url: `/api/operations/${op.operation_id}`, events_url: `/api/operations/${op.operation_id}/events` };
    return op;
  },

  counts(delta) {
    const st = this.doc('GET', '/api/state');
    if (!st || !st.counts) return;
    for (const [k, v] of Object.entries(delta)) {
      if (typeof st.counts[k] === 'number') st.counts[k] = Math.max(0, st.counts[k] + v);
    }
  },

  findPending(id) {
    const doc = this.doc('GET', '/api/pending');
    if (!doc) return null;
    for (const s of doc.sections) {
      const i = s.items.findIndex((it) => it.id === id);
      if (i >= 0) return { doc, section: s, index: i, item: s.items[i] };
    }
    return null;
  },

  ddmm(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); },

  async request(method, rawPath, body) {
    await new Promise((r) => setTimeout(r, 60));
    const [path, qs] = rawPath.split('?');
    if (method === 'POST' && path === '/api/state/visit') return { status: 200, data: { result: { visited_at: this.now().toISOString() } } };
    const m = this.match(method, path);
    if (!m && method === 'PUT' && /^\/api\/topics\/[^/]+$/.test(path)) return this.putTopic(path.split('/')[3], body);
    if (!m) throw new ApiError(404, { error: { code: 'not_found', message: `Route absente des fixtures : ${method} ${path}` } });
    const { route, p } = m;
    const res = this.raw(route.file);
    if (res.status >= 400) throw new ApiError(res.status, res.data);
    if (method === 'GET') return this.get(route, p, res, qs);
    return this.mutate(route, p, res, body || {});
  },

  get(route, p, res, qs) {
    const data = clone(res.data);
    switch (route.pattern) {
      case '/api/mail': {
        const q = new URLSearchParams(qs || '').get('q');
        if (q) {
          const n = q.toLowerCase();
          data.items = data.items.filter((m) => (m.subject + ' ' + m.from.name + ' ' + m.preview).toLowerCase().includes(n));
        }
        return { status: 200, data };
      }
      case '/api/mail/{id}': return { status: 200, data: this.mailDetail(p.id, data) };
      case '/api/topics/{id}/messages': return { status: 200, data: clone(this.topicDoc(p.id)) };
      case '/api/operations/{id}': {
        const e = this.ops.get(p.id);
        if (e) return { status: 200, data: clone(e.done ? e.final : e.op) };
        return { status: 200, data };
      }
      case '/api/runs/{id}': {
        const runs = this.doc('GET', '/api/runs');
        const r = runs && runs.runs && runs.runs.find((x) => x.run_id === p.id);
        if (r && r.run_id !== data.run_id) {
          Object.assign(data, { run_id: r.run_id, kind: r.kind, label: r.label, status: r.status, account: r.account,
            model: r.model, started_at: r.started_at, ended_at: r.ended_at, duration_s: r.duration_s,
            exit_code: r.exit_code ?? null, cost_usd: r.cost_usd, cost_status: r.cost_status,
            operation_id: r.operation_id, report_sections: [], log_file_id: null,
            events_url: `/api/runs/${r.run_id}/events` });
        }
        return { status: 200, data };
      }
      default: return { status: 200, data };
    }
  },

  mailDetail(id, base) {
    const list = this.doc('GET', '/api/mail');
    const item = list && list.items.find((m) => m.id === id);
    if (base.id === id || !item) return base;
    const d = clone(base);
    Object.assign(d, {
      id: item.id, conversation_id: item.conversation_id, subject: item.subject, from: item.from,
      received: item.received, proposal: item.proposal, pending_ref: item.pending_ref,
      draft_ref: item.draft_ref, topic_id: item.topic_id, cc: [], thread: [], attachments: [],
      owa_link: null,
    });
    if (this.fetched && this.fetched.has(id)) {
      Object.assign(d, { body_status: 'cached', body_text: item.preview, body_truncated: true,
        body_chars: item.preview.length, actions: ['reply_all', 'triage', 'chat'] });
    } else {
      Object.assign(d, { body_status: 'not_fetched', body_text: null, body_truncated: null, body_chars: null,
        actions: ['fetch_body', 'reply_all', 'triage', 'chat'] });
    }
    return d;
  },

  topicDoc(id) {
    if (this.topics.has(id)) return this.topics.get(id);
    const base = this.files.get('topic-messages.json');
    let doc;
    if (base && base.topic_id === id) doc = clone(base);
    else {
      const list = this.files.get('topics.json');
      const t = list && list.topics.find((x) => x.topic_id === id);
      doc = { generated_at: this.now().toISOString(), topic_id: id, title: t ? t.title : null,
        ref: t ? t.ref : null, default_model: t ? t.default_model : 'sonnet',
        default_account: t ? t.default_account : 'claude', orphan: t ? t.orphan : false, messages: [] };
    }
    this.topics.set(id, doc);
    return doc;
  },

  putTopic(id, body) {
    const doc = this.topicDoc(id);
    if (body.default_model) doc.default_model = body.default_model;
    if (body.default_account) doc.default_account = body.default_account;
    return { status: 200, data: { topic_id: id, default_model: doc.default_model, default_account: doc.default_account } };
  },

  mutate(route, p, res, body) {
    const base = res.data;
    const now = this.now();
    const until = new Date(now.getTime() + 10000).toISOString();
    switch (route.pattern) {
      case '/api/pending/{id}/done': {
        const f = this.findPending(p.id);
        if (!f) throw new ApiError(409, { error: { code: 'conflict', message: 'Ligne introuvable. Liste rechargée.' } });
        const { section, index, item, doc } = f;
        section.items.splice(index, 1);
        const done = doc.sections.find((s) => s.kind === 'done');
        const attendu = item.cells.Attendu || item.cells.text || [];
        const entry = {
          id: item.id, item_rev: 'r_fx' + this.seq, section: 'done', block: null, kind: 'list_item', columns: null,
          cells: { text: [{ t: 'text', v: `${this.ddmm(now)} ${item.title} : ` }, ...clone(attendu)] },
          title: `${this.ddmm(now)} ${item.title}`, due: null, due_raw: null, overdue_workdays: null, prio: null,
          actions: ['chat'], topic_id: item.topic_id, source_line: null,
        };
        if (done) done.items.unshift(entry);
        this.counts({ pending: -1, overdue: item.overdue_workdays > 0 ? -1 : 0 });
        const op = this.newOp(base, { request_id: body.request_id, summary: `Réglé : ${item.title}`, topic_id: item.topic_id,
          items: [{ ref: { kind: 'pending', id: item.id }, status: 'succeeded', detail: 'ligne déplacée dans Réglé récemment' }],
          undo: { available: true, until, reason: null } });
        this.ops.set(op.operation_id, { op, final: op, done: true,
          inverse: () => { if (done) done.items = done.items.filter((x) => x !== entry); section.items.splice(index, 0, item);
            this.counts({ pending: 1, overdue: item.overdue_workdays > 0 ? 1 : 0 }); return item.title; } });
        return { status: res.status, data: op };
      }
      case '/api/pending/{id}/snooze': {
        const f = this.findPending(p.id);
        if (!f) throw new ApiError(409, { error: { code: 'conflict', message: 'Ligne introuvable. Liste rechargée.' } });
        const { item } = f;
        const before = clone(item);
        let d;
        if (body.due) d = new Date(body.due + 'T12:00:00');
        else { d = new Date(now); let n = body.workdays || 2; while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; } }
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const wasOverdue = item.overdue_workdays > 0;
        Object.assign(item, { due: iso, due_raw: this.ddmm(d), overdue_workdays: null, item_rev: 'r_fx' + this.seq });
        if (item.cells['Échéance']) item.cells['Échéance'] = [{ t: 'text', v: this.ddmm(d) }];
        if (wasOverdue) this.counts({ overdue: -1 });
        const op = this.newOp(base, { request_id: body.request_id, summary: `Reporté au ${this.ddmm(d)} : ${item.title}`,
          topic_id: item.topic_id, items: [{ ref: { kind: 'pending', id: item.id }, status: 'succeeded',
            detail: `Échéance ${before.due_raw || '?'} → ${this.ddmm(d)}` }], undo: { available: true, until, reason: null } });
        this.ops.set(op.operation_id, { op, final: op, done: true,
          inverse: () => { Object.assign(item, before); if (wasOverdue) this.counts({ overdue: 1 }); return item.title; } });
        return { status: res.status, data: op };
      }
      case '/api/operations/{id}/undo': {
        const e = this.ops.get(p.id);
        if (!e || !e.inverse) throw new ApiError(409, { error: { code: 'undo_expired', message: 'Rien à annuler pour cette opération.' } });
        const label = e.inverse();
        e.inverse = null;
        const kind = e.op.kind.startsWith('mail.triage') ? 'mail.triage.undo' : 'pending.undo';
        const op = this.newOp(base, { request_id: body.request_id, kind, summary: `Annulé : ${label}`,
          result: Object.assign({}, base.result, { undoes: p.id }) });
        e.op.undone_by = op.operation_id;
        return { status: res.status, data: op };
      }
      case '/api/operations/{id}/cancel': {
        const runs = this.doc('GET', '/api/runs');
        if (runs && runs.queue) runs.queue = runs.queue.filter((q) => q.operation_id !== p.id);
        this.counts({ runs_queued: -1 });
        const op = clone(base);
        Object.assign(op, { operation_id: p.id, status: 'cancelled', summary: 'Retiré de la file' });
        op.steps.forEach((s) => { s.status = 'cancelled'; });
        return { status: 200, data: op };
      }
      case '/api/mail/sync': {
        const op = this.newOp(base, { request_id: body.request_id });
        this.track(op, () => {
          const list = this.doc('GET', '/api/mail');
          if (list) { list.synced_at = this.now().toISOString(); list.stale = false; }
          const st = this.doc('GET', '/api/state');
          if (st && st.mail) { st.mail.synced_at = this.now().toISOString(); st.mail.stale = false; }
        });
        return { status: res.status, data: op };
      }
      case '/api/mail/{id}/fetch': {
        const op = this.newOp(base, { request_id: body.request_id, kind: 'mail.fetch', summary: 'Lecture du texte du mail' });
        this.track(op, () => { (this.fetched = this.fetched || new Set()).add(p.id); });
        return { status: res.status, data: op };
      }
      case '/api/mail/{id}/reply-all': {
        const list = this.doc('GET', '/api/mail');
        const mail = list && list.items.find((x) => x.id === p.id);
        const subj = mail ? mail.subject.replace(/^(RE|TR|FW)\s*:\s*/i, '') : 'mail';
        const op = this.newOp(base, { request_id: body.request_id, summary: `Réponse à tous : ${subj}`,
          topic_id: mail ? mail.topic_id : base.topic_id });
        const getFinal = this.raw(this.match('GET', '/api/operations/x').route.file).data;
        const final = getFinal && getFinal.kind === 'mail.reply_all' ? clone(getFinal) : clone(op);
        Object.assign(final, { operation_id: op.operation_id, links: op.links, topic_id: op.topic_id });
        if (final === op || final.status === 'running') final.status = 'succeeded';
        this.ops.set(op.operation_id, { op, final, done: false });
        return { status: res.status, data: op };
      }
      case '/api/mail/triage/plan': {
        const list = this.doc('GET', '/api/mail');
        const folders = (this.files.get('mail-folders.json') || { folders: [] }).folders;
        const plan = clone(base);
        plan.plan_id = `plan_fx_${++this.seq}`;
        plan.plan_hash = 'sha256:fx' + this.seq;
        plan.snapshot_rev = list ? list.snapshot_rev : plan.snapshot_rev;
        plan.created_at = now.toISOString();
        plan.expires_at = new Date(now.getTime() + 15 * 60000).toISOString();
        plan.items = []; plan.rejected = [];
        const sum = { move: 0, archive: 0, trash: 0, rejected: 0 };
        for (const it of body.items || []) {
          const m = list && list.items.find((x) => x.id === it.message_id);
          if (it.action === 'trash') {
            plan.rejected.push({ message_id: it.message_id, action: 'trash', code: 'capability_unavailable', message: 'Corbeille indisponible : outil absent' });
            sum.rejected++; continue;
          }
          const fid = it.action === 'archive' ? (folders.find((f) => f.well_known === 'archive') || {}).id : it.folder_id;
          const folder = folders.find((f) => f.id === fid);
          if (!folder || !folder.allowed_target) {
            plan.rejected.push({ message_id: it.message_id, action: it.action, code: 'policy_denied', message: 'Dossier cible non autorisé' });
            sum.rejected++; continue;
          }
          plan.items.push({ message_id: it.message_id, subject: m ? m.subject : it.message_id, from: m ? m.from.name : '',
            received: m ? m.received : null, action: it.action, source_folder_id: 'AQMkFAKEINBOX', folder_id: folder.id, folder_path: folder.path });
          sum[it.action] = (sum[it.action] || 0) + 1;
        }
        plan.summary = sum;
        this.plans.set(plan.plan_id, { plan, consumed: null });
        return { status: res.status, data: plan };
      }
      case '/api/mail/triage/execute': {
        const entry = this.plans.get(body.plan_id);
        if (entry && entry.consumed) {
          const err = clone(this.files.get('error-plan-consumed.json').body);
          err.error.details = { plan_id: body.plan_id, operation_id: entry.consumed };
          throw new ApiError(409, err);
        }
        const plan = entry ? entry.plan : { items: [] };
        const list = this.doc('GET', '/api/mail');
        const items = plan.items.map((it) => ({ ref: { kind: 'mail', id: it.message_id }, status: 'succeeded', action: it.action,
          source_folder_id: it.source_folder_id, folder_id: it.folder_id, folder_path: it.folder_path,
          new_message_id: it.message_id.replace(/==$/, 'b=='), detail: 'simulé' }));
        const op = this.newOp(base, { request_id: body.request_id, status: 'succeeded', dry_run: true,
          summary: `Rangement de ${items.length} mail${items.length > 1 ? 's' : ''} : ${items.length} fait${items.length > 1 ? 's' : ''} (simulé)`,
          items, result: { plan_id: body.plan_id, succeeded: items.length, failed: 0, unknown: 0 },
          undo: { available: items.length > 0, until: null, reason: `Annuler remet les ${items.length} mails rangés dans la boîte s'ils n'ont pas été reclassés` } });
        op.steps.forEach((s) => { s.status = 'succeeded'; s.run_id = 'simulated'; });
        if (entry) entry.consumed = op.operation_id;
        const removed = [];
        if (list) {
          list.items = list.items.filter((m) => { if (items.some((i) => i.ref.id === m.id)) { removed.push(m); return false; } return true; });
        }
        this.counts({ inbox: -removed.length, triage_proposals: -removed.length });
        this.ops.set(op.operation_id, { op, final: op, done: true,
          inverse: () => { if (list) { list.items.push(...removed); list.items.sort((a, b) => b.received.localeCompare(a.received)); }
            this.counts({ inbox: removed.length, triage_proposals: removed.length }); return `${removed.length} mails remis dans la boîte`; } });
        return { status: 200, data: op };
      }
      case '/api/topics/{id}/messages': {
        const doc = this.topicDoc(p.id);
        const op = this.newOp(base, { request_id: body.request_id, topic_id: p.id, summary: `Chat : ${doc.title || p.id}` });
        if (op.steps[0]) Object.assign(op.steps[0], { model: body.model || 'sonnet', account: body.account || 'claude' });
        const at = this.now().toISOString();
        doc.messages.push({ id: `m_fx${this.seq}a`, role: 'user', at, text: body.text, model: body.model || 'sonnet',
          account: body.account || 'claude', intent: body.intent || 'chat', operation_id: op.operation_id });
        const queued = op.status === 'queued';
        const reply = { id: `m_fx${this.seq}b`, role: 'crow', at, status: queued ? 'queued' : 'running', operation_id: op.operation_id,
          run_id: null, model_effective: null, account: body.account || 'claude', continued_from: null, segments: [],
          cost_usd: null, cost_status: 'unknown' };
        doc.messages.push(reply);
        if (!queued) this.track(op);
        else this.ops.set(op.operation_id, { op, final: op, done: false });
        return { status: res.status, data: op };
      }
      case '/api/routines/{name}': {
        const routines = this.files.get('routines.json');
        const r = routines && routines.routines.find((x) => x.name === p.name);
        const op = this.newOp(base, { request_id: body.request_id, kind: `routine.${p.name}`,
          summary: `${r ? r.label : p.name} : mode essai, commande affichée sans exécution`, status: 'running' });
        if (p.name === 'maj') op.steps = [{ name: 'script', status: 'running', account: null, model: null, run_id: `scr_fx${this.seq}`,
          started_at: op.created_at, ended_at: null, error: null }];
        if (r) { r.running = true; r.operation_id = op.operation_id; }
        this.track(op, () => { if (r) { r.running = false; r.operation_id = null; r.last = { at: this.now().toISOString(), status: 'succeeded', exit_code: 0, run_id: 'simulated' }; } });
        return { status: res.status, data: op };
      }
      default:
        return { status: res.status, data: clone(base) };
    }
  },

  track(op, after) {
    const final = clone(op);
    final.status = 'succeeded';
    (final.steps || []).forEach((s) => { s.status = 'succeeded'; s.ended_at = s.ended_at || this.now().toISOString(); });
    this.ops.set(op.operation_id, { op, final, done: false, after });
  },

  finish(opId, doneData) {
    const e = this.ops.get(opId);
    if (e && !e.done) {
      e.done = true;
      if (e.after) e.after();
    }
    const segs = (doneData && doneData.final_segments) || [];
    for (const doc of this.topics.values()) {
      for (const m of doc.messages) {
        if (m.role === 'crow' && m.operation_id === opId && (m.status === 'running' || m.status === 'queued')) {
          m.status = 'succeeded'; m.segments = clone(segs); m.model_effective = 'sonnet';
        }
      }
    }
  },

  stream(url, handlers) {
    const path = url.split('?')[0];
    const doc = this.files.get('run-events.json');
    const events = (doc && doc.events) || [];
    const opId = (/^\/api\/operations\/([^/]+)\/events$/.exec(path) || [])[1];
    let i = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (i >= events.length) return;
      const ev = events[i++];
      const data = clone(ev.data);
      if (ev.event === 'step' && opId) data.operation_id = opId;
      if (ev.event === 'done' && opId) this.finish(opId, data);
      if (handlers.event) handlers.event(ev.event, data, ev.id);
      if (ev.event === 'done') { if (handlers.end) handlers.end(data); return; }
      setTimeout(tick, 400);
    };
    setTimeout(tick, 400);
    return () => { stopped = true; };
  },
};

// ---------------------------------------------------------------- public API

const backend = FIXTURES ? fake : real;
let ready = null;

export const api = {
  fixtures: FIXTURES,
  scenario: SCENARIO,
  init() {
    if (!ready) ready = FIXTURES ? fake.init() : Promise.resolve();
    return ready;
  },
  now() { return FIXTURES ? fake.now() : new Date(); },
  async get(path) {
    await this.init();
    if (!FIXTURES && path === '/api/session') return real.session();
    return (await backend.request('GET', path)).data;
  },
  async post(path, body) {
    await this.init();
    return (await backend.request('POST', path, Object.assign({ request_id: requestId() }, body || {}))).data;
  },
  async put(path, body) {
    await this.init();
    return (await backend.request('PUT', path, body || {})).data;
  },
  stream(url, handlers) { return backend.stream(url, handlers); },
};

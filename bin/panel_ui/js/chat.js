// Chat pane: one thread per topic, model selector (Sonnet by default), live answer over SSE.

import { h, clear, icon, chip, toast, segments, fmtDate, money, emptyState, loadingState } from './ui.js';

const drafts = new Map();   // topic_id -> {text, intent, model, account}
const streams = new Map();  // operation_id -> {stop, text}
let current = null;         // {pane, topic, ctx}

export function setChatDraft(topicId, text, intent) {
  const d = drafts.get(topicId) || {};
  drafts.set(topicId, Object.assign(d, { text, intent }));
}

let wantFocus = false;

// Focuses the composer now, or as soon as the thread has loaded.
export function focusComposer() {
  const ta = document.getElementById('chat-input');
  if (ta && !ta.disabled) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); wantFocus = false; } else wantFocus = true;
}

export function renderChat(pane, topic, ctx) {
  current = { pane, topic, ctx };
  if (!topic || !topic.topic_id) wantFocus = false;
  const closeBtn = h('button', { type: 'button', class: 'icon-btn chat-close', 'aria-label': 'Fermer le chat', onclick: () => document.body.classList.remove('chat-open') }, icon('close'));
  if (!topic) {
    pane.append(h('div', { class: 'chat-head' }, h('div', { class: 'chat-title', text: 'Chat' }), closeBtn),
      emptyState('Aucun élément choisi', 'Choisis une ligne, un mail, un dossier ou un run pour discuter avec crow.'));
    return;
  }
  if (!topic.topic_id) {
    pane.append(h('div', { class: 'chat-head' }, h('div', { class: 'chat-title', text: topic.title || 'Chat' }), closeBtn),
      emptyState('Pas de fil pour cet élément', 'Cet élément n\'a pas de sujet de discussion.'));
    return;
  }
  const head = h('div', { class: 'chat-head' });
  const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' }, loadingState());
  const foot = h('div', { class: 'chat-foot' });
  pane.append(head, log, foot);
  head.append(h('div', { class: 'chat-title-wrap' }, h('div', { class: 'chat-eyebrow muted', text: kindLabel(topic.kind) }),
    h('div', { class: 'chat-title', text: topic.title || topic.topic_id })), closeBtn);
  load(topic, ctx, log, foot, head);
}

function kindLabel(kind) {
  return { pending: 'Ligne en attente', mail: 'Mail', dossier: 'Dossier', run: 'Run', afk: 'Décision AFK', project: 'Projet' }[kind] || 'Sujet';
}

async function load(topic, ctx, log, foot, head) {
  let doc;
  try {
    doc = await ctx.api.get(`/api/topics/${encodeURIComponent(topic.topic_id)}/messages`);
  } catch (err) {
    clear(log).append(h('div', { class: 'state state-error' }, h('p', { text: `Fil illisible : ${err.message}` })));
    doc = { messages: [], default_model: null, default_account: null };
  }
  if (!current || current.topic !== topic) return;
  if (doc.orphan) head.querySelector('.chat-title-wrap').append(chip('ligne disparue du fichier', 'warn'));
  renderMessages(doc, log, topic, ctx);
  renderComposer(doc, foot, topic, ctx, log);
}

function renderMessages(doc, log, topic, ctx) {
  clear(log);
  if (!doc.messages.length) {
    log.append(h('div', { class: 'chat-empty muted' }, h('p', { text: 'Aucun message.' }),
      h('p', { class: 'small', text: 'Demande un résumé, une relance, un point sur le dossier. crow lit le contexte de l\'élément.' })));
  }
  for (const m of doc.messages) {
    if (m.role === 'system') { log.append(h('div', { class: 'msg msg-system', text: m.text })); continue; }
    if (m.role === 'user') {
      log.append(h('div', { class: 'msg msg-user' }, h('div', { class: 'bubble', text: m.text }),
        h('div', { class: 'msg-meta' }, m.intent === 'followup' ? chip('relance', 'accent') : null, h('span', { text: `${m.model || ''} · ${fmtDate(m.at)}` }))));
      continue;
    }
    const live = m.status === 'running' || m.status === 'queued';
    const body = h('div', { class: 'bubble' });
    if (m.segments && m.segments.length) body.append(segments(m.segments));
    else if (m.status === 'queued') body.append(h('span', { class: 'muted', text: 'En file, en attente d\'un créneau.' }));
    else if (live) body.append(h('span', { class: 'typing', 'aria-label': 'crow écrit' }, h('i'), h('i'), h('i')));
    else if (m.status === 'failed') body.append(h('span', { class: 'late', text: 'Échec du run.' }));
    const meta = h('div', { class: 'msg-meta' }, h('span', { text: [m.model_effective || m.account, fmtDate(m.at),
      m.continued_from ? 'reprise' : null, live ? null : money(m.cost_usd, m.cost_status)].filter(Boolean).join(' · ') }));
    if (m.status === 'queued' && m.operation_id) {
      meta.append(h('button', { type: 'button', class: 'link-btn small', text: 'Retirer de la file', onclick: async () => {
        try { await ctx.api.post(`/api/operations/${encodeURIComponent(m.operation_id)}/cancel`, {}); toast('Retiré de la file', { kind: 'ok' }); reload(topic, ctx); }
        catch (err) { toast(err.message, { kind: 'error' }); }
      } }));
    }
    const el = h('div', { class: ['msg', 'msg-crow', live && 'live'] }, h('div', { class: 'msg-who', text: 'crow' }), body, meta);
    log.append(el);
    if (live && m.operation_id) attachStream(m, body, topic, ctx);
  }
  log.scrollTop = log.scrollHeight;
}

function attachStream(m, body, topic, ctx) {
  let s = streams.get(m.operation_id);
  if (!s) {
    s = { text: [], stop: null, listeners: new Set() };
    streams.set(m.operation_id, s);
    s.stop = ctx.api.stream(`/api/operations/${encodeURIComponent(m.operation_id)}/events`, {
      event(type, data) {
        if (type === 'status' && data.status === 'running' && m.status === 'queued') {
          m.status = 'running';
          reload(topic, ctx);
        }
        if (type === 'text') s.text.push(data.text || '');
        if (type === 'tool') s.text.push(`· ${data.name}${data.summary ? ' : ' + data.summary : ''}`);
        s.listeners.forEach((fn) => fn());
      },
      end() { streams.delete(m.operation_id); if (current && current.topic && current.topic.topic_id === topic.topic_id) reload(topic, ctx); },
    });
  }
  const paint = () => {
    if (!body.isConnected) { s.listeners.delete(paint); return; }
    clear(body);
    if (s.text.length) body.append(h('div', { class: 'live-text' }, s.text.map((t) => h('p', { class: t.startsWith('·') ? 'muted small' : null, text: t }))));
    body.append(m.status === 'queued'
      ? h('span', { class: 'muted', text: 'En file, en attente d\'un créneau.' })
      : h('span', { class: 'typing', 'aria-label': 'crow écrit' }, h('i'), h('i'), h('i')));
    const log = body.closest('.chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  };
  s.listeners.add(paint);
  paint();
}

async function reload(topic, ctx) {
  if (!current || current.topic.topic_id !== topic.topic_id) return;
  const log = current.pane.querySelector('.chat-log');
  try {
    const doc = await ctx.api.get(`/api/topics/${encodeURIComponent(topic.topic_id)}/messages`);
    if (log && current.topic.topic_id === topic.topic_id) renderMessages(doc, log, topic, ctx);
  } catch (err) { toast(`Fil : ${err.message}`, { kind: 'error' }); }
}

function renderComposer(doc, foot, topic, ctx, log) {
  clear(foot);
  const cfg = ctx.config || {};
  const chatCfg = cfg.chat || {};
  const models = chatCfg.models || ['haiku', 'sonnet', 'opus'];
  const accounts = (chatCfg.accounts || [{ name: 'claude', kinds: ['chat'] }]).filter((a) => (a.kinds || []).includes('chat'));
  const d = drafts.get(topic.topic_id) || {};
  drafts.set(topic.topic_id, d);
  const requestedModel = d.model || doc.default_model || chatCfg.default_model || 'sonnet';
  let account = d.account || doc.default_account || chatCfg.default_account || 'claude';
  if (topic.mailOnly) account = 'claude';

  const modelsFor = (name) => {
    const a = accounts.find(x => x.name === name) || {};
    return a.models || (a.provider === 'codex' ? [a.model || 'gpt-5'] : models);
  };
  const initialModels = modelsFor(account);
  const model = initialModels.includes(requestedModel) ? requestedModel
    : initialModels.includes(chatCfg.default_model) ? chatCfg.default_model : initialModels[0];

  const modelSel = h('select', { class: 'select select-small', 'aria-label': 'Modèle', title: 'Modèle de ce message',
    onchange: () => { d.model = modelSel.value; updateDefaultBtn(); } },
  initialModels.map((m) => { const o = h('option', { value: m, text: m }); if (m === model) o.selected = true; return o; }));
  const accSel = h('select', { class: 'select select-small', 'aria-label': 'Compte', title: topic.mailOnly ? 'Sujet mail : compte claude seulement' : 'Compte',
    onchange: () => {
      d.account = accSel.value;
      const allowed = modelsFor(d.account);
      const chosen = allowed.includes(modelSel.value) ? modelSel.value
        : allowed.includes(chatCfg.default_model) ? chatCfg.default_model : allowed[0];
      clear(modelSel).append(...allowed.map(m => h('option', { value: m, text: m })));
      modelSel.value = chosen; d.model = chosen;
      updateDefaultBtn();
    } },
  accounts.map((a) => {
    const o = h('option', { value: a.name, text: a.name });
    if (topic.mailOnly && a.name !== 'claude') { o.disabled = true; o.textContent = `${a.name} (pas de mail)`; }
    if (a.name === account) o.selected = true;
    return o;
  }));
  if (topic.mailOnly) accSel.title = 'Sujet mail : compte claude seulement';

  const defBtn = h('button', { type: 'button', class: 'link-btn small', text: 'Par défaut ici', title: 'Garder ce modèle et ce compte pour ce sujet',
    onclick: async () => {
      try {
        await ctx.api.put(`/api/topics/${encodeURIComponent(topic.topic_id)}`, { default_model: modelSel.value, default_account: accSel.value });
        doc.default_model = modelSel.value; doc.default_account = accSel.value;
        toast(`Défaut du sujet : ${modelSel.value} · ${accSel.value}`, { kind: 'ok' });
        updateDefaultBtn();
      } catch (err) { toast(err.message, { kind: 'error' }); }
    } });
  function updateDefaultBtn() { defBtn.hidden = modelSel.value === (doc.default_model || 'sonnet') && accSel.value === (doc.default_account || 'claude'); }
  updateDefaultBtn();

  const ta = h('textarea', { class: 'textarea chat-input', id: 'chat-input', rows: '3', placeholder: 'Écrire à crow…  (Entrée pour envoyer, Maj+Entrée pour une ligne)',
    'aria-label': 'Message', oninput: () => { d.text = ta.value; } });
  ta.value = d.text || '';
  const intentChip = h('div', { class: 'intent' });
  const paintIntent = () => {
    clear(intentChip);
    if (d.intent === 'followup') {
      intentChip.append(chip('relance', 'accent'), h('span', { class: 'muted small', text: 'crow retrouve le fil et propose le texte, rien n\'est créé sans ton « go ».' }),
        h('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Retirer le mode relance', onclick: () => { d.intent = 'chat'; paintIntent(); } }, icon('close')));
    }
  };
  paintIntent();
  const send = h('button', { type: 'button', class: 'btn btn-primary btn-icon', 'aria-label': 'Envoyer', title: 'Envoyer (Entrée)' }, icon('send'));
  const doSend = async () => {
    const text = ta.value.trim();
    if (!text) return;
    send.disabled = true;
    try {
      const body = { text, model: modelSel.value, account: accSel.value, intent: d.intent === 'followup' ? 'followup' : 'chat' };
      const op = await ctx.api.post(`/api/topics/${encodeURIComponent(topic.topic_id)}/messages`, body);
      d.text = ''; d.intent = 'chat'; ta.value = ''; paintIntent();
      if (op.status === 'queued') toast(op.summary || 'Message en file', { kind: 'info', detail: op.result && op.result.queue_position ? `position ${op.result.queue_position}` : null });
      await reload(topic, ctx);
    } catch (err) {
      const line = h('div', { class: 'msg msg-system msg-error', text: `${err.message}${err.code ? ` (${err.code})` : ''}` });
      log.append(line);
      log.scrollTop = log.scrollHeight;
    } finally { send.disabled = false; }
  };
  send.addEventListener('click', doSend);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); }
  });
  foot.append(intentChip, h('div', { class: 'composer' }, ta, send),
    h('div', { class: 'composer-opts' }, h('label', { class: 'inline-label' }, h('span', { class: 'muted small', text: 'Modèle' }), modelSel),
      h('label', { class: 'inline-label' }, h('span', { class: 'muted small', text: 'Compte' }), accSel), defBtn));
  if (wantFocus) focusComposer();
}

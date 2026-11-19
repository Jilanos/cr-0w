// The upstream crow-screen API and Nest's ANSI/key helpers keep this view small.
import { h, btn, clear, toast, toastError, openDialog, closeDialog, segments } from './ui.js';
import { runsOf, keyOf, merge } from './terminal-ansi.js';

export function terminalView(api) {
  let root, box, target, screen, busy = false, atBottom = true, resized = '', sending = Promise.resolve();
  const error = h('p', { class: 'late', role: 'alert' });
  const picker = h('select', { class: 'select', 'aria-label': 'Session hub', onchange: () => { target = JSON.parse(picker.value); resized = ''; screen = null; tick(); } });
  const attach = h('code');
  const heading = h('div', { class: 'actions' }, picker, attach);
  const empty = h('div', { class: 'stack' }, h('p', { text: 'Aucune session hub en tmux.' }), btn('Démarrer le hub', { primary: true, onclick: async (e) => {
    const button = e.currentTarget; button.disabled = true;
    try { await api.post('/api/terminal/start', {}); await tick(); }
    catch (err) { error.textContent = err.message; }
    finally { button.disabled = false; }
  } }));
  function send(keys) {
    const destination = target;
    sending = sending.then(() => api.post('/api/terminal/keys', { ...destination, keys: merge(keys) }))
      .then(() => { atBottom = true; return tick(); }).catch(err => { error.textContent = err.message; });
  }
  async function tick() {
    if (!root?.isConnected || document.hidden || busy) return;
    busy = true;
    try {
      const state = await api.get('/api/terminal');
      const old = target;
      target = state.sessions.find(s => s.session === old?.session && s.pid === old?.pid) || state.sessions[0];
      if (JSON.stringify(state.sessions) !== picker.dataset.sessions) {
        picker.dataset.sessions = JSON.stringify(state.sessions);
        clear(picker).append(...state.sessions.map(s => h('option', { value: JSON.stringify(s), text: s.session })));
      }
      if (target) picker.value = JSON.stringify(target);
      heading.hidden = !target; box.hidden = !target; empty.hidden = !!target;
      if (!target) { screen = null; error.textContent = ''; return; }
      attach.textContent = target.attach;
      const next = await api.get('/api/terminal/screen?session=' + encodeURIComponent(target.session) + '&pid=' + target.pid);
      if (JSON.stringify(next) !== JSON.stringify(screen)) {
        screen = next;
        let carry = {};
        clear(box);
        for (const line of screen.lines) {
          const parsed = runsOf(line, carry); carry = parsed.end;
          box.append(h('div', { class: 'terminal-line' }, parsed.runs.length ? parsed.runs.map(r => {
            const span = h('span', { text: r.text }), s = r.style;
            span.style.color = s.reverse ? s.bg || 'var(--bg)' : s.fg || '';
            span.style.backgroundColor = s.reverse ? s.fg || 'var(--fg)' : s.bg || '';
            if (s.bold) span.style.fontWeight = '700';
            if (s.dim) span.style.opacity = '.6';
            if (s.italic) span.style.fontStyle = 'italic';
            if (s.underline) span.style.textDecoration = 'underline';
            return span;
          }) : ' '));
        }
        if (atBottom) box.scrollTop = box.scrollHeight;
      }
      const cs = getComputedStyle(box);
      const probe = h('span', { text: 'MMMMMMMMMM', class: 'terminal-probe' }); box.append(probe);
      const cell = probe.getBoundingClientRect().width / 10; probe.remove();
      const cols = Math.max(20, Math.min(400, Math.floor((box.clientWidth - 24) / (cell || 8))));
      const rows = Math.max(5, Math.min(200, Math.floor((box.clientHeight - 24) / parseFloat(cs.lineHeight))));
      const size = `${target.pid}:${cols}x${rows}`;
      if (size !== resized) { await api.post('/api/terminal/resize', { ...target, cols, rows }); resized = size; }
      error.textContent = '';
    } catch (err) { error.textContent = err.message; }
    finally { busy = false; }
  }
  const timer = setInterval(tick, 1000);
  // The single view instance owns the poller; hidden/disconnected views never fetch.
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  return { title: 'Terminal', icon: 'jobs', wide: true, dashboard() {
    if (!root) {
      box = h('div', { class: 'terminal-screen', tabindex: '0', role: 'textbox', 'aria-label': 'Terminal du hub', 'aria-multiline': 'true',
        onclick: () => box.focus(),
        onkeydown: e => { const k = keyOf(e); if (k && target) { e.preventDefault(); e.stopPropagation(); send([k]); } },
        onpaste: e => { e.preventDefault(); if (target) { const text = e.clipboardData.getData('text').slice(0,4000); if (text) send([{ text }]); } },
        onscroll: () => { atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 5; },
        onwheel: e => { if (target && screen && !screen.history) { e.preventDefault(); send([{ key: e.deltaY < 0 ? 'PPage' : 'NPage' }]); } },
      });
      root = h('article', { class: 'terminal-view' }, heading, h('p', { class: 'muted small', text: 'Clique dans le terminal pour saisir. Entrée soumet la demande au hub. Même session dans Windows Terminal : wsl, puis la commande tmux affichée.' }), empty, box, error);
    }
    setTimeout(tick, 0);
    return root;
  } };
}

export async function sendToHub(ctx, topic = null, prefill = '') {
  topic ||= ctx.selectedTopic();
  if (!topic?.topic_id) return;
  const note = h('textarea', { class: 'input', rows: 3, maxlength: 1500, 'aria-label': 'Note pour le hub' });
  note.value = prefill;
  const error = h('p', { class: 'late', role: 'alert' });
  const send = btn('Insérer dans le terminal', { primary: true, onclick: async () => {
    send.disabled = true;
    try {
      const state = await ctx.api.get('/api/terminal');
      if (!state.sessions.length) { closeDialog(); await ctx.go('terminal'); toast('Démarre le hub puis reviens au sujet.', { kind: 'info' }); return; }
      if (state.sessions.length > 1) throw new Error('Plusieurs hubs ouverts : conserve une seule session avant l’insertion.');
      await ctx.api.post('/api/terminal/handoff', { ...state.sessions[0], topic_id: topic.topic_id, message_id: topic.message_id, note: note.value });
      closeDialog(); await ctx.go('terminal');
      toast('Contexte inséré. Relis puis appuie sur Entrée dans le terminal pour confirmer.', { kind: 'info' });
    } catch (err) { error.textContent = err.message; }
    finally { send.disabled = false; }
  } });
  openDialog('Envoyer au hub', h('div', { class: 'stack' }, h('p', { text: topic.title }), note,
    h('p', { class: 'muted', text: 'Le titre, la source et ta note seront insérés sans appuyer sur Entrée.' }), error, send));
  note.focus();
}

export async function openHistory(api, id) {
  try {
    const thread = await api.get('/api/topics/' + encodeURIComponent(id) + '/messages');
    openDialog(thread.title + ' · historique en lecture seule', h('div', { class: 'stack history' },
      thread.messages.length ? thread.messages.map(m => h('article', null, h('strong', { text: m.role }),
        h('p', null, m.text ? m.text : segments(m.segments || [])))) : h('p', { text: 'Aucun message enregistré.' })));
  } catch (err) { toastError(err, 'Historique'); }
}

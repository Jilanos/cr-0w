// Views: each one gives the rail entry, its list entries and the detail of the selected entry.
// Entry shape: {key, text, row(), detail(), topic?, pending?, dim?} or {header: Node}.

import {
  h, icon, btn, disable, chip, toast, toastError, emptyState, loadingState, errorState, segments, segText,
  fmtDate, fmtDay, ago, until, duration, money, bytes, plural, daysFromNow, isoDay, gauge, popMenu, closeMenus,
  followLog, safeHref, parseDate,
} from './ui.js';

const PRIO = { red: 'Urgent', yellow: 'Normal', green: 'Bas', blue: 'Info' };
const ACTION_LABEL = { reply: 'Répondre', keep: 'Garder', move: 'Ranger', archive: 'Archiver', trash: 'Corbeille' };
const RUN_STATE = { running: 'en cours', succeeded: 'terminé', failed: 'échec', queued: 'en file', partial: 'partiel',
  unknown: 'inconnu', cancelled: 'retiré', cancel_requested: 'retrait demandé' };
const CAP_STATE = { available: 'disponible', limited: 'limité', unavailable: 'indisponible' };
const DRAFT_STATE = { draft: 'À relire', sent: 'Envoyé (prouvé)', missing: 'Incertain' };

export function makeViews(ctx) {
  const { store, cached, cacheErr, load } = ctx;

  // ------------------------------------------------------------ shared helpers

  function status(keys) {
    for (const k of keys) {
      if (cached(k) === undefined && !cacheErr(k)) return 'loading';
    }
    const err = cacheErr(keys[0]);
    return err ? { error: err } : null;
  }

  const allPending = () => {
    const doc = cached('pending');
    if (!doc) return [];
    const out = [];
    for (const s of doc.sections || []) for (const it of s.items || []) if (!store.hidden.has(it.id)) out.push(Object.assign({ _section: s }, it));
    return out;
  };
  const findPending = (id) => allPending().find((x) => x.id === id) || null;

  const mailPolicyKinds = new Set(['drafts', 'followups']);
  const pendingTopic = (it) => it.topic_id ? { topic_id: it.topic_id, title: it.title, kind: 'pending',
    mailOnly: mailPolicyKinds.has(it.section), context: segText(it.cells.Attendu || it.cells.text) } : { topic_id: null, title: it.title };

  function prioDot(prio) {
    return h('span', { class: ['prio', prio ? 'prio-' + prio : 'prio-none'], title: prio ? PRIO[prio] : null, 'aria-label': prio ? PRIO[prio] : null });
  }

  function dueChip(it) {
    if (it.overdue_workdays > 0) { const c = chip(`+${it.overdue_workdays} j ouvrés`, 'late'); c.title = `Échéance ${fmtDate(it.due, false)} dépassée`; return c; }
    if (!it.due) return null;
    const d = daysFromNow(it.due);
    if (d === 0) return chip("aujourd'hui", 'soon');
    if (d != null && d > 0 && d <= 7) return chip(`${fmtDay(it.due)}`, 'soon');
    return chip(fmtDate(it.due, false), null);
  }

  function pendingRow(it, opts = {}) {
    const w = ctx.writable();
    const canDone = (it.actions || []).includes('done');
    const sub = it.kind === 'table_row' ? segText(it.cells.Attendu || it.cells[(it.columns || [])[1]]) : segText(it.cells.text);
    const quick = canDone ? h('button', {
      type: 'button', class: 'row-quick', title: w.ok ? 'Réglé (e)' : w.reason, 'aria-label': `Réglé : ${it.title}`,
      onclick: (e) => { e.stopPropagation(); ctx.pendingDone(it); },
    }, icon('check')) : null;
    if (quick && !w.ok) disable(quick, w.reason);
    return h('div', { class: 'row-body' },
      h('div', { class: 'row-line' }, prioDot(it.prio), h('span', { class: 'row-title', text: it.title }),
        opts.sectionChip ? chip(opts.sectionChip, 'quiet') : null, dueChip(it)),
      sub && sub !== it.title ? h('div', { class: 'row-sub', text: sub }) : null,
      quick);
  }

  function pendingEntry(it, opts = {}) {
    return {
      key: it.id, pending: (it.actions || []).includes('done') ? it : null,
      text: `${it.title} ${segText(it.cells.Attendu || it.cells.text)} ${it.due_raw || ''}`,
      dim: it.section === 'done', cls: (it.actions || []).includes('done') ? 'has-quick' : null, topic: pendingTopic(it),
      row: () => pendingRow(it, opts), detail: () => pendingDetail(it),
    };
  }

  function snoozeMenu(anchor, it) {
    const input = h('input', { type: 'date', class: 'input', min: isoDay(ctx.api.now()), 'aria-label': 'Nouvelle échéance' });
    const custom = h('form', { class: 'menu-form', onsubmit: (e) => { e.preventDefault(); if (input.value) { closeMenus(); ctx.pendingSnooze(it, { due: input.value }); } } },
      input, h('button', { type: 'submit', class: 'btn btn-small btn-primary', text: 'OK' }));
    const box = h('div', null,
      h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => { closeMenus(); ctx.pendingSnooze(it, { workdays: 2 }); } },
        h('span', { text: '+2 jours ouvrés' })),
      h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => { closeMenus(); ctx.pendingSnooze(it, { workdays: 5 }); } },
        h('span', { text: '+1 semaine' })),
      h('div', { class: 'menu-sep' }), h('div', { class: 'menu-label', text: 'Choisir une date' }), custom);
    popMenu(anchor, box);
  }

  function followupText(it) {
    const qui = segText(it.cells.Qui) || it.title;
    const attendu = segText(it.cells.Attendu).replace(/\s+/g, ' ').trim().replace(/\.$/, '');
    return `Prépare la relance de ${qui} sur ${attendu || it.title}.`;
  }

  function pendingDetail(it) {
    const w = ctx.writable();
    const acts = it.actions || [];
    const bar = h('div', { class: 'actions' });
    if (acts.includes('done')) {
      bar.append(btn('Réglé', { icon: 'check', primary: true, key: 'e', disabled: w.ok ? null : w.reason, onclick: () => ctx.pendingDone(it) }));
    }
    if (acts.includes('snooze')) {
      const b = btn('Reporter', { icon: 'clock', disabled: w.ok ? null : w.reason });
      b.addEventListener('click', () => snoozeMenu(b, it));
      bar.append(b);
    }
    if (acts.includes('followup')) {
      bar.append(btn('Relancer', { icon: 'reply', title: 'Ouvre le chat avec une consigne de relance modifiable',
        onclick: () => ctx.openChat({ prefill: followupText(it), intent: 'followup' }) }));
    }
    if (it.topic_id) bar.append(btn('Chat', { icon: 'chat', ghost: true, key: 'c', onclick: () => ctx.openChat() }));
    if (!w.ok) bar.append(h('span', { class: 'muted small', text: w.reason }));

    const fields = h('dl', { class: 'fields' });
    if (it.kind === 'table_row') {
      for (const col of it.columns || Object.keys(it.cells)) {
        if (col === 'Prio') continue;
        fields.append(h('dt', { text: col }), h('dd', null, segments(it.cells[col])));
      }
    } else fields.append(h('dt', { text: 'Texte' }), h('dd', null, segments(it.cells.text)));

    let dueLine = null;
    if (it.overdue_workdays > 0) dueLine = h('p', { class: 'due-line late' }, icon('alert'), h('span', { text: `Échéance ${fmtDay(it.due)} : dépassée de ${it.overdue_workdays} jours ouvrés` }));
    else if (it.due) {
      const d = daysFromNow(it.due);
      dueLine = h('p', { class: 'due-line' }, icon('clock'), h('span', { text: `Échéance ${fmtDay(it.due)}${d != null && d >= 0 ? ` (dans ${d} j)` : ''}` }));
    }
    const section = it._section || (cached('pending') || { sections: [] }).sections.find((s) => s.key === it.section);
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' },
        h('div', { class: 'eyebrow' }, prioDot(it.prio), h('span', { text: section ? section.title : it.section }),
          it.prio ? h('span', { class: 'muted', text: '· ' + PRIO[it.prio] }) : null),
        h('h2', { text: it.title }), dueLine),
      bar, fields,
      h('p', { class: 'meta', text: `${(cached('pending') || {}).file_label || 'En attente'} · ligne ${it.source_line ?? '?'}` }));
  }

  function freeBlockEntry(b) {
    return {
      key: b.id, text: `${b.title} ${segText(b.segments)}`, topic: b.topic_id ? { topic_id: b.topic_id, title: b.title, kind: 'pending' } : { topic_id: null, title: b.title },
      row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, h('span', { class: 'prio prio-none' }),
        h('span', { class: 'row-title', text: b.title }), chip('note', 'quiet')), h('div', { class: 'row-sub', text: segText(b.segments) })),
      detail: () => h('article', { class: 'detail' }, h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow', text: 'Note libre (lecture seule)' }),
        h('h2', { text: b.title })), h('p', { class: 'prose' }, segments(b.segments)),
      h('div', { class: 'actions' }, b.topic_id ? btn('Chat', { icon: 'chat', ghost: true, key: 'c', onclick: () => ctx.openChat() }) : null),
      h('p', { class: 'muted small', text: 'Paragraphe libre : pas de Réglé, discussion possible dans le chat.' })),
    };
  }

  function groupHeader(title, n, extra) {
    return { header: h('div', { class: 'group-head' }, h('span', { text: title }), n != null ? h('span', { class: 'group-count', text: String(n) }) : null, extra || null) };
  }

  function segmented(options, current, onPick) {
    return h('div', { class: 'segmented', role: 'tablist' }, options.map((o) => h('button', {
      type: 'button', role: 'tab', class: ['seg', current === o.value && 'active'], 'aria-selected': String(current === o.value),
      onclick: () => onPick(o.value),
    }, h('span', { text: o.label }), o.count != null ? h('span', { class: 'seg-count', text: String(o.count) }) : null)));
  }

  function opSteps(op) {
    const ul = h('ol', { class: 'steps' });
    const names = { skeleton: 'Squelette du brouillon', style: 'Mise en forme', verify: 'Vérification', execute: 'Exécution', collect: 'Collecte',
      run: 'Run', wait_runs: 'Attente des runs', script: 'Script' };
    for (const s of op.steps || []) {
      const out = s.output || {};
      const extra = [];
      if (out.simulated) extra.push('simulé');
      if (out.to) extra.push(`à : ${out.to.join(', ')}`);
      if (out.cc && out.cc.length) extra.push(`cc : ${out.cc.join(', ')}`);
      if (out.sent_check) extra.push(out.sent_check);
      ul.append(h('li', { class: ['step', 'step-' + s.status] },
        h('span', { class: 'step-dot' }),
        h('div', null, h('div', { class: 'step-name' }, h('strong', { text: names[s.name] || s.name }),
          h('span', { class: 'muted', text: ` · ${RUN_STATE[s.status] || s.status}` })),
        h('div', { class: 'muted small', text: [s.account, s.model, s.run_id === 'simulated' ? 'simulé' : null,
          s.started_at ? fmtDate(s.started_at) : null].filter(Boolean).join(' · ') }),
        extra.length ? h('div', { class: 'small', text: extra.join(' · ') }) : null,
        s.error ? h('div', { class: 'small late', text: s.error.message || s.error.code }) : null)));
    }
    return ul;
  }

  function capability(name) {
    const caps = cached('caps');
    return caps && caps.capabilities ? caps.capabilities.find((c) => c.name === name) : null;
  }

  // ------------------------------------------------------------ Aujourd'hui

  const today = {
    title: "Aujourd'hui", icon: 'today', wide: true,
    count: () => null,
    load: () => Promise.all(['state', 'pending', 'dues', 'drafts', 'mail', 'runs', 'accounts', 'afk'].map((k) => load(k, null, { quiet: true }))),
    dashboard() {
      const st = cached('state');
      if (!st && !cacheErr('state')) return loadingState();
      const c = (st && st.counts) || {};
      const now = ctx.api.now();
      const wrap = h('div', { class: 'dashboard' });
      const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      const mailInfo = st && st.mail;
      wrap.append(h('header', { class: 'dash-head' },
        h('div', null, h('h2', { class: 'dash-date', text: dateStr.charAt(0).toUpperCase() + dateStr.slice(1) }),
          mailInfo ? h('p', { class: ['muted', mailInfo.stale && 'warn-text'], text: `Boîte synchronisée ${ago(mailInfo.synced_at)} · couverture ${mailInfo.coverage === 'complete' ? 'complète' : mailInfo.coverage === 'partial' ? 'partielle' : 'aucune'}${mailInfo.stale ? ' · instantané ancien' : ''}` }) : null)));

      const alerts = (st && st.alerts) || [];
      if (alerts.length) {
        wrap.append(h('ul', { class: 'alerts' }, alerts.map((a) => h('li', null, h('button', {
          type: 'button', class: ['alert', 'alert-' + a.level], onclick: () => openRef(a.ref),
        }, icon(a.level === 'error' ? 'alert' : a.level === 'warn' ? 'alert' : 'info'), h('span', { text: a.text }))))));
      }

      const kpi = (label, n, view, opts = {}) => h('button', { type: 'button', class: ['kpi', opts.alert && n > 0 && 'kpi-alert'], onclick: opts.onclick || (() => ctx.go(view)) },
        h('span', { class: 'kpi-n', text: n == null ? '–' : String(n) }), h('span', { class: 'kpi-label', text: label }),
        opts.sub ? h('span', { class: 'kpi-sub muted', text: opts.sub }) : null);
      wrap.append(h('div', { class: 'kpis' },
        kpi('En retard', c.overdue, 'pending', { alert: true }),
        kpi('Cette semaine', c.due_week, 'pending', { onclick: () => { store.pendingTab = 'dues'; ctx.go('pending'); } }),
        kpi('Brouillons à envoyer', c.drafts, 'drafts'),
        kpi('Propositions de tri', c.triage_proposals, 'mail', { onclick: () => { store.mailMode = 'triage'; ctx.go('mail'); } }),
        kpi('Mails', c.inbox, 'mail', { sub: c.inbox_unread ? `${c.inbox_unread} non lus` : null, onclick: () => { store.mailMode = 'inbox'; ctx.go('mail'); } }),
        kpi('Runs actifs', c.runs_active, 'jobs', { sub: c.runs_queued ? `${c.runs_queued} en file` : null }),
        kpi('Décisions', (c.decisions || 0) + (c.afk_decisions || 0), 'decisions', { sub: c.afk_decisions ? `dont ${c.afk_decisions} AFK` : null })));

      const grid = h('div', { class: 'cards' });
      wrap.append(grid);
      const card = (title, action, body, cls) => h('section', { class: ['card', cls] },
        h('header', { class: 'card-head' }, h('h3', { text: title }), action || null), body);
      const linkBtn = (label, fn) => h('button', { type: 'button', class: 'link-btn', onclick: fn, text: label });
      const cardList = (rows, empty) => rows.length ? h('ul', { class: 'card-list' }, rows) : h('p', { class: 'muted card-empty', text: empty });
      const cardRow = (onclick, ...kids) => h('li', null, h('button', { type: 'button', class: 'card-row', onclick }, ...kids));

      const visit = store.sinceVisit === undefined ? st?.since_last_visit : store.sinceVisit;
      if (visit) grid.append(card('Depuis ta dernière visite', h('span', { class: 'muted', text: ago(visit.visited_at) }),
        cardList(visit.items.map((it) => cardRow(() => openRef(it.ref),
          chip({ added: 'Nouveau', changed: 'Modifié', removed: 'Retiré' }[it.change] || it.change),
          h('span', { class: 'grow', text: it.text }))), 'Aucun changement depuis ta dernière visite.')));

      // En retard
      const overdue = allPending().filter((it) => it.overdue_workdays > 0).sort((a, b) => b.overdue_workdays - a.overdue_workdays);
      grid.append(card('En retard', linkBtn('Tout voir', () => ctx.go('pending')),
        cacheErr('pending') ? errorState(cacheErr('pending')) : cardList(overdue.map((it) => cardRow(() => ctx.go('pending', it.id),
          prioDot(it.prio), h('span', { class: 'grow', text: it.title }), chip(`${it.overdue_workdays} j ouvrés`, 'late'))), 'Rien en retard.'), 'card-late'));

      // Échéances 7 jours
      const dues = ((cached('dues') || {}).items || []).filter((d) => !d.overdue && daysFromNow(d.date) != null && daysFromNow(d.date) <= 7);
      grid.append(card('Échéances 7 jours', linkBtn('Toutes', () => { store.pendingTab = 'dues'; ctx.go('pending'); }),
        cardList(dues.map((d) => cardRow(() => openRef(d.ref), h('span', { class: 'date-col', text: fmtDay(d.date) }),
          h('span', { class: 'grow', text: d.text }), chip(d.kind === 'reset' ? 'reset' : 'relance', 'quiet'))), 'Aucune échéance cette semaine.')));

      // Brouillons
      const drafts = ((cached('drafts') || {}).items || []).filter((d) => d.state !== 'sent');
      grid.append(card('Brouillons à envoyer', linkBtn('Ouvrir', () => ctx.go('drafts')),
        cardList(drafts.map((d) => cardRow(() => ctx.go('drafts', d.id), h('span', { class: 'grow', text: d.subject }),
          d.state === 'missing' ? chip('incertain', 'warn') : null,
          d.signature_ok === false ? chip('signature', 'warn') : null,
          d.attachments_missing && d.attachments_missing.length ? chip('PJ manquante', 'warn') : null)), 'Aucun brouillon en attente.')));

      // Propositions de tri
      const mail = cached('mail');
      const props = ((mail && mail.items) || []).filter((m) => m.proposal && ['move', 'archive', 'trash'].includes(m.proposal.action));
      grid.append(card('Propositions de tri', linkBtn('Trier', () => { store.mailMode = 'triage'; ctx.go('mail'); }),
        cardList(props.slice(0, 5).map((m) => cardRow(() => { store.mailMode = 'triage'; ctx.go('mail', m.id); },
          h('span', { class: 'grow' }, h('span', { class: 'strong', text: m.from.name }), h('span', { class: 'muted', text: ' · ' + m.subject })),
          proposalChip(m.proposal))), 'Aucune proposition.')));

      // Runs
      const runs = cached('runs');
      const runRows = [];
      if (runs && runs.runs) {
        for (const r of runs.runs) runRows.push(cardRow(() => ctx.go('jobs', 'run:' + r.run_id), runDot(r.status),
          h('span', { class: 'grow', text: r.label }), h('span', { class: 'muted small', text: `${r.account} · ${RUN_STATE[r.status] || r.status}` })));
        for (const q of runs.queue || []) runRows.push(cardRow(() => ctx.go('jobs', 'queue:' + q.operation_id), runDot('queued'),
          h('span', { class: 'grow', text: q.label }), h('span', { class: 'muted small', text: `en file · position ${q.position}` })));
      }
      grid.append(card('Runs', linkBtn('Jobs', () => ctx.go('jobs')),
        cacheErr('runs') ? h('p', { class: 'late small', text: cacheErr('runs').message }) : cardList(runRows, 'Aucun run sur 24 h.')));

      // Comptes
      const acc = cached('accounts');
      grid.append(card('Comptes', linkBtn('Détail', () => ctx.go('accounts')),
        acc ? h('div', { class: 'card-gauges' }, (acc.accounts || []).map((a) => h('button', { type: 'button', class: 'gauge-btn', onclick: () => ctx.go('accounts', 'acc:' + a.name) },
          gauge(`${a.name} · 5 h`, a.remaining_5h_pct, a.floor_5h_pct, a.quota_status === 'unknown' ? (a.error || 'quota inconnu') : `reset ${a.reset_5h_at ? 'dans ' + until(a.reset_5h_at) : 'inconnu'} · semaine ${a.remaining_week_pct ?? '?'} %`))))
          : cacheErr('accounts') ? errorState(cacheErr('accounts')) : loadingState()));

      // Décisions AFK
      const afk = cached('afk');
      const decs = (afk && afk.decisions) || [];
      grid.append(card('Décisions AFK', linkBtn('Décisions', () => ctx.go('decisions')),
        cardList(decs.map((d) => cardRow(() => ctx.go('decisions', 'afk:' + d.n), h('span', { class: 'grow', text: d.question }),
          chip(d.answered ? 'répondu' : d.job, d.answered ? 'ok' : 'quiet'))), 'Aucune décision en attente.')));
      return wrap;
    },
  };

  function openRef(ref) {
    if (!ref) return;
    switch (ref.kind) {
      case 'pending': {
        const it = findPending(ref.id);
        if (it && it.section === 'decisions') ctx.go('decisions', ref.id);
        else { store.pendingTab = 'list'; ctx.go('pending', ref.id); }
        break;
      }
      case 'account': ctx.go('accounts', 'acc:' + ref.id); break;
      case 'run': ctx.go('jobs', 'run:' + ref.id); break;
      case 'mail': store.mailMode = 'inbox'; ctx.go('mail', ref.id); break;
      case 'view': ctx.go(ref.id === 'settings' ? 'accounts' : ref.id); break;
      default: break;
    }
  }

  function runDot(s) { return h('span', { class: ['run-dot', 'run-' + s], title: RUN_STATE[s] || s }); }

  // ------------------------------------------------------------ Relances & échéances

  store.pendingTab = store.pendingTab || 'list';
  const ORDERED = ['followups', 'drafts', 'decisions', 'dossiers', 'filing', 'inbox_note', 'other'];

  const pending = {
    title: 'Relances & échéances', icon: 'pending', allowDoneKey: true,
    count: (c) => (c.overdue ? { alert: c.overdue, alertTitle: `${c.overdue} en retard sur ${c.pending ?? '?'} lignes` } : { n: c.pending ?? null }),
    load: () => Promise.all([load('pending'), load('dues', null, { quiet: true })]),
    reload: () => ctx.refresh(['pending', 'dues']).then(ctx.render),
    status: () => status(store.pendingTab === 'dues' ? ['dues'] : ['pending']),
    listHead() {
      const doc = cached('pending');
      const dues = cached('dues');
      return h('div', { class: 'list-head' },
        segmented([{ label: 'Liste', value: 'list', count: doc ? allPending().filter((x) => x.section !== 'done').length : null },
          { label: 'Échéances 14 j', value: 'dues', count: dues ? dues.items.length : null }], store.pendingTab, (v) => { store.pendingTab = v; ctx.render(); }),
        doc && doc.updated_note ? h('p', { class: 'muted small list-note', text: `${doc.file_label || 'En attente'} · mis à jour ${doc.updated_note}` }) : null);
    },
    items() {
      if (store.pendingTab === 'dues') return dueEntries();
      const doc = cached('pending');
      if (!doc) return [];
      const out = [];
      const sections = [...doc.sections].sort((a, b) => rank(a.kind) - rank(b.kind));
      for (const s of sections) {
        const items = s.items.filter((it) => !store.hidden.has(it.id));
        if (s.kind === 'done') continue;
        if (!items.length) continue;
        out.push(groupHeader(s.title, items.length));
        if (s.blocks && s.blocks.length) {
          for (const b of s.blocks) {
            const bi = items.filter((it) => it.block === b.key);
            if (!bi.length) continue;
            out.push({ header: h('div', { class: 'group-sub' }, h('span', { text: b.title }),
              b.folder_file_id ? h('button', { type: 'button', class: 'link-btn small', text: 'Ouvrir le dossier', onclick: () => ctx.openFile(b.folder_file_id, b.title) }) : null) });
            bi.forEach((it) => out.push(pendingEntry(Object.assign({ _section: s }, it))));
          }
          items.filter((it) => !s.blocks.some((b) => b.key === it.block)).forEach((it) => out.push(pendingEntry(Object.assign({ _section: s }, it))));
        } else items.forEach((it) => out.push(pendingEntry(Object.assign({ _section: s }, it))));
      }
      if (doc.free_blocks && doc.free_blocks.length) {
        out.push(groupHeader('Notes', doc.free_blocks.length));
        doc.free_blocks.forEach((b) => out.push(freeBlockEntry(b)));
      }
      const done = doc.sections.find((s) => s.kind === 'done');
      if (done && done.items.length) {
        out.push(groupHeader(done.title, done.items.length));
        done.items.forEach((it) => out.push(pendingEntry(Object.assign({ _section: done }, it))));
      }
      if (doc.unparsed && doc.unparsed.length) {
        out.push({ header: h('div', { class: 'group-sub muted' }, h('span', { text: `${plural(doc.unparsed.length, 'section affichée', 'sections affichées')} en texte seul` })) });
      }
      return out;
    },
    empty: () => emptyState('Liste vide', 'Rien en attente. La prochaine mise à jour la remplira.'),
  };
  function rank(kind) { const i = ORDERED.indexOf(kind); return i < 0 ? ORDERED.length : i; }

  function dueEntries() {
    const dues = cached('dues');
    if (!dues) return [];
    const out = [];
    const groups = [['En retard', (d) => d.overdue], ['Cette semaine', (d) => !d.overdue && daysFromNow(d.date) <= 7], ['Plus tard', (d) => !d.overdue && daysFromNow(d.date) > 7]];
    for (const [title, test] of groups) {
      const items = dues.items.filter(test);
      if (!items.length) continue;
      out.push(groupHeader(title, items.length));
      items.forEach((d, i) => {
        const it = d.ref && d.ref.kind === 'pending' ? findPending(d.ref.id) : null;
        out.push({
          key: `due:${d.date}:${d.ref ? d.ref.id : i}`, text: `${d.text} ${d.date}`, pending: it && (it.actions || []).includes('done') ? it : null,
          topic: it ? pendingTopic(it) : { topic_id: null, title: d.text },
          row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' },
            h('span', { class: ['date-col', d.overdue && 'late'], text: fmtDay(d.date) }), h('span', { class: 'row-title', text: d.text }),
            chip(d.kind === 'reset' ? 'reset compte' : 'relance', 'quiet'))),
          detail: () => it ? pendingDetail(it) : h('article', { class: 'detail' }, h('header', { class: 'detail-head' },
            h('div', { class: 'eyebrow', text: d.kind === 'reset' ? 'Reset de quota' : 'Échéance' }), h('h2', { text: d.text }),
            h('p', { class: 'due-line' }, icon('clock'), h('span', { text: fmtDay(d.date) }))),
          h('div', { class: 'actions' }, d.ref ? btn('Ouvrir', { icon: 'external', onclick: () => openRef(d.ref) }) : null)),
        });
      });
    }
    return out;
  }

  // ------------------------------------------------------------ Décisions

  const decisions = {
    title: 'Décisions', icon: 'decisions', allowDoneKey: true,
    count: (c) => ({ n: (c.decisions || 0) + (c.afk_decisions || 0) || null }),
    load: () => Promise.all([load('pending'), load('afk', null, { quiet: true })]),
    reload: () => ctx.refresh(['pending', 'afk']).then(ctx.render),
    status: () => status(['pending']),
    items() {
      const out = [];
      const list = allPending().filter((it) => it.section === 'decisions');
      if (list.length) { out.push(groupHeader('À décider', list.length)); list.forEach((it) => out.push(pendingEntry(it))); }
      const afk = cached('afk');
      if (afk && afk.decisions && afk.decisions.length) {
        out.push(groupHeader(`Décisions AFK · nuit du ${fmtDate(afk.night, false)}`, afk.decisions.length));
        for (const d of afk.decisions) {
          out.push({
            key: 'afk:' + d.n, text: `${d.question} ${d.job}`, topic: d.topic_id ? { topic_id: d.topic_id, title: d.question, kind: 'afk' } : null,
            row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, h('span', { class: 'prio prio-none' }),
              h('span', { class: 'row-title', text: d.question }), chip(d.answered ? 'répondu' : d.job, d.answered ? 'ok' : 'quiet')),
            h('div', { class: 'row-sub', text: `Recommandation : ${d.recommendation}` })),
            detail: () => afkDecisionDetail(d, afk),
          });
        }
      }
      if (cacheErr('afk')) out.push({ header: h('div', { class: 'group-sub late', text: `AFK illisible : ${cacheErr('afk').message}` }) });
      return out;
    },
    empty: () => emptyState('Aucune décision', 'Rien à trancher pour le moment.'),
  };

  function afkDecisionDetail(d, afk) {
    const job = (afk.jobs || []).find((j) => j.name === d.job);
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow', text: `Décision ${d.n} · job ${d.job}` }), h('h2', { text: d.question })),
      h('ol', { class: 'options' }, d.options.map((o) => h('li', { class: ['option', o === d.recommendation && 'option-reco'] },
        h('span', { text: o }), o === d.recommendation ? chip('recommandé', 'accent') : null))),
      h('div', { class: 'actions' },
        d.topic_id ? btn('Répondre dans le chat', { icon: 'chat', primary: true, onclick: () => ctx.openChat({ prefill: `Décision ${d.n} : je choisis « ${d.recommendation} ».` }) }) : null,
        job && job.report_file_id ? btn('Rapport du job', { icon: 'file', onclick: () => ctx.openFile(job.report_file_id, `rapport ${job.name}`) }) : null),
      h('p', { class: 'muted small', text: 'Réponse par boutons prévue en v1.1. Pour l\'instant, la réponse passe par le chat.' }),
      job ? h('p', { class: 'meta mono', text: `${job.name} · ${job.account || 'compte inconnu'} · ${RUN_STATE[job.status] || job.status}` }) : null);
  }

  // ------------------------------------------------------------ Mails

  function proposalChip(p) {
    if (!p) return null;
    const label = p.action === 'move' ? `→ ${p.folder_path}` : ACTION_LABEL[p.action] || p.action;
    const c = chip(label, p.allowed === false ? 'disabled' : p.action === 'reply' ? 'accent' : 'quiet');
    if (p.disabled_reason) c.title = p.disabled_reason;
    return c;
  }

  function freshness(list) {
    if (!list) return null;
    const cov = list.coverage || {};
    const covLabel = { complete: 'complète', partial: 'partielle', none: 'aucune' }[cov.status] || 'inconnue';
    const syncBtn = h('button', { type: 'button', class: 'icon-btn', title: 'Synchroniser la boîte (lecture seule)', 'aria-label': 'Synchroniser la boîte', onclick: syncMail }, icon('refresh'));
    const line = h('div', { class: ['fresh', list.stale && 'fresh-stale', cov.status === 'partial' && 'fresh-partial'] },
      h('span', { class: 'fresh-dot' }),
      h('span', { class: 'fresh-text' }, h('span', { text: list.synced_at ? `Synchro ${ago(list.synced_at)}` : 'Jamais synchronisée' }),
        h('span', { class: 'muted', text: ` · couverture ${covLabel}${cov.collected != null ? ` · ${cov.collected} mails` : ''}${cov.total_known != null ? ` sur ${cov.total_known}` : ''}` })),
      syncBtn);
    const box = h('div', { class: 'fresh-box' }, line);
    if (list.stale && list.synced_at) box.append(h('p', { class: 'small warn-text', text: `Instantané plus vieux que ${list.stale_after_minutes} min.` }));
    for (const e of cov.errors || []) box.append(h('p', { class: 'small late', text: `${e.message} (${fmtDate(e.at)})` }));
    if (cov.status === 'partial' && cov.oldest) box.append(h('p', { class: 'small muted', text: `Mails collectés jusqu'au ${fmtDate(cov.oldest, false)}.` }));
    return box;
  }

  async function syncMail() {
    try {
      const op = await ctx.api.post('/api/mail/sync', {});
      toast('Synchronisation lancée', { kind: 'info', detail: 'lecture seule' });
      ctx.trackOp(op, async (final) => {
        await ctx.refresh(['mail', 'state']);
        ctx.render();
        toast(final && final.status === 'succeeded' ? 'Boîte synchronisée' : `Synchronisation : ${final ? RUN_STATE[final.status] || final.status : 'inconnue'}`,
          { kind: final && final.status === 'succeeded' ? 'ok' : 'warn' });
      }, { log: 'Synchronisation de la boîte' });
    } catch (err) {
      if (err.code === 'already_running') toast(err.message, { kind: 'warn' });
      else toastError(err, 'Synchronisation');
    }
  }

  const mailItems = () => ((cached('mail') || {}).items || []);
  const triage = store.triage;

  function defaultChoice(m) {
    const p = m.proposal || {};
    return { action: p.action || 'keep', folder_id: p.folder_id || null };
  }
  function choiceOf(m) { return triage.checked.get(m.id) || triage.choices?.get(m.id) || defaultChoice(m); }
  triage.choices = triage.choices || new Map();
  const actionable = (c) => c.action === 'move' || c.action === 'archive' || c.action === 'trash';
  function blockedReason(m, c) {
    if (c.action === 'trash') {
      const cap = capability('mail_trash');
      return (m.proposal && m.proposal.action === 'trash' && m.proposal.disabled_reason) || (cap && cap.reason) || 'Corbeille désactivée en v1';
    }
    if (c.action === 'archive' && !((cached('folders') || {}).folders || []).some(f => f.well_known === 'archive' && f.allowed_target)) return 'Dossier d’archive absent de l’instantané';
    if (c.action === 'move' && !c.folder_id) return 'Choisis un dossier';
    if (!actionable(c)) return c.action === 'reply' ? 'Rien à ranger : réponse attendue' : 'Rien à ranger : garder dans la boîte';
    return null;
  }

  function mailRow(m) {
    return h('div', { class: ['row-body', 'mail-row', m.unread && 'unread'] },
      h('div', { class: 'row-line' }, h('span', { class: ['unread-dot', m.unread && 'on'], 'aria-label': m.unread ? 'non lu' : null }),
        h('span', { class: 'row-title', text: m.from.name }),
        m.has_attachments ? icon('paperclip', 'icon-sm muted') : null,
        h('time', { class: 'row-time', datetime: m.received, text: fmtDate(m.received) })),
      h('div', { class: 'row-subject', text: m.subject }),
      h('div', { class: 'row-sub', text: m.preview }),
      h('div', { class: 'row-chips' }, proposalChip(m.proposal), m.pending_ref ? chip('relance liée', 'quiet') : null,
        m.draft_ref ? chip('brouillon', 'quiet') : null));
  }

  function triageRow(m) {
    const c = choiceOf(m);
    const checked = triage.checked.has(m.id);
    const reason = blockedReason(m, c);
    const cb = h('input', { type: 'checkbox', class: 'check', 'aria-label': `Cocher ${m.subject}`, onchange: () => toggleCheck(m, cb.checked) });
    cb.checked = checked && !reason;
    if (reason) { disable(cb, reason); }
    const folders = ((cached('folders') || {}).folders || []).filter((f) => f.allowed_target && f.well_known !== 'archive');
    const actSel = h('select', { class: 'select select-small', 'aria-label': 'Action', onchange: () => setChoice(m, { action: actSel.value, folder_id: actSel.value === 'move' ? (c.folder_id || (folders[0] && folders[0].id) || null) : null }) },
      ['move', 'archive', 'keep', 'reply', 'trash'].map((a) => {
        const o = h('option', { value: a, text: ACTION_LABEL[a] });
        if (a === 'trash') { const cap = capability('mail_trash'); if (!cap || !cap.allowed) { o.disabled = true; o.textContent = 'Corbeille (indisponible)'; } }
        if (a === 'archive' && blockedReason(m, { action: 'archive' })) { o.disabled = true; o.textContent = 'Archiver (dossier indisponible)'; }
        if (a === c.action) o.selected = true;
        return o;
      }));
    const folderSel = c.action === 'move' ? h('select', { class: 'select select-small', 'aria-label': 'Dossier cible', onchange: () => setChoice(m, { action: 'move', folder_id: folderSel.value }) },
      folders.map((f) => { const o = h('option', { value: f.id, text: f.path }); if (f.id === c.folder_id) o.selected = true; return o; })) : null;
    return h('div', { class: ['row-body', 'triage-row', reason && 'blocked'] },
      h('label', { class: 'check-wrap', title: reason || 'Cocher (x)' }, cb),
      h('div', { class: 'triage-main' },
        h('div', { class: 'row-line' }, h('span', { class: 'row-title', text: m.from.name }), h('time', { class: 'row-time', text: fmtDate(m.received) })),
        h('div', { class: 'row-subject', text: m.subject }),
        m.proposal ? h('div', { class: 'row-sub', text: `crow : ${m.proposal.reason}${m.proposal.confidence ? ` (confiance ${conf(m.proposal.confidence)})` : ''}` }) : null,
        h('div', { class: 'triage-controls' }, actSel, folderSel, reason ? h('span', { class: 'small muted', text: reason }) : null)));
  }
  const conf = (c) => ({ high: 'haute', medium: 'moyenne', low: 'basse' }[c] || c);

  function toggleCheck(m, on) {
    const c = choiceOf(m);
    if (on && !blockedReason(m, c)) triage.checked.set(m.id, c); else triage.checked.delete(m.id);
    ctx.renderList();
  }
  function setChoice(m, c) {
    triage.choices.set(m.id, c);
    if (triage.checked.has(m.id)) { if (blockedReason(m, c)) triage.checked.delete(m.id); else triage.checked.set(m.id, c); }
    ctx.renderList();
  }

  async function makePlan(items) {
    const list = cached('mail');
    triage.busy = true; ctx.renderList();
    try {
      triage.plan = await ctx.api.post('/api/mail/triage/plan', { snapshot_rev: list ? list.snapshot_rev : null, items });
      triage.op = null;
    } catch (err) { toastError(err, 'Préparation du lot'); }
    triage.busy = false;
    ctx.render();
  }

  async function executePlan() {
    const plan = triage.plan;
    if (!plan) return;
    triage.busy = true; ctx.renderDetail();
    try {
      const op = await ctx.api.post('/api/mail/triage/execute', { plan_id: plan.plan_id, plan_hash: plan.plan_hash, confirm: true });
      triage.op = op;
      triage.plan = null;
      triage.checked.clear();
      ctx.trackOp(op, async (final) => {
        triage.op = final;
        await ctx.refresh(['mail', 'state']);
        ctx.render();
        toast(final.summary || 'Lot exécuté', { kind: final.status === 'succeeded' ? 'ok' : 'warn', detail: final.dry_run ? 'mode essai : simulé' : null });
      });
    } catch (err) {
      if (err.code === 'plan_consumed' || err.code === 'plan_expired') { triage.plan = null; toast(err.message, { kind: 'warn' }); }
      else toastError(err, 'Exécution du lot');
    }
    triage.busy = false;
    ctx.render();
  }

  async function reconcile(op) {
    try {
      const res = await ctx.api.post(`/api/operations/${encodeURIComponent(op.operation_id)}/reconcile`, {});
      toast('Vérification lancée (lecture seule)', { kind: 'info' });
      ctx.trackOp(res, (final) => { triage.op = final; ctx.render(); });
    } catch (err) { toastError(err, 'Vérification'); }
  }

  function planDetail() {
    const plan = triage.plan;
    const s = plan.summary || {};
    const byId = new Map(mailItems().map((m) => [m.id, m]));
    const exp = parseDate(plan.expires_at);
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow' }, h('span', { text: 'Lot de rangement figé' }), plan.dry_run ? chip('mode essai', 'warn') : null),
        h('h2', { text: `${plan.items.length} action${plan.items.length > 1 ? 's' : ''} à exécuter` }),
        h('p', { class: 'muted', text: `Expire ${exp ? 'dans ' + until(plan.expires_at) : '?'}` })),
      h('div', { class: 'summary-chips' }, s.move ? chip(plural(s.move, 'déplacé', 'déplacés'), 'quiet') : null,
        s.archive ? chip(plural(s.archive, 'archivé', 'archivés'), 'quiet') : null, s.rejected ? chip(plural(s.rejected, 'refusé', 'refusés'), 'warn') : null),
      h('ul', { class: 'plan-list' }, plan.items.map((it) => h('li', null, h('span', { class: 'grow' }, h('strong', { text: it.subject }), h('span', { class: 'muted', text: ` · ${it.from}` })),
        h('span', { class: 'plan-target', text: `${ACTION_LABEL[it.action]} → ${it.folder_path}` })))),
      plan.rejected && plan.rejected.length ? h('div', null, h('h3', { class: 'h3', text: 'Refusés' }),
        h('ul', { class: 'plan-list' }, plan.rejected.map((r) => h('li', { class: 'rejected' },
          h('span', { class: 'grow', text: (byId.get(r.message_id) || {}).subject || r.message_id }), h('span', { class: 'small late', text: r.message }))))) : null,
      h('div', { class: 'actions' },
        btn(`Exécuter ${plan.items.length} action${plan.items.length > 1 ? 's' : ''}`, { icon: 'check', primary: true,
          disabled: !plan.items.length ? 'Aucune action exécutable' : triage.busy ? 'En cours' : null, onclick: executePlan }),
        btn('Modifier la sélection', { ghost: true, onclick: () => { triage.plan = null; ctx.render(); } })),
      h('p', { class: 'muted small', text: 'Second clic : exécution par crow sous garde, seulement les mails listés.' }));
  }

  function opDetail() {
    const op = triage.op;
    const r = op.result || {};
    const byId = new Map(mailItems().map((m) => [m.id, m]));
    const stCls = op.status === 'succeeded' ? 'ok' : op.status === 'partial' || op.status === 'unknown' ? 'warn' : op.status === 'failed' ? 'late' : 'quiet';
    const canUndo = op.undo && op.undo.available && !op.undone_by;
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow' }, h('span', { text: 'Résultat du lot' }), chip(RUN_STATE[op.status] || op.status, stCls),
        op.dry_run ? chip('simulé', 'warn') : null), h('h2', { text: op.summary || 'Rangement' }),
      r.succeeded != null ? h('p', { class: 'muted', text: `${r.succeeded} faits · ${r.failed} échecs · ${r.unknown} inconnus` }) : null),
      op.error ? h('p', { class: 'callout callout-warn', text: op.error.message }) : null,
      h('ul', { class: 'plan-list' }, (op.items || []).map((it) => h('li', { class: 'item-' + it.status },
        h('span', { class: ['status-icon', 'st-' + it.status] }, icon(it.status === 'succeeded' ? 'check' : it.status === 'failed' ? 'close' : 'alert')),
        h('span', { class: 'grow' }, h('strong', { text: (byId.get(it.ref.id) || {}).subject || it.ref.id }), it.detail ? h('span', { class: 'muted small', text: ` · ${it.detail}` }) : null),
        it.folder_path ? h('span', { class: 'plan-target', text: `→ ${it.folder_path}` }) : null))),
      h('div', { class: 'actions' },
        op.status === 'unknown' ? btn('Vérifier', { icon: 'search', primary: true, title: 'Lecture de l\'état réel, aucune nouvelle tentative', onclick: () => reconcile(op) }) : null,
        canUndo ? btn('Annuler le lot', { icon: 'undo', onclick: async () => { const res = await ctx.undo(op); if (res) { triage.op = Object.assign({}, op, { undone_by: res.operation_id }); ctx.render(); } } }) : null,
        op.undone_by ? chip('lot annulé', 'quiet') : null,
        btn('Fermer', { ghost: true, onclick: () => { triage.op = null; ctx.render(); } })),
      op.undo && op.undo.reason ? h('p', { class: 'muted small', text: op.undo.reason }) : null);
  }

  // Reply-all box state lives in store.reply[mailId].
  function replyState(id) { return (store.reply[id] = store.reply[id] || { open: false, instructions: '', model: null, op: null, log: [] }); }

  function replyBox(d) {
    const rs = replyState(d.id);
    const cfg = ctx.config || {};
    const models = (cfg.chat && cfg.chat.models) || ['haiku', 'sonnet', 'opus'];
    const def = rs.model || (cfg.chat && cfg.chat.default_model) || 'sonnet';
    if (rs.op) return replyOp(d, rs);
    const ta = h('textarea', { class: 'textarea', rows: '4', id: 'reply-instructions', placeholder: 'Consigne : points à couvrir, ton, PJ à joindre…',
      oninput: () => { rs.instructions = ta.value; } });
    ta.value = rs.instructions;
    const sel = h('select', { class: 'select', 'aria-label': 'Modèle', onchange: () => { rs.model = sel.value; } },
      models.map((m) => { const o = h('option', { value: m, text: m }); if (m === def) o.selected = true; return o; }));
    const cap = capability('draft_skeleton');
    const go = btn('Préparer le brouillon', { icon: 'reply', primary: true, onclick: async () => {
      if (!rs.instructions.trim()) { ta.focus(); toast('Écris une consigne pour le brouillon', { kind: 'warn' }); return; }
      go.disabled = true;
      try {
        const op = await ctx.api.post(`/api/mail/${encodeURIComponent(d.id)}/reply-all`, { instructions: rs.instructions, model: sel.value });
        rs.op = op; rs.log = [];
        ctx.renderDetail();
        ctx.trackOp(op, (final) => { rs.op = final; if (store.sel.mail === d.id) ctx.renderDetail(); toast(final.summary || 'Brouillon prêt', { kind: final.status === 'succeeded' ? 'ok' : 'warn' }); },
          { onEvent: (type, data) => { if (type === 'text' || type === 'tool') { rs.log.push(type === 'tool' ? `${data.name} · ${data.summary || ''}` : data.text); if (store.sel.mail === d.id) ctx.renderDetail(); } } });
      } catch (err) { go.disabled = false; toastError(err, 'Réponse à tous'); }
    } });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go.click(); } });
    return h('section', { class: 'box reply-box' },
      h('header', { class: 'box-head' }, h('h3', { class: 'h3', text: 'Préparer une réponse à tous' }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fermer', onclick: () => { rs.open = false; ctx.renderDetail(); } }, icon('close'))),
      ta,
      h('div', { class: 'box-foot' }, h('label', { class: 'inline-label' }, h('span', { class: 'muted small', text: 'Modèle' }), sel), go),
      h('p', { class: 'muted small', text: 'Squelette (claude) → mise en forme (worka) → vérification (claude). Brouillon seulement, aucun envoi.' }),
      cap && cap.state !== 'available' ? h('p', { class: 'small warn-text', text: `Capacité limitée : ${cap.reason || CAP_STATE[cap.state]}` }) : null);
  }

  function replyOp(d, rs) {
    const op = rs.op;
    const r = op.result || {};
    const link = safeHref(r.draft_link);
    return h('section', { class: 'box reply-box' },
      h('header', { class: 'box-head' }, h('h3', { class: 'h3', text: op.summary || 'Réponse à tous' }),
        chip(RUN_STATE[op.status] || op.status, op.status === 'succeeded' ? 'ok' : op.status === 'failed' ? 'late' : 'run'),
        op.dry_run ? chip('mode essai', 'warn') : null),
      opSteps(op),
      rs.log.length && op.status !== 'succeeded' ? h('ol', { class: 'mini-log' }, rs.log.slice(-4).map((t) => h('li', { text: t }))) : null,
      r.checks ? h('ul', { class: 'checks' }, r.checks.map((c) => h('li', { class: c.ok === true ? 'ok' : c.ok === false ? 'ko' : 'muted' },
        h('span', { class: ['status-icon', c.ok === true ? 'st-succeeded' : c.ok === false ? 'st-failed' : 'st-unknown'] }, icon(c.ok === true ? 'check' : c.ok === false ? 'close' : 'help')),
        h('span', { text: { body_present: 'Texte présent', signature: 'Signature', size: 'Taille', attachments: 'Pièces jointes', no_send: 'Aucun envoi' }[c.name] || c.name }),
        c.detail ? h('span', { class: 'muted small', text: ' · ' + c.detail }) : null))) : null,
      h('div', { class: 'actions' },
        link ? h('a', { class: 'btn btn-primary', href: link, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), h('span', { text: 'Ouvrir le brouillon dans Outlook' })) : null,
        ['succeeded', 'failed', 'partial', 'unknown'].includes(op.status)
          ? btn('Nouvelle consigne', { ghost: true, onclick: () => { rs.op = null; rs.open = true; ctx.renderDetail(); } }) : null));
  }

  function classerMenu(anchor, d) {
    const folders = ((cached('folders') || {}).folders || []).filter((f) => f.allowed_target);
    const p = d.proposal || {};
    const act = h('select', { class: 'select', 'aria-label': 'Action' }, ['move', 'archive', 'trash'].map((a) => {
      const o = h('option', { value: a, text: ACTION_LABEL[a] });
      const cap = capability('mail_trash');
      if (a === 'trash' && (!cap || !cap.allowed)) { o.disabled = true; o.textContent = 'Corbeille (indisponible)'; }
      if (a === 'archive' && !folders.some(f => f.well_known === 'archive')) { o.disabled = true; o.textContent = 'Archiver (dossier indisponible)'; }
      if (a === (actionable(p) ? p.action : 'move')) o.selected = true;
      return o;
    }));
    const fold = h('select', { class: 'select', 'aria-label': 'Dossier' }, folders.filter((f) => f.well_known !== 'archive').map((f) => {
      const o = h('option', { value: f.id, text: f.path }); if (f.id === p.folder_id) o.selected = true; return o;
    }));
    const sync = () => { fold.disabled = act.value !== 'move'; };
    act.addEventListener('change', sync); sync();
    const form = h('form', { class: 'menu-form menu-form-col', onsubmit: (e) => {
      e.preventDefault(); closeMenus();
      store.mailMode = 'triage';
      makePlan([{ message_id: d.id, action: act.value, folder_id: act.value === 'move' ? fold.value : undefined }]);
    } },
    h('div', { class: 'menu-label', text: p.action && actionable(p) ? `Proposition de crow : ${p.reason}` : 'Classer ce mail' }),
    act, fold, h('button', { type: 'submit', class: 'btn btn-primary btn-small', text: 'Préparer le lot' }),
    h('p', { class: 'muted small', text: 'Le lot s\'affiche avant toute exécution.' }));
    popMenu(anchor, form);
  }

  async function fetchBody(d) {
    try {
      const op = await ctx.api.post(`/api/mail/${encodeURIComponent(d.id)}/fetch`, {});
      store.fetching = d.id; ctx.renderDetail();
      ctx.trackOp(op, async () => { store.fetching = null; await ctx.load('mail:' + d.id, `/api/mail/${encodeURIComponent(d.id)}`, { force: true }); ctx.renderDetail(); });
    } catch (err) { toastError(err, 'Lecture du mail'); }
  }

  function mailDetail(m) {
    const key = 'mail:' + m.id;
    const d = cached(key);
    if (d === undefined) {
      if (cacheErr(key)) return errorState(cacheErr(key), () => ctx.load(key, `/api/mail/${encodeURIComponent(m.id)}`, { force: true }).then(ctx.renderDetail));
      ctx.load(key, `/api/mail/${encodeURIComponent(m.id)}`).then(() => { if (store.sel.mail === m.id) ctx.renderDetail(); });
      return loadingState();
    }
    const rs = replyState(d.id);
    const acts = d.actions || [];
    const owa = safeHref(d.owa_link);
    const bar = h('div', { class: 'actions' });
    if (acts.includes('reply_all')) bar.append(btn('Répondre à tous', { icon: 'reply', primary: true, key: 'r', onclick: () => { rs.open = true; ctx.renderDetail(); focusReply(); } }));
    if (acts.includes('triage')) { const b = btn('Classer', { icon: 'folder' }); b.addEventListener('click', () => classerMenu(b, d)); bar.append(b); }
    if (owa) bar.append(h('a', { class: 'btn', href: owa, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), h('span', { text: 'Ouvrir dans Outlook' })));
    if (d.topic_id) bar.append(btn('Chat', { icon: 'chat', ghost: true, key: 'c', onclick: () => ctx.openChat() }));

    const people = (list) => (list || []).map((p) => `${p.name} <${p.address}>`).join(', ');
    let body;
    if (d.body_status === 'not_fetched' || d.body_text == null) {
      body = h('div', { class: 'state state-empty body-missing' }, h('div', { class: 'state-title', text: 'Texte non chargé' }),
        h('p', { class: 'muted', text: 'Seuls les mails récents sont préchargés. Le texte se lit par un run en lecture seule.' }),
        acts.includes('fetch_body') ? btn(store.fetching === d.id ? 'Lecture en cours…' : 'Charger le texte', { icon: 'refresh', disabled: store.fetching === d.id ? 'Lecture en cours' : null, onclick: () => fetchBody(d) }) : null);
    } else {
      body = h('div', { class: 'mail-body' }, h('pre', { class: 'body-text', text: d.body_text }),
        d.body_truncated ? h('p', { class: 'muted small', text: `Texte tronqué (${d.body_chars ?? '?'} caractères). Lire la suite dans Outlook.` }) : null);
    }
    const linked = d.pending_ref ? findPending(d.pending_ref.id) : null;
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' },
        h('h2', { text: d.subject }),
        h('div', { class: 'mail-meta' },
          h('div', null, h('strong', { text: d.from.name }), h('span', { class: 'muted', text: ` <${d.from.address}>` })),
          h('div', { class: 'muted small', text: `à ${people(d.to)}${d.cc && d.cc.length ? ` · cc ${people(d.cc)}` : ''}` }),
          h('div', { class: 'muted small', text: new Date(d.received).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) }))),
      bar,
      d.proposal ? h('div', { class: 'callout' }, h('span', { class: 'callout-label', text: 'crow propose' }), proposalChip(d.proposal),
        h('span', { class: 'muted small', text: `${d.proposal.reason} · confiance ${conf(d.proposal.confidence)}` })) : null,
      linked ? h('button', { type: 'button', class: 'callout callout-link', onclick: () => ctx.go('pending', linked.id) },
        h('span', { class: 'callout-label', text: 'Relance liée' }), h('span', { text: linked.title }), dueChip(linked)) : null,
      rs.open || rs.op ? replyBox(d) : null,
      body,
      d.attachments && d.attachments.length ? h('ul', { class: 'attachments' }, d.attachments.map((a) => h('li', null, icon('paperclip', 'icon-sm'),
        h('span', { text: a.name }), h('span', { class: 'muted small', text: bytes(a.size) })))) : null,
      d.thread && d.thread.length > 1 ? h('div', { class: 'thread' }, h('h3', { class: 'h3', text: `Fil (${d.thread.length})` }),
        h('ol', null, d.thread.map((t) => h('li', { class: ['thread-item', t.id === d.id && 'current'] },
          chip(t.kind === 'sent' ? 'envoyé' : 'reçu', t.kind === 'sent' ? 'accent' : 'quiet'), h('span', { text: t.from }),
          h('span', { class: 'muted small', text: fmtDate(t.date) }))))) : null);
  }

  function focusReply() { setTimeout(() => { const t = document.getElementById('reply-instructions'); if (t) t.focus(); }, 0); }

  const mail = {
    title: 'Mails', icon: 'mail',
    count: (c) => ({ n: c.inbox ?? null }),
    load: () => Promise.all([load('mail'), load('folders', null, { quiet: true }), load('caps', null, { quiet: true }), load('pending', null, { quiet: true })]),
    reload: () => ctx.refresh(['mail', 'folders']).then(ctx.render),
    status: () => status(['mail']),
    listHead() {
      const list = cached('mail');
      const props = mailItems().filter((m) => m.proposal).length;
      store.mailMode = store.mailMode === 'triage' ? 'triage' : 'inbox';
      return h('div', { class: 'list-head' },
        segmented([{ label: 'Boîte', value: 'inbox', count: list ? mailItems().length : null }, { label: 'Propositions', value: 'triage', count: list ? props : null }],
          store.mailMode, (v) => { store.mailMode = v; try { localStorage.setItem('crow.mailMode', JSON.stringify(v)); } catch { /* */ } ctx.render(); }),
        freshness(list));
    },
    items() {
      const items = mailItems();
      if (store.mailMode !== 'triage') return items.map((m) => ({ key: m.id, text: `${m.from.name} ${m.subject} ${m.preview}`, cls: m.unread ? 'is-unread' : null,
        topic: { topic_id: m.topic_id, title: m.subject, kind: 'mail', mailOnly: true }, row: () => mailRow(m), detail: () => mailDetail(m) }));
      const withProp = items.filter((m) => m.proposal);
      const toFile = withProp.filter((m) => actionable(m.proposal));
      const others = withProp.filter((m) => !actionable(m.proposal));
      const out = [];
      const entry = (m) => ({ key: m.id, text: `${m.from.name} ${m.subject}`, topic: { topic_id: m.topic_id, title: m.subject, kind: 'mail', mailOnly: true },
        row: () => triageRow(m), detail: () => mailDetail(m) });
      if (toFile.length) { out.push(groupHeader('À ranger', toFile.length)); toFile.forEach((m) => out.push(entry(m))); }
      if (others.length) { out.push(groupHeader('Garder ou répondre', others.length)); others.forEach((m) => out.push(entry(m))); }
      return out;
    },
    listFoot() {
      if (store.mailMode === 'triage') {
        const n = triage.checked.size;
        const safe = mailItems().filter((m) => m.proposal && m.proposal.allowed !== false && ['move', 'archive'].includes(m.proposal.action) && m.proposal.confidence === 'high');
        return h('div', { class: 'list-foot sticky' },
          h('button', { type: 'button', class: 'link-btn small', text: `Cocher les propositions sûres (${safe.length})`, onclick: () => {
            safe.forEach((m) => { const c = choiceOf(m); if (!blockedReason(m, c)) triage.checked.set(m.id, c); }); ctx.renderList();
          } }),
          triage.checked.size ? h('button', { type: 'button', class: 'link-btn small', text: 'Tout décocher', onclick: () => { triage.checked.clear(); ctx.renderList(); } }) : null,
          btn(`Valider ${n} action${n > 1 ? 's' : ''}`, { primary: true, icon: 'check', disabled: !n ? 'Coche au moins un mail' : triage.busy ? 'Préparation…' : null,
            onclick: () => makePlan([...triage.checked].map(([id, c]) => ({ message_id: id, action: c.action, folder_id: c.action === 'move' ? c.folder_id : undefined }))) }));
      }
      const list = cached('mail');
      if (list && list.next_cursor) {
        return h('div', { class: 'list-foot' }, btn('Charger plus', { ghost: true, small: true, onclick: async () => {
          try {
            const more = await ctx.api.get(`/api/mail?cursor=${encodeURIComponent(list.next_cursor)}&limit=50`);
            const known = new Set(list.items.map((m) => m.id));
            const add = more.items.filter((m) => !known.has(m.id));
            list.items.push(...add);
            list.next_cursor = add.length ? more.next_cursor : null;
            if (!add.length) toast('Fin de l\'instantané', { kind: 'info' });
            ctx.renderList();
          } catch (err) { toastError(err, 'Chargement'); }
        } }));
      }
      return null;
    },
    detailOverride() {
      if (store.mailMode !== 'triage') return null;
      if (triage.plan) return planDetail();
      if (triage.op) return opDetail();
      return null;
    },
    onReplyKey() {
      const id = store.sel.mail;
      if (!id) return;
      store.mailMode = store.mailMode || 'inbox';
      replyState(id).open = true;
      store.showDetail = true;
      ctx.render();
      focusReply();
    },
    onToggleKey() {
      if (store.mailMode !== 'triage') return;
      const m = mailItems().find((x) => x.id === store.sel.mail);
      if (m) toggleCheck(m, !triage.checked.has(m.id));
    },
    empty: () => {
      const list = cached('mail');
      return emptyState(store.mailMode === 'triage' ? 'Aucune proposition' : 'Boîte vide',
        list && list.coverage && list.coverage.status === 'none' ? 'Aucun instantané. Lance une synchronisation (lecture seule).' : null,
        list && list.coverage && list.coverage.status === 'none' ? btn('Synchroniser', { icon: 'refresh', primary: true, onclick: syncMail }) : null);
    },
  };

  // ------------------------------------------------------------ Brouillons

  const drafts = {
    title: 'Brouillons', icon: 'drafts',
    count: (c) => ({ n: c.drafts ?? null }),
    load: () => Promise.all([load('drafts'), load('pending', null, { quiet: true })]),
    reload: () => ctx.refresh(['drafts']).then(ctx.render),
    status: () => status(['drafts']),
    items() {
      const list = (cached('drafts') || {}).items || [];
      const out = [];
      for (const st of ['draft', 'missing', 'sent']) {
        const items = list.filter((d) => d.state === st);
        if (!items.length) continue;
        out.push(groupHeader(DRAFT_STATE[st], items.length));
        for (const d of items) out.push({
          key: d.id, text: `${d.subject} ${d.to.join(' ')}`, dim: st === 'sent',
          topic: { topic_id: d.topic_id, title: d.subject, kind: 'mail', mailOnly: true },
          row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, h('span', { class: ['state-dot', 'sd-' + d.state] }),
            h('span', { class: 'row-title', text: d.subject }), h('time', { class: 'row-time', text: fmtDate(d.updated) })),
          h('div', { class: 'row-sub', text: `à ${d.to.join(', ')}` }),
          h('div', { class: 'row-chips' }, d.signature_ok === false ? chip('signature à vérifier', 'warn') : null,
            d.attachments_missing && d.attachments_missing.length ? chip(`PJ manquante : ${d.attachments_missing.join(', ')}`, 'warn') : null)),
          detail: () => draftDetail(d),
        });
      }
      return out;
    },
    empty: () => emptyState('Aucun brouillon', 'Les brouillons préparés par crow apparaissent ici.'),
  };

  function draftDetail(d) {
    const owa = safeHref(d.owa_link);
    const linked = d.pending_ref ? findPending(d.pending_ref.id) : null;
    const stateKind = { draft: 'accent', sent: 'ok', missing: 'warn' }[d.state];
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow' }, chip(DRAFT_STATE[d.state] || d.state, stateKind)),
        h('h2', { text: d.subject }), h('p', { class: 'muted', text: `Modifié ${ago(d.updated)} (${fmtDate(d.updated)})` })),
      h('div', { class: 'actions' },
        owa ? h('a', { class: 'btn btn-primary', href: owa, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), h('span', { text: 'Relire dans Outlook' })) : null,
        linked ? btn('Ligne liée', { icon: 'pending', onclick: () => ctx.go(linked.section === 'decisions' ? 'decisions' : 'pending', linked.id) }) : null,
        d.topic_id ? btn('Chat', { icon: 'chat', ghost: true, key: 'c', onclick: () => ctx.openChat() }) : null),
      h('dl', { class: 'fields' },
        h('dt', { text: 'À' }), h('dd', { text: d.to.join(', ') || '–' }),
        h('dt', { text: 'Cc' }), h('dd', { text: d.cc.length ? d.cc.join(', ') : '–' }),
        h('dt', { text: 'Preuve' }), h('dd', { text: d.evidence }),
        h('dt', { text: 'Signature' }), h('dd', { text: d.signature_ok == null ? 'inconnue' : d.signature_ok ? 'présente' : 'à vérifier' }),
        h('dt', { text: 'PJ manquantes' }), h('dd', { text: d.attachments_missing.length ? d.attachments_missing.join(', ') : 'aucune' })),
      d.state === 'missing' ? h('p', { class: 'callout callout-warn', text: 'Absent de Brouillons et d\'Éléments envoyés. État incertain : rien n\'est marqué Réglé automatiquement.' }) : null,
      d.state === 'sent' && linked ? h('p', { class: 'callout', text: 'Envoi prouvé. La ligne liée peut être réglée depuis Relances.' }) : null);
  }

  // ------------------------------------------------------------ Dossiers

  const dossiers = {
    title: 'Dossiers', icon: 'dossiers',
    count: () => { const d = cached('dossiers'); return { n: d ? d.dossiers.length : null }; },
    load: () => Promise.all([load('dossiers'), load('pending', null, { quiet: true })]),
    reload: () => ctx.refresh(['dossiers']).then(ctx.render),
    status: () => status(['dossiers']),
    items() {
      return ((cached('dossiers') || {}).dossiers || []).map((d) => ({
        key: d.slug, text: `${d.title} ${d.folder_label}`, topic: { topic_id: d.topic_id, title: d.title, kind: 'dossier' },
        row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, icon('folder', 'icon-sm muted'), h('span', { class: 'row-title', text: d.title }),
          d.open_count ? chip(plural(d.open_count, 'ligne', 'lignes'), 'quiet') : null),
        h('div', { class: 'row-sub mono', text: d.folder_label }),
        h('div', { class: 'row-sub', text: d.last_activity ? `activité ${ago(d.last_activity)}` : '' })),
        detail: () => dossierDetail(d),
      }));
    },
    empty: () => emptyState('Aucun dossier', 'Les dossiers viennent de la section Dossiers du fichier en attente.'),
  };

  function dossierDetail(d) {
    const key = 'dossier:' + d.slug;
    const full = cached(key);
    if (full === undefined) {
      if (cacheErr(key)) return errorState(cacheErr(key));
      ctx.load(key, `/api/dossiers/${encodeURIComponent(d.slug)}`).then(() => { if (store.sel.dossiers === d.slug) ctx.renderDetail(); });
      return loadingState();
    }
    const items = (full.items || []).filter((it) => !store.hidden.has(it.id));
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow', text: 'Dossier' }), h('h2', { text: full.title }),
        h('p', { class: 'muted mono', text: full.folder_label })),
      h('div', { class: 'actions' },
        full.folder_file_id ? btn('Ouvrir le dossier', { icon: 'folder', primary: true, onclick: () => ctx.openFile(full.folder_file_id, full.title) }) : null,
        full.topic_id ? btn('Chat', { icon: 'chat', ghost: true, key: 'c', onclick: () => ctx.openChat() }) : null),
      h('h3', { class: 'h3', text: `Lignes liées (${items.length})` }),
      items.length ? h('ul', { class: 'linked' }, items.map((it) => h('li', null, h('button', { type: 'button', class: 'card-row', onclick: () => ctx.go('pending', it.id) },
        prioDot(it.prio), h('span', { class: 'grow' }, segments(it.cells.Sujet || it.cells.text)), h('span', { class: 'muted small', text: segText(it.cells.Attendu) }))))) : h('p', { class: 'muted', text: 'Aucune ligne ouverte.' }),
      h('h3', { class: 'h3', text: 'Fichiers récents' }),
      full.recent_files ? h('ul', { class: 'linked' }, full.recent_files.map((f) => h('li', null, h('button', { type: 'button', class: 'card-row', onclick: () => ctx.openFile(f.file_id, f.name) },
        icon('file', 'icon-sm'), h('span', { class: 'grow', text: f.name }), f.modified_after_crow ? chip('modifié depuis', 'warn') : null,
        h('span', { class: 'muted small', text: `${fmtDate(f.modified)} · ${bytes(f.size)}` })))))
        : h('p', { class: 'muted small', text: 'Prévu en v1.1.' }));
  }

  // ------------------------------------------------------------ Jobs

  const jobs = {
    title: 'Jobs', icon: 'jobs',
    count: (c) => ({ n: (c.runs_active || 0) + (c.runs_queued || 0) || null }),
    load: () => Promise.all([load('runs', null, { quiet: true }), load('routines', null, { quiet: true }), load('caps', null, { quiet: true })]),
    reload: () => ctx.refresh(['runs', 'routines']).then(ctx.render),
    status: () => (cached('runs') === undefined && !cacheErr('runs') ? 'loading' : null),
    listHead() {
      const err = cacheErr('runs');
      const runs = cached('runs');
      const src = runs && runs.source_status;
      if (err) return h('div', { class: 'list-head' }, h('p', { class: 'callout callout-warn small', text: err.message }));
      if (src && (src.cdx_runs !== 'ok' || src.registry !== 'ok')) return h('div', { class: 'list-head' }, h('p', { class: 'callout callout-warn small', text: `Sources : cdx ${src.cdx_runs}, registre ${src.registry}` }));
      return null;
    },
    items() {
      const out = [];
      const routines = (cached('routines') || {}).routines || [];
      if (routines.length) {
        out.push(groupHeader('Routines', routines.length));
        for (const r of routines) out.push({
          key: 'routine:' + r.name, text: r.label, topic: null,
          row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, runDot(r.running ? 'running' : r.last ? r.last.status : 'none'),
            h('span', { class: 'row-title', text: r.label }), r.dry_run ? chip('essai', 'warn') : null,
            h('span', { class: 'row-time', text: r.last ? fmtDate(r.last.at) : 'jamais' })),
          h('div', { class: 'row-sub', text: r.blocked_reason || r.description })),
          detail: () => routineDetail(r),
        });
      }
      const runs = cached('runs');
      if (runs) {
        const active = runs.runs.filter((r) => r.status === 'running');
        const recent = runs.runs.filter((r) => r.status !== 'running');
        if (active.length) { out.push(groupHeader('En cours', active.length)); active.forEach((r) => out.push(runEntry(r))); }
        if (runs.queue && runs.queue.length) {
          out.push(groupHeader('En file', runs.queue.length));
          for (const q of runs.queue) out.push({
            key: 'queue:' + q.operation_id, text: q.label, topic: null,
            row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, runDot('queued'), h('span', { class: 'row-title', text: q.label }),
              chip(`position ${q.position}`, 'quiet')), h('div', { class: 'row-sub', text: `${q.account} · attend ${q.waiting_for === 'slot' ? 'un créneau' : q.waiting_for}` })),
            detail: () => queueDetail(q),
          });
        }
        if (recent.length) { out.push(groupHeader('Récents (24 h)', recent.length)); recent.forEach((r) => out.push(runEntry(r))); }
      }
      return out;
    },
    empty: () => emptyState('Aucun job', 'Aucun run sur les dernières 24 h.'),
  };

  function runEntry(r) {
    return {
      key: 'run:' + r.run_id, text: `${r.label} ${r.account} ${r.project} ${r.status}`,
      topic: r.topic_id ? { topic_id: r.topic_id, title: r.label, kind: 'run' } : { topic_id: null, title: r.label },
      row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, runDot(r.status), h('span', { class: 'row-title', text: r.label }),
        r.owned_by_panel ? null : chip('hors panneau', 'quiet'), h('span', { class: 'row-time', text: fmtDate(r.started_at) })),
      h('div', { class: 'row-sub', text: [r.project, `${r.account} · ${r.model}`, r.status === 'running' ? `lancé ${fmtDate(r.started_at)}` : duration(r.duration_s),
        money(r.cost_usd, r.cost_status)].join(' · ') }),
      r.error ? h('div', { class: 'row-sub late', text: r.error }) : null),
      detail: () => runDetail(r),
    };
  }

  function runDetail(r) {
    const key = 'run:' + r.run_id;
    const d = cached(key);
    if (d === undefined) {
      if (cacheErr(key)) return errorState(cacheErr(key));
      ctx.load(key, `/api/runs/${encodeURIComponent(r.run_id)}`).then(() => { if (store.sel.jobs === key) ctx.renderDetail(); });
      return loadingState();
    }
    const stop = capability('run_stop');
    const evUrl = d.events_url || `/api/runs/${encodeURIComponent(r.run_id)}/events`;
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow' }, runDot(d.status), h('span', { text: RUN_STATE[d.status] || d.status }),
        h('span', { class: 'muted', text: `· ${d.kind === 'script' ? 'script' : 'agent'}` })), h('h2', { text: d.label }),
      h('p', { class: 'muted mono small', text: d.run_id })),
      h('div', { class: 'actions' },
        btn(d.status === 'running' ? 'Journal en direct' : 'Rejouer le journal', { icon: 'log', primary: d.status === 'running', onclick: () => followLog(r.run_id, d.label, evUrl) }),
        r.report_file_id ? btn('Rapport', { icon: 'file', onclick: () => ctx.openFile(r.report_file_id, `rapport ${d.label}`) }) : null,
        d.log_file_id ? btn('Log', { icon: 'file', ghost: true, onclick: () => ctx.openFile(d.log_file_id, `log ${d.label}`) }) : null,
        r.topic_id ? btn('Chat', { icon: 'chat', ghost: true, key: 'c', onclick: () => ctx.openChat() }) : null),
      d.status === 'running' && stop && !stop.allowed ? h('p', { class: 'muted small', text: `Pas de bouton Arrêter : ${stop.reason}` }) : null,
      h('dl', { class: 'fields fields-grid' },
        h('dt', { text: 'Compte' }), h('dd', { text: `${d.account ?? 'inconnu'} · ${d.model ?? '?'}` }),
        h('dt', { text: 'Début' }), h('dd', { text: fmtDate(d.started_at) }),
        h('dt', { text: 'Fin' }), h('dd', { text: d.ended_at ? fmtDate(d.ended_at) : '–' }),
        h('dt', { text: 'Durée' }), h('dd', { text: duration(d.duration_s) }),
        h('dt', { text: 'Code' }), h('dd', { text: d.exit_code == null ? '–' : String(d.exit_code) }),
        h('dt', { text: 'Coût' }), h('dd', { text: money(d.cost_usd, d.cost_status) }),
        r.tokens != null ? [h('dt', { text: 'Jetons' }), h('dd', { text: r.tokens.toLocaleString('fr-FR') })] : null),
      r.error ? h('p', { class: 'callout callout-warn', text: r.error }) : null,
      (d.report_sections || []).length ? h('div', { class: 'report' }, d.report_sections.map((s) => h('section', null, h('h3', { class: 'h3', text: s.title }),
        h('p', { class: 'prose' }, segments(s.segments))))) : h('p', { class: 'muted small', text: 'Pas de rapport pour ce run.' }));
  }

  function queueDetail(q) {
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow' }, runDot('queued'), h('span', { text: `En file · position ${q.position}` })), h('h2', { text: q.label }),
        h('p', { class: 'muted', text: `${q.account} · attend ${q.waiting_for === 'slot' ? 'un créneau libre' : q.waiting_for}` })),
      h('div', { class: 'actions' }, btn('Retirer de la file', { icon: 'close', onclick: async () => {
        try {
          const op = await ctx.api.post(`/api/operations/${encodeURIComponent(q.operation_id)}/cancel`, {});
          toast(op.summary || 'Retiré de la file', { kind: 'ok' });
          await ctx.refresh(['runs', 'state']);
          ctx.render();
        } catch (err) { toastError(err, 'Retrait'); }
      } })),
      h('p', { class: 'muted small', text: 'Un run déjà lancé ne s\'arrête pas depuis le panneau.' }));
  }

  function routineDetail(r) {
    const st = ctx.state;
    const lock = st && st.locks && (st.locks.maj || st.locks.pending);
    const reason = r.running ? 'Déjà en cours' : lock ? `Mise à jour en cours depuis ${fmtDate(lock.since)}` : null;
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow' }, h('span', { text: 'Routine' }), r.dry_run ? chip('mode essai', 'warn') : null),
        h('h2', { text: r.label }), h('p', { class: 'muted', text: r.description })),
      h('div', { class: 'actions' },
        btn('Lancer', { icon: 'bolt', primary: true, disabled: reason, onclick: () => ctx.runRoutine(r.name, r.label, r.blocked_reason) }),
        r.operation_id ? btn('Journal', { icon: 'log', onclick: () => followLog(r.operation_id, r.label, `/api/operations/${encodeURIComponent(r.operation_id)}/events`) }) : null),
      r.blocked_reason ? h('p', { class: 'callout callout-warn', text: r.blocked_reason }) : null,
      r.dry_run ? h('p', { class: 'muted small', text: 'Mode essai : le journal affiche la commande exacte, sans l\'exécuter.' }) : null,
      h('dl', { class: 'fields' },
        h('dt', { text: 'Dernier passage' }), h('dd', { text: r.last ? `${fmtDate(r.last.at)} · ${RUN_STATE[r.last.status] || r.last.status} · code ${r.last.exit_code ?? '?'}` : 'jamais' })),
      r.last && r.last.run_id ? h('button', { type: 'button', class: 'link-btn', text: 'Voir le dernier run', onclick: () => ctx.go('jobs', 'run:' + r.last.run_id) }) : null);
  }

  // ------------------------------------------------------------ Comptes

  const accounts = {
    title: 'Comptes', icon: 'accounts',
    count: () => { const a = cached('accounts'); const n = a ? a.accounts.filter((x) => x.state !== 'ok').length : 0; return { n: n || null }; },
    load: () => Promise.all([load('accounts'), load('caps', null, { quiet: true })]),
    reload: () => ctx.refresh(['accounts', 'caps']).then(ctx.render),
    status: () => status(['accounts']),
    listHead() {
      const a = cached('accounts');
      return a ? h('div', { class: 'list-head' }, h('p', { class: 'muted small list-note', text: `Quotas lus ${ago(a.cached_at)} · source ${a.source_status}` })) : null;
    },
    items() {
      const out = [];
      const a = cached('accounts');
      if (a) {
        out.push(groupHeader('Comptes', a.accounts.length));
        for (const acc of a.accounts) out.push({
          key: 'acc:' + acc.name, text: `${acc.name} ${acc.provider}`, topic: null,
          row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, h('span', { class: 'row-title', text: acc.name }), chip(acc.provider, 'quiet'),
            acc.state !== 'ok' ? chip(acc.state === 'near_floor' ? 'proche du plancher' : acc.state === 'unknown' ? 'inconnu' : acc.state, acc.state === 'unknown' ? 'quiet' : 'warn') : null),
          gauge('5 h', acc.remaining_5h_pct, acc.floor_5h_pct)),
          detail: () => accountDetail(acc),
        });
        if (a.out_of_policy && a.out_of_policy.length) {
          out.push(groupHeader('Hors politique', a.out_of_policy.length));
          for (const o of a.out_of_policy) out.push({ key: 'oop:' + o.name, text: o.name, topic: null, dim: true,
            row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, h('span', { class: 'row-title', text: o.name })), h('div', { class: 'row-sub', text: o.error })),
            detail: () => h('article', { class: 'detail' }, h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow', text: 'Compte hors politique' }), h('h2', { text: o.name })),
              h('p', { text: o.error }), h('p', { class: 'muted small', text: 'Jamais utilisé par le panneau.' })) });
        }
      }
      const caps = cached('caps');
      if (caps) {
        out.push(groupHeader('Capacités', caps.capabilities.length, h('span', { class: 'muted small', text: `sonde ${ago(caps.probed_at)}` })));
        for (const c of caps.capabilities) out.push({
          key: 'cap:' + c.name, text: `${c.label} ${c.name}`, topic: null,
          row: () => h('div', { class: 'row-body' }, h('div', { class: 'row-line' }, h('span', { class: ['cap-dot', 'cap-' + c.state] }), h('span', { class: 'row-title', text: c.label }),
            chip(CAP_STATE[c.state] || c.state, c.state === 'available' ? 'ok' : c.state === 'limited' ? 'warn' : 'late')),
          c.reason ? h('div', { class: 'row-sub', text: c.reason }) : null),
          detail: () => capDetail(c),
        });
      }
      return out;
    },
  };

  function accountDetail(a) {
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow' }, chip(a.provider, 'quiet'), a.in_policy ? null : chip('hors politique', 'warn')),
        h('h2', { text: a.name }), a.error ? h('p', { class: 'late', text: a.error }) : null),
      h('div', { class: 'gauges' },
        gauge('Fenêtre 5 h', a.remaining_5h_pct, a.floor_5h_pct, a.reset_5h_at ? `reset dans ${until(a.reset_5h_at)} (${fmtDate(a.reset_5h_at)}) · plancher ${a.floor_5h_pct} %` : 'reset inconnu'),
        gauge('Semaine', a.remaining_week_pct, a.floor_week_pct, a.reset_week_at ? `reset ${fmtDay(a.reset_week_at)} · plancher ${a.floor_week_pct} %` : 'reset inconnu')),
      h('dl', { class: 'fields' },
        h('dt', { text: 'Crédits de reset' }), h('dd', { text: a.reset_credits == null ? 'inconnu' : String(a.reset_credits) }),
        h('dt', { text: 'Usages' }), h('dd', null, (a.kinds || []).map((k) => chip(k, 'quiet'))),
        h('dt', { text: 'Quota' }), h('dd', { text: a.quota_status === 'known' ? 'connu' : 'inconnu' })),
      h('p', { class: 'muted small', text: 'Aucun crédit de reset n\'est consommé par le panneau.' }));
  }

  function capDetail(c) {
    const ev = c.evidence || {};
    const names = { schema: 'Schéma', headless_probe: 'Sonde sans tête', permissions: 'Permissions', live_trial: 'Essai réel' };
    return h('article', { class: 'detail' },
      h('header', { class: 'detail-head' }, h('div', { class: 'eyebrow' }, chip(CAP_STATE[c.state] || c.state, c.state === 'available' ? 'ok' : c.state === 'limited' ? 'warn' : 'late'),
        chip(c.mode === 'dry_run' ? 'mode essai' : 'réel', 'quiet'), chip(c.allowed ? 'autorisé' : 'non autorisé', c.allowed ? 'quiet' : 'late')),
      h('h2', { text: c.label }), h('p', { class: 'muted mono small', text: c.name })),
      c.reason ? h('p', { class: 'callout', text: c.reason }) : null,
      h('table', { class: 'evidence' }, h('thead', null, h('tr', null, h('th', { text: 'Preuve' }), h('th', { text: 'État' }), h('th', { text: 'Date' }), h('th', { text: 'Détail' }))),
        h('tbody', null, Object.keys(names).map((k) => {
          const e = ev[k] || {};
          return h('tr', null, h('td', { text: names[k] }),
            h('td', null, h('span', { class: ['status-icon', e.ok === true ? 'st-succeeded' : e.ok === false ? 'st-failed' : 'st-none'] },
              icon(e.ok === true ? 'check' : e.ok === false ? 'close' : 'info'))),
            h('td', { class: 'muted small', text: e.at ? fmtDate(e.at) : '–' }), h('td', { class: 'small', text: e.detail || '–' }));
        }))));
  }

  return { today, mail, pending, decisions, drafts, dossiers, jobs, accounts };
}

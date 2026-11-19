// One local search box. Results stay in memory for the lifetime of this dialog.
import { h, clear, openDialog, closeDialog, loadingState, emptyState, errorState } from './ui.js';

export function openSearch(api, openResult) {
  const input = h('input', { id: 'global-search', class: 'input', type: 'search', maxlength: 200,
    placeholder: 'Mails, sujets réglés, conversations, dossiers, runs', 'aria-label': 'Recherche globale',
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'search-results', 'aria-expanded': 'false',
    autocomplete: 'off', spellcheck: 'false' });
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  const results = h('div', { id: 'search-results', role: 'listbox', 'aria-label': 'Résultats par type' });
  const notes = h('p', { class: 'muted small' });
  const dialog = openDialog('Recherche globale', h('div', { class: 'search-box' }, input, status, results, notes), { wide: true });
  let timer, revision = 0, active = 0, entries = [], buttons = [], busy = false;

  function highlight(index) {
    active = index;
    buttons.forEach((button, i) => { button.setAttribute('aria-selected', String(i === active)); });
    if (buttons[active]) {
      input.setAttribute('aria-activedescendant', buttons[active].id);
      buttons[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  async function choose(entry) {
    if (!entry || busy) return;
    busy = true;
    try { await openResult(entry); closeDialog(); }
    catch (err) { status.textContent = err.message || 'Ouverture impossible. Recharge la recherche.'; }
    finally { busy = false; }
  }

  async function search(version) {
    const query = input.value.trim();
    if (!query) { clear(results); status.textContent = 'Saisis un mot ou plusieurs mots.'; notes.textContent = ''; return; }
    clear(results).append(loadingState('Recherche…'));
    try {
      const data = await api.get('/api/search?q=' + encodeURIComponent(query));
      if (version !== revision || !dialog.open || !input.isConnected) return;
      clear(results); entries = []; buttons = [];
      let total = 0;
      for (const group of data.groups) {
        total += group.total;
        if (!group.total) continue;
        const list = h('div', { role: 'group', 'aria-label': group.label });
        list.append(h('div', { class: 'search-group', role: 'presentation', text: `${group.label} · ${group.total}` }));
        for (const entry of group.items) {
          const index = entries.length;
          const button = h('button', { type: 'button', class: 'search-result', id: 'search-result-' + index,
            role: 'option', tabindex: '-1', 'aria-selected': 'false',
            onclick: () => choose(entry), onpointermove: () => highlight(index) },
          h('span', { class: 'search-title', text: entry.title }), h('span', { class: 'muted small', text: entry.subtitle }));
          entries.push(entry); buttons.push(button); list.append(button);
        }
        if (group.total > group.items.length) list.append(h('p', { class: 'muted small', role: 'presentation', text: `${group.items.length} sur ${group.total}. Précise la recherche.` }));
        results.append(list);
      }
      input.setAttribute('aria-expanded', String(entries.length > 0));
      status.textContent = `${total} résultat${total > 1 ? 's' : ''}. ↑ ↓ pour choisir, Entrée pour ouvrir.`;
      if (!total) results.append(emptyState('Aucun résultat', 'Essaie un autre mot.'));
      const mail = data.sources.mail;
      notes.textContent = [mail && (mail.coverage === 'none' ? 'Aucun instantané mail.' : mail.coverage !== 'complete' ? 'Instantané mail partiel.' : 'Mails : instantané local.'),
        mail?.stale ? 'Instantané mail ancien.' : null,
        data.sources.runs?.cdx_runs === 'unavailable' ? 'Runs : source cdx indisponible, registre local conservé.' : 'Runs : année écoulée, registre local et 200 runs cdx récents.'].filter(Boolean).join(' ');
      highlight(0);
    } catch (err) {
      if (version !== revision || !dialog.open || !input.isConnected) return;
      clear(results).append(errorState(err, () => search(revision))); status.textContent = 'Recherche indisponible.';
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer); revision++; entries = []; buttons = [];
    input.removeAttribute('aria-activedescendant'); input.setAttribute('aria-expanded', 'false');
    clear(results); notes.textContent = ''; status.textContent = 'Recherche…';
    const version = revision;
    timer = setTimeout(() => search(version), 150);
  });
  dialog.addEventListener('close', () => { revision++; clearTimeout(timer); }, { once: true });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (entries.length) highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length);
    } else if (event.key === 'Enter') { event.preventDefault(); choose(entries[active]); }
  });
  status.textContent = 'Saisis un mot ou plusieurs mots.';
  input.focus();
}

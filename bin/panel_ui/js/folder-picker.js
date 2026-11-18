import { h, clear } from './ui.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

if (!document.getElementById('mail-picker-css')) document.head.append(h('link', {
  id: 'mail-picker-css', rel: 'stylesheet', href: new URL('../mail.css', import.meta.url).href,
}));

// Shared by Classer and each proposal. Server values enter text nodes only.
export function folderPicker(data = {}, selected, onChange = () => {}) {
  const folders = [...(data.folders || [])].sort((a, b) => a.path.localeCompare(b.path));
  let value = selected || null;
  const list = h('div', { class: 'folder-options', role: 'listbox', 'aria-label': 'Dossiers Outlook' });
  const search = h('input', { type: 'search', class: 'input', placeholder: 'Rechercher un dossier…',
    'aria-label': 'Rechercher un dossier', oninput: render });
  const chosen = h('div', { class: 'folder-chosen small', role: 'status' });
  function option(f, recent = false) {
    const button = h('button', { type: 'button', class: 'folder-option', role: 'option',
      'aria-selected': f.id === value ? 'true' : 'false', disabled: !f.allowed_target,
      title: f.allowed_target ? f.path : `${f.path} : destination non autorisée`,
      dataset: { folderId: f.id }, onclick: () => { value = f.id; render(); onChange(f.id); } },
    h('span', { class: 'folder-branch', text: recent ? '↶' : '›'.repeat(Math.min(f.depth ?? f.path.split('/').length - 1, 8)) }),
    h('span', { text: f.path }));
    return button;
  }
  function render() {
    clear(list);
    const terms = fold(search.value).split(/\s+/).filter(Boolean);
    const matches = folders.filter((f) => terms.every((t) => fold(f.path).includes(t)));
    const recent = terms.length ? [] : (data.recent_targets || []).map((id) => folders.find((f) => f.id === id && f.allowed_target)).filter(Boolean);
    if (recent.length) list.append(h('div', { class: 'menu-label', text: 'Dossiers récents' }), ...recent.map((f) => option(f, true)));
    list.append(h('div', { class: 'menu-label', text: terms.length ? `${matches.length} dossier(s)` : 'Tous les dossiers' }), ...matches.map((f) => option(f)));
    if (!matches.length) list.append(h('p', { class: 'small muted', text: 'Aucun dossier trouvé.' }));
    const target = folders.find((f) => f.id === value && f.allowed_target);
    chosen.textContent = target ? `Choisi : ${target.path}` : 'Choisis une destination.';
  }
  const element = h('div', { class: 'folder-picker', onkeydown: (e) => {
    if (e.key !== 'Escape') e.stopPropagation();
    if (e.key === 'Enter' && e.target.matches('.folder-option:not(:disabled)')) { e.preventDefault(); e.target.click(); return; }
    if (e.key === 'Enter' && e.target === search) { e.preventDefault(); list.querySelector('button:not(:disabled)')?.focus(); }
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const buttons = [...list.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    buttons[Math.max(0, Math.min(buttons.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  } }, search, data.stale || data.complete === false ? h('p', { class: 'small muted', text: 'Arbre ancien ou incomplet. Synchroniser pour le rafraîchir.' }) : null, list, chosen);
  render();
  return { element, get value() { return value; }, focus: () => search.focus(),
    setDisabled: (disabled) => { element.hidden = disabled; } };
}

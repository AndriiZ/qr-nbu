'use strict';

/* ════════════════════════════════════════════════
   Templates page  (uses storage.js templates layer)
   ════════════════════════════════════════════════ */

let editingId   = null; // template id currently being edited, or null
let searchQuery = '';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDateShort(ts) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(ts));
}

/* ── Sorted same way as the top-5 on the generator page ── */
function sortedTemplates() {
  return [...loadTemplates()]
    .sort((a, b) => (b.count || 0) - (a.count || 0) || (b.lastUsed || 0) - (a.lastUsed || 0));
}

/* ════════════════════════════════════════════════
   Render
   ════════════════════════════════════════════════ */
function renderTemplates() {
  const all     = sortedTemplates();
  const q       = searchQuery.toLowerCase();
  const list    = q ? all.filter(t => t.text.toLowerCase().includes(q)) : all;
  const wrap    = document.getElementById('tpl-list');
  const empty   = document.getElementById('tpl-empty');
  const noRes   = document.getElementById('tpl-no-results');
  const countEl = document.getElementById('tpl-count');

  countEl.textContent = q
    ? `${list.length} з ${all.length} шаблонів`
    : `${all.length} / ${MAX_TEMPLATES} шаблонів`;
  empty.hidden = all.length > 0;
  noRes.hidden = !(all.length > 0 && list.length === 0);

  wrap.innerHTML = '';
  list.forEach(t => {
    const i = all.indexOf(t); // top-5 rank is global, not within the filtered view
    const card = document.createElement('div');
    card.className = 'tpl-card';

    const top5 = i < 5
      ? `<span class="r-badge r-badge--gen" title="Показується на головній сторінці">топ-5</span>`
      : '';
    const used = t.lastUsed
      ? `<span class="r-badge" title="Останнє використання">${esc(formatDateShort(t.lastUsed))}</span>`
      : '';

    const linked = getRecipientsForTemplate(t.id); // storage.js
    const linkedBadge = linked.length
      ? `<span class="r-badge r-badge--gen" title="${esc(linked.map(r => r.name + ' (' + r.count + '×)').join('\n'))}"><i class="ti ti-users icon" aria-hidden="true"></i>&nbsp;${linked.length} отримув.</span>`
      : '';

    card.innerHTML = `
      <div class="tpl-text">
        ${esc(t.text)}
        <div class="tpl-meta">
          <span class="r-badge">${t.count || 0} використань</span>
          ${used}
          ${linkedBadge}
          ${top5}
        </div>
      </div>
      <div class="tpl-actions">
        <button class="tpl-btn" data-act="edit" data-id="${esc(t.id)}" title="Редагувати">
          <i class="ti ti-pencil icon" aria-hidden="true"></i>
        </button>
        <button class="tpl-btn" data-act="clone" data-id="${esc(t.id)}" title="Клонувати шаблон">
          <i class="ti ti-copy icon" aria-hidden="true"></i>
        </button>
        <button class="tpl-btn tpl-btn--del" data-act="del" data-id="${esc(t.id)}" title="Видалити">
          <i class="ti ti-trash icon" aria-hidden="true"></i>
        </button>
      </div>`;
    wrap.appendChild(card);
  });

  renderHistorySuggestions();
}

/* ── Raw purposes from history not yet saved as templates ── */
function renderHistorySuggestions() {
  const saved = new Set(loadTemplates().map(t => t.text));
  const raw   = getTopPurposesFromHistory(10).filter(p => !saved.has(p.text));

  const wrap = document.getElementById('tpl-hist');
  const list = document.getElementById('tpl-hist-list');
  wrap.hidden = raw.length === 0;
  list.innerHTML = '';

  raw.forEach(p => {
    const row = document.createElement('div');
    row.className = 'tpl-hist-row';
    row.innerHTML = `
      <span class="tpl-hist-text">${esc(p.text)}</span>
      <span class="r-badge">${p.count}×</span>
      <button class="tpl-btn" data-text-idx title="Додати як шаблон">
        <i class="ti ti-plus icon" aria-hidden="true"></i>
      </button>`;
    row.querySelector('button').addEventListener('click', () => {
      const tpl = addTemplate(p.text);
      if (tpl) {
        // carry over usage stats from history so ordering is meaningful
        const all = loadTemplates();
        const t = all.find(x => x.id === tpl.id);
        if (t && !t.count) { t.count = p.count; t.lastUsed = p.lastUsed; saveTemplates(all); }
        renderTemplates();
      }
    });
    list.appendChild(row);
  });
}

/* ════════════════════════════════════════════════
   Add / edit form
   ════════════════════════════════════════════════ */
function resetForm() {
  editingId = null;
  document.getElementById('tpl-input').value = '';
  document.getElementById('tpl-form-title').textContent = 'Новий шаблон';
  document.getElementById('btn-tpl-save-text').textContent = 'Додати шаблон';
  document.getElementById('btn-tpl-cancel').hidden = true;
}

function startEdit(id) {
  const t = loadTemplates().find(x => x.id === id);
  if (!t) return;
  editingId = id;
  const input = document.getElementById('tpl-input');
  input.value = t.text;
  document.getElementById('tpl-form-title').textContent = 'Редагування шаблону';
  document.getElementById('btn-tpl-save-text').textContent = 'Зберегти зміни';
  document.getElementById('btn-tpl-cancel').hidden = false;
  input.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function saveForm() {
  const input = document.getElementById('tpl-input');
  const text  = input.value.trim();
  if (!text) { input.classList.add('field-error'); input.focus(); return; }
  input.classList.remove('field-error');

  if (editingId) {
    updateTemplate(editingId, text);
  } else {
    if (!addTemplate(text)) return; // limit hit — alert shown by storage.js
  }
  resetForm();
  renderTemplates();
}

/* ════════════════════════════════════════════════
   Clone
   ════════════════════════════════════════════════ */
function cloneTemplate(id) {
  const src = loadTemplates().find(x => x.id === id);
  if (!src) return;

  // Unique text: «… (копія)», «… (копія 2)», …
  const texts = new Set(loadTemplates().map(t => t.text));
  let text = src.text + ' (копія)';
  let n = 2;
  while (texts.has(text)) text = src.text + ` (копія ${n++})`;

  const tpl = addTemplate(text); // limit alert handled by storage.js
  if (!tpl) return;
  renderTemplates();
  startEdit(tpl.id); // clone lands in the edit form, ready to adjust
}

/* ════════════════════════════════════════════════
   Hamburger nav
   ════════════════════════════════════════════════ */
function initNav() {
  const btn     = document.getElementById('hamburger-btn');
  const drawer  = document.getElementById('nav-drawer');
  const overlay = document.getElementById('nav-overlay');
  const open  = () => { drawer.classList.add('open'); overlay.classList.add('open'); btn.setAttribute('aria-expanded','true'); };
  const close = () => { drawer.classList.remove('open'); overlay.classList.remove('open'); btn.setAttribute('aria-expanded','false'); };
  btn.addEventListener('click', () => drawer.classList.contains('open') ? close() : open());
  document.addEventListener('click', e => {
    if (drawer.classList.contains('open') && !drawer.contains(e.target) && !btn.contains(e.target)) close();
  });
}

/* ════════════════════════════════════════════════
   Init
   ════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  renderTemplates();

  let searchTimer = null;
  document.getElementById('tpl-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      renderTemplates();
    }, 200);
  });

  document.getElementById('btn-tpl-save').addEventListener('click', saveForm);
  document.getElementById('btn-tpl-cancel').addEventListener('click', resetForm);
  document.getElementById('tpl-input').addEventListener('input', function () {
    this.classList.remove('field-error');
  });

  // Delegated list actions
  document.getElementById('tpl-list').addEventListener('click', e => {
    const btn = e.target.closest('.tpl-btn');
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === 'edit')  startEdit(id);
    if (act === 'clone') cloneTemplate(id);
    if (act === 'del') {
      const t = loadTemplates().find(x => x.id === id);
      if (!t) return;
      if (!confirm('Видалити шаблон?\n\n«' + t.text + '»')) return;
      deleteTemplate(id);
      if (editingId === id) resetForm();
      renderTemplates();
    }
  });
});

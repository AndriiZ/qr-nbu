'use strict';

/* ════════════════════════════════════════════════
   Constants
   ════════════════════════════════════════════════ */
const PAGE_SIZE = 20;

let currentSort   = 'date';
let visibleCount  = PAGE_SIZE;
let searchQuery   = '';

/* ── Helpers ── */
function formatDate(ts) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}

function formatDateShort(ts) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(ts));
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Highlight search match in text ── */
function highlight(text, query) {
  if (!query) return esc(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  return esc(text).replace(re, '<mark>$1</mark>');
}

/* ── Sort ── */
function sortedRecipients(list) {
  const copy = [...list];
  if (currentSort === 'count') {
    copy.sort((a, b) => (b.count || 0) - (a.count || 0) || (b.lastUsed || 0) - (a.lastUsed || 0));
  } else {
    copy.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  }
  return copy;
}

/* ── Search filter ── */
function matchesSearch(r, q) {
  if (!q) return true;
  const lower = q.toLowerCase();
  const fields = [
    r.name, r.iban, r.edrpou, r.email, r.phone, r.tg,
    ...(r.generations || []).map(g => g.amountField),
  ];
  return fields.some(f => f && String(f).toLowerCase().includes(lower));
}

function filteredRecipients() {
  const all = sortedRecipients(loadRecipients());
  return searchQuery ? all.filter(r => matchesSearch(r, searchQuery)) : all;
}

/* ════════════════════════════════════════════════
   Render helpers
   ════════════════════════════════════════════════ */
function renderOptional(value, iconId) {
  if (!value) return '';
  return `<span class="r-meta-item">
    <svg class="icon" aria-hidden="true"><use href="icons.svg#${esc(iconId)}"/></svg>
    ${highlight(value, searchQuery)}
  </span>`;
}

function renderGeneration(g, recipientId) {
  const amountStr = g.amountField
    ? `<span class="gen-amount">${highlight(g.amountField, searchQuery)}</span>`
    : '';
  return `
  <div class="gen-row">
    <button class="gen-ts" data-rid="${esc(recipientId)}" data-gid="${esc(g.id)}" title="Відкрити QR на головній">
      <svg class="icon" aria-hidden="true"><use href="icons.svg#ic-external"/></svg>
      ${esc(formatDate(g.timestamp))}
    </button>
    <span class="gen-purpose">${esc(g.purpose)}</span>
    ${amountStr}
  </div>`;
}

function renderRecipient(r) {
  const gens        = [...(r.generations || [])].reverse();
  const lastUsedStr = r.lastUsed ? formatDateShort(r.lastUsed) : '—';
  const ibanShort   = r.iban
    ? r.iban.slice(0, 4) + ' ' + r.iban.slice(4, 8) + ' … ' + r.iban.slice(-4)
    : '';

  return `
  <div class="r-card" id="card-${esc(r.id)}">
    <div class="r-card-header">
      <div class="r-card-info">
        <div class="r-name">${highlight(r.name, searchQuery)}</div>
        <div class="r-iban">${highlight(ibanShort, searchQuery)}</div>
        <div class="r-meta">
          <span class="r-meta-item">
            <svg class="icon" aria-hidden="true"><use href="icons.svg#ic-clock"/></svg>
            ${esc(lastUsedStr)}
          </span>
          <span class="r-badge">${r.count || 0} дн.</span>
          <span class="r-badge r-badge--gen">${gens.length} QR</span>
          ${renderOptional(r.email, 'ic-mail')}
          ${renderOptional(r.phone, 'ic-phone')}
          ${renderOptional(r.tg,    'ic-telegram')}
        </div>
      </div>
      <div class="r-card-actions">
        <button class="btn-expand" data-rid="${esc(r.id)}" aria-expanded="false" title="Показати генерації">
          <svg class="icon icon--chevron" aria-hidden="true"><use href="icons.svg#ic-chevron-down"/></svg>
        </button>
        <button class="btn-delete" data-rid="${esc(r.id)}" title="Видалити отримувача">
          <svg class="icon" aria-hidden="true"><use href="icons.svg#ic-trash"/></svg>
        </button>
      </div>
    </div>
    <div class="r-gens" id="gens-${esc(r.id)}" hidden>
      <div class="r-gens-inner">
        ${gens.map(g => renderGeneration(g, r.id)).join('') || '<div class="gen-empty">Немає генерацій</div>'}
      </div>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════
   Render list (with pagination)
   ════════════════════════════════════════════════ */
function renderList() {
  const filtered    = filteredRecipients();
  const total       = filtered.length;
  const allCount    = loadRecipients().length;
  const visible     = filtered.slice(0, visibleCount);
  const remaining   = total - visibleCount;

  const container  = document.getElementById('recipients-list');
  const empty      = document.getElementById('empty-state');
  const noResults  = document.getElementById('no-results');
  const loadWrap   = document.getElementById('load-more-wrap');
  const loadCount  = document.getElementById('load-more-count');
  const countEl    = document.getElementById('recipients-count');

  countEl.textContent = searchQuery
    ? `${total} з ${allCount} отримувачів`
    : `${allCount} / ${MAX_RECIPIENTS} отримувачів`;

  // Empty storage
  if (!allCount) {
    container.innerHTML = '';
    empty.hidden    = false;
    noResults.hidden = true;
    loadWrap.hidden  = true;
    return;
  }
  empty.hidden = true;

  // No search results
  if (!total) {
    container.innerHTML = '';
    noResults.hidden = false;
    loadWrap.hidden  = true;
    return;
  }
  noResults.hidden = true;

  container.innerHTML = visible.map(renderRecipient).join('');
  attachCardListeners();

  // Load more
  if (remaining > 0) {
    loadWrap.hidden = false;
    loadCount.textContent = `(ще ${Math.min(remaining, PAGE_SIZE)} з ${remaining})`;
  } else {
    loadWrap.hidden = true;
  }
}

/* ── Append next page without full re-render ── */
function loadMore() {
  const filtered  = filteredRecipients();
  const nextSlice = filtered.slice(visibleCount, visibleCount + PAGE_SIZE);
  visibleCount   += PAGE_SIZE;

  const container = document.getElementById('recipients-list');
  const frag      = document.createElement('div');
  frag.innerHTML  = nextSlice.map(renderRecipient).join('');
  while (frag.firstChild) container.appendChild(frag.firstChild);
  attachCardListeners();

  const remaining = filtered.length - visibleCount;
  const loadWrap  = document.getElementById('load-more-wrap');
  const loadCount = document.getElementById('load-more-count');
  if (remaining > 0) {
    loadCount.textContent = `(ще ${Math.min(remaining, PAGE_SIZE)} з ${remaining})`;
  } else {
    loadWrap.hidden = true;
  }
}

/* ════════════════════════════════════════════════
   Card event delegation
   ════════════════════════════════════════════════ */
function attachCardListeners() {
  // Use a single delegated listener on the container
  // (re-attach only replaces the handler via named function trick)
  const list = document.getElementById('recipients-list');
  list.onclick = e => {
    const expandBtn = e.target.closest('.btn-expand');
    if (expandBtn) {
      const rid  = expandBtn.dataset.rid;
      const gens = document.getElementById(`gens-${rid}`);
      const icon = expandBtn.querySelector('.icon--chevron');
      const open = !gens.hidden;
      gens.hidden = open;
      expandBtn.setAttribute('aria-expanded', String(!open));
      icon.style.transform = open ? '' : 'rotate(180deg)';
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      const rid = deleteBtn.dataset.rid;
      const r   = getRecipientById(rid);
      if (!r) return;
      if (!confirm(`Видалити отримувача «${r.name}» та всі його генерації?`)) return;
      deleteRecipient(rid);
      visibleCount = Math.max(PAGE_SIZE, visibleCount - 1);
      renderList();
      return;
    }

    const genBtn = e.target.closest('.gen-ts');
    if (genBtn) {
      const { rid, gid } = genBtn.dataset;
      window.location.href = `index.html?rid=${encodeURIComponent(rid)}&gid=${encodeURIComponent(gid)}`;
    }
  };
}

/* ════════════════════════════════════════════════
   Search
   ════════════════════════════════════════════════ */
let searchTimer = null;

function initSearch() {
  document.getElementById('r-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery  = e.target.value.trim();
      visibleCount = PAGE_SIZE; // reset pagination on new search
      renderList();
    }, 200);
  });
}

/* ════════════════════════════════════════════════
   Sort
   ════════════════════════════════════════════════ */
function initSort() {
  document.getElementById('sort-date').addEventListener('click', () => {
    currentSort  = 'date';
    visibleCount = PAGE_SIZE;
    document.getElementById('sort-date').classList.add('sort-btn--active');
    document.getElementById('sort-count').classList.remove('sort-btn--active');
    renderList();
  });
  document.getElementById('sort-count').addEventListener('click', () => {
    currentSort  = 'count';
    visibleCount = PAGE_SIZE;
    document.getElementById('sort-count').classList.add('sort-btn--active');
    document.getElementById('sort-date').classList.remove('sort-btn--active');
    renderList();
  });
}

/* ════════════════════════════════════════════════
   Export ZIP JSON
   ════════════════════════════════════════════════ */
async function buildZip(jsonStr, suffix = '') {
  /* global JSZip */
  const zip = new JSZip();
  zip.file('recipients.json', jsonStr);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const a = document.createElement('a');
  a.download = `nbu-qr-recipients${suffix}-${new Date().toISOString().slice(0, 10)}.zip`;
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportZip()           { await buildZip(exportJSON()); }
async function exportZipNoContacts() { await buildZip(exportJSONNoContacts(), '-no-contacts'); }

/* ════════════════════════════════════════════════
   Import ZIP or JSON
   ════════════════════════════════════════════════ */
async function importFile(file) {
  try {
    let jsonStr;
    if (file.name.endsWith('.zip')) {
      /* global JSZip */
      const zip      = await JSZip.loadAsync(file);
      const jsonFile = Object.values(zip.files).find(f => f.name.endsWith('.json'));
      if (!jsonFile) throw new Error('У ZIP немає JSON-файлу');
      jsonStr = await jsonFile.async('string');
    } else {
      jsonStr = await file.text();
    }
    importJSON(jsonStr);
    visibleCount = PAGE_SIZE;
    renderList();
    alert('Імпорт завершено');
  } catch (err) {
    alert(`Помилка імпорту: ${err.message}`);
  }
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
  overlay.addEventListener('click', close);
}

/* ════════════════════════════════════════════════
   Init
   ════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initSort();
  initSearch();
  renderList();

  document.getElementById('btn-load-more').addEventListener('click', loadMore);
  document.getElementById('btn-export').addEventListener('click', exportZip);
  document.getElementById('btn-export-nocontacts').addEventListener('click', exportZipNoContacts);

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-input').click();
  });
  document.getElementById('import-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importFile(file);
    e.target.value = '';
  });
});

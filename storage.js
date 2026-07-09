'use strict';

/* ════════════════════════════════════════════════
   Storage — shared data layer
   ════════════════════════════════════════════════ */

const LS_RECIPIENTS = 'nbu_qr_recipients';
const LS_BANNER     = 'nbu_qr_banner_dismissed';
const MAX_RECIPIENTS = 1000;
const MAX_RECENTS    = 10;

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadRecipients() {
  try { return JSON.parse(localStorage.getItem(LS_RECIPIENTS)) || []; }
  catch { return []; }
}

function saveRecipients(list) {
  try { localStorage.setItem(LS_RECIPIENTS, JSON.stringify(list)); }
  catch { alert('Сховище переповнено — видаліть зайві записи'); }
}

/* Count unique calendar days that had at least one generation */
function uniqueDayCount(generations) {
  if (!generations || !generations.length) return 0;
  const days = new Set(generations.map(g => new Date(g.timestamp).toDateString()));
  return days.size;
}

/* Upsert a generation for a given IBAN. Returns { recipient, generation } or null if limit hit. */
function upsertGeneration(data) {
  const { name, iban, edrpou, purpose, currency, amount, amountField, link, email, phone, tg, tplId } = data;
  const list = loadRecipients();

  let recipient = list.find(r => r.iban === iban);

  if (!recipient) {
    if (list.length >= MAX_RECIPIENTS) {
      alert(`Досягнуто ліміт ${MAX_RECIPIENTS} отримувачів`);
      return null;
    }
    recipient = {
      id:         genId(),
      name, iban, edrpou,
      email:      email  || '',
      phone:      phone  || '',
      tg:         tg     || '',
      createdAt:  Date.now(),
      generations: [],
    };
    list.push(recipient);
  } else {
    recipient.name   = name;
    recipient.edrpou = edrpou;
    // Only overwrite contacts with non-empty values — otherwise generating
    // a QR without opening the optional panel silently wipes saved contacts.
    if (email) recipient.email = email;
    if (phone) recipient.phone = phone;
    if (tg)    recipient.tg    = tg;
  }

  const gen = { id: genId(), purpose, currency, amount, amountField, link, timestamp: Date.now() };
  if (tplId) gen.tplId = tplId;
  recipient.generations.push(gen);
  recipient.lastUsed = gen.timestamp;
  recipient.count    = uniqueDayCount(recipient.generations);

  saveRecipients(list);
  return { recipient, generation: gen };
}

function deleteRecipient(id) {
  saveRecipients(loadRecipients().filter(r => r.id !== id));
}

function getRecipientById(id) {
  return loadRecipients().find(r => r.id === id) || null;
}

/* Top N by most recently used */
function getTopRecents(n = MAX_RECENTS) {
  return loadRecipients()
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, n);
}

/* Export / Import */
function exportJSON() {
  return JSON.stringify(loadRecipients(), null, 2);
}

function exportJSONNoContacts() {
  const stripped = loadRecipients().map(r => {
    const { email, phone, tg, ...rest } = r; // eslint-disable-line no-unused-vars
    return rest;
  });
  return JSON.stringify(stripped, null, 2);
}

function importJSON(jsonStr) {
  const incoming = JSON.parse(jsonStr);
  if (!Array.isArray(incoming)) throw new Error('Очікується масив JSON');

  const list = loadRecipients();

  for (const r of incoming) {
    if (!r.iban || !r.name) continue;
    const idx = list.findIndex(e => e.iban === r.iban);
    if (idx === -1) {
      if (list.length < MAX_RECIPIENTS) {
        const rec = { ...r, id: r.id || genId(), generations: r.generations || [] };
        rec.count = uniqueDayCount(rec.generations);
        list.push(rec);
      }
    } else {
      // Merge generations (skip duplicates by id)
      if (!Array.isArray(list[idx].generations)) list[idx].generations = [];
      const existingIds = new Set(list[idx].generations.map(g => g.id));
      (r.generations || []).forEach(g => {
        if (!existingIds.has(g.id)) list[idx].generations.push(g);
      });
      list[idx].lastUsed = Math.max(list[idx].lastUsed || 0, r.lastUsed || 0);
      list[idx].count    = uniqueDayCount(list[idx].generations);
    }
  }

  saveRecipients(list);
}

/* ════════════════════════════════════════════════
   Purpose templates  (Шаблони призначення платежу)
   ════════════════════════════════════════════════ */
const LS_TEMPLATES  = 'nbu_qr_purpose_templates';
const MAX_TEMPLATES = 100;

function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(LS_TEMPLATES)) || []; }
  catch { return []; }
}

function saveTemplates(list) {
  try { localStorage.setItem(LS_TEMPLATES, JSON.stringify(list)); }
  catch { alert('Сховище переповнено — видаліть зайві шаблони'); }
}

/* Returns created/existing template, or null if limit hit */
function addTemplate(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const list = loadTemplates();

  const existing = list.find(x => x.text === t);
  if (existing) return existing;

  if (list.length >= MAX_TEMPLATES) {
    alert(`Досягнуто ліміт ${MAX_TEMPLATES} шаблонів`);
    return null;
  }
  const tpl = { id: genId(), text: t, count: 0, lastUsed: 0, createdAt: Date.now() };
  list.push(tpl);
  saveTemplates(list);
  return tpl;
}

function updateTemplate(id, text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const list = loadTemplates();
  const tpl  = list.find(x => x.id === id);
  if (!tpl) return false;
  tpl.text = t;
  saveTemplates(list);
  return true;
}

function deleteTemplate(id) {
  saveTemplates(loadTemplates().filter(x => x.id !== id));
}

/* Called on each QR generation: if the purpose matches a saved
   template, bump its usage stats (drives the top-5 ordering). */
function bumpTemplateUsage(purposeText) {
  const t = String(purposeText || '').trim();
  if (!t) return;
  const list = loadTemplates();
  const tpl  = list.find(x => x.text === t);
  if (!tpl) return;
  tpl.count    = (tpl.count || 0) + 1;
  tpl.lastUsed = Date.now();
  saveTemplates(list);
}

/* "Raw" fallback: most frequent purposes from generation history */
function getTopPurposesFromHistory(n = 5) {
  const freq = new Map();
  for (const r of loadRecipients()) {
    for (const g of (r.generations || [])) {
      const p = String(g.purpose || '').trim();
      if (!p) continue;
      const cur = freq.get(p) || { text: p, count: 0, lastUsed: 0 };
      cur.count++;
      cur.lastUsed = Math.max(cur.lastUsed, g.timestamp || 0);
      freq.set(p, cur);
    }
  }
  return [...freq.values()]
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
    .slice(0, n);
}

/* Top N templates for the generator page.
   No saved templates → raw purposes from history (marked raw: true). */
function getTopTemplates(n = 5) {
  const tpl = loadTemplates();
  if (tpl.length) {
    return [...tpl]
      .sort((a, b) => (b.count || 0) - (a.count || 0) || (b.lastUsed || 0) - (a.lastUsed || 0))
      .slice(0, n)
      .map(t => ({ ...t, raw: false }));
  }
  return getTopPurposesFromHistory(n).map(t => ({ ...t, raw: true }));
}

/* ════════════════════════════════════════════════
   Recipient ↔ template links & search
   (a generation stores tplId when its purpose
   matched a saved template at generation time)
   ════════════════════════════════════════════════ */
function findTemplateByText(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  return loadTemplates().find(x => x.text === t) || null;
}

/* Templates this recipient's QRs were generated from, most used first */
function getTemplatesForRecipient(rid) {
  const r = getRecipientById(rid);
  if (!r) return [];
  const byId = new Map(loadTemplates().map(t => [t.id, t]));
  const agg  = new Map();
  for (const g of (r.generations || [])) {
    if (!g.tplId || !byId.has(g.tplId)) continue;
    const cur = agg.get(g.tplId) || { template: byId.get(g.tplId), count: 0, lastUsed: 0 };
    cur.count++;
    cur.lastUsed = Math.max(cur.lastUsed, g.timestamp || 0);
    agg.set(g.tplId, cur);
  }
  return [...agg.values()].sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
}

/* Recipients that have at least one generation linked to this template */
function getRecipientsForTemplate(tplId) {
  const out = [];
  for (const r of loadRecipients()) {
    const n = (r.generations || []).filter(g => g.tplId === tplId).length;
    if (n) out.push({ id: r.id, name: r.name, iban: r.iban, count: n });
  }
  return out.sort((a, b) => b.count - a.count);
}

/* ── Search ── */
function searchRecipients(q, limit = 8) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  return loadRecipients()
    .filter(r => [r.name, r.iban, r.edrpou, r.email, r.phone, r.tg]
      .some(f => f && String(f).toLowerCase().includes(s)))
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, limit);
}

/* Searches saved templates; when none are saved at all,
   falls back to raw purposes from generation history. */
function searchTemplates(q, limit = 8) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  const tpl = loadTemplates();
  if (tpl.length) {
    return tpl
      .filter(t => t.text.toLowerCase().includes(s))
      .sort((a, b) => (b.count || 0) - (a.count || 0) || (b.lastUsed || 0) - (a.lastUsed || 0))
      .slice(0, limit)
      .map(t => ({ ...t, raw: false }));
  }
  return getTopPurposesFromHistory(100)
    .filter(p => p.text.toLowerCase().includes(s))
    .slice(0, limit)
    .map(p => ({ ...p, raw: true }));
}

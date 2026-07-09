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
  const { name, iban, edrpou, purpose, currency, amount, amountField, link, email, phone, tg } = data;
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
    if (email  !== undefined) recipient.email  = email  || '';
    if (phone  !== undefined) recipient.phone  = phone  || '';
    if (tg     !== undefined) recipient.tg     = tg     || '';
  }

  const gen = { id: genId(), purpose, currency, amount, amountField, link, timestamp: Date.now() };
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
        list.push({ ...r, id: r.id || genId() });
      }
    } else {
      // Merge generations (skip duplicates by id)
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

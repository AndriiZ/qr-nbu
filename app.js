'use strict';

/* WIN1251 encoder and toBase64URL defined in validate.js (loaded first) */

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ════════════════════════════════════════════════
   Privacy banner
   ════════════════════════════════════════════════ */
/* LS_BANNER defined in storage.js */

function initBanner() {
  try {
    if (localStorage.getItem(LS_BANNER) === '1')
      document.getElementById('privacy-banner').classList.add('hidden');
  } catch { /* ok */ }

  document.getElementById('banner-close-btn').addEventListener('click', () => {
    document.getElementById('privacy-banner').classList.add('hidden');
    try { localStorage.setItem(LS_BANNER, '1'); } catch { /* ok */ }
  });
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
   Selected recipient (drives related-templates chips)
   ════════════════════════════════════════════════ */
let currentRecipientId = null;

function setCurrentRecipient(id) {
  currentRecipientId = id || null;
  renderTemplateChips();
}

/* ════════════════════════════════════════════════
   Recents chips  (uses storage.js: getTopRecents)
   ════════════════════════════════════════════════ */
function renderRecents() {
  const top   = getTopRecents(); // from storage.js
  const wrap  = document.getElementById('recents-wrap');
  const chips = document.getElementById('recents-chips');
  if (!top.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  chips.innerHTML = '';
  top.forEach(r => {
    const shortIban = r.iban.slice(0, 4) + '…' + r.iban.slice(-4);
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.title = `${r.name}\n${r.iban}`;
    chip.innerHTML =
      `<span class="chip-name">${esc(r.name)}</span>` +
      `<span class="chip-iban">${esc(shortIban)}</span>` +
      `<span class="chip-count">${r.count || 0}</span>`;
    chip.addEventListener('click', () => fillFromRecipient(r));
    chips.appendChild(chip);
  });
}

/* ════════════════════════════════════════════════
   Purpose template chips  (uses storage.js: getTopTemplates)
   Top-5 saved templates; falls back to raw purposes
   from generation history when none are saved.
   ════════════════════════════════════════════════ */
function renderTemplateChips() {
  const wrap  = document.getElementById('tpl-wrap');
  const chips = document.getElementById('tpl-chips');
  const label = document.getElementById('tpl-label');

  // Templates linked to the selected recipient take priority
  let top = [];
  let labelText = '';
  const related = currentRecipientId ? getTemplatesForRecipient(currentRecipientId) : [];
  if (related.length) {
    top = related.slice(0, 5).map(x => ({ ...x.template, count: x.count, raw: false }));
    labelText = 'Шаблони цього отримувача';
  } else {
    top = getTopTemplates(5); // from storage.js
    labelText = top.length && top[0].raw ? 'Нещодавні призначення' : 'Шаблони призначення';
  }

  const hasAnySearchable = loadTemplates().length > 0 || top.length > 0;
  if (!hasAnySearchable) { wrap.style.display = 'none'; return; }

  label.textContent = labelText;
  wrap.style.display = 'block';
  chips.innerHTML = '';

  top.forEach(t => {
    const chip = document.createElement('button');
    chip.type      = 'button';
    chip.className = 'chip';
    chip.title     = t.text;
    const name = document.createElement('span');
    name.className   = 'chip-name';
    name.style.maxWidth = '180px';
    name.textContent = t.text;
    chip.appendChild(name);
    if (t.count > 0) {
      const cnt = document.createElement('span');
      cnt.className   = 'chip-count';
      cnt.textContent = t.count;
      chip.appendChild(cnt);
    }
    chip.addEventListener('click', () => {
      const ta = document.getElementById('f-purpose');
      ta.value = t.text;
      ta.classList.remove('field-error');
      ta.focus();
    });
    chips.appendChild(chip);
  });
}

function fillFromRecipient(r) {
  setCurrentRecipient(r.id);
  document.getElementById('f-name').value    = r.name    || '';
  document.getElementById('f-iban').value    = r.iban    || '';
  document.getElementById('f-edrpou').value  = r.edrpou  || '';
  document.getElementById('f-purpose').value = '';
  document.getElementById('f-currency').value = 'UAH';
  document.getElementById('f-amount').value  = '';
  document.getElementById('f-email').value   = r.email   || '';
  document.getElementById('f-phone').value   = r.phone   || '';
  document.getElementById('f-tg').value      = r.tg      || '';

  if (r.email || r.phone || r.tg) openOptional();

  const ibanRes = validateIBAN(r.iban || '');
  setFieldState('f-iban', 'status-iban', 'msg-iban', ibanRes.ok ? 'ok' : 'clear', ibanRes.ok ? ibanRes.msg : '');
  const codeRes = validateCode(r.edrpou || '');
  setFieldState('f-edrpou', 'status-edrpou', 'msg-edrpou', codeRes.ok ? 'ok' : 'clear', codeRes.ok ? codeRes.msg : '');

  document.getElementById('f-purpose').focus();
}

/* ════════════════════════════════════════════════
   Optional contact fields toggle
   ════════════════════════════════════════════════ */
function openOptional() {
  document.getElementById('optional-fields').classList.add('open');
  document.getElementById('btn-toggle-optional').classList.add('open');
}

function initOptionalToggle() {
  document.getElementById('btn-toggle-optional').addEventListener('click', function () {
    const panel = document.getElementById('optional-fields');
    const isOpen = panel.classList.toggle('open');
    this.classList.toggle('open', isOpen);
  });
}

/* ════════════════════════════════════════════════
   Validation  (uses validate.js functions)
   ════════════════════════════════════════════════ */
function getFormData() {
  const name    = document.getElementById('f-name').value.trim();
  const ibanRaw = document.getElementById('f-iban').value.trim();
  const codeRaw = document.getElementById('f-edrpou').value.trim();
  const purpose = document.getElementById('f-purpose').value.trim();

  let hasErrors = false;

  if (!name) {
    document.getElementById('f-name').classList.add('field-error');
    hasErrors = true;
  } else {
    document.getElementById('f-name').classList.remove('field-error');
  }

  const ibanResult = validateIBAN(ibanRaw);
  setFieldState('f-iban', 'status-iban', 'msg-iban', ibanResult.ok ? 'ok' : 'error', ibanResult.msg);
  if (!ibanResult.ok) hasErrors = true;

  const codeResult = validateCode(codeRaw);
  setFieldState('f-edrpou', 'status-edrpou', 'msg-edrpou', codeResult.ok ? 'ok' : 'error', codeResult.msg);
  if (!codeResult.ok) hasErrors = true;

  if (!purpose) {
    document.getElementById('f-purpose').classList.add('field-error');
    hasErrors = true;
  } else {
    document.getElementById('f-purpose').classList.remove('field-error');
  }

  if (hasErrors) {
    if (!name) document.getElementById('f-name').focus();
    else if (!ibanResult.ok) document.getElementById('f-iban').focus();
    else if (!codeResult.ok) document.getElementById('f-edrpou').focus();
    else document.getElementById('f-purpose').focus();
    return null;
  }

  const iban      = ibanRaw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const currency  = document.getElementById('f-currency').value;
  const amount    = parseFloat(document.getElementById('f-amount').value) || 0;
  const amountField = amount > 0
    ? currency + amount.toFixed(2).replace(/\.00$/, '')
    : '';
  const email = document.getElementById('f-email').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const tg    = document.getElementById('f-tg').value.trim();

  return { name, iban, edrpou: codeRaw, purpose, currency, amount, amountField, email, phone, tg };
}

/* ════════════════════════════════════════════════
   NBU payload builder
   ════════════════════════════════════════════════ */
function buildPayload(d) {
  return ['BCD','002','2','UCT','', d.name, d.iban, d.amountField, d.edrpou,'','', d.purpose,''].join('\r\n');
}

/* ════════════════════════════════════════════════
   ₴ logo overlay
   ════════════════════════════════════════════════ */
function overlayHryvnia(container) {
  const canvas = container.querySelector('canvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  const size   = canvas.width;
  const radius = Math.round(size * 0.11);
  const cx     = Math.round(size / 2);
  const cy     = Math.round(size / 2);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.18)';
  ctx.shadowBlur  = radius * 0.4;
  ctx.fillStyle   = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#007B6E';
  ctx.font         = `bold ${Math.round(radius * 1.35)}px Arial, sans-serif`;
  ctx.fillText('₴', cx, cy + Math.round(radius * 0.05));
  ctx.restore();
}

/* ════════════════════════════════════════════════
   State
   ════════════════════════════════════════════════ */
let currentLink = '';
let currentData = null;

/* ════════════════════════════════════════════════
   Render QR from a link (used by URL param restore)
   ════════════════════════════════════════════════ */
/* qrcode-generator (kazuhikoarase) — reference QR implementation,
   auto-selects version 1–40, no "code length overflow" bug of the
   abandoned qrcodejs. Primary CDN + fallback. */
const QR_LIB_URLS = [
  'vendor/qrcode.min.js', // local copy — works fully offline if present
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
];
let qrLibPromise = null;

function qrLibReady() { return typeof qrcode === 'function'; }

function loadScript(src) {
  return new Promise(resolve => {
    const sc = document.createElement('script');
    sc.src = src;
    sc.onload  = () => resolve(qrLibReady());
    sc.onerror = () => resolve(false);
    document.head.appendChild(sc);
    setTimeout(() => resolve(qrLibReady()), 8000);
  });
}

/* The <script defer> in <head> may have failed (offline, blocked CDN,
   flaky network on file://). Re-inject on demand; failed attempts
   are not cached, so "Спробувати ще раз" really retries. */
function ensureQRLib() {
  if (qrLibReady()) return Promise.resolve(true);
  if (!qrLibPromise) {
    qrLibPromise = (async () => {
      for (const url of QR_LIB_URLS) {
        await loadScript(url);
        if (qrLibReady()) return true;
      }
      return false;
    })().then(ok => {
      if (!ok) qrLibPromise = null; // allow a fresh retry
      return ok;
    });
  }
  return qrLibPromise;
}

/* Draw the QR model onto a crisp 2x canvas (better PNG for print) */
function drawQRCanvas(qr, displaySize) {
  const scale  = 2;
  const size   = displaySize * scale;
  const margin = 8 * scale;                 // quiet zone
  const count  = qr.getModuleCount();
  const cell   = (size - margin * 2) / count;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.style.width = canvas.style.height = displaySize + 'px';

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#002B26';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(
          Math.floor(margin + c * cell),
          Math.floor(margin + r * cell),
          Math.ceil(cell),
          Math.ceil(cell)
        );
      }
    }
  }
  return canvas;
}

function showQRError(container, link, data, msg) {
  container.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'qr-error';
  box.innerHTML = `<i class="ti ti-alert-triangle icon" aria-hidden="true"></i><p>${esc(msg)}</p>`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-copy';
  btn.innerHTML = '<i class="ti ti-refresh icon" aria-hidden="true"></i>&nbsp;Спробувати ще раз';
  btn.addEventListener('click', () => renderQR(link, data));
  box.appendChild(btn);
  container.appendChild(box);
}

async function renderQR(link, data) {
  currentLink = link;
  currentData = data;

  document.getElementById('dl-text').textContent = link;
  document.getElementById('result-placeholder').style.display = 'none';
  document.getElementById('result-content').style.display     = 'block';

  const container = document.getElementById('qr-container');
  container.innerHTML = '<div class="qr-loading">Генерація QR…</div>';

  const libOk = await ensureQRLib();
  if (!libOk) {
    showQRError(container, link, data,
      'Не вдалося завантажити бібліотеку QR-кодів (CDN недоступний). ' +
      'Дані отримувача вже збережено — перевірте інтернет і повторіть.');
    setEmailButton(data, link);
    return;
  }

  container.innerHTML = '';
  const withLogo = !data.amountField || data.currency === 'UAH';
  try {
    /* global qrcode */
    const qr = qrcode(0, withLogo ? 'Q' : 'M'); // 0 = auto version (1–40)
    qr.addData(link);
    qr.make();
    container.appendChild(drawQRCanvas(qr, 230));
  } catch (err) {
    showQRError(container, link, data,
      'Не вдалося побудувати QR-код: ' + (err && err.message ? err.message : err) +
      '. Спробуйте скоротити призначення платежу.');
    setEmailButton(data, link);
    return;
  }

  if (withLogo) {
    requestAnimationFrame(() => overlayHryvnia(container));
  }

  setEmailButton(data, link);
}

function setEmailButton(data, link) {
  const emailBtn = document.getElementById('btn-email');
  const email = data.email || '';
  if (email) {
    const subject = encodeURIComponent('Реквізити для оплати — ' + data.name);
    const body = encodeURIComponent(buildPlainText(data, link));
    emailBtn.href = `mailto:${email}?subject=${subject}&body=${body}`;
    emailBtn.hidden = false;
  } else {
    emailBtn.hidden = true;
  }
}

/* ════════════════════════════════════════════════
   Generate
   ════════════════════════════════════════════════ */
function generate() {
  const data = getFormData();
  if (!data) return;

  const raw  = buildPayload(data);
  document.getElementById('raw-text').textContent = raw;

  const link = 'https://bank.gov.ua/qr/' + toBase64URL(encodeWin1251(raw));

  // Save FIRST — persistence must never depend on QR rendering,
  // which can fail locally when the CDN library didn't load.
  const tpl    = findTemplateByText(data.purpose); // link generation ↔ template
  const result = upsertGeneration({ ...data, link, tplId: tpl ? tpl.id : undefined });
  bumpTemplateUsage(data.purpose);
  renderRecents();
  setCurrentRecipient(result && result.recipient ? result.recipient.id : null);

  renderQR(link, data);
}

/* ════════════════════════════════════════════════
   Copy deeplink
   ════════════════════════════════════════════════ */
function copyLink() {
  if (!currentLink) return;
  navigator.clipboard.writeText(currentLink)
    .then(() => {
      const btn  = document.getElementById('btn-copy');
      const span = document.getElementById('btn-copy-text');
      btn.classList.add('copied');
      span.textContent = 'Скопійовано!';
      document.getElementById('btn-copy-icon').className = 'ti ti-check icon';
      setTimeout(() => {
        btn.classList.remove('copied');
        span.textContent = 'Копіювати посилання';
        document.getElementById('btn-copy-icon').className = 'ti ti-copy icon';
      }, 2200);
    })
    .catch(() => prompt('Скопіюйте посилання вручну:', currentLink));
}

/* ════════════════════════════════════════════════
   Copy HTML for email  (rich text/html + text/plain fallback)
   ════════════════════════════════════════════════ */
function buildPlainText(d, link) {
  return 'Отримувач: ' + d.name + '\n' +
    'ЄДРПОУ / ІПН: ' + d.edrpou + '\n' +
    'IBAN: ' + d.iban + '\n' +
    (d.amountField ? 'Сума: ' + d.amountField + '\n' : '') +
    'Призначення: ' + d.purpose + '\n\n' +
    'Посилання для оплати:\n' + link;
}

/* Email-client-safe fragment: single table, inline styles only,
   QR image wrapped in a link so it is tappable on mobile. */
function buildEmailHTML(d, link, qrDataUrl) {
  const cellLbl = 'padding:6px 8px 6px 0;font-size:12px;color:#9AABA7;vertical-align:top;white-space:nowrap';
  const cellVal = 'padding:6px 0;font-size:13px;color:#1A2826;word-break:break-all';
  const amountRow = d.amount > 0
    ? `<tr><td style="${cellLbl}">Сума</td><td style="${cellVal};color:#007B6E;font-size:16px;font-weight:bold">${esc(d.currency)}&nbsp;${d.amount.toFixed(2)}</td></tr>`
    : '';

  return `<table cellpadding="0" cellspacing="0" border="0" style="max-width:460px;width:100%;font-family:Arial,Helvetica,sans-serif;background:#FFFFFF;border:1px solid #D4E5E2;border-radius:12px">
<tr><td style="padding:24px;text-align:center">
  <div style="font-size:16px;font-weight:bold;color:#111111;margin-bottom:2px">${esc(d.name)}</div>
  <div style="font-size:12px;color:#999999;margin-bottom:16px">ЄДРПОУ / ІПН: ${esc(d.edrpou)}</div>
  <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:10px;border:1px solid #D4E5E2;border-radius:10px;text-decoration:none">
    <img src="${qrDataUrl}" width="180" height="180" alt="QR-код для оплати — натисніть, щоб оплатити" style="display:block;border:0">
  </a>
  <div style="font-size:11px;color:#6A8A87;margin:8px 0 16px">Відскануйте QR або натисніть на нього на телефоні</div>
  <table cellpadding="0" cellspacing="0" border="0" style="width:100%;text-align:left">
    <tr><td style="${cellLbl}">Рахунок</td><td style="${cellVal};font-family:monospace;font-size:12px">${esc(d.iban)}</td></tr>
    ${amountRow}
    <tr><td style="${cellLbl}">Призначення</td><td style="${cellVal}">${esc(d.purpose)}</td></tr>
  </table>
  <a href="${esc(link)}" target="_blank" style="display:block;margin-top:16px;padding:12px;background:#007B6E;color:#FFFFFF;border-radius:8px;font-size:14px;font-weight:bold;text-decoration:none;text-align:center">Оплатити</a>
</td></tr>
</table>`;
}

/* Legacy fallback: hidden contenteditable + execCommand('copy')
   copies rich HTML even without the async Clipboard API (e.g. file://). */
function execCopyHTML(html) {
  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  div.innerHTML = html;
  document.body.appendChild(div);
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  sel.removeAllRanges();
  div.remove();
  return ok;
}

function copyHtmlFeedback(ok) {
  const btn  = document.getElementById('btn-copy-html');
  const span = document.getElementById('btn-copy-html-text');
  const icon = document.getElementById('btn-copy-html-icon');
  btn.classList.add('copied');
  span.textContent = ok ? 'Скопійовано! Вставте в лист' : 'Скопійовано як текст';
  icon.className = 'ti ti-check icon';
  setTimeout(() => {
    btn.classList.remove('copied');
    span.textContent = 'Копіювати HTML для листа';
    icon.className = 'ti ti-mail-share icon';
  }, 2200);
}

async function copyHTMLEmail() {
  if (!currentLink || !currentData) return;
  const canvas = document.querySelector('#qr-container canvas');
  if (!canvas) { alert('Спочатку згенеруйте QR-код'); return; }

  const html = buildEmailHTML(currentData, currentLink, canvas.toDataURL('image/png'));
  const text = buildPlainText(currentData, currentLink);

  // 1) Async Clipboard API — rich HTML + plain-text fallback in one item
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html':  new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      copyHtmlFeedback(true);
      return;
    } catch { /* fall through */ }
  }

  // 2) execCommand copies rich HTML in older/insecure contexts
  if (execCopyHTML(html)) { copyHtmlFeedback(true); return; }

  // 3) Last resort — plain text only
  try {
    await navigator.clipboard.writeText(text);
    copyHtmlFeedback(false);
  } catch {
    prompt('Скопіюйте вручну:', text);
  }
}

/* ════════════════════════════════════════════════
   Download QR PNG
   ════════════════════════════════════════════════ */
function downloadQR() {
  const canvas = document.querySelector('#qr-container canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.download = 'payment-qr.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

/* ════════════════════════════════════════════════
   Download static HTML page
   ════════════════════════════════════════════════ */
function downloadPage() {
  if (!currentLink || !currentData) return;
  const canvas = document.querySelector('#qr-container canvas');
  if (!canvas) { alert('Спочатку згенеруйте QR-код'); return; }

  const d         = currentData;
  const qrDataUrl = canvas.toDataURL('image/png');
  const amountRow = d.amount > 0
    ? `<tr><td class="lbl">Сума</td><td class="val amount">${esc(d.currency)}&nbsp;${d.amount.toFixed(2)}</td></tr>`
    : '';

  const shortLink = currentLink.length > 72 ? currentLink.slice(0, 72) + '…' : currentLink;

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Оплата — ${esc(d.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#EEF6F5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:18px;padding:36px 32px;max-width:460px;width:100%;box-shadow:0 4px 32px rgba(0,80,70,.12);text-align:center}
.stamp{display:inline-flex;align-items:center;gap:6px;background:#E6F4F2;color:#005F55;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:20px;letter-spacing:.4px}
h1{font-size:17px;font-weight:700;color:#111;margin-bottom:4px;line-height:1.35}
.code{font-size:12px;color:#999;margin-bottom:24px}
.qr-wrap{display:inline-block;padding:12px;background:#fff;border:1.5px solid #D4E5E2;border-radius:12px;margin-bottom:24px}
.qr-wrap img{display:block;border-radius:4px}
table{width:100%;border-collapse:collapse;margin-bottom:20px;text-align:left}
td{padding:7px 0;font-size:13px;vertical-align:top}
tr:not(:last-child) td{border-bottom:1px solid #EEF0ED}
.lbl{color:#9AABA7;width:34%;font-size:12px;padding-right:8px}
.val{color:#1A2826;font-weight:500;word-break:break-all}
.val.iban{font-family:monospace;font-size:11px;font-weight:400}
.val.amount{color:#007B6E;font-size:17px;font-weight:700}
.purpose{background:#F3FAF9;border-left:3px solid #7EC5BB;border-radius:0 8px 8px 0;padding:10px 14px;text-align:left;font-size:13px;color:#1A4A44;margin-bottom:22px;line-height:1.55}
.hint{font-size:13px;color:#6A8A87;margin-bottom:14px;line-height:1.5}
.btn{display:block;width:100%;padding:14px;background:#007B6E;color:#fff;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:10px}
.btn-sec{display:block;width:100%;padding:11px;background:#E6F4F2;color:#005F55;border:1.5px solid #B2D8D3;border-radius:10px;font-size:11px;font-weight:500;text-decoration:none;font-family:monospace;word-break:break-all;line-height:1.5}
.footer{margin-top:22px;font-size:10.5px;color:#ccc}
</style>
</head>
<body>
<div class="card">
  <div class="stamp">&#10003;&nbsp;Платіж на банківський рахунок</div>
  <h1>${esc(d.name)}</h1>
  <p class="code">ЄДРПОУ / ІПН: ${esc(d.edrpou)}</p>
  <div class="qr-wrap"><a href="${esc(currentLink)}"><img src="${qrDataUrl}" width="200" height="200" alt="QR-код для оплати — натисніть, щоб оплатити"></a></div>
  <table>
    <tr><td class="lbl">Рахунок</td><td class="val iban">${esc(d.iban)}</td></tr>
    ${amountRow}
  </table>
  <div class="purpose">${esc(d.purpose)}</div>
  <p class="hint">Відскануйте QR-код у мобільному застосунку вашого банку або натисніть кнопку нижче.</p>
  <a href="${esc(currentLink)}" class="btn">Оплатити</a>
  <a href="${esc(currentLink)}" class="btn-sec">${esc(shortLink)}</a>
  <p class="footer">Сформовано відповідно до стандарту НБУ · bank.gov.ua</p>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.download = `payment-${d.iban.slice(-8)}.html`;
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ════════════════════════════════════════════════
   Restore from URL params  (?rid=...&gid=...)
   Called when user clicks a generation in recipients page
   ════════════════════════════════════════════════ */
function restoreFromURL() {
  const params = new URLSearchParams(window.location.search);
  const rid = params.get('rid');
  const gid = params.get('gid');
  if (!rid || !gid) return;

  const recipient = getRecipientById(rid); // storage.js
  if (!recipient) return;

  const gen = recipient.generations.find(g => g.id === gid);
  if (!gen) return;

  setCurrentRecipient(recipient.id);

  // Fill form
  document.getElementById('f-name').value    = recipient.name    || '';
  document.getElementById('f-iban').value    = recipient.iban    || '';
  document.getElementById('f-edrpou').value  = recipient.edrpou  || '';
  document.getElementById('f-purpose').value = gen.purpose || '';
  document.getElementById('f-currency').value = gen.currency || 'UAH';
  document.getElementById('f-amount').value  = gen.amount > 0 ? gen.amount : '';
  document.getElementById('f-email').value   = recipient.email || '';
  document.getElementById('f-phone').value   = recipient.phone || '';
  document.getElementById('f-tg').value      = recipient.tg    || '';

  if (recipient.email || recipient.phone || recipient.tg) openOptional();

  const raw = buildPayload({
    name: recipient.name, iban: recipient.iban, edrpou: recipient.edrpou,
    purpose: gen.purpose, amountField: gen.amountField || '',
  });
  document.getElementById('raw-text').textContent = raw;

  // Render QR from stored link
  renderQR(gen.link, {
    name: recipient.name, iban: recipient.iban, edrpou: recipient.edrpou,
    purpose: gen.purpose, currency: gen.currency, amount: gen.amount,
    amountField: gen.amountField, email: recipient.email,
    phone: recipient.phone, tg: recipient.tg,
  });

  // Validate fields visually
  const ibanRes = validateIBAN(recipient.iban);
  setFieldState('f-iban', 'status-iban', 'msg-iban', ibanRes.ok ? 'ok' : 'clear', ibanRes.ok ? ibanRes.msg : '');
  const codeRes = validateCode(recipient.edrpou);
  setFieldState('f-edrpou', 'status-edrpou', 'msg-edrpou', codeRes.ok ? 'ok' : 'clear', codeRes.ok ? codeRes.msg : '');

  // Clean URL (replaceState with a URL throws SecurityError on file://)
  try { window.history.replaceState({}, '', 'index.html'); } catch { /* ok */ }

  // Scroll to result
  document.getElementById('result-content').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ════════════════════════════════════════════════
   Quick search dropdowns (recipient + template)
   ════════════════════════════════════════════════ */
function initQuickSearch({ inputId, dropId, search, renderItem, onPick }) {
  const input = document.getElementById(inputId);
  const drop  = document.getElementById(dropId);
  let timer   = null;

  const hide = () => { drop.hidden = true; drop.innerHTML = ''; };

  const show = q => {
    const results = search(q);
    drop.innerHTML = '';
    if (!results.length) {
      drop.innerHTML = '<div class="srch-empty">Нічого не знайдено</div>';
    } else {
      results.forEach(r => {
        const item = document.createElement('button');
        item.type      = 'button';
        item.className = 'srch-item';
        renderItem(item, r);
        item.addEventListener('click', () => {
          onPick(r);
          input.value = '';
          hide();
        });
        drop.appendChild(item);
      });
    }
    drop.hidden = false;
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { hide(); return; }
    timer = setTimeout(() => show(q), 150);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hide(); input.blur(); }
    if (e.key === 'ArrowDown' && !drop.hidden) {
      const first = drop.querySelector('.srch-item');
      if (first) { e.preventDefault(); first.focus(); }
    }
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !drop.contains(e.target)) hide();
  });
}

function shortIban(iban) {
  return iban ? iban.slice(0, 4) + ' ' + iban.slice(4, 8) + ' … ' + iban.slice(-4) : '';
}

function initRecipientQuickSearch() {
  initQuickSearch({
    inputId: 'r-quick-search',
    dropId:  'r-quick-drop',
    search:  q => searchRecipients(q, 8), // storage.js — searches ALL recipients
    renderItem: (el, r) => {
      el.innerHTML = `${esc(r.name)}<span class="srch-item-sub">${esc(shortIban(r.iban))}${r.edrpou ? ' · ' + esc(r.edrpou) : ''}</span>`;
    },
    onPick: r => fillFromRecipient(r), // also selects recipient → related templates
  });
}

function initTemplateQuickSearch() {
  initQuickSearch({
    inputId: 'tpl-quick-search',
    dropId:  'tpl-quick-drop',
    search:  q => searchTemplates(q, 8), // storage.js — falls back to raw history
    renderItem: (el, t) => {
      const badge = t.count ? `<span class="srch-item-sub">${t.count} використань${t.raw ? ' · з історії' : ''}</span>` : (t.raw ? '<span class="srch-item-sub">з історії</span>' : '');
      el.innerHTML = `${esc(t.text)}${badge}`;
    },
    onPick: t => {
      const ta = document.getElementById('f-purpose');
      ta.value = t.text;
      ta.classList.remove('field-error');
      ta.focus();
    },
  });
}

/* ════════════════════════════════════════════════
   Init
   ════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initBanner();
  initNav();
  initOptionalToggle();
  renderRecents();
  renderTemplateChips();
  initRecipientQuickSearch();
  initTemplateQuickSearch();
  restoreFromURL();

  document.getElementById('btn-generate').addEventListener('click', generate);
  document.getElementById('btn-copy').addEventListener('click', copyLink);
  document.getElementById('btn-copy-html').addEventListener('click', copyHTMLEmail);
  document.getElementById('btn-dl-png').addEventListener('click', downloadQR);
  document.getElementById('btn-dl-page').addEventListener('click', downloadPage);

  document.getElementById('f-iban').addEventListener('input', function () {
    setFieldState('f-iban', 'status-iban', 'msg-iban', 'clear', '');
    this.classList.remove('field-error');
    if (currentRecipientId) setCurrentRecipient(null); // manual edit → no longer "this recipient"
  });
});

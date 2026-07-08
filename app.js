'use strict';

/* ════════════════════════════════════════════════
   Win1251 encoder
   ════════════════════════════════════════════════ */
const WIN1251 = (() => {
  const map = {};

  // ASCII passthrough
  for (let i = 0; i < 128; i++) map[i] = i;

  // 0x80–0x9F
  const range80 = [
    0x0402, 0x0403, 0x201A, 0x0453, 0x201E, 0x2026, 0x2020, 0x2021,
    0x20AC, 0x2030, 0x0409, 0x2039, 0x040A, 0x040C, 0x040B, 0x040F,
    0x0452, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
    0,      0x2122, 0x0459, 0x203A, 0x045A, 0x045C, 0x045B, 0x045F,
  ];

  // 0xA0–0xBF
  const rangeA0 = [
    0x00A0, 0x040E, 0x045E, 0x0408, 0x00A4, 0x0490, 0x00A6, 0x00A7,
    0x0401, 0x00A9, 0x0404, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x0407,
    0x00B0, 0x00B1, 0x0406, 0x0456, 0x0491, 0x00B5, 0x00B6, 0x00B7,
    0x0451, 0x2116, 0x0454, 0x00BB, 0x0458, 0x0405, 0x0455, 0x0457,
  ];

  range80.forEach((cp, i) => { if (cp) map[cp] = 0x80 + i; });
  rangeA0.forEach((cp, i) => { if (cp) map[cp] = 0xA0 + i; });

  // 0xC0–0xFF: А–я
  for (let i = 0; i < 64; i++) map[0x0410 + i] = 0xC0 + i;

  return map;
})();

function encodeWin1251(str) {
  const bytes = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    bytes.push(cp < 128 ? cp : (WIN1251[cp] ?? 0x3F));
  }
  return bytes;
}

function toBase64URL(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/* ════════════════════════════════════════════════
   HTML escape
   ════════════════════════════════════════════════ */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ════════════════════════════════════════════════
   LocalStorage — history
   ════════════════════════════════════════════════ */
const LS_HISTORY = 'nbu_qr_history';
const LS_BANNER  = 'nbu_qr_banner_dismissed';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY)) || []; }
  catch { return []; }
}

function saveHistory(list) {
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(list)); }
  catch { /* storage full or unavailable */ }
}

function recordEntry(data) {
  const history = loadHistory();
  const existing = history.find(e => e.iban === data.iban);
  if (existing) {
    Object.assign(existing, data);
    existing.count    = (existing.count || 1) + 1;
    existing.lastUsed = Date.now();
  } else {
    history.push({ ...data, count: 1, lastUsed: Date.now() });
  }
  saveHistory(history);
  renderRecents();
}

function getTopRecents(n = 5) {
  return loadHistory()
    .sort((a, b) => (b.count - a.count) || (b.lastUsed - a.lastUsed))
    .slice(0, n);
}

/* ════════════════════════════════════════════════
   Render recent IBAN chips
   ════════════════════════════════════════════════ */
function renderRecents() {
  const top   = getTopRecents();
  const wrap  = document.getElementById('recents-wrap');
  const chips = document.getElementById('recents-chips');
  if (!top.length) { wrap.style.display = 'none'; return; }

  wrap.style.display = 'block';
  chips.innerHTML = '';

  top.forEach(entry => {
    const shortIban = entry.iban.slice(0, 8) + '…' + entry.iban.slice(-4);

    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.title = `${entry.name}\n${entry.iban}\nВикористань: ${entry.count}`;
    chip.innerHTML =
      `<span class="chip-name">${esc(entry.name)}</span>` +
      `<span class="chip-iban">${esc(shortIban)}</span>` +
      `<span class="chip-count">${entry.count}</span>`;
    chip.addEventListener('click', () => fillFromEntry(entry));
    chips.appendChild(chip);
  });
}

function fillFromEntry(entry) {
  document.getElementById('f-name').value     = entry.name     || '';
  document.getElementById('f-iban').value     = entry.iban     || '';
  document.getElementById('f-edrpou').value   = entry.edrpou   || '';
  document.getElementById('f-purpose').value  = entry.purpose  || '';
  document.getElementById('f-currency').value = entry.currency || 'UAH';
  document.getElementById('f-amount').value   = entry.amount > 0 ? entry.amount : '';

  // Re-validate filled fields so user sees green status immediately
  const ibanResult = validateIBAN(entry.iban || '');
  setFieldState('f-iban', 'status-iban', 'msg-iban', ibanResult.ok ? 'ok' : 'clear', ibanResult.ok ? ibanResult.msg : '');

  const codeResult = validateCode(entry.edrpou || '');
  setFieldState('f-edrpou', 'status-edrpou', 'msg-edrpou', codeResult.ok ? 'ok' : 'clear', codeResult.ok ? codeResult.msg : '');

  document.getElementById('f-name').focus();
}

/* ════════════════════════════════════════════════
   Privacy banner
   ════════════════════════════════════════════════ */
function initBanner() {
  try {
    if (localStorage.getItem(LS_BANNER) === '1') {
      document.getElementById('privacy-banner').classList.add('hidden');
    }
  } catch { /* unavailable */ }

  document.getElementById('banner-close-btn').addEventListener('click', () => {
    document.getElementById('privacy-banner').classList.add('hidden');
    try { localStorage.setItem(LS_BANNER, '1'); } catch { /* ok */ }
  });
}

/* ════════════════════════════════════════════════
   Form validation — uses validate.js functions
   ════════════════════════════════════════════════ */
function getFormData() {
  const name    = document.getElementById('f-name').value.trim();
  const ibanRaw = document.getElementById('f-iban').value.trim();
  const codeRaw = document.getElementById('f-edrpou').value.trim();
  const purpose = document.getElementById('f-purpose').value.trim();

  let hasErrors = false;

  if (!name) {
    document.getElementById('f-name').classList.add('field-error');
    document.getElementById('f-name').focus();
    hasErrors = true;
  } else {
    document.getElementById('f-name').classList.remove('field-error');
  }

  const ibanResult = validateIBAN(ibanRaw);
  setFieldState('f-iban', 'status-iban', 'msg-iban',
    ibanResult.ok ? 'ok' : 'error', ibanResult.msg);
  if (!ibanResult.ok) hasErrors = true;

  const codeResult = validateCode(codeRaw);
  setFieldState('f-edrpou', 'status-edrpou', 'msg-edrpou',
    codeResult.ok ? 'ok' : 'error', codeResult.msg);
  if (!codeResult.ok) hasErrors = true;

  if (!purpose) {
    document.getElementById('f-purpose').classList.add('field-error');
    hasErrors = true;
  } else {
    document.getElementById('f-purpose').classList.remove('field-error');
  }

  if (hasErrors) {
    // Focus first invalid field
    if (!name) document.getElementById('f-name').focus();
    else if (!ibanResult.ok) document.getElementById('f-iban').focus();
    else if (!codeResult.ok) document.getElementById('f-edrpou').focus();
    else document.getElementById('f-purpose').focus();
    return null;
  }

  const iban = ibanRaw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const currency = document.getElementById('f-currency').value;
  const amount   = parseFloat(document.getElementById('f-amount').value) || 0;
  const amountField = amount > 0
    ? currency + amount.toFixed(2).replace(/\.00$/, '')
    : '';

  return { name, iban, edrpou: codeRaw, purpose, currency, amount, amountField };
}

/* ════════════════════════════════════════════════
   NBU payload builder
   ════════════════════════════════════════════════ */
function buildPayload(d) {
  const sep  = '\r\n';
  const lines = ['BCD', '002', '2', 'UCT', '', d.name, d.iban, d.amountField, d.edrpou, '', '', d.purpose, ''];
  return lines.join(sep);
}

/* ════════════════════════════════════════════════
   State
   ════════════════════════════════════════════════ */
let currentLink = '';
let currentData = null;

/* ════════════════════════════════════════════════
   Generate
   ════════════════════════════════════════════════ */
function generate() {
  const data = getFormData();
  if (!data) return;
  currentData = data;

  const raw  = buildPayload(data);
  const link = 'https://bank.gov.ua/qr/' + toBase64URL(encodeWin1251(raw));
  currentLink = link;

  document.getElementById('raw-text').textContent = raw;
  document.getElementById('dl-text').textContent  = link;
  document.getElementById('result-placeholder').style.display = 'none';
  document.getElementById('result-content').style.display     = 'block';

  const container = document.getElementById('qr-container');
  container.innerHTML = '';
  /* global QRCode */
  new QRCode(container, {
    text:           link,
    width:          230,
    height:         230,
    colorDark:      '#002B26',
    colorLight:     '#FFFFFF',
    correctLevel:   QRCode.CorrectLevel.M,
  });

  recordEntry(data);
}

/* ════════════════════════════════════════════════
   Copy deeplink
   ════════════════════════════════════════════════ */
function copyLink() {
  if (!currentLink) return;

  const btn  = document.getElementById('btn-copy');
  const span = document.getElementById('btn-copy-text');

  navigator.clipboard.writeText(currentLink)
    .then(() => {
      btn.classList.add('copied');
      span.textContent = 'Скопійовано!';
      setTimeout(() => {
        btn.classList.remove('copied');
        span.textContent = 'Копіювати посилання';
      }, 2200);
    })
    .catch(() => {
      prompt('Скопіюйте посилання вручну:', currentLink);
    });
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
   Download static HTML page (self-contained)
   ════════════════════════════════════════════════ */
function downloadPage() {
  if (!currentLink || !currentData) return;

  const canvas = document.querySelector('#qr-container canvas');
  if (!canvas) { alert('Спочатку згенеруйте QR-код'); return; }

  const qrDataUrl = canvas.toDataURL('image/png');
  const d = currentData;

  const amountRow = d.amount > 0
    ? `<tr><td class="lbl">Сума</td><td class="val amount">${esc(d.currency)}&nbsp;${d.amount.toFixed(2)}</td></tr>`
    : '';

  const html = buildStaticPage({ d, qrDataUrl, amountRow });

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.download = `payment-${d.iban.slice(-8)}.html`;
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ════════════════════════════════════════════════
   Static page template (single self-contained file)
   ════════════════════════════════════════════════ */
function buildStaticPage({ d, qrDataUrl, amountRow }) {
  const shortLink = currentLink.length > 72
    ? currentLink.slice(0, 72) + '…'
    : currentLink;

  return `<!DOCTYPE html>
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
.btn:hover{background:#005F55}
.btn-sec{display:block;width:100%;padding:11px;background:#E6F4F2;color:#005F55;border:1.5px solid #B2D8D3;border-radius:10px;font-size:11px;font-weight:500;text-decoration:none;font-family:monospace;word-break:break-all;line-height:1.5}
.footer{margin-top:22px;font-size:10.5px;color:#ccc}
</style>
</head>
<body>
<div class="card">
  <div class="stamp">&#10003;&nbsp;НБУ · BCD 002 · Кредитний переказ</div>
  <h1>${esc(d.name)}</h1>
  <p class="code">ЄДРПОУ / ІПН: ${esc(d.edrpou)}</p>
  <div class="qr-wrap">
    <img src="${qrDataUrl}" width="200" height="200" alt="QR-код для оплати">
  </div>
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
}

/* ════════════════════════════════════════════════
   Event listeners
   ════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initBanner();
  renderRecents();

  document.getElementById('btn-generate').addEventListener('click', generate);
  document.getElementById('btn-copy').addEventListener('click', copyLink);
  document.getElementById('btn-dl-png').addEventListener('click', downloadQR);
  document.getElementById('btn-dl-page').addEventListener('click', downloadPage);

  // Live IBAN format cleanup
  document.getElementById('f-iban').addEventListener('input', function () {
    this.classList.remove('error');
    document.getElementById('err-iban').classList.remove('visible');
  });
});

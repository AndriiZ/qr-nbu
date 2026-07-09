'use strict';

/* ════════════════════════════════════════════════
   Test data generators
   Every value is validated with the same validate.js
   functions the main form uses, and rendered with a ✓/✕.
   ════════════════════════════════════════════════ */

/* МФО реальних банків — щоб IBAN виглядав правдоподібно */
const TEST_MFO = [
  '305299', // ПриватБанк
  '300465', // Ощадбанк
  '322001', // Універсал Банк (monobank)
  '380805', // Райффайзен Банк
  '351005', // УКРСИББАНК
  '334851', // ПУМБ
];

function randInt(n) { return Math.floor(Math.random() * n); }
function pick(arr)  { return arr[randInt(arr.length)]; }

function randDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += randInt(10);
  return s;
}

/* MOD-97 по частинах — без втрати точності на довгих числах */
function mod97(numStr) {
  let r = 0;
  for (const ch of numStr) r = (r * 10 + (ch.charCodeAt(0) - 48)) % 97;
  return r;
}

/* ── IBAN UA: UA + kk + МФО(6) + рахунок(19) ── */
function genIBAN() {
  const mfo  = pick(TEST_MFO);
  // Балансовий рахунок 2600/2620/2650 + 10 випадкових цифр, зліва доповнено нулями до 19
  const acct = (pick(['2600', '2620', '2650']) + randDigits(10)).padStart(19, '0');
  const body = mfo + acct;
  // 'UA00' → U=30, A=10 → '301000'; kk = 98 − mod97
  const kk = String(98 - mod97(body + '301000')).padStart(2, '0');
  return 'UA' + kk + body;
}

/* ── ЄДРПОУ: 7 цифр + контрольна (той самий алгоритм, що у validateEDRPOU) ── */
function genEDRPOU() {
  const d = randDigits(7).split('').map(Number);
  const inRange = [3, 4, 5, 6].includes(d[0]);

  let w = inRange ? [7, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7];
  let check = d.reduce((acc, v, i) => acc + v * w[i], 0) % 11;

  if (check >= 10) {
    w = inRange ? [9, 3, 4, 5, 6, 7, 8] : [3, 4, 5, 6, 7, 8, 9];
    check = d.reduce((acc, v, i) => acc + v * w[i], 0) % 11;
  }

  return d.join('') + (check % 10);
}

/* ── ІПН/РНОКПП: перші 5 цифр — дні від 31.12.1899 до дати народження ── */
function genIPN() {
  const epoch = Date.UTC(1899, 11, 31);
  const year  = 1955 + randInt(50);            // 1955–2004
  const birth = Date.UTC(year, randInt(12), 1 + randInt(28));
  const days  = Math.round((birth - epoch) / 86400000);

  const d = (String(days).padStart(5, '0') + randDigits(4)).split('').map(Number);
  const weights = [-1, 5, 7, 9, 4, 6, 10, 5, 7];
  const sum   = d.reduce((acc, v, i) => acc + v * weights[i], 0);
  const check = ((sum % 11) + 10) % 10;

  return d.join('') + check;
}

/* ════════════════════════════════════════════════
   Rendering
   ════════════════════════════════════════════════ */
function validateValue(kind, value) {
  /* validate.js loaded on this page — same checks as the main form */
  if (kind === 'iban') return validateIBAN(value).ok;
  return validateCode(value).ok;
}

function formatIBAN(iban) {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

function renderRows(kind, containerId, genFn, count) {
  const out = document.getElementById(containerId);
  out.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const value = genFn();
    const ok    = validateValue(kind, value);

    const row = document.createElement('div');
    row.className = 't-row';

    const val = document.createElement('span');
    val.className   = 't-val';
    val.textContent = kind === 'iban' ? formatIBAN(value) : value;

    const status = document.createElement('span');
    status.className   = ok ? 't-ok' : 't-bad';
    status.textContent = ok ? '✓' : '✕';
    status.title       = ok ? 'Пройшло перевірку validate.js' : 'НЕ пройшло перевірку — повідомте про баг';

    const copy = document.createElement('button');
    copy.className = 't-copy';
    copy.title     = 'Копіювати';
    copy.innerHTML = '<i class="ti ti-copy icon" aria-hidden="true"></i>';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        // file:// / старі браузери
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch { /* ok */ }
        ta.remove();
      }
      copy.classList.add('done');
      copy.innerHTML = '<i class="ti ti-check icon" aria-hidden="true"></i>';
      setTimeout(() => {
        copy.classList.remove('done');
        copy.innerHTML = '<i class="ti ti-copy icon" aria-hidden="true"></i>';
      }, 1500);
    });

    row.append(val, status, copy);
    out.appendChild(row);
  }
}

/* ════════════════════════════════════════════════
   Init
   ════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const count = () => parseInt(document.getElementById('t-count').value, 10) || 5;

  const genIban   = () => renderRows('iban',   'out-iban',   genIBAN,   count());
  const genEdrpou = () => renderRows('edrpou', 'out-edrpou', genEDRPOU, count());
  const genIpn    = () => renderRows('ipn',    'out-ipn',    genIPN,    count());

  document.getElementById('btn-gen-iban').addEventListener('click', genIban);
  document.getElementById('btn-gen-edrpou').addEventListener('click', genEdrpou);
  document.getElementById('btn-gen-ipn').addEventListener('click', genIpn);
  document.getElementById('btn-gen-all').addEventListener('click', () => {
    genIban(); genEdrpou(); genIpn();
  });
});

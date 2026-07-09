'use strict';

function validateIBAN(raw) {
  const iban = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  if (!iban) return { ok: false, msg: 'Введіть IBAN' };

  if (!iban.startsWith('UA')) return { ok: false, msg: 'Очікується IBAN України (UA…)' };

  if (iban.length !== 29) {
    return { ok: false, msg: `Довжина ${iban.length} символів, має бути 29 (UA + 27 цифр)` };
  }

  if (!/^UA\d{27}$/.test(iban)) {
    return { ok: false, msg: 'Після UA мають бути 27 цифр' };
  }

  // Rearrange: last 25 digits + "UA" + check digits
  const rearranged = iban.slice(4) + iban.slice(0, 4);

  // Convert letters → numbers (A=10, B=11, …, Z=35)
  const numeric = rearranged.replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));

  // MOD-97 in chunks to avoid float precision loss
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }

  if (remainder !== 1) {
    return { ok: false, msg: 'Контрольна сума IBAN невірна — перевірте номер' };
  }
  return { ok: true, msg: 'IBAN дійсний ✓' };
}

/* ════════════════════════════════════════════════
   ЄДРПОУ — 8 цифр (юридичні особи)
   ════════════════════════════════════════════════ */

function validateEDRPOU(code) {
  if (!/^\d{8}$/.test(code)) return { ok: false, msg: 'ЄДРПОУ — рівно 8 цифр' };

  const d = code.split('').map(Number);
  const inRange = [3, 4, 5, 6].includes(d[0]);

  let w = inRange ? [7, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7];
  let sum = d.slice(0, 7).reduce((acc, v, i) => acc + v * w[i], 0);
  let check = sum % 11;

  if (check >= 10) {
    w = inRange ? [9, 3, 4, 5, 6, 7, 8] : [3, 4, 5, 6, 7, 8, 9];
    sum = d.slice(0, 7).reduce((acc, v, i) => acc + v * w[i], 0);
    check = sum % 11;
  }

  if ((check % 10) !== d[7]) {
    return { ok: false, msg: 'Контрольна сума ЄДРПОУ невірна' };
  }
  return { ok: true, msg: 'ЄДРПОУ дійсний ✓' };
}

/* ════════════════════════════════════════════════
   РНОКПП / ІПН — 10 цифр (фізичні особи)
   ════════════════════════════════════════════════ */

function validateRNOKPP(code) {
  if (!/^\d{10}$/.test(code)) return { ok: false, msg: 'РНОКПП/ІПН — рівно 10 цифр' };

  const d = code.split('').map(Number);
  const weights = [-1, 5, 7, 9, 4, 6, 10, 5, 7];
  const sum = d.slice(0, 9).reduce((acc, v, i) => acc + v * weights[i], 0);
  // +10 before mod to handle negative remainder
  const check = ((sum % 11) + 10) % 10;

  if (check !== d[9]) {
    return { ok: false, msg: 'Контрольна сума РНОКПП/ІПН невірна' };
  }
  return { ok: true, msg: 'РНОКПП/ІПН дійсний ✓' };
}

/* ════════════════════════════════════════════════
   Паспорт
   Старий зразок:  2 кириличні літери + 6 цифр  (АА123456)
   ID-картка:      9 цифр                         (123456789)
   ════════════════════════════════════════════════ */

function validatePassport(raw) {
  const val = raw.replace(/\s/g, '').toUpperCase();

  if (/^[А-ЯІЇЄҐ]{2}\d{6}$/.test(val)) {
    return { ok: true, msg: 'Паспорт старого зразка ✓' };
  }
  if (/^\d{9}$/.test(val)) {
    return { ok: true, msg: 'ID-картка ✓' };
  }
  return { ok: false, msg: null };
}

/* ════════════════════════════════════════════════
   Уніфікований валідатор коду — автовизначення типу
   ════════════════════════════════════════════════ */

function validateCode(raw) {
  const val = raw.trim();

  if (!val) return { ok: false, type: null, msg: 'Введіть ЄДРПОУ, ІПН або серію/номер паспорта' };

  if (/^\d{8}$/.test(val))  return { ...validateEDRPOU(val), type: 'edrpou' };
  if (/^\d{10}$/.test(val)) return { ...validateRNOKPP(val), type: 'rnokpp' };

  const p = validatePassport(val);
  if (p.ok) return { ...p, type: 'passport' };

  if (/^\d+$/.test(val)) {
    return { ok: false, type: null, msg: `${val.length} цифр — очікується 8 (ЄДРПОУ) або 10 (ІПН)` };
  }

  return { ok: false, type: null, msg: 'Формат: 8 цифр (ЄДРПОУ), 10 цифр (ІПН), АА000000 або 9 цифр (паспорт)' };
}

/* ════════════════════════════════════════════════
   UI — стан полів
   ════════════════════════════════════════════════ */

function setFieldState(inputId, statusId, msgId, state, message) {
  const input  = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  const msg    = document.getElementById(msgId);

  input.classList.toggle('field-ok',    state === 'ok');
  input.classList.toggle('field-error', state === 'error');

  const symbols = { ok: '✓', error: '✕', clear: '' };
  status.textContent = symbols[state] || '';
  status.className   = `field-status${state !== 'clear' ? ' ' + state : ''}`;

  msg.textContent = message || '';
  msg.className   = `field-msg${state === 'error' ? ' field-msg--error' : state === 'ok' ? ' field-msg--ok' : ''}`;
}

function clearField(inputId, statusId, msgId) {
  setFieldState(inputId, statusId, msgId, 'clear', '');
}

/* ════════════════════════════════════════════════
   Live listeners
   ════════════════════════════════════════════════ */

function initLiveValidation() {
  const ibanInput   = document.getElementById('f-iban');
  const codeInput   = document.getElementById('f-edrpou');

  // ── IBAN ──
  ibanInput.addEventListener('input', () => clearField('f-iban', 'status-iban', 'msg-iban'));

  ibanInput.addEventListener('blur', () => {
    const raw = ibanInput.value.trim();
    if (!raw) { clearField('f-iban', 'status-iban', 'msg-iban'); return; }
    const r = validateIBAN(raw);
    setFieldState('f-iban', 'status-iban', 'msg-iban', r.ok ? 'ok' : 'error', r.msg);
  });

  // ── ЄДРПОУ / ІПН / паспорт ──
  codeInput.addEventListener('input', () => clearField('f-edrpou', 'status-edrpou', 'msg-edrpou'));

  codeInput.addEventListener('blur', () => {
    const raw = codeInput.value.trim();
    if (!raw) { clearField('f-edrpou', 'status-edrpou', 'msg-edrpou'); return; }
    const r = validateCode(raw);
    setFieldState('f-edrpou', 'status-edrpou', 'msg-edrpou', r.ok ? 'ok' : 'error', r.msg);
  });
}

document.addEventListener('DOMContentLoaded', initLiveValidation);

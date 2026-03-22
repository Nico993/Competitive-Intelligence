/**
 * Parsea montos en formato AR típico: $ 1.590,00, $ 11.499,84
 * @param {string|null|undefined} raw
 * @returns {number|null}
 */
export function parseArsMoney(raw) {
  if (raw == null || raw === '') return null;
  let s = String(raw)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/\$/g, '').trim();
  if (!s) return null;

  // Decimal con coma: ... ,dd al final
  const commaDec = s.match(/^([\d.]+),(\d{1,2})$/);
  if (commaDec) {
    const intPart = commaDec[1].replace(/\./g, '');
    const dec = commaDec[2].padEnd(2, '0').slice(0, 2);
    const n = parseFloat(`${intPart}.${dec}`);
    return Number.isFinite(n) ? n : null;
  }

  // Solo enteros con puntos miles
  const plain = s.replace(/\./g, '');
  const n2 = parseFloat(plain.replace(',', '.'));
  return Number.isFinite(n2) ? n2 : null;
}

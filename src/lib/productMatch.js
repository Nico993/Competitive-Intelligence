/**
 * Normaliza texto para comparación (sin acentos opcional).
 * @param {string} s
 * @param {{ stripAccents?: boolean }} [opts]
 */
export function normalizeText(s, opts = {}) {
  let t = s.toLowerCase().trim();
  if (opts.stripAccents) {
    t = t.normalize('NFD').replace(/\p{M}/gu, '');
  }
  return t.replace(/\s+/g, ' ');
}

/**
 * @param {string} text
 * @param {string[]} patternStrings - regex como string (sin delimitadores)
 * @returns {{ matched: boolean, matchedText?: string, confidence: number, pattern?: string }}
 */
export function matchProductText(text, patternStrings) {
  const norm = normalizeText(text, { stripAccents: true });
  for (const p of patternStrings) {
    try {
      const re = new RegExp(p, 'i');
      const m = norm.match(re) || text.match(re);
      if (m) {
        return {
          matched: true,
          matchedText: m[0],
          confidence: Math.min(1, m[0].length / Math.max(norm.length, 1)),
          pattern: p,
        };
      }
    } catch {
      // patrón inválido: ignorar
    }
  }
  return { matched: false, confidence: 0 };
}

/**
 * Elige el mejor bloque de texto entre candidatos (p.ej. líneas de menú).
 * @param {string[]} candidates
 * @param {string[]} patternStrings
 */
export function bestMatchingCandidate(candidates, patternStrings) {
  let best = { matched: false, confidence: 0, text: '', idx: -1 };
  candidates.forEach((c, idx) => {
    const r = matchProductText(c, patternStrings);
    if (r.matched && r.confidence >= best.confidence) {
      best = { matched: true, confidence: r.confidence, text: c, idx, pattern: r.pattern };
    }
  });
  return best;
}

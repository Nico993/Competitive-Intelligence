/**
 * @typedef {{ min: number|null, max: number|null, point: number|null }} EtaMinutes
 */

/**
 * Convierte texto ETA a minutos (punto representativo = mediana del rango).
 * @param {string|null|undefined} raw
 * @returns {EtaMinutes|null}
 */
export function parseEtaMinutes(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).toLowerCase().replace(/\u00a0/g, ' ').trim();
  if (!s) return null;

  const range = s.match(/(\d+)\s*[-–]\s*(\d+)\s*min/i);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { min: lo, max: hi, point: Math.round((lo + hi) / 2) };
  }

  const single = s.match(/(\d+)\s*min/i);
  if (single) {
    const m = parseInt(single[1], 10);
    if (!Number.isFinite(m)) return null;
    return { min: m, max: m, point: m };
  }

  const loose = s.match(/(\d+)/);
  if (loose) {
    const m = parseInt(loose[1], 10);
    if (!Number.isFinite(m)) return null;
    return { min: m, max: m, point: m };
  }

  return null;
}

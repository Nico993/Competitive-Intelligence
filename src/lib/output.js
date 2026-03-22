import fs from 'fs';
import path from 'path';

/**
 * @param {string} runDir
 * @param {object} record
 */
export function appendJsonl(runDir, record) {
  const file = path.join(runDir, 'records.jsonl');
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Convierte JSONL a CSV simple (campos planos; arrays como JSON string).
 * @param {string} jsonlPath
 * @param {string} csvPath
 */
export function jsonlToCsv(jsonlPath, csvPath) {
  const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    fs.writeFileSync(csvPath, '', 'utf8');
    return;
  }
  const rows = lines.map((l) => JSON.parse(l));
  const keys = new Set();
  for (const r of rows) {
    Object.keys(r).forEach((k) => keys.add(k));
  }
  const cols = [...keys].sort();
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  fs.writeFileSync(csvPath, `${header}\n${body}\n`, 'utf8');
}

/**
 * @returns {string} ruta del directorio de run
 */
export function createRunDir(baseOut = 'output/runs') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(baseOut, stamp);
  fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
  return runDir;
}

/**
 * @param {string} runDir
 * @param {object} meta
 */
export function writeMeta(runDir, meta) {
  fs.writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}

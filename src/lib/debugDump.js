import fs from 'fs';
import path from 'path';

const MAX_BYTES = 2_000_000;

/**
 * @param {string} runDir
 */
export function ensureDebugDir(runDir) {
  const d = path.join(runDir, 'debug');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/**
 * Escribe HTML o texto largo truncado para inspección (evita archivos enormes).
 * @param {string} runDir
 * @param {string} filename - ej. rappi-ar-caba-palermo-big-mac-search.html
 * @param {string} content
 * @param {{ logger?: { debug: (m: string) => void } }} [opts]
 */
export function writeDebugFile(runDir, filename, content, opts = {}) {
  const dir = ensureDebugDir(runDir);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fp = path.join(dir, safeName);
  let body = content;
  if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) {
    body =
      body.slice(0, MAX_BYTES) +
      `\n\n<!-- TRUNCADO por debugDump (${MAX_BYTES} bytes max) -->\n`;
  }
  fs.writeFileSync(fp, body, 'utf8');
  opts.logger?.debug(`[debug] Escrito ${fp} (${Buffer.byteLength(body, 'utf8')} bytes)`);
}

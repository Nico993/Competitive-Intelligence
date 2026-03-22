#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function latestRunDir() {
  const runsDir = path.join(ROOT, 'output/runs');
  if (!fs.existsSync(runsDir)) return null;
  const dirs = fs
    .readdirSync(runsDir)
    .map((name) => path.join(runsDir, name))
    .filter((p) => fs.statSync(p).isDirectory());
  if (dirs.length === 0) return null;
  dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0];
}

function parseArg(argv) {
  for (const a of argv) {
    if (a.startsWith('--run=')) return a.slice('--run='.length);
  }
  return null;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function main() {
  const runOverride = parseArg(process.argv.slice(2));
  const runDir = runOverride
    ? path.isAbsolute(runOverride)
      ? runOverride
      : path.join(ROOT, runOverride)
    : latestRunDir();

  if (!runDir || !fs.existsSync(path.join(runDir, 'records.jsonl'))) {
    console.error('No hay records.jsonl. Ejecutá npm run scrape primero o pasá --run=output/runs/<carpeta>');
    process.exit(1);
  }

  const lines = fs.readFileSync(path.join(runDir, 'records.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map((l) => JSON.parse(l));

  const reportDir = path.join(ROOT, 'output/report');
  fs.mkdirSync(reportDir, { recursive: true });

  const htmlRows = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.platform)}</td><td>${escapeHtml(r.address_label)}</td><td>${escapeHtml(r.product_id)}</td><td>${escapeHtml(r.product_label)}</td><td>${escapeHtml(r.product_display_name)}</td><td>${escapeHtml(r.vertical)}</td><td>${escapeHtml(r.store_name)}</td><td>${escapeHtml(r.product_price)}</td><td>${escapeHtml(r.delivery_fee)}</td><td>${escapeHtml(r.eta_range)}</td><td>${escapeHtml(r.error)}</td></tr>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Competitive Intelligence — Reporte</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 1.25rem; }
    table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f4f4f4; }
    .meta { color: #666; margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1>Reporte de scraping (raw)</h1>
  <p class="meta">Run: <code>${escapeHtml(runDir)}</code> · Filas: ${rows.length} · Generado ${escapeHtml(new Date().toISOString())}</p>
  <table>
    <thead>
      <tr>
        <th>Plataforma</th><th>Dirección</th><th>ID producto</th><th>Producto (catálogo)</th><th>Nombre en página</th><th>Vertical</th><th>Tienda</th><th>Precio</th><th>Envío</th><th>ETA</th><th>Error</th>
      </tr>
    </thead>
    <tbody>
${htmlRows}
    </tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(path.join(reportDir, 'index.html'), html, 'utf8');
  fs.copyFileSync(path.join(runDir, 'records.jsonl'), path.join(reportDir, 'latest-records.jsonl'));
  console.log(`Reporte escrito en ${path.join(reportDir, 'index.html')}`);
}

main();

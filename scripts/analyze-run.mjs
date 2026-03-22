#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeRecords } from '../src/lib/analyzeRecords.js';

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

function parseArgs(argv) {
  let runDir = null;
  let minConfidence = 0.15;
  let compareRuns = false;
  let compareOnly = false;
  for (const a of argv) {
    if (a.startsWith('--run=')) runDir = a.slice('--run='.length);
    else if (a.startsWith('--min-confidence=')) minConfidence = parseFloat(a.slice('--min-confidence='.length));
    else if (a === '--compare-runs') compareRuns = true;
    else if (a === '--compare-only') compareOnly = true;
  }
  return { runDir, minConfidence, compareRuns, compareOnly };
}

function loadJsonl(runDir) {
  const p = path.join(runDir, 'records.jsonl');
  if (!fs.existsSync(p)) return null;
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
  return lines.map((l) => JSON.parse(l));
}

function compareHistoricalRuns() {
  const runsDir = path.join(ROOT, 'output/runs');
  if (!fs.existsSync(runsDir)) return null;
  const dirs = fs
    .readdirSync(runsDir)
    .map((name) => path.join(runsDir, name))
    .filter((p) => fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'records.jsonl')))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const series = [];
  for (const d of dirs) {
    const metaPath = path.join(d, 'meta.json');
    let started = null;
    if (fs.existsSync(metaPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        started = m.started_at ?? null;
      } catch {
        /* ignore */
      }
    }
    const rows = loadJsonl(d);
    if (!rows?.length) continue;
    const analysis = analyzeRecords(rows, { minConfidence: 0.15 });
    series.push({
      run_dir: path.relative(ROOT, d),
      started_at: started,
      comparable_pairs: analysis.coverage.comparable_pairs,
      analyzable_rows: analysis.coverage.analyzable_rows,
    });
  }
  return { runs_compared: series.length, series };
}

function copyToDashboardPublic(runDir) {
  const destDir = path.join(ROOT, 'dashboard/public/data');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const analysisSrc = path.join(runDir, 'analysis.json');
  if (fs.existsSync(analysisSrc)) {
    fs.copyFileSync(analysisSrc, path.join(destDir, 'analysis.json'));
  }
  const insightsSrc = path.join(runDir, 'insights.json');
  if (fs.existsSync(insightsSrc)) {
    fs.copyFileSync(insightsSrc, path.join(destDir, 'insights.json'));
  }
}

function main() {
  const { runDir: runArg, minConfidence, compareRuns, compareOnly } = parseArgs(process.argv.slice(2));

  if (compareRuns) {
    const hist = compareHistoricalRuns();
    const outPath = path.join(ROOT, 'output/report/run-history.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(hist, null, 2), 'utf8');
    console.log(`Historial de runs escrito en ${outPath}`);
    if (compareOnly) return;
  }

  const runDir = runArg
    ? path.isAbsolute(runArg)
      ? runArg
      : path.join(ROOT, runArg)
    : latestRunDir();

  if (!runDir || !fs.existsSync(path.join(runDir, 'records.jsonl'))) {
    console.error('No hay records.jsonl. Pasá --run=output/runs/<carpeta> o ejecutá un scrape primero.');
    process.exit(1);
  }

  const rows = loadJsonl(runDir);
  const metaPath = path.join(runDir, 'meta.json');
  let meta = null;
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      /* ignore */
    }
  }

  const analysis = analyzeRecords(rows, { minConfidence });
  const payload = {
    generated_at: new Date().toISOString(),
    run_dir: path.relative(ROOT, runDir),
    meta,
    ...analysis,
  };

  const outFile = path.join(runDir, 'analysis.json');
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Análisis escrito en ${outFile}`);

  copyToDashboardPublic(runDir);
  if (fs.existsSync(path.join(ROOT, 'dashboard/public/data'))) {
    console.log('Copiado a dashboard/public/data/ (analysis.json e insights.json si existen)');
  }
}

main();

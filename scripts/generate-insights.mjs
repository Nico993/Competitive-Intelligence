#!/usr/bin/env node
/**
 * Genera insights e informe ejecutivo vía OpenRouter a partir de analysis.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
  let model = 'qwen/qwen-2.5-7b-instruct';
  let offline = false;
  for (const a of argv) {
    if (a.startsWith('--run=')) runDir = a.slice('--run='.length);
    else if (a.startsWith('--model=')) model = a.slice('--model='.length);
    else if (a === '--offline') offline = true;
  }
  return { runDir, model, offline };
}

function extractJsonObject(text) {
  const t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model response');
  return JSON.parse(body.slice(start, end + 1));
}

const SCHEMA_HINT = `
Debes responder SOLO un objeto JSON válido (sin markdown) con esta forma exacta:
{
  "executive_summary": "string breve en español",
  "limitations": "string: limitaciones de datos y cobertura",
  "structured_analysis": {
    "pricing_position": "string: Rappi vs competencia en precio (usa solo números del input)",
    "delivery_ops": "string: tiempos de entrega comparados",
    "fees_structure": "string: delivery y service fees",
    "promotions": "string: estrategia promocional por plataforma",
    "geographic": "string: variabilidad por zona"
  },
  "insights": [
    { "finding": "...", "impacto": "...", "recomendacion": "..." }
  ]
}
Debe haber exactamente 5 elementos en "insights".`;

async function callOpenRouter(model, analysisPayload) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('Definí OPENROUTER_API_KEY en el entorno');
  }

  const slim = {
    coverage: analysisPayload.coverage,
    warnings: analysisPayload.warnings,
    median_price_by_product_platform: analysisPayload.median_price_by_product_platform,
    price_comparisons: analysisPayload.price_comparisons,
    eta_by_platform: analysisPayload.eta_by_platform,
    eta_by_address_platform: analysisPayload.eta_by_address_platform,
    delivery_fee_by_platform: analysisPayload.delivery_fee_by_platform,
    promotions_by_platform: analysisPayload.promotions_by_platform,
    competitiveness_by_zone: analysisPayload.competitiveness_by_zone,
    meta: analysisPayload.meta,
    generated_at: analysisPayload.generated_at,
  };

  const userContent = `${SCHEMA_HINT}

Datos agregados (fuente única de verdad numérica; no inventes cifras ni pares donde no existan):
${JSON.stringify(slim, null, 2)}

Instrucciones:
- No contradigas los totales en coverage (analyzable_rows, comparable_pairs, etc.).
- Si comparable_pairs es 0 o muy bajo, dilo y recomienda mejorar scraping o matching en lugar de comparar precios con certeza.
- Cada insight debe ser accionable para Strategy y Pricing.
- Idioma: español.`;

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/rappi/competitive-intelligence',
      'X-Title': 'Competitive Intelligence Insights',
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content:
            'Eres un analista de estrategia retail/delivery. Respondes únicamente JSON válido siguiendo el esquema pedido.',
        },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 800)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Respuesta vacía de OpenRouter');
  return extractJsonObject(text);
}

function validateInsights(obj) {
  if (!obj.insights || !Array.isArray(obj.insights) || obj.insights.length !== 5) {
    throw new Error('Se esperaban exactamente 5 insights');
  }
  for (const i of obj.insights) {
    if (!i.finding || !i.impacto || !i.recomendacion) {
      throw new Error('Cada insight requiere finding, impacto, recomendacion');
    }
  }
}

/**
 * Informe mínimo sin LLM (CI o sin OPENROUTER_API_KEY).
 * @param {object} a analysis payload
 */
function buildOfflineInsights(a) {
  const c = a.coverage || {};
  const pairs = Array.isArray(a.price_comparisons) ? a.price_comparisons : [];
  const etaR = a.eta_by_platform?.['rappi-ar'];
  const etaU = a.eta_by_platform?.['uber-eats-ar'];
  const delR = a.delivery_fee_by_platform?.['rappi-ar'];
  const delU = a.delivery_fee_by_platform?.['uber-eats-ar'];
  const prR = a.promotions_by_platform?.['rappi-ar'];
  const prU = a.promotions_by_platform?.['uber-eats-ar'];

  const exec = `Cobertura: ${c.analyzable_rows ?? 0}/${c.total_rows ?? 0} filas analizables; pares comparables Rappi–Uber: ${c.comparable_pairs ?? 0}.`;
  const lim = `Uber Eats tiene pocas filas con precio válido y match suficiente; muchas métricas comparativas son parciales. Revisar scraping y queries de producto para aumentar N.`;

  const structured_analysis = {
    pricing_position:
      pairs.length > 0
        ? pairs
            .map(
              (p) =>
                `${p.address_label} / ${p.product_id}: Rappi mediana vs Uber ${p.diff_pct}% (${p.bucket}).`,
            )
            .join(' ')
        : 'No hay suficientes pares dirección×producto con ambas plataformas para concluir posicionamiento global.',
    delivery_ops: `Rappi ETA mediana ~${etaR?.median_minutes ?? 'n/d'} min (n=${etaR?.n ?? 0}); Uber ~${etaU?.median_minutes ?? 'n/d'} min (n=${etaU?.n ?? 0}). Interpretar con precaución por sesgo de muestra.`,
    fees_structure: `Delivery mediano Rappi: ${delR?.median ?? 'n/d'} (n=${delR?.n ?? 0}); Uber: ${delU?.median ?? 'n/d'} (n=${delU?.n ?? 0}). Envío gratis (share en filas con fee): Rappi ${delR?.free_delivery_rate != null ? (delR.free_delivery_rate * 100).toFixed(0) + '%' : 'n/d'}, Uber ${delU?.free_delivery_rate != null ? (delU.free_delivery_rate * 100).toFixed(0) + '%' : 'n/d'}.`,
    promotions: `Promoción en filas analizables: Rappi ${prR?.rate != null ? (prR.rate * 100).toFixed(0) + '%' : 'n/d'}, Uber ${prU?.rate != null ? (prU.rate * 100).toFixed(0) + '%' : 'n/d'}.`,
    geographic:
      Array.isArray(a.competitiveness_by_zone) && a.competitiveness_by_zone.length
        ? a.competitiveness_by_zone
            .map((z) => `${z.address_label}: diff medio vs Uber ${z.mean_diff_pct_vs_uber}% (${z.n_pairs} pares).`)
            .join(' ')
        : 'Sin matriz zona×producto suficiente.',
  };

  const insights = [
    {
      finding: `Solo ${c.comparable_pairs ?? 0} pares Rappi–Uber con precio comparable en este run.`,
      impacto: 'Las decisiones de pricing frente a Uber quedan con alta incertidumbre estadística.',
      recomendacion: 'Priorizar arreglos de matching en Uber Eats y repetir el scrape con más tiendas por producto.',
    },
    {
      finding: `Cobertura analizable Uber (${c.by_platform?.['uber-eats-ar'] ?? 0} filas) vs Rappi (${c.by_platform?.['rappi-ar'] ?? 0}).`,
      impacto: 'Cualquier benchmark de precio está sesgado hacia Rappi.',
      recomendacion: 'Acotar el benchmark a SKUs con alta tasa de match (p. ej. retail) mientras se mejora el resto.',
    },
    {
      finding: structured_analysis.delivery_ops,
      impacto: 'La percepción de velocidad depende de datos de ETA completos en ambas apps.',
      recomendacion: 'Forzar captura de ETA en flujo de checkout o PDP cuando el listado no lo expone.',
    },
    {
      finding: structured_analysis.fees_structure,
      impacto: 'El costo total al usuario depende de delivery + service fee; gaps en Uber impiden ver el ticket completo.',
      recomendacion: 'Instrumentar total_checkout en el scraper para comparar “precio final”.',
    },
    {
      finding: structured_analysis.promotions,
      impacto: 'Los descuentos condicionan elasticidad y posicionamiento percibido.',
      recomendacion: 'Etiquetar tipo de promo (envío gratis vs % producto) y cruzar con vertical.',
    },
  ];

  return {
    executive_summary: exec,
    limitations: lim,
    structured_analysis,
    insights,
  };
}

function writeInformeMd(runDir, obj, model) {
  const lines = [
    `# Informe ejecutivo — Insights competitivos`,
    ``,
    `_Modelo: ${model} · Generado: ${new Date().toISOString()}_`,
    ``,
    `## Resumen`,
    ``,
    obj.executive_summary || '',
    ``,
    `## Limitaciones`,
    ``,
    obj.limitations || '',
    ``,
    `## Análisis estructurado`,
    ``,
    `### Posicionamiento de precios`,
    ``,
    obj.structured_analysis?.pricing_position || '',
    ``,
    `### Ventaja operacional (entregas)`,
    ``,
    obj.structured_analysis?.delivery_ops || '',
    ``,
    `### Estructura de fees`,
    ``,
    obj.structured_analysis?.fees_structure || '',
    ``,
    `### Estrategia promocional`,
    ``,
    obj.structured_analysis?.promotions || '',
    ``,
    `### Variabilidad geográfica`,
    ``,
    obj.structured_analysis?.geographic || '',
    ``,
    `## Top 5 insights accionables`,
    ``,
  ];
  obj.insights?.forEach((ins, idx) => {
    lines.push(`### ${idx + 1}. ${ins.finding.slice(0, 80)}${ins.finding.length > 80 ? '…' : ''}`);
    lines.push('');
    lines.push(`- **Finding:** ${ins.finding}`);
    lines.push(`- **Impacto:** ${ins.impacto}`);
    lines.push(`- **Recomendación:** ${ins.recomendacion}`);
    lines.push('');
  });
  fs.writeFileSync(path.join(runDir, 'informe.md'), lines.join('\n'), 'utf8');
}

function copyToDashboard(runDir) {
  const destDir = path.join(ROOT, 'dashboard/public/data');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const src = path.join(runDir, 'insights.json');
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, 'insights.json'));
}

async function main() {
  const { runDir: runArg, model, offline } = parseArgs(process.argv.slice(2));
  const runDir = runArg
    ? path.isAbsolute(runArg)
      ? runArg
      : path.join(ROOT, runArg)
    : latestRunDir();

  const analysisPath = path.join(runDir, 'analysis.json');
  if (!fs.existsSync(analysisPath)) {
    console.error(`No existe analysis.json en ${runDir}. Ejecutá: npm run analyze`);
    process.exit(1);
  }

  const analysisPayload = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));

  let parsed;
  const useOffline = offline || !process.env.OPENROUTER_API_KEY;
  if (useOffline) {
    parsed = buildOfflineInsights(analysisPayload);
    validateInsights(parsed);
    if (!offline && !process.env.OPENROUTER_API_KEY) {
      console.warn('OPENROUTER_API_KEY no definida: usando modo offline determinístico.');
    }
  } else {
    try {
      parsed = await callOpenRouter(model, analysisPayload);
      validateInsights(parsed);
    } catch (e) {
      console.error(e.message || e);
      process.exit(1);
    }
  }

  const out = {
    model: useOffline ? `offline:${model}` : model,
    generated_at: new Date().toISOString(),
    run_dir: path.relative(ROOT, runDir),
    offline: useOffline,
    ...parsed,
  };

  fs.writeFileSync(path.join(runDir, 'insights.json'), JSON.stringify(out, null, 2), 'utf8');
  writeInformeMd(runDir, parsed, model);
  copyToDashboard(runDir);

  console.log(`insights.json e informe.md escritos en ${runDir}`);
}

main();

# Competitive Intelligence (Rappi vs Uber Eats)

## Alcance respecto al brief

| Requisito | Estado |
|-----------|--------|
| Baseline Rappi + competidores | Rappi + Uber Eats |
| Tercer competidor (ej. DiDi Food) | No implementado (prioridad: robustez en 2 plataformas) |
| Geografía “México” del enunciado | **Scope real: Argentina** (`config/addresses.json`, dominios `.com.ar`) |
| 20–50 direcciones | 33 zonas con `zone_type` (CABA, GBA, interior, Patagonia, etc.) |
| Métricas (≥3) | Precio ítem, delivery fee, ETA, promociones, verticales restaurant / retail / pharmacy |
| Salida estructurada | `records.jsonl` + `summary.csv` por run |
| Informe + visualizaciones | `informe.md`, `insights.json`, dashboard Next.js (≥3 gráficos) |
| Un comando | `npm run scrape` |

**Ética:** delays entre direcciones/productos (`config/products.json`), retries, user-agent de navegador real vía Playwright; no proxies de pago en esta versión.

## Por qué estas herramientas

- **Node + Playwright:** un solo runtime, scraping con navegador real (menos fricción anti-bot que HTML estático), fácil de automatizar.
- **JSONL + CSV:** trazabilidad línea a línea y tablas para Excel/BI.
- **OpenRouter (LLM):** informe ejecutivo e insights estructurados sin entrenar modelos; el análisis cuantitativo viene de `scripts/analyze-run.mjs` (no del modelo).
- **Next.js + Recharts:** dashboard interactivo y exportación a PDF (`/print`).

## Coste LLM (OpenRouter)

**Modelo por defecto:** `qwen/qwen-2.5-7b-instruct` (un solo request HTTP a `npm run insights`; ver [precios en OpenRouter](https://openrouter.ai/qwen/qwen-2.5-7b-instruct)).

**Tarifas de referencia** (listadas en esa página; pueden variar por proveedor): ~**USD 0.04 / 1M tokens de entrada** y ~**USD 0.10 / 1M tokens de salida**.

**Estimación para este repo** (run `2026-03-22T18-45-07-015Z`, `analysis.json` ya agregado en el prompt): ~**4.2k tokens** de entrada (instrucciones + JSON slim) y ~**1.1k tokens** de salida (JSON del informe). Cálculo aproximado (tarifas de arriba):

- Entrada: (4 200 / 1 000 000) × 0.04 ≈ **USD 0.00017**
- Salida: (1 100 / 1 000 000) × 0.10 ≈ **USD 0.00011**
- **Total ≈ USD 0.0003 por cada `npm run insights`** (orden de magnitud: unas **~3.000 regeneraciones de informe ≈ 1 USD**; el uso real lo confirma el panel de OpenRouter).

**Coste cero:** `npm run insights:offline` o sin `OPENROUTER_API_KEY` (texto determinístico, sin LLM).

## Reproducir (evaluador)

```bash
npm install
npx playwright install chromium
npm run scrape          # opcional: nuevo run en output/runs/<timestamp>/
npm run analyze         # analysis.json → último run + copia a dashboard/public/data/
npm run insights        # informe + insights (requiere API key de OpenRouter, ver abajo)
npm run dashboard:dev   # http://localhost:3001
```

**Sin volver a scrapear:** ya hay un run en `output/runs/2026-03-22T18-45-07-015Z/` y `dashboard/public/data/` con `analysis.json` e `insights.json`. Con eso alcanza `npm run dashboard:dev` para ver cobertura, gráficos y top 5 insights.

**Regenerar solo texto del informe (misma data):** `npm run insights:offline` o `npm run insights -- --run=output/runs/<carpeta>`.

## API key de OpenRouter

Para **regenerar** el informe con LLM (`npm run insights`) necesitás una clave propia en [openrouter.ai/keys](https://openrouter.ai/keys). Copiá [`.env.example`](.env.example) a `.env` y pegá `OPENROUTER_API_KEY=...`.

El repo ya incluye `insights.json` / `informe.md` generados y el dashboard funciona sin clave. Sin API key, `npm run insights` cae en modo offline (`insights:offline`).

## Archivos clave

- `config/addresses.json` — direcciones y justificación en `notes`
- `config/products.json` — ítems tipo Big Mac, combo, nuggets, Coca 500ml, agua 1L, pañales
- `output/runs/<run>/` — raw, screenshots, `informe.md`
- `dashboard/public/data/` — copia que consume el dashboard

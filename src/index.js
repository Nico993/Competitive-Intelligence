#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './lib/logger.js';
import { launchBrowser, newContext, delay } from './lib/playwrightContext.js';
import { createRunDir, jsonlToCsv, writeMeta } from './lib/output.js';
import { runRappiForAddress } from './scrapers/rappi.js';
import { runUberEatsForAddress } from './scrapers/uberEats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadJson(rel) {
  const p = path.join(ROOT, rel);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function parseArgs(argv) {
  const out = {
    platforms: ['rappi', 'ubereats'],
    limitAddresses: null,
    dryRun: false,
    vertical: null,
    headed: false,
    logLevel: 'info',
    proxy: null,
    maxStores: null,
    retries: 2,
    productId: null,
    debugHtml: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--headed') out.headed = true;
    else if (a === '--debug-html') out.debugHtml = true;
    else if (a.startsWith('--platforms='))
      out.platforms = a.split('=')[1].split(',').map((s) => s.trim().toLowerCase());
    else if (a.startsWith('--limit-addresses='))
      out.limitAddresses = parseInt(a.split('=')[1], 10);
    else if (a.startsWith('--vertical=')) out.vertical = a.split('=')[1];
    else if (a.startsWith('--product-id=')) out.productId = a.split('=')[1].trim();
    else if (a.startsWith('--log-level=')) out.logLevel = a.split('=')[1];
    else if (a.startsWith('--proxy=')) out.proxy = a.split('=')[1];
    else if (a.startsWith('--max-stores=')) out.maxStores = parseInt(a.split('=')[1], 10);
    else if (a.startsWith('--retries=')) out.retries = parseInt(a.split('=')[1], 10);
  }
  return out;
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} attempts
 * @param {ReturnType<typeof createLogger>} logger
 */
async function withRetry(fn, attempts, logger) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      logger.warn(`Intento ${i + 1}/${attempts} falló: ${e?.message || e}`);
      await delay(2000 * (i + 1));
    }
  }
  throw last;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logger = createLogger(args.logLevel);

  const productsCfg = loadJson('config/products.json');
  const addressesCfg = loadJson('config/addresses.json');
  const addresses = addressesCfg.addresses;
  const slice = args.limitAddresses ? addresses.slice(0, args.limitAddresses) : addresses;

  const maxStoresPerRun = args.maxStores ?? productsCfg.maxStoresPerRun ?? 4;
  const delayMsBetweenActions = productsCfg.delayMsBetweenActions ?? 600;
  const delayMsBetweenStores = productsCfg.delayMsBetweenStores ?? 1200;
  const delayMsBetweenProducts = productsCfg.delayMsBetweenProducts ?? 2000;
  const delayMsBetweenAddresses = productsCfg.delayMsBetweenAddresses ?? 2500;

  let productList = productsCfg.products;
  if (args.productId) {
    productList = productsCfg.products.filter((p) => p.id === args.productId);
    if (productList.length === 0) {
      logger.error(`No existe producto con id "${args.productId}" en config/products.json`);
      process.exit(1);
    }
  }

  const debugDump = args.debugHtml || args.logLevel === 'debug';

  if (args.dryRun) {
    logger.info('[dry-run] Direcciones:', slice.map((a) => a.id).join(', '));
    logger.info('[dry-run] Productos:', productList.map((p) => p.id).join(', '));
    logger.info('[dry-run] Plataformas:', args.platforms.join(', '));
    logger.info('[dry-run] debugDump (HTML):', debugDump);
    return;
  }

  const runDir = createRunDir(path.join(ROOT, 'output/runs'));
  logger.info(`Run dir: ${runDir}`);

  writeMeta(runDir, {
    started_at: new Date().toISOString(),
    platforms: args.platforms,
    address_count: slice.length,
    dry_run: false,
    vertical: args.vertical,
    product_id_filter: args.productId,
    debug_html: debugDump,
  });

  const browser = await launchBrowser({
    headless: !args.headed,
    proxyServer: args.proxy || undefined,
  });

  try {
    for (const address of slice) {
      logger.info(`--- Dirección: ${address.label} (${address.id}) ---`);
      await delay(delayMsBetweenAddresses);

      if (args.platforms.includes('rappi')) {
        const context = await newContext(browser);
        const page = await context.newPage();
        page.setDefaultTimeout(45_000);
        try {
          await withRetry(
            () =>
              runRappiForAddress({
                page,
                address,
                runDir,
                products: productList,
                maxStoresPerRun,
                logger,
                delayMsBetweenActions,
                delayMsBetweenProducts,
                verticalFilter: args.vertical,
                debugDump,
              }),
            args.retries,
            logger,
          );
        } finally {
          await context.close();
        }
      }

      if (args.platforms.includes('ubereats')) {
        const context = await newContext(browser);
        const page = await context.newPage();
        page.setDefaultTimeout(45_000);
        try {
          await withRetry(
            () =>
              runUberEatsForAddress({
                page,
                address,
                runDir,
                products: productList,
                maxStoresPerRun,
                logger,
                delayMsBetweenActions,
                delayMsBetweenProducts,
                delayMsBetweenStores,
                verticalFilter: args.vertical,
                debugDump,
              }),
            args.retries,
            logger,
          );
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const jsonlPath = path.join(runDir, 'records.jsonl');
  const csvPath = path.join(runDir, 'summary.csv');
  if (fs.existsSync(jsonlPath)) jsonlToCsv(jsonlPath, csvPath);
  logger.info(`Listo. JSONL: ${jsonlPath} CSV: ${csvPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

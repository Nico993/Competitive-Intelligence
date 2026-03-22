import path from 'path';
import { bestMatchingCandidate } from '../lib/productMatch.js';
import { delay } from '../lib/playwrightContext.js';
import { writeDebugFile } from '../lib/debugDump.js';
import { appendJsonl } from '../lib/output.js';

const UE_HOME = 'https://www.ubereats.com/ar';

/**
 * Área donde están las tarjetas de búsqueda: a veces no están bajo &lt;main&gt; (React shell).
 * Si `main` existe pero no tiene enlaces a tienda, se usa `body` (evita conteo 0 falso).
 * @param {import('playwright').Page} page
 */
async function getUberSearchScope(page) {
  const main = page.locator('main, [role="main"], [data-testid="search-page"]').first();
  if (await main.count()) {
    const inMain =
      (await main.getByRole('link', { name: /Ver tienda|View store|Ver menú/i }).count()) +
      (await main.locator('a[href*="/ar/store/"], a[href*="ubereats.com"][href*="/store/"]').count());
    if (inMain > 0) return main;
  }
  return page.locator('body');
}

/**
 * Cuenta tiendas en resultados de búsqueda (rol accesible o enlaces a /store/).
 * @param {import('playwright').Page} page
 */
async function countUberSearchStoreLinks(page) {
  const scope = await getUberSearchScope(page);
  const byRole = await scope.getByRole('link', { name: /Ver tienda|View store|Ver menú/i }).count();
  if (byRole > 0) return byRole;
  /** No usar `href*="/store/"` solo: matchea Google Play (`…com/store/apps…`). */
  const ue = await scope
    .locator('a[href*="ubereats.com"][href*="/store/"], a[href^="/ar/store/"]')
    .count();
  return ue;
}

/**
 * Espera a que la lista de resultados muestre al menos un enlace a tienda (hidrata async).
 * @param {import('playwright').Page} page
 * @param {{ debug?: (m: string) => void }} [logger]
 */
async function waitForUberSearchResultsHydration(page, logger) {
  const maxMs = 28_000;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const n = await countUberSearchStoreLinks(page);
    if (n > 0) return n;
    await delay(600);
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    await page.evaluate(() => window.scrollBy(0, 320)).catch(() => {});
  }
  const final = await countUberSearchStoreLinks(page);
  logger?.debug?.(`[uber] hidratación búsqueda: enlaces tienda=${final} tras ${Date.now() - t0}ms`);
  return final;
}

/**
 * @param {import('playwright').Page} page
 */
async function dismissUberOverlays(page) {
  const candidates = [
    page.getByRole('button', { name: /^(Aceptar|Aceptar todo|Acepto|Entendido|OK|Cerrar|Allow)$/i }),
    page.getByRole('button', { name: /Cookies|cookie/i }),
    page.locator('[class*="cookie"] button').first(),
    page.getByTestId('uc-accept-all-button'),
  ];
  for (const loc of candidates) {
    try {
      const el = loc.first ? loc.first() : loc;
      await el.waitFor({ state: 'visible', timeout: 2500 });
      await el.click({ timeout: 3000 });
      await delay(500);
    } catch {
      // no overlay
    }
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('../lib/logger.js').createLogger>} logger
 * @returns {Promise<import('playwright').Locator>}
 */
async function resolveUberLocationInput(page, logger) {
  /** Priorizar placeholder/header: el testid a veces enlaza a un duplicado oculto y el typeahead no despliega opciones. */
  const strategies = [
    () => page.getByPlaceholder(/dirección|Dirección|Ingresá|Ingresa|Enter delivery|delivery address|address/i),
    () => page.locator('header input[type="text"]').first(),
    () => page.getByRole('combobox', { name: /dirección|ubicación|delivery|address|location/i }),
    () => page.getByTestId('location-typeahead-input'),
    () => page.locator('input[data-testid="location-typeahead-input"]'),
    () => page.locator('[data-testid*="location-typeahead"] input').first(),
    () => page.locator('[data-testid*="LocationTypeahead"] input').first(),
    () => page.locator('input[aria-autocomplete="list"]').first(),
    () => page.locator('[data-testid="address-picker"] input').first(),
  ];

  let lastErr;
  for (let i = 0; i < strategies.length; i++) {
    try {
      const loc = strategies[i]().first();
      await loc.waitFor({ state: 'visible', timeout: 14_000 });
      logger.debug?.(`Uber Eats: input ubicación vía estrategia ${i + 1}`);
      return loc;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('No se encontró el campo de ubicación en Uber Eats');
}

/**
 * @param {import('playwright').Page} page
 * @param {object} address
 * @param {ReturnType<import('../lib/logger.js').createLogger>} logger
 * @param {number} actionDelay
 */
export async function setUberLocation(page, address, logger, actionDelay) {
  await page.goto(UE_HOME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 35_000 }).catch(() => {});
  await delay(actionDelay);

  await dismissUberOverlays(page);
  await delay(600);

  const input = await resolveUberLocationInput(page, logger);
  await input.click({ timeout: 20_000 });
  await input.fill(address.uberLocationQuery);
  await delay(800);
  await page
    .locator('[role="option"], [role="listbox"] [role="option"]')
    .first()
    .waitFor({ state: 'visible', timeout: 12_000 })
    .catch(() => {});
  await delay(1200);

  const optRe = new RegExp(address.uberOptionMatch, 'i');
  const localityToken = String(address.uberLocationQuery || '')
    .trim()
    .split(/\s+/)[0];
  const esc = localityToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inArgentina = /Buenos Aires|CABA|Ciudad Autónoma|Capital Federal|Argentina/i;

  const strategies = [
    () => page.getByRole('option').filter({ hasText: optRe }).first(),
    () =>
      page
        .getByRole('option')
        .filter({ hasText: new RegExp(esc, 'i') })
        .filter({ hasText: inArgentina })
        .first(),
  ];

  let picked = false;
  for (let i = 0; i < strategies.length; i++) {
    try {
      await strategies[i]().click({ timeout: 14_000 });
      picked = true;
      if (i > 0) logger.warn?.(`[uber] Ubicación vía estrategia ${i + 1} (fallback) · ${address.id}`);
      break;
    } catch (e) {
      logger.debug?.(`[uber] ubicación estrategia ${i + 1}: ${e?.message || e}`);
    }
  }

  if (!picked) {
    await input.click();
    await input.fill(`${address.uberLocationQuery} Buenos Aires`);
    await delay(800);
    await page
      .locator('[role="option"]')
      .first()
      .waitFor({ state: 'visible', timeout: 14_000 })
      .catch(() => {});
    await delay(1200);
    try {
      await page.getByRole('option').filter({ hasText: optRe }).first().click({ timeout: 14_000 });
    } catch {
      await input.press('ArrowDown');
      await delay(400);
      await input.press('Enter');
    }
    logger.warn?.(`[uber] Ubicación tras reescribir query+Buenos Aires · ${address.id}`);
  }

  await page.keyboard.press('Escape').catch(() => {});
  await delay(800);
  await delay(Math.max(actionDelay, 2000));
}

/**
 * @param {import('playwright').Page} page
 * @param {number} storeIdx
 * @param {{ debug?: (m: string) => void }} logger
 * @returns {Promise<string | null>}
 */
async function clickUberStoreSearchResult(page, storeIdx, logger) {
  const scope = await getUberSearchScope(page);
  const role = scope.getByRole('link', { name: /Ver tienda|View store|Ver menú/i });
  const nRole = await role.count();
  if (nRole > storeIdx) {
    const el = role.nth(storeIdx);
    const h = await el.getAttribute('href').catch(() => null);
    await el.click({ timeout: 20_000 });
    return h;
  }
  const hrefUe = scope.locator('a[href*="/ar/store/"], a[href*="ubereats.com"][href*="/store/"]');
  const nUe = await hrefUe.count();
  if (nUe > storeIdx) {
    logger.debug?.(`[uber] clic vía a[href*="ubereats.com"][href*="/store/"] (n=${nUe})`);
    const el = hrefUe.nth(storeIdx);
    const h = await el.getAttribute('href').catch(() => null);
    await el.click({ timeout: 20_000 });
    return h;
  }
  return null;
}

/**
 * @param {string} searchUrl
 */
function decodeUberPlPayload(searchUrl) {
  try {
    const m = searchUrl.match(/[?&]pl=([^&]+)/);
    if (!m) return '';
    const raw = decodeURIComponent(m[1]);
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/**
 * @param {string} payload
 */
function uberPlSuggestsOutsideArgentina(payload) {
  if (!payload) return false;
  const looksUs =
    /San Francisco/i.test(payload) ||
    /\b(California|Miami|United States|New York|Chicago)\b/i.test(payload);
  const looksAr =
    /Argentina|Buenos Aires|CABA|Ciudad Autónoma|Palermo|Caballito|Belgrano|Flores|Recoleta|Córdoba|Cordoba|Mendoza|Rosario|La Plata|Neuquén|Salta|Tucumán|Quilmes|Avellaneda|Morón|Lanús|Tigre|Mar del Plata|Bariloche|Resistencia|Corrientes|Posadas|Bahía Blanca|Santiago del Estero|Jujuy|Paraná|San Juan|Viedma|Río Gallegos/i.test(
      payload,
    );
  return looksUs && !looksAr;
}

/**
 * Busca producto global y devuelve URL de resultados para re-navegación.
 * @param {import('playwright').Page} page
 * @param {string} query
 * @param {string} screenshotPath
 * @param {number} actionDelay
 * @param {{ logger?: { debug?: (m: string) => void; warn?: (m: string) => void }; debugDump?: boolean; runDir?: string; addressId?: string; productId?: string; address?: object; delayMsBetweenActions?: number }} [ctx]
 */
export async function uberGlobalSearch(page, query, screenshotPath, actionDelay, ctx = {}) {
  const runSearch = async () => {
    const search = page.getByTestId('search-input');
    await search.click({ timeout: 15_000 });
    await search.fill(query);
    await search.press('Enter');
    await delay(2500);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    return page.url();
  };

  let searchUrl = await runSearch();
  ctx.logger?.debug?.(`[uber] búsqueda global URL=${searchUrl}`);

  const plPayload = decodeUberPlPayload(searchUrl);
  if (uberPlSuggestsOutsideArgentina(plPayload) && ctx.address) {
    ctx.logger?.warn?.(
      '[uber] pl= decodificado sugiere ubicación fuera de Argentina; reintentando setUberLocation y la búsqueda',
    );
    await setUberLocation(page, ctx.address, ctx.logger, ctx.delayMsBetweenActions ?? actionDelay);
    await delay(1500);
    searchUrl = await runSearch();
    ctx.logger?.debug?.(`[uber] búsqueda global URL (tras re-ubicación)=${searchUrl}`);
  }

  await waitForUberSearchResultsHydration(page, ctx.logger);

  if (ctx.debugDump && ctx.runDir && ctx.addressId && ctx.productId) {
    const html = await page.content().catch(() => '');
    writeDebugFile(
      ctx.runDir,
      `uber-${ctx.addressId}-${ctx.productId}-search.html`,
      html,
      { logger: ctx.logger },
    );
    const inner = await page.locator('body').innerText().catch(() => '');
    writeDebugFile(
      ctx.runDir,
      `uber-${ctx.addressId}-${ctx.productId}-search-body.txt`,
      inner,
      { logger: ctx.logger },
    );
    const nStores = await countUberSearchStoreLinks(page);
    ctx.logger?.debug?.(`[uber] resultados búsqueda: enlaces tienda count=${nStores} · body len=${inner.length}`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  return searchUrl;
}

/**
 * Scroll incremental y busca texto que matchee patrones; extrae precio cercano.
 * @param {import('playwright').Page} page
 * @param {string[]} matchPatterns
 * @param {number} maxScrolls
 */
/**
 * @param {{ logger?: { debug?: (m: string) => void }; debugDump?: boolean; runDir?: string; label?: string }} [ctx]
 */
async function findProductInStoreMenu(page, matchPatterns, maxScrolls = 28, ctx = {}) {
  for (let s = 0; s < maxScrolls; s++) {
    const bodyText = await page.locator('body').innerText();
    const lines = bodyText.split('\n').map((l) => l.trim()).filter((l) => l.length > 2);
    ctx.logger?.debug?.(
      `[uber] menú scroll=${s}/${maxScrolls} líneas=${lines.length} muestra=${lines.slice(0, 5).join(' | ')}`,
    );
    const bm = bestMatchingCandidate(lines, matchPatterns);
    if (bm.matched && bm.idx >= 0) {
      const windowLines = lines.slice(Math.max(0, bm.idx - 1), bm.idx + 4);
      const block = windowLines.join('\n');
      const price =
        block.match(/\$\s*[\d]{1,3}(?:[.,][\d]{3})*(?:[.,][\d]{2})?/)?.[0] ??
        block.match(/[\d]{1,3}(?:[.,][\d]{3})+(?:[.,][\d]{2})?/)?.[0] ??
        null;

      const eta_range = block.match(/\d+\s*[-–]\s*\d+\s*min|\d+\s*min(?:utos)?/i)?.[0] ?? null;
      const product_display_name = buildUberProductDisplayName(lines, bm.idx, bm.text);
      ctx.logger?.debug?.(
        `[uber] match producto línea="${bm.text.slice(0, 100)}" precio=${price} scrolls=${s}`,
      );
      if (ctx.debugDump && ctx.runDir && ctx.label) {
        writeDebugFile(ctx.runDir, `${ctx.label}-match-context.txt`, block, { logger: ctx.logger });
      }
      return {
        found: true,
        product_display_name,
        matched_snippet: bm.text,
        product_price: price,
        eta_range,
        match_confidence: bm.confidence ?? 0.4,
      };
    }
    await page.mouse.wheel(0, 850);
    await delay(350);
  }
  ctx.logger?.debug?.(`[uber] sin match tras ${maxScrolls} scrolls`);
  if (ctx.debugDump && ctx.runDir && ctx.label) {
    const html = await page.content().catch(() => '');
    writeDebugFile(ctx.runDir, `${ctx.label}-no-match.html`, html, { logger: ctx.logger });
  }
  return {
    found: false,
    product_display_name: null,
    matched_snippet: null,
    product_price: null,
    eta_range: null,
    match_confidence: 0,
  };
}

/**
 * Nombre del ítem en el menú Uber Eats (línea matcheada + continuación si aplica).
 * @param {string[]} lines
 * @param {number} matchIdx
 * @param {string} matchedLine
 */
function buildUberProductDisplayName(lines, matchIdx, matchedLine) {
  let name = matchedLine;
  const next = lines[matchIdx + 1];
  if (!next) return name;
  if (/^\$\s*[\d]/.test(next) || /^\d+\s*[-–]?\s*\d*\s*min/i.test(next)) return name;
  if (next.length > 0 && next.length < 160) name = `${name} ${next}`.trim();
  return name;
}

/**
 * Intenta leer fees/ETA del header de tienda o barra sticky.
 * @param {import('playwright').Page} page
 */
async function readStoreHeaderHints(page) {
  const text = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
  let delivery_fee = null;
  const dm = text.match(/(?:delivery|env[ií]o)[^\n]*\$\s*[\d.,]+/i);
  if (dm) delivery_fee = dm[0].match(/\$\s*[\d.,]+/)?.[0] ?? dm[0].slice(0, 60);

  let service_fee = null;
  const sm = text.match(/(?:service\s*fee|tarifa|comisi[oó]n)[^\n]*\$\s*[\d.,]+/i);
  if (sm) service_fee = sm[0].match(/\$\s*[\d.,]+/)?.[0] ?? sm[0].slice(0, 60);

  const eta_range = text.match(/\d+\s*[-–]\s*\d+\s*min/)?.[0] ?? text.match(/\d+\s*min/)?.[0] ?? null;

  const promotions = [];
  if (/env[ií]o\s*gratis|gratis/i.test(text)) promotions.push('envío gratis');
  if (/descuento|\d+\s*%/i.test(text)) promotions.push('descuento');

  return { delivery_fee, service_fee, eta_range, promotions };
}

/**
 * @param {object} opts
 */
export async function runUberEatsForAddress(opts) {
  const {
    page,
    address,
    runDir,
    products,
    maxStoresPerRun,
    logger,
    delayMsBetweenActions,
    delayMsBetweenProducts,
    delayMsBetweenStores,
    verticalFilter,
    debugDump,
  } = opts;

  const shot = (name) => path.join(runDir, 'screenshots', `uber-${address.id}-${name}.png`);

  const prods = verticalFilter
    ? products.filter((p) => p.vertical === verticalFilter)
    : products;

  /** @type {object[]} */
  const records = [];

  logger.debug?.(`[uber] Inicio dirección ${address.id} · productos=${prods.map((p) => p.id).join(',')}`);

  await setUberLocation(page, address, logger, delayMsBetweenActions);

  for (const product of prods) {
    const searchUrl = await uberGlobalSearch(
      page,
      product.searchQuery,
      shot(`${product.id}-search`),
      delayMsBetweenActions,
      {
        logger,
        debugDump,
        runDir,
        addressId: address.id,
        productId: product.id,
        address,
        delayMsBetweenActions,
      },
    );

    for (let storeIdx = 0; storeIdx < maxStoresPerRun; storeIdx++) {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await delay(1500);
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});

      await waitForUberSearchResultsHydration(page, logger);
      const count = await countUberSearchStoreLinks(page);
      logger.debug?.(`[uber] tienda índice ${storeIdx}: enlaces tienda disponibles=${count}`);
      if (storeIdx >= count) {
        logger.info(`Uber Eats ${address.id} ${product.id}: solo ${count} tiendas, se pidió índice ${storeIdx}`);
        break;
      }

      const nameHref = await clickUberStoreSearchResult(page, storeIdx, logger);
      if (!nameHref) {
        logger.info(`Uber Eats ${address.id} ${product.id}: no se pudo abrir tienda índice ${storeIdx}`);
        break;
      }
      await delay(2000);
      await page.waitForLoadState('networkidle', { timeout: 35_000 }).catch(() => {});

      const storeUrl = page.url();
      logger.debug?.(`[uber] tienda abierta storeIdx=${storeIdx} URL=${storeUrl}`);

      if (debugDump) {
        const html = await page.content().catch(() => '');
        writeDebugFile(
          runDir,
          `uber-${address.id}-${product.id}-store-${storeIdx}.html`,
          html,
          { logger },
        );
      }

      const pageTitle = (await page.title().catch(() => '')) || '';
      const store_name =
        pageTitle.split(/\||–|-/)[0]?.replace(/a domicilio.*/i, '').trim() || null;

      const header = await readStoreHeaderHints(page);
      logger.debug?.(
        `[uber] header hints: delivery_fee=${header.delivery_fee} service_fee=${header.service_fee} eta=${header.eta_range}`,
      );

      const found = await findProductInStoreMenu(page, product.matchPatterns, 28, {
        logger,
        debugDump,
        runDir,
        label: `uber-${address.id}-${product.id}-store-${storeIdx}`,
      });

      await page
        .screenshot({
          path: shot(`${product.id}-store-${storeIdx}`),
          fullPage: false,
        })
        .catch(() => {});

      const rec = {
        platform: 'uber-eats-ar',
        address_id: address.id,
        address_label: address.label,
        zone_type: address.zone_type,
        product_id: product.id,
        product_label: product.label,
        product_display_name: found.product_display_name ?? found.matched_snippet ?? null,
        vertical: product.vertical,
        store_index: storeIdx,
        store_name,
        store_url: storeUrl,
        store_href: nameHref,
        product_price: found.product_price,
        delivery_fee: header.delivery_fee,
        service_fee: header.service_fee,
        eta_range: found.eta_range || header.eta_range,
        promotions: header.promotions,
        store_open: null,
        total_checkout: null,
        match_confidence: found.match_confidence,
        matched_snippet: found.matched_snippet,
        error: found.found ? null : 'Producto no encontrado en menú tras scroll',
        notes: found.found ? null : 'Probar otro query o ampliar patrones; nombre en menú puede diferir.',
        captured_at: new Date().toISOString(),
        screenshot: shot(`${product.id}-store-${storeIdx}`),
        search_url: searchUrl,
      };
      records.push(rec);
      appendJsonl(runDir, rec);

      await delay(delayMsBetweenStores);
    }

    await delay(delayMsBetweenProducts);
  }

  return records;
}

import path from 'path';
import { bestMatchingCandidate } from '../lib/productMatch.js';
import { delay } from '../lib/playwrightContext.js';
import { writeDebugFile } from '../lib/debugDump.js';
import { appendJsonl } from '../lib/output.js';

const RAPPI_HOME = 'https://www.rappi.com.ar/';

/**
 * Cierra banners comunes (cookies, avisos) que tapan el header.
 * @param {import('playwright').Page} page
 */
async function dismissRappiOverlays(page) {
  const candidates = [
    page.getByRole('button', { name: /^(Aceptar todo|Aceptar|Acepto|Entendido|OK|Cerrar)$/i }),
    page.getByRole('button', { name: /Aceptar.*cookies/i }),
    page.locator('[class*="cookie"] button').first(),
  ];
  for (const loc of candidates) {
    try {
      const el = loc.first ? loc.first() : loc;
      await el.waitFor({ state: 'visible', timeout: 2000 });
      await el.click({ timeout: 3000 });
      await delay(400);
    } catch {
      // no hay overlay o no coincide
    }
  }
}

/**
 * True si el input del modal de dirección ya está en pantalla (sesión con dirección previa u otro estado).
 * @param {import('playwright').Page} page
 */
async function rappiAddressFieldVisible(page) {
  const input = page.getByRole('textbox', {
    name: /Escribí la dirección|Escribí tu dirección|Escribí la dirección de/i,
  });
  return input.isVisible({ timeout: 2000 }).catch(() => false);
}

/**
 * Abre el flujo de dirección: si ya hay dirección guardada (p. ej. "Castellanos") no existe "Ingresar mi ubicación";
 * se usa "Cambiar dirección" o el chip de la barra superior.
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('../lib/logger.js').createLogger>} logger
 */
async function openRappiLocationPicker(page, logger) {
  if (await rappiAddressFieldVisible(page)) {
    logger.debug(
      '[rappi] Campo "Escribí la dirección" ya visible (modal abierto o flujo directo); no se busca Ingresar ubicación',
    );
    return;
  }

  /** Clic para cambiar dirección cuando ya hay una guardada (no aparece Ingresar mi ubicación). */
  const changeLocationStrategies = [
    () =>
      page.getByRole('button', {
        name: /Cambiar (la )?dirección|Cambiar ubicación|Editar dirección|Editar ubicación|Modificar dirección/i,
      }),
    () => page.getByRole('button', { name: /Agregar dirección|Nueva dirección|Otra dirección/i }),
    () => page.locator('button, a').filter({ hasText: /Cambiar.*dirección|Cambiar.*ubicación/i }),
    () =>
      page
        .locator('#rappi-web-toolbar, [data-qa="header-container"]')
        .getByRole('button')
        .filter({
          hasText:
            /Castellanos|Palermo|Belgrano|CABA|Buenos Aires|Córdoba|Av\.|Av |Calle |Bs\.?\s*As|,\s*CABA|,\s*B/i,
        }),
    () =>
      page
        .locator('#rappi-web-toolbar, [data-qa="header-container"]')
        .getByRole('button')
        .nth(1),
  ];

  for (let i = 0; i < changeLocationStrategies.length; i++) {
    try {
      const loc = changeLocationStrategies[i]().first();
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      await loc.click({ timeout: 12_000 });
      logger.debug(`[rappi] Cambio de ubicación: estrategia ${i + 1} (dirección previa en barra)`);
      await delay(700);
      if (await rappiAddressFieldVisible(page)) return;
    } catch (e) {
      logger.debug?.(`[rappi] cambio ubicación estrategia ${i + 1}: ${e?.message || e}`);
    }
  }

  const strategies = [
    () => page.getByRole('button', { name: /Ingresar mi ubicación|Ingresá tu ubicación|Ingresar ubicación|Mi ubicación/i }),
    () => page.locator('[role="button"]').filter({ hasText: /Ingresar.*ubicación|Ingresá.*ubicación|ubicación/i }),
    () => page.locator('#rappi-web-toolbar, [data-qa="header-container"]').getByRole('button').filter({ hasText: /ubicación/i }),
    () => page.getByRole('button', { name: /ubicación/i }),
    () => page.getByRole('link', { name: /ubicación/i }),
    () => page.locator('button').filter({ hasText: /Ingresar.*ubicación|Ingresá.*ubicación/i }),
    () => page.locator('a').filter({ hasText: /Ingresar.*ubicación|ubicación/i }),
    () => page.locator('[class*="Toolbar"]').getByRole('button').filter({ hasText: /ubicación/i }),
  ];

  let lastErr;
  for (let i = 0; i < strategies.length; i++) {
    try {
      const loc = strategies[i]();
      await loc.first().waitFor({ state: 'visible', timeout: 12_000 });
      await loc.first().click({ timeout: 15_000 });
      logger.debug(`Ubicación Rappi: estrategia Ingresar ${i + 1} OK`);
      return;
    } catch (e) {
      lastErr = e;
      logger.debug?.(`Ubicación Rappi estrategia Ingresar ${i + 1} falló: ${e?.message || e}`);
    }
  }
  throw lastErr ?? new Error('No se pudo abrir el selector de ubicación en Rappi');
}

/**
 * @param {import('playwright').Page} page
 * @param {object} address
 * @param {ReturnType<import('../lib/logger.js').createLogger>} logger
 * @param {number} actionDelay
 */
export async function setRappiAddress(page, address, logger, actionDelay) {
  await page.goto(RAPPI_HOME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await delay(actionDelay);

  await dismissRappiOverlays(page);
  await delay(500);

  await openRappiLocationPicker(page, logger);
  await delay(actionDelay);

  // Playbook: "Escribí la dirección de" — incluir variantes por si cambia el label accesible
  const input = page.getByRole('textbox', {
    name: /Escribí la dirección|Escribí tu dirección|Escribí la dirección de/i,
  });
  await input.waitFor({ state: 'visible', timeout: 20_000 });
  await input.click({ clickCount: 3 }).catch(() => {});
  await input.fill(address.rappiAddressQuery);
  await delay(1500);

  const sugRe = new RegExp(address.rappiSuggestionMatch, 'i');
  const suggestion = page.getByRole('button').filter({ hasText: sugRe }).first();
  await suggestion.click({ timeout: 15_000 }).catch(async () => {
    await page.getByRole('option').filter({ hasText: sugRe }).first().click({ timeout: 12_000 });
  });
  await delay(800);

  const confirmNames = [
    /Confirmar dirección/i,
    /Confirmar ubicación/i,
    /Confirmar la dirección/i,
    /Confirmar la ubicación/i,
  ];
  let confirmed = false;
  for (const re of confirmNames) {
    try {
      await page.getByRole('button', { name: re }).first().click({ timeout: 12_000 });
      confirmed = true;
      break;
    } catch {
      // siguiente variante
    }
  }
  if (!confirmed) {
    try {
      await page
        .locator('button, [role="button"]')
        .filter({ hasText: /Confirmar/i })
        .filter({ hasText: /dirección|ubicación|Dirección|Ubicación/i })
        .first()
        .click({ timeout: 12_000 });
      confirmed = true;
    } catch {
      // Enter a veces confirma el mapa sin botón accesible
      await input.press('Enter');
      await delay(500);
    }
  }
  await delay(actionDelay);

  const save = page.getByRole('button', { name: /Guardar dirección/i });
  await save.click({ timeout: 20_000 }).catch(() => logger.warn('No se encontró Guardar dirección; puede ser opcional'));
  await delay(actionDelay + 400);
}

/**
 * Tras guardar dirección a veces queda un modal o el label del buscador cambia.
 * @param {import('playwright').Page} page
 */
async function prepareRappiSearchUI(page) {
  await dismissRappiOverlays(page);
  await page.keyboard.press('Escape').catch(() => {});
  await delay(400);
  await page.keyboard.press('Escape').catch(() => {});
  await delay(300);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await delay(300);
}

/**
 * @param {import('playwright').Page} page
 * @param {{ debug?: (m: string) => void }} [logger]
 */
async function resolveRappiSearchInput(page, logger) {
  const strategies = [
    () => page.getByRole('searchbox', { name: /Comida, restaurantes, tiendas/i }),
    () => page.getByRole('searchbox', { name: /Comida|restaurantes|tiendas|Buscar/i }),
    () => page.getByPlaceholder(/Comida|Buscar|buscar|restaurantes|tiendas|¿Qué/i),
    () => page.locator('input[type="search"]').first(),
    () => page.locator('#rappi-web-toolbar input[type="text"], [data-qa="header-container"] input[type="text"]').first(),
    () => page.locator('header input[type="text"]').first(),
    () => page.locator('[data-testid*="search"] input, [data-qa*="search"] input').first(),
    () => page.locator('input[aria-label*="Buscar" i], input[aria-label*="Comida" i]').first(),
  ];
  let lastErr;
  for (let i = 0; i < strategies.length; i++) {
    try {
      const loc = strategies[i]();
      await loc.waitFor({ state: 'visible', timeout: 12_000 });
      logger?.debug?.(`[rappi] campo búsqueda vía estrategia ${i + 1}`);
      return loc;
    } catch (e) {
      lastErr = e;
      logger?.debug?.(`[rappi] búsqueda estrategia ${i + 1}: ${e?.message || e}`);
    }
  }
  throw lastErr ?? new Error('No se encontró el campo de búsqueda global en Rappi');
}

/**
 * @param {import('playwright').Page} page
 * @param {string} query
 * @param {string[]} matchPatterns
 * @param {string} screenshotPath
 * @param {number} actionDelay
 * @param {{ runDir?: string; addressId?: string; productId?: string; logger?: { debug?: (m: string) => void }; debugDump?: boolean }} [ctx]
 */
export async function rappiSearchAndExtract(
  page,
  query,
  matchPatterns,
  screenshotPath,
  actionDelay,
  ctx = {},
) {
  await prepareRappiSearchUI(page);
  const search = await resolveRappiSearchInput(page, ctx.logger);
  await search.click({ timeout: 15_000 });
  await search.fill(query);
  await search.press('Enter');
  await delay(3000);
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});

  await scrollRappiSearchResults(page, actionDelay, ctx.logger);

  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

  if (ctx.debugDump && ctx.runDir && ctx.addressId && ctx.productId) {
    const html = await page.content().catch(() => '');
    const label = `rappi-${ctx.addressId}-${ctx.productId}-search`;
    writeDebugFile(ctx.runDir, `${label}.html`, html, { logger: ctx.logger });
    const inner = await page.locator('body').innerText().catch(() => '');
    writeDebugFile(ctx.runDir, `${label}-body.txt`, inner, { logger: ctx.logger });
    ctx.logger?.debug(
      `[rappi] URL tras búsqueda: ${page.url()} · body.innerText length=${inner.length}`,
    );
  }

  return extractRappiResults(page, matchPatterns, ctx);
}

/**
 * Carga resultados lazy (varias tiendas) antes de extraer.
 * @param {import('playwright').Page} page
 * @param {number} actionDelay
 */
async function scrollRappiSearchResults(page, actionDelay, logger) {
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, Math.min(window.innerHeight * 0.9, 900)));
    await delay(Math.max(400, actionDelay));
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
    logger?.debug?.(`[rappi] scroll search paso ${i + 1}/6`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(400);
}

/**
 * Precio AR típico en Rappi: $ 24.300,00
 * @param {string} s
 */
function extractPriceFromString(s) {
  if (!s) return null;
  const m =
    s.match(/\$\s*[\d]{1,3}(?:\.[\d]{3})*(?:,\d{2})?/) ||
    s.match(/\$\s*[\d]+(?:,\d{2})?/) ||
    s.match(/[\d]{1,3}(?:\.[\d]{3})*(?:,\d{2})(?=\s|$)/);
  return m ? m[0].trim() : null;
}

/**
 * Separa la tarjeta de búsqueda en meta (antes del CTA) y cuerpo (productos/precios).
 * @param {string} snippet
 */
function splitRappiCardAtIrALaTienda(snippet) {
  const re = /Ir a la tienda/i;
  const m = re.exec(snippet);
  if (!m || m.index === undefined) return { header: snippet.trim(), body: '' };
  const header = snippet.slice(0, m.index).trim();
  const body = snippet.slice(m.index + m[0].length).trim();
  return { header, body };
}

/**
 * Rompe líneas pegadas tipo "Resto13 min•$ 0,00" para que el nombre de tienda sea legible.
 * @param {string} header
 */
function preprocessRappiHeaderLines(header) {
  return header
    .replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ0-9)])(\d{1,2}\s*[-–]\s*\d+\s*min\b)/gi, '$1\n$2')
    .replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ0-9)])(\d{1,3}\s*min\b)/gi, '$1\n$2');
}

/**
 * @param {string} header
 */
function guessStoreNameFromRappiHeader(header) {
  const lines = preprocessRappiHeaderLines(header)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const skip =
    /^(top|buscar|filtrar|ordenar|resultados|categor[ií]as|ver\s+m[aá]s|volver|men[uú]|inicio|tiendas?|restaurantes?)$/i;
  for (const L of lines) {
    if (L.length < 3 || L.length > 95) continue;
    if (skip.test(L)) continue;
    if (/^\d+\s*min/i.test(L)) continue;
    if (/^\$\s*[\d]/.test(L)) continue;
    if (/^[•·⋅∙]/.test(L)) continue;
    if (/^\d+[.,]\d+$/.test(L)) continue;
    if (/^env[ií]o/i.test(L)) continue;
    return L;
  }
  return lines[0] && lines[0].length < 100 ? lines[0] : 'unknown';
}

/**
 * ETA y envío desde el bloque previo a "Ir a la tienda" (sin líneas de producto).
 * @param {string} header
 */
function extractRappiHeaderMeta(header) {
  const normalized = preprocessRappiHeaderLines(header);
  const promotions = [];
  if (/env[ií]o\s*gratis/i.test(normalized)) promotions.push('envío gratis');
  if (/descuento|off|%/i.test(normalized)) promotions.push('descuento');

  const eta_range =
    normalized.match(/\d+\s*[-–]\s*\d+\s*min|\d+\s*min(?:utos)?/i)?.[0] ?? null;

  const priceRe =
    /\$\s*[\d]{1,3}(?:\.[\d]{3})*(?:,\d{2})?(?=\s|$)|\$\s*[\d]+(?:,\d{2})?/g;
  const prices = normalized.match(priceRe) || [];
  let delivery_fee = prices[0] ?? null;
  if (!delivery_fee && /env[ií]o\s*gratis/i.test(normalized)) delivery_fee = '$ 0,00';

  const store_name = guessStoreNameFromRappiHeader(header);

  return { store_name, eta_range, delivery_fee, promotions };
}

/**
 * Una fila por bloque "Ir a la tienda": producto matcheado en el cuerpo; métricas en el header.
 * @param {string} snippet
 * @param {string[]} matchPatterns
 * @param {string} href
 */
function extractRowFromIrALaTiendaBlock(snippet, matchPatterns, href) {
  const { header, body } = splitRappiCardAtIrALaTienda(snippet);
  if (!body || body.length < 4) return null;

  const bodyLines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const bm = bestMatchingCandidate(bodyLines, matchPatterns);
  if (!bm.matched) return null;

  let productPrice = extractPriceFromString(bm.text);
  const idx = bodyLines.indexOf(bm.text);
  if (!productPrice && idx >= 0) {
    for (let j = idx; j <= Math.min(bodyLines.length - 1, idx + 4); j++) {
      productPrice = extractPriceFromString(bodyLines[j]);
      if (productPrice) break;
    }
  }
  if (!productPrice && idx >= 0) {
    const near = bodyLines.slice(Math.max(0, idx - 1), Math.min(bodyLines.length, idx + 5)).join('\n');
    productPrice = extractPriceFromString(near);
  }

  const meta = extractRappiHeaderMeta(header);
  const product_display_name = buildProductDisplayNameFromLines(bodyLines, bm.text);
  const bodyMetrics = parseSnippetMetrics(body);
  const promotions = [...new Set([...meta.promotions, ...bodyMetrics.promotions])];

  const storeUrl =
    href && href.startsWith('http')
      ? href
      : href && href.startsWith('/')
        ? `https://www.rappi.com.ar${href.split('?')[0]}`
        : null;

  return {
    store_name: meta.store_name,
    product_display_name,
    product_price: productPrice,
    delivery_fee: meta.delivery_fee ?? bodyMetrics.delivery_fee,
    service_fee: bodyMetrics.service_fee,
    eta_range: meta.eta_range ?? bodyMetrics.eta_range,
    promotions,
    raw_snippet: snippet.slice(0, 800),
    match_confidence: bm.confidence ?? 0.45,
    store_url: storeUrl,
    notes: 'rappi:ir-a-la-tienda',
  };
}

/**
 * Encuentra contenedores por CTA "Ir a la tienda" (evita el carrusel de anchors genéricos).
 * @param {import('playwright').Page} page
 */
async function collectRappiIrALaTiendaBlocks(page) {
  return page.evaluate(() => {
    const base = 'https://www.rappi.com.ar';

    /**
     * @param {string} href
     */
    function normalizeHref(href) {
      if (!href || href.startsWith('#')) return '';
      try {
        if (href.startsWith('/')) return base + href.split('?')[0];
        if (href.includes('rappi.com.ar')) return href.split('?')[0];
      } catch {
        return '';
      }
      return '';
    }

    /** @type {HTMLElement[]} */
    const ctas = [];
    document.querySelectorAll('a[href], button, [role="button"]').forEach((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^Ir a la tienda$/i.test(t)) ctas.push(/** @type {HTMLElement} */ (el));
    });

    const seen = new Set();
    /** @type {{ href: string; snippet: string }[]} */
    const out = [];

    for (const el of ctas) {
      let href = '';
      if (el.tagName === 'A') href = normalizeHref(el.getAttribute('href') || '');
      else {
        const a = el.closest('a[href]');
        if (a) href = normalizeHref(a.getAttribute('href') || '');
      }

      let p = el.parentElement;
      for (let d = 0; d < 14 && p; d++) {
        const txt = (p.innerText || '').trim();
        if (txt.length > 120 && txt.length < 8000 && /Ir a la tienda/i.test(txt)) {
          const key = txt.slice(0, 360);
          if (seen.has(key)) break;
          seen.add(key);
          out.push({ href, snippet: txt.slice(0, 6000) });
          break;
        }
        p = p.parentElement;
      }
    }

    return { items: out, ctaCount: ctas.length };
  });
}

/**
 * Extrae métricas del bloque de card, priorizando el precio en la línea del producto matcheado.
 * @param {string} snippet
 * @param {string[]} matchPatterns
 * @param {string} href
 */
function extractRowFromCardSnippet(snippet, matchPatterns, href) {
  const lines = snippet.split('\n').map((l) => l.trim()).filter(Boolean);
  const bm = bestMatchingCandidate(lines, matchPatterns);
  if (!bm.matched) return null;

  let productPrice = extractPriceFromString(bm.text);
  const idx = lines.indexOf(bm.text);
  if (!productPrice && idx >= 0) {
    for (let j = idx; j <= Math.min(lines.length - 1, idx + 3); j++) {
      productPrice = extractPriceFromString(lines[j]);
      if (productPrice) break;
    }
  }
  if (!productPrice && idx >= 0) {
    const near = lines.slice(Math.max(0, idx - 1), Math.min(lines.length, idx + 4)).join('\n');
    productPrice = extractPriceFromString(near);
  }

  const cardMetrics = parseSnippetMetrics(snippet);
  const storeName = guessStoreNameFromCardLines(lines, bm.text);
  const product_display_name = buildProductDisplayNameFromLines(lines, bm.text);

  return {
    store_name: storeName,
    product_display_name,
    product_price: productPrice,
    delivery_fee: cardMetrics.delivery_fee,
    service_fee: cardMetrics.service_fee,
    eta_range: cardMetrics.eta_range,
    promotions: cardMetrics.promotions,
    raw_snippet: snippet.slice(0, 800),
    match_confidence: bm.confidence ?? 0.3,
    store_url: href.startsWith('http') ? href : `https://www.rappi.com.ar${href}`,
  };
}

/**
 * Nombre del producto tal como aparece en la UI (línea matcheada + línea siguiente si parece continuación).
 * @param {string[]} lines
 * @param {string} matchedLine
 */
function buildProductDisplayNameFromLines(lines, matchedLine) {
  const idx = lines.indexOf(matchedLine);
  if (idx < 0) return matchedLine;
  let name = matchedLine;
  const next = lines[idx + 1];
  if (!next) return name;
  if (/^\$\s*[\d]/.test(next) || /^\d+\s*[-–]?\s*\d*\s*min/i.test(next)) return name;
  if (extractPriceFromString(next) && next.length < 40) return name;
  if (next.length > 0 && next.length < 160) name = `${name} ${next}`.trim();
  return name;
}

/**
 * @param {string[]} lines
 * @param {string} matchedLine
 */
function guessStoreNameFromCardLines(lines, matchedLine) {
  const mi = lines.indexOf(matchedLine);
  for (let i = 0; i < Math.min(mi, 4); i++) {
    const L = lines[i];
    if (L.length > 2 && L.length < 90 && !/^\$\s*[\d]/.test(L) && !/^\d+\s*min/i.test(L)) {
      return L;
    }
  }
  return lines[0] && lines[0].length < 100 ? lines[0] : 'unknown';
}

/**
 * Extrae resultados de búsqueda: enlaces a tiendas (patrones amplios) + fallback por bloques.
 * Dedup por `href` completo (sin query) para no colapsar varias tiendas bajo el mismo prefijo.
 * @param {import('playwright').Page} page
 * @param {string[]} matchPatterns
 * @param {{ logger?: { debug?: (m: string) => void }; debugDump?: boolean; runDir?: string; addressId?: string; productId?: string }} [ctx]
 */
async function extractRappiResults(page, matchPatterns, ctx = {}) {
  const ir = await collectRappiIrALaTiendaBlocks(page);
  ctx.logger?.debug?.(
    `[rappi] Ir a la tienda: ctas=${ir.ctaCount} bloques=${ir.items.length}`,
  );

  /** @type {object[]} */
  const irRows = [];
  for (const e of ir.items) {
    const row = extractRowFromIrALaTiendaBlock(e.snippet, matchPatterns, e.href);
    if (row) {
      irRows.push(row);
      ctx.logger?.debug?.(
        `[rappi] ir-block OK store=${row.store_name} eta=${row.eta_range} delivery=${row.delivery_fee} price=${row.product_price} display=${(row.product_display_name || '').slice(0, 72)}`,
      );
    }
  }

  if (irRows.length > 0) {
    ctx.logger?.debug?.(`[rappi] ${irRows.length} filas desde bloques Ir a la tienda`);
    if (ctx.debugDump && ctx.runDir && ctx.addressId && ctx.productId) {
      writeDebugFile(
        ctx.runDir,
        `rappi-${ctx.addressId}-${ctx.productId}-extract-stats.json`,
        JSON.stringify(
          {
            mode: 'ir-a-la-tienda',
            ctaCount: ir.ctaCount,
            blocks: ir.items.length,
            rows: irRows.length,
            rowsPreview: irRows.slice(0, 8),
          },
          null,
          2,
        ),
        { logger: ctx.logger },
      );
    }
    return irRows;
  }

  const evaluated = await page.evaluate(() => {
    const base = 'https://www.rappi.com.ar';

    /**
     * @param {string} href
     */
    function normalizeHref(href) {
      if (!href || href.startsWith('#')) return '';
      try {
        if (href.startsWith('/')) return base + href.split('?')[0];
        if (href.includes('rappi.com.ar')) return href.split('?')[0];
      } catch {
        return '';
      }
      return '';
    }

    /**
     * @param {string} path
     */
    function looksLikeStorePath(path) {
      if (!path || path.length < 6) return false;
      const p = path.toLowerCase();
      if (p.includes('/search') || p.includes('/login') || p.includes('/help')) return false;
      return (
        /\/(restaurantes?|tiendas?|farmacias?|droguerias?|market|stores?|ds|product|grupo|rp|catalogo|catalog)\b/i.test(
          p,
        ) || p.split('/').filter(Boolean).length >= 3
      );
    }

    /** @type {{ href: string; snippet: string }[]} */
    const out = [];
    /** Dedup por URL canónica completa (una card por enlace distinto). */
    const seen = new Set();
    let totalAnchors = 0;
    let normalizedEmpty = 0;
    let pathRejected = 0;
    let dedupeSkipped = 0;
    let noParentText = 0;

    document.querySelectorAll('a[href]').forEach((a) => {
      totalAnchors++;
      const raw = a.getAttribute('href') || '';
      const href = normalizeHref(raw);
      if (!href) {
        normalizedEmpty++;
        return;
      }
      let path = '';
      try {
        path = new URL(href).pathname;
      } catch {
        normalizedEmpty++;
        return;
      }
      if (!looksLikeStorePath(path)) {
        pathRejected++;
        return;
      }

      const key = href.replace(/\/$/, '');
      if (seen.has(key)) {
        dedupeSkipped++;
        return;
      }

      let el = /** @type {Element | null} */ (a);
      let got = false;
      for (let d = 0; d < 14 && el; d++) {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length > 45 && t.length < 4500) {
          seen.add(key);
          out.push({ href, snippet: t.slice(0, 2800) });
          got = true;
          break;
        }
        el = el.parentElement;
      }
      if (!got) noParentText++;
    });

    return {
      items: out,
      stats: {
        totalAnchors,
        normalizedEmpty,
        pathRejected,
        dedupeSkipped,
        noParentText,
        cardsCollected: out.length,
      },
    };
  });

  const { items, stats } = evaluated;
  ctx.logger?.debug?.(
    `[rappi] DOM anchors: total=${stats.totalAnchors} sinHref=${stats.normalizedEmpty} pathRejected=${stats.pathRejected} dedupeSkipped=${stats.dedupeSkipped} sinTextoCard=${stats.noParentText} cards=${stats.cardsCollected}`,
  );

  const rows = [];
  let patternRejected = 0;
  for (const e of items) {
    const row = extractRowFromCardSnippet(e.snippet, matchPatterns, e.href);
    if (row) {
      rows.push(row);
      ctx.logger?.debug?.(
        `[rappi] card OK href=${e.href.slice(0, 120)}… store=${row.store_name} price=${row.product_price} display=${(row.product_display_name || '').slice(0, 80)}`,
      );
    } else {
      patternRejected++;
      ctx.logger?.debug?.(
        `[rappi] card sin match de producto (snippet ${e.snippet.slice(0, 120)}…)`,
      );
    }
  }
  ctx.logger?.debug?.(
    `[rappi] resumen: ${rows.length} filas con match, ${patternRejected} cards sin match de regex`,
  );

  if (ctx.debugDump && ctx.runDir && ctx.addressId && ctx.productId) {
    writeDebugFile(
      ctx.runDir,
      `rappi-${ctx.addressId}-${ctx.productId}-extract-stats.json`,
      JSON.stringify({ stats, patternRejected, rowsPreview: rows.slice(0, 5) }, null, 2),
      { logger: ctx.logger },
    );
  }

  if (rows.length > 0) return rows;

  ctx.logger?.debug?.('[rappi] fallback: innerText completo (sin cards con match)');
  const bodyText = await page.locator('body').innerText();
  const lines = bodyText.split('\n').map((l) => l.trim()).filter((l) => l.length > 2);
  const bm = bestMatchingCandidate(lines, matchPatterns);
  if (bm.matched) {
    const windowText = lines.slice(Math.max(0, bm.idx - 1), bm.idx + 5).join('\n');
    const productPrice = extractPriceFromString(bm.text) || extractPriceFromString(windowText);
    const metrics = parseSnippetMetrics(windowText);
    rows.push({
      store_name: 'unknown',
      product_display_name: buildProductDisplayNameFromLines(lines, bm.text),
      product_price: productPrice ?? metrics.product_price,
      delivery_fee: metrics.delivery_fee,
      service_fee: metrics.service_fee,
      eta_range: metrics.eta_range,
      promotions: metrics.promotions,
      raw_snippet: bm.text,
      match_confidence: bm.confidence ?? 0.2,
      store_url: null,
      notes:
        'Fallback página completa: no se detectaron tarjetas por enlace; conviene revisar selectores si persiste.',
    });
  }
  return rows;
}

/**
 * @param {string} text
 */
function parseSnippetMetrics(text) {
  const promotions = [];
  if (/env[ií]o\s*gratis|gratis/i.test(text)) promotions.push('envío gratis');
  if (/descuento|off|%/i.test(text)) promotions.push('descuento');
  if (/cup[oó]n|promo/i.test(text)) promotions.push('cupón/promo');

  const priceRe = /\$\s*[\d]{1,3}(?:[.,][\d]{3})*(?:[.,][\d]{2})?|[\d]{1,3}(?:[.,][\d]{3})*(?:[.,][\d]{2})?\s*(?:ARS|pesos)/gi;
  const prices = text.match(priceRe) || [];
  const product_price = prices[0] ?? null;

  let delivery_fee = null;
  const dm = text.match(/(?:env[ií]o|delivery|entrega)[^\n$]*\$[^\n]+/i);
  if (dm) delivery_fee = dm[0].match(/\$\s*[\d.,]+/)?.[0] ?? dm[0].slice(0, 80);

  let service_fee = null;
  const sm = text.match(/(?:servicio|service\s*fee|fee\s*de\s*servicio)[^\n$]*\$[^\n]+/i);
  if (sm) service_fee = sm[0].match(/\$\s*[\d.,]+/)?.[0] ?? sm[0].slice(0, 80);

  let eta_range = null;
  const em = text.match(/\d+\s*[-–]\s*\d+\s*min|\d+\s*min(?:utos)?/i);
  if (em) eta_range = em[0];

  return {
    product_price,
    delivery_fee,
    service_fee,
    eta_range,
    promotions,
  };
}

/**
 * @param {object} opts
 */
export async function runRappiForAddress(opts) {
  const {
    page,
    address,
    runDir,
    products,
    maxStoresPerRun,
    logger,
    delayMsBetweenActions,
    delayMsBetweenProducts,
    verticalFilter,
    debugDump,
  } = opts;

  const shot = (name) => path.join(runDir, 'screenshots', `rappi-${address.id}-${name}.png`);

  const prods = verticalFilter
    ? products.filter((p) => p.vertical === verticalFilter)
    : products;

  /** @type {object[]} */
  const records = [];

  logger.debug?.(`[rappi] Inicio dirección ${address.id} · productos=${prods.map((p) => p.id).join(',')}`);

  await setRappiAddress(page, address, logger, delayMsBetweenActions);

  for (const product of prods) {
    const rel = await rappiSearchAndExtract(
      page,
      product.searchQuery,
      product.matchPatterns,
      shot(`${product.id}-search`),
      delayMsBetweenActions,
      {
        runDir,
        addressId: address.id,
        productId: product.id,
        logger,
        debugDump,
      },
    );

    const slice = rel.slice(0, maxStoresPerRun);
    if (slice.length === 0) {
      const rec = {
        platform: 'rappi-ar',
        address_id: address.id,
        address_label: address.label,
        zone_type: address.zone_type,
        product_id: product.id,
        product_label: product.label,
        product_display_name: null,
        vertical: product.vertical,
        store_name: null,
        store_url: null,
        product_price: null,
        delivery_fee: null,
        service_fee: null,
        eta_range: null,
        promotions: [],
        store_open: null,
        total_checkout: null,
        match_confidence: 0,
        matched_snippet: null,
        error: null,
        notes: 'Sin coincidencias de producto en resultados visibles (puede requerir otro query o la UI cambió).',
        captured_at: new Date().toISOString(),
        screenshot: shot(`${product.id}-search`),
      };
      records.push(rec);
      appendJsonl(runDir, rec);
      continue;
    }

    for (const row of slice) {
      const rec = {
        platform: 'rappi-ar',
        address_id: address.id,
        address_label: address.label,
        zone_type: address.zone_type,
        product_id: product.id,
        product_label: product.label,
        product_display_name: row.product_display_name ?? null,
        vertical: product.vertical,
        store_name: row.store_name,
        store_url: row.store_url,
        product_price: row.product_price,
        delivery_fee: row.delivery_fee,
        service_fee: row.service_fee,
        eta_range: row.eta_range,
        promotions: row.promotions,
        store_open: null,
        total_checkout: null,
        match_confidence: row.match_confidence,
        matched_snippet: row.raw_snippet?.slice(0, 500),
        error: null,
        notes: row.notes ?? null,
        captured_at: new Date().toISOString(),
        screenshot: shot(`${product.id}-search`),
      };
      records.push(rec);
      appendJsonl(runDir, rec);
    }
    await delay(delayMsBetweenProducts);
  }

  return records;
}

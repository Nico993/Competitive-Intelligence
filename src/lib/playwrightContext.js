import { chromium } from 'playwright';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * @param {{ headless?: boolean, slowMoMs?: number, proxyServer?: string }} opts
 */
export async function launchBrowser(opts = {}) {
  const launchOpts = {
    headless: opts.headless !== false,
    ...(opts.slowMoMs ? { slowMo: opts.slowMoMs } : {}),
    ...(opts.proxyServer ? { proxy: { server: opts.proxyServer } } : {}),
  };
  return chromium.launch(launchOpts);
}

/**
 * @param {import('playwright').Browser} browser
 * @param {{ viewport?: { width: number, height: number } }} [opts]
 */
export async function newContext(browser, opts = {}) {
  const viewport = opts.viewport ?? { width: 1280, height: 900 };
  return browser.newContext({
    viewport,
    userAgent: DEFAULT_UA,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  });
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

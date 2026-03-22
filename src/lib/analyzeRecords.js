import { parseArsMoney } from './parseMoney.js';
import { parseEtaMinutes } from './parseEta.js';

const RAPPI = 'rappi-ar';
const UBER = 'uber-eats-ar';

/**
 * @param {number[]} arr
 */
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * @param {object} row
 * @param {number} minConfidence
 */
function rowAnalyzable(row, minConfidence) {
  if (row.error) return false;
  const c = row.match_confidence;
  if (typeof c === 'number' && c < minConfidence) return false;
  const p = parseArsMoney(row.product_price);
  if (p == null || !Number.isFinite(p)) return false;
  return true;
}

/**
 * @param {object[]} rows
 * @param {{ minConfidence?: number, priceSimilarityPct?: number }} opts
 */
export function analyzeRecords(rows, opts = {}) {
  const minConfidence = opts.minConfidence ?? 0.15;
  const priceSimilarityPct = opts.priceSimilarityPct ?? 7;

  const warnings = [];

  const byPlatform = { [RAPPI]: [], [UBER]: [] };
  for (const r of rows) {
    if (r.platform === RAPPI) byPlatform[RAPPI].push(r);
    else if (r.platform === UBER) byPlatform[UBER].push(r);
  }

  const totalRows = rows.length;
  const analyzable = rows.filter((r) => rowAnalyzable(r, minConfidence));
  const analyzableByPlatform = {
    [RAPPI]: analyzable.filter((r) => r.platform === RAPPI).length,
    [UBER]: analyzable.filter((r) => r.platform === UBER).length,
  };

  /**
   * @param {object[]} groupRows
   */
  function aggregateGroup(groupRows) {
    const prices = groupRows.map((r) => parseArsMoney(r.product_price)).filter((n) => n != null && Number.isFinite(n));
    const deliveries = groupRows
      .map((r) => parseArsMoney(r.delivery_fee))
      .filter((n) => n != null && Number.isFinite(n));
    const services = groupRows
      .map((r) => parseArsMoney(r.service_fee))
      .filter((n) => n != null && Number.isFinite(n));
    const etas = groupRows.map((r) => parseEtaMinutes(r.eta_range)).filter(Boolean);
    const etaPoints = etas.map((e) => e.point).filter((n) => n != null);

    const withPromo = groupRows.filter((r) => Array.isArray(r.promotions) && r.promotions.length > 0).length;

    return {
      n: groupRows.length,
      price_median: median(prices),
      delivery_fee_median: deliveries.length ? median(deliveries) : null,
      service_fee_median: services.length ? median(services) : null,
      eta_median_minutes: median(etaPoints),
      rows_with_promotion: withPromo,
      promo_rate: groupRows.length ? withPromo / groupRows.length : 0,
    };
  }

  // Group key: address_id + product_id + platform
  const groupMap = new Map();
  for (const r of analyzable) {
    const key = `${r.address_id}\t${r.product_id}\t${r.platform}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(r);
  }

  const byAddressProductPlatform = [];
  for (const [key, grp] of groupMap) {
    const [address_id, product_id, platform] = key.split('\t');
    const row0 = grp[0];
    const agg = aggregateGroup(grp);
    byAddressProductPlatform.push({
      address_id,
      address_label: row0.address_label,
      zone_type: row0.zone_type,
      product_id,
      product_label: row0.product_label,
      vertical: row0.vertical,
      platform,
      ...agg,
    });
  }

  // Comparable pairs: same address_id + product_id, both platforms
  const pairMap = new Map();
  for (const item of byAddressProductPlatform) {
    const k = `${item.address_id}\t${item.product_id}`;
    if (!pairMap.has(k)) pairMap.set(k, {});
    pairMap.get(k)[item.platform] = item;
  }

  const priceComparisons = [];
  for (const [k, pair] of pairMap) {
    const rappi = pair[RAPPI];
    const uber = pair[UBER];
    if (!rappi || !uber) continue;
    if (rappi.price_median == null || uber.price_median == null) continue;
    const [address_id, product_id] = k.split('\t');
    const diffPct = ((rappi.price_median - uber.price_median) / uber.price_median) * 100;
    let bucket = 'similar';
    if (diffPct > priceSimilarityPct) bucket = 'rappi_more_expensive';
    else if (diffPct < -priceSimilarityPct) bucket = 'rappi_cheaper';
    priceComparisons.push({
      address_id,
      address_label: rappi.address_label,
      zone_type: rappi.zone_type,
      product_id,
      product_label: rappi.product_label,
      vertical: rappi.vertical,
      rappi_price_median: rappi.price_median,
      uber_price_median: uber.price_median,
      diff_pct: Math.round(diffPct * 100) / 100,
      bucket,
    });
  }

  if (priceComparisons.length === 0) {
    warnings.push('No hay pares Rappi–Uber comparables por dirección y producto con precio mediano en ambos.');
  }

  // Median price by product_id and platform (across all addresses, using group medians first)
  const byProductPlatform = new Map();
  for (const item of byAddressProductPlatform) {
    const k = `${item.product_id}\t${item.platform}`;
    if (!byProductPlatform.has(k)) byProductPlatform.set(k, []);
    if (item.price_median != null) byProductPlatform.get(k).push(item.price_median);
  }
  const medianPriceByProductPlatform = [];
  for (const [k, prices] of byProductPlatform) {
    const [product_id, platform] = k.split('\t');
    const sample = byAddressProductPlatform.find((x) => x.product_id === product_id && x.platform === platform);
    medianPriceByProductPlatform.push({
      product_id,
      product_label: sample?.product_label ?? product_id,
      vertical: sample?.vertical,
      platform,
      median_price: median(prices),
      n_zones: prices.length,
    });
  }

  // Heatmap data: address_label x product_id -> diff_pct
  const heatmapCells = priceComparisons.map((p) => ({
    address_label: p.address_label,
    product_id: p.product_id,
    product_label: p.product_label,
    diff_pct: p.diff_pct,
    bucket: p.bucket,
  }));

  // ETA by platform (analyzable rows with eta)
  const etaByPlatform = {};
  for (const pl of [RAPPI, UBER]) {
    const etas = analyzable
      .filter((r) => r.platform === pl)
      .map((r) => parseEtaMinutes(r.eta_range))
      .filter(Boolean)
      .map((e) => e.point);
    etaByPlatform[pl] = {
      median_minutes: median(etas),
      n: etas.length,
    };
  }

  // ETA by address_label and platform
  const etaAddressPlatform = new Map();
  for (const r of analyzable) {
    const k = `${r.address_label}\t${r.platform}`;
    if (!etaAddressPlatform.has(k)) etaAddressPlatform.set(k, []);
    const e = parseEtaMinutes(r.eta_range);
    if (e?.point != null) etaAddressPlatform.get(k).push(e.point);
  }
  const etaByAddressPlatform = [];
  for (const [k, points] of etaAddressPlatform) {
    const [address_label, platform] = k.split('\t');
    etaByAddressPlatform.push({
      address_label,
      platform,
      median_minutes: median(points),
      n: points.length,
    });
  }

  // Delivery fee by platform
  const deliveryByPlatform = {};
  for (const pl of [RAPPI, UBER]) {
    const fees = analyzable
      .filter((r) => r.platform === pl)
      .map((r) => parseArsMoney(r.delivery_fee))
      .filter((n) => n != null && Number.isFinite(n));
    const zeros = fees.filter((f) => f === 0).length;
    deliveryByPlatform[pl] = {
      median: median(fees),
      n: fees.length,
      free_delivery_rate: fees.length ? zeros / fees.length : null,
    };
  }

  // Promotions summary
  const promoByPlatform = {};
  for (const pl of [RAPPI, UBER]) {
    const subset = analyzable.filter((r) => r.platform === pl);
    const withP = subset.filter((r) => Array.isArray(r.promotions) && r.promotions.length > 0);
    const tags = {};
    for (const r of withP) {
      for (const t of r.promotions) {
        tags[t] = (tags[t] || 0) + 1;
      }
    }
    promoByPlatform[pl] = {
      rate: subset.length ? withP.length / subset.length : 0,
      n_rows: subset.length,
      tag_counts: tags,
    };
  }

  // Zone competitiveness: mean diff_pct by address_label
  const byAddress = new Map();
  for (const p of priceComparisons) {
    if (!byAddress.has(p.address_id)) byAddress.set(p.address_id, []);
    byAddress.get(p.address_id).push(p.diff_pct);
  }
  const competitivenessByZone = [];
  for (const [address_id, diffs] of byAddress) {
    const sample = priceComparisons.find((x) => x.address_id === address_id);
    competitivenessByZone.push({
      address_id,
      address_label: sample?.address_label,
      zone_type: sample?.zone_type,
      mean_diff_pct_vs_uber: median(diffs),
      n_pairs: diffs.length,
    });
  }

  const coverage = {
    total_rows: totalRows,
    analyzable_rows: analyzable.length,
    analyzable_share: totalRows ? analyzable.length / totalRows : 0,
    by_platform: analyzableByPlatform,
    comparable_pairs: priceComparisons.length,
    min_confidence: minConfidence,
    price_similarity_band_pct: priceSimilarityPct,
  };

  return {
    version: 1,
    coverage,
    warnings,
    median_price_by_product_platform: medianPriceByProductPlatform,
    price_comparisons: priceComparisons,
    heatmap_cells: heatmapCells,
    eta_by_platform: etaByPlatform,
    eta_by_address_platform: etaByAddressPlatform,
    delivery_fee_by_platform: deliveryByPlatform,
    promotions_by_platform: promoByPlatform,
    competitiveness_by_zone: competitivenessByZone,
    by_address_product_platform: byAddressProductPlatform,
  };
}

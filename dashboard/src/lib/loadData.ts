import fs from 'fs';
import path from 'path';

export type MedianPriceRow = {
  product_id: string;
  product_label?: string;
  vertical?: string;
  platform: string;
  median_price: number | null;
  n_zones: number;
};

export type AnalysisPayload = {
  version: number;
  generated_at?: string;
  run_dir?: string;
  meta?: Record<string, unknown>;
  coverage: {
    total_rows: number;
    analyzable_rows: number;
    analyzable_share: number;
    by_platform: Record<string, number>;
    comparable_pairs: number;
    min_confidence: number;
    price_similarity_band_pct: number;
  };
  warnings: string[];
  median_price_by_product_platform: MedianPriceRow[];
  heatmap_cells: Array<{
    address_label: string;
    product_id: string;
    product_label: string;
    diff_pct: number;
    bucket: string;
  }>;
  eta_by_platform: Record<string, { median_minutes: number | null; n: number }>;
  delivery_fee_by_platform: Record<
    string,
    { median: number | null; n: number; free_delivery_rate: number | null }
  >;
  promotions_by_platform: Record<
    string,
    { rate: number; n_rows: number; tag_counts: Record<string, number> }
  >;
  competitiveness_by_zone: Array<{
    address_label?: string;
    zone_type?: string;
    mean_diff_pct_vs_uber: number | null;
    n_pairs: number;
  }>;
};

export type InsightsPayload = {
  model?: string;
  generated_at?: string;
  offline?: boolean;
  executive_summary?: string;
  limitations?: string;
  structured_analysis?: {
    pricing_position?: string;
    delivery_ops?: string;
    fees_structure?: string;
    promotions?: string;
    geographic?: string;
  };
  insights?: Array<{
    finding: string;
    impacto: string;
    recomendacion: string;
  }>;
};

function readJson<T>(rel: string): T | null {
  try {
    const p = path.join(process.cwd(), rel);
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadAnalysis(): AnalysisPayload | null {
  return readJson<AnalysisPayload>('public/data/analysis.json');
}

export function loadInsights(): InsightsPayload | null {
  return readJson<InsightsPayload>('public/data/insights.json');
}

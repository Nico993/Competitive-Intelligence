'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalysisPayload } from '@/lib/loadData';

const GRID = '#2a3441';
const AXIS = '#94a3b8';
const TOOLTIP_BG = '#151b24';
const TOOLTIP_BORDER = '#334155';

function buildPriceRows(a: AnalysisPayload) {
  const map = new Map<string, { label: string; rappi: number | null; uber: number | null }>();
  for (const row of a.median_price_by_product_platform) {
    if (!map.has(row.product_id)) {
      map.set(row.product_id, { label: row.product_label || row.product_id, rappi: null, uber: null });
    }
    const e = map.get(row.product_id)!;
    if (row.platform === 'rappi-ar') e.rappi = row.median_price;
    if (row.platform === 'uber-eats-ar') e.uber = row.median_price;
  }
  return Array.from(map.entries()).map(([product_id, v]) => ({
    product_id,
    name: v.label.length > 28 ? v.label.slice(0, 26) + '…' : v.label,
    Rappi: v.rappi,
    'Uber Eats': v.uber,
  }));
}

function buildPromoRows(a: AnalysisPayload) {
  const pr = a.promotions_by_platform;
  return [
    { name: 'Rappi', tasa: Math.round((pr['rappi-ar']?.rate ?? 0) * 1000) / 10 },
    { name: 'Uber Eats', tasa: Math.round((pr['uber-eats-ar']?.rate ?? 0) * 1000) / 10 },
  ];
}

function buildHeatmap(a: AnalysisPayload) {
  const rows = new Set<string>();
  const cols = new Set<string>();
  const cellMap = new Map<string, number>();
  for (const c of a.heatmap_cells) {
    rows.add(c.address_label);
    cols.add(c.product_label || c.product_id);
    cellMap.set(`${c.address_label}\t${c.product_label || c.product_id}`, c.diff_pct);
  }
  return {
    rowLabels: [...rows],
    colLabels: [...cols],
    get: (row: string, col: string) => cellMap.get(`${row}\t${col}`) ?? null,
  };
}

function heatClass(v: number | null) {
  if (v == null) return 'heat-neutral';
  if (v < -3) return 'heat-rappi-cheaper';
  if (v > 3) return 'heat-rappi-pricier';
  return 'heat-neutral';
}

export function ReportCharts({ analysis }: { analysis: AnalysisPayload }) {
  const priceData = buildPriceRows(analysis);
  const promoData = buildPromoRows(analysis);
  const heat = buildHeatmap(analysis);

  return (
    <div className="charts">
      <div className="panel">
        <h2 className="chart-title">Precio mediano por producto</h2>
        <p className="chart-sub">ARS · mediana por zona y tienda dentro de cada plataforma (solo donde hay datos).</p>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={priceData} margin={{ top: 12, right: 12, left: 4, bottom: 64 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis
                dataKey="name"
                angle={-28}
                textAnchor="end"
                height={72}
                tick={{ fill: AXIS, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
              />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
              <Tooltip
                cursor={{ fill: 'rgba(232, 184, 74, 0.06)' }}
                contentStyle={{
                  background: TOOLTIP_BG,
                  border: `1px solid ${TOOLTIP_BORDER}`,
                  borderRadius: '10px',
                  fontSize: '12px',
                }}
                formatter={(v) =>
                  v == null || typeof v !== 'number' ? '—' : `$${Math.round(v).toLocaleString('es-AR')}`
                }
              />
              <Legend wrapperStyle={{ paddingTop: 12 }} />
              <Bar dataKey="Rappi" fill="#ff441f" name="Rappi" radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Bar dataKey="Uber Eats" fill="#06c167" name="Uber Eats" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel">
        <h2 className="chart-title">Matriz de competitividad</h2>
        <p className="chart-sub">
          % diferencia de mediana Rappi vs Uber (negativo = Rappi más barato). Celdas vacías: sin par comparable.
        </p>
        {heat.rowLabels.length === 0 ? (
          <p className="meta">Sin datos suficientes para armar la matriz.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="heatmap">
                <thead>
                  <tr>
                    <th>Zona</th>
                    {heat.colLabels.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heat.rowLabels.map((row) => (
                    <tr key={row}>
                      <th>{row}</th>
                      {heat.colLabels.map((col) => {
                        const v = heat.get(row, col);
                        return (
                          <td key={col} className={heatClass(v)}>
                            {v == null ? '—' : `${v.toFixed(1)}%`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="heatmap-legend">
              <span>
                <span className="legend-swatch" style={{ background: 'var(--uber-soft)' }} />
                Rappi más barato que Uber (diff &lt; −3%)
              </span>
              <span>
                <span className="legend-swatch" style={{ background: 'var(--rappi-soft)' }} />
                Rappi más caro que Uber (diff &gt; +3%)
              </span>
              <span>
                <span className="legend-swatch" style={{ background: 'rgba(100,116,139,0.15)' }} />
                Similar / sin dato
              </span>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2 className="chart-title">Intensidad promocional</h2>
        <p className="chart-sub">% de filas analizables con al menos una etiqueta de promoción detectada.</p>
        <div className="chart-wrap chart-wrap--promo">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={promoData} layout="vertical" margin={{ top: 12, right: 20, left: 8, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: AXIS, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                unit="%"
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: AXIS, fontSize: 12 }}
                width={88}
                tickLine={false}
                axisLine={{ stroke: GRID }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(232, 184, 74, 0.06)' }}
                contentStyle={{
                  background: TOOLTIP_BG,
                  border: `1px solid ${TOOLTIP_BORDER}`,
                  borderRadius: '10px',
                  fontSize: '12px',
                }}
                formatter={(v: number | string) => [`${v}%`, 'Tasa']}
              />
              <Bar
                dataKey="tasa"
                fill="url(#promoGrad)"
                name="% con promo"
                radius={[0, 8, 8, 0]}
                barSize={28}
              />
              <defs>
                <linearGradient id="promoGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#e8b84a" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#f0d78c" stopOpacity={0.95} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

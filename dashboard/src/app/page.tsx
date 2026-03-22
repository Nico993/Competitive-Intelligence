import Link from 'next/link';
import { loadAnalysis, loadInsights } from '@/lib/loadData';
import { ReportCharts } from '@/components/ReportCharts';

export default function Page() {
  const analysis = loadAnalysis();
  const insights = loadInsights();

  if (!analysis) {
    return (
      <>
        <div className="body-bg" aria-hidden />
        <div className="body-grain" aria-hidden />
        <main className="page">
          <div className="empty-state">
            <h1 className="font-display">Sin datos de análisis</h1>
            <p>
              Copiá <code>analysis.json</code> al dashboard o ejecutá el pipeline desde la raíz del monorepo.
            </p>
            <div className="empty-steps">
              <p>
                <strong>1.</strong> <code>npm run analyze</code>
              </p>
              <p>
                <strong>2.</strong> <code>npm run insights</code> (opcional)
              </p>
              <p>
                <strong>3.</strong> <code>npm run dashboard:dev</code>
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const c = analysis.coverage;
  const pct = (c.analyzable_share * 100).toFixed(0);

  return (
    <>
      <div className="body-bg" aria-hidden />
      <div className="body-grain" aria-hidden />

      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-eyebrow">Competitive intelligence</span>
            <p className="brand-title">Informe ejecutivo</p>
          </div>
          <nav className="nav-pills" aria-label="Secciones">
            <a href="#cobertura">Cobertura</a>
            <a href="#resumen">Resumen</a>
            <a href="#visualizaciones">Gráficos</a>
            <a href="#insights">Insights</a>
            <a href="#detalle">Detalle</a>
          </nav>
          <div className="header-actions">
            <Link href="/print" className="btn btn-ghost">
              Vista impresión
            </Link>
            <Link href="/print" className="btn btn-primary">
              Exportar PDF
            </Link>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-badge">Sección 2.2 · Strategy &amp; Pricing</div>
          <h1 className="font-display">Rappi vs Uber Eats</h1>
          <p className="hero-desc">
            Panorama de precios, promociones y cobertura de datos entre plataformas. Pensado para decisiones de
            pricing y priorización de scraping.
          </p>
          <div className="hero-meta">
            <span>
              Run <code>{analysis.run_dir ?? '—'}</code>
            </span>
            <span>Análisis · {analysis.generated_at?.slice(0, 10) ?? '—'}</span>
            {insights?.generated_at && <span>Insights · {insights.generated_at.slice(0, 10)}</span>}
          </div>
          <div className="chip-row">
            <span className="chip chip--rappi">
              <span className="chip-dot" aria-hidden />
              Rappi
            </span>
            <span className="chip chip--uber">
              <span className="chip-dot" aria-hidden />
              Uber Eats
            </span>
          </div>
        </section>

        <section id="cobertura" className="section">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-num">01</span>
              Calidad de datos
            </h2>
            <p className="section-desc">Transparencia sobre N y comparabilidad antes de interpretar precios.</p>
          </div>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Filas analizables</div>
              <div className="kpi-value">
                {c.analyzable_rows}
                <small> / {c.total_rows}</small>
              </div>
              <div className="kpi-hint">{pct}% del scrape utilizable</div>
            </div>
            <div className="kpi kpi--rappi">
              <div className="kpi-label">Rappi (filas)</div>
              <div className="kpi-value">{c.by_platform['rappi-ar'] ?? 0}</div>
              <div className="kpi-hint">Con precio y confianza ≥ umbral</div>
            </div>
            <div className="kpi kpi--uber">
              <div className="kpi-label">Uber Eats (filas)</div>
              <div className="kpi-value">{c.by_platform['uber-eats-ar'] ?? 0}</div>
              <div className="kpi-hint">Cobertura suele ser el cuello de botella</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Pares comparables</div>
              <div className="kpi-value">{c.comparable_pairs}</div>
              <div className="kpi-hint">Misma zona × producto en ambas apps</div>
            </div>
          </div>
          <div className="panel" style={{ marginTop: '1rem' }}>
            <p className="meta" style={{ margin: 0 }}>
              Umbral de confianza de matching: <strong>{c.min_confidence}</strong> · Banda de precio &quot;similar&quot;:
              ±<strong>{c.price_similarity_band_pct}%</strong> vs Uber
            </p>
            {analysis.warnings?.length > 0 && (
              <ul className="warnings-list" style={{ listStyle: 'none', padding: 0, marginTop: '0.75rem' }}>
                {analysis.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {insights?.executive_summary && (
          <section id="resumen" className="section">
            <div className="section-head">
              <h2 className="section-title">
                <span className="section-num">02</span>
                Resumen ejecutivo
              </h2>
            </div>
            <div className="panel">
              <p style={{ margin: 0, fontSize: '1.02rem', lineHeight: 1.65 }}>{insights.executive_summary}</p>
              {insights.limitations && (
                <>
                  <h3 className="font-display" style={{ fontSize: '1rem', margin: '1.25rem 0 0.5rem' }}>
                    Limitaciones
                  </h3>
                  <p className="meta" style={{ margin: 0 }}>
                    {insights.limitations}
                  </p>
                </>
              )}
            </div>
          </section>
        )}

        <section id="visualizaciones" className="section">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-num">03</span>
              Visualizaciones
            </h2>
            <p className="section-desc">Comparaciones directas: precios, matriz zona × producto, intensidad promocional.</p>
          </div>
          <ReportCharts analysis={analysis} />
        </section>

        {insights?.insights && insights.insights.length > 0 && (
          <section id="insights" className="section">
            <div className="section-head">
              <h2 className="section-title">
                <span className="section-num">04</span>
                Top 5 insights accionables
              </h2>
              <p className="section-desc">Finding, impacto y recomendación para equipos de Strategy y Pricing.</p>
            </div>
            <div className="insights-list">
              {insights.insights.map((ins, idx) => (
                <article key={idx} className="insight-card">
                  <span className="insight-num" aria-hidden>
                    {idx + 1}
                  </span>
                  <div className="insight-block">
                    <span className="insight-label">Finding</span>
                    <p style={{ margin: 0 }}>{ins.finding}</p>
                  </div>
                  <div className="insight-block">
                    <span className="insight-label">Impacto</span>
                    <p style={{ margin: 0 }}>{ins.impacto}</p>
                  </div>
                  <div className="insight-block">
                    <span className="insight-label">Recomendación</span>
                    <p style={{ margin: 0 }}>{ins.recomendacion}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {insights?.structured_analysis && (
          <section id="detalle" className="section">
            <div className="section-head">
              <h2 className="section-title">
                <span className="section-num">05</span>
                Análisis estructurado
              </h2>
              <p className="section-desc">Texto generado a partir de los agregados (precios, operación, fees, promos, geografía).</p>
            </div>
            <div className="panel">
              <div className="analysis-block">
                <h3>Posicionamiento de precios</h3>
                <p>{insights.structured_analysis.pricing_position}</p>
              </div>
              <div className="analysis-block">
                <h3>Entregas</h3>
                <p>{insights.structured_analysis.delivery_ops}</p>
              </div>
              <div className="analysis-block">
                <h3>Fees</h3>
                <p>{insights.structured_analysis.fees_structure}</p>
              </div>
              <div className="analysis-block">
                <h3>Promociones</h3>
                <p>{insights.structured_analysis.promotions}</p>
              </div>
              <div className="analysis-block">
                <h3>Geografía</h3>
                <p>{insights.structured_analysis.geographic}</p>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

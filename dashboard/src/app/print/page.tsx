import Link from 'next/link';
import { loadAnalysis, loadInsights } from '@/lib/loadData';
import { ReportCharts } from '@/components/ReportCharts';

export default function PrintPage() {
  const analysis = loadAnalysis();
  const insights = loadInsights();

  if (!analysis) {
    return (
      <>
        <div className="body-bg" aria-hidden />
        <main className="page" style={{ paddingTop: '2rem' }}>
          <p>Falta <code>public/data/analysis.json</code>.</p>
          <Link href="/">Volver al dashboard</Link>
        </main>
      </>
    );
  }

  return (
    <>
      <div className="body-bg" aria-hidden />
      <div className="body-grain" aria-hidden />

      <main className="page" style={{ paddingTop: '1.5rem' }}>
        <p className="meta" style={{ marginBottom: '1.25rem' }}>
          <Link href="/">← Dashboard</Link>
          <span style={{ margin: '0 0.5rem', opacity: 0.5 }}>·</span>
          Usá <kbd style={{ fontSize: '0.75rem', padding: '0.1rem 0.35rem', borderRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>⌘P</kbd> → Guardar como PDF
        </p>

        <header className="hero" style={{ paddingTop: 0 }}>
          <h1 className="font-display" style={{ fontSize: '1.75rem' }}>
            Informe ejecutivo — Insights competitivos
          </h1>
          <p className="hero-meta">
            <span>
              Run <code>{analysis.run_dir}</code>
            </span>
          </p>
        </header>

        {insights?.executive_summary && (
          <section className="section">
            <h2 className="section-title" style={{ fontSize: '1.2rem' }}>
              Resumen
            </h2>
            <div className="panel">
              <p style={{ margin: 0 }}>{insights.executive_summary}</p>
              {insights?.limitations && (
                <p className="meta" style={{ margin: '1rem 0 0' }}>
                  {insights.limitations}
                </p>
              )}
            </div>
          </section>
        )}

        <ReportCharts analysis={analysis} />

        {insights?.insights && (
          <section className="section">
            <h2 className="section-title" style={{ fontSize: '1.2rem' }}>
              Insights accionables
            </h2>
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
      </main>
    </>
  );
}

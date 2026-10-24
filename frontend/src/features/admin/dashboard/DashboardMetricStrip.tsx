import { Link } from "react-router-dom";
import type { DashboardMetric } from "./dashboardViewModel";

function MetricIcon({ type }: { type: DashboardMetric["icon"] }) {
  const shapes = {
    projects: <><rect x="4" y="7" width="16" height="14" /><path d="M9 7V3h6v4M9 13h6m-6 4h6" /></>,
    value: <><path d="M6 4h12M6 9h12M8 4c9 0 9 9 0 9l9 8" /></>,
    contract: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 4 16 4 16 0V5M4 11v6c0 4 16 4 16 0v-6" /></>,
    margin: <><path d="m5 20 14-16" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /></>,
    overdue: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{type ? shapes[type] : null}</svg>;
}

export function DashboardMetricStrip({ metrics, label = "Headline metrics" }: { metrics: DashboardMetric[]; label?: string }) {
  metrics = metrics.filter((metric) => !metric.unavailable);
  if (!metrics.length) return null;
  const visual = metrics.some((metric) => metric.href);
  return <section className={`dashboard-headline-grid${visual ? " dashboard-headline-grid--visual" : ""}`} aria-label={label} data-count={metrics.length}>
    {metrics.map((metric) => {
      const content = <>
        {metric.icon ? <span className="dashboard-metric-icon"><MetricIcon type={metric.icon} /></span> : null}
        <div className="dashboard-metric-content">
          <p className="dashboard-headline-metric__label">{metric.label}</p>
          <strong aria-label={metric.displayValue ? String(metric.value) : undefined} title={metric.displayValue ? String(metric.value) : undefined}>{metric.displayValue ?? metric.value}</strong>
          {metric.detail ? <p className="dashboard-headline-metric__detail">{metric.detail}</p> : null}
          {metric.href ? <span className="dashboard-metric-action">{metric.actionLabel}</span> : null}
        </div>
      </>;
      return <article className="dashboard-headline-metric" key={metric.label} data-metric={metric.icon}>
        {metric.href ? <Link to={metric.href} id={metric.originId} data-dashboard-origin={metric.originId} aria-label={`${metric.label}: ${metric.value}. ${metric.actionLabel}`}>{content}</Link> : content}
      </article>;
    })}
  </section>;
}

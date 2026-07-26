import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <article className="metric-card">
      <div className="metric-card__top">
        <p>{label}</p>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
      </div>
      <strong className="metric-card__value">{value}</strong>
      {detail ? <p className="metric-card__detail">{detail}</p> : null}
    </article>
  );
}

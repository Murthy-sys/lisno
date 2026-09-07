import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowRight, ArrowUpRight, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Sparkline } from "./Sparkline";
import { seriesColor, statusColor, type ChartStatus } from "./chartTokens";

/*
 * The figure a number gets when it is the whole story — a one-bar bar chart is
 * never the right answer.
 *
 * Values use the interface sans at proportional figures: `tabular-nums` gives
 * every digit the width of a zero, which reads loose at display sizes and is
 * reserved for columns that must align. A delta is signed, names its period,
 * and takes its colour from direction × whether up is good — so "overdue tasks
 * fell" is green even though the arrow points down.
 */

export interface StatTileProps {
  label: string;
  value: string | number;
  detail?: ReactNode;
  /** Signed change over the period; sign drives the arrow, not the colour. */
  delta?: { value: number; label: string } | null;
  /** Whether a rise is the good direction. Attention metrics set this false. */
  higherIsBetter?: boolean;
  trend?: number[];
  trendLabel?: string;
  status?: ChartStatus;
  href?: string;
  /** Verified-unavailable; the tile shows the reason instead of a number. */
  unavailableReason?: string;
  emphasis?: boolean;
  icon?: ReactNode;
}

export function StatTile({
  label,
  value,
  detail,
  delta,
  higherIsBetter = true,
  trend,
  trendLabel,
  status,
  href,
  unavailableReason,
  emphasis = false,
  icon
}: StatTileProps) {
  const unavailable = Boolean(unavailableReason);
  const direction = delta ? Math.sign(delta.value) : 0;
  const deltaStatus: ChartStatus =
    direction === 0 ? "neutral" : (direction > 0) === higherIsBetter ? "good" : "critical";
  const DeltaIcon = direction === 0 ? ArrowRight : direction > 0 ? ArrowUpRight : ArrowDownRight;

  const body = (
    <>
      <div className="stat-tile__head">
        <p className="stat-tile__label">{label}</p>
        {icon ? <span className="stat-tile__icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <div className="stat-tile__body">
        <strong className="stat-tile__value">{unavailable ? "Not available" : value}</strong>
        {trend && trend.length > 0 && !unavailable ? (
          <Sparkline
            values={trend}
            accent={status ? statusColor(status) : seriesColor(0)}
            label={trendLabel ?? `${label} trend`}
          />
        ) : null}
      </div>
      {unavailable ? (
        <p className="stat-tile__detail stat-tile__detail--unavailable">
          <TriangleAlert aria-hidden="true" />
          {unavailableReason}
        </p>
      ) : (
        <>
          {delta ? (
            <p className="stat-tile__delta" data-status={deltaStatus}>
              <DeltaIcon aria-hidden="true" />
              <span>
                {delta.value > 0 ? "+" : delta.value < 0 ? "−" : ""}
                {Math.abs(delta.value).toLocaleString("en-IN")} {delta.label}
              </span>
            </p>
          ) : null}
          {detail ? <p className="stat-tile__detail">{detail}</p> : null}
        </>
      )}
    </>
  );

  const className = [
    "stat-tile",
    emphasis ? "stat-tile--emphasis" : null,
    href ? "stat-tile--linked" : null
  ]
    .filter(Boolean)
    .join(" ");

  if (href && !unavailable) {
    return (
      <Link className={className} to={href} data-status={status ?? "neutral"}>
        {body}
      </Link>
    );
  }
  return (
    <article className={className} data-status={status ?? "neutral"}>
      {body}
    </article>
  );
}

/**
 * The single number a view leads with. Exactly one per dashboard, in the same
 * sans as everything else — a serif here reads as off-brand decoration.
 */
export function HeroFigure({
  eyebrow,
  value,
  label,
  detail,
  trend,
  trendLabel,
  actions
}: {
  eyebrow: string;
  value: string | number;
  label: string;
  detail?: ReactNode;
  trend?: number[];
  trendLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="chart-hero">
      <p className="chart-hero__eyebrow">{eyebrow}</p>
      <div className="chart-hero__figure">
        <strong>{value}</strong>
        <div>
          <p className="chart-hero__label">{label}</p>
          {detail ? <p className="chart-hero__detail">{detail}</p> : null}
        </div>
      </div>
      {trend && trend.length > 0 ? (
        <Sparkline
          values={trend}
          accent={seriesColor(0)}
          width={168}
          height={40}
          label={trendLabel ?? `${label} trend`}
        />
      ) : null}
      {actions ? <div className="chart-hero__actions">{actions}</div> : null}
    </div>
  );
}

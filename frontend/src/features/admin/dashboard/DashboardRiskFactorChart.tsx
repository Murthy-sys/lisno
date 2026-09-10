import { Table2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { barPath, clamp, compactNumber, labelFits, linearScale, niceTicks } from "../../../components/charts/chartScale";

/*
 * The risk-factor occurrence bars, styled the same as before (gradient fill,
 * pill ends, the value set inside the bar when it fits) but rebuilt as its
 * own component so "Show values" can shrink the chart and move it aside
 * instead of expanding the card downward — the same interaction the
 * lifecycle/risk donuts use, just for a horizontal bar instead of a ring.
 *
 * A fixed viewBox scaled by CSS, not a measured pixel width: that is what
 * lets the "shrink and slide left" transition animate smoothly (the browser
 * scales the whole vector, no per-frame React re-layout needed), the same
 * technique the donuts use.
 */

export interface RiskFactorBarDatum {
  key: string;
  label: string;
  value: number;
  color: string;
  detail?: string;
}

export interface DashboardRiskFactorChartProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  data: RiskFactorBarDatum[];
  legend?: { label: string; color: string }[];
  formatValue?: (value: number) => string;
  categoryColumnLabel?: string;
  valueColumnLabel?: string;
  detailColumnLabel?: string;
  unavailableReason?: string;
  empty?: boolean;
  emptyMessage?: string;
  footnote?: ReactNode;
}

/*
 * Two different logical widths, not one width that CSS just shrinks: the
 * viewBox's own aspect ratio is fixed once rendered (height:auto derives
 * from it), so shrinking only the container's CSS width while keeping the
 * same viewBox width would shrink the rendered height by the same factor
 * too — squeezing all the bars into a fraction of their thickness instead
 * of leaving them readable in a narrower column.
 */
const VIEW_WIDTH_RESTING = 480;
const VIEW_WIDTH_EXPANDED = 220;
const MARGIN = { top: 8, right: 16, bottom: 24 };
const THICKNESS = 22 * 0.7;
const GAP = 10;
const BAND = THICKNESS + GAP;
const LABEL_GUTTER_RESTING = 190;
const LABEL_GUTTER_EXPANDED = 6;
const VALUE_GUTTER = 40;

export function DashboardRiskFactorChart({
  eyebrow,
  title,
  subtitle,
  data,
  legend,
  formatValue = compactNumber,
  categoryColumnLabel = "Category",
  valueColumnLabel = "Value",
  detailColumnLabel,
  unavailableReason,
  empty = false,
  emptyMessage = "No values are tracked for this period yet.",
  footnote
}: DashboardRiskFactorChartProps) {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  const rootRef = useRef<HTMLElement>(null);
  /*
   * The bars colour in once this chart first scrolls into view, rather than
   * on mount, the same reveal every other chart on this dashboard uses.
   * IntersectionObserver is absent in jsdom, so tests (and any engine
   * without it) fall back to already-visible.
   */
  const [inView, setInView] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (inView) return;
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suppressed = Boolean(unavailableReason);
  const viewWidth = expanded ? VIEW_WIDTH_EXPANDED : VIEW_WIDTH_RESTING;
  const labelGutter = expanded ? LABEL_GUTTER_EXPANDED : LABEL_GUTTER_RESTING;
  const plotWidth = Math.max(60, viewWidth - labelGutter - VALUE_GUTTER - MARGIN.right);
  const viewHeight = MARGIN.top + data.length * BAND + MARGIN.bottom;

  const maximum = Math.max(1, ...data.map((bar) => bar.value));
  const rawTicks = niceTicks(maximum, 4);
  // One extra tick past the data's own top, so the longest bar has a little
  // headroom to its axis rather than landing exactly on the last number.
  const step = rawTicks.length > 1 ? rawTicks[1] - rawTicks[0] : 1;
  const ticks = [...rawTicks, rawTicks[rawTicks.length - 1] + step];
  const axisMaximum = ticks[ticks.length - 1];
  const x = linearScale(0, axisMaximum, labelGutter, labelGutter + plotWidth);

  const bars = data.map((bar, index) => {
    const top = MARGIN.top + index * BAND;
    const barWidth = Math.max(0, x(bar.value) - labelGutter);
    const valueLabel = formatValue(bar.value);
    const inside = labelFits(valueLabel, barWidth, 12, 8);
    return { ...bar, top, barWidth, valueLabel, inside };
  });

  return (
    <figure ref={rootRef} className={`chart-figure risk-bar${expanded ? " risk-bar--expanded" : ""}`}>
      <div className="chart-figure__head">
        <div className="chart-figure__title">
          {eyebrow ? <p className="chart-figure__eyebrow">{eyebrow}</p> : null}
          <h4>{title}</h4>
          {subtitle ? <p className="chart-figure__subtitle">{subtitle}</p> : null}
        </div>
        <div className="chart-figure__actions">
          {suppressed || empty ? null : (
            <button
              type="button"
              className="chart-figure__table-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <Table2 aria-hidden="true" />
              {expanded ? "Hide values" : "Show values"}
            </button>
          )}
        </div>
      </div>

      {legend && legend.length > 1 && !suppressed ? (
        <ul className="chart-legend">
          {legend.map((entry) => (
            <li key={entry.label}>
              <span aria-hidden="true" className="chart-legend__mark chart-legend__mark--swatch" style={{ background: entry.color }} />
              <span className="chart-legend__label">{entry.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {suppressed ? (
        <p className="chart-figure__unavailable">
          <strong>Not available.</strong> {unavailableReason}
        </p>
      ) : empty ? (
        <p className="chart-figure__empty">{emptyMessage}</p>
      ) : (
        <div className="risk-bar__row">
          <div className="risk-bar__visual" onPointerLeave={() => setActive(null)}>
            <svg
              className="risk-bar__canvas"
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              role="img"
              aria-label={`${title}. ${bars.length} ${bars.length === 1 ? "bar" : "bars"}: ${bars.map((bar) => `${bar.label} ${bar.valueLabel}`).join(", ")}.`}
            >
              <defs>
                {bars.map((bar, index) => (
                  <linearGradient key={bar.key} id={`risk-bar-gradient-${index}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={bar.color} />
                    <stop offset="100%" stopColor={bar.color} stopOpacity={0.72} />
                  </linearGradient>
                ))}
              </defs>

              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={x(tick)}
                    x2={x(tick)}
                    y1={MARGIN.top}
                    y2={MARGIN.top + bars.length * BAND - GAP}
                    className="risk-bar__gridline"
                  />
                  <text className="chart-axis-text" x={x(tick)} y={viewHeight - 7} textAnchor={tick === 0 ? "start" : "middle"}>
                    {formatValue(tick)}
                  </text>
                </g>
              ))}

              {bars.map((bar, index) => (
                <g key={bar.key} onPointerEnter={() => setActive(index)} onPointerMove={() => setActive(index)}>
                  <rect x={0} y={bar.top - GAP / 2} width={viewWidth} height={BAND} fill="transparent" />
                  {!expanded ? (
                    <text className="chart-category-text" x={labelGutter - 10} y={bar.top + THICKNESS / 2} textAnchor="end" dominantBaseline="middle">
                      {bar.label}
                    </text>
                  ) : null}
                  <rect
                    x={labelGutter}
                    y={bar.top}
                    width={Math.max(1, plotWidth)}
                    height={THICKNESS}
                    rx={THICKNESS / 2}
                    fill="var(--chart-track)"
                    opacity={active === index ? 0.9 : 0.55}
                  />
                  <path
                    d={barPath(labelGutter, bar.top, bar.barWidth, THICKNESS, THICKNESS / 2, "horizontal")}
                    fill={`url(#risk-bar-gradient-${index})`}
                    className={`risk-bar__fill${inView ? " risk-bar__fill--in-view" : ""}`}
                    style={{ animationDelay: `${index * 100}ms` }}
                    opacity={active === null || active === index ? 1 : 0.55}
                    tabIndex={0}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive((current) => (current === index ? null : current))}
                  />
                  <text
                    className={bar.inside ? "chart-value-text chart-value-text--inverse" : "chart-value-text"}
                    x={bar.inside ? labelGutter + bar.barWidth - 8 : labelGutter + bar.barWidth + 8}
                    y={bar.top + THICKNESS / 2}
                    textAnchor={bar.inside ? "end" : "start"}
                    dominantBaseline="middle"
                  >
                    {bar.valueLabel}
                  </text>
                </g>
              ))}
            </svg>

            {active !== null && bars[active] ? (
              <div
                className="risk-bar__callout"
                style={{
                  left: `${clamp(((labelGutter + bars[active].barWidth) / viewWidth) * 100, 18, 88)}%`,
                  // Vertically anchored to the whole chart's own centre, not
                  // the hovered row's — a per-row anchor overshoots the
                  // card above it (or the next row below it) for whichever
                  // bar sits near an edge, the same reason the donut's
                  // callout anchors to the ring's centre rather than to
                  // whichever segment is active.
                  top: "50%"
                }}
              >
                <p className="risk-bar__callout-label">{bars[active].label}</p>
                <p className="risk-bar__callout-value">{bars[active].valueLabel} {valueColumnLabel.toLowerCase()}</p>
                {bars[active].detail ? <p className="risk-bar__callout-detail">{bars[active].detail}</p> : null}
              </div>
            ) : null}
          </div>

          {expanded ? (
            <div className="risk-bar__details">
              <div className="risk-bar__details-head">
                <span>{categoryColumnLabel}</span>
                <span>{valueColumnLabel}</span>
                {detailColumnLabel ? <span>{detailColumnLabel}</span> : null}
              </div>
              {data.map((bar) => (
                <div className="risk-bar__details-row" key={bar.key}>
                  <span>{bar.label}</span>
                  <span>{formatValue(bar.value)}</span>
                  {detailColumnLabel ? <span>{bar.detail ?? "—"}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {footnote && !suppressed ? <figcaption className="chart-figure__footnote">{footnote}</figcaption> : null}
    </figure>
  );
}

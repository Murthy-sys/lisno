import { Table2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { seriesColor } from "../../../components/charts";
import { barPath, clamp, compactNumber, labelFits, linearScale, niceTicks } from "../../../components/charts/chartScale";
import { CHART_AXIS, CHART_GRID } from "../../../components/charts/chartTokens";

/*
 * A single-hue horizontal bar list — the same shape as the shared
 * CategoryBarChart, but built bespoke for the two role-distribution cards
 * (Execution health, Workforce health) so "Show values" can shrink the
 * chart fully out to the left and hand the freed space to a values panel,
 * the same interaction DashboardRiskFactorChart and the commercial-baseline
 * waterfall use, instead of expanding the card downward into a table.
 *
 * CategoryBarChart itself stays untouched: it also backs two other cards on
 * this dashboard (estimation waiting age, and one more) that were not asked
 * to change, so this interaction is a fork, not a shared-behavior change.
 */

export interface DashboardCategoryBarDatum {
  key: string;
  label: string;
  value: number;
  detail?: string;
}

export interface DashboardCategoryBarChartProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  data: DashboardCategoryBarDatum[];
  formatValue?: (value: number) => string;
  categoryColumnLabel?: string;
  valueColumnLabel?: string;
  detailColumnLabel?: string;
  unavailableReason?: string;
  empty?: boolean;
  emptyMessage?: string;
  footnote?: ReactNode;
}

const VIEW_WIDTH_RESTING = 480;
const VIEW_WIDTH_EXPANDED = 220;
const MARGIN = { top: 8, right: 16, bottom: 24 };
const THICKNESS = 22;
const GAP = 10;
const BAND = THICKNESS + GAP;
const LABEL_GUTTER_EXPANDED = 6;
const VALUE_GUTTER = 44;
const BAR_COLOR = seriesColor(0);

export function DashboardCategoryBarChart({
  eyebrow,
  title,
  subtitle,
  data,
  formatValue = compactNumber,
  categoryColumnLabel = "Category",
  valueColumnLabel = "Value",
  detailColumnLabel,
  unavailableReason,
  empty = false,
  emptyMessage = "No values are tracked for this period yet.",
  footnote
}: DashboardCategoryBarChartProps) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  const rootRef = useRef<HTMLElement>(null);
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
  const labelGutter = expanded
    ? LABEL_GUTTER_EXPANDED
    : clamp(Math.round(Math.max(...data.map((datum) => datum.label.length), 6) * 6.6) + 8, 88, Math.round(VIEW_WIDTH_RESTING * 0.4));
  const plotWidth = Math.max(60, viewWidth - labelGutter - VALUE_GUTTER - MARGIN.right);
  const viewHeight = MARGIN.top + data.length * BAND + MARGIN.bottom;

  const maximum = Math.max(1, ...data.map((bar) => bar.value));
  const ticks = niceTicks(maximum, 4);
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
    <figure ref={rootRef} className={`chart-figure category-bar${expanded ? " category-bar--expanded" : ""}`} aria-labelledby={headingId}>
      <div className="chart-figure__head">
        <div className="chart-figure__title">
          {eyebrow ? <p className="chart-figure__eyebrow">{eyebrow}</p> : null}
          <h4 id={headingId}>{title}</h4>
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

      {suppressed ? (
        <p className="chart-figure__unavailable">
          <strong>Not available.</strong> {unavailableReason}
        </p>
      ) : empty ? (
        <p className="chart-figure__empty">{emptyMessage}</p>
      ) : (
        <div className="category-bar__row">
          <div className="category-bar__visual" onPointerLeave={() => setActive(null)}>
            <svg
              className="category-bar__canvas"
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              role="img"
              aria-label={`${title}. ${bars.length} ${bars.length === 1 ? "bar" : "bars"}: ${bars.map((bar) => `${bar.label} ${bar.valueLabel}`).join(", ")}.`}
            >
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={x(tick)}
                    x2={x(tick)}
                    y1={MARGIN.top}
                    y2={MARGIN.top + bars.length * BAND - GAP}
                    stroke={CHART_GRID}
                    strokeWidth={1}
                  />
                  <text className="chart-axis-text" x={x(tick)} y={viewHeight - 7} textAnchor={tick === 0 ? "start" : "middle"} fill={CHART_AXIS}>
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
                    fill={BAR_COLOR}
                    className={`category-bar__fill${inView ? " category-bar__fill--in-view" : ""}`}
                    style={{ animationDelay: `${index * 90}ms` }}
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
              <div className="category-bar__callout" style={{ left: `${clamp(((labelGutter + bars[active].barWidth) / viewWidth) * 100, 18, 88)}%`, top: "50%" }}>
                <p className="category-bar__callout-label">{bars[active].label}</p>
                <p className="category-bar__callout-value">{bars[active].valueLabel} {valueColumnLabel.toLowerCase()}</p>
                {bars[active].detail ? <p className="category-bar__callout-detail">{bars[active].detail}</p> : null}
              </div>
            ) : null}
          </div>

          {expanded ? (
            <div className="category-bar__details">
              <div className="category-bar__details-head">
                <span>{categoryColumnLabel}</span>
                <span>{valueColumnLabel}</span>
                {detailColumnLabel ? <span>{detailColumnLabel}</span> : null}
              </div>
              {data.map((bar) => (
                <div className="category-bar__details-row" key={bar.key}>
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

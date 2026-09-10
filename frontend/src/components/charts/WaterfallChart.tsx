import { Table2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { barPath, clamp, labelFits, linearScale, niceTicks } from "./chartScale";
import { CHART_AXIS, CHART_GRID } from "./chartTokens";

/*
 * How one total is spent down to another — a waterfall of signed steps with
 * running subtotals, each floating bar tied to the last by a dashed guide so
 * the "flows down, then across" logic reads before any number does.
 *
 * Built bespoke rather than on top of ChartFigure/useChartWidth: "Show
 * values" here shrinks the chart and slides it left rather than expanding
 * the card downward, the same interaction DashboardRiskFactorChart uses for
 * its bars. That means a fixed viewBox scaled by CSS instead of a measured
 * pixel width — the browser scales the whole vector on transition, no
 * per-frame React re-layout — and two different logical widths rather than
 * one width CSS just shrinks, because a fixed viewBox's own aspect ratio is
 * locked once rendered: shrinking only the container's CSS width while
 * keeping the same viewBox width would shrink the rendered height by the
 * same factor too, squeezing every bar's thickness along with it.
 *
 * This component has exactly one consumer (the dashboard's "Commercial
 * baseline" card), so its colours are its own rather than the shared
 * severity scale — total and step here name a role in the flow, not a
 * severity, so they read from the brand palette instead of chart-status.
 */

export interface WaterfallStep {
  key: string;
  label: string;
  /** Signed for a step; the running total for `type: "total"`. */
  value: number;
  type: "step" | "total";
  detail?: string;
}

export interface WaterfallChartProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  steps: WaterfallStep[];
  formatValue: (value: number) => string;
  formatTick?: (value: number) => string;
  /** Names the polarity in the legend, e.g. "Adds to the total". */
  increaseLabel?: string;
  decreaseLabel?: string;
  unavailableReason?: string;
  empty?: boolean;
  emptyMessage?: string;
  footnote?: ReactNode;
}

const TOTAL_COLOR = "var(--color-primary)";
const DECREASE_COLOR = "var(--color-highlight)";
const INCREASE_COLOR = "var(--chart-status-good)";

const VIEW_WIDTH_RESTING = 600;
const VIEW_WIDTH_EXPANDED = 260;
const MARGIN = { top: 8, right: 12, bottom: 24 };
const BAND_GAP = 14;
const THICKNESS = 22;
const VALUE_GUTTER = 100;
const LABEL_GUTTER_EXPANDED = 6;

export function WaterfallChart({
  title,
  eyebrow,
  subtitle,
  steps,
  formatValue,
  formatTick,
  increaseLabel = "Adds",
  decreaseLabel = "Subtracts",
  unavailableReason,
  empty = false,
  emptyMessage = "No values are tracked for this period yet.",
  footnote
}: WaterfallChartProps) {
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

  let running = 0;
  const bars = steps.map((step) => {
    if (step.type === "total") {
      running = step.value;
      return { ...step, start: 0, end: step.value, runningAfter: running, color: TOTAL_COLOR };
    }
    const start = running;
    running += step.value;
    return {
      ...step,
      start: Math.min(start, running),
      end: Math.max(start, running),
      runningAfter: running,
      color: step.value >= 0 ? INCREASE_COLOR : DECREASE_COLOR
    };
  });

  const viewWidth = expanded ? VIEW_WIDTH_EXPANDED : VIEW_WIDTH_RESTING;
  const labelGutter = expanded
    ? LABEL_GUTTER_EXPANDED
    : clamp(Math.round(Math.max(...steps.map((step) => step.label.length), 8) * 6.6) + 8, 104, Math.round(VIEW_WIDTH_RESTING * 0.36));
  const band = THICKNESS + BAND_GAP;
  const viewHeight = MARGIN.top + bars.length * band + MARGIN.bottom;
  const plotWidth = Math.max(60, viewWidth - labelGutter - VALUE_GUTTER - MARGIN.right);

  const maximum = Math.max(1, ...bars.map((bar) => bar.end));
  const ticks = niceTicks(maximum, 4);
  const axisMaximum = ticks[ticks.length - 1];
  const x = linearScale(0, axisMaximum, labelGutter, labelGutter + plotWidth);

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const current = active ?? -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setActive(Math.min(bars.length - 1, current + 1));
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setActive(Math.max(0, current <= 0 ? 0 : current - 1));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  return (
    <figure ref={rootRef} className={`chart-figure commercial-baseline${expanded ? " commercial-baseline--expanded" : ""}`} aria-labelledby={headingId}>
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

      {!suppressed && !empty ? (
        <ul className="chart-legend">
          {bars.some((bar) => bar.type === "step" && bar.value >= 0) ? (
            <li>
              <span aria-hidden="true" className="chart-legend__mark chart-legend__mark--swatch" style={{ background: INCREASE_COLOR }} />
              <span className="chart-legend__label">{increaseLabel}</span>
            </li>
          ) : null}
          {bars.some((bar) => bar.type === "step" && bar.value < 0) ? (
            <li>
              <span aria-hidden="true" className="chart-legend__mark chart-legend__mark--swatch" style={{ background: DECREASE_COLOR }} />
              <span className="chart-legend__label">{decreaseLabel}</span>
            </li>
          ) : null}
          {bars.some((bar) => bar.type === "total") ? (
            <li>
              <span aria-hidden="true" className="chart-legend__mark chart-legend__mark--swatch" style={{ background: TOTAL_COLOR }} />
              <span className="chart-legend__label">Running total</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {suppressed ? (
        <p className="chart-figure__unavailable">
          <strong>Not available.</strong> {unavailableReason}
        </p>
      ) : empty ? (
        <p className="chart-figure__empty">{emptyMessage}</p>
      ) : (
        <div className="commercial-baseline__row">
          <div className="commercial-baseline__visual" onPointerLeave={() => setActive(null)}>
            <svg
              className="commercial-baseline__canvas"
              viewBox={`0 0 ${viewWidth} ${viewHeight}`}
              role="img"
              tabIndex={0}
              aria-label={`${title}. ${bars.length} steps: ${bars.map((bar) => `${bar.label} ${formatValue(bar.type === "total" ? bar.value : Math.abs(bar.value))}`).join(", ")}.`}
              onKeyDown={onKeyDown}
              onBlur={() => setActive(null)}
            >
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={x(tick)}
                    x2={x(tick)}
                    y1={MARGIN.top}
                    y2={MARGIN.top + bars.length * band - BAND_GAP}
                    stroke={CHART_GRID}
                    strokeWidth={1}
                  />
                  <text
                    className="chart-axis-text"
                    x={x(tick)}
                    y={viewHeight - 7}
                    textAnchor={tick === 0 ? "start" : "middle"}
                    fill={CHART_AXIS}
                  >
                    {(formatTick ?? formatValue)(tick)}
                  </text>
                </g>
              ))}

              {bars.slice(0, -1).map((bar, index) => {
                const guideX = x(bar.runningAfter);
                const fromY = MARGIN.top + index * band + THICKNESS;
                const toY = MARGIN.top + (index + 1) * band;
                return (
                  <line
                    key={`guide-${bar.key}`}
                    x1={guideX}
                    x2={guideX}
                    y1={fromY}
                    y2={toY}
                    stroke={CHART_AXIS}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    opacity={0.5}
                  />
                );
              })}

              {bars.map((bar, index) => {
                const top = MARGIN.top + index * band;
                const left = x(bar.start);
                const barWidth = Math.max(1.5, x(bar.end) - left);
                const amount =
                  bar.type === "total"
                    ? formatValue(bar.value)
                    : `${bar.value >= 0 ? "+" : "−"}${formatValue(Math.abs(bar.value))}`;
                const inside = labelFits(amount, barWidth, 12, 8);
                return (
                  <g
                    key={bar.key}
                    onPointerEnter={() => setActive(index)}
                    onPointerMove={() => setActive(index)}
                  >
                    <rect x={0} y={top - BAND_GAP / 2} width={Math.max(0, viewWidth)} height={band} fill="transparent" />
                    {!expanded ? (
                      <text
                        className="chart-category-text"
                        x={labelGutter - 10}
                        y={top + THICKNESS / 2}
                        textAnchor="end"
                        dominantBaseline="middle"
                      >
                        {bar.label}
                      </text>
                    ) : null}
                    <path
                      d={barPath(left, top, barWidth, THICKNESS, bar.type === "total" ? THICKNESS / 2 : 6, "horizontal")}
                      fill={bar.color}
                      className={`commercial-baseline__fill${inView ? " commercial-baseline__fill--in-view" : ""}`}
                      style={{ animationDelay: `${index * 90}ms` }}
                      opacity={active === null || active === index ? 1 : 0.55}
                    />
                    <text
                      className={inside ? "chart-value-text chart-value-text--inverse" : "chart-value-text"}
                      x={inside ? left + barWidth - 8 : left + barWidth + 8}
                      y={top + THICKNESS / 2}
                      textAnchor={inside ? "end" : "start"}
                      dominantBaseline="middle"
                    >
                      {amount}
                    </text>
                  </g>
                );
              })}
            </svg>

            {active !== null && bars[active] ? (
              <div
                className="commercial-baseline__callout"
                style={{
                  left: `${clamp((x(bars[active].end) / viewWidth) * 100, 18, 88)}%`,
                  top: "50%"
                }}
              >
                <p className="commercial-baseline__callout-label">{bars[active].label}</p>
                <p className="commercial-baseline__callout-value">
                  {bars[active].type === "total"
                    ? formatValue(bars[active].value)
                    : `${bars[active].value >= 0 ? "+" : "−"}${formatValue(Math.abs(bars[active].value))}`}
                </p>
                {bars[active].detail ? <p className="commercial-baseline__callout-detail">{bars[active].detail}</p> : null}
              </div>
            ) : null}
          </div>

          {expanded ? (
            <div className="commercial-baseline__details">
              <div className="commercial-baseline__details-head">
                <span>Step</span>
                <span>Amount</span>
                <span>Running total</span>
              </div>
              {bars.map((bar) => (
                <div className="commercial-baseline__details-row" key={bar.key}>
                  <span>{bar.label}</span>
                  <span>
                    {bar.type === "total" ? formatValue(bar.value) : `${bar.value >= 0 ? "+" : "−"}${formatValue(Math.abs(bar.value))}`}
                  </span>
                  <span>{formatValue(bar.type === "total" ? bar.value : bar.end === bar.start ? bar.start : bar.value >= 0 ? bar.end : bar.start)}</span>
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

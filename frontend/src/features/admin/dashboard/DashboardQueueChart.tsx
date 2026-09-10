import { Table2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { barPath, clamp, compactNumber, labelFits, linearScale, niceTicks } from "../../../components/charts/chartScale";
import { CHART_AXIS, CHART_GRID } from "../../../components/charts/chartTokens";
import { useChartWidth } from "../../../components/charts/useChartWidth";
import { donutSegmentPath, type DonutRingGeometry } from "./donutPath";

/*
 * Governance's queue-depth chart, bespoke for its own two-shape "Show
 * values" interaction: resting, it is the familiar horizontal bar list;
 * expanded, the bars themselves become a small radial (polar) bar chart —
 * one equal-width spoke per queue, each reaching only as far out as its own
 * value — shrunk to the left, with a values panel sliding in on the right.
 * A Highcharts polar-column screenshot was the visual reference for that
 * radial shape; nothing here depends on Highcharts or its data.
 *
 * This has exactly one consumer (Governance attention's "Waiting on an
 * administrator" card), so it is its own component rather than a mode
 * bolted onto the shared CategoryBarChart or DashboardCategoryBarChart —
 * both of which stay exactly as they were for their own consumers.
 */

export interface DashboardQueueBarDatum {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface DashboardQueueChartLegendEntry {
  label: string;
  color: string;
}

export interface DashboardQueueChartProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  data: DashboardQueueBarDatum[];
  legend?: DashboardQueueChartLegendEntry[];
  formatValue?: (value: number) => string;
  categoryColumnLabel?: string;
  valueColumnLabel?: string;
  unavailableReason?: string;
  empty?: boolean;
  emptyMessage?: string;
  footnote?: ReactNode;
}

const MARGIN = { top: 8, right: 12, bottom: 24 };
const THICKNESS = 24;
const GAP = 10;
const BAND = THICKNESS + GAP;
const VALUE_GUTTER = 76;

const RADIAL_GEOMETRY: DonutRingGeometry = { center: 66, outerRadius: 63, innerRadius: 22, cornerRadius: 3 };
const RADIAL_GAP_RADIANS = (2 * Math.PI) / 180;
const RADIAL_MIN_RADIUS_SHARE = 0.16;

export function DashboardQueueChart({
  eyebrow,
  title,
  subtitle,
  data,
  legend,
  formatValue = compactNumber,
  categoryColumnLabel = "Category",
  valueColumnLabel = "Value",
  unavailableReason,
  empty = false,
  emptyMessage = "No values are tracked for this period yet.",
  footnote
}: DashboardQueueChartProps) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  /*
   * The resting bars render at true pixel scale (a measured container width,
   * not a viewBox stretched by CSS) so axis and category text stay the same
   * size as the rest of the interface regardless of how wide this card is —
   * the same reason every other CategoryBarChart-shaped chart on this
   * dashboard uses useChartWidth. Only the expanded radial view (a small,
   * fixed-size shape) uses the viewBox-scaled-by-CSS technique, because that
   * one needs the smooth shrink transition.
   */
  const { ref: plotRef, width } = useChartWidth(600);

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

  const labelGutter = clamp(
    Math.round(Math.max(...data.map((datum) => datum.label.length), 6) * 6.6) + 8,
    88,
    Math.max(88, Math.round(width * 0.34))
  );
  const plotWidth = Math.max(60, width - labelGutter - VALUE_GUTTER - MARGIN.right);
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

  const radialCount = Math.max(1, data.length);
  const radialAvailableAngle = Math.PI * 2 - RADIAL_GAP_RADIANS * radialCount;
  const radialSliceAngle = radialAvailableAngle / radialCount;
  const radialArcs = data.map((bar, index) => {
    const start = -Math.PI / 2 + index * (radialSliceAngle + RADIAL_GAP_RADIANS);
    const end = start + radialSliceAngle;
    const outerRadius =
      RADIAL_GEOMETRY.innerRadius +
      (RADIAL_GEOMETRY.outerRadius - RADIAL_GEOMETRY.innerRadius) *
        (RADIAL_MIN_RADIUS_SHARE + (1 - RADIAL_MIN_RADIUS_SHARE) * (bar.value / maximum));
    const path = donutSegmentPath({ ...RADIAL_GEOMETRY, outerRadius }, start, end);
    return { ...bar, path };
  });

  return (
    <figure ref={rootRef} className={`chart-figure governance-queue${expanded ? " governance-queue--expanded" : ""}`} aria-labelledby={headingId}>
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
        <div className="governance-queue__row">
          <div className="governance-queue__visual" ref={plotRef} onPointerLeave={() => setActive(null)}>
            {!expanded ? (
              <svg
                key="bars"
                className="governance-queue__canvas governance-queue__canvas--bars"
                width={width}
                height={viewHeight}
                role="img"
                aria-label={`${title}. ${bars.length} queues: ${bars.map((bar) => `${bar.label} ${bar.valueLabel}`).join(", ")}.`}
              >
                {ticks.map((tick) => (
                  <g key={tick}>
                    <line x1={x(tick)} x2={x(tick)} y1={MARGIN.top} y2={MARGIN.top + bars.length * BAND - GAP} stroke={CHART_GRID} strokeWidth={1} />
                    <text className="chart-axis-text" x={x(tick)} y={viewHeight - 7} textAnchor={tick === 0 ? "start" : "middle"} fill={CHART_AXIS}>
                      {formatValue(tick)}
                    </text>
                  </g>
                ))}

                {bars.map((bar, index) => (
                  <g key={bar.key} onPointerEnter={() => setActive(index)} onPointerMove={() => setActive(index)}>
                    <rect x={0} y={bar.top - GAP / 2} width={Math.max(0, width)} height={BAND} fill="transparent" />
                    <text className="chart-category-text" x={labelGutter - 10} y={bar.top + THICKNESS / 2} textAnchor="end" dominantBaseline="middle">
                      {bar.label}
                    </text>
                    <rect x={labelGutter} y={bar.top} width={Math.max(1, plotWidth)} height={THICKNESS} rx={THICKNESS / 2} fill="var(--chart-track)" opacity={active === index ? 0.9 : 0.55} />
                    <path
                      d={barPath(labelGutter, bar.top, bar.barWidth, THICKNESS, THICKNESS / 2, "horizontal")}
                      fill={bar.color}
                      className={`governance-queue__fill${inView ? " governance-queue__fill--in-view" : ""}`}
                      style={{ animationDelay: `${index * 70}ms` }}
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
            ) : (
              <svg
                key="radial"
                className="governance-queue__canvas governance-queue__canvas--radial"
                viewBox="0 0 132 132"
                role="img"
                aria-label={`${title}, as a radial chart. ${bars.length} queues: ${bars.map((bar) => `${bar.label} ${bar.valueLabel}`).join(", ")}.`}
              >
                {radialArcs.map(({ key, path, color }, index) => (
                  <path
                    key={key}
                    d={path}
                    fill={color}
                    className="governance-queue__radial-arc"
                    style={{ animationDelay: `${index * 60}ms` }}
                    opacity={active === null || active === index ? 1 : 0.4}
                    tabIndex={0}
                    onPointerEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive((current) => (current === index ? null : current))}
                  />
                ))}
              </svg>
            )}

            {active !== null && bars[active] ? (
              <div
                className="governance-queue__callout"
                style={
                  expanded
                    ? { left: "50%", top: "50%" }
                    : { left: `${clamp(((labelGutter + bars[active].barWidth) / width) * 100, 18, 88)}%`, top: "50%" }
                }
              >
                <p className="governance-queue__callout-label">{bars[active].label}</p>
                <p className="governance-queue__callout-value">
                  {bars[active].valueLabel} {valueColumnLabel.toLowerCase()}
                </p>
              </div>
            ) : null}
          </div>

          {expanded ? (
            <div className="governance-queue__details">
              <div className="governance-queue__details-head">
                <span aria-hidden="true" />
                <span>{categoryColumnLabel}</span>
                <span>{valueColumnLabel}</span>
              </div>
              {data.map((bar) => (
                <div className="governance-queue__details-row" key={bar.key}>
                  <span aria-hidden="true" className="governance-queue__details-mark" style={{ background: bar.color }} />
                  <span>{bar.label}</span>
                  <span>{formatValue(bar.value)}</span>
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

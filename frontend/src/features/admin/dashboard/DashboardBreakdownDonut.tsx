import { Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ordinalColor, seriesColor } from "../../../components/charts";
import { donutSegmentPath, layoutDonutArcs, type DonutRingGeometry } from "./donutPath";

/*
 * A part-to-whole breakdown as a ring instead of a horizontal stack — the
 * same visual language as the hero's Organization portfolio donut, reused
 * here with its own colour scale per chart. Resting, the ring is centred and
 * large with a legend above it; "Show values" shrinks it to the left and
 * opens a value-by-value breakdown on the right, so every plotted number
 * stays reachable in text, never only as an angle.
 *
 * `variant="variable-radius"` keeps every one of those behaviours (hover
 * callout, legend, shrink-left expand) and only changes how far each arc
 * reaches from the centre: proportional to its own value, the way a
 * Highcharts "variablepie" reads magnitude through radius as well as angle.
 * Default `variant="ring"` is untouched — every other consumer of this
 * component keeps the one uniform outer radius it always had.
 */

export interface DashboardDonutSegment {
  key: string;
  label: string;
  value: number;
  /** Reserved status colour; omit to take the scale's own colour. */
  color?: string;
}

export interface DashboardBreakdownDonutProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  segments: DashboardDonutSegment[];
  scale?: "categorical" | "ordinal";
  formatValue?: (value: number) => string;
  totalLabel?: string;
  unavailableReason?: string;
  emptyMessage?: string;
  footnote?: ReactNode;
  className?: string;
  /** "variable-radius" scales each arc's own outer radius by its value, like a Highcharts variablepie. */
  variant?: "ring" | "variable-radius";
}

const GEOMETRY: DonutRingGeometry = { center: 66, outerRadius: 63, innerRadius: 41, cornerRadius: 4};
const GAP_RADIANS = (1 * Math.PI) / 180;
/** The smallest slice still reaches this far between the inner edge and the full outer radius. */
const MIN_RADIUS_SHARE = 0.35;

export function DashboardBreakdownDonut({
  eyebrow,
  title,
  subtitle,
  segments,
  scale = "categorical",
  formatValue = (value) => value.toLocaleString("en-IN"),
  totalLabel = "Total",
  unavailableReason,
  emptyMessage = "No values are tracked for this period yet.",
  footnote,
  className,
  variant = "ring"
}: DashboardBreakdownDonutProps) {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  const suppressed = Boolean(unavailableReason);
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const painted = segments
    .map((segment, index) => ({
      ...segment,
      color: segment.color ?? (scale === "ordinal" ? ordinalColor(index, segments.length) : seriesColor(index))
    }))
    .filter((segment) => segment.value > 0);
  const empty = total === 0;

  const maxValue = Math.max(1, ...painted.map((segment) => segment.value));
  const laidOut = layoutDonutArcs(GEOMETRY, painted, (segment) => segment.value, GAP_RADIANS);
  const arcs = variant === "variable-radius"
    ? laidOut.map((arc) => {
        const outerRadius =
          GEOMETRY.innerRadius +
          (GEOMETRY.outerRadius - GEOMETRY.innerRadius) * (MIN_RADIUS_SHARE + (1 - MIN_RADIUS_SHARE) * (arc.segment.value / maxValue));
        return { ...arc, path: donutSegmentPath({ ...GEOMETRY, outerRadius }, arc.startAngle, arc.endAngle) };
      })
    : laidOut;
  const share = (value: number) => (total === 0 ? "0%" : `${Math.round((value / total) * 100)}%`);

  return (
    <figure className={`chart-figure chart-donut${expanded ? " chart-donut--expanded" : ""}${variant === "variable-radius" ? " chart-donut--variable-radius" : ""}${className ? ` ${className}` : ""}`}>
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

      {suppressed ? (
        <p className="chart-figure__unavailable">
          <strong>Not available.</strong> {unavailableReason}
        </p>
      ) : empty ? (
        <p className="chart-figure__empty">{emptyMessage}</p>
      ) : (
        <div className="chart-donut__body">
          {!expanded ? (
            <ul className="chart-donut__legend">
              {painted.map((segment) => (
                <li key={segment.key}>
                  <span className="chart-donut__swatch" style={{ background: segment.color }} aria-hidden="true" />
                  {segment.label} <span>{share(segment.value)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="chart-donut__row">
            <div className="chart-donut__visual" onPointerLeave={() => setActive(null)}>
              <svg
                className="chart-donut__ring"
                viewBox="0 0 132 132"
                role="img"
                aria-label={`${title}: ${painted.map((segment) => `${segment.label} ${formatValue(segment.value)}, ${share(segment.value)}`).join(", ")}. Total ${formatValue(total)}.`}
              >
                {arcs.map(({ segment, path }, index) => (
                  <path
                    key={segment.key}
                    d={path}
                    fill={segment.color}
                    className="chart-donut__arc"
                    opacity={active === null || active === index ? 1 : 0.4}
                    tabIndex={0}
                    onPointerEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive((current) => (current === index ? null : current))}
                  />
                ))}
              </svg>

              {active !== null ? (
                <div className="chart-donut__callout">
                  <p className="chart-donut__callout-label">{arcs[active].segment.label}</p>
                  <p className="chart-donut__callout-value">{formatValue(arcs[active].segment.value)}</p>
                  <p className="chart-donut__callout-detail">{share(arcs[active].segment.value)} of {formatValue(total)}</p>
                </div>
              ) : null}
            </div>

            {expanded ? (
              <dl className="chart-donut__details">
                {segments.map((segment, index) => {
                  const paintedSegment = painted.find((entry) => entry.key === segment.key);
                  const color = paintedSegment?.color ?? (scale === "ordinal" ? ordinalColor(index, segments.length) : seriesColor(index));
                  return (
                    <div key={segment.key}>
                      <span className="chart-donut__details-mark" aria-hidden="true" style={{ background: color }} />
                      <div>
                        <dt>{segment.label}</dt>
                        <dd>{formatValue(segment.value)} <span>· {share(segment.value)}</span></dd>
                      </div>
                    </div>
                  );
                })}
                <div className="chart-donut__details-total">
                  <dt>{totalLabel}</dt>
                  <dd>{formatValue(total)}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </div>
      )}

      {footnote && !suppressed ? <figcaption className="chart-figure__footnote">{footnote}</figcaption> : null}
    </figure>
  );
}

import { useMemo, useState, type KeyboardEvent } from "react";

import { barPath, clamp, compactNumber, labelFits, linearScale, niceTicks } from "./chartScale";
import { CHART_AXIS, CHART_GRID, ordinalColor, seriesColor } from "./chartTokens";
import { ChartFigure, type ChartFigureProps } from "./ChartFigure";
import { ChartTooltip } from "./ChartTooltip";
import { useChartWidth } from "./useChartWidth";

/*
 * Magnitude, low to high, as horizontal bars — the form that survives long
 * category names without rotated axis text.
 *
 * Colour follows the scale's nature, not the bar's size: nominal categories all
 * take one hue (bar length already carries the value, so spending the identity
 * channel on it would double-encode), ordered ones take the one-hue ordinal
 * ramp so the order is visible in the colour. A `color` on a datum is for
 * status meaning only.
 */

export interface CategoryBarDatum {
  key: string;
  label: string;
  value: number;
  /** Reserved status colour; omit to take the scale's own colour. */
  color?: string;
  detail?: string;
}

export interface CategoryBarChartProps
  extends Omit<ChartFigureProps, "children" | "table" | "legend"> {
  data: CategoryBarDatum[];
  formatValue?: (value: number) => string;
  /** "ordinal" when reordering the categories would change their meaning. */
  scale?: "nominal" | "ordinal";
  legend?: ChartFigureProps["legend"];
  categoryColumnLabel?: string;
  valueColumnLabel?: string;
  detailColumnLabel?: string;
  maxBarThickness?: number;
}

const MARGIN = { top: 8, right: 12, bottom: 24 };
const BAND_GAP = 10;
const VALUE_GUTTER = 76;

export function CategoryBarChart({
  data,
  formatValue = compactNumber,
  scale = "nominal",
  legend,
  categoryColumnLabel = "Category",
  valueColumnLabel = "Value",
  detailColumnLabel,
  maxBarThickness = 24,
  ...figure
}: CategoryBarChartProps) {
  const { ref, width } = useChartWidth(600);
  const [active, setActive] = useState<number | null>(null);

  const labelGutter = clamp(
    Math.round(Math.max(...data.map((datum) => datum.label.length), 6) * 6.6) + 8,
    88,
    Math.max(88, Math.round(width * 0.34))
  );

  const bars = useMemo(
    () =>
      data.map((datum, index) => ({
        ...datum,
        color:
          datum.color ?? (scale === "ordinal" ? ordinalColor(index, data.length) : seriesColor(0))
      })),
    [data, scale]
  );

  const maximum = Math.max(1, ...bars.map((bar) => bar.value));
  const ticks = niceTicks(maximum, 4);
  const axisMaximum = ticks[ticks.length - 1];

  const thickness = Math.min(maxBarThickness, 24);
  const band = thickness + BAND_GAP;
  const height = MARGIN.top + bars.length * band + MARGIN.bottom;
  const plotWidth = Math.max(80, width - labelGutter - VALUE_GUTTER - MARGIN.right);
  const x = linearScale(0, axisMaximum, labelGutter, labelGutter + plotWidth);

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (bars.length === 0) return;
    const current = active ?? -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setActive(Math.min(bars.length - 1, current + 1));
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setActive(Math.max(0, current <= 0 ? 0 : current - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(bars.length - 1);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  return (
    <ChartFigure
      {...figure}
      legend={legend}
      table={{
        caption: `${figure.title} — every plotted value.`,
        columns: [
          categoryColumnLabel,
          valueColumnLabel,
          ...(detailColumnLabel ? [detailColumnLabel] : [])
        ],
        rows: bars.map((bar) => ({
          header: bar.label,
          cells: [formatValue(bar.value), ...(detailColumnLabel ? [bar.detail ?? "—"] : [])]
        }))
      }}
    >
      <div className="chart-plot" ref={ref}>
        <svg
          className="chart-plot__canvas"
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          aria-label={`${figure.title}. ${bars.length} ${bars.length === 1 ? "bar" : "bars"}. Use the arrow keys to read each bar, or open the values table.`}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
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
                y={height - 7}
                textAnchor={tick === 0 ? "start" : "middle"}
                fill={CHART_AXIS}
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}

          {bars.map((bar, index) => {
            const top = MARGIN.top + index * band;
            const barWidth = Math.max(0, x(bar.value) - labelGutter);
            const valueLabel = formatValue(bar.value);
            const inside = labelFits(valueLabel, barWidth, 12, 8);
            return (
              <g
                key={bar.key}
                onPointerEnter={() => setActive(index)}
                onPointerMove={() => setActive(index)}
              >
                {/* The hit area spans the whole band, never only the painted bar. */}
                <rect
                  x={0}
                  y={top - BAND_GAP / 2}
                  width={Math.max(0, width)}
                  height={band}
                  fill="transparent"
                />
                <text
                  className="chart-category-text"
                  x={labelGutter - 10}
                  y={top + thickness / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {bar.label}
                </text>
                <rect
                  x={labelGutter}
                  y={top}
                  width={Math.max(1, plotWidth)}
                  height={thickness}
                  rx={4}
                  fill="var(--chart-track)"
                  opacity={active === index ? 0.9 : 0.55}
                />
                <path
                  d={barPath(labelGutter, top, barWidth, thickness, 4, "horizontal")}
                  fill={bar.color}
                  opacity={active === null || active === index ? 1 : 0.55}
                />
                <text
                  className={inside ? "chart-value-text chart-value-text--inverse" : "chart-value-text"}
                  x={inside ? labelGutter + barWidth - 8 : labelGutter + barWidth + 8}
                  y={top + thickness / 2}
                  textAnchor={inside ? "end" : "start"}
                  dominantBaseline="middle"
                >
                  {valueLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {active !== null && bars[active] ? (
          <ChartTooltip
            title={bars[active].label}
            rows={[
              {
                key: bars[active].key,
                label: valueColumnLabel,
                value: formatValue(bars[active].value),
                color: bars[active].color
              }
            ]}
            note={bars[active].detail}
            x={clamp(labelGutter + 12, 0, Math.max(0, width - 12))}
            y={MARGIN.top + active * band + thickness + 6}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">
          {active !== null && bars[active]
            ? `${bars[active].label}: ${formatValue(bars[active].value)}${bars[active].detail ? `. ${bars[active].detail}` : ""}`
            : ""}
        </p>
      </div>
    </ChartFigure>
  );
}

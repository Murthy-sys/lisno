import { useState, type KeyboardEvent } from "react";

import { barPath, clamp, labelFits, linearScale, niceTicks } from "./chartScale";
import { CHART_AXIS, CHART_GRID, statusColor, type ChartStatus } from "./chartTokens";
import { ChartFigure, type ChartFigureProps } from "./ChartFigure";
import { ChartTooltip } from "./ChartTooltip";
import { useChartWidth } from "./useChartWidth";

/*
 * How one total is spent down to another — a waterfall of signed steps with
 * running subtotals.
 *
 * The sign is what the reader is here for, so colour does polarity: a step that
 * adds and a step that subtracts are the two poles, and a subtotal is a neutral
 * anchored bar. That is the diverging job, not the categorical one, so the
 * status scale supplies the two hues and no series slot is spent.
 */

export interface WaterfallStep {
  key: string;
  label: string;
  /** Signed for a step; the running total for `type: "total"`. */
  value: number;
  type: "step" | "total";
  detail?: string;
}

export interface WaterfallChartProps
  extends Omit<ChartFigureProps, "children" | "table" | "legend"> {
  steps: WaterfallStep[];
  formatValue: (value: number) => string;
  formatTick?: (value: number) => string;
  /** Names the polarity in the legend, e.g. "Adds to the total". */
  increaseLabel?: string;
  decreaseLabel?: string;
}

const MARGIN = { top: 8, right: 12, bottom: 24 };
const BAND_GAP = 10;
const THICKNESS = 22;
const VALUE_GUTTER = 108;

export function WaterfallChart({
  steps,
  formatValue,
  formatTick,
  increaseLabel = "Adds",
  decreaseLabel = "Subtracts",
  ...figure
}: WaterfallChartProps) {
  const { ref, width } = useChartWidth(600);
  const [active, setActive] = useState<number | null>(null);

  let running = 0;
  const bars = steps.map((step) => {
    if (step.type === "total") {
      running = step.value;
      return { ...step, start: 0, end: step.value, status: "neutral" as ChartStatus };
    }
    const start = running;
    running += step.value;
    return {
      ...step,
      start: Math.min(start, running),
      end: Math.max(start, running),
      status: (step.value >= 0 ? "good" : "serious") as ChartStatus
    };
  });

  const maximum = Math.max(1, ...bars.map((bar) => bar.end));
  const ticks = niceTicks(maximum, 4);
  const axisMaximum = ticks[ticks.length - 1];

  const labelGutter = clamp(
    Math.round(Math.max(...steps.map((step) => step.label.length), 8) * 6.6) + 8,
    104,
    Math.max(104, Math.round(width * 0.36))
  );
  const band = THICKNESS + BAND_GAP;
  const height = MARGIN.top + bars.length * band + MARGIN.bottom;
  const plotWidth = Math.max(80, width - labelGutter - VALUE_GUTTER - MARGIN.right);
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
    <ChartFigure
      {...figure}
      legend={[
        ...(bars.some((bar) => bar.type === "step" && bar.value >= 0)
          ? [{ label: increaseLabel, color: statusColor("good"), mark: "swatch" as const }]
          : []),
        ...(bars.some((bar) => bar.type === "step" && bar.value < 0)
          ? [{ label: decreaseLabel, color: statusColor("serious"), mark: "swatch" as const }]
          : []),
        ...(bars.some((bar) => bar.type === "total")
          ? [{ label: "Running total", color: statusColor("neutral"), mark: "swatch" as const }]
          : [])
      ]}
      table={{
        caption: `${figure.title} — every plotted value.`,
        columns: ["Step", "Amount", "Running total"],
        rows: bars.map((bar) => ({
          header: bar.label,
          cells: [
            bar.type === "total" ? formatValue(bar.value) : `${bar.value >= 0 ? "+" : "−"}${formatValue(Math.abs(bar.value))}`,
            formatValue(bar.type === "total" ? bar.value : bar.end === bar.start ? bar.start : bar.value >= 0 ? bar.end : bar.start)
          ]
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
          aria-label={`${figure.title}. ${bars.length} steps. Use the arrow keys to read each step, or open the values table.`}
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
                {(formatTick ?? formatValue)(tick)}
              </text>
            </g>
          ))}

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
                <rect x={0} y={top - BAND_GAP / 2} width={Math.max(0, width)} height={band} fill="transparent" />
                <text
                  className="chart-category-text"
                  x={labelGutter - 10}
                  y={top + THICKNESS / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {bar.label}
                </text>
                <path
                  d={barPath(left, top, barWidth, THICKNESS, bar.type === "total" ? 3 : 4, "horizontal")}
                  fill={statusColor(bar.status)}
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
          <ChartTooltip
            title={bars[active].label}
            rows={[
              {
                key: bars[active].key,
                label: bars[active].type === "total" ? "Running total" : "Change",
                value:
                  bars[active].type === "total"
                    ? formatValue(bars[active].value)
                    : `${bars[active].value >= 0 ? "+" : "−"}${formatValue(Math.abs(bars[active].value))}`,
                color: statusColor(bars[active].status)
              }
            ]}
            note={bars[active].detail}
            x={clamp(labelGutter + 12, 0, Math.max(0, width - 12))}
            y={MARGIN.top + active * band + THICKNESS + 6}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">
          {active !== null && bars[active]
            ? `${bars[active].label}: ${formatValue(Math.abs(bars[active].value))}`
            : ""}
        </p>
      </div>
    </ChartFigure>
  );
}

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import { areaPath, clamp, compactNumber, linePath, linearScale, niceTicks } from "./chartScale";
import { CHART_AXIS, CHART_DE_EMPHASIS, CHART_GRID, seriesColor } from "./chartTokens";
import { ChartFigure, type ChartFigureProps } from "./ChartFigure";
import { ChartTooltip, type ChartTooltipRow } from "./ChartTooltip";
import { useChartWidth } from "./useChartWidth";

/*
 * Trend over time. One y-axis, always: two measures of different scale get two
 * charts, never a second axis. Lines are 2px with round joins; the single-series
 * case adds a ~10% wash rather than a saturated block.
 *
 * Identity never rests on colour alone — the legend is always present for two
 * or more series, and end labels supplement it where they fit without collision.
 */

export interface TimeSeriesSeries {
  key: string;
  label: string;
  values: Array<number | null>;
  /** Overrides the categorical slot; use for status-meaning series only. */
  color?: string;
}

export interface TimeSeriesChartProps
  extends Omit<ChartFigureProps, "children" | "table" | "legend"> {
  labels: string[];
  series: TimeSeriesSeries[];
  formatValue?: (value: number) => string;
  formatTick?: (value: number) => string;
  height?: number;
  /** Draws the wash under a single series; ignored when several are plotted. */
  area?: boolean;
  /** Emphasis form: this series keeps its hue, the rest recede to gray. */
  emphasisKey?: string;
  tableValueColumnLabel?: string;
}

const MARGIN = { top: 14, bottom: 26, left: 52 };
/* Right gutter reserved for end labels; none is reserved when they are dropped. */
const END_LABEL_GUTTER = 58;
const LABEL_SPACING = 14;

export function TimeSeriesChart({
  labels,
  series,
  formatValue = compactNumber,
  formatTick = compactNumber,
  height = 220,
  area = false,
  emphasisKey,
  tableValueColumnLabel,
  ...figure
}: TimeSeriesChartProps) {
  const { ref, width } = useChartWidth(680);
  const [cursor, setCursor] = useState<number | null>(null);

  const colored = useMemo(
    () =>
      series.map((entry, index) => ({
        ...entry,
        color:
          entry.color ??
          (emphasisKey && entry.key !== emphasisKey ? CHART_DE_EMPHASIS : seriesColor(index))
      })),
    [series, emphasisKey]
  );

  const maximum = Math.max(
    1,
    ...colored.flatMap((entry) => entry.values.map((value) => value ?? 0))
  );
  const ticks = niceTicks(maximum, height >= 200 ? 4 : 3);
  const axisMaximum = ticks[ticks.length - 1];

  const showEndLabels = colored.length <= 4;
  const marginRight = showEndLabels ? END_LABEL_GUTTER : 18;
  const plotWidth = Math.max(120, width - MARGIN.left - marginRight);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const y = linearScale(0, axisMaximum, MARGIN.top + plotHeight, MARGIN.top);
  const x = (index: number) =>
    labels.length === 1
      ? MARGIN.left + plotWidth / 2
      : MARGIN.left + (index / (labels.length - 1)) * plotWidth;

  const paths = colored.map((entry) => {
    const points = entry.values
      .map((value, index) => (value === null ? null : { x: x(index), y: y(value) }))
      .filter((point): point is { x: number; y: number } => point !== null);
    return { ...entry, points };
  });

  /*
   * End labels are placed only when they separate. Where two would sit on top
   * of one another they are pushed apart and given a leader line, so a label
   * never detaches from the line it belongs to.
   */
  const endLabels = useMemo(() => {
    if (!showEndLabels) return [];
    const anchors = paths
      .map((entry) => {
        const last = entry.points[entry.points.length - 1];
        return last ? { key: entry.key, color: entry.color, anchorY: last.y, x: last.x, value: entry.values[entry.values.length - 1] } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.value !== null)
      .sort((first, second) => first.anchorY - second.anchorY);

    let previous = -Infinity;
    return anchors.map((anchor) => {
      const labelY = Math.max(anchor.anchorY, previous + LABEL_SPACING);
      previous = labelY;
      return { ...anchor, labelY, leader: Math.abs(labelY - anchor.anchorY) > 1 };
    });
  }, [paths, showEndLabels]);

  /*
   * Tick density is measured, not guessed: the longest label sets the slot
   * width, so ticks thin out rather than overprinting each other. The last
   * point always gets a tick — it replaces its neighbour when the two would
   * collide instead of being squeezed in beside it.
   */
  const tickLabelIndexes = useMemo(() => {
    if (labels.length <= 1) return [0];
    const longest = labels.reduce((widest, label) => Math.max(widest, label.length), 0);
    const slot = longest * 6.4 + 24;
    const fits = Math.max(2, Math.floor(plotWidth / slot));
    const stride = Math.max(1, Math.ceil((labels.length - 1) / (fits - 1)));
    const indexes: number[] = [];
    for (let index = 0; index < labels.length; index += stride) indexes.push(index);
    const last = labels.length - 1;
    if (indexes[indexes.length - 1] !== last) {
      if (last - indexes[indexes.length - 1] < stride * 0.7) indexes.pop();
      indexes.push(last);
    }
    return indexes;
  }, [labels, plotWidth]);

  const moveCursor = (clientX: number, bounds: DOMRect) => {
    if (labels.length === 0) return;
    const offset = clientX - bounds.left - MARGIN.left;
    const index =
      labels.length === 1
        ? 0
        : Math.round(clamp(offset / plotWidth, 0, 1) * (labels.length - 1));
    setCursor(index);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (labels.length === 0) return;
    const current = cursor ?? labels.length - 1;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setCursor(Math.min(labels.length - 1, current + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCursor(Math.max(0, current - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCursor(labels.length - 1);
    } else if (event.key === "Escape") {
      setCursor(null);
    }
  };

  const tooltipRows: ChartTooltipRow[] =
    cursor === null
      ? []
      : colored.map((entry) => ({
          key: entry.key,
          label: entry.label,
          color: entry.color,
          value: entry.values[cursor] === null ? "Not available" : formatValue(entry.values[cursor]!)
        }));

  const readout =
    cursor === null
      ? ""
      : `${labels[cursor]}: ${tooltipRows.map((row) => `${row.label} ${row.value}`).join(", ")}`;

  return (
    <ChartFigure
      {...figure}
      legend={colored.map((entry) => ({ label: entry.label, color: entry.color, mark: "line" }))}
      table={{
        caption: `${figure.title} — every plotted value.`,
        columns: [tableValueColumnLabel ?? "Point", ...colored.map((entry) => entry.label)],
        rows: labels.map((label, index) => ({
          header: label,
          cells: colored.map((entry) =>
            entry.values[index] === null ? "Not available" : formatValue(entry.values[index]!)
          )
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
          aria-label={`${figure.title}. ${colored.length} ${colored.length === 1 ? "series" : "series"} over ${labels.length} ${labels.length === 1 ? "point" : "points"}. Use the arrow keys to read each point, or open the values table.`}
          onKeyDown={onKeyDown}
          onBlur={() => setCursor(null)}
          onPointerMove={(event: PointerEvent<SVGSVGElement>) =>
            moveCursor(event.clientX, event.currentTarget.getBoundingClientRect())
          }
          onPointerLeave={() => setCursor(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke={CHART_GRID}
                strokeWidth={1}
              />
              <text
                className="chart-axis-text"
                x={MARGIN.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill={CHART_AXIS}
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}

          {tickLabelIndexes.map((index) => (
            <text
              key={labels[index] ?? index}
              className="chart-axis-text"
              x={x(index)}
              y={height - 8}
              textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}
              fill={CHART_AXIS}
            >
              {labels[index]}
            </text>
          ))}

          {area && paths.length === 1 && paths[0].points.length > 1 ? (
            <path
              d={areaPath(paths[0].points, MARGIN.top + plotHeight)}
              fill={paths[0].color}
              fillOpacity={0.1}
            />
          ) : null}

          {paths.map((entry) =>
            entry.points.length > 1 ? (
              <path
                key={entry.key}
                d={linePath(entry.points)}
                fill="none"
                stroke={entry.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null
          )}

          {/* A single observation has no line to read; it is drawn as its marker. */}
          {paths.map((entry) =>
            entry.points.length === 1 ? (
              <circle
                key={`${entry.key}-solo`}
                cx={entry.points[0].x}
                cy={entry.points[0].y}
                r={5}
                fill={entry.color}
                stroke="var(--chart-surface)"
                strokeWidth={2}
              />
            ) : null
          )}

          {cursor !== null ? (
            <g>
              <line
                x1={x(cursor)}
                x2={x(cursor)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                stroke={CHART_AXIS}
                strokeWidth={1}
                opacity={0.45}
              />
              {paths.map((entry) => {
                const value = entry.values[cursor];
                if (value === null || value === undefined) return null;
                return (
                  <circle
                    key={`${entry.key}-cursor`}
                    cx={x(cursor)}
                    cy={y(value)}
                    r={4.5}
                    fill={entry.color}
                    stroke="var(--chart-surface)"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          ) : null}

          {endLabels.map((label) => (
            <g key={`${label.key}-end`}>
              {label.leader ? (
                <line
                  x1={label.x}
                  x2={label.x + 6}
                  y1={label.anchorY}
                  y2={label.labelY}
                  stroke={label.color}
                  strokeWidth={1}
                  opacity={0.6}
                />
              ) : null}
              <text
                className="chart-value-text"
                x={label.x + 8}
                y={label.labelY}
                textAnchor="start"
                dominantBaseline="middle"
              >
                {formatTick(label.value as number)}
              </text>
            </g>
          ))}
        </svg>

        {cursor !== null ? (
          <ChartTooltip
            title={labels[cursor]}
            rows={tooltipRows}
            x={clamp(x(cursor), 0, Math.max(0, width - 12))}
            y={MARGIN.top}
            align={x(cursor) > width * 0.6 ? "end" : "start"}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">
          {readout}
        </p>
      </div>
    </ChartFigure>
  );
}

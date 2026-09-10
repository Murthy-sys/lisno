import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { clamp, compactNumber, linearScale, niceTicks, smoothAreaPath, smoothPath } from "./chartScale";
import { CHART_AXIS, CHART_DE_EMPHASIS, CHART_GRID, seriesColor } from "./chartTokens";
import { ChartFigure, type ChartFigureProps } from "./ChartFigure";
import { ChartTooltip, type ChartTooltipRow } from "./ChartTooltip";
import { useChartWidth } from "./useChartWidth";

/*
 * Trend over time. One y-axis, always: two measures of different scale get two
 * charts, never a second axis. Lines are drawn as a smooth Catmull-Rom curve
 * through every real point — never a fit, just a gentler join than a straight
 * polyline — with a 2px stroke and round joins. The first series carries a
 * soft gradient down to the axis, so the primary trend has a floor to stand
 * on; every other series stays a clean line so the two never compete.
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
  emphasisKey,
  tableValueColumnLabel,
  ...figure
}: TimeSeriesChartProps) {
  const { ref, width } = useChartWidth(680);
  const [cursor, setCursor] = useState<number | null>(null);
  const gradientId = useId();

  /*
   * The line draws in once this chart first scrolls into view, rather than
   * on mount — these three cards sit below the fold, and a mount-triggered
   * animation would already be finished by the time a reader scrolls to
   * them. IntersectionObserver is absent in jsdom, so tests (and any engine
   * without it) fall back to already-visible, matching the ResizeObserver
   * fallback in useChartWidth.
   */
  const [inView, setInView] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (inView) return;
    const node = ref.current;
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
      tableDisplay="modal"
    >
      <div className={`chart-plot${inView ? " chart-plot--in-view" : ""}`} ref={ref}>
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
          <defs>
            {paths[0] ? (
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={paths[0].color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={paths[0].color} stopOpacity={0} />
              </linearGradient>
            ) : null}
          </defs>

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

          {paths[0] && paths[0].points.length > 1 ? (
            <path
              className="chart-plot__area"
              d={smoothAreaPath(paths[0].points, MARGIN.top + plotHeight)}
              fill={`url(#${gradientId})`}
            />
          ) : null}

          {paths.map((entry, index) =>
            entry.points.length > 1 ? (
              <path
                key={entry.key}
                className="chart-plot__line"
                style={{ animationDelay: `${index * 140}ms` }}
                d={smoothPath(entry.points)}
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
              <circle cx={label.x} cy={label.anchorY} r={3} fill={label.color} stroke="var(--chart-surface)" strokeWidth={1.5} />
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

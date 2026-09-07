import { useId, useState, type KeyboardEvent } from "react";

import { clamp, compactNumber, labelFits } from "./chartScale";
import { ordinalColor, seriesColor, SURFACE_GAP } from "./chartTokens";
import { ChartFigure, type ChartFigureProps } from "./ChartFigure";
import { ChartTooltip } from "./ChartTooltip";
import { useChartWidth } from "./useChartWidth";

/*
 * Part-to-whole as one horizontal stack. Horizontal because the categories here
 * carry long names, and because a stack read left-to-right needs no rotated text.
 *
 * The segments are separated by a 2px gap in the surface colour — never by a
 * stroke, which would add data-weight ink that is not data. A segment label is
 * rendered inside the segment only when the measured text clears it with
 * padding on both sides; otherwise the legend and the table carry it, and it is
 * never clipped.
 */

export interface StackedSegment {
  key: string;
  label: string;
  value: number;
  /** Reserved status colour; omit to take the scale's own colour. */
  color?: string;
}

export interface StackedBarChartProps
  extends Omit<ChartFigureProps, "children" | "table" | "legend"> {
  segments: StackedSegment[];
  formatValue?: (value: number) => string;
  scale?: "categorical" | "ordinal";
  totalLabel?: string;
  categoryColumnLabel?: string;
  valueColumnLabel?: string;
  height?: number;
}

export function StackedBarChart({
  segments,
  formatValue = compactNumber,
  scale = "categorical",
  totalLabel = "Total",
  categoryColumnLabel = "Segment",
  valueColumnLabel = "Value",
  height = 34,
  ...figure
}: StackedBarChartProps) {
  const { ref, width } = useChartWidth(560);
  const clipId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);

  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const painted = segments
    .map((segment, index) => ({
      ...segment,
      color:
        segment.color ??
        (scale === "ordinal" ? ordinalColor(index, segments.length) : seriesColor(index))
    }))
    .filter((segment) => segment.value > 0);

  let offset = 0;
  const placed = painted.map((segment, index) => {
    const share = total === 0 ? 0 : segment.value / total;
    const isLast = index === painted.length - 1;
    const raw = share * width;
    const segmentWidth = Math.max(0, isLast ? width - offset : raw - SURFACE_GAP);
    const box = { ...segment, x: offset, width: segmentWidth, share };
    offset += raw;
    return box;
  });

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (placed.length === 0) return;
    const current = active ?? -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(placed.length - 1, current + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(0, current <= 0 ? 0 : current - 1));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const share = (value: number) => (total === 0 ? "0%" : `${Math.round((value / total) * 100)}%`);

  return (
    <ChartFigure
      {...figure}
      legend={painted.map((segment) => ({
        label: segment.label,
        color: segment.color,
        mark: "swatch",
        value: `${formatValue(segment.value)} · ${share(segment.value)}`
      }))}
      table={{
        caption: `${figure.title} — every plotted value.`,
        columns: [categoryColumnLabel, valueColumnLabel, "Share"],
        rows: [
          ...segments.map((segment) => ({
            header: segment.label,
            cells: [formatValue(segment.value), share(segment.value)]
          })),
          { header: totalLabel, cells: [formatValue(total), "100%"] }
        ]
      }}
      empty={figure.empty ?? total === 0}
    >
      <div className="chart-plot chart-plot--stack" ref={ref}>
        <svg
          className="chart-plot__canvas"
          width={width}
          height={height}
          role="img"
          tabIndex={0}
          aria-label={`${figure.title}. ${painted.length} ${painted.length === 1 ? "segment" : "segments"} of ${formatValue(total)}. Use the arrow keys to read each segment, or open the values table.`}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={Math.max(0, width)} height={height} rx={6} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <rect x={0} y={0} width={Math.max(0, width)} height={height} fill="var(--chart-track)" />
            {placed.map((segment, index) => {
              const label = `${formatValue(segment.value)}`;
              const inside = labelFits(label, segment.width, 12, 7);
              return (
                <g
                  key={segment.key}
                  onPointerEnter={() => setActive(index)}
                  onPointerMove={() => setActive(index)}
                >
                  <rect
                    x={segment.x}
                    y={0}
                    width={segment.width}
                    height={height}
                    fill={segment.color}
                    opacity={active === null || active === index ? 1 : 0.6}
                  />
                  {inside ? (
                    <text
                      className="chart-value-text chart-value-text--inverse"
                      x={segment.x + segment.width / 2}
                      y={height / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {active !== null && placed[active] ? (
          <ChartTooltip
            title={placed[active].label}
            rows={[
              {
                key: placed[active].key,
                label: `${share(placed[active].value)} of ${formatValue(total)}`,
                value: formatValue(placed[active].value),
                color: placed[active].color
              }
            ]}
            x={clamp(placed[active].x + placed[active].width / 2, 0, Math.max(0, width - 12))}
            y={height + 6}
            align={placed[active].x > width * 0.6 ? "end" : "start"}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">
          {active !== null && placed[active]
            ? `${placed[active].label}: ${formatValue(placed[active].value)}, ${share(placed[active].value)} of ${formatValue(total)}`
            : ""}
        </p>
      </div>
    </ChartFigure>
  );
}

import { areaPath, linePath, linearScale } from "./chartScale";
import { CHART_DE_EMPHASIS } from "./chartTokens";

/*
 * Twelve-ish points of shape, no axes and no numbers — the trend that gives a
 * stat tile's value its direction. The line stays in the de-emphasis hue and
 * only the current point wears the accent, so a wall of tiles never reads as a
 * wall of charts. The values themselves live in the tile's own text and in the
 * full chart the tile links to.
 */

export function Sparkline({
  values,
  accent,
  width = 96,
  height = 28,
  label
}: {
  values: number[];
  accent: string;
  width?: number;
  height?: number;
  label: string;
}) {
  if (values.length === 0) return null;

  const maximum = Math.max(...values);
  const minimum = Math.min(...values, 0);
  const y = linearScale(minimum, maximum === minimum ? minimum + 1 : maximum, height - 3, 3);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 6) + 3,
    y: y(value)
  }));
  const last = points[points.length - 1];

  return (
    <svg className="chart-sparkline" width={width} height={height} role="img" aria-label={label}>
      {points.length > 1 ? (
        <>
          <path d={areaPath(points, height)} fill={CHART_DE_EMPHASIS} fillOpacity={0.18} />
          <path
            d={linePath(points)}
            fill="none"
            stroke={CHART_DE_EMPHASIS}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      <circle cx={last.x} cy={last.y} r={3.5} fill={accent} stroke="var(--chart-surface)" strokeWidth={2} />
    </svg>
  );
}

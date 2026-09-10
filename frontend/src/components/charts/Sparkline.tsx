import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { linearScale, smoothAreaPath, smoothPath } from "./chartScale";
import { CHART_DE_EMPHASIS } from "./chartTokens";

/*
 * Twelve-ish points of shape, no axes and no numbers — the trend that gives a
 * stat tile's value its direction. The line stays in the de-emphasis hue and
 * only the current point wears the accent, so a wall of tiles never reads as a
 * wall of charts. The values themselves live in the tile's own text and in the
 * full chart the tile links to.
 *
 * The line draws itself in left to right on mount (Framer Motion's
 * `pathLength`, not a CSS stroke-dashoffset keyframe like every other chart
 * on this dashboard) — this is the one sparkline in the hero band, always
 * on screen immediately rather than scrolled into view, so a plain
 * mount-triggered draw is enough; no IntersectionObserver needed.
 */

export function Sparkline({
  values,
  accent,
  width = 96,
  height = 28,
  label,
  lineColor = CHART_DE_EMPHASIS,
  lineWidth = 2
}: {
  values: number[];
  accent: string;
  width?: number;
  height?: number;
  label: string;
  /** Line stroke and area-fill hue; defaults to the shared de-emphasis tone. */
  lineColor?: string;
  lineWidth?: number;
}) {
  const gradientId = useId();
  const reduceMotion = useReducedMotion();
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
    <svg
      className="chart-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      {points.length > 1 ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <motion.path
            className="chart-sparkline__area"
            d={smoothAreaPath(points, height)}
            fill={`url(#${gradientId})`}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: reduceMotion ? 0 : 1.1, ease: "easeOut" }}
          />
          <motion.path
            className="chart-sparkline__line"
            d={smoothPath(points)}
            fill="none"
            stroke={lineColor}
            strokeWidth={lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />
        </>
      ) : null}
      <motion.circle
        className="chart-sparkline__pulse"
        cx={last.x}
        cy={last.y}
        r={3.5}
        fill="none"
        stroke={accent}
        strokeWidth={1.5}
        initial={reduceMotion || points.length <= 1 ? false : { opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: reduceMotion || points.length <= 1 ? 0 : 2, ease: "easeOut" }}
        style={{ transformOrigin: `${last.x}px ${last.y}px` }}
      />
      <motion.circle
        cx={last.x}
        cy={last.y}
        r={3.5}
        fill={accent}
        stroke="var(--chart-surface)"
        strokeWidth={2}
        initial={reduceMotion || points.length <= 1 ? false : { opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: reduceMotion || points.length <= 1 ? 0 : 2, ease: "easeOut" }}
        style={{ transformOrigin: `${last.x}px ${last.y}px` }}
      />
    </svg>
  );
}

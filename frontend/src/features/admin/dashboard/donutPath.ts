/*
 * Shared geometry for every "ring with small rounded corners" donut on this
 * dashboard (the hero's portfolio ratios, and the lifecycle/risk breakdown
 * cards). A full round linecap caps at half the stroke width and reads as a
 * separate pill rather than a slice of one ring, so segments are built as
 * filled paths with a small fillet on each of their 4 corners instead. The
 * two edges meeting at any such corner are always exactly perpendicular
 * (radial vs. tangential), so each fillet is a plain quarter circle — no
 * need for true circle-tangent geometry, just inset the arc's angular span
 * by radius/circleRadius on each end and join with a small arc.
 */

export interface DonutRingGeometry {
  center: number;
  outerRadius: number;
  innerRadius: number;
  cornerRadius: number;
}

function point(center: number, radius: number, angle: number): [number, number] {
  return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
}

export function donutSegmentPath(geometry: DonutRingGeometry, startAngle: number, endAngle: number): string {
  const { center, outerRadius, innerRadius, cornerRadius } = geometry;
  const span = endAngle - startAngle;
  const r = Math.min(cornerRadius, (outerRadius - innerRadius) / 2, (span * innerRadius) / 3);
  const deltaOuter = r / outerRadius;
  const deltaInner = r / innerRadius;

  const outerStart = point(center, outerRadius, startAngle + deltaOuter);
  const outerEnd = point(center, outerRadius, endAngle - deltaOuter);
  const endLineOuter = point(center, outerRadius - r, endAngle);
  const endLineInner = point(center, innerRadius + r, endAngle);
  const innerEnd = point(center, innerRadius, endAngle - deltaInner);
  const innerStart = point(center, innerRadius, startAngle + deltaInner);
  const startLineInner = point(center, innerRadius + r, startAngle);
  const startLineOuter = point(center, outerRadius - r, startAngle);
  const outerLargeArc = span - deltaOuter * 2 > Math.PI ? 1 : 0;
  const innerLargeArc = span - deltaInner * 2 > Math.PI ? 1 : 0;

  return [
    `M ${outerStart.join(",")}`,
    `A ${outerRadius} ${outerRadius} 0 ${outerLargeArc} 1 ${outerEnd.join(",")}`,
    `A ${r} ${r} 0 0 1 ${endLineOuter.join(",")}`,
    `L ${endLineInner.join(",")}`,
    `A ${r} ${r} 0 0 1 ${innerEnd.join(",")}`,
    `A ${innerRadius} ${innerRadius} 0 ${innerLargeArc} 0 ${innerStart.join(",")}`,
    `A ${r} ${r} 0 0 1 ${startLineInner.join(",")}`,
    `L ${startLineOuter.join(",")}`,
    `A ${r} ${r} 0 0 1 ${outerStart.join(",")}`,
    "Z"
  ].join(" ");
}

export interface DonutArcLayout<TSegment> {
  segment: TSegment;
  path: string;
  startAngle: number;
  endAngle: number;
}

/**
 * Lays segments' weights (each floored at a thin sliver so a real zero still
 * reads as a hairline, never vanishes) around a full ring, separated by a
 * fixed gap, starting at 12 o'clock. The raw angles ride along on the result
 * (alongside the already-built path) so a caller that needs a per-segment
 * variant of the geometry — a variable outer radius, say — can rebuild the
 * path itself without redoing this layout math.
 */
export function layoutDonutArcs<TSegment>(
  geometry: DonutRingGeometry,
  segments: TSegment[],
  weightOf: (segment: TSegment) => number,
  gapRadians: number
): DonutArcLayout<TSegment>[] {
  const weights = segments.map((segment) => Math.max(weightOf(segment), 0.02));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const availableAngle = Math.PI * 2 - gapRadians * segments.length;

  let cursor = -Math.PI / 2;
  return segments.map((segment, index) => {
    const span = (weights[index] / total) * availableAngle;
    const start = cursor;
    const end = start + span;
    cursor = end + gapRadians;
    return { segment, path: donutSegmentPath(geometry, start, end), startAngle: start, endAngle: end };
  });
}

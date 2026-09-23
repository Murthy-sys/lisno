export interface SpatialPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface SpatialViewport {
  width: number;
  height: number;
  paddingX?: number;
  paddingTop?: number;
  paddingBottom?: number;
}

export interface SpatialCamera {
  yaw?: number;
  pitch?: number;
  depth?: number;
}

export interface ProjectedSpatialPoint {
  x: number;
  y: number;
  depth: number;
}

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * Deterministic cabinet projection used by every dashboard scene.
 * Semantic x/y/z values stay normalized; viewport changes only change framing.
 */
export function projectSpatialPoint(
  point: SpatialPoint3D,
  viewport: SpatialViewport,
  camera: SpatialCamera = {}
): ProjectedSpatialPoint {
  const width = Math.max(1, finite(viewport.width, 1));
  const height = Math.max(1, finite(viewport.height, 1));
  const paddingX = clamp(finite(viewport.paddingX ?? 24), 0, width / 3);
  const paddingTop = clamp(finite(viewport.paddingTop ?? 20), 0, height / 3);
  const paddingBottom = clamp(finite(viewport.paddingBottom ?? 24), 0, height / 3);
  const contentWidth = Math.max(1, width - paddingX * 2);
  const contentHeight = Math.max(1, height - paddingTop - paddingBottom);
  const yaw = clamp(finite(camera.yaw ?? -0.34), -0.6, 0.6);
  const pitch = clamp(finite(camera.pitch ?? 0.22), 0.08, 0.5);
  const depthStrength = clamp(finite(camera.depth ?? 0.28), 0.08, 0.5);
  const x = finite(point.x);
  const y = finite(point.y);
  const z = finite(point.z);

  const screenX = paddingX + contentWidth * (0.5 + x * 0.43 + z * yaw * 0.28);
  const screenY = paddingTop + contentHeight * (0.86 - y * 0.68 + z * pitch * 0.32);
  const projectedDepth = z * depthStrength + x * yaw * 0.08;

  return {
    x: finite(screenX, width / 2),
    y: finite(screenY, height / 2),
    depth: finite(projectedDepth)
  };
}

export interface SpatialDepthItem {
  id: string;
  point: SpatialPoint3D;
}

/** Far objects are painted first. Stable IDs break equal-depth ties. */
export function sortSpatialFarToNear<T extends SpatialDepthItem>(
  items: readonly T[],
  viewport: SpatialViewport,
  camera?: SpatialCamera
): T[] {
  return [...items].sort((left, right) => {
    const depthDelta = projectSpatialPoint(left.point, viewport, camera).depth
      - projectSpatialPoint(right.point, viewport, camera).depth;
    return Math.abs(depthDelta) > 1e-9 ? depthDelta : left.id.localeCompare(right.id);
  });
}

/** Count magnitude is carried by cross-sectional area, never raw diameter. */
export function countOrbRadius(
  value: number,
  domainMaximum: number,
  maximumRadius: number,
  zeroRadius = 5
) {
  const safeMaximum = Math.max(0, finite(domainMaximum));
  const safeValue = clamp(finite(value), 0, safeMaximum || 0);
  const cappedRadius = Math.max(zeroRadius, finite(maximumRadius, zeroRadius));
  if (safeMaximum === 0 || safeValue === 0) return zeroRadius;
  return Math.max(zeroRadius + 1, Math.sqrt(safeValue / safeMaximum) * cappedRadius);
}

export function linearSpatialValue(value: number, domainMaximum: number, span: number) {
  const safeMaximum = Math.max(0, finite(domainMaximum));
  if (safeMaximum === 0) return 0;
  return clamp(finite(value) / safeMaximum, 0, 1) * Math.max(0, finite(span));
}

export interface SignedFlowScale {
  width: number;
  direction: -1 | 0 | 1;
}

/** Financial widths are linear in absolute paise and keep the original sign. */
export function signedFlowScale(
  valuePaise: number,
  maximumAbsolutePaise: number,
  maximumWidth: number,
  zeroWidth = 1
): SignedFlowScale {
  const value = finite(valuePaise);
  const maximum = Math.max(0, Math.abs(finite(maximumAbsolutePaise)));
  if (value === 0) return { width: 0, direction: 0 };
  const width = maximum === 0
    ? 0
    : Math.max(zeroWidth, Math.abs(value) / maximum * Math.max(zeroWidth, finite(maximumWidth, zeroWidth)));
  return { width, direction: value > 0 ? 1 : -1 };
}

export function spatialSemanticId(...parts: Array<string | number>) {
  return parts
    .map((part) => String(part).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("--");
}

export interface RibbonPoint {
  x: number;
  y: number;
}

const cubicPoint = (
  start: RibbonPoint,
  controlA: RibbonPoint,
  controlB: RibbonPoint,
  end: RibbonPoint,
  t: number
): RibbonPoint => {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
  };
};

/** Closed sampled ribbon around a cubic curve, suitable for an ECharts polygon. */
export function createFlowRibbonPolygon(
  start: RibbonPoint,
  end: RibbonPoint,
  width: number,
  direction: -1 | 0 | 1,
  sampleCount = 12
): RibbonPoint[] {
  const safeWidth = Math.max(1, finite(width, 1));
  const samples = Math.max(4, Math.min(32, Math.round(sampleCount)));
  const bend = Math.max(18, Math.abs(end.x - start.x) * 0.34);
  const sign = direction < 0 ? -1 : 1;
  const controlA = { x: start.x + bend, y: start.y - 22 * sign };
  const controlB = { x: end.x - bend, y: end.y + 22 * sign };
  const center = Array.from({ length: samples + 1 }, (_, index) =>
    cubicPoint(start, controlA, controlB, end, index / samples)
  );
  const upper: RibbonPoint[] = [];
  const lower: RibbonPoint[] = [];
  for (let index = 0; index < center.length; index += 1) {
    const previous = center[Math.max(0, index - 1)];
    const next = center[Math.min(center.length - 1, index + 1)];
    const deltaX = next.x - previous.x;
    const deltaY = next.y - previous.y;
    const length = Math.hypot(deltaX, deltaY) || 1;
    const normalX = -deltaY / length * safeWidth / 2;
    const normalY = deltaX / length * safeWidth / 2;
    upper.push({ x: center[index].x + normalX, y: center[index].y + normalY });
    lower.push({ x: center[index].x - normalX, y: center[index].y - normalY });
  }
  return [...upper, ...lower.reverse()];
}

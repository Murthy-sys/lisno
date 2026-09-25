export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface SpatialPoint {
  /** Normalized lateral position, normally -1 through 1. */
  readonly x: number;
  /** Normalized analytical height, normally 0 through 1. */
  readonly y: number;
  /** Normalized depth lane. Larger values sit nearer the viewer. */
  readonly z: number;
}

export interface SpatialViewport {
  readonly width: number;
  readonly height: number;
}

export interface SpatialCamera {
  readonly originX: number;
  readonly originY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly depthX: number;
  readonly depthY: number;
}

export interface ProjectedPoint extends Point {
  readonly depth: number;
}

export interface DepthSortable {
  readonly id: string;
  readonly point: SpatialPoint;
}

export const MOBILE_SPATIAL_CAMERA: SpatialCamera = Object.freeze({
  originX: 0.5,
  originY: 0.78,
  scaleX: 0.39,
  scaleY: 0.56,
  depthX: 0.105,
  depthY: 0.075
});

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
}

/**
 * Projects semantic coordinates with one fixed camera. Data never changes the
 * camera, so perspective cannot reorder magnitudes between updates.
 */
export function projectSpatialPoint(
  point: SpatialPoint,
  viewport: SpatialViewport,
  camera: SpatialCamera = MOBILE_SPATIAL_CAMERA
): ProjectedPoint {
  const width = Math.max(1, finite(viewport.width, 1));
  const height = Math.max(1, finite(viewport.height, 1));
  const x = finite(point.x);
  const y = finite(point.y);
  const z = finite(point.z);
  return {
    x: width * (camera.originX + x * camera.scaleX + z * camera.depthX),
    y: height * (camera.originY - y * camera.scaleY - z * camera.depthY),
    depth: z + y * 0.001
  };
}

/** Far-to-near ordering with a semantic-ID tie break keeps occlusion stable. */
export function sortSpatialFarToNear<T extends DepthSortable>(
  items: readonly T[]
): T[] {
  return [...items].sort((left, right) => {
    const leftDepth = left.point.z + left.point.y * 0.001;
    const rightDepth = right.point.z + right.point.y * 0.001;
    const difference = leftDepth - rightDepth;
    return Math.abs(difference) > 1e-9
      ? difference
      : left.id.localeCompare(right.id);
  });
}

export interface CountRadiusOptions {
  readonly zeroRadius?: number;
  readonly unavailableRadius?: number;
  readonly minimumPositiveRadius?: number;
  readonly maximumRadius?: number;
}

/**
 * Positive count area follows the shared domain through sqrt scaling. A small
 * legibility floor can apply only to tiny positive values; it never changes
 * ordering. Zero and unavailable are distinct non-quantitative anchors.
 */
export function countOrbRadius(
  value: number | null,
  available: boolean,
  domainMaximum: number,
  options: CountRadiusOptions = {}
): number {
  const zeroRadius = options.zeroRadius ?? 5;
  const unavailableRadius = options.unavailableRadius ?? 7;
  const minimumPositiveRadius = Math.max(
    zeroRadius,
    options.minimumPositiveRadius ?? 6
  );
  const maximumRadius = options.maximumRadius ?? 24;
  if (!available || value === null || !Number.isFinite(value)) {
    return unavailableRadius;
  }
  if (value <= 0) return zeroRadius;
  const safeDomain = Math.max(value, finite(domainMaximum, value), 1);
  return clamp(
    Math.sqrt(value / safeDomain) * maximumRadius,
    minimumPositiveRadius,
    maximumRadius
  );
}

/** Linear analytical height. A verified zero always reaches the zero plane. */
export function temporalHeight(
  value: number | null,
  domainMaximum: number,
  maximumHeight = 1
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const safeDomain = Math.max(1, finite(domainMaximum, 1));
  return clamp(value / safeDomain, 0, 1) * Math.max(0, finite(maximumHeight, 1));
}

export interface FlowWidth {
  readonly width: number;
  readonly direction: -1 | 0 | 1;
}

/** Width is linear in absolute paise. Direction preserves signed outcomes. */
export function capitalFlowWidth(
  valuePaise: number,
  domainMaximumPaise: number,
  maximumWidth: number,
  minimumVisibleWidth = 1.5
): FlowWidth {
  const value = finite(valuePaise);
  const direction: -1 | 0 | 1 = value < 0 ? -1 : value > 0 ? 1 : 0;
  if (direction === 0) return { width: 0, direction };
  const domain = Math.max(Math.abs(value), Math.abs(finite(domainMaximumPaise)), 1);
  return {
    width: clamp(
      (Math.abs(value) / domain) * Math.max(0, finite(maximumWidth)),
      minimumVisibleWidth,
      Math.max(minimumVisibleWidth, finite(maximumWidth))
    ),
    direction
  };
}

function cleanIdPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-");
}

export function spatialId(
  scene: string,
  metricKey: string,
  lane: string,
  item: string,
  primitive: string
): string {
  return [scene, metricKey, lane, item, primitive].map(cleanIdPart).join(":");
}

export function allFinitePoints(points: readonly Point[]): boolean {
  return points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

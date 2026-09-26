import type { AnnotationPoint, AnnotationRect, ViewTransform } from "./coordinates";

export const MIN_ANNOTATION_ZOOM = 1;
export const MAX_ANNOTATION_ZOOM = 5;
export const IDENTITY_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 };

const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/** Pan is stored in normalized image coordinates, independent of device pixels. */
export function clampViewTransform(transform: ViewTransform): ViewTransform {
  if (!Number.isFinite(transform.zoom) || !Number.isFinite(transform.panX) || !Number.isFinite(transform.panY)) {
    throw new Error("The annotation view transform is invalid.");
  }
  const zoom = Math.max(MIN_ANNOTATION_ZOOM, Math.min(MAX_ANNOTATION_ZOOM, transform.zoom));
  const extent = (1 - 1 / zoom) / 2;
  return {
    zoom: round(zoom),
    panX: round(Math.max(-extent, Math.min(extent, transform.panX))),
    panY: round(Math.max(-extent, Math.min(extent, transform.panY)))
  };
}

/** Keeps the source point under the gesture focus fixed while zooming. */
export function zoomAtViewportPoint(
  transform: ViewTransform, nextZoom: number, focus: AnnotationPoint, imageRect: AnnotationRect
): ViewTransform {
  if (imageRect.width <= 0 || imageRect.height <= 0) return transform;
  const zoom = Math.max(MIN_ANNOTATION_ZOOM, Math.min(MAX_ANNOTATION_ZOOM, nextZoom));
  const sx = (focus.x - imageRect.x) / imageRect.width;
  const sy = (focus.y - imageRect.y) / imageRect.height;
  return clampViewTransform({
    zoom,
    panX: transform.panX + (sx - 0.5) * (1 / zoom - 1 / transform.zoom),
    panY: transform.panY + (sy - 0.5) * (1 / zoom - 1 / transform.zoom)
  });
}

export function panByViewportDelta(
  transform: ViewTransform, delta: AnnotationPoint, imageRect: AnnotationRect
): ViewTransform {
  if (imageRect.width <= 0 || imageRect.height <= 0) return transform;
  return clampViewTransform({
    ...transform,
    panX: transform.panX + delta.x / (imageRect.width * transform.zoom),
    panY: transform.panY + delta.y / (imageRect.height * transform.zoom)
  });
}

export function touchMidpoint(first: AnnotationPoint, second: AnnotationPoint): AnnotationPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

export function touchSpan(first: AnnotationPoint, second: AnnotationPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/** Re-derives a two-finger pan/zoom from its initial sample, avoiding cumulative drift. */
export function pinchViewTransform(
  start: ViewTransform,
  initial: readonly [AnnotationPoint, AnnotationPoint],
  current: readonly [AnnotationPoint, AnnotationPoint],
  imageRect: AnnotationRect
): ViewTransform {
  const initialSpan = touchSpan(...initial);
  if (initialSpan < 2) return start;
  const firstMidpoint = touchMidpoint(...initial);
  const nextMidpoint = touchMidpoint(...current);
  const zoomed = zoomAtViewportPoint(start, start.zoom * touchSpan(...current) / initialSpan, firstMidpoint, imageRect);
  return panByViewportDelta(zoomed, {
    x: nextMidpoint.x - firstMidpoint.x,
    y: nextMidpoint.y - firstMidpoint.y
  }, imageRect);
}

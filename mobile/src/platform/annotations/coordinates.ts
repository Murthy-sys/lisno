export interface AnnotationPoint {
  readonly x: number;
  readonly y: number;
}

export interface AnnotationSize {
  readonly width: number;
  readonly height: number;
}

export interface AnnotationRect extends AnnotationPoint, AnnotationSize {}

export interface ViewTransform {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

const DEFAULT_TRANSFORM: ViewTransform = { zoom: 1, panX: 0, panY: 0 };

function assertPositiveSize(size: AnnotationSize, label: string): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error(`${label} dimensions must be finite positive values.`);
  }
}

function assertFinitePoint(point: AnnotationPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Annotation coordinates must be finite values.");
  }
}

function round(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

export function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Annotation coordinates must be finite values.");
  return round(Math.max(0, Math.min(1, value)));
}

export function containedImageRect(
  source: AnnotationSize,
  viewport: AnnotationRect
): AnnotationRect {
  assertPositiveSize(source, "Source image");
  assertPositiveSize(viewport, "Viewport");
  const scale = Math.min(viewport.width / source.width, viewport.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return Object.freeze({
    x: round(viewport.x + (viewport.width - width) / 2),
    y: round(viewport.y + (viewport.height - height) / 2),
    width: round(width),
    height: round(height)
  });
}

function assertTransform(transform: ViewTransform): void {
  if (
    !Number.isFinite(transform.zoom) ||
    transform.zoom <= 0 ||
    !Number.isFinite(transform.panX) ||
    !Number.isFinite(transform.panY)
  ) {
    throw new Error("The annotation view transform is invalid.");
  }
}

export function viewportPointToNormalized(
  point: AnnotationPoint,
  imageRect: AnnotationRect,
  transform: ViewTransform = DEFAULT_TRANSFORM,
  clamp = true
): AnnotationPoint | null {
  assertFinitePoint(point);
  assertPositiveSize(imageRect, "Rendered image");
  assertTransform(transform);
  const screenX = (point.x - imageRect.x) / imageRect.width;
  const screenY = (point.y - imageRect.y) / imageRect.height;
  const x = (screenX - 0.5) / transform.zoom + 0.5 - transform.panX;
  const y = (screenY - 0.5) / transform.zoom + 0.5 - transform.panY;
  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
  return Object.freeze({ x: clampNormalized(x), y: clampNormalized(y) });
}

export function normalizedPointToViewport(
  point: AnnotationPoint,
  imageRect: AnnotationRect,
  transform: ViewTransform = DEFAULT_TRANSFORM
): AnnotationPoint {
  assertFinitePoint(point);
  assertPositiveSize(imageRect, "Rendered image");
  assertTransform(transform);
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new Error("Normalized annotation coordinates must remain from 0 to 1.");
  }
  return Object.freeze({
    x: round(
      imageRect.x +
        ((point.x + transform.panX - 0.5) * transform.zoom + 0.5) *
          imageRect.width
    ),
    y: round(
      imageRect.y +
        ((point.y + transform.panY - 0.5) * transform.zoom + 0.5) *
          imageRect.height
    )
  });
}

export function normalizedPointToSourcePixels(
  point: AnnotationPoint,
  source: AnnotationSize
): AnnotationPoint {
  assertPositiveSize(source, "Source image");
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new Error("Normalized annotation coordinates must remain from 0 to 1.");
  }
  return Object.freeze({
    x: round(point.x * source.width),
    y: round(point.y * source.height)
  });
}

export function sourcePixelPointToNormalized(
  point: AnnotationPoint,
  source: AnnotationSize
): AnnotationPoint {
  assertFinitePoint(point);
  assertPositiveSize(source, "Source image");
  if (point.x < 0 || point.x > source.width || point.y < 0 || point.y > source.height) {
    throw new Error("Source annotation coordinates must remain within the image.");
  }
  return Object.freeze({
    x: round(point.x / source.width),
    y: round(point.y / source.height)
  });
}

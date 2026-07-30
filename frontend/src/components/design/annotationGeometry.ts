import type {
  AnnotationDocumentV1,
  AnnotationElement,
  AnnotationPoint
} from "../../api/types";

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export type ResizeHandle =
  | "north-west"
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west";

type ShapeElement = Extract<AnnotationElement, { type: "rectangle" | "ellipse" }>;
type ElementBase = Pick<AnnotationElement, "id" | "color" | "strokeWidth">;

const DEFAULT_TRANSFORM: ViewTransform = { zoom: 1, panX: 0, panY: 0 };
const MIN_SHAPE_SIZE = 0.001;

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function clampNormalized(value: number) {
  return round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)));
}

export function viewportToNormalized(
  point: AnnotationPoint,
  viewport: ViewportRect,
  transform: ViewTransform = DEFAULT_TRANSFORM
): AnnotationPoint {
  const zoom = transform.zoom > 0 ? transform.zoom : 1;
  const screenX = viewport.width > 0 ? (point.x - viewport.left) / viewport.width : 0;
  const screenY = viewport.height > 0 ? (point.y - viewport.top) / viewport.height : 0;
  return {
    x: clampNormalized((screenX - 0.5) / zoom + 0.5 - transform.panX),
    y: clampNormalized((screenY - 0.5) / zoom + 0.5 - transform.panY)
  };
}

export function normalizedToViewport(
  point: AnnotationPoint,
  viewport: ViewportRect,
  transform: ViewTransform = DEFAULT_TRANSFORM
): AnnotationPoint {
  return {
    x: round(
      viewport.left +
        ((point.x + transform.panX - 0.5) * transform.zoom + 0.5) * viewport.width
    ),
    y: round(
      viewport.top +
        ((point.y + transform.panY - 0.5) * transform.zoom + 0.5) * viewport.height
    )
  };
}

export function makeBoundedShape(
  type: "rectangle" | "ellipse",
  start: AnnotationPoint,
  end: AnnotationPoint,
  base: ElementBase
): ShapeElement {
  const first = { x: clampNormalized(start.x), y: clampNormalized(start.y) };
  const second = { x: clampNormalized(end.x), y: clampNormalized(end.y) };
  const width = round(Math.max(MIN_SHAPE_SIZE, Math.abs(second.x - first.x)));
  const height = round(Math.max(MIN_SHAPE_SIZE, Math.abs(second.y - first.y)));
  return {
    ...base,
    type,
    x: round(Math.min(first.x, second.x, 1 - width)),
    y: round(Math.min(first.y, second.y, 1 - height)),
    width,
    height
  };
}

export function makeArrow(
  start: AnnotationPoint,
  end: AnnotationPoint,
  base: ElementBase
): Extract<AnnotationElement, { type: "arrow" }> {
  return {
    ...base,
    type: "arrow",
    x1: clampNormalized(start.x),
    y1: clampNormalized(start.y),
    x2: clampNormalized(end.x),
    y2: clampNormalized(end.y)
  };
}

export function simplifyFreehand(
  points: readonly AnnotationPoint[],
  minimumDistance = 0.004,
  maximumPoints = 5_000
): AnnotationPoint[] {
  if (points.length === 0 || maximumPoints <= 0) return [];
  const bounded = points.map((point) => ({
    x: clampNormalized(point.x),
    y: clampNormalized(point.y)
  }));
  const result = [bounded[0]!];
  for (let index = 1; index < bounded.length - 1 && result.length < maximumPoints - 1; index += 1) {
    const point = bounded[index]!;
    const previous = result[result.length - 1]!;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= minimumDistance) {
      result.push(point);
    }
  }
  const last = bounded[bounded.length - 1]!;
  if (result.length < maximumPoints) {
    result.push(last);
  } else {
    result[result.length - 1] = last;
  }
  if (result.length === 1 && bounded.length > 1) result.push(last);
  return result;
}

function clampDelta(delta: number, minimum: number, maximum: number) {
  return round(Math.max(minimum, Math.min(maximum, delta)));
}

export function moveElement(
  element: AnnotationElement,
  delta: AnnotationPoint
): AnnotationElement {
  if (element.type === "rectangle" || element.type === "ellipse") {
    return {
      ...element,
      x: round(element.x + clampDelta(delta.x, -element.x, 1 - element.x - element.width)),
      y: round(element.y + clampDelta(delta.y, -element.y, 1 - element.y - element.height))
    };
  }
  if (element.type === "arrow") {
    const dx = clampDelta(
      delta.x,
      -Math.min(element.x1, element.x2),
      1 - Math.max(element.x1, element.x2)
    );
    const dy = clampDelta(
      delta.y,
      -Math.min(element.y1, element.y2),
      1 - Math.max(element.y1, element.y2)
    );
    return {
      ...element,
      x1: round(element.x1 + dx),
      y1: round(element.y1 + dy),
      x2: round(element.x2 + dx),
      y2: round(element.y2 + dy)
    };
  }
  if (element.type === "freehand") {
    const minimumX = Math.min(...element.points.map((point) => point.x));
    const maximumX = Math.max(...element.points.map((point) => point.x));
    const minimumY = Math.min(...element.points.map((point) => point.y));
    const maximumY = Math.max(...element.points.map((point) => point.y));
    const dx = clampDelta(delta.x, -minimumX, 1 - maximumX);
    const dy = clampDelta(delta.y, -minimumY, 1 - maximumY);
    return {
      ...element,
      points: element.points.map((point) => ({
        x: round(point.x + dx),
        y: round(point.y + dy)
      }))
    };
  }
  return {
    ...element,
    x: clampNormalized(element.x + delta.x),
    y: clampNormalized(element.y + delta.y)
  };
}

export function resizeShape(
  element: ShapeElement,
  handle: ResizeHandle,
  point: AnnotationPoint
): ShapeElement {
  const target = { x: clampNormalized(point.x), y: clampNormalized(point.y) };
  const right = round(element.x + element.width);
  const bottom = round(element.y + element.height);
  let left = element.x;
  let top = element.y;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle.includes("west")) left = Math.min(target.x, right - MIN_SHAPE_SIZE);
  if (handle.includes("east")) nextRight = Math.max(target.x, element.x + MIN_SHAPE_SIZE);
  if (handle.includes("north")) top = Math.min(target.y, bottom - MIN_SHAPE_SIZE);
  if (handle.includes("south")) nextBottom = Math.max(target.y, element.y + MIN_SHAPE_SIZE);

  return {
    ...element,
    x: clampNormalized(left),
    y: clampNormalized(top),
    width: round(nextRight - left),
    height: round(nextBottom - top)
  };
}

function distanceToSegment(point: AnnotationPoint, start: AnnotationPoint, end: AnnotationPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy))
  );
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function hitsElement(element: AnnotationElement, point: AnnotationPoint, tolerance: number) {
  if (element.type === "rectangle") {
    return (
      point.x >= element.x - tolerance &&
      point.x <= element.x + element.width + tolerance &&
      point.y >= element.y - tolerance &&
      point.y <= element.y + element.height + tolerance
    );
  }
  if (element.type === "ellipse") {
    const radiusX = element.width / 2 + tolerance;
    const radiusY = element.height / 2 + tolerance;
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    return ((point.x - centerX) / radiusX) ** 2 + ((point.y - centerY) / radiusY) ** 2 <= 1;
  }
  if (element.type === "arrow") {
    return distanceToSegment(
      point,
      { x: element.x1, y: element.y1 },
      { x: element.x2, y: element.y2 }
    ) <= tolerance;
  }
  if (element.type === "freehand") {
    return element.points.slice(1).some((end, index) =>
      distanceToSegment(point, element.points[index]!, end) <= tolerance
    );
  }
  return Math.hypot(point.x - element.x, point.y - element.y) <= Math.max(tolerance, 0.025);
}

export function hitTestElements(
  elements: readonly AnnotationElement[],
  point: AnnotationPoint,
  tolerance = 0.015
) {
  return elements.slice().reverse().find((element) => hitsElement(element, point, tolerance));
}

export function addElement(document: AnnotationDocumentV1, element: AnnotationElement) {
  return { ...document, elements: [...document.elements, element] };
}

export function updateElement(document: AnnotationDocumentV1, element: AnnotationElement) {
  return {
    ...document,
    elements: document.elements.map((current) => current.id === element.id ? element : current)
  };
}

export function removeElement(document: AnnotationDocumentV1, elementId: string) {
  return {
    ...document,
    elements: document.elements.filter((element) => element.id !== elementId)
  };
}

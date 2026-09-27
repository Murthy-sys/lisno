import { clampNormalized, type AnnotationPoint } from "./coordinates";
import type { AnnotationDocumentV1, AnnotationElementV1 } from "./document";

type Base = Pick<AnnotationElementV1, "id" | "color" | "strokeWidth">;
type Shape = Extract<AnnotationElementV1, { type: "rectangle" | "ellipse" }>;

export type ResizeHandle = "north-west" | "north" | "north-east" | "east" |
  "south-east" | "south" | "south-west" | "west";

const MIN_SHAPE_SIZE = 0.001;
const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const deltaWithin = (value: number, lower: number, upper: number) => round(Math.max(lower, Math.min(upper, value)));

export function makeBoundedShape(
  type: "rectangle" | "ellipse", start: AnnotationPoint, end: AnnotationPoint, base: Base
): Shape {
  const x1 = clampNormalized(start.x);
  const y1 = clampNormalized(start.y);
  const x2 = clampNormalized(end.x);
  const y2 = clampNormalized(end.y);
  const width = round(Math.max(MIN_SHAPE_SIZE, Math.abs(x2 - x1)));
  const height = round(Math.max(MIN_SHAPE_SIZE, Math.abs(y2 - y1)));
  return {
    ...base, type,
    x: round(Math.min(x1, x2, 1 - width)),
    y: round(Math.min(y1, y2, 1 - height)),
    width, height
  };
}

export function makeArrow(start: AnnotationPoint, end: AnnotationPoint, base: Base): Extract<AnnotationElementV1, { type: "arrow" }> {
  return {
    ...base, type: "arrow",
    x1: clampNormalized(start.x), y1: clampNormalized(start.y),
    x2: clampNormalized(end.x), y2: clampNormalized(end.y)
  };
}

/** Drops closely spaced samples but preserves both endpoints. */
export function simplifyFreehand(
  points: readonly AnnotationPoint[], minimumDistance = 0.004, maximumPoints = 5_000
): AnnotationPoint[] {
  if (points.length === 0 || maximumPoints < 2) return [];
  const bounded = points.map((point) => ({ x: clampNormalized(point.x), y: clampNormalized(point.y) }));
  const result = [bounded[0]!];
  for (let index = 1; index < bounded.length - 1 && result.length < maximumPoints - 1; index += 1) {
    const point = bounded[index]!;
    const last = result[result.length - 1]!;
    if (Math.hypot(point.x - last.x, point.y - last.y) >= minimumDistance) result.push(point);
  }
  result.push(bounded[bounded.length - 1]!);
  return result;
}

export function moveElement(element: AnnotationElementV1, delta: AnnotationPoint): AnnotationElementV1 {
  if (element.type === "rectangle" || element.type === "ellipse") {
    return {
      ...element,
      x: round(element.x + deltaWithin(delta.x, -element.x, 1 - element.x - element.width)),
      y: round(element.y + deltaWithin(delta.y, -element.y, 1 - element.y - element.height))
    };
  }
  if (element.type === "arrow") {
    const dx = deltaWithin(delta.x, -Math.min(element.x1, element.x2), 1 - Math.max(element.x1, element.x2));
    const dy = deltaWithin(delta.y, -Math.min(element.y1, element.y2), 1 - Math.max(element.y1, element.y2));
    return { ...element, x1: round(element.x1 + dx), y1: round(element.y1 + dy), x2: round(element.x2 + dx), y2: round(element.y2 + dy) };
  }
  if (element.type === "freehand") {
    const minX = Math.min(...element.points.map((point) => point.x));
    const maxX = Math.max(...element.points.map((point) => point.x));
    const minY = Math.min(...element.points.map((point) => point.y));
    const maxY = Math.max(...element.points.map((point) => point.y));
    const dx = deltaWithin(delta.x, -minX, 1 - maxX);
    const dy = deltaWithin(delta.y, -minY, 1 - maxY);
    return { ...element, points: element.points.map((point) => ({ x: round(point.x + dx), y: round(point.y + dy) })) };
  }
  return { ...element, x: clampNormalized(element.x + delta.x), y: clampNormalized(element.y + delta.y) };
}

export function resizeShape(element: Shape, handle: ResizeHandle, point: AnnotationPoint): Shape {
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
  return { ...element, x: round(left), y: round(top), width: round(nextRight - left), height: round(nextBottom - top) };
}

function distanceToSegment(point: AnnotationPoint, start: AnnotationPoint, end: AnnotationPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - start.x - ratio * dx, point.y - start.y - ratio * dy);
}

export function hitTestElements(
  elements: readonly AnnotationElementV1[], point: AnnotationPoint, tolerance = 0.018
): AnnotationElementV1 | undefined {
  return [...elements].reverse().find((element) => {
    if (element.type === "rectangle") return point.x >= element.x - tolerance &&
      point.x <= element.x + element.width + tolerance && point.y >= element.y - tolerance &&
      point.y <= element.y + element.height + tolerance;
    if (element.type === "ellipse") {
      const rx = element.width / 2 + tolerance;
      const ry = element.height / 2 + tolerance;
      return ((point.x - element.x - element.width / 2) / rx) ** 2 +
        ((point.y - element.y - element.height / 2) / ry) ** 2 <= 1;
    }
    if (element.type === "arrow") return distanceToSegment(point, { x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 }) <= tolerance;
    if (element.type === "freehand") return element.points.slice(1).some((end, index) => distanceToSegment(point, element.points[index]!, end) <= tolerance);
    return Math.hypot(point.x - element.x, point.y - element.y) <= Math.max(tolerance, 0.025);
  });
}

export function addElement(document: AnnotationDocumentV1, element: AnnotationElementV1): AnnotationDocumentV1 {
  return { ...document, elements: [...document.elements, element] };
}

export function updateElement(document: AnnotationDocumentV1, element: AnnotationElementV1): AnnotationDocumentV1 {
  return { ...document, elements: document.elements.map((item) => item.id === element.id ? element : item) };
}

export function removeElement(document: AnnotationDocumentV1, id: string): AnnotationDocumentV1 {
  return { ...document, elements: document.elements.filter((item) => item.id !== id) };
}

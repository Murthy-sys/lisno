import type { AnnotationElement, AnnotationPoint, CropRect } from "../../api/types";

export interface PageGeometry { width: number; height: number }

function round(value: number) {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function assertPoint(point: AnnotationPoint) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new Error("Plan annotation coordinates must be finite values from 0 to 1.");
  }
}

function assertCrop(crop: CropRect, page: PageGeometry) {
  if (page.width <= 0 || page.height <= 0 || crop.x < 0 || crop.y < 0 ||
      crop.width <= 0 || crop.height <= 0 ||
      crop.x + crop.width > page.width || crop.y + crop.height > page.height) {
    throw new Error("Drawing crop geometry must remain within its source page.");
  }
}

export function cropPointToPage(point: AnnotationPoint, crop: CropRect, page: PageGeometry): AnnotationPoint {
  assertPoint(point); assertCrop(crop, page);
  return { x: round((crop.x + point.x * crop.width) / page.width), y: round((crop.y + point.y * crop.height) / page.height) };
}

export function pagePointToCrop(point: AnnotationPoint, crop: CropRect, page: PageGeometry): AnnotationPoint | null {
  assertPoint(point); assertCrop(crop, page);
  const x = point.x * page.width;
  const y = point.y * page.height;
  if (x < crop.x || x > crop.x + crop.width || y < crop.y || y > crop.y + crop.height) return null;
  return { x: round((x - crop.x) / crop.width), y: round((y - crop.y) / crop.height) };
}

function mapElement(element: AnnotationElement, map: (point: AnnotationPoint) => AnnotationPoint | null): AnnotationElement | null {
  if (element.type === "rectangle" || element.type === "ellipse") {
    const start = map({ x: element.x, y: element.y });
    const end = map({ x: element.x + element.width, y: element.y + element.height });
    return start && end ? { ...element, x: start.x, y: start.y, width: round(end.x - start.x), height: round(end.y - start.y) } : null;
  }
  if (element.type === "arrow") {
    const start = map({ x: element.x1, y: element.y1 });
    const end = map({ x: element.x2, y: element.y2 });
    return start && end ? { ...element, x1: start.x, y1: start.y, x2: end.x, y2: end.y } : null;
  }
  if (element.type === "freehand") {
    const points = element.points.map(map);
    return points.every((point): point is AnnotationPoint => point !== null) ? { ...element, points } : null;
  }
  const point = map({ x: element.x, y: element.y });
  return point ? { ...element, x: point.x, y: point.y } : null;
}

export function projectAnnotationToPage(element: AnnotationElement, crop: CropRect, page: PageGeometry): AnnotationElement {
  const projected = mapElement(element, (point) => cropPointToPage(point, crop, page));
  if (!projected) throw new Error("Drawing annotation could not be projected to its source page.");
  return projected;
}

export function projectAnnotationToCrop(element: AnnotationElement, crop: CropRect, page: PageGeometry): AnnotationElement | null {
  return mapElement(element, (point) => pagePointToCrop(point, crop, page));
}

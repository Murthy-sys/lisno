import type { AnnotationDocumentV1 } from "./estimate-design.js";

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface PageGeometry {
  width: number;
  height: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawingCropGeometry {
  drawingId: string;
  crop: CropRect;
}

export interface DrawingTargetMatch {
  drawingId: string;
  reason: "anchor_inside" | "area_overlap";
}

export const planRequestTargetStatuses = [
  "open",
  "replacement_submitted",
  "approved",
  "resolved"
] as const;
export type PlanRequestTargetStatus = typeof planRequestTargetStatuses[number];
export type PlanRequestStatus = "open" | "resolved";

const allowedTargetTransitions: Record<PlanRequestTargetStatus, readonly PlanRequestTargetStatus[]> = {
  open: ["replacement_submitted", "resolved"],
  replacement_submitted: ["open", "approved"],
  approved: [],
  resolved: []
};

export function requirePlanRequestTransition(
  from: PlanRequestTargetStatus,
  to: PlanRequestTargetStatus
) {
  if (!allowedTargetTransitions[from].includes(to)) {
    throw new Error(`Invalid plan request target transition from ${from} to ${to}.`);
  }
}

export function derivePlanRequestStatus(
  targetStatuses: readonly PlanRequestTargetStatus[],
  unassigned: boolean,
  unassignedResolved = false
): PlanRequestStatus {
  if (unassigned) return unassignedResolved ? "resolved" : "open";
  return targetStatuses.length > 0 && targetStatuses.every((status) =>
    status === "approved" || status === "resolved"
  ) ? "resolved" : "open";
}

type AnnotationElementV1 = AnnotationDocumentV1["elements"][number];

const MATERIAL_OVERLAP = 0.15;

function round(value: number) {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function assertNormalizedPoint(point: NormalizedPoint) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new Error("Plan annotation coordinates must be finite values from 0 to 1.");
  }
}

function assertCropWithinPage(crop: CropRect, page: PageGeometry) {
  if (!Number.isFinite(page.width) || !Number.isFinite(page.height) ||
      page.width <= 0 || page.height <= 0 ||
      !Number.isFinite(crop.x) || !Number.isFinite(crop.y) ||
      !Number.isFinite(crop.width) || !Number.isFinite(crop.height) ||
      crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 ||
      crop.x + crop.width > page.width || crop.y + crop.height > page.height) {
    throw new Error("Drawing crop geometry must remain within its source page.");
  }
}

export function cropPointToPage(
  point: NormalizedPoint,
  crop: CropRect,
  page: PageGeometry
): NormalizedPoint {
  assertNormalizedPoint(point);
  assertCropWithinPage(crop, page);
  return {
    x: round((crop.x + point.x * crop.width) / page.width),
    y: round((crop.y + point.y * crop.height) / page.height)
  };
}

export function pagePointToCrop(
  point: NormalizedPoint,
  crop: CropRect,
  page: PageGeometry
): NormalizedPoint | null {
  assertNormalizedPoint(point);
  assertCropWithinPage(crop, page);
  const pixelX = point.x * page.width;
  const pixelY = point.y * page.height;
  if (pixelX < crop.x || pixelX > crop.x + crop.width ||
      pixelY < crop.y || pixelY > crop.y + crop.height) return null;
  return {
    x: round((pixelX - crop.x) / crop.width),
    y: round((pixelY - crop.y) / crop.height)
  };
}

function mapElementPoints(
  element: AnnotationElementV1,
  map: (point: NormalizedPoint) => NormalizedPoint | null
): AnnotationElementV1 | null {
  if (element.type === "rectangle" || element.type === "ellipse") {
    const start = map({ x: element.x, y: element.y });
    const end = map({ x: element.x + element.width, y: element.y + element.height });
    if (!start || !end) return null;
    return { ...element, x: start.x, y: start.y, width: round(end.x - start.x), height: round(end.y - start.y) };
  }
  if (element.type === "arrow") {
    const start = map({ x: element.x1, y: element.y1 });
    const end = map({ x: element.x2, y: element.y2 });
    return start && end ? { ...element, x1: start.x, y1: start.y, x2: end.x, y2: end.y } : null;
  }
  if (element.type === "freehand") {
    const points = element.points.map(map);
    return points.every((point): point is NormalizedPoint => point !== null)
      ? { ...element, points }
      : null;
  }
  const point = map({ x: element.x, y: element.y });
  return point ? { ...element, x: point.x, y: point.y } : null;
}

export function projectAnnotationToPage(
  element: AnnotationElementV1,
  crop: CropRect,
  page: PageGeometry
): AnnotationElementV1 {
  const projected = mapElementPoints(element, (point) => cropPointToPage(point, crop, page));
  if (!projected) throw new Error("Drawing annotation could not be projected to its source page.");
  return projected;
}

export function projectAnnotationToCrop(
  element: AnnotationElementV1,
  crop: CropRect,
  page: PageGeometry
): AnnotationElementV1 | null {
  return mapElementPoints(element, (point) => pagePointToCrop(point, crop, page));
}

function elementBounds(element: AnnotationElementV1) {
  if (element.type === "rectangle" || element.type === "ellipse") {
    return { left: element.x, top: element.y, right: element.x + element.width, bottom: element.y + element.height };
  }
  const points = element.type === "arrow"
    ? [{ x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 }]
    : element.type === "freehand" ? element.points : [{ x: element.x, y: element.y }];
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y))
  };
}

function elementAnchor(element: AnnotationElementV1): NormalizedPoint {
  if (element.type === "rectangle" || element.type === "ellipse") {
    return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
  }
  if (element.type === "arrow") {
    return { x: (element.x1 + element.x2) / 2, y: (element.y1 + element.y2) / 2 };
  }
  if (element.type === "freehand") {
    return {
      x: element.points.reduce((sum, point) => sum + point.x, 0) / element.points.length,
      y: element.points.reduce((sum, point) => sum + point.y, 0) / element.points.length
    };
  }
  return { x: element.x, y: element.y };
}

function cropBounds(crop: CropRect, page: PageGeometry) {
  assertCropWithinPage(crop, page);
  return {
    left: crop.x / page.width,
    top: crop.y / page.height,
    right: (crop.x + crop.width) / page.width,
    bottom: (crop.y + crop.height) / page.height
  };
}

function strictlyContains(bounds: ReturnType<typeof cropBounds>, point: NormalizedPoint) {
  return point.x > bounds.left && point.x < bounds.right &&
    point.y > bounds.top && point.y < bounds.bottom;
}

function overlapRatio(annotation: ReturnType<typeof elementBounds>, crop: ReturnType<typeof cropBounds>) {
  const width = Math.max(0, Math.min(annotation.right, crop.right) - Math.max(annotation.left, crop.left));
  const height = Math.max(0, Math.min(annotation.bottom, crop.bottom) - Math.max(annotation.top, crop.top));
  const area = (annotation.right - annotation.left) * (annotation.bottom - annotation.top);
  return area > 0 ? width * height / area : 0;
}

export function detectAnnotationTargets(
  elements: readonly AnnotationElementV1[],
  drawings: readonly DrawingCropGeometry[],
  page: PageGeometry
): DrawingTargetMatch[] {
  const matches = new Map<string, DrawingTargetMatch>();
  for (const drawing of drawings) {
    const bounds = cropBounds(drawing.crop, page);
    for (const element of elements) {
      const reason = strictlyContains(bounds, elementAnchor(element))
        ? "anchor_inside" as const
        : overlapRatio(elementBounds(element), bounds) >= MATERIAL_OVERLAP
          ? "area_overlap" as const
          : null;
      if (reason) {
        const current = matches.get(drawing.drawingId);
        if (!current || reason === "anchor_inside") matches.set(drawing.drawingId, { drawingId: drawing.drawingId, reason });
      }
    }
  }
  const cropArea = new Map(drawings.map((drawing) => [drawing.drawingId, drawing.crop.width * drawing.crop.height]));
  return [...matches.values()].sort((left, right) =>
    (cropArea.get(right.drawingId) ?? 0) - (cropArea.get(left.drawingId) ?? 0) ||
    left.drawingId.localeCompare(right.drawingId)
  );
}

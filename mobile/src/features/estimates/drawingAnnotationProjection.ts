import type { AnnotationDocumentV1, AnnotationElementV1, AnnotationPointV1 } from "../../platform/annotations/document";
import type {
  ClientDrawingRevision,
  ClientDrawingWorkspace,
  ClientPlanPage,
  ClientPlanRequest,
  ClientPlanWorkspace
} from "./clientReviewModel";

type Crop = ClientDrawingRevision["crop"];
type PageSize = Pick<ClientPlanPage, "width" | "height">;

export interface SharedDrawingComment {
  readonly id: string;
  readonly summary: string;
  readonly status: string;
  readonly source: "plan" | "drawing";
}

const round = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000;

function assertPoint(point: AnnotationPointV1): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
    point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new Error("Annotation coordinates must be within the image.");
  }
}

function assertCrop(crop: Crop, page: PageSize): void {
  if (page.width <= 0 || page.height <= 0 || crop.x < 0 || crop.y < 0 ||
    crop.width <= 0 || crop.height <= 0 ||
    crop.x + crop.width > page.width || crop.y + crop.height > page.height) {
    throw new Error("Drawing crop is outside its source page.");
  }
}

export function cropPointToPage(point: AnnotationPointV1, crop: Crop, page: PageSize): AnnotationPointV1 {
  assertPoint(point);
  assertCrop(crop, page);
  return {
    x: round((crop.x + point.x * crop.width) / page.width),
    y: round((crop.y + point.y * crop.height) / page.height)
  };
}

export function pagePointToCrop(point: AnnotationPointV1, crop: Crop, page: PageSize): AnnotationPointV1 | null {
  assertPoint(point);
  assertCrop(crop, page);
  const x = point.x * page.width;
  const y = point.y * page.height;
  if (x < crop.x || x > crop.x + crop.width || y < crop.y || y > crop.y + crop.height) return null;
  return { x: round((x - crop.x) / crop.width), y: round((y - crop.y) / crop.height) };
}

function mapElement(
  element: AnnotationElementV1,
  map: (point: AnnotationPointV1) => AnnotationPointV1 | null
): AnnotationElementV1 | null {
  if (element.type === "rectangle" || element.type === "ellipse") {
    const start = map({ x: element.x, y: element.y });
    const end = map({ x: element.x + element.width, y: element.y + element.height });
    return start && end ? {
      ...element, x: start.x, y: start.y,
      width: round(end.x - start.x), height: round(end.y - start.y)
    } : null;
  }
  if (element.type === "arrow") {
    const start = map({ x: element.x1, y: element.y1 });
    const end = map({ x: element.x2, y: element.y2 });
    return start && end ? { ...element, x1: start.x, y1: start.y, x2: end.x, y2: end.y } : null;
  }
  if (element.type === "freehand") {
    const points = element.points.map(map);
    return points.every((point): point is AnnotationPointV1 => point !== null) ? { ...element, points } : null;
  }
  const point = map({ x: element.x, y: element.y });
  return point ? { ...element, x: point.x, y: point.y } : null;
}

export function projectAnnotationToPage(element: AnnotationElementV1, crop: Crop, page: PageSize): AnnotationElementV1 {
  const projected = mapElement(element, (point) => cropPointToPage(point, crop, page));
  if (!projected) throw new Error("Drawing annotation could not be projected to its source page.");
  return projected;
}

export function projectAnnotationToCrop(element: AnnotationElementV1, crop: Crop, page: PageSize): AnnotationElementV1 | null {
  return mapElement(element, (point) => pagePointToCrop(point, crop, page));
}

export function projectDrawingDocumentToPage(
  document: AnnotationDocumentV1, crop: Crop, page: ClientPlanPage
): AnnotationDocumentV1 {
  return {
    schemaVersion: 1,
    imageWidth: page.width,
    imageHeight: page.height,
    elements: document.elements.map((element) => projectAnnotationToPage(element, crop, page))
  };
}

export function latestClientDrawingRevisions(workspace: ClientDrawingWorkspace): Map<string, ClientDrawingRevision> {
  const latest = new Map<string, ClientDrawingRevision>();
  for (const revision of workspace.revisions) {
    if (revision.reviewStatus === "draft") continue;
    const current = latest.get(revision.drawingId);
    if (!current || current.revisionNumber < revision.revisionNumber) latest.set(revision.drawingId, revision);
  }
  return latest;
}

export function canonicalDrawingPlacement(
  revision: ClientDrawingRevision,
  workspace: ClientDrawingWorkspace,
  planWorkspace?: ClientPlanWorkspace
): { readonly page: ClientPlanPage; readonly crop: Crop } | undefined {
  let current: ClientDrawingRevision | undefined = revision;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const page = planWorkspace?.pages.find((item) => item.id === current!.sourcePageId);
    if (page) return { page, crop: current.crop };
    const previousId: unknown = current.replacesRevisionId;
    current = typeof previousId === "string"
      ? workspace.revisions.find((item) => item.id === previousId)
      : undefined;
  }
  return undefined;
}

export function selectEditablePlanRequestForDrawing(
  drawingId: string,
  planWorkspace?: ClientPlanWorkspace
): ClientPlanRequest | undefined {
  return planWorkspace?.openRequests.filter((request) =>
    request.targets.some((target) => target.drawingId === drawingId)
  ).at(-1);
}

export function projectDrawingAnnotationsToPage(
  page: ClientPlanPage,
  drawingWorkspace: ClientDrawingWorkspace,
  planWorkspace: ClientPlanWorkspace,
  excludedRequestId?: string
): AnnotationElementV1[] {
  const projected: AnnotationElementV1[] = [];
  const requestedRevisionIds = new Set<string>();
  for (const request of planWorkspace.openRequests.filter((item) => item.sourcePageId === page.id)) {
    for (const target of request.targets) requestedRevisionIds.add(target.requestedRevisionId);
    if (request.id === excludedRequestId) continue;
    for (const element of request.annotations.elements) {
      projected.push({ ...element, id: `request:${request.id}:${element.id}` });
    }
  }
  const latest = latestClientDrawingRevisions(drawingWorkspace);
  for (const drawing of drawingWorkspace.drawings) {
    if (!drawing.active) continue;
    const revision = latest.get(drawing.id);
    if (!revision || requestedRevisionIds.has(revision.id)) continue;
    const placement = canonicalDrawingPlacement(revision, drawingWorkspace, planWorkspace);
    if (!placement || placement.page.id !== page.id) continue;
    const annotations = revision.annotationDraft?.annotations ?? revision.annotations;
    if (!annotations) continue;
    for (const element of annotations.elements) {
      projected.push({ ...projectAnnotationToPage(element, placement.crop, page), id: `drawing:${revision.id}:${element.id}` });
    }
  }
  return projected;
}

export function projectDrawingCommentsToPage(
  page: ClientPlanPage,
  drawingWorkspace: ClientDrawingWorkspace,
  planWorkspace: ClientPlanWorkspace
): SharedDrawingComment[] {
  const comments = new Map<string, SharedDrawingComment>();
  const requestedRevisionIds = new Set<string>();
  for (const request of planWorkspace.openRequests.filter((item) => item.sourcePageId === page.id)) {
    for (const target of request.targets) requestedRevisionIds.add(target.requestedRevisionId);
    const summary = request.summary.trim();
    if (summary) comments.set(request.id, { id: request.id, summary, status: request.status, source: "plan" });
  }
  const latest = latestClientDrawingRevisions(drawingWorkspace);
  for (const drawing of drawingWorkspace.drawings) {
    if (!drawing.active) continue;
    const revision = latest.get(drawing.id);
    if (!revision || requestedRevisionIds.has(revision.id)) continue;
    const placement = canonicalDrawingPlacement(revision, drawingWorkspace, planWorkspace);
    const summary = revision.changeSummary?.trim();
    if (!placement || placement.page.id !== page.id || !summary) continue;
    const id = `drawing:${revision.id}`;
    comments.set(id, { id, summary, status: revision.reviewStatus, source: "drawing" });
  }
  return [...comments.values()];
}

export function sharedPlanAnnotationsForDrawing(
  drawingId: string,
  currentRevision: ClientDrawingRevision,
  drawingWorkspace: ClientDrawingWorkspace,
  planWorkspace?: ClientPlanWorkspace,
  excludedRequestId?: string
): AnnotationElementV1[] {
  if (!planWorkspace) return [];
  const projected: AnnotationElementV1[] = [];
  for (const request of planWorkspace.openRequests) {
    if (request.id === excludedRequestId) continue;
    const target = request.targets.find((item) => item.drawingId === drawingId);
    if (!target) continue;
    const sourceRevision = drawingWorkspace.revisions.find((item) => item.id === target.requestedRevisionId) ?? currentRevision;
    const page = planWorkspace.pages.find((item) => item.id === request.sourcePageId);
    if (!page) continue;
    for (const element of request.annotations.elements) {
      const result = projectAnnotationToCrop(element, sourceRevision.crop, page);
      if (result) projected.push({ ...result, id: `${request.id}:${result.id}` });
    }
  }
  return projected;
}

export function projectPlanCommentsToDrawing(drawingId: string, planWorkspace?: ClientPlanWorkspace): SharedDrawingComment[] {
  if (!planWorkspace) return [];
  return planWorkspace.openRequests.flatMap((request) => {
    if (!request.targets.some((target) => target.drawingId === drawingId)) return [];
    const summary = request.summary.trim();
    return summary ? [{ id: request.id, summary, status: request.status, source: "plan" as const }] : [];
  });
}

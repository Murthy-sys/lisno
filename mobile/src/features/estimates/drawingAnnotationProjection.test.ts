import { annotationDocumentSchema, type AnnotationElementV1 } from "../../platform/annotations/document";
import type { ClientDrawingWorkspace, ClientPlanWorkspace } from "./clientReviewModel";
import {
  canonicalDrawingPlacement, cropPointToPage, latestClientDrawingRevisions,
  pagePointToCrop, projectAnnotationToCrop, projectAnnotationToPage,
  projectDrawingAnnotationsToPage, projectDrawingCommentsToPage
} from "./drawingAnnotationProjection";

const rectangle: AnnotationElementV1 = {
  id: "mark-a", type: "rectangle", x: 0.2, y: 0.2, width: 0.4, height: 0.4,
  color: "#B42318", strokeWidth: 4
};
const document = annotationDocumentSchema.parse({ schemaVersion: 1, imageWidth: 200, imageHeight: 100, elements: [rectangle] });
const crop = { x: 400, y: 100, width: 200, height: 100 };
const page = {
  id: "page-a", uploadId: "upload-a", pageNumber: 1, width: 1000, height: 500,
  currentRevisionId: "page-revision-a", status: "awaiting_review", annotationDraft: null
} as const;

function workspaces() {
  const drawings: ClientDrawingWorkspace = {
    uploads: [{ id: "upload-a", originalFilename: "Floor plan.pdf", mimeType: "application/pdf" }],
    pages: [{ id: "page-a", uploadId: "upload-a", pageNumber: 1, width: 1000, height: 500 }],
    drawings: [{ id: "drawing-a", sourcePageId: "page-a", displayTitle: "Living room", active: true }],
    revisions: [{
      id: "revision-a", drawingId: "drawing-a", revisionNumber: 1, sourcePageId: "page-a",
      crop, reviewStatus: "submitted", changeSummary: "Move this wall",
      annotations: document, annotationDraft: null
    }],
    readiness: { ready: false, total: 1, approved: 0, awaitingReview: 1, changesRequested: 0 }
  };
  const plans: ClientPlanWorkspace = {
    uploads: [{ id: "upload-a", originalFilename: "Floor plan.pdf", mimeType: "application/pdf", pageCount: 1, pages: [page] }],
    pages: [page], openRequests: []
  };
  return { drawings, plans };
}

describe("drawing annotation projection", () => {
  it("maps normalized marks between unequal crop and page dimensions without swapping axes", () => {
    expect(cropPointToPage({ x: 0.2, y: 0.2 }, crop, page)).toEqual({ x: 0.44, y: 0.24 });
    expect(pagePointToCrop({ x: 0.52, y: 0.32 }, crop, page)).toEqual({ x: 0.6, y: 0.6 });
    expect(projectAnnotationToPage(rectangle, crop, page)).toEqual({
      ...rectangle, x: 0.44, y: 0.24, width: 0.08, height: 0.08
    });
    expect(projectAnnotationToCrop(projectAnnotationToPage(rectangle, crop, page), crop, page)).toEqual(rectangle);
    expect(pagePointToCrop({ x: 0.1, y: 0.1 }, crop, page)).toBeNull();
  });

  it("projects freehand points and excludes marks that cross outside the crop", () => {
    const freehand: AnnotationElementV1 = {
      id: "mark-freehand", type: "freehand", color: "#315AB8", strokeWidth: 2,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    };
    expect(projectAnnotationToPage(freehand, crop, page)).toEqual({
      ...freehand, points: [{ x: 0.4, y: 0.2 }, { x: 0.6, y: 0.4 }]
    });
    expect(projectAnnotationToCrop({ ...freehand, points: [{ x: 0.4, y: 0.2 }, { x: 0.7, y: 0.4 }] }, crop, page)).toBeNull();
    expect(() => cropPointToPage({ x: -0.01, y: 0.5 }, crop, page)).toThrow();
  });

  it("uses the original source page placement after a replacement revision", () => {
    const { drawings, plans } = workspaces();
    const replaced = {
      ...drawings,
      pages: [...drawings.pages, { id: "replacement-page", uploadId: "upload-b", pageNumber: 1, width: 1000, height: 500 }],
      revisions: [...drawings.revisions, {
        ...drawings.revisions[0]!, id: "revision-b", revisionNumber: 2,
        sourcePageId: "replacement-page", replacesRevisionId: "revision-a", crop: { x: 0, y: 0, width: 400, height: 200 },
        annotations: null
      }]
    } satisfies ClientDrawingWorkspace;
    const latest = latestClientDrawingRevisions(replaced).get("drawing-a")!;
    expect(latest.id).toBe("revision-b");
    expect(canonicalDrawingPlacement(latest, replaced, plans)).toEqual({ page, crop });
  });

  it("shows active submitted drawing marks and comments once, while preserving open request marks", () => {
    const { drawings, plans } = workspaces();
    expect(projectDrawingAnnotationsToPage(page, drawings, plans)).toEqual([
      { ...projectAnnotationToPage(rectangle, crop, page), id: "drawing:revision-a:mark-a" }
    ]);
    expect(projectDrawingCommentsToPage(page, drawings, plans)).toEqual([
      { id: "drawing:revision-a", summary: "Move this wall", status: "submitted", source: "drawing" }
    ]);

    const requested: ClientPlanWorkspace = {
      ...plans,
      openRequests: [{
        id: "request-a", sourcePageId: "page-a", version: 2, summary: "Shift the wall",
        annotations: annotationDocumentSchema.parse({ schemaVersion: 1, imageWidth: page.width, imageHeight: page.height,
          elements: [{ ...projectAnnotationToPage(rectangle, crop, page), id: "request-mark" }] }),
        status: "open", targets: [{ drawingId: "drawing-a", requestedRevisionId: "revision-a", status: "open", resolvedByRevisionId: null }],
        unassigned: false
      }]
    };
    expect(projectDrawingAnnotationsToPage(page, drawings, requested).map((element) => element.id)).toEqual(["request:request-a:request-mark"]);
    expect(projectDrawingAnnotationsToPage(page, drawings, requested, "request-a")).toEqual([]);
    expect(projectDrawingCommentsToPage(page, drawings, requested)).toEqual([
      { id: "request-a", summary: "Shift the wall", status: "open", source: "plan" }
    ]);
  });

  it("never selects hidden draft revisions as the latest Client drawing", () => {
    const { drawings } = workspaces();
    const withDraft: ClientDrawingWorkspace = { ...drawings, revisions: [
      ...drawings.revisions,
      { ...drawings.revisions[0]!, id: "staff-draft", revisionNumber: 2, reviewStatus: "draft" }
    ] };
    expect(latestClientDrawingRevisions(withDraft).get("drawing-a")?.id).toBe("revision-a");
  });
});

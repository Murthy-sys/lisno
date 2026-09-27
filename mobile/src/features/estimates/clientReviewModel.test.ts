import { ApiProtocolError } from "../../core/http/apiClient";
import {
  canDecideClientEstimate,
  canEditClientPlan,
  canViewClientPlan,
  estimatesForProject,
  parseClientDrawingWorkspace,
  parseClientEstimates,
  parseClientPlanWorkspace,
  parseClientSectionReview
} from "./clientReviewModel";

const estimate = (id: string, projectId: string | null, status: string, designPlanStatus: string | null = null) => ({
  id, projectId, status, designPlanStatus, total: id === "estimate-one" ? 100_000 : 950_000,
  lineItems: [{ id: `${id}-line`, quantity: 1, rate: id === "estimate-one" ? 100_000 : 950_000, amount: id === "estimate-one" ? 100_000 : 950_000, included: true }],
  lead: { projectName: id === "estimate-one" ? "Home A" : "Home B", location: "Pune", clientName: "Client" }
});

describe("client review contracts", () => {
  it("joins estimates to projects by stable ID and keeps a pre-approval estimate without a project", () => {
    const rows = parseClientEstimates([
      estimate("estimate-one", "project-one", "client_approved", "ready_for_client"),
      estimate("estimate-two", "project-two", "sent_to_client"),
      estimate("estimate-three", null, "sent_to_client")
    ]);
    expect(estimatesForProject(rows, "project-one").map((row) => [row.id, row.total])).toEqual([["estimate-one", 100_000]]);
    expect(estimatesForProject(rows, "project-two").map((row) => [row.id, row.total])).toEqual([["estimate-two", 950_000]]);
    expect(estimatesForProject(rows, "Home A")).toEqual([]);
    expect(rows[2]?.projectId).toBeNull();
  });

  it("separates commercial decision, reviewable plan, and approved read-only plan states", () => {
    const rows = parseClientEstimates([
      estimate("estimate-one", null, "sent_to_client"),
      estimate("estimate-two", null, "client_changes_requested"),
      estimate("estimate-three", "project-three", "client_approved", "pending_assignment"),
      estimate("estimate-four", "project-four", "client_approved", "ready_for_client"),
      estimate("estimate-five", "project-five", "client_approved", "approved")
    ]);
    expect(rows.map((row) => [canDecideClientEstimate(row), canEditClientPlan(row), canViewClientPlan(row)])).toEqual([
      [true, true, true],
      [false, true, true],
      [false, false, false],
      [false, true, true],
      [false, false, true]
    ]);
  });

  it("rejects missing actionable IDs and cross-linked plan pages and sections", () => {
    expect(() => parseClientEstimates([estimate("", null, "sent_to_client")])).toThrow(ApiProtocolError);
    expect(() => parseClientPlanWorkspace({
      uploads: [{ id: "upload-a", originalFilename: "plan.pdf", mimeType: "application/pdf", pageCount: 1, pages: [{ id: "page-a", uploadId: "upload-b", pageNumber: 1, width: 100, height: 100, currentRevisionId: "revision-a", status: "awaiting_review", annotationDraft: null }] }],
      pages: [{ id: "page-a", uploadId: "upload-b", pageNumber: 1, width: 100, height: 100, currentRevisionId: "revision-a", status: "awaiting_review", annotationDraft: null }],
      openRequests: []
    })).toThrow(ApiProtocolError);
    const planPage = { id: "page-a", uploadId: "upload-a", pageNumber: 1, width: 100, height: 100, currentRevisionId: "revision-a", status: "awaiting_review" };
    expect(() => parseClientPlanWorkspace({
      uploads: [{ id: "upload-a", originalFilename: "plan.pdf", mimeType: "application/pdf", pageCount: 1, pages: [{ ...planPage, annotationDraft: null }] }],
      pages: [{ ...planPage, annotationDraft: { id: "draft-a", sourcePageId: "page-b", version: 1, annotations: { schemaVersion: 1, imageWidth: 100, imageHeight: 100, elements: [] } } }],
      openRequests: []
    })).toThrow(ApiProtocolError);
    expect(() => parseClientSectionReview({ projectId: "project-other", progress: { approved: 0, rejected: 0, awaitingReview: 0, total: 0 }, sections: [] }, "project-one")).toThrow(ApiProtocolError);
  });

  it("accepts drawing history from an older source page while checking the current placement", () => {
    const currentPage = { id: "page-b", uploadId: "upload-b", pageNumber: 1, width: 600, height: 900 };
    const oldRevision = {
      id: "revision-a", drawingId: "drawing-a", revisionNumber: 1, sourcePageId: "page-a",
      crop: { x: 0, y: 0, width: 400, height: 700 }, reviewStatus: "changes_requested", annotations: null, annotationDraft: null
    };
    const currentRevision = {
      id: "revision-b", drawingId: "drawing-a", revisionNumber: 2, sourcePageId: "page-b",
      crop: { x: 10, y: 20, width: 200, height: 300 }, reviewStatus: "submitted", annotations: null, annotationDraft: null
    };
    const workspace = {
      uploads: [{ id: "upload-b", originalFilename: "replacement.pdf", mimeType: "application/pdf" }],
      pages: [currentPage],
      drawings: [{ id: "drawing-a", sourcePageId: "page-b", displayTitle: "Drawing", active: true }],
      revisions: [oldRevision, currentRevision],
      readiness: { ready: false, total: 1, approved: 0, awaitingReview: 1, changesRequested: 0 }
    };
    expect(parseClientDrawingWorkspace(workspace).revisions.map((revision) => revision.sourcePageId)).toEqual(["page-a", "page-b"]);
    expect(() => parseClientDrawingWorkspace({ ...workspace, pages: [] })).toThrow(ApiProtocolError);
    expect(() => parseClientDrawingWorkspace({
      ...workspace, drawings: [{ ...workspace.drawings[0], sourcePageId: "page-a" }]
    })).toThrow(ApiProtocolError);
    expect(() => parseClientDrawingWorkspace({
      ...workspace, revisions: [oldRevision, { ...currentRevision, annotationDraft: {
        id: "draft-b", revisionId: "revision-a", version: 1,
        annotations: { schemaVersion: 1, imageWidth: 200, imageHeight: 300, elements: [] }
      } }]
    })).toThrow(ApiProtocolError);
  });
});

import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { emptyAnnotationDocument, type AnnotationDocumentV1 } from "../../platform/annotations/document";
import { parseClientPlanWorkspace } from "./clientReviewModel";
import {
  initialPlanDocument,
  orderedPlanUploads,
  planMutationError,
  planMutationVersion,
  planRequestForPage,
  planReviewIsAwaiting,
  sharedPlanRequestMarks,
  submissionFingerprint,
  validatePlanDocument,
  validatePlanFeedback
} from "./clientPlanReviewModel";

const mark = { id: "mark-a", type: "text" as const, color: "#B42318", strokeWidth: 2, x: 0.4, y: 0.3, text: "Move door" };
const document: AnnotationDocumentV1 = { ...emptyAnnotationDocument(1000, 700), elements: [mark] };
const page = (id: string, pageNumber: number, uploadId = "upload-a") => ({
  id, uploadId, pageNumber, width: 1000, height: 700, currentRevisionId: `revision-${id}`,
  status: "awaiting_review", annotationDraft: null
});
const request = (id: string, sourcePageId: string) => ({
  id, sourcePageId, version: 2, summary: "Move door", annotations: document,
  status: "open", targets: [], unassigned: true
});

function workspace() {
  const first = page("page-one", 1);
  const second = page("page-two", 2);
  const other = page("page-other", 1, "upload-b");
  return parseClientPlanWorkspace({
    uploads: [
      { id: "upload-a", originalFilename: "first-plan.pdf", mimeType: "application/pdf", pageCount: 2, pages: [second, first] },
      { id: "upload-b", originalFilename: "second-plan.png", mimeType: "image/png", pageCount: 1, pages: [other] }
    ],
    pages: [first, second, other],
    openRequests: [request("request-one", "page-one"), request("request-other", "page-other")]
  });
}

describe("client plan review model", () => {
  it("groups uploads by stable ID and orders pages numerically within each original filename", () => {
    const groups = orderedPlanUploads(workspace());
    expect(groups.map((group) => [group.id, group.originalFilename, group.pages.map((page) => page.id)])).toEqual([
      ["upload-a", "first-plan.pdf", ["page-one", "page-two"]],
      ["upload-b", "second-plan.png", ["page-other"]]
    ]);
  });

  it("uses the open request, then a saved draft, then an empty document for the exact page", () => {
    const data = workspace();
    const first = data.pages[0]!;
    const open = planRequestForPage(data, first.id);
    expect(open && open !== "ambiguous" ? open.id : null).toBe("request-one");
    expect(initialPlanDocument(first, data.openRequests[0]!)).toEqual(document);
    const second = { ...data.pages[1]!, annotationDraft: { id: "draft-two", sourcePageId: "page-two", version: 3, annotations: data.openRequests[0]!.annotations } };
    expect(initialPlanDocument(second, null)).toEqual(document);
    expect(initialPlanDocument(data.pages[2]!, null).elements).toEqual([]);
    expect(sharedPlanRequestMarks(data, "page-one", "request-one")).toEqual([]);
    expect(sharedPlanRequestMarks(data, "page-other").map((element) => element.id)).toEqual(["request:request-other:mark-a"]);
  });

  it("does not silently choose between duplicate open requests", () => {
    const data = workspace();
    const duplicate = { ...data, openRequests: [...data.openRequests, { ...data.openRequests[0]!, id: "request-second" }] };
    expect(planRequestForPage(duplicate, "page-one")).toBe("ambiguous");
  });

  it("checks dimensions, marks, summary and backend document limits before submission", () => {
    const first = workspace().pages[0]!;
    expect(validatePlanFeedback(document, "Move the door", first)).toBeNull();
    expect(validatePlanFeedback(emptyAnnotationDocument(1000, 700), "Move the door", first)).toMatch(/at least one mark/u);
    expect(validatePlanFeedback(document, " ", first)).toMatch(/Describe the changes/u);
    expect(validatePlanFeedback(document, "a".repeat(1001), first)).toMatch(/1,000/u);
    expect(validatePlanDocument({ ...document, imageWidth: 900 }, first)).toMatch(/dimensions/u);
    expect(validatePlanDocument({ ...document, elements: Array(201).fill(mark) }, first)).not.toBeNull();
    expect(validatePlanDocument({ ...document, elements: [{ ...mark, text: "x".repeat(501) }] }, first)).not.toBeNull();
  });

  it("maps non-reviewable and stale failures without exposing server messages", () => {
    expect(planReviewIsAwaiting(new ApiError(409, "DESIGN_PLAN_NOT_REVIEWABLE", "raw"))).toBe(true);
    expect(planReviewIsAwaiting(new ApiError(409, "PLAN_REVIEW_CONFLICT", "raw"))).toBe(false);
    const stale = planMutationError(new ApiError(409, "PLAN_REVIEW_CONFLICT", "private server detail"));
    expect(stale.conflict).toBe(true);
    expect(stale.message).not.toContain("private server detail");
    expect(planMutationError(new ApiError(403, "FORBIDDEN", "private server detail")).message).toMatch(/no longer available/u);
    expect(planMutationError(new Error("private server detail")).message).toMatch(/connection/u);
  });

  it("accepts only the saved version for the same source page", () => {
    expect(planMutationVersion({ id: "draft-a", sourcePageId: "page-one", version: 4 }, "page-one")).toBe(4);
    expect(() => planMutationVersion({ id: "draft-b", sourcePageId: "page-other", version: 4 }, "page-one")).toThrow(ApiProtocolError);
    expect(() => planMutationVersion({ sourcePageId: "page-one", version: 0 }, "page-one")).toThrow(ApiProtocolError);
    expect(submissionFingerprint(document, " move door ")).toBe(submissionFingerprint(document, "move door"));
  });
});

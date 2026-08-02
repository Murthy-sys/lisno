import { describe, expect, it } from "vitest";

import {
  derivePlanRequestStatus,
  requirePlanRequestTransition
} from "../src/domain/estimate-plan-review.js";
import { EstimatePlanAnnotationDraftModel } from "../src/models/EstimatePlanAnnotationDraft.js";
import { EstimatePlanChangeRequestModel } from "../src/models/EstimatePlanChangeRequest.js";
import { EstimatePlanPageRevisionModel } from "../src/models/EstimatePlanPageRevision.js";

const annotations = {
  schemaVersion: 1,
  imageWidth: 2_000,
  imageHeight: 1_000,
  elements: [{
    id: "mark-1", type: "rectangle", color: "#ff0000", strokeWidth: 2,
    x: 0.1, y: 0.1, width: 0.2, height: 0.2
  }]
};

describe("estimate plan review persistence", () => {
  it("validates immutable page revision patch manifests", async () => {
    const revision = new EstimatePlanPageRevisionModel({
      _id: "plan-page-revision-1",
      estimateId: "estimate-1",
      sourcePageId: "page-1",
      revisionNumber: 1,
      basePageReference: "private/base.png",
      status: "awaiting_review",
      patches: [
        { drawingId: "drawing-1", drawingRevisionId: "revision-1", crop: { x: 0, y: 0, width: 100, height: 100 }, order: 0 },
        { drawingId: "drawing-1", drawingRevisionId: "revision-2", crop: { x: 100, y: 0, width: 100, height: 100 }, order: 1 }
      ],
      previousRevisionId: null,
      createdBy: "system"
    });
    await expect(revision.validate()).rejects.toThrow(/unique drawing/i);
  });

  it("requires assigned or unassigned change requests but never both", async () => {
    const invalid = new EstimatePlanChangeRequestModel({
      _id: "request-1", estimateId: "estimate-1", uploadId: "upload-1",
      sourcePageId: "page-1", clientId: "client-1", idempotencyKey: "key-1",
      version: 1, summary: "Move this", annotations,
      targets: [{ drawingId: "drawing-1", requestedRevisionId: "revision-1", status: "open", resolvedByRevisionId: null }],
      unassigned: true, status: "open"
    });
    await expect(invalid.validate()).rejects.toThrow(/unassigned/i);
  });

  it("validates page drafts with the existing annotation limits", async () => {
    const valid = new EstimatePlanAnnotationDraftModel({
      _id: "draft-1", estimateId: "estimate-1", sourcePageId: "page-1",
      clientId: "client-1", version: 1, annotations
    });
    await expect(valid.validate()).resolves.toBeUndefined();
    valid.set("annotations", { ...annotations, imageWidth: 0 });
    await expect(valid.validate()).rejects.toThrow();
  });

  it("derives request status and guards target transitions", () => {
    expect(derivePlanRequestStatus(["approved", "resolved"], false)).toBe("resolved");
    expect(derivePlanRequestStatus(["open", "approved"], false)).toBe("open");
    expect(derivePlanRequestStatus([], true, true)).toBe("resolved");
    expect(() => requirePlanRequestTransition("open", "approved")).toThrow(/transition/i);
    expect(requirePlanRequestTransition("open", "replacement_submitted")).toBeUndefined();
    expect(requirePlanRequestTransition("replacement_submitted", "open")).toBeUndefined();
  });

  it("declares unique optimistic identity indexes", () => {
    expect(EstimatePlanPageRevisionModel.schema.indexes()).toContainEqual([
      { sourcePageId: 1, revisionNumber: 1 }, { unique: true }
    ]);
    expect(EstimatePlanAnnotationDraftModel.schema.indexes()).toContainEqual([
      { clientId: 1, sourcePageId: 1 }, { unique: true }
    ]);
    expect(EstimatePlanChangeRequestModel.schema.indexes()).toContainEqual([
      { clientId: 1, sourcePageId: 1, idempotencyKey: 1 }, { unique: true }
    ]);
  });
});

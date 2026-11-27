import { describe, expect, it } from "vitest";
import { isDesignLayoutRequirements } from "../src/contracts/design-layout-requirements.js";
import { buildEstimatePlanDocumentManifest } from "../src/domain/estimate-plan-document.js";
import { layoutClassificationAvailability, projectDesignLayoutRequirements, uploadLayoutType } from "../src/services/design-layout-requirements.service.js";
import { layoutChoiceFixture, layoutLineageFixture } from "./fixtures/design-layout.js";

const estimate = { _id: "layout-estimate", status: "client_approved", designPlanStatus: "in_progress", designPlanDesignerId: "designer", designPlanVersion: 0 };
const designer = { id: "designer", role: "designer", name: "Designer", email: "designer@example.test" } as const;

describe("current layout requirements", () => {
  it("requires separate original uploads for Option 1 and only 3D for Option 2", () => {
    const complete = projectDesignLayoutRequirements(estimate, layoutLineageFixture(), layoutChoiceFixture().context);
    expect(complete.coverageComplete).toBe(true); expect(isDesignLayoutRequirements(complete)).toBe(true);
    const only3d = layoutLineageFixture(["layout_3d"]);
    expect(projectDesignLayoutRequirements(estimate, only3d, layoutChoiceFixture().context).missingTypes).toEqual(["layout_2d"]);
    const option2 = layoutChoiceFixture("layout-project", "option_2").context;
    expect(projectDesignLayoutRequirements(estimate, only3d, option2)).toMatchObject({ requiredTypes: ["layout_3d"], coverageComplete: true, missingTypes: [] });
  });

  it.each(["empty", "failed", "deleted", "inactive", "foreign", "missing-revision"])("does not count %s current content", kind => {
    const lineage = layoutLineageFixture();
    if (kind === "empty") lineage.uploads[0]!.sizeBytes = 0;
    if (kind === "failed") lineage.uploads[0]!.extractionStatus = "processing_failed";
    if (kind === "deleted") lineage.uploads[0]!.deletedAt = new Date();
    if (kind === "inactive") lineage.drawings[0]!.active = false;
    if (kind === "foreign") lineage.uploads[0]!.estimateId = "different-estimate";
    if (kind === "missing-revision") lineage.revisions = lineage.revisions.slice(1);
    const requirements = projectDesignLayoutRequirements(estimate, lineage, layoutChoiceFixture().context);
    expect(requirements.coverageComplete).toBe(false); expect(requirements.missingTypes).toContain("layout_2d");
  });

  it("allows proven approved legacy references without counting them and blocks editable unknown content", () => {
    const lineage = layoutLineageFixture(["layout_2d", "layout_3d", null]);
    expect(projectDesignLayoutRequirements(estimate, lineage, layoutChoiceFixture().context).unclassifiedUploadIds).toEqual(["layout-upload-2"]);
    lineage.revisions[2]!.reviewStatus = "approved";
    expect(projectDesignLayoutRequirements(estimate, lineage, layoutChoiceFixture().context)).toMatchObject({ unclassifiedUploadIds: [], coverageComplete: true });
    expect(layoutClassificationAvailability(designer, estimate, lineage.uploads[2]!, lineage, layoutChoiceFixture().context).canClassifyLayoutType).toBe(false);
  });

  it("rejects a forbidden typed root and inconsistent choice lineage", () => {
    const lineage = layoutLineageFixture();
    expect(projectDesignLayoutRequirements(estimate, lineage, layoutChoiceFixture("layout-project", "option_2").context).coverageComplete).toBe(false);
    lineage.uploads[0]!.layoutClassification.choiceHistoryEventId = "foreign-choice";
    expect(projectDesignLayoutRequirements(estimate, lineage, layoutChoiceFixture().context).missingTypes).toContain("layout_2d");
  });

  it("inherits replacement type without creating another original", () => {
    const lineage = layoutLineageFixture(["layout_3d"]);
    lineage.uploads.push({ ...lineage.uploads[0]!, _id: "replacement", purpose: "drawing_replacement", replacementDrawingId: "layout-drawing-0", layoutType: undefined, layoutClassification: undefined });
    lineage.pages.push({ ...lineage.pages[0]!, _id: "replacement-page", uploadId: "replacement", sourceKind: "replacement" });
    lineage.revisions.push({ ...lineage.revisions[0]!, _id: "replacement-revision", revisionNumber: 2, sourcePageId: "replacement-page", replacesRevisionId: "layout-revision-0" });
    expect(uploadLayoutType(lineage.uploads[1]!, lineage)).toBe("layout_3d");
    expect(projectDesignLayoutRequirements(estimate, lineage, layoutChoiceFixture().context).missingTypes).toEqual(["layout_2d"]);
    lineage.uploads[1]!.layoutType = "layout_2d";
    expect(() => uploadLayoutType(lineage.uploads[1]!, lineage)).toThrow(/does not match/);
  });

  it("changes preparation identity after labeling while retaining untyped historical manifests", () => {
    const lineage = layoutLineageFixture([null]);
    const before = buildEstimatePlanDocumentManifest(lineage);
    expect(before.documents[0]).not.toHaveProperty("layoutType");
    const snapshot = JSON.stringify(before);
    Object.assign(lineage.uploads[0]!, { layoutType: "layout_3d", layoutClassification: layoutLineageFixture(["layout_3d"]).uploads[0]!.layoutClassification });
    const after = buildEstimatePlanDocumentManifest(lineage);
    expect(after.manifestHash).not.toBe(before.manifestHash);
    expect(after.documents[0]!.layoutType).toBe("layout_3d"); expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("blocks current pending-round files and keeps pre-approval requirements inapplicable", () => {
    const lineage = layoutLineageFixture([null]);
    expect(layoutClassificationAvailability(designer, estimate, lineage.uploads[0]!, lineage, layoutChoiceFixture().context, [{ status: "pending", attachments: [{ uploadId: "layout-upload-0" }] }]).canClassifyLayoutType).toBe(false);
    const requirements = projectDesignLayoutRequirements({ ...estimate, status: "draft" }, lineage, { status: "not_applicable", choice: null, record: null, reason: null });
    expect(requirements.status).toBe("not_applicable"); expect(isDesignLayoutRequirements(requirements)).toBe(true);
  });
});

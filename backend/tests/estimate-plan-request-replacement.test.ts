import { describe, expect, it } from "vitest";

import {
  deriveEstimateDesignUploadPurpose,
  matchPlanRequestReplacementPages,
  normalizeEstimateDesignTitle,
  PlanRequestReplacementMatchError,
  type PlanRequestReplacementCandidate,
  type PlanRequestReplacementTargetSnapshot
} from "../src/domain/estimate-design.js";

const mapped = {
  roomId: "room-living",
  scopeSectionId: "CA",
  catalogueId: "CA01"
};

function target(
  drawingId: string,
  title: string,
  mapping: PlanRequestReplacementTargetSnapshot["mapping"] = mapped
): PlanRequestReplacementTargetSnapshot {
  return {
    drawingId,
    requestedRevisionId: `revision-${drawingId}`,
    detectedTitle: title,
    normalizedTitle: normalizeEstimateDesignTitle(title),
    mapping
  };
}

function page(
  pageNumber: number,
  title: string,
  mapping: PlanRequestReplacementCandidate["mapping"] = mapped
): PlanRequestReplacementCandidate {
  return {
    pageNumber,
    detectedTitle: title,
    normalizedTitle: normalizeEstimateDesignTitle(title),
    mapping
  };
}

describe("plan-request replacement matching", () => {
  it("matches 2D and 3D titles exactly and reports unrelated pages", () => {
    const result = matchPlanRequestReplacementPages(
      [
        target("drawing-2d", "LIVING ROOM FLOOR PLAN", { ...mapped, catalogueId: "FL01", scopeSectionId: "FL" }),
        target("drawing-3d", "LIVING ROOM 3D PERSPECTIVE", { roomId: null, scopeSectionId: null, catalogueId: null })
      ],
      [
        page(7, "unchanged kitchen plan", { roomId: null, scopeSectionId: null, catalogueId: null }),
        page(2, "Living Room – 3D Perspective", { roomId: null, scopeSectionId: null, catalogueId: null }),
        page(5, "living room floor plan", { ...mapped, catalogueId: "FL01", scopeSectionId: "FL" })
      ]
    );

    expect(result.matches.map((match) => ({
      drawingId: match.target.drawingId,
      pageNumber: match.candidate.pageNumber,
      reason: match.reason
    }))).toEqual([
      { drawingId: "drawing-2d", pageNumber: 5, reason: "normalized_title" },
      { drawingId: "drawing-3d", pageNumber: 2, reason: "normalized_title" }
    ]);
    expect(result.ignoredPageNumbers).toEqual([7]);
  });

  it("uses a unique complete mapping tuple only after title matching", () => {
    const result = matchPlanRequestReplacementPages(
      [target("drawing-1", "OLD TITLE")],
      [page(3, "RENAMED TITLE")]
    );
    expect(result.matches[0]).toMatchObject({
      reason: "mapping_tuple",
      candidate: { pageNumber: 3 }
    });
  });

  it("does not use an incomplete mapping tuple as a fallback", () => {
    expect(() => matchPlanRequestReplacementPages(
      [target("drawing-1", "OLD TITLE", { roomId: "room-living", scopeSectionId: null, catalogueId: null })],
      [page(1, "RENAMED TITLE", { roomId: "room-living", scopeSectionId: null, catalogueId: null })]
    )).toThrowError(expect.objectContaining({ code: "PLAN_REPLACEMENT_TARGET_MISSING" }));
  });

  it.each([
    {
      name: "duplicate OCR titles",
      targets: [target("drawing-1", "LIVING ROOM PLAN")],
      pages: [page(1, "LIVING ROOM PLAN"), page(2, "LIVING ROOM PLAN")]
    },
    {
      name: "duplicate target titles",
      targets: [target("drawing-1", "LIVING ROOM PLAN"), target("drawing-2", "LIVING ROOM PLAN")],
      pages: [page(1, "LIVING ROOM PLAN")]
    },
    {
      name: "duplicate tuple fallback",
      targets: [target("drawing-1", "OLD ONE"), target("drawing-2", "OLD TWO")],
      pages: [page(1, "NEW ONE"), page(2, "NEW TWO")]
    }
  ])("fails safely for $name", ({ targets, pages }) => {
    try {
      matchPlanRequestReplacementPages(targets, pages);
      throw new Error("Expected matching to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PlanRequestReplacementMatchError);
      expect((error as PlanRequestReplacementMatchError).code).toBe("PLAN_REPLACEMENT_MATCH_AMBIGUOUS");
    }
  });

  it("is independent of target and page order", () => {
    const targets = [target("drawing-b", "BEDROOM 3D"), target("drawing-a", "BEDROOM PLAN")];
    const pages = [page(9, "bedroom plan"), page(4, "bedroom 3d")];
    const forward = matchPlanRequestReplacementPages(targets, pages);
    const reversed = matchPlanRequestReplacementPages([...targets].reverse(), [...pages].reverse());
    expect(reversed).toEqual(forward);
  });

  it("derives purpose for historical ordinary and direct replacement uploads", () => {
    expect(deriveEstimateDesignUploadPurpose({})).toBe("ordinary");
    expect(deriveEstimateDesignUploadPurpose({ replacementDrawingId: "drawing-1" })).toBe("drawing_replacement");
    expect(deriveEstimateDesignUploadPurpose({ purpose: "plan_request_replacement" })).toBe("plan_request_replacement");
  });
});

import { describe, expect, it } from "vitest";

import type { AnnotationDocumentV1 } from "../src/domain/estimate-design.js";
import {
  cropPointToPage,
  detectAnnotationTargets,
  pagePointToCrop,
  projectAnnotationToCrop,
  projectAnnotationToPage
} from "../src/domain/estimate-plan-review.js";

const page = { width: 2_000, height: 1_000 };
const crop = { x: 500, y: 100, width: 800, height: 600 };
const base = { color: "#ff0000", strokeWidth: 2 };
const elements: AnnotationDocumentV1["elements"] = [
  { ...base, id: "rectangle", type: "rectangle", x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  { ...base, id: "ellipse", type: "ellipse", x: 0.2, y: 0.1, width: 0.2, height: 0.25 },
  { ...base, id: "arrow", type: "arrow", x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.7 },
  { ...base, id: "freehand", type: "freehand", points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.7 }] },
  { ...base, id: "text", type: "text", x: 0.3, y: 0.6, text: "Move this" }
];

describe("estimate plan annotation geometry", () => {
  it("round-trips every annotation geometry through a drawing crop", () => {
    for (const element of elements) {
      const projected = projectAnnotationToPage(element, crop, page);
      const restored = projectAnnotationToCrop(projected, crop, page);
      expect(restored).toEqual(element);
    }
  });

  it("maps points through the crop and rejects page points outside it", () => {
    const projected = cropPointToPage({ x: 0.25, y: 0.5 }, crop, page);
    expect(projected).toEqual({ x: 0.35, y: 0.4 });
    expect(pagePointToCrop(projected, crop, page)).toEqual({ x: 0.25, y: 0.5 });
    expect(pagePointToCrop({ x: 0.01, y: 0.01 }, crop, page)).toBeNull();
  });

  it("rejects non-finite and out-of-range geometry instead of clamping it", () => {
    expect(() => cropPointToPage({ x: Number.NaN, y: 0.5 }, crop, page)).toThrow();
    expect(() => cropPointToPage({ x: 1.01, y: 0.5 }, crop, page)).toThrow();
  });

  it("detects anchor and material area overlap in deterministic order", () => {
    const drawings = [
      { drawingId: "drawing-small", crop: { x: 1_000, y: 200, width: 300, height: 300 } },
      { drawingId: "drawing-large", crop: { x: 400, y: 100, width: 1_000, height: 700 } },
      { drawingId: "drawing-touch", crop: { x: 1_400, y: 100, width: 200, height: 700 } }
    ];
    const mark = { ...base, id: "mark", type: "rectangle" as const, x: 0.5, y: 0.2, width: 0.2, height: 0.3 };

    expect(detectAnnotationTargets([mark], drawings, page)).toEqual([
      { drawingId: "drawing-large", reason: "anchor_inside" },
      { drawingId: "drawing-small", reason: "anchor_inside" }
    ]);
  });

  it("does not count boundary-only contact or less than fifteen-percent overlap", () => {
    const mark = { ...base, id: "mark", type: "rectangle" as const, x: 0.4, y: 0.2, width: 0.2, height: 0.2 };
    expect(detectAnnotationTargets([mark], [
      { drawingId: "touch", crop: { x: 1_200, y: 200, width: 200, height: 200 } },
      { drawingId: "sliver", crop: { x: 1_180, y: 200, width: 20, height: 200 } }
    ], page)).toEqual([]);
  });
});

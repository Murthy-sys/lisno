import { describe, expect, it } from "vitest";

import type { AnnotationElement } from "../../api/types";
import {
  containedDrawingCrop,
  cropPointToPage,
  pagePointToCrop,
  projectAnnotationToCrop,
  projectAnnotationToPage
} from "./planGeometry";

const page = { width: 2_000, height: 1_000 };
const crop = { x: 500, y: 100, width: 800, height: 600 };
const elements: AnnotationElement[] = [
  { id: "rectangle", type: "rectangle", color: "#ff0000", strokeWidth: 2, x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  { id: "ellipse", type: "ellipse", color: "#ff0000", strokeWidth: 2, x: 0.2, y: 0.1, width: 0.2, height: 0.25 },
  { id: "arrow", type: "arrow", color: "#ff0000", strokeWidth: 2, x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.7 },
  { id: "freehand", type: "freehand", color: "#ff0000", strokeWidth: 2, points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.7 }] },
  { id: "text", type: "text", color: "#ff0000", strokeWidth: 2, x: 0.3, y: 0.6, text: "Move this" }
];

describe("plan geometry", () => {
  it.each([
    [{ width: 80, height: 160 }, { x: 105, y: 60, width: 50, height: 100 }],
    [{ width: 320, height: 100 }, { x: 50, y: 85, width: 160, height: 50 }]
  ])("keeps annotations aligned to fitted content and excludes blank padding for %j", (source, expected) => {
    const slot = { x: 50, y: 60, width: 160, height: 100 };
    const content = containedDrawingCrop(slot, source);
    expect(content).toEqual(expected);
    for (const point of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.75, y: 0.25 }]) {
      expect(pagePointToCrop(cropPointToPage(point, content, page), content, page)).toEqual(point);
    }
    expect(pagePointToCrop(cropPointToPage({ x: 0, y: 0 }, slot, page), content, page)).toBeNull();
    for (const element of elements) expect(projectAnnotationToCrop(projectAnnotationToPage(element, content, page), content, page)).toEqual(element);
  });

  it("matches the backend crop and page projection contract", () => {
    expect(cropPointToPage({ x: 0.25, y: 0.5 }, crop, page)).toEqual({ x: 0.35, y: 0.4 });
    expect(pagePointToCrop({ x: 0.35, y: 0.4 }, crop, page)).toEqual({ x: 0.25, y: 0.5 });
    for (const element of elements) {
      expect(projectAnnotationToCrop(projectAnnotationToPage(element, crop, page), crop, page)).toEqual(element);
    }
  });
});

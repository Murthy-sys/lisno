import { describe, expect, it } from "vitest";

import type { AnnotationElement } from "../../api/types";
import {
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
  it("matches the backend crop and page projection contract", () => {
    expect(cropPointToPage({ x: 0.25, y: 0.5 }, crop, page)).toEqual({ x: 0.35, y: 0.4 });
    expect(pagePointToCrop({ x: 0.35, y: 0.4 }, crop, page)).toEqual({ x: 0.25, y: 0.5 });
    for (const element of elements) {
      expect(projectAnnotationToCrop(projectAnnotationToPage(element, crop, page), crop, page)).toEqual(element);
    }
  });
});

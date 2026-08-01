import { describe, expect, it } from "vitest";

import type {
  AnnotationDocumentV1,
  AnnotationElement
} from "../../api/types";
import {
  addElement,
  hitTestElements,
  makeArrow,
  makeBoundedShape,
  moveElement,
  normalizedToViewport,
  removeElement,
  resizeShape,
  annotationDocumentByteLength,
  isAnnotationDocumentWithinByteLimit,
  simplifyFreehand,
  updateElement,
  viewportToNormalized,
  type ResizeHandle
} from "./annotationGeometry";

const base = { id: "shape-1", color: "#ef4444", strokeWidth: 2 };
const MAX_ANNOTATION_BYTES = 256 * 1024;

function makeByteBoundaryDocument(): AnnotationDocumentV1 {
  let document: AnnotationDocumentV1 = {
    schemaVersion: 1,
    imageWidth: 1000,
    imageHeight: 800,
    elements: [{
      ...base,
      id: "path",
      type: "freehand",
      points: Array.from({ length: 5_000 }, () => ({ x: 0.123456, y: 0.654321 }))
    }]
  };
  while (document.elements.length < 199) {
    const id = `note-${document.elements.length}`;
    const emptyCandidate: AnnotationDocumentV1 = {
      ...document,
      elements: [...document.elements, {
        ...base,
        id,
        type: "text",
        x: 0.25,
        y: 0.75,
        text: ""
      }]
    };
    const emptyBytes = new TextEncoder().encode(JSON.stringify(emptyCandidate)).byteLength;
    const remaining = MAX_ANNOTATION_BYTES - emptyBytes;
    if (remaining < 1) break;
    const emojiCount = Math.min(250, Math.floor(remaining / 4));
    const asciiCount = Math.min(500 - emojiCount * 2, remaining - emojiCount * 4);
    const text = `${"😀".repeat(emojiCount)}${"x".repeat(asciiCount)}`;
    const candidate: AnnotationDocumentV1 = {
      ...document,
      elements: [...document.elements, {
        ...base,
        id,
        type: "text",
        x: 0.25,
        y: 0.75,
        text
      }]
    };
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > MAX_ANNOTATION_BYTES) break;
    document = candidate;
    if (text.length < 500) break;
  }
  return document;
}

function expectNormalized(element: AnnotationElement) {
  const numbers =
    element.type === "rectangle" || element.type === "ellipse"
      ? [element.x, element.y, element.x + element.width, element.y + element.height]
      : element.type === "arrow"
        ? [element.x1, element.y1, element.x2, element.y2]
        : element.type === "freehand"
          ? element.points.flatMap((point) => [point.x, point.y])
          : [element.x, element.y];
  numbers.forEach((number) => {
    expect(number).toBeGreaterThanOrEqual(0);
    expect(number).toBeLessThanOrEqual(1);
  });
}

describe("annotation geometry", () => {
  it("converts viewport coordinates to normalized image coordinates and clamps overflow", () => {
    expect(
      viewportToNormalized(
        { x: 350, y: 225 },
        { left: 100, top: 25, width: 500, height: 400 }
      )
    ).toEqual({ x: 0.5, y: 0.5 });
    expect(
      viewportToNormalized(
        { x: 50, y: 500 },
        { left: 100, top: 25, width: 500, height: 400 }
      )
    ).toEqual({ x: 0, y: 1 });
  });

  it("preserves image coordinates through zoom and pan projection", () => {
    const point = { x: 0.25, y: 0.75 };
    const viewport = { left: 20, top: 30, width: 800, height: 600 };
    const transform = { zoom: 2, panX: 0.1, panY: -0.05 };
    const projected = normalizedToViewport(point, viewport, transform);

    expect(projected).toEqual({ x: 180, y: 570 });
    expect(viewportToNormalized(projected, viewport, transform)).toEqual(point);
  });

  it.each(["rectangle", "ellipse"] as const)(
    "constructs a bounded %s in any drag direction",
    (type) => {
      const element = makeBoundedShape(
        type,
        { x: 0.8, y: 0.9 },
        { x: -0.2, y: 0.3 },
        base
      );

      expect(element).toEqual({
        ...base,
        type,
        x: 0,
        y: 0.3,
        width: 0.8,
        height: 0.6
      });
      expectNormalized(element);
    }
  );

  it("constructs clamped arrow endpoints without mutating the source points", () => {
    const start = { x: -1, y: 0.2 };
    const end = { x: 1.5, y: 0.8 };
    const arrow = makeArrow(start, end, base);

    expect(arrow).toEqual({
      ...base,
      type: "arrow",
      x1: 0,
      y1: 0.2,
      x2: 1,
      y2: 0.8
    });
    expect(start).toEqual({ x: -1, y: 0.2 });
    expect(end).toEqual({ x: 1.5, y: 0.8 });
  });

  it("keeps a minimum-size shape inside the image when a drag starts and ends at an edge", () => {
    const element = makeBoundedShape(
      "rectangle",
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      base
    );

    expect(element).toMatchObject({ x: 0.999, y: 0.999, width: 0.001, height: 0.001 });
    expectNormalized(element);
  });

  it("simplifies freehand samples by distance and caps the result while preserving endpoints", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.001, y: 0.001 },
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
      { x: 1.2, y: 1.2 }
    ];

    expect(simplifyFreehand(points, 0.01, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 0.1, y: 0.1 },
      { x: 1, y: 1 }
    ]);
    expect(points[4]).toEqual({ x: 1.2, y: 1.2 });
  });

  it("moves every element kind immutably and keeps complete geometry in bounds", () => {
    const elements: AnnotationElement[] = [
      { ...base, type: "rectangle", x: 0.8, y: 0.8, width: 0.2, height: 0.2 },
      { ...base, id: "ellipse", type: "ellipse", x: 0, y: 0, width: 0.2, height: 0.2 },
      { ...base, id: "arrow", type: "arrow", x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 },
      { ...base, id: "pen", type: "freehand", points: [{ x: 0.8, y: 0.8 }, { x: 0.9, y: 0.9 }] },
      { ...base, id: "text", type: "text", x: 0.9, y: 0.9, text: "Move me" }
    ];

    const moved = elements.map((element) => moveElement(element, { x: 0.5, y: -0.5 }));

    moved.forEach(expectNormalized);
    expect(moved[0]).toMatchObject({ x: 0.8, y: 0.3 });
    expect(moved[1]).toMatchObject({ x: 0.5, y: 0 });
    expect(moved[2]).toMatchObject({ x1: 0.6, y1: 0, x2: 0.8, y2: 0.2 });
    expect(moved[3]).toMatchObject({ points: [{ x: 0.9, y: 0.3 }, { x: 1, y: 0.4 }] });
    expect(moved[4]).toMatchObject({ x: 1, y: 0.4 });
    expect(moved[0]).not.toBe(elements[0]);
    expect(elements[0]).toMatchObject({ x: 0.8, y: 0.8 });
  });

  it.each([
    ["north-west", { x: 0.1, y: 0.1 }, { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }],
    ["north", { x: 0.4, y: 0.1 }, { x: 0.2, y: 0.1, width: 0.4, height: 0.5 }],
    ["north-east", { x: 0.9, y: 0.1 }, { x: 0.2, y: 0.1, width: 0.7, height: 0.5 }],
    ["east", { x: 0.9, y: 0.4 }, { x: 0.2, y: 0.2, width: 0.7, height: 0.4 }],
    ["south-east", { x: 0.9, y: 0.9 }, { x: 0.2, y: 0.2, width: 0.7, height: 0.7 }],
    ["south", { x: 0.4, y: 0.9 }, { x: 0.2, y: 0.2, width: 0.4, height: 0.7 }],
    ["south-west", { x: 0.1, y: 0.9 }, { x: 0.1, y: 0.2, width: 0.5, height: 0.7 }],
    ["west", { x: 0.1, y: 0.4 }, { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }]
  ] as const)("resizes from the %s handle within bounds", (handle, point, expected) => {
    const shape: AnnotationElement = {
      ...base,
      type: "rectangle",
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.4
    };
    const resized = resizeShape(shape, handle as ResizeHandle, point);

    expect(resized).toMatchObject(expected);
    expectNormalized(resized);
    expect(shape).toMatchObject({ x: 0.2, y: 0.2, width: 0.4, height: 0.4 });
  });

  it("hit tests topmost shapes, arrows, freehand paths, and text with tolerance", () => {
    const elements: AnnotationElement[] = [
      { ...base, id: "box", type: "rectangle", x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
      { ...base, id: "arrow", type: "arrow", x1: 0, y1: 0.9, x2: 1, y2: 0.9 },
      { ...base, id: "pen", type: "freehand", points: [{ x: 0.1, y: 0.7 }, { x: 0.9, y: 0.7 }] },
      { ...base, id: "note", type: "text", x: 0.2, y: 0.2, text: "Note" }
    ];

    expect(hitTestElements(elements, { x: 0.2, y: 0.2 }, 0.03)?.id).toBe("note");
    expect(hitTestElements(elements, { x: 0.5, y: 0.71 }, 0.02)?.id).toBe("pen");
    expect(hitTestElements(elements, { x: 0.5, y: 0.89 }, 0.02)?.id).toBe("arrow");
    expect(hitTestElements(elements, { x: 0.4, y: 0.4 }, 0.01)?.id).toBe("box");
    expect(hitTestElements(elements, { x: 0.99, y: 0.01 }, 0.01)).toBeUndefined();
  });

  it("updates annotation documents immutably", () => {
    const original: AnnotationDocumentV1 = {
      schemaVersion: 1,
      imageWidth: 1000,
      imageHeight: 800,
      elements: []
    };
    const shape = makeBoundedShape("rectangle", { x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }, base);
    const added = addElement(original, shape);
    const changed = updateElement(added, { ...shape, x: 0.2 });
    const removed = removeElement(changed, shape.id);

    expect(original.elements).toEqual([]);
    expect(added.elements).toEqual([shape]);
    expect(changed.elements[0]).toMatchObject({ x: 0.2 });
    expect(removed.elements).toEqual([]);
    expect(added).not.toBe(original);
    expect(changed.elements).not.toBe(added.elements);
  });

  it("measures UTF-8 JSON bytes exactly and accepts a mixed document at the 256 KiB boundary", () => {
    const document = makeByteBoundaryDocument();
    const expectedBytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;

    expect(expectedBytes).toBe(MAX_ANNOTATION_BYTES);
    expect(annotationDocumentByteLength(document)).toBe(expectedBytes);
    expect(isAnnotationDocumentWithinByteLimit(document)).toBe(true);
    expect(document.elements.some((element) => element.type === "freehand")).toBe(true);
    expect(document.elements.some((element) => element.type === "text" && element.text.includes("😀"))).toBe(true);
  });

  it("rejects an otherwise bounded mixed document above 256 KiB", () => {
    const boundary = makeByteBoundaryDocument();
    const overLimit: AnnotationDocumentV1 = {
      ...boundary,
      elements: [...boundary.elements, {
        ...base,
        id: "over-limit-note",
        type: "text",
        x: 0.5,
        y: 0.5,
        text: "x"
      }]
    };

    expect(new TextEncoder().encode(JSON.stringify(overLimit)).byteLength).toBeGreaterThan(MAX_ANNOTATION_BYTES);
    expect(isAnnotationDocumentWithinByteLimit(overLimit)).toBe(false);
  });
});

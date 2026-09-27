import type { AnnotationDocumentV1, AnnotationElementV1 } from "./document";
import {
  addElement, hitTestElements, makeArrow, makeBoundedShape, moveElement,
  removeElement, resizeShape, simplifyFreehand, updateElement
} from "./geometry";

const base = { id: "mark", color: "#B42318", strokeWidth: 4 };
const document: AnnotationDocumentV1 = { schemaVersion: 1, imageWidth: 2000, imageHeight: 1000, elements: [] };

describe("annotation geometry", () => {
  it("creates bounded shapes even when drawn backward across image edges", () => {
    const shape = makeBoundedShape("rectangle", { x: 1, y: 0.8 }, { x: -1, y: 2 }, base);
    expect(shape).toEqual({ ...base, type: "rectangle", x: 0, y: 0.8, width: 1, height: 0.2 });
    expect(shape.x + shape.width).toBeLessThanOrEqual(1);
    expect(shape.y + shape.height).toBeLessThanOrEqual(1);
  });

  it("moves each mark type within normalized bounds", () => {
    const shape = makeBoundedShape("ellipse", { x: 0.8, y: 0.8 }, { x: 0.95, y: 0.95 }, base);
    expect(moveElement(shape, { x: 1, y: 1 })).toMatchObject({ x: 0.85, y: 0.85 });
    const arrow = makeArrow({ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.7 }, base);
    expect(moveElement(arrow, { x: -1, y: -1 })).toMatchObject({ x1: 0, y1: 0, x2: 0.7, y2: 0.5 });
    const path: AnnotationElementV1 = { ...base, type: "freehand", points: [{ x: 0.25, y: 0.2 }, { x: 0.9, y: 0.8 }] };
    expect(moveElement(path, { x: 1, y: 1 })).toMatchObject({ points: [{ x: 0.35, y: 0.4 }, { x: 1, y: 1 }] });
    const text: AnnotationElementV1 = { ...base, type: "text", x: 0.9, y: 0.1, text: "Move" };
    expect(moveElement(text, { x: 1, y: -1 })).toMatchObject({ x: 1, y: 0 });
  });

  it("resizes a shape without crossing or leaving the page", () => {
    const shape = makeBoundedShape("rectangle", { x: 0.2, y: 0.3 }, { x: 0.5, y: 0.6 }, base);
    expect(resizeShape(shape, "south-east", { x: 2, y: 2 })).toMatchObject({ x: 0.2, y: 0.3, width: 0.8, height: 0.7 });
    const tiny = resizeShape(shape, "north-west", { x: 0.9, y: 0.9 });
    expect(tiny.width).toBeGreaterThan(0);
    expect(tiny.height).toBeGreaterThan(0);
  });

  it("preserves endpoints while simplifying and limiting freehand input", () => {
    const points = [{ x: 0, y: 0 }, { x: 0.001, y: 0.001 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }];
    expect(simplifyFreehand(points, 0.01)).toEqual([points[0], points[2], points[3]]);
    expect(simplifyFreehand(points, 0.01, 2)).toEqual([points[0], points[3]]);
  });

  it("hits the topmost mark and updates/removes by stable ID", () => {
    const lower = makeBoundedShape("rectangle", { x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 }, base);
    const upper = { ...lower, id: "upper" };
    const withMarks = addElement(addElement(document, lower), upper);
    expect(hitTestElements(withMarks.elements, { x: 0.3, y: 0.3 })?.id).toBe("upper");
    expect(updateElement(withMarks, { ...upper, color: "#315AB8" }).elements[1]?.color).toBe("#315AB8");
    expect(removeElement(withMarks, "upper").elements.map((element) => element.id)).toEqual(["mark"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  countOrbRadius,
  createFlowRibbonPolygon,
  linearSpatialValue,
  projectSpatialPoint,
  signedFlowScale,
  sortSpatialFarToNear,
  spatialSemanticId
} from "./spatialGeometry";

describe("dashboard spatial geometry", () => {
  it("projects deterministically and keeps depth ordering stable", () => {
    const viewport = { width: 720, height: 360 };
    const point = { x: 0.2, y: 0.4, z: -0.5 };
    expect(projectSpatialPoint(point, viewport)).toEqual(projectSpatialPoint(point, viewport));
    const sorted = sortSpatialFarToNear([
      { id: "near", point: { x: 0, y: 0, z: 1 } },
      { id: "far-b", point: { x: 0, y: 0, z: -1 } },
      { id: "far-a", point: { x: 0, y: 0, z: -1 } }
    ], viewport);
    expect(sorted.map(({ id }) => id)).toEqual(["far-a", "far-b", "near"]);
  });

  it("uses square-root count radius so area remains proportional", () => {
    const radiusOne = countOrbRadius(25, 100, 40, 0);
    const radiusFour = countOrbRadius(100, 100, 40, 0);
    expect(radiusFour / radiusOne).toBeCloseTo(2);
    expect(Math.PI * radiusFour ** 2 / (Math.PI * radiusOne ** 2)).toBeCloseTo(4);
    expect(countOrbRadius(0, 100, 40)).toBe(5);
    expect(countOrbRadius(0.01, 100, 40)).toBeGreaterThan(countOrbRadius(0, 100, 40));
  });

  it("keeps temporal height and signed paise width linear", () => {
    expect(linearSpatialValue(25, 100, 80)).toBe(20);
    expect(linearSpatialValue(50, 100, 80)).toBe(40);
    expect(signedFlowScale(2500, 10_000, 40)).toEqual({ width: 10, direction: 1 });
    expect(signedFlowScale(-5000, 10_000, 40)).toEqual({ width: 20, direction: -1 });
    expect(signedFlowScale(0, 10_000, 40)).toEqual({ width: 0, direction: 0 });
  });

  it("creates finite closed flow ribbons and stable semantic IDs", () => {
    const polygon = createFlowRibbonPolygon({ x: 10, y: 20 }, { x: 210, y: 80 }, 18, -1);
    expect(polygon).toHaveLength(26);
    expect(polygon.flatMap(({ x, y }) => [x, y]).every(Number.isFinite)).toBe(true);
    expect(spatialSemanticId("capital", "finance.recordedCostPaise", "current", "Recorded cost", "ribbon"))
      .toBe("capital--finance-recordedcostpaise--current--recorded-cost--ribbon");
  });
});

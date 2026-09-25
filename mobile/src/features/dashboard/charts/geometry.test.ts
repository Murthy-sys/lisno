import {
  allFinitePoints,
  capitalFlowWidth,
  countOrbRadius,
  projectSpatialPoint,
  sortSpatialFarToNear,
  spatialId,
  temporalHeight
} from "./geometry";

describe("spatial projection and quantitative scales", () => {
  it("projects deterministically at phone and tablet dimensions", () => {
    const point = { x: 0.25, y: 0.6, z: -0.3 };
    const phone = projectSpatialPoint(point, { width: 360, height: 320 });
    const repeat = projectSpatialPoint(point, { width: 360, height: 320 });
    const tablet = projectSpatialPoint(point, { width: 760, height: 388 });

    expect(phone).toEqual(repeat);
    expect(phone).toEqual(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
      depth: expect.any(Number)
    }));
    expect(tablet.x).not.toBe(phone.x);
    expect(tablet.y).not.toBe(phone.y);
    expect(allFinitePoints([phone, tablet])).toBe(true);
  });

  it("sorts far-to-near using projected depth and semantic IDs for ties", () => {
    const sorted = sortSpatialFarToNear([
      { id: "near", point: { x: 0, y: 0, z: 0.4 } },
      { id: "tie-b", point: { x: 0, y: 0.2, z: 0 } },
      { id: "tie-a", point: { x: 0, y: 0.2, z: 0 } },
      { id: "far", point: { x: 0, y: 0, z: -0.5 } }
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "far",
      "tie-a",
      "tie-b",
      "near"
    ]);
  });

  it("uses square-root radius so positive orb area is proportional to count", () => {
    const quarter = countOrbRadius(25, true, 100, {
      zeroRadius: 5,
      minimumPositiveRadius: 5,
      maximumRadius: 24
    });
    const whole = countOrbRadius(100, true, 100, {
      zeroRadius: 5,
      minimumPositiveRadius: 5,
      maximumRadius: 24
    });
    const zero = countOrbRadius(0, true, 100);
    const smallestPositive = countOrbRadius(0.0001, true, 100);
    const unavailable = countOrbRadius(null, false, 100);

    expect(quarter).toBe(12);
    expect(whole).toBe(24);
    expect((quarter * quarter) / (whole * whole)).toBeCloseTo(0.25, 8);
    expect(smallestPositive).toBeGreaterThanOrEqual(zero);
    expect(unavailable).not.toBe(zero);
  });

  it("keeps temporal height linear, zero on the plane, and null as a gap", () => {
    expect(temporalHeight(0, 20)).toBe(0);
    expect(temporalHeight(5, 20)).toBe(0.25);
    expect(temporalHeight(10, 20)).toBe(0.5);
    expect(temporalHeight(20, 20)).toBe(1);
    expect(temporalHeight(null, 20)).toBeNull();
  });

  it("uses linear paise width while preserving sign and a true zero", () => {
    const half = capitalFlowWidth(50_000, 100_000, 20);
    const whole = capitalFlowWidth(100_000, 100_000, 20);
    const overspend = capitalFlowWidth(-25_000, 100_000, 20);
    const zero = capitalFlowWidth(0, 100_000, 20);

    expect(half).toEqual({ width: 10, direction: 1 });
    expect(whole).toEqual({ width: 20, direction: 1 });
    expect(overspend).toEqual({ width: 5, direction: -1 });
    expect(zero).toEqual({ width: 0, direction: 0 });
  });

  it("creates stable IDs from semantic keys rather than presentation labels", () => {
    expect(
      spatialId("operations", "comparison.projects_created", "current", "day-2", "orb")
    ).toBe("operations:comparison.projects_created:current:day-2:orb");
  });
});

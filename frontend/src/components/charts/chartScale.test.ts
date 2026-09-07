import { describe, expect, it } from "vitest";

import {
  barPath,
  clamp,
  compactNumber,
  compactPaise,
  labelFits,
  linearScale,
  niceTicks
} from "./chartScale";

describe("chart scale", () => {
  it("maps a domain onto a range and centres a zero-width domain", () => {
    const scale = linearScale(0, 100, 0, 200);
    expect(scale(0)).toBe(0);
    expect(scale(50)).toBe(100);
    expect(scale(100)).toBe(200);
    expect(linearScale(5, 5, 0, 40)(5)).toBe(20);
  });

  it("rounds axis ticks to readable steps that always cover the maximum", () => {
    for (const maximum of [1, 3, 7, 23, 62, 148, 1284, 573_48_000]) {
      const ticks = niceTicks(maximum);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(maximum);
      const step = ticks[1] - ticks[0];
      for (let index = 1; index < ticks.length; index += 1) {
        expect(ticks[index] - ticks[index - 1]).toBeCloseTo(step, 6);
      }
    }
  });

  it("never returns a single-tick axis, including for a zero or negative maximum", () => {
    expect(niceTicks(0).length).toBeGreaterThan(1);
    expect(niceTicks(-4).length).toBeGreaterThan(1);
    expect(niceTicks(Number.NaN).length).toBeGreaterThan(1);
  });

  it("rounds only the data-end of a bar and leaves the baseline end square", () => {
    const horizontal = barPath(0, 0, 100, 20, 4, "horizontal");
    /* Two arcs, both at the far end; the baseline corners stay as line joins. */
    expect(horizontal.match(/A/g)).toHaveLength(2);
    expect(horizontal.startsWith("M0 0")).toBe(true);

    const vertical = barPath(0, 10, 20, 40, 4, "vertical");
    expect(vertical.match(/A/g)).toHaveLength(2);

    /* A radius larger than the mark is clamped rather than inverting the path. */
    expect(barPath(0, 0, 3, 6, 12, "horizontal")).toContain("A3 3");
    expect(barPath(0, 0, 0, 20, 4, "horizontal")).toBe("");
    expect(barPath(0, 0, 100, 0, 4, "horizontal")).toBe("");
  });

  it("only fits a label that clears the mark with padding on both sides", () => {
    expect(labelFits("62", 120, 12)).toBe(true);
    expect(labelFits("₹1,63,40,000.00", 60, 12)).toBe(false);
    expect(labelFits("", 0, 12)).toBe(false);
  });

  it("compacts only values large enough to need it", () => {
    expect(compactNumber(148)).toBe("148");
    expect(compactNumber(1284)).toBe("1,284");
    expect(compactNumber(12_840)).toMatch(/K$/);
    expect(compactPaise(250_000)).toBe("₹2,500");
    expect(compactPaise(573_48_00_000)).toMatch(/^₹/);
  });

  it("clamps to the given bounds", () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

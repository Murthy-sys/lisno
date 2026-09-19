import {
  containedImageRect,
  normalizedPointToSourcePixels,
  normalizedPointToViewport,
  sourcePixelPointToNormalized,
  viewportPointToNormalized
} from "./coordinates";

describe("native annotation coordinates", () => {
  it("fits a source image inside a letterboxed viewport", () => {
    expect(
      containedImageRect(
        { width: 2_000, height: 1_000 },
        { x: 10, y: 20, width: 300, height: 300 }
      )
    ).toEqual({ x: 10, y: 95, width: 300, height: 150 });
  });

  it("round-trips normalized coordinates through pan and zoom", () => {
    const image = { x: 10, y: 95, width: 300, height: 150 };
    const transform = { zoom: 2.25, panX: -0.08, panY: 0.12 };
    const normalized = { x: 0.23, y: 0.71 };

    const viewport = normalizedPointToViewport(normalized, image, transform);
    expect(viewportPointToNormalized(viewport, image, transform)).toEqual(normalized);
  });

  it("distinguishes letterbox misses from clamped drawing input", () => {
    const image = { x: 10, y: 95, width: 300, height: 150 };
    expect(viewportPointToNormalized({ x: 100, y: 40 }, image, undefined, false)).toBeNull();
    expect(viewportPointToNormalized({ x: 100, y: 40 }, image)).toEqual({
      x: 0.3,
      y: 0
    });
  });

  it("round-trips normalized coordinates through source pixels", () => {
    const source = { width: 2_000, height: 1_000 };
    const normalized = { x: 0.35, y: 0.4 };
    expect(
      sourcePixelPointToNormalized(normalizedPointToSourcePixels(normalized, source), source)
    ).toEqual(normalized);
  });

  it("rejects invalid image geometry and non-finite input", () => {
    expect(() =>
      containedImageRect(
        { width: 0, height: 100 },
        { x: 0, y: 0, width: 100, height: 100 }
      )
    ).toThrow("positive");
    expect(() =>
      viewportPointToNormalized(
        { x: Number.NaN, y: 2 },
        { x: 0, y: 0, width: 100, height: 100 }
      )
    ).toThrow("finite");
  });
});

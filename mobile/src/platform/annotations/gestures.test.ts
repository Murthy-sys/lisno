import { containedImageRect, normalizedPointToViewport, viewportPointToNormalized } from "./coordinates";
import { IDENTITY_VIEW, panByViewportDelta, pinchViewTransform, zoomAtViewportPoint } from "./gestures";

describe("annotation touch transforms", () => {
  const source = { width: 2400, height: 800 };
  const landscape = containedImageRect(source, { x: 0, y: 0, width: 320, height: 480 });

  it("keeps the same mark under a pinch focus on a non-square page", () => {
    const mark = { x: 0.7, y: 0.35 };
    const focus = normalizedPointToViewport(mark, landscape);
    const transform = zoomAtViewportPoint(IDENTITY_VIEW, 2.4, focus, landscape);
    const positioned = normalizedPointToViewport(mark, landscape, transform);
    expect(positioned.x).toBeCloseTo(focus.x, 2);
    expect(positioned.y).toBeCloseTo(focus.y, 2);
    const restored = viewportPointToNormalized(focus, landscape, transform)!;
    expect(restored.x).toBeCloseTo(mark.x, 5);
    expect(restored.y).toBeCloseTo(mark.y, 5);
  });

  it("converts one-finger pan in viewport pixels into normalized page translation", () => {
    const zoomed = zoomAtViewportPoint(IDENTITY_VIEW, 2, { x: 160, y: 240 }, landscape);
    const panned = panByViewportDelta(zoomed, { x: 40, y: -10 }, landscape);
    const center = normalizedPointToViewport({ x: 0.5, y: 0.5 }, landscape, panned);
    expect(center.x).toBeCloseTo(200);
    expect(center.y).toBeCloseTo(230);
  });

  it("combines two-finger span and midpoint changes without accumulating drift", () => {
    const initial = [{ x: 100, y: 220 }, { x: 220, y: 220 }] as const;
    const current = [{ x: 80, y: 210 }, { x: 240, y: 230 }] as const;
    const first = pinchViewTransform(IDENTITY_VIEW, initial, current, landscape);
    const repeated = pinchViewTransform(IDENTITY_VIEW, initial, current, landscape);
    expect(first).toEqual(repeated);
    expect(first.zoom).toBeGreaterThan(1);
    expect(first.zoom).toBeLessThanOrEqual(5);
  });

  it("retains source coordinates after a viewport rotation and layout change", () => {
    const mark = { x: 0.31, y: 0.82 };
    const rotated = containedImageRect(source, { x: 0, y: 0, width: 720, height: 300 });
    const transform = zoomAtViewportPoint(IDENTITY_VIEW, 2, { x: 160, y: 240 }, landscape);
    expect(viewportPointToNormalized(normalizedPointToViewport(mark, landscape, transform), landscape, transform)).toEqual(mark);
    expect(viewportPointToNormalized(normalizedPointToViewport(mark, rotated, transform), rotated, transform)).toEqual(mark);
  });
});

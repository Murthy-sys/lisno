import { readFileSync } from "node:fs";
import path from "node:path";

import { StartupLetter, StartupSymbol, startupLetterMetrics, type StartupLetterName } from "./StartupLogo";
import { startupTheme } from "./startupTheme.js";

const original = readFileSync(path.resolve(__dirname, "../../../frontend/public/lisno-logo.svg"), "utf8");
const originalPaths = [...original.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1]);
const letters: readonly StartupLetterName[] = ["L", "I", "S", "N", "O"];

describe("original startup logo geometry", () => {
  it("renders all eleven original symbol paths in the splash color without accessible descendants", () => {
    const svg = StartupSymbol({ size: 72 });
    expect(svg.props.children.map((shape: { props: { d: string } }) => shape.props.d)).toEqual(originalPaths.slice(0, 11));
    expect(svg.props).toMatchObject({
      width: 72,
      height: 72,
      viewBox: "3 3 23 23",
      fill: startupTheme.ink,
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants"
    });
  });

  it.each(letters)("keeps the original %s path and common baseline when scaled independently", (letter) => {
    const metrics = startupLetterMetrics[letter];
    const svg = StartupLetter({ letter, height: 40.1 });
    const [left, top, width, height] = svg.props.viewBox.split(" ").map(Number);
    expect(svg.props.children.props.d).toBe(originalPaths[11 + letters.indexOf(letter)]);
    expect(top).toBe(4.59);
    expect(height).toBe(20.05);
    expect(width).toBe(metrics.width);
    expect(left).toBeGreaterThan(40);
    expect(svg.props.width).toBeCloseTo(metrics.width * 2);
    expect(svg.props).toMatchObject({
      fill: startupTheme.ink,
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants"
    });
  });
});

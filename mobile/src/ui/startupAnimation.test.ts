import { startupDuration, startupFrame, startupLayout, startupMotifPosition } from "./startupAnimation";

describe("startup choreography", () => {
  it("keeps the center empty until every motif has converged", () => {
    const initial = startupFrame(0);
    expect(initial.symbol.opacity).toBe(0);
    expect(initial.letters.every((letter) => letter.opacity === 0)).toBe(true);
    expect(initial.motifs.every((motif) => Math.hypot(motif.x, motif.y) > 1.4)).toBe(true);
    const orbit = startupFrame(800);
    expect(orbit.motifs[0]!.rotation).toBeGreaterThan(0);
    expect(orbit.motifs[0]!.x).not.toBeCloseTo(initial.motifs[0]!.x);
    const converged = startupFrame(1500);
    for (const motif of converged.motifs) {
      expect(Math.hypot(motif.x, motif.y)).toBe(0);
      expect(motif.opacity).toBe(0);
    }
    expect(converged.symbol.opacity).toBe(0);
    expect(startupFrame(1600).symbol.opacity).toBeGreaterThan(0);
  });

  it("reveals the symbol before moving it, then emits each letter", () => {
    const revealed = startupFrame(1900);
    expect(revealed.symbol).toEqual({ opacity: 1, scale: 1, shift: 0 });
    expect(revealed.letters.every((letter) => letter.opacity === 0)).toBe(true);
    expect(startupFrame(2200).symbol.shift).toBe(1);
    const emission = startupFrame(2300).letters;
    expect(emission[0]!.travel).toBeGreaterThan(emission[1]!.travel);
    expect(emission[1]!.travel).toBeGreaterThan(emission[2]!.travel);
    expect(emission[4]!.opacity).toBe(0);
    const settled = startupFrame(startupDuration);
    expect(settled.symbol).toEqual({ opacity: 1, scale: 1, shift: 1 });
    expect(settled.letters.every((letter) => letter.opacity === 1 && letter.travel === 1)).toBe(true);
  });

  it.each([[320, 568, 26], [390, 844, 26], [640, 360, 26], [320, 360, 104]])("keeps every complete raster inside a %i × %i composition with a %i dp message", (width, height, messageHeight) => {
    const layout = startupLayout(width, height, messageHeight);
    for (let time = 0; time <= startupDuration; time += 5) {
      for (const motif of startupFrame(time).motifs) {
        const position = startupMotifPosition(motif, layout.width, layout.height, layout.motifSize);
        expect(Math.abs(position.x) + position.halfExtent).toBeLessThan(layout.width / 2);
        expect(Math.abs(position.y) + position.halfExtent).toBeLessThan(layout.height / 2);
      }
    }
  });
});

import type { StartupMotifKind } from "./StartupArtwork";

export const startupDuration = 3000;

export const startupMotifs: ReadonlyArray<{ kind: StartupMotifKind; angle: number }> = [
  { kind: "interior", angle: -135 },
  { kind: "plan", angle: -45 },
  { kind: "materials", angle: 135 },
  { kind: "tools", angle: 45 }
];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const out = (value: number) => 1 - (1 - clamp(value)) ** 3;
const inOut = (value: number) => {
  const t = clamp(value);
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
};

/** Normalized geometry is sampled once, then interpolated entirely by Animated. */
export function startupFrame(milliseconds: number) {
  const convergence = inOut((milliseconds - 800) / 700);
  const rotation = 95 * clamp(milliseconds / 1500);
  const reveal = out((milliseconds - 1500) / 400);
  return {
    motifs: startupMotifs.map(({ angle }) => {
      const radians = (angle + rotation) * Math.PI / 180;
      return {
        x: Math.max(-1, Math.min(1, Math.cos(radians) * Math.SQRT2)) * (1 - convergence),
        y: Math.max(-1, Math.min(1, Math.sin(radians) * Math.SQRT2)) * (1 - convergence),
        rotation: rotation * 1.15,
        scale: 1 - convergence * 0.98,
        opacity: 1 - clamp((milliseconds - 1400) / 100)
      };
    }),
    symbol: {
      opacity: clamp((milliseconds - 1500) / 190),
      scale: 0.14 + 0.86 * reveal,
      shift: inOut((milliseconds - 1900) / 300)
    },
    letters: Array.from({ length: 5 }, (_, index) => {
      const localTime = milliseconds - 2200 - index * 50;
      return {
        travel: out(localTime / 400),
        opacity: clamp(localTime / 120)
      };
    })
  };
}

/** The complete rotated square, including foliage, stays inside the composition. */
export function startupMotifPosition(
  frame: ReturnType<typeof startupFrame>["motifs"][number],
  width: number,
  height: number,
  size: number
) {
  const radians = frame.rotation * Math.PI / 180;
  const halfExtent = size / 2 * frame.scale * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
  return {
    x: frame.x * Math.max(0, width / 2 - halfExtent - 8),
    y: frame.y * Math.max(0, height / 2 - halfExtent - 8),
    halfExtent
  };
}

export function startupLayout(width: number, height: number, messageHeight: number) {
  const artworkWidth = Math.max(0, Math.min(560, width - 24));
  const artworkHeight = Math.max(0, Math.min(artworkWidth * 1.6, height - messageHeight - 92));
  return {
    width: artworkWidth,
    height: artworkHeight,
    motifSize: Math.min(220, artworkWidth * 0.46, artworkHeight * 0.46),
    brandSize: Math.min(360, artworkWidth, artworkHeight * 1.4)
  };
}

// 25 ms sampling preserves curved paths/easing without JS work on animation frames.
export const startupKeyframes = Array.from({ length: startupDuration / 25 + 1 }, (_, i) => ({
  time: i * 25,
  frame: startupFrame(i * 25)
}));

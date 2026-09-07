/* Scale, tick and path maths shared by every chart. Pure functions, no DOM. */

export interface Scale {
  (value: number): number;
  domainMin: number;
  domainMax: number;
}

export function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number
): Scale {
  const span = domainMax - domainMin;
  const scale = ((value: number) =>
    span === 0
      ? rangeMin + (rangeMax - rangeMin) / 2
      : rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin)) as Scale;
  scale.domainMin = domainMin;
  scale.domainMax = domainMax;
  return scale;
}

/** Round a maximum up to a readable tick step (1 / 2 / 2.5 / 5 × a power of ten). */
export function niceTicks(maximum: number, targetCount = 4): number[] {
  if (!Number.isFinite(maximum) || maximum <= 0) return [0, 1];
  const rawStep = maximum / Math.max(1, targetCount);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) *
    magnitude;
  /* Ticks run past the maximum, never short of it: the top of the axis has to
   * be able to hold the tallest mark. */
  const ticks: number[] = [0];
  while (ticks[ticks.length - 1] < maximum) {
    ticks.push(Number((ticks.length * step).toFixed(10)));
  }
  if (ticks.length < 2) ticks.push(step);
  return ticks;
}

export interface Point {
  x: number;
  y: number;
}

export const linePath = (points: Point[]) =>
  points.map((point, index) => `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`).join(" ");

export const areaPath = (points: Point[], baseline: number) =>
  points.length === 0
    ? ""
    : `${linePath(points)} L${round(points[points.length - 1].x)} ${round(baseline)} L${round(points[0].x)} ${round(baseline)} Z`;

/**
 * A bar with its data-end rounded and its baseline end square. Drawn as an
 * explicit path so the two ends can differ; `rx` on a <rect> cannot do that.
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  orientation: "horizontal" | "vertical"
) {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  if (safeWidth === 0 || safeHeight === 0) return "";
  if (orientation === "horizontal") {
    const r = Math.max(0, Math.min(radius, safeWidth, safeHeight / 2));
    return [
      `M${round(x)} ${round(y)}`,
      `H${round(x + safeWidth - r)}`,
      `A${r} ${r} 0 0 1 ${round(x + safeWidth)} ${round(y + r)}`,
      `V${round(y + safeHeight - r)}`,
      `A${r} ${r} 0 0 1 ${round(x + safeWidth - r)} ${round(y + safeHeight)}`,
      `H${round(x)}`,
      "Z"
    ].join(" ");
  }
  const r = Math.max(0, Math.min(radius, safeHeight, safeWidth / 2));
  return [
    `M${round(x)} ${round(y + safeHeight)}`,
    `V${round(y + r)}`,
    `A${r} ${r} 0 0 1 ${round(x + r)} ${round(y)}`,
    `H${round(x + safeWidth - r)}`,
    `A${r} ${r} 0 0 1 ${round(x + safeWidth)} ${round(y + r)}`,
    `V${round(y + safeHeight)}`,
    "Z"
  ].join(" ");
}

const round = (value: number) => Math.round(value * 100) / 100;

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en-IN");

/** Axis ticks and dense labels; full values always stay in the table view. */
export const compactNumber = (value: number) =>
  Math.abs(value) >= 10_000 ? compact.format(value) : plain.format(value);

/* Money compacts later than counts: four digits of rupees still read cleanly. */
export const compactPaise = (value: number) => {
  const rupees = value / 100;
  return Math.abs(rupees) >= 10_000
    ? `₹${compact.format(rupees)}`
    : `₹${plain.format(Math.round(rupees))}`;
};

/**
 * Whether a label fits inside a mark. Estimated from the average advance width
 * of the interface face at the given size, so labels are never clipped.
 */
export const labelFits = (text: string, available: number, fontSize: number, padding = 12) =>
  text.length * fontSize * 0.58 + padding * 2 <= available;

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

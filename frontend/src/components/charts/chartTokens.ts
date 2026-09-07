/*
 * Chart colour roles.
 *
 * Every value here is a reference to a token in tokens.css; no chart component
 * carries a literal hex. The categorical order is the colourblind-safety
 * mechanism, not a cosmetic choice: slots are assigned in sequence and never
 * cycled. The eight slots were validated against the #ffffff app surface
 * (OKLCH lightness band, chroma floor, protan/deutan separation, normal-vision
 * separation, contrast). Slots 4 and 5 sit below 3:1 on white, so every chart
 * that can reach them ships the relief channel: visible labels plus the table
 * view that ChartFigure always renders.
 */

export const CHART_SERIES_SLOTS = 8;

/** Categorical identity. Assign in order; fold a ninth series into "Other". */
export const seriesColor = (index: number) =>
  `var(--chart-series-${(index % CHART_SERIES_SLOTS) + 1})`;

/** Ordinal position in a sequence (funnel stages, tiers). One hue, light to dark. */
export const ORDINAL_STEPS = 6;
export const ordinalColor = (index: number, count: number) => {
  const span = Math.max(1, Math.min(count, ORDINAL_STEPS));
  const step = span === 1 ? ORDINAL_STEPS : Math.round((index / (span - 1)) * (ORDINAL_STEPS - 1));
  return `var(--chart-ordinal-${Math.min(ORDINAL_STEPS, step + 1)})`;
};

/** Magnitude on a continuous scale; the same one-hue ramp, addressed by share. */
export const sequentialColor = (share: number) =>
  `var(--chart-ordinal-${Math.min(ORDINAL_STEPS, Math.max(1, Math.ceil(Math.min(1, Math.max(0, share)) * ORDINAL_STEPS) || 1))})`;

export type ChartStatus = "good" | "warning" | "serious" | "critical" | "neutral";

/** Reserved state colours. Never used for "series 4"; always with a label. */
export const statusColor = (status: ChartStatus) => `var(--chart-status-${status})`;

export const CHART_SURFACE = "var(--chart-surface)";
export const CHART_GRID = "var(--chart-grid)";
export const CHART_AXIS = "var(--chart-axis)";
export const CHART_TRACK = "var(--chart-track)";
export const CHART_DE_EMPHASIS = "var(--chart-de-emphasis)";

/** The 2px surface gap that separates touching marks. */
export const SURFACE_GAP = 2;

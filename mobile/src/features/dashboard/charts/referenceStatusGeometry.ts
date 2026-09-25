import type { StageDatum } from "./types";

const lifecycleKeys = [
  { key: "planning", label: "Planning" },
  { key: "active", label: "Active" },
  { key: "onHold", label: "On hold" },
  { key: "completed", label: "Completed" }
] as const;

const costKeys = [
  { key: "procurementCostPaise", label: "Procurement" },
  { key: "employeePaymentPaise", label: "Employee payments" },
  { key: "otherExpensePaise", label: "Other expenses" },
  { key: "overheadPaise", label: "Overheads" }
] as const;

export interface ReferenceStage {
  readonly id: string;
  readonly label: string;
  readonly value: number | null;
  readonly displayValue: string;
}

function canonicalStages(
  values: readonly StageDatum[],
  categories: readonly { readonly key: string; readonly label: string }[],
  allowNegative: boolean
): readonly ReferenceStage[] {
  return categories.map(({ key, label }) => {
    const source = values.find((value) => value.id.split(".").at(-1) === key);
    const available = source?.available !== false && typeof source?.value === "number"
      && Number.isSafeInteger(source.value) && (allowNegative || source.value >= 0);
    return {
      id: key,
      label,
      value: available ? source.value : null,
      displayValue: available ? source.displayValue : "Not available"
    };
  });
}

function snapshotUnavailable(centerDisplay: string): boolean {
  return /partial|not available|unavailable/i.test(centerDisplay);
}

export function buildProjectLandscapeModel(values: readonly StageDatum[], centerDisplay: string) {
  const stages = canonicalStages(values, lifecycleKeys, false);
  const known = stages.filter((stage) => stage.value !== null);
  const maximum = Math.max(0, ...known.map((stage) => stage.value ?? 0));
  const total = known.reduce((sum, stage) => sum + (stage.value ?? 0), 0);
  const complete = known.length === stages.length && Number.isSafeInteger(total)
    && !snapshotUnavailable(centerDisplay);
  const leaders = maximum > 0 ? known.filter((stage) => stage.value === maximum) : [];
  let title = "Some project counts are unavailable";
  let detail = "Known counts remain visible; unavailable states are marked below.";
  if (complete && maximum === 0) {
    title = "No projects recorded";
    detail = "Every lifecycle state currently has zero projects.";
  } else if (complete && leaders.length === stages.length) {
    title = "Project counts are evenly distributed";
    detail = "Each lifecycle state has the same number of projects.";
  } else if (complete && leaders.length === 1) {
    title = `${leaders[0]!.label} has the most projects`;
    detail = `${leaders[0]!.displayValue} of ${total.toLocaleString("en-IN")} projects in this state.`;
  } else if (complete) {
    title = `${leaders.map((stage) => stage.label).join(" and ")} share the largest count`;
    detail = "Current project counts by lifecycle state.";
  }
  return {
    stages: stages.map((stage) => ({
      ...stage,
      heightRatio: maximum > 0 && stage.value !== null ? stage.value / maximum : 0
    })),
    complete,
    title,
    detail
  };
}

export function buildCostGaugeModel(values: readonly StageDatum[], centerDisplay: string) {
  const stages = canonicalStages(values, costKeys, true);
  const complete = stages.every((stage) => stage.value !== null) && !snapshotUnavailable(centerDisplay);
  const total = stages.reduce((sum, stage) => sum + (stage.value ?? 0), 0);
  const hasSignedValues = stages.some((stage) => stage.value !== null && stage.value < 0);
  const safeTotal = Number.isSafeInteger(total);
  const canShowShare = complete && safeTotal && !hasSignedValues && total > 0;
  const largest = canShowShare
    ? stages.reduce((current, stage) => (stage.value ?? 0) > (current.value ?? 0) ? stage : current)
    : null;
  const share = largest && largest.value !== null ? largest.value / total : null;
  const tied = largest ? stages.filter((stage) => stage.value === largest.value).length > 1 : false;
  const reason = !complete
    ? "Share unavailable while recorded costs are incomplete."
    : !safeTotal
      ? "Share unavailable for this recorded cost total."
      : hasSignedValues
        ? "Share unavailable because costs include negative adjustments."
        : total === 0
          ? "No recorded cost across these categories."
          : null;
  return { stages, share, largest, tied, reason };
}

/** A single smooth category hill; a zero amount never creates an artificial bump. */
export function landscapeHillPath(center: number, base: number, peakHeight: number, halfWidth = 72): string {
  return `M ${center - halfWidth} ${base} C ${center - halfWidth * 0.45} ${base} ${center - halfWidth * 0.43} ${base - peakHeight} ${center} ${base - peakHeight} C ${center + halfWidth * 0.43} ${base - peakHeight} ${center + halfWidth * 0.45} ${base} ${center + halfWidth} ${base} Z`;
}

export function gaugePoint(angle: number, radius: number): { readonly x: number; readonly y: number } {
  const radians = angle * Math.PI / 180;
  return { x: 90 + radius * Math.cos(radians), y: 90 + radius * Math.sin(radians) };
}

export function gaugeArcPath(share: number): string {
  const start = gaugePoint(135, 75);
  const end = gaugePoint(135 + 270 * share, 75);
  return `M ${start.x} ${start.y} A 75 75 0 ${share > 2 / 3 ? 1 : 0} 1 ${end.x} ${end.y}`;
}

/** Dependency-free configuration shared by the API and unsaved UI previews. */
export const WORKFLOW_TIMELINES_ID = "organization";
export const WORKFLOW_TIMELINE_MIN_DAYS = 1;
export const WORKFLOW_TIMELINE_MAX_DAYS = 3650;
export const WORKFLOW_TIMELINE_PERCENTAGES = [0, 5, 10, 15, 20, 25, 30] as const;
export const WORKFLOW_TIMELINE_BANDS = [
  { id: "below_10_lakh", label: "Below ₹10,00,000" },
  { id: "10_to_15_lakh", label: "₹10,00,000 to below ₹15,00,000" },
  { id: "15_to_20_lakh", label: "₹15,00,000 to below ₹20,00,000" },
  { id: "20_to_25_lakh", label: "₹20,00,000 to ₹25,00,000" }
] as const;

export type WorkflowTimelineBandId = typeof WORKFLOW_TIMELINE_BANDS[number]["id"];
export type WorkflowTimelinePercent = typeof WORKFLOW_TIMELINE_PERCENTAGES[number];
export interface WorkflowTimelineBase {
  bandId: WorkflowTimelineBandId;
  designWorkdays: number;
  executionWorkdays: number;
}
export interface WorkflowTimelineRow {
  bandId: WorkflowTimelineBandId;
  workdays: number[];
}
export interface WorkflowTimelineMatrices {
  design: WorkflowTimelineRow[];
  execution: WorkflowTimelineRow[];
}
export interface WorkflowTimelineConfigurationRecord {
  version: number;
  bases: WorkflowTimelineBase[];
  createdAt: string;
  updatedAt: string;
  updatedById: string;
}
export interface WorkflowTimelineConfiguration {
  version: number;
  bases: WorkflowTimelineBase[];
  matrices: WorkflowTimelineMatrices;
  createdAt: string | null;
  updatedAt: string | null;
  updatedById: string | null;
}
export interface UpdateWorkflowTimelines {
  expectedVersion: number;
  bases: WorkflowTimelineBase[];
}

export function isWorkflowTimelineBaseDays(value: number): boolean {
  return Number.isSafeInteger(value) && value >= WORKFLOW_TIMELINE_MIN_DAYS && value <= WORKFLOW_TIMELINE_MAX_DAYS;
}

export function calculateWorkflowWorkdays(baseWorkdays: number, customPercent: WorkflowTimelinePercent): number {
  if (!isWorkflowTimelineBaseDays(baseWorkdays) || !WORKFLOW_TIMELINE_PERCENTAGES.includes(customPercent)) {
    throw new RangeError("Use valid base workdays and a supported Custom percentage.");
  }
  return Math.ceil(baseWorkdays * (100 + 2 * customPercent) / 100);
}

export function calculateWorkflowTimelines(bases: readonly WorkflowTimelineBase[]): WorkflowTimelineMatrices {
  if (bases.length !== WORKFLOW_TIMELINE_BANDS.length || new Set(bases.map(base => base.bandId)).size !== bases.length) {
    throw new RangeError("Provide each project-value band exactly once.");
  }
  const ordered = WORKFLOW_TIMELINE_BANDS.map(band => {
    const base = bases.find(row => row.bandId === band.id);
    if (!base) throw new RangeError("Provide each project-value band exactly once.");
    return base;
  });
  return {
    design: ordered.map(base => ({ bandId: base.bandId, workdays: WORKFLOW_TIMELINE_PERCENTAGES.map(percent => calculateWorkflowWorkdays(base.designWorkdays, percent)) })),
    execution: ordered.map(base => ({ bandId: base.bandId, workdays: WORKFLOW_TIMELINE_PERCENTAGES.map(percent => calculateWorkflowWorkdays(base.executionWorkdays, percent)) }))
  };
}

export function defaultWorkflowTimelines(): WorkflowTimelineConfiguration {
  const design = [15, 20, 25, 30];
  const execution = [40, 50, 70, 80];
  const bases = WORKFLOW_TIMELINE_BANDS.map((band, index) => ({ bandId: band.id, designWorkdays: design[index], executionWorkdays: execution[index] }));
  return { version: 0, bases, matrices: calculateWorkflowTimelines(bases), createdAt: null, updatedAt: null, updatedById: null };
}

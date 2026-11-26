import { WORKFLOW_TIMELINE_BANDS, WORKFLOW_TIMELINE_MIN_DAYS, WORKFLOW_TIMELINE_MAX_DAYS } from "../contracts/workflow-timelines.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const bandId = { type: "string", enum: WORKFLOW_TIMELINE_BANDS.map(band => band.id) };
const days = { type: "integer", minimum: WORKFLOW_TIMELINE_MIN_DAYS, maximum: WORKFLOW_TIMELINE_MAX_DAYS };
const version = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const date = { type: "string", format: "date-time", nullable: true };
const bases = {
  type: "array", minItems: 4, maxItems: 4, uniqueItems: true,
  description: "Complete set of four bands, each bandId exactly once. Only base workdays are saved.",
  items: ref("WorkflowTimelineBase")
};
const rows = { type: "array", minItems: 4, maxItems: 4, items: ref("WorkflowTimelineRow") };

export const WORKFLOW_TIMELINE_SCHEMAS = {
  WorkflowTimelineBase: object({ bandId, designWorkdays: days, executionWorkdays: days }),
  UpdateWorkflowTimelines: object({ expectedVersion: { ...version, maximum: Number.MAX_SAFE_INTEGER - 1 }, bases }),
  WorkflowTimelineRow: object({ bandId, workdays: {
    type: "array", minItems: 7, maxItems: 7,
    description: "Workdays at Custom-value shares 0%, 5%, 10%, 15%, 20%, 25%, 30%, in that order; ceil(base × (100 + 2 × percent) / 100).",
    items: { type: "integer", minimum: 1, maximum: 5840 }
  } }),
  WorkflowTimelineConfiguration: {
    ...object({ version, bases, matrices: object({ design: rows, execution: rows }), createdAt: date, updatedAt: date, updatedById: { type: "string", nullable: true } }),
    description: "Global Super Admin timeline scenarios. Version 0 is the unsaved default with null metadata. Saving never modifies project dates or approved estimates. Stale expectedVersion returns HTTP 409."
  }
};

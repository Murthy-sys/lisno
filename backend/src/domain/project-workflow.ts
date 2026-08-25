import type { Role } from "./roles.js";

export const DESIGN_PLAN_STATUSES = [
  "pending_assignment",
  "assigned",
  "in_progress",
  "ready_for_client",
  "changes_requested",
  "approved"
] as const;

export type DesignPlanStatus = (typeof DESIGN_PLAN_STATUSES)[number];

export const PROJECT_WORKFLOW_TASK_KINDS = [
  "design_plan_upload",
  "procurement",
  "finance",
  "site_execution",
  "trade_execution"
] as const;

export type ProjectWorkflowTaskKind =
  (typeof PROJECT_WORKFLOW_TASK_KINDS)[number];

export const PROJECT_WORKFLOW_TASK_STATUSES = [
  "open",
  "in_progress",
  "completed"
] as const;

export type ProjectWorkflowTaskStatus =
  (typeof PROJECT_WORKFLOW_TASK_STATUSES)[number];

export interface EstimateWorkflowLine {
  catalogueId: string;
  roomName: string;
  specification: string;
  unit: string;
  quantity: number;
  amount: number;
  included: boolean;
}

export interface WorkflowTaskBlueprint {
  dedupeKey: string;
  kind: ProjectWorkflowTaskKind;
  assigneeRole: Role;
  title: string;
  description: string;
  sourceSectionId: string | null;
  sourceLineItemKey: string | null;
  roomName: string | null;
}

const SECTION_LABELS: Readonly<Record<string, string>> = {
  FC: "False Ceiling",
  FL: "Flooring",
  LF: "Loose Furniture",
  CA: "Carpentry",
  CV: "Civil & Plumbing",
  EL: "Electrical",
  PA: "Painting"
};

/**
 * The estimate catalogue currently combines Civil and Plumbing under CV, so
 * execution ownership must be resolved at catalogue-row level rather than by
 * the user-facing section label.
 */
export function workerRoleForCatalogueId(catalogueId: string): Role {
  const normalized = catalogueId.trim().toUpperCase();
  if (normalized.startsWith("CA") || normalized.startsWith("LF")) {
    return "worker_carpenter";
  }
  if (normalized.startsWith("EL")) return "worker_electrician";
  if (normalized.startsWith("PA")) return "worker_painter";
  if (["CV02", "CV03", "CV04"].includes(normalized)) {
    return "worker_plumber";
  }
  if (
    normalized.startsWith("CV") ||
    normalized.startsWith("FL") ||
    normalized === "FC01" ||
    normalized === "FC02"
  ) {
    return "worker_civil";
  }
  return "worker_other";
}

export function projectWorkflowBlueprints(input: {
  estimateId: string;
  lineItems: readonly EstimateWorkflowLine[];
}): WorkflowTaskBlueprint[] {
  const included = input.lineItems.filter((line) => line.included);
  const sectionIds = [
    ...new Set(
      included.map((line) => line.catalogueId.trim().toUpperCase().slice(0, 2))
    )
  ].sort();
  const sectionSummary = sectionIds
    .map((id) => SECTION_LABELS[id] ?? id)
    .join(", ");
  const blueprints: WorkflowTaskBlueprint[] = [
    {
      dedupeKey: `${input.estimateId}:procurement`,
      kind: "procurement",
      assigneeRole: "procurement",
      title: "Prepare procurement plan",
      description: sectionSummary
        ? `Prepare materials and sourcing for: ${sectionSummary}.`
        : "Prepare materials and sourcing for the approved estimate.",
      sourceSectionId: null,
      sourceLineItemKey: null,
      roomName: null
    },
    {
      dedupeKey: `${input.estimateId}:finance`,
      kind: "finance",
      assigneeRole: "finance_head",
      title: "Open approved project budget",
      description: "Review the approved estimate and establish financial controls.",
      sourceSectionId: null,
      sourceLineItemKey: null,
      roomName: null
    },
    {
      dedupeKey: `${input.estimateId}:site`,
      kind: "site_execution",
      assigneeRole: "site_manager",
      title: "Plan site execution",
      description: sectionSummary
        ? `Coordinate execution for: ${sectionSummary}.`
        : "Coordinate execution for the approved design.",
      sourceSectionId: null,
      sourceLineItemKey: null,
      roomName: null
    }
  ];

  for (const line of included) {
    const catalogueId = line.catalogueId.trim().toUpperCase();
    const sectionId = catalogueId.slice(0, 2) || "OTHER";
    const sourceLineItemKey = `${line.roomName.trim()}::${catalogueId}`;
    blueprints.push({
      dedupeKey: `${input.estimateId}:trade:${encodeURIComponent(sourceLineItemKey)}`,
      kind: "trade_execution",
      assigneeRole: workerRoleForCatalogueId(catalogueId),
      title: `${SECTION_LABELS[sectionId] ?? "Project"} · ${line.roomName}`,
      description: `${catalogueId} · ${line.specification} · ${line.quantity} ${line.unit}`,
      sourceSectionId: sectionId,
      sourceLineItemKey,
      roomName: line.roomName
    });
  }

  return blueprints;
}

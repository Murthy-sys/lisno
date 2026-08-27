import { createHash } from "node:crypto";

import { isWorkerRole, type Role, type WorkerRole } from "./roles.js";
import { approvedEstimateLineItemKey } from "./estimate-line-item.js";

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
  id?: string | null;
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
  dueInDays: number;
  plannedEffort: number;
}

export interface ProjectWorkflowSectionTask {
  id: string;
  projectId: string;
  estimateId: string;
  designPlanVersion: number;
  kind: "trade_execution";
  sourceSectionId: string;
  sourceLineItemKey: string;
  assigneeRole: WorkerRole;
  assigneeUserId: string | null;
  status: ProjectWorkflowTaskStatus;
  progress: number;
  version: number;
  plannedEffort: number | null;
  updatedAt: Date | string;
}

export interface ProjectWorkflowSectionAggregate {
  id: string;
  projectId: string;
  estimateId: string;
  designPlanVersion: number;
  sourceSectionId: string;
  sectionLabel: string;
  assigneeRole: WorkerRole;
  assignedWorkerId: string | null;
  assignmentState: "unassigned" | "assigned" | "mixed";
  status: ProjectWorkflowTaskStatus;
  progress: number;
  taskCount: number;
  unfinishedTaskCount: number;
  revision: string;
  updatedAt: Date;
  members: readonly ProjectWorkflowSectionTask[];
}

export class ProjectWorkflowSectionAssignmentConflict extends Error {
  constructor() {
    super("The workflow section assignment group is malformed.");
    this.name = "ProjectWorkflowSectionAssignmentConflict";
  }
}

export function projectWorkflowSectionAssignments(
  tasks: readonly ProjectWorkflowSectionTask[]
): ProjectWorkflowSectionAggregate[] {
  const taskIds = new Set<string>();
  const sourceLineItemKeys = new Set<string>();
  const groups = new Map<string, ProjectWorkflowSectionTask[]>();

  for (const task of tasks) {
    const id = exactWorkflowIdentity(task.id);
    const projectId = exactWorkflowIdentity(task.projectId);
    const estimateId = exactWorkflowIdentity(task.estimateId);
    const sourceSectionId = exactWorkflowSectionId(task.sourceSectionId);
    const sourceLineItemKey = exactWorkflowIdentity(task.sourceLineItemKey);
    if (
      task.kind !== "trade_execution" ||
      !Number.isSafeInteger(task.designPlanVersion) ||
      task.designPlanVersion < 1 ||
      typeof task.assigneeRole !== "string" ||
      !isWorkerRole(task.assigneeRole as Role) ||
      !PROJECT_WORKFLOW_TASK_STATUSES.includes(task.status) ||
      !Number.isSafeInteger(task.progress) ||
      task.progress < 0 ||
      task.progress > 100 ||
      !Number.isSafeInteger(task.version) ||
      task.version < 1 ||
      taskIds.has(id) ||
      sourceLineItemKeys.has(sourceLineItemKey)
    ) sectionAssignmentConflict();
    const assigneeUserId = task.assigneeUserId === null
      ? null
      : exactWorkflowIdentity(task.assigneeUserId);
    const updatedAt = storedWorkflowDate(task.updatedAt);
    const normalized: ProjectWorkflowSectionTask = {
      ...task,
      id,
      projectId,
      estimateId,
      sourceSectionId,
      sourceLineItemKey,
      assigneeRole: task.assigneeRole as WorkerRole,
      assigneeUserId,
      updatedAt
    };
    taskIds.add(id);
    sourceLineItemKeys.add(sourceLineItemKey);
    const groupKey = JSON.stringify([
      projectId,
      estimateId,
      task.designPlanVersion,
      sourceSectionId
    ]);
    const current = groups.get(groupKey) ?? [];
    current.push(normalized);
    groups.set(groupKey, current);
  }

  return [...groups.values()].map(sectionAggregate).sort((left, right) =>
    left.sectionLabel.localeCompare(right.sectionLabel) ||
    left.sourceSectionId.localeCompare(right.sourceSectionId)
  );
}

function sectionAggregate(
  unsortedMembers: readonly ProjectWorkflowSectionTask[]
): ProjectWorkflowSectionAggregate {
  const members = [...unsortedMembers].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const first = members[0];
  if (!first) sectionAssignmentConflict();
  if (members.some((member) =>
    member.projectId !== first.projectId ||
    member.estimateId !== first.estimateId ||
    member.designPlanVersion !== first.designPlanVersion ||
    member.sourceSectionId !== first.sourceSectionId ||
    member.assigneeRole !== first.assigneeRole
  )) sectionAssignmentConflict();

  const unfinished = members.filter((member) => member.status !== "completed");
  const assignmentMembers = unfinished.length > 0 ? unfinished : members;
  const assignmentIds = new Set(
    assignmentMembers.map((member) => member.assigneeUserId)
  );
  const [onlyAssignmentId] = assignmentIds;
  const assignmentState = assignmentIds.size === 1
    ? onlyAssignmentId === null
      ? "unassigned"
      : "assigned"
    : "mixed";
  const status = members.every((member) => member.status === "completed")
    ? "completed"
    : members.every((member) =>
        member.status === "open" && member.progress === 0
      )
      ? "open"
      : "in_progress";
  const weights = members.map((member) =>
    typeof member.plannedEffort === "number" &&
    Number.isFinite(member.plannedEffort) &&
    member.plannedEffort > 0
      ? member.plannedEffort
      : 1
  );
  const maximumWeight = Math.max(...weights);
  const totalWeight = weights.reduce(
    (total, weight) => total + weight / maximumWeight,
    0
  );
  const weightedProgress = members.reduce((total, member, index) =>
    total + (member.status === "completed" ? 100 : member.progress) *
      weights[index]! / maximumWeight,
  0) / totalWeight;
  const updatedAt = new Date(Math.max(...members.map((member) =>
    storedWorkflowDate(member.updatedAt).getTime()
  )));
  const identity = [
    first.projectId,
    first.estimateId,
    first.designPlanVersion,
    first.sourceSectionId
  ] as const;
  return {
    id: `workflow-section-${workflowSectionHash(identity)}`,
    projectId: first.projectId,
    estimateId: first.estimateId,
    designPlanVersion: first.designPlanVersion,
    sourceSectionId: first.sourceSectionId,
    sectionLabel: projectWorkflowSectionLabel(first.sourceSectionId),
    assigneeRole: first.assigneeRole,
    assignedWorkerId: assignmentState === "assigned"
      ? onlyAssignmentId ?? null
      : null,
    assignmentState,
    status,
    progress: Math.min(100, Math.max(0, Math.round(weightedProgress))),
    taskCount: members.length,
    unfinishedTaskCount: unfinished.length,
    revision: workflowSectionHash(
      members.map((member) => [member.id, member.version] as const)
    ),
    updatedAt,
    members
  };
}

function workflowSectionHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function exactWorkflowIdentity(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    sectionAssignmentConflict();
  }
  return value;
}

function exactWorkflowSectionId(value: unknown): string {
  const sectionId = exactWorkflowIdentity(value);
  if (sectionId !== sectionId.toUpperCase()) sectionAssignmentConflict();
  return sectionId;
}

function storedWorkflowDate(value: unknown): Date {
  if (value == null || value === "") sectionAssignmentConflict();
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) sectionAssignmentConflict();
  return date;
}

function sectionAssignmentConflict(): never {
  throw new ProjectWorkflowSectionAssignmentConflict();
}

/*
 * A workflow task needs a deadline and a planned effort for the shared KPI to
 * score it the same way a design task is scored. Neither is captured per line
 * item today, so each kind carries the standard turnaround the handoff assumes.
 */
export const WORKFLOW_TASK_SCHEDULE: Readonly<
  Record<ProjectWorkflowTaskKind, { dueInDays: number; plannedEffort: number }>
> = {
  design_plan_upload: { dueInDays: 5, plannedEffort: 12 },
  procurement: { dueInDays: 5, plannedEffort: 8 },
  finance: { dueInDays: 3, plannedEffort: 4 },
  site_execution: { dueInDays: 7, plannedEffort: 12 },
  trade_execution: { dueInDays: 10, plannedEffort: 6 }
};

export function workflowTaskDueAt(
  kind: ProjectWorkflowTaskKind,
  openedAt: Date
): Date {
  const due = new Date(openedAt);
  due.setUTCDate(due.getUTCDate() + WORKFLOW_TASK_SCHEDULE[kind].dueInDays);
  return due;
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

export function projectWorkflowSectionLabel(sectionId: string): string {
  const normalized = sectionId.trim().toUpperCase();
  return SECTION_LABELS[normalized] ?? normalized;
}

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
  estimateVersion: number;
  lineItems: readonly EstimateWorkflowLine[];
}): WorkflowTaskBlueprint[] {
  const included = input.lineItems
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.included);
  const sectionIds = [
    ...new Set(
      included.map(({ line }) =>
        line.catalogueId.trim().toUpperCase().slice(0, 2)
      )
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
      roomName: null,
      ...WORKFLOW_TASK_SCHEDULE.procurement
    },
    {
      dedupeKey: `${input.estimateId}:finance`,
      kind: "finance",
      assigneeRole: "finance_head",
      title: "Open approved project budget",
      description: "Review the approved estimate and establish financial controls.",
      sourceSectionId: null,
      sourceLineItemKey: null,
      roomName: null,
      ...WORKFLOW_TASK_SCHEDULE.finance
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
      roomName: null,
      ...WORKFLOW_TASK_SCHEDULE.site_execution
    }
  ];

  for (const { line, index } of included) {
    const catalogueId = line.catalogueId.trim().toUpperCase();
    const sectionId = catalogueId.slice(0, 2) || "OTHER";
    const sourceLineItemKey = approvedEstimateLineItemKey({
      id: line.id,
      estimateId: input.estimateId,
      estimateVersion: input.estimateVersion,
      index
    });
    blueprints.push({
      dedupeKey: `${input.estimateId}:trade:${encodeURIComponent(sourceLineItemKey)}`,
      kind: "trade_execution",
      assigneeRole: workerRoleForCatalogueId(catalogueId),
      title: `${SECTION_LABELS[sectionId] ?? "Project"} · ${line.roomName}`,
      description: `${catalogueId} · ${line.specification} · ${line.quantity} ${line.unit}`,
      sourceSectionId: sectionId,
      sourceLineItemKey,
      roomName: line.roomName,
      ...WORKFLOW_TASK_SCHEDULE.trade_execution
    });
  }

  return blueprints;
}

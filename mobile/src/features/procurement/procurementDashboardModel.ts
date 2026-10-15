import type { ProjectItem } from "../projects/projectsModel";

export type ProcurementTaskStatus = "open" | "in_progress" | "completed" | "unknown";
export type ProcurementStatusFilter = "all" | "awaiting_preparation" | Exclude<ProcurementTaskStatus, "unknown">;
export type ProcurementSourceKind = "approved_pre" | "released_post" | "approved_final" | "unknown";

export const procurementStatusLabels: Readonly<Record<ProcurementTaskStatus | ProcurementStatusFilter, string>> = {
  all: "All status", open: "Open", in_progress: "In progress", completed: "Completed",
  awaiting_preparation: "Awaiting preparation", unknown: "Status unavailable"
};

export const procurementSourceLabels: Readonly<Record<ProcurementSourceKind, string>> = {
  approved_pre: "Pre-estimate approved", released_post: "Post-estimate preparation",
  approved_final: "Final estimate approved", unknown: "Approval source unavailable"
};

export interface ProcurementDashboardProject {
  readonly projectId: string;
  readonly projectName: string;
  readonly estimateVersion: number;
  readonly taskStatus: ProcurementTaskStatus;
  readonly sourceKind: ProcurementSourceKind;
  readonly clientName: string | null;
  readonly openedDate: string | null;
  readonly selectedSectionCount: number;
  readonly selectedValuePaise: number;
  readonly recordedSpendPaise: number;
  readonly remainingValuePaise: number;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function id(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function paise(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function safeTotal(value: bigint): number | null {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function sourceKind(project: Record<string, unknown>): ProcurementSourceKind {
  const source = object(project.preparationSource);
  if (!source || source.workflowVersion !== 2 || source.estimateId !== project.estimateId ||
    source.estimateVersion !== project.estimateVersion || !id(source.sourceSnapshotId) || !id(source.sourceDigest)) return "unknown";
  if (source.kind === "approved_pre" && source.phase === "pre" && id(source.estimateReviewRoundId)) return "approved_pre";
  if (source.kind === "approved_final" && source.phase === "post" && id(source.estimateReviewRoundId)) return "approved_final";
  if (source.kind === "released_post" && source.phase === "post" &&
    (source.estimateReviewRoundId === null || id(source.estimateReviewRoundId))) return "released_post";
  return "unknown";
}

function openedDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
}

/** Portfolio arithmetic uses the same integer-paise boundary as individual projects. */
export function procurementPortfolioSelectedTotal(projects: readonly ProcurementDashboardProject[]): number | null {
  return safeTotal(projects.reduce((total, project) => total + BigInt(project.selectedValuePaise), 0n));
}

export type ProcurementGalleryProject =
  | { readonly kind: "prepared"; readonly id: string; readonly project: ProcurementDashboardProject }
  | { readonly kind: "assigned"; readonly id: string; readonly project: ProjectItem };

/** A project is one portfolio entry regardless of which read operation supplied it. */
export function procurementGalleryProjects(prepared: readonly ProcurementDashboardProject[], assigned: readonly ProjectItem[]): ProcurementGalleryProject[] {
  const projects = new Map<string, ProcurementGalleryProject>(assigned.map((project) => [project.id, { kind: "assigned", id: project.id, project }]));
  for (const project of prepared) projects.set(project.projectId, { kind: "prepared", id: project.projectId, project });
  return [...projects.values()].sort((left, right) => left.kind === right.kind ? 0 : left.kind === "prepared" ? -1 : 1);
}

export function filterProcurementProjects(projects: readonly ProcurementGalleryProject[], search: string, status: ProcurementStatusFilter, preparationKnown: boolean): ProcurementGalleryProject[] {
  const normalized = search.trim().toLocaleLowerCase();
  return projects.filter((entry) => {
    const name = entry.kind === "prepared" ? entry.project.projectName : entry.project.name;
    return name.toLocaleLowerCase().includes(normalized) && (status === "all" ||
      (entry.kind === "prepared" ? entry.project.taskStatus === status : status === "awaiting_preparation" && preparationKnown));
  });
}

/** Fail the whole list closed when project identity or displayed money cannot reconcile. */
export function parseProcurementDashboardProjects(value: unknown): ProcurementDashboardProject[] | null {
  if (!Array.isArray(value)) return null;
  const projects: ProcurementDashboardProject[] = [];
  const projectIds = new Set<string>();
  for (const rawProject of value) {
    const project = object(rawProject);
    if (!project || !id(project.projectId) || projectIds.has(project.projectId) ||
      !id(project.projectName) || !id(project.estimateId) ||
      !Number.isSafeInteger(project.estimateVersion) || Number(project.estimateVersion) < 1 ||
      !Array.isArray(project.sections)) return null;
    projectIds.add(project.projectId);

    const sectionIds = new Set<string>();
    const itemKeys = new Set<string>();
    const expenseIds = new Set<string>();
    let selected = 0n;
    let spent = 0n;
    let selectedSectionCount = 0;
    for (const rawSection of project.sections) {
      const section = object(rawSection);
      if (!section || !id(section.id) || sectionIds.has(section.id) ||
        !paise(section.estimatedAmountPaise) || !paise(section.actualSpendPaise) ||
        !Array.isArray(section.items)) return null;
      sectionIds.add(section.id);
      let itemEstimate = 0n;
      let itemSpend = 0n;
      let sectionHasExpense = false;
      for (const rawItem of section.items) {
        const item = object(rawItem);
        if (!item || !id(item.key) || itemKeys.has(item.key) ||
          !paise(item.estimatedAmountPaise) || !paise(item.actualSpendPaise) ||
          !Array.isArray(item.expenses)) return null;
        itemKeys.add(item.key);
        let posted = 0n;
        for (const rawExpense of item.expenses) {
          const expense = object(rawExpense);
          if (!expense || !id(expense.id) || expenseIds.has(expense.id) ||
            !paise(expense.amountPaise) || expense.amountPaise === 0 ||
            expense.projectId !== project.projectId ||
            expense.sourceSectionId !== section.id ||
            expense.sourceLineItemKey !== item.key ||
            expense.type !== "direct_spend" || expense.expenseClass !== "procurement" ||
            expense.status !== "posted") return null;
          expenseIds.add(expense.id);
          posted += BigInt(expense.amountPaise);
          sectionHasExpense = true;
        }
        if (posted !== BigInt(item.actualSpendPaise) ||
          (item.estimatedAmountPaise === 0 && posted > 0n)) return null;
        itemEstimate += BigInt(item.estimatedAmountPaise);
        itemSpend += BigInt(item.actualSpendPaise);
      }
      if (itemEstimate !== BigInt(section.estimatedAmountPaise) ||
        itemSpend !== BigInt(section.actualSpendPaise) ||
        (section.estimatedAmountPaise === 0 && (section.actualSpendPaise > 0 || sectionHasExpense))) return null;
      if (section.estimatedAmountPaise > 0 && section.items.some((item) => object(item)?.estimatedAmountPaise && Number(object(item)?.estimatedAmountPaise) > 0)) {
        selectedSectionCount += 1;
        selected += BigInt(section.estimatedAmountPaise);
        spent += BigInt(section.actualSpendPaise);
      }
    }
    const selectedValuePaise = safeTotal(selected);
    const recordedSpendPaise = safeTotal(spent);
    const remainingValuePaise = safeTotal(selected - spent);
    if (selectedValuePaise === null || recordedSpendPaise === null || remainingValuePaise === null) return null;
    projects.push({ projectId: project.projectId, projectName: project.projectName,
      estimateVersion: Number(project.estimateVersion),
      taskStatus: project.taskStatus === "open" || project.taskStatus === "in_progress" || project.taskStatus === "completed" ? project.taskStatus : "unknown",
      sourceKind: sourceKind(project), clientName: id(project.clientName) ? project.clientName.trim() : null,
      openedDate: openedDate(project.openedAt), selectedSectionCount,
      selectedValuePaise, recordedSpendPaise, remainingValuePaise });
  }
  return projects;
}

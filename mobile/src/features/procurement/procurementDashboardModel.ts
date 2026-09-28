export interface ProcurementDashboardProject {
  readonly projectId: string;
  readonly projectName: string;
  readonly estimateVersion: number;
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
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
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
      estimateVersion: Number(project.estimateVersion), selectedSectionCount,
      selectedValuePaise, recordedSpendPaise, remainingValuePaise });
  }
  return projects;
}

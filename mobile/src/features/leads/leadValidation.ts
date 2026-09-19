export interface LeadDraft {
  readonly clientName: string;
  readonly clientEmail: string;
  readonly clientMobile: string;
  readonly projectName: string;
  readonly location: string;
  readonly propertyType: string;
  readonly budgetMin: string;
  readonly budgetMax: string;
  readonly source: string;
  readonly nextAction: string;
  readonly nextActionAt: string;
}

export type ValidLeadInput = Omit<LeadDraft, "budgetMin" | "budgetMax" | "nextActionAt"> & {
  readonly budgetMin?: number;
  readonly budgetMax?: number;
  readonly nextActionAt: string;
};

export function validateLeadDraft(draft: LeadDraft): { readonly value?: ValidLeadInput; readonly error?: string } {
  const required = [draft.clientName, draft.clientMobile, draft.projectName, draft.location, draft.propertyType, draft.source, draft.nextAction];
  if (required.some((value) => !value.trim())) return { error: "Complete every required lead field." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.clientEmail.trim())) return { error: "Enter a valid Client email address." };
  const budgetMin = draft.budgetMin.trim() ? Number(draft.budgetMin) : undefined;
  const budgetMax = draft.budgetMax.trim() ? Number(draft.budgetMax) : undefined;
  if ((budgetMin !== undefined && (!Number.isFinite(budgetMin) || budgetMin < 0)) || (budgetMax !== undefined && (!Number.isFinite(budgetMax) || budgetMax < 0))) return { error: "Budgets must be positive numbers." };
  if (budgetMin !== undefined && budgetMax !== undefined && budgetMax < budgetMin) return { error: "Maximum budget must be at least the minimum budget." };
  const instant = new Date(draft.nextActionAt);
  if (Number.isNaN(instant.getTime())) return { error: "Enter a valid next-action date and time." };
  return { value: {
    clientName: draft.clientName.trim(), clientEmail: draft.clientEmail.trim(), clientMobile: draft.clientMobile.trim(), projectName: draft.projectName.trim(),
    location: draft.location.trim(), propertyType: draft.propertyType.trim(), source: draft.source.trim(), nextAction: draft.nextAction.trim(), nextActionAt: instant.toISOString(),
    ...(budgetMin !== undefined ? { budgetMin } : {}), ...(budgetMax !== undefined ? { budgetMax } : {})
  } };
}

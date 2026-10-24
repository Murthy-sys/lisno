const LIST_FILTER_KEYS = ["search", "projectId", "clientId", "unlinkedClient", "budgetStatus", "financeStage", "projectStatus", "approvedFrom", "approvedTo", "limit", "offset"];

/** Only Finance list filters may be carried through a project detail link. */
export function projectBudgetListHref(candidate: unknown): string {
  if (typeof candidate !== "string" || (candidate !== "/finance" && !candidate.startsWith("/finance?"))) return "/finance";
  const parsed = new URL(candidate, "https://lisno.invalid");
  const params = new URLSearchParams();
  for (const key of LIST_FILTER_KEYS) {
    const value = parsed.searchParams.get(key);
    if (value) params.set(key, value);
  }
  return params.size ? `/finance?${params}` : "/finance";
}

export function projectBudgetDetailHref(projectId: string, search = ""): string {
  const returnTo = projectBudgetListHref(`/finance${search}`);
  return `/finance/projects/${encodeURIComponent(projectId)}?${new URLSearchParams({ returnTo })}`;
}

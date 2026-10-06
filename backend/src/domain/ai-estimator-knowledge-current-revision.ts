/** The latest saved Configuration revision used by current internal Main Line views. */
export function selectCurrentMainLineRevision(line: {
  status?: unknown;
  draftRevisionId?: unknown;
  activeRevisionId?: unknown;
}): { id: string; status: "draft" | "active" } | null {
  if (line.status !== "active" && line.status !== "draft" && line.status !== "inactive") return null;
  if (typeof line.draftRevisionId === "string" && line.draftRevisionId) {
    return { id: line.draftRevisionId, status: "draft" };
  }
  if (typeof line.activeRevisionId === "string" && line.activeRevisionId) {
    return { id: line.activeRevisionId, status: "active" };
  }
  return null;
}

type SiteProgress = Record<string, unknown>;
type Assignment = Record<string, unknown>;

function timestamp(value: unknown): number {
  return value instanceof Date || typeof value === "string" || typeof value === "number"
    ? new Date(value).getTime() : NaN;
}

export function isSiteVerifiedAssignment(site: SiteProgress | null, assignment: Assignment): boolean {
  if (!site || Number(site.progress) !== 100) return false;
  if (Array.isArray(site.verifiedAssignmentIds)) {
    return site.verifiedAssignmentIds.includes(String(assignment._id));
  }
  // Earlier 100% saves have no snapshot. Only work that existed at the time
  // can inherit that verification; a later PO revision needs a fresh save.
  const createdAt = timestamp(assignment.createdAt);
  const verifiedAt = timestamp(site.updatedAt);
  return Number.isFinite(createdAt) && Number.isFinite(verifiedAt) && createdAt <= verifiedAt;
}

export function needsSiteReverification(site: SiteProgress | null, assignments: readonly Assignment[]): boolean {
  if (!site || Number(site.progress) !== 100) return false;
  if (Array.isArray(site.verifiedAssignmentIds)) {
    const current = assignments.map(row => String(row._id)).sort();
    const verified = [...site.verifiedAssignmentIds].sort();
    return current.length !== verified.length || current.some((id, index) => id !== verified[index]);
  }
  return assignments.some(row => !isSiteVerifiedAssignment(site, row));
}

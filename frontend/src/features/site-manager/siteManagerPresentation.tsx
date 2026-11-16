import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import type { ExecutionAction, ExecutionCounts, ExecutionStatus, ExecutionWork } from "../execution/executionApi";

import { executionStatusLabels } from "../execution/executionPresentation";
import { vendorWorkflowPresentation } from "../vendor/vendorWorkflowPresentation";

export const siteWorkStatusLabels: Record<ExecutionStatus, string> = {
  ...executionStatusLabels, blocked: "On hold", awaiting_verification: "Completed by vendor", site_verified: "Verified by Project Manager"
};
export function siteWorkStatus(work: ExecutionWork): string {
  if (work.status === "site_verified" && !work.hold && work.tracking !== "setup_required") return siteWorkStatusLabels.site_verified;
  return vendorWorkflowPresentation(work).stageLabel;
}

export const sitePageSize = 25;
export const isSiteAccessError = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);
export function siteOffset(value: string | null) {
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= 100_000 ? offset : 0;
}
export function siteManagerReturnPath(candidate: unknown) {
  if (typeof candidate !== "string" || candidate.includes("\\") || /[\r\n]/u.test(candidate)) return "/home";
  try {
    const url = new URL(candidate, "https://lisno.local");
    return candidate.startsWith("/home") && url.origin === "https://lisno.local" && url.pathname === "/home" ? `/home${url.search}` : "/home";
  } catch { return "/home"; }
}
export function siteWorkAction(work: ExecutionWork): { label: string; action?: ExecutionAction } {
  if (work.proposedSchedule && work.allowedActions.includes("confirm_schedule")) return { label: "Confirm schedule", action: "confirm_schedule" };
  if (work.allowedActions.includes("verify")) return { label: "Review completion", action: "verify" };
  return { label: "View work" };
}
export function SitePagination({ offset, count, total, busy, onChange }: { offset: number; count: number; total: number; busy: boolean; onChange: (offset: number) => void }) {
  return <div className="site-workspace__pagination"><span>{count ? `${offset + 1}–${offset + count} of ${total}` : `${total} results`}</span><div><Button size="compact" variant="secondary" disabled={offset === 0 || busy} onClick={() => onChange(Math.max(0, offset - sitePageSize))}>Previous</Button><Button size="compact" variant="secondary" disabled={offset + count >= total || busy || count === 0} onClick={() => onChange(offset + sitePageSize)}>Next</Button></div></div>;
}
export function SiteExecutionSummary({ counts, compact = false }: { counts: ExecutionCounts; compact?: boolean }) {
  const values = compact ? [
    ["Open", counts.open], ["On hold", counts.blocked], ["Awaiting verification", counts.awaitingVerification], ["Missing updates", counts.missing]
  ] as const : [
    ["Open work", counts.open], ["Awaiting verification", counts.awaitingVerification], ["Blocked", counts.blocked],
    ["Missing updates", counts.missing], ["Overdue", counts.overdue], ["Site verified", counts.verified]
  ] as const;
  return <section aria-label="Project execution statistics" className={`site-workspace__summary${compact ? " site-workspace__summary--compact" : ""}`}>
    <dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {compact ? <details className="site-workspace__more-counts"><summary>More statistics</summary><dl><div><dt>Overdue</dt><dd>{counts.overdue}</dd></div><div><dt>Verified by Project Manager</dt><dd>{counts.verified}</dd></div></dl></details> : <p>Project-wide counts. Attention flags can overlap.</p>}
  </section>;
}

import type { ExecutionAction, ExecutionCommand, ExecutionPolicy, ExecutionPolicyInput, ExecutionWork } from "./executionTypes";
export const actionLabels: Record<ExecutionAction, string> = { setup: "Enable tracking", acknowledge: "Acknowledge issued work", propose_schedule: "Propose schedule", confirm_schedule: "Confirm schedule", report: "Save daily report", submit: "Submit for site verification", verify: "Verify completion", request_changes: "Request work changes", hold: "Put work on hold", resume: "Resume work", exempt_evidence: "Grant photo exemption" };
export interface ExecutionDraft { action: ExecutionAction; version: number; note: string; reason: string; nextAction: string; progress: string; status: "not_started" | "in_progress" | "blocked"; startDate: string; finishDate: string; reviewDate: string; submissionId: string | null }
export function makeDraft(work: ExecutionWork, action: ExecutionAction): ExecutionDraft {
  return { action, version: work.version, note: "", reason: "", nextAction: "", progress: String(work.progress), status: work.status === "blocked" ? "blocked" : work.progress === 0 ? "not_started" : "in_progress", startDate: work.proposedSchedule?.startDate ?? work.schedule?.startDate ?? "", finishDate: work.proposedSchedule?.finishDate ?? work.schedule?.finishDate ?? "", reviewDate: "", submissionId: work.submission?.id ?? null };
}
export function validDate(value: string) { const parsed = Date.parse(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value; }
export function percentage(value: string) { if (!/^\d{1,3}$/u.test(value.trim()) || Number(value) > 100) throw new Error("Enter a whole progress percentage from 0 to 100."); return Number(value); }
export function buildExecutionCommand(work: ExecutionWork, draft: ExecutionDraft, idempotencyKey: string): ExecutionCommand {
  if (draft.version !== work.version) throw new Error("This assignment changed. Discard your draft and review the latest version.");
  if (work.tracking === "legacy_review" || !work.allowedActions.includes(draft.action)) throw new Error("This action is no longer available. Refresh the assignment.");
  const body: ExecutionCommand = { action: draft.action, expectedVersion: draft.version, idempotencyKey };
  const note = draft.note.trim(); const reason = draft.reason.trim();
  if ([note, reason, draft.nextAction.trim()].some(text => text.length > 2000)) throw new Error("Notes must be 2,000 characters or fewer.");
  if (note) body.note = note; if (reason) body.reason = reason;
  if (["propose_schedule", "confirm_schedule"].includes(draft.action)) {
    if (!validDate(draft.startDate) || !validDate(draft.finishDate) || draft.finishDate < draft.startDate) throw new Error("Enter valid start and finish dates in YYYY-MM-DD order. Finish cannot precede start.");
    if (work.schedule && !reason) throw new Error("Give a reason for changing the committed schedule.");
    body.startDate = draft.startDate; body.finishDate = draft.finishDate;
  }
  if (draft.action === "report") {
    const progress = percentage(draft.progress);
    if (!note) throw new Error("Add a work note for today's report.");
    if ((progress <= work.progress || draft.status === "blocked") && !reason) throw new Error("Give a reason for no progress, rework or a blocker.");
    if (draft.status === "blocked" && !draft.nextAction.trim()) throw new Error("State the next action needed to resolve this blocker.");
    body.progress = progress; body.status = draft.status; body.imageIds = [...work.imageIds];
    if (draft.nextAction.trim()) body.nextAction = draft.nextAction.trim();
  }
  if (draft.action === "submit") {
    if (!note) throw new Error("Add a completion note for the Site Manager.");
    if (work.progress !== 100) throw new Error("Save a daily report at 100% before submitting completion.");
    if (!work.imageIds.length && !work.evidenceExemption) throw new Error("Add a photo for this round or request a Site Manager photo exemption.");
    body.imageIds = [...work.imageIds];
  }
  if (["verify", "request_changes"].includes(draft.action)) {
    if (!draft.submissionId || draft.submissionId !== work.submission?.id) throw new Error("The submitted work changed. Review the current submission.");
    body.submissionId = draft.submissionId;
  }
  if (["request_changes", "hold", "resume", "exempt_evidence"].includes(draft.action) && !reason) throw new Error("A reason is required for this action.");
  if (draft.action === "hold") { if (!validDate(draft.reviewDate)) throw new Error("Enter a valid hold review date (YYYY-MM-DD)."); body.reviewDate = draft.reviewDate; }
  return body;
}
export function buildPolicyCommand(current: ExecutionPolicy, draft: ExecutionPolicy, reason: string, idempotencyKey: string): ExecutionPolicyInput {
  if (current.version !== draft.version) throw new Error("The reporting schedule changed. Review the latest saved version.");
  if (!reason.trim()) throw new Error("Enter a reason for this schedule change.");
  if (![draft.reminderTime, draft.deadlineTime, draft.escalationTime].every(time => /^([01]\d|2[0-3]):[0-5]\d$/u.test(time)) || !(draft.reminderTime < draft.deadlineTime && draft.deadlineTime < draft.escalationTime)) throw new Error("Use HH:MM times: reminder before deadline, escalation after deadline.");
  if (!validDate(draft.effectiveDate)) throw new Error("Enter a valid effective date (YYYY-MM-DD).");
  try { new Intl.DateTimeFormat("en", { timeZone: draft.timezone }); } catch { throw new Error("Enter a valid timezone, such as Asia/Kolkata."); }
  return { timezone: draft.timezone, reminderTime: draft.reminderTime, deadlineTime: draft.deadlineTime, escalationTime: draft.escalationTime, effectiveDate: draft.effectiveDate, expectedVersion: draft.version, reason: reason.trim(), idempotencyKey };
}

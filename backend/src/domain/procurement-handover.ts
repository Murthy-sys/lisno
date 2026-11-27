import { z } from "zod";
import type { HandoverAnswerInput, HandoverCheck } from "../contracts/procurement-handover.js";
import { lcCommand, lcEvidenceIds, lcId, lcInstant, lcReason } from "./procurement-lifecycle.js";
import { qualityEvidenceIssues } from "./project-manager/quality.js";

export const handoverAnswerSchema = z.object({
  checkId: lcId, answer: z.enum(["pass", "fail", "not_applicable"]), note: lcReason,
  evidenceIds: lcEvidenceIds, sampleCount: z.number().int().min(1).max(1000).default(1),
  finding: z.object({ ownerId: lcId, dueAt: lcInstant }).strict().optional()
}).strict().superRefine((answer, context) => {
  if (answer.answer === "fail" && !answer.finding) context.addIssue({ code: "custom", message: "A failed check needs a responsible person and corrective-action deadline." });
  if (answer.answer !== "fail" && answer.finding) context.addIssue({ code: "custom", message: "Corrective-action ownership belongs to a failed check." });
});
export const handoverCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...lcCommand, action: z.literal("save"), answers: z.array(handoverAnswerSchema).max(5000) }).strict(),
  z.object({ ...lcCommand, action: z.literal("submit"), reason: lcReason }).strict(),
  z.object({ ...lcCommand, action: z.literal("correct"), reason: lcReason }).strict(),
  z.object({ ...lcCommand, action: z.literal("reconcile"), reason: lcReason }).strict()
]);
export const findingReportSchema = z.object({
  ...lcCommand, recordId: lcId, itemId: lcId.nullable().optional(), title: z.string().trim().min(3).max(180),
  note: lcReason, ownerId: lcId, dueAt: lcInstant, evidenceIds: lcEvidenceIds
}).strict();

export function handoverAnswerIssues(check: HandoverCheck, answer: HandoverAnswerInput,
  evidence: readonly { kind?: string; mimeType?: string }[], complete: boolean): string[] {
  if (answer.answer === "not_applicable" && (check.required || !check.allowNotApplicable)) return [`${check.label}: this required check cannot be marked not applicable.`];
  if (!complete || answer.answer === "not_applicable") return [];
  return qualityEvidenceIssues({ id: check.id, label: check.label, evidence: check.evidence }, {
    id: check.id, answer: answer.answer, reason: answer.note, evidenceIds: answer.evidenceIds, sampleCount: answer.sampleCount
  }, evidence);
}

export function handoverCompletionIssues(checks: readonly HandoverCheck[], answers: readonly HandoverAnswerInput[]): string[] {
  const issues: string[] = [];
  const byId = new Map(answers.map(answer => [answer.checkId, answer]));
  if (byId.size !== answers.length) issues.push("Each checklist item must have exactly one answer.");
  if (answers.some(answer => !checks.some(check => check.id === answer.checkId))) issues.push("An answer does not belong to the current checklist.");
  for (const check of checks) {
    const answer = byId.get(check.id);
    if (!answer) issues.push(`${check.label}: record an outcome before submitting handover.`);
    else if (answer.answer === "fail") issues.push(`${check.label}: resolve the finding and record a passing outcome.`);
    else if (answer.answer === "not_applicable" && (check.required || !check.allowNotApplicable)) issues.push(`${check.label}: this check is mandatory.`);
  }
  return issues;
}

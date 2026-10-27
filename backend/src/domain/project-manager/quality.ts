import { z } from "zod";
const id = z.string().trim().min(1).max(160);
const reason = z.string().trim().min(3).max(2000);
const base = { expectedVersion: z.number().int().min(0), idempotencyKey: z.string().trim().min(8).max(128) };
export const pmQualityListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0)
}).strict();
export interface PMQualityQuery { limit?: number; offset?: number; }
export const pmQualityAnswerSchema = z.object({ id, answer: z.enum(["pass", "fail", "not_applicable"]), reason: z.string().trim().max(2000).nullable().optional(),
  evidenceIds: z.array(id).max(12).default([]), sampleCount: z.number().int().min(1).max(1000).default(1) }).strict().superRefine((value, ctx) => {
  if (value.answer !== "pass" && (!value.reason || value.reason.length < 3)) ctx.addIssue({ code: "custom", message: "Failed and not-applicable checks require a reason." });
  if (new Set(value.evidenceIds).size !== value.evidenceIds.length) ctx.addIssue({ code: "custom", message: "Evidence files must be distinct." });
});
export const pmQualitySaveSchema = z.union([
  z.object({ ...base, action: z.literal("save"), orderId: id, basketId: id, sourceToken: id, week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), answers: z.array(pmQualityAnswerSchema).max(200) }).strict(),
  z.object({ ...base, action: z.literal("correct"), reason }).strict()
]);
export const pmQualitySignSchema = z.object({ ...base, sourceToken: id, reason }).strict();
export type PMQualityAnswer = z.infer<typeof pmQualityAnswerSchema>;
export interface PMQualityRequirement { id: string; label: string; evidence?: { photos?: boolean; documents?: boolean; video?: boolean; minPhotosPerSample?: number | null } | null; }
export function qualityEvidenceIssues(requirement: PMQualityRequirement, answer: PMQualityAnswer, evidence: readonly { kind?: string; mimeType?: string }[]): string[] {
  const required = requirement.evidence; if (!required || answer.answer === "not_applicable") return [];
  const images = evidence.filter(row => row.kind === "image" || row.mimeType?.startsWith("image/")).length;
  const minimum = required.photos ? Math.max(1, required.minPhotosPerSample ?? 1) * answer.sampleCount : 0;
  const issues: string[] = [];
  if (images < minimum) issues.push(`${requirement.label}: ${minimum} photos required for ${answer.sampleCount} sample(s).`);
  if (required.documents && !evidence.some(row => row.kind === "document")) issues.push(`${requirement.label}: a document is required.`);
  if (required.video && !evidence.some(row => row.kind === "video" || row.mimeType?.startsWith("video/"))) issues.push(`${requirement.label}: a video is required.`);
  return issues;
}
/** Monday date in project timezone; this labels an audit round, not elapsed working days. */
export function qualityWeek(at: Date): string {
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const day = new Date(`${local}T00:00:00.000Z`); day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7); return day.toISOString().slice(0, 10);
}

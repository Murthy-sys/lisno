import { z } from "zod";
import { ASSISTANT_DISCLOSURE_POLICY, type AssistantGeneratedResult } from "./project-chat-assistant.js";

const id = z.string().min(1).max(200);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const source = z.object({id, label: z.string().min(1).max(300), href: z.string().max(500).refine(value => /^\/(?!\/)/u.test(value) && !/[\\\u0000-\u0020]/u.test(value)).nullable()}).strict();
export const assistantProjectPricingSchema = z.object({
  policy: z.literal("published-project-estimate-v1"), currency: z.literal("INR"), state: z.enum(["published", "approved"]),
  estimateId: id, estimateVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reviewRoundId: id, reviewVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  publishedAt: z.string().datetime({offset: true}), source,
  lines: z.array(z.object({id, label: z.string().min(1).max(300), quantity: z.string().max(80).nullable(), unit: z.string().max(80).nullable(), ratePaise: money, amountPaise: money}).strict()).max(100),
  lineCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), hasMoreLines: z.boolean(),
  subtotalPaise: money, gstPaise: money, totalPaise: money,
}).strict().superRefine((value, ctx) => {
  if (new Set(value.lines.map(line => line.id)).size !== value.lines.length || value.lineCount < value.lines.length || value.hasMoreLines !== (value.lineCount > value.lines.length)) ctx.addIssue({code: z.ZodIssueCode.custom, message: "Invalid estimate lines"});
  if (value.subtotalPaise !== null && value.gstPaise !== null && value.totalPaise !== null && (!Number.isSafeInteger(value.subtotalPaise + value.gstPaise) || value.subtotalPaise + value.gstPaise !== value.totalPaise)) ctx.addIssue({code: z.ZodIssueCode.custom, message: "Estimate totals do not reconcile"});
});

/** Reject old/in-flight providers; never stamp an unknown answer as classified. */
export function hasCurrentAssistantDisclosure(result: AssistantGeneratedResult): boolean {
  return result.disclosurePolicy === ASSISTANT_DISCLOSURE_POLICY && result.commercial === null &&
    result.candidates.length === 0 && result.kind !== "catalogue" &&
    (result.projectPricing == null || assistantProjectPricingSchema.safeParse(result.projectPricing).success);
}

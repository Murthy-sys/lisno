import { z } from "zod";

export const disclosurePolicy = "project-publication-v1" as const;
export const assistantId = z.string().min(1).max(200);
const text = z.string().max(20_000);
const money = z.number().int().safe().nonnegative().nullable();
const unique = (values: string[]) => new Set(values).size === values.length;
export function safeAssistantPath(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return /^\/(?!\/)[^\\\s\u0000-\u001f\u007f]*$/.test(decoded) && !decoded.split(/[/?#]/).some(part => part === "." || part === "..");
  } catch { return false; }
}
const source = z.object({ id: assistantId, label: text, href: z.string().max(2000).refine(safeAssistantPath).nullable() }).strict();
export const projectPricingSchema = z.object({
  policy: z.literal("published-project-estimate-v1"), currency: z.literal("INR"), state: z.enum(["published", "approved"]),
  estimateId: assistantId, estimateVersion: z.number().int().safe().positive(), reviewRoundId: assistantId, reviewVersion: z.number().int().safe().positive(),
  publishedAt: z.string().datetime({ offset: true }), source,
  lines: z.array(z.object({ id: assistantId, label: z.string().min(1).max(300), quantity: z.string().max(80).nullable(), unit: z.string().max(80).nullable(), ratePaise: money, amountPaise: money }).strict()).max(100),
  lineCount: z.number().int().safe().nonnegative(), hasMoreLines: z.boolean(), subtotalPaise: money, gstPaise: money, totalPaise: money
}).strict().refine(value => unique(value.lines.map(line => line.id)) && value.lineCount >= value.lines.length && value.hasMoreLines === (value.lineCount > value.lines.length));
export type AssistantProjectPricing = z.infer<typeof projectPricingSchema>;
const answerSchema = z.object({
  disclosurePolicy: z.literal(disclosurePolicy), projectPricing: projectPricingSchema.nullable().optional(),
  kind: z.enum(["status", "catalogue", "price", "clarification", "handoff", "no_answer"]),
  narrative: z.array(z.object({ text: z.string().max(2000), factIds: z.array(assistantId).max(500) }).strict()).max(4).optional(),
  facts: z.array(z.object({ id: assistantId, label: text, value: text, source }).strict()).max(500),
  candidates: z.array(z.never()).max(0), missingInputs: z.array(text).max(100), commercial: z.null()
}).strict().refine(answer => {
  const ids = answer.facts.map(fact => fact.id);
  return unique(ids) && (answer.narrative ?? []).every(paragraph => paragraph.factIds.every(id => ids.includes(id))) && (answer.narrative ?? []).reduce((length, paragraph) => length + paragraph.text.length, 0) <= 2000;
});
/** Older stored answers must never disclose their unclassified content. */
export type AssistantAnswer = Omit<z.infer<typeof answerSchema>, "disclosurePolicy"> & { disclosurePolicy?: typeof disclosurePolicy };
export function parseAssistantAnswer(value: unknown): AssistantAnswer {
  const marker = z.object({ disclosurePolicy: z.unknown().optional() }).parse(value);
  if (marker.disclosurePolicy !== disclosurePolicy) return { kind: "no_answer" as const, facts: [], candidates: [], missingInputs: [], commercial: null, projectPricing: null };
  return answerSchema.parse(value);
}

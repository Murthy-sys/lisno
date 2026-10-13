import { z } from "zod";

const id = z.string().trim().min(1).max(160);
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const text = z.string().trim().min(1).max(4000);
export const createEstimateRequirementSchema = z.object({
  mainBasketId: id, roomId: id.nullable().optional(), text,
  expectedRequirementsVersion: version,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u)
}).strict();
export const updateEstimateRequirementSchema = z.object({
  expectedRequirementsVersion: version, expectedVersion: version.min(1),
  mainBasketId: id.optional(), roomId: id.nullable().optional(), text: text.optional(),
  withdraw: z.boolean().optional()
}).strict().refine(value => value.withdraw === true || value.mainBasketId !== undefined ||
  value.roomId !== undefined || value.text !== undefined, "Supply a change or withdraw the request.");
export const resolveEstimateRequirementSchema = z.object({
  expectedRequirementsVersion: version, expectedVersion: version.min(1),
  status: z.enum(["included", "declined", "superseded"]),
  lineItemIds: z.array(id).max(200).default([]),
  reason: z.string().trim().max(2000).default(""),
  supersededById: id.optional()
}).strict().superRefine((value, context) => {
  if (value.status === "included" && value.lineItemIds.length === 0)
    context.addIssue({ code: "custom", path: ["lineItemIds"], message: "Link at least one included estimate item." });
  if (value.status !== "included" && !value.reason)
    context.addIssue({ code: "custom", path: ["reason"], message: "Explain how this request was resolved." });
  if (value.status === "superseded" && !value.supersededById)
    context.addIssue({ code: "custom", path: ["supersededById"], message: "Select the replacement request." });
});
export type CreateEstimateRequirementInput = z.infer<typeof createEstimateRequirementSchema>;
export type UpdateEstimateRequirementInput = z.infer<typeof updateEstimateRequirementSchema>;
export type ResolveEstimateRequirementInput = z.infer<typeof resolveEstimateRequirementSchema>;

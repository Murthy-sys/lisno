import { z } from "zod";
import { ROLE_CODES } from "../../contracts/authorization";
const id = z.string().min(1);
const version = z.number().int().positive();
const money = z.number().finite().nonnegative();
const paise = z.number().int().safe().nonnegative();
export const delivery = z.enum(["queued", "sending", "sent", "failed", "disabled"]);
export const estimateReviewSchema = z.object({
  id, version, sendGeneration: version, project: z.object({ id, name: z.string() }).nullable(),
  client: z.object({ name: z.string(), email: z.string() }), estimate: z.object({ id, version, total: money }),
  assignedAdmin: z.object({ id, name: z.string() }), deliveryStatus: delivery, deliveryAttemptCount: z.number().int().nonnegative(),
  deliveryAttemptedAt: z.string().nullable(), deliveredAt: z.string().nullable(),
  status: z.enum(["pending", "approved", "changes_requested", "superseded"]), decision: z.enum(["approve", "request_changes"]).nullable(), proofAvailable: z.boolean(), createdAt: z.string()
});
export const estimateReviewDetailSchema = estimateReviewSchema.extend({
  estimateSnapshot: z.object({ projectName: z.string(), clientName: z.string(), location: z.string(), propertyType: z.string(),
    lineItems: z.array(z.object({ id: z.string().nullable().optional(), catalogueId: z.string(), roomName: z.string(), specification: z.string().nullable(), unit: z.string(), quantity: money, included: z.boolean(), rate: money.nullable(), amount: money.nullable(), ratePaise: paise.nullable().optional(), amountPaise: paise.nullable().optional(), estimateNotes: z.array(z.string()).optional(), mainBasketName: z.string().optional(), subBasketName: z.string().nullable().optional(), mainLineName: z.string().optional(), uomName: z.string().optional() })), subtotal: money, gst: money, total: money, subtotalPaise: paise.optional(), gstPaise: paise.optional(), totalPaise: paise.optional()
  }), pdf: z.object({ filename: z.string(), mimeType: z.literal("application/pdf"), byteSize: z.number().int().nonnegative(), sha256: z.string() }),
  decisionSource: z.enum(["client_portal", "admin_proof"]).nullable(), decisionNote: z.string().nullable(), decidedAt: z.string().nullable()
});
export const designReviewSchema = z.object({
  id, estimateId: id, projectId: id, projectName: z.string(), clientName: z.string(), designPlanVersion: version,
  status: z.enum(["pending", "approved", "changes_requested", "withdrawn"]), deliveryStatus: delivery, submittedAt: z.string(), version,
  attachmentNames: z.array(z.string()), canDecide: z.boolean().optional(),
  decision: z.object({ action: z.enum(["approve", "request_changes"]), source: z.enum(["client_portal", "admin_proof"]).nullable(), performedById: z.string().nullable(), performedByName: z.string().nullable(), performedByRole: z.enum(ROLE_CODES).nullable(), performedAt: z.string(), note: z.string().nullable(), onBehalfOfClient: z.boolean(), proof: z.object({ filename: z.string(), mimeType: z.string(), byteSize: z.number().int().nonnegative(), uploadedAt: z.string() }).nullable() }).nullish()
});
export const estimateReviewPageSchema = z.object({ items: z.array(estimateReviewSchema), pagination: z.object({ total: z.number().int().nonnegative(), limit: z.number().int().positive(), offset: z.number().int().nonnegative(), hasMore: z.boolean() }) });
export type EstimateReview = z.infer<typeof estimateReviewSchema>;
export type EstimateReviewDetail = z.infer<typeof estimateReviewDetailSchema>;
export type DesignReview = z.infer<typeof designReviewSchema>;
export type ReviewKind = "estimate" | "design";
export type Review = EstimateReview | DesignReview;
export const reviewName = (task: Review) => "project" in task ? task.project?.name ?? task.client.name : task.projectName;
export function sameReviewSource(first: Review, second: Review): boolean {
  if (first.id !== second.id) return false;
  if ("estimate" in first && "estimate" in second) return first.estimate.id === second.estimate.id && first.estimate.version === second.estimate.version && first.project?.id === second.project?.id;
  if ("estimateId" in first && "estimateId" in second) return first.estimateId === second.estimateId && first.projectId === second.projectId && first.designPlanVersion === second.designPlanVersion;
  return false;
}
export function quotationMoney(rupees: number | null, amountPaise?: number | null) {
  const value = amountPaise === undefined ? rupees : amountPaise === null ? null : amountPaise / 100;
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

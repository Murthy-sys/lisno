import { presentEstimateInHouseResponse } from "./estimate-in-house-presentation.js";
import { estimateTotalsReconcile } from "../domain/estimate-total-rounding.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { estimateProposalSchema } from "../domain/estimate-proposal.js";
import type { EstimateRevisionDetail, EstimateRevisionPage, EstimateRevisionSummary } from "../contracts/estimate-revisions.js";
import { ESTIMATE_CLIENT_REVIEW_STATUSES, ESTIMATE_DELIVERY_STATUSES, type EstimateClientReviewSnapshot, type StoredDownload } from "../domain/estimate-client-review.js";
import { ESTIMATE_COMPONENT_PRICING_BASIS, readEstimateComponentPricing } from "../domain/estimate-component-pricing.js";
import { ESTIMATE_DIMENSION_INPUT_UNITS, ESTIMATE_DIMENSION_QUANTITY_UNITS } from "../domain/estimate-dimensions.js";
import { KNOWLEDGE_MODE_TIERS } from "../domain/ai-estimator-knowledge-mode-tiers.js";
import { ESTIMATE_PRICING_MODES, ESTIMATE_RATE_SOURCES } from "../domain/estimate-mode-pricing.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { UserModel } from "../models/User.js";
import type { PublicUser } from "./auth.service.js";
import type { EstimateClientReviewStorage } from "./estimate-client-review-storage.js";
import type { LeadService } from "./lead.service.js";
import { estimateStaffReadFilter } from "./estimate-staff-read-scope.js";

type Row = Record<string, unknown>;
const id = z.string().min(1).max(128);
const money = z.number().finite().nonnegative();
const paise = money.int().safe();
const count = paise.positive();
const text = z.string();
// Legacy Estimate rows used null defaults for metadata that publications now omit.
const optionalId = id.nullish().transform(value => value ?? undefined);
const optionalText = text.nullish().transform(value => value ?? undefined);
const optionalPaise = paise.nullish().transform(value => value ?? undefined);
const lineSchema = z.object({
  id: id.nullable().optional(), source: z.enum(["legacy", "configuration"]).optional(),
  catalogueId: id, roomId: optionalId, roomName: text, specification: text.nullable(), unit: text,
  quantity: money, included: z.boolean(), rate: money.nullable(), amount: money.nullable(),
  ratePaise: paise.nullable().optional(), amountPaise: paise.nullable().optional(),
  estimateNotes: z.array(text).optional(), clientVisible: z.boolean().optional(),
  itemType: z.enum(["main_line", "temporary"]).optional(), classification: z.enum(["standard", "special"]).optional(),
  modeTier: z.enum(KNOWLEDGE_MODE_TIERS).optional(),
  pricingMode: z.enum(ESTIMATE_PRICING_MODES).optional(), rateSource: z.enum(ESTIMATE_RATE_SOURCES).optional(),
  mainBasketId: optionalId, subBasketId: id.nullable().optional(), mainLineId: optionalId, revisionId: optionalId,
  mainBasketName: optionalText, subBasketName: text.nullable().optional(), mainLineName: optionalText,
  uomId: optionalId, uomName: optionalText, uomCode: optionalText, uomDecimalScale: optionalPaise,
  sourceItemStatus: z.enum(["draft", "active", "inactive"]).optional(),
  sourceRevisionStatus: z.enum(["draft", "active", "superseded"]).optional(),
  sourceItemVersion: count.optional(), sourceRevisionVersion: count.optional(),
  dimensionsMandatory: z.boolean().optional(),
  dimensions: z.object({ length: text, width: text, height: text }).optional(),
  dimensionRule: z.object({ formula: z.literal("length_width"), inputUnit: z.enum(ESTIMATE_DIMENSION_INPUT_UNITS),
    quantityUnit: z.enum(ESTIMATE_DIMENSION_QUANTITY_UNITS), uomId: id, decimalScale: paise }).nullable().optional(),
  selectedInHouseComponentIds: z.array(id).optional(), pricingBasis: z.literal(ESTIMATE_COMPONENT_PRICING_BASIS).optional(),
  componentPricing: z.unknown().transform((value, context) => {
    const parsed = readEstimateComponentPricing(value);
    if (!parsed) { context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid saved component pricing." }); return z.NEVER; }
    return parsed;
  }).optional()
});
const snapshotSchema = z.object({
  proposal: estimateProposalSchema.optional(),
  clientName: text, projectName: text, location: text, propertyType: text,
  rooms: z.array(z.object({ id: optionalId, typeId: optionalId, label: optionalText,
    length: money.nullish().transform(value => value ?? undefined), width: money.nullish().transform(value => value ?? undefined),
    height: money.nullish().transform(value => value ?? undefined), sqft: money.nullish().transform(value => value ?? undefined) })).optional(),
  bedroomCount: paise.nullable().optional(), scopes: z.array(text).optional(),
  lineItems: z.array(lineSchema), subtotal: money, gst: money, total: money,
  subtotalPaise: paise.optional(), gstPaise: paise.optional(), totalPaise: paise.optional(),
  roundOffPaise: z.number().int().min(-50).max(49).optional(),
  selectedMainBasketIds: z.array(id).optional(),
  selectedMainBasketClassifications: z.array(z.object({ mainBasketId: id, classification: z.enum(["standard", "special"]) })).optional()
}).superRefine((snapshot, ctx) => {
  if (snapshot.roundOffPaise === undefined) {
    if ([snapshot.subtotalPaise, snapshot.gstPaise, snapshot.totalPaise].some(value => value !== undefined) &&
      !estimateTotalsReconcile(snapshot)) {
      ctx.addIssue({ code: "custom", message: "Saved estimate totals must reconcile in paise." });
    }
    return;
  }
  if (!estimateTotalsReconcile(snapshot) || snapshot.subtotal !== snapshot.subtotalPaise! / 100 ||
    snapshot.gst !== snapshot.gstPaise! / 100 || snapshot.total !== snapshot.totalPaise! / 100) {
    ctx.addIssue({ code: "custom", message: "Saved estimate totals must reconcile in paise." });
  }
});
const querySchema = z.object({
  limit: z.union([z.number(), z.string().regex(/^[1-9]\d*$/u).transform(Number)]).pipe(z.number().int().min(1).max(50)).optional().default(20),
  cursor: z.string().min(1).max(1024).optional()
}).strict();
const cursorSchema = z.object({ v: z.literal(1), estimateId: id, before: count }).strict();
const summaryFields = "_id estimateId estimateVersion sendGeneration phase workflowVersion createdAt status deliveryStatus estimateSnapshot.subtotal estimateSnapshot.subtotalPaise";

export interface EstimateRevisionsService {
  list(actor: PublicUser, estimateId: string, query?: unknown): Promise<EstimateRevisionPage>;
  detail(actor: PublicUser, estimateId: string, revisionId: string): Promise<EstimateRevisionDetail>;
  readPdf(actor: PublicUser, estimateId: string, revisionId: string): Promise<StoredDownload>;
}

export function createEstimateRevisionsService(input: {
  leads: Pick<LeadService, "get">;
  storage: Pick<EstimateClientReviewStorage, "read">;
}): EstimateRevisionsService {
  async function scope(actor: PublicUser, estimateId: string): Promise<Row> {
    if (!id.safeParse(estimateId).success || !["estimator_sales", "designer", "super_admin"].includes(actor.role)) notFound();
    if (!await UserModel.exists({ _id: actor.id, role: actor.role, active: true, deletedAt: null })) notFound();
    const estimate = await EstimateModel.findOne({ _id: estimateId, ...estimateStaffReadFilter(actor) })
      .select("leadId projectId ownerId").lean();
    if (!estimate) notFound();
    const lead = await input.leads.get(actor, String(estimate.leadId));
    if (lead.id !== estimate.leadId || lead.ownerId !== estimate.ownerId || (lead.projectId ?? null) !== (estimate.projectId ?? null)) notFound();
    // A legacy publication can predate project creation. A conflicting non-null project never qualifies.
    return { estimateId, leadId: lead.id, projectId: { $in: [null, ...(estimate.projectId ? [estimate.projectId] : [])] } };
  }

  async function findRound(actor: PublicUser, estimateId: string, revisionId: string, fields: string) {
    const filter = await scope(actor, estimateId);
    if (!id.safeParse(revisionId).success) notFound();
    const row = await EstimateClientReviewRoundModel.findOne({ ...filter, _id: revisionId }).select(fields).lean();
    if (!row) notFound();
    return row as Row;
  }

  return {
    async list(actor, estimateId, query = {}) {
      const filter = await scope(actor, estimateId);
      const parsed = querySchema.safeParse(query);
      if (!parsed.success) throw new ApiError(400, "INVALID_REVISION_QUERY", "Use a limit from 1 to 50 and a valid revision cursor.");
      const { limit, cursor } = parsed.data;
      const before = cursor ? decodeCursor(cursor, estimateId) : undefined;
      const rows = await EstimateClientReviewRoundModel.find({ ...filter, ...(before ? { sendGeneration: { $lt: before } } : {}) })
        .sort({ sendGeneration: -1 }).limit(limit + 1).select(summaryFields).lean();
      const items = rows.slice(0, limit).map(row => summary(row as Row));
      const nextCursor = rows.length > limit ? Buffer.from(JSON.stringify({ v: 1, estimateId, before: items.at(-1)!.sendGeneration })).toString("base64url") : null;
      return { items, pagination: { limit, nextCursor } };
    },
    async detail(actor, estimateId, revisionId) {
      const row = await findRound(actor, estimateId, revisionId, "_id estimateId estimateVersion sendGeneration phase workflowVersion createdAt status deliveryStatus estimateSnapshot");
      const parsed = snapshotSchema.safeParse(row.estimateSnapshot);
      if (!parsed.success) unavailableSnapshot();
      const snapshot: EstimateClientReviewSnapshot = {
        ...parsed.data,
        subtotalPaise: historicalPaise(parsed.data.subtotalPaise, parsed.data.subtotal),
        gstPaise: historicalPaise(parsed.data.gstPaise, parsed.data.gst),
        totalPaise: historicalPaise(parsed.data.totalPaise, parsed.data.total)
      };
      return { ...summary(row), snapshot: await presentEstimateInHouseResponse(snapshot) };
    },
    async readPdf(actor, estimateId, revisionId) {
      const row = await findRound(actor, estimateId, revisionId, "+pdfStorageReference pdfFilename pdfMimeType pdfByteSize pdfSha256 sendGeneration");
      if (typeof row.pdfStorageReference !== "string" || !row.pdfStorageReference || row.pdfMimeType !== "application/pdf") unavailablePdf();
      let bytes: Buffer;
      try { bytes = await input.storage.read(row.pdfStorageReference); } catch { unavailablePdf(); }
      if (!bytes.length || row.pdfByteSize !== bytes.length || row.pdfSha256 !== createHash("sha256").update(bytes).digest("hex")) unavailablePdf();
      return { bytes, mimeType: "application/pdf", filename: typeof row.pdfFilename === "string" && row.pdfFilename ? row.pdfFilename : `estimate-revision-${row.sendGeneration}.pdf` };
    }
  };
}

function decodeCursor(cursor: string, estimateId: string): number {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(cursor)) throw new Error("Invalid cursor.");
    const decoded = Buffer.from(cursor, "base64url");
    if (decoded.toString("base64url") !== cursor) throw new Error("Noncanonical cursor.");
    const value = cursorSchema.parse(JSON.parse(decoded.toString("utf8")));
    if (value.estimateId !== estimateId) throw new Error("Wrong estimate.");
    return value.before;
  } catch { throw new ApiError(400, "INVALID_REVISION_CURSOR", "The revision cursor is invalid. Reload revision history."); }
}

function historicalPaise(stored: unknown, rupees: unknown): number {
  const value = stored === undefined && typeof rupees === "number" && Number.isFinite(rupees) && rupees >= 0 ? Math.round(rupees * 100) : stored;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) unavailableSnapshot();
  return value;
}

function summary(row: Row): EstimateRevisionSummary {
  const snapshot = row.estimateSnapshot as Row | undefined;
  const submittedAt = row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt));
  const status = z.enum(ESTIMATE_CLIENT_REVIEW_STATUSES).safeParse(row.status);
  const deliveryStatus = z.enum(ESTIMATE_DELIVERY_STATUSES).safeParse(row.deliveryStatus);
  if (!snapshot || !Number.isFinite(submittedAt.getTime()) || !status.success || !deliveryStatus.success || !count.safeParse(row.sendGeneration).success || !count.safeParse(row.estimateVersion).success) unavailableSnapshot();
  return {
    id: String(row._id), estimateId: String(row.estimateId), estimateVersion: Number(row.estimateVersion), sendGeneration: Number(row.sendGeneration),
    ...(row.phase === "pre" || row.phase === "post" ? { phase: row.phase } : {}),
    ...(row.workflowVersion === 2 || row.workflowVersion === 3 ? { workflowVersion: row.workflowVersion } : {}),
    submittedAt: submittedAt.toISOString(), status: status.data, deliveryStatus: deliveryStatus.data,
    subtotalPaise: historicalPaise(snapshot.subtotalPaise, snapshot.subtotal)
  };
}

function notFound(): never { throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); }
function unavailableSnapshot(): never { throw new ApiError(409, "ESTIMATE_REVISION_UNAVAILABLE", "This saved revision is incomplete or unavailable."); }
function unavailablePdf(): never { throw new ApiError(503, "ESTIMATE_REVISION_PDF_UNAVAILABLE", "This revision's stored PDF is unavailable. Please try again later."); }

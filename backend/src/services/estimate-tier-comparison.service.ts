import { z } from "zod";
import { KNOWLEDGE_MODE_TIERS, type KnowledgeModeTier } from "../domain/ai-estimator-knowledge-mode-tiers.js";
import { ESTIMATE_PRICING_MODES } from "../domain/estimate-mode-pricing.js";
import { calculateDimensionQuantity, estimateDimensionRulesEqual, readEstimateDimensionRule } from "../domain/estimate-dimensions.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";
import { canChangeEstimatePricingMode, canStaffEditEstimate, requireEstimateStaffActor } from "./estimate-collaboration-policy.service.js";
import { estimateAmountFor, estimateTierChoices, estimateTierScope } from "./estimate-tiers.service.js";
import { resolveEstimatorCatalogueLines } from "./estimator-catalogue.service.js";
import { visibleQuotationSources } from "./quotation-setup.service.js";
import type { PublicUser } from "./auth.service.js";
import type { LeadService } from "./lead.service.js";
import { ComparisonPdf, comparisonColors, comparisonPage, formatComparisonPaise } from "./estimate-tier-comparison-pdf-layout.js";
import { drawComparisonCover, drawComparisonOverview } from "./estimate-tier-comparison-pdf-front.js";
import { drawComparisonBoq } from "./estimate-tier-comparison-pdf-boq.js";

type Row = Record<string, any>;
const id = z.string().trim().min(1).max(500);
const version = z.number().int().positive().safe();
const componentIds = z.array(id).max(50).refine(ids => new Set(ids).size === ids.length);
export const estimateTierComparisonSchema = z.object({
  expectedVersion: version.optional(), mainBasketId: id, subBasketId: id.nullable(), roomId: id,
  lines: z.array(z.object({
    mainLineId: id, lineItemId: id.optional(), revisionId: id, itemVersion: version, revisionVersion: version, uomId: id,
    quantity: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
    pricingMode: z.enum(ESTIMATE_PRICING_MODES).nullable().optional(), modeTier: z.enum(KNOWLEDGE_MODE_TIERS),
    rateSource: z.enum(["configuration", "manual"]).optional(), manualRateChanged: z.boolean().optional(),
    selectedInHouseComponentIds: componentIds.optional(),
    dimensions: z.object({ length: z.string().max(32), width: z.string().max(32), height: z.string().max(32) }).strict().optional(),
    expectedDimensionRule: z.unknown().refine(value => readEstimateDimensionRule(value) !== null).optional()
  }).strict()).min(1).max(1000).refine(lines => new Set(lines.map(line => line.mainLineId)).size === lines.length,
    "Compare each main line once within a room.")
}).strict();
export type EstimateTierComparisonInput = z.infer<typeof estimateTierComparisonSchema>;
export interface EstimateTierComparisonLine {
  mainLineId: string; name: string; quantity: number; uomName: string;
  ratePaise: number | null; amountPaise: number | null; unavailableReason: string | null;
}
export interface EstimateTierComparison {
  mainBasketId: string; subBasketId: string | null; roomId: string; roomName: string;
  mainBasketName: string; subBasketName: string | null; estimateVersion: number | null;
  tiers: Array<{ modeTier: "current" | KnowledgeModeTier; label: string; available: boolean;
    subtotalPaise: number | null; lines: EstimateTierComparisonLine[] }>;
}
const missing = (): never => { throw new ApiError(404, "ESTIMATE_TIER_COMPARISON_NOT_FOUND", "The tier comparison is unavailable."); };
const changed = (): never => { throw new ApiError(409, "ESTIMATE_CONFIGURATION_CHANGED", "The estimate or Configuration changed. Refresh before comparing tiers."); };
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const labels: Record<KnowledgeModeTier, string> = { signature: "Signature", premium: "Premium", functional: "Functional" };

/** A read-only commercial preview: no estimate, dependency fence, audit or publication writes. */
async function compare(actor: PublicUser, estimate: Row | null, project: Row | null, input: EstimateTierComparisonInput,
  external: boolean): Promise<EstimateTierComparison> {
  if (estimate ? input.expectedVersion !== estimate.version : input.expectedVersion !== undefined) changed();
  const room = estimate?.rooms?.find((value: Row) => value.id === input.roomId);
  if (external && !room) return missing();
  const ids = input.lines.map(line => line.mainLineId);
  const sources = external && estimate
    ? await visibleQuotationSources(estimate, undefined, true, ids)
    : await resolveEstimatorCatalogueLines(ids);
  const tiers: EstimateTierComparison["tiers"] = [
    { modeTier: "current", label: "Mode", available: true, subtotalPaise: 0, lines: [] },
    ...KNOWLEDGE_MODE_TIERS.map(modeTier => ({ modeTier, label: labels[modeTier], available: true, subtotalPaise: 0, lines: [] }))
  ];
  let mainBasketName = "", subBasketName: string | null = null;
  for (const requested of input.lines) {
    const source = sources.get(requested.mainLineId);
    if (!source || source.line.basketId !== input.mainBasketId || source.line.subBasketId !== input.subBasketId) return missing();
    const prior = estimate?.lineItems?.find((line: Row) => line.source === "configuration" &&
      line.mainLineId === requested.mainLineId && line.roomId === input.roomId);
    if (requested.lineItemId && (!prior || prior.id !== requested.lineItemId)) return missing();
    if (external && (estimate?.lineItems ?? []).some((line: Row) => line.mainLineId === requested.mainLineId &&
      line.clientVisible !== undefined && line.clientVisible !== true)) return missing();
    if (source.line.revisionId !== requested.revisionId || source.line.itemVersion !== requested.itemVersion ||
      source.line.revisionVersion !== requested.revisionVersion || source.line.uom.id !== requested.uomId) changed();
    const mode = requested.pricingMode ?? prior?.pricingMode ?? null;
    const savedMode = prior?.pricingMode ?? estimate?.lineItems?.find((line: Row) => line.mainLineId === requested.mainLineId)?.pricingMode ?? "sub_vendor";
    if (estimate && (estimate.estimation?.workflowVersion === 3 ? !canChangeEstimatePricingMode(actor, estimate, project) : external) && mode !== savedMode) {
      throw new ApiError(403, "ESTIMATE_PRICING_MODE_FORBIDDEN", "This pricing mode is unavailable for the current role and stage.");
    }
    mainBasketName = source.mainBasketName; subBasketName = source.subBasketName;
    let quantity = requested.quantity;
    let dimensionIssue: string | null = null;
    if (source.line.dimensionsMandatory) {
      const calculated = source.line.dimensionRule && requested.dimensions
        ? calculateDimensionQuantity(source.line.dimensionRule, requested.dimensions) : null;
      if (!calculated || !estimateDimensionRulesEqual(requested.expectedDimensionRule, source.line.dimensionRule)) {
        dimensionIssue = "Review the current dimensions before comparing this line.";
      } else quantity = calculated.quantity;
    }
    const line = { ...requested, quantity, uomId: source.line.uom.id, pricingMode: mode };
    const choices = await estimateTierChoices(line, source);
    for (const tier of tiers) {
      const selectedTier = tier.modeTier === "current" ? requested.modeTier : tier.modeTier;
      const choice = choices.find(choice => choice.modeTier === selectedTier)!;
      let ratePaise = choice.ratePaise, amountPaise = choice.amountPaise;
      let unavailableReason = dimensionIssue ?? choice.unavailableReason;
      if (tier.modeTier === "current" && (requested.rateSource === "manual" || requested.rateSource === undefined && prior?.rateSource === "manual")) {
        if (requested.manualRateChanged || !prior || prior.rateSource !== "manual" || !money(prior.ratePaise) ||
          requested.modeTier !== (prior.modeTier ?? "signature") || mode !== (prior.pricingMode ?? null)) {
          ratePaise = null; amountPaise = null;
          unavailableReason = "Save the manual price before comparing the current Mode.";
        } else {
          ratePaise = prior.ratePaise;
          amountPaise = estimateAmountFor(prior.ratePaise, quantity, source.line.uom.decimalScale);
          unavailableReason = dimensionIssue ?? (amountPaise === null ? "Review the current quantity." : null);
        }
      }
      if (unavailableReason === null && amountPaise === null) unavailableReason = choice.inHouseComponents
        ? "Choose the components for this tier to calculate its price." : "The price or quantity is incomplete.";
      if (unavailableReason) amountPaise = null;
      const output = { mainLineId: requested.mainLineId, name: source.line.name, quantity, uomName: source.line.uom.name,
        ratePaise, amountPaise, unavailableReason };
      tier.lines.push(output);
      if (amountPaise === null || tier.subtotalPaise === null || !Number.isSafeInteger(tier.subtotalPaise + amountPaise)) {
        tier.available = false; tier.subtotalPaise = null;
      } else tier.subtotalPaise += amountPaise;
    }
  }
  return { mainBasketId: input.mainBasketId, subBasketId: input.subBasketId, roomId: input.roomId,
    roomName: String(room?.label ?? room?.name ?? "Selected room"), mainBasketName, subBasketName,
    estimateVersion: estimate?.version ?? null, tiers };
}

export async function compareProjectEstimateTiers(actor: PublicUser, projectId: string, command: unknown) {
  const input = estimateTierComparisonSchema.parse(command);
  const context = await estimateTierScope(actor, projectId);
  if (!context.estimate) return missing();
  return compare(actor, context.estimate, context.project, input, context.client || context.secondary);
}

export async function compareLeadEstimateTiers(actor: PublicUser, leadId: string, command: unknown, leads: LeadService) {
  const input = estimateTierComparisonSchema.parse(command);
  const lead = await leads.get(actor, leadId);
  const estimate = await EstimateModel.findOne({ leadId }).lean() as Row | null;
  if (estimate) {
    if (!canStaffEditEstimate(actor, estimate)) return missing();
    await requireEstimateStaffActor(actor.id, estimate, undefined, actor.role);
  } else {
    const current = await UserModel.findOne({ _id: actor.id, active: true, deletedAt: null, role: actor.role }).lean();
    if (!current || actor.role !== "estimator_sales" || lead.ownerId !== actor.id) return missing();
  }
  const project = estimate?.projectId ? await ProjectModel.findById(estimate.projectId).lean() as Row | null : null;
  return compare(actor, estimate, project, input, false);
}

function drawComparisonCommercial(pdf: ComparisonPdf, comparison: EstimateTierComparison): void {
  const { left, contentWidth } = comparisonPage;
  const { doc } = pdf;
  const colors = comparisonColors;
  const y = pdf.interiorPage("COMMERCIAL", "Commercial summary");
  const scope = comparison.subBasketName ?? comparison.mainBasketName;
  const packageWidth = 224;
  const tierWidth = (contentWidth - packageWidth) / comparison.tiers.length;
  const headerHeight = 36;
  const rowHeight = 30;
  const subtotal = comparison.tiers[0]?.subtotalPaise ?? null;
  const totalY = y + headerHeight + rowHeight * 2;

  doc.rect(left, y, packageWidth, headerHeight).fill(colors.neutral);
  pdf.text("Package", left + 11, y + 13, packageWidth - 22, { font: "medium", size: 9 });
  comparison.tiers.forEach((tier, index) => {
    const x = left + packageWidth + index * tierWidth;
    doc.rect(x, y, tierWidth, headerHeight).fill(index === 0 ? colors.ink : colors.coolHeader);
    pdf.text(index === 0 ? "CURRENT" : `OPTION ${index}`, x + 10, y + 6, tierWidth - 20,
      { size: 6.5, spacing: 1.2, color: index === 0 ? colors.goldLight : colors.gold });
    pdf.text(`${tier.label} (INR)`, x + 10, y + 17, tierWidth - 20,
      { font: "medium", size: 9, color: index === 0 ? colors.paper : colors.ink });
    doc.rect(x, y + headerHeight, tierWidth, rowHeight * 2).fill(index % 2 === 0 ? colors.warm : colors.cool);
    pdf.text(formatComparisonPaise(tier.subtotalPaise), x + 10, y + headerHeight + 8, tierWidth - 20,
      { align: "right", size: 11 });
    const delta = index > 0 && subtotal !== null && tier.subtotalPaise !== null
      ? BigInt(tier.subtotalPaise) - BigInt(subtotal) : null;
    const difference = delta === null ? "—" : `${delta > 0n ? "+" : ""}${formatComparisonPaise(delta)}`;
    pdf.text(difference, x + 10, y + headerHeight + rowHeight + 8, tierWidth - 20,
      { align: "right", size: 10, color: colors.muted });
  });
  pdf.text(scope, left + 11, y + headerHeight + 8, packageWidth - 22, { size: 11 });
  pdf.text("Difference from Mode", left + 11, y + headerHeight + rowHeight + 8, packageWidth - 22,
    { size: 10, color: colors.muted });
  doc.moveTo(left, totalY - rowHeight).lineTo(left + contentWidth, totalY - rowHeight)
    .strokeColor(colors.rule).lineWidth(0.5).stroke();
  doc.rect(left, totalY, contentWidth, 32).fill(colors.ink);
  pdf.text("Total excluding GST", left + 11, totalY + 8, packageWidth - 22,
    { font: "medium", size: 11, color: colors.paper });
  comparison.tiers.forEach((tier, index) => {
    const x = left + packageWidth + index * tierWidth;
    pdf.text(formatComparisonPaise(tier.subtotalPaise), x + 10, totalY + 8, tierWidth - 20,
      { font: "medium", size: 12, color: colors.goldLight, align: "right" });
  });
  pdf.text("SELECTED SCOPE", left, totalY + 52, contentWidth, { size: 7, spacing: 1.4, color: colors.gold });
  const context = `${comparison.roomName} · ${comparison.mainBasketName} / ${comparison.subBasketName ?? "Direct items"}`;
  pdf.text(context, left, totalY + 66, contentWidth, { font: "heading", size: 17 });
  pdf.text("Prices are shown in INR for the selected quantities. Mode retains the current line choices.", left, totalY + 98, contentWidth,
    { size: 9, color: colors.muted });
  if (comparison.tiers.some(tier => tier.subtotalPaise === null)) {
    pdf.text("An incomplete option requires a price for every included line. See the bill of quantities for details.",
      left, totalY + 113, contentWidth, { size: 9, color: colors.muted });
  }
}

/** Comparison PDFs are transient downloads, independent of immutable proposal publication. */
export async function renderEstimateTierComparisonPdf(comparison: EstimateTierComparison): Promise<Buffer> {
  const pdf = await ComparisonPdf.create(comparison.roomName);
  drawComparisonCover(pdf, comparison);
  drawComparisonOverview(pdf, comparison);
  drawComparisonCommercial(pdf, comparison);
  drawComparisonBoq(pdf, comparison);
  return pdf.finish();
}

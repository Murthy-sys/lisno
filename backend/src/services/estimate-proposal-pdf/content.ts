import { allocateEstimatePayables } from "../../domain/estimate-gst-presentation.js";
import { recordedPaise, formatPdfPaise, estimatePdfTax, pdfPayableAmounts } from "../estimate-pdf-pricing.js";
import { estimateAggregateLineAmountIsValid } from "../../domain/estimate-aggregate-pricing.js";
import { estimateTotalsReconcile } from "../../domain/estimate-total-rounding.js";
import type { EstimatePdfInput, EstimatePdfLine } from "../estimate-pdf.service.js";
import { estimateComponentLineAmountIsValid } from "../../domain/estimate-component-pricing.js";
import { estimateDimensionSnapshotValid } from "../../domain/estimate-dimension-snapshot.js";
import { estimatePdfCatalogue } from "../../domain/estimate-pdf-catalogue.js";
import { isKnowledgeModeTier } from "../../domain/ai-estimator-knowledge-mode-tiers.js";
import { estimatePmcPaymentsAreValid } from "../../domain/estimate-pmc-payment-split.js";

export interface ProposalLine { title: string; description: string; paymentBreakdown?: string[]; unit: string; quantity: string; rate: string; amountPaise: number; }
export interface ProposalGroup { id: string; title: string; lines: ProposalLine[]; amountPaise: number; }
export function money(paise: number, symbol = true): string {
  return `${symbol ? "₹ " : ""}${formatPdfPaise(paise)}`;
}
export function dateLabel(value: string, dateOnly = false) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(dateOnly ? `${value}T00:00:00+05:30` : value));
}
export function proposalTotals(input: EstimatePdfInput) {
  const subtotal = recordedPaise(input.subtotalPaise, input.subtotal), gst = recordedPaise(input.gstPaise, input.gst), total = recordedPaise(input.totalPaise, input.total);
  if (!estimateTotalsReconcile({ subtotalPaise: subtotal, gstPaise: gst, totalPaise: total, roundOffPaise: input.roundOffPaise })) {
    throw new TypeError("The proposal totals do not reconcile.");
  }
  if (!estimatePmcPaymentsAreValid(input, { projected: true })) throw new TypeError("The proposal PMC payments do not reconcile.");
  return { subtotal, gst, total: input.pmcPaymentSummary?.customerTotalPayablePaise ?? total, roundOff: input.roundOffPaise ?? 0 };
}
function row(line: EstimatePdfLine, ungrouped: boolean, grossAmount: number, tax: ReturnType<typeof estimatePdfTax>): ProposalLine {
  if (!Number.isFinite(line.quantity) || line.quantity < 0 || !estimateDimensionSnapshotValid(line) || line.modeTier !== undefined && !isKnowledgeModeTier(line.modeTier)) throw new TypeError("The proposal has invalid saved item details.");
  const aggregate = estimateAggregateLineAmountIsValid(line);
  const component = line.pricingBasis !== undefined;
  if (component && !aggregate && !estimateComponentLineAmountIsValid(line)) throw new TypeError("The proposal has invalid saved component amounts.");
  if (line.source === "configuration" && (!Number.isSafeInteger(line.amountPaise) || !component && !Number.isSafeInteger(line.ratePaise))) throw new TypeError("The proposal needs complete saved configured prices.");
  const title = line.source === "configuration" ? line.mainLineName || line.mainLineId || line.catalogueId : estimatePdfCatalogue.get(line.catalogueId)?.description || line.catalogueId;
  const details: string[] = [];
  if (ungrouped && line.roomName) details.push(`Room: ${line.roomName}`);
  if (line.source === "configuration") {
    if (line.itemType === "temporary") details.push("Temporary item");
    if (line.mainBasketName || line.subBasketName) details.push([line.mainBasketName, line.subBasketName].filter(Boolean).join(" · "));
    if (line.modeTier) details.push(`Tier: ${line.modeTier[0].toUpperCase()}${line.modeTier.slice(1)}`);
  }
  if (line.specification) details.push(line.specification);
  if (line.dimensions) details.push(`L ${line.dimensions.length} × W ${line.dimensions.width} × H ${line.dimensions.height}${line.dimensionRule ? ` ${line.dimensionRule.inputUnit}` : ""}`);
  details.push(...line.estimateNotes ?? []);
  if (component && !aggregate) {
    const parts = line.componentPricing!.components;
    const net = recordedPaise(line.amountPaise, line.amount);
    const shares = allocateEstimatePayables(parts.flatMap(part => [part.laborSellingPaise, part.materialSellingPaise]),
      { subtotalPaise: net, gstPaise: grossAmount - net });
    parts.forEach((part, index) => {
      const labor = shares[index * 2]!, material = shares[index * 2 + 1]!;
      details.push(`${[part.basketName, part.subBasketName].filter(Boolean).join(" / ")}: labour ${money(labor)}, material ${money(material)}, total ${money(labor + material)}`);
    });
  }
  const split = line.pmcPaymentSplit;
  const paymentBreakdown = split ? [
    `PMC estimated value: ${money(split.totalPayablePaise)}`,
    `Payable to Lisno · ${split.marginBps / 100}% of estimated value: ${money(split.lisnoPayablePaise)}`,
    `Payable to vendor · remaining ${(10000 - split.marginBps) / 100}%: ${money(split.vendorPayablePaise)}`,
    "Percentage applied before tax; amounts include all taxes."
  ] : undefined;
  const rate = aggregate ? "Included" : component ? "Components" : money(allocateEstimatePayables([recordedPaise(line.ratePaise, line.rate)], tax)[0]!, false);
  return { title, description: details.join(" · "), ...(paymentBreakdown ? { paymentBreakdown } : {}), unit: line.uomCode || line.unit,
    quantity: new Intl.NumberFormat("en-IN", { maximumFractionDigits: line.source === "configuration" ? 6 : 2 }).format(line.quantity),
    rate: split ? `Vendor\n${rate}` : rate, amountPaise: split?.totalPayablePaise ?? grossAmount };
}
export function proposalGroups(input: EstimatePdfInput): ProposalGroup[] {
  for (const identity of [input.lead.clientName, input.lead.projectName]) {
    if (!identity.trim() || Array.from(identity).length > 200) throw new TypeError("A proposal identity is too long to lay out safely (maximum 200 characters).");
  }
  const groups = new Map<string, ProposalGroup>();
  const baskets = new Map<string, Map<string, ProposalLine[]>>();
  const included = input.lineItems.filter(line => line.included);
  const payables = pdfPayableAmounts(input, included), tax = estimatePdfTax(input);
  for (const [index, line] of included.entries()) {
    if (Array.from(line.roomName).length > 200) throw new TypeError("A proposal room name is too long to lay out safely (maximum 200 characters).");
    const roomId = line.roomId || "__unassigned__";
    const id = line.roomId ? `room:${roomId}` : roomId;
    const group = groups.get(id) ?? { id, title: line.roomId ? line.roomName : "Additional items", lines: [], amountPaise: 0 };
    const item = row(line, !line.roomId, payables[index]!, tax);
    const next = BigInt(group.amountPaise) + BigInt(item.amountPaise);
    if (next > BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError("The proposal section amount exceeds the supported range.");
    group.amountPaise = Number(next);
    const roomBaskets = baskets.get(id) ?? new Map<string, ProposalLine[]>();
    const basketId = line.mainBasketId ? `basket:${line.mainBasketId}` : "__legacy__";
    const lines = roomBaskets.get(basketId) ?? []; lines.push(item); roomBaskets.set(basketId, lines);
    baskets.set(id, roomBaskets); groups.set(id, group);
  }
  for (const group of groups.values()) group.lines = [...baskets.get(group.id)!.values()].flat();
  return [...groups.values()];
}
export function sectionLetter(index: number) {
  let result = "", value = index + 1;
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
}

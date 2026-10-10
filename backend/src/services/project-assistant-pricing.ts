import { z } from "zod";
import type { AssistantAdditionRequest, AssistantCatalogueCandidate, AssistantCommercialSnapshot, AssistantPriceLine, AssistantRecommendation } from "../contracts/project-chat-assistant.js";
import type { KnowledgeModeCalculationSettings } from "../contracts/ai-estimator-knowledge.js";
import { canonicalizeScaledDecimal, deriveTaxAmounts, parseScaledDecimal } from "../domain/ai-estimator-knowledge-calculation.js";
import { AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY } from "../domain/ai-estimator-knowledge-fixed-gst.js";
import { calculateKnowledgeInHousePrice, calculateKnowledgeModePrice, calculateKnowledgePmcPrice, calculateKnowledgeSubVendorPrice } from "../domain/ai-estimator-knowledge-mode-calculation.js";
import { ApiError } from "../middleware/errors.js";

export interface AssistantPricingSource {
  candidate: AssistantCatalogueCandidate;
  /** Server-only, never spread into a tool result. */
  advanced: Record<string, unknown> | null;
  temporary: boolean;
}
export interface AssistantApprovedScope {
  state: "none" | "approved" | "unavailable";
  totalPaise: number | null;
  rooms: { id: string; name: string }[];
  lines: { mainLineId: string; roomId: string; pricingMode: "pmc" | "sub_vendor" | "in_house" | null; included: boolean }[];
}
export interface AssistantPricingReads {
  lines(ids: string[]): Promise<Map<string, AssistantPricingSource>>;
  recommendations(ids: string[]): Promise<AssistantRecommendation[]>;
}

const id = z.string().trim().min(1).max(200);
export const assistantAdditionSchema = z.object({ lines: z.array(z.object({
  mainLineId: id, roomId: id.nullable(), quantity: z.string().max(40).nullable(),
  pricingMode: z.enum(["pmc", "sub_vendor", "in_house"]).nullable(), additiveConfirmed: z.boolean(), optional: z.boolean()
}).strict()).min(1).max(8) }).strict();
const key = (line: { mainLineId: string; roomId: string | null }) => JSON.stringify([line.mainLineId, line.roomId]);
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function sum(values: number[]): number {
  const total = values.reduce((amount, value) => amount + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsupported amount");
  return Number(total);
}

/** All arithmetic is canonical Configuration selling arithmetic, with no model-provided prices. */
export function assistantSellingAmount(source: AssistantPricingSource, mode: AssistantPriceLine["pricingMode"], quantity: string): number {
  if (!source.candidate.available || source.temporary || !source.advanced) throw new Error("Current calculation unavailable");
  const advanced = source.advanced;
  const modes = object(advanced.modeCalculations);
  if (!modes) throw new Error("Mode settings unavailable");
  const common = { quantity, quantityScale: source.candidate.uom.decimalScale };
  if (mode === "in_house") {
    if (Object.hasOwn(modes, "in_house_labor") || Object.hasOwn(modes, "in_house_material")) {
      const labor = object(modes.in_house_labor);
      const material = object(modes.in_house_material);
      if (!labor || !material) throw new Error("Split settings incomplete");
      return calculateKnowledgeInHousePrice({ labor: labor as unknown as KnowledgeModeCalculationSettings,
        material: material as unknown as KnowledgeModeCalculationSettings, ...common, markupBasis: "starting" }).totalPaise;
    }
    const legacy = object(modes.in_house);
    if (!legacy) throw new Error("Mode settings unavailable");
    // A historical combined In-house setting is one amount, never duplicated into both costs.
    return calculateKnowledgeModePrice({ ...legacy as unknown as KnowledgeModeCalculationSettings, ...common, markupBasis: "starting" }).totalPaise;
  }
  const settings = object(modes[mode]);
  if (!settings || typeof settings.baseRatePaise !== "number" || typeof settings.lowQuantityLimit !== "string") throw new Error("Mode settings unavailable");
  const inputs = { ...common, baseRatePaise: settings.baseRatePaise, lowQuantityLimit: settings.lowQuantityLimit,
    ...(settings.impactBps === undefined ? {} : { impactBps: settings.impactBps as number }) };
  return mode === "pmc"
    ? calculateKnowledgePmcPrice({ ...inputs, pmcMarginBps: advanced.pmcMarginBps as number }).totalPaise
    : calculateKnowledgeSubVendorPrice({ ...inputs, subVendorMarginBps: advanced.subVendorMarginBps as number }).totalPaise;
}

export async function calculateAssistantAddition(request: AssistantAdditionRequest, approved: AssistantApprovedScope, reads: AssistantPricingReads): Promise<AssistantCommercialSnapshot> {
  const parsed = assistantAdditionSchema.safeParse(request);
  if (!parsed.success) throw new ApiError(400, "ASSISTANT_INPUT_INVALID", "Choose up to eight Main Lines with valid quantities and room references.");
  const inputs = new Map<string, AssistantAdditionRequest["lines"][number]>();
  const globalMissing = new Set<string>();
  const assumptions = new Set<string>(["Approximate additions at current Configuration selling prices; the team must confirm scope and charges.", "GST is calculated once on the included addition subtotal. Optional additions are excluded."]);
  for (const line of parsed.data.lines) {
    const previous = inputs.get(key(line));
    if (previous && JSON.stringify(previous) !== JSON.stringify(line)) {
      globalMissing.add(`Clarify duplicate quantities or specifications for Main Line ${line.mainLineId} in this room.`);
      inputs.set(key(line), { ...previous, quantity: null });
    } else inputs.set(key(line), line);
  }
  const visited = new Set<string>();
  const sources = new Map<string, AssistantPricingSource>();
  const requiredProblems = new Set<string>();
  let frontier = [...inputs.values()];
  for (let depth = 0; frontier.length; depth++) {
    if (depth >= 5 || inputs.size > 32) {
      requiredProblems.add("The recommendation chain needs review by the estimating team."); break;
    }
    const ids = [...new Set(frontier.map(line => line.mainLineId))];
    for (const [lineId, source] of await reads.lines(ids)) sources.set(lineId, source);
    const rules = await reads.recommendations(ids);
    const next: typeof frontier = [];
    for (const input of frontier) {
      const inputKey = key(input);
      if (visited.has(inputKey)) continue;
      visited.add(inputKey);
      for (const rule of rules.filter(rule => rule.sourceMainLineId === input.mainLineId)) {
        const required = rule.requirement === "must" && !input.optional;
        if ((!rule.available || rule.completionRequired || rule.unavailableChildCount > 0) && required) {
          requiredProblems.add(`Required recommendation ${rule.ruleId} is incomplete or unavailable; the estimating team must complete it.`);
        }
        for (const target of rule.targetMainLineIds) {
          const targetKey = key({ mainLineId: target, roomId: input.roomId });
          // Existing included scope satisfies a configured relationship without adding the same allowance again.
          if (approved.state === "approved" && input.roomId && approved.lines.some(line => line.included && line.mainLineId === target && line.roomId === input.roomId)) continue;
          const existing = inputs.get(targetKey);
          if (existing) {
            if (required && existing.optional) { existing.optional = false; visited.delete(targetKey); next.push(existing); }
            continue;
          }
          if (inputs.size >= 32) { if (required) requiredProblems.add("The recommendation chain needs review by the estimating team."); continue; }
          const added = { mainLineId: target, roomId: input.roomId, quantity: null, pricingMode: null,
            additiveConfirmed: false, optional: !required };
          inputs.set(targetKey, added); next.push(added);
          assumptions.add(`${required ? "Required" : "Optional"} Main Line ${target} comes from recommendation ${rule.ruleId}; its quantity must be confirmed independently.`);
        }
      }
    }
    frontier = next;
  }
  // Cycles terminate by stable line/room identity; quantities and unlike UOMs are never inherited.
  const output: AssistantPriceLine[] = [];
  if (approved.state === "unavailable") globalMissing.add("The approved scope could not be verified. The estimating team must check existing allowances before confirming additions.");
  for (const input of inputs.values()) {
    const source = sources.get(input.mainLineId);
    const candidate = source?.candidate;
    const missing: string[] = [];
    const included = approved.lines.filter(line => line.included && line.mainLineId === input.mainLineId && (input.roomId === null || line.roomId === input.roomId));
    const existingModes = new Set(included.flatMap(line => line.pricingMode ? [line.pricingMode] : []));
    const mode = input.pricingMode ?? (existingModes.size === 1 ? [...existingModes][0]! : "sub_vendor");
    if (input.pricingMode === null && included.some(line => line.pricingMode === null)) missing.push("Confirm the pricing mode for this existing approved item.");
    if (input.pricingMode === null && existingModes.size > 1) missing.push("Confirm the pricing mode; the approved items use different modes.");
    if (!input.pricingMode && existingModes.size === 0) assumptions.add(`Main Line ${input.mainLineId} uses Standard/Sub-Vendor because no mode was specified.`);
    if (!candidate || !candidate.available || source?.temporary) missing.push("Current Main Line configuration is unavailable or incomplete; the estimating team must review it.");
    if (!input.roomId) missing.push("Confirm the room for this addition.");
    else if (!approved.rooms.some(room => room.id === input.roomId)) missing.push("Confirm this room with the project team before pricing it.");
    if (included.length && !input.additiveConfirmed) missing.push("This item is already included. Confirm extra quantity, a replacement, or a different room; no replacement credit is assumed.");
    let quantity: string | null = input.quantity;
    if (quantity === null) missing.push(`Provide quantity in ${candidate?.uom.code ?? "the configured UOM"}.`);
    else if (candidate) {
      try {
        if (parseScaledDecimal(quantity, candidate.uom.decimalScale) <= 0n) throw new Error("Zero quantity");
        quantity = canonicalizeScaledDecimal(quantity, candidate.uom.decimalScale);
      } catch { missing.push(`Provide a positive quantity with up to ${candidate.uom.decimalScale} decimal places in ${candidate.uom.code}.`); }
    }
    let amountPaise: number | null = null;
    if (!missing.length && source && quantity !== null) {
      try { amountPaise = assistantSellingAmount(source, mode, quantity); }
      catch { missing.push("The selected mode cannot currently be priced for this quantity. The estimating team must review its configuration."); }
    }
    output.push({ mainLineId: input.mainLineId, roomId: input.roomId, name: candidate?.name ?? "Unavailable Main Line",
      quantity, uom: candidate?.uom.code ?? "Unavailable", pricingMode: mode, optional: input.optional,
      amountPaise, revisionId: candidate?.revisionId ?? "", missingInputs: missing });
  }
  for (const problem of requiredProblems) globalMissing.add(problem);
  const required = output.filter(line => !line.optional);
  for (const line of required) for (const missing of line.missingInputs) globalMissing.add(`${line.name}: ${missing}`);
  const complete = globalMissing.size === 0 && required.length > 0 && required.every(line => line.amountPaise !== null);
  const priced = required.flatMap(line => line.amountPaise === null ? [] : [line.amountPaise]);
  let subtotalPaise: number | null = null;
  let gstPaise: number | null = null;
  let totalPaise: number | null = null;
  let optionalSubtotalPaise: number | null = null;
  let hypotheticalTotalPaise: number | null = null;
  try {
    optionalSubtotalPaise = sum(output.filter(line => line.optional).flatMap(line => line.amountPaise === null ? [] : [line.amountPaise]));
    if (priced.length) {
      subtotalPaise = sum(priced);
      const tax = deriveTaxAmounts({ inputAmountPaise: subtotalPaise, rateBps: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.rateBps, treatment: "exclusive" });
      gstPaise = tax.taxAmountPaise;
      if (complete) totalPaise = tax.totalAmountPaise;
    }
    if (totalPaise !== null && approved.state === "approved" && approved.totalPaise !== null &&
      [...inputs.values()].filter(line => !line.optional).every(line => line.additiveConfirmed)) {
      hypotheticalTotalPaise = sum([approved.totalPaise, totalPaise]);
      assumptions.add("The combined amount is hypothetical and is not a revised approved estimate.");
    }
  } catch {
    subtotalPaise = null; gstPaise = null; totalPaise = null; optionalSubtotalPaise = null; hypotheticalTotalPaise = null;
    globalMissing.add("The requested amount exceeds the supported calculation range. The estimating team must review it.");
  }
  if (totalPaise === null && subtotalPaise !== null) assumptions.add("This is a partial subtotal; incomplete required additions are not included in it.");
  return { currency: "INR", policy: "configuration-selling-v1", state: totalPaise !== null ? "complete" : subtotalPaise !== null ? "partial" : "clarification_required",
    lines: output, subtotalPaise, gstRateBps: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.rateBps, gstPaise, totalPaise,
    optionalSubtotalPaise, approvedBaselinePaise: approved.state === "approved" ? approved.totalPaise : null, hypotheticalTotalPaise,
    assumptions: [...assumptions], missingInputs: [...globalMissing] };
}

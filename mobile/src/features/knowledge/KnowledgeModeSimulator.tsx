import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Field } from "./knowledgeDetailUi";
import type { KnowledgePreviewRequest } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeModeCalculationDraft } from "../../../../shared/knowledge/knowledgeCalculationTypes";
import { MODE_CALCULATION_LABELS, parseModeCalculationDraft, parseModeQuantity, type ModeCalculationScope } from "../../../../shared/knowledge/knowledgeModeCalculation";
import { pmcMarginRange, pmcMarginRangeIssues, subVendorMarginRange, subVendorMarginRangeIssues } from "../../../../shared/knowledge/knowledgePmcMargin";
import { formatKnowledgeMoney, formatKnowledgePercentage } from "../../../../shared/knowledge/knowledgePresentation";
import { combinedInHouseMaximumDiscountBps, reconcilesInHouseCalculation } from "../../../../shared/knowledge/knowledgeInHouseCalculation";
import { reconcilesMarginCalculation } from "../../../../shared/knowledge/knowledgeMarginCalculation";
import { parseSimulatorDiscount, SIMULATOR_DISCOUNT_LIMIT_MESSAGE } from "../../../../shared/knowledge/knowledgeSimulatorDiscount";
import type { KnowledgeJsonObject, KnowledgePreview } from "../../../../shared/knowledge/knowledgeTypes";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeCard, KnowledgeChoice, KnowledgeModal, KnowledgeText, knowledgeStyles } from "./knowledgeDetailUi";

export interface NativeModeUom { readonly id: string; readonly label: string; readonly scale: number | undefined }
export type SimulatorScope = ModeCalculationScope | "in_house_total";
interface Props {
  readonly scope: SimulatorScope;
  readonly context: KnowledgeMobileContext;
  readonly payload: KnowledgeJsonObject;
  readonly initialDrafts: Readonly<Record<ModeCalculationScope, KnowledgeModeCalculationDraft>>;
  readonly uom: NativeModeUom;
  readonly onClose: () => void;
}
export interface NativeModeSimulationInput {
  readonly scope: SimulatorScope;
  readonly payload: KnowledgeJsonObject;
  readonly drafts: Readonly<Record<ModeCalculationScope, KnowledgeModeCalculationDraft>>;
  readonly uom: NativeModeUom;
  readonly quantity: string;
  readonly discount: string;
  readonly basis: "starting" | "minimum";
}

/** Server results only; shared reconcilers validate the selected mode, units and discount. */
export async function runNativeModeSimulation(input: NativeModeSimulationInput, preview: KnowledgeMobileContext["api"]["previewKnowledge"], signal: AbortSignal): Promise<KnowledgePreview> {
  const { scope, uom, drafts, basis, payload } = input;
  if (!uom.id || uom.scale === undefined) throw new Error("Save a UOM in Overview before calculating.");
  const quantity = parseModeQuantity(input.quantity, uom.scale);
  if (quantity === undefined) throw new Error(`Enter a non-negative quantity with up to ${uom.scale} decimal places.`);
  const usesMargin = scope === "pmc" || scope === "sub_vendor";
  const discount = parseSimulatorDiscount(input.discount, undefined, usesMargin ? scope : "in_house");
  if (discount.bps === undefined) throw new Error(discount.error);
  const common = { quantity, quantityScale: uom.scale };
  const settings = (cost: ModeCalculationScope) => {
    const usesConfiguredRange = cost === "pmc" || cost === "sub_vendor";
    // PMC and Sub-Vendor use their separate margin range, not legacy generic markup fields.
    const parsed = parseModeCalculationDraft(usesConfiguredRange ? { ...drafts[cost], minimumRate: "0", startingRate: "0" } : drafts[cost], uom.scale!, !usesConfiguredRange);
    if (!parsed.settings) throw new Error(Object.values(parsed.errors)[0] ?? "Review the calculation settings.");
    return parsed.settings;
  };
  let request: KnowledgePreviewRequest;
  if (usesMargin) {
    const range = scope === "pmc" ? pmcMarginRange(payload) : subVendorMarginRange(payload);
    const issues = scope === "pmc" ? pmcMarginRangeIssues(payload) : subVendorMarginRangeIssues(payload);
    const margin = basis === "minimum" ? range.minimum : range.maximum;
    if (issues.length || typeof range.minimum !== "number" || typeof range.maximum !== "number" || typeof margin !== "number") throw new Error(issues[0]?.message ?? "Set the margin range in the configuration before testing.");
    const values = settings(scope);
    const rates = { baseRatePaise: values.baseRatePaise, lowQuantityLimit: values.lowQuantityLimit, impactBps: values.impactBps ?? 1000 };
    request = { ...common, modeCalculationDiscountBps: discount.bps, ...(scope === "pmc" ? { pmcCalculation: { ...rates, pmcMarginBps: margin } } : { subVendorCalculation: { ...rates, subVendorMarginBps: margin } }) };
    const result = await preview(request, { signal, showGlobalLoader: false });
    const normalized = scope === "pmc" ? result.pmcCalculation && { ...result.pmcCalculation, marginBps: result.pmcCalculation.pmcMarginBps, marginAmountPaise: result.pmcCalculation.pmcMarginAmountPaise }
      : result.subVendorCalculation && { ...result.subVendorCalculation, marginBps: result.subVendorCalculation.subVendorMarginBps, marginAmountPaise: result.subVendorCalculation.subVendorMarginAmountPaise };
    if (!normalized || normalized.marginBps !== margin || (normalized.discount?.rateBps ?? 0) !== discount.bps || !reconcilesMarginCalculation(normalized, scope, rates.impactBps, quantity, rates.lowQuantityLimit, uom.scale)) throw new Error("The server returned an incomplete or inconsistent calculation. Retry.");
    return result;
  }
  const total = scope === "in_house_total";
  const labor = settings(total ? "in_house_labor" : scope);
  const material = total ? settings("in_house_material") : undefined;
  request = { ...common, modeCalculationMarkupBasis: basis, ...(total ? { inHouseCalculation: { labor, material: material! } } : { modeCalculation: labor }) };
  const verify = (result: KnowledgePreview, discountBps: number) => {
    const costs = total ? result.inHouseCalculation && [result.inHouseCalculation.labor, result.inHouseCalculation.material] : result.modeCalculation && [result.modeCalculation];
    if (!costs || costs.some((cost, index) => !reconcilesInHouseCalculation(cost, index === 0 ? labor : material!, basis, discountBps, common))) throw new Error("The server returned an incomplete or inconsistent In-house calculation. Retry.");
    if (total && (!Number.isSafeInteger(result.inHouseCalculation!.totalPaise) || BigInt(result.inHouseCalculation!.totalPaise) !== costs.reduce((sum, cost) => sum + BigInt(cost.totalPaise), 0n))) throw new Error("The server returned an inconsistent In-house total. Retry.");
    return combinedInHouseMaximumDiscountBps(costs)!;
  };
  // Always obtain the server-derived cap for these exact inputs before discounting.
  const initial = await preview(request, { signal, showGlobalLoader: false });
  const maximum = verify(initial, 0);
  if (signal.aborted) throw new Error("Calculation cancelled.");
  if (discount.bps > maximum) throw new Error(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
  if (!discount.bps) return initial;
  const result = await preview({ ...request, modeCalculationDiscountBps: discount.bps }, { signal, showGlobalLoader: false });
  if (verify(result, discount.bps) !== maximum) throw new Error("The server returned a different maximum discount. Retry.");
  return result;
}

export function KnowledgeModeSimulator({ scope, context, payload, initialDrafts, uom, onClose }: Props) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [basis, setBasis] = useState<"starting" | "minimum">("starting");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; result?: KnowledgePreview; error?: string; busy: boolean }>({ key: "", busy: false });
  const sequence = useRef(0);
  const input = { scope, payload, drafts, uom, quantity, discount, basis };
  const key = JSON.stringify([context.scopeKey, input, retry]);
  const latest = useRef(input); latest.current = input;
  useEffect(() => {
    const controller = new AbortController();
    const request = ++sequence.current;
    setState({ key, busy: true });
    const timer = setTimeout(() => {
      runNativeModeSimulation(latest.current, context.api.previewKnowledge, controller.signal).then(result => {
        if (!controller.signal.aborted && sequence.current === request) setState({ key, result, busy: false });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && sequence.current === request) setState({ key, error: error instanceof Error ? error.message : "Calculation failed. Retry.", busy: false });
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, context.api]);
  const current: typeof state = state.key === key ? state : { key, busy: true };
  const usesMargin = scope === "pmc" || scope === "sub_vendor";
  const costs: readonly ModeCalculationScope[] = scope === "in_house_total" ? ["in_house_labor", "in_house_material"] : [scope];
  const fields: readonly (readonly [keyof KnowledgeModeCalculationDraft, string])[] = [
    ["baseRate", "Base Rate (₹)"], ["lowQuantityLimit", "Low Quantity Limit"], ["impactRate", "Impact (%)"],
    ...(!usesMargin ? [["minimumRate", "Min. Gross Margin (%)"], ["startingRate", "Starting Gross Margin (%)"]] as const : [])
  ];
  const result = current.result;
  return <KnowledgeModal title={`${scope === "in_house_total" ? "In-house total" : MODE_CALCULATION_LABELS[scope]}: Test calculations`} onClose={onClose}>
    <KnowledgeText>Calculations update automatically. Simulator changes are temporary and do not change your configuration.</KnowledgeText>
    <Field label="UOM" value={uom.label} editable={false} />
    <Field label="Quantity" value={quantity} keyboardType="decimal-pad" maxLength={64} onChangeText={setQuantity} />
    {costs.map(cost => <KnowledgeCard key={cost} title={MODE_CALCULATION_LABELS[cost]}>
      {fields.map(([field, label]) => <Field key={field} label={`${MODE_CALCULATION_LABELS[cost]} ${label}`} value={drafts[cost][field]} editable={!usesMargin} keyboardType="decimal-pad" maxLength={64} onChangeText={text => setDrafts(previous => ({ ...previous, [cost]: { ...previous[cost], [field]: text } }))} />)}
    </KnowledgeCard>)}
    <KnowledgeText>Calculate with</KnowledgeText>
    <View style={knowledgeStyles.row}>
      <KnowledgeChoice label={usesMargin ? "Max. margin" : "Starting Gross Margin"} selected={basis === "starting"} onPress={() => setBasis("starting")} />
      <KnowledgeChoice label={usesMargin ? "Min. margin" : "Min. Gross Margin"} selected={basis === "minimum"} onPress={() => setBasis("minimum")} />
    </View>
    <Field label="Discount (%)" value={discount} keyboardType="decimal-pad" maxLength={64} onChangeText={setDiscount} />
    <KnowledgeText>{scope === "pmc" ? "Discount applies only to the PMC charge." : "Discount applies to the selling price."} Impact applies at or below the Low Quantity Limit.</KnowledgeText>
    {current.busy ? <KnowledgeText>Calculating…</KnowledgeText> : null}
    {current.error ? <><KnowledgeText error>{current.error}</KnowledgeText><Button label="Retry calculation" variant="secondary" onPress={() => setRetry(value => value + 1)} /></> : null}
    {result ? <KnowledgeCard title="Calculation results">
      {result.pmcCalculation || result.subVendorCalculation ? (() => {
        const value = result.pmcCalculation ?? result.subVendorCalculation!;
        const margin = result.pmcCalculation?.pmcMarginAmountPaise ?? result.subVendorCalculation!.subVendorMarginAmountPaise;
        return <><Money label="Base amount" value={value.baseAmountPaise} /><Money label="Low quantity impact" value={value.lowQuantityImpactAmountPaise} /><Money label="Adjusted cost" value={value.revisedAmountPaise} /><Money label={scope === "pmc" ? "PMC charge" : "Lisno margin"} value={margin} /><Money label="Selling price before discount" value={value.totalBeforeDiscountPaise} /><Money label="Discount" value={value.discount?.amountPaise ?? 0} /><Money label="Final vendor charges" value={value.finalVendorChargesPaise} /><Money label="Total" value={value.totalPaise} /></>;
      })() : null}
      {result.modeCalculation ? <GrossResult result={result.modeCalculation} /> : null}
      {result.inHouseCalculation ? <><KnowledgeCard title="Labor cost"><GrossResult result={result.inHouseCalculation.labor} /></KnowledgeCard><KnowledgeCard title="Material cost"><GrossResult result={result.inHouseCalculation.material} /></KnowledgeCard><Money label="In-house total" value={result.inHouseCalculation.totalPaise} /></> : null}
    </KnowledgeCard> : null}
  </KnowledgeModal>;
}
function Money({ label, value }: { readonly label: string; readonly value: number }) { return <KnowledgeText>{label}: {value < 0 ? "−" : ""}{formatKnowledgeMoney(Math.abs(value))}</KnowledgeText>; }
function GrossResult({ result }: { readonly result: NonNullable<KnowledgePreview["modeCalculation"]> }) { return <><Money label="Revised unit rate" value={result.revisedUnitRatePaise} /><Money label="Adjusted cost" value={result.revisedAmountPaise} /><Money label="Floor price" value={result.floorPricePaise} /><KnowledgeText>Maximum discount: {formatKnowledgePercentage(result.maximumDiscountBps)}</KnowledgeText><Money label="Discount" value={result.discount?.amountPaise ?? 0} /><Money label="Total" value={result.totalPaise} /></>; }

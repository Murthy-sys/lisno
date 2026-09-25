import { reconcilesMarginCalculation, type MarginCalculationResult } from "../../../../shared/knowledge/knowledgeMarginCalculation";
import { useId, useState } from "react";

import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Radio } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { KnowledgeModeCalculationUom } from "./KnowledgeModeCalculationEditor";
import type { KnowledgeModeCalculationDraft, KnowledgeModeCalculationResult } from "./KnowledgeModeCalculationTable";
import { previewKnowledge, type KnowledgePreviewRequest } from "./knowledgeApi";
import { parseModeCalculationDraft, parseModeQuantity, type ModeCalculationScope } from "./knowledgeModeCalculation";
import { formatKnowledgeMoney, formatKnowledgePercentage, formatPaiseForRupeeInput, parseRupeeInputToPaise } from "./knowledgePresentation";
import { PMC_MARGIN_ERROR, SUB_VENDOR_MARGIN_ERROR, pmcMarginRange, pmcMarginRangeIssues, subVendorMarginRange, subVendorMarginRangeIssues } from "./knowledgePmcMargin";
import type { KnowledgeJsonValue, KnowledgePreview } from "./knowledgeTypes";
import { KnowledgeSimulatorDiscountField } from "./KnowledgeSimulatorDiscountField";
import { reconcilesInHouseCalculation } from "./knowledgeInHouseCalculation";
import { CUSTOM_SIMULATOR_DISCOUNT_MAX_BPS, parseSimulatorDiscount, SIMULATOR_DISCOUNT_LIMIT_MESSAGE } from "./knowledgeSimulatorDiscount";
import { useAutomaticKnowledgeCalculation } from "./useAutomaticKnowledgeCalculation";

interface Props {
  readonly scope?: ModeCalculationScope;
  readonly pmcMarginBps?: KnowledgeJsonValue;
  readonly pmcMinimumMarginBps?: KnowledgeJsonValue;
  readonly subVendorMarginBps?: KnowledgeJsonValue;
  readonly subVendorMinimumMarginBps?: KnowledgeJsonValue;
  readonly contextLabel?: string;
  readonly initialDraft: KnowledgeModeCalculationDraft;
  readonly uom: KnowledgeModeCalculationUom;
  readonly onClose: () => void;
}

function parseMarginRates(draft: KnowledgeModeCalculationDraft, scale: number) {
  const base = parseRupeeInputToPaise(draft.baseRate);
  const impact = parseRupeeInputToPaise(draft.impactRate);
  const limit = parseModeQuantity(draft.lowQuantityLimit, scale);
  const errors: Partial<Record<keyof KnowledgeModeCalculationDraft, string>> = {};
  if (base.status !== "valid") errors.baseRate = "Enter a non-negative rupee rate with up to two decimal places.";
  if (impact.status !== "valid" || impact.paise > Number.MAX_SAFE_INTEGER - 10_000) errors.impactRate = "Enter a supported non-negative percentage with up to two decimal places.";
  if (limit === undefined) errors.lowQuantityLimit = `Enter a non-negative limit with up to ${scale} decimal places.`;
  return { errors, settings: Object.keys(errors).length || base.status !== "valid" || impact.status !== "valid" || limit === undefined
    ? undefined : { baseRatePaise: base.paise, lowQuantityLimit: limit, impactBps: impact.paise } };
}

type SimulatorResult = { kind: "mode"; value: KnowledgeModeCalculationResult }
  | { kind: "margin"; value: MarginCalculationResult };


export function KnowledgeModeCalculationSimulator({ initialDraft, uom, onClose, contextLabel, scope, pmcMarginBps, pmcMinimumMarginBps, subVendorMarginBps, subVendorMinimumMarginBps }: Props) {
  const usesMargin = scope === "pmc" || scope === "sub_vendor";
  const marginLabel = scope === "sub_vendor" ? "Lisno" : "PMC";
  const calculationLabel = scope === "sub_vendor" ? "Sub-Vendor" : "PMC";
  const configuredRangePayload = scope === "pmc" ? {
    ...(pmcMarginBps === undefined ? {} : { pmcMarginBps }),
    ...(pmcMinimumMarginBps === undefined ? {} : { pmcMinimumMarginBps })
  } : {
    ...(subVendorMarginBps === undefined ? {} : { subVendorMarginBps }),
    ...(subVendorMinimumMarginBps === undefined ? {} : { subVendorMinimumMarginBps })
  };
  const configuredRange = scope === "pmc"
    ? pmcMarginRange(configuredRangePayload)
    : subVendorMarginRange(configuredRangePayload);
  const rangeIssues = scope === "pmc"
    ? pmcMarginRangeIssues(configuredRangePayload)
    : subVendorMarginRangeIssues(configuredRangePayload);
  const discountBasis = scope === "pmc" || scope === "sub_vendor" ? scope : "in_house";
  const id = useId();
  const [draft, setDraft] = useState(() => ({ ...initialDraft }));
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [markupBasis, setMarkupBasis] = useState<NonNullable<KnowledgePreviewRequest["modeCalculationMarkupBasis"]>>("starting");
  const [marginBasis, setMarginBasis] = useState<"minimum" | "maximum">("maximum");
  const scale = uom.decimalScale ?? 6;
  const parsedMode = parseModeCalculationDraft(draft, scale, !usesMargin);
  const parsedMargin = parseMarginRates(draft, scale);
  const parsed = usesMargin ? parsedMargin : parsedMode;
  const configuredMargin = usesMargin ? configuredRange[marginBasis] : undefined;
  const rangeReady = !rangeIssues.length && typeof configuredRange.minimum === "number" && typeof configuredRange.maximum === "number";
  const margin = typeof configuredMargin === "number" && rangeReady ? configuredMargin : undefined;
  const marginError = usesMargin && margin === undefined ? `Close this simulator and set the ${marginLabel} Margin range in the configuration. ${rangeIssues[0]?.message ?? (scope === "sub_vendor" ? SUB_VENDOR_MARGIN_ERROR : PMC_MARGIN_ERROR)}` : undefined;
  const testQuantity = parseModeQuantity(quantity, scale);
  const discountLimitKey = JSON.stringify({ scope, uomId: uom.id, uomScopeKey: uom.scopeKey, scale: uom.decimalScale, draft, quantity, markupBasis });
  const [modeDiscountLimit, setModeDiscountLimit] = useState<{ readonly key: string; readonly bps: number }>();
  const maximumDiscountBps = usesMargin ? CUSTOM_SIMULATOR_DISCOUNT_MAX_BPS
    : modeDiscountLimit?.key === discountLimitKey ? modeDiscountLimit.bps : undefined;
  const parsedDiscount = parseSimulatorDiscount(discount, maximumDiscountBps, discountBasis);
  const uomReady = Boolean(uom.id) && uom.decimalScale !== undefined;
  const inputKey = JSON.stringify({ scope, uomId: uom.id, uomScopeKey: uom.scopeKey, scale: uom.decimalScale,
    draft, quantity, discount, markupBasis, marginBasis, pmcMarginBps, pmcMinimumMarginBps, subVendorMarginBps, subVendorMinimumMarginBps });
  const { result, error, phase, settled: attempted, invalidate: clearResult, retry } = useAutomaticKnowledgeCalculation<SimulatorResult>({
    inputKey,
    enabled: Boolean(parsed.settings && (!usesMargin || margin !== undefined) && testQuantity !== undefined && uomReady && parsedDiscount.bps !== undefined),
    calculate
  });
  const errors = attempted ? {
    ...parsed.errors,
    ...(testQuantity === undefined ? { quantity: `Enter a non-negative quantity with up to ${scale} decimal places.` } : {})
  } : {};

  async function calculate(signal: AbortSignal): Promise<SimulatorResult> {
    const common = { quantity: testQuantity!, quantityScale: uom.decimalScale! };
    const request: KnowledgePreviewRequest = scope === "pmc"
      ? { ...common, ...(parsedDiscount.bps! > 0 ? { modeCalculationDiscountBps: parsedDiscount.bps! } : {}), pmcCalculation: { ...parsedMargin.settings!, pmcMarginBps: margin! } }
      : scope === "sub_vendor"
        ? { ...common, ...(parsedDiscount.bps! > 0 ? { modeCalculationDiscountBps: parsedDiscount.bps! } : {}), subVendorCalculation: { ...parsedMargin.settings!, subVendorMarginBps: margin! } }
        : { ...common, ...(parsedDiscount.bps! > 0 ? { modeCalculationDiscountBps: parsedDiscount.bps! } : {}), modeCalculation: parsedMode.settings!, modeCalculationMarkupBasis: markupBasis };
    const needsCapProbe = !usesMargin && maximumDiscountBps === undefined && parsedDiscount.bps! > 0;
    const preview = await previewKnowledge(needsCapProbe
      ? { ...common, modeCalculation: parsedMode.settings!, modeCalculationMarkupBasis: markupBasis }
      : request, { signal, showGlobalLoader: false });
    if (usesMargin) {
      // Normalize presentation labels only; all amounts must come from the requested server branch.
      const calculation: MarginCalculationResult | undefined = scope === "sub_vendor"
        ? preview.subVendorCalculation && { ...preview.subVendorCalculation,
          marginBps: preview.subVendorCalculation.subVendorMarginBps, marginAmountPaise: preview.subVendorCalculation.subVendorMarginAmountPaise }
        : preview.pmcCalculation && { ...preview.pmcCalculation,
          marginBps: preview.pmcCalculation.pmcMarginBps, marginAmountPaise: preview.pmcCalculation.pmcMarginAmountPaise };
      if (!calculation) throw new Error(`The server did not return a ${calculationLabel} calculation. Please try again.`);
      if (calculation.marginBps !== margin || (calculation.discount?.rateBps ?? 0) !== parsedDiscount.bps) {
        throw new Error(`The server returned a different ${marginLabel} margin or discount. Please calculate again.`);
      }
      if (!reconcilesMarginCalculation(calculation, scope === "pmc" ? "pmc" : "sub_vendor", parsedMargin.settings!.impactBps, testQuantity!, parsedMargin.settings!.lowQuantityLimit, scale)) {
        throw new Error(`The server returned an incomplete or inconsistent ${marginLabel} breakdown. Please calculate again.`);
      }
      return { kind: "margin", value: calculation };
    } else {
      let calculation = preview.modeCalculation;
      let expectedMaximum = maximumDiscountBps;
      if (!calculation) throw new Error("The server did not return a calculation. Please try again.");

      // When inputs changed while a discount remains entered, first obtain the new server-derived cap.
      if (needsCapProbe) {
        if (!reconcilesInHouseCalculation(calculation, parsedMode.settings!, markupBasis, 0,
          { quantity: testQuantity!, quantityScale: scale })) {
          throw new Error("The server returned an incomplete or inconsistent In-house calculation. Please try again.");
        }
        const cap = calculation.maximumDiscountBps;
        expectedMaximum = cap;
        setModeDiscountLimit({ key: discountLimitKey, bps: cap });
        if (parsedDiscount.bps! > cap) throw new Error(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
        const discountedPreview = await previewKnowledge(request, { signal, showGlobalLoader: false });
        calculation = discountedPreview.modeCalculation;
        if (!calculation) throw new Error("The server did not return a calculation. Please try again.");
      }
      if (!reconcilesInHouseCalculation(calculation, parsedMode.settings!, markupBasis, parsedDiscount.bps!,
        { quantity: testQuantity!, quantityScale: scale })) {
        throw new Error("The server returned an incomplete or inconsistent In-house calculation. Please try again.");
      }
      if (expectedMaximum !== undefined && calculation.maximumDiscountBps !== expectedMaximum) {
        throw new Error("The server returned a different maximum selling-price discount. Please calculate again.");
      }
      setModeDiscountLimit({ key: discountLimitKey, bps: calculation.maximumDiscountBps });
      return { kind: "mode", value: calculation };
    }
  }

  function editable(field: keyof KnowledgeModeCalculationDraft, label: string) {
    return <Field id={`${id}-${field}`} label={label} error={errors[field]}>
      {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64}
        value={draft[field]} readOnly={usesMargin} onChange={(event) => { if (usesMargin) return; clearResult(); setDraft({ ...draft, [field]: event.target.value }); }} />}
    </Field>;
  }

  return <ContextPanel title="Test calculations" eyebrow={contextLabel ? `${contextLabel} calculation simulator` : "Calculation simulator"}
    description={usesMargin ? `Test Quantity and Discount using the current ${calculationLabel} configuration. Calculations update automatically. Simulator changes are temporary.` : "Try different values using the current configuration. Calculations update automatically. Simulator changes are temporary."}
    onClose={onClose}
      width="wide"
      className="knowledge-context-panel"
      footer={({ requestClose }) => (
        <div className="knowledge-dialog-actions">
        <Button variant="quiet" onClick={requestClose}>Close</Button>
      </div>
      )}>
    <form id={`${id}-form`} className={`knowledge-mode-simulator${usesMargin ? " knowledge-mode-simulator--pmc" : ""}`} onSubmit={(event) => event.preventDefault()} noValidate>
      <div className="knowledge-dialog-body">
        <div className="knowledge-mode-simulator__fields">
          <Field id={`${id}-uom`} label="UOM">
            {(props) => <Input {...props} value={uom.label} readOnly />}
          </Field>
          {editable("impactRate", "Impact (%)")}
          {editable("baseRate", "Base Rate (₹)")}
          <Field id={`${id}-quantity`} label="Quantity" error={errors.quantity}>
            {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64}
              value={quantity} onChange={(event) => { clearResult(); setQuantity(event.target.value); }} />}
          </Field>
          {editable("lowQuantityLimit", "Low Quantity Limit")}
          {usesMargin ? <div className="knowledge-mode-simulator__margin-range">
            {(["minimum", "maximum"] as const).map((basis) => {
              const value = configuredRange[basis];
              return <Field key={basis} id={`${id}-${basis}-margin`} label={`${basis === "minimum" ? "Min." : "Max."} ${marginLabel} Margin (%)`} error={marginError}>
                {(props) => <Input {...props} value={typeof value === "number" && Number.isSafeInteger(value) && value >= 0
                  ? formatPaiseForRupeeInput(value) : typeof value === "string" ? value : ""} readOnly placeholder="Not configured" />}
              </Field>;
            })}
          </div> : <>
            {editable("startingRate", "Starting Gross Margin (%)")}
            {editable("minimumRate", "Min. Gross Margin (%)")}
          </>}
        </div>
        {!uomReady ? <InlineMessage tone="warning" title="UOM required">
          {uom.message ?? "Save a UOM in Overview before calculating."}
          {uom.onRetry ? <Button variant="quiet" onClick={uom.onRetry}>Retry UOM</Button> : null}
        </InlineMessage> : null}
        {usesMargin ? <fieldset className="knowledge-mode-simulator__markup">
          <legend>Calculate with</legend>
          <label><Radio name={`${id}-margin-basis`} value="maximum" checked={marginBasis === "maximum"}
            onChange={() => { clearResult(); setMarginBasis("maximum"); }} /> Max. {marginLabel} Margin</label>
          <label><Radio name={`${id}-margin-basis`} value="minimum" checked={marginBasis === "minimum"}
            onChange={() => { clearResult(); setMarginBasis("minimum"); }} /> Min. {marginLabel} Margin</label>
        </fieldset> : !usesMargin ? <fieldset className="knowledge-mode-simulator__markup">
          <legend>Calculate with</legend>
          <label><Radio name={`${id}-markup`} value="starting" checked={markupBasis === "starting"}
            onChange={() => { clearResult(); setMarkupBasis("starting"); }} /> Starting Gross Margin</label>
          <label><Radio name={`${id}-markup`} value="minimum" checked={markupBasis === "minimum"}
            onChange={() => { clearResult(); setMarkupBasis("minimum"); }} /> Min. Gross Margin</label>
        </fieldset> : null}
        <KnowledgeSimulatorDiscountField value={discount} onChange={(value) => { clearResult(); setDiscount(value); }}
          maximumBps={maximumDiscountBps} attempted={attempted} basis={discountBasis} />
        <p className="knowledge-mode-calculation__hint">{scope === "sub_vendor"
          ? "Selling price = cost price ÷ (1 − Lisno margin %). Cost includes any low-quantity impact. Discount applies afterward. The configured Impact applies at or below the Low Quantity Limit. Update fixed values in the configuration."
          : usesMargin ? "Selling price = adjusted cost ÷ (1 − PMC margin %). Adjusted cost includes any low-quantity impact. Discount applies only to the PMC charge. The configured Impact applies at or below the Low Quantity Limit. Update fixed values in the configuration."
          : "Selling price = adjusted cost ÷ (1 − Gross Margin %). Impact applies at or below the Low Quantity Limit. The discount applies to the selling price."}</p>
        {phase === "waiting" || !attempted ? <p role="status">Updating calculation…</p> : phase === "calculating" ? <p role="status">Calculating…</p> : null}
        {error ? <InlineMessage tone="error" title="Calculation unavailable" role="alert">{error}
          <Button variant="quiet" onClick={retry}>Retry calculation</Button>
        </InlineMessage> : null}
        {result ? <div className="knowledge-mode-simulator__result" role="status" aria-label="Calculation results">
          {usesMargin ? <p>Calculated with {marginBasis === "minimum" ? "Min." : "Max."} {marginLabel} Margin.</p> : null}
          <dl className="knowledge-mode-calculation__totals">
            {result.kind === "margin" ? <>
              <div><dt>Base amount</dt><dd><output aria-label="Base amount">{formatKnowledgeMoney(result.value.baseAmountPaise)}</output></dd></div>
              {result.value.lowQuantityImpactAmountPaise > 0 ? <div><dt>Low-quantity impact ({formatKnowledgePercentage(result.value.appliedImpactBps)})</dt><dd><output aria-label="Low-quantity impact amount">+{formatKnowledgeMoney(result.value.lowQuantityImpactAmountPaise)}</output></dd></div> : null}
              <div className="knowledge-mode-simulator__subtotal"><dt>Total including low-quantity charges</dt><dd><output aria-label="Total including low-quantity charges">{formatKnowledgeMoney(result.value.revisedAmountPaise)}</output></dd></div>
              <div><dt>{scope === "pmc" ? "PMC charge" : `${marginLabel} margin`} ({formatKnowledgePercentage(result.value.marginBps)})</dt><dd><output aria-label={scope === "pmc" ? "PMC charge" : `${marginLabel} margin amount`}>+{formatKnowledgeMoney(result.value.marginAmountPaise)}</output></dd></div>
              <div className="knowledge-mode-simulator__subtotal"><dt>Selling price before discount</dt><dd><output aria-label="Selling price before discount">{formatKnowledgeMoney(result.value.totalBeforeDiscountPaise)}</output></dd></div>
              <div><dt>{scope === "pmc" ? "Discount on PMC charge" : "Discount"} ({formatKnowledgePercentage(result.value.discount?.rateBps ?? 0)})</dt><dd><output aria-label={scope === "pmc" ? "Discount on PMC charge" : "Discount amount"}>−{formatKnowledgeMoney(result.value.discount?.amountPaise ?? 0)}</output></dd></div>
              {scope === "pmc" ? <div><dt>Effective PMC charge</dt><dd><output aria-label="Effective PMC charge">{formatKnowledgeMoney(result.value.marginAmountPaise - (result.value.discount?.amountPaise ?? 0))}</output></dd></div> : null}
              <div className="knowledge-mode-simulator__final"><dt>Final total</dt><dd><output aria-label="Final total">{formatKnowledgeMoney(result.value.totalPaise)}</output></dd></div>
            </> : <>
            <div><dt>Revised Base Rate</dt><dd><output aria-label="Revised Base Rate">{formatKnowledgeMoney(result.value.revisedUnitRatePaise)}</output></dd></div>
            <div><dt>Revised amount</dt><dd><output aria-label="Revised amount">{formatKnowledgeMoney(result.value.revisedAmountPaise)}</output></dd></div>
            {result.value.discount && result.value.discount.rateBps > 0 ? <>
              <div><dt>Total before discount</dt><dd><output aria-label="Total before discount">{formatKnowledgeMoney(result.value.discount.totalBeforeDiscountPaise)}</output></dd></div>
              <div><dt>Discount ({formatKnowledgePercentage(result.value.discount.rateBps)})</dt><dd><output aria-label="Discount amount">{formatKnowledgeMoney(result.value.discount.amountPaise)}</output></dd></div>
            </> : null}
            <div><dt>{result.value.discount && result.value.discount.rateBps > 0 ? "Total after discount" : `Total with ${markupBasis === "starting" ? "Starting" : "Min."} Gross Margin`}</dt><dd><output aria-label={result.value.discount && result.value.discount.rateBps > 0 ? "Total after discount" : `Total with ${markupBasis === "starting" ? "Starting" : "Min."} Gross Margin`}>{formatKnowledgeMoney(result.value.totalPaise)}</output></dd></div>
            </>}
          </dl>
          <p className="knowledge-mode-calculation__hint">{result.value.appliedImpactBps > 0 ? `${formatKnowledgePercentage(result.value.appliedImpactBps)} low-quantity impact applied.` : "No low-quantity impact applied."}</p>
        </div> : null}
      </div>

    </form>
  </ContextPanel>;
}

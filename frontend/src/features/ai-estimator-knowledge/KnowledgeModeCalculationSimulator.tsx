import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Radio } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { KnowledgeModeCalculationUom } from "./KnowledgeModeCalculationEditor";
import type { KnowledgeModeCalculationDraft, KnowledgeModeCalculationResult } from "./KnowledgeModeCalculationTable";
import { previewKnowledge, type KnowledgePreviewRequest } from "./knowledgeApi";
import { parseModeCalculationDraft, parseModeQuantity, type ModeCalculationScope } from "./knowledgeModeCalculation";
import { formatKnowledgeMoney, formatKnowledgePercentage, formatPaiseForRupeeInput, parseRupeeInputToPaise } from "./knowledgePresentation";
import { PMC_MARGIN_ERROR, pmcMarginIssues } from "./knowledgePmcMargin";
import type { KnowledgeJsonValue, KnowledgePreview } from "./knowledgeTypes";
import { KnowledgeSimulatorDiscountField } from "./KnowledgeSimulatorDiscountField";
import { maximumPmcSimulatorDiscountBps, maximumSimulatorDiscountBps, parseSimulatorDiscount } from "./knowledgeSimulatorDiscount";

interface Props {
  readonly scope?: ModeCalculationScope;
  readonly pmcMarginBps?: KnowledgeJsonValue;
  readonly contextLabel?: string;
  readonly initialDraft: KnowledgeModeCalculationDraft;
  readonly uom: KnowledgeModeCalculationUom;
  readonly onClose: () => void;
}

function parsePmcRates(draft: KnowledgeModeCalculationDraft, scale: number) {
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
  | { kind: "pmc"; value: NonNullable<KnowledgePreview["pmcCalculation"]> };

function reconcilesPmcCalculation(calculation: NonNullable<KnowledgePreview["pmcCalculation"]>, configuredImpactBps: number, quantity: string, limit: string, scale: number) {
  const discountAmount = calculation.discount ? calculation.discount.amountPaise : 0;
  const amounts = [calculation.baseAmountPaise, calculation.lowQuantityImpactAmountPaise,
    calculation.revisedUnitRatePaise, calculation.revisedAmountPaise, calculation.pmcMarginAmountPaise,
    calculation.totalBeforeDiscountPaise, calculation.finalVendorChargesPaise, calculation.totalPaise, discountAmount];
  if (amounts.some((value) => !Number.isSafeInteger(value) || value < 0)) return false;
  const scaledQuantity = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  };
  const lowQuantityApplies = scaledQuantity(quantity) <= scaledQuantity(limit);
  if (calculation.appliedImpactBps !== (lowQuantityApplies ? configuredImpactBps : 0)
    || (!lowQuantityApplies && calculation.lowQuantityImpactAmountPaise !== 0)
    || (configuredImpactBps === 0 && calculation.lowQuantityImpactAmountPaise !== 0)) return false;
  if (calculation.discount && (!Number.isSafeInteger(calculation.discount.rateBps) || calculation.discount.rateBps < 0
    || calculation.discount.totalBeforeDiscountPaise !== calculation.totalBeforeDiscountPaise
    || (calculation.discount.rateBps === 0 && discountAmount !== 0))) return false;
  return BigInt(calculation.baseAmountPaise) + BigInt(calculation.lowQuantityImpactAmountPaise) === BigInt(calculation.revisedAmountPaise)
    && BigInt(calculation.revisedAmountPaise) + BigInt(calculation.pmcMarginAmountPaise) === BigInt(calculation.totalBeforeDiscountPaise)
    && BigInt(calculation.totalBeforeDiscountPaise) - BigInt(discountAmount) === BigInt(calculation.totalPaise)
    && BigInt(calculation.finalVendorChargesPaise) + BigInt(calculation.pmcMarginAmountPaise) === BigInt(calculation.totalPaise);
}

export function KnowledgeModeCalculationSimulator({ initialDraft, uom, onClose, contextLabel, scope, pmcMarginBps }: Props) {
  const isPmc = scope === "pmc";
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const requestSequence = useRef(0);
  const [draft, setDraft] = useState(() => ({ ...initialDraft }));
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [markupBasis, setMarkupBasis] = useState<NonNullable<KnowledgePreviewRequest["modeCalculationMarkupBasis"]>>("starting");
  const [attempted, setAttempted] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<SimulatorResult>();
  const [error, setError] = useState<string>();
  const scale = uom.decimalScale ?? 6;
  const parsedMode = parseModeCalculationDraft(draft, scale);
  const parsedPmc = parsePmcRates(draft, scale);
  const parsed = isPmc ? parsedPmc : parsedMode;
  const margin = typeof pmcMarginBps === "number" && !pmcMarginIssues(pmcMarginBps).length ? pmcMarginBps : undefined;
  const marginError = isPmc && margin === undefined ? `Close this simulator and set the PMC Margin in the configuration. ${PMC_MARGIN_ERROR}` : undefined;
  const testQuantity = parseModeQuantity(quantity, scale);
  const maximumDiscountBps = isPmc ? maximumPmcSimulatorDiscountBps(margin) : maximumSimulatorDiscountBps([draft], markupBasis);
  const parsedDiscount = parseSimulatorDiscount(discount, maximumDiscountBps, isPmc ? "pmc" : "markup");
  const uomReady = Boolean(uom.id) && uom.decimalScale !== undefined;
  const errors = attempted ? {
    ...parsed.errors,
    ...(testQuantity === undefined ? { quantity: `Enter a non-negative quantity with up to ${scale} decimal places.` } : {})
  } : {};

  // Closing, changing units, or opening another line invalidates any pending response.
  useEffect(() => () => { requestSequence.current += 1; }, []);

  function clearResult() {
    requestSequence.current += 1;
    setResult(undefined);
    setError(undefined);
    setCalculating(false);
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    clearResult();
    if (!parsed.settings || (isPmc && margin === undefined) || testQuantity === undefined || !uomReady || parsedDiscount.bps === undefined) {
      globalThis.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const sequence = requestSequence.current;
    setCalculating(true);
    try {
      const common = { quantity: testQuantity, quantityScale: uom.decimalScale!,
        ...(parsedDiscount.bps > 0 ? { modeCalculationDiscountBps: parsedDiscount.bps } : {}) };
      const request: KnowledgePreviewRequest = isPmc
        ? { ...common, pmcCalculation: { ...parsedPmc.settings!, pmcMarginBps: margin! } }
        : { ...common, modeCalculation: parsedMode.settings!, modeCalculationMarkupBasis: markupBasis };
      const preview = await previewKnowledge(request);
      if (sequence !== requestSequence.current) return;
      if (isPmc) {
        const calculation = preview.pmcCalculation;
        if (!calculation) throw new Error("The server did not return a PMC calculation. Please try again.");
        if (calculation.pmcMarginBps !== margin || (calculation.discount?.rateBps ?? 0) !== parsedDiscount.bps) {
          throw new Error("The server returned a different PMC margin or discount. Please calculate again.");
        }
        if (!reconcilesPmcCalculation(calculation, parsedPmc.settings!.impactBps, testQuantity, parsedPmc.settings!.lowQuantityLimit, scale)) {
          throw new Error("The server returned an incomplete or inconsistent PMC breakdown. Please calculate again.");
        }
        setResult({ kind: "pmc", value: calculation });
      } else {
        if (!preview.modeCalculation) throw new Error("The server did not return a calculation. Please try again.");
        if (parsedDiscount.bps > 0 && preview.modeCalculation.discount?.rateBps !== parsedDiscount.bps) {
          throw new Error("The server did not return the discounted calculation. Please try again.");
        }
        setResult({ kind: "mode", value: preview.modeCalculation });
      }
    } catch (failure) {
      if (sequence === requestSequence.current) setError(failure instanceof Error ? failure.message : "Please try calculating again.");
    } finally {
      if (sequence === requestSequence.current) setCalculating(false);
    }
  }

  function editable(field: keyof KnowledgeModeCalculationDraft, label: string) {
    return <Field id={`${id}-${field}`} label={label} error={errors[field]}>
      {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64}
        value={draft[field]} readOnly={isPmc} onChange={(event) => { if (isPmc) return; clearResult(); setDraft({ ...draft, [field]: event.target.value }); }} />}
    </Field>;
  }

  return <Dialog title="Test calculations" eyebrow={contextLabel ? `${contextLabel} calculation simulator` : "Calculation simulator"}
    description={isPmc ? "Test Quantity and Discount using the current PMC configuration. Simulator changes are temporary." : "Try different values using the current configuration. Simulator changes are temporary."}
    onClose={onClose}>
    <form ref={formRef} className={`knowledge-mode-simulator${isPmc ? " knowledge-mode-simulator--pmc" : ""}`} onSubmit={(event) => void calculate(event)} noValidate>
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
          {isPmc ? <Field id={`${id}-pmc-margin`} label="PMC Margin (%)" error={marginError}>
            {(props) => <Input {...props} value={margin === undefined ? typeof pmcMarginBps === "string" ? pmcMarginBps : "" : formatPaiseForRupeeInput(margin)} readOnly placeholder="Not configured" />}
          </Field> : <>
            {editable("startingRate", "Starting Gross Margin Markup (%)")}
            {editable("minimumRate", "Min. Gross Margin Markup (%)")}
          </>}
        </div>
        {!uomReady ? <InlineMessage tone="warning" title="UOM required">
          {uom.message ?? "Save a UOM in Overview before calculating."}
          {uom.onRetry ? <Button variant="quiet" onClick={uom.onRetry}>Retry UOM</Button> : null}
        </InlineMessage> : null}
        {!isPmc ? <fieldset className="knowledge-mode-simulator__markup">
          <legend>Calculate with</legend>
          <label><Radio name={`${id}-markup`} value="starting" checked={markupBasis === "starting"}
            onChange={() => { clearResult(); setMarkupBasis("starting"); }} /> Starting Gross Margin Markup</label>
          <label><Radio name={`${id}-markup`} value="minimum" checked={markupBasis === "minimum"}
            onChange={() => { clearResult(); setMarkupBasis("minimum"); }} /> Min. Gross Margin Markup</label>
        </fieldset> : null}
        <KnowledgeSimulatorDiscountField value={discount} onChange={(value) => { clearResult(); setDiscount(value); }}
          maximumBps={maximumDiscountBps} attempted={attempted} basis={isPmc ? "pmc" : "markup"} />
        <p className="knowledge-mode-calculation__hint">{isPmc ? "The configured Impact applies at or below the Low Quantity Limit. PMC margin is added to the base amount including the low-quantity charge. Update fixed values in the configuration." : "Impact applies only below the Low Quantity Limit. Markup is added to the revised amount."}</p>
        {calculating ? <p role="status">Calculating…</p> : null}
        {error ? <InlineMessage tone="error" title="Calculation unavailable" role="alert">{error}</InlineMessage> : null}
        {result ? <div className="knowledge-mode-simulator__result" role="status" aria-label="Calculation results">
          <dl className="knowledge-mode-calculation__totals">
            {result.kind === "pmc" ? <>
              <div><dt>Base amount</dt><dd><output aria-label="Base amount">{formatKnowledgeMoney(result.value.baseAmountPaise)}</output></dd></div>
              {result.value.lowQuantityImpactAmountPaise > 0 ? <div><dt>Low-quantity impact ({formatKnowledgePercentage(result.value.appliedImpactBps)})</dt><dd><output aria-label="Low-quantity impact amount">+{formatKnowledgeMoney(result.value.lowQuantityImpactAmountPaise)}</output></dd></div> : null}
              <div className="knowledge-mode-simulator__subtotal"><dt>Total including low-quantity charges</dt><dd><output aria-label="Total including low-quantity charges">{formatKnowledgeMoney(result.value.revisedAmountPaise)}</output></dd></div>
              <div><dt>PMC margin ({formatKnowledgePercentage(result.value.pmcMarginBps)})</dt><dd><output aria-label="PMC margin amount">+{formatKnowledgeMoney(result.value.pmcMarginAmountPaise)}</output></dd></div>
              <div className="knowledge-mode-simulator__subtotal"><dt>Subtotal after PMC margin</dt><dd><output aria-label="Subtotal after PMC margin">{formatKnowledgeMoney(result.value.totalBeforeDiscountPaise)}</output></dd></div>
              <div><dt>Discount ({formatKnowledgePercentage(result.value.discount?.rateBps ?? 0)})</dt><dd><output aria-label="Discount amount">−{formatKnowledgeMoney(result.value.discount?.amountPaise ?? 0)}</output></dd></div>
              <div className="knowledge-mode-simulator__vendor"><dt>Final vendor charges</dt><dd><output aria-label="Final vendor charges">{formatKnowledgeMoney(result.value.finalVendorChargesPaise)}</output></dd></div>
              <div className="knowledge-mode-simulator__final"><dt>Final total</dt><dd><output aria-label="Final total">{formatKnowledgeMoney(result.value.totalPaise)}</output></dd></div>
            </> : <>
            <div><dt>Revised Base Rate</dt><dd><output aria-label="Revised Base Rate">{formatKnowledgeMoney(result.value.revisedUnitRatePaise)}</output></dd></div>
            <div><dt>Revised amount</dt><dd><output aria-label="Revised amount">{formatKnowledgeMoney(result.value.revisedAmountPaise)}</output></dd></div>
            {result.value.discount && result.value.discount.rateBps > 0 ? <>
              <div><dt>Total before discount</dt><dd><output aria-label="Total before discount">{formatKnowledgeMoney(result.value.discount.totalBeforeDiscountPaise)}</output></dd></div>
              <div><dt>Discount ({formatKnowledgePercentage(result.value.discount.rateBps)})</dt><dd><output aria-label="Discount amount">{formatKnowledgeMoney(result.value.discount.amountPaise)}</output></dd></div>
              <div><dt>Effective markup</dt><dd><output aria-label="Effective markup">{formatKnowledgePercentage(result.value.discount.effectiveMarkupBps)}</output></dd></div>
            </> : null}
            <div><dt>{result.value.discount && result.value.discount.rateBps > 0 ? "Total after discount" : `Total with ${markupBasis} markup`}</dt><dd><output aria-label={result.value.discount && result.value.discount.rateBps > 0 ? "Total after discount" : `Total with ${markupBasis} markup`}>{formatKnowledgeMoney(result.value.totalPaise)}</output></dd></div>
            </>}
          </dl>
          {result.kind === "pmc" ? <p className="knowledge-mode-calculation__hint">Final vendor charges exclude the PMC margin shown above. Vendor charges + PMC margin = final total.</p> : null}
          <p className="knowledge-mode-calculation__hint">{result.value.appliedImpactBps > 0 ? `${formatKnowledgePercentage(result.value.appliedImpactBps)} low-quantity impact applied.` : "No low-quantity impact applied."}</p>
        </div> : null}
      </div>
      <div className="knowledge-dialog-actions">
        <Button variant="quiet" onClick={onClose}>Close</Button>
        <Button type="submit" variant="primary" busy={calculating} busyLabel="Calculating…" disabled={!uomReady}>Calculate</Button>
      </div>
    </form>
  </Dialog>;
}

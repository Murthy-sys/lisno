import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Radio } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { KnowledgeModeCalculationUom } from "./KnowledgeModeCalculationEditor";
import type { KnowledgeModeCalculationDraft, KnowledgeModeCalculationResult } from "./KnowledgeModeCalculationTable";
import { previewKnowledge, type KnowledgePreviewRequest } from "./knowledgeApi";
import { parseModeCalculationDraft, parseModeQuantity } from "./knowledgeModeCalculation";
import { formatKnowledgeMoney, formatKnowledgePercentage } from "./knowledgePresentation";
import { KnowledgeSimulatorDiscountField } from "./KnowledgeSimulatorDiscountField";
import { maximumSimulatorDiscountBps, parseSimulatorDiscount } from "./knowledgeSimulatorDiscount";

interface Props {
  readonly contextLabel?: string;
  readonly initialDraft: KnowledgeModeCalculationDraft;
  readonly uom: KnowledgeModeCalculationUom;
  readonly onClose: () => void;
}

export function KnowledgeModeCalculationSimulator({ initialDraft, uom, onClose, contextLabel }: Props) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const requestSequence = useRef(0);
  const [draft, setDraft] = useState(() => ({ ...initialDraft }));
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [markupBasis, setMarkupBasis] = useState<NonNullable<KnowledgePreviewRequest["modeCalculationMarkupBasis"]>>("starting");
  const [attempted, setAttempted] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<KnowledgeModeCalculationResult>();
  const [error, setError] = useState<string>();
  const scale = uom.decimalScale ?? 6;
  const parsed = parseModeCalculationDraft(draft, scale);
  const testQuantity = parseModeQuantity(quantity, scale);
  const maximumDiscountBps = maximumSimulatorDiscountBps([draft], markupBasis);
  const parsedDiscount = parseSimulatorDiscount(discount, maximumDiscountBps);
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
    if (!parsed.settings || testQuantity === undefined || !uomReady || parsedDiscount.bps === undefined) {
      globalThis.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const sequence = requestSequence.current;
    setCalculating(true);
    try {
      const preview = await previewKnowledge({ modeCalculation: parsed.settings,
        modeCalculationMarkupBasis: markupBasis, quantity: testQuantity, quantityScale: uom.decimalScale!,
        ...(parsedDiscount.bps > 0 ? { modeCalculationDiscountBps: parsedDiscount.bps } : {}) });
      if (sequence !== requestSequence.current) return;
      if (!preview.modeCalculation) throw new Error("The server did not return a calculation. Please try again.");
      if (parsedDiscount.bps > 0 && preview.modeCalculation.discount?.rateBps !== parsedDiscount.bps) {
        throw new Error("The server did not return the discounted calculation. Please try again.");
      }
      setResult(preview.modeCalculation);
    } catch (failure) {
      if (sequence === requestSequence.current) setError(failure instanceof Error ? failure.message : "Please try calculating again.");
    } finally {
      if (sequence === requestSequence.current) setCalculating(false);
    }
  }

  function editable(field: keyof KnowledgeModeCalculationDraft, label: string) {
    return <Field id={`${id}-${field}`} label={label} error={errors[field]}>
      {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64}
        value={draft[field]} onChange={(event) => { clearResult(); setDraft({ ...draft, [field]: event.target.value }); }} />}
    </Field>;
  }

  return <Dialog title="Test calculations" eyebrow={contextLabel ? `${contextLabel} calculation simulator` : "Calculation simulator"}
    description="Try different values using the current configuration. Simulator changes are temporary."
    onClose={onClose}>
    <form ref={formRef} className="knowledge-mode-simulator" onSubmit={(event) => void calculate(event)} noValidate>
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
          {editable("startingRate", "Starting Gross Margin Markup (%)")}
          {editable("minimumRate", "Min. Gross Margin Markup (%)")}
        </div>
        {!uomReady ? <InlineMessage tone="warning" title="UOM required">
          {uom.message ?? "Save a UOM in Overview before calculating."}
          {uom.onRetry ? <Button variant="quiet" onClick={uom.onRetry}>Retry UOM</Button> : null}
        </InlineMessage> : null}
        <fieldset className="knowledge-mode-simulator__markup">
          <legend>Calculate with</legend>
          <label><Radio name={`${id}-markup`} value="starting" checked={markupBasis === "starting"}
            onChange={() => { clearResult(); setMarkupBasis("starting"); }} /> Starting Gross Margin Markup</label>
          <label><Radio name={`${id}-markup`} value="minimum" checked={markupBasis === "minimum"}
            onChange={() => { clearResult(); setMarkupBasis("minimum"); }} /> Min. Gross Margin Markup</label>
        </fieldset>
        <KnowledgeSimulatorDiscountField value={discount} onChange={(value) => { clearResult(); setDiscount(value); }}
          maximumBps={maximumDiscountBps} attempted={attempted} />
        <p className="knowledge-mode-calculation__hint">Impact applies only below the Low Quantity Limit. Markup is added to the revised amount.</p>
        {calculating ? <p role="status">Calculating…</p> : null}
        {error ? <InlineMessage tone="error" title="Calculation unavailable" role="alert">{error}</InlineMessage> : null}
        {result ? <div className="knowledge-mode-simulator__result" role="status" aria-label="Calculation results">
          <dl className="knowledge-mode-calculation__totals">
            <div><dt>Revised Base Rate</dt><dd><output aria-label="Revised Base Rate">{formatKnowledgeMoney(result.revisedUnitRatePaise)}</output></dd></div>
            <div><dt>Revised amount</dt><dd><output aria-label="Revised amount">{formatKnowledgeMoney(result.revisedAmountPaise)}</output></dd></div>
            {result.discount && result.discount.rateBps > 0 ? <>
              <div><dt>Total before discount</dt><dd><output aria-label="Total before discount">{formatKnowledgeMoney(result.discount.totalBeforeDiscountPaise)}</output></dd></div>
              <div><dt>Discount ({formatKnowledgePercentage(result.discount.rateBps)})</dt><dd><output aria-label="Discount amount">{formatKnowledgeMoney(result.discount.amountPaise)}</output></dd></div>
              <div><dt>Effective markup</dt><dd><output aria-label="Effective markup">{formatKnowledgePercentage(result.discount.effectiveMarkupBps)}</output></dd></div>
            </> : null}
            <div><dt>{result.discount && result.discount.rateBps > 0 ? "Total after discount" : `Total with ${markupBasis} markup`}</dt><dd><output aria-label={result.discount && result.discount.rateBps > 0 ? "Total after discount" : `Total with ${markupBasis} markup`}>{formatKnowledgeMoney(result.totalPaise)}</output></dd></div>
          </dl>
          <p className="knowledge-mode-calculation__hint">{result.appliedImpactBps > 0 ? `${formatKnowledgePercentage(result.appliedImpactBps)} low-quantity impact applied.` : "No low-quantity impact applied."}</p>
        </div> : null}
      </div>
      <div className="knowledge-dialog-actions">
        <Button variant="quiet" onClick={onClose}>Close</Button>
        <Button type="submit" variant="primary" busy={calculating} busyLabel="Calculating…" disabled={!uomReady}>Calculate</Button>
      </div>
    </form>
  </Dialog>;
}

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Radio } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { KnowledgeModeCalculationUom } from "./KnowledgeModeCalculationEditor";
import { KnowledgeModeCalculationTable, type KnowledgeModeCalculationDraft } from "./KnowledgeModeCalculationTable";
import { previewKnowledge, type KnowledgePreviewRequest } from "./knowledgeApi";
import { modeCalculationDraft, modeCalculationIssues, parseModeCalculationDraft, parseModeQuantity } from "./knowledgeModeCalculation";
import { formatKnowledgeMoney, formatKnowledgePercentage } from "./knowledgePresentation";
import { KnowledgeSimulatorDiscountField } from "./KnowledgeSimulatorDiscountField";
import { maximumSimulatorDiscountBps, parseSimulatorDiscount } from "./knowledgeSimulatorDiscount";
import type { KnowledgeJsonValue, KnowledgePreview } from "./knowledgeTypes";

type Settings = NonNullable<KnowledgePreviewRequest["inHouseCalculation"]>;
type MarkupBasis = NonNullable<KnowledgePreviewRequest["modeCalculationMarkupBasis"]>;
type Result = NonNullable<KnowledgePreview["inHouseCalculation"]>;
interface TestResult { readonly preview: Result; readonly quantity: string; readonly markupBasis: MarkupBasis }
interface Props {
  readonly active: boolean;
  readonly labor: KnowledgeJsonValue | undefined;
  readonly material: KnowledgeJsonValue | undefined;
  readonly valid: boolean;
  readonly uom: KnowledgeModeCalculationUom;
}

export function KnowledgeInHouseTotal(props: Props) {
  // Reset temporary results and pending requests whenever either configuration or the saved UOM changes.
  const key = JSON.stringify([props.labor, props.material, props.valid, props.uom.scopeKey, props.uom.id, props.uom.decimalScale, props.uom.label]);
  return <InHouseTotalContent key={key} {...props} />;
}

function InHouseTotalContent({ active, labor, material, valid, uom }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<TestResult>();
  const settingsReady = valid && labor != null && material != null && !modeCalculationIssues(labor).length && !modeCalculationIssues(material).length;
  const uomReady = Boolean(uom.id) && uom.decimalScale !== undefined;
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  if (!active) return null;

  return <section className="knowledge-in-house-total" aria-labelledby={`${id}-title`}>
    <div className="knowledge-mode-calculation__header">
      <h3 id={`${id}-title`}>In-house total</h3>
      <div className="knowledge-mode-calculation__actions">
        {!uomReady && uom.onRetry ? <Button variant="secondary" onClick={uom.onRetry}>Retry UOM</Button> : null}
        <Button variant="secondary" disabled={!settingsReady || !uomReady} onClick={() => { setResult(undefined); setOpen(true); }}>Test In-house total</Button>
      </div>
    </div>
    {result ? <InHouseResult result={result} uomLabel={uom.label} /> : <>
      <dl className="knowledge-in-house-total__amounts">
        <div><dt>Labor total</dt><dd>—</dd></div>
        <div><dt>Material total</dt><dd>—</dd></div>
        <div><dt>Labor + Material total</dt><dd>—</dd></div>
      </dl>
      <p className="knowledge-mode-calculation__hint">{!settingsReady
        ? "Complete both Labor and Material calculation settings to test the total."
        : !uomReady ? uom.message ?? "Save a UOM in Overview to test the total."
          : "Test both costs with one quantity to see the combined total after Impact and markup."}</p>
    </>}
    {open && settingsReady && uomReady ? <InHouseSimulator
      settings={{ labor: labor as unknown as Settings["labor"], material: material as unknown as Settings["material"] }}
      uom={uom} onClose={() => setOpen(false)} onResult={setResult}
    /> : null}
  </section>;
}

function InHouseResult({ result, uomLabel }: { readonly result: TestResult; readonly uomLabel: string }) {
  return <div role="status" aria-label="In-house calculation results">
    <dl className="knowledge-in-house-total__amounts">
      <div><dt>Labor total</dt><dd><output aria-label="Labor total">{formatKnowledgeMoney(result.preview.labor.totalPaise)}</output></dd></div>
      <div><dt>Material total</dt><dd><output aria-label="Material total">{formatKnowledgeMoney(result.preview.material.totalPaise)}</output></dd></div>
      <div><dt>Labor + Material total</dt><dd><output aria-label="Labor + Material total">{formatKnowledgeMoney(result.preview.totalPaise)}</output></dd></div>
    </dl>
    <p className="knowledge-mode-calculation__hint">Simulator values · Quantity: {result.quantity} {uomLabel} · {result.markupBasis === "starting" ? "Starting" : "Minimum"} markup. Includes each cost’s Impact and markup.</p>
    {result.preview.labor.discount && result.preview.material.discount ? <p className="knowledge-mode-calculation__hint">
      Discount: {formatKnowledgePercentage(result.preview.labor.discount.rateBps)} · Effective markup: Labor {formatKnowledgePercentage(result.preview.labor.discount.effectiveMarkupBps)}, Material {formatKnowledgePercentage(result.preview.material.discount.effectiveMarkupBps)}. Totals include the discount.
    </p> : null}
  </div>;
}

function InHouseSimulator({ settings, uom, onClose, onResult }: {
  readonly settings: Settings;
  readonly uom: KnowledgeModeCalculationUom;
  readonly onClose: () => void;
  readonly onResult: (result: TestResult | undefined) => void;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const sequence = useRef(0);
  const [drafts, setDrafts] = useState(() => ({ labor: modeCalculationDraft(settings.labor), material: modeCalculationDraft(settings.material) }));
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [markupBasis, setMarkupBasis] = useState<MarkupBasis>("starting");
  const [attempted, setAttempted] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<TestResult>();
  const scale = uom.decimalScale!;
  const parsed = { labor: parseModeCalculationDraft(drafts.labor, scale), material: parseModeCalculationDraft(drafts.material, scale) };
  const testQuantity = parseModeQuantity(quantity, scale);
  const maximumDiscountBps = maximumSimulatorDiscountBps([drafts.labor, drafts.material], markupBasis);
  const parsedDiscount = parseSimulatorDiscount(discount, maximumDiscountBps);
  useEffect(() => () => { sequence.current += 1; }, []);

  function clearResult() {
    sequence.current += 1;
    setCalculating(false);
    setError(undefined);
    setResult(undefined);
    onResult(undefined);
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    clearResult();
    if (!parsed.labor.settings || !parsed.material.settings || testQuantity === undefined || parsedDiscount.bps === undefined) {
      globalThis.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const request = sequence.current;
    setCalculating(true);
    try {
      const preview = await previewKnowledge({
        inHouseCalculation: { labor: parsed.labor.settings, material: parsed.material.settings },
        quantity: testQuantity, quantityScale: scale, modeCalculationMarkupBasis: markupBasis,
        ...(parsedDiscount.bps > 0 ? { modeCalculationDiscountBps: parsedDiscount.bps } : {})
      });
      if (request !== sequence.current) return;
      if (!preview.inHouseCalculation?.labor || !preview.inHouseCalculation.material || !Number.isSafeInteger(preview.inHouseCalculation.totalPaise)) {
        throw new Error("The server did not return both costs. Please try calculating again.");
      }
      if (parsedDiscount.bps > 0 && (preview.inHouseCalculation.labor.discount?.rateBps !== parsedDiscount.bps || preview.inHouseCalculation.material.discount?.rateBps !== parsedDiscount.bps)) {
        throw new Error("The server did not return the discount for both costs. Please try again.");
      }
      const next = { preview: preview.inHouseCalculation, quantity: testQuantity, markupBasis };
      setResult(next);
      onResult(next);
    } catch (failure) {
      if (request === sequence.current) setError(failure instanceof Error ? failure.message : "Please try calculating again.");
    } finally {
      if (request === sequence.current) setCalculating(false);
    }
  }

  function change(cost: keyof Settings, field: keyof KnowledgeModeCalculationDraft, value: string) {
    clearResult();
    setDrafts((current) => ({ ...current, [cost]: { ...current[cost], [field]: value } }));
  }

  return <Dialog title="Test In-house total" eyebrow="Labor + Material simulator"
    description="Use one quantity and markup choice for both costs. All simulator changes are temporary." onClose={onClose}>
    <form className="knowledge-mode-simulator knowledge-in-house-simulator" ref={formRef} onSubmit={(event) => void calculate(event)} noValidate>
      <div className="knowledge-dialog-body">
        <div className="knowledge-mode-simulator__fields">
          <Field id={`${id}-uom`} label="UOM">{(props) => <Input {...props} value={uom.label} readOnly />}</Field>
          <Field id={`${id}-quantity`} label="Quantity" error={attempted && testQuantity === undefined ? `Enter a non-negative quantity with up to ${scale} decimal places.` : undefined}>
            {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64} value={quantity} onChange={(event) => { clearResult(); setQuantity(event.target.value); }} />}
          </Field>
        </div>
        {(["labor", "material"] as const).map((cost) => <KnowledgeModeCalculationTable key={cost}
          title={cost === "labor" ? "Labor cost" : "Material cost"} value={drafts[cost]} uomLabel={uom.label}
          readOnly={false} errors={attempted ? parsed[cost].errors : {}} onChange={(field, value) => change(cost, field, value)}
        />)}
        <fieldset className="knowledge-mode-simulator__markup">
          <legend>Calculate both costs with</legend>
          <label><Radio name={`${id}-markup`} checked={markupBasis === "starting"} value="starting" onChange={() => { clearResult(); setMarkupBasis("starting"); }} />Starting Gross Margin Markup</label>
          <label><Radio name={`${id}-markup`} checked={markupBasis === "minimum"} value="minimum" onChange={() => { clearResult(); setMarkupBasis("minimum"); }} />Min. Gross Margin Markup</label>
        </fieldset>
        <KnowledgeSimulatorDiscountField value={discount} onChange={(value) => { clearResult(); setDiscount(value); }}
          maximumBps={maximumDiscountBps} attempted={attempted} combined />
        {calculating ? <p role="status">Calculating both costs…</p> : null}
        {error ? <InlineMessage tone="error" title="In-house total unavailable" role="alert">{error}</InlineMessage> : null}
        {result ? <InHouseResult result={result} uomLabel={uom.label} /> : null}
      </div>
      <div className="knowledge-dialog-actions">
        <Button variant="quiet" onClick={onClose}>Close</Button>
        <Button type="submit" variant="primary" busy={calculating} busyLabel="Calculating…">Calculate total</Button>
      </div>
    </form>
  </Dialog>;
}

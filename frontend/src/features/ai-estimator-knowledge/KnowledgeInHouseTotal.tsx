import { useEffect, useId, useState } from "react";

import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Radio } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { KnowledgeModeCalculationUom } from "./KnowledgeModeCalculationEditor";
import { KnowledgeModeCalculationTable, type KnowledgeModeCalculationDraft } from "./KnowledgeModeCalculationTable";
import { previewKnowledge, type KnowledgePreviewRequest } from "./knowledgeApi";
import { combinedInHouseMaximumDiscountBps, reconcilesInHouseCalculation } from "./knowledgeInHouseCalculation";
import { modeCalculationDraft, modeCalculationIssues, parseModeCalculationDraft, parseModeQuantity } from "./knowledgeModeCalculation";
import { formatKnowledgeMoney, formatKnowledgePercentage } from "./knowledgePresentation";
import { KnowledgeSimulatorDiscountField } from "./KnowledgeSimulatorDiscountField";
import { parseSimulatorDiscount, SIMULATOR_DISCOUNT_LIMIT_MESSAGE } from "./knowledgeSimulatorDiscount";
import type { KnowledgeJsonValue, KnowledgePreview } from "./knowledgeTypes";
import { useAutomaticKnowledgeCalculation } from "./useAutomaticKnowledgeCalculation";

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
  const settingsReady = valid && labor != null && material != null
    && !modeCalculationIssues(labor, "modeCalculations.in_house_labor").length
    && !modeCalculationIssues(material, "modeCalculations.in_house_material").length;
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
        <div><dt>Labour expense</dt><dd>—</dd></div>
        <div><dt>Margin on labour</dt><dd>—</dd></div>
        <div><dt>Material expense</dt><dd>—</dd></div>
        <div><dt>Margin on material</dt><dd>—</dd></div>
        <div><dt>Total expense</dt><dd>—</dd></div>
        <div><dt>Total margin</dt><dd>—</dd></div>
        <div className="knowledge-in-house-total__subtotal"><dt>Subtotal</dt><dd>—</dd></div>
      </dl>
      <p className="knowledge-mode-calculation__hint">{!settingsReady
        ? "Complete both Labor and Material calculation settings to test the total."
        : !uomReady ? uom.message ?? "Save a UOM in Overview to test the total."
          : "Test both costs with one quantity to see the combined total after Impact and Gross Margin."}</p>
    </>}
    {open && settingsReady && uomReady ? <InHouseSimulator
      settings={{ labor: labor as unknown as Settings["labor"], material: material as unknown as Settings["material"] }}
      uom={uom} onClose={() => setOpen(false)} onResult={setResult}
    /> : null}
  </section>;
}

function InHouseResult({ result, uomLabel }: { readonly result: TestResult; readonly uomLabel: string }) {
  const labourMargin = result.preview.labor.totalPaise - result.preview.labor.revisedAmountPaise;
  const materialMargin = result.preview.material.totalPaise - result.preview.material.revisedAmountPaise;
  const totalExpense = result.preview.labor.revisedAmountPaise + result.preview.material.revisedAmountPaise;
  const totalMargin = labourMargin + materialMargin;
  return <div role="status" aria-label="In-house calculation results">
    <dl className="knowledge-in-house-total__amounts">
      <div><dt>Labour expense</dt><dd><output aria-label="Labour expense">{formatKnowledgeMoney(result.preview.labor.revisedAmountPaise)}</output></dd></div>
      <div><dt>Margin on labour</dt><dd><output aria-label="Margin on labour">{formatKnowledgeMoney(labourMargin)}</output></dd></div>
      <div><dt>Material expense</dt><dd><output aria-label="Material expense">{formatKnowledgeMoney(result.preview.material.revisedAmountPaise)}</output></dd></div>
      <div><dt>Margin on material</dt><dd><output aria-label="Margin on material">{formatKnowledgeMoney(materialMargin)}</output></dd></div>
      <div><dt>Total expense</dt><dd><output aria-label="Total expense">{formatKnowledgeMoney(totalExpense)}</output></dd></div>
      <div><dt>Total margin</dt><dd><output aria-label="Total margin">{formatKnowledgeMoney(totalMargin)}</output></dd></div>
      <div className="knowledge-in-house-total__subtotal"><dt>Subtotal</dt><dd><output aria-label="Subtotal">{formatKnowledgeMoney(result.preview.totalPaise)}</output></dd></div>
    </dl>
    <p className="knowledge-mode-calculation__hint">Simulator values · Quantity: {result.quantity} {uomLabel} · {result.markupBasis === "starting" ? "Starting" : "Min."} Gross Margin. Includes each cost’s Impact and gross margin.</p>
    {result.preview.labor.discount && result.preview.material.discount ? <p className="knowledge-mode-calculation__hint">
      Selling-price discount: {formatKnowledgePercentage(result.preview.labor.discount.rateBps)}. Totals include the discount while preserving both minimum Gross Margins.
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
  const [drafts, setDrafts] = useState(() => ({ labor: modeCalculationDraft(settings.labor), material: modeCalculationDraft(settings.material) }));
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [markupBasis, setMarkupBasis] = useState<MarkupBasis>("starting");
  const scale = uom.decimalScale!;
  const parsed = { labor: parseModeCalculationDraft(drafts.labor, scale), material: parseModeCalculationDraft(drafts.material, scale) };
  const testQuantity = parseModeQuantity(quantity, scale);
  const discountLimitKey = JSON.stringify({ drafts, quantity, markupBasis, uomScopeKey: uom.scopeKey, uomId: uom.id, scale: uom.decimalScale });
  const [discountLimit, setDiscountLimit] = useState<{ readonly key: string; readonly bps: number }>();
  const maximumDiscountBps = discountLimit?.key === discountLimitKey ? discountLimit.bps : undefined;
  const parsedDiscount = parseSimulatorDiscount(discount, maximumDiscountBps, "in_house");
  const inputKey = JSON.stringify([drafts.labor, drafts.material, quantity, discount, markupBasis,
    uom.scopeKey, uom.id, uom.decimalScale, uom.label]);
  const { result, error, phase, settled: attempted, invalidate, retry, cancel } = useAutomaticKnowledgeCalculation<TestResult>({
    inputKey,
    enabled: Boolean(parsed.labor.settings && parsed.material.settings && testQuantity !== undefined && parsedDiscount.bps !== undefined),
    calculate,
    onResult
  });

  async function calculate(signal: AbortSignal): Promise<TestResult> {
    if (!parsed.labor.settings || !parsed.material.settings || testQuantity === undefined || parsedDiscount.bps === undefined) {
      throw new Error("Complete both costs and enter a valid quantity and discount.");
    }
    async function request(discountBps: number): Promise<Result> {
      const preview = await previewKnowledge({
        inHouseCalculation: { labor: parsed.labor.settings!, material: parsed.material.settings! },
        quantity: testQuantity!, quantityScale: scale, modeCalculationMarkupBasis: markupBasis,
        ...(discountBps > 0 ? { modeCalculationDiscountBps: discountBps } : {})
      }, { signal, showGlobalLoader: false });
      if (!preview.inHouseCalculation?.labor || !preview.inHouseCalculation.material || !Number.isSafeInteger(preview.inHouseCalculation.totalPaise)) {
        throw new Error("The server did not return both costs. Please try calculating again.");
      }
      const { labor: laborResult, material: materialResult, totalPaise } = preview.inHouseCalculation;
      const calculationContext = { quantity: testQuantity!, quantityScale: scale };
      if (!reconcilesInHouseCalculation(laborResult, parsed.labor.settings!, markupBasis, discountBps, calculationContext)
        || !reconcilesInHouseCalculation(materialResult, parsed.material.settings!, markupBasis, discountBps, calculationContext)) {
        throw new Error("The server returned an incomplete or inconsistent In-house calculation. Please try again.");
      }
      const values = [laborResult.revisedAmountPaise, laborResult.totalPaise,
        materialResult.revisedAmountPaise, materialResult.totalPaise, totalPaise];
      const laborMargin = laborResult.totalPaise - laborResult.revisedAmountPaise;
      const materialMargin = materialResult.totalPaise - materialResult.revisedAmountPaise;
      const totalExpense = laborResult.revisedAmountPaise + materialResult.revisedAmountPaise;
      const totalMargin = laborMargin + materialMargin;
      if (values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
        !Number.isSafeInteger(laborMargin) || !Number.isSafeInteger(materialMargin) || laborMargin < 0 || materialMargin < 0 ||
        !Number.isSafeInteger(totalExpense) || !Number.isSafeInteger(totalMargin) ||
        BigInt(laborResult.totalPaise) + BigInt(materialResult.totalPaise) !== BigInt(totalPaise) ||
        BigInt(totalExpense) + BigInt(totalMargin) !== BigInt(totalPaise)) {
        throw new Error("The server returned an inconsistent In-house cost breakup. Please try again.");
      }
      return preview.inHouseCalculation;
    }

    const needsCapProbe = maximumDiscountBps === undefined && parsedDiscount.bps > 0;
    let calculation = await request(needsCapProbe ? 0 : parsedDiscount.bps);
    const returnedMaximum = combinedInHouseMaximumDiscountBps([calculation.labor, calculation.material]);
    if (returnedMaximum === undefined) throw new Error("The server did not return a valid maximum selling-price discount. Please try again.");
    setDiscountLimit({ key: discountLimitKey, bps: returnedMaximum });
    if (maximumDiscountBps !== undefined && returnedMaximum !== maximumDiscountBps) {
      throw new Error("The server returned a different maximum selling-price discount. Please calculate again.");
    }
    if (parsedDiscount.bps > returnedMaximum) throw new Error(SIMULATOR_DISCOUNT_LIMIT_MESSAGE);
    if (needsCapProbe) {
      calculation = await request(parsedDiscount.bps);
      if (combinedInHouseMaximumDiscountBps([calculation.labor, calculation.material]) !== returnedMaximum) {
        throw new Error("The server returned a different maximum selling-price discount. Please calculate again.");
      }
    }
    return { preview: calculation, quantity: testQuantity, markupBasis };
  }

  function change(cost: keyof Settings, field: keyof KnowledgeModeCalculationDraft, value: string) {
    invalidate();
    setDrafts((current) => ({ ...current, [cost]: { ...current[cost], [field]: value } }));
  }

  return <ContextPanel title="Test In-house total" eyebrow="Labor + Material simulator"
    description="Calculations update automatically. Use one quantity and Gross Margin choice for both costs. All simulator changes are temporary."
    onClose={() => { cancel(); onClose(); }}
      width="wide"
      className="knowledge-context-panel"
      footer={({ requestClose }) => (
        <div className="knowledge-dialog-actions">
        <Button variant="quiet" onClick={requestClose}>Close</Button>
      </div>
      )}>
    <form id={`${id}-form`} className="knowledge-mode-simulator knowledge-in-house-simulator" onSubmit={(event) => event.preventDefault()} noValidate>
      <div className="knowledge-dialog-body">
        <div className="knowledge-mode-simulator__fields">
          <Field id={`${id}-uom`} label="UOM">{(props) => <Input {...props} value={uom.label} readOnly />}</Field>
          <Field id={`${id}-quantity`} label="Quantity" error={attempted && testQuantity === undefined ? `Enter a non-negative quantity with up to ${scale} decimal places.` : undefined}>
            {(props) => <Input {...props} inputMode="decimal" autoComplete="off" maxLength={64} value={quantity} onChange={(event) => { invalidate(); setQuantity(event.target.value); }} />}
          </Field>
        </div>
        {(["labor", "material"] as const).map((cost) => <KnowledgeModeCalculationTable key={cost}
          title={cost === "labor" ? "Labor cost" : "Material cost"} value={drafts[cost]} uomLabel={uom.label}
          readOnly={false} errors={attempted ? parsed[cost].errors : {}} onChange={(field, value) => change(cost, field, value)}
        />)}
        <fieldset className="knowledge-mode-simulator__markup">
          <legend>Calculate both costs with</legend>
          <label><Radio name={`${id}-markup`} checked={markupBasis === "starting"} value="starting" onChange={() => { invalidate(); setMarkupBasis("starting"); }} />Starting Gross Margin</label>
          <label><Radio name={`${id}-markup`} checked={markupBasis === "minimum"} value="minimum" onChange={() => { invalidate(); setMarkupBasis("minimum"); }} />Min. Gross Margin</label>
        </fieldset>
        <KnowledgeSimulatorDiscountField value={discount} onChange={(value) => { invalidate(); setDiscount(value); }}
          maximumBps={maximumDiscountBps} attempted={attempted} combined basis="in_house" />
        {phase !== "idle" ? <p role="status">{phase === "waiting" ? "Updating calculation…" : "Calculating both costs…"}</p> : null}
        {error ? <InlineMessage tone="error" title="In-house total unavailable" role="alert">
          {error}
          <Button variant="secondary" onClick={retry}>Retry calculation</Button>
        </InlineMessage> : null}
        {result ? <InHouseResult result={result} uomLabel={uom.label} /> : null}
      </div>

    </form>
  </ContextPanel>;
}

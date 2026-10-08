import { useEffect, useRef, useState } from "react";

import type { PurchaseOrderModeDraftPreview, PurchaseOrderModeKey, PurchaseOrderModePriceReference, PurchaseOrderModeResolution, PurchaseOrderPreparationEstimateLine, PurchaseOrderPreparationItem, SavePurchaseOrderModeDecisionInput } from "./purchaseOrderApi";
import { formatPaise } from "../finance/ProjectFinancePanel";

export interface PurchaseOrderModeDraft {
  modeKind: "" | "pmc" | "execution" | "exception";
  executionSource: "" | "sub_vendor" | "in_house";
  quantity: string;
  discountPercent: string;
  markupBasis: "starting" | "minimum" | "";
  exceptionReason: string;
  recoveryReviewed: boolean;
  recoveryReason: string;
  recoveryAcknowledged: boolean;
}

type SaveModeSelectionInput = Omit<SavePurchaseOrderModeDecisionInput,
  "idempotencyKey" | "expectedEstimateSource" | "expectedRevisionDigest">;

const unavailableMode: PurchaseOrderModeResolution = {
  state: "unavailable", options: [], decision: null, preview: null, issues: [], revision: null, uom: null
};

export function modeDraftFromLine(line: PurchaseOrderPreparationEstimateLine): PurchaseOrderModeDraft {
  const decision = line.mode?.decision;
  return {
    modeKind: decision?.mode === "pmc" ? "pmc" : decision?.mode === "sub_vendor" || decision?.mode === "in_house" ? "execution" : decision?.exceptionReason ? "exception" : "",
    executionSource: decision?.mode === "sub_vendor" || decision?.mode === "in_house" ? decision.mode : "",
    quantity: decision?.quantity ?? "",
    discountPercent: String((decision?.discountBps ?? 0) / 100),
    markupBasis: decision?.markupBasis ?? "starting",
    exceptionReason: decision?.exceptionReason ?? "",
    recoveryReviewed: false,
    recoveryReason: "",
    recoveryAcknowledged: false
  };
}

function groupBy<T>(values: T[], keyFor: (value: T) => string, labelFor: (value: T) => string) {
  const groups = new Map<string, { key: string; label: string; values: T[] }>();
  for (const value of values) {
    const key = keyFor(value);
    const found = groups.get(key);
    if (found) found.values.push(value);
    else groups.set(key, { key, label: labelFor(value), values: [value] });
  }
  return [...groups.values()];
}

function Scope({ label, summary, initiallyOpen, className, children }: {
  label: string; summary?: string; initiallyOpen?: boolean; className: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(initiallyOpen));
  return <details className={className} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span>{label}</span>{summary ? <small>{summary}</small> : null}</summary>
    <div className="purchase-orders__estimate-scope-body">{children}</div>
  </details>;
}

function moneyOrDash(value: number | null | undefined) { return value == null ? "—" : formatPaise(value); }

function validQuantityForUom(value: string, scale: number | undefined): boolean {
  if (scale == null || !Number.isInteger(scale) || scale < 0) return false;
  const pattern = scale === 0 ? /^\d+$/u : new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`, "u");
  return pattern.test(value.trim()) && Number(value) > 0;
}

function selectedMode(draft: PurchaseOrderModeDraft): PurchaseOrderModeKey | null {
  if (draft.modeKind === "pmc") return "pmc";
  if (draft.modeKind === "execution") return draft.executionSource || null;
  return null;
}

function percent(bps: number) { return `${bps / 100}%`; }

function DraftCalculation({ state, lineLabel, unverified }: {
  state: { status: "loading" | "ready" | "error"; result?: PurchaseOrderModeDraftPreview; error?: string };
  lineLabel: string;
  unverified: boolean;
}) {
  const result = state.result;
  const preview = state.status === "ready" ? result?.preview : null;
  const calculationIssues = result?.issues.filter((issue) => !(unverified && issue.code === "PINNED_DIGEST_MISMATCH")) ?? [];
  return <section className="purchase-orders__draft-preview" aria-label={`${unverified ? "Current unverified saved values" : "Unsaved calculation"} preview for ${lineLabel}`} aria-live="polite">
    <div className="purchase-orders__benchmark-title"><strong>{unverified ? "Current unverified saved values preview" : "Unsaved calculation preview"}</strong>
      <small>{state.status === "loading" ? "Calculating…" : state.status === "error" ? "Preview unavailable" : preview ? `${preview.quantity} ${result?.uom?.code ?? "units"} · ${preview.formulaVersion}` : "Calculation unavailable"}</small></div>
    {unverified ? <p>Review these current saved rates and rules. They could not be verified against activation and remain internal until a reasoned decision is saved.</p> : null}
    {state.status === "loading" ? <p>Checking the saved rates and quantity rules for this selection.</p> : null}
    {state.status === "error" ? <p className="purchase-orders__field-error" role="alert">{state.error || "The calculation could not be loaded. Keep your draft and try again."}</p> : null}
    {state.status === "ready" && calculationIssues.length ? <ul className="purchase-orders__estimate-issues">{calculationIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul> : null}
    {preview ? <>
      <div className="purchase-orders__draft-preview-total"><span>Calculated selling for this main line</span><strong>{formatPaise(preview.sellingPaise)}</strong></div>
      <dl className="purchase-orders__draft-preview-summary">
        <div><dt>Base cost</dt><dd>{formatPaise(preview.baseCostPaise)}</dd></div>
        <div><dt>Adjusted cost</dt><dd>{formatPaise(preview.adjustedCostPaise)}</dd></div>
        <div><dt>Low quantity impact</dt><dd>{formatPaise(preview.lowQuantityImpactPaise)}</dd></div>
        <div><dt>Discount</dt><dd>{percent(preview.discountBps)} · {formatPaise(preview.discountAmountPaise)}</dd></div>
      </dl>
      <div className="purchase-orders__draft-preview-stages">{(result?.scopes ?? []).map((stage) => <section key={stage.scope} className="purchase-orders__draft-preview-stage">
        <h5>{stage.scope === "pmc" ? "PMC" : stage.scope === "sub_vendor" ? "Execution / Sub-vendor" : stage.scope === "in_house_labor" ? "Execution / In-house labor" : "Execution / In-house material"}</h5>
        <dl>
          <div><dt>Base rate × quantity</dt><dd>{formatPaise(stage.baseRatePaise)} × {preview.quantity} = {formatPaise(stage.baseSubtotalPaise)}</dd></div>
          <div><dt>Low quantity threshold</dt><dd>At or below {stage.lowQuantityLimit} {result?.uom?.code ?? "units"} · {stage.thresholdMet ? "Met" : "Not met"}</dd></div>
          <div><dt>Configured / applied impact</dt><dd>{percent(stage.configuredImpactBps)} / {percent(stage.appliedImpactBps)} · {formatPaise(stage.lowQuantityImpactPaise)}</dd></div>
          <div><dt>Adjusted rate and cost</dt><dd>{formatPaise(stage.adjustedUnitRatePaise)} per {result?.uom?.code ?? "unit"} · {formatPaise(stage.adjustedCostPaise)}</dd></div>
          <div><dt>Margin</dt><dd>{percent(stage.marginBps)} · {formatPaise(stage.marginAmountPaise)}</dd></div>
          <div><dt>Before discount</dt><dd>{formatPaise(stage.sellingBeforeDiscountPaise)}</dd></div>
          <div><dt>Discount basis / amount</dt><dd>{formatPaise(stage.discountBasisPaise)} / {formatPaise(stage.discountAmountPaise)}</dd></div>
          {stage.floorSellingPaise != null ? <div><dt>Minimum selling floor</dt><dd>{formatPaise(stage.floorSellingPaise)}</dd></div> : null}
          <div><dt>Calculated selling</dt><dd>{formatPaise(stage.sellingPaise)}</dd></div>
        </dl>
      </section>)}</div>
      <p>Internal calculation only. Supplier quantity, agreed rate, GST and payable amount are confirmed in the purchase items below.</p>
    </> : null}
  </section>;
}

function LineDetail({ line, items, canManage, frozen, canManageItems, itemsBusy, onAddItem, onEditItem, onRemoveItem, gstDrafts, onGstChange, commercialReasons, reasonRequiredIds, onCommercialReasonChange, draft, onDraftChange, onDiscardMode, onSaveMode,
  modeBusy, modeError, draftPreview, modeConflict, rateBusyItemId, rateErrorItemId, onUseRate }: {
  line: PurchaseOrderPreparationEstimateLine;
  items: PurchaseOrderPreparationItem[];
  canManage: boolean;
  frozen: boolean;
  canManageItems: boolean;
  itemsBusy: boolean;
  onAddItem: (line: PurchaseOrderPreparationEstimateLine, trigger: HTMLButtonElement) => void;
  onEditItem: (line: PurchaseOrderPreparationEstimateLine, item: PurchaseOrderPreparationItem, trigger: HTMLButtonElement) => void;
  onRemoveItem: (line: PurchaseOrderPreparationEstimateLine, item: PurchaseOrderPreparationItem, trigger: HTMLButtonElement) => void;
  gstDrafts: Record<string, string>;
  onGstChange: (id: string, value: string) => void;
  commercialReasons: Record<string, string>;
  reasonRequiredIds: Set<string>;
  onCommercialReasonChange: (id: string, value: string) => void;
  draft: PurchaseOrderModeDraft;
  onDraftChange: (draft: PurchaseOrderModeDraft) => void;
  onDiscardMode: () => void;
  onSaveMode: (input: SaveModeSelectionInput) => void;
  modeBusy: boolean;
  modeError: string | null;
  draftPreview?: { status: "loading" | "ready" | "error"; result?: PurchaseOrderModeDraftPreview; error?: string };
  modeConflict?: string;
  rateBusyItemId: string | null;
  rateErrorItemId: string | null;
  onUseRate: (line: PurchaseOrderPreparationEstimateLine, item: PurchaseOrderPreparationItem, reference: PurchaseOrderModePriceReference) => void;
}) {
  const [validation, setValidation] = useState("");
  const [confirmRateItemId, setConfirmRateItemId] = useState<string | null>(null);
  const pmcInputRef = useRef<HTMLInputElement>(null);
  const executionInputRef = useRef<HTMLInputElement>(null);
  const exceptionInputRef = useRef<HTMLInputElement>(null);
  const mode = line.mode ?? unavailableMode;
  const defaultDraft = modeDraftFromLine(line);
  const dirty = JSON.stringify(draft) !== JSON.stringify(defaultDraft);
  const actionable = line.included && typeof line.amountPaise === "number" && line.amountPaise > 0;
  const unverified = mode.integrity?.status === "mismatch" || mode.decision?.integrityBasis?.kind === "observed_unverified";
  const reviewingUnverified = unverified && draft.recoveryReviewed;
  const canException = actionable && (mode.options.length === 0 || Boolean(mode.decision?.exceptionReason));
  const modeAvailability = (key: PurchaseOrderModeKey) => {
    if (unverified) {
      if (!reviewingUnverified) return { available: false,
        issues: [{ code: "REVIEW_REQUIRED", message: "Review the current saved values before selecting this mode." }] };
      const candidate = mode.integrity?.candidateAvailability.find((option) => option.key === key);
      return candidate ?? { available: false,
        issues: [{ code: "MODE_UNAVAILABLE", message: "This mode is not available in the current saved values." }] };
    }
    return mode.availability?.find((option) => option.key === key)
      ?? (mode.options.some((option) => option.key === key)
        ? { available: true, issues: [] as Array<{ code: string; message: string }> }
        : { available: false, issues: [{ code: "MODE_UNAVAILABLE", message: "This mode is not configured for the saved revision." }] });
  };
  const pmcAvailability = modeAvailability("pmc");
  const subVendorAvailability = modeAvailability("sub_vendor");
  const inHouseAvailability = modeAvailability("in_house");
  const executionAvailable = subVendorAvailability.available || inHouseAvailability.available;
  useEffect(() => {
    if (!reviewingUnverified) return;
    (pmcAvailability.available ? pmcInputRef.current : executionAvailable ? executionInputRef.current : exceptionInputRef.current)?.focus();
  }, [reviewingUnverified, pmcAvailability.available, executionAvailable]);
  const controlsDisabled = !canManage || !actionable || frozen || modeBusy;
  const visibleModeIssues = mode.issues.filter((issue) => !(unverified && issue.code === "PINNED_DIGEST_MISMATCH"));
  const showModeAvailability = !unverified || reviewingUnverified;
  const stateLabel = !actionable ? "Reference only" : !line.mode ? "No saved configuration" : unverified ? (mode.decision?.integrityBasis ? "Unverified saved values" : "Saved values need review") : mode.state === "ready" ? "Calculated" : mode.state === "selection_required" ? "Mode needed"
    : mode.state === "exception" ? "Manual exception" : "Configuration unavailable";
  const lineLabel = line.mainLineName || (line.itemType === "temporary" ? "Temporary estimate item" : "Estimate main line");
  const lineContext = [line.roomName, line.mainBasketName, line.subBasketName, lineLabel].filter(Boolean).join(" / ");
  const linkedItemsNeedingReview = Math.max(0, line.itemIds.length - items.length);
  const eligibleItems = items.filter((item) => !item.blockers.some((blocker) => blocker.code === "ALREADY_ORDERED"));

  function chooseModeKind(modeKind: PurchaseOrderModeDraft["modeKind"]) {
    const quantity = draft.quantity || (validQuantityForUom(line.quantity, mode.uom?.decimalScale) ? line.quantity : "");
    onDraftChange({ ...draft, modeKind, executionSource: modeKind === "execution" ? (draft.modeKind === "execution" ? draft.executionSource : "") : "",
      quantity: modeKind === "pmc" || modeKind === "execution" ? quantity : draft.quantity,
      exceptionReason: modeKind === "exception" ? draft.exceptionReason : "" });
    setValidation("");
  }

  function saveMode() {
    setValidation("");
    if (modeConflict) { setValidation("This mode decision changed. Discard your draft and review the latest preparation."); return; }
    if (draft.modeKind === "exception") {
      if (draft.exceptionReason.trim().length < 10) { setValidation("Explain the historical exception in at least 10 characters."); return; }
      onSaveMode({ sourceLineItemKey: line.key, expectedVersion: mode.decision?.version ?? 0,
        mode: null, quantity: null, discountBps: 0, markupBasis: "starting", exceptionReason: draft.exceptionReason.trim() });
      return;
    }
    if (!draft.modeKind) {
      if (!mode.decision) { setValidation("Select a configured mode."); return; }
      onSaveMode({ sourceLineItemKey: line.key, expectedVersion: mode.decision.version,
        mode: null, quantity: null, discountBps: 0, markupBasis: "starting", exceptionReason: null });
      return;
    }
    const modeKey = selectedMode(draft);
    if (!modeKey) { setValidation("Choose Sub-vendor or In-house for Execution."); return; }
    if (!(unverified ? reviewingUnverified : mode.options.some((option) => option.key === modeKey)) || !modeAvailability(modeKey).available) {
      setValidation("The selected mode is no longer available. Review the saved configuration."); return;
    }
    const scale = mode.uom?.decimalScale;
    if (scale == null) { setValidation("The saved unit precision is unavailable. Refresh this line."); return; }
    if (!validQuantityForUom(draft.quantity, scale)) {
      setValidation(`Enter a positive calculation quantity with up to ${scale} decimal place${scale === 1 ? "" : "s"}.`); return;
    }
    const discount = draft.discountPercent.trim();
    const discountPattern = /^(?:\d{1,3})(?:\.\d{1,2})?$/u;
    const discountBps = discount ? Math.round(Number(discount) * 100) : undefined;
    if (discount && (!discountPattern.test(discount) || discountBps! > 10_000)) {
      setValidation("Enter a discount between 0 and 100 percent, with up to two decimal places."); return;
    }
    if (unverified) {
      if (!mode.integrity?.observedDigest || !draftPreview || draftPreview.status !== "ready" ||
        !draftPreview.result?.preview || draftPreview.result.integrity?.observedDigest !== mode.integrity.observedDigest) {
        setValidation("Review the current unverified calculation before saving this mode."); return;
      }
      if (draft.recoveryReason.trim().length < 10) {
        setValidation("Explain why these current saved values are being used in at least 10 characters."); return;
      }
      if (!draft.recoveryAcknowledged) {
        setValidation("Confirm that you reviewed the unverified saved values."); return;
      }
    }
    onSaveMode({ sourceLineItemKey: line.key, expectedVersion: mode.decision?.version ?? 0,
      mode: modeKey, quantity: draft.quantity.trim(), discountBps: discountBps ?? 0,
      markupBasis: draft.markupBasis || "starting",
      ...(unverified ? { recovery: { expectedObservedDigest: mode.integrity!.observedDigest,
        reason: draft.recoveryReason.trim(), acknowledge: true as const } } : {}) });
  }

  return <Scope className="purchase-orders__estimate-line" label={lineLabel}
    summary={`${line.included ? moneyOrDash(line.amountPaise) + " approved estimate" : "Excluded"} · ${line.itemIds.length} purchase item${line.itemIds.length === 1 ? "" : "s"} · ${stateLabel}`}>
    <div className="purchase-orders__estimate-line-meta">
      <span>Approved quantity: {line.quantity} {line.unit}</span>
      <span>Source: {line.source === "configuration" ? "Saved configuration" : "Legacy estimate"}</span>
      {mode.revision ? <span>Saved revision {mode.revision.version} ({mode.revision.status})</span> : null}
    </div>
    {!line.included ? <p className="purchase-orders__estimate-note">Excluded from the approved estimate. This line is reference only.</p>
      : !actionable ? <p className="purchase-orders__estimate-note">{line.amountPaise === 0 ? "Zero approved amount" : "No positive approved amount"}. This line is reference only.</p> : null}
    {actionable && canManageItems ? <div className="purchase-orders__item-toolbar">
      <button type="button" disabled={itemsBusy} aria-label={`Add purchase item under ${lineContext}`}
        onClick={(event) => onAddItem(line, event.currentTarget)}>Add purchase item</button>
    </div> : null}
    {!items.length && !linkedItemsNeedingReview ? <p className="purchase-orders__estimate-note">No vendor purchase item added yet. Add one separately when this line needs a supplier order.</p> : null}
    {linkedItemsNeedingReview > 0 ? <p className="purchase-orders__estimate-note">{linkedItemsNeedingReview} linked purchase item{linkedItemsNeedingReview === 1 ? "" : "s"} need{linkedItemsNeedingReview === 1 ? "s" : ""} assignment review below.</p> : null}
    {actionable && visibleModeIssues.length ? <ul className="purchase-orders__estimate-issues">{visibleModeIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul> : null}
    {actionable ? <div className="purchase-orders__mode-workspace">
      <div className="purchase-orders__mode-heading"><strong>Configured mode</strong><span>{stateLabel}</span></div>
      <p>Confirm the calculation quantity for this main line. It does not set any supplier order quantity or rate.</p>
      {unverified ? <div className="purchase-orders__integrity-review" role="status">
        <strong>Current saved Configuration values could not be verified against activation.</strong>
        <p>{mode.decision?.integrityBasis ? "A reasoned decision uses these unverified values. Any change needs a new review." : "Review the current saved values before selecting PMC or Execution. A mode decision does not add a vendor purchase item."}</p>
        {mode.decision?.integrityBasis ? <p>Saved buyer reason: {mode.decision.integrityBasis.reason}</p> : null}
        {canManage && !frozen && mode.integrity?.status === "mismatch" && !reviewingUnverified ? <button type="button" onClick={() => {
          onDraftChange({ ...draft, recoveryReviewed: true, recoveryReason: "", recoveryAcknowledged: false });
          setValidation("");
        }}>Review current saved values</button> : null}
      </div> : null}
      <fieldset className="purchase-orders__mode-choices" disabled={controlsDisabled}>
        <legend>Mode</legend>
        <div className="purchase-orders__mode-choice-list">
          <label className="purchase-orders__mode-choice"><input ref={pmcInputRef} type="radio" name={`purchase-order-mode-${line.key}`} value="pmc"
            checked={draft.modeKind === "pmc"} disabled={!pmcAvailability.available} onChange={() => chooseModeKind("pmc")} />
            <span><strong>PMC</strong><small>Project management calculation</small></span></label>
          <label className="purchase-orders__mode-choice"><input ref={executionInputRef} type="radio" name={`purchase-order-mode-${line.key}`} value="execution"
            checked={draft.modeKind === "execution"} disabled={!executionAvailable} onChange={() => chooseModeKind("execution")} />
            <span><strong>Execution</strong><small>Choose Sub-vendor or In-house below</small></span></label>
          {canException ? <label className="purchase-orders__mode-choice"><input ref={exceptionInputRef} type="radio" name={`purchase-order-mode-${line.key}`} value="exception"
            checked={draft.modeKind === "exception"} onChange={() => chooseModeKind("exception")} />
            <span><strong>Manual exception</strong><small>Requires a reason</small></span></label> : null}
          {mode.decision ? <label className="purchase-orders__mode-choice"><input type="radio" name={`purchase-order-mode-${line.key}`} value=""
            checked={draft.modeKind === ""} onChange={() => chooseModeKind("")} />
            <span><strong>Clear decision</strong><small>Remove the saved mode from this line</small></span></label> : null}
        </div>
      </fieldset>
      {showModeAvailability && !pmcAvailability.available ? <p className="purchase-orders__mode-unavailable">PMC unavailable: {pmcAvailability.issues.map((issue) => issue.message).join(" ")}</p> : null}
      {showModeAvailability && !executionAvailable ? <p className="purchase-orders__mode-unavailable">Execution unavailable: {[...subVendorAvailability.issues, ...inHouseAvailability.issues].map((issue) => issue.message).filter((message, index, all) => all.indexOf(message) === index).join(" ")}</p> : null}
      {draft.modeKind === "execution" ? <fieldset className="purchase-orders__mode-choices purchase-orders__execution-choices" disabled={controlsDisabled}>
        <legend>Execution source</legend>
        <div className="purchase-orders__mode-choice-list">
          <label className="purchase-orders__mode-choice"><input type="radio" name={`purchase-order-execution-${line.key}`} value="sub_vendor"
            checked={draft.executionSource === "sub_vendor"} disabled={!subVendorAvailability.available}
            onChange={() => { onDraftChange({ ...draft, executionSource: "sub_vendor" }); setValidation(""); }} />
            <span><strong>Sub-vendor</strong><small>Configured execution vendor margin</small></span></label>
          <label className="purchase-orders__mode-choice"><input type="radio" name={`purchase-order-execution-${line.key}`} value="in_house"
            checked={draft.executionSource === "in_house"} disabled={!inHouseAvailability.available}
            onChange={() => { onDraftChange({ ...draft, executionSource: "in_house" }); setValidation(""); }} />
            <span><strong>In-house</strong><small>Configured labor and material calculation</small></span></label>
        </div>
        {!subVendorAvailability.available ? <p className="purchase-orders__mode-unavailable">Sub-vendor unavailable: {subVendorAvailability.issues.map((issue) => issue.message).join(" ")}</p> : null}
        {!inHouseAvailability.available ? <p className="purchase-orders__mode-unavailable">In-house unavailable: {inHouseAvailability.issues.map((issue) => issue.message).join(" ")}</p> : null}
      </fieldset> : null}
      {draft.modeKind === "execution" && !draft.executionSource ? <p className="purchase-orders__estimate-note">Choose an execution source to preview the calculation.</p> : null}
      <div className="purchase-orders__mode-fields">
        {selectedMode(draft) ? <>
          <label>Calculation quantity ({mode.uom?.code ?? line.unit})
            <input value={draft.quantity} inputMode="decimal" maxLength={24} disabled={controlsDisabled}
              onChange={(event) => { onDraftChange({ ...draft, quantity: event.target.value }); setValidation(""); }} />
          </label>
          <label>Additional discount (%)
            <input value={draft.discountPercent} inputMode="decimal" maxLength={6} disabled={controlsDisabled}
              onChange={(event) => { onDraftChange({ ...draft, discountPercent: event.target.value }); setValidation(""); }} placeholder="0" />
          </label>
          {selectedMode(draft) === "in_house" ? <label>In-house markup basis
            <select value={draft.markupBasis} disabled={controlsDisabled} onChange={(event) => { onDraftChange({ ...draft, markupBasis: event.target.value as PurchaseOrderModeDraft["markupBasis"] }); setValidation(""); }}>
              <option value="starting">Starting margin</option><option value="minimum">Minimum margin</option>
            </select>
          </label> : null}
        </> : null}
      </div>
      {draft.modeKind === "exception" ? <label className="purchase-orders__mode-reason">Manual exception reason
        <textarea value={draft.exceptionReason} maxLength={1000} rows={2} disabled={controlsDisabled}
          onChange={(event) => { onDraftChange({ ...draft, exceptionReason: event.target.value }); setValidation(""); }} />
      </label> : null}
      {reviewingUnverified && selectedMode(draft) ? <div className="purchase-orders__recovery-fields">
        <label htmlFor={`purchase-order-recovery-reason-${line.key}`}>Why use these current unverified saved values?
          <textarea id={`purchase-order-recovery-reason-${line.key}`} value={draft.recoveryReason} maxLength={1000} rows={2} disabled={controlsDisabled}
            onChange={(event) => { onDraftChange({ ...draft, recoveryReason: event.target.value }); setValidation(""); }} />
        </label>
        <label className="purchase-orders__recovery-acknowledgment"><input type="checkbox" checked={draft.recoveryAcknowledged} disabled={controlsDisabled}
          onChange={(event) => { onDraftChange({ ...draft, recoveryAcknowledged: event.target.checked }); setValidation(""); }} />
          <span>I reviewed the current saved values and understand they could not be verified against activation.</span>
        </label>
      </div> : null}
      {validation ? <p className="purchase-orders__field-error" role="alert">{validation}</p> : null}
      {modeError ? <p className="purchase-orders__field-error" role="alert">{modeError}</p> : null}
      {modeConflict ? <p className="purchase-orders__field-error" role="alert">{modeConflict}</p> : null}
      {canManage && actionable && !frozen ? <div className="purchase-orders__mode-actions">
        <button type="button" disabled={!dirty || (!draft.modeKind && !mode.decision) || (draft.modeKind === "execution" && !draft.executionSource) || modeBusy || Boolean(modeConflict)} onClick={saveMode}>
          {modeBusy ? "Saving…" : !draft.modeKind && mode.decision ? "Clear mode decision" : "Save mode decision"}
        </button>
        {dirty ? <button type="button" className="purchase-orders__text-action" disabled={modeBusy} onClick={() => { onDiscardMode(); setValidation(""); }}>Discard changes</button> : null}
      </div> : null}
    </div> : null}
    {dirty && selectedMode(draft) && draftPreview && !modeConflict ? <DraftCalculation state={draftPreview} lineLabel={lineLabel} unverified={unverified} /> : null}
    {mode.preview ? <div className="purchase-orders__benchmark" aria-label={`${mode.decision?.integrityBasis ? "Saved unverified" : "Saved configured"} calculation for ${lineLabel}`}>
      <div className="purchase-orders__benchmark-title"><strong>{unverified ? "Saved unverified benchmark" : dirty ? "Saved configured benchmark" : "Configured benchmark"}</strong><small>{mode.preview.quantity} {mode.uom?.code ?? line.unit} · {mode.preview.formulaVersion}</small></div>
      {dirty ? <p>This is the saved calculation. The changed mode or quantity has not been saved.</p> : null}
      <dl><div><dt>Base cost</dt><dd>{formatPaise(mode.preview.baseCostPaise)}</dd></div>
        <div><dt>Adjusted cost</dt><dd>{formatPaise(mode.preview.adjustedCostPaise)}</dd></div>
        <div><dt>Calculated selling</dt><dd>{formatPaise(mode.preview.sellingPaise)}</dd></div>
        {mode.preview.floorSellingPaise != null && mode.preview.mode !== "sub_vendor" ? <div><dt>Minimum floor</dt><dd>{formatPaise(mode.preview.floorSellingPaise)}</dd></div> : null}
        {mode.preview.marginBps != null ? <div><dt>Configured margin</dt><dd>{mode.preview.marginBps / 100}%</dd></div> : null}
        {mode.preview.appliedImpactBps != null ? <div><dt>Low quantity impact</dt><dd>{mode.preview.appliedImpactBps / 100}% · {formatPaise(mode.preview.lowQuantityImpactPaise)}</dd></div> : null}
        {mode.preview.discountBps > 0 ? <div><dt>Discount</dt><dd>{mode.preview.discountBps / 100}% · {formatPaise(mode.preview.discountAmountPaise)}</dd></div> : null}
        {mode.preview.quantityRule ? <div><dt>Quantity slab</dt><dd>{mode.preview.quantityRule.minimumQuantity}–{mode.preview.quantityRule.maximumQuantity ?? "above"} {mode.uom?.code ?? line.unit} · {mode.preview.quantityRule.adjustmentBps / 100}%</dd></div> : null}
        {mode.preview.procurementQuantitySuggestion ? <div><dt>Suggested procurement quantity</dt><dd>{mode.preview.procurementQuantitySuggestion} {mode.uom?.code ?? line.unit}</dd></div> : null}
      </dl>
      {mode.preview.components.length ? <p>In-house components: {mode.preview.components.map((component) => `${component.scope} ${formatPaise(component.adjustedCostPaise)} cost / ${formatPaise(component.sellingPaise)} selling`).join(" · ")}</p> : null}
      <details className="purchase-orders__benchmark-settings"><summary>Saved mode settings and low quantity limits</summary>
        <ul>{mode.preview.settings.scopes.map((scope) => <li key={scope.scope}>
          <strong>{scope.scope.replaceAll("_", " ")}</strong> · base {formatPaise(scope.baseRatePaise)} · low quantity at or below {scope.lowQuantityLimit} {mode.uom?.code ?? line.unit} · impact {scope.impactBps / 100}% · minimum markup {scope.minimumMarkupBps / 100}% · starting markup {scope.startingMarkupBps / 100}%
        </li>)}</ul>
      </details>
      <p>Internal calculation only. The supplier is paid from the quoted order lines below.</p>
    </div> : null}
    {items.length ? <div className="purchase-orders__prepared-items"><h5>Purchase items</h5>
      {items.map((item) => {
        const ordered = item.blockers.some((blocker) => blocker.code === "ALREADY_ORDERED");
        const reference = mode.priceReferences?.[item.id];
        const rateReady = reference?.state === "ready" && reference.unitPricePaise != null;
        return <div className="purchase-orders__prepared-item" key={item.id}>
          <div className="purchase-orders__prepared-item-heading"><strong>{item.itemName}</strong><span>{ordered ? "Already ordered" : item.vendor?.name ?? "Vendor needed"}</span></div>
          {canManageItems ? <div className="purchase-orders__item-actions">
            <button type="button" disabled={itemsBusy} aria-label={`Edit ${item.itemName} under ${lineContext}`}
              onClick={(event) => onEditItem(line, item, event.currentTarget)}>Edit item</button>
            {!item.blockers.some((blocker) => blocker.code === "ALREADY_ORDERED" || blocker.code === "MANUAL_ORDER_PENDING") ? <button type="button" disabled={itemsBusy}
              aria-label={`Remove ${item.itemName} under ${lineContext}`}
              onClick={(event) => onRemoveItem(line, item, event.currentTarget)}>Remove</button> : null}
          </div> : null}
          <dl><div><dt>Explicit order quantity</dt><dd>{item.plannedOrderQuantityMilliUnits == null ? "Needed" : `${item.plannedOrderQuantityMilliUnits / 1000} ${item.uom.code}`}</dd></div>
            <div><dt>Agreed unit rate, before tax</dt><dd>{formatPaise(item.pricePaise)}</dd></div>
            <div><dt>Prepared net</dt><dd>{moneyOrDash(item.plannedLineNetPaise)}</dd></div>
            <div><dt>Allocated work</dt><dd>{moneyOrDash(item.allocatedWorkPaise)}</dd></div></dl>
          {reference && !ordered ? <div className="purchase-orders__price-reference">
            {rateReady ? <><p>Matched saved vendor rate: <strong>{formatPaise(reference.unitPricePaise!)} before tax</strong>{reference.priceVersionNumber != null ? ` · price v${reference.priceVersionNumber}` : ""}{reference.taxVersionNumber != null ? ` · tax v${reference.taxVersionNumber}` : ""}{reference.treatment ? ` · ${reference.treatment} tax source` : ""}{reference.effectiveFrom ? ` · effective ${reference.effectiveFrom.slice(0, 10)}${reference.effectiveTo ? ` to ${reference.effectiveTo.slice(0, 10)}` : " onward"}` : ""}</p>
              <p>This is advisory until you apply it. The item’s agreed rate above remains the actual purchase order rate.</p>
              {canManage && canManageItems && !frozen && item.pricePaise !== reference.unitPricePaise ? confirmRateItemId === item.id ? <div className="purchase-orders__rate-confirm">
                <span>Replace this item's agreed rate with the matched saved rate?</span>
                <button type="button" disabled={itemsBusy || rateBusyItemId === item.id} onClick={() => { onUseRate(line, item, reference); setConfirmRateItemId(null); }}>Confirm rate</button>
                <button type="button" className="purchase-orders__text-action" onClick={() => setConfirmRateItemId(null)}>Cancel</button>
              </div> : <button type="button" className="purchase-orders__text-action" disabled={itemsBusy} onClick={() => setConfirmRateItemId(item.id)}>Use configured rate</button> : null}
            </> : <p>No matched configured vendor rate. Keep the explicitly agreed item rate and review the reason.</p>}
            {reference.issues.length ? <ul className="purchase-orders__estimate-issues">{reference.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul> : null}
          </div> : null}
          {rateErrorItemId === item.id ? <p className="purchase-orders__field-error" role="alert">Could not apply the configured rate. Refresh the item and try again.</p> : null}
          {!ordered ? <div className="purchase-orders__gst-field"><label htmlFor={`purchase-order-gst-${item.id}`}>GST for {item.itemName} (%)</label>
            <div><input id={`purchase-order-gst-${item.id}`} inputMode="decimal" maxLength={6} value={gstDrafts[item.id] ?? ""}
              disabled={!canManage || frozen} onChange={(event) => onGstChange(item.id, event.target.value)} placeholder="Enter rate" />
              {reference?.state === "ready" && reference.gstBasisPoints != null && canManage && !frozen ? <button type="button" className="purchase-orders__text-action"
                onClick={() => onGstChange(item.id, String(reference.gstBasisPoints! / 100))}>Use saved tax {reference.gstBasisPoints / 100}%</button> : null}</div>
            <small>Confirm the supplier tax rate. The payable amount appears after backend quote.</small>
          </div> : null}
          {!ordered && (reasonRequiredIds.has(item.id) || Boolean(commercialReasons[item.id]?.trim())) ? <div className="purchase-orders__commercial-reason">
            <label htmlFor={`purchase-order-exception-${item.id}`}>Commercial exception reason for {item.itemName}{reasonRequiredIds.has(item.id) ? " (required)" : ""}</label>
            <textarea id={`purchase-order-exception-${item.id}`} value={commercialReasons[item.id] ?? ""} maxLength={2000} rows={2} disabled={!canManage || frozen}
              onChange={(event) => onCommercialReasonChange(item.id, event.target.value)} />
            <small>{reference?.state === "ready" ? "Explain why the agreed rate or GST differs from the pinned saved price and tax." : "Explain why a supplier rate or tax could not be matched to the saved configuration."} The reason is included in the internal approval review.</small>
          </div> : null}
          {item.blockers.filter((blocker) => blocker.code !== "ALREADY_ORDERED").length ? <ul className="purchase-orders__estimate-issues">
            {item.blockers.filter((blocker) => blocker.code !== "ALREADY_ORDERED").map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blocker.message}</li>)}</ul> : null}
        </div>;
      })}
    </div> : null}
    {eligibleItems.length > 1 ? <p className="purchase-orders__estimate-note">One mode calculation covers this main line; each purchase item keeps its own vendor terms and payable amount.</p> : null}
  </Scope>;
}

export function PurchaseOrderEstimateTree({ lines, items, canManage, frozen, canManageItems, itemsBusy, onAddItem, onEditItem, onRemoveItem, gstDrafts, onGstChange, commercialReasons, reasonRequiredIds, onCommercialReasonChange, modeDrafts, onModeDraftChange, onDiscardMode,
  onSaveMode, modeBusyKey, modeErrorKey, modeError, draftPreviewByLine, modeConflictByLine, rateBusyItemId, rateErrorItemId, onUseRate }: {
  lines: PurchaseOrderPreparationEstimateLine[];
  items: PurchaseOrderPreparationItem[];
  canManage: boolean;
  frozen: boolean;
  canManageItems: boolean;
  itemsBusy: boolean;
  onAddItem: (line: PurchaseOrderPreparationEstimateLine, trigger: HTMLButtonElement) => void;
  onEditItem: (line: PurchaseOrderPreparationEstimateLine, item: PurchaseOrderPreparationItem, trigger: HTMLButtonElement) => void;
  onRemoveItem: (line: PurchaseOrderPreparationEstimateLine, item: PurchaseOrderPreparationItem, trigger: HTMLButtonElement) => void;
  gstDrafts: Record<string, string>;
  onGstChange: (id: string, value: string) => void;
  commercialReasons: Record<string, string>;
  reasonRequiredIds: Set<string>;
  onCommercialReasonChange: (id: string, value: string) => void;
  modeDrafts: Record<string, PurchaseOrderModeDraft>;
  onModeDraftChange: (key: string, draft: PurchaseOrderModeDraft) => void;
  onDiscardMode: (key: string) => void;
  onSaveMode: (input: SaveModeSelectionInput) => void;
  modeBusyKey: string | null;
  modeErrorKey: string | null;
  modeError: string | null;
  draftPreviewByLine?: Record<string, { status: "loading" | "ready" | "error"; result?: PurchaseOrderModeDraftPreview; error?: string }>;
  modeConflictByLine?: Record<string, string>;
  rateBusyItemId: string | null;
  rateErrorItemId: string | null;
  onUseRate: (line: PurchaseOrderPreparationEstimateLine, item: PurchaseOrderPreparationItem, reference: PurchaseOrderModePriceReference) => void;
}) {
  const [search, setSearch] = useState("");
  const itemById = new Map(items.map((item) => [item.id, item]));
  const visible = lines.filter((line) => {
    const text = [line.roomName, line.mainBasketName, line.subBasketName, line.mainLineName,
      ...line.itemIds.map((id) => itemById.get(id)?.itemName ?? ""), ...line.itemIds.map((id) => itemById.get(id)?.vendor?.name ?? ""),
      ...(line.mode?.issues ?? []).map((issue) => issue.message)].join(" ").toLocaleLowerCase();
    return text.includes(search.trim().toLocaleLowerCase());
  });
  const rooms = groupBy(visible, (line) => line.roomId ?? `unidentified-room:${line.key}`, (line) => line.roomName || "Room unavailable");
  return <section className="purchase-orders__estimate-tree" aria-labelledby="purchase-order-estimate-title">
    <div className="purchase-orders__estimate-tree-head"><div><p className="eyebrow">Approved estimate</p><h4 id="purchase-order-estimate-title">Estimate items and modes</h4>
      <p>Every approved line is shown. Expand a main line to confirm its saved mode and review linked purchase items.</p></div>
      <label>Find a line, vendor or issue<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    <p className="purchase-orders__estimate-count" role="status">{visible.length} of {lines.length} estimate line{lines.length === 1 ? "" : "s"} shown</p>
    {!lines.length ? <p className="purchase-orders__estimate-note">Approved estimate lines are unavailable. Refresh preparation before ordering.</p>
      : !visible.length ? <p className="purchase-orders__estimate-note">No estimate lines match this search.</p>
      : <div className="purchase-orders__estimate-rooms">{rooms.map((room, roomIndex) => <Scope key={room.key} className="purchase-orders__estimate-room" label={room.label}
          summary={`${room.values.length} estimate line${room.values.length === 1 ? "" : "s"}`} initiallyOpen={roomIndex === 0}>
          {groupBy(room.values, (line) => line.mainBasketId ?? `unidentified-basket:${line.key}`, (line) => line.mainBasketName || "Main basket unavailable")
            .map((basket, basketIndex) => <Scope key={basket.key} className="purchase-orders__estimate-basket" label={basket.label}
              summary={`${basket.values.length} main line${basket.values.length === 1 ? "" : "s"}`} initiallyOpen={roomIndex === 0 && basketIndex === 0}>
              {groupBy(basket.values, (line) => line.subBasketId ?? "direct", (line) => line.subBasketName || "Direct main lines")
                .map((subBasket) => <Scope key={subBasket.key} className="purchase-orders__estimate-sub-basket" label={subBasket.label}
                  summary={`${subBasket.values.length} line${subBasket.values.length === 1 ? "" : "s"}`} initiallyOpen={roomIndex === 0 && basketIndex === 0}>
                  {subBasket.values.map((line) => <LineDetail key={line.key} line={line} items={line.itemIds.map((id) => itemById.get(id)).filter((item): item is PurchaseOrderPreparationItem => Boolean(item))}
                    canManage={canManage} frozen={frozen} canManageItems={canManageItems} itemsBusy={itemsBusy}
                    onAddItem={onAddItem} onEditItem={onEditItem} onRemoveItem={onRemoveItem} gstDrafts={gstDrafts} onGstChange={onGstChange}
                    commercialReasons={commercialReasons} reasonRequiredIds={reasonRequiredIds} onCommercialReasonChange={onCommercialReasonChange}
                    draft={modeDrafts[line.key] ?? modeDraftFromLine(line)} onDraftChange={(draft) => onModeDraftChange(line.key, draft)} onDiscardMode={() => onDiscardMode(line.key)}
                    onSaveMode={onSaveMode} modeBusy={modeBusyKey === line.key} modeError={modeErrorKey === line.key ? modeError : null}
                    draftPreview={draftPreviewByLine?.[line.key]} modeConflict={modeConflictByLine?.[line.key]}
                    rateBusyItemId={rateBusyItemId} rateErrorItemId={rateErrorItemId} onUseRate={onUseRate} />)}
                </Scope>)}
            </Scope>)}
        </Scope>)}</div>}
  </section>;
}

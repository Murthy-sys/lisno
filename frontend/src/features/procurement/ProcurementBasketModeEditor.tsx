import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import { formatPaise } from "../finance/ProjectFinancePanel";
import { previewPurchaseOrderMode, purchaseOrderKeys, savePurchaseOrderModeDecision,
  type PurchaseOrderModeDraftPreview, type PurchaseOrderModeKey } from "./purchaseOrderApi";
import { procurementBasketKeys, type BasketEstimateSource, type MainBasketClassification, type ProcurementBasketLine } from "./procurementBasketApi";
import { procurementError, procurementRequestKey } from "./procurementPresentation";

export function ProcurementBasketModeEditor({ projectId, basketId, source, line, classification, frozen, compact = false }: {
  projectId: string;
  basketId: string;
  source: BasketEstimateSource;
  line: ProcurementBasketLine;
  classification: MainBasketClassification;
  frozen: boolean;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const editorId = useId();
  const current = line.mode?.decision;
  const suggested = classification === "standard" && line.standardCost?.state === "suggested" && !current;
  const observedUnverified = classification === "standard" && line.standardCost?.state === "observed_unverified" && !current;
  const authoritativeMode = current?.mode ?? (suggested || observedUnverified ? line.standardCost?.mode : null);
  const authoritativeQuantity = current?.quantity ?? (suggested || observedUnverified ? line.standardCost?.calculationQuantity : null) ?? line.approvedQuantity;
  const [editing, setEditing] = useState(false);
  const [family, setFamily] = useState<"" | "pmc" | "execution">(authoritativeMode === "pmc" ? "pmc" : authoritativeMode ? "execution" : "");
  const [executionMode, setExecutionMode] = useState<"" | "sub_vendor" | "in_house">(authoritativeMode === "in_house" ? "in_house" : authoritativeMode === "sub_vendor" ? "sub_vendor" : "");
  const [quantity, setQuantity] = useState(authoritativeQuantity);
  const [recoveryReason, setRecoveryReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [preview, setPreview] = useState<PurchaseOrderModeDraftPreview | null>(null);
  const [error, setError] = useState("");
  const key = useRef<{ signature: string; id: string } | null>(null);
  const draftEpoch = useRef(0);
  const sourceSignature = JSON.stringify([source, line.sourceLineItemKey, line.approvedQuantity,
    line.mode?.state, line.mode?.revision?.contentDigest, line.mode?.integrity?.observedDigest,
    current?.id, current?.version, current?.mode,
    current?.quantity, line.standardCost?.state, line.standardCost?.mode, line.standardCost?.calculationQuantity]);
  const previousSourceSignature = useRef(sourceSignature);
  useEffect(() => {
    if (previousSourceSignature.current === sourceSignature) return;
    previousSourceSignature.current = sourceSignature;
    draftEpoch.current += 1;
    setFamily(authoritativeMode === "pmc" ? "pmc" : authoritativeMode ? "execution" : "");
    setExecutionMode(authoritativeMode === "in_house" ? "in_house" : authoritativeMode === "sub_vendor" ? "sub_vendor" : "");
    setQuantity(authoritativeQuantity);
    setRecoveryReason("");
    setAcknowledged(false);
    setPreview(null);
    setError("");
    key.current = null;
  }, [sourceSignature, authoritativeMode, authoritativeQuantity]);
  const selected: PurchaseOrderModeKey | null = family === "pmc" ? "pmc" : family === "execution" && executionMode ? executionMode : null;
  const available = line.mode?.integrity?.candidateAvailability ?? line.mode?.availability ?? line.mode?.options.map((option) => ({ ...option, available: true, issues: [] })) ?? [];
  const chosen = available.find((option) => option.key === selected);
  const scale = line.mode?.uom?.decimalScale;
  const quantityPattern = scale === 0 ? /^\d+$/u : scale != null && scale > 0 ? new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`, "u") : null;
  const canPreview = Boolean(!frozen && selected && chosen?.available && quantityPattern?.test(quantity.trim()) && Number(quantity) > 0 && (!line.mode?.integrity || (acknowledged && recoveryReason.trim().length >= 10)));
  const draftChanged = selected !== authoritativeMode || quantity.trim() !== authoritativeQuantity;

  const previewMutation = useMutation({ mutationFn: (_epoch: number) => previewPurchaseOrderMode(projectId, {
    estimateSource: source, sourceLineItemKey: line.sourceLineItemKey,
    expectedVersion: current?.version ?? 0, mode: selected!, quantity: quantity.trim(),
    discountBps: current?.discountBps ?? 0, markupBasis: current?.markupBasis ?? "starting",
    ...(line.mode?.integrity ? { expectedObservedDigest: line.mode.integrity.observedDigest } : {})
  }), onSuccess: (result, epoch) => {
    if (epoch !== draftEpoch.current) return;
    setPreview(result); setError(result.issues.map((issue) => issue.message).join(" "));
  }, onError: (cause, epoch) => {
    if (epoch !== draftEpoch.current) return;
    setError(procurementError(cause, "The mode calculation could not be previewed."));
  } });

  const saveMutation = useMutation({ mutationFn: () => {
    const signature = JSON.stringify([source, line.sourceLineItemKey, current?.version ?? 0, selected, quantity, recoveryReason]);
    if (key.current?.signature !== signature) key.current = { signature, id: procurementRequestKey() };
    return savePurchaseOrderModeDecision(projectId, {
      sourceLineItemKey: line.sourceLineItemKey, expectedVersion: current?.version ?? 0,
      expectedEstimateSource: source, expectedRevisionDigest: line.mode?.revision?.contentDigest,
      idempotencyKey: key.current.id, mode: selected!, quantity: quantity.trim(),
      discountBps: current?.discountBps ?? 0, markupBasis: current?.markupBasis ?? "starting",
      ...(line.mode?.integrity ? { recovery: { expectedObservedDigest: line.mode.integrity.observedDigest, reason: recoveryReason.trim(), acknowledge: true as const } } : {})
    });
  }, onSuccess: async () => {
    key.current = null; setEditing(false); setPreview(null); setError("");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.list(projectId) }),
      queryClient.invalidateQueries({ queryKey: procurementBasketKeys.detail(projectId, basketId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(projectId) })
    ]);
  }, onError: (cause) => setError(procurementError(cause, "The mode decision could not be saved.")) });

  function invalidateDraft() { draftEpoch.current += 1; setPreview(null); setError(""); key.current = null; }

  const action = editing ? "Close mode" : current?.mode || observedUnverified ? "Review mode" : suggested ? "Confirm mode" : "Choose mode";

  return <div className={`procurement-basket__mode${compact ? " procurement-basket__mode--inline" : ""}`}>
    {line.source === "configuration" && line.mode ? <button className="procurement-basket__mode-toggle" type="button"
      disabled={frozen || saveMutation.isPending} aria-label={`${action} for ${line.mainLineName}`}
      aria-expanded={editing} aria-controls={editorId}
      onClick={() => { setEditing(!editing); invalidateDraft(); }}>{action}</button> : null}
    {editing && line.mode ? <div id={editorId} className="procurement-basket__mode-editor">
      <fieldset disabled={frozen || saveMutation.isPending}><legend>Calculation mode</legend><label><input type="radio" name={`mode-family-${line.sourceLineItemKey}`} checked={family === "pmc"} onChange={() => { setFamily("pmc"); invalidateDraft(); }} /> PMC</label><label><input type="radio" name={`mode-family-${line.sourceLineItemKey}`} checked={family === "execution"} onChange={() => { setFamily("execution"); invalidateDraft(); }} /> Execution</label></fieldset>
      {family === "execution" ? <fieldset disabled={frozen || saveMutation.isPending}><legend>Execution source</legend><label><input type="radio" name={`execution-source-${line.sourceLineItemKey}`} checked={executionMode === "sub_vendor"} onChange={() => { setExecutionMode("sub_vendor"); invalidateDraft(); }} /> Sub-vendor</label><label><input type="radio" name={`execution-source-${line.sourceLineItemKey}`} checked={executionMode === "in_house"} onChange={() => { setExecutionMode("in_house"); invalidateDraft(); }} /> In-house</label></fieldset> : null}
      {chosen && !chosen.available ? <p className="procurement-basket__mode-issue">{chosen.issues.map((issue) => issue.message).join(" ")}</p> : null}
      <label className="procurement-basket__field">Calculation quantity <span>{line.approvedUnit}</span><input type="text" inputMode="decimal" value={quantity} disabled={frozen || saveMutation.isPending} onChange={(event) => { setQuantity(event.target.value); invalidateDraft(); }} aria-label={`Calculation quantity for ${line.mainLineName}`} /></label>
      {draftChanged ? <p className="procurement-basket__draft-note">Preview the changed calculation before saving.</p> : null}
      {line.mode.integrity ? <div className="procurement-basket__recovery"><strong>Saved Configuration integrity needs review</strong><p>Review the observed content before using this calculation. The recovery decision is recorded for this line.</p><label className="procurement-basket__field">Reason<textarea value={recoveryReason} onChange={(event) => { setRecoveryReason(event.target.value); invalidateDraft(); }} /></label><label><input type="checkbox" checked={acknowledged} onChange={(event) => { setAcknowledged(event.target.checked); invalidateDraft(); }} /> I reviewed the observed saved content for this mode.</label></div> : null}
      <div className="procurement-basket__mode-actions"><button type="button" disabled={!canPreview || previewMutation.isPending || saveMutation.isPending} onClick={() => previewMutation.mutate(draftEpoch.current)}>Preview calculation</button>{preview?.preview && !preview.issues.length ? <button type="button" disabled={frozen || saveMutation.isPending || previewMutation.isPending} onClick={() => saveMutation.mutate()}>Save mode</button> : null}</div>
      {preview?.preview ? <dl className="procurement-basket__mode-values procurement-basket__mode-values--preview"><div><dt>Base amount</dt><dd>{formatPaise(preview.preview.baseCostPaise)}</dd></div><div><dt>Total</dt><dd>{formatPaise(preview.preview.adjustedCostPaise)}</dd></div></dl> : null}
      {error ? <p role="alert" className="procurement-basket__error">{error}</p> : null}
    </div> : null}
  </div>;
}

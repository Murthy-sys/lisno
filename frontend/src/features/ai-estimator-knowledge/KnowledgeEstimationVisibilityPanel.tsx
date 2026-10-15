import { useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { Surface } from "../../components/ui/Surface";
import { getKnowledgeItem, updateKnowledgeMainLine } from "./knowledgeApi";
import { commitKnowledgeMainLineMutation, refreshKnowledgeMainLineCatalog } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeEstimationVisibility, KnowledgeItemDetail } from "./knowledgeTypes";
import "./knowledge-estimation-visibility.css";

export interface KnowledgeEstimationVisibilityPanelHandle {
  save: () => Promise<boolean>;
  discard: () => boolean;
}

export const KnowledgeEstimationVisibilityPanel = forwardRef<KnowledgeEstimationVisibilityPanelHandle, {
  item: KnowledgeItemDetail;
  canUpdate: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onUnknownOutcomeChange?: (unknown: boolean) => void;
}>(function KnowledgeEstimationVisibilityPanel({ item, canUpdate, onDirtyChange, onSavingChange, onUnknownOutcomeChange }, ref) {
  const queryClient = useQueryClient();
  const id = useId();
  const [base, setBase] = useState(item);
  const [choice, setChoice] = useState<KnowledgeEstimationVisibility>(item.estimationVisibility ?? "internal");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshError, setRefreshError] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const uncertainWriteVersion = useRef<number | null>(null);
  const locked = useRef(false);
  const dirty = choice !== (base.estimationVisibility ?? "internal");
  const editable = canUpdate && item.status !== "archived" && base.status !== "archived"
    && item.itemType !== "temporary" && base.itemType !== "temporary";

  useEffect(() => { onDirtyChange(dirty || unknownOutcome); }, [dirty, unknownOutcome, onDirtyChange]);
  useEffect(() => { onUnknownOutcomeChange?.(unknownOutcome); }, [unknownOutcome, onUnknownOutcomeChange]);
  useEffect(() => { onSavingChange(busy); }, [busy, onSavingChange]);
  useEffect(() => {
    if (!dirty && !busy && !conflict && !unknownOutcome && item.version > base.version) {
      setBase(item);
      setChoice(item.estimationVisibility ?? "internal");
    }
  }, [item, base.version, dirty, busy, conflict, unknownOutcome]);

  async function refreshCatalog() {
    try {
      await refreshKnowledgeMainLineCatalog(queryClient);
      setRefreshError(false);
    } catch {
      setRefreshError(true);
    }
  }

  async function save(): Promise<boolean> {
    if (locked.current || !editable || conflict || refreshError || (unknownOutcome && !confirmationRequired)) return false;
    if (!dirty && !confirmationRequired) return true;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const updated = await updateKnowledgeMainLine(item.mainLineId, { expectedVersion: base.version, estimationVisibility: choice });
      setBase(updated); setChoice(updated.estimationVisibility ?? "internal");
      uncertainWriteVersion.current = null; setUnknownOutcome(false); setConfirmationRequired(false);
      commitKnowledgeMainLineMutation(queryClient, updated);
      onDirtyChange(false);
      setNotice("Estimation visibility saved.");
      await refreshCatalog();
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && (cause.code === "VERSION_CONFLICT" || cause.status === 409)) {
        setConflict(true);
      } else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) {
        setError("Visibility could not be saved. Your selection is preserved; please try again.");
      } else {
        // A lost response may follow a committed PATCH. Never use the old base
        // to decide whether the user's next selection needs another write.
        uncertainWriteVersion.current = base.version;
        setUnknownOutcome(true); setConfirmationRequired(false);
        onDirtyChange(true);
        try {
          const current = await readCurrent();
          if (uncertainWriteVersion.current !== null) {
            setNotice("The latest read has not confirmed the earlier save. Confirm your selected visibility to settle the pending change.");
            return false;
          }
          const intentSaved = (current.estimationVisibility ?? "internal") === choice;
          setNotice(`Current saved visibility: ${current.estimationVisibility === "external" ? "External" : "Internal"}. ${intentSaved ? "Your selection is saved." : "Your selection is preserved. Review it before saving."}`);
          await refreshCatalog();
          return intentSaved;
        } catch {
          setError("");
        }
      }
      return false;
    } finally { locked.current = false; setBusy(false); }
  }

  function discard() {
    if (locked.current || unknownOutcome) return false;
    const current = item.version > base.version ? item : base;
    setBase(current); setChoice(current.estimationVisibility ?? "internal");
    setConflict(false); setError(""); setNotice(""); onDirtyChange(false);
    return true;
  }

  useImperativeHandle(ref, () => ({ save, discard }));

  async function readCurrent(): Promise<KnowledgeItemDetail> {
    const current = await getKnowledgeItem(item.mainLineId);
    if (current.mainLineId !== item.mainLineId || current.version < base.version) throw new Error("The current Main Line could not be verified.");
    queryClient.setQueryData(knowledgeQueryKeys.item(current.mainLineId), current);
    setBase(current); setConflict(false);
    const confirmed = uncertainWriteVersion.current === null || current.version > uncertainWriteVersion.current;
    setUnknownOutcome(!confirmed); setConfirmationRequired(!confirmed);
    if (confirmed) uncertainWriteVersion.current = null;
    return current;
  }

  async function loadCurrent() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const current = await readCurrent();
      if (uncertainWriteVersion.current !== null) {
        setNotice("The latest read has not confirmed the earlier save. Confirm your selected visibility to settle the pending change.");
      } else {
        setNotice(`Current saved visibility: ${current.estimationVisibility === "external" ? "External" : "Internal"}. Your selection is preserved. Review it before saving.`);
        if (unknownOutcome) await refreshCatalog();
      }
    } catch { setError("The current Main Line could not be loaded. Retry before saving your selection."); }
    finally { locked.current = false; setBusy(false); }
  }

  return <Surface as="section" className="knowledge-workspace-section knowledge-estimation-visibility">
    <div className="knowledge-section-heading"><div><h2>Design</h2>
      <p>Choose who can select this Main Line when adding estimate requirements.</p></div></div>
    <fieldset disabled={!editable || busy || refreshError || (unknownOutcome && !confirmationRequired)} aria-describedby={`${id}-help`}>
      <legend>Estimation visibility</legend>
      <label><input type="radio" name={`${id}-visibility`} value="internal" checked={choice === "internal"} onChange={() => { setChoice("internal"); setError(""); setNotice(""); }} />
        <span><strong>Internal</strong><span>Available to your team only.</span></span></label>
      <label><input type="radio" name={`${id}-visibility`} value="external" checked={choice === "external"} onChange={() => { setChoice("external"); setError(""); setNotice(""); }} />
        <span><strong>External</strong><span>Also available for clients to select in estimation.</span></span></label>
    </fieldset>
    <p id={`${id}-help`}>Clients see the Main Line name. Internal costs, vendor rates and margins remain private. Quotation prices and totals remain visible.</p>
    {item.itemType === "temporary" ? <p role="status">Temporary items are available to your team only.</p> : !editable ? <p role="status">Estimation visibility is read-only.</p> : null}
    {unknownOutcome ? <InlineMessage tone="warning" title="Saved visibility is unknown" role="alert">{confirmationRequired ? "The latest read cannot confirm the earlier save. Confirm your selected visibility before leaving this section." : "The save response could not be verified. Your selection is preserved. Load the current saved state before changing visibility or leaving this section."}
      <Button variant="secondary" busy={busy} onClick={() => void loadCurrent()}>Retry load</Button></InlineMessage> : null}
    {conflict ? <InlineMessage tone="warning" title="Main Line changed" role="alert">Your selection is preserved. Load the current version before saving again.
      <Button variant="secondary" busy={busy} onClick={() => void loadCurrent()}>Load current Main Line</Button></InlineMessage> : null}
    {error ? <InlineMessage tone="error" role="alert">{error}</InlineMessage> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {refreshError ? <InlineMessage tone="warning" role="status">The saved visibility is verified, but some views could not refresh.
      <Button variant="secondary" busy={busy} onClick={async () => { if (locked.current) return; locked.current = true; setBusy(true); try { await refreshCatalog(); } finally { locked.current = false; setBusy(false); } }}>Retry views refresh</Button></InlineMessage> : null}
    {editable ? <div><Button busy={busy} disabled={(!dirty && !confirmationRequired) || conflict || refreshError || (unknownOutcome && !confirmationRequired)} onClick={() => void save()}>{confirmationRequired ? "Confirm visibility" : "Save visibility"}</Button></div> : null}
  </Surface>;
});

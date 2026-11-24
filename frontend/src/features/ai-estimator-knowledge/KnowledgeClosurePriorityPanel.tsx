import { useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Radio } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { getKnowledgeItem, getKnowledgeSection, updateKnowledgeSection } from "./knowledgeApi";
import { commitKnowledgeSectionMutation, invalidateKnowledgeSectionMutation } from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { knowledgeOverviewPayloadForUpdate } from "./knowledgeSectionPayload";
import type { KnowledgeItemDetail, KnowledgeSectionEnvelope, KnowledgeJsonObject } from "./knowledgeTypes";

const priorities = ["P1", "P2", "P3"] as const;
type Priority = typeof priorities[number];
type Overview = KnowledgeSectionEnvelope<KnowledgeJsonObject>;

export interface ClosureEditorHandle {
  save(): Promise<boolean>;
  discard(): boolean;
}

export const KnowledgeClosurePriorityPanel = forwardRef<ClosureEditorHandle, {
  item: KnowledgeItemDetail;
  overview: Overview;
  editable: boolean;
  revisionRetired?: boolean;
  onBeginEdit?: () => void;
  onReleaseRevision?: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onUnknownOutcomeChange: (unknown: boolean) => void;
}>(function KnowledgeClosurePriorityPanel({ item, overview, editable, revisionRetired, onBeginEdit, onReleaseRevision, onDirtyChange, onSavingChange, onUnknownOutcomeChange }, ref) {
  const client = useQueryClient();
  const [edit, setEdit] = useState<{ choice: Priority; base: Overview } | null>(null);
  const [recovery, setRecovery] = useState<"conflict" | "unknown" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const base = edit?.base ?? overview;
  const savedValue = overview.payload.closurePriority;
  const invalid = savedValue !== undefined && !priorities.some(value => value === savedValue);
  const selected = edit?.choice ?? savedValue;
  const dirty = Boolean(edit || recovery);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onSavingChange(busy); }, [busy, onSavingChange]);
  useEffect(() => { onUnknownOutcomeChange(recovery === "unknown"); }, [recovery, onUnknownOutcomeChange]);

  async function review() {
    if (!edit || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      // Once the line points to a different draft, a subsequent read of the
      // original section is final: its version can no longer advance.
      const line = await getKnowledgeItem(item.mainLineId);
      const current = await getKnowledgeSection<KnowledgeJsonObject>(item.mainLineId, base.revisionId, "overview");
      if (current.version < base.version) throw new Error("The latest closure priority is unavailable. Retry the load.");
      client.setQueryData(knowledgeQueryKeys.item(item.mainLineId), line);
      client.setQueryData(knowledgeQueryKeys.section(item.mainLineId, base.revisionId, "overview"), current);
      setError("");
      if (recovery === "unknown" && current.version > base.version && current.payload.closurePriority === edit.choice) {
        if (line.draftRevisionId === base.revisionId) onReleaseRevision?.();
        setEdit(null);
        setRecovery(null);
        setNotice("Closure priority saved.");
        await invalidateKnowledgeSectionMutation(client, item.mainLineId, { throwOnError: true }).catch(() => setNotice("Closure priority saved. Reload to refresh related views."));
      } else {
        setEdit({ choice: edit.choice, base: current });
        const unresolved = recovery === "unknown" && current.version === base.version && line.draftRevisionId === base.revisionId;
        setConfirm(unresolved);
        if (!unresolved) setRecovery(null);
        const saved = current.payload.closurePriority ?? "Unselected";
        setNotice(line.draftRevisionId === base.revisionId
          ? "Current saved closure priority: " + saved + ". Review your choice before saving."
          : "Saved closure priority on the previous revision: " + saved + ".");
      }
    } catch (cause) { setError((cause as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  async function save(): Promise<boolean> {
    if (lock.current || !editable || item.draftRevisionId !== base.revisionId || invalid || (recovery && !confirm)) return false;
    if (!edit) return true;
    if (overview.version !== base.version) {
      setRecovery("conflict");
      setConfirm(false);
      return false;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await updateKnowledgeSection(item.mainLineId, base.revisionId, "overview", {
        expectedVersion: base.version, expectedAggregateVersion: item.version, applicability: base.applicability,
        payload: knowledgeOverviewPayloadForUpdate(base.payload, { closurePriority: edit.choice }, new Set(["closurePriority"]))
      });
      commitKnowledgeSectionMutation(client, result);
      onReleaseRevision?.();
      setEdit(null);
      setRecovery(null);
      setConfirm(false);
      setNotice("Closure priority saved.");
      try { await invalidateKnowledgeSectionMutation(client, item.mainLineId, { throwOnError: true }); }
      catch { setNotice("Closure priority saved. Reload to refresh related views."); }
      return true;
    } catch (cause) {
      setConfirm(false);
      if (cause instanceof ApiError && cause.status === 409) setRecovery("conflict");
      else if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) setError(cause.message);
      else setRecovery("unknown");
      return false;
    } finally { lock.current = false; setBusy(false); }
  }

  useImperativeHandle(ref, () => ({ save, discard() {
    if (lock.current || recovery === "unknown") return false;
    setEdit(null); setRecovery(null); setError(""); setNotice(""); setConfirm(false);
    return true;
  } }));

  return <>
    <fieldset className="ui-fieldset knowledge-overview__client-visibility" role="radiogroup" disabled={!editable || busy || invalid || Boolean(recovery)}>
      <legend>Closure priority</legend>
      <div className="ui-radio-group">{priorities.map(value => <label className="knowledge-overview__visibility-option" key={value}><Radio value={value} name="closure-priority" checked={selected === value} onChange={() => {
        if (value === savedValue) onReleaseRevision?.();
        else onBeginEdit?.();
        setEdit(value === savedValue ? null : { choice: value, base });
        setError(""); setNotice("");
      }} /><span>{value}</span></label>)}</div>
    </fieldset>
    {invalid ? <InlineMessage tone="error" role="alert">The saved closure priority is invalid.</InlineMessage> : selected === undefined ? <p>No closure priority selected.</p> : null}
    {editable ? <Button disabled={!edit || invalid || busy || Boolean(recovery && !confirm)} onClick={() => void save()}>Save closure priority</Button> : <p>Closure priority is read-only.</p>}
    {revisionRetired ? <InlineMessage tone="warning">The editable revision changed. Your choice belongs to the previous revision.
      <Button disabled={busy || recovery === "unknown"} variant="secondary" onClick={() => {
        setEdit(null); setConfirm(false); setRecovery(null); setNotice(""); setError("");
        onReleaseRevision?.();
      }}>{edit ? "Discard choice and load current revision" : "Load current revision"}</Button>
    </InlineMessage> : null}
    {recovery ? <InlineMessage tone="warning" role="alert">{recovery === "conflict" ? "The saved configuration changed." : "The save response could not be confirmed."} <Button disabled={busy} variant="secondary" onClick={() => void review()}>Load current closure priority</Button></InlineMessage> : null}
    {error ? <InlineMessage tone="error" role="alert">{error}</InlineMessage> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </>;
});

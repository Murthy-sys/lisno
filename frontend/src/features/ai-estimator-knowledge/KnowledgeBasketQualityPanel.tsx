import { useQuery, useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { Surface } from "../../components/ui/Surface";
import { getKnowledgeBasketQuality, getKnowledgeSection, updateKnowledgeBasketQuality } from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgePendingChangesCallback } from "./knowledgePendingChanges";
import { qualityPendingChanges, qualityPendingRowState, type QualityPendingRowState } from "./knowledgeQualityPendingChanges";
import { mandatoryQualityParameters, qualityImportIssues, validateQualityParameters, QUALITY_MAX_PARAMETERS } from "./knowledgeQuality";
import { downloadQualityChecklist, downloadQualityTemplate } from "./knowledgeQualityWorkbook";
import { KnowledgeQualityImportDialog } from "./KnowledgeQualityImportDialog";
import { KnowledgeQualityChecklistEditor, type KnowledgeQualityChecklistEditorHandle } from "./KnowledgeQualityChecklistEditor";
import { Plus } from "lucide-react";
import { KnowledgeSectionCommandBar } from "./KnowledgeSectionCommandBar";
import type { KnowledgeItemDetail, KnowledgeJsonObject } from "./knowledgeTypes";

export interface KnowledgeBasketQualityPanelHandle {
  save(): Promise<boolean>;
  discard(): void;
}

interface KnowledgeBasketQualityPanelProps {
  readonly item: KnowledgeItemDetail;
  readonly revisionId?: string;
  readonly canUpdate: boolean;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onSavingChange: (saving: boolean) => void;
  readonly pendingChangesSourceKey?: string;
  readonly onPendingChanges?: KnowledgePendingChangesCallback;
}

// A checklist draft belongs to one mounted item/revision/basket editing session.
export const KnowledgeBasketQualityPanel = forwardRef<KnowledgeBasketQualityPanelHandle, KnowledgeBasketQualityPanelProps>(function KnowledgeBasketQualityPanel(props, ref) {
  const source = JSON.stringify([props.item.mainLineId, props.revisionId, props.item.basketId, props.pendingChangesSourceKey]);
  return <KnowledgeBasketQualityEditor key={source} {...props} ref={ref} />;
});

const KnowledgeBasketQualityEditor = forwardRef<KnowledgeBasketQualityPanelHandle, KnowledgeBasketQualityPanelProps>(function KnowledgeBasketQualityEditor({ item, revisionId, canUpdate, onDirtyChange, onSavingChange, pendingChangesSourceKey, onPendingChanges }, ref) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: knowledgeQueryKeys.basketQuality(item.basketId), queryFn: () => getKnowledgeBasketQuality(item.basketId) });
  const [draft, setDraft] = useState<{
    parameters: readonly KnowledgeJsonObject[]; version: number; basketName: string;
    baseline: readonly KnowledgeJsonObject[]; baselineRows: QualityPendingRowState; parameterRows: QualityPendingRowState;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState<"template" | "saved" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const parameters = draft?.parameters ?? query.data?.parameters ?? [];
  const editorRef = useRef<KnowledgeQualityChecklistEditorHandle>(null);
  const editable = canUpdate && item.status !== "archived" && query.data?.basketStatus !== "archived";
  const legacy = useQuery({ queryKey: knowledgeQueryKeys.section(item.mainLineId, revisionId ?? "", "quality"), queryFn: () => getKnowledgeSection<KnowledgeJsonObject>(item.mainLineId, revisionId!, "quality"), enabled: showLegacy && Boolean(revisionId) });
  useEffect(() => onDirtyChange(Boolean(draft)), [draft, onDirtyChange]);
  useEffect(() => onSavingChange(saving), [saving, onSavingChange]);
  const sourceKey = pendingChangesSourceKey ?? JSON.stringify([item.mainLineId, revisionId, item.basketId, "quality"]);
  const pending = useMemo(() => editable && draft ? qualityPendingChanges({
    sourceKey, basketId: item.basketId, basketName: draft.basketName,
    baseline: draft.baseline, parameters: draft.parameters, baselineRows: draft.baselineRows, parameterRows: draft.parameterRows
  }) : { sourceKey, groups: [] }, [draft, editable, item.basketId, sourceKey]);
  useEffect(() => {
    onPendingChanges?.(pending);
  }, [onPendingChanges, pending]);
  useEffect(() => () => onPendingChanges?.({ sourceKey, groups: [] }), [onPendingChanges, sourceKey]);
  function change(next: KnowledgeJsonObject) {
    if (!editable || saving || !query.data) return;
    const nextParameters = mandatoryQualityParameters((next.parameters ?? []) as readonly KnowledgeJsonObject[]);
    const baselineRows = draft?.baselineRows ?? qualityPendingRowState(query.data.parameters);
    setDraft({ parameters: nextParameters, version: draft?.version ?? query.data.version,
      basketName: draft?.basketName ?? query.data.basketName, baseline: draft?.baseline ?? query.data.parameters, baselineRows,
      parameterRows: qualityPendingRowState(nextParameters, draft?.parameterRows ?? baselineRows) });
    setError(null);
    setAnnouncement("");
  }
  function discard() {
    if (saving) return;
    editorRef.current?.close();
    setDraft(null); setError(null); setConflict(false); setValidationAttempt(0);
  }
  async function save(): Promise<boolean> {
    if (!editable || !draft || saving || conflict) return false;
    if (validateQualityParameters(draft.parameters).length) { setValidationAttempt(value => value + 1); return false; }
    setSaving(true); setError(null);
    try {
      const saved = await updateKnowledgeBasketQuality(item.basketId, { expectedVersion: draft.version, parameters: draft.parameters });
      queryClient.setQueryData(knowledgeQueryKeys.basketQuality(item.basketId), saved);
      setDraft(null); setConflict(false); setValidationAttempt(0);
      setAnnouncement(`Shared checklist saved for all items in ${saved.basketName}.`);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketDeletionImpacts() }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.contexts() }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }),
        queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.items(), predicate: (entry) => entry.queryKey.length === 3 && (entry.state.data as KnowledgeItemDetail | undefined)?.basketId === item.basketId })
      ]);
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") {
        setConflict(true);
        setError("This Main Basket changed while you were editing. Your changes are still here. Reload the saved checklist before editing and saving again.");
        await query.refetch();
      } else setError(failure instanceof Error ? failure.message : "The shared checklist could not be saved.");
      return false;
    } finally { setSaving(false); }
  }
  useImperativeHandle(ref, () => ({ save, discard }));
  async function template() {
    if (downloading) return;
    setDownloading("template"); setDownloadError(null);
    try { await downloadQualityTemplate(); }
    catch { setDownloadError("The Excel template could not be downloaded. Try again."); }
    finally { setDownloading(null); }
  }
  async function downloadSaved() {
    const saved = query.data;
    if (downloading || saving || !saved?.revisionId || !saved.parameters.length) return;
    setDownloading("saved"); setDownloadError(null);
    try { await downloadQualityChecklist(saved.basketName, saved.parameters); }
    catch (failure) { setDownloadError(failure instanceof Error ? failure.message : "The saved checklist could not be downloaded. Try again."); }
    finally { setDownloading(null); }
  }
  function append(incoming: readonly KnowledgeJsonObject[]) {
    const issues = qualityImportIssues(parameters, incoming);
    if (issues.length) { setError(issues.map(({ message }) => message).join(" ")); return; }
    change({ parameters: [...parameters, ...incoming] });
    setImporting(false);
  }
  if (query.isPending) return <PageState state="loading" message="Loading the shared Main Basket checklist…" />;
  if (query.isError && !query.data) return <PageState state="error" message={query.error.message} action={{ label: "Try again", onAction: () => void query.refetch() }} />;
  if (!query.data) return <PageState state="empty" message="The shared checklist is unavailable." />;
  const saved = query.data;
  const hasSavedParameters = Boolean(saved.revisionId && saved.parameters.length);
  return <Surface as="section" className="knowledge-workspace-section knowledge-basket-quality knowledge-basket-quality--reference">
    <div className="knowledge-quality-reference-header">
      <div className="knowledge-basket-quality__intro">
        <h2>Quality Parameters</h2>
        <p>Define the quality checks, acceptance criteria and evidence for this checklist.</p>
        <p className="knowledge-quality-scope">Shared with all items in {saved.basketName}</p>
      </div>
      <div className="knowledge-quality-actions">
        {hasSavedParameters ? <Button variant="secondary" size="compact" busy={downloading === "saved"} disabled={saving || downloading !== null} onClick={() => void downloadSaved()}>Download Excel</Button> : null}
        <Button variant="secondary" size="compact" busy={downloading === "template"} disabled={downloading !== null} onClick={() => void template()}>Download Excel template</Button>
        {editable ? <>
          <Button variant="secondary" size="compact" disabled={saving || conflict} onClick={() => setImporting(true)}>Import Excel</Button>
          <Button variant="secondary" size="compact" leadingIcon={<Plus />} disabled={saving || conflict || parameters.length >= QUALITY_MAX_PARAMETERS} onClick={() => editorRef.current?.addParameter()}>Add Parameter</Button>
        </> : null}
      </div>
    </div>
    <KnowledgeSectionCommandBar sectionLabel="shared checklist" versionLabel={saved.revisionId ? `Checklist version ${saved.revisionNumber}` : "No shared checklist saved"} editable={editable && !conflict} dirty={Boolean(draft)} saving={saving} saveError={error} onSave={() => void save()} />
    {hasSavedParameters && draft ? <p className="knowledge-help-text">Download Excel uses the saved checklist. Save your changes to include them.</p> : null}
    {downloadError ? <InlineMessage tone="error" role="alert">{downloadError}</InlineMessage> : null}
    {query.isError ? <InlineMessage tone="warning">The latest shared checklist could not be refreshed. <Button variant="quiet" size="compact" onClick={() => void query.refetch()}>Retry refresh</Button></InlineMessage> : null}
    {error ? <InlineMessage tone="error" role="alert">{error}</InlineMessage> : null}
    {conflict ? <Button variant="secondary" onClick={() => { if (query.isError) void query.refetch(); else discard(); }} disabled={query.isFetching}>{query.isError ? "Retry loading saved checklist" : "Discard edits and reload saved checklist"}</Button> : null}
    {announcement ? <InlineMessage tone="success" role="status">{announcement}</InlineMessage> : null}
    <KnowledgeQualityChecklistEditor ref={editorRef} parameters={parameters} savedParameters={saved.parameters} basketName={saved.basketName} disabled={!editable || saving || conflict} readOnly={!editable} validationAttempt={validationAttempt} onChange={next => change({ parameters: next })} />
    {revisionId ? <details className="knowledge-quality-details" onToggle={(event) => setShowLegacy(event.currentTarget.open)}>
      <summary>Previous item-specific quality parameters</summary>
      <p className="knowledge-help-text">Saved item history is retained. A saved basket checklist takes precedence for future AI analysis; these older rows do not change the shared checklist.</p>
      {showLegacy && (legacy.isPending ? <p role="status">Loading previous parameters…</p> : legacy.isError ? <InlineMessage tone="error">Previous parameters could not be loaded. <Button variant="quiet" onClick={() => void legacy.refetch()}>Retry</Button></InlineMessage> : legacy.data ? <LegacyQualityParameters payload={legacy.data.payload} /> : null)}
    </details> : null}
    {importing ? <KnowledgeQualityImportDialog basketName={saved.basketName} currentParameters={parameters} disabled={!editable || saving || conflict} onImport={append} onClose={() => setImporting(false)} /> : null}

  </Surface>;
});

function LegacyQualityParameters({ payload }: { readonly payload: KnowledgeJsonObject }) {
  const rows = Array.isArray(payload.parameters) ? payload.parameters.filter((row): row is KnowledgeJsonObject => Boolean(row && typeof row === "object" && !Array.isArray(row))) : [];
  if (!rows.length) return <p>No previous item-specific quality parameters.</p>;
  const labels: Readonly<Record<string, string>> = { type: "Answer type", category: "Category", stage: "Stage", instructions: "How to check", acceptanceCriteria: "Acceptance criteria", checkMethod: "Method", severity: "Failure severity", responsibleRole: "Responsible role", failureAction: "Failure action", unit: "Unit", minimum: "Minimum", maximum: "Maximum", allowedValues: "Options", defaultValue: "Default answer", required: "Required", active: "Active" };
  return <ul className="knowledge-quality-legacy">{rows.map((row, index) => <li key={typeof row.id === "string" ? row.id : index}>
    <strong>{String(row.label ?? "Unnamed check")}</strong>
    <dl>{Object.entries(labels).filter(([key]) => row[key] !== undefined && row[key] !== null).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{Array.isArray(row[key]) ? row[key].join(", ") : typeof row[key] === "boolean" ? row[key] ? "Yes" : "No" : String(row[key]).replaceAll("_", " ")}</dd></div>)}</dl>
  </li>)}</ul>;
}

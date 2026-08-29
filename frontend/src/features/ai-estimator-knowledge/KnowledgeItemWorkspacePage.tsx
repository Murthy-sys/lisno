import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Copy, Plus, Save, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  activateKnowledgeRevision,
  archiveKnowledgeMainLine,
  createKnowledgeRevision,
  deactivateKnowledgeItem,
  duplicateKnowledgeItem,
  getKnowledgeHistory,
  getKnowledgeItem,
  getKnowledgeSection,
  listKnowledgeBaskets,
  listKnowledgeItems,
  listKnowledgeMasters,
  previewKnowledge,
  updateKnowledgeSection,
  type KnowledgePreviewRequest
} from "./knowledgeApi";
import { KnowledgeLifecycleDialog, type KnowledgeLifecycleAction } from "./KnowledgeLifecycleDialogs";
import { KnowledgeMasterEditorDialog } from "./KnowledgeMasterEditorDialog";
import { syncKnowledgeLifecycleMutation, syncKnowledgeSectionMutation } from "./knowledgeMutationSync";
import {
  KNOWLEDGE_ITEM_STATUS_LABELS,
  KNOWLEDGE_SECTION_LABELS,
  formatKnowledgeDateTime,
  formatKnowledgeMoney,
  formatKnowledgePercentage,
  formatPaiseForRupeeInput,
  parseRupeeInputToPaise
} from "./knowledgePresentation";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";
import { KnowledgeSectionNavigation } from "./KnowledgeSectionNavigation";
import { KnowledgeSafetyNotice } from "./KnowledgeSafetyNotice";
import { KnowledgeUnsavedChangesDialog } from "./KnowledgeUnsavedChangesDialog";
import { KnowledgeVersionConflictDialog } from "./KnowledgeVersionConflictDialog";
import type {
  KnowledgeItemDetail,
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgePreview,
  KnowledgeSectionApplicability,
  KnowledgeSectionEnvelope,
  KnowledgeSectionKey
} from "./knowledgeTypes";
import { useUnsavedKnowledgeGuard } from "./useUnsavedKnowledgeGuard";
import "./ai-estimator-knowledge.css";

const MASTER_TYPES = ["uoms", "vendors", "taxes", "priorities", "surfaces", "modes"] as const satisfies readonly KnowledgeMasterType[];

interface ConflictState {
  readonly localVersion: number;
  readonly server: KnowledgeSectionEnvelope<KnowledgeJsonObject>;
}

export function KnowledgeItemWorkspacePage() {
  const { itemId = "" } = useParams();
  const mainLineId = decodeURIComponent(itemId);
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<KnowledgeSectionKey>("overview");
  const [payload, setPayload] = useState<KnowledgeJsonObject>({});
  const [applicability, setApplicability] = useState<KnowledgeSectionApplicability>("not_configured");
  const [dirty, setDirty] = useState(false);
  const [editorValid, setEditorValid] = useState(true);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [serverReview, setServerReview] = useState<KnowledgeSectionEnvelope<KnowledgeJsonObject> | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ type: KnowledgeMasterType; select: (master: KnowledgeMaster) => void } | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<KnowledgeLifecycleAction | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [command, setCommand] = useState<"revision" | "duplicate" | null>(null);
  const [commandReason, setCommandReason] = useState("");
  const [duplicateName, setDuplicateName] = useState("");

  const canCreate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.create");
  const canUpdate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.update");
  const canLifecycle = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.lifecycle");
  const itemQuery = useQuery({
    queryKey: knowledgeQueryKeys.item(mainLineId),
    queryFn: () => getKnowledgeItem(mainLineId),
    enabled: Boolean(mainLineId)
  });
  const item = itemQuery.data;
  const revision = item?.draftRevision ?? item?.activeRevision ?? null;
  const sectionQuery = useQuery({
    queryKey: knowledgeQueryKeys.section(mainLineId, revision?.id ?? "", activeSection),
    queryFn: () => getKnowledgeSection<KnowledgeJsonObject>(mainLineId, revision!.id, activeSection),
    enabled: Boolean(mainLineId && revision?.id)
  });
  const historyQuery = useQuery({
    queryKey: knowledgeQueryKeys.history(mainLineId, { limit: 100, offset: 0 }),
    queryFn: () => getKnowledgeHistory(mainLineId, { limit: 100, offset: 0 }),
    enabled: Boolean(mainLineId)
  });
  const relationshipBasketsQuery = useQuery({
    queryKey: knowledgeQueryKeys.basketList({ limit: 100, offset: 0 }),
    queryFn: () => listKnowledgeBaskets({ limit: 100, offset: 0 })
  });
  const relationshipItemsQuery = useQuery({
    queryKey: knowledgeQueryKeys.itemList({ limit: 100, offset: 0 }),
    queryFn: () => listKnowledgeItems({ limit: 100, offset: 0 })
  });
  const masterQueries = useQueries({
    queries: MASTER_TYPES.map((type) => ({
      queryKey: knowledgeQueryKeys.masterList(type, { limit: 100, offset: 0 }),
      queryFn: () => listKnowledgeMasters(type, { limit: 100, offset: 0 })
    }))
  });
  const masters = useMemo(
    () => Object.fromEntries(MASTER_TYPES.map((type, index) => [type, masterQueries[index].data?.items ?? []])) as Readonly<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>,
    [masterQueries]
  );
  const editable = Boolean(item && revision?.status === "draft" && item.status !== "archived" && canUpdate && item.allowedActions.includes("update_section"));

  useEffect(() => {
    if (!sectionQuery.data || dirty) return;
    setPayload(sectionQuery.data.payload);
    setApplicability(sectionQuery.data.applicability);
    setEditorValid(true);
    setServerReview(null);
  }, [dirty, sectionQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!item || !revision || !sectionQuery.data) throw new Error("The draft section is unavailable.");
      return updateKnowledgeSection(mainLineId, revision.id, activeSection, {
        expectedVersion: sectionQuery.data.version,
        expectedAggregateVersion: item.version,
        applicability,
        payload: sectionPayloadForUpdate(activeSection, payload)
      });
    },
    onSuccess: async (saved) => {
      await syncKnowledgeSectionMutation(queryClient, saved);
      setPayload(saved.payload);
      setApplicability(saved.applicability);
      setDirty(false);
      setConflict(null);
      setServerReview(null);
      setAnnouncement(`${KNOWLEDGE_SECTION_LABELS[activeSection]} saved.`);
    }
  });

  const saveSection = useCallback(async (): Promise<boolean> => {
    if (!editable || !sectionQuery.data) return false;
    if (!editorValid) { setValidationAttempt((value) => value + 1); return false; }
    try {
      await saveMutation.mutateAsync();
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") {
        const [latest] = await Promise.all([sectionQuery.refetch(), itemQuery.refetch()]);
        if (latest.data) setConflict({ localVersion: sectionQuery.data.version, server: latest.data });
      }
      return false;
    }
  }, [editable, editorValid, itemQuery, saveMutation, sectionQuery]);

  const guard = useUnsavedKnowledgeGuard({
    hasUnsavedChanges: dirty,
    onSave: saveSection,
    onDiscard: () => {
      if (sectionQuery.data) {
        setPayload(sectionQuery.data.payload);
        setApplicability(sectionQuery.data.applicability);
      }
      setDirty(false);
      setEditorValid(true);
    }
  });

  const lifecycleMutation = useMutation({
    mutationFn: async ({ action, target }: { action: KnowledgeLifecycleAction; target: KnowledgeItemDetail }) => {
      if (action === "activate") {
        if (!target.draftRevision) throw new Error("The Draft revision is unavailable.");
        return activateKnowledgeRevision(mainLineId, target.draftRevision.id, { expectedVersion: target.version });
      }
      if (action === "deactivate") return deactivateKnowledgeItem(mainLineId, { expectedVersion: target.version, reason: lifecycleReason.trim() });
      return archiveKnowledgeMainLine(mainLineId, { expectedVersion: target.version, reason: lifecycleReason.trim() });
    },
    onSuccess: async (updated, variables) => {
      await syncKnowledgeLifecycleMutation(queryClient, updated);
      setLifecycleAction(null);
      setLifecycleReason("");
      setDirty(false);
      setAnnouncement(variables.action === "activate" ? "Revision activated and available to the AI knowledge context service." : `Item ${variables.action}d.`);
    }
  });
  const commandMutation = useMutation({
    mutationFn: async ({ kind, target }: { kind: "revision" | "duplicate"; target: KnowledgeItemDetail }) =>
      kind === "revision"
        ? createKnowledgeRevision(mainLineId, { expectedVersion: target.version, reason: commandReason.trim() })
        : duplicateKnowledgeItem(mainLineId, { expectedVersion: target.version, reason: commandReason.trim(), name: duplicateName.trim() || undefined }),
    onSuccess: async (updated, variables) => {
      await syncKnowledgeLifecycleMutation(queryClient, updated);
      setCommand(null);
      setCommandReason("");
      setDuplicateName("");
      if (variables.kind === "duplicate") navigate(`/admin/configuration/estimation/items/${encodeURIComponent(updated.mainLineId)}`);
      else setAnnouncement("Draft revision created.");
    }
  });

  if (itemQuery.isPending) return <PageState state="loading" message="Loading estimation item workspace…" />;
  if (itemQuery.isError) return <PageState state="error" message={itemQuery.error instanceof ApiError && itemQuery.error.status === 404 ? "This estimation item is unavailable." : itemQuery.error.message} action={{ label: "Try again", onAction: () => void itemQuery.refetch() }} />;
  if (!item) return <PageState state="empty" message="This estimation item is unavailable." />;

  const lifecycleError = lifecycleMutation.error instanceof ApiError && lifecycleMutation.error.code === "VERSION_CONFLICT" ? "This item changed elsewhere. Refresh before retrying." : lifecycleMutation.error?.message ?? null;
  const commandError = commandMutation.error instanceof ApiError && commandMutation.error.code === "VERSION_CONFLICT" ? "This item changed elsewhere. Refresh before retrying." : commandMutation.error?.message ?? null;

  return (
    <div className="knowledge-page">
      <PageHeader
        id="knowledge-item-title"
        breadcrumb={<Button variant="quiet" size="compact" leadingIcon={<ArrowLeft />} onClick={() => guard.requestNavigation(() => navigate("/admin/configuration/estimation"))}>Back to knowledge base</Button>}
        eyebrow={`${item.basketName} → Main Line`}
        title={item.mainLineName}
        description={item.description ?? "No description provided."}
        metadata={<div className="knowledge-header-metadata"><StatusBadge label={KNOWLEDGE_ITEM_STATUS_LABELS[item.status]} tone={item.status === "active" ? "success" : item.status === "draft" ? "warning" : item.status === "archived" ? "danger" : "neutral"} /><span>Updated {formatKnowledgeDateTime(item.updatedAt)} by {item.updatedById}</span></div>}
        actions={<WorkspaceActions item={item} dirty={dirty} canCreate={canCreate} canLifecycle={canLifecycle} onSave={() => void saveSection()} onCommand={(next) => guard.requestNavigation(() => setCommand(next))} onLifecycle={(next) => guard.requestNavigation(() => setLifecycleAction(next))} saveBusy={saveMutation.isPending} saveDisabled={!editable || !dirty} />}
      />
      <KnowledgeSafetyNotice />
      <Surface as="section" className="knowledge-workspace-summary" variant="subtle" aria-label="Revision summary">
        <div className="knowledge-summary-progress"><div><strong>{item.completeness.percentage}% complete</strong><span>Backend-derived activation readiness</span></div><ProgressBar value={item.completeness.percentage} label="Knowledge completeness" valueText={`${item.completeness.percentage}% complete`} /></div>
        <dl className="knowledge-summary-list"><div><dt>Active revision</dt><dd>{item.activeRevision ? `Revision ${item.activeRevision.revisionNumber}` : "None"}</dd></div><div><dt>Draft revision</dt><dd>{item.draftRevision ? `Revision ${item.draftRevision.revisionNumber}` : "None"}</dd></div><div><dt>Current view</dt><dd>{revision ? `${revision.status} revision ${revision.revisionNumber}` : "Unavailable"}</dd></div></dl>
      </Surface>
      {announcement ? <p className="sr-only" role="status">{announcement}</p> : null}
      {item.status === "archived" ? <InlineMessage tone="warning" title="Archived configuration">This item and its revision history are read-only.</InlineMessage> : !editable && revision?.status !== "draft" ? <InlineMessage tone="info" title="Active history is read-only">Create a Draft revision to change section data. The active revision remains available until a new Draft is activated.</InlineMessage> : null}

      <KnowledgeSectionNavigation activeSection={activeSection} onSectionChange={(next) => guard.requestNavigation(() => { setActiveSection(next); setDirty(false); setEditorValid(true); setConflict(null); setServerReview(null); })} panelBusy={sectionQuery.isFetching}>
        {sectionQuery.isPending ? <PageState state="loading" message={`Loading ${KNOWLEDGE_SECTION_LABELS[activeSection]}…`} /> : sectionQuery.isError ? <PageState state="error" message={sectionQuery.error.message} action={{ label: "Try again", onAction: () => void sectionQuery.refetch() }} /> : sectionQuery.data ? (
          <Surface as="section" className="knowledge-workspace-section">
            <div className="knowledge-section-toolbar">
              <Field id="knowledge-applicability" label="Section state" className="knowledge-section-toolbar__field">{(props) => <Select {...props} disabled={!editable} value={applicability} onChange={(event) => { setApplicability(event.target.value as KnowledgeSectionApplicability); setDirty(true); }}><option value="configured">Configured</option><option value="not_configured">Not configured</option><option value="not_applicable">Not applicable</option></Select>}</Field>
              <span className="knowledge-section-toolbar__meta">Section version {sectionQuery.data.version}</span>
              {editable ? <Button className="knowledge-section-toolbar__save" leadingIcon={<Save />} busy={saveMutation.isPending} disabled={!dirty} onClick={() => void saveSection()}>Save section</Button> : null}
            </div>
            {serverReview ? <Surface as="section" variant="subtle" className="knowledge-conflict-review" aria-label="Latest server version"><h3>Latest server version {serverReview.version}</h3><p>Your unsaved local editor remains below for comparison.</p><pre>{JSON.stringify(serverReview.payload, null, 2)}</pre></Surface> : null}
            {(relationshipBasketsQuery.isError || relationshipItemsQuery.isError) && ["scope", "recommendations", "advanced"].includes(activeSection) ? <InlineMessage tone="warning">Some Basket or Main Line choices could not be loaded. Existing stable-ID selections remain visible; retry before changing relationships.</InlineMessage> : null}
            <KnowledgeSectionEditor sectionKey={activeSection} payload={payload} masters={masters} relationshipBaskets={relationshipBasketsQuery.data?.items ?? []} relationshipItems={relationshipItemsQuery.data?.items ?? []} currentMainLineId={mainLineId} readOnly={!editable} canQuickAdd={canCreate} resetKey={`${sectionQuery.data.id}-${sectionQuery.data.version}`} validationAttempt={validationAttempt} onChange={setPayload} onDirty={() => setDirty(true)} onValidationChange={setEditorValid} onQuickAdd={(type, select) => setQuickAdd({ type, select })} />
            {activeSection === "quantity-margin" ? <KnowledgePreviewPanel disabled={false} /> : null}
            {saveMutation.error && !(saveMutation.error instanceof ApiError && saveMutation.error.code === "VERSION_CONFLICT") ? <InlineMessage tone="error" role="alert">{saveMutation.error.message}</InlineMessage> : null}
          </Surface>
        ) : <PageState state="empty" message="This revision has no section data." />}
      </KnowledgeSectionNavigation>

      <Surface as="section" className="knowledge-history" aria-labelledby="knowledge-history-title"><div className="knowledge-section-heading"><div><h2 id="knowledge-history-title">Revision history</h2><p>Activated revisions remain immutable.</p></div></div>{historyQuery.isPending ? <PageState state="loading" message="Loading revision history…" /> : historyQuery.isError ? <InlineMessage tone="error">{historyQuery.error.message}</InlineMessage> : historyQuery.data.items.length ? <ol>{historyQuery.data.items.map((entry) => <li key={entry.id}><div><strong>Revision {entry.revisionNumber}</strong><StatusBadge label={entry.status} tone={entry.status === "active" ? "success" : entry.status === "draft" ? "warning" : "neutral"} /></div><span>Updated {formatKnowledgeDateTime(entry.updatedAt)} · {entry.completeness.percentage}% complete</span></li>)}</ol> : <p>No revision history is available.</p>}</Surface>

      {guard.dialogOpen ? <KnowledgeUnsavedChangesDialog onSave={() => void guard.saveAndContinue()} onDiscard={guard.discardAndContinue} onStay={guard.stayHere} busy={guard.busy} error={guard.error} /> : null}
      {conflict ? <KnowledgeVersionConflictDialog localVersion={conflict.localVersion} serverVersion={conflict.server.version} onKeepEditing={() => setConflict(null)} onReviewServerVersion={() => { setServerReview(conflict.server); setConflict(null); }} onDiscardLocalChanges={() => { setPayload(conflict.server.payload); setApplicability(conflict.server.applicability); setDirty(false); setConflict(null); setServerReview(null); }} /> : null}
      {quickAdd ? <KnowledgeMasterEditorDialog masterType={quickAdd.type} quickAdd onSaved={quickAdd.select} onClose={() => setQuickAdd(null)} /> : null}
      {lifecycleAction ? <KnowledgeLifecycleDialog action={lifecycleAction} blockers={lifecycleAction === "activate" ? item.blockers : []} warnings={lifecycleAction === "activate" ? item.warnings : []} reason={lifecycleReason} onReasonChange={setLifecycleReason} onClose={() => { setLifecycleAction(null); lifecycleMutation.reset(); }} onConfirm={() => lifecycleMutation.mutate({ action: lifecycleAction, target: item })} busy={lifecycleMutation.isPending} error={lifecycleError} /> : null}
      {command ? <KnowledgeCommandDialog kind={command} reason={commandReason} duplicateName={duplicateName} onReasonChange={setCommandReason} onNameChange={setDuplicateName} onClose={() => { setCommand(null); commandMutation.reset(); }} onConfirm={() => commandMutation.mutate({ kind: command, target: item })} busy={commandMutation.isPending} error={commandError} /> : null}
    </div>
  );
}

function sectionPayloadForUpdate(sectionKey: KnowledgeSectionKey, payload: KnowledgeJsonObject): KnowledgeJsonObject {
  if (sectionKey !== "pricing" || !Array.isArray(payload.priceEntries)) return payload;
  return {
    ...payload,
    priceEntries: payload.priceEntries.map((entry) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry) || entry.operation !== "reference") return entry;
      return {
        operation: "reference",
        priceEntryId: typeof entry.priceEntryId === "string" ? entry.priceEntryId : "",
        priceVersionId: typeof entry.priceVersionId === "string" ? entry.priceVersionId : ""
      };
    })
  };
}

function WorkspaceActions({ item, dirty, canCreate, canLifecycle, onSave, onCommand, onLifecycle, saveBusy, saveDisabled }: {
  readonly item: KnowledgeItemDetail;
  readonly dirty: boolean;
  readonly canCreate: boolean;
  readonly canLifecycle: boolean;
  readonly onSave: () => void;
  readonly onCommand: (command: "revision" | "duplicate") => void;
  readonly onLifecycle: (action: KnowledgeLifecycleAction) => void;
  readonly saveBusy: boolean;
  readonly saveDisabled: boolean;
}) {
  return <>{dirty ? <Button leadingIcon={<Save />} busy={saveBusy} disabled={saveDisabled} onClick={onSave}>Save section</Button> : null}{canLifecycle && item.allowedActions.includes("review_and_activate") ? <Button variant="success" leadingIcon={<ShieldCheck />} onClick={() => onLifecycle("activate")}>Review and activate</Button> : null}{canCreate && item.allowedActions.includes("create_revision") ? <Button leadingIcon={<Plus />} onClick={() => onCommand("revision")}>Create revision</Button> : null}{canCreate && item.allowedActions.includes("duplicate") ? <Button variant="secondary" leadingIcon={<Copy />} onClick={() => onCommand("duplicate")}>Duplicate</Button> : null}{canLifecycle && item.allowedActions.includes("deactivate") ? <Button variant="destructive-outline" onClick={() => onLifecycle("deactivate")}>Deactivate</Button> : null}{canLifecycle && item.allowedActions.includes("archive") ? <Button variant="destructive-outline" leadingIcon={<Archive />} onClick={() => onLifecycle("archive")}>Archive</Button> : null}</>;
}

function KnowledgeCommandDialog({ kind, reason, duplicateName, onReasonChange, onNameChange, onClose, onConfirm, busy, error }: {
  readonly kind: "revision" | "duplicate";
  readonly reason: string;
  readonly duplicateName: string;
  readonly onReasonChange: (value: string) => void;
  readonly onNameChange: (value: string) => void;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly busy: boolean;
  readonly error: string | null;
}) {
  return <Dialog title={kind === "revision" ? "Create a Draft revision?" : "Duplicate this estimation item?"} eyebrow="Estimation configuration" description={kind === "revision" ? "The current Active revision stays available while the new Draft is edited." : "The duplicate receives independent stable IDs and Draft history."} onClose={onClose} busy={busy} role="alertdialog"><form className="knowledge-dialog-form" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}><div className="knowledge-dialog-body">{error ? <InlineMessage tone="error" role="alert">{error}</InlineMessage> : null}{kind === "duplicate" ? <Field id="duplicate-name" label="New Main Line name" hint="Leave empty to use the server-generated copy name.">{(props) => <Input {...props} value={duplicateName} onChange={(event) => onNameChange(event.target.value)} />}</Field> : null}<Field id="command-reason" label="Reason" required hint="Recorded on the audit trail for this configuration change.">{(props) => <Textarea {...props} value={reason} onChange={(event) => onReasonChange(event.target.value)} />}</Field></div><div className="knowledge-dialog-actions"><Button type="button" variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy} disabled={!reason.trim()}>{kind === "revision" ? "Create Draft" : "Duplicate item"}</Button></div></form></Dialog>;
}

function KnowledgePreviewPanel({ disabled }: { readonly disabled: boolean }) {
  const [unitRateRupees, setUnitRateRupees] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityScale, setQuantityScale] = useState("0");
  const [quantityAdjustmentBps, setQuantityAdjustmentBps] = useState("");
  const [wastageBps, setWastageBps] = useState("");
  const [taxRateBps, setTaxRateBps] = useState("");
  const [taxTreatment, setTaxTreatment] = useState<"exclusive" | "inclusive">("exclusive");
  const [startMarginBps, setStartMarginBps] = useState("");
  const [bottomMarginBps, setBottomMarginBps] = useState("");
  const [pmcMarkupBps, setPmcMarkupBps] = useState("");
  const parsedUnitRate = parseRupeeInputToPaise(unitRateRupees);
  const unitRateError = unitRateRupees === "" || parsedUnitRate.status === "valid"
    ? undefined
    : parsedUnitRate.status === "incomplete"
      ? "Complete the rupee amount with one or two digits after the decimal point."
      : parsedUnitRate.reason === "unsafe"
        ? "Enter a rupee amount within the supported range."
        : "Enter a non-negative rupee amount with no more than two decimal places.";
  const mutation = useMutation({
    mutationFn: () => previewKnowledge(previewRequest({ unitRateRupees, quantity, quantityScale, quantityAdjustmentBps, wastageBps, taxRateBps, taxTreatment, startMarginBps, bottomMarginBps, pmcMarkupBps }))
  });
  const ready = parsedUnitRate.status === "valid" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(quantity) && isBoundedInteger(quantityScale, 0, 18);
  return <Surface as="section" variant="subtle" className="knowledge-preview-panel" aria-labelledby="knowledge-preview-title"><div className="knowledge-section-heading"><div><h3 id="knowledge-preview-title">Server calculation preview</h3><p>The server remains authoritative for monetary amounts, percentages, and canonical decimal quantities; the client does not calculate totals.</p></div></div><div className="knowledge-form-grid"><Field id="preview-rate" label="Unit rate (₹)" hint="Enter a non-negative rupee amount with up to two decimal places, for example 0, 0.01, or 125.50." error={unitRateError}>{(props) => <Input {...props} type="text" inputMode="decimal" value={unitRateRupees} onChange={(event) => setUnitRateRupees(event.target.value)} onBlur={() => { if (parsedUnitRate.status === "valid") setUnitRateRupees(formatPaiseForRupeeInput(parsedUnitRate.paise)); }} />}</Field><PreviewInput id="preview-quantity" label="Quantity" value={quantity} setValue={setQuantity} text /><PreviewInput id="preview-scale" label="Quantity scale" value={quantityScale} setValue={setQuantityScale} /><PreviewInput id="preview-adjustment" label="Quantity adjustment (BPS)" value={quantityAdjustmentBps} setValue={setQuantityAdjustmentBps} /><PreviewInput id="preview-wastage" label="Wastage (BPS)" value={wastageBps} setValue={setWastageBps} /><PreviewInput id="preview-tax" label="Tax rate (BPS)" value={taxRateBps} setValue={setTaxRateBps} />{taxRateBps !== "" ? <Field id="preview-treatment" label="Tax treatment">{(props) => <Select {...props} value={taxTreatment} onChange={(event) => setTaxTreatment(event.target.value as typeof taxTreatment)}><option value="exclusive">Exclusive</option><option value="inclusive">Inclusive</option></Select>}</Field> : null}<PreviewInput id="preview-start-margin" label="Start margin (BPS)" value={startMarginBps} setValue={setStartMarginBps} /><PreviewInput id="preview-bottom-margin" label="Bottom margin (BPS)" value={bottomMarginBps} setValue={setBottomMarginBps} /><PreviewInput id="preview-pmc" label="PMC markup (BPS)" value={pmcMarkupBps} setValue={setPmcMarkupBps} /></div><div className="knowledge-preview-actions"><Button variant="secondary" busy={mutation.isPending} disabled={disabled || !ready} onClick={() => mutation.mutate()}>Run server preview</Button></div>{mutation.error ? <InlineMessage tone="error" role="alert">{mutation.error.message}</InlineMessage> : mutation.data ? <KnowledgePreviewResult preview={mutation.data} /> : null}</Surface>;
}

function PreviewInput({ id, label, value, setValue, text = false }: { readonly id: string; readonly label: string; readonly value: string; readonly setValue: (value: string) => void; readonly text?: boolean }) {
  return <Field id={id} label={label}>{(props) => <Input {...props} type={text ? "text" : "number"} min={text ? undefined : 0} step={text ? undefined : 1} value={value} onChange={(event) => setValue(event.target.value)} />}</Field>;
}

function previewRequest(values: Readonly<{
  unitRateRupees: string;
  quantity: string;
  quantityScale: string;
  quantityAdjustmentBps: string;
  wastageBps: string;
  taxRateBps: string;
  taxTreatment: string;
  startMarginBps: string;
  bottomMarginBps: string;
  pmcMarkupBps: string;
}>): KnowledgePreviewRequest {
  const unitRate = parseRupeeInputToPaise(values.unitRateRupees);
  if (unitRate.status !== "valid") throw new Error("Enter a valid unit rate in rupees before running the preview.");
  const integer = (value: string) => value === "" ? undefined : Number(value);
  const taxRateBps = integer(values.taxRateBps);
  return { unitRatePaise: unitRate.paise, quantity: values.quantity || null, quantityScale: Number(values.quantityScale), quantityAdjustmentBps: integer(values.quantityAdjustmentBps), wastageBps: integer(values.wastageBps), taxRateBps, ...(taxRateBps === undefined ? {} : { taxTreatment: values.taxTreatment as "exclusive" | "inclusive" }), startMarginBps: integer(values.startMarginBps), bottomMarginBps: integer(values.bottomMarginBps), pmcMarkupBps: integer(values.pmcMarkupBps) };
}

function isBoundedInteger(value: string, minimum: number, maximum: number): boolean {
  return value !== "" && Number.isInteger(Number(value)) && Number(value) >= minimum && Number(value) <= maximum;
}

function KnowledgePreviewResult({ preview }: { readonly preview: KnowledgePreview }) {
  const amounts = [["Effective unit rate", preview.effectiveUnitRatePaise], ["Vendor pre-tax", preview.vendorPreTax?.amountPaise], ["Vendor tax", preview.vendorTax?.amountPaise], ["Vendor total", preview.vendorTotal?.amountPaise], ["Start margin", preview.startMargin?.amountPaise], ["Bottom margin", preview.bottomMargin?.amountPaise], ["PMC markup", preview.pmcMarkup?.amountPaise]] as const;
  return <div className="knowledge-preview-result" role="status"><h4>Preview components</h4><dl>{amounts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{typeof value === "number" ? formatKnowledgeMoney(value) : "Not resolved"}</dd></div>)}<div><dt>Procurement quantity</dt><dd>{preview.procurementQuantity ?? "Not resolved"}</dd></div>{preview.startMargin?.rateBps !== null && preview.startMargin?.rateBps !== undefined ? <div><dt>Start margin rate</dt><dd>{formatKnowledgePercentage(preview.startMargin.rateBps)}</dd></div> : null}</dl></div>;
}

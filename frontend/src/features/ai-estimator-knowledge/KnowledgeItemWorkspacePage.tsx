import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Copy, Plus, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
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
  updateKnowledgeSection
} from "./knowledgeApi";
import { KnowledgeLifecycleDialog, type KnowledgeLifecycleAction } from "./KnowledgeLifecycleDialogs";
import { KnowledgeMasterEditorDialog } from "./KnowledgeMasterEditorDialog";
import { KnowledgeModePanel, type KnowledgeModePanelHandle } from "./KnowledgeModePanel";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import { KnowledgeRevisionHistory } from "./KnowledgeRevisionHistory";
import { KnowledgeSectionCommandBar } from "./KnowledgeSectionCommandBar";
import { KnowledgeWorkspaceStatus } from "./KnowledgeWorkspaceStatus";
import { syncKnowledgeLifecycleMutation, syncKnowledgeSectionMutation } from "./knowledgeMutationSync";
import {
  KnowledgeOverviewPanel,
  type KnowledgeOverviewSectionState
} from "./KnowledgeOverviewPanel";
import { projectKnowledgeOverviewSummary } from "./knowledgeOverviewSummary";
import {
  KNOWLEDGE_ITEM_STATUS_LABELS,
  KNOWLEDGE_SECTION_LABELS,
  KNOWLEDGE_WORKSPACE_SECTION_LABELS,
  formatKnowledgeDateTime,
} from "./knowledgePresentation";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import {
  knowledgeOverviewPayloadForUpdate,
  knowledgeSectionPayloadForUpdate,
  type KnowledgeOverviewEditableField
} from "./knowledgeSectionPayload";
import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";
import { KnowledgeSectionNavigation } from "./KnowledgeSectionNavigation";
import { KnowledgeSafetyNotice } from "./KnowledgeSafetyNotice";
import { KnowledgeUnsavedChangesDialog } from "./KnowledgeUnsavedChangesDialog";
import { KnowledgeVersionConflictDialog } from "./KnowledgeVersionConflictDialog";
import type { KnowledgeWorkspaceSectionKey } from "./knowledgeWorkspaceSections";
import type {
  KnowledgeItemDetail,
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeSectionEnvelope,
  KnowledgeSectionKey
} from "./knowledgeTypes";
import { useUnsavedKnowledgeGuard } from "./useUnsavedKnowledgeGuard";
import "./ai-estimator-knowledge.css";

const MASTER_TYPES = ["uoms", "vendors", "taxes", "priorities", "surfaces", "modes"] as const satisfies readonly KnowledgeMasterType[];
const OVERVIEW_SUMMARY_SECTION_KEYS = [
  "pricing",
  "quantity-margin",
  "scope",
  "recommendations",
  "quality",
  "execution",
  "advanced"
] as const satisfies readonly KnowledgeSectionKey[];

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
  const modePanelRef = useRef<KnowledgeModePanelHandle>(null);
  const [activeSection, setActiveSection] = useState<KnowledgeWorkspaceSectionKey>("overview");
  const [payload, setPayload] = useState<KnowledgeJsonObject>({});
  const [dirty, setDirty] = useState(false);
  const [overviewDirtyFields, setOverviewDirtyFields] = useState<ReadonlySet<KnowledgeOverviewEditableField>>(() => new Set());
  const [modeDirty, setModeDirty] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeSaveError, setModeSaveError] = useState<string | null>(null);
  const [editorValid, setEditorValid] = useState(true);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [serverReview, setServerReview] = useState<ConflictState | null>(null);
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
  const backendSection: KnowledgeSectionKey | null = activeSection === "mode"
    ? null
    : activeSection;
  const sectionQuery = useQuery({
    queryKey: knowledgeQueryKeys.section(mainLineId, revision?.id ?? "", backendSection ?? "overview"),
    queryFn: () => getKnowledgeSection<KnowledgeJsonObject>(mainLineId, revision!.id, backendSection!),
    enabled: Boolean(mainLineId && revision?.id && backendSection)
  });
  const overviewSummaryQueries = useQueries({
    queries: OVERVIEW_SUMMARY_SECTION_KEYS.map((sectionKey) => ({
      queryKey: knowledgeQueryKeys.section(mainLineId, revision?.id ?? "", sectionKey),
      queryFn: () => getKnowledgeSection<KnowledgeJsonObject>(mainLineId, revision!.id, sectionKey),
      enabled: Boolean(mainLineId && revision?.id && activeSection === "overview")
    }))
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
      queryKey: type === "modes" || type === "uoms" || type === "priorities" || type === "vendors" || type === "taxes"
        ? knowledgeQueryKeys.masterCatalog(type)
        : knowledgeQueryKeys.masterList(type, { limit: 100, offset: 0 }),
      queryFn: () => type === "modes" || type === "uoms" || type === "priorities" || type === "vendors" || type === "taxes"
        ? collectAllKnowledgeMasterPages(
            (params) => listKnowledgeMasters(type, params),
            type === "modes"
              ? "Mode"
              : type === "uoms"
                ? "Unit"
                : type === "priorities"
                  ? "Priority"
                  : type === "vendors"
                    ? "Vendor"
                    : "Tax"
          )
        : listKnowledgeMasters(type, { limit: 100, offset: 0 })
    }))
  });
  const masters = useMemo(
    () => Object.fromEntries(MASTER_TYPES.map((type, index) => [type, masterQueries[index].data?.items ?? []])) as Readonly<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>,
    [masterQueries]
  );
  const modesQuery = masterQueries[MASTER_TYPES.indexOf("modes")]!;
  const modesHaveData = Boolean(modesQuery.data);
  const legacyModeCatalogState = {
    status: modesQuery.isError && !modesHaveData
      ? "error" as const
      : modesQuery.isPending && !modesHaveData
        ? "loading" as const
        : "ready" as const,
    refreshing: modesHaveData && modesQuery.isFetching,
    errorMessage: modesQuery.error instanceof Error ? modesQuery.error.message : undefined,
    onRetry: () => { void modesQuery.refetch(); }
  };
  const uomsQuery = masterQueries[MASTER_TYPES.indexOf("uoms")]!;
  const uomsHaveData = Boolean(uomsQuery.data);
  const uomCatalogState = {
    status: uomsQuery.isError && !uomsHaveData
      ? "error" as const
      : uomsQuery.isPending && !uomsHaveData
        ? "loading" as const
        : "ready" as const,
    refreshing: uomsHaveData && uomsQuery.isFetching,
    errorMessage: !uomsHaveData && uomsQuery.error instanceof Error
      ? uomsQuery.error.message
      : undefined,
    refreshErrorMessage: uomsHaveData && uomsQuery.isError && uomsQuery.error instanceof Error
      ? uomsQuery.error.message
      : undefined,
    onRetry: () => { void uomsQuery.refetch(); }
  };
  const prioritiesQuery = masterQueries[MASTER_TYPES.indexOf("priorities")]!;
  const prioritiesHaveData = Boolean(prioritiesQuery.data);
  const priorityCatalogState = {
    status: prioritiesQuery.isError && !prioritiesHaveData
      ? "error" as const
      : prioritiesQuery.isPending && !prioritiesHaveData
        ? "loading" as const
        : "ready" as const,
    refreshing: prioritiesHaveData && prioritiesQuery.isFetching,
    errorMessage: !prioritiesHaveData && prioritiesQuery.error instanceof Error
      ? prioritiesQuery.error.message
      : undefined,
    refreshErrorMessage: prioritiesHaveData && prioritiesQuery.isError && prioritiesQuery.error instanceof Error
      ? prioritiesQuery.error.message
      : undefined,
    onRetry: () => { void prioritiesQuery.refetch(); }
  };
  const vendorsQuery = masterQueries[MASTER_TYPES.indexOf("vendors")]!;
  const vendorsHaveData = Boolean(vendorsQuery.data);
  const vendorCatalogState = {
    status: vendorsQuery.isError && !vendorsHaveData
      ? "error" as const
      : vendorsQuery.isPending && !vendorsHaveData
        ? "loading" as const
        : "ready" as const,
    refreshing: vendorsHaveData && vendorsQuery.isFetching,
    errorMessage: !vendorsHaveData && vendorsQuery.error instanceof Error
      ? vendorsQuery.error.message
      : undefined,
    refreshErrorMessage: vendorsHaveData && vendorsQuery.isError && vendorsQuery.error instanceof Error
      ? vendorsQuery.error.message
      : undefined,
    onRetry: () => { void vendorsQuery.refetch(); }
  };
  const editable = Boolean(item && revision?.status === "draft" && item.status !== "archived" && canUpdate && item.allowedActions.includes("update_section"));
  const overviewDraftPayload = activeSection === "overview" && sectionQuery.data
    ? dirty ? payload : sectionQuery.data.payload
    : payload;
  const overviewSections: Partial<Record<KnowledgeSectionKey, KnowledgeJsonObject>> = {};
  if (activeSection === "overview" && sectionQuery.data?.sectionKey === "overview") {
    overviewSections.overview = overviewDraftPayload;
  }
  OVERVIEW_SUMMARY_SECTION_KEYS.forEach((sectionKey, index) => {
    const envelope = overviewSummaryQueries[index]?.data;
    if (envelope) overviewSections[sectionKey] = envelope.payload;
  });
  const overviewSummary = projectKnowledgeOverviewSummary({
    sections: overviewSections,
    masters,
    baskets: relationshipBasketsQuery.data?.items ?? [],
    items: relationshipItemsQuery.data?.items ?? [],
    completeness: revision?.completeness ?? item?.completeness ?? null
  });
  const overviewSectionStates = Object.fromEntries(
    OVERVIEW_SUMMARY_SECTION_KEYS.map((sectionKey, index) => {
      const query = overviewSummaryQueries[index]!;
      const hasData = Boolean(query.data);
      const state: KnowledgeOverviewSectionState = {
        status: query.isError && !hasData
          ? "error"
          : query.isPending && !hasData
            ? "loading"
            : "ready",
        refreshing: hasData && query.isFetching,
        errorMessage: query.error instanceof Error ? query.error.message : undefined,
        refreshErrorMessage: query.isError && hasData && query.error instanceof Error
          ? query.error.message
          : undefined,
        onRetry: () => { void query.refetch(); }
      };
      return [sectionKey, state];
    })
  ) as Readonly<Partial<Record<KnowledgeSectionKey, KnowledgeOverviewSectionState>>>;
  const overviewMasterStates = Object.fromEntries(
    MASTER_TYPES.map((type, index) => {
      const query = masterQueries[index]!;
      const hasData = Boolean(query.data);
      const state: KnowledgeOverviewSectionState = {
        status: query.isError && !hasData
          ? "error"
          : query.isPending && !hasData
            ? "loading"
            : "ready",
        refreshing: hasData && query.isFetching,
        errorMessage: query.error instanceof Error ? query.error.message : undefined,
        refreshErrorMessage: query.isError && hasData && query.error instanceof Error
          ? query.error.message
          : undefined,
        onRetry: () => { void query.refetch(); }
      };
      return [type, state];
    })
  ) as Readonly<Partial<Record<KnowledgeMasterType, KnowledgeOverviewSectionState>>>;
  const relationshipsHaveData = Boolean(
    relationshipBasketsQuery.data && relationshipItemsQuery.data
  );
  const relationshipsError = relationshipBasketsQuery.error ?? relationshipItemsQuery.error;
  const overviewRelationshipState: KnowledgeOverviewSectionState = {
    status: (relationshipBasketsQuery.isError || relationshipItemsQuery.isError) && !relationshipsHaveData
      ? "error"
      : (relationshipBasketsQuery.isPending || relationshipItemsQuery.isPending) && !relationshipsHaveData
        ? "loading"
        : "ready",
    refreshing: relationshipsHaveData && (
      relationshipBasketsQuery.isFetching || relationshipItemsQuery.isFetching
    ),
    errorMessage: relationshipsError instanceof Error ? relationshipsError.message : undefined,
    refreshErrorMessage: relationshipsHaveData && relationshipsError instanceof Error
      ? relationshipsError.message
      : undefined,
    onRetry: () => {
      if (relationshipBasketsQuery.isError) void relationshipBasketsQuery.refetch();
      if (relationshipItemsQuery.isError) void relationshipItemsQuery.refetch();
    }
  };

  useEffect(() => {
    if (!sectionQuery.data || dirty) return;
    setPayload(sectionQuery.data.payload);
    setEditorValid(true);
    setServerReview(null);
    setOverviewDirtyFields(new Set());
  }, [dirty, sectionQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!item || !revision || !backendSection || !sectionQuery.data) throw new Error("The draft section is unavailable.");
      const rebasedPayload = backendSection === "overview"
        ? knowledgeOverviewPayloadForUpdate(
            sectionQuery.data.payload,
            payload,
            overviewDirtyFields
          )
        : payload;
      return updateKnowledgeSection(mainLineId, revision.id, backendSection, {
        expectedVersion: sectionQuery.data.version,
        expectedAggregateVersion: item.version,
        applicability: sectionQuery.data.applicability,
        payload: knowledgeSectionPayloadForUpdate(backendSection, rebasedPayload)
      });
    },
    onSuccess: async (saved) => {
      await syncKnowledgeSectionMutation(queryClient, saved);
      setPayload(saved.payload);
      setDirty(false);
      setOverviewDirtyFields(new Set());
      setConflict(null);
      setServerReview(null);
      setAnnouncement(`${KNOWLEDGE_SECTION_LABELS[saved.sectionKey]} saved.`);
    }
  });

  const saveSection = useCallback(async (): Promise<boolean> => {
    if (!editable || !backendSection || !sectionQuery.data) return false;
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
  }, [backendSection, editable, editorValid, itemQuery, saveMutation, sectionQuery]);

  const saveActiveSection = useCallback(async (): Promise<boolean> => {
    if (activeSection === "mode") {
      return modePanelRef.current?.save() ?? false;
    }
    return saveSection();
  }, [activeSection, saveSection]);

  const discardActiveSection = useCallback(() => {
    if (activeSection === "mode") {
      modePanelRef.current?.discard();
      setModeDirty(false);
      setModeSaveError(null);
      return;
    }
    if (sectionQuery.data) {
      setPayload(sectionQuery.data.payload);
    }
    setDirty(false);
    setOverviewDirtyFields(new Set());
    setEditorValid(true);
  }, [activeSection, sectionQuery.data]);

  const activeDirty = activeSection === "mode" ? modeDirty : dirty;
  const activeSaving = activeSection === "mode" ? modeSaving : saveMutation.isPending;
  const activeSaveError = activeSection === "mode"
    ? modeSaveError
    : saveMutation.error && !(saveMutation.error instanceof ApiError && saveMutation.error.code === "VERSION_CONFLICT")
      ? saveMutation.error.message
      : null;

  const guard = useUnsavedKnowledgeGuard({
    hasUnsavedChanges: activeDirty,
    onSave: saveActiveSection,
    onDiscard: discardActiveSection
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
      setOverviewDirtyFields(new Set());
      setModeDirty(false);
      setModeSaveError(null);
      setAnnouncement(variables.action === "activate" ? "Revision activated and available to the AI knowledge context service." : `Item ${variables.action}d.`);
      if (variables.action === "archive") navigate("/admin/configuration/estimation", { replace: true });
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

  function selectWorkspaceSection(next: KnowledgeWorkspaceSectionKey) {
    guard.requestNavigation(() => {
      setActiveSection(next);
      setDirty(false);
      setOverviewDirtyFields(new Set());
      setModeDirty(false);
      setModeSaveError(null);
      setEditorValid(true);
      setConflict(null);
      setServerReview(null);
      saveMutation.reset();
    });
  }

  if (itemQuery.isPending) return <PageState state="loading" message="Loading estimation item workspace…" />;
  if (itemQuery.isError) return <PageState state="error" message={itemQuery.error instanceof ApiError && itemQuery.error.status === 404 ? "This estimation item is unavailable." : itemQuery.error.message} action={{ label: "Try again", onAction: () => void itemQuery.refetch() }} />;
  if (!item) return <PageState state="empty" message="This estimation item is unavailable." />;

  const lifecycleError = lifecycleMutation.error instanceof ApiError && lifecycleMutation.error.code === "VERSION_CONFLICT" ? "This item changed elsewhere. Refresh before retrying." : lifecycleMutation.error?.message ?? null;
  const commandError = commandMutation.error instanceof ApiError && commandMutation.error.code === "VERSION_CONFLICT" ? "This item changed elsewhere. Refresh before retrying." : commandMutation.error?.message ?? null;
  const activeSectionLabel = KNOWLEDGE_WORKSPACE_SECTION_LABELS[activeSection];
  const commandVersionLabel = activeSection === "mode"
    ? revision
      ? `Version ${revision.revisionNumber}`
      : "Version unavailable"
    : sectionQuery.data
      ? `Version ${sectionQuery.data.version}`
      : "Version unavailable";

  return (
    <div className="knowledge-page knowledge-page--item-workspace">
      <PageHeader
        id="knowledge-item-title"
        breadcrumb={<Button variant="quiet" size="compact" leadingIcon={<ArrowLeft />} onClick={() => guard.requestNavigation(() => navigate("/admin/configuration/estimation"))}>Back to Main Baskets</Button>}
        eyebrow={`Main Basket · ${item.basketName}`}
        title={item.mainLineName}
        metadata={<div className="knowledge-header-metadata"><StatusBadge label={KNOWLEDGE_ITEM_STATUS_LABELS[item.status]} tone={item.status === "active" ? "success" : item.status === "draft" ? "warning" : item.status === "archived" ? "danger" : "neutral"} /><span>Updated {formatKnowledgeDateTime(item.updatedAt)}</span></div>}
        actions={<WorkspaceActions item={item} canCreate={canCreate} canLifecycle={canLifecycle} onCommand={(next) => guard.requestNavigation(() => setCommand(next))} onLifecycle={(next) => guard.requestNavigation(() => setLifecycleAction(next))} />}
      />
      <KnowledgeSafetyNotice />
      <KnowledgeWorkspaceStatus item={item} revision={revision} />
      {announcement ? <p className="sr-only" role="status">{announcement}</p> : null}
      {item.status === "archived" ? <InlineMessage tone="warning" title="Archived configuration">This item and its revision history are read-only.</InlineMessage> : revision && !editable && revision.status !== "draft" ? <InlineMessage tone="info" title="Active history is read-only">Create a Draft revision to change section data. The active revision remains available until a new Draft is activated.</InlineMessage> : null}

      <div className="knowledge-workspace-layout">
        <div className="knowledge-workspace-main">
          <KnowledgeSectionNavigation activeSection={activeSection} onSectionChange={selectWorkspaceSection} panelBusy={activeSection === "mode" ? modeBusy : activeSection === "overview" ? sectionQuery.isFetching || overviewSummaryQueries.some(({ isFetching }) => isFetching) : sectionQuery.isFetching}>
            {revision ? (
              <KnowledgeSectionCommandBar
                sectionLabel={activeSectionLabel}
                versionLabel={commandVersionLabel}
                editable={editable}
                dirty={activeDirty}
                saving={activeSaving}
                saveError={activeSaveError}
                onSave={() => void saveActiveSection()}
              />
            ) : null}
            {!revision ? (
              <PageState state="empty" message="This item has no revision to display." />
            ) : activeSection === "mode" ? (
              <KnowledgeModePanel
                ref={modePanelRef}
                item={item}
                revisionId={revision.id}
                masters={masters}
                relationshipBaskets={relationshipBasketsQuery.data?.items ?? []}
                relationshipItems={relationshipItemsQuery.data?.items ?? []}
                editable={editable}
                canQuickAdd={canCreate}
                legacyModeCatalogState={legacyModeCatalogState}
                uomCatalogState={uomCatalogState}
                vendorCatalogState={vendorCatalogState}
                priorityCatalogState={priorityCatalogState}
                onQuickAdd={(type, select) => setQuickAdd({ type, select })}
                onDirtyChange={setModeDirty}
                onSavingChange={setModeSaving}
                onBusyChange={setModeBusy}
                onSaveErrorChange={setModeSaveError}
                onAnnouncement={setAnnouncement}
              />
            ) : sectionQuery.isPending ? <PageState state="loading" message={`Loading ${activeSectionLabel}…`} /> : sectionQuery.isError ? <PageState state="error" message={sectionQuery.error.message} action={{ label: "Try again", onAction: () => void sectionQuery.refetch() }} /> : sectionQuery.data && backendSection ? (
              <Surface as="section" className={`knowledge-workspace-section${backendSection === "overview" ? " knowledge-workspace-section--overview" : ""}`}>
                {serverReview ? (
                  <KnowledgeConflictReview
                    sectionKey={serverReview.server.sectionKey}
                    localVersion={serverReview.localVersion}
                    serverVersion={serverReview.server.version}
                    payload={serverReview.server.payload}
                    masters={masters}
                    relationshipBaskets={relationshipBasketsQuery.data?.items ?? []}
                    relationshipItems={relationshipItemsQuery.data?.items ?? []}
                  />
                ) : null}
                {(relationshipBasketsQuery.isError || relationshipItemsQuery.isError) && activeSection === "recommendations" ? <InlineMessage tone="warning">Some Basket or Main Line choices could not be loaded. Existing stable-ID selections remain visible; retry before changing relationships.</InlineMessage> : null}
                {backendSection === "overview" && revision ? (
                  <KnowledgeOverviewPanel
                    key={revision.id}
                    item={item}
                    revision={revision}
                    overviewPayload={overviewDraftPayload}
                    summary={overviewSummary}
                    masters={masters}
                    sectionStates={overviewSectionStates}
                    referenceStates={{
                      masters: overviewMasterStates,
                      relationships: overviewRelationshipState
                    }}
                    editable={editable}
                    canQuickAdd={canCreate}
                    onOverviewPayloadChange={setPayload}
                    onOverviewDirty={(field) => {
                      setOverviewDirtyFields((current) => new Set(current).add(field));
                      setDirty(true);
                    }}
                    onQuickAddUom={(select) => setQuickAdd({ type: "uoms", select })}
                    onOpenSection={selectWorkspaceSection}
                  />
                ) : (
                  <KnowledgeSectionEditor sectionKey={backendSection} payload={payload} masters={masters} relationshipBaskets={relationshipBasketsQuery.data?.items ?? []} relationshipItems={relationshipItemsQuery.data?.items ?? []} currentMainLineId={mainLineId} readOnly={!editable} canQuickAdd={canCreate} resetKey={`${sectionQuery.data.id}-${sectionQuery.data.version}`} validationAttempt={validationAttempt} onChange={setPayload} onDirty={() => setDirty(true)} onValidationChange={setEditorValid} onQuickAdd={(type, select) => setQuickAdd({ type, select })} />
                )}
                {activeSaveError ? <InlineMessage tone="error" role="alert">{activeSaveError}</InlineMessage> : null}
              </Surface>
            ) : <PageState state="empty" message="This revision has no section data." />}
          </KnowledgeSectionNavigation>
        </div>
        <KnowledgeRevisionHistory
          entries={historyQuery.data?.items}
          loading={historyQuery.isPending}
          refreshing={historyQuery.isFetching}
          error={historyQuery.error instanceof Error ? historyQuery.error : null}
          onRetry={() => void historyQuery.refetch()}
        />
      </div>

      {guard.dialogOpen ? <KnowledgeUnsavedChangesDialog onSave={() => void guard.saveAndContinue()} onDiscard={guard.discardAndContinue} onStay={guard.stayHere} busy={guard.busy} error={guard.error} /> : null}
      {conflict ? <KnowledgeVersionConflictDialog sectionLabel={backendSection ? KNOWLEDGE_SECTION_LABELS[backendSection] : undefined} localVersion={conflict.localVersion} serverVersion={conflict.server.version} onKeepEditing={() => setConflict(null)} onReviewServerVersion={() => { setServerReview(conflict); setConflict(null); }} onDiscardLocalChanges={() => { setPayload(conflict.server.payload); setDirty(false); setOverviewDirtyFields(new Set()); setConflict(null); setServerReview(null); }} /> : null}
      {quickAdd ? <KnowledgeMasterEditorDialog masterType={quickAdd.type} quickAdd onSaved={quickAdd.select} onClose={() => setQuickAdd(null)} /> : null}
      {lifecycleAction ? <KnowledgeLifecycleDialog action={lifecycleAction} blockers={lifecycleAction === "activate" ? item.blockers : []} warnings={lifecycleAction === "activate" ? item.warnings : []} reason={lifecycleReason} onReasonChange={setLifecycleReason} onClose={() => { setLifecycleAction(null); lifecycleMutation.reset(); }} onConfirm={() => lifecycleMutation.mutate({ action: lifecycleAction, target: item })} busy={lifecycleMutation.isPending} error={lifecycleError} /> : null}
      {command ? <KnowledgeCommandDialog kind={command} reason={commandReason} duplicateName={duplicateName} onReasonChange={setCommandReason} onNameChange={setDuplicateName} onClose={() => { setCommand(null); commandMutation.reset(); }} onConfirm={() => commandMutation.mutate({ kind: command, target: item })} busy={commandMutation.isPending} error={commandError} /> : null}
    </div>
  );
}

function WorkspaceActions({ item, canCreate, canLifecycle, onCommand, onLifecycle }: {
  readonly item: KnowledgeItemDetail;
  readonly canCreate: boolean;
  readonly canLifecycle: boolean;
  readonly onCommand: (command: "revision" | "duplicate") => void;
  readonly onLifecycle: (action: KnowledgeLifecycleAction) => void;
}) {
  const activationLabel = item.blockers.length > 0
    ? "Review activation"
    : "Review and activate";
  return <>{canLifecycle && item.allowedActions.includes("review_and_activate") ? <Button variant={item.blockers.length > 0 ? "secondary" : "success"} leadingIcon={<ShieldCheck />} onClick={() => onLifecycle("activate")}>{activationLabel}</Button> : null}{canCreate && item.allowedActions.includes("create_revision") ? <Button leadingIcon={<Plus />} onClick={() => onCommand("revision")}>Create revision</Button> : null}{canCreate && item.allowedActions.includes("duplicate") ? <Button variant="secondary" leadingIcon={<Copy />} onClick={() => onCommand("duplicate")}>Duplicate</Button> : null}{canLifecycle && item.allowedActions.includes("deactivate") ? <Button variant="destructive-outline" onClick={() => onLifecycle("deactivate")}>Deactivate</Button> : null}{canLifecycle && item.allowedActions.includes("archive") ? <Button variant="destructive-outline" leadingIcon={<Archive />} onClick={() => onLifecycle("archive")}>Archive</Button> : null}</>;
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

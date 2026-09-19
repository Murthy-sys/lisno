import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { IconButton } from "../../components/ui/IconButton";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  activateKnowledgeRevision,
  permanentlyDeleteKnowledgeMainLine,
  createKnowledgeRevision,
  deactivateKnowledgeItem,
  duplicateKnowledgeItem,
  getKnowledgeHistory,
  getKnowledgeItem,
  getKnowledgeSection,
  listKnowledgeBaskets,
  listKnowledgeItems,
  listKnowledgeMasters,
  updateKnowledgeMainLine,
  updateKnowledgeSection
} from "./knowledgeApi";
import { KnowledgeLifecycleDialog, type KnowledgeLifecycleAction } from "./KnowledgeLifecycleDialogs";
import { KnowledgeMasterEditorDialog } from "./KnowledgeMasterEditorDialog";
import { KnowledgeSurfaceEditorDialog } from "./KnowledgeSurfaceEditorDialog";
import { KnowledgeBasketQualityPanel, type KnowledgeBasketQualityPanelHandle } from "./KnowledgeBasketQualityPanel";
import { KnowledgeModePanel, type KnowledgeModePanelHandle } from "./KnowledgeModePanel";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import { KnowledgeRevisionHistory } from "./KnowledgeRevisionHistory";
import { KnowledgeSavedConfigurationSummary } from "./KnowledgeSavedConfigurationSummary";
import { KnowledgeReferenceContextRail } from "./KnowledgeReferenceContextRail";
import { pendingValuesEqual } from "./knowledgePendingChanges";
import { KnowledgeSectionCommandBar } from "./KnowledgeSectionCommandBar";
import { KnowledgeWorkspaceStatus } from "./KnowledgeWorkspaceStatus";
import {
  syncKnowledgeLifecycleMutation,
  syncKnowledgeMainLineDeletion,
  syncKnowledgeSectionMutation
} from "./knowledgeMutationSync";
import {
  KnowledgeOverviewPanel,
  type KnowledgeOverviewSectionState
} from "./KnowledgeOverviewPanel";
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
import { KnowledgeTemporaryMainLineInfo } from "./KnowledgeTemporaryMainLineInfo";
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
import "./knowledge-configuration-ui.css";
import "./knowledge-reference-workspace.css";

const MASTER_TYPES = ["uoms", "vendors", "taxes", "priorities", "surfaces", "modes"] as const satisfies readonly KnowledgeMasterType[];

interface ConflictState {
  readonly localVersion: number;
  readonly server: KnowledgeSectionEnvelope<KnowledgeJsonObject>;
}

interface PendingEditorSession { readonly sourceKey: string }

function KnowledgeWorkspaceRail({ children }: { readonly children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const [tooTall, setTooTall] = useState(false);
  useLayoutEffect(() => {
    const element = rail.current;
    if (!element) return;
    const layout = element.parentElement;
    const history = element.querySelector<HTMLElement>(":scope > .knowledge-workspace-history-rail");
    let frame = 0;
    const measure = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const fallback = viewportHeight * 0.6;
      const styles = getComputedStyle(element);
      const desktop = styles.getPropertyValue("--knowledge-rail-stacked").trim() !== "1";
      const gap = parseFloat(styles.rowGap) || 16;
      const inset = parseFloat(styles.getPropertyValue("--knowledge-rail-inset")) || 8;
      const historyHeight = history?.getBoundingClientRect().height ?? 0;
      const top = Math.max(inset, layout?.getBoundingClientRect().top ?? inset);
      // Leave room for workspace bottom padding as well as the viewport edge.
      const bottomSpace = 32;
      const available = viewportHeight - top - historyHeight - gap - bottomSpace;
      const cap = Math.floor(desktop && available >= Math.min(160, fallback) ? available : fallback);
      const value = `${Math.max(1, cap)}px`;
      if (element.style.getPropertyValue("--knowledge-summary-max-block-size") !== value) {
        element.style.setProperty("--knowledge-summary-max-block-size", value);
      }
      setTooTall(desktop && historyHeight + gap + cap > viewportHeight - inset - bottomSpace);
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    if (history) observer?.observe(history);
    if (layout) observer?.observe(layout);
    window.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      element.style.removeProperty("--knowledge-summary-max-block-size");
    };
  }, []);
  return <div ref={rail} className={`knowledge-workspace-rail${tooTall ? " knowledge-workspace-rail--long" : ""}`}>{children}</div>;
}

export function KnowledgeItemWorkspacePage() {
  const { itemId = "" } = useParams();
  const mainLineId = decodeURIComponent(itemId);
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const modePanelRef = useRef<KnowledgeModePanelHandle>(null);
  const qualityPanelRef = useRef<KnowledgeBasketQualityPanelHandle>(null);
  const [qualityDirty, setQualityDirty] = useState(false);
  const [qualitySaving, setQualitySaving] = useState(false);
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
  const [mainLineEditorOpen, setMainLineEditorOpen] = useState(false);

  const canCreate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.create");
  const canUpdate = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.update");
  const canLifecycle = hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.lifecycle");
  const itemQuery = useQuery({
    queryKey: knowledgeQueryKeys.item(mainLineId),
    queryFn: () => getKnowledgeItem(mainLineId),
    enabled: Boolean(mainLineId)
  });
  const item = itemQuery.data;

  useEffect(() => {
    if (item?.itemType === "temporary" && activeSection === "recommendations") setActiveSection("overview");
  }, [item?.itemType, activeSection]);
  const revision = item?.draftRevision ?? item?.activeRevision ?? null;
  const pendingSession = useMemo<PendingEditorSession>(() => ({
    sourceKey: JSON.stringify([mainLineId, revision?.id ?? "", item?.basketId ?? "", activeSection])
  }), [mainLineId, revision?.id, item?.basketId, activeSection]);
  const currentPendingSession = useRef(pendingSession);
  currentPendingSession.current = pendingSession;
  const currentPayload = useRef(payload);
  currentPayload.current = payload;
  const backendSection: KnowledgeSectionKey | null = activeSection === "mode" || activeSection === "quality"
    ? null
    : activeSection;
  const sectionQuery = useQuery({
    queryKey: knowledgeQueryKeys.section(mainLineId, revision?.id ?? "", backendSection ?? "overview"),
    queryFn: () => getKnowledgeSection<KnowledgeJsonObject>(mainLineId, revision!.id, backendSection ?? "overview"),
    enabled: Boolean(mainLineId && revision?.id && backendSection)
  });
  const historyQuery = useQuery({
    queryKey: knowledgeQueryKeys.history(mainLineId, { limit: 100, offset: 0 }),
    queryFn: () => getKnowledgeHistory(mainLineId, { limit: 100, offset: 0 }),
    enabled: Boolean(mainLineId)
  });
  const relationshipBasketsQuery = useQuery({
    queryKey: [...knowledgeQueryKeys.basketLists(), "relationship-catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((params) => listKnowledgeBaskets(params), "Main Basket")
  });
  const relationshipItemsQuery = useQuery({
    queryKey: [...knowledgeQueryKeys.itemLists(), "relationship-catalog"],
    queryFn: async () => {
      const [current, archived] = await Promise.all([
        collectAllKnowledgeMasterPages((params) => listKnowledgeItems(params), "Related items"),
        collectAllKnowledgeMasterPages((params) => listKnowledgeItems({ ...params, status: "archived" }), "Archived related items")
      ]);
      const byId = new Map(current.items.map((item) => [item.mainLineId, item]));
      for (const item of archived.items) {
        const previous = byId.get(item.mainLineId);
        if (!previous || previous.version <= item.version) byId.set(item.mainLineId, item);
      }
      // Archived entries are only needed to suppress duplicate related-item starters.
      // Keep the established relationship catalog for the other section editors.
      return { ...current, allItems: [...byId.values()] };
    }
  });
  const masterQueries = useQueries({
    queries: MASTER_TYPES.map((type) => ({
      queryKey: type === "modes" || type === "uoms" || type === "priorities" || type === "vendors" || type === "taxes" || type === "surfaces"
        ? knowledgeQueryKeys.masterCatalog(type)
        : knowledgeQueryKeys.masterList(type, { limit: 100, offset: 0 }),
      queryFn: () => type === "modes" || type === "uoms" || type === "priorities" || type === "vendors" || type === "taxes" || type === "surfaces"
        ? collectAllKnowledgeMasterPages(
            (params) => listKnowledgeMasters(type, {
              ...params,
              ...(type === "surfaces" ? { includeArchived: true } : {})
            }),
            type === "modes"
              ? "Mode"
              : type === "uoms"
                ? "Unit"
                : type === "priorities"
                  ? "Priority"
                  : type === "vendors"
                    ? "Vendor"
                    : type === "taxes"
                      ? "Tax"
                      : "Surface"
          )
        : listKnowledgeMasters(type, { limit: 100, offset: 0 })
    }))
  });
  const masters = useMemo(
    () => Object.fromEntries(MASTER_TYPES.map((type, index) => [type, masterQueries[index].data?.items ?? []])) as Readonly<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>,
    [masterQueries]
  );
  /*
   * One load state per reusable-value catalog, derived from the same queries
   * that feed `masters`. Every consumer reads from here, so a catalog can
   * never appear ready to one panel and unloaded to another.
   */
  const masterCatalogStates = useMemo(
    () => Object.fromEntries(MASTER_TYPES.map((type, index) => {
      const query = masterQueries[index]!;
      const hasData = Boolean(query.data);
      const message = query.error instanceof Error ? query.error.message : undefined;
      return [type, {
        status: query.isError && !hasData
          ? "error" as const
          : query.isPending && !hasData
            ? "loading" as const
            : "ready" as const,
        refreshing: hasData && query.isFetching,
        errorMessage: hasData ? undefined : message,
        refreshErrorMessage: hasData && query.isError ? message : undefined,
        onRetry: () => { void query.refetch(); }
      }];
    })) as Readonly<Record<KnowledgeMasterType, {
      status: "loading" | "ready" | "error";
      refreshing: boolean;
      errorMessage?: string;
      refreshErrorMessage?: string;
      onRetry: () => void;
    }>>,
    [masterQueries]
  );
  const modesQuery = masterQueries[MASTER_TYPES.indexOf("modes")]!;
  const legacyModeCatalogState = {
    ...masterCatalogStates.modes,
    /* Mode surfacing has always shown the message even while data is cached. */
    errorMessage: modesQuery.error instanceof Error ? modesQuery.error.message : undefined
  };
  const uomCatalogState = masterCatalogStates.uoms;
  const vendorCatalogState = masterCatalogStates.vendors;
  const editable = Boolean(item && revision?.status === "draft" && item.status !== "archived" && canUpdate && item.allowedActions.includes("update_section"));
  const overviewDraftPayload = activeSection === "overview" && sectionQuery.data
    ? dirty ? payload : sectionQuery.data.payload
    : payload;
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
    onMutate: () => ({ session: pendingSession, payload: currentPayload.current }),
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
        applicability: backendSection === "overview" && overviewDirtyFields.has("surfaceIds")
          && Array.isArray(rebasedPayload.surfaceIds) && rebasedPayload.surfaceIds.length > 0
          ? "configured"
          : sectionQuery.data.applicability,
        payload: knowledgeSectionPayloadForUpdate(backendSection, rebasedPayload)
      });
    },
    onSuccess: async (saved, _variables, submitted) => {
      await syncKnowledgeSectionMutation(queryClient, saved);
      if (submitted && (currentPendingSession.current !== submitted.session || !pendingValuesEqual(currentPayload.current, submitted.payload))) return;
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
    if (activeSection === "quality") return qualityPanelRef.current?.save() ?? false;
    if (activeSection === "mode") {
      return modePanelRef.current?.save() ?? false;
    }
    return saveSection();
  }, [activeSection, saveSection]);

  const discardActiveSection = useCallback(() => {
    if (activeSection === "quality") { qualityPanelRef.current?.discard(); setQualityDirty(false); return; }
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

  const activeDirty = activeSection === "quality" ? qualityDirty : activeSection === "mode" ? modeDirty : dirty;
  const activeSaving = activeSection === "quality" ? qualitySaving : activeSection === "mode" ? modeSaving : saveMutation.isPending;
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
      return permanentlyDeleteKnowledgeMainLine(mainLineId, { expectedVersion: target.version, reason: lifecycleReason.trim() });
    },
    onSuccess: async (updated, variables) => {
      if (variables.action === "archive") {
        /* The item is gone; there is no detail left to write back into the cache. */
        await syncKnowledgeMainLineDeletion(queryClient, mainLineId);
      } else {
        await syncKnowledgeLifecycleMutation(queryClient, updated as KnowledgeItemDetail);
      }
      setLifecycleAction(null);
      setLifecycleReason("");
      setDirty(false);
      setOverviewDirtyFields(new Set());
      setModeDirty(false);
      setModeSaveError(null);
      setAnnouncement(variables.action === "activate"
        ? "Revision activated and available to the AI knowledge context service."
        : variables.action === "archive"
          ? "Main Line permanently deleted."
          : `Item ${variables.action}d.`);
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
      setQualityDirty(false);
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
  const referenceSection = activeSection === "recommendations" || activeSection === "quality" ? activeSection : undefined;
  const savedDetails = <>
    <KnowledgeRevisionHistory
      entries={historyQuery.data?.items}
      loading={historyQuery.isPending}
      refreshing={historyQuery.isFetching}
      error={historyQuery.error instanceof Error ? historyQuery.error : null}
      onRetry={() => void historyQuery.refetch()}
    />
    <KnowledgeSavedConfigurationSummary item={item} revisionId={revision?.id} masters={masters}
      baskets={relationshipBasketsQuery.data?.items ?? []} items={relationshipItemsQuery.data?.allItems ?? []}
      referenceStates={{
        masters: Object.fromEntries(MASTER_TYPES.map((type, index) => [type, {
          ...masterCatalogStates[type], denied: isAccessDenied(masterQueries[index]?.error)
        }])),
        relationships: { ...overviewRelationshipState,
          denied: isAccessDenied(relationshipBasketsQuery.error) || isAccessDenied(relationshipItemsQuery.error) }
      }} />
  </>;

  return (
    <div className="knowledge-page knowledge-page--item-workspace" data-reference-section={referenceSection}>
      <PageHeader
        id="knowledge-item-title"
        breadcrumb={<Button variant="quiet" size="compact" leadingIcon={<ArrowLeft />} onClick={() => guard.requestNavigation(() => navigate("/admin/configuration/estimation"))}>Back to Main Baskets</Button>}
        eyebrow={`Main Basket · ${item.basketName}${item.subBasketName ? ` · Sub Basket · ${item.subBasketName}` : ""}`}
        title={item.mainLineName}
        titleAction={auth.user?.role === "super_admin" && canUpdate && item.status !== "archived"
          ? <IconButton className="knowledge-main-line-edit" label="Edit Main Line" tooltip="Edit Main Line" variant="quiet" icon={<Pencil size={18} aria-hidden="true" />}
              onClick={() => guard.requestNavigation(() => setMainLineEditorOpen(true))} />
          : null}
        metadata={<div className="knowledge-header-metadata">{item.itemType === "temporary" && <span className="knowledge-temporary-badge">Temporary item</span>}<StatusBadge label={KNOWLEDGE_ITEM_STATUS_LABELS[item.status]} tone={item.status === "active" ? "success" : item.status === "draft" ? "warning" : item.status === "archived" ? "danger" : "neutral"} /><span>Updated {formatKnowledgeDateTime(item.updatedAt)}</span></div>}
        actions={<WorkspaceActions item={item} canCreate={canCreate} canLifecycle={canLifecycle}
          onCommand={(next) => guard.requestNavigation(() => setCommand(next))}
          onLifecycle={(next) => guard.requestNavigation(() => setLifecycleAction(next))} />}
      />
      <KnowledgeSafetyNotice />
      <KnowledgeWorkspaceStatus item={item} />
      <KnowledgeTemporaryMainLineInfo item={item} onOpenMainLine={(id) => guard.requestNavigation(() => navigate(`/admin/configuration/estimation/items/${encodeURIComponent(id)}`))} />
      {announcement ? <p className="sr-only" role="status">{announcement}</p> : null}
      {item.status === "archived" ? <InlineMessage tone="warning" title="Archived configuration">This item and its revision history are read-only.</InlineMessage> : revision && !editable && revision.status !== "draft" && activeSection !== "quality" ? <InlineMessage tone="info" title="Active history is read-only">Create a Draft revision to change section data. The active revision remains available until a new Draft is activated.</InlineMessage> : null}

      <div className="knowledge-workspace-layout">
        <div className="knowledge-workspace-main">
          <KnowledgeSectionNavigation sections={item.itemType === "temporary" ? ["overview", "mode", "quality"] : undefined} activeSection={activeSection} onSectionChange={selectWorkspaceSection} panelBusy={activeSection === "mode" ? modeBusy : sectionQuery.isFetching}>
            {revision && activeSection !== "quality" ? (
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
            {activeSection === "quality" ? (
              <KnowledgeBasketQualityPanel key={pendingSession.sourceKey} ref={qualityPanelRef} item={item} revisionId={revision?.id} canUpdate={canUpdate} onDirtyChange={setQualityDirty} onSavingChange={setQualitySaving} />
            ) : !revision ? (
              <PageState state="empty" message="This item has no revision to display." />
            ) : activeSection === "mode" ? (
              <KnowledgeModePanel
                key={pendingSession.sourceKey}
                ref={modePanelRef}
                item={item}
                revisionId={revision.id}
                masters={masters}
                relationshipBaskets={relationshipBasketsQuery.data?.items ?? []}
                relationshipItems={relationshipItemsQuery.data?.items ?? []}
                editable={editable}
                legacyModeCatalogState={legacyModeCatalogState}
                uomCatalogState={uomCatalogState}
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
                    overviewPayload={overviewDraftPayload}
                    masters={masters}
                    referenceStates={{ masters: masterCatalogStates }}
                    editable={editable}
                    canQuickAdd={canCreate}
                    onOverviewPayloadChange={setPayload}
                    onOverviewDirty={(field) => {
                      setOverviewDirtyFields((current) => new Set(current).add(field));
                      setDirty(true);
                    }}
                    onQuickAddUom={(select) => setQuickAdd({ type: "uoms", select })}
                    onQuickAddSurface={(select) => setQuickAdd({ type: "surfaces", select: (surface) => {
                      select(surface);
                      setAnnouncement(`${surface.name} added. Save Overview to apply it.`);
                    } })}
                    saving={saveMutation.isPending}
                    surfacesDirty={overviewDirtyFields.has("surfaceIds")}
                  />
                ) : (
                  <KnowledgeSectionEditor key={`${pendingSession.sourceKey}:${sectionQuery.data.id}`} sectionKey={backendSection} payload={payload} savedPayload={sectionQuery.data.payload} masters={masters} relationshipBaskets={relationshipBasketsQuery.data?.items ?? []} relationshipItems={(backendSection === "recommendations" ? relationshipItemsQuery.data?.allItems : relationshipItemsQuery.data?.items) ?? []} currentMainLineId={mainLineId} mainLineName={item.mainLineName} basketName={item.basketName} relationshipCatalogState={overviewRelationshipState} readOnly={!editable} canQuickAdd={canCreate} uomCatalogState={uomCatalogState} vendorCatalogState={vendorCatalogState} masterCatalogStates={masterCatalogStates} resetKey={`${sectionQuery.data.id}-${sectionQuery.data.version}`} validationAttempt={validationAttempt} onChange={(next) => {
                    currentPayload.current = next;
                    setPayload(next);
                  }} onDirty={() => setDirty(true)} onValidationChange={setEditorValid} onQuickAdd={(type, select) => setQuickAdd({ type, select })} />
                )}
                {activeSaveError ? <InlineMessage tone="error" role="alert">{activeSaveError}</InlineMessage> : null}
              </Surface>
            ) : <PageState state="empty" message="This revision has no section data." />}
          </KnowledgeSectionNavigation>
        </div>
        {referenceSection ? <KnowledgeReferenceContextRail key={pendingSession.sourceKey} section={referenceSection}
          item={item} revisionId={revision?.id} uoms={masters.uoms ?? []} uomState={uomCatalogState}
          dirty={activeDirty} saving={activeSaving}>{savedDetails}</KnowledgeReferenceContextRail>
          : <KnowledgeWorkspaceRail>{savedDetails}</KnowledgeWorkspaceRail>}
      </div>

      {guard.dialogOpen ? <KnowledgeUnsavedChangesDialog onSave={() => void guard.saveAndContinue()} onDiscard={guard.discardAndContinue} onStay={guard.stayHere} busy={guard.busy} error={guard.error} /> : null}
      {conflict ? <KnowledgeVersionConflictDialog sectionLabel={backendSection ? KNOWLEDGE_SECTION_LABELS[backendSection] : undefined} localVersion={conflict.localVersion} serverVersion={conflict.server.version} onKeepEditing={() => setConflict(null)} onReviewServerVersion={() => { setServerReview(conflict); setConflict(null); }} onDiscardLocalChanges={() => { setPayload(conflict.server.payload); setDirty(false); setOverviewDirtyFields(new Set()); setConflict(null); setServerReview(null); }} /> : null}
      {quickAdd ? quickAdd.type === "surfaces" ? (
        <KnowledgeSurfaceEditorDialog quickAdd onSaved={quickAdd.select} onClose={() => setQuickAdd(null)} />
      ) : (
        <KnowledgeMasterEditorDialog masterType={quickAdd.type} quickAdd onSaved={quickAdd.select} onClose={() => setQuickAdd(null)} />
      ) : null}
      {lifecycleAction ? <KnowledgeLifecycleDialog action={lifecycleAction} blockers={lifecycleAction === "activate" ? item.blockers : []} warnings={lifecycleAction === "activate" ? item.warnings : []} reason={lifecycleReason} onReasonChange={setLifecycleReason} onClose={() => { setLifecycleAction(null); lifecycleMutation.reset(); }} onConfirm={() => lifecycleMutation.mutate({ action: lifecycleAction, target: item })} busy={lifecycleMutation.isPending} error={lifecycleError} /> : null}
      {command ? <KnowledgeCommandDialog kind={command} reason={commandReason} duplicateName={duplicateName} onReasonChange={setCommandReason} onNameChange={setDuplicateName} onClose={() => { setCommand(null); commandMutation.reset(); }} onConfirm={() => commandMutation.mutate({ kind: command, target: item })} busy={commandMutation.isPending} error={commandError} /> : null}
      {mainLineEditorOpen ? <MainLineEditorDialog item={item} onClose={() => setMainLineEditorOpen(false)} onSaved={async (updated) => {
        await syncKnowledgeLifecycleMutation(queryClient, updated);
        setMainLineEditorOpen(false);
        setAnnouncement(`Main Line renamed to “${updated.mainLineName}”.`);
      }} /> : null}
    </div>
  );
}

function isAccessDenied(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
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
  return <>{canLifecycle && item.allowedActions.includes("review_and_activate") ? <Button variant={item.blockers.length > 0 ? "secondary" : "success"} leadingIcon={<ShieldCheck />} onClick={() => onLifecycle("activate")}>{activationLabel}</Button> : null}{canCreate && item.allowedActions.includes("create_revision") ? <Button leadingIcon={<Plus />} onClick={() => onCommand("revision")}>Create revision</Button> : null}{canCreate && item.allowedActions.includes("duplicate") ? <Button variant="secondary" leadingIcon={<Copy />} onClick={() => onCommand("duplicate")}>Duplicate</Button> : null}{canLifecycle && item.allowedActions.includes("deactivate") ? <Button variant="destructive-outline" onClick={() => onLifecycle("deactivate")}>Deactivate</Button> : null}{canLifecycle && item.allowedActions.includes("archive") ? <Button variant="destructive-outline" leadingIcon={<Trash2 />} onClick={() => onLifecycle("archive")}>Delete</Button> : null}</>;
}

function MainLineEditorDialog({ item, onClose, onSaved }: {
  readonly item: KnowledgeItemDetail;
  readonly onClose: () => void;
  readonly onSaved: (item: KnowledgeItemDetail) => Promise<void>;
}) {
  const [name, setName] = useState(item.mainLineName);
  const trimmedName = name.trim();
  const mutation = useMutation({
    mutationFn: () => updateKnowledgeMainLine(item.mainLineId, {
      expectedVersion: item.version,
      name: trimmedName
    }),
    onSuccess: onSaved
  });
  const error = mutation.error instanceof ApiError && mutation.error.code === "VERSION_CONFLICT"
    ? "This Main Line changed elsewhere. Close this dialog, review the latest name, and try again."
    : mutation.error?.message ?? null;

  return (
    <Dialog title="Edit Main Line" eyebrow="Estimation configuration" description="Update the name shown throughout this Main Basket." onClose={onClose} busy={mutation.isPending}>
      <form className="knowledge-dialog-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <div className="knowledge-dialog-body">
          {error ? <InlineMessage tone="error" role="alert">{error}</InlineMessage> : null}
          <Field id="main-line-name" label="Main Line name" required>
            {(props) => <Input {...props} autoFocus value={name} onChange={(event) => setName(event.target.value)} />}
          </Field>
        </div>
        <div className="knowledge-dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={mutation.isPending} disabled={!trimmedName || trimmedName === item.mainLineName}>Save Main Line</Button>
        </div>
      </form>
    </Dialog>
  );
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

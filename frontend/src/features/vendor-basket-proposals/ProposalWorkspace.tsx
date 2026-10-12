import { notifyManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { KnowledgeOverviewPanel } from "../ai-estimator-knowledge/KnowledgeOverviewPanel";
import { KnowledgeSectionEditor } from "../ai-estimator-knowledge/KnowledgeSectionEditor";
import { KnowledgeModePanel, type KnowledgeModePanelHandle } from "../ai-estimator-knowledge/KnowledgeModePanel";
import { KnowledgeBasketQualityPanel, type KnowledgeBasketQualityPanelHandle, type KnowledgeQualitySaveCommandState } from "../ai-estimator-knowledge/KnowledgeBasketQualityPanel";
import { InheritedProposalQuality } from "./InheritedProposalQuality";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeMaster, KnowledgeMasterType, KnowledgeSectionEnvelope, KnowledgeSectionKey } from "../ai-estimator-knowledge/knowledgeTypes";
import { vendorBasketRequestKeys } from "../procurement/vendorBasketRequestApi";
import { procurementRequestKey } from "../procurement/procurementPresentation";
import { addProposalMaster, getProposalMasters, removeProposalMaster, saveProposalMaster, addProposalMainLine, addProposalSubBasket, collectProposalPages, decideProposal, getProposal, getProposalChanges, getProposalHierarchy, getProposalReadiness, getProposalReferences, proposalKeys, removeProposalMainLine, removeProposalSubBasket, reviseProposal, saveProposalBasket, saveProposalMainLine, saveProposalSubBasket, submitProposal } from "./proposalApi";
import { createProposalDataSource } from "./proposalDataSource";
import { ProposalMasterDialog, type ProposalMasterFields } from "./ProposalMasterDialog";
import { ProposalPresentationIcon } from "./ProposalPresentationIcon";
import { ProposalMasterList } from "./ProposalMasterList";
import { ProposalMetadataDialog } from "./ProposalMetadataDialog";
import { proposalChangeSummaries, proposalDenied, proposalError, proposalStatusLabels, proposalUncertain } from "./proposalPresentation";
import type { ProposalDecisionInput, ProposalDecisionResult, ProposalDetail, ProposalHierarchyNode, ProposalMetadata, ProposalMasterKind, ProposalMasterResource, ProposalMutationResult, ProposalScope, ProposalSnapshot, ProposalSubmitInput, ProposalVersionInput } from "./proposalTypes";
import "../ai-estimator-knowledge/ai-estimator-knowledge.css";
import "../ai-estimator-knowledge/knowledge-configuration-ui.css";
import "./proposal.css";
import "./procurement-main-basket.css";
import "./procurement-basket-mode.css";

type Tab = "overview" | "mode" | "recommendations" | "quality";
const tabs: { key: Tab; label: string }[] = [{ key: "overview", label: "Overview" }, { key: "mode", label: "Mode" }, { key: "recommendations", label: "Recommendations" }, { key: "quality", label: "Quality Parameter" }];
type MasterEditor = { kind: ProposalMasterKind; resource?: ProposalMasterResource; remove?: boolean; origin: string;
  versions: ProposalVersionInput; headVersion: number; section: KnowledgeSectionEnvelope<KnowledgeJsonObject> | null; sectionKey: readonly unknown[] | null };
type Edit = { kind: "basket" } | { kind: "sub"; node?: ProposalHierarchyNode } | { kind: "line"; parentId: string; node?: ProposalHierarchyNode };

export interface ProposalWorkspaceProps {
  proposalId: string; scope?: ProposalScope; onClose: () => void;
  onBusyChange?: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void;
  onDecision?: (result: ProposalDecisionResult) => void;
  onSubmitted?: (proposal: ProposalDetail) => void;
}

/** A keyed session prevents drafts from surviving an identity or proposal change. */
export function ProposalWorkspace(props: ProposalWorkspaceProps) {
  const auth = useAuth();
  const scope = props.scope ?? "procurement";
  const allowed = scope === "admin" ? auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.read")
    : auth.user?.role === "procurement" && hasFrontendPermission(auth.authorization, "procurement.vendor_basket_proposal.read");
  if (!auth.user || !allowed) return <ContextPanel title="Basket configuration" onClose={props.onClose}><PageState state="error" message="You do not have permission to view this basket proposal." /></ContextPanel>;
  return <ProposalWorkspaceSession key={`${auth.user.id}:${scope}:${props.proposalId}`} {...props} actorId={auth.user.id} scope={scope} />;
}

function ProposalWorkspaceSession({ proposalId: initialId, scope, actorId, onClose, onBusyChange, onDirtyChange, onDecision, onSubmitted }: ProposalWorkspaceProps & { actorId: string; scope: ProposalScope }) {
  const client = useQueryClient();
  const active = useRef(true);
  const metadataVersion = useRef<ProposalVersionInput | null>(null);
  const [proposalId, setProposalId] = useState(initialId);
  const [snapshot, setSnapshot] = useState<ProposalSnapshot>("current");
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [draft, setDraft] = useState<KnowledgeJsonObject | null>(null);
  const draftVersion = useRef<{ sectionVersion: number; aggregateVersion: number } | null>(null);
  const [sectionValidation, setSectionValidation] = useState<{ editor: string; valid: boolean } | null>(null);
  const [modeDirty, setModeDirty] = useState(false);
  const [qualityDirty, setQualityDirty] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [modeFetching, setModeFetching] = useState(false);
  const [qualitySaving, setQualitySaving] = useState(false);
  const [modeSaveError, setModeSaveError] = useState<string | null>(null);
  const [qualitySaveError, setQualitySaveError] = useState<string | null>(null);
  const onQualitySaveCommandChange = useCallback((state: KnowledgeQualitySaveCommandState | null) => setQualitySaveError(state?.saveError ?? null), []);
  const [denied, setDenied] = useState(false);
  const [reconcile, setReconcile] = useState(false);
  const [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [masterEditor, setMasterEditor] = useState<MasterEditor | null>(null);
  const [masterBlocked, setMasterBlocked] = useState(false);
  const [masterChecking, setMasterChecking] = useState(false);
  const originRef = useRef("");
  const addUomRef = useRef<HTMLButtonElement>(null);
  const addSurfaceRef = useRef<HTMLButtonElement>(null);
  const masterFocus = useRef<{ origin: string; kind: ProposalMasterKind; element: HTMLElement | null; adding: boolean } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [remove, setRemove] = useState<ProposalHierarchyNode | null>(null);
  const [navigation, setNavigation] = useState<(() => void) | null>(null);
  const [rejection, setRejection] = useState(false);
  const [reason, setReason] = useState("");
  const [showChanges, setShowChanges] = useState(false);
  const [terminal, setTerminal] = useState<ProposalDecisionResult | null>(null);
  const modeRef = useRef<KnowledgeModePanelHandle>(null);
  const qualityRef = useRef<KnowledgeBasketQualityPanelHandle>(null);
  const observedStatus = useRef<string | null>(null);
  const command = useRef<{ kind: "submit" | "revise" | "decision"; input: ProposalSubmitInput | ProposalDecisionInput } | null>(null);
  const detailRef = useRef<ProposalDetail | null>(null);
  const hierarchyRef = useRef<readonly ProposalHierarchyNode[]>([]);
  const key = proposalKeys.proposal(actorId, scope, proposalId);
  const readState = useProposalReadState(actorId, scope, proposalId);
  const detail = useQuery({ queryKey: proposalKeys.detail(actorId, scope, proposalId, snapshot), queryFn: ({ signal }) => getProposal(scope, proposalId, snapshot, signal), enabled: !denied, refetchOnWindowFocus: true, refetchInterval: query => query.state.data?.status === "pending" ? 30_000 : false, gcTime: 0 });
  const decisionComplete = Boolean(terminal) || detail.data?.status === "fulfilled" || detail.data?.status === "rejected";
  if (detail.data) detailRef.current = detail.data;
  const hierarchy = useQuery({ queryKey: [...key, "hierarchy", snapshot, detail.data?.head.version], queryFn: ({ signal }) => collectProposalPages(offset => getProposalHierarchy(scope, proposalId, snapshot, offset, signal)), enabled: Boolean(detail.data) && !denied, placeholderData: (previous, previousQuery) => previousQuery?.queryKey[3] === proposalId && previousQuery?.queryKey[5] === snapshot ? previous : undefined, gcTime: 0 });
  if (hierarchy.data) hierarchyRef.current = hierarchy.data;
  const refs = useQuery({ queryKey: [...proposalKeys.actor(actorId), scope, "editor-references"], queryFn: async ({ signal }) => {
    const kinds = ["uoms", "taxes", "modes", "surfaces", "priorities"] as const;
    const masters = Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, await collectProposalPages(offset => getProposalReferences<KnowledgeMaster>(scope, kind, offset, undefined, signal))]))) as Partial<Record<KnowledgeMasterType, KnowledgeMaster[]>>;
    const [baskets, items] = await Promise.all([collectProposalPages(offset => getProposalReferences<KnowledgeBasket>(scope, "baskets", offset, undefined, signal)), collectProposalPages(offset => getProposalReferences<KnowledgeItemListItem>(scope, "main-lines", offset, undefined, signal))]);
    return { masters, baskets, items };
  }, enabled: !denied, gcTime: 0, refetchOnWindowFocus: true });
  const privateMasters = useQuery({ queryKey: proposalKeys.masters(actorId, scope, proposalId, snapshot, detail.data?.head.version),
    queryFn: async ({ signal }) => (await Promise.all((["uoms", "surfaces"] as const).map(kind => collectProposalPages(offset => getProposalMasters(scope, proposalId, kind, snapshot, offset, signal))))).flat(),
    enabled: Boolean(detail.data) && !denied, gcTime: 0 });
  const readiness = useQuery({ queryKey: [...key, "readiness", detail.data?.head.version], queryFn: ({ signal }) => getProposalReadiness(scope, proposalId, signal), enabled: Boolean(detail.data) && !denied && !decisionComplete && snapshot === "current", gcTime: 0 });
  const changes = useQuery({ queryKey: [...key, "changes", detail.data?.head.version], queryFn: ({ signal }) => collectProposalPages(offset => getProposalChanges(proposalId, offset, signal)), enabled: scope === "admin" && showChanges && !denied, gcTime: 0 });
  const accessDenied = useCallback((error: unknown) => { if (proposalDenied(error)) setDenied(true); }, []);
  const applySaved = useCallback((result: ProposalMutationResult) => {
    if (!active.current) return;
    detailRef.current = result.detail;
    client.setQueryData(proposalKeys.detail(actorId, scope, proposalId), result.detail);
    void client.invalidateQueries({ queryKey: proposalKeys.mine(actorId) });
    void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.review });
  }, [client, actorId, scope, proposalId]);
  const source = useMemo(() => createProposalDataSource({ actorId, scope, proposalId, snapshot,
    getDetail: () => { if (!detailRef.current) throw new Error("Load the basket before editing."); return detailRef.current; },
    isCurrent: () => active.current, getHierarchy: () => hierarchyRef.current, onSaved: applySaved, onAccessDenied: accessDenied
  }), [actorId, scope, proposalId, snapshot, applySaved, accessDenied]);
  const nodes = hierarchy.data ?? [];
  const lines = nodes.filter(node => node.kind === "main_line");
  const selected = lines.find(node => node.resourceId === selectedId) ?? lines[0];
  const item = selected?.editorItem ? { ...selected.editorItem, version: detail.data?.version ?? selected.editorItem.version } : undefined;
  const revisionId = item?.draftRevisionId ?? item?.activeRevisionId;
  const validationEditor = JSON.stringify([proposalId, snapshot, item?.mainLineId, revisionId, tab]);
  originRef.current = JSON.stringify([actorId, scope, validationEditor]);
  const sectionValid = sectionValidation?.editor === validationEditor ? sectionValidation.valid : true;
  const onSectionValidationChange = useCallback((valid: boolean) => setSectionValidation({ editor: validationEditor, valid }), [validationEditor]);
  const section = useQuery({ queryKey: item && revisionId ? source.sectionKey(item.mainLineId, revisionId, tab === "recommendations" ? "recommendations" : "overview") : [...key, "unloaded-section"], queryFn: () => source.getSection<KnowledgeJsonObject>(item!.mainLineId, revisionId!, tab === "recommendations" ? "recommendations" : "overview"), enabled: Boolean(item && revisionId) && (tab === "overview" || tab === "recommendations") && !denied, gcTime: 0 });
  const dirty = Boolean(draft) || modeDirty || qualityDirty;
  const subTarget = detail.data?.target?.kind === "new_sub_basket";
  const procurementReference = scope === "procurement";
  const editing = Boolean(detail.data?.capabilities.edit) && snapshot === "current" && !reconcile && !denied && !terminal;
  const editParent = editing && !subTarget && detail.data?.capabilities.editParent !== false;
  const manageSubBaskets = editing && !subTarget && detail.data?.capabilities.manageSubBaskets !== false;
  const showAddSubBasket = manageSubBaskets && (scope === "admin" || (hierarchy.isSuccess && !nodes.some(node => node.kind === "sub_basket")));
  const writes = useMutation({ mutationFn: async (operation: () => Promise<ProposalMutationResult>) => operation(), onSuccess: result => { applySaved(result); setEdit(null); setRemove(null); setNotice("Configuration saved."); }, onError: error => { accessDenied(error); if (proposalUncertain(error) || (error instanceof ApiError && error.status === 409)) setReconcile(true); } });
  const saveSection = useMutation({ mutationFn: async () => {
    if (!item || !revisionId || !draft || !section.data) throw new Error("Load the saved section before saving.");
    return source.updateSection(item.mainLineId, revisionId, tab === "recommendations" ? "recommendations" : "overview", { expectedVersion: draftVersion.current?.sectionVersion ?? section.data.version, expectedAggregateVersion: draftVersion.current?.aggregateVersion ?? detailRef.current!.version, applicability: "configured", payload: draft });
  }, onSuccess: value => { source.commitSection(client, value); setDraft(null); draftVersion.current = null; setNotice("Section saved."); }, onError: error => { accessDenied(error); setReconcile(true); } });
  const action = useMutation({ mutationFn: async () => {
    if (!command.current) throw new Error("The action is unavailable. Refresh the proposal.");
    const current = command.current;
    if (current.kind === "decision") return { kind: current.kind, result: await decideProposal(proposalId, current.input as ProposalDecisionInput) } as const;
    return { kind: current.kind, result: await (current.kind === "submit" ? submitProposal : reviseProposal)(proposalId, current.input) } as const;
  }, onSuccess: value => {
    if (!active.current) return;
    command.current = null; setRejection(false);
    if (value.kind === "decision") {
      setTerminal(value.result); setNotice(value.result.status === "fulfilled" ? "Basket approved and activated. It is available in Configuration and vendor selection." : "Proposal rejected. The requester can revise a copy."); onDecision?.(value.result);
      void client.invalidateQueries({ queryKey: ["ai-estimator-knowledge"] });
      void client.invalidateQueries({ queryKey: [...proposalKeys.actor(actorId), scope, "editor-references"] });
    } else if (value.kind === "revise") { setProposalId(value.result.id); setSnapshot("current"); setSelectedId(""); setTab("overview"); setNotice("A new draft was created from your rejected proposal."); }
    else { client.setQueryData(proposalKeys.detail(actorId, scope, proposalId), value.result); setNotice("Submitted to Super Admin. Your saved configuration is read-only while it is reviewed."); onSubmitted?.(value.result); onClose(); }
    void client.invalidateQueries({ queryKey: proposalKeys.mine(actorId) }); void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.mine }); void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.review });
    void client.invalidateQueries({ queryKey: key, refetchType: value.kind === "decision" ? "none" : "active" });
    if (value.kind === "decision") void client.refetchQueries({ queryKey: key, type: "active", predicate: query => query.queryKey[key.length] !== "readiness" });
  }, onError: error => { accessDenied(error); if (!proposalUncertain(error)) command.current = null; if (error instanceof ApiError && error.status === 409) setReconcile(true); } });
  const masterWrites = useMutation({
    mutationFn: async ({ editor, fields }: { editor: MasterEditor; fields?: ProposalMasterFields }) => {
      if (!active.current || originRef.current !== editor.origin || detailRef.current?.version !== editor.versions.expectedVersion
        || (draftVersion.current && draftVersion.current.aggregateVersion !== editor.versions.expectedVersion)) {
        throw new ApiError(409, "VERSION_CONFLICT", "The saved proposal changed. Your entries are preserved. Refresh before saving this value.");
      }
      if (editor.remove && editor.resource) {
        const payload = draftRef.current;
        if (payload && (payload.uomId === editor.resource.resourceId || (Array.isArray(payload.surfaceIds) && payload.surfaceIds.includes(editor.resource.resourceId)))) {
          throw new ApiError(422, "MASTER_REFERENCED", "This value is selected in this Main Line's unsaved Overview. Remove that selection and save Overview first.");
        }
        return removeProposalMaster(scope, proposalId, editor.kind, editor.resource.resourceId, editor.versions);
      }
      if (!fields) throw new Error("Enter the value details before saving.");
      const input = { ...editor.versions, ...fields };
      return editor.resource ? saveProposalMaster(scope, proposalId, editor.kind, editor.resource.resourceId, input) : addProposalMaster(scope, proposalId, editor.kind, input);
    },
    onSuccess: (result, { editor }) => {
      if (!active.current || originRef.current !== editor.origin) return;
      const latest = editor.sectionKey ? client.getQueryData<KnowledgeSectionEnvelope<KnowledgeJsonObject>>(editor.sectionKey) : null;
      const savedSection = editor.section;
      const unchangedSection = savedSection ? latest?.id === savedSection.id && latest.version === savedSection.version
        && JSON.stringify(latest.payload) === JSON.stringify(savedSection.payload) : !draftVersion.current && !draftRef.current;
      const ownTransition = detailRef.current?.version === editor.versions.expectedVersion
        && result.detail.version === editor.versions.expectedVersion + 1 && result.detail.head.version === editor.headVersion + 1
        && unchangedSection
        && (!draftVersion.current || draftVersion.current.aggregateVersion === editor.versions.expectedVersion);
      if (!ownTransition) { setMasterBlocked(true); setReconcile(true); setNotice("The value was saved, but the Overview changed. Your entries are preserved. Review the saved proposal before continuing."); return; }
      const resource = result.resource as ProposalMasterResource | null;
      const resources = (privateMasters.data ?? []).filter(value => value.resourceId !== (resource?.resourceId ?? editor.resource?.resourceId));
      if (resource) resources.push(resource);
      client.setQueryData(proposalKeys.masters(actorId, scope, proposalId, snapshot, result.detail.head.version), resources);
      if (editor.sectionKey && savedSection) client.setQueryData([...editor.sectionKey.slice(0, -1), result.detail.head.version], savedSection);
      if (draftVersion.current) draftVersion.current.aggregateVersion = result.detail.version;
      if (!editor.remove && !editor.resource && resource && savedSection) {
        draftVersion.current ??= { sectionVersion: savedSection.version, aggregateVersion: result.detail.version };
        setDraft(current => {
          const payload = current ?? savedSection.payload;
          return editor.kind === "uoms" ? { ...payload, uomId: resource.resourceId }
            : { ...payload, surfaceIds: [...new Set([...(Array.isArray(payload.surfaceIds) ? payload.surfaceIds.filter((id): id is string => typeof id === "string") : []), resource.resourceId])] };
        });
      }
      applySaved(result); setMasterEditor(null); setMasterBlocked(false);
      setNotice(editor.remove ? "Proposed value removed." : editor.resource ? "Proposed value updated." : "Proposed value saved and selected. Save changes to keep this Main Line selection.");
      void client.invalidateQueries({ queryKey: key });
    },
    onError: (error, { editor }) => {
      if (!active.current || originRef.current !== editor.origin) return;
      accessDenied(error);
      if (proposalUncertain(error) || (error instanceof ApiError && error.status === 409 && error.code === "VERSION_CONFLICT")) setMasterBlocked(true);
    }
  });
  async function reconcileMaster() {
    if (!masterEditor || masterChecking) return;
    const editor = masterEditor; setMasterChecking(true);
    try {
      const latest = await getProposal(scope, proposalId);
      if (!active.current || originRef.current !== editor.origin) return;
      if (latest.version === editor.versions.expectedVersion && latest.head.version === editor.headVersion) {
        setMasterBlocked(false); masterWrites.reset(); setNotice("The saved proposal is unchanged. You can retry this value.");
      } else {
        setReconcile(true); setNotice("The saved proposal changed. Close this form and refresh the saved configuration to review its values before retrying. Your form entries are preserved until you close it.");
      }
    } catch (error) { if (active.current && originRef.current === editor.origin) { accessDenied(error); setNotice(proposalError(error)); } }
    finally { if (active.current) setMasterChecking(false); }
  }
  const busy = masterWrites.isPending || masterChecking || writes.isPending || saveSection.isPending || action.isPending || modeSaving || modeFetching || qualitySaving;
  useEffect(() => {
    if (masterEditor || busy || !masterFocus.current) return;
    const restore = masterFocus.current;
    const frame = requestAnimationFrame(() => {
      if (!active.current || restore.origin !== originRef.current) return;
      const target = restore.adding ? (restore.kind === "uoms" ? addUomRef.current : addSurfaceRef.current) : restore.element;
      if (target?.isConnected && !target.matches(":disabled")) target.focus();
      masterFocus.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [masterEditor, busy]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { metadataVersion.current = (edit || remove) && detailRef.current ? { expectedVersion: detailRef.current.version, ...(scope === "admin" && detailRef.current.requestVersion !== null ? { expectedRequestVersion: detailRef.current.requestVersion } : {}) } : null; }, [edit, remove, scope]);
  useEffect(() => {
    if (detail.data?.status === "fulfilled" && observedStatus.current !== "fulfilled") void client.invalidateQueries({ queryKey: ["ai-estimator-knowledge"] });
    observedStatus.current = detail.data?.status ?? null;
  }, [detail.data?.status, client]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { for (const error of [detail.error, hierarchy.error, refs.error, privateMasters.error, readiness.error, changes.error, section.error]) accessDenied(error); }, [detail.error, hierarchy.error, refs.error, privateMasters.error, readiness.error, changes.error, section.error, accessDenied]);
  useEffect(() => () => { void client.cancelQueries({ queryKey: proposalKeys.actor(actorId) }); client.removeQueries({ queryKey: proposalKeys.actor(actorId) }); }, [client, actorId]);
  useEffect(() => { if (denied) { void client.cancelQueries({ queryKey: proposalKeys.actor(actorId) }); client.removeQueries({ queryKey: proposalKeys.actor(actorId) }); setDraft(null); } }, [denied, actorId, client]);
  function openMaster(kind: ProposalMasterKind, resource?: ProposalMasterResource, remove = false) {
    if (!editing || busy || hierarchy.isPending || hierarchy.isError || refs.isError || refs.isPending || privateMasters.isError || privateMasters.isPending) return;
    const hasSection = Boolean(section.data && item && revisionId);
    if (!hasSection && (item || !resource)) return;
    masterWrites.reset(); setMasterBlocked(false);
    masterFocus.current = { origin: originRef.current, kind, adding: !resource, element: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    setMasterEditor({ kind, resource, remove, origin: originRef.current, versions: version(), headVersion: detail.data!.head.version,
      section: hasSection ? section.data! : null, sectionKey: hasSection ? source.sectionKey(item!.mainLineId, revisionId!, "overview") : null });
  }
  function navigate(next: () => void) { if (busy) return; if (dirty) setNavigation(() => next); else next(); }
  function changeDraft(payload: KnowledgeJsonObject) { if (!draftVersion.current && section.data && detail.data) draftVersion.current = { sectionVersion: section.data.version, aggregateVersion: detail.data.version }; setDraft(payload); }
  function discard() { draftVersion.current = null; setDraft(null); setSectionValidation(null); modeRef.current?.discard(); qualityRef.current?.discard(); setModeDirty(false); setQualityDirty(false); saveSection.reset(); }
  function version() { return { expectedVersion: detailRef.current!.version, ...(scope === "admin" && detailRef.current!.requestVersion !== null ? { expectedRequestVersion: detailRef.current!.requestVersion! } : {}) }; }
  async function saveCurrent() { if (reconcile) return false; if (tab === "mode") return modeRef.current?.save() ?? false; if (tab === "quality") return qualityRef.current?.save() ?? false; if (draft && sectionValid) { try { await saveSection.mutateAsync(); return true; } catch { return false; } } return !dirty; }
  function run(kind: "submit" | "revise" | "decision", decision?: "approve" | "reject") {
    if (busy || dirty || reconcile || command.current) return;
    const common = { ...version(), ...(kind === "revise" && detailRef.current!.requestVersion !== null ? { expectedRequestVersion: detailRef.current!.requestVersion! } : {}), idempotencyKey: procurementRequestKey() };
    command.current = kind === "decision" ? { kind, input: { ...common, expectedRequestVersion: detailRef.current!.requestVersion!, decision: decision!, ...(decision === "reject" ? { reason: reason.trim() } : {}) } } : { kind, input: common };
    action.mutate();
  }
  // Published IDs can also be in the live catalog; the selected proposal snapshot owns their presentation here.
  const snapshotMasterIds = new Set((privateMasters.data ?? []).map(resource => resource.resourceId));
  const masters = { ...refs.data?.masters,
    uoms: (refs.data?.masters.uoms ?? []).filter(value => !snapshotMasterIds.has(value.id)),
    surfaces: (refs.data?.masters.surfaces ?? []).filter(value => !snapshotMasterIds.has(value.id)) };

  const ownBasket: KnowledgeBasket | null = detail.data && !subTarget ? { id: detail.data.basketId, version: detail.data.basket.version, name: detail.data.basket.payload.name, description: detail.data.basket.payload.description, displayOrder: detail.data.basket.payload.displayOrder, status: "inactive", createdAt: detail.data.createdAt, updatedAt: detail.data.updatedAt, createdById: detail.data.requesterId, updatedById: detail.data.basket.savedById } : null;
  const baskets = [...(ownBasket ? [ownBasket] : []), ...(refs.data?.baskets ?? []).filter(basket => basket.id !== ownBasket?.id)];
  const items = [...lines.flatMap(node => node.editorItem ? [node.editorItem] : []), ...(refs.data?.items ?? [])];
  const refState = { status: refs.isError ? "error" as const : refs.isPending ? "loading" as const : "ready" as const, onRetry: () => void refs.refetch() };
  const masterRefState = { status: refs.isError || privateMasters.isError ? "error" as const : refs.isPending || privateMasters.isPending ? "loading" as const : "ready" as const,
    onRetry: () => { void refs.refetch(); void privateMasters.refetch(); } };
  const proposedChoices = (kind: "uom" | "surface") => (privateMasters.data ?? []).filter(value => value.kind === kind).map(value => ({ id: value.resourceId, ...value.payload }));
  const error = writes.error ?? saveSection.error ?? action.error;
  // Child queries mount after the parent renders; do not announce success before their first read.
  const childReadKeys = item && revisionId ? tab === "mode"
    ? (["overview", "advanced", "pricing"] as const).map(sectionKey => source.sectionKey(item.mainLineId, revisionId, sectionKey))
    : tab === "quality" ? [source.basketQualityKey(item.basketId), source.qualityControlOptionsKey("frequency"), source.qualityControlOptionsKey("performer")] : [] : [];
  const childReads = childReadKeys.map(queryKey => client.getQueryState(queryKey));
  const loadingConfiguration = detail.isPending || hierarchy.isPending || refs.isPending
    || (!decisionComplete && snapshot === "current" && readiness.isPending)
    || (Boolean(item && revisionId) && (tab === "overview" || tab === "recommendations") && section.isPending)
    || childReads.some(state => !state || state.status === "pending" || state.fetchStatus !== "idle");
  const saveState = writes.isPending || saveSection.isPending || modeSaving || qualitySaving ? "saving"
    : error || modeSaveError || qualitySaveError || reconcile || denied || readState === "error" || childReads.some(state => state?.status === "error") || Boolean(selected && !item) ? "error"
    : dirty ? "unsaved"
    : busy || loadingConfiguration || readState === "loading" ? "refreshing" : "saved";
  const saveStateLabel = { saving: "Saving configuration…", error: "Configuration needs attention", unsaved: "Unsaved changes", refreshing: "Loading saved configuration…", saved: "Configuration saved" }[saveState];
  const savedAt = detail.data?.updatedAt && Number.isFinite(Date.parse(detail.data.updatedAt)) ? new Date(detail.data.updatedAt) : null;
  const saveNotice = notice === "Section saved." || notice === "Mode saved.";
  const showNotice = notice && (!procurementReference || (notice !== "Configuration saved." && (!saveNotice || saveState === "saved")));
  return <ContextPanel title={scope === "admin" ? "Review basket configuration" : subTarget ? "Configure Sub-Basket" : "Configure Main Basket"} eyebrow={scope === "admin" ? "Super Admin approval" : "Procurement"} className={`basket-proposal knowledge-context-panel${procurementReference ? " basket-proposal--procurement-reference" : ""}`} width="wide" onClose={onClose} dirty={dirty} busy={busy} footer={({ requestClose }) => <div className={`basket-proposal__actions${procurementReference ? " basket-proposal__footer" : ""}`}><Button variant="secondary" disabled={busy} onClick={requestClose}>Close</Button>{editing && dirty ? <Button busy={busy} disabled={!sectionValid && Boolean(draft)} onClick={() => void saveCurrent()}>Save changes</Button> : null}</div>}>
    <div className="basket-proposal__content knowledge-page--item-workspace" onSubmit={event => event.stopPropagation()}>
      {terminal ? <InlineMessage tone="info">{terminal.status === "fulfilled" ? "Basket approved and activated. It is available in Configuration and vendor selection." : "Proposal rejected. The requester can revise a copy."}</InlineMessage> : null}
      {denied ? <PageState state="error" message="This basket proposal is no longer available to your account." /> : detail.isPending ? <PageState state="loading" message="Loading basket configuration…" /> : detail.isError || !detail.data ? <PageState state="error" message={proposalError(detail.error)} action={{ label: "Retry proposal", onAction: () => void detail.refetch() }} /> : <>
        <div className={`basket-proposal__toolbar${procurementReference ? " basket-proposal__summary" : ""}`}>
          {procurementReference ? <div className="basket-proposal__identity">
            <span className="basket-proposal__identity-icon"><ProposalPresentationIcon name="basket" /></span>
            <div className="basket-proposal__identity-copy">
              <div className="basket-proposal__identity-heading"><h3>{detail.data.name}</h3><span className="basket-proposal__status" data-status={terminal?.status ?? detail.data.status}>{proposalStatusLabels[terminal?.status ?? detail.data.status]}</span></div>
              {subTarget ? <p className="basket-proposal__parent"><strong>New Sub-Basket under {detail.data.basket.payload.name}.</strong> The existing Main Basket and its shared quality checklist remain unchanged.</p> : <p className="basket-proposal__parent">Configure this Main Basket's Sub-Baskets and Main Lines before requesting approval.</p>}
              <div className="basket-proposal__save-state" data-state={saveState} role="status"><strong>{saveStateLabel}</strong>{saveState === "saved" && savedAt ? <time dateTime={savedAt.toISOString()}>{savedAt.toLocaleString()}</time> : null}</div>
            </div>
          </div> : <div><h3>{detail.data.name}</h3><p>{detail.data.vendorName ? `${detail.data.vendorName} · ` : ""}{proposalStatusLabels[terminal?.status ?? detail.data.status]}</p></div>}
          <div className={`basket-proposal__actions${procurementReference ? " basket-proposal__summary-actions" : ""}`}>
            {editParent ? <Button variant="secondary" leadingIcon={procurementReference ? <ProposalPresentationIcon name="edit" /> : undefined} disabled={busy || dirty} onClick={() => { writes.reset(); setEdit({ kind: "basket" }); }}>{procurementReference ? "Edit basket" : "Edit Main Basket"}</Button> : null}
            <Button variant={procurementReference ? "secondary" : "quiet"} leadingIcon={procurementReference ? <ProposalPresentationIcon name="refresh" /> : undefined} disabled={busy || Boolean(command.current)} onClick={() => navigate(() => { discard(); setReconcile(false); writes.reset(); saveSection.reset(); action.reset(); void client.invalidateQueries({ queryKey: key }); void refs.refetch(); })}>Refresh saved configuration</Button>
          </div>
        </div>
        {subTarget && !procurementReference ? <p className="basket-proposal__parent">New Sub-Basket under <strong>{detail.data.basket.payload.name}</strong>. The existing Main Basket and its shared quality checklist remain unchanged.</p> : null}
        {showNotice ? <p className="basket-proposal__state" role="status">{notice}</p> : null}
        {detail.data.status === "pending" && scope === "procurement" ? <InlineMessage tone="info">Your submitted version is preserved. Super Admin can review and edit a separate copy.</InlineMessage> : null}
        {detail.data.reason ? <InlineMessage tone="warning">Decision reason: {detail.data.reason}</InlineMessage> : null}
        {error ? <InlineMessage tone="error">{proposalError(error)}</InlineMessage> : null}
        {reconcile ? <InlineMessage tone="warning">The saved version may have changed. Your entries are preserved. Close or discard unsaved changes, then refresh the saved configuration before making another change.</InlineMessage> : null}
        {command.current && action.isError ? <InlineMessage tone="warning" action={<Button disabled={busy} onClick={() => action.mutate()}>Retry same action</Button>}>The outcome is unknown. Retry this same action to confirm its saved result.</InlineMessage> : null}
        {scope === "admin" ? <div className="basket-proposal__actions"><Button variant="quiet" disabled={busy} onClick={() => navigate(() => { discard(); setSnapshot(snapshot === "submitted" ? "current" : "submitted"); })}>{snapshot === "submitted" ? "Return to review copy" : "View original submission"}</Button><Button variant="quiet" onClick={() => setShowChanges(value => !value)}>{showChanges ? "Hide changes" : "Compare with submission"}</Button></div> : null}
        {snapshot === "submitted" ? <p role="status">Original submission. Read-only.</p> : null}
        {showChanges && scope === "admin" ? <section aria-label="Changes from submission">{changes.isPending ? <PageState state="loading" message="Loading review changes…" /> : changes.isError ? <PageState state="error" message={proposalError(changes.error)} action={{ label: "Retry changes", onAction: () => void changes.refetch() }} /> : changes.data?.length ? proposalChangeSummaries(changes.data, nodes, detail.data.name).map(change => <div className="basket-proposal__diff" key={change.resourceId}><strong>{change.title}</strong>{change.description ? <p>{change.description}</p> : null}<p>{change.savedAt ? `Saved ${new Date(change.savedAt).toLocaleString()}` : "Removed from review copy"}</p></div>) : <p>The saved review matches the submitted configuration.</p>}</section> : null}
        <div className="basket-proposal__body">
          <nav className="basket-proposal__hierarchy" aria-label="Proposed basket hierarchy"><h3>Sub-Baskets and Main Lines</h3>{hierarchy.isPending ? <p role="status">Loading hierarchy…</p> : hierarchy.isError ? <InlineMessage tone="error" action={<Button onClick={() => void hierarchy.refetch()}>Retry hierarchy</Button>}>{proposalError(hierarchy.error)}</InlineMessage> : <ul>{nodes.filter(node => node.kind === "sub_basket").map(sub => <li key={sub.resourceId}><div className="basket-proposal__node"><strong>{sub.payload.name}</strong>{editing ? <Button size="compact" variant="quiet" trailingIcon={procurementReference ? <ProposalPresentationIcon name="edit" /> : undefined} disabled={busy || dirty} aria-label={`Edit ${sub.payload.name}`} onClick={() => { writes.reset(); setEdit({ kind: "sub", node: sub }); }}>Edit</Button> : null}</div><ul>{lines.filter(line => line.parentId === sub.resourceId).map(line => <li key={line.resourceId}><button type="button" className="basket-proposal__line" aria-current={selected?.resourceId === line.resourceId ? "true" : undefined} disabled={busy} onClick={() => navigate(() => { discard(); setSelectedId(line.resourceId); })}>{procurementReference ? <><ProposalPresentationIcon name="line" /><span>{line.payload.name}</span></> : line.payload.name}</button></li>)}</ul>{editing ? <div className="basket-proposal__actions"><Button leadingIcon={procurementReference ? <ProposalPresentationIcon name="add" /> : undefined} className={procurementReference ? "basket-proposal__add-line" : undefined} variant="quiet" size="compact" disabled={busy || dirty || lines.length >= 100} onClick={() => { writes.reset(); setEdit({ kind: "line", parentId: sub.resourceId }); }}>Add Main Line</Button>{manageSubBaskets ? <Button variant="quiet" size="compact" disabled={busy || dirty || lines.some(line => line.parentId === sub.resourceId)} aria-label={`Remove ${sub.payload.name}`} onClick={() => { writes.reset(); setRemove(sub); }}>Remove</Button> : null}</div> : null}</li>)}</ul>}{!hierarchy.isPending && !nodes.length ? <p>Create a Sub-Basket, then add its Main Lines.</p> : null}{showAddSubBasket ? <Button leadingIcon={procurementReference ? <ProposalPresentationIcon name="add" /> : undefined} className={procurementReference ? "basket-proposal__add-sub" : undefined} variant="secondary" size="compact" disabled={busy || dirty || detail.data.counts.subBaskets >= 50} onClick={() => { writes.reset(); setEdit({ kind: "sub" }); }}>Add Sub-Basket</Button> : null}</nav>
          <section className="basket-proposal__workspace" aria-label="Main Line configuration">{selected && !item ? <PageState state="error" message="The saved Main Line details are incomplete. Refresh the configuration." /> : item && revisionId ? <>
            <div className={`basket-proposal__toolbar${procurementReference ? " basket-proposal__line-toolbar" : ""}`}><h3>{item.mainLineName}</h3>{editing ? <div className="basket-proposal__actions"><Button variant="quiet" size="compact" leadingIcon={procurementReference ? <ProposalPresentationIcon name="edit" /> : undefined} disabled={busy || dirty} onClick={() => { writes.reset(); setEdit({ kind: "line", parentId: selected!.parentId!, node: selected }); }}>Edit Main Line</Button><Button variant="quiet" size="compact" leadingIcon={procurementReference ? <ProposalPresentationIcon name="remove" /> : undefined} disabled={busy || dirty} onClick={() => { writes.reset(); setRemove(selected!); }}>Remove Main Line</Button></div> : null}</div>
            <div className="basket-proposal__tabs" role="tablist" aria-label="Main Line sections">{tabs.map(entry => <Button key={entry.key} role="tab" aria-selected={tab === entry.key} aria-controls={`proposal-panel-${proposalId}`} id={`proposal-tab-${entry.key}`} tabIndex={tab === entry.key ? 0 : -1} onKeyDown={event => { const index = tabs.findIndex(value => value.key === entry.key); const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); navigate(() => { discard(); setTab(tabs[next].key); document.getElementById(`proposal-tab-${tabs[next].key}`)?.focus(); }); } }} variant="quiet" size="compact" disabled={busy} onClick={() => navigate(() => { discard(); setTab(entry.key); })}>{entry.label}</Button>)}</div>
            {refs.isError ? <InlineMessage tone="error" action={<Button onClick={() => void refs.refetch()}>Retry reusable values</Button>}>Reusable values could not be loaded. Existing selections are preserved.</InlineMessage> : null}
            <div role="tabpanel" id={`proposal-panel-${proposalId}`} aria-labelledby={`proposal-tab-${tab}`} key={`${item.mainLineId}:${snapshot}`}>
              {tab === "overview" || tab === "recommendations" ? section.isPending ? <PageState state="loading" message="Loading saved section…" /> : section.isError ? <PageState state="error" message={proposalError(section.error)} action={{ label: "Retry section", onAction: () => void section.refetch() }} /> : section.data ? tab === "overview" ? <KnowledgeOverviewPanel presentation={procurementReference ? "procurement-basket" : undefined} overviewPayload={draft ?? section.data.payload} masters={masters} referenceStates={{ masters: { uoms: masterRefState, surfaces: masterRefState } }} proposedUoms={proposedChoices("uom")} proposedSurfaces={proposedChoices("surface")} editable={editing} saving={busy} canQuickAdd={editing} quickAddUomLabel="Add UOM" quickAddUomButtonRef={addUomRef} quickAddSurfaceButtonRef={addSurfaceRef} proposalActions onQuickAddUom={() => openMaster("uoms")} onQuickAddSurface={() => openMaster("surfaces")} onOverviewDirty={() => undefined} onOverviewPayloadChange={changeDraft} /> : <KnowledgeSectionEditor dataSource={source} canReadCatalog={false} sectionKey="recommendations" payload={draft ?? section.data.payload} savedPayload={section.data.payload} masters={masters} relationshipBaskets={baskets} relationshipItems={items} currentMainLineId={item.mainLineId} mainLineName={item.mainLineName} basketName={detail.data.basket.payload.name} relationshipCatalogState={refState} readOnly={!editing || busy} readOnlyRevision={!editing} canQuickAdd={false} resetKey={`${item.mainLineId}:${snapshot}`} onChange={changeDraft} onDirty={() => undefined} onValidationChange={onSectionValidationChange} onQuickAdd={() => undefined} /> : null : null}
              {tab === "mode" ? <KnowledgeModePanel ref={modeRef} dataSource={source} item={item} revisionId={revisionId} masters={masters} proposedUoms={proposedChoices("uom")} relationshipBaskets={baskets} relationshipItems={items} editable={editing} legacyModeCatalogState={refState} uomCatalogState={masterRefState} onDirtyChange={setModeDirty} onSavingChange={setModeSaving} onBusyChange={setModeFetching} onSaveErrorChange={setModeSaveError} onAnnouncement={setNotice} /> : null}
              {tab === "quality" ? subTarget ? <InheritedProposalQuality basketId={detail.data.basketId} source={source} /> : <KnowledgeBasketQualityPanel ref={qualityRef} dataSource={source} item={item} revisionId={revisionId} canUpdate={editing && detail.data.capabilities.editQuality !== false} canCreateQualityOptions={false} onDirtyChange={setQualityDirty} onSavingChange={setQualitySaving} onSaveCommandChange={onQualitySaveCommandChange} /> : null}
            </div>
          </> : !hierarchy.isPending ? <><PageState state="empty" message={subTarget ? "Main Lines are optional for this Sub-Basket request. Add a Main Line to configure its UOM, modes, rates and recommendations, or submit the Sub-Basket on its own." : "Add a Main Line to configure its UOM, mode settings, rates and recommendations. Quality Parameters are shared across all Main Lines."} />{subTarget && scope === "admin" ? <InheritedProposalQuality basketId={detail.data.basketId} source={source} /> : null}</> : null}
              {tab === "overview" || !item ? <ProposalMasterList resources={privateMasters.data ?? []} editable={editing} busy={busy || hierarchy.isPending || hierarchy.isError || privateMasters.isPending || privateMasters.isError || Boolean(item && (!section.data || section.isError))} onEdit={resource => openMaster(resource.kind === "uom" ? "uoms" : "surfaces", resource)} onRemove={resource => openMaster(resource.kind === "uom" ? "uoms" : "surfaces", resource, true)} /> : null}
          </section>
        </div>
        {snapshot === "current" && detail.data.capabilities.revise ? <div className="basket-proposal__actions"><Button disabled={busy || reconcile || Boolean(command.current)} onClick={() => run("revise")}>Revise as new draft</Button></div> : null}
        {snapshot === "current" && !decisionComplete ? <section className="basket-proposal__readiness" aria-label="Submission readiness"><h3>{scope === "admin" ? "Approval readiness" : "Submission readiness"}</h3>{readiness.isPending ? <p role="status">Checking saved configuration…</p> : readiness.isError ? <InlineMessage tone="error" action={<Button onClick={() => void readiness.refetch()}>Retry readiness</Button>}>{proposalError(readiness.error)}</InlineMessage> : readiness.data?.ready ? <p>The saved configuration is ready for {scope === "admin" ? "activation" : "review"}.</p> : <ul>{readiness.data?.findings.map((finding, index) => <li key={`${finding.resourceId}-${index}`}>{finding.mainLineId ? <Button variant="quiet" onClick={() => navigate(() => { discard(); setSelectedId(finding.mainLineId!); setTab(finding.sectionKey === "advanced" || finding.sectionKey === "pricing" ? "mode" : finding.sectionKey === "recommendations" ? "recommendations" : "overview"); })}>{finding.message}</Button> : finding.message}</li>)}</ul>}{dirty ? <p>Save your changes before submitting or deciding this request.</p> : null}<div className="basket-proposal__actions">{detail.data.capabilities.submit ? <Button disabled={busy || dirty || reconcile || Boolean(command.current) || !readiness.data?.ready || readiness.isError || readiness.isFetching} onClick={() => run("submit")}>Send for approval and activation</Button> : null}{detail.data.capabilities.decide && !terminal ? <><Button variant="secondary" disabled={busy || dirty || reconcile || Boolean(command.current)} onClick={() => setRejection(true)}>Reject proposal</Button><Button disabled={busy || dirty || reconcile || Boolean(command.current) || !readiness.data?.ready || readiness.isError || readiness.isFetching} onClick={() => run("decision", "approve")}>Approve &amp; activate</Button></> : null}</div></section> : null}
      </>}
    </div>
    {masterEditor && !denied && originRef.current === masterEditor.origin ? masterEditor.remove ? <Dialog tone="danger" icon={<ProposalPresentationIcon name="remove" />} title={`Remove proposed ${masterEditor.resource!.payload.name}?`} eyebrow="Basket proposal" description="Only unused proposed values can be removed. Shared Configuration values remain unchanged." busy={masterWrites.isPending || masterChecking} onClose={() => setMasterEditor(null)}>
      {masterWrites.error || masterBlocked ? <div className="ui-dialog__body">
      {masterWrites.error ? <InlineMessage tone="error">{proposalError(masterWrites.error)}</InlineMessage> : null}
      {masterBlocked ? <InlineMessage tone="warning">Check the saved proposal before retrying.<Button variant="quiet" onClick={() => void reconcileMaster()} disabled={masterChecking}>Check saved proposal</Button></InlineMessage> : null}
      </div> : null}
      <div className="ui-dialog__actions basket-proposal__actions"><Button variant="secondary" disabled={masterWrites.isPending || masterChecking} onClick={() => setMasterEditor(null)}>Cancel</Button><Button variant="destructive" busy={masterWrites.isPending} disabled={masterBlocked || masterChecking} onClick={() => masterWrites.mutate({ editor: masterEditor })}>Remove proposed value</Button></div>
    </Dialog> : <ProposalMasterDialog kind={masterEditor.kind} initial={masterEditor.resource?.payload} busy={masterWrites.isPending || masterChecking} blocked={masterBlocked || reconcile} error={masterWrites.error ? proposalError(masterWrites.error) : ""} onClose={() => setMasterEditor(null)} onSave={fields => masterWrites.mutate({ editor: masterEditor, fields })} onReconcile={() => void reconcileMaster()} /> : null}
    {edit && detail.data ? <ProposalMetadataDialog showDescription={edit.kind === "basket"} showOrder={edit.kind === "basket"} defaultOrder={Math.max(-1, ...nodes.filter(node => edit.kind === "sub" ? node.kind === "sub_basket" : edit.kind === "line" && node.kind === "main_line" && node.parentId === edit.parentId).map(node => node.payload.displayOrder)) + 1} title={edit.kind === "basket" ? "Edit Main Basket" : `${edit.node ? "Edit" : "Add"} ${edit.kind === "sub" ? "Sub-Basket" : "Main Line"}`} initial={edit.kind === "basket" ? detail.data.basket.payload : edit.node?.payload} busy={writes.isPending} blocked={reconcile} error={writes.error ? proposalError(writes.error) : ""} onClose={() => setEdit(null)} onSave={(metadata: ProposalMetadata) => {
      if (reconcile) return;
      const input = { ...(metadataVersion.current ?? version()), ...metadata };
      writes.mutate(() => edit.kind === "basket" ? saveProposalBasket(scope, proposalId, input) : edit.kind === "sub" ? edit.node ? saveProposalSubBasket(scope, proposalId, edit.node.resourceId, input) : addProposalSubBasket(scope, proposalId, input) : edit.node ? saveProposalMainLine(scope, proposalId, edit.node.resourceId, input) : addProposalMainLine(scope, proposalId, edit.parentId, input));
    }} /> : null}
    {remove ? <Dialog tone="danger" icon={<ProposalPresentationIcon name="remove" />} eyebrow="Basket configuration" title={`Remove ${remove.payload.name}?`} description="This removes it from this proposal only. References and nonempty Sub-Baskets must be resolved first." onClose={() => setRemove(null)} busy={writes.isPending}><div className="ui-dialog__actions basket-proposal__actions"><Button variant="secondary" onClick={() => setRemove(null)}>Cancel</Button><Button variant="destructive" busy={writes.isPending} onClick={() => writes.mutate(() => remove.kind === "sub_basket" ? removeProposalSubBasket(scope, proposalId, remove.resourceId, metadataVersion.current ?? version()) : removeProposalMainLine(scope, proposalId, remove.resourceId, metadataVersion.current ?? version()))}>Remove</Button></div>{writes.error ? <div className="ui-dialog__body"><InlineMessage tone="error">{proposalError(writes.error)}</InlineMessage></div> : null}</Dialog> : null}
    {navigation ? <Dialog title="Save changes before continuing?" description="Your changes have not been saved to this proposal." onClose={() => setNavigation(null)} busy={busy}><div className="ui-dialog__actions basket-proposal__actions"><Button variant="secondary" onClick={() => setNavigation(null)}>Keep editing</Button><Button variant="secondary" onClick={() => { discard(); navigation(); setNavigation(null); }}>Discard changes</Button><Button disabled={reconcile || (!sectionValid && Boolean(draft))} busy={busy} onClick={async () => { if (await saveCurrent()) { navigation(); setNavigation(null); } }}>Save and continue</Button></div></Dialog> : null}
    {rejection ? <Dialog tone="danger" eyebrow="Super Admin review" title="Reject basket proposal" onClose={() => setRejection(false)} busy={action.isPending}><div className="ui-dialog__body"><Field id={`proposal-reason-${proposalId}`} label="Rejection reason" required>{props => <Textarea {...props} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={action.isPending} />}</Field></div><div className="ui-dialog__actions basket-proposal__actions"><Button variant="secondary" onClick={() => setRejection(false)}>Cancel</Button><Button variant="destructive" busy={action.isPending} disabled={!reason.trim()} onClick={() => run("decision", "reject")}>Reject proposal</Button></div></Dialog> : null}
  </ContextPanel>;
}

/** Observe only reads used by this open workspace, including its child editors. */
function useProposalReadState(actorId: string, scope: ProposalScope, proposalId: string) {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback((notify: () => void) => cache.subscribe(notifyManager.batchCalls(notify)), [cache]);
  const getSnapshot = useCallback(() => {
    const queries = cache.findAll({
      queryKey: [...proposalKeys.actor(actorId), scope],
      type: "active",
      predicate: query => [proposalId, "references", "editor-references"].includes(String(query.queryKey[3]))
    });
    if (queries.some(query => query.state.status === "error")) return "error";
    if (queries.some(query => query.state.status === "pending" || query.state.fetchStatus !== "idle")) return "loading";
    return "ready";
  }, [cache, actorId, scope, proposalId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

import { EstimateSubBasketModes } from "../estimates/EstimateSubBasketModes";
import { quotationGroupComparison, quotationGroupModeOptions, quotationModeOperations, quotationModeScopeKey, stageQuotationGroupMode, type QuotationModeSelection } from "./clientSubBasketModes";
import { ProjectId } from "../../components/projects/ProjectId";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { captureLoginReviewSession } from "../../auth/loginReviewSession";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { createConfiguredEstimateViewState } from "../leads/useConfiguredEstimateViewState";
import { EstimateBuilderShell, type EstimateShellBasket } from "../estimates/EstimateBuilderShell";
import { EstimateBuilderArea } from "../estimates/EstimateBuilderArea";
import { EstimateNavigationGuard } from "../estimates/EstimateNavigationGuard";
import { EstimateItemPicker } from "../estimates/EstimateItemPicker";
import { EstimateRecommendations } from "../estimates/EstimateRecommendations";
import { ClientQuotationSetup } from "./ClientQuotationSetup";
import { ClientQuotationLine } from "./ClientQuotationLine";
import { quotationCandidateHasAvailableChoice, quotationCandidateRows } from "./clientQuotationCandidates";
import { ESTIMATE_PROPERTY_TYPES, requiresBedroomCount, isValidBedroomCount } from "../../../../shared/estimation/estimateRoomOptions";
import { ClientQuotationSubmittedView } from "./ClientQuotationSubmittedView";
import { ClientQuotationOptions } from "./ClientQuotationOptions";
import { canReviewCurrentQuotation, type ClientQuotationReviewState } from "./clientQuotationReview";
import { currentQuotationApprovalState, currentQuotationIsApproved } from "../estimates/quotationApproval";
import { refreshEstimateCollaboration } from "../leads/estimateCollaborationQueries";
import { useQuotationRevision } from "../leads/useQuotationRevision";
import { estimateTiersKeys, getEstimateTiers } from "./estimateTiersApi";
import { getQuotation, getQuotationSetup, getQuotationCandidates, getQuotationRecommendations, quotationKeys, saveQuotation, type QuotationCandidate, type QuotationConfigureOperation, type QuotationDetail, type QuotationLine, type QuotationGroup, type QuotationOperation } from "./quotationApi";
import { draftQuotationItem as draftItem, prunePendingQuotationRecommendations, quotationDraftOperations, quotationGroupContains,
  quotationGroupContainsScope, quotationSaveIsConfirmed, type QuotationItemDraft as ItemDraft, type QuotationDraft, type QuotationGroupDraft } from "./clientQuotationDraft";
import "../../styles/estimator-dashboard.css";
import "./clientQuotation.css";

const money = (paise: number | null) => paise == null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
function quotationReviewCopy(detail: QuotationDetail) {
  if (detail.phase === "pre") {
    return detail.reviewState === "draft" ? "Your team is preparing this quotation."
      : detail.reviewState === "awaiting_staff_review" ? "Saved changes. Your team will review and send the updated quotation for approval."
      : detail.reviewState === "ready_for_approval" ? "Ready for your approval. Saving changes will send the revised quotation back to your team for review."
      : "Your initial estimate approval is recorded.";
  }
  const state = currentQuotationApprovalState(detail);
  if (state === "initial_current" && currentQuotationIsApproved(detail)) return "Initial estimate approved. No quotation changes require Client review.";
  if (state === "revision_draft") return "The Designer is preparing a revised quotation for your review.";
  if (state === "revision_pending_client") return "The revised quotation is awaiting your review.";
  if (state === "revision_changes_requested") return "Your requested quotation changes are being prepared.";
  if (state === "revision_current" && currentQuotationIsApproved(detail)) return "Your revised quotation approval is recorded. Design work can continue.";
  return "The current quotation approval could not be verified. Refresh before continuing.";
}
type QuotationView = "builder" | "baskets" | "configure" | "summary" | "review";
type PendingSave = { before: QuotationDetail; operations: QuotationOperation[]; destination?: QuotationView };
interface ClientQuotationProps { projectId: string; readOnly?: boolean; workspace?: boolean; onPendingChanges?: (pending: boolean) => void; review?: ClientQuotationReviewState }

export function ClientQuotation(props: ClientQuotationProps) {
  return <ClientQuotationForProject key={`${props.projectId}:${Boolean(props.readOnly)}`} {...props} />;
}

function ClientQuotationForProject({ projectId, readOnly = false, workspace = false, onPendingChanges, review }: ClientQuotationProps) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: quotationKeys.detail(projectId), queryFn: () => getQuotation(projectId), retry: false });
  const probeNotStarted = Boolean(review) && !readOnly && query.isError && !query.isFetching && query.error instanceof ApiError && query.error.status === 404;
  const tiers = useQuery({ queryKey: estimateTiersKeys.detail(projectId), queryFn: () => getEstimateTiers(projectId), enabled: probeNotStarted, retry: false, staleTime: 0 });
  const revision = useQuotationRevision(projectId, true, query.data?.estimateVersion);
  const [draft, setDraft] = useState<QuotationDraft | null>(null);
  const [modeSelections, setModeSelections] = useState<Record<string, QuotationModeSelection>>({});
  const [setupDraft, setSetupDraft] = useState<{ version: number; operation: QuotationConfigureOperation } | null>(null);
  const [adding, setAdding] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [itemOffset, setItemOffset] = useState(0);
  const [itemBasketId, setItemBasketId] = useState("all");
  const [itemSubBasketId, setItemSubBasketId] = useState("all");
  const [activeRoomId, setActiveRoomId] = useState("");
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState("");
  const [conflict, setConflict] = useState(false);
  const [unknownSave, setUnknownSave] = useState<PendingSave | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [openingReview, setOpeningReview] = useState(false);
  const [view, setView] = useState<QuotationView>("builder");
  const candidateEnabled = view === "builder" && (adding || Boolean(Object.values(draft?.items ?? {}).some(item => item.kind === "add" && item.included))) && !readOnly && Boolean(query.data?.editingAllowed) &&
    query.data?.projectId === projectId && !query.isError;
  const reviewSession = captureLoginReviewSession();
  const sessionKey = reviewSession?.id;
  const pricingContext = JSON.stringify([reviewSession?.userId, sessionKey, projectId, query.data?.estimateId, query.data?.estimateVersion]);
  const nonPmcModes = useRef<{ context: string; modes: Map<string, "sub_vendor" | "in_house"> }>({ context: pricingContext, modes: new Map() });
  useLayoutEffect(() => { nonPmcModes.current = { context: pricingContext, modes: new Map() }; if (!draft) setModeSelections({}); }, [pricingContext]);
  const setup = useQuery({ queryKey: [...quotationKeys.setup(projectId), query.data?.estimateId, query.data?.estimateVersion, sessionKey], queryFn: () => getQuotationSetup(projectId),
    enabled: candidateEnabled || view === "configure" && !readOnly && Boolean(query.data?.setup), retry: false, staleTime: 0 });
  const setupCurrent = setup.data?.projectId === projectId && setup.data.estimateId === query.data?.estimateId && setup.data.estimateVersion === query.data?.estimateVersion;
  const pickerHierarchyReady = setupCurrent && setup.isFetchedAfterMount && !setup.isError && !setup.isFetching;
  const candidateRoomId = query.data?.rooms.find(room => room.id === activeRoomId)?.id ?? query.data?.rooms[0]?.id;
  const candidates = useQuery({ queryKey: [...quotationKeys.items(projectId, itemSearch, itemOffset), query.data?.estimateVersion, candidateRoomId, itemBasketId, itemSubBasketId, sessionKey],
    queryFn: () => getQuotationCandidates(projectId, itemSearch, itemOffset, {
      ...(itemBasketId === "all" ? {} : { mainBasketId: itemBasketId }),
      ...(itemSubBasketId === "all" ? {} : { subBasketId: itemSubBasketId })
    }),
    enabled: candidateEnabled, retry: false });
  useEffect(() => {
    if (!candidates.isSuccess || candidates.isFetching) return;
    if (itemOffset >= candidates.data.total && itemOffset > 0) setItemOffset(Math.max(0, Math.floor((candidates.data.total - 1) / 20) * 20));
  }, [candidates.data, candidates.isSuccess, candidates.isFetching, itemOffset]);
  useEffect(() => {
    if (!pickerHierarchyReady) return;
    const basket = setup.data?.baskets.find(basket => basket.id === itemBasketId);
    if (itemBasketId !== "all" && !basket) {
      setItemBasketId("all"); setItemSubBasketId("all"); setItemOffset(0);
    } else if (itemSubBasketId !== "all" && !basket?.subBaskets.some(sub => sub.id === itemSubBasketId)) {
      setItemSubBasketId("all"); setItemOffset(0);
    }
  }, [setup.data?.baskets, pickerHierarchyReady, itemBasketId, itemSubBasketId]);
  const [viewState, setViewState] = useState(createConfiguredEstimateViewState);
  const [removal, setRemoval] = useState<QuotationGroupDraft | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const removalTriggerRef = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const focusAfterRemoval = useRef(false);
  const inFlight = useRef(false);
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current !== view && (previousView.current === "review" || document.activeElement === document.body)) {
      sectionRef.current?.focus({ preventScroll: true });
      sectionRef.current?.scrollIntoView?.({ block: "start" });
    }
    previousView.current = view;
  }, [view]);
  const save = useMutation({ mutationFn: (input: { version: number; operations: QuotationOperation[] }) => saveQuotation(projectId, input.version, input.operations) });
  const dirty = Boolean(setupDraft || draft && (Object.keys(draft.items).length || draft.groups.length));
  const busy = save.isPending || verifying || openingReview;
  useEffect(() => () => { onPendingChanges?.(false); }, [onPendingChanges]);
  useEffect(() => { onPendingChanges?.(dirty || busy || Boolean(unknownSave)); }, [dirty, busy, unknownSave, onPendingChanges]);
  useEffect(() => {
    if (!focusAfterRemoval.current) return;
    focusAfterRemoval.current = false;
    const next = sectionRef.current?.querySelector<HTMLElement>(".client-quotation__line input:not(:disabled), .client-quotation__line button:not(:disabled)");
    (next ?? triggerRef.current ?? sectionRef.current)?.focus({ preventScroll: true });
  }, [draft]);

  const accessDenied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const notStarted = !dirty && !unknownSave && !query.isFetching && (
    query.isSuccess && query.data.projectId === projectId && query.data.estimateId === null && query.data.editingBlockReason === "not_started"
    || probeNotStarted && tiers.isSuccess && !tiers.isFetching && tiers.isFetchedAfterMount && tiers.dataUpdatedAt >= query.errorUpdatedAt
      && tiers.data.projectId === projectId && tiers.data.estimateId === null && tiers.data.editingBlockReason === "not_started");
  const refreshQuotation = async () => {
    const [refreshed] = await Promise.all([query.refetch(), review?.refresh()]);
    if (review && !readOnly && refreshed.error instanceof ApiError && refreshed.error.status === 404) await tiers.refetch({ cancelRefetch: false });
  };
  if (query.isPending) return <section className="client-quotation" aria-label="Quotation"><h2>Quotation</h2><p role="status">Loading your quotation…</p>
    <EstimateNavigationGuard key="quotation-navigation-guard" dirty={dirty || Boolean(unknownSave)} busy={busy} saveDisabled onSave={async () => false} /></section>;
  if (notStarted) return <section className="client-quotation" aria-label="Quotation"><h2>Estimation</h2>{workspace ? <ProjectId projectNumber={query.isSuccess && query.data.projectId === projectId ? query.data.projectNumber : tiers.data?.projectNumber} /> : null}<p role="status">Your team has not prepared the quotation yet. Your saved requirements remain available in the project.</p><Button variant="secondary" onClick={() => void refreshQuotation()}>Refresh quotation</Button></section>;
  if (!query.data || query.data.projectId !== projectId || accessDenied || query.data.estimateId === null) return <section className="client-quotation" aria-label="Quotation"><h2>Quotation</h2>{probeNotStarted && (tiers.isPending || tiers.isFetching)
    ? <p role="status">Checking quotation availability…</p> : <p role="alert">{accessDenied
    ? "Quotation access is unavailable. Any unsaved changes are preserved; retry access before continuing."
    : "Your quotation could not be loaded. Refresh before making changes."}</p>}<Button variant="secondary" disabled={query.isFetching || probeNotStarted && tiers.isFetching} onClick={() => void refreshQuotation()}>Refresh quotation</Button>
    <EstimateNavigationGuard key="quotation-navigation-guard" dirty={dirty || Boolean(unknownSave)} busy={busy} saveDisabled onSave={async () => false} /></section>;
  const detail = query.data;
  const stale = conflict || Boolean(draft && draft.version !== detail.estimateVersion || setupDraft && setupDraft.version !== detail.estimateVersion);
  const setupSourceChanged = Boolean(setupDraft && setupCurrent && setup.data?.setup.sourceToken !== setupDraft.operation.sourceToken);
  const canConfigure = !readOnly && detail.editingAllowed && Boolean(detail.setup?.canConfigure);
  const setupAvailable = setupCurrent && !setup.isError && !setup.isFetching && Boolean(setup.data?.setup.canConfigure) && !setupSourceChanged;
  const pickerReady = pickerHierarchyReady && candidates.isSuccess && !candidates.isFetching;
  const setupProblem = setupDraft && (
    !ESTIMATE_PROPERTY_TYPES.some(type => type === setupDraft.operation.propertyType) && setupDraft.operation.propertyType !== detail.setup?.propertyType ? "Select an available property type."
    : requiresBedroomCount(setupDraft.operation.propertyType) && !isValidBedroomCount(setupDraft.operation.bedroomCount) ? "Enter a valid number of bedrooms."
    : setupDraft.operation.rooms.some(room => [room.length, room.width].some(value => value !== null && (!Number.isFinite(value) || value <= 0 || value > 1000000))) ? "Enter positive room dimensions." : null);
  const publishedEstimate = review?.estimate?.id === detail.estimateId && review.estimate.projectId === projectId && !review.estimate.reviewSourceIssue
    ? review.estimate : null;
  const canDecide = !readOnly && !dirty && !busy && !unknownSave && !stale && !query.isError && !query.isFetching &&
    !revision.isError && !review?.error && !review?.loading && !review?.refreshing && canReviewCurrentQuotation(detail, publishedEstimate, revision.data);
  const canOpenReview = Boolean(publishedEstimate?.publishedReview) && !dirty && !busy && !unknownSave && !stale &&
    !query.isError && !revision.isError && !review?.error && !review?.loading && !review?.refreshing;
  const refreshReview = async () => {
    const [quotationResult, reviewResult, revisionResult] = await Promise.all([query.refetch(), review?.refresh() ?? Promise.resolve(false), revision.refetch()]);
    return quotationResult.isSuccess && reviewResult && revisionResult.isSuccess;
  };
  const openReview = async () => {
    if (!canOpenReview || inFlight.current) return;
    setOpeningReview(true);
    try { if (await refreshReview()) setView("review"); }
    finally { setOpeningReview(false); }
  };
  const canEdit = !readOnly && detail.editingAllowed && detail.estimateVersion !== null && !query.isFetching && !query.isError && !busy && !revision.isError && !stale && !unknownSave;
  const canChangePricingMode = !readOnly && detail.canChangePricingMode === true;
  const changedItems = Object.values(draft?.items ?? {});
  const addedItems = changedItems.filter(item => item.kind === "add");
  const pendingGroups = draft?.groups ?? [];
  const savedRows = [...new Map([...detail.lines, ...(detail.excludedLines ?? []), ...addedItems.map(item => item.line)].map(line => [line.id, line])).values()];
  const activeRoom = detail.rooms.find(room => room.id === activeRoomId) ?? detail.rooms[0];
  const rows = savedRows;
  const included = (line: QuotationLine) => !(line.source && pendingGroups.some(({ group }) => quotationGroupContains(group, line))) && (draft?.items[line.id]?.included ?? line.included);
  const currentRoomId = activeRoom?.id ?? "";
  const selectedRows = rows.filter(included);
  const roomRows = selectedRows.filter(line => line.roomId === currentRoomId);
  const basketMap = new Map((detail.baskets ?? []).map(basket => [basket.id, { ...basket, subBaskets: [...basket.subBaskets] }]));
  // Only saved scope and explicitly added rows become groups, never the browse catalogue.
  for (const line of detail.baskets ? addedItems.filter(item => item.included).map(item => item.line) : rows) {
    if (!line.mainBasketId || !line.mainBasketName) continue;
    const basket = basketMap.get(line.mainBasketId) ?? { id: line.mainBasketId, name: line.mainBasketName, subBaskets: [] };
    if (line.subBasketId && line.subBasketName && !basket.subBaskets.some(sub => sub.id === line.subBasketId)) {
      basket.subBaskets.push({ id: line.subBasketId, name: line.subBasketName });
    }
    basketMap.set(basket.id, basket);
  }
  const baskets = [...basketMap.values()];
  const subtotal = (lines: readonly QuotationLine[]) => {
    const saved = lines.filter(line => line.included && !addedItems.some(item => item.line.id === line.id));
    if (saved.some(line => line.amountPaise === null)) return "Visible subtotal unavailable";
    const total = saved.reduce((sum, line) => sum + line.amountPaise!, 0);
    return Number.isSafeInteger(total) ? `Saved visible subtotal ${money(total)}` : "Visible subtotal unavailable";
  };
  const change = (line: QuotationLine, update: Partial<ItemDraft>, restoreFocus = true) => {
    if (!canEdit || setupDraft || !line.source || inFlight.current || pendingGroups.some(({ group }) => quotationGroupContains(group, line))) return;
    if (update.pricingMode !== undefined && (!canChangePricingMode || line.classification !== "special" ||
      !line.pricingModeChoices?.some(option => option.pricingMode === update.pricingMode))) return;
    setNotice(""); setValidation(""); save.reset();
    if (update.included === false && restoreFocus) focusAfterRemoval.current = true;
    setDraft(previous => prunePendingQuotationRecommendations({ version: previous?.version ?? detail.estimateVersion!, groups: previous?.groups ?? [], items: {
      ...previous?.items, [line.id]: { ...(previous?.items[line.id] ?? draftItem(line)), ...update }
    } }, rows));
  };
  const togglePmc = (line: QuotationLine, item: ItemDraft) => {
    if (!canEdit || !canChangePricingMode || setupDraft || !line.source || line.classification !== "special" || inFlight.current) return;
    if (nonPmcModes.current.context !== pricingContext) nonPmcModes.current = { context: pricingContext, modes: new Map() };
    const modes = nonPmcModes.current.modes;
    const mode = item.pricingMode;
    if (mode === "sub_vendor" || mode === "in_house") modes.set(line.id, mode);
    const pricingMode = mode === "pmc" ? modes.get(line.id) ?? "sub_vendor" : "pmc";
    change(line, { pricingMode, components: [] });
  };
  const add = (item: ItemDraft) => {
    if (!canEdit || setupDraft || inFlight.current) return false;
    if (!item.line.source) { setValidation("This saved item is unavailable in the current Configuration. Ask your team to review it."); return false; }
    if (pendingGroups.some(({ group }) => quotationGroupContains(group, item.line))) {
      setValidation("Undo this basket removal or save it before adding an item back."); return false;
    }
    setDraft(previous => ({ version: previous?.version ?? detail.estimateVersion!, groups: previous?.groups ?? [], items: { ...previous?.items, [item.line.id]: item } }));
    setActiveRoomId(item.line.roomId); setViewState(current => ({ ...current, railView: "section", search: "", basketFilter: "all",
      collapsedBasketIds: new Set([...current.collapsedBasketIds].filter(id => id !== item.line.mainBasketId)),
      collapsedSubBasketIds: new Set([...current.collapsedSubBasketIds].filter(id => id !== `${item.line.mainBasketId}:${item.line.subBasketId}`)) }));
    setNotice(""); setValidation("");
    return true;
  };
  const addCandidate = (candidate: QuotationCandidate, origins?: string[]) => {
    if (!activeRoom || !canEdit || !quotationCandidateHasAvailableChoice(candidate, canChangePricingMode)) return false;
    const existing = rows.find(line => line.roomId === currentRoomId && line.mainLineId === candidate.mainLineId);
    if (existing && included(existing)) return false;
    const pending = existing && draft?.items[existing.id];
    if (pending) return add({ ...pending, included: true, recommendationSourceMainLineIds: origins ?? [] });
    if (existing) return add({ ...draftItem(existing), included: true, recommendationSourceMainLineIds: origins ?? [] });
    const line = quotationCandidateRows([candidate], activeRoom, [])[0];
    return line ? add({ ...draftItem(line, "add"), included: true, ...(origins ? { recommendationSourceMainLineIds: origins } : {}) }) : false;
  };
  const acceptSaved = async (saved: QuotationDetail, destination?: QuotationView) => {
    client.setQueryData<QuotationDetail>(quotationKeys.detail(projectId), current => (current?.estimateVersion ?? -1) > (saved.estimateVersion ?? -1) ? current : saved);
    setDraft(null); setSetupDraft(null); setConflict(false); setUnknownSave(null); setValidation("");
    nonPmcModes.current.modes.clear(); setModeSelections({});
    setNotice("Changes saved. Your team will review the revised quotation before approval.");
    if (destination) setView(destination);
    await refreshEstimateCollaboration(client);
  };
  const verifySaved = async (pending = unknownSave): Promise<boolean> => {
    if (!pending) return false;
    setVerifying(true);
    try {
      const result = await query.refetch();
      if (result.isSuccess && quotationSaveIsConfirmed(pending.before, result.data, pending.operations)) {
        await acceptSaved(result.data, pending.destination); save.reset(); return true;
      }
      if (result.isSuccess && result.data.estimateVersion !== pending.before.estimateVersion) setConflict(true);
      return false;
    } finally { setVerifying(false); }
  };
  const submit = async (destination?: QuotationView): Promise<boolean> => {
    if (inFlight.current || !canEdit) return false;
    if (!dirty) { if (destination) setView(destination); return true; }
    if (setupDraft && (!setupAvailable || setupProblem)) {
      setValidation(setupProblem || "Refresh the estimate setup before saving. Your changes are preserved."); return false;
    }
    if (addedItems.some(item => item.included) && !pickerReady) {
      setValidation("Refresh available items before saving your selections."); return false;
    }
    let operations: QuotationOperation[];
    try {
      if (changedItems.some(item => item.kind === "update" && rows.some(line => line.id === item.line.id && !line.source))) {
        throw new Error("A changed item is unavailable in the current Configuration. Your changes are preserved; ask your team to review it before saving.");
      }
      if (changedItems.some(item => item.included && item.pricingMode !== item.line.pricingMode && !canChangePricingMode)) {
        throw new Error("Pricing-mode editing is unavailable. Refresh the quotation or discard your changes before continuing.");
      }
      operations = setupDraft ? [setupDraft.operation] : draft ? quotationDraftOperations(draft, quotationModeOperations(modeSelections, draft)) : [];
    }
    catch (error) { setValidation(error instanceof Error ? error.message : "Review your changes before saving."); return false; }
    if (!operations.length) { setDraft(null); if (destination) setView(destination); return true; }
    inFlight.current = true; setValidation(""); setNotice("");
    try {
      const saved = await save.mutateAsync({ version: setupDraft?.version ?? draft!.version, operations });
      await acceptSaved(saved, destination); return true;
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
        if (error.status === 409) setConflict(true);
        await query.refetch();
      } else {
        const pending = { before: detail, operations, destination };
        setUnknownSave(pending);
        return await verifySaved(pending);
      }
      return false;
    } finally { inFlight.current = false; }
  };
  const reset = async () => {
    const refreshed = await query.refetch();
    if (refreshed.isSuccess) { setDraft(null); setSetupDraft(null); setConflict(false); setUnknownSave(null); setValidation(""); nonPmcModes.current.modes.clear(); setModeSelections({}); save.reset(); }
  };
  const requestRemoval = (entry: QuotationGroupDraft) => {
    if (!canEdit || inFlight.current) return;
    removalTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRemoval(entry);
  };
  const stageRemoval = () => {
    if (!removal || !canEdit) return;
    setDraft(previous => prunePendingQuotationRecommendations({ version: previous?.version ?? detail.estimateVersion!, items: previous?.items ?? {},
      groups: [...(previous?.groups ?? []).filter(entry => !quotationGroupContainsScope(removal.group, entry.group)), removal] }, rows));
    setRemoval(null); setNotice(""); setValidation(""); save.reset();
  };
  const renderGroupModes = (scope: { roomId: string; mainBasketId?: string; subBasketId?: string | null }, label: string,
    scopeLines: readonly QuotationLine[], group?: QuotationGroup) => {
    const selected = scopeLines.filter(included);
    if (!selected.length) return undefined;
    const key = quotationModeScopeKey(scope.roomId, scope.mainBasketId, scope.subBasketId);
    const items = selected.map(line => { const item = draft?.items[line.id] ?? draftItem(line);
      return { ...item, line: { ...item.line, source: line.source, choices: line.choices, pricingModeChoices: line.pricingModeChoices } }; });
    const selection = modeSelections[key];
    const value = selection && items.every(item => item.modeTier === selection.value) ? selection.value : "mode";
    const options = quotationGroupModeOptions(items);
    const comparison = quotationGroupComparison(items, detail.estimateVersion, scope, new Set(Object.keys(draft?.items ?? {})));
    return <EstimateSubBasketModes label={label} value={value} options={options} readOnly={readOnly || !detail.editingAllowed}
      disabled={!canEdit || Boolean(setupDraft)} comparison={comparison ? { target: { kind: "project", id: projectId }, input: comparison } : undefined}
      detailsDisabledReason={comparison ? undefined : "Current source details are unavailable for these items."}
      onChange={mode => {
        if (!canEdit || setupDraft || inFlight.current || mode !== "mode" && !options.some(option => option.tier === mode && option.available)) return;
        const affected = mode === "mode" && selection ? rows.filter(line => selection.originals[line.id] || selected.some(item => item.id === line.id)) : selected;
        const next = stageQuotationGroupMode(draft, affected, detail.estimateVersion!, mode, selection, group);
        setDraft(next.draft);
        setModeSelections(current => { const copy = { ...current }; if (next.selection) copy[key] = next.selection; else delete copy[key]; return copy; });
        setNotice(""); setValidation(""); save.reset();
      }} />;
  };
  const queryText = viewState.search.trim().toLocaleLowerCase();
  const matches = (line: QuotationLine) => !queryText || [line.mainLineName, line.mainBasketName, line.subBasketName, line.uomName].some(value => value?.toLocaleLowerCase().includes(queryText));
  const visibleBaskets = baskets.filter(basket => roomRows.some(line => line.mainBasketId === basket.id));
  const groups: EstimateShellBasket[] = visibleBaskets.filter(basket => viewState.basketFilter === "all" || basket.id === viewState.basketFilter).map(basket => {
    const scopedRows = roomRows.filter(line => line.mainBasketId === basket.id);
    const savedScope = rows.filter(line => line.roomId === currentRoomId && line.mainBasketId === basket.id);
    return { id: basket.id, name: basket.name, count: scopedRows.length, subtotalLabel: subtotal(savedScope),
      directLines: scopedRows.filter(line => line.subBasketId === null && matches(line)),
      directHeaderActions: renderGroupModes({ roomId: currentRoomId, mainBasketId: basket.id, subBasketId: null }, `Direct items in ${basket.name}, ${activeRoom?.name ?? "this room"}`,
        scopedRows.filter(line => line.subBasketId === null), detail.groups?.find(entry => entry.mainBasketId === basket.id && entry.subBasketId === null && entry.roomId === currentRoomId)), directSubtotalLabel: subtotal(savedScope.filter(line => line.subBasketId === null)),
      subBaskets: basket.subBaskets.map(sub => {
        const subRows = scopedRows.filter(line => line.subBasketId === sub.id);
        const group = detail.groups?.find(entry => entry.mainBasketId === basket.id && entry.subBasketId === sub.id && entry.roomId === currentRoomId);
        const queued = group && pendingGroups.some(entry => quotationGroupContainsScope(entry.group, group));
        return { id: sub.id, name: sub.name, count: subRows.length,
          headerActions: renderGroupModes({ roomId: currentRoomId, mainBasketId: basket.id, subBasketId: sub.id }, `${sub.name} in ${activeRoom?.name ?? "this room"}`, subRows, group), subtotalLabel: subtotal(savedScope.filter(line => line.subBasketId === sub.id)), lines: subRows.filter(matches),
          ...(!readOnly && detail.editingAllowed && group ? { removal: { label: `Remove visible items from ${sub.name} in ${activeRoom?.name ?? "this room"}`,
            disabled: !canEdit || Boolean(queued), onRemove: () => requestRemoval({ group, label: `${sub.name} in ${activeRoom?.name ?? "this room"}` }) } } : {}) };
      }).filter(sub => sub.lines.length > 0) };
  }).filter(basket => basket.directLines.length > 0 || basket.subBaskets.some(sub => sub.lines.length > 0));
  const renderLine = (id: string) => {
    const line = rows.find(row => row.id === id);
    if (!line) return null;
    const item = draft?.items[line.id] ?? draftItem(line);
    const unavailable = !line.source;
    const grouped = !unavailable && pendingGroups.some(({ group }) => quotationGroupContains(group, line));
    const selected = included(line);
    return <ClientQuotationLine item={item} currentLine={line} selected={selected} grouped={grouped}
      disabled={!canEdit} canChangePricingMode={canChangePricingMode} onTogglePmc={() => togglePmc(line, item)}
      onChange={update => change(line, update)} money={money} />;
  };
  const ungrouped = roomRows.filter(line => !line.mainBasketId || !baskets.some(basket => basket.id === line.mainBasketId)
    || line.subBasketId !== null && !baskets.some(basket => basket.id === line.mainBasketId && basket.subBaskets.some(sub => sub.id === line.subBasketId))).filter(matches);
  const ungroupedModes = renderGroupModes({ roomId: currentRoomId }, `Items in ${activeRoom?.name ?? "this room"}`,
    roomRows.filter(line => !line.mainBasketId || !baskets.some(basket => basket.id === line.mainBasketId)
      || line.subBasketId !== null && !baskets.some(basket => basket.id === line.mainBasketId && basket.subBaskets.some(sub => sub.id === line.subBasketId))));
  const changeView = (next: QuotationView) => {
    if (busy || unknownSave) return;
    if (setupDraft && next !== "configure") { void submit(next); return; }
    setView(next);
  };
  const builder = <EstimateBuilderShell selectedItemsOnly rooms={detail.rooms.map(room => ({ id: room.id, label: room.name,
      detail: subtotal(rows.filter(line => line.roomId === room.id)), hasSelectedItems: selectedRows.some(line => line.roomId === room.id) }))}
      activeRoomId={currentRoomId} onSelectRoom={id => { setActiveRoomId(id); setItemOffset(0); }} selectedCount={selectedRows.length}
      baskets={visibleBaskets.map(basket => ({ id: basket.id, name: basket.name, detail: subtotal(rows.filter(line => line.roomId === currentRoomId && line.mainBasketId === basket.id)) }))}
      groups={groups} renderLine={renderLine} viewState={viewState} onViewStateChange={setViewState} scrollMode={workspace ? "pane" : "document"}
      onRefresh={() => { void refreshQuotation(); if (candidateEnabled) { void candidates.refetch(); void setup.refetch(); } void client.invalidateQueries({ queryKey: ["quotation", projectId, "items"] }); void client.invalidateQueries({ queryKey: ["quotation", projectId, "recommendations"] }); }} refreshing={query.isFetching || Boolean(review?.refreshing)}
      beforeGroups={<><p className="client-quotation__hint">Client-visible items. Total includes internal scope.</p>
        {!readOnly && detail.editingAllowed ? <>
          <EstimateItemPicker roomName={activeRoom?.name ?? "this room"} open={adding} onOpenChange={setAdding} triggerRef={triggerRef}
            items={(!pickerHierarchyReady || candidates.isError ? [] : candidates.data?.items ?? []).map(candidate => {
              const existing = rows.find(line => line.roomId === currentRoomId && line.mainLineId === candidate.mainLineId);
              return { id: candidate.mainLineId, name: candidate.name, context: [candidate.mainBasketName, candidate.subBasketName].filter(Boolean).join(" · "),
                selected: Boolean(existing && included(existing)), disabled: Boolean(existing && !existing.source) || !quotationCandidateHasAvailableChoice(candidate, canChangePricingMode),
                ...(!existing?.source && existing ? { message: "Your team must review this saved item's current Configuration." } : {}) };
            })} total={!pickerHierarchyReady || candidates.isError ? 0 : candidates.data?.total ?? 0} offset={itemOffset} onOffsetChange={setItemOffset}
            search={itemSearch} onSearchChange={value => { setItemSearch(value); setItemOffset(0); }} baskets={pickerHierarchyReady ? setup.data?.baskets ?? [] : []}
            basketId={itemBasketId} onBasketChange={value => { setItemBasketId(value); setItemSubBasketId("all"); setItemOffset(0); }}
            subBasketId={itemSubBasketId} onSubBasketChange={value => { setItemSubBasketId(value); setItemOffset(0); }}
            state={stale ? "stale" : candidates.isError || setup.isError ? "error" : candidates.isPending || candidates.isFetching || setup.isPending || setup.isFetching ? "loading" : !setupCurrent ? "stale" : "ready"}
            disabled={!canEdit || !currentRoomId || Boolean(setupDraft)} onRetry={() => { void refreshQuotation(); void setup.refetch(); void candidates.refetch(); }}
            onAdd={id => { const candidate = candidates.data?.items.find(item => item.mainLineId === id); return candidate && pickerReady ? addCandidate(candidate) : false; }} />
          <ClientQuotationRecommendations projectId={projectId} detail={detail} roomId={currentRoomId} roomName={activeRoom?.name ?? "this room"}
            rows={selectedRows} disabled={!canEdit || Boolean(setupDraft)} sessionKey={sessionKey}
            onAdd={addCandidate} onRemove={id => { const line = selectedRows.find(item => item.roomId === currentRoomId && item.mainLineId === id); if (!line || !line.source || !canEdit) return false; change(line, { included: false }, false); return true; }}
            canConfigure={canConfigure} onConfigure={() => { if (!canConfigure || !canEdit) return false; if (dirty) void submit("configure"); else changeView("configure"); return true; }} />
        </> : null}</>}
      afterGroups={ungrouped.length ? <section aria-label="Saved items" className="client-quotation__ungrouped"><h3>Saved items</h3>{ungroupedModes}{ungrouped.map(line => <div key={line.id}>{renderLine(line.id)}</div>)}</section> : null}
      emptyMessage={!groups.length && !ungrouped.length ? queryText ? "No selected items match your search." : "No items selected in this room." : undefined} />;
  if (view === "review") {
    if (!publishedEstimate?.publishedReview || review?.error) return <section className="client-quotation" aria-label="Submitted estimate"><h2>Submitted estimate unavailable</h2>
      <p role="alert">{review?.error ?? "The submitted version could not be verified. Refresh before reviewing or making a decision."}</p>
      <div className="client-quotation__actions"><Button variant="secondary" onClick={() => setView("builder")}>Back to estimate</Button><Button disabled={query.isFetching || review?.refreshing} onClick={() => void refreshReview()}>Refresh estimate</Button></div></section>;
    return <ClientQuotationSubmittedView key={`${publishedEstimate.publishedReview.id}:${publishedEstimate.publishedReview.version}`} estimate={publishedEstimate}
      workspace={workspace} projectNumber={detail.projectNumber} canDecide={canDecide} refreshing={query.isFetching || Boolean(review?.refreshing)}
      onEdit={() => setView("builder")} onRefresh={refreshReview} />;
  }
  const approvalMessage = review ? dirty || unknownSave ? "Save or discard your quotation changes before reviewing a submitted version."
    : review.error ?? (review.loading ? "Checking submitted estimate…"
      : detail.reviewState === "awaiting_staff_review" ? `Waiting for ${detail.phase === "pre" ? "Sales" : "Designer"} confirmation. Your saved changes must be confirmed before you can approve the revised estimate.`
      : canDecide ? detail.phase === "pre" ? "Ready for your pre-design approval." : "Ready for your revised quotation approval."
      : quotationReviewCopy(detail)) : null;
  const currentApprovalState = currentQuotationApprovalState(detail);
  const revisedQuotation = detail.phase === "post" && ["revision_draft", "revision_pending_client", "revision_changes_requested", "revision_current"].includes(currentApprovalState);
  const recoveryActions = unknownSave ? <><Button busy={verifying} disabled={save.isPending} onClick={() => void verifySaved()}>Verify saved changes</Button><Button variant="secondary" disabled={busy || query.isFetching} onClick={() => void reset()}>Load latest quotation and discard changes</Button></>
    : stale ? <Button disabled={busy || query.isFetching} onClick={() => void reset()}>Load latest quotation and discard changes</Button>
    : setupSourceChanged ? <Button disabled={busy || query.isFetching} onClick={() => void reset()}>Load latest quotation and discard setup changes</Button>
    : query.isError ? <Button disabled={query.isFetching || busy} onClick={() => void refreshQuotation()}>Refresh quotation</Button>
    : revision.isError ? <Button disabled={busy} onClick={() => void revision.refetch()}>Retry updates</Button>
    : review?.error ? <Button disabled={busy || review.refreshing} onClick={() => void refreshReview()}>Refresh submitted estimate</Button> : null;
  return <section className={`client-quotation estimate-workspace estimator-dashboard ${view === "configure" ? "estimate-workspace--configure-view" : "estimate-workspace--item-view"}${view === "builder" ? " estimate-workspace--compact-builder" : ""}${workspace ? " client-quotation--workspace" : ""}`} aria-labelledby={`quotation-${projectId}`} ref={sectionRef} tabIndex={-1}>
    <header className="client-quotation__header"><div className="client-quotation__identity"><h2 id={`quotation-${projectId}`} className={workspace ? "sr-only" : undefined}>{revisedQuotation ? "Designer-revised quotation" : "Your quotation"}</h2><p>{detail.phase === "pre" ? "Pre-design approval" : currentApprovalState === "initial_current" ? "Initial approval current" : currentApprovalState === "source_issue" ? "Approval status unavailable" : "Revised quotation approval"}</p>{workspace ? <ProjectId projectNumber={detail.projectNumber} /> : null}</div>
      <dl>{!detail.isIncomplete && detail.roundOffPaise !== undefined && detail.roundOffPaise !== 0 ? <><dt>Round off</dt><dd>{detail.roundOffPaise < 0 ? "−" : "+"}{money(Math.abs(detail.roundOffPaise))}</dd></> : null}<dt>Saved total including GST</dt><dd>{detail.isIncomplete ? "Incomplete" : money(detail.totalPaise)}</dd></dl></header>
    <p className="client-quotation__review-status" role="status">{approvalMessage ?? (notice || quotationReviewCopy(detail))}</p>
    {readOnly ? <p>Read-only estimation preview.</p> : null}
    {!detail.editingAllowed && detail.reviewState !== "approved" ? <p>{detail.editingBlockReason === "not_started" ? "Your team has not started the quotation yet." : "Editing is unavailable for the current review stage."}</p> : null}
    <div className="client-quotation__navigation">
      <nav aria-label="Estimate views"><Button variant="quiet" aria-pressed={view === "builder"} disabled={busy || Boolean(unknownSave)} onClick={() => changeView("builder")}>{setupDraft ? "Save and view items" : "Items"}</Button><Button variant="quiet" aria-pressed={view === "summary"} disabled={busy || Boolean(unknownSave)} onClick={() => changeView("summary")}>{setupDraft ? "Save and view summary" : "Summary"}</Button></nav>
      {view !== "configure" && view !== "baskets" || publishedEstimate?.publishedReview && !canDecide ? <ClientQuotationOptions context={view}>
        {view !== "baskets" && view !== "configure" ? <Button variant="quiet" title={canConfigure ? "Property type, rooms and Main Baskets" : undefined} disabled={busy || Boolean(unknownSave) || dirty && !canEdit} onClick={() => { const next = canConfigure ? "configure" : "baskets"; if (dirty) void submit(next); else changeView(next); }}>{canConfigure ? dirty ? "Save and configure estimate" : "Configure estimate" : dirty ? "Save and edit baskets" : readOnly || !detail.editingAllowed ? "View baskets" : "Edit baskets"}</Button> : null}
        {publishedEstimate?.publishedReview && !canDecide ? <Button variant="quiet" disabled={!canOpenReview} busy={openingReview} onClick={() => void openReview()}>View submitted version</Button> : null}
      </ClientQuotationOptions> : null}
    </div>
    {!readOnly && detail.editingAllowed && !detail.setup ? <p role="status">Property type, rooms and Main Baskets are unavailable. Refresh to check for these setup options. <Button variant="secondary" disabled={query.isFetching || busy || Boolean(unknownSave)} onClick={() => void refreshQuotation()}>Refresh estimate setup</Button></p> : null}
    {revision.isError ? <p role="alert">Updates could not be checked. Your changes are preserved.</p> : null}
    {query.isError ? <p role="alert">The saved quotation could not be refreshed. Your local edits are preserved. Refresh before saving.</p> : null}
    {stale ? <p role="alert">The quotation changed elsewhere. Your unsaved changes are preserved. Review them before loading the latest quotation.</p> : null}
    {unknownSave ? <p role="alert">The save response could not be verified. Your changes are preserved. Verify the saved quotation before continuing.</p> : null}
    {save.isError && !unknownSave ? <p role="alert">{save.error instanceof ApiError ? save.error.message : "Your changes could not be saved. Try again."}</p> : null}
    {validation ? <p role="alert">{validation}</p> : null}
    {pendingGroups.length ? <div className="client-quotation__removals" aria-label="Pending basket removals">{pendingGroups.map(entry => <p key={entry.group.sourceToken}>Visible items in {entry.label} will be removed when you save. <Button variant="quiet" disabled={!canEdit} onClick={() => setDraft(previous => {
      if (!previous) return null;
      const groups = previous.groups.filter(group => group !== entry);
      return groups.length || Object.keys(previous.items).length ? { ...previous, groups } : null;
    })}>Undo removal of {entry.label}</Button></p>)}</div> : null}
    {view === "configure" ? <ClientQuotationSetup detail={detail} catalogue={setupCurrent ? setup.data : undefined}
      value={setupDraft?.operation ?? null} disabled={!canEdit || !canConfigure || !setupAvailable} busy={busy}
      loading={setup.isPending} refreshing={setup.isFetching} catalogueError={setup.isError ? "Available setup could not be loaded. Your changes are preserved; retry before continuing." : setupSourceChanged ? "Configuration changed. Load the latest quotation and discard setup changes before continuing." : !setupCurrent && !setup.isPending && !setup.isFetching ? "Setup changed elsewhere. Refresh the saved quotation and available setup before continuing." : null}
      onRefresh={() => { void refreshQuotation(); void setup.refetch(); }}
      recoveryActions={recoveryActions}
      onChange={operation => { if (!canEdit || !setupAvailable || inFlight.current) return; setSetupDraft({ version: detail.estimateVersion!, operation }); setValidation(""); setNotice(""); save.reset(); }}
      onSave={next => { void submit(next ? "builder" : undefined); }}
      onCancel={() => { if (inFlight.current || busy || unknownSave) return; setSetupDraft(null); setValidation(""); save.reset(); setView("builder"); }} /> : null}
    {view === "baskets" ? <section className="client-quotation__baskets" aria-labelledby={`quotation-baskets-${projectId}`}><h3 id={`quotation-baskets-${projectId}`}>Main Baskets</h3><p>These baskets are configured for your project. Choose a room in item selection to review its visible items.</p>
      {baskets.map(basket => {
        const group = detail.groups?.find(entry => entry.mainBasketId === basket.id && entry.subBasketId === null && entry.roomId === null);
        const queued = group && pendingGroups.some(entry => quotationGroupContainsScope(entry.group, group));
        return <article key={basket.id} className="client-quotation__basket"><div><h4>{basket.name}</h4><p>{selectedRows.filter(line => line.mainBasketId === basket.id).length} visible items selected</p></div><div className="client-quotation__actions">
          <Button variant="secondary" disabled={busy} onClick={() => { setViewState(current => ({ ...current, basketFilter: basket.id, railView: "section", search: "" })); changeView("builder"); }}>Choose items in {basket.name}</Button>
          {!readOnly && detail.editingAllowed && group ? <Button variant="quiet" disabled={!canEdit || Boolean(queued)} onClick={() => requestRemoval({ group, label: `${basket.name} across all rooms` })}>Remove visible items from {basket.name}</Button> : null}
        </div></article>;
      })}{!baskets.length ? <p>No basket information is currently available. Your saved items remain available in item selection.</p> : null}</section> : null}
    {view === "builder" ? workspace ? <EstimateBuilderArea className="client-quotation__builder">{builder}</EstimateBuilderArea> : <div className="client-quotation__builder client-quotation__builder--embedded">{builder}</div> : null}
    {view === "summary" ? <section className="client-quotation__summary" aria-label="Estimate summary"><h3>Estimate summary</h3><p>Visible subtotals use saved amounts before GST. The overall total may include internal scope.</p>{detail.rooms.map(room => <div key={room.id}><strong>{room.name}</strong><span>{subtotal(rows.filter(line => line.roomId === room.id))}</span></div>)}</section> : null}
    {view !== "configure" && (dirty || recoveryActions || canDecide || openingReview) ? <footer className="estimate-workspace__footer client-quotation__footer" aria-label="Estimate actions">
      {dirty ? <p className="client-quotation__hint">Changes are not saved yet. Saved amounts and totals update after your changes are priced.</p> : null}
      <div className="client-quotation__actions">
        {recoveryActions ?? (dirty ? <><Button variant="secondary" disabled={busy} onClick={() => { setDraft(null); setSetupDraft(null); setConflict(false); setValidation(""); nonPmcModes.current.modes.clear(); setModeSelections({}); save.reset(); }}>Discard changes</Button><Button disabled={!canEdit} busy={save.isPending} onClick={() => void submit()}>Save changes</Button></>
          : canDecide || openingReview ? <Button disabled={!canOpenReview} busy={openingReview} onClick={() => void openReview()}>Review quotation</Button> : null)}
      </div>
    </footer> : null}
    {removal ? <Dialog title={`Remove visible items from ${removal.label}?`} eyebrow="Estimation" description="This removes the visible items in this scope from your estimate when you save. Other items and Configuration are kept."
      onClose={() => setRemoval(null)} returnFocusRef={removalTriggerRef} fallbackFocusRef={sectionRef}><div className="ui-dialog__body"><p>{removal.group.includedCount} saved visible items are in this scope, including any hidden by search or collapsed sections.</p></div><div className="ui-dialog__actions"><Button variant="secondary" onClick={() => setRemoval(null)}>Cancel</Button><Button disabled={!canEdit} onClick={stageRemoval}>Remove visible items</Button></div></Dialog> : null}
    <EstimateNavigationGuard key="quotation-navigation-guard" dirty={dirty || Boolean(unknownSave)} busy={busy} saveDisabled={!canEdit || Boolean(setupDraft && (!setupAvailable || setupProblem))} onSave={() => submit()} />
  </section>;
}


function ClientQuotationRecommendations({ projectId, detail, roomId, roomName, rows, disabled, sessionKey,
  onAdd, onRemove, canConfigure, onConfigure }: {
  projectId: string; detail: QuotationDetail; roomId: string; roomName: string; rows: readonly QuotationLine[];
  disabled: boolean; sessionKey?: string; onAdd: (candidate: QuotationCandidate, origins: string[]) => boolean;
  onRemove: (mainLineId: string) => boolean; canConfigure: boolean; onConfigure: () => boolean;
}) {
  const [offset, setOffset] = useState(0);
  const sources = [...new Map(rows.filter(line => line.roomId === roomId && line.source).map(line =>
    [line.mainLineId, { mainLineId: line.mainLineId, source: line.source! }] as const)).values()]
    .sort((a, b) => a.mainLineId.localeCompare(b.mainLineId));
  const sourceKey = JSON.stringify(sources);
  const contextKey = JSON.stringify([projectId, detail.estimateId, detail.estimateVersion, roomId, sourceKey, sessionKey]);
  const [pageContext, setPageContext] = useState(contextKey);
  const currentOffset = pageContext === contextKey ? offset : 0;
  const input = { expectedVersion: detail.estimateVersion!, roomId, sources, limit: 20, offset: currentOffset };
  const valid = Boolean(detail.estimateVersion && roomId && sources.length && sources.length <= 200);
  const query = useQuery({ queryKey: quotationKeys.recommendations(projectId, input, sessionKey),
    queryFn: () => getQuotationRecommendations(projectId, input), enabled: valid && !disabled, retry: false });
  useEffect(() => {
    if (!query.isSuccess || query.isFetching || query.data.projectId !== projectId || query.data.estimateId !== detail.estimateId ||
      query.data.estimateVersion !== detail.estimateVersion || query.data.roomId !== roomId) return;
    if (currentOffset >= query.data.total && currentOffset > 0) {
      setPageContext(contextKey); setOffset(Math.max(0, Math.floor((query.data.total - 1) / 20) * 20));
    }
  }, [query.data, query.isSuccess, query.isFetching, projectId, detail.estimateId, detail.estimateVersion, roomId, currentOffset, contextKey]);
  if (!sources.length || !roomId) return null;
  const response = query.data;
  const responseMatches = Boolean(response && response.projectId === projectId && response.estimateId === detail.estimateId &&
    response.estimateVersion === detail.estimateVersion && response.roomId === roomId);
  const unavailable = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const stale = query.error instanceof ApiError && query.error.status === 409 || Boolean(response && !responseMatches);
  const state = sources.length > 200 ? "error" : unavailable ? "forbidden" : stale ? "stale" : query.isError ? "error"
    : query.isPending || query.isFetching ? "loading" : "ready";
  const recommendations = state === "ready" && responseMatches ? response!.items : [];
  const selected = new Map(rows.filter(line => line.roomId === roomId).map(line => [line.mainLineId, line]));
  return <EstimateRecommendations roomName={roomName} contextKey={contextKey} state={state} disabled={disabled}
    total={state === "ready" && responseMatches ? response!.total : 0} offset={currentOffset}
    onOffsetChange={value => { setPageContext(contextKey); setOffset(value); }}
    message={sources.length > 200 ? "Recommendations support up to 200 selected source items in a room. Your estimate selections are preserved." : undefined}
    onRetry={sources.length <= 200 ? () => void query.refetch() : undefined}
    items={recommendations.map(recommendation => {
      const saved = selected.get(recommendation.candidate.mainLineId);
      const available = quotationCandidateHasAvailableChoice(recommendation.candidate, detail.canChangePricingMode === true);
      return { id: recommendation.candidate.mainLineId, name: recommendation.candidate.name,
        sourceNames: recommendation.sourceMainLines.map(source => source.name), selected: Boolean(saved),
        disabled: saved ? !saved.source : !available || recommendation.requiresSetup && !canConfigure,
        ...(!saved && !available ? { message: "No configured option is currently available. Your team needs to review this item." }
          : recommendation.requiresSetup && !saved ? { addLabel: "Configure basket",
          message: canConfigure ? `Select ${recommendation.candidate.mainBasketName ?? "the required Main Basket"} in Configure estimate, save setup, then add this item.`
            : `Your team must add ${recommendation.candidate.mainBasketName ?? "the required Main Basket"} to the estimate before you can select this item.` } : {}) };
    })}
    onAdd={id => {
      if (disabled || state !== "ready") return false;
      const recommendation = recommendations.find(item => item.candidate.mainLineId === id);
      if (!recommendation) return false;
      return recommendation.requiresSetup ? onConfigure() : onAdd(recommendation.candidate, recommendation.sourceMainLines.map(source => source.mainLineId));
    }} onRemove={id => !disabled && state === "ready" ? onRemove(id) : false} />;
}

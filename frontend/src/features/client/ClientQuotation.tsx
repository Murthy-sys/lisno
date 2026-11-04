import { ProjectId } from "../../components/projects/ProjectId";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { KNOWLEDGE_MODE_TIER_LABELS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { EstimateDimensionsFields } from "../leads/EstimateDimensionsFields";
import { createConfiguredEstimateViewState } from "../leads/useConfiguredEstimateViewState";
import { EstimateBuilderShell, type EstimateShellBasket } from "../estimates/EstimateBuilderShell";
import { EstimateBuilderArea } from "../estimates/EstimateBuilderArea";
import { EstimateNavigationGuard } from "../estimates/EstimateNavigationGuard";
import { ClientQuotationSetup } from "./ClientQuotationSetup";
import { ClientQuotationLine } from "./ClientQuotationLine";
import { quotationCandidateRows } from "./clientQuotationCandidates";
import { ESTIMATE_PROPERTY_TYPES, requiresBedroomCount, isValidBedroomCount } from "../../../../shared/estimation/estimateRoomOptions";
import { ClientQuotationSubmittedView } from "./ClientQuotationSubmittedView";
import { canReviewCurrentQuotation, type ClientQuotationReviewState } from "./clientQuotationReview";
import { refreshEstimateCollaboration } from "../leads/estimateCollaborationQueries";
import { useQuotationRevision } from "../leads/useQuotationRevision";
import { estimateTiersKeys, getEstimateTiers } from "./estimateTiersApi";
import { getQuotation, getQuotationSetup, getQuotationCandidates, quotationKeys, saveQuotation, type QuotationCandidate, type QuotationConfigureOperation, type QuotationDetail, type QuotationLine, type QuotationOperation } from "./quotationApi";
import { draftQuotationItem as draftItem, quotationItemOperation as operationFor, quotationDraftOperations, quotationGroupContains,
  quotationGroupContainsScope, quotationSaveIsConfirmed, type QuotationItemDraft as ItemDraft, type QuotationDraft, type QuotationGroupDraft } from "./clientQuotationDraft";
import "../../styles/estimator-dashboard.css";
import "./clientQuotation.css";

const money = (paise: number | null) => paise == null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const reviewCopy: Record<QuotationDetail["reviewState"], string> = {
  draft: "Your team is preparing this quotation.",
  awaiting_staff_review: "Saved changes. Your team will review and send the updated quotation for approval.",
  ready_for_approval: "Ready for your approval. Saving changes will send the revised quotation back to your team for review.",
  approved: "Estimation complete. The quotation is locked."
};
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
  const [setupDraft, setSetupDraft] = useState<{ version: number; operation: QuotationConfigureOperation } | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState("");
  const [conflict, setConflict] = useState(false);
  const [unknownSave, setUnknownSave] = useState<PendingSave | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [openingReview, setOpeningReview] = useState(false);
  const [view, setView] = useState<QuotationView>("builder");
  const setup = useQuery({ queryKey: quotationKeys.setup(projectId), queryFn: () => getQuotationSetup(projectId),
    enabled: view === "configure" && !readOnly && Boolean(query.data?.setup), retry: false, staleTime: 0 });
  const candidateEnabled = view === "builder" && !readOnly && Boolean(query.data?.setup) && Boolean(query.data?.editingAllowed) &&
    query.data?.projectId === projectId && !query.isError;
  const candidates = useInfiniteQuery({ queryKey: quotationKeys.candidates(projectId, query.data?.estimateVersion ?? null),
    queryFn: ({ pageParam }) => getQuotationCandidates(projectId, "", pageParam), initialPageParam: 0,
    getNextPageParam: page => page.items.length > 0 && page.offset + page.items.length < page.total ? page.offset + page.items.length : undefined,
    enabled: candidateEnabled, retry: false });
  const [activeRoomId, setActiveRoomId] = useState("");
  const [viewState, setViewState] = useState(createConfiguredEstimateViewState);
  const [removal, setRemoval] = useState<QuotationGroupDraft | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const removalTriggerRef = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const inFlight = useRef(false);
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === "review" && view !== "review") {
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

  const accessDenied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const notStarted = !dirty && !unknownSave && !query.isFetching && (
    query.isSuccess && query.data.projectId === projectId && query.data.estimateId === null && query.data.editingBlockReason === "not_started"
    || probeNotStarted && tiers.isSuccess && !tiers.isFetching && tiers.isFetchedAfterMount && tiers.dataUpdatedAt >= query.errorUpdatedAt
      && tiers.data.projectId === projectId && tiers.data.estimateId === null && tiers.data.editingBlockReason === "not_started");
  const refreshQuotation = async () => {
    const refreshed = await query.refetch();
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
  const setupCurrent = setup.data?.projectId === projectId && setup.data.estimateId === detail.estimateId && setup.data.estimateVersion === detail.estimateVersion;
  const setupSourceChanged = Boolean(setupDraft && setupCurrent && setup.data?.setup.sourceToken !== setupDraft.operation.sourceToken);
  const canConfigure = !readOnly && detail.editingAllowed && Boolean(detail.setup?.canConfigure);
  const setupAvailable = setupCurrent && !setup.isError && !setup.isFetching && Boolean(setup.data?.setup.canConfigure) && !setupSourceChanged;
  const setupProblem = setupDraft && (
    !ESTIMATE_PROPERTY_TYPES.some(type => type === setupDraft.operation.propertyType) && setupDraft.operation.propertyType !== detail.setup?.propertyType ? "Select an available property type."
    : requiresBedroomCount(setupDraft.operation.propertyType) && !isValidBedroomCount(setupDraft.operation.bedroomCount) ? "Enter a valid number of bedrooms."
    : setupDraft.operation.rooms.some(room => [room.length, room.width].some(value => value !== null && (!Number.isFinite(value) || value <= 0 || value > 1000000))) ? "Enter positive room dimensions." : null);
  const publishedEstimate = review?.estimate?.id === detail.estimateId && review.estimate.projectId === projectId && !review.estimate.reviewSourceIssue
    ? review.estimate : null;
  const canDecide = !readOnly && !dirty && !busy && !unknownSave && !stale && !query.isError && !query.isFetching &&
    !revision.isError && !review?.error && !review?.loading && !review?.refreshing && canReviewCurrentQuotation(detail, publishedEstimate, revision.data);
  const canOpenReview = !readOnly && Boolean(publishedEstimate?.publishedReview) && !dirty && !busy && !unknownSave && !stale &&
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
  const changedItems = Object.values(draft?.items ?? {});
  const addedItems = changedItems.filter(item => item.kind === "add");
  const pendingGroups = draft?.groups ?? [];
  const savedRows = [...new Map([...detail.lines, ...(detail.excludedLines ?? []), ...addedItems.map(item => item.line)].map(line => [line.id, line])).values()];
  const activeRoom = detail.rooms.find(room => room.id === activeRoomId) ?? detail.rooms[0];
  const availableRows = quotationCandidateRows(candidateEnabled && !candidates.isError ? candidates.data?.pages.flatMap(page => page.items) ?? [] : [], activeRoom, savedRows);
  const candidateIds = new Set(availableRows.map(line => line.id));
  const rows = [...savedRows, ...availableRows];
  const included = (line: QuotationLine) => !(line.source && pendingGroups.some(({ group }) => quotationGroupContains(group, line))) && (draft?.items[line.id]?.included ?? line.included);
  const currentRoomId = activeRoom?.id ?? "";
  const selectedRows = rows.filter(included);
  const roomRows = rows.filter(line => line.roomId === currentRoomId && (viewState.railView !== "selected" || included(line)));
  const baskets = detail.baskets ?? [...new Map(rows.flatMap(line => line.mainBasketId && line.mainBasketName
    ? [[line.mainBasketId, { id: line.mainBasketId, name: line.mainBasketName, subBaskets: rows.filter(row => row.mainBasketId === line.mainBasketId && row.subBasketId && row.subBasketName)
      .map(row => ({ id: row.subBasketId!, name: row.subBasketName! })) }] as const] : [])).values()]
    .map(basket => ({ ...basket, subBaskets: [...new Map(basket.subBaskets.map(sub => [sub.id, sub])).values()] }));
  const subtotal = (lines: readonly QuotationLine[]) => {
    const saved = lines.filter(line => line.included && !addedItems.some(item => item.line.id === line.id));
    if (saved.some(line => line.amountPaise === null)) return "Visible subtotal unavailable";
    const total = saved.reduce((sum, line) => sum + line.amountPaise!, 0);
    return Number.isSafeInteger(total) ? `Saved visible subtotal ${money(total)}` : "Visible subtotal unavailable";
  };
  const change = (line: QuotationLine, update: Partial<ItemDraft>) => {
    if (!canEdit || setupDraft || candidateIds.has(line.id) && candidates.isFetching || !line.source || inFlight.current || pendingGroups.some(({ group }) => quotationGroupContains(group, line))) return;
    setNotice(""); setValidation(""); save.reset();
    setDraft(previous => ({ version: previous?.version ?? detail.estimateVersion!, groups: previous?.groups ?? [], items: {
      ...previous?.items, [line.id]: { ...(previous?.items[line.id] ?? draftItem(line, candidateIds.has(line.id) ? "add" : "update")), ...update }
    } }));
  };
  const add = (item: ItemDraft) => {
    if (!canEdit || inFlight.current) return;
    if (!item.line.source) { setValidation("This saved item is unavailable in the current Configuration. Ask your team to review it."); return; }
    if (pendingGroups.some(({ group }) => quotationGroupContains(group, item.line))) {
      setValidation("Undo this basket removal or save it before adding an item back."); setAdding(false); return;
    }
    setDraft(previous => ({ version: previous?.version ?? detail.estimateVersion!, groups: previous?.groups ?? [], items: { ...previous?.items, [item.line.id]: item } }));
    setActiveRoomId(item.line.roomId); setViewState(current => ({ ...current, railView: "section", search: "", basketFilter: "all" }));
    setAdding(false); setNotice(""); setValidation("");
  };
  const acceptSaved = async (saved: QuotationDetail, destination?: QuotationView) => {
    client.setQueryData<QuotationDetail>(quotationKeys.detail(projectId), current => (current?.estimateVersion ?? -1) > (saved.estimateVersion ?? -1) ? current : saved);
    setDraft(null); setSetupDraft(null); setConflict(false); setUnknownSave(null); setValidation("");
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
    if (addedItems.some(item => item.included) && detail.setup && (candidates.isError || candidates.isFetching)) {
      setValidation("Refresh available items before saving your selections."); return false;
    }
    let operations: QuotationOperation[];
    try {
      if (changedItems.some(item => item.kind === "update" && rows.some(line => line.id === item.line.id && !line.source))) {
        throw new Error("A changed item is unavailable in the current Configuration. Your changes are preserved; ask your team to review it before saving.");
      }
      operations = setupDraft ? [setupDraft.operation] : draft ? quotationDraftOperations(draft) : [];
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
    if (refreshed.isSuccess) { setDraft(null); setSetupDraft(null); setConflict(false); setUnknownSave(null); setValidation(""); save.reset(); }
  };
  const requestRemoval = (entry: QuotationGroupDraft) => {
    if (!canEdit || inFlight.current) return;
    removalTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRemoval(entry);
  };
  const stageRemoval = () => {
    if (!removal || !canEdit) return;
    setDraft(previous => ({ version: previous?.version ?? detail.estimateVersion!, items: previous?.items ?? {},
      groups: [...(previous?.groups ?? []).filter(entry => !quotationGroupContainsScope(removal.group, entry.group)), removal] }));
    setRemoval(null); setNotice(""); setValidation(""); save.reset();
  };
  const queryText = viewState.search.trim().toLocaleLowerCase();
  const matches = (line: QuotationLine) => !queryText || [line.mainLineName, line.mainBasketName, line.subBasketName, line.uomName].some(value => value?.toLocaleLowerCase().includes(queryText));
  const visibleBaskets = baskets.filter(basket => viewState.railView !== "selected" || roomRows.some(line => line.mainBasketId === basket.id));
  const groups: EstimateShellBasket[] = visibleBaskets.filter(basket => viewState.basketFilter === "all" || basket.id === viewState.basketFilter).map(basket => {
    const scopedRows = roomRows.filter(line => line.mainBasketId === basket.id);
    const savedScope = rows.filter(line => line.roomId === currentRoomId && line.mainBasketId === basket.id);
    return { id: basket.id, name: basket.name, count: scopedRows.length, subtotalLabel: subtotal(savedScope),
      directLines: scopedRows.filter(line => line.subBasketId === null && matches(line)), directSubtotalLabel: subtotal(savedScope.filter(line => line.subBasketId === null)),
      subBaskets: basket.subBaskets.map(sub => {
        const subRows = scopedRows.filter(line => line.subBasketId === sub.id);
        const group = detail.groups?.find(entry => entry.mainBasketId === basket.id && entry.subBasketId === sub.id && entry.roomId === currentRoomId);
        const queued = group && pendingGroups.some(entry => quotationGroupContainsScope(entry.group, group));
        return { id: sub.id, name: sub.name, count: subRows.length, subtotalLabel: subtotal(savedScope.filter(line => line.subBasketId === sub.id)), lines: subRows.filter(matches),
          ...(!readOnly && detail.editingAllowed && group ? { removal: { label: `Remove visible items from ${sub.name} in ${activeRoom?.name ?? "this room"}`,
            disabled: !canEdit || Boolean(queued), onRemove: () => requestRemoval({ group, label: `${sub.name} in ${activeRoom?.name ?? "this room"}` }) } } : {}) };
      }).filter(sub => !queryText || sub.lines.length > 0) };
  }).filter(basket => !queryText || basket.directLines.length > 0 || basket.subBaskets.some(sub => sub.lines.length > 0));
  const renderLine = (id: string) => {
    const line = rows.find(row => row.id === id);
    if (!line) return null;
    const item = draft?.items[line.id] ?? draftItem(line, candidateIds.has(line.id) ? "add" : "update");
    const unavailable = !line.source;
    const grouped = !unavailable && pendingGroups.some(({ group }) => quotationGroupContains(group, line));
    const selected = included(line);
    return <ClientQuotationLine item={item} currentLine={line} selected={selected} grouped={grouped}
      disabled={!canEdit || candidateIds.has(line.id) && candidates.isFetching} onChange={update => change(line, update)} money={money} />;
  };
  const ungrouped = roomRows.filter(line => !line.mainBasketId || !baskets.some(basket => basket.id === line.mainBasketId)
    || line.subBasketId !== null && !baskets.some(basket => basket.id === line.mainBasketId && basket.subBaskets.some(sub => sub.id === line.subBasketId))).filter(matches);
  const changeView = (next: QuotationView) => {
    if (busy || unknownSave) return;
    if (setupDraft && next !== "configure") { void submit(next); return; }
    setView(next);
  };
  const builder = <EstimateBuilderShell rooms={detail.rooms.map(room => ({ id: room.id, label: room.name,
      detail: subtotal(rows.filter(line => line.roomId === room.id)), hasSelectedItems: selectedRows.some(line => line.roomId === room.id) }))}
      activeRoomId={currentRoomId} onSelectRoom={setActiveRoomId} selectedCount={selectedRows.length}
      baskets={visibleBaskets.map(basket => ({ id: basket.id, name: basket.name, detail: subtotal(rows.filter(line => line.roomId === currentRoomId && line.mainBasketId === basket.id)) }))}
      groups={groups} renderLine={renderLine} viewState={viewState} onViewStateChange={setViewState} scrollMode={workspace ? "pane" : "document"}
      onRefresh={() => { void query.refetch(); if (candidateEnabled) void candidates.refetch(); void client.invalidateQueries({ queryKey: ["quotation", projectId, "items"] }); }} refreshing={query.isFetching || candidateEnabled && candidates.isFetching}
      beforeGroups={<><p className="client-quotation__hint">Client-visible items. Total includes internal scope.</p>
        {candidateEnabled && candidates.isPending ? <p role="status">Loading available Main Lines…</p> : null}
        {candidateEnabled && candidates.isError ? <p role="alert">Available Main Lines could not be refreshed. Saved selections are kept. <Button variant="secondary" onClick={() => void candidates.refetch()}>Retry available Main Lines</Button></p> : null}
        {candidateEnabled && candidates.hasNextPage ? <Button variant="secondary" disabled={candidates.isFetching || candidates.isError} onClick={() => void candidates.fetchNextPage()}>Load more Main Lines</Button> : null}</>}
      afterGroups={ungrouped.length ? <section aria-label="Saved items" className="client-quotation__ungrouped"><h3>Saved items</h3>{ungrouped.map(line => <div key={line.id}>{renderLine(line.id)}</div>)}</section> : null}
      emptyMessage={!groups.length && !ungrouped.length ? queryText ? "No items match your search." : "No items are currently available in this room. Use Add item to choose an available configured item." : undefined} />;
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
      : canDecide ? detail.phase === "pre" ? "Ready for your pre-design approval." : "Ready for your post-design approval."
      : reviewCopy[detail.reviewState]) : null;
  return <section className={`client-quotation estimate-workspace estimator-dashboard ${view === "configure" ? "estimate-workspace--configure-view" : "estimate-workspace--item-view"}${view === "builder" ? " estimate-workspace--compact-builder" : ""}${workspace ? " client-quotation--workspace" : ""}`} aria-labelledby={`quotation-${projectId}`} ref={sectionRef} tabIndex={-1}>
    <header className="client-quotation__header"><div className="client-quotation__identity"><h2 id={`quotation-${projectId}`} className={workspace ? "sr-only" : undefined}>{detail.phase === "post" ? "Designer-revised quotation" : "Your quotation"}</h2><p>{detail.phase === "pre" ? "Pre-design approval" : "Post-design approval"}</p>{workspace ? <ProjectId projectNumber={detail.projectNumber} /> : null}</div>
      <dl><dt>Saved total including GST</dt><dd>{detail.isIncomplete ? "Incomplete" : money(detail.totalPaise)}</dd></dl></header>
    <p className="client-quotation__review-status" role="status">{approvalMessage ?? (notice || reviewCopy[detail.reviewState])}</p>
    {readOnly ? <p>Read-only estimation. Your current assignment allows you to view this quotation.</p> : null}
    {!detail.editingAllowed && detail.reviewState !== "approved" ? <p>{detail.editingBlockReason === "not_started" ? "Your team has not started the quotation yet." : "Editing is unavailable for the current review stage."}</p> : null}
    <div className="client-quotation__navigation">
      {view !== "baskets" && view !== "configure" ? <Button variant="secondary" title={canConfigure ? "Property type, rooms and Main Baskets" : undefined} disabled={busy || Boolean(unknownSave) || dirty && !canEdit} onClick={() => { const next = canConfigure ? "configure" : "baskets"; if (dirty) void submit(next); else changeView(next); }}>{canConfigure ? dirty ? "Save and configure estimate" : "Configure estimate" : dirty ? "Save and edit baskets" : readOnly || !detail.editingAllowed ? "View baskets" : "Edit baskets"}</Button>
        : view === "baskets" ? <Button variant="secondary" disabled={busy} onClick={() => changeView("builder")}>Continue to item selection</Button> : null}
      <nav aria-label="Estimate views"><Button variant="quiet" aria-pressed={view === "builder"} disabled={busy} onClick={() => changeView("builder")}>Estimate Builder</Button><Button variant="quiet" aria-pressed={view === "summary"} disabled={busy} onClick={() => changeView("summary")}>Summary</Button></nav>
      {review && publishedEstimate?.publishedReview ? <Button disabled={!canOpenReview} busy={openingReview} onClick={() => void openReview()}>{canDecide ? detail.phase === "pre" ? "Review for pre-design approval" : "Review for post-design approval" : "View submitted version"}</Button> : null}
      {review?.error ? <Button variant="secondary" disabled={busy || review.refreshing} onClick={() => void refreshReview()}>Refresh submitted estimate</Button> : null}
    </div>
    {!readOnly && detail.editingAllowed && !detail.setup ? <p role="status">Property type, rooms and Main Baskets are unavailable. Refresh to check for these setup options. <Button variant="secondary" disabled={query.isFetching || busy || Boolean(unknownSave)} onClick={() => void refreshQuotation()}>Refresh estimate setup</Button></p> : null}
    {revision.isError ? <p role="alert">Updates could not be checked. Your changes are preserved. <Button variant="secondary" onClick={() => void revision.refetch()}>Retry updates</Button></p> : null}
    {query.isError ? <div role="alert"><p>The saved quotation could not be refreshed. Your local edits are preserved. Refresh before saving.</p><Button variant="secondary" disabled={query.isFetching || busy} onClick={() => void query.refetch()}>Refresh quotation</Button></div> : null}
    {stale ? <div role="alert"><p>The quotation changed elsewhere. Your unsaved changes are preserved. Review them before loading the latest quotation.</p><Button variant="secondary" disabled={busy || query.isFetching} onClick={() => void reset()}>Load latest quotation and discard changes</Button></div> : null}
    {unknownSave ? <div role="alert"><p>The save response could not be verified. Your changes are preserved. Verify the saved quotation before continuing.</p><Button variant="secondary" busy={verifying} disabled={save.isPending} onClick={() => void verifySaved()}>Verify saved changes</Button>{!stale ? <Button variant="secondary" disabled={busy || query.isFetching} onClick={() => void reset()}>Load latest quotation and discard changes</Button> : null}</div> : null}
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
      onRefresh={() => { void query.refetch(); void setup.refetch(); }}
      onChange={operation => { if (!canEdit || !setupAvailable || inFlight.current) return; setSetupDraft({ version: detail.estimateVersion!, operation }); setValidation(""); setNotice(""); save.reset(); }}
      onSave={next => { void submit(next ? "builder" : undefined); }}
      onCancel={() => { if (inFlight.current || busy || unknownSave) return; setSetupDraft(null); setValidation(""); save.reset(); setView("builder"); }} /> : null}
    {setupSourceChanged && setupDraft ? <Button variant="secondary" disabled={busy} onClick={() => void reset()}>Load latest quotation and discard setup changes</Button> : null}
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
    <footer className="estimate-workspace__footer client-quotation__footer"><div className="client-quotation__actions">
      {!readOnly && detail.editingAllowed && view !== "baskets" && view !== "configure" ? <Button ref={triggerRef} variant="secondary" disabled={!canEdit || !detail.rooms.length} onClick={() => setAdding(true)}>Add item</Button> : null}
      {dirty && view !== "configure" ? <><Button disabled={!canEdit} busy={save.isPending} onClick={() => void submit()}>Save changes</Button><Button variant="secondary" disabled={busy || Boolean(unknownSave)} onClick={() => { setDraft(null); setSetupDraft(null); setConflict(false); setValidation(""); save.reset(); }}>Discard changes</Button></> : null}
    </div>
    {dirty ? <p className="client-quotation__hint">Changes are not saved yet. Rates are set by Configuration. Saved amounts and totals update after the server prices your changes.</p> : null}
    </footer>
    {adding ? <AddQuotationItem projectId={projectId} rooms={detail.rooms} initialRoomId={currentRoomId}
      existing={savedRows.map(line => ({ ...line, included: included(line) }))} pendingItems={changedItems} disabled={!canEdit}
      onAdd={add} onClose={() => setAdding(false)} triggerRef={triggerRef} fallbackRef={sectionRef} /> : null}
    {removal ? <Dialog title={`Remove visible items from ${removal.label}?`} eyebrow="Estimation" description="This removes the visible items in this scope from your estimate when you save. Other items and Configuration are kept."
      onClose={() => setRemoval(null)} returnFocusRef={removalTriggerRef} fallbackFocusRef={sectionRef}><div className="ui-dialog__body"><p>{removal.group.includedCount} saved visible items are in this scope, including any hidden by search or collapsed sections.</p></div><div className="ui-dialog__actions"><Button variant="secondary" onClick={() => setRemoval(null)}>Cancel</Button><Button disabled={!canEdit} onClick={stageRemoval}>Remove visible items</Button></div></Dialog> : null}
    <EstimateNavigationGuard key="quotation-navigation-guard" dirty={dirty || Boolean(unknownSave)} busy={busy} saveDisabled={!canEdit || Boolean(setupDraft && (!setupAvailable || setupProblem))} onSave={() => submit()} />
  </section>;
}

function ItemFields({ item, disabled, onChange }: { item: ItemDraft; disabled: boolean; onChange: (update: Partial<ItemDraft>) => void }) {
  const line = item.line;
  const label = `${line.mainLineName} in ${line.roomName}`;
  const choice = line.choices.find(value => value.modeTier === item.modeTier);
  return <div className="client-quotation__fields">
    {line.dimensionsMandatory ? line.dimensionRule ? <EstimateDimensionsFields label={label} dimensions={item.dimensions} rule={line.dimensionRule} quantityUnit={line.uomName}
      disabled={disabled} onChange={dimensions => onChange({ dimensions })} /> : <p role="status">Dimensions are unavailable until your team reviews the configured unit.</p>
      : <label>Quantity ({line.uomName})<input aria-label={`Quantity for ${label} ${line.uomName}`} type="number" inputMode="decimal" min="0" step="any" value={item.quantity} disabled={disabled} onChange={event => onChange({ quantity: event.target.value })} /></label>}
    <label>Configured option<select aria-label={`Configured option for ${label}`} value={item.modeTier} disabled={disabled} onChange={event => onChange({ modeTier: event.target.value as KnowledgeModeTier, components: [] })}>
      {line.choices.map(option => <option key={option.modeTier} value={option.modeTier} disabled={!option.available || !option.source}>{KNOWLEDGE_MODE_TIER_LABELS[option.modeTier]}{option.available ? "" : " (unavailable)"}</option>)}
    </select></label>
    <p>Rate <strong>{choice?.inHouseComponents ? "Calculated from components" : money(choice?.ratePaise ?? null)}</strong>{!choice?.inHouseComponents && choice?.ratePaise != null ? ` / ${line.uomName}` : ""}</p>
    {choice?.inHouseComponents ? <fieldset className="client-quotation__components" disabled={disabled}><legend>Components for {label}</legend>{choice.inHouseComponents.map(component => <label key={component.id}>
      <input type="checkbox" checked={item.components.includes(component.id)} disabled={!component.available && !item.components.includes(component.id)} onChange={event => onChange({ components: event.target.checked ? [...item.components, component.id] : item.components.filter(id => id !== component.id) })} />{component.label}{!component.available ? " (unavailable)" : ""}
    </label>)}</fieldset> : null}
  </div>;
}

function AddQuotationItem({ projectId, rooms, initialRoomId, existing, pendingItems, disabled, onAdd, onClose, triggerRef, fallbackRef }: {
  projectId: string; rooms: QuotationDetail["rooms"]; initialRoomId: string; existing: QuotationLine[]; disabled: boolean;
  pendingItems: ItemDraft[];
  onAdd: (item: ItemDraft) => void; onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>; fallbackRef: React.RefObject<HTMLElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [roomId, setRoomId] = useState(initialRoomId || rooms[0]?.id || "");
  const [item, setItem] = useState<ItemDraft | null>(null);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const candidates = useQuery({ queryKey: quotationKeys.items(projectId, search, offset), queryFn: () => getQuotationCandidates(projectId, search, offset), retry: false });
  const choose = (candidate: QuotationCandidate) => {
    const room = rooms.find(value => value.id === roomId);
    if (!room) return;
    setError("");
    const pending = pendingItems.find(entry => entry.line.roomId === roomId && entry.line.mainLineId === candidate.mainLineId);
    if (pending) {
      setItem({ ...pending, included: true });
      return;
    }
    const saved = existing.find(line => line.roomId === roomId && line.mainLineId === candidate.mainLineId);
    if (saved && !saved.included) {
      // Saved choices belong to this room; candidate defaults may describe another room's pricing mode.
      setItem(draftItem({ ...saved, included: true }));
      return;
    }
    setItem(draftItem({ id: `new-${crypto.randomUUID()}`, mainLineId: candidate.mainLineId, mainLineName: candidate.name, roomId, roomName: room.name,
      mainBasketId: candidate.mainBasketId, mainBasketName: candidate.mainBasketName, subBasketId: candidate.subBasketId, subBasketName: candidate.subBasketName,
      included: true, source: candidate.source, dimensionsMandatory: candidate.dimensionsMandatory, dimensionRule: candidate.dimensionRule,
      uomName: candidate.uomName, choices: candidate.choices, pricingMode: candidate.pricingMode, modeTier: candidate.modeTier,
      ratePaise: null, amountPaise: null, quantity: 1 }, "add"));
  };
  const duplicate = Boolean(item && existing.some(line => line.roomId === roomId && line.mainLineId === item.line.mainLineId && line.included));
  return <Dialog title="Add quotation item" onClose={onClose} initialFocusRef={searchRef} returnFocusRef={triggerRef} fallbackFocusRef={fallbackRef}>
    <form className="ui-dialog__form" onSubmit={event => {
      event.preventDefault(); if (!item || disabled || duplicate) return;
      try { operationFor(item); onAdd(item); } catch (reason) { setError(reason instanceof Error ? reason.message : "Review the selected item."); }
    }}><div className="ui-dialog__body client-quotation__add">
      <label>Room<select value={roomId} onChange={event => { setRoomId(event.target.value); setItem(null); setError(""); }}>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
      <label>Search items<input ref={searchRef} type="search" value={search} onChange={event => { setSearch(event.target.value); setOffset(0); }} /></label>
      {candidates.isPending ? <p role="status">Loading items…</p> : candidates.isError ? <p role="alert">Items could not be loaded. <Button variant="secondary" onClick={() => void candidates.refetch()}>Retry items</Button></p> : <>
        <label>Item<select value={item && candidates.data.items.some(candidate => candidate.mainLineId === item.line.mainLineId) ? item.line.mainLineId : ""} onChange={event => { const candidate = candidates.data.items.find(value => value.mainLineId === event.target.value); if (candidate) choose(candidate); }}>
          <option value="">Select an item</option>{candidates.data.items.map(candidate => <option key={candidate.mainLineId} value={candidate.mainLineId}>{candidate.name}</option>)}</select></label>
        {!candidates.data.items.length ? <p>No matching items.</p> : null}
        {candidates.data.total > candidates.data.limit ? <div className="client-quotation__actions"><Button variant="secondary" disabled={offset === 0 || candidates.isFetching} onClick={() => setOffset(Math.max(0, offset - candidates.data.limit))}>Previous items</Button><Button variant="secondary" disabled={offset + candidates.data.limit >= candidates.data.total || candidates.isFetching} onClick={() => setOffset(offset + candidates.data.limit)}>Next items</Button></div> : null}
      </>}
      {item ? <ItemFields item={item} disabled={disabled || !item.line.source} onChange={update => setItem({ ...item, ...update })} /> : null}
      {item && !item.line.source ? <p role="status">This saved item is unavailable in the current Configuration. Ask your team to review it before adding it back.</p> : null}
      {duplicate ? <p role="status">This item is already in the quotation for this room. Edit its quantity or include it there.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div><div className="ui-dialog__actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!item?.line.source || disabled || duplicate || candidates.isError}>Add to changes</Button></div></form>
  </Dialog>;
}

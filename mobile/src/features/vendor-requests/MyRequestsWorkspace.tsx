import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { ApiError } from "../../core/http/apiClient";
import type { AuthenticatedSession } from "../../contracts/session";
import { useBackInterceptor } from "../../navigation/useScreenBack";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { createIdempotencyKey } from "../finance/money";
import { closeCatalogDraft } from "../knowledge/knowledgeCatalogForms";
import { Button, Field, KnowledgeCard, KnowledgeDetailProvider, KnowledgeSelect, KnowledgeText, knowledgeStyles as s } from "../knowledge/knowledgeDetailUi";
import { ProcurementSubnavigation } from "../procurement/ProcurementSubnavigation";
import { CreateBasketRequestPanel } from "./CreateBasketRequestPanel";
import type { BasketRequest } from "./proposalApi";
import { RequestDetailWorkspace } from "./RequestDetailWorkspace";
import { proposalDenied, proposalError, proposalStatus, proposalUncertain, useProposalContext, type ProposalContext } from "./proposalRuntime";
import type { ProposalScope, ProposalStatus } from "./proposalTypes";

export function MyRequestsWorkspace({ session }: { session: AuthenticatedSession }) { return <RequestsRoot session={session} scope="procurement" />; }
export function BasketRequestsReviewWorkspace({ session, onBack }: { session: AuthenticatedSession; onBack?: () => void }) { return <RequestsRoot session={session} scope="admin" {...(onBack ? { onBack } : {})} />; }
function RequestsRoot({ session, scope, onBack }: { session: AuthenticatedSession; scope: ProposalScope; onBack?: () => void }) {
  const context = useProposalContext(session, scope);
  return <RequestsList key={context.scopeKey} context={context} session={session} {...(onBack ? { onBack } : {})} />;
}
function RequestsList({ context, session, onBack }: { context: ProposalContext; session: AuthenticatedSession; onBack?: () => void }) {
  const client = useQueryClient(); const [selected, setSelected] = useState<string | null>(null); const [legacy, setLegacy] = useState<BasketRequest | null>(null); const [create, setCreate] = useState(false);
  const [status, setStatus] = useState<ProposalStatus | "">(context.scope === "admin" ? "pending" : ""); const [offset, setOffset] = useState(0); const [historicalOffset, setHistoricalOffset] = useState(0);
  const own = useQuery({ queryKey: context.key("list", "own", status, offset), queryFn: () => context.api.listOwnProposals(status, offset), enabled: context.ready && context.canRead && context.scope === "procurement", gcTime: 0 });
  const review = useQuery({ queryKey: context.key("list", "review", status, offset), queryFn: () => context.api.listReview(status, offset), enabled: context.ready && context.canRead && context.scope === "admin", gcTime: 0 });
  const historical = useQuery({ queryKey: context.key("list", "historical", status, historicalOffset), queryFn: () => context.api.listOwnRequests(status === "draft" ? "" : status, historicalOffset), enabled: context.ready && context.canRead && context.scope === "procurement" && status !== "draft", gcTime: 0 });
  const query = context.scope === "admin" ? review : own;
  if (!context.canRead || proposalDenied(query.error)) return <KnowledgeCard title="Requests unavailable"><KnowledgeText error>Your current access does not allow these requests.</KnowledgeText></KnowledgeCard>;
  if (selected) return <RequestDetailWorkspace key={`${context.scopeKey}:${selected}`} context={context} proposalId={selected} onBack={() => { setSelected(null); void client.invalidateQueries({ queryKey: context.key("list") }); }} />;
  if (legacy) return <LegacyRequestDetail key={legacy.id} context={context} request={legacy} onBack={() => setLegacy(null)} />;
  return <KnowledgeDetailProvider><ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
    {context.scope === "procurement" ? <ProcurementSubnavigation session={session} active="requests" /> : null}
    {onBack ? <Button label="Back to Configuration" variant="quiet" onPress={onBack} /> : null}
    <KnowledgeCard title={context.scope === "admin" ? "Basket requests" : "My Requests"}>
      <KnowledgeText>{context.scope === "admin" ? "Review requested hierarchy, configure existing full proposals, or send a request back with a reason." : "Resume drafts and follow Super Admin decisions. Approved baskets become available in the vendor form."}</KnowledgeText>
      {context.canCreate ? <Button label="Request Main Basket" onPress={() => setCreate(true)} /> : null}
      <KnowledgeSelect label="Request status" value={status} placeholder="All requests" options={Object.entries(proposalStatus).filter(([key]) => context.scope !== "admin" || key !== "draft").map(([value, label]) => ({ value, label }))} onChange={value => { setStatus(value as ProposalStatus | ""); setOffset(0); setHistoricalOffset(0); }} />
      <Button label="Refresh requests" variant="quiet" disabled={query.isFetching} onPress={() => { void query.refetch(); if (context.scope === "procurement" && status !== "draft") void historical.refetch(); }} />
      {query.isPending ? <KnowledgeText>Loading requests…</KnowledgeText> : query.isError ? <><KnowledgeText error>{proposalError(query.error)}</KnowledgeText><Button label="Retry requests" variant="secondary" onPress={() => void query.refetch()} /></> : null}
      {context.scope === "procurement" && !own.isError ? own.data?.items.map(proposal => <KnowledgeCard key={proposal.id} title={proposal.name}><KnowledgeText>{proposalStatus[proposal.status]} · {proposal.counts.subBaskets} Sub Baskets · {proposal.counts.mainLines} Main Lines</KnowledgeText><KnowledgeText>{proposal.target?.kind === "new_sub_basket" ? `Under ${proposal.targetParentName ?? "Unavailable Main Basket"}` : "New Main Basket"}</KnowledgeText>{proposal.reason ? <KnowledgeText>Reason: {proposal.reason}</KnowledgeText> : null}<Button label={`${proposal.status === "draft" ? "Resume" : "View"} ${proposal.name}`} variant="secondary" onPress={() => setSelected(proposal.id)} /></KnowledgeCard>) : null}
      {context.scope === "admin" && !review.isError ? review.data?.items.map(request => <KnowledgeCard key={request.id} title={request.proposedName}><KnowledgeText>{proposalStatus[request.status]}{request.vendorName ? ` · ${request.vendorName}` : ""}</KnowledgeText>{request.reason ? <KnowledgeText>Reason: {request.reason}</KnowledgeText> : null}<Button label={`Review ${request.proposedName}`} variant="secondary" onPress={() => request.proposalId ? setSelected(request.proposalId) : setLegacy(request)} /></KnowledgeCard>) : null}
      {query.isSuccess && !query.data.items.length ? <KnowledgeText>No requests in this view.</KnowledgeText> : null}
      {query.data ? <View style={s.row}><Button label="Previous requests" variant="secondary" disabled={offset === 0 || query.isFetching} onPress={() => setOffset(value => Math.max(0, value - 20))} /><Button label="Next requests" variant="secondary" disabled={!query.data.pagination.hasMore || query.isFetching} onPress={() => setOffset(value => value + 20)} /></View> : null}
    </KnowledgeCard>
    {context.scope === "procurement" && status !== "draft" && (historical.isError || Boolean(historical.data?.pagination.total)) ? <KnowledgeCard title="Earlier basket requests">{historical.isError ? <><KnowledgeText error>{proposalError(historical.error)}</KnowledgeText><Button label="Retry earlier requests" variant="secondary" onPress={() => void historical.refetch()} /></> : historical.data?.items.filter(request => !request.proposalId).map(request => <View key={request.id} style={s.stack}><KnowledgeText>{request.proposedName} · {proposalStatus[request.status]}</KnowledgeText>{request.reason ? <KnowledgeText>{request.reason}</KnowledgeText> : null}<Button label={`View earlier ${request.proposedName}`} variant="secondary" onPress={() => setLegacy(request)} /></View>)}<View style={s.row}><Button label="Previous earlier requests" variant="secondary" disabled={historicalOffset === 0 || historical.isFetching} onPress={() => setHistoricalOffset(value => Math.max(0, value - 20))} /><Button label="Next earlier requests" variant="secondary" disabled={!historical.data?.pagination.hasMore || historical.isFetching} onPress={() => setHistoricalOffset(value => value + 20)} /></View></KnowledgeCard> : null}
    {create ? <CreateBasketRequestPanel session={session} onClose={() => setCreate(false)} onSaved={proposal => { setCreate(false); setSelected(proposal.id); }} /> : null}
  </ScrollView></KnowledgeDetailProvider>;
}

function LegacyRequestDetail({ context, request, onBack }: { context: ProposalContext; request: BasketRequest; onBack: () => void }) {
  const client = useQueryClient(); const [subName, setSubName] = useState(""); const [lineName, setLineName] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState<BasketRequest | null>(null); const command = useRef<Parameters<ProposalContext["api"]["decideLegacy"]>[1] | null>(null); const navigation = useScaffoldNavigationGuard(); const lock = useRef(false); const alive = useRef(true);
  const [denied, setDenied] = useState(false); const [stale, setStale] = useState(false);
  const dirty = Boolean(subName || lineName || reason); const editable = !denied && !stale && context.scope === "admin" && context.canSubmit && !result && request.status === "pending";
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { navigation?.setBlocked(dirty || busy || Boolean(command.current)); return () => navigation?.setBlocked(false); }, [navigation, dirty, busy, error]);
  function close() { if (!busy && !command.current) closeCatalogDraft(dirty, onBack); }
  useBackInterceptor(() => { close(); return true; });
  async function decide(decision: "fulfill" | "reject") {
    if (!editable || lock.current) return;
    if (!command.current) {
      if (decision === "reject" && !reason.trim()) { setError("Enter a send-back reason."); return; }
      if (decision === "fulfill" && (!subName.trim() || !lineName.trim())) { setError("Enter the Sub Basket and Main Line names."); return; }
      command.current = { decision, expectedVersion: request.version, idempotencyKey: createIdempotencyKey(), ...(decision === "reject" ? { reason: reason.trim() } : { configuration: { subBasketName: subName.trim(), mainLineName: lineName.trim() } }) };
    }
    lock.current = true; setBusy(true); setError("");
    try { const value = await context.api.decideLegacy(request.id, command.current); if (!alive.current) return; command.current = null; setResult(value); setSubName(""); setLineName(""); setReason(""); await client.invalidateQueries({ queryKey: context.key("list") }).catch(() => setError("Decision saved. Refresh requests to load the latest list.")); }
    catch (cause) { if (alive.current) { setError(proposalError(cause)); if (proposalDenied(cause)) setDenied(true); if (cause instanceof ApiError && cause.status === 409) setStale(true); if (!proposalUncertain(cause)) command.current = null; } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  if (denied) return <KnowledgeCard title="Request unavailable"><KnowledgeText error>This request is no longer available to your account.</KnowledgeText><Button label="Back to requests" onPress={onBack} /></KnowledgeCard>;
  return <KnowledgeDetailProvider><ScrollView contentContainerStyle={s.screen}><Button label="Back to requests" variant="quiet" disabled={busy || Boolean(command.current)} onPress={close} /><KnowledgeCard title={request.proposedName}><KnowledgeText>Earlier name-only request · {proposalStatus[(result ?? request).status]}</KnowledgeText>{(result ?? request).reason ? <KnowledgeText>{(result ?? request).reason}</KnowledgeText> : null}{error ? <KnowledgeText error>{error}</KnowledgeText> : null}{stale ? <KnowledgeText error>This request changed elsewhere. Return to requests and refresh before reviewing again.</KnowledgeText> : null}{editable ? <><Field label="Sub Basket name" value={subName} editable={!busy && !command.current} onChangeText={setSubName} maxLength={240} /><Field label="Main Line name" value={lineName} editable={!busy && !command.current} onChangeText={setLineName} maxLength={240} /><Field label="Send-back reason" value={reason} multiline maxLength={1000} editable={!busy && !command.current} onChangeText={setReason} />{command.current ? <Button label="Retry same action" loading={busy} onPress={() => void decide(command.current!.decision)} /> : <><Button label="Approve hierarchy" loading={busy} onPress={() => void decide("fulfill")} /><Button label="Send back request" variant="secondary" loading={busy} onPress={() => void decide("reject")} /></>}</> : null}</KnowledgeCard></ScrollView></KnowledgeDetailProvider>;
}

export function BasketRequestDetailWorkspace({ requestId, session, onBack }: { requestId: string; session: AuthenticatedSession; onBack: () => void }) {
  const context = useProposalContext(session, "admin");
  const runtime = useConfiguredRuntime();
  const query = useQuery({ queryKey: context.key("selected-request", requestId), queryFn: async ({ signal }) => { const request = await runtime.runtime.api.authenticated.get<BasketRequest>(`/admin/ai-estimator-knowledge/basket-requests/${encodeURIComponent(requestId)}`, { signal }); if (!request || request.id !== requestId) throw new Error("The selected request could not be verified."); return request; }, enabled: context.ready && context.canRead, retry: false, gcTime: 0 });
  if (!context.canRead || proposalDenied(query.error)) return <KnowledgeCard title="Request unavailable"><KnowledgeText error>Your current account cannot open this request.</KnowledgeText></KnowledgeCard>;
  if (query.isError || query.isPending) return <KnowledgeCard title="Basket request"><KnowledgeText error={query.isError}>{query.isError ? proposalError(query.error) : "Loading selected request…"}</KnowledgeText><Button label="Retry selected request" onPress={() => void query.refetch()} /><Button label="Back to notifications" variant="quiet" onPress={onBack} /></KnowledgeCard>;
  return query.data.proposalId ? <RequestDetailWorkspace key={`${context.scopeKey}:${query.data.proposalId}`} context={context} proposalId={query.data.proposalId} onBack={onBack} /> : <LegacyRequestDetail key={`${context.scopeKey}:${requestId}`} context={context} request={query.data} onBack={onBack} />;
}

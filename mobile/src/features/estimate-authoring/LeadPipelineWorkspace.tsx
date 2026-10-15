import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useScaffoldNavigationBlocked } from "../../navigation/AdaptiveAppScaffold";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field, StateView } from "../../ui/primitives";
import { KnowledgeCard, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles as styles } from "../knowledge/knowledgeUi";
import { LeadCreateForm } from "../leads/LeadCreateForm";
import { LeadActions } from "../leads/LeadActions";
import { getPipelinePage, leadPipelineKey, leadStageLabels } from "./leadPipelineApi";
import { getStaffEstimateQueue, getStaffLead, staffEstimateQueueKey, staffLeadKey } from "./staffEstimateApi";
import { estimatePaise } from "./staffEstimateModel";
import type { LeadStage } from "./types";
export function LeadPipelineWorkspace({ session, onOpenLead }: { readonly session: AuthenticatedSession; readonly onOpenLead: (leadId: string) => void }) {
 const context = useConfiguredRuntime();
 if (!canPerformOperation(session, "GET /leads")) return <StateView tone="denied" title="Leads unavailable" message="Your account cannot open this pipeline." />;
 return <Pipeline key={`${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${session.user.id}`} session={session} onOpenLead={onOpenLead} />;
}
function Pipeline({ session, onOpenLead }: { readonly session: AuthenticatedSession; readonly onOpenLead: (leadId: string) => void }) {
 const context = useConfiguredRuntime(); const scope = { environmentId: context.environment.environment.id, userId: session.user.id }; const blocked = useScaffoldNavigationBlocked(); const [search, setSearch] = useState(""); const [appliedSearch, setAppliedSearch] = useState(""); const [stage, setStage] = useState<LeadStage | "all">("all"); const [offset, setOffset] = useState(0); const [reviewId, setReviewId] = useState<string | null>(null);
 const query = useQuery({ queryKey: leadPipelineKey(scope, appliedSearch, stage, offset), queryFn: ({ signal }) => getPipelinePage(context.runtime, appliedSearch, stage, offset, signal), enabled: !blocked, retry: false, refetchOnWindowFocus: !blocked });
 const canListEstimates = canPerformOperation(session, "GET /estimates");
 const estimates = useQuery({ queryKey: staffEstimateQueueKey(scope, "/estimates"), queryFn: ({ signal }) => getStaffEstimateQueue(context.runtime, "/estimates", signal), enabled: canListEstimates && !blocked, retry: false, refetchOnWindowFocus: !blocked });
 const saved = estimates.data ?? []; const currentEstimate = new Map(saved.map(estimate => [estimate.leadId, estimate])); const savedValue = saved.reduce((sum, estimate) => sum + (estimate.totalPaise ?? Math.round(estimate.total * 100)), 0);
 const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
 return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
  <KnowledgeCard title="Leads & estimates"><KnowledgeText>Track Client conversations, review the pipeline and continue saved estimates.</KnowledgeText>{canPerformOperation(session, "POST /leads") ? <LeadCreateForm onCreated={onOpenLead} /> : null}</KnowledgeCard>
  <KnowledgeCard title="Pipeline overview"><KnowledgeText>{query.isSuccess ? `${query.data.pagination.total} matching leads · ${query.data.items.length} shown` : "Lead count unavailable"}</KnowledgeText>{canListEstimates ? estimates.isSuccess ? <><KnowledgeText>{saved.length} saved estimates · {saved.filter(estimate => estimate.status === "draft").length} drafts</KnowledgeText><KnowledgeText>Saved estimate value: {estimatePaise(savedValue)}</KnowledgeText></> : <><KnowledgeText>{estimates.isPending ? "Loading saved estimates…" : "Saved estimates are unavailable."}</KnowledgeText>{estimates.isError ? <Button label="Retry saved estimates" disabled={blocked} onPress={() => void estimates.refetch()} /> : null}</> : null}</KnowledgeCard>
  <KnowledgeCard title="Find leads"><Field label="Search leads" value={search} onChangeText={setSearch} placeholder="Client, email, mobile or project" editable={!blocked} onSubmitEditing={() => { if (!blocked) { setAppliedSearch(search.trim()); setOffset(0); } }} /><Button label="Search pipeline" disabled={blocked || query.isFetching} onPress={() => { setAppliedSearch(search.trim()); setOffset(0); }} /><KnowledgeSelect label="Filter lead stage" value={stage} allowEmpty={false} disabled={blocked || query.isFetching} options={[{ value: "all", label: "All stages" }, ...Object.entries(leadStageLabels).map(([value, label]) => ({ value, label }))]} onChange={value => { setStage(value as LeadStage | "all"); setOffset(0); }} /></KnowledgeCard>
  {query.isPending ? <KnowledgeText>Loading leads…</KnowledgeText> : query.isError ? <KnowledgeCard title={denied ? "Leads unavailable" : "Leads could not be loaded"}><KnowledgeText>{denied ? "Your current access does not permit this pipeline." : "Refresh the current filters before continuing."}</KnowledgeText><Button label="Retry lead pipeline" disabled={blocked} onPress={() => void query.refetch()} /></KnowledgeCard> : <>
   {!query.data.items.length ? <KnowledgeText>No leads match these filters.</KnowledgeText> : query.data.items.map(lead => { const estimate = currentEstimate.get(lead.id); return <KnowledgeCard key={lead.id} title={lead.projectName}><KnowledgeText>{lead.clientName} · {lead.propertyType} · {lead.location}</KnowledgeText><KnowledgeText>{lead.stage ? leadStageLabels[lead.stage] : "Stage unavailable"}{lead.createdAt ? ` · Created ${new Date(lead.createdAt).toLocaleDateString()}` : ""}</KnowledgeText>{lead.nextAction ? <KnowledgeText>Next: {lead.nextAction}{lead.nextActionAt ? ` · ${new Date(lead.nextActionAt).toLocaleString()}` : ""}</KnowledgeText> : null}{estimate ? <KnowledgeText>Estimate: {estimate.status.replaceAll("_", " ")} · {estimatePaise(estimate.totalPaise ?? Math.round(estimate.total * 100))}</KnowledgeText> : canListEstimates ? <KnowledgeText>{estimates.isSuccess ? "No saved estimate" : "Estimate summary unavailable"}</KnowledgeText> : null}<View style={styles.row}>{canPerformOperation(session, "GET /leads/:leadId") ? <Button label={`Quick review ${lead.projectName}`} variant="quiet" disabled={blocked || query.isFetching} onPress={() => setReviewId(lead.id)} /> : null}{canPerformOperation(session, "GET /leads/:leadId") && canPerformOperation(session, "GET /leads/:leadId/estimate") ? <Button label={`${estimate ? "Continue" : "Start"} estimate: ${lead.projectName}`} disabled={blocked || query.isFetching} onPress={() => onOpenLead(lead.id)} /> : null}</View></KnowledgeCard>; })}
   <View style={styles.row}><Button label="Previous leads" variant="secondary" disabled={blocked || query.isFetching || offset === 0} onPress={() => setOffset(Math.max(0, offset - 20))} /><Button label="Next leads" variant="secondary" disabled={blocked || query.isFetching || !query.data.pagination.hasMore} onPress={() => setOffset(query.data.pagination.offset + query.data.pagination.limit)} /></View>
  </>}
  <Button label="Refresh lead pipeline" variant="quiet" disabled={blocked || query.isFetching} onPress={() => void query.refetch()} />
  {reviewId ? <KnowledgeModal title="Lead quick review" busy={blocked} onClose={() => setReviewId(null)}><LeadQuickReview leadId={reviewId} session={session} onOpenLead={onOpenLead} /></KnowledgeModal> : null}
 </ScrollView>;
}
function LeadQuickReview({ leadId, session, onOpenLead }: { readonly leadId: string; readonly session: AuthenticatedSession; readonly onOpenLead: (leadId: string) => void }) {
 const context = useConfiguredRuntime(); const blocked = useScaffoldNavigationBlocked(); const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
 const query = useQuery({ queryKey: staffLeadKey(scope, leadId), queryFn: ({ signal }) => getStaffLead(context.runtime, leadId, signal), retry: false, refetchOnWindowFocus: !blocked });
 if (query.isPending) return <KnowledgeText>Loading this lead…</KnowledgeText>;
 if (query.isError) return <><KnowledgeText error>This lead is unavailable.</KnowledgeText><Button label="Retry lead review" disabled={blocked} onPress={() => void query.refetch()} /></>;
 const lead = query.data;
 return <View style={styles.stack}><KnowledgeCard title={lead.projectName}><KnowledgeText>{lead.clientName} · {lead.propertyType} · {lead.location}</KnowledgeText><KnowledgeText>{lead.clientEmail} · {lead.clientMobile}</KnowledgeText><KnowledgeText>Budget: {lead.budgetMin == null ? "Not set" : estimatePaise(Math.round(lead.budgetMin * 100))} to {lead.budgetMax == null ? "Not set" : estimatePaise(Math.round(lead.budgetMax * 100))}</KnowledgeText></KnowledgeCard><LeadActions lead={lead} session={session} disabled={query.isFetching} />{canPerformOperation(session, "GET /leads/:leadId/estimate") ? <Button label="Open estimate workspace" disabled={blocked || query.isFetching} onPress={() => onOpenLead(lead.id)} /> : null}</View>;
}

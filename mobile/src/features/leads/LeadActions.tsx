import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { KnowledgeCard, KnowledgeSelect, KnowledgeText, knowledgeStyles as styles } from "../knowledge/knowledgeUi";
import { createLeadActivity, getLeadActivityPage, leadActivitiesKey, leadActivityTypes, leadStageLabels, updateLeadStage, type LeadActivityType } from "../estimate-authoring/leadPipelineApi";
import { getStaffLead, staffLeadKey } from "../estimate-authoring/staffEstimateApi";
import type { LeadStage, StaffLead } from "../estimate-authoring/types";
export function LeadActions({ lead, session, disabled = false }: { readonly lead: StaffLead; readonly session: AuthenticatedSession; readonly disabled?: boolean }) {
 const context = useConfiguredRuntime();
 return <Actions key={`${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${session.user.id}:${lead.id}`} lead={lead} session={session} disabled={disabled} />;
}
function Actions({ lead, session, disabled }: { readonly lead: StaffLead; readonly session: AuthenticatedSession; readonly disabled: boolean }) {
 const context = useConfiguredRuntime(); const client = useQueryClient(); const guard = useScaffoldNavigationGuard(); const ownerKey = `${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${session.user.id}:${lead.id}`; const owner = useRef(ownerKey); owner.current = ownerKey;
 const scope = { environmentId: context.environment.environment.id, userId: session.user.id }; const [stage, setStage] = useState<LeadStage | "">(lead.stage ?? ""); const [reviewedStage, setReviewedStage] = useState(lead.stage); const [type, setType] = useState<LeadActivityType>("note"); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const pending = useRef(false); const [unknown, setUnknown] = useState(false); const [blocked, setBlocked] = useState(false); const [reviewedUnknown, setReviewedUnknown] = useState(false); const [denied, setDenied] = useState(false); const [message, setMessage] = useState("");
 const canUpdate = canPerformOperation(session, "PATCH /leads/:leadId"); const canRead = canPerformOperation(session, "GET /leads/:leadId/activities"); const canAdd = canPerformOperation(session, "POST /leads/:leadId/activities");
 const activities = useInfiniteQuery({ queryKey: leadActivitiesKey(scope, lead.id), queryFn: ({ pageParam, signal }) => getLeadActivityPage(context.runtime, lead.id, pageParam, signal), initialPageParam: 0, getNextPageParam: page => page.pagination.hasMore ? page.pagination.offset + page.pagination.limit : undefined, enabled: canRead && !denied && !busy && !unknown, retry: false, refetchOnWindowFocus: !busy && !unknown });
 const dirty = Boolean(note || stage !== (lead.stage ?? "")); const stale = reviewedStage !== lead.stage;
 useEffect(() => { guard?.setBlocked(busy || blocked || dirty); return () => guard?.setBlocked(false); }, [guard, busy, blocked, dirty]);
 useEffect(() => () => { owner.current = ""; }, []);
 useEffect(() => { if (!dirty && !busy && !blocked) { setStage(lead.stage ?? ""); setReviewedStage(lead.stage); } }, [lead.stage]);
 async function refresh() {
  const frozen = ownerKey; try { const current = await getStaffLead(context.runtime, lead.id); if (owner.current !== frozen) return; client.setQueryData(staffLeadKey(scope, lead.id), current); if (canRead) await activities.refetch({ throwOnError: true }); if (owner.current !== frozen) return; if (unknown) { setReviewedUnknown(true); setMessage("Saved state refreshed. Check the follow-up history and stage, then acknowledge the result before another action."); } else { setStage(current.stage ?? ""); setReviewedStage(current.stage); setBlocked(false); setMessage(""); } }
  catch (cause) { if (owner.current !== frozen) return; if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) setDenied(true); else setMessage("Saved lead state could not be refreshed. Your note is preserved."); }
 }
 async function run(action: "stage" | "activity") {
  if (pending.current || disabled || blocked || (action === "stage" && (!stage || stale || !canUpdate)) || (action === "activity" && (!note.trim() || !canAdd))) return;
  const frozen = ownerKey; const input = { type, note: note.trim(), occurredAt: new Date().toISOString() }; const selected = stage as LeadStage; pending.current = true; setBusy(true); setMessage("");
  try { if (action === "stage") { const updated = await updateLeadStage(context.runtime, lead.id, selected); if (owner.current !== frozen) return; client.setQueryData(staffLeadKey(scope, lead.id), updated); setReviewedStage(updated.stage); setStage(updated.stage ?? ""); } else { await createLeadActivity(context.runtime, lead.id, session.user.id, input); if (owner.current !== frozen) return; setNote(""); }
   setMessage(action === "stage" ? "Lead stage updated." : "Follow-up recorded."); await client.invalidateQueries({ queryKey: privateQueryKey(scope, "leads") }).catch(() => { if (owner.current === frozen) setMessage("Change saved. Refresh the lead to load its current state."); }); if (canRead) await activities.refetch().catch(() => undefined);
  } catch (cause) { if (owner.current !== frozen) return; setBlocked(true); if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { setDenied(true); client.removeQueries({ queryKey: leadActivitiesKey(scope, lead.id) }); } else { const uncertain = !(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408; setUnknown(uncertain); setReviewedUnknown(false); setMessage(uncertain ? "The result could not be confirmed. Your note is preserved. Refresh and check saved history before adding anything again." : cause.message); } }
  finally { if (owner.current === frozen) { pending.current = false; setBusy(false); } }
 }
 if (denied || activities.error instanceof ApiError && [401, 403, 404].includes(activities.error.status)) return <KnowledgeCard title="Lead follow-ups"><KnowledgeText>This lead is unavailable for your current access.</KnowledgeText></KnowledgeCard>;
 const locked = disabled || busy || blocked;
 return <KnowledgeCard title="Lead stage & follow-ups">
  <KnowledgeText>Current stage: {lead.stage ? leadStageLabels[lead.stage] : "Unavailable"}</KnowledgeText>
  {lead.nextAction ? <KnowledgeText>Next action: {lead.nextAction}{lead.nextActionAt ? ` · ${new Date(lead.nextActionAt).toLocaleString()}` : ""}</KnowledgeText> : null}
  {canUpdate ? <><KnowledgeSelect label="Lead stage" value={stage} onChange={value => setStage(value as LeadStage)} allowEmpty={false} options={Object.entries(leadStageLabels).map(([value, label]) => ({ value, label }))} disabled={locked || stale || !lead.stage} /><Button label="Update lead stage" disabled={locked || stale || !stage || stage === lead.stage} loading={busy} onPress={() => void run("stage")} /></> : null}
  {stale && !blocked ? <><KnowledgeText>The saved stage changed. Review the latest stage before updating it.</KnowledgeText><Button label="Use current lead stage" disabled={busy} onPress={() => { setStage(lead.stage ?? ""); setReviewedStage(lead.stage); }} /></> : null}
  {canAdd ? <><KnowledgeSelect label="Follow-up type" value={type} allowEmpty={false} onChange={value => setType(value as LeadActivityType)} options={leadActivityTypes.map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }))} disabled={locked} /><Field label="Follow-up note" value={note} onChangeText={setNote} multiline maxLength={10000} editable={!locked} /><Button label="Add follow-up" disabled={locked || !note.trim()} loading={busy} onPress={() => void run("activity")} /></> : null}
  {message ? <KnowledgeText error={blocked}>{message}</KnowledgeText> : null}
  {blocked ? <><Button label="Refresh saved lead and follow-ups" disabled={busy} onPress={() => void refresh()} />{unknown && reviewedUnknown ? <Button label="I reviewed the saved result" variant="secondary" onPress={() => { setUnknown(false); setBlocked(false); setReviewedUnknown(false); setNote(""); setStage(lead.stage ?? ""); setReviewedStage(lead.stage); setMessage("Ready for a new action. The previous request was not replayed."); }} /> : null}</> : null}
  {canRead ? <View style={styles.stack}><KnowledgeText>Recorded follow-ups</KnowledgeText>{activities.isPending ? <KnowledgeText>Loading follow-ups…</KnowledgeText> : activities.isError ? <><KnowledgeText error>Follow-ups could not be loaded.</KnowledgeText><Button label="Retry follow-up history" disabled={busy || unknown} onPress={() => void activities.refetch()} /></> : activities.data?.pages.flatMap(page => page.items).length ? [...new Map(activities.data.pages.flatMap(page => page.items).map(item => [item.id, item])).values()].map(item => <View key={item.id} style={styles.summaryRow}><View style={{ flex: 1 }}><KnowledgeText>{item.type} · {new Date(item.occurredAt).toLocaleString()}</KnowledgeText><KnowledgeText>{item.note}</KnowledgeText></View></View>) : <KnowledgeText>No follow-ups recorded.</KnowledgeText>}{activities.hasNextPage ? <Button label="Load older follow-ups" disabled={busy || unknown || activities.isFetching} onPress={() => void activities.fetchNextPage()} /> : null}</View> : null}
 </KnowledgeCard>;
}

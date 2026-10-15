import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { Button, Field } from "../../ui/primitives";
import { createIdempotencyKey } from "../finance/money";
import { WorkEvidence } from "../vendor-work/WorkEvidence";
import type { VendorWorkReview } from "../vendor-work/vendorWorkTypes";
import { AccessLost, CommandFeedback, dateTime, label, p, Pager, Panel, QueryState, ScopeMismatch, unavailable, useDeliveryCommand, useDeliveryGuard, type DeliveryContext } from "../execution/executionNative";
export function ClientVendorWorkReviews({ context: c, projectId }: { context: DeliveryContext; projectId: string }) {
  const [offset, setOffset] = useState(0); const allowed = c.can("GET /clients/projects/:projectId/vendor-work-reviews");
  const query = useQuery({ queryKey: c.key("client-work-reviews", projectId, offset), queryFn: ({ signal }) => c.vendor.reviews(projectId, offset, signal), enabled: allowed && c.ready, retry: false });
  if (!allowed) return null;
  if (unavailable(query.error)) return <AccessLost title="Submitted work unavailable" />;
  const data = query.data?.items.every(item => item.projectId === projectId) ? query.data : null;
  return <Panel title="Work for your review"><Text style={p.copy}>Review each submitted section and its supporting photos before approving.</Text><QueryState title="Submitted work" query={query} />{query.data && !data ? <ScopeMismatch /> : null}{data ? <><Text style={p.strong}>{data.pendingTotal} awaiting your review</Text>{data.items.map(review => <ReviewCard key={review.id} context={c} review={review} stale={query.isError || query.isFetching} refresh={async () => { await Promise.all([query.refetch(), c.refresh()]); }} />)}{!data.items.length ? <Text style={p.copy}>No submitted sections are available for review.</Text> : null}<Pager offset={data.offset} limit={data.limit} total={data.total} onChange={value => c.navigate(() => setOffset(value))} /></> : null}<Button label="Refresh submitted work" variant="quiet" disabled={c.locked || query.isFetching} onPress={() => void query.refetch()} /></Panel>;
}
function ReviewCard({ context: c, review, stale, refresh }: { context: DeliveryContext; review: VendorWorkReview; stale: boolean; refresh: () => Promise<unknown> }) {
  const [draft, setDraft] = useState<{ version: number; reason: string } | null>(null);
  const command = useDeliveryCommand(refresh); useDeliveryGuard(c, Boolean(draft), command.locked);
  if (command.accessLost) return <AccessLost title="Work review unavailable" />;
  const allowed = c.can("POST /clients/projects/:projectId/vendor-work-reviews/:reviewId/decision") && review.status === "pending";
  const changed = Boolean(draft && draft.version !== review.version);
  function decide(decision: "approve" | "request_changes") {
    if (!allowed || stale || changed || c.locked || (decision === "request_changes" && !draft?.reason.trim())) return;
    const body = { expectedVersion: draft?.version ?? review.version, idempotencyKey: createIdempotencyKey(), decision, reason: decision === "request_changes" ? draft!.reason.trim() : null };
    void command.execute(async () => { const saved = await c.vendor.decide(review.projectId, review.id, body); if (saved.projectId !== review.projectId || saved.id !== review.id || saved.assignmentId !== review.assignmentId) throw new Error("The response does not match this work review."); return saved; }, () => setDraft(null));
  }
  return <Panel title={review.itemName}><Text style={p.copy}>{review.roomName} · {review.sectionLabel} · {review.scopeType ? label(review.scopeType) : "Scope not specified"}</Text><Text style={p.copy}>{review.description}</Text><Text style={p.strong}>{label(review.status)} · {review.progress}% complete</Text><Text style={p.copy}>Submitted {dateTime(review.submittedAt)} · Round {review.round}</Text><Text style={p.copy}>{review.note}</Text>{review.decision?.reason ? <Text style={p.copy}>Your previous response: {review.decision.reason}</Text> : null}<WorkEvidence context={c} projectId={review.projectId} assignmentId={review.assignmentId} imageIds={review.imageIds} />{allowed ? <><Button label={`Approve ${review.itemName}`} disabled={c.locked || stale || changed || Boolean(draft)} onPress={() => decide("approve")} /><Button label={`Request changes to ${review.itemName}`} variant="secondary" disabled={c.locked || stale} onPress={() => setDraft({ version: review.version, reason: "" })} />{draft ? <View style={p.stack}><Field label={`Changes needed for ${review.itemName}`} value={draft.reason} editable={!c.locked} multiline maxLength={2000} onChangeText={reason => setDraft({ ...draft, reason })} />{changed ? <Text style={p.error}>The review changed. Cancel your draft and inspect the current submission.</Text> : null}<Button label={`Send changes for ${review.itemName}`} disabled={c.locked || stale || changed || !draft.reason.trim()} onPress={() => decide("request_changes")} /><Button label={`Cancel changes for ${review.itemName}`} variant="quiet" disabled={command.pending || command.uncertain} onPress={() => setDraft(null)} /></View> : null}</> : null}<CommandFeedback command={command} /></Panel>;
}

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button, Field, StateView } from "../../ui/primitives";
import { createIdempotencyKey } from "../finance/money";
import type { BasketApprovalQueueItem } from "./procurementBasketApi";
import { AwardSummary } from "./ProcurementAwardPanel";
import { OrderRecord } from "./ProcurementOrdersPanel";
import { Choice, CommandFeedback, money, p, Pager, Panel, QueryState, type ProcurementContext, useProcurementCommand, useProcurementContext, useProcurementFormGuard, useProcurementView } from "./procurementNative";
export function ProcurementApprovalScreen({ session, kind = "basket" }: { session: AuthenticatedSession; kind?: "basket" | "orders" }) {
  const c = useProcurementContext(session);
  return <ScrollView contentContainerStyle={p.screen} keyboardShouldPersistTaps="handled"><Text accessibilityRole="header" style={p.title}>{kind === "basket" ? "Work order approvals" : "Purchase order approvals"}</Text>{kind === "basket" ? <BasketQueue key={c.scope} context={c} /> : <OrderQueues key={c.scope} context={c} />}</ScrollView>;
}
function BasketQueue({ context: c }: { context: ProcurementContext }) {
  const [selected, setSelected] = useState<BasketApprovalQueueItem | null>(null);
  const allowed = c.can("GET /work-order-approvals");
  const queueRead = useQuery({ queryKey: c.key("work-order-approvals"), queryFn: ({ signal }) => c.baskets.getBasketApprovalQueue(signal), enabled: c.ready && allowed, retry: false });
  const queue = useProcurementView(queueRead, c);
  if (!allowed) return <StateView title="Approvals unavailable" message="This account cannot open the assigned approval queue." tone="denied" />;
  return <View style={p.stack}><QueryState query={queue} title="Assigned approvals" />{queue.data && !queue.isError ? <>{!queue.data.length ? <Text style={p.copy}>No work order approvals are currently assigned to you.</Text> : null}{queue.data.map(item => <Choice key={`${item.awardId}:${item.slot}`} radio label={`${item.projectName} · ${item.basketName} · ${item.vendorName} · ${item.slot.replaceAll("_", " ")} · ${money(item.grossPaise)}`} checked={selected?.awardId === item.awardId && selected.slot === item.slot} onPress={() => c.navigate(() => setSelected(item))} />)}{selected && queue.data.some(item => item.awardId === selected.awardId && item.slot === selected.slot) ? <BasketDecision key={`${selected.awardId}:${selected.slot}`} context={c} item={selected} refresh={async () => { await Promise.all([queue.refetch(), c.refresh()]); }} /> : null}</> : null}</View>;
}
function BasketDecision({ context: c, item, refresh }: { context: ProcurementContext; item: BasketApprovalQueueItem; refresh: () => Promise<unknown> }) {
  const query = useQuery({ queryKey: c.key("work-order-approval", item.awardId), queryFn: ({ signal }) => c.baskets.getBasketApprovalDetail(item.awardId, signal), retry: false }); const [reason, setReason] = useState(""); const command = useProcurementCommand(async () => { await Promise.all([query.refetch(), refresh()]); }); const award = !query.isError ? query.data : null;
  useProcurementFormGuard(c, Boolean(reason), command.pending || command.uncertain);
  if (command.accessLost) return <StateView title="Approval access changed" message="Refresh your queue." tone="denied" />;
  const valid = award && award.id === item.awardId && award.projectId === item.projectId && award.enquiryId === item.enquiryId && award.mainBasketId === item.mainBasketId;
  const decide = (decision: "approve" | "reject") => { if (!valid || !award.proposalRevisionId) return; if (decision === "reject" && !reason.trim()) { command.validation("Enter a rejection reason."); return; } if (decision === "approve" && item.slot === "budget_override" && reason.trim().length < 10) { command.validation("Enter at least 10 characters explaining the budget override."); return; } const body = { expectedVersion: award.version, proposalRevisionId: award.proposalRevisionId, slot: item.slot, decision, reason: reason.trim() || null, idempotencyKey: createIdempotencyKey() }; void command.execute(() => c.baskets.decideBasketApproval(item.awardId, body), () => setReason("")); };
  return <Panel title={`${item.vendorName} · ${item.slot.replaceAll("_", " ")} decision`}><QueryState query={query} title="Award revision" />{award && !valid ? <Text style={p.error}>The award identity changed. Refresh before deciding.</Text> : null}{valid ? <><AwardSummary award={award} /><Text style={p.strong}>Your payment rows</Text>{award.proposal.milestones.filter(row => item.slot === "budget_override" || row.reviewerSlots?.includes(item.slot)).map(row => <Text style={p.copy} key={row.id}>{row.name} · {money(row.amountPaise)}</Text>)}{award.status === "pending_approvals" && !award.approvals.some(value => value.slot === item.slot) && c.can("POST /work-order-approvals/:awardId/decision") ? <><Field label="Award approval reason" value={reason} onChangeText={setReason} multiline maxLength={2000} editable={!command.locked} /><View style={p.row}><Button label="Approve award revision" disabled={command.locked || query.isFetching || (item.slot === "budget_override" && reason.trim().length < 10)} onPress={() => decide("approve")} /><Button label="Reject award revision" variant="danger" disabled={command.locked || query.isFetching || !reason.trim()} onPress={() => decide("reject")} /></View></> : <Text style={p.copy}>This revision is no longer awaiting your decision.</Text>}</> : null}<CommandFeedback command={command} /></Panel>;
}
function OrderQueues({ context: c }: { context: ProcurementContext }) {
  const [offset, setOffset] = useState(0); const [requestOffset, setRequestOffset] = useState(0);
  const allowed = c.can("GET /admin/purchase-orders/pending"); const requestsAllowed = c.can("GET /admin/purchase-order-requests/pending");
  const ordersRead = useQuery({ queryKey: c.key("pending-orders", offset), queryFn: () => c.orders.getPendingPurchaseOrders(offset), enabled: allowed && c.ready, retry: false });
  const orders = useProcurementView(ordersRead, c);
  const requestsRead = useQuery({ queryKey: c.key("pending-requests", requestOffset), queryFn: () => c.orders.getPendingProjectPurchaseOrderRequests(requestOffset), enabled: requestsAllowed && c.ready, retry: false });
  const requests = useProcurementView(requestsRead, c);
  const refresh = async () => { await Promise.all([...(allowed ? [orders.refetch()] : []), ...(requestsAllowed ? [requests.refetch()] : []), c.refresh()]); };
  if (!allowed && !requestsAllowed) return <StateView title="Purchase approvals unavailable" message="This account cannot review purchase order approvals." tone="denied" />;
  return <View style={p.stack}>{allowed ? <Panel title="Pending vendor orders"><QueryState query={orders} title="Vendor order queue" />{orders.data && !orders.isError ? <>{!orders.data.items.length ? <Text style={p.copy}>No pending vendor orders.</Text> : null}{orders.data.items.map(order => <View key={order.id} style={p.panel}><OrderRecord context={c} record={order} kind="order" refresh={refresh} approvalOnly /></View>)}<Pager offset={offset} total={orders.data.total} onChange={value => c.navigate(() => setOffset(value))} /></> : null}</Panel> : null}{requestsAllowed ? <Panel title="Pending project requests"><QueryState query={requests} title="Project request queue" />{requests.data && !requests.isError ? <>{!requests.data.items.length ? <Text style={p.copy}>No pending project requests.</Text> : null}{requests.data.items.map(request => <View key={request.id} style={p.panel}><OrderRecord context={c} record={request} kind="request" refresh={refresh} approvalOnly /></View>)}<Pager offset={requestOffset} total={requests.data.total} onChange={value => c.navigate(() => setRequestOffset(value))} /></> : null}</Panel> : null}</View>;
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { Button } from "../../ui/primitives";
import { createIdempotencyKey } from "../finance/money";
import type { VendorAccessAction, VendorOrderAccess, VendorOrderAccessCommand, VendorOrderAccessPage } from "./vendorAccessTypes";
import { AccessLost, CommandFeedback, dateTime, label, p, Pager, Panel, QueryState, ScopeMismatch, unavailable, useDeliveryCommand, useDeliveryGuard, type DeliveryContext } from "./executionNative";
const labels: Record<VendorAccessAction, string> = { send_invitation: "Send invitation", resend_invitation: "Resend invitation", send_work_notification: "Send work notification" };
export function ProjectVendorAccessPanel({ context: c, projectId }: { context: DeliveryContext; projectId: string }) {
  const allowed = c.can("GET /projects/:projectId/vendor-access"); const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: c.key("vendor-access", projectId), queryFn: ({ signal }) => c.execution.access(projectId, signal), enabled: allowed && c.ready, retry: false, gcTime: 0, refetchInterval: state => state.state.error ? false : state.state.data?.items.some(item => ["queued", "sending"].includes(item.state)) ? 3_000 : 15_000, refetchIntervalInBackground: false });
  const command = useDeliveryCommand(async () => { await Promise.all([query.refetch(), c.refresh()]); }); useDeliveryGuard(c, false, command.locked);
  if (!allowed) return null;
  if (unavailable(query.error) || command.accessLost) return <AccessLost title="Vendor access unavailable" />;
  const data = !query.isError && query.data?.items.every(item => item.projectId === projectId) ? query.data : null;
  const check = (saved: VendorOrderAccessPage) => { if (saved.items.some(item => item.projectId !== projectId)) throw new Error("The access response belongs to another project."); return saved; };
  function send(item: VendorOrderAccess, action: VendorAccessAction) {
    if (!item.availableActions.includes(action) || item.readiness.state !== "ready" || !c.can("POST /projects/:projectId/vendor-access/orders/:orderId/send") || c.locked) return;
    const body: VendorOrderAccessCommand = { action, expectedVendorVersion: item.vendorVersion, invitationId: item.invitation?.id ?? null, expectedInvitationVersion: item.invitation?.version ?? null, expectedOrderVersion: item.orderVersion, expectedOrderRevision: item.revision, expectedAccessVersion: item.version, idempotencyKey: createIdempotencyKey() };
    void command.execute(async () => check(await c.execution.sendAccess(projectId, item.orderId, body)));
  }
  function retry(item: VendorOrderAccess) {
    if (!item.canRetry || !item.id || item.version === null || item.readiness.state !== "ready" || !c.can("POST /projects/:projectId/vendor-access/:intentId/retry") || c.locked) return;
    const id = item.id; const body = { expectedVersion: item.version, idempotencyKey: createIdempotencyKey() };
    void command.execute(async () => check(await c.execution.retryAccess(projectId, id, body)));
  }
  return <Panel title="Vendor login access"><Text style={p.copy}>Email delivery and password setup for issued work.</Text><QueryState title="Vendor access" query={query} />{query.data && !query.isError && !data ? <ScopeMismatch /> : null}{data ? <><Text style={p.copy}>Delivery service: {label(data.readiness.state)}{data.readiness.reasonCode ? ` · ${label(data.readiness.reasonCode)}` : ""}</Text>{data.items.slice(offset, offset + 25).map(item => <Panel key={item.orderId} title={item.orderLabel}><Text style={p.copy}>{item.vendorName} · Revision {item.revision}</Text><Text style={p.copy}>Login: {label(item.access)} · Delivery: {label(item.state)}</Text>{item.invitation ? <Text style={p.copy}>Invitation: {label(item.invitation.status)} · Expires {dateTime(item.invitation.expiresAt)}</Text> : null}{item.sentAt ? <Text style={p.copy}>Sent {dateTime(item.sentAt)}</Text> : null}{item.cooldownUntil ? <Text style={p.copy}>Next delivery available {dateTime(item.cooldownUntil)}</Text> : null}{item.blockedReasonCode || item.failureCode ? <Text style={p.error}>{label(item.blockedReasonCode ?? item.failureCode ?? "")}</Text> : null}{c.can("POST /projects/:projectId/vendor-access/orders/:orderId/send") ? item.availableActions.filter(action => action in labels).map(action => <Button key={action} label={`${labels[action]} for ${item.orderLabel}`} variant="secondary" disabled={c.locked || query.isFetching || item.readiness.state !== "ready" || data.readiness.state !== "ready"} onPress={() => send(item, action)} />) : null}{item.canRetry && item.id && item.version !== null && c.can("POST /projects/:projectId/vendor-access/:intentId/retry") ? <Button label={`Retry delivery for ${item.orderLabel}`} variant="secondary" disabled={c.locked || query.isFetching || item.readiness.state !== "ready" || data.readiness.state !== "ready"} onPress={() => retry(item)} /> : null}</Panel>)}{!data.items.length ? <Text style={p.copy}>No issued work requires vendor access.</Text> : null}<Pager offset={offset} total={data.items.length} limit={25} onChange={value => c.navigate(() => setOffset(value))} /></> : null}<Button label="Refresh project vendor access" variant="quiet" disabled={c.locked || query.isFetching} onPress={() => void query.refetch()} /><CommandFeedback command={command} /></Panel>;
}

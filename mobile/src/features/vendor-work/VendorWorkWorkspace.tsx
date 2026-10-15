import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button } from "../../ui/primitives";
import { ExecutionSession } from "../execution/ExecutionWorkspace";
import { AccessLost, DeliveryFrame, label, p, Pager, Panel, QueryState, unavailable, useDeliveryContext, type DeliveryContext } from "../execution/executionNative";
import { VendorApprovedOrder } from "./VendorApprovedOrder";
export function VendorWorkWorkspace({ session, workId, embedded = false }: { session: AuthenticatedSession; workId?: string; embedded?: boolean }) {
  const c = useDeliveryContext(session);
  return <VendorSession key={`${c.scope}:${workId ?? ""}`} context={c} {...(workId ? { workId } : {})} embedded={embedded} />;
}
function VendorSession({ context: c, workId, embedded }: { context: DeliveryContext; workId?: string; embedded: boolean }) {
  const [tab, setTab] = useState<"execution" | "orders">("execution"); const [offset, setOffset] = useState(0); const [order, setOrder] = useState<{ id: string; projectId: string } | null>(null);
  const allowed = c.can("GET /vendor/work");
  const query = useQuery({ queryKey: c.key("issued-vendor-work", offset), queryFn: ({ signal }) => c.vendor.list(offset, signal), enabled: c.ready && allowed && tab === "orders", retry: false });
  if (!allowed && !c.can("GET /vendor/work/execution")) return <AccessLost title="Vendor work unavailable" />;
  return <DeliveryFrame embedded={embedded}><View style={p.row}><Button label="Execution tracker" variant={tab === "execution" ? "primary" : "secondary"} onPress={() => c.navigate(() => setTab("execution"))} /><Button label="Issued work orders" variant={tab === "orders" ? "primary" : "secondary"} onPress={() => c.navigate(() => setTab("orders"))} /></View>{tab === "execution" ? <ExecutionSession context={c} session={c.session} vendor embedded {...(workId ? { workId } : {})} /> : <>
    {order ? <><Button label="Back to issued work" variant="quiet" onPress={() => setOrder(null)} /><VendorApprovedOrder context={c} orderId={order.id} projectId={order.projectId} /></> : <>{unavailable(query.error) ? <AccessLost title="Issued work unavailable" /> : <><QueryState query={query} title="Issued work" />{!query.isError && query.data ? <>{query.data.items.map(work => <Panel key={work.id} title={work.itemName}><Text style={p.copy}>{work.roomName} · {work.sectionLabel} · Revision {work.orderRevision}</Text><Text style={p.copy}>{work.description}</Text><Text style={p.copy}>{label(work.status)} · {work.displayProgress}% ({label(work.progressSource)})</Text><Text style={p.copy}>Target: {work.targetDate ?? "Not set"} · {work.deliveryLocation ?? "Location not set"}</Text>{work.requestedChangeReason ? <Text style={p.error}>Changes requested: {work.requestedChangeReason}</Text> : null}{c.can("GET /vendor/purchase-orders/:orderId") ? <Button label={`View approved order for ${work.itemName}`} variant="secondary" onPress={() => setOrder({ id: work.orderId, projectId: work.projectId })} /> : null}</Panel>)}{!query.data.items.length ? <Text style={p.copy}>No issued work is assigned to this vendor account.</Text> : null}<Pager offset={query.data.offset} limit={query.data.limit} total={query.data.total} onChange={setOffset} /></> : null}</>}</>}
  </>}</DeliveryFrame>;
}

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { accessCommandError, accessDenied, deliveryNotice, uncertainAccessCommand, VendorAccessStatus, vendorAccessActionLabels, VendorReadinessMessage } from "../procurement/vendorAccessPresentation";
import { invalidateVendorAccess, type VendorAccessAction, type VendorOrderAccess, type VendorOrderAccessCommand, type VendorOrderAccessPage } from "../procurement/vendorLoginAccessApi";
import { executionKeys } from "./executionApi";
import "./vendor-access.css";

export type VendorAccessIntent = VendorOrderAccess;
export type VendorAccessPage = VendorOrderAccessPage;
export const vendorAccessKey = (projectId: string, userId: string) => [...executionKeys.all, "vendor-access", projectId, userId] as const;
export const vendorAccessApi = {
  list: (projectId: string, signal?: AbortSignal) => apiClient.get<VendorAccessPage>(`/projects/${encodeURIComponent(projectId)}/vendor-access`, { signal, showGlobalLoader: false }),
  send: (projectId: string, orderId: string, input: VendorOrderAccessCommand) => apiClient.post<VendorAccessPage>(`/projects/${encodeURIComponent(projectId)}/vendor-access/orders/${encodeURIComponent(orderId)}/send`, input, { showGlobalLoader: false }),
  retry: (projectId: string, intentId: string, expectedVersion: number, idempotencyKey: string) => apiClient.post<VendorAccessPage>(`/projects/${encodeURIComponent(projectId)}/vendor-access/${encodeURIComponent(intentId)}/retry`, { expectedVersion, idempotencyKey })
};
export function VendorAccessPanel({ projectId, orderId, orderLabel }: { projectId: string; orderId?: string; orderLabel?: string }) {
  const auth = useAuth();
  const allowed = hasFrontendPermission(auth.authorization, "execution.access.retry");
  const userId = auth.user?.id;
  return allowed && userId ? <VendorAccessSession key={`${projectId}:${userId}:${orderId ?? "all"}`} projectId={projectId} userId={userId} orderId={orderId} orderLabel={orderLabel} /> : null;
}
function VendorAccessSession({ projectId, userId, orderId, orderLabel }: { projectId: string; userId: string; orderId?: string; orderLabel?: string }) {
  const client = useQueryClient();
  const key = vendorAccessKey(projectId, userId);
  const [noticeOrderId, setNoticeOrderId] = useState<string | null>(null);
  const receipts = useRef(new Map<string, VendorOrderAccessCommand>());
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => vendorAccessApi.list(projectId, signal), enabled: Boolean(projectId), retry: false, gcTime: 0, staleTime: 15_000,
    refetchInterval: state => state.state.error ? false : state.state.data?.items.some(item => item.state === "queued" || item.state === "sending") ? 3_000 : 15_000, refetchIntervalInBackground: false });
  const send = useMutation({
    mutationFn: ({ orderId: targetId, input }: { orderId: string; input: VendorOrderAccessCommand }) => vendorAccessApi.send(projectId, targetId, input),
    onSuccess: async (page, command) => {
      if (page.items.some(item => item.projectId !== projectId)) throw new Error("The access response does not match this project.");
      receipts.current.delete(command.orderId); client.setQueryData(key, page);
      setNoticeOrderId(command.orderId);
      await invalidateVendorAccess(client);
    },
    onError: (error, command) => {
      if (!uncertainAccessCommand(error)) receipts.current.delete(command.orderId);
      if (error instanceof ApiError && [400, 401, 403, 404, 409, 422, 429].includes(error.status)) void query.refetch();
    }
  });
  useEffect(() => () => { void client.cancelQueries({ queryKey: vendorAccessKey(projectId, userId) }); client.removeQueries({ queryKey: vendorAccessKey(projectId, userId) }); }, [client, projectId, userId]);
  const denied = accessDenied(query.error) || accessDenied(send.error);
  const mismatched = query.data?.items.some(item => item.projectId !== projectId);
  const items = denied || mismatched ? [] : query.data?.items.filter(item => !orderId || item.orderId === orderId) ?? [];
  const noticeItem = items.find(item => item.orderId === noticeOrderId);
  function submit(item: VendorAccessIntent, action: VendorAccessAction) {
    let input = receipts.current.get(item.orderId);
    if (!input) {
      input = { action, expectedVendorVersion: item.vendorVersion, invitationId: item.invitation?.id ?? null, expectedInvitationVersion: item.invitation?.version ?? null,
        expectedOrderVersion: item.orderVersion, expectedOrderRevision: item.revision, expectedAccessVersion: item.version, idempotencyKey: crypto.randomUUID() };
      receipts.current.set(item.orderId, input);
    }
    setNoticeOrderId(null); send.mutate({ orderId: item.orderId, input });
  }
  async function refresh() {
    const result = await query.refetch();
    if (!result.error) { receipts.current.clear(); send.reset(); setNoticeOrderId(null); }
  }
  return <section className="vendor-access" aria-label="Vendor login access">
    <div className="vendor-access__header"><div><h2>Vendor login access</h2><p>Email delivery and password setup for issued work.</p></div><Button size="compact" variant="quiet" disabled={query.isFetching || send.isPending} onClick={() => void refresh()}>Refresh access</Button></div>
    {query.isPending ? <p role="status">Loading vendor access…</p> : null}
    {denied ? <p role="alert">Vendor access details are unavailable for your current access.</p> : mismatched ? <p role="alert">Project identity changed. Refresh access before sending.</p> : query.isError ? <p role="alert">{query.data ? "Vendor access details may be out of date. Refresh before sending." : "Vendor access details could not be loaded. Try refreshing."}</p> : null}
    {!denied && !mismatched && query.data ? <VendorReadinessMessage readiness={query.data.readiness} /> : null}
    {noticeItem && !query.isError ? <p role="status">{deliveryNotice(noticeItem)}</p> : null}
    {send.isError && !denied ? <p role="alert">{accessCommandError(send.error)}</p> : null}
    {!query.isPending && !query.isError && !items.length && !denied && !mismatched ? <p>No issued work is available for {orderId ? "this order" : "this project"}.</p> : null}
    <ul>{items.map(item => {
      const label = orderLabel && item.orderId === orderId ? orderLabel : item.orderLabel;
      const uncertain = send.isError && uncertainAccessCommand(send.error) && receipts.current.has(item.orderId);
      const disabled = send.isPending || query.isFetching || query.isError || item.readiness.state !== "ready";
      return <li key={item.orderId}>
        <div className="vendor-access__identity"><strong>{label}</strong><span>{item.vendorName}</span><small>Revision {item.revision}</small></div>
        <VendorAccessStatus access={item.access} delivery={item} invitation={item.invitation} blockedReasonCode={item.blockedReasonCode} />
        <div className="vendor-access__actions">{uncertain ? <Button size="compact" variant="secondary" disabled={disabled} aria-label={`Retry send request for ${label}`} onClick={() => { const input = receipts.current.get(item.orderId); if (input) send.mutate({ orderId: item.orderId, input }); }}>Retry send request</Button> : item.availableActions.map(action => <Button key={action} size="compact" variant="secondary" disabled={disabled} busy={send.isPending && send.variables.orderId === item.orderId} onClick={() => submit(item, action)} aria-label={`${vendorAccessActionLabels[action]} for ${label}`}>{vendorAccessActionLabels[action]}</Button>)}</div>
      </li>;
    })}</ul>
  </section>;
}

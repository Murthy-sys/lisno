import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { accessCommandError, accessDenied, deliveryNotice, uncertainAccessCommand, VendorAccessStatus, vendorAccessActionLabels, VendorReadinessMessage } from "./vendorAccessPresentation";
import { invalidateVendorAccess, vendorLoginAccessApi, vendorLoginAccessKeys, type VendorInvitationCommand, type VendorLoginAccess } from "./vendorLoginAccessApi";
import "../execution/vendor-access.css";

interface Props { vendorId: string; contactEditing?: boolean; onEditContact?: () => void }
type InvitationAction = "send_invitation" | "resend_invitation";
interface Receipt { action: InvitationAction; input: VendorInvitationCommand }

export function VendorLoginAccessPanel(props: Props) {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.vendor_access.read");
  const canManage = hasFrontendPermission(auth.authorization, "procurement.vendor_access.manage");
  const actorId = auth.user?.id;
  return canRead && actorId ? <VendorLoginAccessSession key={`${actorId}:${props.vendorId}:${canManage}`} {...props} actorId={actorId} canManage={canManage} /> : null;
}
function VendorLoginAccessSession({ vendorId, actorId, canManage, contactEditing, onEditContact }: Props & { actorId: string; canManage: boolean }) {
  const client = useQueryClient();
  const key = vendorLoginAccessKeys.detail(actorId, vendorId);
  const receipt = useRef<Receipt | null>(null);
  const [hasNotice, setHasNotice] = useState(false);
  const query = useQuery({
    queryKey: key, queryFn: ({ signal }) => vendorLoginAccessApi.get(vendorId, signal), retry: false, gcTime: 0, staleTime: 15_000,
    refetchInterval: state => state.state.error ? false : ["queued", "sending"].includes(state.state.data?.delivery.state ?? "") ? 3_000 : 15_000,
    refetchIntervalInBackground: false
  });
  const send = useMutation({
    mutationFn: (command: Receipt) => command.action === "resend_invitation" ? vendorLoginAccessApi.resend(vendorId, command.input) : vendorLoginAccessApi.send(vendorId, command.input),
    onSuccess: async result => {
      if (result.vendorId !== vendorId) throw new Error("The access response does not match this vendor.");
      receipt.current = null;
      client.setQueryData(key, result); setHasNotice(true);
      await invalidateVendorAccess(client);
    },
    onError: error => {
      if (!uncertainAccessCommand(error)) receipt.current = null;
      if (error instanceof ApiError && [400, 401, 403, 404, 409, 422, 429].includes(error.status)) void query.refetch();
    }
  });
  useEffect(() => () => {
    void client.cancelQueries({ queryKey: vendorLoginAccessKeys.detail(actorId, vendorId) });
    client.removeQueries({ queryKey: vendorLoginAccessKeys.detail(actorId, vendorId) });
  }, [client, actorId, vendorId]);
  const denied = accessDenied(query.error) || accessDenied(send.error);
  const detail = !denied && query.data?.vendorId === vendorId ? query.data : undefined;
  const mismatched = query.data && query.data.vendorId !== vendorId;
  async function refresh() {
    const result = await query.refetch();
    if (!result.error) { receipt.current = null; send.reset(); setHasNotice(false); }
  }
  function submit(action: InvitationAction, current: VendorLoginAccess) {
    receipt.current ??= { action, input: {
      expectedVendorVersion: current.vendorVersion, invitationId: current.invitation?.id ?? null,
      expectedInvitationVersion: current.invitation?.version ?? null, idempotencyKey: crypto.randomUUID()
    } };
    setHasNotice(false); send.mutate(receipt.current);
  }
  const uncertain = send.isError && uncertainAccessCommand(send.error) && receipt.current !== null;
  const disabled = send.isPending || query.isFetching || query.isError || contactEditing || detail?.readiness.state !== "ready";
  return <section className="vendor-access vendor-access--detail" aria-label="Vendor login access">
    <div className="vendor-access__header"><div><h2>Vendor login access</h2><p>Invite this vendor to set up a password and sign in.</p></div><Button size="compact" variant="quiet" disabled={query.isFetching || send.isPending} onClick={() => void refresh()}>Refresh access</Button></div>
    {query.isPending ? <p role="status">Loading vendor access…</p> : null}
    {denied ? <p role="alert">Vendor access details are unavailable for your current access.</p> : mismatched ? <p role="alert">Vendor identity changed. Refresh access before sending.</p> : query.isError ? <p role="alert">{query.data ? "Vendor access details may be out of date. Refresh before sending." : "Vendor access details could not be loaded. Try refreshing."}</p> : null}
    {hasNotice && detail && !query.isError ? <p role="status">{deliveryNotice(detail.delivery)}</p> : null}
    {send.isError && !denied ? <p role="alert">{accessCommandError(send.error)}</p> : null}
    {detail ? <>
      <VendorReadinessMessage readiness={detail.readiness} />
      <div className="vendor-access__detail-row">
        <div className="vendor-access__identity"><strong>Saved recipient</strong>{detail.recipient ? <><span>{detail.recipient.name}</span><span>{detail.recipient.email}</span></> : <span>Saved recipient is unavailable.</span>}{onEditContact ? <Button size="compact" variant="quiet" onClick={onEditContact}>Edit vendor contact</Button> : null}</div>
        <VendorAccessStatus access={detail.access} invitation={detail.invitation} delivery={detail.delivery} blockedReasonCode={detail.blockedReasonCode} />
        <div className="vendor-access__actions">{canManage ? uncertain ? <Button size="compact" variant="secondary" disabled={disabled} onClick={() => { if (receipt.current) send.mutate(receipt.current); }}>Retry send request</Button> : detail.availableActions.filter((action): action is InvitationAction => action === "send_invitation" || action === "resend_invitation").map(action => <Button key={action} size="compact" variant="secondary" disabled={disabled} busy={send.isPending} onClick={() => submit(action, detail)}>{vendorAccessActionLabels[action]}</Button>) : null}</div>
      </div>
      {contactEditing ? <p>Save or close vendor contact edits before sending an invitation.</p> : null}
    </> : null}
  </section>;
}

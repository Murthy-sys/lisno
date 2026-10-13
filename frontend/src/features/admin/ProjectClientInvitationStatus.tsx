import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { ApiError } from "../../api/client";
import {
  getProjectClientInvitation,
  projectClientInvitationKeys,
  resendProjectClientInvitation,
  revokeProjectClientInvitation,
  sendProjectClientInvitation,
  type ProjectClientInvitationStatus as InvitationStatus
} from "../../auth/projectClientInvitationsApi";
import { Button } from "../../components/ui/Button";
import { leadKeys } from "../leads/leadsApi";
import { adminProjectKeys } from "./adminProjectsApi";

const statusCopy: Record<InvitationStatus["status"], { title: string; message: string }> = {
  not_issued: { title: "Invitation not sent", message: "The project is ready. Send the client an invitation to join." },
  pending: { title: "Invitation sent", message: "The client can join this project using their email invitation." },
  delivery_failed: { title: "Invitation delivery failed", message: "The project is ready. Retry the invitation without creating another project." },
  expired: { title: "Invitation expired", message: "Send a new invitation so the client can join this project." },
  revoked: { title: "Invitation revoked", message: "The previous invitation can no longer be used." },
  accepted: { title: "Client has joined", message: "The client can share requirements and review estimates for this project." }
};

export function ProjectClientInvitationStatus({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const mutating = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: projectClientInvitationKeys.detail(projectId),
    queryFn: () => getProjectClientInvitation(projectId)
  });
  const mutation = useMutation({
    mutationFn: ({ action, version }: { action: "send" | "resend" | "revoke"; version: number }) =>
      action === "send" ? sendProjectClientInvitation(projectId)
        : action === "resend" ? resendProjectClientInvitation(projectId, version)
          : revokeProjectClientInvitation(projectId, version),
    onSuccess: async (status) => {
      queryClient.setQueryData(projectClientInvitationKeys.detail(projectId), status);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectClientInvitationKeys.detail(projectId) }),
        queryClient.invalidateQueries({ queryKey: adminProjectKeys.all }),
        queryClient.invalidateQueries({ queryKey: leadKeys.all })
      ]);
    },
    onError: async (error) => {
      setMessage(error instanceof ApiError && error.code === "VERSION_CONFLICT"
        ? "This invitation changed. Review the refreshed status before trying again."
        : error instanceof ApiError && error.code === "INVITATION_UNAVAILABLE"
          ? "Invitation delivery is currently unavailable. The project remains ready; please try again later."
          : error instanceof ApiError && error.code === "INVITATION_COOLDOWN"
            ? "An invitation was sent recently. Please wait before sending another."
            : "We couldn't update the invitation. Please refresh its status and try again.");
      await queryClient.invalidateQueries({ queryKey: projectClientInvitationKeys.detail(projectId) });
    },
    onSettled: () => { mutating.current = false; }
  });

  if (query.isPending) return <p role="status">Checking client invitation…</p>;
  if (query.isError || !query.data) return <section aria-label="Client invitation">
    <p role="alert">{query.error instanceof ApiError && query.error.status === 403
      ? "You don't have access to manage this project's invitation."
      : "Client invitation status is unavailable. Your project is still ready."}</p>
    <Button variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh invitation status</Button>
  </section>;

  const status = query.data;
  const deliveryUnavailable = !status.deliveryAvailable && status.status !== "accepted";
  const copy = statusCopy[status.status];
  const act = (action: "send" | "resend" | "revoke") => {
    if (mutating.current || query.isFetching || !status.availableActions.includes(action)) return;
    if (action !== "revoke" && !status.deliveryAvailable) return;
    mutating.current = true;
    setMessage(null);
    mutation.mutate({ action, version: status.expectedVersion });
  };

  return <section aria-label="Client invitation" style={{ display: "grid", gap: "var(--space-3)", minWidth: 0 }}>
    <div role="status" aria-live="polite">
      <strong>{deliveryUnavailable ? "Invitation unavailable" : copy.title}</strong>
      <p>{deliveryUnavailable ? "The project is ready. Email invitations are currently unavailable; refresh the status to check again." : copy.message}</p>
    </div>
    {message ? <p role="alert">{message}</p> : null}
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
      {status.availableActions.includes("send") ? <Button variant="secondary" disabled={mutation.isPending || query.isFetching || !status.deliveryAvailable} onClick={() => act("send")}>Send client invitation</Button> : null}
      {status.availableActions.includes("resend") ? <Button variant="secondary" disabled={mutation.isPending || query.isFetching || !status.deliveryAvailable} onClick={() => act("resend")}>Resend client invitation</Button> : null}
      {status.availableActions.includes("revoke") ? <Button variant="destructive-outline" disabled={mutation.isPending || query.isFetching} onClick={() => act("revoke")}>Revoke invitation</Button> : null}
      {deliveryUnavailable ? <Button variant="secondary" disabled={mutation.isPending || query.isFetching} onClick={() => void query.refetch()}>Refresh invitation status</Button> : null}
    </div>
  </section>;
}

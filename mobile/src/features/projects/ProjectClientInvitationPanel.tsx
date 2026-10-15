import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { z } from "zod";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";

const invitationSchema = z.object({ projectId: z.string(), status: z.enum(["not_issued", "pending", "delivery_failed", "expired", "revoked", "accepted"]), deliveryAvailable: z.boolean(), expectedVersion: z.number().int().nonnegative(), expiresAt: z.string().nullable(), sentAt: z.string().nullable(), acceptedAt: z.string().nullable(), availableActions: z.array(z.enum(["send", "resend", "revoke"])) });
type Invitation = z.infer<typeof invitationSchema>;
export function parseProjectInvitation(value: unknown, projectId: string): Invitation {
  const result = invitationSchema.safeParse(value);
  if (!result.success || result.data.projectId !== projectId) throw new ApiProtocolError();
  return result.data;
}
const labels = { send: "Send invitation", resend: "Resend invitation", revoke: "Revoke invitation" } as const;
export function ProjectClientInvitationPanel({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime(); const client = useQueryClient(); const [message, setMessage] = useState(""); const [confirmRevoke, setConfirmRevoke] = useState(false); const [refreshRequired, setRefreshRequired] = useState(false);
  const allowed = canPerformOperation(session, "GET /projects/:projectId/client-invitation");
  const key = privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "projects", "client-invitation", projectId);
  const path = `/projects/${encodeURIComponent(projectId)}/client-invitation`;
  const query = useQuery({ queryKey: key, queryFn: async ({ signal }) => parseProjectInvitation(await context.runtime.api.authenticated.get(path, { signal }), projectId), enabled: allowed });
  const mutation = useMutation({ retry: false, mutationFn: async (action: keyof typeof labels) => {
    if (!query.data || query.isError || refreshRequired || !query.data.availableActions.includes(action)) throw new Error("Refresh the current invitation status.");
    return parseProjectInvitation(await context.runtime.api.authenticated.post(action === "send" ? path : `${path}/${action}`, action === "send" ? {} : { expectedVersion: query.data.expectedVersion }), projectId);
  }, onSuccess: (data) => { client.setQueryData(key, data); setConfirmRevoke(false); setMessage(data.status === "delivery_failed" ? "Delivery failed. Check the invitation status before retrying." : "Invitation status updated."); }, onError: (cause) => {
    setRefreshRequired(true); setConfirmRevoke(false);
    if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) client.removeQueries({ queryKey: key });
    setMessage(cause instanceof ApiError ? cause.message : "The result could not be confirmed. Refresh the invitation status before taking another action.");
  } });
  if (!allowed) return null;
  const data = query.isError ? undefined : query.data;
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Client invitation</Text>
    {query.isPending ? <Text style={styles.copy}>Loading invitation status…</Text> : null}
    {query.isError ? <Text style={styles.error}>Invitation status is unavailable.</Text> : null}
    {data ? <><Text style={styles.status}>{data.status.replaceAll("_", " ")}</Text>
      {data.sentAt ? <Text style={styles.copy}>Sent {new Date(data.sentAt).toLocaleString()}</Text> : null}
      {data.expiresAt ? <Text style={styles.copy}>Expires {new Date(data.expiresAt).toLocaleString()}</Text> : null}
      {data.acceptedAt ? <Text style={styles.copy}>Joined {new Date(data.acceptedAt).toLocaleString()}</Text> : null}
      {!data.deliveryAvailable && data.status !== "accepted" ? <Text style={styles.copy}>Email delivery is unavailable. The project is saved; send the invitation when delivery is restored.</Text> : null}
      {data.availableActions.map((action) => <Button key={action} label={labels[action]} variant="secondary" disabled={mutation.isPending || refreshRequired || (action !== "revoke" && !data.deliveryAvailable)} onPress={() => action === "revoke" ? setConfirmRevoke(true) : mutation.mutate(action)} />)}
    </> : null}
    {confirmRevoke ? <><Text style={styles.copy}>Revoking prevents this invitation link from being used.</Text><Button label="Confirm revocation" loading={mutation.isPending} onPress={() => mutation.mutate("revoke")} /><Button label="Keep invitation" variant="quiet" disabled={mutation.isPending} onPress={() => setConfirmRevoke(false)} /></> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text> : null}
    <Button label="Refresh invitation status" variant="quiet" disabled={mutation.isPending} onPress={() => void query.refetch().then((result) => { if (result.isSuccess) setRefreshRequired(false); })} />
  </View>;
}
const styles = StyleSheet.create({ panel: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm }, title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17 }, status: { color: colors.primary, fontFamily: fonts.medium, fontSize: 14, textTransform: "capitalize" }, copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13 } });

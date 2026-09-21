import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";

import { ROLE_CODES } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { privateQueryKey } from "../../core/query/queryClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { isRecord } from "../workspace/recordPresentation";
import { UserInvitationCreate } from "./UserInvitationCreate";
import { UserInvitationList } from "./UserInvitationList";
import type { InvitableRole, UserInvitationSummary } from "./adminIdentityModel";

function invitationPage(value: unknown): { readonly items: readonly UserInvitationSummary[]; readonly roles: readonly InvitableRole[] } {
  if (!isRecord(value)) return { items: [], roles: [] };
  const roles = Array.isArray(value.invitableRoles) ? value.invitableRoles.filter((role): role is InvitableRole => typeof role === "string" && role !== "client" && role !== "super_admin" && (ROLE_CODES as readonly string[]).includes(role)) : [];
  const items = Array.isArray(value.items) ? value.items.filter((item): item is UserInvitationSummary => isRecord(item) && typeof item.id === "string" && typeof item.version === "number" && typeof item.name === "string" && typeof item.email === "string" && typeof item.mobile === "string" && typeof item.expiresAt === "string" && typeof item.role === "string" && Array.isArray(item.availableActions)) : [];
  return { items, roles };
}

export function AdminInvitationPanel({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime(); const canRead = session.authorization.permissions.includes("identity.user_invitations.read");
  const query = useQuery({ queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "users", "invitations"), queryFn: ({ signal }) => context.runtime.api.authenticated.get<unknown>("/admin/user-invitations?limit=100&offset=0", { signal }), enabled: canRead });
  if (!canRead) return null; const page = invitationPage(query.data);
  return <View style={styles.section}><View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Invitations</Text><Text style={styles.copy}>Delivery must succeed or queue before Lisno creates or replaces an invitation.</Text></View><UserInvitationCreate roles={page.roles} canCreate={session.authorization.permissions.includes("identity.user_invitations.create")} />{query.isPending ? <Text style={styles.copy}>Loading invitations…</Text> : null}{query.isError ? <Button label="Retry invitations" variant="secondary" onPress={() => void query.refetch()} /> : null}{!query.isPending && !query.isError ? <UserInvitationList invitations={page.items} canResend={session.authorization.permissions.includes("identity.user_invitations.resend")} canRevoke={session.authorization.permissions.includes("identity.user_invitations.revoke")} /> : null}</View>;
}

const styles = StyleSheet.create({ section: { gap: spacing.md }, heading: { gap: spacing.xs }, title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20 }, copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 } });

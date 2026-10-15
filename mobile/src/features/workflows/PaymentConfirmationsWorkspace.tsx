import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, StateView } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { useScaffoldNavigationBlocked } from "../../navigation/AdaptiveAppScaffold";
import { InitialPaymentAction } from "./WorkflowWorkspace";

export function PaymentConfirmationsWorkspace({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime(); const navigationBlocked = useScaffoldNavigationBlocked(); const allowed = canPerformOperation(session, "GET /design-workflow/payment-confirmations");
  const query = useQuery({ queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "workflow", "payment-confirmations"), queryFn: ({ signal }) => context.runtime.api.authenticated.get<Array<Record<string, unknown> & { projectId: string; projectName: string }>>("/design-workflow/payment-confirmations", { signal }), enabled: allowed && !navigationBlocked, refetchOnWindowFocus: false });
  if (!allowed) return <StateView tone="denied" title="Payment confirmations unavailable" message="This account cannot confirm initial payments." />;
  return <ScrollView contentContainerStyle={s.page}><Text accessibilityRole="header" style={s.title}>Initial payment confirmations</Text>
    {query.isPending ? <BrandLoader label="Loading payment confirmations" tone="dark" /> : query.isError ? <StateView tone="error" title="Payment status unavailable" message="Refresh before confirming a receipt." actionLabel="Retry" onAction={() => void query.refetch()} /> : <>
      {!query.data.length ? <StateView title="No pending confirmations" message="Projects ready for initial payment confirmation will appear here." /> : null}
      {query.data.map((project) => <View key={project.projectId} style={s.project}><Text style={s.name}>{project.projectName}</Text><InitialPaymentAction projectId={project.projectId} payment={project} refresh={() => void query.refetch()} /></View>)}
    </>}
    <Button label="Refresh confirmations" variant="secondary" disabled={navigationBlocked} onPress={() => void query.refetch()} />
  </ScrollView>;
}
const s = StyleSheet.create({ page: { padding: spacing.lg, gap: spacing.md }, title: { fontFamily: fonts.semibold, fontSize: 22, color: colors.ink }, name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }, project: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm } });

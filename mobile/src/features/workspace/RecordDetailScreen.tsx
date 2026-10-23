import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import type { FeatureDestination } from "../../navigation/registry";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, StateView } from "../../ui/primitives";
import { colors, fonts, radii, spacing, typography } from "../../ui/tokens";
import { FEATURE_DEFINITIONS } from "./featureDefinitions";
import { isRecord, recordFields, recordTitle } from "./recordPresentation";
import { ProjectFinanceWorkspace } from "../finance/FinanceWorkspace";
import { ManagementWorkspace } from "../management/ManagementWorkspace";
import { ExecutionWorkspace } from "../execution";
import { VendorWorkWorkspace } from "../vendor-work";
import { ProjectCompletionWorkspace } from "../completion";
import { StaffEstimateWorkspace } from "../estimate-authoring/StaffEstimateWorkspace";
import { ReviewDetailWorkspace } from "../reviews/ReviewQueueWorkspace";
import { MessagesWorkspace } from "../messages/MessagesWorkspace";
import { ProcurementProjectWorkspace } from "../procurement/ProcurementProjectWorkspace";
import { ProjectStructure } from "../projects/ProjectStructure";
import { projectDetailTheme } from "../projects/projectDetailTheme";
import { EvaluationWorkspace } from "../management/EvaluationWorkspace";

function displayedRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  for (const key of ["project", "lead", "task", "item", "user", "round"] as const) {
    if (isRecord(value[key])) return value[key];
  }
  return value;
}

export function RecordDetailScreen({ destination, recordId, session, initialProjectTab, initialMessageId }: { readonly destination: FeatureDestination; readonly recordId: string; readonly session: AuthenticatedSession; readonly initialProjectTab?: string | undefined; readonly initialMessageId?: string | undefined }) {
  if (destination.id === "finance") return <ScrollView contentContainerStyle={styles.content}><ProjectFinanceWorkspace projectId={recordId} session={session} /></ScrollView>;
  if (destination.id === "team") return <ManagementWorkspace subjectUserId={recordId} session={session} />;
  if (destination.id === "execution") return <ExecutionWorkspace projectId={recordId} session={session} />;
  if (destination.id === "vendor-work") return <VendorWorkWorkspace workId={recordId} session={session} />;
  if (destination.id === "project-completion") return <ProjectCompletionWorkspace projectId={recordId} session={session} />;
  if (destination.id === "client-responses" || destination.id === "design-approvals") return <ReviewDetailWorkspace roundId={recordId} session={session} kind={destination.id === "client-responses" ? "estimate" : "design"} />;
  if (destination.id === "leads") return <StaffEstimateWorkspace leadId={recordId} session={session} />;
  if (destination.id === "procurement") return <ProcurementProjectWorkspace projectId={recordId} session={session} />;
  if (destination.id === "messages") {
    return <MessagesWorkspace selectedProjectId={recordId} session={session} initialMessageId={initialMessageId ?? null} />;
  }
  return <GenericRecordDetailScreen destination={destination} recordId={recordId} session={session} initialProjectTab={initialProjectTab} />;
}

function GenericRecordDetailScreen({ destination, recordId, session, initialProjectTab }: { readonly destination: FeatureDestination; readonly recordId: string; readonly session: AuthenticatedSession; readonly initialProjectTab?: string | undefined }) {
  const context = useConfiguredRuntime();
  const definition = FEATURE_DEFINITIONS[destination.id];
  const endpoint = definition.detail?.(session.user.role, recordId) ?? null;
  const query = useQuery({
    queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, definition.family, "detail", recordId),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<unknown>(endpoint!, { signal }),
    enabled: Boolean(endpoint)
  });

  if (!endpoint) return <StateView title="Detail unavailable" message="This record does not expose a standalone detail view." />;
  if (query.isPending) return <View style={styles.center}><BrandLoader label={`Loading ${definition.title} detail`} tone="dark" /></View>;
  if (query.isError) {
    const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
    return <StateView tone={denied ? "denied" : "error"} title={denied ? "This record is unavailable" : "Detail could not be loaded"} message={denied ? "It may be outside your project scope or no longer available." : "Check your connection and try again."} actionLabel="Retry" onAction={() => void query.refetch()} />;
  }

  if (destination.id === "projects") {
    return (
      <ScrollView contentContainerStyle={[styles.content, styles.projectContent]}>
        {query.isRefetching ? <Text accessibilityLiveRegion="polite" style={styles.updating}>Updating…</Text> : null}
        <ProjectStructure data={query.data} session={session} onRefresh={() => void query.refetch()} initialTab={initialProjectTab} />
      </ScrollView>
    );
  }

  const record = displayedRecord(query.data);
  if (!record) return <StateView title="No detail available" message="The service returned no readable detail for this record." />;
  const fields = recordFields(record);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{definition.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{recordTitle(record, 0)}</Text>
      </View>
      <View style={styles.details}>
        {fields.map((field) => (
          <View key={field.key} style={styles.row}>
            <Text style={styles.label}>{field.label}</Text>
            <Text selectable style={styles.value}>{field.value}</Text>
          </View>
        ))}
      </View>
      {destination.id === "team" ? <EvaluationWorkspace subjectUserId={recordId} session={session} /> : null}
      {query.isRefetching ? <Text accessibilityLiveRegion="polite" style={styles.updating}>Updating…</Text> : null}
      <Button label="Refresh" variant="secondary" onPress={() => void query.refetch()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flexGrow: 1, width: "100%", maxWidth: 860, alignSelf: "center", padding: spacing.md, paddingBottom: spacing.huge, gap: spacing.md },
  projectContent: { maxWidth: projectDetailTheme.pageMaxWidth, gap: spacing.sm },
  heading: { gap: spacing.xs },
  eyebrow: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4 },
  title: { color: colors.ink, ...typography.pageTitle },
  details: { borderRadius: radii.surface, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { minHeight: 52, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 4 },
  label: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  value: { color: colors.ink, ...typography.body },
  updating: { color: colors.info, fontFamily: fonts.medium, fontSize: 12 }
});

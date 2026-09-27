import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import type { FeatureDestination } from "../../navigation/registry";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { StateView } from "../../ui/primitives";
import { colors, fonts, radii, spacing, typography } from "../../ui/tokens";
import { FEATURE_DEFINITIONS } from "./featureDefinitions";
import { dashboardMetrics, extractRecords, recordId, recordSubtitle, recordTitle } from "./recordPresentation";
import { OperationalTaskAction } from "../operations/OperationalTaskAction";
import { NotificationsScreen } from "../notifications/NotificationsScreen";
import { AccessRequestActions } from "../access/AccessRequestActions";
import { CreateAccessRequest } from "../access/CreateAccessRequest";
import { LeadCreateForm } from "../leads/LeadCreateForm";
import { ProxyDecisionAction } from "../reviews/ProxyDecisionAction";
import { clientEstimateListKey, getClientEstimates } from "../estimates/clientReviewApi";
import type { ClientEstimate } from "../estimates/clientReviewModel";
import { AdminInvitationPanel, ManagedUserActiveAction, type ManagedUserSummary } from "../admin";
import { KnowledgeCatalogWorkspace } from "../knowledge";
import { ProjectsWorkspace } from "../projects/ProjectsWorkspace";
import { MessagesWorkspace } from "../messages/MessagesWorkspace";
import { SuperAdminMobileDashboard } from "../dashboard/SuperAdminMobileDashboard";

function requestScope(context: ReturnType<typeof useConfiguredRuntime>, session: AuthenticatedSession) {
  return {
    environmentId: context.environment.environment.id,
    userId: session.user.id
  };
}

export function FeatureWorkspace({ destination, session }: { readonly destination: FeatureDestination; readonly session: AuthenticatedSession }) {
  if (destination.id === "dashboard") {
    return <SuperAdminMobileDashboard session={session} />;
  }
  if (destination.id === "messages") {
    return <MessagesWorkspace session={session} />;
  }
  if (destination.id === "configuration") {
    return <KnowledgeCatalogWorkspace session={session} />;
  }
  if (destination.id === "projects") {
    return <ProjectsWorkspace session={session} />;
  }
  if (destination.id === "estimates") {
    return <ClientEstimatesWorkspace session={session} />;
  }
  return <GenericFeatureWorkspace destination={destination} session={session} />;
}

const estimateMoney = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function clientEstimateStatus(estimate: ClientEstimate): string {
  if (estimate.status === "sent_to_client") return "Awaiting your decision";
  if (estimate.status === "client_changes_requested") return "Changes requested";
  return "Estimate approved";
}

function ClientEstimatesWorkspace({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const allowed = session.user.role === "client" && canPerformOperation(session, "GET /client/estimates");
  const query = useQuery({
    queryKey: clientEstimateListKey(requestScope(context, session)),
    queryFn: ({ signal }) => getClientEstimates(context.runtime, signal),
    enabled: allowed && context.environment.status === "ready"
  });

  if (!allowed) return <StateView tone="denied" title="Estimates unavailable" message="Your current account cannot open Client estimates." />;
  if (query.isPending) return <View style={styles.center}><BrandLoader label="Loading estimates" tone="dark" /></View>;
  if (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)) {
    return <StateView tone="denied" title="Estimates unavailable" message="Your current session cannot access this destination." actionLabel="Retry" onAction={() => void query.refetch()} />;
  }
  if (query.isError && !query.data) {
    const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
    return <StateView tone={denied ? "denied" : "error"} title={denied ? "Estimates unavailable" : "Estimates could not be loaded"}
      message={denied ? "Your current session cannot access this destination." : "Check your connection and try again."}
      actionLabel="Retry" onAction={() => void query.refetch()} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}>
      <View style={styles.headingBlock}>
        <Text style={styles.eyebrow}>CLIENT REVIEW</Text>
        <Text accessibilityRole="header" style={styles.title}>Estimates & design review</Text>
        <Text style={styles.description}>Open a published estimate to review its scope, decision, and shared designs.</Text>
        {query.isRefetching ? <Text accessibilityLiveRegion="polite" style={styles.updating}>Updating…</Text> : null}
      </View>
      {query.isRefetchError ? <StateView tone="error" title="Could not refresh estimates" message="The displayed list may be out of date. Refresh when the connection returns." actionLabel="Refresh" onAction={() => void query.refetch()} /> : null}
      {query.data?.length === 0 ? <StateView title="No published estimates" message="Estimates shared with this Client account will appear here." /> : null}
      <View style={styles.list}>
        {query.data?.map((estimate) => {
          const title = estimate.lead?.projectName?.trim() || `Estimate ${estimate.id}`;
          const location = estimate.lead?.location?.trim();
          return <Pressable key={estimate.id} testID={`client-estimate-${estimate.id}`} accessibilityRole="button"
            accessibilityLabel={`${title}, ${clientEstimateStatus(estimate)}, ${estimateMoney.format(estimate.total)}`}
            accessibilityHint="Opens estimate details and design review"
            onPress={() => router.push({ pathname: "/estimate/[estimateId]", params: { estimateId: estimate.id } })}
            style={({ pressed }) => [styles.record, styles.estimateRecord, pressed ? styles.recordPressed : null]}>
            <View style={styles.recordCopy}>
              <Text style={styles.recordTitle}>{title}</Text>
              {location ? <Text style={styles.recordSubtitle}>{location}</Text> : null}
              <Text style={styles.estimateStatus}>{clientEstimateStatus(estimate)}</Text>
            </View>
            <Text style={styles.estimateTotal}>{estimateMoney.format(estimate.total)}</Text>
          </Pressable>;
        })}
      </View>
    </ScrollView>
  );
}

function GenericFeatureWorkspace({ destination, session }: { readonly destination: FeatureDestination; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const definition = FEATURE_DEFINITIONS[destination.id];
  const endpoint = typeof definition.endpoint === "function" ? definition.endpoint(session.user.role) : definition.endpoint;
  const query = useQuery({
    queryKey: privateQueryKey(requestScope(context, session), definition.family, destination.id, endpoint),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<unknown>(endpoint, { signal }),
    enabled: context.environment.status === "ready"
  });

  if (query.isPending) {
    return <View style={styles.center}><BrandLoader label={`Loading ${definition.title}`} tone="dark" /></View>;
  }
  if (query.isError) {
    const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
    return (
      <StateView
        tone={denied ? "denied" : "error"}
        title={denied ? "This workspace is unavailable" : `${definition.title} could not be loaded`}
        message={denied ? "Your current session cannot access this destination." : "Check your connection and try again."}
        actionLabel="Retry"
        onAction={() => void query.refetch()}
      />
    );
  }

  if (destination.id === "notifications") {
    return <NotificationsScreen definition={definition} data={query.data} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />;
  }

  const records = extractRecords(query.data);
  const metrics = destination.id === "dashboard" ? dashboardMetrics(query.data) : [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.violet} />}
    >
      <View style={styles.headingBlock}>
        <Text style={styles.eyebrow}>{definition.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{definition.title}</Text>
        <Text style={styles.description}>{definition.description}</Text>
        {query.isRefetching ? <Text accessibilityLiveRegion="polite" style={styles.updating}>Updating…</Text> : null}
      </View>

      {destination.id === "access-self" && canPerformOperation(session, "POST /access-requests") ? <CreateAccessRequest role={session.user.role} /> : null}
      {destination.id === "leads" && canPerformOperation(session, "POST /leads") ? <LeadCreateForm /> : null}
      {destination.id === "users" ? <AdminInvitationPanel session={session} /> : null}

      {metrics.length > 0 ? (
        <View style={styles.metricGrid}>
          {metrics.map((metric) => (
            <View key={metric.key} style={styles.metric}>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {records.length === 0 && metrics.length === 0 ? (
        <StateView title={`No ${definition.title.toLowerCase()}`} message={definition.emptyMessage} />
      ) : (
        <View style={styles.list}>
          {records.map((record, index) => {
            const id = recordId(record);
            const detailEndpoint = id && definition.detail ? definition.detail(session.user.role, id) : null;
            return (
              <View key={id ?? `${destination.id}-${index}`} style={styles.record}>
                <Pressable
                  accessibilityRole={detailEndpoint ? "button" : "text"}
                  disabled={!detailEndpoint}
                  onPress={() => detailEndpoint && router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: destination.id, recordId: id! } })}
                  style={({ pressed }) => [styles.recordHeader, pressed ? styles.recordPressed : null]}
                >
                  <View style={styles.recordCopy}>
                    <Text style={styles.recordTitle}>{recordTitle(record, index)}</Text>
                    {recordSubtitle(record) ? <Text style={styles.recordSubtitle}>{recordSubtitle(record)}</Text> : null}
                  </View>
                  {detailEndpoint ? <Text accessibilityElementsHidden style={styles.chevron}>›</Text> : null}
                </Pressable>
                {destination.id === "work" ? <OperationalTaskAction record={record} role={session.user.role} /> : null}
                {destination.id === "access-self" && canPerformOperation(session, "POST /access-requests/:requestId/cancel") ? <AccessRequestActions record={record} mode="self" /> : null}
                {destination.id === "access-review" ? <AccessRequestActions record={record} mode="review" /> : null}
                {destination.id === "client-responses" && session.authorization.permissions.includes("estimation.client_response_tasks.decide") ? <ProxyDecisionAction record={record} queue="estimate" /> : null}
                {destination.id === "design-approvals" && session.authorization.permissions.includes("design.plan_response_tasks.decide") ? <ProxyDecisionAction record={record} queue="design" /> : null}
                {destination.id === "users" && typeof record.id === "string" && typeof record.name === "string" && typeof record.email === "string" && typeof record.active === "boolean" && typeof record.version === "number" ? <ManagedUserActiveAction user={record as unknown as ManagedUserSummary} canUpdate={session.authorization.permissions.includes("identity.users.update")} /> : null}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flexGrow: 1, width: "100%", maxWidth: 980, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.xl },
  headingBlock: { gap: spacing.xs },
  eyebrow: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4 },
  title: { color: colors.ink, ...typography.pageTitle },
  description: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, maxWidth: 680 },
  updating: { color: colors.info, fontFamily: fonts.medium, fontSize: 12 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: { minWidth: 142, flexGrow: 1, flexBasis: 142, borderRadius: radii.surface, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  metricValue: { color: colors.midnight, fontFamily: fonts.semibold, fontSize: 24 },
  metricLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12 },
  list: { gap: spacing.sm },
  record: { minHeight: 72, borderRadius: radii.surface, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  recordHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.md },
  recordPressed: { opacity: 0.72, borderColor: colors.violet },
  recordCopy: { flex: 1, gap: 4 },
  recordTitle: { color: colors.ink, ...typography.cardTitle },
  recordSubtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12 },
  chevron: { color: colors.violet, fontFamily: fonts.regular, fontSize: 30 },
  estimateRecord: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  estimateStatus: { color: colors.primary, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  estimateTotal: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24, fontVariant: ["tabular-nums"] }
});

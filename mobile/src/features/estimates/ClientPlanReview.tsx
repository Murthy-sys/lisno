import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, StateView } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { clientPlanWorkspaceKey, getClientPlanWorkspace } from "./clientReviewApi";
import { canEditClientPlan, canViewClientPlan, type ClientEstimate, type ClientPlanPage } from "./clientReviewModel";
import { orderedPlanUploads, planRequestForPage, planReviewIsAwaiting } from "./clientPlanReviewModel";
import { ClientPlanPageViewer } from "./ClientPlanPageViewer";

const PAGE_STATUS: Readonly<Record<ClientPlanPage["status"], string>> = {
  awaiting_review: "Awaiting review",
  changes_requested: "Changes requested",
  revised: "Revised plan",
  approved: "Approved"
};

export function ClientPlanReview({ estimate, session }: { readonly estimate: ClientEstimate; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const canRead = session.user.role === "client" && canPerformOperation(session, "GET /client/estimates/:estimateId/plan-review");
  const canOpenImage = canPerformOperation(session, "GET /client/estimate-plan-pages/:pageId/current-image");
  const visibleState = canViewClientPlan(estimate);
  const editableState = canEditClientPlan(estimate);
  const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  const query = useQuery({
    queryKey: clientPlanWorkspaceKey(scope, estimate.id),
    queryFn: ({ signal }) => getClientPlanWorkspace(context.runtime, estimate.id, signal),
    enabled: canRead && visibleState && context.environment.status === "ready"
  });

  if (session.user.role !== "client" || !canRead) {
    return <StateView tone="denied" title="Design plan unavailable" message="Your current account cannot open this Client design plan." />;
  }
  const awaiting = !visibleState || planReviewIsAwaiting(query.error);
  if (awaiting && !(selectedPageId && query.data)) {
    return <StateView title="Design plan awaited" message="A design plan has not been submitted for your review yet." />;
  }
  if (context.environment.status !== "ready") {
    return <StateView tone="error" title="Design plan unavailable" message="Connect to the service to load this design plan." />;
  }
  if (query.isPending) return <BrandLoader label="Loading uploaded plans" tone="dark" />;
  if (query.error instanceof ApiError && [401, 403, 404].includes(query.error.status)) {
    return <StateView tone="denied" title="Design plan unavailable" message="This design plan is outside your current access." actionLabel="Retry" onAction={() => void query.refetch()} />;
  }
  if (query.isError && !query.data) {
    return <StateView tone="error" title="Design plan could not be loaded" message="Check your connection and try again." actionLabel="Retry" onAction={() => void query.refetch()} />;
  }
  if (!query.data) return null;

  const uploads = orderedPlanUploads(query.data);
  const selectedPage = selectedPageId ? query.data.pages.find((page) => page.id === selectedPageId) : undefined;
  const selectedUpload = selectedPage ? uploads.find((upload) => upload.id === selectedPage.uploadId) : undefined;

  return (
    <View testID={`client-plan-review-${estimate.id}`} style={styles.root}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Uploaded design plans</Text>
        <Text style={styles.copy}>{awaiting ? "The current plan is no longer open for Client review. Your unsent editor marks remain visible until you close it." : editableState ? "Open a page to inspect it, mark changes, or save a draft." : "Approved plan pages are available to inspect."}</Text>
      </View>
      {query.isRefetchError && !awaiting ? <View style={styles.notice}><Text accessibilityLiveRegion="assertive" style={styles.error}>The latest plan could not be loaded. This list may be out of date.</Text><Button label="Refresh plans" variant="quiet" onPress={() => void query.refetch()} /></View> : null}
      {uploads.length === 0 ? <Text style={styles.empty}>No design plan has been shared yet.</Text> : (
        <View style={styles.uploads}>
          {uploads.map((upload) => <View key={upload.id} style={styles.upload}>
            <View style={styles.uploadHeading}>
              <Text accessibilityRole="header" style={styles.uploadName}>{upload.originalFilename}</Text>
              <Text style={styles.meta}>{upload.pages.length} {upload.pages.length === 1 ? "page" : "pages"}</Text>
            </View>
            {upload.pages.length === 0 ? <Text style={styles.empty}>This upload has no pages available to view.</Text> : upload.pages.map((page) => {
              const request = planRequestForPage(query.data!, page.id);
              return <View key={page.id} style={styles.pageRow}>
                <View style={styles.pageCopy}>
                  <Text style={styles.pageTitle}>Page {page.pageNumber}</Text>
                  <Text style={styles.meta}>{PAGE_STATUS[page.status]}{request && request !== "ambiguous" ? " · Open change request" : ""}</Text>
                </View>
                {canOpenImage ? <View style={styles.openAction}><Button label={`Open ${upload.originalFilename}, page ${page.pageNumber}`} variant="secondary" size="compact" onPress={() => setSelectedPageId(page.id)} /></View> : <Text style={styles.meta}>Image access unavailable</Text>}
              </View>;
            })}
          </View>)}
        </View>
      )}
      <View style={styles.refreshAction}><Button label="Refresh plans" variant="quiet" loading={query.isRefetching} onPress={() => void query.refetch()} /></View>
      {selectedPage && selectedUpload ? <ClientPlanPageViewer key={selectedPage.id} estimate={estimate} session={session} workspace={query.data} page={selectedPage} uploadName={selectedUpload.originalFilename} siblingPages={selectedUpload.pages} reviewAvailable={!awaiting} onClose={() => setSelectedPageId(null)} onSelectPage={setSelectedPageId} onRefresh={async () => { const result = await query.refetch(); if (result.isError) throw result.error; }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md, minWidth: 0 },
  heading: { gap: 3 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  uploads: { gap: spacing.sm },
  upload: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, minWidth: 0 },
  uploadHeading: { gap: 2, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  uploadName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21 },
  meta: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  pageRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, minHeight: 60, padding: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pageCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 150, gap: 2 },
  pageTitle: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  openAction: { flexGrow: 0, minWidth: 120 },
  empty: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, padding: spacing.sm },
  notice: { gap: spacing.xs, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  refreshAction: { alignSelf: "flex-start", minWidth: 120 }
});

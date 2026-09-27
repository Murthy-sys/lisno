import { StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { BrandLoader } from "../../ui/brand";
import { Button } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { useClientProjectEstimates } from "./ClientProjectEstimatePanel";
import { ProjectDocuments } from "./ProjectDocuments";

const statusLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function ClientProjectDocuments({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const { allowed, query, estimates } = useClientProjectEstimates(projectId, session);
  const unavailable = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const estimateDocuments = estimates.map((estimate) => ({ id: estimate.id, statusLabel: statusLabel(estimate.status) }));
  return (
    <View style={styles.stack}>
      {allowed && query.isPending ? <BrandLoader label="Loading linked estimate PDFs" tone="dark" /> : null}
      {allowed && query.isError ? (
        <View style={styles.notice}>
          <Text accessibilityLiveRegion="assertive" style={styles.copy}>{unavailable ? "Linked estimate PDFs are unavailable for this account." : "Linked estimate PDFs could not be loaded. Approved design files may still be available below."}</Text>
          {!unavailable ? <View style={styles.action}><Button label="Retry estimate PDFs" variant="secondary" onPress={() => void query.refetch()} /></View> : null}
        </View>
      ) : null}
      <ProjectDocuments projectId={projectId} estimate={estimateDocuments} session={session} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md, minWidth: 0 },
  notice: { gap: spacing.sm, minWidth: 0, padding: spacing.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  action: { alignSelf: "flex-start", minWidth: 140 }
});

import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { Button } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import { clientEstimatePdfPath } from "./clientReviewApi";
import { clientEstimateMoney, publishedMoney, type ClientEstimate, type ClientEstimateSnapshot } from "./clientReviewModel";

export function PublishedEstimateItems({ snapshot }: { readonly snapshot: ClientEstimateSnapshot }) {
  const groups = new Map<string, { title: string; lines: ClientEstimateSnapshot["lineItems"] }>();
  for (const line of snapshot.lineItems.filter((item) => item.included)) {
    const key = line.source === "configuration" ? line.mainBasketId ?? "configured" : "legacy";
    const group = groups.get(key) ?? { title: line.source === "configuration" ? line.mainBasketName ?? "Configured items" : "Included items", lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  return <View style={styles.groups}>
    {groups.size === 0 ? <Text style={styles.copy}>No item breakdown is available in this submitted estimate.</Text> : null}
    {[...groups].map(([id, group]) => <View key={id} style={styles.group}>
      <Text accessibilityRole="header" style={styles.groupTitle}>{group.title}</Text>
      {group.lines.map((line, index) => {
        const rate = publishedMoney(line.rate, line.ratePaise);
        const amount = publishedMoney(line.amount, line.amountPaise);
        return <View key={line.id ?? `${line.catalogueId ?? "line"}-${index}`} testID={`estimate-line-${id}-${index}`} style={styles.line}>
          <View style={styles.lineCopy}>
            <Text style={styles.name}>{line.mainLineName || line.roomName || `Included item ${index + 1}`}</Text>
            {line.mainLineName && line.roomName ? <Text style={styles.copy}>{line.roomName}</Text> : null}
            {line.subBasketName ? <Text style={styles.copy}>{line.subBasketName}</Text> : null}
            {line.itemType === "temporary" ? <Text style={styles.copy}>Temporary item</Text> : null}
            {line.specification ? <Text style={styles.copy}>{line.specification}</Text> : null}
            {line.estimateNotes?.map((note, noteIndex) => <Text key={noteIndex} style={styles.copy}>{note}</Text>)}
            {line.dimensions ? <Text style={styles.copy}>Recorded dimensions: L {line.dimensions.length} × W {line.dimensions.width} × H {line.dimensions.height}{line.dimensionRule ? ` ${line.dimensionRule.inputUnit}` : ""}{line.dimensionsMandatory ? "; quantity = L × W" : ""}</Text> : null}
            <Text style={styles.copy}>{line.quantity} {line.uomName ?? line.unit ?? ""} × {rate === null ? "Rate unavailable" : clientEstimateMoney(rate)}</Text>
          </View>
          <Text style={styles.amount}>{amount === null ? "Amount unavailable" : clientEstimateMoney(amount)}</Text>
        </View>;
      })}
    </View>)}
  </View>;
}

export function ClientPreEstimateComparison({ estimate, session }: { readonly estimate: ClientEstimate; readonly session: AuthenticatedSession }) {
  const [expanded, setExpanded] = useState(false);
  const [pdfRoundId, setPdfRoundId] = useState<string | null>(null);
  const before = estimate.preApprovedReview;
  const after = estimate.publishedReview;
  const changes = estimate.changesFromPre;
  if (after?.phase !== "post") return null;
  if (!before || !changes) return <Text accessibilityLiveRegion="polite" style={styles.copy}>The comparison with your approved pre-estimate is unavailable. Ask your team to verify it before approving.</Text>;
  const describe = (snapshot: ClientEstimateSnapshot, id: string) => {
    const line = snapshot.lineItems.find((item) => item.id === id);
    return line ? `${line.mainLineName ?? line.specification ?? "Estimate item"} · ${line.roomName ?? ""} · ${line.quantity} ${line.uomName ?? line.unit ?? ""}` : "Item details unavailable";
  };
  const canDownload = session.user.role === "client" && canPerformOperation(session, "GET /client/estimates/:estimateId/pdf");
  const pdfOpen = pdfRoundId === before.reviewRoundId;
  return <View style={styles.comparison}>
    <Text accessibilityRole="header" style={styles.groupTitle}>{changes.noChanges ? "No changes from pre-estimate" : "Changes from your approved pre-estimate"}</Text>
    <Text style={styles.copy}>Pre-estimate: {clientEstimateMoney(publishedMoney(before.snapshot.total, before.snapshot.totalPaise))}</Text>
    <Text style={styles.copy}>Final submitted estimate: {clientEstimateMoney(estimate.total)}</Text>
    {changes.scopeChanged ? <Text style={styles.copy}>Room or scope details have changed. Review the submitted scope before approving.</Text> : null}
    {changes.addedLineIds.map((id) => <Text key={`added-${id}`} style={styles.copy}>Added: {describe(after.snapshot, id)}</Text>)}
    {changes.removedLineIds.map((id) => <Text key={`removed-${id}`} style={styles.copy}>Removed: {describe(before.snapshot, id)}</Text>)}
    {changes.changedLineIds.map((id) => <Text key={`changed-${id}`} style={styles.copy}>Updated: {describe(after.snapshot, id)}. Previously: {describe(before.snapshot, id)}.</Text>)}
    <Button label={`${expanded ? "Hide" : "View"} approved pre-estimate · Version ${before.estimateVersion}`} variant="quiet" onPress={() => setExpanded((value) => !value)} />
    {expanded ? <View style={styles.group}>
      <PublishedEstimateItems snapshot={before.snapshot} />
      <Text style={styles.copy}>Subtotal: {clientEstimateMoney(publishedMoney(before.snapshot.subtotal, before.snapshot.subtotalPaise))}</Text>
      <Text style={styles.copy}>GST: {clientEstimateMoney(publishedMoney(before.snapshot.gst, before.snapshot.gstPaise))}</Text>
      {canDownload ? <Button label="Open approved pre-estimate PDF" variant="secondary" onPress={() => setPdfRoundId(before.reviewRoundId)} /> : null}
    </View> : null}
    {canDownload ? <ProtectedDocumentViewer visible={pdfOpen} source={pdfOpen ? {
      path: clientEstimatePdfPath(estimate.id, before.reviewRoundId), fileName: `lisno-pre-estimate-${estimate.id}.pdf`, mimeType: "application/pdf", kind: "estimate-pdf"
    } : null} onClose={() => setPdfRoundId(null)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  groups: { gap: spacing.md },
  group: { gap: spacing.sm },
  groupTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  comparison: { gap: spacing.sm, paddingVertical: spacing.sm },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  lineCopy: { flexGrow: 1, flexBasis: 160, minWidth: 0, gap: 3 },
  name: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 19 },
  amount: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] }
});

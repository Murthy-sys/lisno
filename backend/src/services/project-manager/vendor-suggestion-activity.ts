import type { ClientSession } from "mongoose";
import type { PMApprovedSourceRef, PMVendorBidActivity, PMVendorSuggestion } from "../../contracts/project-manager-estimates.js";
import { ProcurementBasketEnquiryModel, ProcurementBasketBoqRevisionModel, ProcurementBasketInvitationModel,
  ProcurementBasketBidModel, ProcurementBasketSourceReconciliationModel } from "../../models/ProcurementBasketTender.js";
import type { PMRow } from "./common.js";

type Activity = PMVendorSuggestion["activity"];
const MAX_ENQUIRIES = 250, MAX_REVISIONS = 1000, MAX_INVITATIONS = 2000, MAX_EVENTS = 20;
const empty = (availability: Activity["availability"] = "available", truncated = false): Activity => ({ availability, items: [], truncated });

/** Safe, bounded joins; a basket request only counts when its immutable BOQ contains the recommended line. */
export async function readPMVendorSuggestionActivity(projectId: string, suggestions: PMVendorSuggestion[],
  session: ClientSession, at: Date): Promise<Map<string, Activity>> {
  const result = new Map(suggestions.map(item => [item.id, empty("unavailable")]));
  const targets = suggestions.filter(item => item.projectId === projectId && item.scope === "main_line" && item.source && item.mainLine);
  if (!targets.length) return result;
  const basketIds = [...new Set(targets.map(item => item.mainLine!.mainBasketId).filter((id): id is string => !!id))];
  const vendorIds = [...new Set(targets.map(item => item.vendor.id))];
  const enquiries = await ProcurementBasketEnquiryModel.find({ projectId, mainBasketId: { $in: basketIds } })
    .select({ projectId: 1, mainBasketId: 1 }).sort({ _id: 1 }).limit(MAX_ENQUIRIES + 1).session(session).lean();
  const enquiryById = new Map(enquiries.slice(0, MAX_ENQUIRIES).map(row => [String(row._id), row]));
  const revisionRows = await ProcurementBasketBoqRevisionModel.find({ projectId, mainBasketId: { $in: basketIds },
    enquiryId: { $in: [...enquiryById.keys()] }, "lines.mainLineId": { $in: targets.map(item => item.mainLine!.mainLineId) } })
    .select({ projectId: 1, mainBasketId: 1, enquiryId: 1, revision: 1, estimateSource: 1, preparationSource: 1,
      digest: 1, sentAt: 1, "lines.id": 1, "lines.mainLineId": 1, "lines.sourceLineItemKey": 1 })
    .sort({ sentAt: -1, _id: -1 }).limit(MAX_REVISIONS + 1).session(session).lean();
  const revisions = revisionRows.slice(0, MAX_REVISIONS).filter(row => enquiryById.get(String(row.enquiryId))?.mainBasketId === row.mainBasketId);
  const revisionById = new Map<string, PMRow>(revisions.map(row => [String(row._id), row]));
  const reconciliationRows = await ProcurementBasketSourceReconciliationModel.find({ projectId,
    boqRevisionId: { $in: [...revisionById.keys()] },
    "preparationSource.sourceSnapshotId": { $in: targets.map(item => item.source!.sourceSnapshotId).filter(Boolean) } })
    .select({ projectId: 1, mainBasketId: 1, enquiryId: 1, boqRevisionId: 1, boqDigest: 1,
      previousEstimateSource: 1, preparationSource: 1, unchangedLineKeys: 1 })
    .sort({ _id: -1 }).limit(MAX_REVISIONS + 1).session(session).lean();
  const reconciliations = reconciliationRows.slice(0, MAX_REVISIONS);
  const invitationRows = await ProcurementBasketInvitationModel.find({ projectId, mainBasketId: { $in: basketIds },
    boqRevisionId: { $in: [...revisionById.keys()] }, vendorId: { $in: vendorIds } })
    .select({ projectId: 1, mainBasketId: 1, enquiryId: 1, boqRevisionId: 1, vendorId: 1, requestedAt: 1,
      sentAt: 1, status: 1, expiresAt: 1, receiptBidId: 1 })
    .sort({ requestedAt: -1, _id: -1 }).limit(MAX_INVITATIONS + 1).session(session).lean();
  const invitations = invitationRows.slice(0, MAX_INVITATIONS);
  const bidIds = invitations.flatMap(row => row.receiptBidId ? [String(row.receiptBidId)] : []);
  const bids = bidIds.length ? await ProcurementBasketBidModel.find({ _id: { $in: bidIds }, projectId })
    .select({ projectId: 1, mainBasketId: 1, enquiryId: 1, boqRevisionId: 1, invitationId: 1, vendorId: 1,
      submittedAt: 1, "lines.boqLineId": 1 }).limit(MAX_INVITATIONS).session(session).lean() : [];
  const bidById = new Map<string, PMRow>(bids.map(row => [String(row._id), row]));
  const truncated = enquiries.length > MAX_ENQUIRIES || revisionRows.length > MAX_REVISIONS ||
    reconciliationRows.length > MAX_REVISIONS || invitationRows.length > MAX_INVITATIONS;
  for (const suggestion of targets) {
    const activity = empty("available", truncated);
    const scope = suggestion.mainLine!;
    const expectedKeys = new Set(scope.occurrences.map(line => line.sourceLineItemKey));
    for (const invitation of invitations) {
      if (invitation.vendorId !== suggestion.vendor.id || invitation.mainBasketId !== scope.mainBasketId) continue;
      const revision = revisionById.get(String(invitation.boqRevisionId));
      if (!revision || revision.enquiryId !== invitation.enquiryId || revision.mainBasketId !== invitation.mainBasketId) continue;
      let coveredLines: PMRow[] = (revision.lines as PMRow[]).filter(line => line.mainLineId === scope.mainLineId && expectedKeys.has(line.sourceLineItemKey));
      if (!coveredLines.length) continue;
      const source = suggestion.source!;
      let sourceRelation: PMVendorBidActivity["sourceRelation"] = "exact";
      if (!revisionMatchesPMSource(revision, source)) {
        const proof = reconciliations.find(row => row.projectId === projectId && row.mainBasketId === revision.mainBasketId &&
          row.enquiryId === revision.enquiryId && row.boqRevisionId === revision._id && row.boqDigest === revision.digest &&
          estimateIdentityEqual(row.previousEstimateSource, revision.estimateSource) && preparationMatchesPMSource(row.preparationSource, source));
        if (!proof) continue;
        const retained = new Set(proof.unchangedLineKeys ?? []);
        coveredLines = coveredLines.filter(line => retained.has(line.sourceLineItemKey));
        if (!coveredLines.length) continue;
        sourceRelation = "reconciled_history";
      }
      const requestedAt = iso(invitation.requestedAt);
      if (!requestedAt || !Number.isSafeInteger(revision.revision)) { activity.availability = "unavailable"; continue; }
      const receipt = invitation.receiptBidId ? bidById.get(String(invitation.receiptBidId)) : undefined;
      const bid = receipt && receipt.projectId === projectId && receipt.mainBasketId === invitation.mainBasketId &&
        receipt.enquiryId === invitation.enquiryId && receipt.boqRevisionId === invitation.boqRevisionId &&
        receipt.invitationId === invitation._id && receipt.vendorId === invitation.vendorId ? receipt : null;
      if (invitation.status === "consumed" && (!bid || !iso(bid.submittedAt))) activity.availability = "unavailable";
      const responseIds = new Set<string>((bid?.lines ?? []).map((line: PMRow) => String(line.boqLineId)));
      const respondedSourceLineItemKeys = [...new Set(coveredLines.filter(line => responseIds.has(String(line.id))).map(line => String(line.sourceLineItemKey)))];
      const coveredSourceLineItemKeys = [...new Set(coveredLines.map(line => String(line.sourceLineItemKey)))];
      const status = deliveryStatus(invitation, at);
      if (!status) { activity.availability = "unavailable"; continue; }
      activity.items.push({ enquiryId: String(invitation.enquiryId), basketId: String(invitation.mainBasketId),
        revisionId: String(invitation.boqRevisionId), revision: Number(revision.revision), invitationId: String(invitation._id),
        requestedAt, deliveryStatus: status, deliveredAt: iso(invitation.sentAt), bidReceivedAt: bid ? iso(bid.submittedAt) : null,
        lineResponded: respondedSourceLineItemKeys.length > 0, respondedSourceLineItemKeys, coveredSourceLineItemKeys,
        coverage: coveredSourceLineItemKeys.length === expectedKeys.size ? "full" : "partial", sourceRelation });
      if (activity.items.length > MAX_EVENTS) { activity.truncated = true; activity.items.pop(); break; }
    }
    // A bounded scan cannot establish absence beyond the scanned history.
    if (!activity.items.length && activity.truncated) activity.availability = "unavailable";
    result.set(suggestion.id, activity);
  }
  return result;
}

export function estimateIdentityEqual(a: PMRow | null | undefined, b: PMRow | null | undefined): boolean {
  return !!a && !!b && a.estimateId === b.estimateId && a.estimateVersion === b.estimateVersion &&
    (a.estimateReviewRoundId ?? null) === (b.estimateReviewRoundId ?? null);
}
export function preparationMatchesPMSource(preparation: PMRow | null | undefined, source: PMApprovedSourceRef): boolean {
  return !!preparation && source.phase !== "legacy" && estimateIdentityEqual(preparation, source) &&
    preparation.phase === source.phase && preparation.sourceSnapshotId === source.sourceSnapshotId &&
    preparation.sourceDigest === source.sourceDigest && preparation.workflowVersion === 2 &&
    preparation.kind === (source.phase === "pre" ? "approved_pre" : "approved_final");
}
export function revisionMatchesPMSource(revision: PMRow, source: PMApprovedSourceRef): boolean {
  return estimateIdentityEqual(revision.estimateSource, source) && (source.phase === "legacy"
    ? revision.preparationSource == null : preparationMatchesPMSource(revision.preparationSource, source));
}
function iso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function deliveryStatus(row: PMRow, at: Date): PMVendorBidActivity["deliveryStatus"] | null {
  const status = row.status;
  if (!["pending", "sent", "failed", "expired", "consumed", "superseded", "revoked"].includes(status)) return null;
  if (["pending", "sent"].includes(status) && new Date(row.expiresAt).getTime() <= at.getTime()) return "expired";
  if (status === "pending" && at.getTime() - new Date(row.requestedAt).getTime() >= 10 * 60 * 1000) return "stalled";
  return status;
}

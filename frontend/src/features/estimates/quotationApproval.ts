import type {
  CurrentQuotationApprovalStatus,
  QuotationApprovalState
} from "../../api/types";

export function currentQuotationApprovalState(
  value: CurrentQuotationApprovalStatus | null | undefined
): QuotationApprovalState {
  return value?.quotationApprovalState ?? "source_issue";
}

export function currentQuotationIsApproved(
  value: CurrentQuotationApprovalStatus | null | undefined
) {
  const state = currentQuotationApprovalState(value);
  const expectedSource = state === "initial_current"
    ? "initial_unchanged"
    : state === "revision_current"
      ? "designer_revision"
      : null;
  const approval = value?.currentQuotationApproval;
  return value?.currentQuotationApproved === true &&
    value.requiresClientReapproval === false &&
    expectedSource != null &&
    approval != null &&
    value.quotationApprovalSource === expectedSource &&
    approval.kind === expectedSource &&
    typeof approval.reviewRoundId === "string" &&
    approval.reviewRoundId.trim().length > 0 &&
    Number.isSafeInteger(approval.estimateVersion) &&
    approval.estimateVersion > 0 &&
    typeof approval.approvedAt === "string" &&
    Number.isFinite(Date.parse(approval.approvedAt));
}

export function quotationApprovalNeedsClient(
  value: CurrentQuotationApprovalStatus | null | undefined
) {
  const state = currentQuotationApprovalState(value);
  return value?.requiresClientReapproval === true &&
    value.currentQuotationApproved === false &&
    value.quotationApprovalSource === null &&
    value.currentQuotationApproval === null &&
    (state === "revision_draft" ||
      state === "revision_pending_client" ||
      state === "revision_changes_requested");
}

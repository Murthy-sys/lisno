import { describe, expect, it } from "vitest";

import type { CurrentQuotationApprovalStatus } from "../../api/types";
import {
  currentQuotationApprovalState,
  currentQuotationIsApproved,
  quotationApprovalNeedsClient
} from "./quotationApproval";

const initialCurrent = (): CurrentQuotationApprovalStatus => ({
  quotationApprovalState: "initial_current",
  currentQuotationApproved: true,
  requiresClientReapproval: false,
  quotationApprovalSource: "initial_unchanged",
  currentQuotationApproval: {
    kind: "initial_unchanged",
    reviewRoundId: "initial-round",
    estimateVersion: 4,
    approvedAt: "2026-11-04T09:00:00.000Z"
  }
});

describe("quotation approval state", () => {
  it("treats an absent projection as a source issue", () => {
    expect(currentQuotationApprovalState(undefined)).toBe("source_issue");
    expect(currentQuotationIsApproved(undefined)).toBe(false);
  });

  it("accepts a complete unchanged-initial approval", () => {
    expect(currentQuotationIsApproved(initialCurrent())).toBe(true);
  });

  it("fails closed when approval flags or sources disagree", () => {
    expect(currentQuotationIsApproved({ ...initialCurrent(), requiresClientReapproval: true })).toBe(false);
    expect(currentQuotationIsApproved({ ...initialCurrent(), quotationApprovalSource: "designer_revision" })).toBe(false);
    expect(currentQuotationIsApproved({ ...initialCurrent(), currentQuotationApproval: null })).toBe(false);
  });

  it("fails closed when immutable approval identity is malformed", () => {
    const approval = initialCurrent().currentQuotationApproval!;
    expect(currentQuotationIsApproved({ ...initialCurrent(), currentQuotationApproval: { ...approval, reviewRoundId: " " } })).toBe(false);
    expect(currentQuotationIsApproved({ ...initialCurrent(), currentQuotationApproval: { ...approval, estimateVersion: 0 } })).toBe(false);
    expect(currentQuotationIsApproved({ ...initialCurrent(), currentQuotationApproval: { ...approval, approvedAt: "invalid" } })).toBe(false);
  });

  it("does not accept a Designer approval as an unchanged initial approval", () => {
    expect(currentQuotationIsApproved({
      ...initialCurrent(),
      quotationApprovalSource: "designer_revision",
      currentQuotationApproval: {
        ...initialCurrent().currentQuotationApproval!,
        kind: "designer_revision"
      }
    })).toBe(false);
  });

  it("requires an explicit reapproval flag for revision review states", () => {
    expect(quotationApprovalNeedsClient({
      quotationApprovalState: "revision_pending_client",
      currentQuotationApproved: false,
      requiresClientReapproval: true,
      quotationApprovalSource: null,
      currentQuotationApproval: null
    })).toBe(true);
    expect(quotationApprovalNeedsClient({
      quotationApprovalState: "revision_pending_client",
      requiresClientReapproval: false
    })).toBe(false);
    expect(quotationApprovalNeedsClient({
      quotationApprovalState: "revision_pending_client",
      currentQuotationApproved: false,
      requiresClientReapproval: true
    })).toBe(false);
  });
});

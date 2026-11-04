import { describe, expect, it, vi } from "vitest";

import { EstimateClientResponseProofModel } from "../src/models/EstimateClientResponseProof.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";
import {
  resolveCurrentQuotationApproval,
  resolveQuotationApprovalFromRounds
} from "../src/services/quotation-approval-state.service.js";

const projectId = "project-quotation-state";
const estimateId = "estimate-quotation-state";
const clientId = "client-quotation-state";
const salesId = "sales-quotation-state";
const designerId = "designer-quotation-state";
const salesApprovedAt = "2026-11-01T09:00:00.000Z";
const clientApprovedAt = "2026-11-01T10:00:00.000Z";

type Row = Record<string, any>;

function commercialSource(): Row {
  return {
    propertyType: "1BHK",
    bedroomCount: 1,
    rooms: [{ id: "room-living", name: "Living" }],
    scopes: [{ id: "scope-living", roomId: "room-living", name: "Living" }],
    selectedMainBasketIds: ["basket-painting"],
    selectedMainBasketClassifications: [{ mainBasketId: "basket-painting", classification: "standard" }],
    lineItems: [{
      source: "configuration",
      itemType: "catalogue",
      clientVisible: true,
      classification: "standard",
      catalogueId: "catalogue-paint",
      roomId: "room-living",
      roomName: "Living",
      unit: "sq-ft",
      rate: 100,
      ratePaise: 10_000,
      quantity: 1,
      included: true,
      amount: 100,
      amountPaise: 10_000,
      mainBasketId: "basket-painting",
      subBasketId: "sub-painting",
      mainLineId: "line-paint",
      revisionId: "revision-paint",
      uomId: "uom-square-foot",
      uomCode: "sq-ft",
      uomDecimalScale: 2,
      mainBasketName: "Painting",
      subBasketName: "Wall painting",
      mainLineName: "Interior paint",
      uomName: "Square foot"
    }],
    subtotal: 100,
    gst: 18,
    total: 118,
    subtotalPaise: 10_000,
    gstPaise: 1_800,
    totalPaise: 11_800
  };
}

function fixture(): { estimate: Row; preRound: Row } {
  const snapshot = commercialSource();
  const sourceDigest = quotationSnapshotDigest(snapshot);
  const salesApproval = {
    actorId: salesId,
    pricedRevision: 1,
    estimateVersion: 3,
    sourceDigest,
    approvedAt: salesApprovedAt
  };
  const estimate = {
    _id: estimateId,
    projectId,
    version: 4,
    status: "client_approved",
    ...commercialSource(),
    // These fields exist only on the mutable configured line and are deliberately
    // outside the immutable published quotation projection.
    lineItems: commercialSource().lineItems.map((line: Row) => ({
      ...line,
      recommendationSourceMainLineIds: ["source-line"],
      designRules: [{ kind: "requires_dimensions" }],
      designRulesDigest: "internal-only"
    })),
    estimation: {
      workflowVersion: 3,
      phase: "post",
      status: "draft",
      requirementsVersion: 1,
      editClosedAt: null,
      preApproval: { reviewRoundId: "pre-round", estimateVersion: 3, approvedAt: clientApprovedAt },
      finalApproval: null,
      designScopeRevision: 1,
      approvedDesignScopeRevision: null,
      pendingReviewRoundId: null,
      preparationSnapshotId: null,
      pricedRevision: 1,
      designStartedAt: null,
      salesApproval,
      designApproval: null
    }
  };
  const preRound = {
    _id: "pre-round",
    estimateId,
    projectId,
    estimateVersion: 3,
    workflowVersion: 3,
    phase: "pre",
    status: "approved",
    decision: "approve",
    decisionSource: "client_portal",
    decidedById: clientId,
    decidedAt: clientApprovedAt,
    requirementsVersion: 1,
    pricedRevision: 1,
    designScopeRevision: 1,
    sourceDigest,
    estimateSnapshot: snapshot,
    submittedById: salesId,
    salesApproval
  };
  return { estimate, preRound };
}

const resolve = (estimate: Row, rounds: Row[]) => resolveQuotationApprovalFromRounds(estimate, rounds, {
  clientId,
  primaryDesignerId: designerId
});

function materiallyRevise(estimate: Row): void {
  estimate.estimation.pricedRevision = 2;
  estimate.estimation.salesApproval = null;
  estimate.lineItems[0].quantity = 2;
  estimate.lineItems[0].amount = 200;
  estimate.lineItems[0].amountPaise = 20_000;
  estimate.subtotal = 200;
  estimate.gst = 36;
  estimate.total = 236;
  estimate.subtotalPaise = 20_000;
  estimate.gstPaise = 3_600;
  estimate.totalPaise = 23_600;
}

describe("effective current quotation approval", () => {
  it("keeps an unchanged configured quotation current while ignoring internal-only saved line fields", () => {
    const { estimate, preRound } = fixture();
    expect(resolve(estimate, [preRound])).toEqual({
      quotationApprovalState: "initial_current",
      currentQuotationApproved: true,
      requiresClientReapproval: false,
      quotationApprovalSource: "initial_unchanged",
      currentQuotationApproval: {
        kind: "initial_unchanged",
        reviewRoundId: "pre-round",
        estimateVersion: 3,
        approvedAt: clientApprovedAt,
        requirementsVersion: 1,
        pricedRevision: 1,
        designScopeRevision: 1
      }
    });
  });

  it("preserves millisecond precision when Mongo returns an approval time as a Date", () => {
    const exactApprovedAt = "2026-11-01T10:00:00.812Z";
    const current = fixture();
    current.estimate.estimation.preApproval.approvedAt = exactApprovedAt;
    current.preRound.decidedAt = new Date(exactApprovedAt);
    expect(resolve(current.estimate, [current.preRound]).quotationApprovalState).toBe("initial_current");

    const different = fixture();
    different.estimate.estimation.preApproval.approvedAt = exactApprovedAt;
    different.preRound.decidedAt = new Date("2026-11-01T10:00:00.813Z");
    expect(resolve(different.estimate, [different.preRound]).quotationApprovalState).toBe("source_issue");

    const invalid = fixture();
    invalid.estimate.estimation.preApproval.approvedAt = exactApprovedAt;
    invalid.preRound.decidedAt = new Date("invalid");
    expect(resolve(invalid.estimate, [invalid.preRound]).quotationApprovalState).toBe("source_issue");
  });

  it("fails closed when commercial content changes without revision drift", () => {
    const { estimate, preRound } = fixture();
    estimate.lineItems[0].roomName = "Corrupted room";
    expect(resolve(estimate, [preRound]).quotationApprovalState).toBe("source_issue");
  });

  it("classifies a real saved edit as a revision draft even after live Sales evidence is cleared", () => {
    const { estimate, preRound } = fixture();
    materiallyRevise(estimate);
    expect(resolve(estimate, [preRound])).toMatchObject({
      quotationApprovalState: "revision_draft",
      currentQuotationApproved: false,
      requiresClientReapproval: true,
      currentQuotationApproval: null
    });
  });

  it("requires an exact pending post round and a matching sent lifecycle state", () => {
    const { estimate, preRound } = fixture();
    materiallyRevise(estimate);
    estimate.estimation.status = "sent_to_client";
    estimate.estimation.pendingReviewRoundId = "post-round";
    const snapshot = structuredClone(estimate);
    delete snapshot._id;
    delete snapshot.version;
    delete snapshot.status;
    delete snapshot.estimation;
    snapshot.lineItems = snapshot.lineItems.map(({ recommendationSourceMainLineIds: _sourceIds,
      designRules: _rules, designRulesDigest: _rulesDigest, ...line }: Row) => line);
    const pending = {
      _id: "post-round",
      estimateId,
      projectId,
      estimateVersion: 4,
      workflowVersion: 3,
      phase: "post",
      status: "pending",
      decision: null,
      decisionSource: null,
      decidedById: null,
      decidedAt: null,
      requirementsVersion: 1,
      pricedRevision: 2,
      designScopeRevision: 1,
      sourceDigest: quotationSnapshotDigest(snapshot),
      estimateSnapshot: snapshot,
      submittedById: designerId,
      salesApproval: null
    };
    expect(resolve(estimate, [preRound, pending]).quotationApprovalState).toBe("revision_pending_client");
    pending.pricedRevision = 1;
    estimate.estimation.pricedRevision = 1;
    expect(resolve(estimate, [preRound, pending]).quotationApprovalState).toBe("source_issue");
    pending.pricedRevision = 2;
    estimate.estimation.pricedRevision = 2;
    pending.submittedById = "foreign-designer";
    expect(resolve(estimate, [preRound, pending]).quotationApprovalState).toBe("source_issue");
    pending.submittedById = designerId;
    pending.phase = "pre";
    expect(resolve(estimate, [preRound, pending]).quotationApprovalState).toBe("source_issue");
    pending.phase = "post";
    pending.decisionSource = "client_portal";
    expect(resolve(estimate, [preRound, pending]).quotationApprovalState).toBe("source_issue");
    pending.decisionSource = null;
    estimate.estimation.status = "draft";
    expect(resolve(estimate, [preRound, pending]).quotationApprovalState).toBe("source_issue");
  });

  it("fails closed for missing paise totals or corrupted immutable Sales lineage", () => {
    const missingPaise = fixture();
    delete missingPaise.estimate.totalPaise;
    expect(resolve(missingPaise.estimate, [missingPaise.preRound]).quotationApprovalState).toBe("source_issue");

    const corruptSales = fixture();
    corruptSales.preRound.salesApproval.actorId = "other-sales";
    expect(resolve(corruptSales.estimate, [corruptSales.preRound]).quotationApprovalState).toBe("source_issue");

    const missingClient = fixture();
    expect(resolveQuotationApprovalFromRounds(missingClient.estimate, [missingClient.preRound], {
      primaryDesignerId: designerId
    }).quotationApprovalState).toBe("source_issue");
    missingClient.preRound.decidedById = "foreign-client";
    expect(resolve(missingClient.estimate, [missingClient.preRound]).quotationApprovalState).toBe("source_issue");
  });

  it("validates historical final lineage before classifying a reopened revision", () => {
    const { estimate, preRound } = fixture();
    materiallyRevise(estimate);
    const snapshot = structuredClone(estimate);
    delete snapshot._id;
    delete snapshot.version;
    delete snapshot.status;
    delete snapshot.estimation;
    const approvedAt = "2026-11-02T10:00:00.812Z";
    const finalRound = {
      _id: "final-round",
      estimateId,
      projectId,
      estimateVersion: 4,
      workflowVersion: 3,
      phase: "post",
      status: "approved",
      decision: "approve",
      decisionSource: "client_portal",
      decidedById: clientId,
      decidedAt: new Date(approvedAt),
      requirementsVersion: 1,
      pricedRevision: 2,
      designScopeRevision: 1,
      designReviewRoundId: null,
      designPlanVersion: null,
      sourceDigest: quotationSnapshotDigest(snapshot),
      estimateSnapshot: snapshot,
      submittedById: designerId
    };
    estimate.estimation.finalApproval = { reviewRoundId: "final-round", estimateVersion: 4, approvedAt,
      requirementsVersion: 1, designScopeRevision: 1, designReviewRoundId: null, designPlanVersion: null };
    estimate.estimation.status = "client_approved";
    estimate.estimation.editClosedAt = approvedAt;
    expect(resolve(estimate, [preRound, finalRound]).quotationApprovalState).toBe("revision_current");
    expect(resolveQuotationApprovalFromRounds(estimate, [preRound, finalRound], {
      clientId, primaryDesignerId: "replacement-designer"
    }).quotationApprovalState).toBe("revision_current");

    finalRound.pricedRevision = 1;
    estimate.estimation.pricedRevision = 1;
    expect(resolve(estimate, [preRound, finalRound]).quotationApprovalState).toBe("source_issue");
    finalRound.pricedRevision = 2;
    estimate.estimation.pricedRevision = 2;

    estimate.estimation.status = "draft";
    estimate.estimation.editClosedAt = null;
    expect(resolve(estimate, [preRound, finalRound]).quotationApprovalState).toBe("source_issue");
    estimate.estimation.pricedRevision = 3;
    expect(resolve(estimate, [preRound, finalRound]).quotationApprovalState).toBe("revision_draft");
    expect(resolve(estimate, [finalRound]).quotationApprovalState).toBe("source_issue");
    expect(resolveQuotationApprovalFromRounds(estimate, [preRound, finalRound], { clientId })
      .quotationApprovalState).toBe("revision_draft");
    estimate.estimation.finalApproval.estimateVersion = 3;
    expect(resolve(estimate, [preRound, finalRound]).quotationApprovalState).toBe("source_issue");
    estimate.estimation.finalApproval.estimateVersion = 4;
    finalRound.requirementsVersion = 2;
    expect(resolve(estimate, [preRound, finalRound]).quotationApprovalState).toBe("source_issue");
  });

  it("rejects a pending revision that is not newer than the last approved revision", () => {
    const { estimate, preRound } = fixture();
    materiallyRevise(estimate);
    const snapshot = structuredClone(estimate);
    delete snapshot._id;
    delete snapshot.version;
    delete snapshot.status;
    delete snapshot.estimation;
    const approvedAt = "2026-11-02T10:00:00.000Z";
    const finalRound = {
      _id: "final-round", estimateId, projectId, estimateVersion: 4, workflowVersion: 3, phase: "post",
      status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: clientId,
      decidedAt: approvedAt, requirementsVersion: 1, pricedRevision: 2, designScopeRevision: 1,
      designReviewRoundId: null, designPlanVersion: null, sourceDigest: quotationSnapshotDigest(snapshot),
      estimateSnapshot: snapshot, submittedById: designerId
    };
    estimate.version = 5;
    estimate.estimation.finalApproval = { reviewRoundId: "final-round", estimateVersion: 4, approvedAt,
      requirementsVersion: 1, designScopeRevision: 1, designReviewRoundId: null, designPlanVersion: null };
    estimate.estimation.status = "sent_to_client";
    estimate.estimation.pendingReviewRoundId = "pending-after-final";
    const pending = { ...structuredClone(finalRound), _id: "pending-after-final", estimateVersion: 5,
      status: "pending", decision: null, decisionSource: null, decidedById: null, decidedAt: null };
    expect(resolve(estimate, [preRound, finalRound, pending]).quotationApprovalState).toBe("source_issue");
  });

  it("serializes Mongo resolver reads so one transaction session never runs parallel operations", async () => {
    const { estimate, preRound } = fixture();
    let active = false;
    const operations: string[] = [];
    const query = (name: string, value: unknown) => {
      const result: Row = {
        lean: () => result,
        select: () => result,
        session: () => result,
        then: (resolvePromise: (resolved: unknown) => unknown, rejectPromise: (error: unknown) => unknown) => {
          if (active) return Promise.resolve(rejectPromise(new Error("parallel session operation")));
          active = true;
          operations.push(`${name}:start`);
          return Promise.resolve().then(() => {
            operations.push(`${name}:end`);
            active = false;
            return resolvePromise(value);
          }, rejectPromise);
        }
      };
      return result;
    };
    vi.spyOn(EstimateClientReviewRoundModel, "find").mockReturnValue(query("rounds", [preRound]) as never);
    vi.spyOn(ProjectModel, "findById").mockReturnValue(query("project", { clientId, primaryDesignerId: designerId }) as never);
    vi.spyOn(EstimateClientResponseProofModel, "find").mockReturnValue(query("proofs", []) as never);
    try {
      await expect(resolveCurrentQuotationApproval(estimate, {} as never)).resolves.toMatchObject({
        quotationApprovalState: "initial_current"
      });
      expect(operations).toEqual(["rounds:start", "rounds:end", "project:start", "project:end"]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

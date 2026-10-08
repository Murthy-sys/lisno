import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errors.js";
import { createProcurementBasketTenderRouter } from "../src/routes/procurement-basket-tender.js";
import type { AuthService } from "../src/services/auth.service.js";
import type { ProcurementBasketAwardService } from "../src/services/procurement-basket-award.service.js";
import type { ProcurementBasketEnquiryService } from "../src/services/procurement-basket-enquiry.service.js";
import type { ProcurementBasketService } from "../src/services/procurement-basket.service.js";

function setup() {
  const auth = { authenticate: vi.fn(async (role: string) => ({ id: role, name: role,
    email: `${role}@example.test`, role })) } as unknown as AuthService;
  const basket = { list: vi.fn(async () => ({ projectId: "project-a", estimateSource: {}, baskets: [], modeGroups: [
    { mode: "in_house", basketCount: 0, baskets: [], includedLineCount: 0, boqReadyLineCount: 0, readinessPercent: null,
      approvedEstimatePaise: 0, currentCostPaise: 0, currentCostComplete: true, unpricedLineCount: 0,
      committedNetPaise: 0, modeIssueCount: 0 }
  ] })) };
  const enquiry = { history: vi.fn(async () => ({ enquiryId: "enquiry-a", currentBoqRevisionId: "boq-current",
    revisions: [], nextBeforeRevision: null })),
    historyDetail: vi.fn(async () => ({ enquiryId: "enquiry-a", canAward: false,
      boq: { id: "boq-old", revision: 1, sentAt: "2026-10-05T00:00:00.000Z", digest: "a".repeat(64), lines: [] },
      bids: [], bidTotal: 0, counteroffers: [], counterofferTotal: 0 })),
    inspectVendorBoq: vi.fn(async () => ({ projectName: "Project",
    basketName: "Painting", expiresAt: "2026-12-01T00:00:00.000Z", lines: [{ id: "boq-line-a",
      description: "Painting work", quantityMilliUnits: 1000, uomCode: "SQFT", scopeType: "execution",
      targetDate: "2026-11-01", deliveryLocation: "Site" }] })),
    whatsAppShareIntent: vi.fn(async () => ({ available: true,
      shareUrl: "https://wa.me/919876543210?text=private", blocker: null,
      expiresAt: "2026-10-06T00:00:00.000Z" })),
    submitVendorBid: vi.fn(async () => ({ bidId: "bid-a", submittedAt: "2026-10-05T00:00:00.000Z",
      totals: { netPaise: 10_000, gstPaise: 0, totalPaise: 10_000 } })), dispatch: vi.fn(),
    previewInvitationBatch: vi.fn(async () => ({ enquiryId: "enquiry-a", enquiryVersion: 3,
      boqRevisionId: "boq-a", boqDigest: "a".repeat(64), selectedCount: 2, requiresReason: true,
      actions: [] })),
    submitInvitationBatch: vi.fn(async () => ({ enquiry: { id: "enquiry-a", version: 4 },
      selectedCount: 2, results: [] })) };
  const award = { approvalQueue: vi.fn(async () => []), decide: vi.fn(),
    withdraw: vi.fn(async () => ({ id: "award-a", status: "draft", requiresRevision: true })) };
  const issue = { issue: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProcurementBasketTenderRouter(auth,
    basket as unknown as ProcurementBasketService,
    enquiry as unknown as ProcurementBasketEnquiryService,
    award as unknown as ProcurementBasketAwardService,
    issue, (_req, _res, next) => next(), (_req, _res, next) => next()));
  app.use(errorHandler);
  return { app, basket, enquiry, award, issue };
}

describe("basket tender HTTP boundaries", () => {
  it("returns additive mode groups only through the current private authorized list route", async () => {
    const { app, basket, enquiry, award, issue } = setup();
    const path = "/api/v1/procurement/projects/project-a/baskets";
    await request(app).get(path).expect(401);
    await request(app).get(path).set("Authorization", "Bearer designer").expect(403);
    expect(basket.list).not.toHaveBeenCalled();
    const result = await request(app).get(path).set("Authorization", "Bearer procurement").expect(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.body.data).toMatchObject({ projectId: "project-a", baskets: [],
      modeGroups: [{ mode: "in_house", currentCostPaise: 0, currentCostComplete: true, readinessPercent: null }] });
    expect(basket.list).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ role: "procurement" }), "project-a");
    expect(enquiry.dispatch).not.toHaveBeenCalled();
    expect(award.decide).not.toHaveBeenCalled();
    expect(issue.issue).not.toHaveBeenCalled();
  });
  it("validates and authorizes the sent-revision batch preview and send routes", async () => {
    const { app, enquiry } = setup();
    const base = "/api/v1/procurement/projects/project-a/baskets/basket-a/enquiries/enquiry-a/invitation-batches";
    const input = { expectedVersion: 3, boqRevisionId: "boq-a", boqDigest: "a".repeat(64),
      selection: { kind: "vendors", vendorIds: ["vendor-a", "vendor-b"] } };
    await request(app).post(`${base}/preview`).send(input).expect(401);
    await request(app).post(`${base}/preview`).set("Authorization", "Bearer procurement")
      .send({ ...input, selection: { kind: "vendors", vendorIds: ["vendor-a", "vendor-a"] } }).expect(400);
    await request(app).post(base).set("Authorization", "Bearer procurement")
      .send({ ...input, idempotencyKey: "batch-key-001", counterofferReason: "too short" }).expect(400);
    expect(enquiry.previewInvitationBatch).not.toHaveBeenCalled();
    expect(enquiry.submitInvitationBatch).not.toHaveBeenCalled();
    const preview = await request(app).post(`${base}/preview`).set("Authorization", "Bearer procurement")
      .send({ ...input, selection: { kind: "all_eligible", excludedVendorIds: ["vendor-c"] } }).expect(200);
    expect(preview.headers["cache-control"]).toBe("private, no-store");
    expect(enquiry.previewInvitationBatch).toHaveBeenCalledWith(expect.objectContaining({ role: "procurement" }),
      "project-a", "basket-a", "enquiry-a",
      { ...input, selection: { kind: "all_eligible", excludedVendorIds: ["vendor-c"] } });
    await request(app).post(base).set("Authorization", "Bearer procurement")
      .send({ ...input, idempotencyKey: "batch-key-001",
        counterofferReason: "Please update the quoted rates." }).expect(200);
    expect(enquiry.submitInvitationBatch).toHaveBeenCalledOnce();
  });

  it("keeps vendor token in POST body and the public response free of internal budget and KPI", async () => {
    const { app, enquiry } = setup();
    const token = "a".repeat(43);
    await request(app).post("/api/v1/vendor-boq/inspect?token=not-used").send({}).expect(400);
    expect(enquiry.inspectVendorBoq).not.toHaveBeenCalled();
    const inspect = await request(app).post("/api/v1/vendor-boq/inspect")
      .set("Authorization", "Bearer procurement").send({ token }).expect(200);
    expect(inspect.headers["cache-control"]).toBe("no-store");
    expect(inspect.headers["referrer-policy"]).toBe("no-referrer");
    expect(inspect.body.data).toMatchObject({ basketName: "Painting", lines: [{ id: "boq-line-a" }] });
    expect(JSON.stringify(inspect.body)).not.toMatch(/budget|margin|kpi|vendorId|otherBid/iu);
    expect(enquiry.inspectVendorBoq).toHaveBeenCalledWith(token);
    await request(app).post("/api/v1/vendor-boq/submit").send({ token, idempotencyKey: "bid-key-001",
      lines: [{ boqLineId: "boq-line-a", unitPricePaise: 10_000, gstBasisPoints: 0 },
        { boqLineId: "boq-line-a", unitPricePaise: 10_000, gstBasisPoints: 0 }] }).expect(400);
    expect(enquiry.submitVendorBid).not.toHaveBeenCalled();
    await request(app).post("/api/v1/vendor-boq/submit").send({ token, idempotencyKey: "bid-key-001",
      lines: [{ boqLineId: "boq-line-a", unitPricePaise: 10_000, gstBasisPoints: 0 }] }).expect(200);
    expect(enquiry.submitVendorBid).toHaveBeenCalledOnce();
  });

  it("validates staff mutations before invoking tender delivery or issue services", async () => {
    const { app, enquiry, award, issue } = setup();
    const base = "/api/v1/procurement/projects/project-a/baskets/basket-a/enquiries/enquiry-a";
    await request(app).post(`${base}/dispatch`).set("Authorization", "Bearer procurement")
      .send({ expectedVersion: 1, idempotencyKey: "dispatch-001", vendorIds: ["vendor-a"] }).expect(400);
    expect(enquiry.dispatch).not.toHaveBeenCalled();
    await request(app).post(`${base}/awards/award-a/issue`).set("Authorization", "Bearer procurement")
      .send({ expectedVersion: 1, idempotencyKey: "bad key with spaces" }).expect(400);
    expect(issue.issue).not.toHaveBeenCalled();
    await request(app).post(`${base}/awards/award-a/withdraw`).set("Authorization", "Bearer procurement")
      .send({ expectedVersion: 2, idempotencyKey: "withdraw-001", reason: "short" }).expect(400);
    expect(award.withdraw).not.toHaveBeenCalled();
    const withdrawn = await request(app).post(`${base}/awards/award-a/withdraw`)
      .set("Authorization", "Bearer procurement")
      .send({ expectedVersion: 2, idempotencyKey: "withdraw-001",
        reason: "Approved mode changed and needs a new BOQ." }).expect(200);
    expect(withdrawn.body.data).toMatchObject({ status: "draft", requiresRevision: true });
    expect(award.withdraw).toHaveBeenCalledWith(expect.objectContaining({ role: "procurement" }),
      "project-a", "basket-a", "enquiry-a", "award-a",
      { expectedVersion: 2, idempotencyKey: "withdraw-001",
        reason: "Approved mode changed and needs a new BOQ." });
  });

  it("keeps WhatsApp share intent authenticated, validated and private", async () => {
    const { app, enquiry } = setup();
    const path = "/api/v1/procurement/projects/project-a/baskets/basket-a/enquiries/enquiry-a/invitations/vendor-a/whatsapp-share-intent";
    await request(app).post(path).send({}).expect(401);
    await request(app).post(path).set("Authorization", "Bearer procurement")
      .send({ token: "client-supplied" }).expect(400);
    expect(enquiry.whatsAppShareIntent).not.toHaveBeenCalled();
    const result = await request(app).post(path).set("Authorization", "Bearer procurement").send({}).expect(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.body.data).toMatchObject({ available: true, blocker: null,
      expiresAt: "2026-10-06T00:00:00.000Z" });
    expect(enquiry.whatsAppShareIntent).toHaveBeenCalledWith(expect.objectContaining({ role: "procurement" }),
      "project-a", "basket-a", "enquiry-a", "vendor-a");
  });

  it("bounds buyer-only history pagination and forwards only validated options", async () => {
    const { app, enquiry } = setup();
    const base = "/api/v1/procurement/projects/project-a/baskets/basket-a/enquiries/enquiry-a/history";
    await request(app).get(`${base}?limit=21`).set("Authorization", "Bearer procurement").expect(400);
    await request(app).get(`${base}/boq-old?bidOffset=-1`).set("Authorization", "Bearer procurement").expect(400);
    expect(enquiry.history).not.toHaveBeenCalled();
    expect(enquiry.historyDetail).not.toHaveBeenCalled();
    await request(app).get(`${base}?beforeRevision=3&limit=2`)
      .set("Authorization", "Bearer procurement").expect(200);
    expect(enquiry.history).toHaveBeenCalledWith(expect.objectContaining({ role: "procurement" }),
      "project-a", "basket-a", "enquiry-a", { beforeRevision: 3, limit: 2 });
    const detail = await request(app).get(`${base}/boq-old?bidOffset=25&counterofferOffset=5&limit=10`)
      .set("Authorization", "Bearer procurement").expect(200);
    expect(detail.body.data.canAward).toBe(false);
    expect(enquiry.historyDetail).toHaveBeenCalledWith(expect.objectContaining({ role: "procurement" }),
      "project-a", "basket-a", "enquiry-a", "boq-old",
      { bidOffset: 25, counterofferOffset: 5, limit: 10 });
  });
});

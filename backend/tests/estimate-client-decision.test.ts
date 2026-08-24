import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../src/middleware/errors.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientResponseProofModel } from "../src/models/EstimateClientResponseProof.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import {
  createEstimateDecisionService,
  type EstimateDecisionService
} from "../src/services/estimate-decision.service.js";

const NOW = new Date("2026-08-24T09:30:00.000Z");
const CLIENT = {
  id: "client-1",
  name: "Asha Rao",
  email: " ASHA.RAO@EXAMPLE.COM ",
  role: "client"
} as const;
const ADMIN = {
  id: "admin-1",
  name: "Ira Admin",
  email: "ira.admin@lisno.example",
  role: "admin"
} as const;
const SUPER_ADMIN = {
  id: "super-admin-1",
  name: "Sam Super",
  email: "sam.super@lisno.example",
  role: "super_admin"
} as const;
const PROOF = {
  storageReference: "estimate-client-proofs/proof-1.pdf",
  originalFilename: "signed approval.pdf",
  mimeType: "application/pdf",
  byteSize: 4_096,
  sha256: "a".repeat(64)
} as const;

type RecordValue = Record<string, any>;
type DecisionInput = Parameters<EstimateDecisionService["decide"]>[0];

function query<T>(value: T) {
  const result = {
    sort: vi.fn(),
    select: vi.fn(),
    session: vi.fn(),
    lean: vi.fn(async () => structuredClone(value)),
    exec: vi.fn(async () => structuredClone(value))
  };
  result.sort.mockReturnValue(result);
  result.select.mockReturnValue(result);
  result.session.mockReturnValue(result);
  return result;
}

function matches(record: RecordValue, filter: RecordValue): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    const actual = record[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$in" in expected) {
        if (!(expected.$in as unknown[]).some((item) => item === actual)) return false;
        continue;
      }
      if ("$size" in expected) {
        if (!Array.isArray(actual) || actual.length !== expected.$size) return false;
        continue;
      }
    }
    if (actual !== expected) return false;
  }
  return true;
}

function applyUpdate(record: RecordValue, update: RecordValue): void {
  Object.assign(record, structuredClone(update.$set ?? {}));
  for (const [key, amount] of Object.entries(update.$inc ?? {})) {
    record[key] = Number(record[key] ?? 0) + Number(amount);
  }
  for (const [key, value] of Object.entries(update.$push ?? {})) {
    record[key] ??= [];
    if (value && typeof value === "object" && "$each" in (value as RecordValue)) {
      record[key].push(...structuredClone((value as RecordValue).$each));
    } else {
      record[key].push(structuredClone(value));
    }
  }
}

function apiError(code: string, status = 409): ApiError {
  return new ApiError(status, code, code);
}

function setup(options: {
  round?: boolean;
  activeClient?: boolean;
  readiness?: { ready: boolean; total: number; approved: number; awaitingReview: number; changesRequested: number };
} = {}) {
  const estimates: RecordValue[] = [{
    _id: "estimate-1",
    leadId: "lead-1",
    ownerId: "estimator-1",
    projectId: null,
    version: 7,
    designLifecycleVersion: 3,
    designFrozenAt: null,
    status: "sent_to_client",
    propertyType: "Apartment",
    rooms: [{ id: "living", label: "Living" }],
    scopes: ["false_ceiling"],
    lineItems: [{
      catalogueId: "FC01",
      roomName: "Living",
      specification: "Gypsum false ceiling",
      unit: "sqft",
      rate: 125,
      quantity: 100,
      included: true,
      amount: 12_500
    }],
    subtotal: 12_500,
    gst: 2_250,
    total: 14_750,
    approvalRequired: false,
    assignedDesignerId: "designer-1",
    assignedManagerId: "manager-1",
    submittedAt: new Date("2026-08-23T08:00:00.000Z"),
    sentToClientAt: new Date("2026-08-23T09:00:00.000Z"),
    clientDecisionAt: null,
    reviews: [],
    notifications: []
  }];
  const leads: RecordValue[] = [{
    _id: "lead-1",
    projectId: null,
    ownerId: "estimator-1",
    clientName: "Asha Rao",
    clientEmail: "asha.rao@example.com",
    clientMobile: "+919999999999",
    projectName: "Aurora Residence",
    location: "Bengaluru",
    stage: "estimate_sent",
    nextAction: "client estimate decision",
    nextActionAt: new Date("2026-08-23T09:00:00.000Z")
  }];
  const rounds: RecordValue[] = options.round === false ? [] : [{
    _id: "round-1",
    estimateId: "estimate-1",
    leadId: "lead-1",
    projectId: null,
    estimateVersion: 7,
    sendGeneration: 2,
    assignedAdminId: "admin-1",
    deliveryStatus: "sent",
    deliveryAttemptCount: 1,
    deliveredAt: new Date("2026-08-23T09:01:00.000Z"),
    status: "pending",
    decision: null,
    decisionSource: null,
    decisionNote: null,
    decidedById: null,
    decidedAt: null,
    version: 4
  }];
  const users: RecordValue[] = [
    {
      _id: "designer-1",
      name: "Dev Designer",
      email: "dev.designer@lisno.example",
      emailNormalized: "dev.designer@lisno.example",
      role: "designer",
      managerId: "manager-1",
      active: true,
      accountKind: "standard",
      createdAt: new Date("2025-01-01T00:00:00.000Z")
    },
    {
      _id: "manager-1",
      name: "Maya Manager",
      email: "maya.manager@lisno.example",
      emailNormalized: "maya.manager@lisno.example",
      role: "design_manager",
      managerId: null,
      active: true,
      accountKind: "standard",
      createdAt: new Date("2025-01-01T00:00:00.000Z")
    },
    ...(options.activeClient === false ? [] : [{
      _id: "client-1",
      name: "Asha Rao",
      email: "asha.rao@example.com",
      emailNormalized: "asha.rao@example.com",
      role: "client",
      managerId: null,
      active: true,
      accountKind: "standard",
      createdAt: new Date("2025-01-01T00:00:00.000Z")
    }])
  ];
  const projects: RecordValue[] = [];
  const proofs: RecordValue[] = [];
  const audits: RecordValue[] = [];
  const readiness = options.readiness ?? {
    ready: true,
    total: 2,
    approved: 2,
    awaitingReview: 0,
    changesRequested: 0
  };

  const snapshots = () => structuredClone({ estimates, leads, rounds, users, projects, proofs, audits });
  const restore = (snapshot: ReturnType<typeof snapshots>) => {
    for (const [target, source] of [
      [estimates, snapshot.estimates],
      [leads, snapshot.leads],
      [rounds, snapshot.rounds],
      [users, snapshot.users],
      [projects, snapshot.projects],
      [proofs, snapshot.proofs],
      [audits, snapshot.audits]
    ] as const) target.splice(0, target.length, ...structuredClone(source));
  };
  const session = {
    withTransaction: vi.fn(async (operation: () => Promise<unknown>) => {
      const snapshot = snapshots();
      try {
        return await operation();
      } catch (error) {
        restore(snapshot);
        throw error;
      }
    }),
    endSession: vi.fn(async () => undefined)
  };
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as never);

  vi.spyOn(EstimateModel, "findById").mockImplementation((id) =>
    query(estimates.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateModel, "findOne").mockImplementation((filter) =>
    query(estimates.find((item) => matches(item, filter as RecordValue)) ?? null) as never
  );
  vi.spyOn(EstimateModel, "updateOne").mockImplementation(async (filter, update) => {
    const item = estimates.find((candidate) => matches(candidate, filter as RecordValue));
    if (item) applyUpdate(item, update as RecordValue);
    return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 } as never;
  });

  vi.spyOn(LeadModel, "findById").mockImplementation((id) =>
    query(leads.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(LeadModel, "findOne").mockImplementation((filter) =>
    query(leads.find((item) => matches(item, filter as RecordValue)) ?? null) as never
  );
  vi.spyOn(LeadModel, "updateOne").mockImplementation(async (filter, update) => {
    const item = leads.find((candidate) => matches(candidate, filter as RecordValue));
    if (item) applyUpdate(item, update as RecordValue);
    return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 } as never;
  });

  vi.spyOn(EstimateClientReviewRoundModel, "findById").mockImplementation((id) =>
    query(rounds.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(EstimateClientReviewRoundModel, "findOne").mockImplementation((filter) =>
    query(rounds.find((item) => matches(item, filter as RecordValue)) ?? null) as never
  );
  vi.spyOn(EstimateClientReviewRoundModel, "updateOne").mockImplementation(async (filter, update) => {
    const item = rounds.find((candidate) => matches(candidate, filter as RecordValue));
    if (item) applyUpdate(item, update as RecordValue);
    return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 } as never;
  });

  vi.spyOn(UserModel, "findById").mockImplementation((id) =>
    query(users.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(UserModel, "findOne").mockImplementation((filter) => {
    const found = users
      .filter((item) => matches(item, filter as RecordValue))
      .sort((left, right) => Number(left.createdAt) - Number(right.createdAt))[0] ?? null;
    return query(found) as never;
  });

  vi.spyOn(ProjectModel, "create").mockImplementation(async (input, createOptions) => {
    expect(createOptions).toEqual({ session });
    projects.push(...structuredClone(input as RecordValue[]));
    return input as never;
  });
  vi.spyOn(ProjectModel, "findById").mockImplementation((id) =>
    query(projects.find((item) => item._id === id) ?? null) as never
  );
  vi.spyOn(ProjectModel, "updateOne").mockImplementation(async (filter, update) => {
    const item = projects.find((candidate) => matches(candidate, filter as RecordValue));
    if (item) applyUpdate(item, update as RecordValue);
    return { matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 } as never;
  });

  vi.spyOn(EstimateClientResponseProofModel, "create").mockImplementation(async (input, createOptions) => {
    expect(createOptions).toEqual({ session });
    proofs.push(...structuredClone(input as RecordValue[]));
    return input as never;
  });

  const audit = {
    append: vi.fn(),
    appendInMongoTransaction: vi.fn(async (event: RecordValue, auditSession: unknown) => {
      expect(auditSession).toBe(session);
      audits.push(structuredClone(event));
      return event;
    }),
    list: vi.fn(),
    listForDesigner: vi.fn()
  };
  const estimateDesigns = {
    approvalReadinessForDecision: vi.fn(async (_estimateId: string, decisionSession: unknown) => {
      expect(decisionSession).toBe(session);
      return readiness;
    }),
    approvalReadiness: vi.fn(() => {
      throw new Error("The role-gated readiness method must not be used by decisions.");
    })
  };
  const reviews = {
    requireDecisionScope: vi.fn(async () => undefined)
  };
  const service = createEstimateDecisionService({
    audit,
    estimateDesigns,
    reviews,
    now: () => new Date(NOW)
  } as never);

  return {
    service,
    estimates,
    leads,
    rounds,
    users,
    projects,
    proofs,
    audits,
    session,
    audit,
    estimateDesigns,
    reviews
  };
}

function portalInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    estimateId: "estimate-1",
    round: { id: "round-1", expectedVersion: 4 },
    decision: "request_changes",
    note: "Move the ceiling edge inward.",
    context: { source: "client_portal", actor: CLIENT, proof: null },
    ...overrides
  } as DecisionInput;
}

function adminInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    estimateId: "estimate-1",
    round: { id: "round-1", expectedVersion: 4 },
    decision: "approve",
    note: "Signed approval received.",
    context: { source: "admin_proof", actor: ADMIN, proof: PROOF },
    ...overrides
  } as DecisionInput;
}

function expectApiError(error: unknown, code: string, status?: number): void {
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ code, ...(status === undefined ? {} : { status }) });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EstimateDecisionService Client compatibility", () => {
  it("keeps the portal body at decision/note while the adapter supplies the estimate and current round token", async () => {
    const state = setup();

    const result = await state.service.decide(portalInput());

    expect(result.estimate).toMatchObject({
      id: "estimate-1",
      status: "client_changes_requested",
      version: 8,
      designLifecycleVersion: 4,
      clientDecisionAt: NOW
    });
    expect(result.estimate).not.toHaveProperty("_id");
    expect(result.clientReview).toEqual({
      id: "round-1",
      sendGeneration: 2,
      estimateVersion: 7,
      version: 5,
      deliveryStatus: "sent",
      deliveryAttemptCount: 1,
      deliveredAt: "2026-08-23T09:01:00.000Z",
      status: "changes_requested"
    });
    expect(state.rounds[0]).toMatchObject({
      estimateId: "estimate-1",
      status: "changes_requested",
      decision: "request_changes",
      decisionSource: "client_portal",
      decisionNote: "Move the ceiling edge inward.",
      decidedById: "client-1",
      decidedAt: NOW,
      version: 5
    });
    expect(state.proofs).toEqual([]);
    expect(state.audits.map((event) => event.action)).toEqual([
      "estimate_design_final_changes_requested",
      "estimate_client_response_recorded_through_portal"
    ]);
    expect(state.audits[0]).toMatchObject({
      actorId: "client-1",
      newValues: expect.objectContaining({
        status: "client_changes_requested",
        noteLength: 29
      })
    });
  });

  it("uses normalized Lead email ownership and preserves the not-found boundary", async () => {
    const state = setup();
    state.leads[0].clientEmail = "someone.else@example.com";

    await state.service.decide(portalInput()).then(
      () => expect.fail("Expected a foreign Client estimate to be hidden."),
      (error) => expectApiError(error, "ESTIMATE_NOT_FOUND", 404)
    );

    expect(state.estimates[0].status).toBe("sent_to_client");
    expect(state.rounds[0].status).toBe("pending");
    expect(state.audits).toEqual([]);
  });

  it("decides a legacy Client-visible Estimate without synthesizing a round or proof", async () => {
    const state = setup({ round: false });

    const result = await state.service.decide(portalInput({
      round: null,
      note: "Please revise the wardrobe depth."
    }));

    expect(result.estimate).toMatchObject({
      id: "estimate-1",
      status: "client_changes_requested",
      version: 8,
      designLifecycleVersion: 4
    });
    expect(result.clientReview).toBeNull();
    expect(state.rounds).toEqual([]);
    expect(state.proofs).toEqual([]);
  });

  it("rejects a null portal round when a current review round exists", async () => {
    const state = setup();

    await state.service.decide(portalInput({ round: null })).then(
      () => expect.fail("Expected the current review round to remain authoritative."),
      (error) => expectApiError(error, "ESTIMATE_NOT_REVIEWABLE", 409)
    );

    expect(state.estimates[0]).toMatchObject({
      status: "sent_to_client",
      version: 7,
      designLifecycleVersion: 3
    });
    expect(state.rounds[0]).toMatchObject({ status: "pending", version: 4 });
    expect(state.audits).toEqual([]);
  });

  it("allows the legacy portal request-changes note to remain empty", async () => {
    const state = setup({ round: false });

    await expect(state.service.decide(portalInput({ round: null, note: "" }))).resolves.toMatchObject({
      estimate: { status: "client_changes_requested" },
      clientReview: null
    });
  });

  it("preserves the drawing-readiness error and rolls back a portal approval", async () => {
    const state = setup({
      readiness: { ready: false, total: 2, approved: 1, awaitingReview: 1, changesRequested: 0 }
    });

    await state.service.decide(portalInput({ decision: "approve", note: "" })).then(
      () => expect.fail("Expected unresolved drawings to block approval."),
      (error) => expectApiError(error, "ESTIMATE_DRAWINGS_UNRESOLVED", 409)
    );

    expect(state.estimates[0]).toMatchObject({
      status: "sent_to_client",
      version: 7,
      designLifecycleVersion: 3,
      designFrozenAt: null
    });
    expect(state.rounds[0]).toMatchObject({ status: "pending", version: 4 });
    expect(state.projects).toEqual([]);
    expect(state.audits).toEqual([]);
    expect(state.estimateDesigns.approvalReadinessForDecision).toHaveBeenCalledWith(
      "estimate-1",
      state.session
    );
    expect(state.estimateDesigns.approvalReadiness).not.toHaveBeenCalled();
  });

  it("preserves Client approval project, freeze, Lead-won, kickoff, review, and audit effects", async () => {
    const state = setup();

    const result = await state.service.decide(portalInput({ decision: "approve", note: "Looks good." }));

    expect(result.estimate).toMatchObject({
      id: "estimate-1",
      status: "client_approved",
      version: 8,
      designLifecycleVersion: 4,
      designFrozenAt: NOW,
      clientDecisionAt: NOW
    });
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0]).toMatchObject({
      clientId: "client-1",
      clientEmailNormalized: "asha.rao@example.com",
      initiatingDesignerId: "designer-1",
      assignedDesignerIds: ["designer-1"],
      managerId: "manager-1",
      status: "planning"
    });
    expect(state.leads[0]).toMatchObject({
      stage: "won",
      nextAction: "project kickoff",
      nextActionAt: NOW
    });
    expect(state.estimates[0].reviews.at(-1)).toMatchObject({
      actorId: "client-1",
      action: "client_approved",
      note: "Looks good.",
      occurredAt: NOW
    });
    expect(state.estimates[0].notifications).toEqual([
      expect.objectContaining({ recipientRole: "designer", event: "project_kickoff_created", queuedAt: NOW }),
      expect.objectContaining({ recipientRole: "design_manager", event: "project_kickoff_created", queuedAt: NOW })
    ]);
    expect(state.audits.map((event) => event.action)).toEqual([
      "estimate_design_final_approved",
      "estimate_client_response_recorded_through_portal"
    ]);
    expect(state.proofs).toEqual([]);
  });
});

describe("EstimateDecisionService Admin proof decisions", () => {
  it.each(["approve", "request_changes"] as const)(
    "requires immutable proof metadata for Admin %s",
    async (decision) => {
      const state = setup();

      await state.service.decide(adminInput({
        decision,
        note: decision === "request_changes" ? "Change the finish." : "",
        context: { source: "admin_proof", actor: ADMIN, proof: null } as never
      })).then(
        () => expect.fail("Expected Admin proof to be required."),
        (error) => expectApiError(error, "ESTIMATE_CLIENT_PROOF_REQUIRED", 400)
      );

      expect(state.proofs).toEqual([]);
      expect(state.rounds[0].status).toBe("pending");
      expect(state.estimates[0].status).toBe("sent_to_client");
    }
  );

  it("requires a non-empty Admin request-changes note but keeps portal empty-note compatibility", async () => {
    const state = setup();

    await state.service.decide(adminInput({ decision: "request_changes", note: "   " })).then(
      () => expect.fail("Expected an Admin rejection reason."),
      (error) => expectApiError(error, "ESTIMATE_CLIENT_NOTE_REQUIRED", 400)
    );

    expect(state.proofs).toEqual([]);
    expect(state.rounds[0].status).toBe("pending");
  });

  it("enforces current Admin assignment/scope before changing the round", async () => {
    const state = setup();
    state.reviews.requireDecisionScope.mockRejectedValueOnce(
      apiError("ESTIMATE_CLIENT_REVIEW_NOT_FOUND", 404)
    );

    await state.service.decide(adminInput()).then(
      () => expect.fail("Expected current Admin scope to be enforced."),
      (error) => expectApiError(error, "ESTIMATE_CLIENT_REVIEW_NOT_FOUND", 404)
    );

    expect(state.reviews.requireDecisionScope).toHaveBeenCalledWith(
      ADMIN,
      "round-1",
      state.session
    );
    expect(state.proofs).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("rejects a substituted estimate ID or stale round version at the shared CAS boundary", async () => {
    const wrongEstimate = setup();

    await wrongEstimate.service.decide(adminInput({ estimateId: "estimate-foreign" } as never)).then(
      () => expect.fail("Expected the round/estimate mismatch to fail."),
      (error) => expectApiError(error, "ESTIMATE_NOT_REVIEWABLE", 409)
    );
    expect(wrongEstimate.proofs).toEqual([]);

    vi.restoreAllMocks();
    const stale = setup();
    await stale.service.decide(adminInput({
      round: { id: "round-1", expectedVersion: 3 }
    })).then(
      () => expect.fail("Expected the stale round version to fail."),
      (error) => expectApiError(error, "ESTIMATE_NOT_REVIEWABLE", 409)
    );
    expect(stale.proofs).toEqual([]);
    expect(stale.rounds[0]).toMatchObject({ status: "pending", version: 4 });
  });

  it("rejects a null round for Admin source", async () => {
    const state = setup();

    await state.service.decide(adminInput({ round: null })).then(
      () => expect.fail("Expected Admin decisions to require a current round."),
      (error) => expectApiError(error, "ESTIMATE_NOT_REVIEWABLE", 409)
    );

    expect(state.proofs).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("stores Admin proof and true actor/source metadata in the same decision transaction", async () => {
    const state = setup();

    const result = await state.service.decide(adminInput({
      decision: "request_changes",
      note: "  Replace the laminate finish.  "
    }));

    expect(result.estimate).toMatchObject({ status: "client_changes_requested", version: 8 });
    expect(state.rounds[0]).toMatchObject({
      status: "changes_requested",
      decision: "request_changes",
      decisionSource: "admin_proof",
      decisionNote: "Replace the laminate finish.",
      decidedById: "admin-1",
      decidedAt: NOW,
      version: 5
    });
    expect(state.proofs).toEqual([
      expect.objectContaining({
        reviewRoundId: "round-1",
        estimateId: "estimate-1",
        storageReference: PROOF.storageReference,
        originalFilename: PROOF.originalFilename,
        mimeType: PROOF.mimeType,
        byteSize: PROOF.byteSize,
        sha256: PROOF.sha256,
        uploadedById: "admin-1",
        uploadedAt: NOW
      })
    ]);
    expect(state.audits.map((event) => event.action)).toEqual([
      "estimate_design_final_changes_requested",
      "estimate_client_changes_recorded_by_admin",
      "estimate_client_proof_stored"
    ]);
    expect(state.audits[1]).toMatchObject({
      actorId: "admin-1",
      newValues: expect.objectContaining({
        status: "client_changes_requested",
        recordedOnBehalfOf: "client",
        noteLength: 28
      })
    });
    const serializedAudit = JSON.stringify(state.audits);
    expect(serializedAudit).not.toContain(PROOF.storageReference);
    expect(serializedAudit).not.toContain(PROOF.originalFilename);
    expect(serializedAudit).not.toContain("Replace the laminate finish.");
  });

  it("links Admin approval to the matching active standard Client, never the Admin actor", async () => {
    const state = setup();
    const findClient = vi.mocked(UserModel.findOne);

    await state.service.decide(adminInput());

    expect(findClient).toHaveBeenCalledWith({
      emailNormalized: "asha.rao@example.com",
      role: "client",
      active: true,
      accountKind: "standard"
    });
    expect(state.projects[0]).toMatchObject({ clientId: "client-1" });
    expect(state.projects[0].clientId).not.toBe(ADMIN.id);
    expect(state.rounds[0]).toMatchObject({
      status: "approved",
      decisionSource: "admin_proof",
      decidedById: "admin-1"
    });
    expect(state.audits.map((event) => event.action)).toEqual([
      "estimate_design_final_approved",
      "estimate_client_approval_recorded_by_admin",
      "estimate_client_proof_stored"
    ]);
  });

  it("uses a null Project client ID when no matching active standard Client exists", async () => {
    const state = setup({ activeClient: false });

    await state.service.decide(adminInput({ context: {
      source: "admin_proof",
      actor: SUPER_ADMIN,
      proof: PROOF
    } }));

    expect(state.projects[0]).toMatchObject({ clientId: null });
    expect(state.projects[0].clientId).not.toBe(SUPER_ADMIN.id);
  });

  it("rolls back proof, round, Estimate, Lead, and audit writes when the shared Estimate CAS loses", async () => {
    const state = setup();
    vi.mocked(EstimateModel.updateOne).mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null
    } as never);

    await state.service.decide(adminInput()).then(
      () => expect.fail("Expected a losing decision CAS to fail."),
      (error) => expectApiError(error, "ESTIMATE_NOT_REVIEWABLE", 409)
    );

    expect(state.estimates[0]).toMatchObject({
      status: "sent_to_client",
      version: 7,
      designLifecycleVersion: 3,
      designFrozenAt: null
    });
    expect(state.leads[0]).toMatchObject({ stage: "estimate_sent" });
    expect(state.rounds[0]).toMatchObject({ status: "pending", version: 4 });
    expect(state.projects).toEqual([]);
    expect(state.proofs).toEqual([]);
    expect(state.audits).toEqual([]);
  });
});

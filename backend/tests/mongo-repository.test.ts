import { afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { AccessRequestModel } from "../src/models/AccessRequest.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { DesignExtractionJobModel } from "../src/models/DesignExtractionJob.js";
import { DesignSectionModel } from "../src/models/DesignSection.js";
import { DesignStageModel } from "../src/models/DesignStage.js";
import { DesignSectionRevisionModel } from "../src/models/DesignSectionRevision.js";
import { DesignSourcePageModel } from "../src/models/DesignSourcePage.js";
import { DesignVersionModel } from "../src/models/DesignVersion.js";
import { DesignVersionSequenceModel } from "../src/models/DesignVersionSequence.js";
import { EmailCoordinationModel } from "../src/models/EmailCoordination.js";
import { EvaluationModel } from "../src/models/Evaluation.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { FloorModel } from "../src/models/Floor.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { TaskModel } from "../src/models/Task.js";
import { TaskEventModel } from "../src/models/TaskEvent.js";
import { UserModel } from "../src/models/User.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

const query = (value: unknown) => ({
  session: () => undefined,
  exec: vi.fn().mockResolvedValue(value)
});

function recordedQuery(value: unknown) {
  const recorder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "sort", "skip", "limit", "lean", "session"]) {
    recorder[method] = vi.fn(() => recorder);
  }
  recorder.exec = vi.fn().mockResolvedValue(value);
  return recorder;
}

type QueryExecution = {
  active: string | null;
  order: string[];
  overlaps: string[];
};

function yieldingRecordedQuery(
  value: unknown,
  label: string,
  execution: QueryExecution
) {
  const recorder = recordedQuery(value);
  recorder.exec.mockImplementation(async () => {
    if (execution.active !== null) {
      execution.overlaps.push(`${execution.active}->${label}`);
    }
    execution.active = label;
    execution.order.push(label);
    await Promise.resolve();
    if (execution.active === label) execution.active = null;
    return value;
  });
  return recorder;
}

const validReplacement = (workerResultId = "result-1") => ({
  jobId: "job-replace",
  claimId: "claim-replace",
  processedAt: "2026-07-27T10:02:00.000Z",
  designVersionId: "version-replace",
  workerResultId,
  sourcePages: [
    {
      id: "page-replace",
      designVersionId: "version-replace",
      pageNumber: 1,
      renderedFileReference: "page.png",
      width: 100,
      height: 100,
      createdAt: "2026-07-27T10:00:00.000Z",
      updatedAt: "2026-07-27T10:00:00.000Z"
    }
  ],
  sections: [
    {
      section: {
        id: "section-replace",
        designVersionId: "version-replace",
        sourcePageId: "page-replace",
        label: "Kitchen",
        active: true as const,
        source: "ocr" as const,
        ocrConfidence: 0.99,
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z"
      },
      revision: {
        id: "revision-replace",
        sectionId: "section-replace",
        revisionNumber: 1,
        sourcePageId: "page-replace",
        crop: { x: 0, y: 0, width: 10, height: 10 },
        croppedFileReference: "section.png",
        label: "Kitchen",
        reviewStatus: "draft" as const,
        submittedAt: null,
        reviewerId: null,
        reviewedAt: null,
        rejectionComment: null,
        createdAt: "2026-07-27T10:00:00.000Z"
      }
    }
  ]
});

const processingJob = (workerResultId: string | null = null) => ({
  _id: "job-replace",
  designVersionId: "version-replace",
  status: "processing",
  claimId: "claim-replace",
  leaseExpiresAt: new Date("2026-07-27T10:06:00.000Z"),
  workerResultId
});

const replacementWriteQuery = () => ({
  session: () => undefined,
  exec: vi.fn().mockResolvedValue(undefined)
});

const mockSuccessfulReplacement = (job = processingJob()) => {
  const deletePages = replacementWriteQuery();
  const deleteSections = replacementWriteQuery();
  const deleteRevisions = replacementWriteQuery();
  const updateJob = replacementWriteQuery();
  vi.spyOn(DesignExtractionJobModel, "findOne").mockReturnValueOnce({
    lean: () => query(job)
  } as never);
  vi.spyOn(DesignSectionModel, "find").mockReturnValueOnce({
    select: () => ({ lean: () => query([]) })
  } as never);
  vi.spyOn(DesignSectionRevisionModel, "exists").mockReturnValueOnce(
    query(null) as never
  );
  vi.spyOn(DesignSourcePageModel, "deleteMany").mockReturnValueOnce(
    deletePages as never
  );
  vi.spyOn(DesignSectionModel, "deleteMany").mockReturnValueOnce(
    deleteSections as never
  );
  vi.spyOn(DesignSectionRevisionModel, "deleteMany").mockReturnValueOnce(
    deleteRevisions as never
  );
  vi.spyOn(DesignSourcePageModel, "create").mockResolvedValueOnce([] as never);
  vi.spyOn(DesignSectionModel, "create").mockResolvedValueOnce([] as never);
  vi.spyOn(DesignSectionRevisionModel, "create").mockResolvedValueOnce([] as never);
  vi.spyOn(DesignExtractionJobModel, "updateOne").mockReturnValueOnce(
    updateJob as never
  );
  return { deletePages, deleteSections, deleteRevisions, updateJob };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Mongo repository contracts", () => {
  it("maps missing legacy project relationships to null-safe values", async () => {
    vi.spyOn(ProjectModel, "findById").mockReturnValueOnce({
      lean: () => query({
        _id: "project-legacy-null-team",
        name: "Legacy project",
        clientId: null,
        clientName: "Legacy Client",
        clientEmail: "legacy@example.com",
        clientEmailNormalized: "legacy@example.com",
        clientMobile: "9000000000",
        clientAddress: "Pune",
        status: "planning",
        location: "Pune",
        plannedStartAt: new Date("2026-08-23T10:00:00.000Z"),
        plannedEndAt: new Date("2026-11-21T10:00:00.000Z"),
        actualStartAt: null,
        actualEndAt: null,
        createdAt: new Date("2026-08-23T10:00:00.000Z"),
        updatedAt: new Date("2026-08-23T10:00:00.000Z")
      })
    } as never);

    await expect(createMongoRepository().findProjectById("project-legacy-null-team"))
      .resolves.toMatchObject({
        initiatingDesignerId: null,
        assignedEstimatorId: null,
        assignedDesignerIds: [],
        managerId: null
      });
  });

  it("enforces one Lead for each non-null project link at the schema boundary", () => {
    expect(LeadModel.schema.indexes()).toContainEqual([
      { projectId: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { projectId: { $type: "string" } }
      })
    ]);
  });

  it("coordinates authorization mutations in the active session", async () => {
    const session = {} as never;
    const coordinationQuery = {
      session: vi.fn(),
      exec: vi.fn().mockResolvedValue({ acknowledged: true })
    };
    const update = vi
      .spyOn(AuthorizationCoordinationModel, "updateOne")
      .mockReturnValueOnce(coordinationQuery as never);

    await createMongoRepository(session).coordinateAuthorizationMutation();

    expect(update).toHaveBeenCalledWith(
      { _id: "authorization" },
      {
        $inc: { revision: 1 },
        $set: { updatedAt: expect.any(Date) }
      },
      { upsert: true }
    );
    expect(coordinationQuery.session).toHaveBeenCalledWith(session);
  });

  it("atomically upserts a pending request and maps Mongo version zero to one", async () => {
    const session = {} as never;
    const record = {
      _id: "request-atomic",
      requesterId: "user-1",
      projectId: "project-1",
      module: "design",
      reason: "Need access",
      status: "pending",
      reviewerId: null,
      decisionReason: null,
      decisionFingerprint: null,
      approvedGrantId: null,
      reviewedAt: null,
      __v: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z")
    };
    const upsert = vi.spyOn(AccessRequestModel, "findOneAndUpdate").mockReturnValueOnce({
      lean: () => ({
        exec: vi.fn().mockResolvedValue({
          value: record,
          lastErrorObject: { upserted: record._id }
        })
      })
    } as never);

    const result = await createMongoRepository(session).findOrCreatePendingAccessRequest({
      id: record._id,
      requesterId: record.requesterId,
      projectId: record.projectId,
      module: "design",
      reason: record.reason,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    });

    expect(result).toMatchObject({ created: true, record: { id: record._id, version: 1 } });
    expect(upsert).toHaveBeenCalledWith(
      {
        requesterId: record.requesterId,
        projectId: record.projectId,
        module: "design",
        status: "pending"
      },
      { $setOnInsert: expect.objectContaining({ _id: record._id, __v: 0 }) },
      expect.objectContaining({
        upsert: true,
        new: true,
        runValidators: true,
        timestamps: false,
        session
      })
    );
    expect(upsert.mock.calls[0]![1]).toEqual({
      $setOnInsert: expect.objectContaining({
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      })
    });
  });

  it("validates every pending-request upsert candidate with document semantics", async () => {
    const upsert = vi.spyOn(AccessRequestModel, "findOneAndUpdate").mockReturnValue({
      lean: () => ({
        exec: vi.fn().mockResolvedValue({
          value: {
            _id: "should-not-persist",
            requesterId: "user-1",
            projectId: "valid-project",
            module: "design",
            reason: "valid",
            status: "pending",
            __v: 0,
            createdAt: new Date("2026-08-17T10:00:00.000Z"),
            updatedAt: new Date("2026-08-17T10:00:00.000Z")
          },
          lastErrorObject: { upserted: "should-not-persist" }
        })
      })
    } as never);
    const base = {
      id: "invalid-request",
      requesterId: "user-1",
      projectId: "valid-project",
      module: "design" as const,
      reason: "Valid reason",
      createdAt: "2026-08-17T10:00:00.000Z",
      updatedAt: "2026-08-17T10:00:00.000Z"
    };

    for (const invalid of [
      { ...base, projectId: "project/invalid" },
      { ...base, reason: "   " },
      { ...base, module: "estimation" as never }
    ]) {
      await expect(
        createMongoRepository().findOrCreatePendingAccessRequest(invalid)
      ).rejects.toThrow();
    }
    expect(upsert).not.toHaveBeenCalled();
  });

  it("aborts and retries the entire pending-request transaction after raw E11000", async () => {
    const sessions = [0, 1].map(() => ({
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    }));
    vi.spyOn(mongoose, "startSession")
      .mockResolvedValueOnce(sessions[0] as never)
      .mockResolvedValueOnce(sessions[1] as never);
    const duplicate = Object.assign(new Error("pending tuple duplicate"), { code: 11000 });
    const document = {
      _id: "request-winner",
      requesterId: "user-1",
      projectId: "project-1",
      module: "design",
      reason: "Need access",
      status: "pending",
      __v: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z")
    };
    vi.spyOn(AccessRequestModel, "findOneAndUpdate")
      .mockReturnValueOnce({
        lean: () => ({ exec: vi.fn().mockRejectedValue(duplicate) })
      } as never)
      .mockReturnValueOnce({
        lean: () => ({
          exec: vi.fn().mockResolvedValue({ value: document, lastErrorObject: {} })
        })
      } as never);
    const reread = vi.spyOn(AccessRequestModel, "findOne");
    let attempts = 0;

    const result = await createMongoRepository().runInTransaction(async (transaction) => {
      attempts += 1;
      return transaction.findOrCreatePendingAccessRequest({
        id: "request-candidate",
        requesterId: "user-1",
        projectId: "project-1",
        module: "design",
        reason: "Need access",
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z"
      });
    });

    expect(result).toMatchObject({ created: false, record: { id: "request-winner" } });
    expect(attempts).toBe(2);
    expect(reread).not.toHaveBeenCalled();
    expect(sessions[0]!.endSession).toHaveBeenCalledOnce();
    expect(sessions[1]!.endSession).toHaveBeenCalledOnce();
  });

  it("re-reads a direct pending-request E11000 race and returns the winning tuple", async () => {
    const duplicate = Object.assign(new Error("pending tuple duplicate"), { code: 11000 });
    const winner = {
      _id: "request-winner",
      requesterId: "user-1",
      projectId: "project-1",
      module: "design",
      reason: "Earlier concurrent request",
      status: "pending",
      __v: 0,
      createdAt: new Date("2026-08-17T09:59:00.000Z"),
      updatedAt: new Date("2026-08-17T09:59:00.000Z")
    };
    vi.spyOn(AccessRequestModel, "findOneAndUpdate").mockReturnValueOnce({
      lean: () => ({ exec: vi.fn().mockRejectedValue(duplicate) })
    } as never);
    const reread = vi.spyOn(AccessRequestModel, "findOne").mockReturnValueOnce({
      lean: () => query(winner)
    } as never);

    await expect(
      createMongoRepository().findOrCreatePendingAccessRequest({
        id: "request-loser",
        requesterId: "user-1",
        projectId: "project-1",
        module: "design",
        reason: "Need access",
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z"
      })
    ).resolves.toMatchObject({
      created: false,
      record: { id: "request-winner", reason: "Earlier concurrent request" }
    });
    expect(reread).toHaveBeenCalledWith({
      requesterId: "user-1",
      projectId: "project-1",
      module: "design",
      status: "pending"
    });
  });

  it("uses the same atomic shape for active project grants", async () => {
    const record = {
      _id: "grant-existing",
      projectId: "project-1",
      userId: "user-1",
      module: "design",
      source: "access_request",
      accessRequestId: "request-1",
      grantedById: "admin-1",
      active: true,
      grantedAt: new Date("2026-08-17T10:00:00.000Z"),
      __v: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z")
    };
    const upsert = vi.spyOn(ProjectAccessGrantModel, "findOneAndUpdate").mockReturnValueOnce({
      lean: () => ({
        exec: vi.fn().mockResolvedValue({ value: record, lastErrorObject: {} })
      })
    } as never);

    const result = await createMongoRepository().findOrCreateActiveProjectAccessGrant({
      id: "grant-candidate",
      projectId: record.projectId,
      userId: record.userId,
      module: "design",
      source: "access_request",
      accessRequestId: "request-2",
      grantedById: "admin-1",
      grantedAt: record.grantedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    });

    expect(result).toMatchObject({ created: false, record: { id: record._id, version: 1 } });
    expect(upsert).toHaveBeenCalledWith(
      { userId: "user-1", projectId: "project-1", module: "design", active: true },
      { $setOnInsert: expect.objectContaining({ _id: "grant-candidate", __v: 0 }) },
      expect.objectContaining({
        upsert: true,
        new: true,
        runValidators: true,
        timestamps: false
      })
    );
  });

  it("validates active-grant source relationships before the atomic upsert", async () => {
    const upsert = vi.spyOn(ProjectAccessGrantModel, "findOneAndUpdate").mockReturnValue({
      lean: () => ({
        exec: vi.fn().mockResolvedValue({
          value: {
            _id: "should-not-persist",
            projectId: "project-1",
            userId: "user-1",
            module: "design",
            source: "direct_assignment",
            accessRequestId: null,
            grantedById: "admin-1",
            active: true,
            grantedAt: new Date("2026-08-17T10:00:00.000Z"),
            __v: 0,
            createdAt: new Date("2026-08-17T10:00:00.000Z"),
            updatedAt: new Date("2026-08-17T10:00:00.000Z")
          },
          lastErrorObject: { upserted: "should-not-persist" }
        })
      })
    } as never);

    await expect(
      createMongoRepository().findOrCreateActiveProjectAccessGrant({
        id: "invalid-grant",
        projectId: "project-1",
        userId: "user-1",
        module: "design",
        source: "access_request",
        accessRequestId: null,
        grantedById: "admin-1",
        grantedAt: "2026-08-17T10:00:00.000Z",
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z"
      })
    ).rejects.toThrow(/accessRequestId/i);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("preserves exact transition and revocation timestamps in CAS query writes", async () => {
    const transitionDocument = {
      _id: "request-1",
      requesterId: "user-1",
      projectId: "project-1",
      module: "design",
      reason: "Need access",
      status: "approved",
      reviewerId: "admin-1",
      decisionReason: null,
      decisionFingerprint: "a".repeat(64),
      approvedGrantId: "grant-1",
      reviewedAt: new Date("2026-08-18T10:00:00.000Z"),
      __v: 1,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-18T10:00:00.000Z")
    };
    const grantDocument = {
      _id: "grant-1",
      projectId: "project-1",
      userId: "user-1",
      module: "design",
      source: "access_request",
      accessRequestId: "request-1",
      grantedById: "admin-1",
      active: false,
      grantedAt: new Date("2026-08-18T10:00:00.000Z"),
      revokedAt: new Date("2026-08-19T10:00:00.000Z"),
      revokedById: "admin-1",
      revocationReason: "No longer required",
      __v: 1,
      createdAt: new Date("2026-08-18T10:00:00.000Z"),
      updatedAt: new Date("2026-08-19T10:00:00.000Z")
    };
    const transition = vi.spyOn(AccessRequestModel, "findOneAndUpdate").mockReturnValueOnce({
      lean: () => query(transitionDocument)
    } as never);
    const revoke = vi.spyOn(ProjectAccessGrantModel, "findOneAndUpdate").mockReturnValueOnce({
      lean: () => query(grantDocument)
    } as never);
    const repository = createMongoRepository();

    await repository.transitionAccessRequest("request-1", 1, {
      status: "approved",
      reviewerId: "admin-1",
      decisionReason: null,
      decisionFingerprint: "a".repeat(64),
      approvedGrantId: "grant-1",
      reviewedAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:00.000Z"
    });
    await repository.revokeProjectAccessGrant("grant-1", 1, {
      revokedAt: "2026-08-19T10:00:00.000Z",
      revokedById: "admin-1",
      revocationReason: "No longer required",
      updatedAt: "2026-08-19T10:00:00.000Z"
    });

    expect(transition.mock.calls[0]![1]).toEqual({
      $set: expect.objectContaining({
        reviewedAt: new Date("2026-08-18T10:00:00.000Z"),
        updatedAt: new Date("2026-08-18T10:00:00.000Z")
      }),
      $inc: { __v: 1 }
    });
    expect(transition.mock.calls[0]![2]).toEqual(
      expect.objectContaining({ timestamps: false })
    );
    expect(revoke.mock.calls[0]![1]).toEqual({
      $set: expect.objectContaining({
        revokedAt: new Date("2026-08-19T10:00:00.000Z"),
        updatedAt: new Date("2026-08-19T10:00:00.000Z")
      }),
      $inc: { __v: 1 }
    });
    expect(revoke.mock.calls[0]![2]).toEqual(
      expect.objectContaining({ timestamps: false })
    );
  });

  it.each(["client signup", "project creation"])(
    "retries the complete %s transaction after a first-use coordination duplicate",
    async (workflow) => {
      const sessions = [0, 1].map(() => ({
        withTransaction: vi.fn(async (operation: () => Promise<unknown>) =>
          operation()
        ),
        endSession: vi.fn(async () => undefined)
      }));
      vi.spyOn(mongoose, "startSession")
        .mockResolvedValueOnce(sessions[0] as never)
        .mockResolvedValueOnce(sessions[1] as never);
      const firstCoordination = {
        session: vi.fn(),
        exec: vi.fn().mockRejectedValue(
          Object.assign(new Error("first-use E11000"), { code: 11000 })
        )
      };
      const retriedCoordination = {
        session: vi.fn(),
        exec: vi.fn().mockResolvedValue({ acknowledged: true })
      };
      vi.spyOn(EmailCoordinationModel, "updateOne")
        .mockReturnValueOnce(firstCoordination as never)
        .mockReturnValueOnce(retriedCoordination as never);
      const attempts: string[] = [];

      const result = await createMongoRepository().runInTransaction(
        async (transaction) => {
          attempts.push(workflow);
          await transaction.coordinateClientEmail(
            `${workflow.replaceAll(" ", "-")}@example.com`
          );
          return `${workflow} completed`;
        }
      );

      expect(result).toBe(`${workflow} completed`);
      expect(attempts).toEqual([workflow, workflow]);
      expect(mongoose.startSession).toHaveBeenCalledTimes(2);
      expect(firstCoordination.session).toHaveBeenCalledWith(sessions[0]);
      expect(retriedCoordination.session).toHaveBeenCalledWith(sessions[1]);
      expect(sessions[0]!.endSession).toHaveBeenCalledOnce();
      expect(sessions[1]!.endSession).toHaveBeenCalledOnce();
    }
  );

  it("translates duplicate exhaustion only after one complete transaction retry", async () => {
    const sessions = [0, 1].map(() => ({
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) =>
        operation()
      ),
      endSession: vi.fn(async () => undefined)
    }));
    vi.spyOn(mongoose, "startSession")
      .mockResolvedValueOnce(sessions[0] as never)
      .mockResolvedValueOnce(sessions[1] as never);
    vi.spyOn(EmailCoordinationModel, "updateOne").mockImplementation(() => ({
      session: vi.fn(),
      exec: vi.fn().mockRejectedValue(
        Object.assign(new Error("persistent E11000"), { code: 11000 })
      )
    }) as never);
    let attempts = 0;

    await expect(
      createMongoRepository().runInTransaction(async (transaction) => {
        attempts += 1;
        await transaction.coordinateClientEmail("bounded@example.com");
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    expect(attempts).toBe(2);
    expect(mongoose.startSession).toHaveBeenCalledTimes(2);
    expect(sessions[0]!.endSession).toHaveBeenCalledOnce();
    expect(sessions[1]!.endSession).toHaveBeenCalledOnce();
  });

  it("writes the normalized email coordination record in the active session", async () => {
    const session = {} as never;
    const coordinationQuery = {
      session: vi.fn(),
      exec: vi.fn().mockResolvedValue({ acknowledged: true })
    };
    const update = vi
      .spyOn(EmailCoordinationModel, "updateOne")
      .mockReturnValueOnce(coordinationQuery as never);

    await createMongoRepository(session).coordinateClientEmail(
      "  CLIENT@Example.COM "
    );

    expect(update).toHaveBeenCalledWith(
      { _id: "client@example.com" },
      { $inc: { revision: 1 } },
      { upsert: true }
    );
    expect(coordinationQuery.session).toHaveBeenCalledWith(session);
  });

  it("uses the active session for transactional account reads", async () => {
    const session = {} as never;
    const byIdQuery = {
      session: vi.fn(),
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    };
    const byEmailQuery = {
      session: vi.fn(),
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    };
    vi.spyOn(UserModel, "findById").mockReturnValueOnce({
      select: () => byIdQuery
    } as never);
    vi.spyOn(UserModel, "findOne").mockReturnValueOnce({
      select: () => byEmailQuery
    } as never);
    const repository = createMongoRepository(session);

    await repository.findUserById("user-client");
    await repository.findUserByEmail("client@example.com");

    expect(byIdQuery.session).toHaveBeenCalledWith(session);
    expect(byEmailQuery.session).toHaveBeenCalledWith(session);
  });

  it("uses the normalized account email for Mongo user lookups", async () => {
    const findOne = vi.spyOn(UserModel, "findOne").mockReturnValueOnce({
      select: () => ({ lean: () => ({ exec: vi.fn().mockResolvedValue(null) }) })
    } as never);

    await createMongoRepository().findUserByEmail("  AARAV@LISNO.EXAMPLE ");

    expect(findOne).toHaveBeenCalledWith({ emailNormalized: "aarav@lisno.example" });
  });

  it("declares globally unique normalized account emails", () => {
    expect(UserModel.schema.indexes()).toContainEqual([
      { emailNormalized: 1 },
      { unique: true }
    ]);
  });

  it("rejects a duplicate normalized Mongo account email", async () => {
    vi.spyOn(UserModel, "create").mockRejectedValueOnce(
      Object.assign(new Error("E11000 duplicate key error"), { code: 11000 })
    );

    await expect(
      createMongoRepository().createUser({
        name: "Duplicate Aarav",
        email: " AARAV@LISNO.EXAMPLE ",
        passwordHash: "hash",
        role: "design_manager"
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("maps a legacy user without a stored version to public version one", async () => {
    const stored = {
      _id: "user-legacy-version",
      name: "Legacy User",
      email: "legacy@example.com",
      emailNormalized: "legacy@example.com",
      passwordHash: "hash",
      role: "designer",
      active: true,
      managerId: null,
      authorizedClientIds: [],
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z")
    };
    vi.spyOn(UserModel, "findById").mockReturnValueOnce({
      select: () => ({ lean: () => ({ exec: vi.fn().mockResolvedValue(stored) }) })
    } as never);

    await expect(
      createMongoRepository().findUserById(stored._id)
    ).resolves.toMatchObject({ id: stored._id, version: 1 });
    expect(UserModel.schema.path("version").options.default).toBe(1);
  });

  it("maps legacy Mongo users to standard and persists explicit account kinds", async () => {
    const stored = {
      _id: "user-legacy-account-kind",
      name: "Legacy User",
      email: "legacy-account-kind@example.com",
      emailNormalized: "legacy-account-kind@example.com",
      passwordHash: "hash",
      role: "designer",
      active: true,
      managerId: null,
      authorizedClientIds: [],
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z")
    };
    vi.spyOn(UserModel, "findById").mockReturnValueOnce({
      select: () => ({ lean: () => ({ exec: vi.fn().mockResolvedValue(stored) }) })
    } as never);

    await expect(
      createMongoRepository().findUserById(stored._id)
    ).resolves.toMatchObject({ accountKind: "standard" });

    const create = vi.spyOn(UserModel, "create").mockImplementation(async (input) => ({
      toObject: () => input
    }) as never);
    await expect(
      createMongoRepository().createUser({
        name: "Standard User",
        email: "standard-mongo@example.test",
        passwordHash: "hash",
        role: "designer"
      })
    ).resolves.toMatchObject({ accountKind: "standard" });
    await expect(
      createMongoRepository().createUser({
        name: "Demo User",
        email: "demo-mongo@example.test",
        passwordHash: "hash",
        role: "designer",
        accountKind: "development_demo"
      })
    ).resolves.toMatchObject({ accountKind: "development_demo" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ accountKind: "development_demo" })
    );
    expect(UserModel.schema.path("accountKind").options).toMatchObject({
      enum: ["standard", "development_demo"],
      default: "standard"
    });
  });

  it("uses legacy-aware version-one CAS then exact incrementing Mongo CAS", async () => {
    const session = {} as never;
    const document = (version: number, active: boolean) => ({
      _id: "user-versioned",
      name: "Versioned User",
      email: "versioned@example.com",
      emailNormalized: "versioned@example.com",
      passwordHash: "hash",
      role: "designer",
      active,
      version,
      managerId: null,
      authorizedClientIds: [],
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T11:00:00.000Z")
    });
    const queryFor = (value: unknown) => {
      const query = {
        session: vi.fn(),
        lean: () => ({ exec: vi.fn().mockResolvedValue(value) })
      };
      return {
        query,
        modelResult: { select: () => query }
      };
    };
    const first = queryFor(document(2, true));
    const second = queryFor(document(3, false));
    const update = vi.spyOn(UserModel, "findOneAndUpdate")
      .mockReturnValueOnce(first.modelResult as never)
      .mockReturnValueOnce(second.modelResult as never);
    const repository = createMongoRepository(session);

    await expect(
      repository.updateUser("user-versioned", 1, {
        role: "designer",
        updatedAt: "2026-08-17T11:00:00.000Z"
      })
    ).resolves.toMatchObject({ version: 2 });
    await expect(
      repository.updateUser("user-versioned", 2, {
        active: false,
        updatedAt: "2026-08-17T12:00:00.000Z"
      })
    ).resolves.toMatchObject({ version: 3, active: false });

    expect(update).toHaveBeenNthCalledWith(
      1,
      {
        _id: "user-versioned",
        $or: [{ version: 1 }, { version: { $exists: false } }]
      },
      {
        $set: {
          role: "designer",
          updatedAt: new Date("2026-08-17T11:00:00.000Z"),
          version: 2
        }
      },
      { new: true, runValidators: true, timestamps: false }
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      { _id: "user-versioned", version: 2 },
      {
        $set: {
          active: false,
          updatedAt: new Date("2026-08-17T12:00:00.000Z")
        },
        $inc: { version: 1 }
      },
      { new: true, runValidators: true, timestamps: false }
    );
    expect(first.query.session).toHaveBeenCalledWith(session);
    expect(second.query.session).toHaveBeenCalledWith(session);
  });

  it("counts all nine Mongo responsibilities sequentially in the active session", async () => {
    const session = {} as never;
    let inFlight = 0;
    let maximumInFlight = 0;
    const queries = Array.from({ length: 9 }, (_, index) => ({
      session: vi.fn(),
      exec: vi.fn(async () => {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return index + 1;
      })
    }));
    vi.spyOn(LeadModel, "countDocuments").mockReturnValueOnce(queries[0] as never);
    vi.spyOn(EstimateModel, "countDocuments").mockReturnValueOnce(queries[1] as never);
    vi.spyOn(ProjectModel, "countDocuments")
      .mockReturnValueOnce(queries[2] as never)
      .mockReturnValueOnce(queries[3] as never)
      .mockReturnValueOnce(queries[4] as never)
      .mockReturnValueOnce(queries[7] as never);
    vi.spyOn(TaskModel, "countDocuments").mockReturnValueOnce(queries[5] as never);
    vi.spyOn(UserModel, "countDocuments").mockReturnValueOnce(queries[6] as never);
    vi.spyOn(ProjectAccessGrantModel, "countDocuments")
      .mockReturnValueOnce(queries[8] as never);

    await expect(
      createMongoRepository(session).countUserResponsibilities("user-counted")
    ).resolves.toEqual({
      ownedActiveLeads: 1,
      ownedActiveEstimates: 2,
      initiatedActiveProjects: 3,
      assignedActiveProjects: 4,
      managedActiveProjects: 5,
      ownedActiveTasks: 6,
      directReports: 7,
      linkedClientProjects: 8,
      adminInitiatorGrants: 9
    });
    expect(maximumInFlight).toBe(1);
    for (const countQuery of queries) {
      expect(countQuery.session).toHaveBeenCalledWith(session);
    }
    expect(LeadModel.countDocuments).toHaveBeenCalledWith({
      ownerId: "user-counted",
      stage: { $nin: ["won", "lost"] }
    });
    expect(EstimateModel.countDocuments).toHaveBeenCalledWith({
      ownerId: "user-counted",
      status: { $ne: "client_approved" }
    });
    expect(UserModel.countDocuments).toHaveBeenCalledWith({ managerId: "user-counted" });
    expect(ProjectAccessGrantModel.countDocuments).toHaveBeenCalledWith({
      userId: "user-counted",
      module: "projects",
      source: "admin_initiator",
      active: true
    });
  });

  it("links only unclaimed Mongo projects with the matching normalized email", async () => {
    const findOneAndUpdate = vi.spyOn(ProjectModel, "findOneAndUpdate");
    findOneAndUpdate
      .mockReturnValueOnce({
        lean: () => ({
          exec: vi.fn().mockResolvedValue({
            _id: "project-a",
            name: "A",
            clientId: "client-john",
            initiatingDesignerId: "designer",
            assignedDesignerIds: ["designer"],
            managerId: "manager",
            status: "active",
            location: "Mumbai",
            plannedStartAt: new Date("2026-01-01T00:00:00.000Z"),
            plannedEndAt: new Date("2026-02-01T00:00:00.000Z"),
            actualStartAt: null,
            actualEndAt: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-07-28T09:00:00.000Z")
          })
        })
      } as never)
      .mockReturnValueOnce({ lean: () => ({ exec: vi.fn().mockResolvedValue(null) }) } as never);
    const repository = createMongoRepository() as ReturnType<typeof createMongoRepository> & {
      linkUnclaimedProjectsToClient(
        emailNormalized: string,
        clientId: string,
        updatedAt: string
      ): Promise<Array<{ id: string }>>;
    };

    const linked = await repository.linkUnclaimedProjectsToClient(
      "JOHN@GMAIL.COM",
      "client-john",
      "2026-07-28T09:00:00.000Z"
    );
    expect(linked.map((project) => project.id)).toEqual(["project-a"]);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { clientId: null, clientEmailNormalized: "john@gmail.com" },
      expect.objectContaining({ $set: expect.objectContaining({ clientId: "client-john" }) }),
      expect.objectContaining({ new: true })
    );
  });

  it("pages active Mongo managers with a case-insensitive search", async () => {
    const find = vi.spyOn(UserModel, "find").mockReturnValueOnce({
      select: () => ({
        sort: () => ({ skip: () => ({ limit: () => ({ lean: () => ({ exec: vi.fn().mockResolvedValue([]) }) }) }) })
      })
    } as never);
    vi.spyOn(UserModel, "countDocuments").mockReturnValueOnce(
      { exec: vi.fn().mockResolvedValue(0) } as never
    );
    const repository = createMongoRepository() as ReturnType<typeof createMongoRepository> & {
      pageActiveManagers(
        search: string,
        pagination: { limit: number; offset: number }
      ): Promise<{ items: unknown[]; total: number }>;
    };

    await expect(repository.pageActiveManagers("AARAV@", { limit: 20, offset: 0 })).resolves.toEqual({
      items: [],
      total: 0
    });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, role: "design_manager" })
    );
  });

  it("filters a design manager's Mongo projects only by accountable manager ID", async () => {
    const find = vi.spyOn(ProjectModel, "find").mockReturnValueOnce({
      sort: () => ({ lean: () => ({ exec: vi.fn().mockResolvedValue([]) }) })
    } as never);
    const manager = demoSeedData.users.find(
      (user) => user.id === "user-manager-aarav"
    )!;

    await createMongoRepository().listProjectsForUserInModule(manager, "projects");

    expect(find).toHaveBeenCalledWith({ managerId: "user-manager-aarav" });
  });

  it("short-circuits Mongo project reads for estimator sales", async () => {
    const exec = vi.fn().mockResolvedValue([]);
    const lean = vi.fn(() => ({ exec }));
    const limit = vi.fn(() => ({ lean }));
    const skip = vi.fn(() => ({ limit }));
    const sort = vi.fn(() => ({ lean, skip }));
    const find = vi.spyOn(ProjectModel, "find").mockReturnValue({ sort } as never);
    const count = vi.spyOn(ProjectModel, "countDocuments").mockReturnValue({
      exec: vi.fn().mockResolvedValue(0)
    } as never);
    const sales = demoSeedData.users.find(
      (user) => user.id === "user-estimator-sales"
    )!;
    const repository = createMongoRepository();

    await expect(repository.listProjectsForUserInModule(sales, "projects")).resolves.toEqual([]);
    await expect(
      repository.pageProjectsForUserInModule(sales, "projects", { limit: 20, offset: 0 })
    ).resolves.toEqual({ items: [], total: 0 });

    expect(find).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("keeps the design head Mongo project scope explicitly unrestricted", async () => {
    const exec = vi.fn().mockResolvedValue([]);
    const lean = vi.fn(() => ({ exec }));
    const sort = vi.fn(() => ({ lean }));
    const find = vi.spyOn(ProjectModel, "find").mockReturnValue({ sort } as never);
    const head = demoSeedData.users.find((user) => user.id === "user-head")!;

    await createMongoRepository().listProjectsForUserInModule(head, "projects");

    expect(find).toHaveBeenCalledWith({});
  });

  it("preserves every legacy relationship and Super Admin scope in module-aware Mongo reads", async () => {
    vi.spyOn(ProjectAccessGrantModel, "find").mockReturnValueOnce({
      select: () => ({
        lean: () => ({ exec: vi.fn().mockResolvedValue([]) })
      })
    } as never);
    const projectFind = vi.spyOn(ProjectModel, "find").mockReturnValue({
      sort: () => ({ lean: () => ({ exec: vi.fn().mockResolvedValue([]) }) })
    } as never);
    const client = demoSeedData.users.find(
      (user) => user.id === "user-client-aurora"
    )!;
    const designer = demoSeedData.users.find(
      (user) => user.id === "user-designer-ananya"
    )!;
    const manager = demoSeedData.users.find(
      (user) => user.id === "user-manager-aarav"
    )!;
    const head = demoSeedData.users.find((user) => user.id === "user-head")!;
    const superAdmin = {
      ...head,
      id: "user-super-admin",
      role: "super_admin" as const
    };
    const repository = createMongoRepository();

    await repository.listProjectsForUserInModule(client, "projects");
    await repository.listProjectsForUserInModule(designer, "design");
    await repository.listProjectsForUserInModule(manager, "projects");
    await repository.listProjectsForUserInModule(head, "design");
    await repository.listProjectsForUserInModule(superAdmin, "finance");

    expect(projectFind.mock.calls.map(([filter]) => filter)).toEqual([
      { clientId: "user-client-aurora" },
      {
        $or: [
          { initiatingDesignerId: "user-designer-ananya" },
          { assignedDesignerIds: "user-designer-ananya" }
        ]
      },
      { managerId: "user-manager-aarav" },
      {},
      {}
    ]);
  });

  it("unions only current-role eligible grant IDs into module-aware Mongo project reads", async () => {
    const grantExec = vi.fn().mockResolvedValue([
      { projectId: "project-celeste-office" }
    ]);
    const grantLean = vi.fn(() => ({ exec: grantExec }));
    const grantSelect = vi.fn(() => ({ lean: grantLean }));
    const grantFind = vi
      .spyOn(ProjectAccessGrantModel, "find")
      .mockReturnValueOnce({ select: grantSelect } as never);
    const projectExec = vi.fn().mockResolvedValue([]);
    const projectFind = vi.spyOn(ProjectModel, "find").mockReturnValueOnce({
      sort: () => ({ lean: () => ({ exec: projectExec }) })
    } as never);
    const procurement = {
      ...demoSeedData.users[0]!,
      id: "user-procurement",
      role: "procurement" as const,
      active: true
    };

    await createMongoRepository().listProjectsForUserInModule(
      procurement,
      "procurement"
    );

    expect(grantFind).toHaveBeenCalledWith({
      userId: procurement.id,
      module: "procurement",
      active: true,
      source: "access_request"
    });
    expect(projectFind).toHaveBeenCalledWith({
      _id: { $in: ["project-celeste-office"] }
    });
  });

  it("uses only admin initiator grants for Admin projects scope", async () => {
    const grantFind = vi
      .spyOn(ProjectAccessGrantModel, "find")
      .mockReturnValueOnce({
        select: () => ({
          lean: () => ({ exec: vi.fn().mockResolvedValue([]) })
        })
      } as never);
    const admin = {
      ...demoSeedData.users[0]!,
      id: "user-admin",
      role: "admin" as const,
      active: true
    };

    await expect(
      createMongoRepository().listProjectsForUserInModule(admin, "projects")
    ).resolves.toEqual([]);

    expect(grantFind).toHaveBeenCalledWith({
      userId: admin.id,
      module: "projects",
      active: true,
      source: "admin_initiator"
    });
  });

  it("short-circuits module-aware Mongo reads for roles without legacy or eligible grant scope", async () => {
    const grantFind = vi.spyOn(ProjectAccessGrantModel, "find");
    const projectFind = vi.spyOn(ProjectModel, "find");
    const count = vi.spyOn(ProjectModel, "countDocuments");
    const worker = {
      ...demoSeedData.users[0]!,
      id: "user-worker",
      role: "worker_other" as const,
      active: true
    };
    const mismatchedDesigner = {
      ...worker,
      id: "user-designer-module-mismatch",
      role: "designer" as const
    };
    const inactiveProcurement = {
      ...worker,
      id: "user-inactive-procurement",
      role: "procurement" as const,
      active: false
    };

    await expect(
      createMongoRepository().listProjectsForUserInModule(worker, "execution")
    ).resolves.toEqual([]);
    await expect(
      createMongoRepository().pageProjectsForUserInModule(
        worker,
        "execution",
        { limit: 20, offset: 0 }
      )
    ).resolves.toEqual({ items: [], total: 0 });
    await expect(
      createMongoRepository().listProjectsForUserInModule(
        mismatchedDesigner,
        "finance"
      )
    ).resolves.toEqual([]);
    await expect(
      createMongoRepository().listProjectsForUserInModule(
        inactiveProcurement,
        "procurement"
      )
    ).resolves.toEqual([]);

    expect(grantFind).not.toHaveBeenCalled();
    expect(projectFind).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("uses the same eligible grant filter for module-aware Mongo pages", async () => {
    vi.spyOn(ProjectAccessGrantModel, "find").mockReturnValueOnce({
      select: () => ({
        lean: () => ({
          exec: vi.fn().mockResolvedValue([{ projectId: "project-celeste-office" }])
        })
      })
    } as never);
    const itemExec = vi.fn().mockResolvedValue([]);
    const projectFind = vi.spyOn(ProjectModel, "find").mockReturnValueOnce({
      sort: () => ({
        skip: () => ({
          limit: () => ({ lean: () => ({ exec: itemExec }) })
        })
      })
    } as never);
    const countExec = vi.fn().mockResolvedValue(1);
    const count = vi.spyOn(ProjectModel, "countDocuments").mockReturnValueOnce({
      exec: countExec
    } as never);
    const procurement = {
      ...demoSeedData.users[0]!,
      id: "user-procurement",
      role: "procurement" as const,
      active: true
    };

    await expect(
      createMongoRepository().pageProjectsForUserInModule(
        procurement,
        "procurement",
        { limit: 20, offset: 0 }
      )
    ).resolves.toEqual({ items: [], total: 1 });

    const expectedFilter = { _id: { $in: ["project-celeste-office"] } };
    expect(projectFind).toHaveBeenCalledWith(expectedFilter);
    expect(count).toHaveBeenCalledWith(expectedFilter);
  });

  it("scopes and paginates Admin project summaries before bounded batched joins with one session", async () => {
    const session = { id: "admin-summary-session" } as never;
    const execution: QueryExecution = { active: null, order: [], overlaps: [] };
    const grantQuery = recordedQuery([{ projectId: "project-admin-page" }]);
    const grantFind = vi.spyOn(ProjectAccessGrantModel, "find").mockReturnValueOnce(
      grantQuery as never
    );
    const projectDocument = {
      _id: "project-admin-page",
      name: "Admin Project",
      clientId: null,
      clientName: "Asha Shah",
      clientEmail: "asha@example.com",
      clientEmailNormalized: "asha@example.com",
      clientMobile: "9000000000",
      clientAddress: "Pune",
      initiatingDesignerId: null,
      assignedEstimatorId: "estimator-page",
      assignedDesignerIds: [],
      managerId: null,
      status: "planning",
      location: "Pune",
      plannedStartAt: new Date("2026-08-23T10:00:00.000Z"),
      plannedEndAt: new Date("2026-11-21T10:00:00.000Z"),
      actualStartAt: null,
      actualEndAt: null,
      createdAt: new Date("2026-08-23T10:00:00.000Z"),
      updatedAt: new Date("2026-08-23T10:00:00.000Z")
    };
    const projectQuery = yieldingRecordedQuery(
      [projectDocument], "project-page", execution
    );
    const projectFind = vi.spyOn(ProjectModel, "find").mockReturnValueOnce(
      projectQuery as never
    );
    const countQuery = yieldingRecordedQuery(2, "project-count", execution);
    const count = vi.spyOn(ProjectModel, "countDocuments").mockReturnValueOnce(
      countQuery as never
    );
    const leadDocument = {
      _id: "lead-admin-page",
      projectId: "project-admin-page",
      ownerId: "estimator-page",
      clientName: "Asha Shah",
      clientEmail: "asha@example.com",
      clientMobile: "9000000000",
      projectName: "Admin Project",
      location: "Pune",
      propertyType: "3BHK",
      budgetMin: 800000,
      budgetMax: 1200000,
      source: "admin_project",
      stage: "new_lead",
      nextAction: "Visit",
      nextActionAt: new Date("2026-08-25T05:00:00.000Z"),
      builder: null,
      areaSqft: null,
      targetHandoverAt: null,
      notes: null,
      latestActivityAt: null,
      createdAt: new Date("2026-08-23T10:00:00.000Z"),
      updatedAt: new Date("2026-08-23T10:00:00.000Z")
    };
    const leadQuery = yieldingRecordedQuery([leadDocument], "lead-join", execution);
    const leadFind = vi.spyOn(LeadModel, "find").mockReturnValueOnce(leadQuery as never);
    const estimatorQuery = yieldingRecordedQuery([{
      _id: "estimator-page", name: "Asha Estimator", email: "estimator@example.com",
      title: "Estimator"
    }], "estimator-join", execution);
    const userFind = vi.spyOn(UserModel, "find").mockReturnValueOnce(
      estimatorQuery as never
    );
    const estimateQuery = yieldingRecordedQuery([{
      _id: "estimate-admin-page", leadId: "lead-admin-page",
      projectId: "project-admin-page", status: "draft", total: 118000
    }], "estimate-join", execution);
    const estimateFind = vi.spyOn(EstimateModel, "find").mockReturnValueOnce(
      estimateQuery as never
    );
    const admin = {
      ...demoSeedData.users[0]!,
      id: "admin-page",
      role: "admin" as const,
      active: true
    };

    await expect(
      createMongoRepository(session).pageAdminProjects(
        admin,
        { limit: 1, offset: 1 }
      )
    ).resolves.toEqual({
      total: 2,
      items: [expect.objectContaining({
        id: "project-admin-page",
        estimator: {
          id: "estimator-page",
          name: "Asha Estimator",
          email: "estimator@example.com"
        },
        lead: expect.objectContaining({ id: "lead-admin-page" }),
        estimate: { id: "estimate-admin-page", status: "draft", total: 118000 }
      })]
    });

    const scope = { _id: { $in: ["project-admin-page"] } };
    expect(grantFind).toHaveBeenCalledWith({
      userId: admin.id,
      module: "projects",
      active: true,
      source: "admin_initiator"
    });
    expect(projectFind).toHaveBeenCalledWith(scope);
    expect(count).toHaveBeenCalledWith(scope);
    expect(projectQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(projectQuery.skip).toHaveBeenCalledWith(1);
    expect(projectQuery.limit).toHaveBeenCalledWith(1);
    expect(grantQuery.exec.mock.invocationCallOrder[0]).toBeLessThan(
      projectFind.mock.invocationCallOrder[0]!
    );
    expect(projectQuery.exec.mock.invocationCallOrder[0]).toBeLessThan(
      leadFind.mock.invocationCallOrder[0]!
    );
    expect(leadFind).toHaveBeenCalledWith({
      projectId: { $in: ["project-admin-page"] }
    });
    expect(userFind).toHaveBeenCalledWith({ _id: { $in: ["estimator-page"] } });
    expect(estimatorQuery.select).toHaveBeenCalledWith({
      _id: 1, name: 1, email: 1, title: 1
    });
    expect(estimateFind).toHaveBeenCalledWith({
      $or: [
        { projectId: { $in: ["project-admin-page"] } },
        { leadId: { $in: ["lead-admin-page"] } }
      ]
    });
    expect(estimateQuery.select).toHaveBeenCalledWith({
      _id: 1, leadId: 1, projectId: 1, status: 1, total: 1
    });
    for (const recorder of [
      grantQuery,
      projectQuery,
      countQuery,
      leadQuery,
      estimatorQuery,
      estimateQuery
    ]) {
      expect(recorder.session).toHaveBeenCalledWith(session);
    }
    expect(execution.overlaps).toEqual([]);
    expect(execution.order).toEqual([
      "project-page",
      "project-count",
      "lead-join",
      "estimator-join",
      "estimate-join"
    ]);
  });

  it("combines Admin detail ID with exact scope before joining and hides out-of-scope IDs", async () => {
    const session = { id: "admin-detail-session" } as never;
    const grantQuery = recordedQuery([{ projectId: "project-admin-detail" }]);
    vi.spyOn(ProjectAccessGrantModel, "find").mockReturnValueOnce(grantQuery as never);
    const projectQuery = recordedQuery(null);
    const projectFindOne = vi.spyOn(ProjectModel, "findOne").mockReturnValueOnce(
      projectQuery as never
    );
    const leadFind = vi.spyOn(LeadModel, "find");
    const userFind = vi.spyOn(UserModel, "find");
    const estimateFind = vi.spyOn(EstimateModel, "find");
    const admin = {
      ...demoSeedData.users[0]!,
      id: "admin-detail",
      role: "admin" as const,
      active: true
    };

    await expect(
      createMongoRepository(session).findAdminProject(admin, "project-guessed")
    ).resolves.toBeNull();
    expect(projectFindOne).toHaveBeenCalledWith({
      $and: [
        { _id: "project-guessed" },
        { _id: { $in: ["project-admin-detail"] } }
      ]
    });
    expect(grantQuery.session).toHaveBeenCalledWith(session);
    expect(projectQuery.session).toHaveBeenCalledWith(session);
    expect(leadFind).not.toHaveBeenCalled();
    expect(userFind).not.toHaveBeenCalled();
    expect(estimateFind).not.toHaveBeenCalled();
  });

  it("escapes estimator search and applies deterministic bounded projection and paging", async () => {
    const session = { id: "estimator-option-session" } as never;
    const execution: QueryExecution = { active: null, order: [], overlaps: [] };
    const optionQuery = yieldingRecordedQuery([{
      _id: "estimator-option",
      name: "Asha Rao",
      email: "asha@example.com",
      title: null,
      mobile: "must-not-map",
      address: "must-not-map"
    }], "estimator-page", execution);
    const find = vi.spyOn(UserModel, "find").mockReturnValueOnce(optionQuery as never);
    const countQuery = yieldingRecordedQuery(1, "estimator-count", execution);
    const count = vi.spyOn(UserModel, "countDocuments").mockReturnValueOnce(
      countQuery as never
    );

    const result = await createMongoRepository(session).pageActiveEstimatorOptions(
      "Asha.*",
      { limit: 7, offset: 2 }
    );

    expect(result).toEqual({
      items: [{
        id: "estimator-option",
        name: "Asha Rao",
        email: "asha@example.com",
        title: null
      }],
      total: 1
    });
    const filter = find.mock.calls[0]![0] as {
      role: string;
      active: boolean;
      $or: Array<Record<string, RegExp>>;
    };
    expect(filter.role).toBe("estimator_sales");
    expect(filter.active).toBe(true);
    expect(filter.$or[0]!.name.source).toBe("Asha\\.\\*");
    expect(filter.$or[0]!.name.flags).toContain("i");
    expect(filter.$or[1]!.email).toBe(filter.$or[0]!.name);
    expect(count).toHaveBeenCalledWith(filter);
    expect(optionQuery.select).toHaveBeenCalledWith({
      _id: 1, name: 1, email: 1, title: 1
    });
    expect(optionQuery.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(optionQuery.skip).toHaveBeenCalledWith(2);
    expect(optionQuery.limit).toHaveBeenCalledWith(7);
    expect(optionQuery.session).toHaveBeenCalledWith(session);
    expect(countQuery.session).toHaveBeenCalledWith(session);
    expect(execution.overlaps).toEqual([]);
    expect(execution.order).toEqual(["estimator-page", "estimator-count"]);
    expect(JSON.stringify(result)).not.toMatch(/mobile|address/);
  });

  it("rejects a stale extraction completion with the current-lease filter", async () => {
    const update = vi.spyOn(DesignExtractionJobModel, "findByIdAndUpdate").mockReturnValueOnce({
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    } as never);
    vi.spyOn(DesignExtractionJobModel, "exists").mockReturnValueOnce(
      { exec: vi.fn().mockResolvedValue({ _id: "job-stale" }) } as never
    );

    await expect(
      createMongoRepository().completeExtractionJob(
        "job-stale",
        "old-claim",
        "2026-07-27T10:03:00.000Z"
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "job-stale",
        status: "processing",
        claimId: "old-claim",
        leaseExpiresAt: { $gt: new Date("2026-07-27T10:03:00.000Z") }
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("distinguishes a missing extraction job from a stale completion claim", async () => {
    vi.spyOn(DesignExtractionJobModel, "findByIdAndUpdate").mockReturnValueOnce({
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    } as never);
    vi.spyOn(DesignExtractionJobModel, "exists").mockReturnValueOnce(
      { exec: vi.fn().mockResolvedValue(null) } as never
    );

    await expect(
      createMongoRepository().completeExtractionJob(
        "job-missing",
        "claim-missing",
        "2026-07-27T10:03:00.000Z"
      )
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it("distinguishes a missing extraction job from a stale failure claim", async () => {
    vi.spyOn(DesignExtractionJobModel, "findByIdAndUpdate").mockReturnValueOnce({
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    } as never);
    vi.spyOn(DesignExtractionJobModel, "exists").mockReturnValueOnce(
      { exec: vi.fn().mockResolvedValue(null) } as never
    );

    await expect(
      createMongoRepository().failExtractionJob(
        "job-missing",
        "claim-missing",
        "OCR_FAILED",
        "OCR failed",
        "2026-07-27T10:03:00.000Z"
      )
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it("runs draft-state verification and section update in one Mongo transaction", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    vi.spyOn(DesignSectionRevisionModel, "findOne").mockReturnValueOnce({
      sort: () => ({ lean: () => query({ _id: "revision-draft", revisionNumber: 1, reviewStatus: "draft", label: "Before" }) })
    } as never);
    const guard = vi.spyOn(DesignSectionRevisionModel, "updateOne").mockReturnValueOnce(
      query({ matchedCount: 1, modifiedCount: 1 }) as never
    );
    const update = vi.spyOn(DesignSectionModel, "findOneAndUpdate").mockReturnValueOnce({
      session: () => undefined,
      lean: () => ({
        exec: vi.fn().mockResolvedValue({
          _id: "section-draft",
          designVersionId: "version-draft",
          sourcePageId: "page-draft",
          label: "Changed",
          active: true,
          source: "manual",
          ocrConfidence: null,
          createdAt: new Date("2026-07-27T10:00:00.000Z"),
          updatedAt: new Date("2026-07-27T10:01:00.000Z")
        })
      })
    } as never);

    await expect(
      createMongoRepository().updateDraftSection(
        "section-draft",
        { label: "Changed" },
        { revisionNumber: 1, statuses: ["draft"], active: true }
      )
    ).resolves.toMatchObject({ label: "Changed" });
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(guard).toHaveBeenCalledWith(
      {
        _id: "revision-draft",
        revisionNumber: 1,
        reviewStatus: { $in: ["draft"] }
      },
      { $set: { label: "Before" } }
    );
    expect(update).toHaveBeenCalledOnce();
  });

  it("rejects a concurrent Mongo draft-review transition before updating the section", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    vi.spyOn(DesignSectionRevisionModel, "findOne").mockReturnValueOnce({
      sort: () => ({
        lean: () => query({ _id: "revision-raced", revisionNumber: 1, reviewStatus: "draft", label: "Before" })
      })
    } as never);
    vi.spyOn(DesignSectionRevisionModel, "updateOne").mockReturnValueOnce(
      query({ matchedCount: 0, modifiedCount: 0 }) as never
    );
    const updateSection = vi.spyOn(DesignSectionModel, "findOneAndUpdate").mockReturnValueOnce({
      session: () => undefined,
      lean: () => ({
        exec: vi.fn().mockResolvedValue({
          _id: "section-raced",
          designVersionId: "version-raced",
          sourcePageId: "page-raced",
          label: "Changed",
          active: true,
          source: "manual",
          ocrConfidence: null,
          createdAt: new Date("2026-07-27T10:00:00.000Z"),
          updatedAt: new Date("2026-07-27T10:01:00.000Z")
        })
      })
    } as never);

    await expect(
      createMongoRepository().updateDraftSection(
        "section-raced",
        { label: "Changed" },
        { revisionNumber: 1, statuses: ["draft"], active: true }
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    expect(updateSection).not.toHaveBeenCalled();
  });

  it("reports a conditional Mongo section update miss as an optimistic conflict", async () => {
    const session = {} as never;
    vi.spyOn(DesignSectionRevisionModel, "findOne").mockReturnValueOnce({
      sort: () => ({
        lean: () => query({
          _id: "revision-remove-raced",
          revisionNumber: 3,
          reviewStatus: "draft",
          label: "Elevation"
        })
      })
    } as never);
    vi.spyOn(DesignSectionRevisionModel, "updateOne").mockReturnValueOnce(
      query({ matchedCount: 1, modifiedCount: 0 }) as never
    );
    vi.spyOn(DesignSectionModel, "findOneAndUpdate").mockReturnValueOnce({
      session: () => undefined,
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    } as never);

    await expect(
      createMongoRepository(session).updateDraftSection(
        "section-remove-raced",
        { active: false },
        { revisionNumber: 3, statuses: ["draft"], active: true }
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("submits only Mongo replacement drafts while preserving approved revisions", async () => {
    const session = {} as never;
    vi.spyOn(DesignSectionModel, "find").mockReturnValueOnce({
      lean: () => query([{ _id: "section-approved" }, { _id: "section-replacement" }])
    } as never);
    vi.spyOn(DesignSectionRevisionModel, "findOne")
      .mockReturnValueOnce({
        sort: () => ({
          lean: () => query({
            _id: "revision-approved",
            reviewStatus: "approved",
            revisionNumber: 1
          })
        })
      } as never)
      .mockReturnValueOnce({
        sort: () => ({
          lean: () => query({
            _id: "revision-replacement",
            reviewStatus: "draft",
            revisionNumber: 2
          })
        })
      } as never);
    const revisionUpdate = vi.spyOn(DesignSectionRevisionModel, "updateOne")
      .mockReturnValueOnce(query({ matchedCount: 1, modifiedCount: 1 }) as never);
    vi.spyOn(DesignExtractionJobModel, "updateOne")
      .mockReturnValueOnce(query({ matchedCount: 1, modifiedCount: 1 }) as never);

    await expect(
      createMongoRepository(session).submitDesignSectionDrafts(
        "version-partial",
        "2026-07-27T10:00:00.000Z"
      )
    ).resolves.toBe(1);
    expect(revisionUpdate).toHaveBeenCalledOnce();
    expect(revisionUpdate).toHaveBeenCalledWith(
      { _id: "revision-replacement", reviewStatus: "draft" },
      {
        $set: {
          reviewStatus: "submitted",
          submittedAt: new Date("2026-07-27T10:00:00.000Z")
        }
      }
    );
  });

  it("decides a submitted revision with a transactional CAS and aggregate update", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    const decidedRevision = {
      _id: "revision-decision",
      sectionId: "section-decision",
      revisionNumber: 2,
      sourcePageId: "page-decision",
      crop: { x: 0, y: 0, width: 10, height: 10 },
      croppedFileReference: "decision.png",
      label: "Elevation",
      reviewStatus: "rejected",
      submittedAt: new Date("2026-07-27T09:00:00.000Z"),
      reviewerId: "user-client-aurora",
      reviewedAt: new Date("2026-07-27T10:00:00.000Z"),
      rejectionComment: "Include dimensions.",
      createdAt: new Date("2026-07-27T08:00:00.000Z")
    };
    const decisionQuery = {
      session: vi.fn(),
      lean: () => ({ exec: vi.fn().mockResolvedValue(decidedRevision) })
    };
    const decisionUpdate = vi.spyOn(DesignSectionRevisionModel, "findOneAndUpdate")
      .mockReturnValueOnce(decisionQuery as never);
    vi.spyOn(DesignSectionModel, "findById").mockReturnValueOnce({
      lean: () => query({
        _id: "section-decision",
        designVersionId: "version-decision",
        active: true
      })
    } as never);
    vi.spyOn(DesignSectionModel, "find").mockReturnValueOnce({
      lean: () => query([
        { _id: "section-approved" },
        { _id: "section-decision" },
        { _id: "section-awaiting" }
      ])
    } as never);
    vi.spyOn(DesignSectionRevisionModel, "findOne")
      .mockReturnValueOnce({
        sort: () => ({ lean: () => query({ reviewStatus: "approved", revisionNumber: 1 }) })
      } as never)
      .mockReturnValueOnce({
        sort: () => ({ lean: () => query({ reviewStatus: "rejected", revisionNumber: 2 }) })
      } as never)
      .mockReturnValueOnce({
        sort: () => ({ lean: () => query({ reviewStatus: "submitted", revisionNumber: 1 }) })
      } as never);
    const jobUpdate = vi.spyOn(DesignExtractionJobModel, "updateOne")
      .mockReturnValueOnce(query({ matchedCount: 1, modifiedCount: 1 }) as never);

    await expect(
      createMongoRepository().decideSubmittedSectionRevision(
        "revision-decision",
        2,
        "rejected",
        "user-client-aurora",
        "Include dimensions.",
        "2026-07-27T10:00:00.000Z"
      )
    ).resolves.toMatchObject({
      revision: {
        id: "revision-decision",
        reviewStatus: "rejected",
        reviewerId: "user-client-aurora"
      },
      extractionStatus: "changes_requested",
      progress: { approved: 1, rejected: 1, awaitingReview: 1, total: 3 }
    });
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
    expect(decisionQuery.session).toHaveBeenCalledWith(session);
    expect(decisionUpdate).toHaveBeenCalledWith(
      {
        _id: "revision-decision",
        revisionNumber: 2,
        reviewStatus: "submitted"
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          reviewStatus: "rejected",
          reviewerId: "user-client-aurora",
          rejectionComment: "Include dimensions."
        })
      }),
      { new: true, runValidators: true }
    );
    expect(jobUpdate).toHaveBeenCalledWith(
      { designVersionId: "version-decision" },
      { $set: {
        status: "changes_requested",
        updatedAt: new Date("2026-07-27T10:00:00.000Z")
      } }
    );
  });

  it("rejects a stale Mongo decision CAS without recomputing aggregate state", async () => {
    const session = {} as never;
    const decisionQuery = {
      session: vi.fn(),
      lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
    };
    vi.spyOn(DesignSectionRevisionModel, "findOneAndUpdate")
      .mockReturnValueOnce(decisionQuery as never);
    vi.spyOn(DesignSectionRevisionModel, "exists")
      .mockReturnValueOnce(query({ _id: "revision-stale" }) as never);
    const findSection = vi.spyOn(DesignSectionModel, "findById");
    const updateJob = vi.spyOn(DesignExtractionJobModel, "updateOne");

    await expect(
      createMongoRepository(session).decideSubmittedSectionRevision(
        "revision-stale",
        1,
        "approved",
        "user-client-aurora",
        null,
        "2026-07-27T10:00:00.000Z"
      )
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    expect(findSection).not.toHaveBeenCalled();
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("keeps Mongo decision, aggregate, and audit writes in one aborting session", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    const decidedRevision = {
      _id: "revision-audit",
      sectionId: "section-audit",
      revisionNumber: 1,
      sourcePageId: "page-audit",
      crop: { x: 0, y: 0, width: 10, height: 10 },
      croppedFileReference: "audit.png",
      label: "Plan",
      reviewStatus: "approved",
      submittedAt: new Date("2026-07-27T09:00:00.000Z"),
      reviewerId: "user-client-aurora",
      reviewedAt: new Date("2026-07-27T10:00:00.000Z"),
      rejectionComment: null,
      createdAt: new Date("2026-07-27T08:00:00.000Z")
    };
    const decisionQuery = {
      session: vi.fn(),
      lean: () => ({ exec: vi.fn().mockResolvedValue(decidedRevision) })
    };
    vi.spyOn(DesignSectionRevisionModel, "findOneAndUpdate")
      .mockReturnValueOnce(decisionQuery as never);
    vi.spyOn(DesignSectionModel, "findById").mockReturnValueOnce({
      lean: () => query({
        _id: "section-audit",
        designVersionId: "version-audit",
        active: true
      })
    } as never);
    vi.spyOn(DesignSectionModel, "find").mockReturnValueOnce({
      lean: () => query([{ _id: "section-audit" }])
    } as never);
    vi.spyOn(DesignSectionRevisionModel, "findOne").mockReturnValueOnce({
      sort: () => ({ lean: () => query({ reviewStatus: "approved", revisionNumber: 1 }) })
    } as never);
    vi.spyOn(DesignExtractionJobModel, "updateOne")
      .mockReturnValueOnce(query({ matchedCount: 1, modifiedCount: 1 }) as never);
    const auditCreate = vi.spyOn(AuditEventModel, "create")
      .mockRejectedValueOnce(new Error("forced audit failure"));
    const repository = createMongoRepository();

    await expect(
      repository.runInTransaction(async (transaction) => {
        await transaction.decideSubmittedSectionRevision(
          "revision-audit",
          1,
          "approved",
          "user-client-aurora",
          null,
          "2026-07-27T10:00:00.000Z"
        );
        await transaction.appendAuditEvent({
          actorId: "user-client-aurora",
          action: "design_section_approved",
          entityType: "design_section_revision",
          entityId: "revision-audit",
          occurredAt: "2026-07-27T10:00:00.000Z"
        });
      })
    ).rejects.toThrow("forced audit failure");
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
    expect(decisionQuery.session).toHaveBeenCalledWith(session);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ action: "design_section_approved" })]),
      { session }
    );
  });

  it("persists a valid Mongo extraction draft as one replacement", async () => {
    const writes = mockSuccessfulReplacement();

    await expect(
      createMongoRepository({} as never).replaceExtractionDraft(validReplacement())
    ).resolves.toBeUndefined();
    expect(writes.deletePages.exec).toHaveBeenCalledOnce();
    expect(writes.deleteSections.exec).toHaveBeenCalledOnce();
    expect(writes.deleteRevisions.exec).toHaveBeenCalledOnce();
    expect(writes.updateJob.exec).toHaveBeenCalledOnce();
  });

  it("treats only the exact Mongo worker result ID as a replacement replay", async () => {
    vi.spyOn(DesignExtractionJobModel, "findOne").mockReturnValueOnce({
      lean: () => query(processingJob("result-1"))
    } as never);
    const sections = vi.spyOn(DesignSectionModel, "find");

    await expect(
      createMongoRepository({} as never).replaceExtractionDraft(validReplacement("result-1"))
    ).resolves.toBeUndefined();
    expect(sections).not.toHaveBeenCalled();
  });

  it("replaces a Mongo draft when a current worker submits a different result ID", async () => {
    const writes = mockSuccessfulReplacement(processingJob("result-old"));

    await createMongoRepository({} as never).replaceExtractionDraft(
      validReplacement("result-new")
    );

    expect(writes.deletePages.exec).toHaveBeenCalledOnce();
    expect(DesignExtractionJobModel.updateOne).toHaveBeenCalledWith(
      { _id: "job-replace" },
      { $set: { workerResultId: "result-new" } }
    );
  });

  it("rejects Mongo replacement before deleting a reviewed section revision", async () => {
    vi.spyOn(DesignExtractionJobModel, "findOne").mockReturnValueOnce({
      lean: () => query(processingJob())
    } as never);
    vi.spyOn(DesignSectionModel, "find").mockReturnValueOnce({
      select: () => ({ lean: () => query([{ _id: "section-reviewed" }]) })
    } as never);
    vi.spyOn(DesignSectionRevisionModel, "exists").mockReturnValueOnce(
      query({ _id: "revision-reviewed" }) as never
    );
    const deletePages = vi.spyOn(DesignSourcePageModel, "deleteMany");

    await expect(
      createMongoRepository({} as never).replaceExtractionDraft(validReplacement())
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    expect(deletePages).not.toHaveBeenCalled();
  });

  it("rejects Mongo section revisions for missing sections", async () => {
    vi.spyOn(DesignSectionModel, "exists").mockReturnValueOnce({
      exec: vi.fn().mockResolvedValue(null)
    } as never);

    await expect(
      createMongoRepository().createSectionRevision({
        id: "revision-missing",
        sectionId: "section-missing",
        revisionNumber: 1,
        sourcePageId: "page-missing",
        crop: { x: 0, y: 0, width: 1, height: 1 },
        croppedFileReference: "missing.png",
        label: "Missing",
        reviewStatus: "draft",
        submittedAt: null,
        reviewerId: null,
        reviewedAt: null,
        rejectionComment: null,
        createdAt: "2026-07-27T10:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it("rejects Mongo section edits after the latest revision leaves draft", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    vi.spyOn(DesignSectionRevisionModel, "findOne").mockReturnValueOnce({
      sort: () => ({
        lean: () => ({
          session: () => undefined,
          exec: vi.fn().mockResolvedValue({ reviewStatus: "submitted" })
        })
      })
    } as never);

    await expect(
      createMongoRepository().updateDraftSection("section-locked", { label: "Changed" })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("rejects Mongo worker proposals that are not active OCR draft revision ones", async () => {
    const session = {} as never;
    vi.spyOn(DesignExtractionJobModel, "findOne").mockReturnValueOnce({
      lean: () => ({
        session: () => undefined,
        exec: vi.fn().mockResolvedValue({
          _id: "job-invalid",
          designVersionId: "version-invalid",
          status: "processing",
          claimId: "claim-invalid",
          leaseExpiresAt: new Date("2026-07-27T10:06:00.000Z"),
          workerResultId: null
        })
      })
    } as never);

    await expect(
      createMongoRepository(session).replaceExtractionDraft({
        jobId: "job-invalid",
        claimId: "claim-invalid",
        processedAt: "2026-07-27T10:02:00.000Z",
        designVersionId: "version-invalid",
        workerResultId: "result-invalid",
        sourcePages: [
          {
            id: "page-invalid",
            designVersionId: "version-invalid",
            pageNumber: 1,
            renderedFileReference: "page-invalid.png",
            width: 100,
            height: 100,
            createdAt: "2026-07-27T10:00:00.000Z",
            updatedAt: "2026-07-27T10:00:00.000Z"
          }
        ],
        sections: [
          {
            section: {
              id: "section-invalid",
              designVersionId: "version-invalid",
              sourcePageId: "page-invalid",
              label: "Invalid",
              active: false,
              source: "ocr",
              ocrConfidence: 1,
              createdAt: "2026-07-27T10:00:00.000Z",
              updatedAt: "2026-07-27T10:00:00.000Z"
            },
            revision: {
              id: "revision-invalid",
              sectionId: "section-invalid",
              revisionNumber: 1,
              sourcePageId: "page-invalid",
              crop: { x: 0, y: 0, width: 10, height: 10 },
              croppedFileReference: "section-invalid.png",
              label: "Invalid",
              reviewStatus: "draft",
              submittedAt: null,
              reviewerId: null,
              reviewedAt: null,
              rejectionComment: null,
              createdAt: "2026-07-27T10:00:00.000Z"
            }
          }
        ]
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("indexes extraction jobs, source pages, and section revisions by their natural keys", () => {
    const uniqueIndexes = (model: typeof DesignExtractionJobModel) =>
      model.schema
        .indexes()
        .filter(([, options]) => options.unique)
        .map(([fields]) => fields);

    expect(uniqueIndexes(DesignExtractionJobModel)).toContainEqual({
      designVersionId: 1
    });
    expect(uniqueIndexes(DesignSourcePageModel)).toContainEqual({
      designVersionId: 1,
      pageNumber: 1
    });
    expect(uniqueIndexes(DesignSectionRevisionModel)).toContainEqual({
      sectionId: 1,
      revisionNumber: 1
    });
  });

  it("enables Mongo update pipelines when allocating a design version number", async () => {
    const version = demoSeedData.designVersions[0]!;
    const { id: _id, versionNumber: _versionNumber, ...input } =
      structuredClone(version);
    vi.spyOn(DesignVersionModel, "findOne").mockReturnValueOnce({
      sort: () => ({
        select: () => ({
          lean: () => ({ exec: vi.fn().mockResolvedValue(null) })
        })
      })
    } as never);
    const allocate = vi
      .spyOn(DesignVersionSequenceModel, "findOneAndUpdate")
      .mockReturnValueOnce({
        lean: () => ({
          exec: vi.fn().mockResolvedValue({ nextNumber: 1 })
        })
      } as never);
    const repository = createMongoRepository();
    vi.spyOn(repository, "createDesignVersion").mockResolvedValueOnce({
      ...version,
      id: "version-allocated",
      versionNumber: 1
    });

    await repository.createNextDesignVersion(input);

    expect(allocate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.objectContaining({ updatePipeline: true })
    );
  });

  it("accepts the API default empty task description", async () => {
    const task = demoSeedData.tasks[0]!;
    const document = new TaskModel({
      ...structuredClone(task),
      _id: "task-without-description",
      description: ""
    });

    await expect(document.validate()).resolves.toBeUndefined();
  });

  it("normalizes a duplicate design-version tuple into a repository conflict", async () => {
    vi.spyOn(DesignVersionModel, "create").mockRejectedValueOnce(
      Object.assign(new Error("E11000 duplicate key error"), { code: 11000 })
    );
    const repository = createMongoRepository();
    const existing = demoSeedData.designVersions[0]!;

    await expect(
      repository.createDesignVersion({
        ...structuredClone(existing),
        id: "version-duplicate-tuple"
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("defines floor order as unique within a project", () => {
    const uniqueIndexes = FloorModel.schema
      .indexes()
      .filter(([, options]) => options.unique)
      .map(([fields]) => fields);

    expect(uniqueIndexes).toEqual([{ projectId: 1, order: 1 }]);
  });

  it("uses a bounded grouped aggregation for latest client-visible versions", async () => {
    const version = demoSeedData.designVersions[0]!;
    const aggregate = vi.spyOn(DesignVersionModel, "aggregate").mockReturnValueOnce({
      exec: vi.fn().mockResolvedValue([{ ...version, _id: version.id, uploadedAt: new Date(version.uploadedAt), approvedAt: new Date(version.approvedAt!), createdAt: new Date(version.createdAt), updatedAt: new Date(version.updatedAt) }])
    } as never);
    const find = vi.spyOn(DesignVersionModel, "find");

    const results = await createMongoRepository().listLatestClientVisibleDesignVersions(["project-aurora-villa", "project-aurora-studio"]);

    expect(find).not.toHaveBeenCalled();
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { projectId: { $in: ["project-aurora-villa", "project-aurora-studio"] }, approvalStatus: "approved", clientVisible: true } },
      { $sort: { projectId: 1, approvedAt: -1, uploadedAt: -1, _id: -1 } },
      { $group: { _id: "$projectId", version: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$version" } },
      { $sort: { projectId: 1 } }
    ]);
    expect(results).toMatchObject([{ id: version.id, projectId: version.projectId }]);
  });

  it("indexes the client latest-version query fields and deterministic sort", () => {
    expect(DesignVersionModel.schema.indexes().map(([fields]) => fields)).toContainEqual({ projectId: 1, approvalStatus: 1, clientVisible: 1, approvedAt: -1, uploadedAt: -1, _id: -1 });
  });

  it("marks every task-event history field immutable", () => {
    const historyFields = [
      "taskId",
      "actorId",
      "type",
      "occurredAt",
      "from",
      "to",
      "note"
    ];

    expect(
      Object.fromEntries(
        historyFields.map((field) => [
          field,
          TaskEventModel.schema.path(field).options.immutable
        ])
      )
    ).toEqual({
      taskId: true,
      actorId: true,
      type: true,
      occurredAt: true,
      from: true,
      to: true,
      note: true
    });
  });

  it("runs evaluation writes with the active Mongo transaction session", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) =>
        operation()
      ),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    const evaluation = demoSeedData.evaluations[0]!;
    const create = vi.spyOn(EvaluationModel, "create").mockResolvedValueOnce([
      {
        toObject: () => ({
          ...evaluation,
          _id: evaluation.id,
          periodStartAt: new Date(evaluation.periodStartAt),
          periodEndAt: new Date(evaluation.periodEndAt),
          createdAt: new Date(evaluation.createdAt)
        })
      }
    ] as never);

    const result = await createMongoRepository().runInTransaction((transaction) =>
      transaction.createEvaluation(evaluation)
    );

    expect(result.id).toBe(evaluation.id);
    expect(create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          _id: evaluation.id,
          subjectUserId: evaluation.subjectUserId
        })
      ],
      { session }
    );
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it("runs every workflow entity create with the active Mongo transaction session", async () => {
    const session = {
      withTransaction: vi.fn(async (operation: () => Promise<unknown>) =>
        operation()
      ),
      endSession: vi.fn(async () => undefined)
    };
    vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session as never);
    const project = demoSeedData.projects[0]!;
    const floor = demoSeedData.floors[0]!;
    const stage = demoSeedData.stages[0]!;
    const task = demoSeedData.tasks[0]!;
    const document = (record: { id: string; version?: number }) => ({
      toObject: () => ({
        ...record,
        _id: record.id,
        __v: (record.version ?? 1) - 1
      })
    });
    const projectCreate = vi
      .spyOn(ProjectModel, "create")
      .mockResolvedValueOnce([document(project)] as never);
    const floorCreate = vi
      .spyOn(FloorModel, "create")
      .mockResolvedValueOnce([document(floor)] as never);
    const stageCreate = vi
      .spyOn(DesignStageModel, "create")
      .mockResolvedValueOnce([document(stage)] as never);
    const taskCreate = vi
      .spyOn(TaskModel, "create")
      .mockResolvedValueOnce([document(task)] as never);

    await createMongoRepository().runInTransaction(async (transaction) => {
      await transaction.createProject(project);
      await transaction.createFloor(floor);
      await transaction.createDesignStage(stage);
      await transaction.createTask(task);
    });

    for (const [create, record] of [
      [projectCreate, project],
      [floorCreate, floor],
      [stageCreate, stage],
      [taskCreate, task]
    ] as const) {
      expect(create).toHaveBeenCalledWith(
        [expect.objectContaining({ _id: record.id })],
        { session }
      );
    }
    expect(session.withTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });
});

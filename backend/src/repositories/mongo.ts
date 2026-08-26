import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession, type Model, type PipelineStage } from "mongoose";
import { normalizeEmail } from "../domain/email.js";
import {
  invitationEmailSchema,
  invitationNameSchema,
  normalizeInvitationEmail,
  normalizeInvitationMobile
} from "../domain/user-invitations.js";
import {
  REQUESTABLE_MODULES_BY_ROLE,
  type ProjectModule
} from "../domain/authorization.js";
import { AccessRequestModel } from "../models/AccessRequest.js";
import { AuthorizationCoordinationModel } from "../models/AuthorizationCoordination.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { DesignStageModel } from "../models/DesignStage.js";
import { DesignExtractionJobModel } from "../models/DesignExtractionJob.js";
import { DesignSectionModel } from "../models/DesignSection.js";
import { DesignSectionRevisionModel } from "../models/DesignSectionRevision.js";
import { DesignSourcePageModel } from "../models/DesignSourcePage.js";
import { DesignVersionModel } from "../models/DesignVersion.js";
import { DesignVersionSequenceModel } from "../models/DesignVersionSequence.js";
import { EmailCoordinationModel } from "../models/EmailCoordination.js";
import { EvaluationModel } from "../models/Evaluation.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { FloorModel } from "../models/Floor.js";
import { LeadModel } from "../models/Lead.js";
import { LeadActivityModel } from "../models/LeadActivity.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectAccessGrantModel } from "../models/ProjectAccessGrant.js";
import {
  WORKFLOW_TASK_SCHEDULE,
  workflowTaskDueAt,
  type ProjectWorkflowTaskKind
} from "../domain/project-workflow.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { TaskModel } from "../models/Task.js";
import { TaskEventModel } from "../models/TaskEvent.js";
import { UserModel } from "../models/User.js";
import { UserInvitationModel } from "../models/UserInvitation.js";
import { adminProjectSummary } from "./admin-project-summary.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository,
  type AccessRequestFilters,
  type AccessRequestRecord,
  type AuditEventRecord,
  type AuditFilters,
  type EstimateSummaryRecord,
  type DesignExtractionJobRecord,
  type DesignSectionRecord,
  type DesignSectionRevisionRecord,
  type DesignStageRecord,
  type DesignSourcePageRecord,
  type DesignVersionRecord,
  type EvaluationRecord,
  type EstimatorOption,
  type FloorRecord,
  type LeadActivityRecord,
  type LeadRecord,
  type ManagerTreeNode,
  type NewUser,
  type NewAccessRequest,
  type NewProjectAccessGrant,
  type NewDesignExtractionJob,
  type NewDesignVersion,
  type ProjectHierarchy,
  type ProjectRecord,
  type ProjectAccessGrantRecord,
  type TaskEventRecord,
  type TaskRecord,
  type UserInvitationAdminRecord,
  type UserInvitationFilters,
  type UserInvitationRecord,
  type UserRecord
} from "./types.js";

type PlainDocument = Record<string, any>;
const MAX_DUPLICATE_KEY_TRANSACTION_ATTEMPTS = 2;

export function createMongoRepository(session?: ClientSession): AppRepository {
  const executeSessionCompatibleReadPair = async <First, Second>(
    first: () => Promise<First>,
    second: () => Promise<Second>
  ): Promise<[First, Second]> => {
    if (!session) return Promise.all([first(), second()]);
    const firstResult = await first();
    const secondResult = await second();
    return [firstResult, secondResult];
  };

  const eligibleGrantSource = (
    user: UserRecord,
    module: ProjectModule
  ): ProjectAccessGrantRecord["source"] | null => {
    if (!user.active) return null;
    if (user.role === "admin" && module === "projects") {
      return "admin_initiator";
    }
    if (
      REQUESTABLE_MODULES_BY_ROLE[user.role].some(
        (requestableModule) => requestableModule === module
      )
    ) {
      return "access_request";
    }
    return null;
  };

  const legacyProjectFilterForUserInModule = (
    user: UserRecord,
    module: ProjectModule
  ): PlainDocument | null => {
    if (!user.active) return null;
    if (user.role === "super_admin") return {};
    if (module !== "projects" && module !== "design") return null;
    switch (user.role) {
      case "design_head":
        return {};
      case "client":
        return { clientId: user.id };
      case "designer":
        return {
          $or: [
            { initiatingDesignerId: user.id },
            { assignedDesignerIds: user.id }
          ]
        };
      case "design_manager":
        return { managerId: user.id };
      default:
        return null;
    }
  };

  const projectFilterForUserInModule = async (
    user: UserRecord,
    module: ProjectModule
  ): Promise<PlainDocument | null> => {
    const legacyFilter = legacyProjectFilterForUserInModule(user, module);
    if (legacyFilter !== null && Object.keys(legacyFilter).length === 0) return {};

    const source = eligibleGrantSource(user, module);
    let grantProjectIds: string[] = [];
    if (source !== null) {
      const grantQuery = ProjectAccessGrantModel.find({
        userId: user.id,
        module,
        active: true,
        source
      })
        .select({ projectId: 1, _id: 0 })
        .lean();
      if (session) grantQuery.session(session);
      const grants = await grantQuery.exec();
      grantProjectIds = grants.map((grant) => String(grant.projectId));
    }

    if (legacyFilter === null) {
      return grantProjectIds.length === 0
        ? null
        : { _id: { $in: grantProjectIds } };
    }
    if (grantProjectIds.length === 0) return legacyFilter;
    return {
      $or: [legacyFilter, { _id: { $in: grantProjectIds } }]
    };
  };

  const loadAdminProjectSummaries = async (
    projectDocuments: PlainDocument[],
    actor: UserRecord
  ) => {
    if (projectDocuments.length === 0) return [];
    const projectIds = projectDocuments.map((document) => idOf(document));
    const leadQuery = LeadModel.find({ projectId: { $in: projectIds } }).lean();
    if (session) leadQuery.session(session);
    const leadDocuments = await leadQuery.exec();
    const leadIds = leadDocuments.map((document) => idOf(document));
    const estimatorIds = projectDocuments
      .map((document) => document.assignedEstimatorId)
      .filter((id): id is string => typeof id === "string");
    const estimatorQuery = UserModel.find({ _id: { $in: estimatorIds } })
      .select({ _id: 1, name: 1, email: 1, title: 1 })
      .lean();
    const estimateQuery = EstimateModel.find({
      $or: [
        { projectId: { $in: projectIds } },
        { leadId: { $in: leadIds } }
      ]
    })
      .select({
        _id: 1,
        leadId: 1,
        projectId: 1,
        status: 1,
        total: 1,
        designPlanStatus: 1,
        designPlanVersion: 1,
        designPlanDesignerId: 1
      })
      .lean();
    if (session) {
      estimatorQuery.session(session);
      estimateQuery.session(session);
    }
    const [estimatorDocuments, estimateDocuments] =
      await executeSessionCompatibleReadPair(
        () => estimatorQuery.exec(),
        () => estimateQuery.exec()
      );
    const designerIds = [
      ...new Set(
        estimateDocuments
          .map((document) => document.designPlanDesignerId)
          .filter((id): id is string => typeof id === "string")
      )
    ];
    let designerDocuments: Array<Record<string, any>> = [];
    if (designerIds.length > 0) {
      const designerQuery = UserModel.find({
        _id: { $in: designerIds }
      }).select({ _id: 1, name: 1, email: 1 }).lean();
      if (session) designerQuery.session(session);
      designerDocuments = await designerQuery.exec();
    }
    const estimateIds = estimateDocuments.map((document) => idOf(document));
    const roundQuery = EstimateClientReviewRoundModel.find({
      estimateId: { $in: estimateIds }
    })
      .select({
        _id: 1,
        estimateId: 1,
        sendGeneration: 1,
        estimateVersion: 1,
        version: 1,
        deliveryStatus: 1,
        deliveryAttemptCount: 1,
        deliveredAt: 1,
        status: 1,
        assignedAdminId: 1
      })
      .sort({ estimateId: 1, sendGeneration: -1, _id: 1 })
      .lean();
    if (session) roundQuery.session(session);
    const roundDocuments = await roundQuery.exec();
    const currentRoundByEstimateId = new Map<
      string,
      Pick<EstimateSummaryRecord, "clientReview" | "assignedAdminId">
    >();
    for (const document of roundDocuments) {
      const estimateId = String(document.estimateId);
      if (currentRoundByEstimateId.has(estimateId)) continue;
      currentRoundByEstimateId.set(estimateId, {
        clientReview: {
          id: idOf(document),
          sendGeneration: Number(document.sendGeneration),
          estimateVersion: Number(document.estimateVersion),
          version: Number(document.version),
          deliveryStatus: document.deliveryStatus,
          deliveryAttemptCount: Number(document.deliveryAttemptCount),
          deliveredAt: nullableIso(document.deliveredAt),
          status: document.status
        },
        assignedAdminId: String(document.assignedAdminId)
      });
    }
    const projectUsers = [...estimatorDocuments, ...designerDocuments].map((document) => ({
      id: idOf(document),
      name: document.name,
      email: document.email
    }));
    const estimates: EstimateSummaryRecord[] = estimateDocuments.map((document) => {
      const currentRound = currentRoundByEstimateId.get(idOf(document));
      return {
        id: idOf(document),
        leadId: String(document.leadId),
        projectId: document.projectId == null ? null : String(document.projectId),
        status: String(document.status),
        total: Number(document.total),
        clientReview: currentRound?.clientReview ?? null,
        assignedAdminId: currentRound?.assignedAdminId ?? null,
        designPlanStatus: document.designPlanStatus == null
          ? null
          : String(document.designPlanStatus),
        designPlanVersion: Number(document.designPlanVersion ?? 0),
        designPlanDesignerId: document.designPlanDesignerId == null
          ? null
          : String(document.designPlanDesignerId)
      };
    });
    const leads = leadDocuments.map(mapLead);
    return projectDocuments.map((document) =>
      adminProjectSummary(mapProject(document), projectUsers, leads, estimates, actor)
    );
  };

  const transitionUserInvitation = async (
    id: string,
    expectedVersion: number,
    extraFilter: PlainDocument,
    set: PlainDocument
  ): Promise<UserInvitationRecord> =>
    runAuthorizationWrite(session, "User invitation", async () => {
      const query = UserInvitationModel.findOneAndUpdate(
        {
          _id: id,
          status: "pending",
          __v: expectedVersion - 1,
          ...extraFilter
        },
        { $set: set, $inc: { __v: 1 } },
        { new: true, runValidators: true, timestamps: false }
      ).select("+tokenHash");
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (document) return mapUserInvitation(document);

      const existsQuery = UserInvitationModel.exists({ _id: id });
      if (session) existsQuery.session(session);
      if (!(await existsQuery.exec())) {
        throw new RepositoryNotFoundError(`User invitation ${id} was not found.`);
      }
      throw new RepositoryConflictError(
        `User invitation ${id} cannot transition at version ${expectedVersion}.`
      );
    });

  const repository: AppRepository = {
    async runInTransaction(operation) {
      if (session) return operation(repository);
      for (
        let attempt = 0;
        attempt < MAX_DUPLICATE_KEY_TRANSACTION_ATTEMPTS;
        attempt += 1
      ) {
        const transactionSession = await mongoose.startSession();
        let result: unknown;
        let completed = false;
        try {
          await transactionSession.withTransaction(async () => {
            result = await operation(createMongoRepository(transactionSession));
            completed = true;
          });
          if (!completed) {
            throw new Error("MongoDB transaction did not complete.");
          }
          return result as Awaited<ReturnType<typeof operation>>;
        } catch (error) {
          if (!isMongoDuplicateKeyError(error)) {
            throw error;
          }
          if (attempt === MAX_DUPLICATE_KEY_TRANSACTION_ATTEMPTS - 1) {
            throw new RepositoryConflictError(
              "MongoDB transaction conflicted with a concurrent write."
            );
          }
        } finally {
          await transactionSession.endSession();
        }
      }
      throw new Error("MongoDB transaction retry limit was exhausted.");
    },

    async coordinateClientEmail(emailNormalized) {
      const query = EmailCoordinationModel.updateOne(
        { _id: normalizeEmail(emailNormalized) },
        { $inc: { revision: 1 } },
        { upsert: true }
      );
      if (session) query.session(session);
      await query.exec();
    },

    async findUserInvitationById(id) {
      const query = UserInvitationModel.findById(id).select("+tokenHash");
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapUserInvitation(document) : null;
    },

    async findPendingUserInvitationByEmail(emailNormalized) {
      const query = UserInvitationModel.findOne({
        emailNormalized: normalizeInvitationEmail(emailNormalized),
        status: "pending"
      }).select("+tokenHash");
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapUserInvitation(document) : null;
    },

    async findLatestUserInvitationIssuedAtByEmail(emailNormalized) {
      const query = UserInvitationModel.findOne({
        emailNormalized: normalizeInvitationEmail(emailNormalized)
      })
        .sort({ issuedAt: -1, _id: -1 })
        .select({ issuedAt: 1, _id: 0 });
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? iso(document.issuedAt) : null;
    },

    async findPendingUserInvitationByTokenHash(tokenHash) {
      const query = UserInvitationModel.findOne({
        tokenHash,
        status: "pending"
      }).select("+tokenHash");
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapUserInvitation(document) : null;
    },

    async pageUserInvitations(filters, pagination, now) {
      return pageUserInvitations(filters, pagination, now, session);
    },

    async hasUnclaimedClientProjectByEmail(emailNormalized) {
      const query = ProjectModel.exists({
        clientId: null,
        clientEmailNormalized: normalizeInvitationEmail(emailNormalized)
      });
      if (session) query.session(session);
      return Boolean(await query.exec());
    },

    async createUserInvitation(input) {
      return runAuthorizationWrite(session, "User invitation", async () => {
        const emailNormalized = normalizeInvitationEmail(input.email);
        const pendingQuery = UserInvitationModel.findOne({
          emailNormalized,
          status: "pending"
        }).select({ _id: 1 });
        if (session) pendingQuery.session(session);
        if (await pendingQuery.lean().exec()) {
          throw new RepositoryConflictError(
            "Pending user invitation already exists for this email."
          );
        }
        const document = await createDocument(
          UserInvitationModel,
          userInvitationForMongo(input),
          session
        );
        return mapUserInvitation(document.toObject());
      });
    },

    async supersedeUserInvitation(id, expectedVersion, change) {
      return transitionUserInvitation(id, expectedVersion, {}, {
        tokenHash: null,
        status: "superseded",
        supersededByInvitationId: change.supersededByInvitationId,
        supersededAt: date(change.supersededAt),
        updatedAt: date(change.updatedAt)
      });
    },

    async resendUserInvitation(id, expectedVersion, change) {
      if (
        !Number.isSafeInteger(change.tokenGeneration) ||
        change.tokenGeneration < 2
      ) {
        throw new RepositoryConflictError(
          `User invitation ${id} has an invalid resend generation.`
        );
      }
      return transitionUserInvitation(
        id,
        expectedVersion,
        { tokenGeneration: change.tokenGeneration - 1 },
        {
          tokenHash: change.tokenHash,
          tokenGeneration: change.tokenGeneration,
          issuedAt: date(change.issuedAt),
          expiresAt: date(change.expiresAt),
          tokenIssuedById: change.tokenIssuedById,
          tokenIssuerVersion: change.tokenIssuerVersion,
          deliveryStatus: "queued",
          deliveryAttemptedAt: null,
          sentAt: null,
          deliveryFailureCode: null,
          updatedAt: date(change.updatedAt)
        }
      );
    },

    async revokeUserInvitation(id, expectedVersion, change) {
      return transitionUserInvitation(id, expectedVersion, {}, {
        tokenHash: null,
        status: "revoked",
        revokedById: change.revokedById,
        revokedAt: date(change.revokedAt),
        updatedAt: date(change.updatedAt)
      });
    },

    async acceptUserInvitation(
      id,
      expectedVersion,
      expectedGeneration,
      expectedTokenHash,
      change
    ) {
      return transitionUserInvitation(
        id,
        expectedVersion,
        {
          tokenGeneration: expectedGeneration,
          tokenHash: expectedTokenHash
        },
        {
          tokenHash: null,
          status: "accepted",
          acceptedUserId: change.acceptedUserId,
          acceptedAt: date(change.acceptedAt),
          updatedAt: date(change.updatedAt)
        }
      );
    },

    async updateUserInvitationDelivery(id, tokenGeneration, change) {
      const query = UserInvitationModel.findOneAndUpdate(
        {
          _id: id,
          status: "pending",
          tokenGeneration,
          deliveryStatus: "queued"
        },
        {
          $set: {
            deliveryStatus: change.status,
            deliveryAttemptedAt: date(change.attemptedAt),
            sentAt: change.status === "sent" ? date(change.sentAt) : null,
            deliveryFailureCode:
              change.status === "failed" ? change.failureCode : null,
            updatedAt: date(change.updatedAt)
          }
        },
        { new: true, runValidators: true, timestamps: false }
      ).select("+tokenHash");
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapUserInvitation(document) : null;
    },

    async coordinateAuthorizationMutation() {
      const query = AuthorizationCoordinationModel.updateOne(
        { _id: "authorization" },
        {
          $inc: { revision: 1 },
          $set: { updatedAt: new Date() }
        },
        { upsert: true }
      );
      if (session) query.session(session);
      await query.exec();
    },

    async findAccessRequestById(id) {
      const query = AccessRequestModel.findById(id);
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapAccessRequest(document) : null;
    },

    async findPendingAccessRequest(requesterId, projectId, module) {
      const query = AccessRequestModel.findOne({
        requesterId,
        projectId,
        module,
        status: "pending"
      });
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapAccessRequest(document) : null;
    },

    async createAccessRequest(input: NewAccessRequest) {
      return runAuthorizationWrite(session, "Access request", async () => {
        const document = await createDocument(
          AccessRequestModel,
          accessRequestForMongo(input, input.id ?? randomUUID()),
          session
        );
        return mapAccessRequest(document.toObject());
      });
    },

    async findOrCreatePendingAccessRequest(input: NewAccessRequest) {
      const candidateId = input.id ?? randomUUID();
      const candidate = accessRequestForMongo(input, candidateId);
      await validateAccessRequestCandidate(candidate);
      try {
        const result = await AccessRequestModel.findOneAndUpdate(
          {
            requesterId: input.requesterId,
            projectId: input.projectId,
            module: input.module,
            status: "pending"
          },
          {
            $setOnInsert: candidate
          },
          {
            upsert: true,
            new: true,
            includeResultMetadata: true,
            runValidators: true,
            timestamps: false,
            ...(session ? { session } : {})
          }
        ).lean().exec();
        if (!result.value) {
          throw new Error("Pending request upsert returned no row.");
        }
        return {
          record: mapAccessRequest(result.value),
          created: result.lastErrorObject?.upserted !== undefined
        };
      } catch (error) {
        if (!isMongoDuplicateKeyError(error)) throw error;
        if (session) throw error;
        const winner = await repository.findPendingAccessRequest(
          input.requesterId,
          input.projectId,
          input.module
        );
        if (winner) return { record: winner, created: false };
        throw new RepositoryConflictError("Access request already exists.");
      }
    },

    async transitionAccessRequest(id, expectedVersion, change) {
      const query = AccessRequestModel.findOneAndUpdate(
        { _id: id, status: "pending", __v: expectedVersion - 1 },
        {
          $set: {
            ...change,
            reviewedAt: change.reviewedAt ? date(change.reviewedAt) : null,
            updatedAt: date(change.updatedAt)
          },
          $inc: { __v: 1 }
        },
        { new: true, runValidators: true, timestamps: false }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (document) return mapAccessRequest(document);
      const exists = AccessRequestModel.exists({ _id: id });
      if (session) exists.session(session);
      if (!(await exists.exec())) {
        throw new RepositoryNotFoundError(`Access request ${id} was not found.`);
      }
      throw new RepositoryConflictError(
        `Access request ${id} cannot transition at version ${expectedVersion}.`
      );
    },

    async pageAccessRequestsForRequester(requesterId, filters, pagination) {
      return pageAccessRequests(
        { requesterId, ...accessRequestFilter(filters) },
        pagination,
        session
      );
    },

    async pageAccessRequestsForReview(scope, filters, pagination) {
      const filter = accessRequestFilter(filters);
      if (scope.kind === "global") {
        return pageAccessRequests(filter, pagination, session);
      }
      const pipeline: PipelineStage[] = [
        { $match: filter },
        {
          $lookup: {
            from: ProjectAccessGrantModel.collection.name,
            let: { requestProjectId: "$projectId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$projectId", "$$requestProjectId"] },
                  userId: scope.adminId,
                  module: "projects",
                  source: "admin_initiator",
                  active: true
                }
              },
              { $limit: 1 }
            ],
            as: "initiatorGrants"
          }
        },
        {
          $lookup: {
            from: ProjectModel.collection.name,
            localField: "projectId",
            foreignField: "_id",
            as: "existingProjects"
          }
        },
        {
          $match: {
            "initiatorGrants.0": { $exists: true },
            "existingProjects.0": { $exists: true }
          }
        },
        {
          $facet: {
            items: [
              { $sort: { createdAt: -1, _id: -1 } },
              { $skip: pagination.offset },
              { $limit: pagination.limit },
              { $project: { initiatorGrants: 0, existingProjects: 0 } }
            ],
            count: [{ $count: "total" }]
          }
        }
      ];
      const aggregate = AccessRequestModel.aggregate(pipeline);
      if (session) aggregate.session(session);
      const [result] = await aggregate.exec();
      return {
        items: (result?.items ?? []).map(mapAccessRequest),
        total: result?.count?.[0]?.total ?? 0
      };
    },

    async findProjectAccessGrantById(id) {
      const query = ProjectAccessGrantModel.findById(id);
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapProjectAccessGrant(document) : null;
    },

    async findProjectAccessGrantByAccessRequestId(accessRequestId) {
      const query = ProjectAccessGrantModel.findOne({ accessRequestId });
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapProjectAccessGrant(document) : null;
    },

    async findActiveProjectAccessGrant(userId, projectId, module) {
      const query = ProjectAccessGrantModel.findOne({
        userId,
        projectId,
        module,
        active: true
      });
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapProjectAccessGrant(document) : null;
    },

    async listActiveProjectAccessGrants(userId, module) {
      const query = ProjectAccessGrantModel.find({ userId, module, active: true })
        .sort({ projectId: 1, _id: 1 });
      if (session) query.session(session);
      const documents = await query.lean().exec();
      return documents.map(mapProjectAccessGrant);
    },

    async createProjectAccessGrant(input: NewProjectAccessGrant) {
      return runAuthorizationWrite(session, "Project access grant", async () => {
        const document = await createDocument(
          ProjectAccessGrantModel,
          projectAccessGrantForMongo(input, input.id ?? randomUUID()),
          session
        );
        return mapProjectAccessGrant(document.toObject());
      });
    },

    async findOrCreateActiveProjectAccessGrant(input: NewProjectAccessGrant) {
      const candidateId = input.id ?? randomUUID();
      const candidate = projectAccessGrantForMongo(input, candidateId);
      await validateProjectAccessGrantCandidate(candidate);
      try {
        const result = await ProjectAccessGrantModel.findOneAndUpdate(
          {
            userId: input.userId,
            projectId: input.projectId,
            module: input.module,
            active: true
          },
          {
            $setOnInsert: candidate
          },
          {
            upsert: true,
            new: true,
            includeResultMetadata: true,
            runValidators: true,
            timestamps: false,
            ...(session ? { session } : {})
          }
        ).lean().exec();
        if (!result.value) {
          throw new Error("Active project grant upsert returned no row.");
        }
        return {
          record: mapProjectAccessGrant(result.value),
          created: result.lastErrorObject?.upserted !== undefined
        };
      } catch (error) {
        if (!isMongoDuplicateKeyError(error)) throw error;
        if (session) throw error;
        const winner = await repository.findActiveProjectAccessGrant(
          input.userId,
          input.projectId,
          input.module
        );
        if (winner) return { record: winner, created: false };
        throw new RepositoryConflictError("Project access grant already exists.");
      }
    },

    async revokeProjectAccessGrant(id, expectedVersion, change) {
      const query = ProjectAccessGrantModel.findOneAndUpdate(
        { _id: id, active: true, __v: expectedVersion - 1 },
        {
          $set: {
            active: false,
            revokedAt: date(change.revokedAt),
            revokedById: change.revokedById,
            revocationReason: change.revocationReason.trim(),
            updatedAt: date(change.updatedAt)
          },
          $inc: { __v: 1 }
        },
        { new: true, runValidators: true, timestamps: false }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (document) return mapProjectAccessGrant(document);
      const exists = ProjectAccessGrantModel.exists({ _id: id });
      if (session) exists.session(session);
      if (!(await exists.exec())) {
        throw new RepositoryNotFoundError(`Project access grant ${id} was not found.`);
      }
      throw new RepositoryConflictError(
        `Project access grant ${id} cannot be revoked at version ${expectedVersion}.`
      );
    },

    async revokeActiveProjectAccessGrantsForUser(userId, change) {
      const beforeQuery = ProjectAccessGrantModel.find({ userId, active: true }).select({ _id: 1 });
      if (session) beforeQuery.session(session);
      const before = await beforeQuery.lean().exec();
      if (before.length === 0) return [];
      const ids = before.map((document) => document._id);
      const update = ProjectAccessGrantModel.updateMany(
        { _id: { $in: ids }, active: true },
        {
          $set: {
            active: false,
            revokedAt: date(change.revokedAt),
            revokedById: change.revokedById,
            revocationReason: change.revocationReason.trim(),
            updatedAt: date(change.updatedAt)
          },
          $inc: { __v: 1 }
        },
        { runValidators: true, timestamps: false }
      );
      if (session) update.session(session);
      await update.exec();
      const afterQuery = ProjectAccessGrantModel.find({
        _id: { $in: ids },
        active: false,
        revokedAt: date(change.revokedAt),
        revokedById: change.revokedById
      }).sort({ projectId: 1, _id: 1 });
      if (session) afterQuery.session(session);
      const after = await afterQuery.lean().exec();
      return after.map(mapProjectAccessGrant);
    },

    async findUserById(id) {
      const query = UserModel.findById(id).select("+passwordHash");
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapUser(document) : null;
    },

    async findUserByEmail(email) {
      const query = UserModel.findOne({
        emailNormalized: normalizeEmail(email)
      }).select("+passwordHash");
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapUser(document) : null;
    },

    async createUser(input: NewUser) {
      const emailNormalized = normalizeEmail(input.email);
      const createdAt = input.createdAt ? date(input.createdAt) : new Date();
      const document = await createMongoDocument("User", () =>
        createDocument(UserModel, {
          _id: input.id ?? randomUUID(),
          name: input.name,
          email: input.email.trim(),
          emailNormalized,
          mobile: input.mobile ?? null,
          address: input.address ?? null,
          passwordHash: input.passwordHash,
          role: input.role,
          active: input.active ?? true,
          accountKind: input.accountKind ?? "standard",
          version: 1,
          managerId: input.managerId ?? null,
          authorizedClientIds: input.authorizedClientIds ?? [],
          ...(input.avatar ? { avatar: input.avatar } : {}),
          ...(input.title ? { title: input.title } : {}),
          createdAt,
          updatedAt: input.updatedAt ? date(input.updatedAt) : createdAt
        }, session)
      );
      return mapUser(document.toObject());
    },

    async listUsers() {
      const documents = await UserModel.find()
        .select("+passwordHash")
        .sort({ name: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapUser);
    },

    async listUsersByIds(ids) {
      if (ids.length === 0) return [];
      const documents = await UserModel.find({ _id: { $in: ids } })
        .select("+passwordHash")
        .sort({ name: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapUser);
    },

    async pageUsers(filters, pagination) {
      if (filters.role && !filters.visibleRoles.includes(filters.role)) {
        return { items: [], total: 0 };
      }
      const filter: PlainDocument = {
        role: filters.role ?? { $in: [...filters.visibleRoles] }
      };
      if (filters.active !== undefined) filter.active = filters.active;
      if (filters.search?.trim()) {
        const search = new RegExp(escapeRegex(filters.search.trim()), "i");
        filter.$or = [{ name: search }, { email: search }];
      }
      const usersQuery = UserModel.find(filter)
        .select("+passwordHash")
        .sort({ name: 1, _id: 1 })
        .skip(pagination.offset)
        .limit(pagination.limit);
      if (session) usersQuery.session(session);
      const documents = await usersQuery.lean().exec();
      const countQuery = UserModel.countDocuments(filter);
      if (session) countQuery.session(session);
      const total = await countQuery.exec();
      return { items: documents.map(mapUser), total };
    },

    async countActiveUsersByRole(role) {
      const query = UserModel.countDocuments({ role, active: true });
      if (session) query.session(session);
      return query.exec();
    },

    async countUserResponsibilities(userId) {
      const leadQuery = LeadModel.countDocuments({
        ownerId: userId,
        stage: { $nin: ["won", "lost"] }
      });
      if (session) leadQuery.session(session);
      const ownedActiveLeads = await leadQuery.exec();

      const estimateQuery = EstimateModel.countDocuments({
        ownerId: userId,
        status: { $ne: "client_approved" }
      });
      if (session) estimateQuery.session(session);
      const ownedActiveEstimates = await estimateQuery.exec();

      const initiatedProjectQuery = ProjectModel.countDocuments({
        initiatingDesignerId: userId,
        status: { $ne: "completed" }
      });
      if (session) initiatedProjectQuery.session(session);
      const initiatedActiveProjects = await initiatedProjectQuery.exec();

      const assignedProjectQuery = ProjectModel.countDocuments({
        assignedDesignerIds: userId,
        status: { $ne: "completed" }
      });
      if (session) assignedProjectQuery.session(session);
      const assignedActiveProjects = await assignedProjectQuery.exec();

      const managedProjectQuery = ProjectModel.countDocuments({
        managerId: userId,
        status: { $ne: "completed" }
      });
      if (session) managedProjectQuery.session(session);
      const managedActiveProjects = await managedProjectQuery.exec();

      const taskQuery = TaskModel.countDocuments({
        ownerId: userId,
        status: { $ne: "completed" }
      });
      if (session) taskQuery.session(session);
      const ownedActiveTasks = await taskQuery.exec();

      const directReportQuery = UserModel.countDocuments({ managerId: userId });
      if (session) directReportQuery.session(session);
      const directReports = await directReportQuery.exec();

      const clientProjectQuery = ProjectModel.countDocuments({ clientId: userId });
      if (session) clientProjectQuery.session(session);
      const linkedClientProjects = await clientProjectQuery.exec();

      const initiatorGrantQuery = ProjectAccessGrantModel.countDocuments({
        userId,
        module: "projects",
        source: "admin_initiator",
        active: true
      });
      if (session) initiatorGrantQuery.session(session);
      const adminInitiatorGrants = await initiatorGrantQuery.exec();

      return {
        ownedActiveLeads,
        ownedActiveEstimates,
        initiatedActiveProjects,
        assignedActiveProjects,
        managedActiveProjects,
        ownedActiveTasks,
        directReports,
        linkedClientProjects,
        adminInitiatorGrants
      };
    },

    async updateUser(userId, expectedVersion, change) {
      const set: PlainDocument = {
        ...(change.role === undefined ? {} : { role: change.role }),
        ...(change.active === undefined ? {} : { active: change.active }),
        updatedAt: date(change.updatedAt)
      };
      const filter: PlainDocument =
        expectedVersion === 1
          ? {
              _id: userId,
              $or: [{ version: 1 }, { version: { $exists: false } }]
            }
          : { _id: userId, version: expectedVersion };
      const update: PlainDocument =
        expectedVersion === 1
          ? { $set: { ...set, version: 2 } }
          : { $set: set, $inc: { version: 1 } };
      const query = UserModel.findOneAndUpdate(filter, update, {
        new: true,
        runValidators: true,
        timestamps: false
      }).select("+passwordHash");
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (document) return mapUser(document);

      const existsQuery = UserModel.exists({ _id: userId });
      if (session) existsQuery.session(session);
      if (!(await existsQuery.exec())) {
        throw new RepositoryNotFoundError(`User ${userId} was not found.`);
      }
      throw new RepositoryConflictError(`User ${userId} changed concurrently.`);
    },

    async pageAllLeads(filters, pagination) {
      const filter: PlainDocument = {};
      if (filters.stage) filter.stage = filters.stage;
      if (filters.search?.trim()) {
        const search = new RegExp(escapeRegex(filters.search.trim()), "i");
        filter.$or = [{ clientName: search }, { clientEmail: search }, { clientMobile: search }, { projectName: search }];
      }
      const [documents, total] = await Promise.all([
        LeadModel.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(pagination.offset).limit(pagination.limit).lean().exec(),
        LeadModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapLead), total };
    },

    async pageLeadsForOwner(ownerId, filters, pagination) {
      const filter: PlainDocument = { ownerId };
      if (filters.stage) filter.stage = filters.stage;
      if (filters.search?.trim()) {
        const search = new RegExp(escapeRegex(filters.search.trim()), "i");
        filter.$or = [{ clientName: search }, { clientEmail: search }, { clientMobile: search }, { projectName: search }];
      }
      const [documents, total] = await Promise.all([
        LeadModel.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(pagination.offset).limit(pagination.limit).lean().exec(),
        LeadModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapLead), total };
    },

    async findLeadById(id) {
      const document = await LeadModel.findById(id).lean().exec();
      return document ? mapLead(document) : null;
    },

    async createLead(input) {
      const document = await createMongoDocument("Lead", () => createDocument(LeadModel, { ...leadForMongo(input), _id: input.id }, session));
      return mapLead(document.toObject());
    },

    async updateLead(id, change) {
      const update: PlainDocument = { ...leadChangeForMongo(change), updatedAt: new Date() };
      const query = LeadModel.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean();
      if (session) query.session(session);
      const document = await query.exec();
      if (!document) throw new RepositoryNotFoundError(`Lead ${id} was not found.`);
      return mapLead(document);
    },

    async appendLeadActivity(input) {
      const document = await createMongoDocument("Lead activity", () => createDocument(LeadActivityModel, { ...leadActivityForMongo(input), _id: input.id }, session));
      return mapLeadActivity(document.toObject());
    },

    async listLeadActivities(leadId) {
      const documents = await LeadActivityModel.find({ leadId }).sort({ occurredAt: -1, _id: -1 }).lean().exec();
      return documents.map(mapLeadActivity);
    },

    async listProjectsForUserInModule(user, module) {
      const filter = await projectFilterForUserInModule(user, module);
      if (filter === null) return [];
      const query = ProjectModel.find(filter).sort({ name: 1, _id: 1 }).lean();
      if (session) query.session(session);
      const documents = await query.exec();
      return documents.map(mapProject);
    },

    async listProjectsForDesignerIds(designerIds, limit) {
      if (designerIds.length === 0) return [];
      const query = ProjectModel.find({
        $or: [
          { initiatingDesignerId: { $in: designerIds } },
          { assignedDesignerIds: { $in: designerIds } }
        ]
      }).sort({ name: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapProject);
    },

    async pageProjectsForUserInModule(user, module, pagination) {
      const filter = await projectFilterForUserInModule(user, module);
      if (filter === null) return { items: [], total: 0 };
      const itemQuery = ProjectModel.find(filter)
        .sort({ name: 1, _id: 1 })
        .skip(pagination.offset)
        .limit(pagination.limit)
        .lean();
      const countQuery = ProjectModel.countDocuments(filter);
      if (session) {
        itemQuery.session(session);
        countQuery.session(session);
      }
      const [documents, total] = await Promise.all([
        itemQuery.exec(),
        countQuery.exec()
      ]);
      return { items: documents.map(mapProject), total };
    },

    async pageAdminProjects(actor, pagination) {
      const filter = await projectFilterForUserInModule(actor, "projects");
      if (filter === null) return { items: [], total: 0 };
      const itemQuery = ProjectModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(pagination.offset)
        .limit(pagination.limit)
        .lean();
      const countQuery = ProjectModel.countDocuments(filter);
      if (session) {
        itemQuery.session(session);
        countQuery.session(session);
      }
      const [documents, total] = await executeSessionCompatibleReadPair(
        () => itemQuery.exec(),
        () => countQuery.exec()
      );
      return {
        items: await loadAdminProjectSummaries(documents, actor),
        total
      };
    },

    async findAdminProject(actor, projectId) {
      const filter = await projectFilterForUserInModule(actor, "projects");
      if (filter === null) return null;
      const query = ProjectModel.findOne({
        $and: [{ _id: projectId }, filter]
      }).lean();
      if (session) query.session(session);
      const document = await query.exec();
      if (!document) return null;
      return (await loadAdminProjectSummaries([document], actor))[0] ?? null;
    },

    async pageActiveEstimatorOptions(search, pagination) {
      const filter: PlainDocument = { role: "estimator_sales", active: true };
      if (search.trim()) {
        const pattern = new RegExp(escapeRegex(search.trim()), "i");
        filter.$or = [{ name: pattern }, { email: pattern }];
      }
      const itemQuery = UserModel.find(filter)
        .select({ _id: 1, name: 1, email: 1, title: 1 })
        .sort({ name: 1, _id: 1 })
        .skip(pagination.offset)
        .limit(pagination.limit)
        .lean();
      const countQuery = UserModel.countDocuments(filter);
      if (session) {
        itemQuery.session(session);
        countQuery.session(session);
      }
      const [documents, total] = await executeSessionCompatibleReadPair(
        () => itemQuery.exec(),
        () => countQuery.exec()
      );
      const items: EstimatorOption[] = documents.map((document) => ({
        id: idOf(document),
        name: document.name,
        email: document.email,
        title: document.title ?? null
      }));
      return { items, total };
    },

    async findProjectById(id) {
      const query = ProjectModel.findById(id).lean();
      if (session) query.session(session);
      const document = await query.exec();
      return document ? mapProject(document) : null;
    },

    async linkUnclaimedProjectsToClient(emailNormalized, clientId, updatedAt) {
      const linked: ProjectRecord[] = [];
      const filter = {
        clientId: null,
        clientEmailNormalized: normalizeEmail(emailNormalized)
      };
      for (;;) {
        const query = ProjectModel.findOneAndUpdate(
          filter,
          { $set: { clientId, updatedAt: date(updatedAt) } },
          { new: true, runValidators: true }
        ).lean();
        if (session) query.session(session);
        const document = await query.exec();
        if (!document) break;
        linked.push(mapProject(document));
      }
      return linked;
    },

    async createProject(input) {
      const document = await createMongoDocument("Project", () =>
        createDocument(ProjectModel, {
          ...projectForMongo(input),
          _id: input.id
        }, session)
      );
      return mapProject(document.toObject());
    },

    async createFloor(input) {
      const document = await createMongoDocument("Floor", () =>
        createDocument(FloorModel, {
          ...floorForMongo(input),
          _id: input.id
        }, session)
      );
      return mapFloor(document.toObject());
    },

    async createDesignStage(input) {
      const document = await createMongoDocument("Design stage", () =>
        createDocument(DesignStageModel, {
          ...input,
          _id: input.id,
          id: undefined,
          createdAt: date(input.createdAt),
          updatedAt: date(input.updatedAt)
        }, session)
      );
      return mapStage(document.toObject());
    },

    async createTask(input) {
      const document = await createMongoDocument("Task", () =>
        createDocument(TaskModel, {
          ...taskForMongo(input),
          _id: input.id,
          __v: input.version - 1
        }, session)
      );
      return mapTask(document.toObject());
    },

    async getProjectHierarchy(projectId) {
      const [project, floors, stages, tasks] = await Promise.all([
        ProjectModel.findById(projectId).lean().exec(),
        FloorModel.find({ projectId }).sort({ order: 1, _id: 1 }).lean().exec(),
        DesignStageModel.find({ projectId })
          .sort({ floorId: 1, order: 1, _id: 1 })
          .lean()
          .exec(),
        TaskModel.find({ projectId })
          .sort({ floorId: 1, stageId: 1, order: 1, _id: 1 })
          .lean()
          .exec()
      ]);
      if (!project) return null;

      const mappedStages = stages.map(mapStage);
      const mappedTasks = tasks.map(mapTask);
      const hierarchy: ProjectHierarchy = {
        ...mapProject(project),
        floors: floors.map((floorDocument) => {
          const floor = mapFloor(floorDocument);
          return {
            ...floor,
            stages: mappedStages
              .filter((designStage) => designStage.floorId === floor.id)
              .map((designStage) => ({
                ...designStage,
                tasks: mappedTasks.filter((task) => task.stageId === designStage.id)
              }))
          };
        })
      };
      return hierarchy;
    },

    async getOrganizationTree() {
      const users = await UserModel.find({
        active: true,
        role: { $in: ["design_manager", "designer"] }
      })
        .select("+passwordHash")
        .sort({ name: 1, _id: 1 })
        .lean()
        .exec();
      const mapped = users.map(mapUser);
      return mapped
        .filter((user) => user.role === "design_manager")
        .map<ManagerTreeNode>((manager) => ({
          id: manager.id,
          name: manager.name,
          email: manager.email,
          ...(manager.avatar ? { avatar: manager.avatar } : {}),
          ...(manager.title ? { title: manager.title } : {}),
          designerTotal: mapped.filter(
            (user) => user.role === "designer" && user.managerId === manager.id
          ).length,
          designers: mapped
            .filter(
              (user) => user.role === "designer" && user.managerId === manager.id
            )
            .map((designer) => ({
              id: designer.id,
              name: designer.name,
              email: designer.email,
              ...(designer.avatar ? { avatar: designer.avatar } : {}),
              ...(designer.title ? { title: designer.title } : {})
            }))
        }));
    },

    async pageOrganizationManagers(pagination) {
      const managerFilter = { active: true, role: "design_manager" };
      const [managerDocuments, total] = await Promise.all([
        UserModel.find(managerFilter)
          .select("+passwordHash")
          .sort({ name: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        UserModel.countDocuments(managerFilter).exec()
      ]);
      const managers = managerDocuments.map(mapUser);
      const designerPages = await Promise.all(
        managers.map(async (manager) => {
          const filter = {
            active: true,
            role: "designer",
            managerId: manager.id
          };
          const [documents, designerTotal] = await Promise.all([
            UserModel.find(filter)
              .select("+passwordHash")
              .sort({ name: 1, _id: 1 })
              .limit(20)
              .lean()
              .exec(),
            UserModel.countDocuments(filter).exec()
          ]);
          return {
            managerId: manager.id,
            designerTotal,
            designers: documents.map(mapUser)
          };
        })
      );
      return {
        items: managers.map<ManagerTreeNode>((manager) => {
          const designerPage = designerPages.find(
            (candidate) => candidate.managerId === manager.id
          )!;
          return {
            id: manager.id,
            name: manager.name,
            email: manager.email,
            ...(manager.avatar ? { avatar: manager.avatar } : {}),
            ...(manager.title ? { title: manager.title } : {}),
            designerTotal: designerPage.designerTotal,
            designers: designerPage.designers.map((designer) => ({
              id: designer.id,
              name: designer.name,
              email: designer.email,
              ...(designer.avatar ? { avatar: designer.avatar } : {}),
              ...(designer.title ? { title: designer.title } : {})
            }))
          };
        }),
        total
      };
    },

    async pageActiveManagers(search, pagination) {
      const query = search.trim();
      const managerFilter: PlainDocument = { active: true, role: "design_manager" };
      if (query.length > 0) {
        const pattern = new RegExp(escapeRegex(query), "i");
        managerFilter.$or = [
          { name: pattern },
          { email: pattern },
          { emailNormalized: pattern }
        ];
      }
      const [documents, total] = await Promise.all([
        UserModel.find(managerFilter)
          .select("+passwordHash")
          .sort({ name: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        UserModel.countDocuments(managerFilter).exec()
      ]);
      return { items: documents.map(mapUser), total };
    },

    async pageActiveDesigners(pagination) {
      const filter = { active: true, role: "designer" };
      const [documents, total] = await Promise.all([
        UserModel.find(filter)
          .select("+passwordHash")
          .sort({ name: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        UserModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapUser), total };
    },

    async pageDesignersForManager(managerId, pagination) {
      const filter = {
        active: true,
        role: "designer",
        managerId
      };
      const [documents, total] = await Promise.all([
        UserModel.find(filter)
          .select("+passwordHash")
          .sort({ name: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        UserModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapUser), total };
    },

    async findTaskById(id) {
      const query = TaskModel.findById(id);
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapTask(document) : null;
    },

    async listTasks(filters) {
      const documents = await TaskModel.find(compactFilter(filters))
        .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapTask);
    },

    async listTasksForProjectIds(projectIds, limit) {
      if (projectIds.length === 0) return [];
      const query = TaskModel.find({ projectId: { $in: projectIds } })
        .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapTask);
    },

    async listTasksForOwnerIds(ownerIds, limit) {
      if (ownerIds.length === 0) return [];
      const query = TaskModel.find({ ownerId: { $in: ownerIds } })
        .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapTask);
    },

    async listFloorsForProjectIds(projectIds) {
      if (projectIds.length === 0) return [];
      const documents = await FloorModel.find({ projectId: { $in: projectIds } })
        .sort({ projectId: 1, order: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapFloor);
    },

    async listKpiTasksForPeriod(ownerIds, periodStartAt, periodEndAt, limit) {
      const query = TaskModel.find(
        kpiTaskFilter(ownerIds, periodStartAt, periodEndAt)
      )
        .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapTask);
    },

    async listWorkflowKpiTasksForPeriod(
      assigneeUserIds,
      periodStartAt,
      periodEndAt,
      limit
    ) {
      if (assigneeUserIds.length === 0) return [];
      const periodStart = date(periodStartAt);
      const periodEnd = date(periodEndAt);
      const query = ProjectWorkflowTaskModel.find({
        assigneeUserId: { $in: assigneeUserIds },
        $or: [
          { openedAt: { $lte: periodEnd } },
          { completedAt: { $gte: periodStart, $lte: periodEnd } }
        ]
      }).sort({ openedAt: -1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents
        .map(mapWorkflowTaskToKpiRecord)
        .filter((task) =>
          new Date(task.plannedStartAt) <= periodEnd &&
          new Date(task.currentDeadlineAt) >= periodStart
        );
    },

    async pageKpiTasksForPeriod(
      ownerIds,
      periodStartAt,
      periodEndAt,
      pagination
    ) {
      const filter = kpiTaskFilter(ownerIds, periodStartAt, periodEndAt);
      const [documents, total] = await Promise.all([
        TaskModel.find(filter)
          .sort({ projectId: 1, floorId: 1, stageId: 1, order: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        TaskModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapTask), total };
    },

    async updateTask(id, expectedVersion, change) {
      const currentQuery = TaskModel.findById(id);
      if (session) currentQuery.session(session);
      const current = await currentQuery.lean().exec();
      if (!current) throw new RepositoryNotFoundError(`Task ${id} was not found.`);
      if ((current.__v ?? 0) + 1 !== expectedVersion) {
        throw new RepositoryConflictError(
          `Task ${id} has version ${(current.__v ?? 0) + 1}, expected ${expectedVersion}.`
        );
      }

      const status = change.status ?? current.status;
      const completedAt =
        status === "completed"
          ? change.completedAt === undefined
            ? current.completedAt
            : change.completedAt
          : null;
      if (status === "completed" && !completedAt) {
        throw new RepositoryConflictError("Completed tasks require completedAt.");
      }

      const set: PlainDocument = {
        ...change,
        status,
        completedAt: completedAt ? date(completedAt) : null
      };
      if (change.currentDeadlineAt) set.currentDeadlineAt = date(change.currentDeadlineAt);
      if (change.latestUpdateAt) set.latestUpdateAt = date(change.latestUpdateAt);

      const updateQuery = TaskModel.findOneAndUpdate(
        { _id: id, __v: expectedVersion - 1 },
        { $set: set, $inc: { __v: 1 } },
        { new: true, runValidators: true }
      );
      if (session) updateQuery.session(session);
      const updated = await updateQuery.lean().exec();
      if (!updated) {
        throw new RepositoryConflictError(`Task ${id} was updated concurrently.`);
      }
      return mapTask(updated);
    },

    async appendTaskEvent(input) {
      const document = await createMongoDocument("Task event", () =>
        createDocument(TaskEventModel, {
          ...input,
          _id: input.id ?? randomUUID(),
          id: undefined,
          occurredAt: date(input.occurredAt),
          createdAt: input.createdAt ? date(input.createdAt) : undefined,
          note: input.note ?? null
        }, session)
      );
      return mapTaskEvent(document.toObject());
    },

    async listTaskEvents(taskId) {
      const documents = await TaskEventModel.find({ taskId })
        .sort({ occurredAt: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapTaskEvent);
    },

    async listRecentTaskEvents(taskIds, limit) {
      if (!taskIds.length || limit <= 0) return [];
      const query = TaskEventModel.find({ taskId: { $in: taskIds } })
        .sort({ occurredAt: -1, _id: -1 })
        .limit(limit);
      if (session) query.session(session);
      const documents = await query.lean().exec();
      return documents.map(mapTaskEvent);
    },

    async pageTaskEvents(taskId, pagination, sort = "asc") {
      const filter = { taskId };
      const direction = sort === "desc" ? -1 : 1;
      const [documents, total] = await Promise.all([
        TaskEventModel.find(filter)
          .sort({ occurredAt: direction, _id: direction })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        TaskEventModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapTaskEvent), total };
    },

    async listKpiTaskEventsForPeriod(
      taskId,
      actorId,
      periodStartAt,
      periodEndAt
    ) {
      const documents = await TaskEventModel.find(
        kpiTaskEventFilter(taskId, actorId, periodStartAt, periodEndAt)
      )
        .sort({ occurredAt: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapTaskEvent);
    },

    async pageKpiTaskEventsForPeriod(
      taskId,
      actorId,
      periodStartAt,
      periodEndAt,
      pagination
    ) {
      const filter = kpiTaskEventFilter(
        taskId,
        actorId,
        periodStartAt,
        periodEndAt
      );
      const [documents, total] = await Promise.all([
        TaskEventModel.find(filter)
          .sort({ occurredAt: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        TaskEventModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapTaskEvent), total };
    },

    async listKpiTaskEventsForTasks(
      taskOwners,
      periodStartAt,
      periodEndAt,
      limit
    ) {
      if (taskOwners.length === 0) return [];
      const events: TaskEventRecord[] = [];
      const pairBatchSize = 100;
      for (
        let offset = 0;
        offset < taskOwners.length;
        offset += pairBatchSize
      ) {
        if (events.length >= limit) break;
        const batch = taskOwners.slice(offset, offset + pairBatchSize);
        const documents = await TaskEventModel.find({
          $or: batch.map((task) => ({
            taskId: task.id,
            actorId: task.ownerId
          })),
          type: { $in: ["status_changed", "progress_changed", "note_added"] },
          occurredAt: { $gte: date(periodStartAt), $lte: date(periodEndAt) }
        })
          .sort({ occurredAt: 1, _id: 1 })
          .limit(limit - events.length)
          .lean()
          .exec();
        events.push(...documents.map(mapTaskEvent));
      }
      return events
        .sort((left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) ||
          left.id.localeCompare(right.id)
        )
        .slice(0, limit);
    },

    async createDesignVersion(input) {
      const document = await createMongoDocument("Design version", () =>
        createDocument(DesignVersionModel, {
          ...designVersionForMongo(input),
          _id: input.id ?? randomUUID()
        }, session)
      );
      return mapDesignVersion(document.toObject());
    },

    async createNextDesignVersion(input) {
      const target = {
        projectId: input.projectId,
        floorId: input.floorId,
        stageId: input.stageId,
        taskId: input.taskId
      };
      const latestQuery = DesignVersionModel.findOne(target)
        .sort({ versionNumber: -1 })
        .select({ versionNumber: 1 })
        .lean();
      if (session) latestQuery.session(session);
      const latest = await latestQuery.exec();
      const baseline = latest?.versionNumber ?? 0;
      const sequenceQuery = DesignVersionSequenceModel.findOneAndUpdate(
        { _id: designVersionSequenceKey(target) },
        [
          {
            $set: {
              nextNumber: {
                $add: [
                  {
                    $max: [
                      { $ifNull: ["$nextNumber", baseline] },
                      baseline
                    ]
                  },
                  1
                ]
              }
            }
          }
        ],
        { upsert: true, new: true, updatePipeline: true }
      );
      if (session) sequenceQuery.session(session);
      const sequence = await sequenceQuery.lean().exec();
      if (!sequence) {
        throw new Error("Design version sequence allocation failed.");
      }
      return repository.createDesignVersion({
        ...input,
        versionNumber: sequence.nextNumber
      });
    },

    async findDesignVersionById(id) {
      const query = DesignVersionModel.findById(id);
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapDesignVersion(document) : null;
    },

    async listDesignVersions(projectId, limit) {
      const query = DesignVersionModel.find({ projectId })
        .sort({ floorId: 1, stageId: 1, versionNumber: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      if (session) query.session(session);
      const documents = await query.lean().exec();
      return documents.map(mapDesignVersion);
    },

    async listDesignVersionsForTaskIds(taskIds, limit) {
      if (taskIds.length === 0) return [];
      const query = DesignVersionModel.find({ taskId: { $in: taskIds } })
        .sort({ taskId: 1, versionNumber: 1, _id: 1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapDesignVersion);
    },

    async listLatestClientVisibleDesignVersions(projectIds) {
      if (!projectIds.length) return [];
      const pipeline: PipelineStage[] = [
        { $match: { projectId: { $in: projectIds }, approvalStatus: "approved", clientVisible: true } },
        { $sort: { projectId: 1 as const, approvedAt: -1 as const, uploadedAt: -1 as const, _id: -1 as const } },
        { $group: { _id: "$projectId", version: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$version" } },
        { $sort: { projectId: 1 as const } }
      ];
      const aggregate = DesignVersionModel.aggregate(pipeline);
      if (session) aggregate.session(session);
      return (await aggregate.exec()).map(mapDesignVersion);
    },

    async pageDesignVersions(filters, pagination) {
      const filter = compactFilter(filters);
      const documentsQuery = DesignVersionModel.find(filter)
        .sort({ uploadedAt: 1, _id: 1 })
        .skip(pagination.offset)
        .limit(pagination.limit)
        .lean();
      const countQuery = DesignVersionModel.countDocuments(filter);
      if (session) {
        documentsQuery.session(session);
        countQuery.session(session);
      }
      const [documents, total] = await Promise.all([
        documentsQuery.exec(),
        countQuery.exec()
      ]);
      return { items: documents.map(mapDesignVersion), total };
    },

    async updateDesignVersion(id, change) {
      const set: PlainDocument = { ...change };
      if (change.approvedAt !== undefined) {
        set.approvedAt = change.approvedAt ? date(change.approvedAt) : null;
      }
      const document = await DesignVersionModel.findByIdAndUpdate(
        id,
        { $set: set },
        { new: true, runValidators: true }
      );
      if (session) document.session(session);
      const updated = await document.lean().exec();
      if (!updated) {
        throw new RepositoryNotFoundError(`Design version ${id} was not found.`);
      }
      return mapDesignVersion(updated);
    },

    async enqueueExtractionJob(input) {
      const document = await createMongoDocument("Design extraction job", () =>
        createDocument(
          DesignExtractionJobModel,
          extractionJobForMongo(input),
          session
        )
      );
      return mapExtractionJob(document.toObject());
    },

    async claimExtractionJob(now, leaseExpiresAt) {
      const claimId = randomUUID();
      const query = DesignExtractionJobModel.findOneAndUpdate(
        {
          $or: [
            { status: "queued" },
            { status: "processing", leaseExpiresAt: { $lte: date(now) } }
          ]
        },
        {
          $set: {
            status: "processing",
            startedAt: date(now),
            leaseExpiresAt: date(leaseExpiresAt),
            claimId,
            failureCode: null,
            failureMessage: null
          },
          $inc: { attemptCount: 1 }
        },
        { new: true, sort: { queuedAt: 1, _id: 1 }, runValidators: true }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapExtractionJob(document) : null;
    },

    async findOldestClaimableExtractionJob(now) {
      const query = DesignExtractionJobModel.findOne({
        $or: [
          { status: "queued" },
          { status: "processing", leaseExpiresAt: { $lte: date(now) } }
        ]
      }).sort({ queuedAt: 1, _id: 1 });
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapExtractionJob(document) : null;
    },

    async claimExtractionJobById(id, now, leaseExpiresAt) {
      const claimId = randomUUID();
      const query = DesignExtractionJobModel.findOneAndUpdate(
        {
          _id: id,
          $or: [
            { status: "queued" },
            { status: "processing", leaseExpiresAt: { $lte: date(now) } }
          ]
        },
        {
          $set: {
            status: "processing",
            startedAt: date(now),
            leaseExpiresAt: date(leaseExpiresAt),
            claimId,
            failureCode: null,
            failureMessage: null
          },
          $inc: { attemptCount: 1 }
        },
        { new: true, runValidators: true }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapExtractionJob(document) : null;
    },

    async renewExtractionJobLease(id, claimId, now, leaseExpiresAt) {
      const query = DesignExtractionJobModel.findOneAndUpdate(
        {
          _id: id,
          status: "processing",
          claimId,
          leaseExpiresAt: { $gt: date(now) }
        },
        {
          $set: {
            leaseExpiresAt: date(leaseExpiresAt),
            updatedAt: date(now)
          }
        },
        { new: true, runValidators: true }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (!document) await throwExtractionJobClaimError(id, session);
      return mapExtractionJob(document);
    },

    async completeExtractionJob(id, claimId, completedAt) {
      const query = DesignExtractionJobModel.findByIdAndUpdate(
        {
          _id: id,
          status: "processing",
          claimId,
          leaseExpiresAt: { $gt: date(completedAt) }
        },
        {
          $set: {
            status: "designer_review",
            completedAt: date(completedAt),
            leaseExpiresAt: null,
            claimId: null,
            failureCode: null,
            failureMessage: null
          }
        },
        { new: true, runValidators: true }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (!document) {
        await throwExtractionJobClaimError(id, session);
      }
      return mapExtractionJob(document);
    },

    async failExtractionJob(id, claimId, failureCode, failureMessage, completedAt) {
      const query = DesignExtractionJobModel.findByIdAndUpdate(
        {
          _id: id,
          status: "processing",
          claimId,
          leaseExpiresAt: { $gt: date(completedAt) }
        },
        {
          $set: {
            status: "processing_failed",
            completedAt: date(completedAt),
            leaseExpiresAt: null,
            claimId: null,
            failureCode,
            failureMessage
          }
        },
        { new: true, runValidators: true }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (!document) {
        await throwExtractionJobClaimError(id, session);
      }
      return mapExtractionJob(document);
    },

    async findExtractionJobById(id) {
      const query = DesignExtractionJobModel.findById(id);
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapExtractionJob(document) : null;
    },

    async findExtractionJobByVersionId(designVersionId) {
      const query = DesignExtractionJobModel.findOne({ designVersionId });
      if (session) query.session(session);
      const document = await query.lean().exec();
      return document ? mapExtractionJob(document) : null;
    },

    async listSourcePages(designVersionId) {
      const query = DesignSourcePageModel.find({ designVersionId })
        .sort({ pageNumber: 1, _id: 1 })
        .lean();
      if (session) query.session(session);
      return (await query.exec()).map(mapSourcePage);
    },

    async findSourcePageById(id) {
      const query = DesignSourcePageModel.findById(id).lean();
      if (session) query.session(session);
      const document = await query.exec();
      return document ? mapSourcePage(document) : null;
    },

    async replaceExtractionDraft(input) {
      if (!session) {
        await repository.runInTransaction((transaction) =>
          transaction.replaceExtractionDraft(input)
        );
        return;
      }

      const jobQuery = DesignExtractionJobModel.findOne({
        _id: input.jobId
      }).lean();
      jobQuery.session(session);
      const job = await jobQuery.exec();
      if (!job) {
        throw new RepositoryNotFoundError(`Design extraction job ${input.jobId} was not found.`);
      }
      if (job.designVersionId !== input.designVersionId) {
        throw new RepositoryConflictError("Extraction job does not match the draft version.");
      }
      if (job.workerResultId === input.workerResultId) return;
      if (
        job.status !== "processing" ||
        job.claimId !== input.claimId ||
        job.leaseExpiresAt === null ||
        date(job.leaseExpiresAt).getTime() <= date(input.processedAt).getTime()
      ) {
        throw new RepositoryConflictError("Extraction job claim is no longer current.");
      }
      validateExtractionDraft(input);

      const sectionsQuery = DesignSectionModel.find({
        designVersionId: input.designVersionId
      })
        .select("_id")
        .lean();
      sectionsQuery.session(session);
      const existingSections = await sectionsQuery.exec();
      const sectionIds = existingSections.map(idOf);
      const reviewedRevisionQuery = DesignSectionRevisionModel.exists({
        sectionId: { $in: sectionIds },
        reviewStatus: { $ne: "draft" }
      });
      reviewedRevisionQuery.session(session);
      if (await reviewedRevisionQuery.exec()) {
        throw new RepositoryConflictError(
          "Reviewed section revisions cannot be replaced by extraction output."
        );
      }
      const deletePages = DesignSourcePageModel.deleteMany({
        designVersionId: input.designVersionId
      });
      const deleteSections = DesignSectionModel.deleteMany({
        designVersionId: input.designVersionId
      });
      const deleteRevisions = DesignSectionRevisionModel.deleteMany({
        sectionId: { $in: sectionIds }
      });
      deletePages.session(session);
      deleteSections.session(session);
      deleteRevisions.session(session);
      await Promise.all([deletePages.exec(), deleteSections.exec(), deleteRevisions.exec()]);

      for (const page of input.sourcePages) {
        await createMongoDocument("Design source page", () =>
          createDocument(DesignSourcePageModel, sourcePageForMongo(page), session)
        );
      }
      for (const { section, revision } of input.sections) {
        await createMongoDocument("Design section", () =>
          createDocument(DesignSectionModel, sectionForMongo(section), session)
        );
        await createMongoDocument("Design section revision", () =>
          createDocument(
            DesignSectionRevisionModel,
            sectionRevisionForMongo(revision),
            session
          )
        );
      }
      if (job) {
        const update = DesignExtractionJobModel.updateOne(
          { _id: job._id },
          { $set: { workerResultId: input.workerResultId } }
        );
        update.session(session);
        await update.exec();
      }
    },

    async listDesignSections(designVersionId) {
      const query = DesignSectionModel.find({ designVersionId })
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      if (session) query.session(session);
      return (await query.exec()).map(mapSection);
    },

    async findDesignSectionById(id) {
      const query = DesignSectionModel.findById(id).lean();
      if (session) query.session(session);
      const document = await query.exec();
      return document ? mapSection(document) : null;
    },

    async listSectionRevisions(sectionId) {
      const query = DesignSectionRevisionModel.find({ sectionId })
        .sort({ revisionNumber: 1 })
        .lean();
      if (session) query.session(session);
      return (await query.exec()).map(mapSectionRevision);
    },

    async findSectionRevisionById(id) {
      const query = DesignSectionRevisionModel.findById(id).lean();
      if (session) query.session(session);
      const document = await query.exec();
      return document ? mapSectionRevision(document) : null;
    },

    async createManualSection(input) {
      const document = await createMongoDocument("Design section", () =>
        createDocument(
          DesignSectionModel,
          sectionForMongo({ ...input, source: "manual" }),
          session
        )
      );
      return mapSection(document.toObject());
    },

    async updateDraftSection(id, change, expected) {
      if (!session) {
        return repository.runInTransaction((transaction) =>
          transaction.updateDraftSection(id, change, expected)
        );
      }
      const revisionQuery = DesignSectionRevisionModel.findOne({ sectionId: id })
        .sort({ revisionNumber: -1 })
        .lean();
      if (session) revisionQuery.session(session);
      const latestRevision = await revisionQuery.exec();
      const statuses = expected?.statuses ?? ["draft"];
      if (
        !latestRevision ||
        !statuses.includes(latestRevision.reviewStatus) ||
        (expected && latestRevision.revisionNumber !== expected.revisionNumber)
      ) {
        throw new RepositoryConflictError("Only sections with a draft latest revision can be edited.");
      }
      const guardQuery = DesignSectionRevisionModel.updateOne(
        {
          _id: latestRevision._id,
          revisionNumber: latestRevision.revisionNumber,
          reviewStatus: { $in: statuses }
        },
        { $set: { label: latestRevision.label } }
      );
      guardQuery.session(session);
      const guarded = await guardQuery.exec();
      if (guarded.matchedCount !== 1) {
        throw new RepositoryConflictError("Only sections with a draft latest revision can be edited.");
      }
      const query = DesignSectionModel.findOneAndUpdate(
        {
          _id: id,
          ...(expected?.active === undefined ? {} : { active: expected.active })
        },
        { $set: change },
        { new: true, runValidators: true }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (!document) {
        if (expected) {
          throw new RepositoryConflictError("The design section changed before the update completed.");
        }
        throw new RepositoryNotFoundError(`Design section ${id} was not found.`);
      }
      return mapSection(document);
    },

    async createSectionRevision(input) {
      const sectionQuery = DesignSectionModel.exists({ _id: input.sectionId });
      if (session) sectionQuery.session(session);
      if (!(await sectionQuery.exec())) {
        throw new RepositoryNotFoundError(`Design section ${input.sectionId} was not found.`);
      }
      const document = await createMongoDocument("Design section revision", () =>
        createDocument(
          DesignSectionRevisionModel,
          sectionRevisionForMongo(input),
          session
        )
      );
      return mapSectionRevision(document.toObject());
    },

    async retryExtractionJob(id, queuedAt) {
      const query = DesignExtractionJobModel.findOneAndUpdate(
        { _id: id, status: "processing_failed" },
        {
          $set: {
            status: "queued",
            queuedAt: date(queuedAt),
            startedAt: null,
            completedAt: null,
            leaseExpiresAt: null,
            failureCode: null,
            failureMessage: null,
            claimId: null,
            updatedAt: date(queuedAt)
          }
        },
        { new: true, runValidators: true }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (!document) throw new RepositoryConflictError("Only failed extraction jobs can be retried.");
      return mapExtractionJob(document);
    },

    async recoverFailedExtractionJob(id, recoveredAt) {
      const query = DesignExtractionJobModel.findOneAndUpdate(
        { _id: id, status: "processing_failed" },
        {
          $set: {
            status: "designer_review",
            completedAt: date(recoveredAt),
            failureCode: null,
            failureMessage: null,
            updatedAt: date(recoveredAt)
          }
        },
        { new: true, runValidators: true }
      );
      if (session) query.session(session);
      const document = await query.lean().exec();
      if (!document) {
        throw new RepositoryConflictError("Only failed extraction jobs can use manual recovery.");
      }
      return mapExtractionJob(document);
    },

    async submitDesignSectionDrafts(designVersionId, submittedAt) {
      if (!session) {
        return repository.runInTransaction((transaction) =>
          transaction.submitDesignSectionDrafts(designVersionId, submittedAt)
        );
      }
      const sectionsQuery = DesignSectionModel.find({ designVersionId, active: true }).lean();
      sectionsQuery.session(session);
      const sections = await sectionsQuery.exec();
      if (sections.length === 0) {
        throw new RepositoryConflictError("At least one active section is required.");
      }
      let submittedCount = 0;
      for (const section of sections) {
        const revisionQuery = DesignSectionRevisionModel.findOne({ sectionId: idOf(section) })
          .sort({ revisionNumber: -1 })
          .lean();
        revisionQuery.session(session);
        const revision = await revisionQuery.exec();
        if (!revision || revision.reviewStatus === "rejected") {
          throw new RepositoryConflictError("Every active section must have an eligible draft.");
        }
        if (revision.reviewStatus === "approved" || revision.reviewStatus === "submitted") continue;
        const update = DesignSectionRevisionModel.updateOne(
          { _id: revision._id, reviewStatus: "draft" },
          { $set: { reviewStatus: "submitted", submittedAt: date(submittedAt) } }
        );
        update.session(session);
        const result = await update.exec();
        if (result.matchedCount !== 1) {
          throw new RepositoryConflictError("Every active section must have an eligible draft.");
        }
        submittedCount += 1;
      }
      if (submittedCount === 0) {
        throw new RepositoryConflictError("At least one draft section is required.");
      }
      const jobUpdate = DesignExtractionJobModel.updateOne(
        { designVersionId },
        { $set: { status: "submitted", updatedAt: date(submittedAt) } }
      );
      jobUpdate.session(session);
      const result = await jobUpdate.exec();
      if (result.matchedCount !== 1) {
        throw new RepositoryNotFoundError("Design extraction job was not found.");
      }
      return submittedCount;
    },

    async decideSubmittedSectionRevision(
      revisionId,
      expectedRevisionNumber,
      decision,
      reviewerId,
      comment,
      reviewedAt
    ) {
      if (!session) {
        return repository.runInTransaction((transaction) =>
          transaction.decideSubmittedSectionRevision(
            revisionId,
            expectedRevisionNumber,
            decision,
            reviewerId,
            comment,
            reviewedAt
          )
        );
      }
      const revisionUpdate = DesignSectionRevisionModel.findOneAndUpdate(
        {
          _id: revisionId,
          revisionNumber: expectedRevisionNumber,
          reviewStatus: "submitted"
        },
        {
          $set: {
            reviewStatus: decision,
            reviewerId,
            reviewedAt: date(reviewedAt),
            rejectionComment: decision === "rejected" ? comment : null
          }
        },
        { new: true, runValidators: true }
      );
      revisionUpdate.session(session);
      const revision = await revisionUpdate.lean().exec();
      if (!revision) {
        const exists = DesignSectionRevisionModel.exists({ _id: revisionId });
        exists.session(session);
        if (!(await exists.exec())) {
          throw new RepositoryNotFoundError("Design section revision was not found.");
        }
        throw new RepositoryConflictError("The submitted section revision changed.");
      }
      const sectionQuery = DesignSectionModel.findById(revision.sectionId).lean();
      sectionQuery.session(session);
      const section = await sectionQuery.exec();
      if (!section) {
        throw new RepositoryNotFoundError("Design section was not found.");
      }
      const activeSectionsQuery = DesignSectionModel.find({
        designVersionId: section.designVersionId,
        active: true
      }).lean();
      activeSectionsQuery.session(session);
      const activeSections = await activeSectionsQuery.exec();
      const latestReviewable = [];
      for (const activeSection of activeSections) {
        const latestQuery = DesignSectionRevisionModel.findOne({
          sectionId: idOf(activeSection),
          reviewStatus: { $ne: "draft" }
        }).sort({ revisionNumber: -1 }).lean();
        latestQuery.session(session);
        const latest = await latestQuery.exec();
        if (!latest) {
          throw new RepositoryConflictError("Every active section must have a submitted revision.");
        }
        latestReviewable.push(latest);
      }
      const approved = latestReviewable.filter((item) => item.reviewStatus === "approved").length;
      const rejected = latestReviewable.filter((item) => item.reviewStatus === "rejected").length;
      const awaitingReview = latestReviewable.length - approved - rejected;
      const extractionStatus = rejected > 0
        ? "changes_requested" as const
        : approved === latestReviewable.length
          ? "approved" as const
          : "submitted" as const;
      const jobUpdate = DesignExtractionJobModel.updateOne(
        { designVersionId: section.designVersionId },
        { $set: { status: extractionStatus, updatedAt: date(reviewedAt) } }
      );
      jobUpdate.session(session);
      const jobResult = await jobUpdate.exec();
      if (jobResult.matchedCount !== 1) {
        throw new RepositoryNotFoundError("Design extraction job was not found.");
      }
      return {
        revision: mapSectionRevision(revision),
        extractionStatus,
        progress: {
          approved,
          rejected,
          awaitingReview,
          total: latestReviewable.length
        }
      };
    },

    async createEvaluation(input) {
      const document = await createMongoDocument("Evaluation", () =>
        createDocument(EvaluationModel, {
          ...input,
          _id: input.id ?? randomUUID(),
          id: undefined,
          revisionOf: input.revisionOf ?? null,
          periodStartAt: date(input.periodStartAt),
          periodEndAt: date(input.periodEndAt),
          createdAt: input.createdAt ? date(input.createdAt) : undefined
        }, session)
      );
      return mapEvaluation(document.toObject());
    },

    async listEvaluationsForSubject(subjectUserId) {
      const documents = await EvaluationModel.find({ subjectUserId })
        .sort({ createdAt: -1, _id: -1 })
        .lean()
        .exec();
      return documents.map(mapEvaluation);
    },

    async listEvaluationsForSubjectIds(subjectUserIds, limit) {
      if (subjectUserIds.length === 0) return [];
      const query = EvaluationModel.find({
        subjectUserId: { $in: subjectUserIds }
      })
        .sort({ createdAt: -1, _id: -1 });
      if (limit !== undefined) query.limit(limit);
      const documents = await query.lean().exec();
      return documents.map(mapEvaluation);
    },

    async pageEvaluationsForSubject(subjectUserId, pagination) {
      const filter = { subjectUserId };
      const [documents, total] = await Promise.all([
        EvaluationModel.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        EvaluationModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapEvaluation), total };
    },

    async appendAuditEvent(input) {
      const document = await createMongoDocument("Audit event", () =>
        createDocument(AuditEventModel, {
          ...input,
          _id: input.id ?? randomUUID(),
          id: undefined,
          occurredAt: date(input.occurredAt),
          createdAt: input.createdAt ? date(input.createdAt) : undefined,
          reason: input.reason ?? null
        }, session)
      );
      return mapAuditEvent(document.toObject());
    },

    async listAuditEvents(filters) {
      const documents = await AuditEventModel.find(auditFilter(filters))
        .sort(filters.sort === "desc" ? { occurredAt: -1, _id: -1 } : { occurredAt: 1, _id: 1 })
        .lean()
        .exec();
      return documents.map(mapAuditEvent);
    },

    async pageAuditEvents(filters, pagination) {
      const filter = auditFilter(filters);
      const [documents, total] = await Promise.all([
        AuditEventModel.find(filter)
          .sort(filters.sort === "desc" ? { occurredAt: -1, _id: -1 } : { occurredAt: 1, _id: 1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .lean()
          .exec(),
        AuditEventModel.countDocuments(filter).exec()
      ]);
      return { items: documents.map(mapAuditEvent), total };
    }
  };
  return repository;
}

async function createDocument(
  model: Model<any>,
  input: PlainDocument,
  session?: ClientSession
) {
  if (!session) return model.create(input);
  const documents = await model.create([input], { session });
  return documents[0]!;
}

async function createMongoDocument<T>(
  label: string,
  create: () => Promise<T>
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      throw new RepositoryConflictError(`${label} already exists.`);
    }
    throw error;
  }
}

async function runAuthorizationWrite<T>(
  session: ClientSession | undefined,
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!session && isMongoDuplicateKeyError(error)) {
      throw new RepositoryConflictError(`${label} already exists.`);
    }
    throw error;
  }
}

function accessRequestForMongo(input: NewAccessRequest, id: string): PlainDocument {
  return {
    _id: id,
    requesterId: input.requesterId,
    projectId: input.projectId,
    module: input.module,
    reason: input.reason.trim(),
    status: "pending",
    reviewerId: null,
    decisionReason: null,
    decisionFingerprint: null,
    approvedGrantId: null,
    reviewedAt: null,
    __v: 0,
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function projectAccessGrantForMongo(
  input: NewProjectAccessGrant,
  id: string
): PlainDocument {
  return {
    _id: id,
    projectId: input.projectId,
    userId: input.userId,
    module: input.module,
    source: input.source,
    accessRequestId: input.accessRequestId,
    grantedById: input.grantedById,
    active: true,
    grantedAt: date(input.grantedAt),
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    __v: 0,
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function userInvitationForMongo(input: UserInvitationRecord): PlainDocument {
  return {
    _id: input.id,
    name: invitationNameSchema.parse(input.name),
    email: invitationEmailSchema.parse(input.email),
    emailNormalized: normalizeInvitationEmail(input.email),
    role: input.role,
    mobile: normalizeInvitationMobile(input.mobile),
    tokenHash: input.tokenHash,
    tokenGeneration: input.tokenGeneration,
    issuedAt: date(input.issuedAt),
    expiresAt: date(input.expiresAt),
    status: input.status,
    invitedById: input.invitedById,
    tokenIssuedById: input.tokenIssuedById,
    tokenIssuerVersion: input.tokenIssuerVersion,
    acceptedUserId: input.acceptedUserId,
    acceptedAt: input.acceptedAt ? date(input.acceptedAt) : null,
    revokedById: input.revokedById,
    revokedAt: input.revokedAt ? date(input.revokedAt) : null,
    supersededByInvitationId: input.supersededByInvitationId,
    supersededAt: input.supersededAt ? date(input.supersededAt) : null,
    deliveryStatus: input.deliveryStatus,
    deliveryAttemptedAt: input.deliveryAttemptedAt
      ? date(input.deliveryAttemptedAt)
      : null,
    sentAt: input.sentAt ? date(input.sentAt) : null,
    deliveryFailureCode: input.deliveryFailureCode,
    __v: 0,
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

async function validateAccessRequestCandidate(candidate: PlainDocument) {
  await new AccessRequestModel(candidate).validate();
}

async function validateProjectAccessGrantCandidate(candidate: PlainDocument) {
  await new ProjectAccessGrantModel(candidate).validate();
}

function accessRequestFilter(filters: AccessRequestFilters): PlainDocument {
  return compactFilter({ status: filters.status, module: filters.module });
}

async function pageAccessRequests(
  filter: PlainDocument,
  pagination: { limit: number; offset: number },
  session?: ClientSession
) {
  const documentsQuery = AccessRequestModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(pagination.offset)
    .limit(pagination.limit);
  const countQuery = AccessRequestModel.countDocuments(filter);
  if (session) {
    documentsQuery.session(session);
    countQuery.session(session);
  }
  const [documents, total] = await Promise.all([
    documentsQuery.lean().exec(),
    countQuery.exec()
  ]);
  return { items: documents.map(mapAccessRequest), total };
}

async function pageUserInvitations(
  filters: UserInvitationFilters,
  pagination: { limit: number; offset: number },
  now: string,
  session?: ClientSession
) {
  const initialMatch: PlainDocument = {};
  if (filters.status === undefined) initialMatch.status = "pending";
  if (filters.role !== undefined) initialMatch.role = filters.role;
  if (filters.deliveryStatus !== undefined) {
    initialMatch.deliveryStatus = filters.deliveryStatus;
  }
  if (filters.search?.trim()) {
    const search = new RegExp(escapeRegex(filters.search.trim()), "i");
    initialMatch.$or = [{ name: search }, { email: search }];
  }

  const nowDate = date(now);
  const pipeline: PlainDocument[] = [];
  if (Object.keys(initialMatch).length > 0) {
    pipeline.push({ $match: initialMatch });
  }
  pipeline.push(
    {
      $lookup: {
        from: UserModel.collection.name,
        let: { issuerId: "$tokenIssuedById" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$issuerId"] }
            }
          },
          { $project: { _id: 1, active: 1, role: 1, version: 1 } },
          { $limit: 1 }
        ],
        as: "issuerRows"
      }
    },
    {
      $set: {
        issuer: { $arrayElemAt: ["$issuerRows", 0] }
      }
    },
    {
      $set: {
        issuerVersion: { $ifNull: ["$issuer.version", 1] },
        issuerMatches: {
          $and: [
            { $eq: ["$issuer.active", true] },
            { $eq: ["$issuer.role", "super_admin"] },
            {
              $eq: [
                { $ifNull: ["$issuer.version", 1] },
                "$tokenIssuerVersion"
              ]
            }
          ]
        }
      }
    },
    {
      $set: {
        tokenValidity: {
          $switch: {
            branches: [
              {
                case: { $ne: ["$status", "pending"] },
                then: "unavailable"
              },
              { case: { $not: ["$issuerMatches"] }, then: "invalidated" },
              { case: { $lte: ["$expiresAt", nowDate] }, then: "expired" }
            ],
            default: "current"
          }
        },
        presentationStatus: {
          $switch: {
            branches: [
              { case: { $eq: ["$status", "accepted"] }, then: "accepted" },
              { case: { $eq: ["$status", "revoked"] }, then: "revoked" },
              {
                case: { $eq: ["$status", "superseded"] },
                then: "superseded"
              },
              { case: { $lte: ["$expiresAt", nowDate] }, then: "expired" },
              {
                case: { $eq: ["$deliveryStatus", "failed"] },
                then: "delivery_failed"
              }
            ],
            default: "pending"
          }
        },
        version: { $add: [{ $ifNull: ["$__v", 0] }, 1] }
      }
    }
  );
  if (filters.status !== undefined) {
    pipeline.push({ $match: { presentationStatus: filters.status } });
  }
  pipeline.push(
    {
      $lookup: {
        from: UserModel.collection.name,
        let: { invitationEmail: "$emailNormalized" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$emailNormalized", "$$invitationEmail"] }
            }
          },
          { $project: { _id: 1 } },
          { $limit: 1 }
        ],
        as: "claimedUsers"
      }
    },
    {
      $lookup: {
        from: ProjectModel.collection.name,
        let: { invitationEmail: "$emailNormalized" },
        pipeline: [
          {
            $match: {
              clientId: null,
              $expr: {
                $eq: ["$clientEmailNormalized", "$$invitationEmail"]
              }
            }
          },
          { $project: { _id: 1 } },
          { $limit: 1 }
        ],
        as: "reservedProjects"
      }
    },
    {
      $set: {
        emailClaimedOrReserved: {
          $or: [
            { $gt: [{ $size: "$claimedUsers" }, 0] },
            { $gt: [{ $size: "$reservedProjects" }, 0] }
          ]
        }
      }
    },
    {
      $set: {
        currentLinkAvailable: {
          $and: [
            { $eq: ["$tokenValidity", "current"] },
            { $not: ["$emailClaimedOrReserved"] }
          ]
        },
        availableActions: {
          $switch: {
            branches: [
              {
                case: { $ne: ["$status", "pending"] },
                then: []
              },
              {
                case: "$emailClaimedOrReserved",
                then: ["revoke"]
              }
            ],
            default: ["resend", "revoke"]
          }
        }
      }
    },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        items: [
          { $skip: pagination.offset },
          { $limit: pagination.limit },
          {
            $lookup: {
              from: UserModel.collection.name,
              localField: "invitedById",
              foreignField: "_id",
              pipeline: [
                { $project: { _id: 1, name: 1, email: 1, role: 1 } },
                { $limit: 1 }
              ],
              as: "inviterRows"
            }
          },
          {
            $set: {
              inviter: { $arrayElemAt: ["$inviterRows", 0] }
            }
          },
          {
            $set: {
              invitedBy: {
                id: "$inviter._id",
                name: "$inviter.name",
                email: "$inviter.email",
                role: "$inviter.role"
              }
            }
          },
          {
            $project: {
              _id: 1,
              name: 1,
              email: 1,
              role: 1,
              mobile: 1,
              tokenValidity: 1,
              presentationStatus: 1,
              currentLinkAvailable: 1,
              availableActions: 1,
              invitedBy: 1,
              issuedAt: 1,
              expiresAt: 1,
              deliveryStatus: 1,
              deliveryAttemptedAt: 1,
              sentAt: 1,
              version: 1,
              createdAt: 1,
              updatedAt: 1
            }
          }
        ],
        count: [{ $count: "total" }]
      }
    }
  );
  const aggregate = UserInvitationModel.aggregate(
    pipeline as PipelineStage[]
  );
  if (session) aggregate.session(session);
  const [result] = await aggregate.exec();
  return {
    items: (result?.items ?? []).map(mapUserInvitationAdmin),
    total: result?.count?.[0]?.total ?? 0
  };
}

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

async function throwExtractionJobClaimError(id: string, session?: ClientSession): Promise<never> {
  const query = DesignExtractionJobModel.exists({ _id: id });
  if (session) query.session(session);
  if (!(await query.exec())) {
    throw new RepositoryNotFoundError(`Design extraction job ${id} was not found.`);
  }
  throw new RepositoryConflictError("Extraction job claim is no longer current.");
}

function compactFilter(value: object): PlainDocument {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );
}

function designVersionSequenceKey(target: {
  projectId: string;
  floorId: string;
  stageId: string;
  taskId: string | null;
}) {
  return [
    target.projectId,
    target.floorId,
    target.stageId,
    target.taskId ?? "-"
  ]
    .map(encodeURIComponent)
    .join(":");
}

function kpiTaskFilter(
  ownerIds: string[],
  periodStartAt: string,
  periodEndAt: string
): PlainDocument {
  const periodStart = date(periodStartAt);
  const periodEnd = date(periodEndAt);
  return {
    ownerId: { $in: ownerIds },
    $or: [
      {
        plannedStartAt: { $lte: periodEnd },
        currentDeadlineAt: { $gte: periodStart }
      },
      { completedAt: { $gte: periodStart, $lte: periodEnd } }
    ]
  };
}

function kpiTaskEventFilter(
  taskId: string,
  actorId: string,
  periodStartAt: string,
  periodEndAt: string
): PlainDocument {
  return {
    taskId,
    actorId,
    type: { $in: ["status_changed", "progress_changed", "note_added"] },
    occurredAt: {
      $gte: date(periodStartAt),
      $lte: date(periodEndAt)
    }
  };
}

function auditFilter(filters: AuditFilters): PlainDocument {
  const filter = compactFilter({
    actorId: filters.actorId,
    entityType: filters.entityType,
    entityId: filters.entityId
  });
  if (filters.entityIds !== undefined) filter.entityId = { $in: filters.entityIds };
  if (
    filters.visibleActorIds !== undefined ||
    filters.visibleTaskIds !== undefined
  ) {
    filter.$or = [
      { actorId: { $in: filters.visibleActorIds ?? [] } },
      {
        entityType: "task",
        entityId: { $in: filters.visibleTaskIds ?? [] }
      }
    ];
  }
  return filter;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function date(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function iso(value: string | Date): string {
  return date(value).toISOString();
}

function nullableIso(value: string | Date | null | undefined): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function idOf(document: PlainDocument): string {
  return String(document._id);
}

function mapUser(document: PlainDocument): UserRecord {
  return {
    id: idOf(document),
    name: document.name,
    email: document.email,
    emailNormalized: document.emailNormalized ?? normalizeEmail(document.email),
    mobile: document.mobile ?? null,
    address: document.address ?? null,
    passwordHash: document.passwordHash,
    role: document.role,
    active: document.active,
    accountKind:
      document.accountKind === "development_demo" ? "development_demo" : "standard",
    version: document.version ?? 1,
    managerId: document.managerId ?? null,
    authorizedClientIds: [...(document.authorizedClientIds ?? [])],
    ...(document.avatar ? { avatar: document.avatar } : {}),
    ...(document.title ? { title: document.title } : {}),
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapUserInvitation(document: PlainDocument): UserInvitationRecord {
  return {
    id: idOf(document),
    name: document.name,
    email: document.email,
    emailNormalized:
      document.emailNormalized ?? normalizeInvitationEmail(document.email),
    role: document.role,
    mobile: document.mobile,
    tokenHash: document.tokenHash ?? null,
    tokenGeneration: document.tokenGeneration,
    issuedAt: iso(document.issuedAt),
    expiresAt: iso(document.expiresAt),
    status: document.status,
    invitedById: document.invitedById,
    tokenIssuedById: document.tokenIssuedById,
    tokenIssuerVersion: document.tokenIssuerVersion,
    acceptedUserId: document.acceptedUserId ?? null,
    acceptedAt: nullableIso(document.acceptedAt),
    revokedById: document.revokedById ?? null,
    revokedAt: nullableIso(document.revokedAt),
    supersededByInvitationId: document.supersededByInvitationId ?? null,
    supersededAt: nullableIso(document.supersededAt),
    deliveryStatus: document.deliveryStatus,
    deliveryAttemptedAt: nullableIso(document.deliveryAttemptedAt),
    sentAt: nullableIso(document.sentAt),
    deliveryFailureCode: document.deliveryFailureCode ?? null,
    version: (document.__v ?? 0) + 1,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapUserInvitationAdmin(
  document: PlainDocument
): UserInvitationAdminRecord {
  const invitedBy = document.invitedBy ?? {};
  return {
    id: idOf(document),
    name: document.name,
    email: document.email,
    role: document.role,
    mobile: document.mobile,
    tokenValidity: document.tokenValidity,
    presentationStatus: document.presentationStatus,
    currentLinkAvailable: document.currentLinkAvailable,
    availableActions: [...(document.availableActions ?? [])],
    invitedBy: {
      id: String(invitedBy.id ?? invitedBy._id),
      name: invitedBy.name,
      email: invitedBy.email,
      role: invitedBy.role
    },
    issuedAt: iso(document.issuedAt),
    expiresAt: iso(document.expiresAt),
    deliveryStatus: document.deliveryStatus,
    deliveryAttemptedAt: nullableIso(document.deliveryAttemptedAt),
    sentAt: nullableIso(document.sentAt),
    version: document.version ?? (document.__v ?? 0) + 1,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapAccessRequest(document: PlainDocument): AccessRequestRecord {
  return {
    id: idOf(document),
    requesterId: document.requesterId,
    projectId: document.projectId,
    module: document.module,
    reason: document.reason,
    status: document.status,
    reviewerId: document.reviewerId ?? null,
    decisionReason: document.decisionReason ?? null,
    decisionFingerprint: document.decisionFingerprint ?? null,
    approvedGrantId: document.approvedGrantId ?? null,
    reviewedAt: nullableIso(document.reviewedAt),
    version: (document.__v ?? 0) + 1,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapProjectAccessGrant(document: PlainDocument): ProjectAccessGrantRecord {
  return {
    id: idOf(document),
    projectId: document.projectId,
    userId: document.userId,
    module: document.module,
    source: document.source,
    accessRequestId: document.accessRequestId ?? null,
    grantedById: document.grantedById,
    active: document.active,
    grantedAt: iso(document.grantedAt),
    revokedAt: nullableIso(document.revokedAt),
    revokedById: document.revokedById ?? null,
    revocationReason: document.revocationReason ?? null,
    version: (document.__v ?? 0) + 1,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapProject(document: PlainDocument): ProjectRecord {
  return {
    id: idOf(document),
    name: document.name,
    clientId: document.clientId ?? null,
    clientName: document.clientName ?? "",
    clientEmail: document.clientEmail ?? "",
    clientEmailNormalized:
      document.clientEmailNormalized ?? normalizeEmail(document.clientEmail ?? ""),
    clientMobile: document.clientMobile ?? "",
    clientAddress: document.clientAddress ?? "",
    initiatingDesignerId:
      document.initiatingDesignerId == null ? null : String(document.initiatingDesignerId),
    assignedEstimatorId:
      document.assignedEstimatorId == null ? null : String(document.assignedEstimatorId),
    assignedDesignerIds: Array.isArray(document.assignedDesignerIds)
      ? document.assignedDesignerIds.map(String)
      : [],
    managerId: document.managerId == null ? null : String(document.managerId),
    status: document.status,
    location: document.location,
    plannedStartAt: iso(document.plannedStartAt),
    plannedEndAt: iso(document.plannedEndAt),
    actualStartAt: nullableIso(document.actualStartAt),
    actualEndAt: nullableIso(document.actualEndAt),
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function leadForMongo(input: LeadRecord): PlainDocument {
  return { ...input, id: undefined, nextActionAt: date(input.nextActionAt), targetHandoverAt: input.targetHandoverAt ? date(input.targetHandoverAt) : null, latestActivityAt: input.latestActivityAt ? date(input.latestActivityAt) : null, createdAt: date(input.createdAt), updatedAt: date(input.updatedAt) };
}
function leadChangeForMongo(change: Record<string, unknown>): PlainDocument {
  return { ...change, nextActionAt: change.nextActionAt ? date(change.nextActionAt as string) : undefined, targetHandoverAt: change.targetHandoverAt ? date(change.targetHandoverAt as string) : change.targetHandoverAt, latestActivityAt: change.latestActivityAt ? date(change.latestActivityAt as string) : change.latestActivityAt };
}
function leadActivityForMongo(input: LeadActivityRecord): PlainDocument {
  return { ...input, id: undefined, occurredAt: date(input.occurredAt), createdAt: date(input.createdAt) };
}
function mapLead(document: PlainDocument): LeadRecord {
  return { id: idOf(document), projectId: document.projectId == null ? null : String(document.projectId), ownerId: document.ownerId, clientName: document.clientName, clientEmail: document.clientEmail, clientMobile: document.clientMobile, projectName: document.projectName, location: document.location, propertyType: document.propertyType, budgetMin: document.budgetMin ?? null, budgetMax: document.budgetMax ?? null, source: document.source, stage: document.stage, nextAction: document.nextAction, nextActionAt: iso(document.nextActionAt), builder: document.builder ?? null, areaSqft: document.areaSqft ?? null, targetHandoverAt: nullableIso(document.targetHandoverAt), notes: document.notes ?? null, latestActivityAt: nullableIso(document.latestActivityAt), createdAt: iso(document.createdAt), updatedAt: iso(document.updatedAt) };
}
function mapLeadActivity(document: PlainDocument): LeadActivityRecord {
  return { id: idOf(document), leadId: document.leadId, actorId: document.actorId, type: document.type, note: document.note, occurredAt: iso(document.occurredAt), createdAt: iso(document.createdAt) };
}

function mapFloor(document: PlainDocument): FloorRecord {
  return {
    id: idOf(document),
    projectId: document.projectId,
    name: document.name,
    number: document.number,
    order: document.order,
    progress: document.progress,
    plannedStartAt: iso(document.plannedStartAt),
    plannedEndAt: iso(document.plannedEndAt),
    actualStartAt: nullableIso(document.actualStartAt),
    actualEndAt: nullableIso(document.actualEndAt),
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapStage(document: PlainDocument): DesignStageRecord {
  return {
    id: idOf(document),
    projectId: document.projectId,
    floorId: document.floorId,
    name: document.name,
    type: document.type,
    order: document.order,
    dependencyStageIds: [...document.dependencyStageIds],
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapTask(document: PlainDocument): TaskRecord {
  const base = {
    id: idOf(document),
    projectId: document.projectId,
    floorId: document.floorId,
    stageId: document.stageId,
    title: document.title,
    description: document.description,
    order: document.order,
    ownerId: document.ownerId,
    plannedStartAt: iso(document.plannedStartAt),
    originalDeadlineAt: iso(document.originalDeadlineAt),
    currentDeadlineAt: iso(document.currentDeadlineAt),
    plannedEffort: document.plannedEffort ?? null,
    progress: document.progress,
    dependencyTaskIds: [...document.dependencyTaskIds],
    latestUpdateAt: nullableIso(document.latestUpdateAt),
    ...(document.wasYellow === undefined ? {} : { wasYellow: document.wasYellow }),
    ...(document.approvalVersion === undefined
      ? {}
      : { approvalVersion: document.approvalVersion }),
    ...(document.approvalStatus === undefined
      ? {}
      : { approvalStatus: document.approvalStatus }),
    ...(document.revisionCount === undefined
      ? {}
      : { revisionCount: document.revisionCount }),
    ...(document.hasReview === undefined ? {} : { hasReview: document.hasReview }),
    ...(document.updateEvents === undefined
      ? {}
      : {
          updateEvents: document.updateEvents.map((event: PlainDocument) => ({
            occurredAt: iso(event.occurredAt)
          }))
        }),
    version: (document.__v ?? 0) + 1,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };

  return document.status === "completed"
    ? {
        ...base,
        status: "completed",
        completedAt: iso(document.completedAt)
      }
    : {
        ...base,
        status: document.status,
        completedAt: null
      };
}

/*
 * Presents a ProjectWorkflowTask in TaskRecord shape so the KPI scores design
 * and operational work through one path. Rows created before the KPI rollout
 * carry no dueAt/plannedEffort, so both fall back to the standard turnaround
 * for the task kind rather than dropping the task from the report.
 */
function mapWorkflowTaskToKpiRecord(document: PlainDocument): TaskRecord {
  const kind = String(document.kind) as ProjectWorkflowTaskKind;
  const openedAt = new Date(document.openedAt);
  const schedule = WORKFLOW_TASK_SCHEDULE[kind];
  const deadline = document.dueAt
    ? iso(document.dueAt)
    : iso(workflowTaskDueAt(kind, openedAt));
  const base = {
    id: idOf(document),
    projectId: document.projectId,
    floorId: "",
    stageId: "",
    title: document.title,
    description: document.description ?? "",
    order: 0,
    ownerId: document.assigneeUserId ?? "",
    plannedStartAt: iso(document.openedAt),
    originalDeadlineAt: deadline,
    currentDeadlineAt: deadline,
    plannedEffort: document.plannedEffort ?? schedule?.plannedEffort ?? null,
    progress: document.progress ?? 0,
    dependencyTaskIds: [],
    latestUpdateAt: nullableIso(document.updatedAt),
    version: document.version ?? 1,
    createdAt: iso(document.createdAt ?? document.openedAt),
    updatedAt: iso(document.updatedAt ?? document.openedAt)
  };

  return document.status === "completed"
    ? {
        ...base,
        status: "completed" as const,
        completedAt: iso(document.completedAt ?? document.updatedAt)
      }
    : {
        ...base,
        status: document.status === "in_progress" ? ("in_progress" as const) : ("not_started" as const),
        completedAt: null
      };
}

function mapTaskEvent(document: PlainDocument): TaskEventRecord {
  return {
    id: idOf(document),
    taskId: document.taskId,
    actorId: document.actorId,
    type: document.type,
    occurredAt: iso(document.occurredAt),
    from: structuredClone(document.from),
    to: structuredClone(document.to),
    note: document.note ?? null,
    createdAt: iso(document.createdAt)
  };
}

function mapDesignVersion(document: PlainDocument): DesignVersionRecord {
  return {
    id: idOf(document),
    projectId: document.projectId,
    floorId: document.floorId,
    stageId: document.stageId,
    taskId: document.taskId ?? null,
    versionNumber: document.versionNumber,
    originalFilename: document.originalFilename,
    storedFileReference: document.storedFileReference,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    uploaderId: document.uploaderId,
    uploadedAt: iso(document.uploadedAt),
    approvalStatus: document.approvalStatus,
    reviewerId: document.reviewerId ?? null,
    approvedAt: nullableIso(document.approvedAt),
    clientVisible: document.clientVisible,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapExtractionJob(document: PlainDocument): DesignExtractionJobRecord {
  return {
    id: idOf(document),
    designVersionId: document.designVersionId,
    status: document.status,
    attemptCount: document.attemptCount,
    queuedAt: iso(document.queuedAt),
    nextAttemptAt:
      document.nextAttemptAt === null || document.nextAttemptAt === undefined
        ? (document.status === "queued" ? iso(document.queuedAt) : null)
        : iso(document.nextAttemptAt),
    claimGeneration:
      Number.isSafeInteger(document.claimGeneration) &&
      document.claimGeneration >= 0
        ? document.claimGeneration
        : 0,
    startedAt: nullableIso(document.startedAt),
    completedAt: nullableIso(document.completedAt),
    leaseExpiresAt: nullableIso(document.leaseExpiresAt),
    failureCode: document.failureCode ?? null,
    failureMessage: document.failureMessage ?? null,
    claimId: document.claimId ?? null,
    workerResultId: document.workerResultId ?? null,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapSourcePage(document: PlainDocument): DesignSourcePageRecord {
  return {
    id: idOf(document),
    designVersionId: document.designVersionId,
    pageNumber: document.pageNumber,
    renderedFileReference: document.renderedFileReference,
    width: document.width,
    height: document.height,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapSection(document: PlainDocument): DesignSectionRecord {
  return {
    id: idOf(document),
    designVersionId: document.designVersionId,
    sourcePageId: document.sourcePageId,
    label: document.label,
    active: document.active,
    source: document.source,
    ocrConfidence: document.ocrConfidence ?? null,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt)
  };
}

function mapSectionRevision(document: PlainDocument): DesignSectionRevisionRecord {
  return {
    id: idOf(document),
    sectionId: document.sectionId,
    revisionNumber: document.revisionNumber,
    sourcePageId: document.sourcePageId,
    crop: structuredClone(document.crop),
    croppedFileReference: document.croppedFileReference,
    label: document.label,
    reviewStatus: document.reviewStatus,
    submittedAt: nullableIso(document.submittedAt),
    reviewerId: document.reviewerId ?? null,
    reviewedAt: nullableIso(document.reviewedAt),
    rejectionComment: document.rejectionComment ?? null,
    createdAt: iso(document.createdAt)
  };
}

function validateExtractionDraft(input: import("./types.js").ExtractionDraftReplacement) {
  const pageIds = new Set<string>();
  const pageNumbers = new Set<number>();
  for (const page of input.sourcePages) {
    if (
      page.designVersionId !== input.designVersionId ||
      pageIds.has(page.id) ||
      pageNumbers.has(page.pageNumber)
    ) {
      throw new RepositoryConflictError("Extraction source pages are inconsistent.");
    }
    pageIds.add(page.id);
    pageNumbers.add(page.pageNumber);
  }
  const sectionIds = new Set<string>();
  const revisionIds = new Set<string>();
  for (const { section, revision } of input.sections) {
    if (
      section.designVersionId !== input.designVersionId ||
      section.source !== "ocr" ||
      !section.active ||
      !pageIds.has(section.sourcePageId) ||
      sectionIds.has(section.id) ||
      revisionIds.has(revision.id) ||
      revision.sectionId !== section.id ||
      revision.sourcePageId !== section.sourcePageId ||
      revision.revisionNumber !== 1 ||
      revision.reviewStatus !== "draft" ||
      revision.label !== section.label ||
      revision.submittedAt !== null ||
      revision.reviewerId !== null ||
      revision.reviewedAt !== null ||
      revision.rejectionComment !== null
    ) {
      throw new RepositoryConflictError("Extraction section proposal is inconsistent.");
    }
    sectionIds.add(section.id);
    revisionIds.add(revision.id);
  }
}

function mapEvaluation(document: PlainDocument): EvaluationRecord {
  return {
    id: idOf(document),
    subjectUserId: document.subjectUserId,
    evaluatorUserId: document.evaluatorUserId,
    evaluatorRole: document.evaluatorRole,
    periodStartAt: iso(document.periodStartAt),
    periodEndAt: iso(document.periodEndAt),
    score: document.score,
    comments: document.comments,
    revisionOf: document.revisionOf ?? null,
    createdAt: iso(document.createdAt)
  };
}

function mapAuditEvent(document: PlainDocument): AuditEventRecord {
  return {
    id: idOf(document),
    actorId: document.actorId,
    action: document.action,
    entityType: document.entityType,
    entityId: document.entityId,
    occurredAt: iso(document.occurredAt),
    oldValues: structuredClone(document.oldValues),
    newValues: structuredClone(document.newValues),
    reason: document.reason ?? null,
    createdAt: iso(document.createdAt)
  };
}

function projectForMongo(input: ProjectRecord): PlainDocument {
  return {
    ...input,
    id: undefined,
    plannedStartAt: date(input.plannedStartAt),
    plannedEndAt: date(input.plannedEndAt),
    actualStartAt: input.actualStartAt ? date(input.actualStartAt) : null,
    actualEndAt: input.actualEndAt ? date(input.actualEndAt) : null,
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function floorForMongo(input: FloorRecord): PlainDocument {
  return {
    ...input,
    id: undefined,
    plannedStartAt: date(input.plannedStartAt),
    plannedEndAt: date(input.plannedEndAt),
    actualStartAt: input.actualStartAt ? date(input.actualStartAt) : null,
    actualEndAt: input.actualEndAt ? date(input.actualEndAt) : null,
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function taskForMongo(input: TaskRecord): PlainDocument {
  return {
    ...input,
    id: undefined,
    version: undefined,
    plannedStartAt: date(input.plannedStartAt),
    originalDeadlineAt: date(input.originalDeadlineAt),
    currentDeadlineAt: date(input.currentDeadlineAt),
    completedAt: input.completedAt ? date(input.completedAt) : null,
    latestUpdateAt: input.latestUpdateAt ? date(input.latestUpdateAt) : null,
    updateEvents: input.updateEvents?.map((event) => ({
      occurredAt: date(event.occurredAt)
    })),
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function designVersionForMongo(input: NewDesignVersion): PlainDocument {
  return {
    ...input,
    id: undefined,
    uploadedAt: date(input.uploadedAt),
    approvedAt: input.approvedAt ? date(input.approvedAt) : null,
    createdAt: input.createdAt ? date(input.createdAt) : undefined,
    updatedAt: input.updatedAt ? date(input.updatedAt) : undefined
  };
}

function extractionJobForMongo(input: NewDesignExtractionJob): PlainDocument {
  return {
    ...input,
    _id: input.id,
    id: undefined,
    queuedAt: date(input.queuedAt),
    nextAttemptAt:
      input.nextAttemptAt === null
        ? null
        : input.nextAttemptAt !== undefined
          ? date(input.nextAttemptAt)
          : input.status === "queued"
            ? date(input.queuedAt)
            : null,
    claimGeneration: input.claimGeneration ?? 0,
    startedAt: input.startedAt ? date(input.startedAt) : null,
    completedAt: input.completedAt ? date(input.completedAt) : null,
    leaseExpiresAt: input.leaseExpiresAt ? date(input.leaseExpiresAt) : null,
    claimId: input.claimId ?? null,
    workerResultId: input.workerResultId ?? null,
    createdAt: input.createdAt ? date(input.createdAt) : undefined,
    updatedAt: input.updatedAt ? date(input.updatedAt) : undefined
  };
}

function sourcePageForMongo(input: DesignSourcePageRecord): PlainDocument {
  return {
    ...input,
    _id: input.id,
    id: undefined,
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function sectionForMongo(input: DesignSectionRecord): PlainDocument {
  return {
    ...input,
    _id: input.id,
    id: undefined,
    createdAt: date(input.createdAt),
    updatedAt: date(input.updatedAt)
  };
}

function sectionRevisionForMongo(input: DesignSectionRevisionRecord): PlainDocument {
  return {
    ...input,
    _id: input.id,
    id: undefined,
    submittedAt: input.submittedAt ? date(input.submittedAt) : null,
    reviewedAt: input.reviewedAt ? date(input.reviewedAt) : null,
    createdAt: date(input.createdAt)
  };
}

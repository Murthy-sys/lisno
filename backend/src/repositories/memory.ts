import { AsyncLocalStorage } from "node:async_hooks";
import { timingSafeEqual } from "node:crypto";

import { normalizeEmail } from "../domain/email.js";
import {
  INVITABLE_ROLE_CODES,
  USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN,
  USER_INVITATION_TOKEN_HASH_PATTERN,
  USER_INVITATION_TTL_MS,
  invitationEmailSchema,
  invitationNameSchema,
  normalizeInvitationEmail,
  normalizeInvitationMobile,
  presentationStatusForInvitation,
  tokenValidityForInvitation
} from "../domain/user-invitations.js";
import {
  PASSWORD_RESET_DELIVERY_FAILURE_CODE_PATTERN,
  PASSWORD_RESET_TOKEN_HASH_PATTERN,
  PASSWORD_RESET_TTL_MS
} from "../domain/password-resets.js";
import {
  PROJECT_MODULES,
  REQUESTABLE_PROJECT_MODULES
} from "../domain/authorization.js";
import {
  grantCanSupplyProjectModuleScope,
  legacyRelationshipAllows
} from "../domain/project-access.js";
import { demoSeedData } from "../seed/data.js";
import { adminProjectSummary } from "./admin-project-summary.js";
import {
  memorySuperAdminDashboardOverview,
  memorySuperAdminDashboardProjects,
  memorySuperAdminDashboardWorkforce
} from "./super-admin-dashboard.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository,
  type AccessRequestRecord,
  type AccessRequestTransition,
  type AuditEventRecord,
  type AuditFilters,
  type DesignExtractionJobRecord,
  type DesignSectionRecord,
  type DesignSectionRevisionRecord,
  type DesignStageRecord,
  type DesignSourcePageRecord,
  type ExtractionDraftReplacement,
  type DesignVersionRecord,
  type EvaluationRecord,
  type EstimateSummaryRecord,
  type EstimatorOption,
  type FloorRecord,
  type LeadActivityRecord,
  type LeadRecord,
  type ManagerTreeNode,
  type NewAccessRequest,
  type NewProjectAccessGrant,
  type NewUser,
  type ProjectHierarchy,
  type ProjectRecord,
  type ProjectAccessGrantRecord,
  type PasswordResetRequestRecord,
  type SeedData,
  type TaskEventRecord,
  type TaskFilters,
  type TaskRecord,
  type UserInvitationAdminRecord,
  type UserInvitationRecord,
  type UserRecord
} from "./types.js";

const clone = <T>(value: T): T => structuredClone(value);
const byNameThenId = <T extends { id: string; name: string }>(left: T, right: T) =>
  left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
const byOrderThenId = <T extends { id: string; order: number }>(left: T, right: T) =>
  left.order - right.order || left.id.localeCompare(right.id);
const byDateThenId = <T extends { id: string }>(
  field: keyof T,
  left: T,
  right: T
) =>
  new Date(String(left[field])).getTime() -
    new Date(String(right[field])).getTime() ||
  left.id.localeCompare(right.id);
const newestProjectFirst = (left: ProjectRecord, right: ProjectRecord) =>
  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
  right.id.localeCompare(left.id);

interface MemorySnapshot {
  state: SeedData;
  counters: Map<string, number>;
  timestamp: number;
}

const snapshotReaders = new WeakMap<AppRepository, () => MemorySnapshot>();
const mutationMethods = new Set<keyof AppRepository>([
  "coordinateClientEmail",
  "createUserInvitation",
  "supersedeUserInvitation",
  "resendUserInvitation",
  "revokeUserInvitation",
  "acceptUserInvitation",
  "updateUserInvitationDelivery",
  "createPasswordReset",
  "supersedePasswordReset",
  "completePasswordReset",
  "updatePasswordResetDelivery",
  "coordinateAuthorizationMutation",
  "createAccessRequest",
  "findOrCreatePendingAccessRequest",
  "transitionAccessRequest",
  "createProjectAccessGrant",
  "findOrCreateActiveProjectAccessGrant",
  "revokeProjectAccessGrant",
  "revokeActiveProjectAccessGrantsForUser",
  "createProject",
  "createLead",
  "updateLead",
  "appendLeadActivity",
  "createUser",
  "updateUser",
  "updateUserCredentials",
  "linkUnclaimedProjectsToClient",
  "createFloor",
  "createDesignStage",
  "createTask",
  "updateTask",
  "appendTaskEvent",
  "createDesignVersion",
  "createNextDesignVersion",
  "updateDesignVersion",
  "enqueueExtractionJob",
  "claimExtractionJob",
  "claimExtractionJobById",
  "renewExtractionJobLease",
  "completeExtractionJob",
  "failExtractionJob",
  "replaceExtractionDraft",
  "createManualSection",
  "updateDraftSection",
  "createSectionRevision",
  "retryExtractionJob",
  "recoverFailedExtractionJob",
  "submitDesignSectionDrafts",
  "decideSubmittedSectionRevision",
  "createEvaluation",
  "appendAuditEvent"
]);

export function createMemoryRepository(seed: SeedData = demoSeedData): AppRepository {
  const normalizedSeed = clone(seed);
  normalizedSeed.userInvitations ??= [];
  normalizedSeed.passwordResetRequests ??= [];
  normalizedSeed.users = normalizedSeed.users.map((user) => ({
    ...user,
    accountKind: user.accountKind === "development_demo" ? "development_demo" : "standard",
    version: user.version ?? 1,
    sessionVersion: user.sessionVersion ?? 1
  }));
  normalizedSeed.estimateResponsibilities ??= [];
  normalizedSeed.estimateSummaries = (normalizedSeed.estimateSummaries ?? []).map(
    (estimate) => ({
      ...estimate,
      version: estimate.version ?? 1,
      subtotal: estimate.subtotal ?? estimate.total,
      gst: estimate.gst ?? 0,
      clientDecisionAt: estimate.clientDecisionAt ?? null,
      clientDecisionSource: estimate.clientDecisionSource ?? null,
      approvedBaseline: estimate.approvedBaseline ??
        legacyApprovedEstimateBaseline(estimate),
      clientReview: estimate.clientReview ?? null,
      assignedAdminId: estimate.assignedAdminId ?? null,
      designPlanStatus: estimate.designPlanStatus ?? null,
      designPlanVersion: estimate.designPlanVersion ?? 0,
      designPlanDesignerId: estimate.designPlanDesignerId ?? null,
      createdAt: estimate.createdAt ?? "1970-01-01T00:00:00.000Z",
      updatedAt: estimate.updatedAt ?? estimate.createdAt ?? "1970-01-01T00:00:00.000Z"
    })
  );
  normalizedSeed.projects = normalizedSeed.projects.map((project) => ({
    ...project,
    initiatingDesignerId: project.initiatingDesignerId ?? null,
    assignedEstimatorId: project.assignedEstimatorId ?? null,
    assignedDesignerIds: project.assignedDesignerIds ?? [],
    managerId: project.managerId ?? null
  }));
  normalizedSeed.leads = normalizedSeed.leads.map((lead) => ({
    ...lead,
    projectId: lead.projectId ?? null
  }));
  assertAuthorizationUniqueness(normalizedSeed);
  return buildMemoryRepository({
    state: normalizedSeed,
    counters: new Map(),
    timestamp: latestTimestamp(normalizedSeed)
  });
}

function legacyApprovedEstimateBaseline(
  estimate: EstimateSummaryRecord
): EstimateSummaryRecord["approvedBaseline"] {
  if (estimate.status !== "client_approved") return null;
  const currentVersion = Number(estimate.version ?? 1);
  const estimateVersion = Number.isSafeInteger(currentVersion) && currentVersion > 1
    ? currentVersion - 1
    : 1;
  return {
    estimateVersion,
    reviewRoundId: null,
    subtotal: Number(estimate.subtotal ?? estimate.total),
    gst: Number(estimate.gst ?? 0),
    total: Number(estimate.total),
    decisionAt: estimate.clientDecisionAt ?? null,
    decisionSource: estimate.clientDecisionSource ?? null
  };
}

function buildMemoryRepository(initial: MemorySnapshot): AppRepository {
  let state = clone(initial.state);
  const counters = new Map(initial.counters);
  const transactionContext = new AsyncLocalStorage<boolean>();
  let writeTail: Promise<void> = Promise.resolve();
  let timestamp = initial.timestamp;

  const acquireWriteLock = async () => {
    const previousWrite = writeTail;
    let releaseWrite!: () => void;
    writeTail = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    await previousWrite;
    return releaseWrite;
  };

  const nextId = (prefix: string) => {
    const count = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, count);
    return `${prefix}-memory-${String(count).padStart(4, "0")}`;
  };
  const nextIso = () => {
    timestamp += 1;
    return new Date(timestamp).toISOString();
  };
  const ensureUniqueId = (records: Array<{ id: string }>, id: string, label: string) => {
    if (records.some((record) => record.id === id)) {
      throw new RepositoryConflictError(`${label} ${id} already exists.`);
    }
  };

  const implementation: AppRepository = {
    async runInTransaction(operation) {
      if (transactionContext.getStore()) {
        throw new Error("Nested memory transactions are not supported.");
      }
      const releaseWrite = await acquireWriteLock();
      const transactionRepository = buildMemoryRepository({
        state,
        counters,
        timestamp
      });
      const transactionView = new Proxy(transactionRepository, {
        get(target, property, receiver) {
          if (property === "runInTransaction") {
            return async () => {
              throw new Error("Nested memory transactions are not supported.");
            };
          }
          return Reflect.get(target, property, receiver);
        }
      });
      try {
        const result = await transactionContext.run(true, () =>
          operation(transactionView)
        );
        const committed = snapshotReaders.get(transactionRepository)!();
        assertAuthorizationUniqueness(committed.state);
        state = committed.state;
        timestamp = committed.timestamp;
        counters.clear();
        for (const [key, value] of committed.counters) counters.set(key, value);
        return result;
      } finally {
        releaseWrite();
      }
    },

    async coordinateClientEmail(emailNormalized) {
      normalizeEmail(emailNormalized);
    },

    async findPasswordResetById(id) {
      return copyOrNull(
        state.passwordResetRequests!.find((reset) => reset.id === id)
      );
    },

    async findPendingPasswordResetByUserId(userId) {
      return copyOrNull(
        state.passwordResetRequests!.find(
          (reset) => reset.userId === userId && reset.status === "pending"
        )
      );
    },

    async findPendingPasswordResetByTokenHash(tokenHash) {
      if (!PASSWORD_RESET_TOKEN_HASH_PATTERN.test(tokenHash)) return null;
      return copyOrNull(
        state.passwordResetRequests!.find(
          (reset) =>
            reset.status === "pending" && reset.tokenHash === tokenHash
        )
      );
    },

    async findLatestPasswordResetIssuedAt(userId) {
      return state.passwordResetRequests!
        .filter((reset) => reset.userId === userId)
        .sort(
          (left, right) =>
            Date.parse(right.issuedAt) - Date.parse(left.issuedAt) ||
            right.id.localeCompare(left.id)
        )[0]?.issuedAt ?? null;
    },

    async countPasswordResetsIssuedSince(userId, since) {
      const sinceMs = Date.parse(since);
      return state.passwordResetRequests!.filter(
        (reset) =>
          reset.userId === userId && Date.parse(reset.issuedAt) > sinceMs
      ).length;
    },

    async createPasswordReset(input) {
      const resets = state.passwordResetRequests!;
      ensureUniqueId(resets, input.id, "Password reset");
      assertPasswordResetState(input);
      if (
        input.tokenHash === null ||
        !PASSWORD_RESET_TOKEN_HASH_PATTERN.test(input.tokenHash)
      ) {
        throw new RepositoryConflictError("Password reset token digest is invalid.");
      }
      if (resets.some((reset) => reset.tokenHash === input.tokenHash)) {
        throw new RepositoryConflictError("Password reset token digest already exists.");
      }
      if (
        input.status !== "pending" ||
        resets.some(
          (reset) => reset.userId === input.userId && reset.status === "pending"
        )
      ) {
        throw new RepositoryConflictError(
          `Pending password reset already exists for User ${input.userId}.`
        );
      }
      const record = clone(input);
      resets.push(record);
      return clone(record);
    },

    async supersedePasswordReset(id, expectedVersion, change) {
      const resets = state.passwordResetRequests!;
      const index = resets.findIndex((reset) => reset.id === id);
      if (index < 0) {
        throw new RepositoryNotFoundError(`Password reset ${id} was not found.`);
      }
      const current = resets[index]!;
      if (current.status !== "pending" || current.version !== expectedVersion) {
        throw new RepositoryConflictError(`Password reset ${id} changed concurrently.`);
      }
      const updated: PasswordResetRequestRecord = {
        ...current,
        tokenHash: null,
        status: "superseded",
        supersededByResetId: change.supersededByResetId,
        supersededAt: change.supersededAt,
        updatedAt: change.updatedAt,
        version: current.version + 1
      };
      resets[index] = updated;
      return clone(updated);
    },

    async completePasswordReset(
      id,
      expectedVersion,
      expectedGeneration,
      expectedTokenHash,
      change
    ) {
      const resets = state.passwordResetRequests!;
      const index = resets.findIndex((reset) => reset.id === id);
      if (index < 0) {
        throw new RepositoryNotFoundError(`Password reset ${id} was not found.`);
      }
      const current = resets[index]!;
      if (
        current.status !== "pending" ||
        current.version !== expectedVersion ||
        current.tokenGeneration !== expectedGeneration ||
        current.tokenHash === null ||
        !tokenHashesEqual(current.tokenHash, expectedTokenHash)
      ) {
        throw new RepositoryConflictError(`Password reset ${id} changed concurrently.`);
      }
      const updated: PasswordResetRequestRecord = {
        ...current,
        tokenHash: null,
        status: "completed",
        completedAt: change.completedAt,
        updatedAt: change.updatedAt,
        version: current.version + 1
      };
      resets[index] = updated;
      return clone(updated);
    },

    async updatePasswordResetDelivery(id, tokenGeneration, change) {
      const resets = state.passwordResetRequests!;
      const index = resets.findIndex(
        (reset) =>
          reset.id === id &&
          reset.status === "pending" &&
          reset.tokenGeneration === tokenGeneration &&
          reset.deliveryStatus === "queued"
      );
      if (index < 0) return null;
      if (
        change.status === "failed" &&
        !PASSWORD_RESET_DELIVERY_FAILURE_CODE_PATTERN.test(change.failureCode)
      ) {
        throw new RepositoryConflictError("Password reset delivery code is invalid.");
      }
      const current = resets[index]!;
      const updated: PasswordResetRequestRecord = {
        ...current,
        deliveryStatus: change.status,
        deliveryAttemptedAt: change.attemptedAt,
        sentAt: change.status === "sent" ? change.sentAt : null,
        deliveryFailureCode:
          change.status === "failed" ? change.failureCode : null,
        updatedAt: change.updatedAt,
        version: current.version + 1
      };
      resets[index] = updated;
      return clone(updated);
    },

    async findUserInvitationById(id) {
      return copyOrNull(
        state.userInvitations.find((invitation) => invitation.id === id)
      );
    },

    async findPendingUserInvitationByEmail(emailNormalized) {
      const normalizedEmail = normalizeInvitationEmail(emailNormalized);
      return copyOrNull(
        state.userInvitations.find(
          (invitation) =>
            invitation.status === "pending" &&
            invitation.emailNormalized === normalizedEmail
        )
      );
    },

    async findLatestUserInvitationIssuedAtByEmail(emailNormalized) {
      const normalizedEmail = normalizeInvitationEmail(emailNormalized);
      const latest = state.userInvitations
        .filter((invitation) => invitation.emailNormalized === normalizedEmail)
        .sort(
          (left, right) =>
            new Date(right.issuedAt).getTime() - new Date(left.issuedAt).getTime() ||
            right.id.localeCompare(left.id)
        )[0];
      return latest?.issuedAt ?? null;
    },

    async findPendingUserInvitationByTokenHash(tokenHash) {
      return copyOrNull(
        state.userInvitations.find(
          (invitation) =>
            invitation.status === "pending" &&
            invitation.tokenHash !== null &&
            tokenHashesEqual(invitation.tokenHash, tokenHash)
        )
      );
    },

    async pageUserInvitations(filters, pagination, now) {
      const search = filters.search?.trim().toLowerCase();
      const presented = state.userInvitations
        .filter((invitation) =>
          filters.status === undefined ? invitation.status === "pending" : true
        )
        .map((invitation) => presentMemoryInvitation(invitation, state, now))
        .filter(
          (invitation) =>
            (filters.status === undefined ||
              invitation.presentationStatus === filters.status) &&
            (filters.role === undefined || invitation.role === filters.role) &&
            (filters.deliveryStatus === undefined ||
              invitation.deliveryStatus === filters.deliveryStatus) &&
            (!search ||
              invitation.name.toLowerCase().includes(search) ||
              invitation.email.toLowerCase().includes(search))
        )
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
            right.id.localeCompare(left.id)
        );
      return paginate(presented, pagination);
    },

    async hasUnclaimedClientProjectByEmail(emailNormalized) {
      const normalizedEmail = normalizeInvitationEmail(emailNormalized);
      return state.projects.some(
        (project) =>
          project.clientId === null &&
          project.clientEmailNormalized === normalizedEmail
      );
    },

    async createUserInvitation(input) {
      const record = normalizeNewMemoryInvitation(input);
      ensureUniqueId(state.userInvitations, record.id, "User invitation");
      assertInvitationCanInsert(state, record);
      state.userInvitations.push(record);
      return clone(record);
    },

    async supersedeUserInvitation(id, expectedVersion, change) {
      const { index, current } = pendingInvitationForTransition(
        state.userInvitations,
        id,
        expectedVersion
      );
      const updated: UserInvitationRecord = {
        ...current,
        tokenHash: null,
        status: "superseded",
        supersededByInvitationId: change.supersededByInvitationId,
        supersededAt: change.supersededAt,
        updatedAt: change.updatedAt,
        version: current.version + 1
      };
      assertUserInvitationState(updated);
      state.userInvitations[index] = updated;
      return clone(updated);
    },

    async resendUserInvitation(id, expectedVersion, change) {
      const { index, current } = pendingInvitationForTransition(
        state.userInvitations,
        id,
        expectedVersion
      );
      if (change.tokenGeneration !== current.tokenGeneration + 1) {
        throw new RepositoryConflictError(
          `User invitation ${id} has an invalid token generation.`
        );
      }
      if (
        state.userInvitations.some(
          (invitation) =>
            invitation.id !== id &&
            invitation.tokenHash !== null &&
            tokenHashesEqual(invitation.tokenHash, change.tokenHash)
        )
      ) {
        throw new RepositoryConflictError("Invitation token hash already exists.");
      }
      const updated: UserInvitationRecord = {
        ...current,
        tokenHash: change.tokenHash,
        tokenGeneration: change.tokenGeneration,
        issuedAt: change.issuedAt,
        expiresAt: change.expiresAt,
        tokenIssuedById: change.tokenIssuedById,
        tokenIssuerVersion: change.tokenIssuerVersion,
        deliveryStatus: "queued",
        deliveryAttemptedAt: null,
        sentAt: null,
        deliveryFailureCode: null,
        updatedAt: change.updatedAt,
        version: current.version + 1
      };
      assertUserInvitationState(updated);
      state.userInvitations[index] = updated;
      return clone(updated);
    },

    async revokeUserInvitation(id, expectedVersion, change) {
      const { index, current } = pendingInvitationForTransition(
        state.userInvitations,
        id,
        expectedVersion
      );
      const updated: UserInvitationRecord = {
        ...current,
        tokenHash: null,
        status: "revoked",
        revokedById: change.revokedById,
        revokedAt: change.revokedAt,
        updatedAt: change.updatedAt,
        version: current.version + 1
      };
      assertUserInvitationState(updated);
      state.userInvitations[index] = updated;
      return clone(updated);
    },

    async acceptUserInvitation(
      id,
      expectedVersion,
      expectedGeneration,
      expectedTokenHash,
      change
    ) {
      const { index, current } = pendingInvitationForTransition(
        state.userInvitations,
        id,
        expectedVersion
      );
      if (
        current.tokenGeneration !== expectedGeneration ||
        current.tokenHash === null ||
        !tokenHashesEqual(current.tokenHash, expectedTokenHash)
      ) {
        throw new RepositoryConflictError(
          `User invitation ${id} token is no longer current.`
        );
      }
      if (
        state.userInvitations.some(
          (invitation) => invitation.acceptedUserId === change.acceptedUserId
        )
      ) {
        throw new RepositoryConflictError("Accepted invitation user already exists.");
      }
      const updated: UserInvitationRecord = {
        ...current,
        tokenHash: null,
        status: "accepted",
        acceptedUserId: change.acceptedUserId,
        acceptedAt: change.acceptedAt,
        updatedAt: change.updatedAt,
        version: current.version + 1
      };
      assertUserInvitationState(updated);
      state.userInvitations[index] = updated;
      return clone(updated);
    },

    async updateUserInvitationDelivery(id, tokenGeneration, change) {
      const index = state.userInvitations.findIndex(
        (invitation) => invitation.id === id
      );
      if (index < 0) return null;
      const current = state.userInvitations[index]!;
      if (
        current.status !== "pending" ||
        current.tokenGeneration !== tokenGeneration ||
        current.deliveryStatus !== "queued"
      ) {
        return null;
      }
      const updated: UserInvitationRecord = {
        ...current,
        deliveryStatus: change.status,
        deliveryAttemptedAt: change.attemptedAt,
        sentAt: change.status === "sent" ? change.sentAt : null,
        deliveryFailureCode:
          change.status === "failed" ? change.failureCode : null,
        updatedAt: change.updatedAt
      };
      assertUserInvitationState(updated);
      state.userInvitations[index] = updated;
      return clone(updated);
    },

    async coordinateAuthorizationMutation() {
      // The memory repository's write lock is the coordination record equivalent.
    },

    async findAccessRequestById(id) {
      return copyOrNull(state.accessRequests.find((request) => request.id === id));
    },

    async findPendingAccessRequest(requesterId, projectId, module) {
      return copyOrNull(
        state.accessRequests.find(
          (request) =>
            request.requesterId === requesterId &&
            request.projectId === projectId &&
            request.module === module &&
            request.status === "pending"
        )
      );
    },

    async createAccessRequest(input: NewAccessRequest) {
      const normalized = normalizeNewAccessRequest(
        input,
        input.id ?? nextId("access-request")
      );
      ensureUniqueId(state.accessRequests, normalized.id, "Access request");
      if (
        state.accessRequests.some(
          (request) =>
            request.status === "pending" &&
            request.requesterId === normalized.requesterId &&
            request.projectId === normalized.projectId &&
            request.module === normalized.module
        )
      ) {
        throw new RepositoryConflictError("Pending access request already exists.");
      }
      state.accessRequests.push(normalized);
      return clone(normalized);
    },

    async findOrCreatePendingAccessRequest(input: NewAccessRequest) {
      const existing = await implementation.findPendingAccessRequest(
        input.requesterId,
        input.projectId,
        input.module
      );
      if (existing) return { record: existing, created: false };
      return {
        record: await implementation.createAccessRequest(input),
        created: true
      };
    },

    async transitionAccessRequest(
      id,
      expectedVersion,
      change: AccessRequestTransition
    ) {
      const index = state.accessRequests.findIndex((request) => request.id === id);
      if (index < 0) {
        throw new RepositoryNotFoundError(`Access request ${id} was not found.`);
      }
      const current = state.accessRequests[index]!;
      if (current.version !== expectedVersion || current.status !== "pending") {
        throw new RepositoryConflictError(
          `Access request ${id} cannot transition at version ${expectedVersion}.`
        );
      }
      const transitioned: AccessRequestRecord = {
        ...current,
        ...clone(change),
        version: current.version + 1
      };
      state.accessRequests[index] = transitioned;
      return clone(transitioned);
    },

    async pageAccessRequestsForRequester(requesterId, filters, pagination) {
      const requests = filteredAccessRequests(state.accessRequests, filters)
        .filter((request) => request.requesterId === requesterId)
        .sort(compareAccessRequestChronology);
      return paginate(clone(requests), pagination);
    },

    async pageAccessRequestsForReview(scope, filters, pagination) {
      let requests = filteredAccessRequests(state.accessRequests, filters);
      if (scope.kind === "admin_initiator") {
        const existingProjects = new Set(state.projects.map((project) => project.id));
        const projectIds = new Set(
          state.projectAccessGrants
            .filter(
              (grant) =>
                grant.active &&
                grant.userId === scope.adminId &&
                grant.module === "projects" &&
                grant.source === "admin_initiator" &&
                existingProjects.has(grant.projectId)
            )
            .map((grant) => grant.projectId)
        );
        requests = requests.filter((request) => projectIds.has(request.projectId));
      }
      requests.sort(compareAccessRequestChronology);
      return paginate(clone(requests), pagination);
    },

    async findProjectAccessGrantById(id) {
      return copyOrNull(state.projectAccessGrants.find((grant) => grant.id === id));
    },

    async findProjectAccessGrantByAccessRequestId(accessRequestId) {
      return copyOrNull(
        state.projectAccessGrants.find(
          (grant) => grant.accessRequestId === accessRequestId
        )
      );
    },

    async findActiveProjectAccessGrant(userId, projectId, module) {
      return copyOrNull(
        state.projectAccessGrants.find(
          (grant) =>
            grant.active &&
            grant.userId === userId &&
            grant.projectId === projectId &&
            grant.module === module
        )
      );
    },

    async listActiveProjectAccessGrants(userId, module) {
      return clone(
        state.projectAccessGrants
          .filter(
            (grant) =>
              grant.active && grant.userId === userId && grant.module === module
          )
          .sort(
            (left, right) =>
              left.projectId.localeCompare(right.projectId) ||
              left.id.localeCompare(right.id)
          )
      );
    },

    async createProjectAccessGrant(input: NewProjectAccessGrant) {
      const normalized = normalizeNewProjectAccessGrant(
        input,
        input.id ?? nextId("project-access-grant")
      );
      ensureUniqueId(state.projectAccessGrants, normalized.id, "Project access grant");
      if (
        normalized.accessRequestId !== null &&
        state.projectAccessGrants.some(
          (grant) => grant.accessRequestId === normalized.accessRequestId
        )
      ) {
        throw new RepositoryConflictError("Access request grant already exists.");
      }
      if (
        state.projectAccessGrants.some(
          (grant) =>
            grant.active &&
            grant.userId === normalized.userId &&
            grant.projectId === normalized.projectId &&
            grant.module === normalized.module
        )
      ) {
        throw new RepositoryConflictError("Active project access grant already exists.");
      }
      state.projectAccessGrants.push(normalized);
      return clone(normalized);
    },

    async findOrCreateActiveProjectAccessGrant(input: NewProjectAccessGrant) {
      const existing = await implementation.findActiveProjectAccessGrant(
        input.userId,
        input.projectId,
        input.module
      );
      if (existing) return { record: existing, created: false };
      return {
        record: await implementation.createProjectAccessGrant(input),
        created: true
      };
    },

    async revokeProjectAccessGrant(id, expectedVersion, change) {
      const index = state.projectAccessGrants.findIndex((grant) => grant.id === id);
      if (index < 0) {
        throw new RepositoryNotFoundError(`Project access grant ${id} was not found.`);
      }
      const current = state.projectAccessGrants[index]!;
      if (!current.active || current.version !== expectedVersion) {
        throw new RepositoryConflictError(
          `Project access grant ${id} cannot be revoked at version ${expectedVersion}.`
        );
      }
      const revocationReason = normalizeBoundedReason(
        change.revocationReason,
        "Revocation reason"
      );
      const revoked: ProjectAccessGrantRecord = {
        ...current,
        active: false,
        revokedAt: change.revokedAt,
        revokedById: change.revokedById,
        revocationReason,
        updatedAt: change.updatedAt,
        version: current.version + 1
      };
      state.projectAccessGrants[index] = revoked;
      return clone(revoked);
    },

    async revokeActiveProjectAccessGrantsForUser(userId, change) {
      const revocationReason = normalizeBoundedReason(
        change.revocationReason,
        "Revocation reason"
      );
      const revoked: ProjectAccessGrantRecord[] = [];
      for (let index = 0; index < state.projectAccessGrants.length; index += 1) {
        const current = state.projectAccessGrants[index]!;
        if (!current.active || current.userId !== userId) continue;
        const next: ProjectAccessGrantRecord = {
          ...current,
          active: false,
          revokedAt: change.revokedAt,
          revokedById: change.revokedById,
          revocationReason,
          updatedAt: change.updatedAt,
          version: current.version + 1
        };
        state.projectAccessGrants[index] = next;
        revoked.push(clone(next));
      }
      return revoked.sort(
        (left, right) =>
          left.projectId.localeCompare(right.projectId) || left.id.localeCompare(right.id)
      );
    },

    async findUserById(id) {
      return copyOrNull(state.users.find((user) => user.id === id));
    },

    async findUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      return copyOrNull(
        state.users.find((user) => user.emailNormalized === normalizedEmail)
      );
    },

    async readSuperAdminDashboardOverview(input) {
      return memorySuperAdminDashboardOverview(state, input);
    },

    async pageSuperAdminDashboardProjects(observedAt, filters) {
      return memorySuperAdminDashboardProjects(state, observedAt, filters);
    },

    async pageSuperAdminDashboardWorkforce(input) {
      return memorySuperAdminDashboardWorkforce(state, input);
    },

    async createUser(input: NewUser) {
      const emailNormalized = normalizeEmail(input.email);
      if (state.users.some((user) => user.emailNormalized === emailNormalized)) {
        throw new RepositoryConflictError(`User email ${emailNormalized} already exists.`);
      }
      if (
        input.role === "super_admin" &&
        state.users.some((user) => user.role === "super_admin")
      ) {
        throw new RepositoryConflictError("Only one Super Admin account is allowed.");
      }
      const createdAt = input.createdAt ?? nextIso();
      const record: UserRecord = {
        id: input.id ?? nextId("user"),
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
        sessionVersion: input.sessionVersion ?? 1,
        managerId: input.managerId ?? null,
        authorizedClientIds: input.authorizedClientIds ?? [],
        ...(input.avatar ? { avatar: input.avatar } : {}),
        ...(input.title ? { title: input.title } : {}),
        createdAt,
        updatedAt: input.updatedAt ?? createdAt
      };
      ensureUniqueId(state.users, record.id, "User");
      state.users.push(record);
      return clone(record);
    },

    async listUsers() {
      return clone([...state.users].sort(byNameThenId));
    },

    async listUsersByIds(ids) {
      const selected = new Set(ids);
      return clone(
        state.users.filter((user) => selected.has(user.id)).sort(byNameThenId)
      );
    },

    async pageUsers(filters, pagination) {
      const visibleRoles = new Set(filters.visibleRoles);
      const search = filters.search?.trim().toLowerCase();
      const users = state.users
        .filter((user) => visibleRoles.has(user.role))
        .filter((user) => !filters.role || user.role === filters.role)
        .filter((user) => filters.active === undefined || user.active === filters.active)
        .filter(
          (user) =>
            !search ||
            user.name.toLowerCase().includes(search) ||
            user.email.toLowerCase().includes(search)
        )
        .sort(byNameThenId);
      return paginate(clone(users), pagination);
    },

    async countActiveUsersByRole(role) {
      return state.users.filter((user) => user.role === role && user.active).length;
    },

    async countUserResponsibilities(userId) {
      return {
        ownedActiveLeads: state.leads.filter(
          (lead) => lead.ownerId === userId && lead.stage !== "won" && lead.stage !== "lost"
        ).length,
        ownedActiveEstimates: state.estimateResponsibilities.filter(
          (estimate) =>
            estimate.ownerId === userId && estimate.status !== "client_approved"
        ).length,
        initiatedActiveProjects: state.projects.filter(
          (project) =>
            project.initiatingDesignerId === userId && project.status !== "completed"
        ).length,
        assignedActiveProjects: state.projects.filter(
          (project) =>
            project.assignedDesignerIds.includes(userId) && project.status !== "completed"
        ).length,
        managedActiveProjects: state.projects.filter(
          (project) => project.managerId === userId && project.status !== "completed"
        ).length,
        ownedActiveTasks: state.tasks.filter(
          (task) => task.ownerId === userId && task.status !== "completed"
        ).length,
        directReports: state.users.filter((user) => user.managerId === userId).length,
        linkedClientProjects: state.projects.filter((project) => project.clientId === userId)
          .length,
        adminInitiatorGrants: state.projectAccessGrants.filter(
          (grant) =>
            grant.userId === userId &&
            grant.module === "projects" &&
            grant.source === "admin_initiator" &&
            grant.active
        ).length
      };
    },

    async updateUser(userId, expectedVersion, change) {
      const index = state.users.findIndex((user) => user.id === userId);
      if (index < 0) {
        throw new RepositoryNotFoundError(`User ${userId} was not found.`);
      }
      const current = state.users[index]!;
      if (current.version !== expectedVersion) {
        throw new RepositoryConflictError(`User ${userId} changed concurrently.`);
      }
      if (
        change.role === "super_admin" &&
        current.role !== "super_admin" &&
        state.users.some((user) => user.role === "super_admin")
      ) {
        throw new RepositoryConflictError("Only one Super Admin account is allowed.");
      }
      const updated: UserRecord = {
        ...current,
        ...(change.role === undefined ? {} : { role: change.role }),
        ...(change.active === undefined ? {} : { active: change.active }),
        updatedAt: change.updatedAt,
        version: current.version + 1
      };
      state.users[index] = updated;
      return clone(updated);
    },

    async updateUserCredentials(
      userId,
      expectedVersion,
      expectedSessionVersion,
      change
    ) {
      const index = state.users.findIndex((user) => user.id === userId);
      if (index < 0) {
        throw new RepositoryNotFoundError(`User ${userId} was not found.`);
      }
      const current = state.users[index]!;
      if (
        current.version !== expectedVersion ||
        (current.sessionVersion ?? 1) !== expectedSessionVersion
      ) {
        throw new RepositoryConflictError(`User ${userId} changed concurrently.`);
      }
      const updated: UserRecord = {
        ...current,
        passwordHash: change.passwordHash,
        updatedAt: change.updatedAt,
        version: current.version + 1,
        sessionVersion: (current.sessionVersion ?? 1) + 1
      };
      state.users[index] = updated;
      return clone(updated);
    },

    async pageAllLeads(filters, pagination) {
      const search = filters.search?.trim().toLowerCase();
      const leads = state.leads
        .filter((lead) => !filters.stage || lead.stage === filters.stage)
        .filter((lead) => !search || [lead.clientName, lead.clientEmail, lead.clientMobile, lead.projectName]
          .some((value) => value.toLowerCase().includes(search)))
        .sort((left, right) => byDateThenId("updatedAt", right, left));
      return paginate(clone(leads), pagination);
    },

    async pageLeadsForOwner(ownerId, filters, pagination) {
      const search = filters.search?.trim().toLowerCase();
      const leads = state.leads
        .filter((lead) => lead.ownerId === ownerId)
        .filter((lead) => !filters.stage || lead.stage === filters.stage)
        .filter((lead) => !search || [lead.clientName, lead.clientEmail, lead.clientMobile, lead.projectName]
          .some((value) => value.toLowerCase().includes(search)))
        .sort((left, right) => byDateThenId("updatedAt", right, left));
      return paginate(clone(leads), pagination);
    },

    async findLeadById(id) {
      return copyOrNull(state.leads.find((lead) => lead.id === id));
    },

    async createLead(input) {
      ensureUniqueId(state.leads, input.id, "Lead");
      if (
        input.projectId !== null &&
        state.leads.some((lead) => lead.projectId === input.projectId)
      ) {
        throw new RepositoryConflictError("A lead already exists for this project.");
      }
      const record: LeadRecord = clone(input);
      state.leads.push(record);
      return clone(record);
    },

    async updateLead(id, change) {
      const lead = state.leads.find((candidate) => candidate.id === id);
      if (!lead) throw new RepositoryNotFoundError(`Lead ${id} was not found.`);
      Object.assign(lead, clone(change));
      return clone(lead);
    },

    async appendLeadActivity(input) {
      ensureUniqueId(state.leadActivities, input.id, "Lead activity");
      const record: LeadActivityRecord = clone(input);
      state.leadActivities.push(record);
      return clone(record);
    },

    async listLeadActivities(leadId) {
      return clone(state.leadActivities
        .filter((activity) => activity.leadId === leadId)
        .sort((left, right) => byDateThenId("occurredAt", right, left)));
    },

    async listProjectsForUserInModule(user, module) {
      if (!user.active) return [];
      if (user.role === "super_admin") {
        return clone([...state.projects].sort(byNameThenId));
      }
      const grantedProjectIds = new Set(
        state.projectAccessGrants
          .filter(
            (grant) =>
              grant.userId === user.id &&
              grant.module === module &&
              grantCanSupplyProjectModuleScope(user.role, grant)
          )
          .map((grant) => grant.projectId)
      );
      const projects = state.projects
        .filter(
          (project) =>
            legacyRelationshipAllows(user, project, module) ||
            grantedProjectIds.has(project.id)
        )
        .sort(byNameThenId);
      return clone(projects);
    },

    async listProjectsForDesignerIds(designerIds, limit) {
      const ids = new Set(designerIds);
      const projects = state.projects
        .filter(
          (project) =>
            (project.initiatingDesignerId !== null &&
              ids.has(project.initiatingDesignerId)) ||
            project.assignedDesignerIds.some((id) => ids.has(id))
        )
        .sort(byNameThenId);
      return clone(limit === undefined ? projects : projects.slice(0, limit));
    },

    async pageProjectsForUserInModule(user, module, pagination) {
      const projects = await implementation.listProjectsForUserInModule(user, module);
      return paginate(projects, pagination);
    },

    async pageAdminProjects(actor, pagination) {
      const visible = (await implementation.listProjectsForUserInModule(actor, "projects"))
        .sort(newestProjectFirst);
      const selected = visible.slice(
        pagination.offset,
        pagination.offset + pagination.limit
      );
      return {
        items: selected.map((project) =>
          adminProjectSummary(
            project,
            state.users,
            state.leads,
            state.estimateSummaries ?? [],
            actor
          )
        ),
        total: visible.length
      };
    },

    async findAdminProject(actor, projectId) {
      const project = (await implementation.listProjectsForUserInModule(
        actor,
        "projects"
      )).find((candidate) => candidate.id === projectId);
      return project
        ? clone(adminProjectSummary(
            project,
            state.users,
            state.leads,
            state.estimateSummaries ?? [],
            actor
          ))
        : null;
    },

    async pageActiveEstimatorOptions(search, pagination) {
      const normalized = search.trim().toLowerCase();
      const options: EstimatorOption[] = state.users
        .filter((user) => user.active && user.role === "estimator_sales")
        .filter(
          (user) =>
            !normalized ||
            user.name.toLowerCase().includes(normalized) ||
            user.email.toLowerCase().includes(normalized)
        )
        .sort(byNameThenId)
        .map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          title: user.title ?? null
        }));
      return paginate(options, pagination);
    },

    async findProjectById(id) {
      return copyOrNull(state.projects.find((project) => project.id === id));
    },

    async linkUnclaimedProjectsToClient(emailNormalized, clientId, updatedAt) {
      const normalized = normalizeEmail(emailNormalized);
      const linked: ProjectRecord[] = [];
      for (const project of state.projects) {
        if (
          project.clientId === null &&
          project.clientEmailNormalized === normalized
        ) {
          project.clientId = clientId;
          project.updatedAt = updatedAt;
          linked.push(clone(project));
        }
      }
      return linked;
    },

    async createProject(input) {
      ensureUniqueId(state.projects, input.id, "Project");
      const record: ProjectRecord = clone(input);
      state.projects.push(record);
      return clone(record);
    },

    async createFloor(input) {
      ensureUniqueId(state.floors, input.id, "Floor");
      const record: FloorRecord = clone(input);
      state.floors.push(record);
      return clone(record);
    },

    async createDesignStage(input) {
      ensureUniqueId(state.stages, input.id, "Design stage");
      const record: DesignStageRecord = clone(input);
      state.stages.push(record);
      return clone(record);
    },

    async createTask(input) {
      ensureUniqueId(state.tasks, input.id, "Task");
      const record: TaskRecord = clone(input);
      state.tasks.push(record);
      return clone(record);
    },

    async getProjectHierarchy(projectId) {
      const project = state.projects.find((candidate) => candidate.id === projectId);
      if (!project) return null;

      const hierarchy: ProjectHierarchy = {
        ...clone(project),
        floors: state.floors
          .filter((floor) => floor.projectId === projectId)
          .sort(byOrderThenId)
          .map((floor) => ({
            ...clone(floor),
            stages: state.stages
              .filter((candidate) => candidate.floorId === floor.id)
              .sort(byOrderThenId)
              .map((designStage) => ({
                ...clone(designStage),
                tasks: state.tasks
                  .filter((candidate) => candidate.stageId === designStage.id)
                  .sort(byOrderThenId)
                  .map(clone)
              }))
          }))
      };

      return clone(hierarchy);
    },

    async getOrganizationTree() {
      const managers: ManagerTreeNode[] = state.users
        .filter((user) => user.active && user.role === "design_manager")
        .sort(byNameThenId)
        .map((manager) => ({
          id: manager.id,
          name: manager.name,
          email: manager.email,
          ...(manager.avatar ? { avatar: manager.avatar } : {}),
          ...(manager.title ? { title: manager.title } : {}),
          designerTotal: state.users.filter(
            (user) =>
              user.active &&
              user.role === "designer" &&
              user.managerId === manager.id
          ).length,
          designers: state.users
            .filter(
              (user) =>
                user.active && user.role === "designer" && user.managerId === manager.id
            )
            .sort(byNameThenId)
            .map((designer) => ({
              id: designer.id,
              name: designer.name,
              email: designer.email,
              ...(designer.avatar ? { avatar: designer.avatar } : {}),
              ...(designer.title ? { title: designer.title } : {})
            }))
        }));

      return clone(managers);
    },

    async pageOrganizationManagers(pagination) {
      const page = paginate(await implementation.getOrganizationTree(), pagination);
      return {
        ...page,
        items: page.items.map((manager) => ({
          ...manager,
          designers: manager.designers.slice(0, 20)
        }))
      };
    },

    async pageActiveManagers(search, pagination) {
      const query = search.trim().toLowerCase();
      const managers = state.users
        .filter(
          (user) =>
            user.active &&
            user.role === "design_manager" &&
            (query.length === 0 ||
              user.name.toLowerCase().includes(query) ||
              user.email.toLowerCase().includes(query) ||
              user.emailNormalized.includes(query))
        )
        .sort(byNameThenId);
      return paginate(managers, pagination);
    },

    async pageActiveDesigners(pagination) {
      const designers = state.users
        .filter((user) => user.active && user.role === "designer")
        .sort(byNameThenId);
      return paginate(clone(designers), pagination);
    },

    async pageDesignersForManager(managerId, pagination) {
      const designers = state.users
        .filter(
          (user) =>
            user.active &&
            user.role === "designer" &&
            user.managerId === managerId
        )
        .sort(byNameThenId);
      return paginate(clone(designers), pagination);
    },

    async findTaskById(id) {
      return copyOrNull(state.tasks.find((task) => task.id === id));
    },

    async listTasks(filters) {
      return clone(
        state.tasks
          .filter((task) => matchesTaskFilters(task, filters))
          .sort(
            (left, right) =>
              left.projectId.localeCompare(right.projectId) ||
              left.floorId.localeCompare(right.floorId) ||
              left.stageId.localeCompare(right.stageId) ||
              byOrderThenId(left, right)
          )
      );
    },

    async listTasksForProjectIds(projectIds, limit) {
      const ids = new Set(projectIds);
      const tasks = state.tasks.filter((task) => ids.has(task.projectId)).sort(compareTasks);
      return clone(limit === undefined ? tasks : tasks.slice(0, limit));
    },

    async listTasksForOwnerIds(ownerIds, limit) {
      const ids = new Set(ownerIds);
      const tasks = state.tasks.filter((task) => ids.has(task.ownerId)).sort(compareTasks);
      return clone(limit === undefined ? tasks : tasks.slice(0, limit));
    },

    async listFloorsForProjectIds(projectIds) {
      const ids = new Set(projectIds);
      return clone(
        state.floors
          .filter((floor) => ids.has(floor.projectId))
          .sort(
            (left, right) =>
              left.projectId.localeCompare(right.projectId) ||
              byOrderThenId(left, right)
          )
      );
    },

    async listKpiTasksForPeriod(ownerIds, periodStartAt, periodEndAt, limit) {
      const tasks = state.tasks
          .filter(
            (task) =>
              ownerIds.includes(task.ownerId) &&
              overlapsPeriod(task, periodStartAt, periodEndAt)
          )
          .sort(compareTasks);
      return clone(limit === undefined ? tasks : tasks.slice(0, limit));
    },

    /*
     * The memory repository has no workflow-task store: ProjectWorkflowTask is
     * written through Mongoose models directly, so nothing creates one here.
     * Design-task KPI behaviour stays fully covered; the workflow contribution
     * is exercised against Mongo.
     */
    async listWorkflowKpiTasksForPeriod() {
      return [];
    },

    async pageKpiTasksForPeriod(
      ownerIds,
      periodStartAt,
      periodEndAt,
      pagination
    ) {
      const tasks = await implementation.listKpiTasksForPeriod(
        ownerIds,
        periodStartAt,
        periodEndAt
      );
      return paginate(tasks, pagination);
    },

    async updateTask(id, expectedVersion, change) {
      const index = state.tasks.findIndex((task) => task.id === id);
      if (index < 0) throw new RepositoryNotFoundError(`Task ${id} was not found.`);
      const current = state.tasks[index]!;
      if (current.version !== expectedVersion) {
        throw new RepositoryConflictError(
          `Task ${id} has version ${current.version}, expected ${expectedVersion}.`
        );
      }

      const status = change.status ?? current.status;
      const completedAt =
        status === "completed"
          ? (change.completedAt ?? current.completedAt)
          : null;
      if (status === "completed" && !completedAt) {
        throw new RepositoryConflictError("Completed tasks require completedAt.");
      }

      const updated = {
        ...current,
        ...clone(change),
        status,
        completedAt,
        version: current.version + 1,
        updatedAt: nextIso()
      } as TaskRecord;
      state.tasks[index] = updated;
      return clone(updated);
    },

    async appendTaskEvent(input) {
      const id = input.id ?? nextId("task-event");
      ensureUniqueId(state.taskEvents, id, "Task event");
      const record: TaskEventRecord = {
        ...clone(input),
        id,
        note: input.note ?? null,
        createdAt: input.createdAt ?? nextIso()
      };
      state.taskEvents.push(record);
      return clone(record);
    },

    async listTaskEvents(taskId) {
      return clone(
        state.taskEvents
          .filter((event) => event.taskId === taskId)
          .sort((left, right) => byDateThenId("occurredAt", left, right))
      );
    },

    async listRecentTaskEvents(taskIds, limit) {
      const scopedTaskIds = new Set(taskIds);
      return clone(
        state.taskEvents
          .filter((event) => scopedTaskIds.has(event.taskId))
          .sort((left, right) => byDateThenId("occurredAt", right, left))
          .slice(0, limit)
      );
    },

    async pageTaskEvents(taskId, pagination, sort = "asc") {
      const events = await implementation.listTaskEvents(taskId);
      return paginate(sort === "desc" ? events.reverse() : events, pagination);
    },

    async listKpiTaskEventsForPeriod(
      taskId,
      actorId,
      periodStartAt,
      periodEndAt
    ) {
      return clone(
        state.taskEvents
          .filter((event) =>
            matchesKpiEvent(
              event,
              taskId,
              actorId,
              periodStartAt,
              periodEndAt
            )
          )
          .sort((left, right) => byDateThenId("occurredAt", left, right))
      );
    },

    async pageKpiTaskEventsForPeriod(
      taskId,
      actorId,
      periodStartAt,
      periodEndAt,
      pagination
    ) {
      const events = await implementation.listKpiTaskEventsForPeriod(
        taskId,
        actorId,
        periodStartAt,
        periodEndAt
      );
      return paginate(events, pagination);
    },

    async listKpiTaskEventsForTasks(
      taskOwners,
      periodStartAt,
      periodEndAt,
      limit
    ) {
      const ownerByTaskId = new Map(taskOwners.map((task) => [task.id, task.ownerId]));
      const events = state.taskEvents
          .filter((event) =>
            ownerByTaskId.get(event.taskId) === event.actorId &&
            matchesKpiEvent(event, event.taskId, event.actorId, periodStartAt, periodEndAt)
          )
          .sort((left, right) => byDateThenId("occurredAt", left, right));
      return clone(limit === undefined ? events : events.slice(0, limit));
    },

    async createDesignVersion(input) {
      const id = input.id ?? nextId("design-version");
      ensureUniqueId(state.designVersions, id, "Design version");
      if (
        state.designVersions.some(
          (version) =>
            version.projectId === input.projectId &&
            version.floorId === input.floorId &&
            version.stageId === input.stageId &&
            version.taskId === input.taskId &&
            version.versionNumber === input.versionNumber
        )
      ) {
        throw new RepositoryConflictError(
          "Design version target and version number already exist."
        );
      }
      const createdAt = input.createdAt ?? nextIso();
      const record: DesignVersionRecord = {
        ...clone(input),
        id,
        createdAt,
        updatedAt: input.updatedAt ?? createdAt
      };
      state.designVersions.push(record);
      return clone(record);
    },

    async createNextDesignVersion(input) {
      const versionNumber =
        Math.max(
          0,
          ...state.designVersions
            .filter(
              (version) =>
                version.projectId === input.projectId &&
                version.floorId === input.floorId &&
                version.stageId === input.stageId &&
                version.taskId === input.taskId
            )
            .map((version) => version.versionNumber)
        ) + 1;
      return implementation.createDesignVersion({
        ...input,
        versionNumber
      });
    },

    async findDesignVersionById(id) {
      return copyOrNull(state.designVersions.find((version) => version.id === id));
    },

    async listDesignVersions(projectId, limit) {
      const versions = state.designVersions
          .filter((version) => version.projectId === projectId)
          .sort(
            (left, right) =>
              left.floorId.localeCompare(right.floorId) ||
              left.stageId.localeCompare(right.stageId) ||
              left.versionNumber - right.versionNumber ||
              left.id.localeCompare(right.id)
          );
      return clone(limit === undefined ? versions : versions.slice(0, limit));
    },

    async listDesignVersionsForTaskIds(taskIds, limit) {
      const ids = new Set(taskIds);
      const versions = state.designVersions
          .filter((version) => version.taskId !== null && ids.has(version.taskId))
          .sort((left, right) => left.taskId!.localeCompare(right.taskId!) || left.versionNumber - right.versionNumber || left.id.localeCompare(right.id));
      return clone(limit === undefined ? versions : versions.slice(0, limit));
    },

    async listLatestClientVisibleDesignVersions(projectIds) {
      const latest = new Map<string, DesignVersionRecord>();
      for (const version of state.designVersions) {
        if (!projectIds.includes(version.projectId) || version.approvalStatus !== "approved" || !version.clientVisible) continue;
        const current = latest.get(version.projectId);
        if (!current || compareLatestClientVisibleVersion(version, current) > 0) latest.set(version.projectId, version);
      }
      return clone([...latest.values()].sort((left, right) => left.projectId.localeCompare(right.projectId)));
    },

    async pageDesignVersions(filters, pagination) {
      const versions = (await implementation.listDesignVersions(filters.projectId))
        .filter(
          (version) =>
            (filters.approvalStatus === undefined ||
              version.approvalStatus === filters.approvalStatus) &&
            (filters.clientVisible === undefined ||
              version.clientVisible === filters.clientVisible)
        )
        .sort((left, right) => byDateThenId("uploadedAt", left, right));
      return paginate(versions, pagination);
    },

    async updateDesignVersion(id, change) {
      const index = state.designVersions.findIndex((version) => version.id === id);
      if (index < 0) {
        throw new RepositoryNotFoundError(`Design version ${id} was not found.`);
      }
      const updated: DesignVersionRecord = {
        ...state.designVersions[index]!,
        ...clone(change),
        updatedAt: nextIso()
      };
      state.designVersions[index] = updated;
      return clone(updated);
    },

    async enqueueExtractionJob(input) {
      ensureUniqueId(state.extractionJobs, input.id, "Design extraction job");
      if (
        state.extractionJobs.some(
          (job) => job.designVersionId === input.designVersionId
        )
      ) {
        throw new RepositoryConflictError(
          "Design version already has an extraction job."
        );
      }
      const createdAt = input.createdAt ?? input.queuedAt;
      const job: DesignExtractionJobRecord = {
        ...clone(input),
        nextAttemptAt:
          input.nextAttemptAt === null || input.nextAttemptAt === undefined
            ? (input.status === "queued" ? input.queuedAt : null)
            : input.nextAttemptAt,
        claimGeneration:
          Number.isSafeInteger(input.claimGeneration) && input.claimGeneration >= 0
            ? input.claimGeneration
            : 0,
        claimId: input.claimId ?? null,
        workerResultId: input.workerResultId ?? null,
        createdAt,
        updatedAt: input.updatedAt ?? createdAt
      };
      state.extractionJobs.push(job);
      return clone(job);
    },

    async claimExtractionJob(now, leaseExpiresAt) {
      const nowTime = new Date(now).getTime();
      const index = state.extractionJobs
        .map((job, candidateIndex) => ({ job, candidateIndex }))
        .filter(
          ({ job }) =>
            job.status === "queued" ||
            (job.status === "processing" &&
              job.leaseExpiresAt !== null &&
              new Date(job.leaseExpiresAt).getTime() <= nowTime)
        )
        .sort(
          (left, right) =>
            new Date(left.job.queuedAt).getTime() -
              new Date(right.job.queuedAt).getTime() ||
            left.job.id.localeCompare(right.job.id)
        )[0]?.candidateIndex;
      if (index === undefined) return null;

      const job = state.extractionJobs[index]!;
      const claimed: DesignExtractionJobRecord = {
        ...job,
        status: "processing",
        attemptCount: job.attemptCount + 1,
        startedAt: now,
        leaseExpiresAt,
        claimId: nextId("extraction-claim"),
        failureCode: null,
        failureMessage: null,
        updatedAt: now
      };
      state.extractionJobs[index] = claimed;
      return clone(claimed);
    },

    async findOldestClaimableExtractionJob(now) {
      const nowTime = new Date(now).getTime();
      return copyOrNull(
        state.extractionJobs
          .filter(
            (job) =>
              job.status === "queued" ||
              (job.status === "processing" &&
                job.leaseExpiresAt !== null &&
                new Date(job.leaseExpiresAt).getTime() <= nowTime)
          )
          .sort(
            (left, right) =>
              new Date(left.queuedAt).getTime() -
                new Date(right.queuedAt).getTime() ||
              left.id.localeCompare(right.id)
          )[0]
      );
    },

    async claimExtractionJobById(id, now, leaseExpiresAt) {
      const nowTime = new Date(now).getTime();
      const index = state.extractionJobs.findIndex(
        (job) =>
          job.id === id &&
          (job.status === "queued" ||
            (job.status === "processing" &&
              job.leaseExpiresAt !== null &&
              new Date(job.leaseExpiresAt).getTime() <= nowTime))
      );
      if (index < 0) return null;
      const job = state.extractionJobs[index]!;
      const claimed: DesignExtractionJobRecord = {
        ...job,
        status: "processing",
        attemptCount: job.attemptCount + 1,
        startedAt: now,
        leaseExpiresAt,
        claimId: nextId("extraction-claim"),
        failureCode: null,
        failureMessage: null,
        updatedAt: now
      };
      state.extractionJobs[index] = claimed;
      return clone(claimed);
    },

    async renewExtractionJobLease(id, claimId, now, leaseExpiresAt) {
      const index = state.extractionJobs.findIndex((job) => job.id === id);
      if (index < 0) {
        throw new RepositoryNotFoundError(`Design extraction job ${id} was not found.`);
      }
      ensureCurrentExtractionClaim(state.extractionJobs[index]!, claimId, now);
      const renewed = {
        ...state.extractionJobs[index]!,
        leaseExpiresAt,
        updatedAt: now
      };
      state.extractionJobs[index] = renewed;
      return clone(renewed);
    },

    async completeExtractionJob(id, claimId, completedAt) {
      const index = state.extractionJobs.findIndex((job) => job.id === id);
      if (index < 0) {
        throw new RepositoryNotFoundError(`Design extraction job ${id} was not found.`);
      }
      ensureCurrentExtractionClaim(state.extractionJobs[index]!, claimId, completedAt);
      const completed: DesignExtractionJobRecord = {
        ...state.extractionJobs[index]!,
        status: "designer_review",
        completedAt,
        leaseExpiresAt: null,
        claimId: null,
        failureCode: null,
        failureMessage: null,
        updatedAt: completedAt
      };
      state.extractionJobs[index] = completed;
      return clone(completed);
    },

    async failExtractionJob(id, claimId, failureCode, failureMessage, completedAt) {
      const index = state.extractionJobs.findIndex((job) => job.id === id);
      if (index < 0) {
        throw new RepositoryNotFoundError(`Design extraction job ${id} was not found.`);
      }
      ensureCurrentExtractionClaim(state.extractionJobs[index]!, claimId, completedAt);
      const failed: DesignExtractionJobRecord = {
        ...state.extractionJobs[index]!,
        status: "processing_failed",
        completedAt,
        leaseExpiresAt: null,
        claimId: null,
        failureCode,
        failureMessage,
        updatedAt: completedAt
      };
      state.extractionJobs[index] = failed;
      return clone(failed);
    },

    async findExtractionJobById(id) {
      return copyOrNull(state.extractionJobs.find((job) => job.id === id));
    },

    async findExtractionJobByVersionId(designVersionId) {
      return copyOrNull(
        state.extractionJobs.find((job) => job.designVersionId === designVersionId)
      );
    },

    async listSourcePages(designVersionId) {
      return clone(
        state.sourcePages
          .filter((page) => page.designVersionId === designVersionId)
          .sort((left, right) => left.pageNumber - right.pageNumber || left.id.localeCompare(right.id))
      );
    },

    async findSourcePageById(id) {
      return copyOrNull(state.sourcePages.find((page) => page.id === id));
    },

    async replaceExtractionDraft(input) {
      const jobIndex = state.extractionJobs.findIndex(
        (job) => job.id === input.jobId
      );
      if (jobIndex < 0) {
        throw new RepositoryNotFoundError(`Design extraction job ${input.jobId} was not found.`);
      }
      const job = state.extractionJobs[jobIndex]!;
      if (job.designVersionId !== input.designVersionId) {
        throw new RepositoryConflictError("Extraction job does not match the draft version.");
      }
      if (job.workerResultId === input.workerResultId) return;
      ensureCurrentExtractionClaim(job, input.claimId, input.processedAt);
      validateExtractionDraft(input);
      const existingSections = state.designSections.filter(
        (section) => section.designVersionId === input.designVersionId
      );
      const sectionIds = new Set(existingSections.map((section) => section.id));
      if (
        state.designSectionRevisions.some(
          (revision) =>
            sectionIds.has(revision.sectionId) && revision.reviewStatus !== "draft"
        )
      ) {
        throw new RepositoryConflictError(
          "Reviewed section revisions cannot be replaced by extraction output."
        );
      }
      state.sourcePages = state.sourcePages.filter(
        (page) => page.designVersionId !== input.designVersionId
      );
      state.designSections = state.designSections.filter(
        (section) => section.designVersionId !== input.designVersionId
      );
      state.designSectionRevisions = state.designSectionRevisions.filter(
        (revision) => !sectionIds.has(revision.sectionId)
      );

      for (const page of input.sourcePages) {
        ensureUniqueId(state.sourcePages, page.id, "Design source page");
        state.sourcePages.push(clone(page));
      }
      for (const { section, revision } of input.sections) {
        ensureUniqueId(state.designSections, section.id, "Design section");
        ensureUniqueId(state.designSectionRevisions, revision.id, "Design section revision");
        state.designSections.push(clone(section));
        state.designSectionRevisions.push(clone(revision));
      }
      if (jobIndex >= 0) {
        state.extractionJobs[jobIndex] = {
          ...state.extractionJobs[jobIndex]!,
          workerResultId: input.workerResultId,
          updatedAt: input.processedAt
        };
      }
    },

    async listDesignSections(designVersionId) {
      return clone(
        state.designSections
          .filter((section) => section.designVersionId === designVersionId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      );
    },

    async findDesignSectionById(id) {
      return copyOrNull(state.designSections.find((section) => section.id === id));
    },

    async listSectionRevisions(sectionId) {
      return clone(
        state.designSectionRevisions
          .filter((revision) => revision.sectionId === sectionId)
          .sort((left, right) => left.revisionNumber - right.revisionNumber)
      );
    },

    async findSectionRevisionById(id) {
      return copyOrNull(state.designSectionRevisions.find((revision) => revision.id === id));
    },

    async createManualSection(input) {
      ensureUniqueId(state.designSections, input.id, "Design section");
      const section: DesignSectionRecord = { ...clone(input), source: "manual" };
      state.designSections.push(section);
      return clone(section);
    },

    async updateDraftSection(id, change, expected) {
      const index = state.designSections.findIndex((section) => section.id === id);
      if (index < 0) throw new RepositoryNotFoundError(`Design section ${id} was not found.`);
      const latestRevision = state.designSectionRevisions
        .filter((revision) => revision.sectionId === id)
        .sort((left, right) => right.revisionNumber - left.revisionNumber)[0];
      const statuses = expected?.statuses ?? ["draft"];
      if (
        !latestRevision ||
        !statuses.includes(latestRevision.reviewStatus) ||
        (expected && latestRevision.revisionNumber !== expected.revisionNumber) ||
        (expected?.active !== undefined &&
          state.designSections[index]!.active !== expected.active)
      ) {
        throw new RepositoryConflictError("Only sections with a draft latest revision can be edited.");
      }
      const updated: DesignSectionRecord = {
        ...state.designSections[index]!,
        ...clone(change),
        updatedAt: nextIso()
      };
      state.designSections[index] = updated;
      return clone(updated);
    },

    async createSectionRevision(input) {
      ensureUniqueId(state.designSectionRevisions, input.id, "Design section revision");
      if (!state.designSections.some((section) => section.id === input.sectionId)) {
        throw new RepositoryNotFoundError(`Design section ${input.sectionId} was not found.`);
      }
      if (
        state.designSectionRevisions.some(
          (revision) =>
            revision.sectionId === input.sectionId &&
            revision.revisionNumber === input.revisionNumber
        )
      ) {
        throw new RepositoryConflictError("Design section revision number already exists.");
      }
      state.designSectionRevisions.push(clone(input));
      return clone(input);
    },

    async retryExtractionJob(id, queuedAt) {
      const index = state.extractionJobs.findIndex((job) => job.id === id);
      if (index < 0) throw new RepositoryNotFoundError(`Design extraction job ${id} was not found.`);
      if (state.extractionJobs[index]!.status !== "processing_failed") {
        throw new RepositoryConflictError("Only failed extraction jobs can be retried.");
      }
      const updated = {
        ...state.extractionJobs[index]!,
        status: "queued" as const,
        queuedAt,
        startedAt: null,
        completedAt: null,
        leaseExpiresAt: null,
        failureCode: null,
        failureMessage: null,
        claimId: null,
        updatedAt: queuedAt
      };
      state.extractionJobs[index] = updated;
      return clone(updated);
    },

    async recoverFailedExtractionJob(id, recoveredAt) {
      const index = state.extractionJobs.findIndex((job) => job.id === id);
      if (index < 0) throw new RepositoryNotFoundError(`Design extraction job ${id} was not found.`);
      if (state.extractionJobs[index]!.status !== "processing_failed") {
        throw new RepositoryConflictError("Only failed extraction jobs can use manual recovery.");
      }
      const updated = {
        ...state.extractionJobs[index]!,
        status: "designer_review" as const,
        completedAt: recoveredAt,
        failureCode: null,
        failureMessage: null,
        updatedAt: recoveredAt
      };
      state.extractionJobs[index] = updated;
      return clone(updated);
    },

    async submitDesignSectionDrafts(designVersionId, submittedAt) {
      const activeIds = new Set(
        state.designSections
          .filter((section) => section.designVersionId === designVersionId && section.active)
          .map((section) => section.id)
      );
      if (activeIds.size === 0) {
        throw new RepositoryConflictError("At least one active section is required.");
      }
      let count = 0;
      for (const sectionId of activeIds) {
        const latest = state.designSectionRevisions
          .filter((revision) => revision.sectionId === sectionId)
          .sort((left, right) => right.revisionNumber - left.revisionNumber)[0];
        if (!latest || latest.reviewStatus === "rejected") {
          throw new RepositoryConflictError("Every active section must have an eligible draft.");
        }
        if (latest.reviewStatus === "approved" || latest.reviewStatus === "submitted") continue;
        const index = state.designSectionRevisions.findIndex((item) => item.id === latest.id);
        state.designSectionRevisions[index] = {
          ...latest,
          reviewStatus: "submitted",
          submittedAt
        };
        count += 1;
      }
      if (count === 0) {
        throw new RepositoryConflictError("At least one draft section is required.");
      }
      const jobIndex = state.extractionJobs.findIndex((job) => job.designVersionId === designVersionId);
      if (jobIndex < 0) throw new RepositoryNotFoundError("Design extraction job was not found.");
      state.extractionJobs[jobIndex] = {
        ...state.extractionJobs[jobIndex]!,
        status: "submitted",
        updatedAt: submittedAt
      };
      return count;
    },

    async decideSubmittedSectionRevision(
      revisionId,
      expectedRevisionNumber,
      decision,
      reviewerId,
      comment,
      reviewedAt
    ) {
      const revisionIndex = state.designSectionRevisions.findIndex(
        (revision) => revision.id === revisionId
      );
      if (revisionIndex < 0) {
        throw new RepositoryNotFoundError("Design section revision was not found.");
      }
      const current = state.designSectionRevisions[revisionIndex]!;
      if (
        current.revisionNumber !== expectedRevisionNumber ||
        current.reviewStatus !== "submitted"
      ) {
        throw new RepositoryConflictError("The submitted section revision changed.");
      }
      state.designSectionRevisions[revisionIndex] = {
        ...current,
        reviewStatus: decision,
        reviewerId,
        reviewedAt,
        rejectionComment: decision === "rejected" ? comment : null
      };
      const section = state.designSections.find((item) => item.id === current.sectionId);
      if (!section) {
        throw new RepositoryNotFoundError("Design section was not found.");
      }
      const activeSectionIds = new Set(
        state.designSections
          .filter((item) => item.designVersionId === section.designVersionId && item.active)
          .map((item) => item.id)
      );
      const latestReviewable = [...activeSectionIds].map((sectionId) =>
        state.designSectionRevisions
          .filter((item) => item.sectionId === sectionId && item.reviewStatus !== "draft")
          .sort((left, right) => right.revisionNumber - left.revisionNumber)[0]
      );
      if (latestReviewable.some((item) => !item)) {
        throw new RepositoryConflictError("Every active section must have a submitted revision.");
      }
      const approved = latestReviewable.filter((item) => item!.reviewStatus === "approved").length;
      const rejected = latestReviewable.filter((item) => item!.reviewStatus === "rejected").length;
      const awaitingReview = latestReviewable.length - approved - rejected;
      const extractionStatus = rejected > 0
        ? "changes_requested" as const
        : approved === latestReviewable.length
          ? "approved" as const
          : "submitted" as const;
      const jobIndex = state.extractionJobs.findIndex(
        (job) => job.designVersionId === section.designVersionId
      );
      if (jobIndex < 0) {
        throw new RepositoryNotFoundError("Design extraction job was not found.");
      }
      state.extractionJobs[jobIndex] = {
        ...state.extractionJobs[jobIndex]!,
        status: extractionStatus,
        updatedAt: reviewedAt
      };
      return {
        revision: clone(state.designSectionRevisions[revisionIndex]!),
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
      const id = input.id ?? nextId("evaluation");
      ensureUniqueId(state.evaluations, id, "Evaluation");
      const record: EvaluationRecord = {
        ...clone(input),
        id,
        revisionOf: input.revisionOf ?? null,
        createdAt: input.createdAt ?? nextIso()
      };
      state.evaluations.push(record);
      return clone(record);
    },

    async listEvaluationsForSubject(subjectUserId) {
      return clone(
        state.evaluations
          .filter((evaluation) => evaluation.subjectUserId === subjectUserId)
          .sort((left, right) => byDateThenId("createdAt", right, left))
      );
    },

    async listEvaluationsForSubjectIds(subjectUserIds, limit) {
      const ids = new Set(subjectUserIds);
      const evaluations = state.evaluations
          .filter((evaluation) => ids.has(evaluation.subjectUserId))
          .sort((left, right) => byDateThenId("createdAt", right, left));
      return clone(limit === undefined ? evaluations : evaluations.slice(0, limit));
    },

    async pageEvaluationsForSubject(subjectUserId, pagination) {
      const evaluations = await implementation.listEvaluationsForSubject(
        subjectUserId
      );
      return paginate(evaluations, pagination);
    },

    async appendAuditEvent(input) {
      const id = input.id ?? nextId("audit-event");
      ensureUniqueId(state.auditEvents, id, "Audit event");
      const record: AuditEventRecord = {
        ...clone(input),
        id,
        reason: input.reason ?? null,
        createdAt: input.createdAt ?? nextIso()
      };
      state.auditEvents.push(record);
      return clone(record);
    },

    async listAuditEvents(filters) {
      return clone(
        state.auditEvents
          .filter((event) => matchesAuditFilters(event, filters))
          .sort((left, right) => filters.sort === "desc"
            ? byDateThenId("occurredAt", right, left)
            : byDateThenId("occurredAt", left, right))
      );
    },

    async pageAuditEvents(filters, pagination) {
      const events = await implementation.listAuditEvents(filters);
      return paginate(events, pagination);
    }
  };
  const repository = new Proxy(implementation, {
    get(target, property: keyof AppRepository, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (
        property === "runInTransaction" ||
        !mutationMethods.has(property) ||
        typeof value !== "function"
      ) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        if (transactionContext.getStore()) {
          throw new Error(
            "Use the transaction repository for writes inside a memory transaction."
          );
        }
        const releaseWrite = await acquireWriteLock();
        try {
          return await value.apply(target, args);
        } finally {
          releaseWrite();
        }
      };
    }
  }) as AppRepository;
  snapshotReaders.set(repository, () => ({
    state: clone(state),
    counters: new Map(counters),
    timestamp
  }));
  return repository;
}

function normalizeNewMemoryInvitation(
  input: UserInvitationRecord
): UserInvitationRecord {
  const record: UserInvitationRecord = {
    id: input.id,
    name: invitationNameSchema.parse(input.name),
    email: invitationEmailSchema.parse(input.email),
    emailNormalized: normalizeInvitationEmail(input.email),
    role: input.role,
    mobile: normalizeInvitationMobile(input.mobile),
    tokenHash: input.tokenHash,
    tokenGeneration: input.tokenGeneration,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    status: input.status,
    invitedById: input.invitedById,
    tokenIssuedById: input.tokenIssuedById,
    tokenIssuerVersion: input.tokenIssuerVersion,
    acceptedUserId: input.acceptedUserId,
    acceptedAt: input.acceptedAt,
    revokedById: input.revokedById,
    revokedAt: input.revokedAt,
    supersededByInvitationId: input.supersededByInvitationId,
    supersededAt: input.supersededAt,
    deliveryStatus: input.deliveryStatus,
    deliveryAttemptedAt: input.deliveryAttemptedAt,
    sentAt: input.sentAt,
    deliveryFailureCode: input.deliveryFailureCode,
    version: 1,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
  assertUserInvitationState(record);
  return record;
}

function pendingInvitationForTransition(
  invitations: UserInvitationRecord[],
  id: string,
  expectedVersion: number
) {
  const index = invitations.findIndex((invitation) => invitation.id === id);
  if (index < 0) {
    throw new RepositoryNotFoundError(`User invitation ${id} was not found.`);
  }
  const current = invitations[index]!;
  if (current.status !== "pending" || current.version !== expectedVersion) {
    throw new RepositoryConflictError(
      `User invitation ${id} cannot transition at version ${expectedVersion}.`
    );
  }
  return { index, current };
}

function tokenHashesEqual(left: string, right: string): boolean {
  if (
    !USER_INVITATION_TOKEN_HASH_PATTERN.test(left) ||
    !USER_INVITATION_TOKEN_HASH_PATTERN.test(right)
  ) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function assertInvitationCanInsert(seed: SeedData, record: UserInvitationRecord) {
  assertUserInvitationState(record);
  if (
    record.status === "pending" &&
    seed.userInvitations.some(
      (invitation) =>
        invitation.status === "pending" &&
        invitation.emailNormalized === record.emailNormalized
    )
  ) {
    throw new RepositoryConflictError(
      "Pending user invitation already exists for this email."
    );
  }
  if (
    record.tokenHash !== null &&
    seed.userInvitations.some(
      (invitation) =>
        invitation.tokenHash !== null &&
        tokenHashesEqual(invitation.tokenHash, record.tokenHash!)
    )
  ) {
    throw new RepositoryConflictError("Invitation token hash already exists.");
  }
  if (
    record.acceptedUserId !== null &&
    seed.userInvitations.some(
      (invitation) => invitation.acceptedUserId === record.acceptedUserId
    )
  ) {
    throw new RepositoryConflictError("Accepted invitation user already exists.");
  }
}

function assertUserInvitationState(invitation: UserInvitationRecord) {
  const conflict = (message: string): never => {
    throw new RepositoryConflictError(
      `User invitation ${invitation.id} ${message}`
    );
  };
  if (!invitation.id) conflict("requires an id.");
  try {
    if (invitation.name !== invitationNameSchema.parse(invitation.name)) {
      conflict("has a non-canonical name.");
    }
    if (invitation.email !== invitationEmailSchema.parse(invitation.email)) {
      conflict("has a non-canonical email.");
    }
    if (invitation.emailNormalized !== normalizeInvitationEmail(invitation.email)) {
      conflict("has a non-canonical normalized email.");
    }
    if (invitation.mobile !== normalizeInvitationMobile(invitation.mobile)) {
      conflict("has a non-canonical mobile.");
    }
  } catch (error) {
    if (error instanceof RepositoryConflictError) throw error;
    conflict("has invalid identity fields.");
  }
  if (!INVITABLE_ROLE_CODES.includes(invitation.role)) {
    conflict("has a non-invitable role.");
  }
  if (
    !Number.isInteger(invitation.tokenGeneration) ||
    invitation.tokenGeneration < 1 ||
    !Number.isInteger(invitation.tokenIssuerVersion) ||
    invitation.tokenIssuerVersion < 1 ||
    !Number.isInteger(invitation.version) ||
    invitation.version < 1
  ) {
    conflict("has invalid generation or version metadata.");
  }
  const issuedAt = Date.parse(invitation.issuedAt);
  const expiresAt = Date.parse(invitation.expiresAt);
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt - issuedAt !== USER_INVITATION_TTL_MS
  ) {
    conflict("must expire exactly 24 hours after issue.");
  }
  if (invitation.status === "pending") {
    if (
      invitation.tokenHash === null ||
      !USER_INVITATION_TOKEN_HASH_PATTERN.test(invitation.tokenHash)
    ) {
      conflict("requires a valid pending token hash.");
    }
    if (
      invitation.acceptedUserId !== null ||
      invitation.acceptedAt !== null ||
      invitation.revokedById !== null ||
      invitation.revokedAt !== null ||
      invitation.supersededByInvitationId !== null ||
      invitation.supersededAt !== null
    ) {
      conflict("has terminal metadata while pending.");
    }
  } else {
    if (invitation.tokenHash !== null) {
      conflict("must clear token material when terminal.");
    }
    const accepted =
      invitation.acceptedUserId !== null && invitation.acceptedAt !== null;
    const revoked = invitation.revokedById !== null && invitation.revokedAt !== null;
    const superseded =
      invitation.supersededByInvitationId !== null &&
      invitation.supersededAt !== null;
    if (
      (invitation.status === "accepted" &&
        (!accepted || revoked || superseded)) ||
      (invitation.status === "revoked" &&
        (!revoked || accepted || superseded)) ||
      (invitation.status === "superseded" &&
        (!superseded || accepted || revoked))
    ) {
      conflict("has invalid terminal metadata.");
    }
  }
  if (
    invitation.deliveryStatus === "queued" &&
    (invitation.deliveryAttemptedAt !== null ||
      invitation.sentAt !== null ||
      invitation.deliveryFailureCode !== null)
  ) {
    conflict("has telemetry while delivery is queued.");
  }
  if (
    invitation.deliveryStatus === "sent" &&
    (invitation.deliveryAttemptedAt === null ||
      invitation.sentAt === null ||
      invitation.deliveryFailureCode !== null)
  ) {
    conflict("has invalid sent delivery telemetry.");
  }
  if (
    invitation.deliveryStatus === "failed" &&
    (invitation.deliveryAttemptedAt === null ||
      invitation.sentAt !== null ||
      invitation.deliveryFailureCode === null ||
      !USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN.test(
        invitation.deliveryFailureCode
      ))
  ) {
    conflict("has invalid failed delivery telemetry.");
  }
}

function presentMemoryInvitation(
  invitation: UserInvitationRecord,
  seed: SeedData,
  now: string
): UserInvitationAdminRecord {
  const inviter = seed.users.find((user) => user.id === invitation.invitedById);
  if (!inviter) {
    throw new RepositoryConflictError(
      `User invitation ${invitation.id} has no inviter.`
    );
  }
  const issuer = seed.users.find(
    (user) => user.id === invitation.tokenIssuedById
  );
  const issuerMatches =
    issuer?.active === true &&
    issuer.role === "super_admin" &&
    issuer.version === invitation.tokenIssuerVersion;
  const tokenValidity = tokenValidityForInvitation({
    storedStatus: invitation.status,
    expiresAt: invitation.expiresAt,
    issuerMatches,
    now
  });
  const presentationStatus = presentationStatusForInvitation({
    storedStatus: invitation.status,
    expiresAt: invitation.expiresAt,
    deliveryStatus: invitation.deliveryStatus,
    now
  });
  const claimed = seed.users.some(
    (user) => user.emailNormalized === invitation.emailNormalized
  );
  const reserved = seed.projects.some(
    (project) =>
      project.clientId === null &&
      project.clientEmailNormalized === invitation.emailNormalized
  );
  const availableActions =
    invitation.status !== "pending"
      ? ([] as const)
      : claimed || reserved
        ? (["revoke"] as const)
        : (["resend", "revoke"] as const);
  return {
    id: invitation.id,
    name: invitation.name,
    email: invitation.email,
    role: invitation.role,
    mobile: invitation.mobile,
    tokenValidity,
    presentationStatus,
    currentLinkAvailable:
      tokenValidity === "current" && !claimed && !reserved,
    availableActions,
    invitedBy: {
      id: inviter.id,
      name: inviter.name,
      email: inviter.email,
      role: inviter.role
    },
    issuedAt: invitation.issuedAt,
    expiresAt: invitation.expiresAt,
    deliveryStatus: invitation.deliveryStatus,
    deliveryAttemptedAt: invitation.deliveryAttemptedAt,
    sentAt: invitation.sentAt,
    version: invitation.version,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt
  };
}

function compareLatestClientVisibleVersion(left: DesignVersionRecord, right: DesignVersionRecord) {
  return new Date(left.approvedAt ?? 0).getTime() - new Date(right.approvedAt ?? 0).getTime()
    || new Date(left.uploadedAt).getTime() - new Date(right.uploadedAt).getTime()
    || left.id.localeCompare(right.id);
}

function ensureCurrentExtractionClaim(
  job: DesignExtractionJobRecord,
  claimId: string,
  now: string
) {
  if (
    job.status !== "processing" ||
    job.claimId !== claimId ||
    job.leaseExpiresAt === null ||
    new Date(job.leaseExpiresAt).getTime() <= new Date(now).getTime()
  ) {
    throw new RepositoryConflictError("Extraction job claim is no longer current.");
  }
}

function validateExtractionDraft(input: ExtractionDraftReplacement) {
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

function copyOrNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : clone(value);
}

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function normalizeNewAccessRequest(
  input: NewAccessRequest,
  id: string
): AccessRequestRecord {
  if (!PROJECT_ID_PATTERN.test(input.projectId)) {
    throw new RepositoryConflictError("Access request project ID is invalid.");
  }
  if (!REQUESTABLE_PROJECT_MODULES.includes(input.module)) {
    throw new RepositoryConflictError("Access request module is invalid.");
  }
  return {
    id,
    requesterId: input.requesterId,
    projectId: input.projectId,
    module: input.module,
    reason: normalizeBoundedReason(input.reason, "Access request reason"),
    status: "pending",
    reviewerId: null,
    decisionReason: null,
    decisionFingerprint: null,
    approvedGrantId: null,
    reviewedAt: null,
    version: 1,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

function normalizeNewProjectAccessGrant(
  input: NewProjectAccessGrant,
  id: string
): ProjectAccessGrantRecord {
  if (!PROJECT_ID_PATTERN.test(input.projectId)) {
    throw new RepositoryConflictError("Project access grant project ID is invalid.");
  }
  if (!PROJECT_MODULES.includes(input.module)) {
    throw new RepositoryConflictError("Project access grant module is invalid.");
  }
  if (
    (input.source === "access_request" && input.accessRequestId === null) ||
    (input.source !== "access_request" && input.accessRequestId !== null)
  ) {
    throw new RepositoryConflictError(
      "accessRequestId is required only for access_request grants."
    );
  }
  return {
    id,
    projectId: input.projectId,
    userId: input.userId,
    module: input.module,
    source: input.source,
    accessRequestId: input.accessRequestId,
    grantedById: input.grantedById,
    active: true,
    grantedAt: input.grantedAt,
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    version: 1,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

function normalizeBoundedReason(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 1000) {
    throw new RepositoryConflictError(`${label} must contain 1 to 1000 characters.`);
  }
  return normalized;
}

function filteredAccessRequests(
  requests: AccessRequestRecord[],
  filters: { status?: AccessRequestRecord["status"]; module?: AccessRequestRecord["module"] }
) {
  return requests.filter(
    (request) =>
      (filters.status === undefined || request.status === filters.status) &&
      (filters.module === undefined || request.module === filters.module)
  );
}

function compareAccessRequestChronology(
  left: AccessRequestRecord,
  right: AccessRequestRecord
) {
  return byDateThenId("createdAt", right, left);
}

function assertAuthorizationUniqueness(seed: SeedData) {
  if (seed.users.filter(({ role }) => role === "super_admin").length > 1) {
    throw new RepositoryConflictError("Only one Super Admin account is allowed.");
  }
  assertUserInvitationUniqueness(seed.userInvitations);
  assertPasswordResetUniqueness(seed.passwordResetRequests ?? []);
  const requestIds = new Set<string>();
  const pendingTuples = new Set<string>();
  for (const request of seed.accessRequests) {
    if (requestIds.has(request.id)) {
      throw new RepositoryConflictError(`Access request ${request.id} already exists.`);
    }
    requestIds.add(request.id);
    if (request.status !== "pending") continue;
    const tuple = JSON.stringify([
      request.requesterId,
      request.projectId,
      request.module
    ]);
    if (pendingTuples.has(tuple)) {
      throw new RepositoryConflictError("Pending access request already exists.");
    }
    pendingTuples.add(tuple);
  }
  const grantIds = new Set<string>();
  const activeTuples = new Set<string>();
  const accessRequestIds = new Set<string>();
  for (const grant of seed.projectAccessGrants) {
    if (grantIds.has(grant.id)) {
      throw new RepositoryConflictError(`Project access grant ${grant.id} already exists.`);
    }
    grantIds.add(grant.id);
    if (grant.accessRequestId !== null) {
      if (accessRequestIds.has(grant.accessRequestId)) {
        throw new RepositoryConflictError("Access request grant already exists.");
      }
      accessRequestIds.add(grant.accessRequestId);
    }
    if (!grant.active) continue;
    const tuple = JSON.stringify([grant.userId, grant.projectId, grant.module]);
    if (activeTuples.has(tuple)) {
      throw new RepositoryConflictError("Active project access grant already exists.");
    }
    activeTuples.add(tuple);
  }
}

function assertPasswordResetUniqueness(
  resets: PasswordResetRequestRecord[]
) {
  const ids = new Set<string>();
  const pendingUsers = new Set<string>();
  const tokenHashes: string[] = [];
  for (const reset of resets) {
    assertPasswordResetState(reset);
    if (ids.has(reset.id)) {
      throw new RepositoryConflictError(`Password reset ${reset.id} already exists.`);
    }
    ids.add(reset.id);
    if (reset.status === "pending") {
      if (
        reset.tokenHash === null ||
        !PASSWORD_RESET_TOKEN_HASH_PATTERN.test(reset.tokenHash) ||
        pendingUsers.has(reset.userId)
      ) {
        throw new RepositoryConflictError(
          `Pending password reset already exists for User ${reset.userId}.`
        );
      }
      pendingUsers.add(reset.userId);
    } else if (reset.tokenHash !== null) {
      throw new RepositoryConflictError("Terminal password reset retained a token.");
    }
    if (reset.tokenHash !== null) {
      if (tokenHashes.some((hash) => tokenHashesEqual(hash, reset.tokenHash!))) {
        throw new RepositoryConflictError("Password reset token digest already exists.");
      }
      tokenHashes.push(reset.tokenHash);
    }
  }
}

function assertPasswordResetState(reset: PasswordResetRequestRecord) {
  if (
    !(["pending", "superseded", "completed"] as const).includes(reset.status) ||
    !(["queued", "sent", "failed"] as const).includes(reset.deliveryStatus) ||
    !Number.isSafeInteger(reset.userVersion) ||
    reset.userVersion < 1 ||
    !Number.isSafeInteger(reset.sessionVersion) ||
    reset.sessionVersion < 1 ||
    !Number.isSafeInteger(reset.tokenGeneration) ||
    reset.tokenGeneration < 1 ||
    !Number.isSafeInteger(reset.version) ||
    reset.version < 1 ||
    Date.parse(reset.expiresAt) - Date.parse(reset.issuedAt) !==
      PASSWORD_RESET_TTL_MS
  ) {
    throw new RepositoryConflictError("Password reset version or expiry is invalid.");
  }
  if (
    reset.status === "pending"
      ? reset.tokenHash === null ||
        !PASSWORD_RESET_TOKEN_HASH_PATTERN.test(reset.tokenHash) ||
        reset.supersededByResetId !== null ||
        reset.supersededAt !== null ||
        reset.completedAt !== null
      : reset.status === "superseded"
        ? reset.tokenHash !== null ||
          !reset.supersededByResetId ||
          reset.supersededAt === null ||
          reset.completedAt !== null
        : reset.tokenHash !== null ||
          reset.supersededByResetId !== null ||
          reset.supersededAt !== null ||
          reset.completedAt === null
  ) {
    throw new RepositoryConflictError("Password reset state is invalid.");
  }
  if (
    reset.deliveryStatus === "queued"
      ? reset.deliveryAttemptedAt !== null ||
        reset.sentAt !== null ||
        reset.deliveryFailureCode !== null
      : reset.deliveryStatus === "sent"
        ? reset.deliveryAttemptedAt === null ||
          reset.sentAt === null ||
          reset.deliveryFailureCode !== null
        : reset.deliveryAttemptedAt === null ||
          reset.sentAt !== null ||
          reset.deliveryFailureCode === null ||
          !PASSWORD_RESET_DELIVERY_FAILURE_CODE_PATTERN.test(
            reset.deliveryFailureCode
          )
  ) {
    throw new RepositoryConflictError("Password reset delivery state is invalid.");
  }
}

function assertUserInvitationUniqueness(
  invitations: UserInvitationRecord[]
) {
  const ids = new Set<string>();
  const pendingEmails = new Set<string>();
  const tokenHashes: string[] = [];
  const acceptedUserIds = new Set<string>();
  for (const invitation of invitations) {
    assertUserInvitationState(invitation);
    if (ids.has(invitation.id)) {
      throw new RepositoryConflictError(
        `User invitation ${invitation.id} already exists.`
      );
    }
    ids.add(invitation.id);
    if (invitation.status === "pending") {
      if (pendingEmails.has(invitation.emailNormalized)) {
        throw new RepositoryConflictError(
          "Pending user invitation already exists for this email."
        );
      }
      pendingEmails.add(invitation.emailNormalized);
    }
    if (invitation.tokenHash !== null) {
      if (tokenHashes.some((hash) => tokenHashesEqual(hash, invitation.tokenHash!))) {
        throw new RepositoryConflictError("Invitation token hash already exists.");
      }
      tokenHashes.push(invitation.tokenHash);
    }
    if (invitation.acceptedUserId !== null) {
      if (acceptedUserIds.has(invitation.acceptedUserId)) {
        throw new RepositoryConflictError(
          "Accepted invitation user already exists."
        );
      }
      acceptedUserIds.add(invitation.acceptedUserId);
    }
  }
}

function matchesTaskFilters(task: TaskRecord, filters: TaskFilters) {
  return (
    (filters.projectId === undefined || task.projectId === filters.projectId) &&
    (filters.floorId === undefined || task.floorId === filters.floorId) &&
    (filters.stageId === undefined || task.stageId === filters.stageId) &&
    (filters.ownerId === undefined || task.ownerId === filters.ownerId)
  );
}

function compareTasks(left: TaskRecord, right: TaskRecord) {
  return (
    left.projectId.localeCompare(right.projectId) ||
    left.floorId.localeCompare(right.floorId) ||
    left.stageId.localeCompare(right.stageId) ||
    byOrderThenId(left, right)
  );
}

function matchesAuditFilters(event: AuditEventRecord, filters: AuditFilters) {
  const hasVisibilityScope =
    filters.visibleActorIds !== undefined ||
    filters.visibleTaskIds !== undefined;
  const isVisible =
    !hasVisibilityScope ||
    filters.visibleActorIds?.includes(event.actorId) === true ||
    (event.entityType === "task" &&
      filters.visibleTaskIds?.includes(event.entityId) === true);
  return (
    isVisible &&
    (filters.actorId === undefined || event.actorId === filters.actorId) &&
    (filters.entityType === undefined || event.entityType === filters.entityType) &&
    (filters.entityId === undefined || event.entityId === filters.entityId)
    && (filters.entityIds === undefined || filters.entityIds.includes(event.entityId))
  );
}

function overlapsPeriod(
  task: TaskRecord,
  periodStartAt: string,
  periodEndAt: string
) {
  const periodStart = new Date(periodStartAt).getTime();
  const periodEnd = new Date(periodEndAt).getTime();
  const taskStart = new Date(task.plannedStartAt).getTime();
  const taskEnd = new Date(task.currentDeadlineAt).getTime();
  const completedAt = task.completedAt
    ? new Date(task.completedAt).getTime()
    : undefined;
  return (
    (taskStart <= periodEnd && taskEnd >= periodStart) ||
    (completedAt !== undefined &&
      completedAt >= periodStart &&
      completedAt <= periodEnd)
  );
}

function matchesKpiEvent(
  event: TaskEventRecord,
  taskId: string,
  actorId: string,
  periodStartAt: string,
  periodEndAt: string
) {
  return (
    event.taskId === taskId &&
    event.actorId === actorId &&
    event.type !== "deadline_revised" &&
    new Date(event.occurredAt).getTime() >=
      new Date(periodStartAt).getTime() &&
    new Date(event.occurredAt).getTime() <= new Date(periodEndAt).getTime()
  );
}

function paginate<T>(
  items: T[],
  pagination: { limit: number; offset: number }
) {
  return {
    items: clone(
      items.slice(pagination.offset, pagination.offset + pagination.limit)
    ),
    total: items.length
  };
}

function latestTimestamp(seed: SeedData): number {
  const timestamps = [
    ...seed.users.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.userInvitations.flatMap((record) => [
      record.issuedAt,
      record.expiresAt,
      record.acceptedAt,
      record.revokedAt,
      record.supersededAt,
      record.deliveryAttemptedAt,
      record.sentAt,
      record.createdAt,
      record.updatedAt
    ]),
    ...(seed.passwordResetRequests ?? []).flatMap((record) => [
      record.issuedAt,
      record.expiresAt,
      record.supersededAt,
      record.completedAt,
      record.deliveryAttemptedAt,
      record.sentAt,
      record.createdAt,
      record.updatedAt
    ]),
    ...seed.projects.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.floors.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.stages.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.tasks.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.taskEvents.map((record) => record.createdAt),
    ...seed.designVersions.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.extractionJobs.flatMap((record) => [
      record.queuedAt,
      record.startedAt,
      record.completedAt,
      record.leaseExpiresAt,
      record.createdAt,
      record.updatedAt
    ]),
    ...seed.sourcePages.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.designSections.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.designSectionRevisions.map((record) => record.createdAt),
    ...seed.evaluations.map((record) => record.createdAt),
    ...seed.auditEvents.map((record) => record.createdAt),
    ...seed.accessRequests.flatMap((record) => [record.createdAt, record.updatedAt]),
    ...seed.projectAccessGrants.flatMap((record) => [record.createdAt, record.updatedAt])
  ]
    .filter((value): value is string => value !== null && value !== undefined)
    .map((value) => new Date(value).getTime());

  return Math.max(0, ...timestamps);
}

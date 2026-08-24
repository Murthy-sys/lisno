import type { Role, TaskStatus } from "../contracts/domain.js";
import type { AccountKind } from "../domain/demo-identities.js";
import type { EstimateClientReviewSummary } from "../domain/estimate-client-review.js";
import type {
  InvitableRole,
  UserInvitationAction,
  UserInvitationDeliveryStatus,
  UserInvitationPresentationStatus,
  UserInvitationStoredStatus,
  UserInvitationTokenValidity
} from "../domain/user-invitations.js";
import type {
  ProjectModule,
  RequestableProjectModule
} from "../domain/authorization.js";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed";

export type LeadStage =
  | "new_lead"
  | "contacted"
  | "site_visit"
  | "design_meeting"
  | "estimate_in_progress"
  | "estimate_sent"
  | "negotiation"
  | "won"
  | "lost";

export type LeadActivityType = "call" | "whatsapp" | "meeting" | "email" | "note";

export type DesignStageType =
  | "internal_kickoff"
  | "client_kickoff"
  | "key_collection"
  | "site_measurement"
  | "concept_mood_board"
  | "floor_plan"
  | "client_revisions"
  | "final_approval"
  | "design_handoff";

export type TaskEventType =
  | "status_changed"
  | "progress_changed"
  | "note_added"
  | "deadline_revised";

export type ApprovalStatus = "draft" | "in_review" | "approved" | "rejected";

export type ExtractionStatus =
  | "queued"
  | "processing"
  | "designer_review"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "processing_failed";

export type SectionReviewStatus = "draft" | "submitted" | "approved" | "rejected";

export type JsonObject = Record<string, unknown>;

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  emailNormalized: string;
  mobile: string | null;
  address: string | null;
  passwordHash: string;
  role: Role;
  active: boolean;
  accountKind: AccountKind;
  version: number;
  managerId: string | null;
  authorizedClientIds: string[];
  avatar?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserInvitationRecord {
  id: string;
  name: string;
  email: string;
  emailNormalized: string;
  role: InvitableRole;
  mobile: string;
  tokenHash: string | null;
  tokenGeneration: number;
  issuedAt: string;
  expiresAt: string;
  status: UserInvitationStoredStatus;
  invitedById: string;
  tokenIssuedById: string;
  tokenIssuerVersion: number;
  acceptedUserId: string | null;
  acceptedAt: string | null;
  revokedById: string | null;
  revokedAt: string | null;
  supersededByInvitationId: string | null;
  supersededAt: string | null;
  deliveryStatus: UserInvitationDeliveryStatus;
  deliveryAttemptedAt: string | null;
  sentAt: string | null;
  deliveryFailureCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserInvitationFilters {
  search?: string;
  role?: InvitableRole;
  status?: UserInvitationPresentationStatus;
  deliveryStatus?: UserInvitationDeliveryStatus;
}

export interface UserInvitationAdminRecord {
  id: string;
  name: string;
  email: string;
  role: InvitableRole;
  mobile: string;
  tokenValidity: UserInvitationTokenValidity;
  presentationStatus: UserInvitationPresentationStatus;
  currentLinkAvailable: boolean;
  availableActions: readonly UserInvitationAction[];
  invitedBy: Pick<UserRecord, "id" | "name" | "email" | "role">;
  issuedAt: string;
  expiresAt: string;
  deliveryStatus: UserInvitationDeliveryStatus;
  deliveryAttemptedAt: string | null;
  sentAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type NewUserInvitation = UserInvitationRecord;

export interface SupersedeUserInvitationChange {
  supersededByInvitationId: string;
  supersededAt: string;
  updatedAt: string;
}

export interface ResendUserInvitationChange {
  tokenHash: string;
  tokenGeneration: number;
  issuedAt: string;
  expiresAt: string;
  tokenIssuedById: string;
  tokenIssuerVersion: number;
  updatedAt: string;
}

export interface RevokeUserInvitationChange {
  revokedById: string;
  revokedAt: string;
  updatedAt: string;
}

export interface AcceptUserInvitationChange {
  acceptedUserId: string;
  acceptedAt: string;
  updatedAt: string;
}

export type InvitationDeliveryChange =
  | {
      status: "sent";
      attemptedAt: string;
      sentAt: string;
      updatedAt: string;
    }
  | {
      status: "failed";
      attemptedAt: string;
      failureCode: string;
      updatedAt: string;
    };

export interface UserDirectoryFilters {
  search?: string;
  role?: Role;
  active?: boolean;
}

export interface UserResponsibilityCounts {
  ownedActiveLeads: number;
  ownedActiveEstimates: number;
  initiatedActiveProjects: number;
  assignedActiveProjects: number;
  managedActiveProjects: number;
  ownedActiveTasks: number;
  directReports: number;
  linkedClientProjects: number;
  adminInitiatorGrants: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  clientEmailNormalized: string;
  clientMobile: string;
  clientAddress: string;
  initiatingDesignerId: string | null;
  assignedEstimatorId: string | null;
  assignedDesignerIds: string[];
  managerId: string | null;
  status: ProjectStatus;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadRecord {
  id: string;
  projectId: string | null;
  ownerId: string;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location: string;
  propertyType: string;
  budgetMin: number | null;
  budgetMax: number | null;
  source: string;
  stage: LeadStage;
  nextAction: string;
  nextActionAt: string;
  builder: string | null;
  areaSqft: number | null;
  targetHandoverAt: string | null;
  notes: string | null;
  latestActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivityRecord {
  id: string;
  leadId: string;
  actorId: string;
  type: LeadActivityType;
  note: string;
  occurredAt: string;
  createdAt: string;
}

export type EstimateResponsibilityStatus =
  | "draft"
  | "pending_manager_assignment"
  | "pending_designer_approval"
  | "designer_changes_requested"
  | "ready_for_client"
  | "sent_to_client"
  | "client_changes_requested"
  | "client_approved";

export interface EstimateResponsibilityRecord {
  id: string;
  ownerId: string;
  status: EstimateResponsibilityStatus;
}

export interface LeadFilters {
  search?: string;
  stage?: LeadStage;
}

export type NewLead = LeadRecord;
export type LeadChange = Partial<
  Omit<LeadRecord, "id" | "projectId" | "ownerId" | "createdAt">
>;

export interface EstimatorOption {
  id: string;
  name: string;
  email: string;
  title: string | null;
}

export interface EstimateSummaryRecord {
  id: string;
  leadId: string;
  projectId: string | null;
  status: string;
  total: number;
  clientReview: EstimateClientReviewSummary | null;
  assignedAdminId: string | null;
}

export interface AdminProjectEstimateSummary {
  id: string;
  status: string;
  total: number;
  clientReview: EstimateClientReviewSummary | null;
  hasPendingClientResponseTask: boolean;
}

export interface AdminProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  location: string;
  client: { name: string; email: string; mobile: string };
  propertyType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  estimator: { id: string; name: string; email: string } | null;
  lead: {
    id: string;
    stage: LeadStage;
    nextAction: string;
    nextActionAt: string;
  } | null;
  estimate: AdminProjectEstimateSummary | null;
  createdAt: string;
}
export type NewLeadActivity = LeadActivityRecord;

export interface FloorRecord {
  id: string;
  projectId: string;
  name: string;
  number: string;
  order: number;
  progress: number;
  plannedStartAt: string;
  plannedEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DesignStageRecord {
  id: string;
  projectId: string;
  floorId: string;
  name: string;
  type: DesignStageType;
  order: number;
  dependencyStageIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface TaskRecordBase {
  id: string;
  projectId: string;
  floorId: string;
  stageId: string;
  title: string;
  description: string;
  order: number;
  ownerId: string;
  plannedStartAt: string;
  originalDeadlineAt: string;
  currentDeadlineAt: string;
  plannedEffort: number | null;
  progress: number;
  dependencyTaskIds: string[];
  latestUpdateAt: string | null;
  wasYellow?: boolean;
  approvalVersion?: number | null;
  approvalStatus?: "approved" | "rejected" | "unapproved" | null;
  revisionCount?: number | null;
  hasReview?: boolean;
  updateEvents?: Array<{ occurredAt: string }>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type TaskRecord =
  | (TaskRecordBase & { status: "completed"; completedAt: string })
  | (TaskRecordBase & {
      status: Exclude<TaskStatus, "completed">;
      completedAt: null;
    });

export interface TaskChange {
  status?: TaskStatus;
  progress?: number;
  wasYellow?: boolean;
  currentDeadlineAt?: string;
  completedAt?: string | null;
  latestUpdateAt?: string | null;
  description?: string;
}

export interface TaskEventRecord {
  id: string;
  taskId: string;
  actorId: string;
  type: TaskEventType;
  occurredAt: string;
  from: JsonObject;
  to: JsonObject;
  note: string | null;
  createdAt: string;
}

export type NewTaskEvent = Omit<TaskEventRecord, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export interface DesignVersionRecord {
  id: string;
  projectId: string;
  floorId: string;
  stageId: string;
  taskId: string | null;
  versionNumber: number;
  originalFilename: string;
  storedFileReference: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string;
  uploadedAt: string;
  approvalStatus: ApprovalStatus;
  reviewerId: string | null;
  approvedAt: string | null;
  clientVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NewDesignVersion = Omit<
  DesignVersionRecord,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type NewDesignVersionWithAllocatedNumber = Omit<
  NewDesignVersion,
  "versionNumber"
>;

export interface DesignVersionChange {
  approvalStatus?: ApprovalStatus;
  reviewerId?: string | null;
  approvedAt?: string | null;
  clientVisible?: boolean;
}

export interface DesignVersionFilters {
  projectId: string;
  approvalStatus?: ApprovalStatus;
  clientVisible?: boolean;
}

export interface DesignExtractionJobRecord {
  id: string;
  designVersionId: string;
  status: ExtractionStatus;
  attemptCount: number;
  queuedAt: string;
  nextAttemptAt: string | null;
  claimGeneration: number;
  startedAt: string | null;
  completedAt: string | null;
  leaseExpiresAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  claimId: string | null;
  workerResultId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewDesignExtractionJob = Omit<
  DesignExtractionJobRecord,
  "nextAttemptAt" | "claimId" | "workerResultId" | "createdAt" | "updatedAt"
> & {
  nextAttemptAt?: string | null;
  claimId?: string | null;
  workerResultId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export interface DesignSourcePageRecord {
  id: string;
  designVersionId: string;
  pageNumber: number;
  renderedFileReference: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

export interface DesignSectionRecord {
  id: string;
  designVersionId: string;
  sourcePageId: string;
  label: string;
  active: boolean;
  source: "ocr" | "manual";
  ocrConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesignSectionRevisionRecord {
  id: string;
  sectionId: string;
  revisionNumber: number;
  sourcePageId: string;
  crop: CropRect;
  croppedFileReference: string;
  label: string;
  reviewStatus: SectionReviewStatus;
  submittedAt: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  rejectionComment: string | null;
  createdAt: string;
}

export interface DesignSectionReviewProgress {
  approved: number;
  rejected: number;
  awaitingReview: number;
  total: number;
}

export interface SectionDecisionResult {
  revision: DesignSectionRevisionRecord;
  extractionStatus: Extract<ExtractionStatus, "submitted" | "changes_requested" | "approved">;
  progress: DesignSectionReviewProgress;
}

export interface ExtractionDraftReplacement {
  jobId: string;
  claimId: string;
  processedAt: string;
  designVersionId: string;
  workerResultId: string;
  sourcePages: DesignSourcePageRecord[];
  sections: Array<{
    section: DesignSectionRecord;
    revision: DesignSectionRevisionRecord;
  }>;
}

export interface EvaluationRecord {
  id: string;
  subjectUserId: string;
  evaluatorUserId: string;
  evaluatorRole: Extract<Role, "super_admin" | "design_manager" | "design_head">;
  periodStartAt: string;
  periodEndAt: string;
  score: number;
  comments: string;
  revisionOf: string | null;
  createdAt: string;
}

export type NewEvaluation = Omit<EvaluationRecord, "id" | "revisionOf" | "createdAt"> & {
  id?: string;
  revisionOf?: string | null;
  createdAt?: string;
};

export interface AuditEventRecord {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  oldValues: JsonObject;
  newValues: JsonObject;
  reason: string | null;
  createdAt: string;
}

export type NewAuditEvent = Omit<AuditEventRecord, "id" | "reason" | "createdAt"> & {
  id?: string;
  reason?: string | null;
  createdAt?: string;
};

export interface ManagerTreeDesigner {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  title?: string;
}

export interface ManagerTreeNode {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  title?: string;
  designerTotal: number;
  designers: ManagerTreeDesigner[];
}

export interface ProjectHierarchy extends ProjectRecord {
  floors: Array<
    FloorRecord & {
      stages: Array<
        DesignStageRecord & {
          tasks: TaskRecord[];
        }
      >;
    }
  >;
}

export interface TaskFilters {
  projectId?: string;
  floorId?: string;
  stageId?: string;
  ownerId?: string;
}

export interface AuditFilters {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  entityIds?: string[];
  visibleActorIds?: string[];
  visibleTaskIds?: string[];
  sort?: TaskEventSort;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export type TaskEventSort = "asc" | "desc";

export interface PageResult<T> {
  items: T[];
  total: number;
}

export type AccessRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface AccessRequestRecord {
  id: string;
  requesterId: string;
  projectId: string;
  module: RequestableProjectModule;
  reason: string;
  status: AccessRequestStatus;
  reviewerId: string | null;
  decisionReason: string | null;
  decisionFingerprint: string | null;
  approvedGrantId: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAccessGrantRecord {
  id: string;
  projectId: string;
  userId: string;
  module: ProjectModule;
  source: "access_request" | "direct_assignment" | "admin_initiator";
  accessRequestId: string | null;
  grantedById: string;
  active: boolean;
  grantedAt: string;
  revokedAt: string | null;
  revokedById: string | null;
  revocationReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type NewAccessRequest = Pick<
  AccessRequestRecord,
  "requesterId" | "projectId" | "module" | "reason"
> & { id?: string; createdAt: string; updatedAt: string };

export type AccessRequestTransition =
  | {
      status: "approved";
      reviewerId: string;
      decisionReason: null;
      decisionFingerprint: string;
      approvedGrantId: string;
      reviewedAt: string;
      updatedAt: string;
    }
  | {
      status: "rejected";
      reviewerId: string;
      decisionReason: string;
      decisionFingerprint: string;
      approvedGrantId: null;
      reviewedAt: string;
      updatedAt: string;
    }
  | {
      status: "cancelled";
      reviewerId: null;
      decisionReason: null;
      decisionFingerprint: null;
      approvedGrantId: null;
      reviewedAt: null;
      updatedAt: string;
    };

export interface AccessRequestFilters {
  status?: AccessRequestStatus;
  module?: RequestableProjectModule;
}

export type AccessRequestReviewScope =
  | { kind: "global" }
  | { kind: "admin_initiator"; adminId: string };

export type NewProjectAccessGrant = Pick<
  ProjectAccessGrantRecord,
  | "projectId"
  | "userId"
  | "module"
  | "source"
  | "accessRequestId"
  | "grantedById"
> & { id?: string; grantedAt: string; createdAt: string; updatedAt: string };

export interface GrantRevocation {
  revokedAt: string;
  revokedById: string;
  revocationReason: string;
  updatedAt: string;
}

export interface SeedData {
  users: UserRecord[];
  userInvitations: UserInvitationRecord[];
  leads: LeadRecord[];
  estimateResponsibilities: EstimateResponsibilityRecord[];
  estimateSummaries?: EstimateSummaryRecord[];
  leadActivities: LeadActivityRecord[];
  projects: ProjectRecord[];
  floors: FloorRecord[];
  stages: DesignStageRecord[];
  tasks: TaskRecord[];
  taskEvents: TaskEventRecord[];
  designVersions: DesignVersionRecord[];
  extractionJobs: DesignExtractionJobRecord[];
  sourcePages: DesignSourcePageRecord[];
  designSections: DesignSectionRecord[];
  designSectionRevisions: DesignSectionRevisionRecord[];
  evaluations: EvaluationRecord[];
  auditEvents: AuditEventRecord[];
  accessRequests: AccessRequestRecord[];
  projectAccessGrants: ProjectAccessGrantRecord[];
}

export type NewProject = ProjectRecord;
export type NewUser = Pick<UserRecord, "name" | "email" | "passwordHash" | "role"> &
  Partial<
    Pick<
      UserRecord,
      | "id"
      | "emailNormalized"
      | "mobile"
      | "address"
      | "active"
      | "accountKind"
      | "managerId"
      | "authorizedClientIds"
      | "avatar"
      | "title"
      | "createdAt"
      | "updatedAt"
    >
  >;
export type NewFloor = FloorRecord;
export type NewDesignStage = DesignStageRecord;
export type NewTask = TaskRecord;

export interface AppRepository {
  runInTransaction<T>(
    operation: (repository: AppRepository) => Promise<T>
  ): Promise<T>;
  coordinateClientEmail(emailNormalized: string): Promise<void>;
  findUserInvitationById(id: string): Promise<UserInvitationRecord | null>;
  findPendingUserInvitationByEmail(
    emailNormalized: string
  ): Promise<UserInvitationRecord | null>;
  findLatestUserInvitationIssuedAtByEmail(
    emailNormalized: string
  ): Promise<string | null>;
  findPendingUserInvitationByTokenHash(
    tokenHash: string
  ): Promise<UserInvitationRecord | null>;
  pageUserInvitations(
    filters: UserInvitationFilters,
    pagination: PaginationInput,
    now: string
  ): Promise<PageResult<UserInvitationAdminRecord>>;
  hasUnclaimedClientProjectByEmail(emailNormalized: string): Promise<boolean>;
  createUserInvitation(input: NewUserInvitation): Promise<UserInvitationRecord>;
  supersedeUserInvitation(
    id: string,
    expectedVersion: number,
    change: SupersedeUserInvitationChange
  ): Promise<UserInvitationRecord>;
  resendUserInvitation(
    id: string,
    expectedVersion: number,
    change: ResendUserInvitationChange
  ): Promise<UserInvitationRecord>;
  revokeUserInvitation(
    id: string,
    expectedVersion: number,
    change: RevokeUserInvitationChange
  ): Promise<UserInvitationRecord>;
  acceptUserInvitation(
    id: string,
    expectedVersion: number,
    expectedGeneration: number,
    expectedTokenHash: string,
    change: AcceptUserInvitationChange
  ): Promise<UserInvitationRecord>;
  updateUserInvitationDelivery(
    id: string,
    tokenGeneration: number,
    change: InvitationDeliveryChange
  ): Promise<UserInvitationRecord | null>;
  coordinateAuthorizationMutation(): Promise<void>;
  findAccessRequestById(id: string): Promise<AccessRequestRecord | null>;
  findPendingAccessRequest(
    requesterId: string,
    projectId: string,
    module: RequestableProjectModule
  ): Promise<AccessRequestRecord | null>;
  createAccessRequest(input: NewAccessRequest): Promise<AccessRequestRecord>;
  findOrCreatePendingAccessRequest(
    input: NewAccessRequest
  ): Promise<{ record: AccessRequestRecord; created: boolean }>;
  transitionAccessRequest(
    id: string,
    expectedVersion: number,
    change: AccessRequestTransition
  ): Promise<AccessRequestRecord>;
  pageAccessRequestsForRequester(
    requesterId: string,
    filters: AccessRequestFilters,
    pagination: PaginationInput
  ): Promise<PageResult<AccessRequestRecord>>;
  pageAccessRequestsForReview(
    scope: AccessRequestReviewScope,
    filters: AccessRequestFilters,
    pagination: PaginationInput
  ): Promise<PageResult<AccessRequestRecord>>;
  findProjectAccessGrantById(id: string): Promise<ProjectAccessGrantRecord | null>;
  findProjectAccessGrantByAccessRequestId(
    accessRequestId: string
  ): Promise<ProjectAccessGrantRecord | null>;
  findActiveProjectAccessGrant(
    userId: string,
    projectId: string,
    module: ProjectModule
  ): Promise<ProjectAccessGrantRecord | null>;
  listActiveProjectAccessGrants(
    userId: string,
    module: ProjectModule
  ): Promise<ProjectAccessGrantRecord[]>;
  createProjectAccessGrant(
    input: NewProjectAccessGrant
  ): Promise<ProjectAccessGrantRecord>;
  findOrCreateActiveProjectAccessGrant(
    input: NewProjectAccessGrant
  ): Promise<{ record: ProjectAccessGrantRecord; created: boolean }>;
  revokeProjectAccessGrant(
    id: string,
    expectedVersion: number,
    change: GrantRevocation
  ): Promise<ProjectAccessGrantRecord>;
  revokeActiveProjectAccessGrantsForUser(
    userId: string,
    change: GrantRevocation
  ): Promise<ProjectAccessGrantRecord[]>;
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  createUser(input: NewUser): Promise<UserRecord>;
  listUsers(): Promise<UserRecord[]>;
  listUsersByIds(ids: string[]): Promise<UserRecord[]>;
  pageUsers(
    filters: UserDirectoryFilters & { visibleRoles: readonly Role[] },
    pagination: PaginationInput
  ): Promise<PageResult<UserRecord>>;
  countActiveUsersByRole(role: Role): Promise<number>;
  countUserResponsibilities(userId: string): Promise<UserResponsibilityCounts>;
  updateUser(
    userId: string,
    expectedVersion: number,
    change: { role?: Role; active?: boolean; updatedAt: string }
  ): Promise<UserRecord>;
  pageAllLeads(filters: LeadFilters, pagination: PaginationInput): Promise<PageResult<LeadRecord>>;
  pageLeadsForOwner(ownerId: string, filters: LeadFilters, pagination: PaginationInput): Promise<PageResult<LeadRecord>>;
  findLeadById(id: string): Promise<LeadRecord | null>;
  createLead(input: NewLead): Promise<LeadRecord>;
  updateLead(id: string, change: LeadChange): Promise<LeadRecord>;
  appendLeadActivity(input: NewLeadActivity): Promise<LeadActivityRecord>;
  listLeadActivities(leadId: string): Promise<LeadActivityRecord[]>;
  listProjectsForUserInModule(
    user: UserRecord,
    module: ProjectModule
  ): Promise<ProjectRecord[]>;
  listProjectsForDesignerIds(
    designerIds: string[],
    limit?: number
  ): Promise<ProjectRecord[]>;
  pageProjectsForUserInModule(
    user: UserRecord,
    module: ProjectModule,
    pagination: PaginationInput
  ): Promise<PageResult<ProjectRecord>>;
  pageAdminProjects(
    actor: UserRecord,
    pagination: PaginationInput
  ): Promise<PageResult<AdminProjectSummary>>;
  findAdminProject(
    actor: UserRecord,
    projectId: string
  ): Promise<AdminProjectSummary | null>;
  pageActiveEstimatorOptions(
    search: string,
    pagination: PaginationInput
  ): Promise<PageResult<EstimatorOption>>;
  findProjectById(id: string): Promise<ProjectRecord | null>;
  linkUnclaimedProjectsToClient(
    emailNormalized: string,
    clientId: string,
    updatedAt: string
  ): Promise<ProjectRecord[]>;
  createProject(input: NewProject): Promise<ProjectRecord>;
  createFloor(input: NewFloor): Promise<FloorRecord>;
  createDesignStage(input: NewDesignStage): Promise<DesignStageRecord>;
  createTask(input: NewTask): Promise<TaskRecord>;
  getProjectHierarchy(projectId: string): Promise<ProjectHierarchy | null>;
  getOrganizationTree(): Promise<ManagerTreeNode[]>;
  pageOrganizationManagers(
    pagination: PaginationInput
  ): Promise<PageResult<ManagerTreeNode>>;
  pageActiveManagers(
    search: string,
    pagination: PaginationInput
  ): Promise<PageResult<UserRecord>>;
  pageActiveDesigners(
    pagination: PaginationInput
  ): Promise<PageResult<UserRecord>>;
  pageDesignersForManager(
    managerId: string,
    pagination: PaginationInput
  ): Promise<PageResult<UserRecord>>;
  findTaskById(id: string): Promise<TaskRecord | null>;
  listTasks(filters: TaskFilters): Promise<TaskRecord[]>;
  listTasksForProjectIds(projectIds: string[], limit?: number): Promise<TaskRecord[]>;
  listTasksForOwnerIds(ownerIds: string[], limit?: number): Promise<TaskRecord[]>;
  listFloorsForProjectIds(projectIds: string[]): Promise<FloorRecord[]>;
  listKpiTasksForPeriod(
    ownerIds: string[],
    periodStartAt: string,
    periodEndAt: string,
    limit?: number
  ): Promise<TaskRecord[]>;
  pageKpiTasksForPeriod(
    ownerIds: string[],
    periodStartAt: string,
    periodEndAt: string,
    pagination: PaginationInput
  ): Promise<PageResult<TaskRecord>>;
  updateTask(id: string, expectedVersion: number, change: TaskChange): Promise<TaskRecord>;
  appendTaskEvent(input: NewTaskEvent): Promise<TaskEventRecord>;
  listTaskEvents(taskId: string): Promise<TaskEventRecord[]>;
  listRecentTaskEvents(
    taskIds: string[],
    limit: number
  ): Promise<TaskEventRecord[]>;
  pageTaskEvents(
    taskId: string,
    pagination: PaginationInput,
    sort?: TaskEventSort
  ): Promise<PageResult<TaskEventRecord>>;
  listKpiTaskEventsForPeriod(
    taskId: string,
    actorId: string,
    periodStartAt: string,
    periodEndAt: string
  ): Promise<TaskEventRecord[]>;
  listKpiTaskEventsForTasks(
    taskOwners: Array<Pick<TaskRecord, "id" | "ownerId">>,
    periodStartAt: string,
    periodEndAt: string,
    limit: number
  ): Promise<TaskEventRecord[]>;
  pageKpiTaskEventsForPeriod(
    taskId: string,
    actorId: string,
    periodStartAt: string,
    periodEndAt: string,
    pagination: PaginationInput
  ): Promise<PageResult<TaskEventRecord>>;
  createDesignVersion(input: NewDesignVersion): Promise<DesignVersionRecord>;
  createNextDesignVersion(
    input: NewDesignVersionWithAllocatedNumber
  ): Promise<DesignVersionRecord>;
  findDesignVersionById(id: string): Promise<DesignVersionRecord | null>;
  listDesignVersions(
    projectId: string,
    limit?: number
  ): Promise<DesignVersionRecord[]>;
  listDesignVersionsForTaskIds(
    taskIds: string[],
    limit?: number
  ): Promise<DesignVersionRecord[]>;
  listLatestClientVisibleDesignVersions(projectIds: string[]): Promise<DesignVersionRecord[]>;
  pageDesignVersions(
    filters: DesignVersionFilters,
    pagination: PaginationInput
  ): Promise<PageResult<DesignVersionRecord>>;
  updateDesignVersion(
    id: string,
    change: DesignVersionChange
  ): Promise<DesignVersionRecord>;
  enqueueExtractionJob(input: NewDesignExtractionJob): Promise<DesignExtractionJobRecord>;
  claimExtractionJob(
    now: string,
    leaseExpiresAt: string
  ): Promise<DesignExtractionJobRecord | null>;
  findOldestClaimableExtractionJob(
    now: string
  ): Promise<DesignExtractionJobRecord | null>;
  claimExtractionJobById(
    id: string,
    now: string,
    leaseExpiresAt: string
  ): Promise<DesignExtractionJobRecord | null>;
  renewExtractionJobLease(
    id: string,
    claimId: string,
    now: string,
    leaseExpiresAt: string
  ): Promise<DesignExtractionJobRecord>;
  completeExtractionJob(
    id: string,
    claimId: string,
    completedAt: string
  ): Promise<DesignExtractionJobRecord>;
  failExtractionJob(
    id: string,
    claimId: string,
    failureCode: string,
    failureMessage: string,
    completedAt: string
  ): Promise<DesignExtractionJobRecord>;
  findExtractionJobById(id: string): Promise<DesignExtractionJobRecord | null>;
  findExtractionJobByVersionId(
    designVersionId: string
  ): Promise<DesignExtractionJobRecord | null>;
  listSourcePages(designVersionId: string): Promise<DesignSourcePageRecord[]>;
  findSourcePageById(id: string): Promise<DesignSourcePageRecord | null>;
  replaceExtractionDraft(input: ExtractionDraftReplacement): Promise<void>;
  listDesignSections(designVersionId: string): Promise<DesignSectionRecord[]>;
  findDesignSectionById(id: string): Promise<DesignSectionRecord | null>;
  listSectionRevisions(sectionId: string): Promise<DesignSectionRevisionRecord[]>;
  findSectionRevisionById(id: string): Promise<DesignSectionRevisionRecord | null>;
  createManualSection(input: DesignSectionRecord): Promise<DesignSectionRecord>;
  updateDraftSection(
    id: string,
    change: Partial<
      Pick<DesignSectionRecord, "sourcePageId" | "label" | "active" | "ocrConfidence">
    >,
    expected?: {
      revisionNumber: number;
      statuses: SectionReviewStatus[];
      active?: boolean;
    }
  ): Promise<DesignSectionRecord>;
  createSectionRevision(
    input: DesignSectionRevisionRecord
  ): Promise<DesignSectionRevisionRecord>;
  retryExtractionJob(id: string, queuedAt: string): Promise<DesignExtractionJobRecord>;
  recoverFailedExtractionJob(
    id: string,
    recoveredAt: string
  ): Promise<DesignExtractionJobRecord>;
  submitDesignSectionDrafts(
    designVersionId: string,
    submittedAt: string
  ): Promise<number>;
  decideSubmittedSectionRevision(
    revisionId: string,
    expectedRevisionNumber: number,
    decision: Extract<SectionReviewStatus, "approved" | "rejected">,
    reviewerId: string,
    comment: string | null,
    reviewedAt: string
  ): Promise<SectionDecisionResult>;
  createEvaluation(input: NewEvaluation): Promise<EvaluationRecord>;
  listEvaluationsForSubject(subjectUserId: string): Promise<EvaluationRecord[]>;
  listEvaluationsForSubjectIds(
    subjectUserIds: string[],
    limit?: number
  ): Promise<EvaluationRecord[]>;
  pageEvaluationsForSubject(
    subjectUserId: string,
    pagination: PaginationInput
  ): Promise<PageResult<EvaluationRecord>>;
  appendAuditEvent(input: NewAuditEvent): Promise<AuditEventRecord>;
  listAuditEvents(filters: AuditFilters): Promise<AuditEventRecord[]>;
  pageAuditEvents(
    filters: AuditFilters,
    pagination: PaginationInput
  ): Promise<PageResult<AuditEventRecord>>;
}

export class RepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryConflictError";
  }
}

export class RepositoryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryNotFoundError";
  }
}

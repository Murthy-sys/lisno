import type { Role, TaskStatus } from "../contracts/domain.js";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed";

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
  passwordHash: string;
  role: Role;
  active: boolean;
  managerId: string | null;
  authorizedClientIds: string[];
  avatar?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  clientId: string;
  initiatingDesignerId: string;
  assignedDesignerIds: string[];
  managerId: string;
  status: ProjectStatus;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  startedAt: string | null;
  completedAt: string | null;
  leaseExpiresAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  workerResultId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

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

export interface ExtractionDraftReplacement {
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
  evaluatorRole: Extract<Role, "design_manager" | "design_head">;
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

export interface SeedData {
  users: UserRecord[];
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
}

export type NewProject = ProjectRecord;
export type NewFloor = FloorRecord;
export type NewDesignStage = DesignStageRecord;
export type NewTask = TaskRecord;

export interface AppRepository {
  runInTransaction<T>(
    operation: (repository: AppRepository) => Promise<T>
  ): Promise<T>;
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  listUsers(): Promise<UserRecord[]>;
  listUsersByIds(ids: string[]): Promise<UserRecord[]>;
  listProjectsForUser(user: UserRecord): Promise<ProjectRecord[]>;
  listProjectsForDesignerIds(
    designerIds: string[],
    limit?: number
  ): Promise<ProjectRecord[]>;
  pageProjectsForUser(
    user: UserRecord,
    pagination: PaginationInput
  ): Promise<PageResult<ProjectRecord>>;
  findProjectById(id: string): Promise<ProjectRecord | null>;
  createProject(input: NewProject): Promise<ProjectRecord>;
  createFloor(input: NewFloor): Promise<FloorRecord>;
  createDesignStage(input: NewDesignStage): Promise<DesignStageRecord>;
  createTask(input: NewTask): Promise<TaskRecord>;
  getProjectHierarchy(projectId: string): Promise<ProjectHierarchy | null>;
  getOrganizationTree(): Promise<ManagerTreeNode[]>;
  pageOrganizationManagers(
    pagination: PaginationInput
  ): Promise<PageResult<ManagerTreeNode>>;
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
  enqueueExtractionJob(input: DesignExtractionJobRecord): Promise<DesignExtractionJobRecord>;
  claimExtractionJob(
    now: string,
    leaseExpiresAt: string
  ): Promise<DesignExtractionJobRecord | null>;
  completeExtractionJob(
    id: string,
    completedAt: string
  ): Promise<DesignExtractionJobRecord>;
  failExtractionJob(
    id: string,
    failureCode: string,
    failureMessage: string,
    completedAt: string
  ): Promise<DesignExtractionJobRecord>;
  findExtractionJobByVersionId(
    designVersionId: string
  ): Promise<DesignExtractionJobRecord | null>;
  listSourcePages(designVersionId: string): Promise<DesignSourcePageRecord[]>;
  replaceExtractionDraft(input: ExtractionDraftReplacement): Promise<void>;
  listDesignSections(designVersionId: string): Promise<DesignSectionRecord[]>;
  createManualSection(input: DesignSectionRecord): Promise<DesignSectionRecord>;
  updateDraftSection(
    id: string,
    change: Partial<
      Pick<DesignSectionRecord, "sourcePageId" | "label" | "active" | "ocrConfidence">
    >
  ): Promise<DesignSectionRecord>;
  createSectionRevision(
    input: DesignSectionRevisionRecord
  ): Promise<DesignSectionRevisionRecord>;
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

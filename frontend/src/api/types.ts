import type {
  ProjectModule,
  RequestableProjectModule,
  Role
} from "./authorization-contract";

export type { Role } from "./authorization-contract";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
}

export interface AuthPayload {
  token: string;
  user: PublicUser;
}

export type LeadStage = "new_lead" | "contacted" | "site_visit" | "design_meeting" | "estimate_in_progress" | "estimate_sent" | "negotiation" | "won" | "lost";
export type LeadActivityType = "call" | "whatsapp" | "meeting" | "email" | "note";
export interface Lead { id: string; ownerId: string; clientName: string; clientEmail: string; clientMobile: string; projectName: string; location: string; propertyType: string; budgetMin: number | null; budgetMax: number | null; source: string; stage: LeadStage; nextAction: string; nextActionAt: string; builder: string | null; areaSqft: number | null; targetHandoverAt: string | null; notes: string | null; latestActivityAt: string | null; createdAt: string; updatedAt: string; }
export interface LeadActivity { id: string; leadId: string; actorId: string; type: LeadActivityType; note: string; occurredAt: string; createdAt: string; }

export interface ClientSignupInput {
  name: string;
  email: string;
  mobile: string;
  address: string;
  password: string;
  passwordConfirmation: string;
}

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "completed";

export type RiskLevel = "gray" | "green" | "yellow" | "red";

export interface TaskRisk {
  level: RiskLevel;
  reason: string;
  elapsedRatio: number;
  progressRatio: number;
  forecastCompletion?: string;
}

interface KpiTaskBase {
  id: string;
  plannedStartAt: string;
  currentDeadlineAt: string;
  plannedEffort?: number | null;
  progress: number;
  wasYellow?: boolean;
  approvalVersion?: number | null;
  approvalStatus?: "approved" | "rejected" | "unapproved" | null;
  revisionCount?: number | null;
  hasReview?: boolean;
  updateEvents?: Array<{ occurredAt: string }>;
}

export type KpiTask =
  | (KpiTaskBase & {
      status: "completed";
      completedAt: string;
    })
  | (KpiTaskBase & {
      status: Exclude<TaskStatus, "completed">;
      completedAt?: null;
    });

export interface KpiInput {
  tasks: KpiTask[];
  periodStartAt: string;
  periodEndAt: string;
  now: Date;
}

export type KpiComponentKey =
  | "onTime"
  | "quality"
  | "revisionEfficiency"
  | "updateDiscipline"
  | "workloadCompletion";

export interface KpiComponent {
  key: KpiComponentKey;
  label: string;
  score: number | null;
  configuredWeight: number;
  effectiveWeight: number;
  eligibleCount: number;
  explanation: string;
}

export interface KpiResult {
  score: number;
  components: KpiComponent[];
}

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

export interface Project {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  clientAddress: string;
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
  progress?: number;
}

export interface Floor {
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

export interface DesignStage {
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

export type ProjectTask = TaskRecord & { risk: TaskRisk };

export interface ProjectHierarchy extends Project {
  floors: Array<
    Floor & {
      stages: Array<
        DesignStage & {
          tasks: ProjectTask[];
        }
      >;
    }
  >;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  actorId: string;
  type: TaskEventType;
  occurredAt: string;
  from: Record<string, unknown>;
  to: Record<string, unknown>;
  note: string | null;
  createdAt: string;
}

export interface PageMetadata {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface PageData<T> {
  items: T[];
  pagination: PageMetadata;
}

export interface UserDirectoryFilters {
  search?: string;
  role?: Role;
  active?: boolean;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface UserDirectoryItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  version: number;
  avatar?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDirectoryPage extends PageData<UserDirectoryItem> {
  manageableRoles: Role[];
}

export type UpdateManagedUserInput =
  | { version: number; role: Role; active?: never }
  | { version: number; active: boolean; role?: never };

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

export interface ManagedUserMutationResult {
  user: UserDirectoryItem;
  revokedGrantCount: number;
  responsibilities: UserResponsibilityCounts;
}

export interface OwnAccessRequest {
  id: string;
  projectId: string;
  module: RequestableProjectModule;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decisionReason: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAccessRequest extends OwnAccessRequest {
  requester: {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
  };
  project: { id: string; resolved: boolean; name: string | null };
  reviewerId: string | null;
  activeGrant: { id: string; version: number; grantedAt: string } | null;
}

export interface ProjectAccessGrant {
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

export interface AccessRequestDecisionResult {
  request: ReviewAccessRequest;
  grant: ProjectAccessGrant | null;
}

export interface AccessRequestListFilters {
  status?: OwnAccessRequest["status"];
  module?: RequestableProjectModule;
}

export interface LinkedPageData<T> extends PageData<T> {
  href: string;
}

export interface KpiTaskRead {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  progress: number;
  currentDeadlineAt: string;
  plannedEffort: number | null;
  risk: TaskRisk;
}

export type RiskCounts = Record<RiskLevel, number>;

export interface KpiProjectAggregate {
  projectId: string;
  totalTasks: number;
  completedTasks: number;
  progress: number;
  riskCounts: RiskCounts;
}

export interface KpiAggregates {
  taskCounts: {
    total: number;
    completed: number;
    active: number;
  };
  riskCounts: RiskCounts;
  effort: {
    planned: number;
    completed: number;
    remaining: number;
    workloadPercentage: number;
  };
  projects: KpiProjectAggregate[];
  recentActivity: Array<{
    taskId: string;
    projectId: string;
    taskTitle: string;
    event: TaskEvent;
  }>;
}

export interface KpiTaskWithEvents extends KpiTaskRead {
  events: LinkedPageData<TaskEvent>;
}

export interface KpiRead {
  userId: string;
  periodStartAt: string;
  periodEndAt: string;
  score: number;
  components: KpiComponent[];
  aggregates: KpiAggregates;
  tasks: PageData<KpiTaskWithEvents>;
}

export interface DesignerSummary {
  user: PublicUser;
  activeProjectCount: number;
  kpi: KpiResult;
  workload: number;
  overdueCount: number;
  yellowRiskCount: number;
  pendingEvaluation: boolean;
  projects: Project[];
  tasks: ProjectTask[];
}

export interface OrganizationDesigner {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  title?: string;
  summary: Omit<DesignerSummary, "user">;
}

export interface OrganizationManager {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  title?: string;
  designers: OrganizationDesigner[];
  summary: {
    teamKpi: KpiResult;
    workload: number;
    redCount: number;
    yellowCount: number;
    evaluationCoverage: number;
  };
}

export interface OrganizationManagerPage
  extends Omit<OrganizationManager, "designers"> {
  designers: PageData<OrganizationDesigner>;
}

export interface Evaluation {
  id: string;
  subjectUserId: string;
  evaluatorUserId: string;
  evaluatorRole: "design_manager" | "design_head" | "super_admin";
  periodStartAt: string;
  periodEndAt: string;
  score: number;
  comments: string;
  revisionOf: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  reason: string | null;
  createdAt: string;
}

export interface UpdateTaskInput {
  version: number;
  status?: TaskStatus;
  progress?: number;
  description?: string;
  note?: string;
}

export interface CreateProjectInput {
  name: string;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  clientAddress: string;
  assignedDesignerIds: string[];
  managerId: string;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface ManagerOption {
  id: string;
  name: string;
  email: string;
  mobile?: string;
}

export interface CreateFloorInput {
  name: string;
  number: string;
  order: number;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface CreateStageInput {
  name: string;
  type: DesignStageType;
  order: number;
}

export interface CreateTaskInput {
  title: string;
  order: number;
  ownerId: string;
  plannedStartAt: string;
  originalDeadlineAt: string;
  plannedEffort?: number;
}

export interface ClientProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress: number;
  floorCount: number;
}

export type ApprovalStatus = "draft" | "in_review" | "approved" | "rejected";

export interface DesignVersion {
  id: string;
  projectId: string;
  floorId: string;
  stageId: string;
  taskId: string | null;
  versionNumber: number;
  originalFilename: string;
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
  extractionStatus?: ExtractionStatus | null;
}

export type ClientDesignVersion = Omit<
  DesignVersion,
  "uploaderId" | "reviewerId"
>;

export type ExtractionStatus =
  | "queued"
  | "processing"
  | "designer_review"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "processing_failed";

export type SectionReviewStatus = "draft" | "submitted" | "approved" | "rejected";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesignExtraction {
  extractionStatus: ExtractionStatus;
  pages: DesignSourcePage[];
  sections: DesignSection[];
}

export interface DesignSourcePage {
  id: string;
  designVersionId: string;
  pageNumber: number;
  width: number;
  height: number;
  imageUrl: string;
  createdAt: string;
}

export interface DesignSectionRevision {
  id: string;
  sectionId: string;
  revisionNumber: number;
  sourcePageId: string;
  crop: CropRect;
  label: string;
  reviewStatus: SectionReviewStatus;
  submittedAt: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  rejectionComment: string | null;
  createdAt: string;
  imageReference: string;
}

export interface DesignSection {
  id: string;
  designVersionId: string;
  sourcePageId: string;
  label: string;
  active: boolean;
  source: "ocr" | "manual";
  ocrConfidence: number | null;
  createdAt: string;
  updatedAt: string;
  revision: DesignSectionRevision;
  history?: DesignSectionRevision[];
}

export interface DesignSectionReviewItem extends DesignSection {
  versionNumber: number;
  sourcePageUrl: string;
  history: DesignSectionRevision[];
}

export interface DesignSectionReviewProgress {
  approved: number;
  rejected: number;
  awaitingReview: number;
  total: number;
}

export interface DesignSectionReviewData {
  projectId: string;
  progress: DesignSectionReviewProgress;
  sections: DesignSectionReviewItem[];
}

export interface DesignSectionDecisionResult {
  revision: DesignSectionRevision;
  extractionStatus: ExtractionStatus;
  progress: DesignSectionReviewProgress;
}

export type EstimateDesignExtractionStatus =
  | "queued"
  | "processing"
  | "estimator_review"
  | "processing_failed"
  | "submitted"
  | "changes_requested"
  | "approved";

export type EstimateDrawingReviewStatus = "draft" | "submitted" | "approved" | "changes_requested";

export interface AnnotationElementBase {
  id: string;
  color: string;
  strokeWidth: number;
}

export interface AnnotationPoint {
  x: number;
  y: number;
}

export type AnnotationElement =
  | (AnnotationElementBase & {
      type: "ellipse";
      x: number;
      y: number;
      width: number;
      height: number;
    })
  | (AnnotationElementBase & {
      type: "rectangle";
      x: number;
      y: number;
      width: number;
      height: number;
    })
  | (AnnotationElementBase & {
      type: "arrow";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    })
  | (AnnotationElementBase & {
      type: "freehand";
      points: AnnotationPoint[];
    })
  | (AnnotationElementBase & {
      type: "text";
      x: number;
      y: number;
      text: string;
    });

export interface AnnotationDocumentV1 {
  schemaVersion: 1;
  imageWidth: number;
  imageHeight: number;
  elements: AnnotationElement[];
}

export interface EstimateDesignUpload {
  id: string;
  estimateId: string;
  leadId: string;
  originalFilename: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "image/tiff" | "image/heic";
  sizeBytes: number;
  uploaderId: string;
  uploadedAt: string;
  extractionStatus: EstimateDesignExtractionStatus;
  failureCode: string | null;
  failureMessage: string | null;
  canRetry: boolean;
}

export interface EstimateDesignSourcePage {
  id: string;
  uploadId: string;
  pageNumber: number;
  width: number;
  height: number;
}

export type EstimateDesignMappingStatus =
  | "auto_mapped"
  | "estimator_assigned"
  | "misc";

export interface EstimateDesignMappingFields {
  roomId: string | null;
  scopeSectionId: string | null;
  catalogueId: string | null;
  mappingStatus: EstimateDesignMappingStatus;
}

export interface EstimateDesignDrawing extends EstimateDesignMappingFields {
  id: string;
  uploadId: string;
  sourcePageId: string;
  estimateId: string;
  active: boolean;
  verified: boolean;
  detectedTitle: string;
  displayTitle: string;
  source: "ocr" | "manual";
  roomConfidence: number | null;
  scopeConfidence: number | null;
  ocrConfidence: number | null;
  roomEvidence: Array<{ value: string }>;
  scopeEvidence: Array<{ value: string }>;
}

export interface EstimateDesignRevision extends EstimateDesignMappingFields {
  id: string;
  drawingId: string;
  revisionNumber: number;
  sourcePageId: string;
  crop: CropRect;
  label: string;
  reviewStatus: EstimateDrawingReviewStatus;
  submittedAt: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  changeSummary: string | null;
  annotationLayerId: string | null;
  annotations: AnnotationDocumentV1 | null;
  replacementUploadId: string | null;
  replacesRevisionId: string | null;
}

export interface EstimateDesignAnnotationDraft {
  id: string;
  revisionId: string;
  version: number;
  annotations: AnnotationDocumentV1;
}

export interface EstimateDesignClientRevision extends EstimateDesignRevision {
  annotationDraft: EstimateDesignAnnotationDraft | null;
}

export interface EstimateDesignApprovalReadiness {
  ready: boolean;
  total: number;
  approved: number;
  awaitingReview: number;
  changesRequested: number;
}

export interface EstimateDesignWorkspace {
  uploads: EstimateDesignUpload[];
  pages: EstimateDesignSourcePage[];
  drawings: EstimateDesignDrawing[];
  revisions: EstimateDesignRevision[];
}

export interface EstimateDesignClientWorkspace
  extends Omit<EstimateDesignWorkspace, "revisions"> {
  revisions: EstimateDesignClientRevision[];
  readiness: EstimateDesignApprovalReadiness;
}

export type EstimatePlanPageStatus = "awaiting_review" | "changes_requested" | "revised" | "approved";

export interface EstimatePlanAnnotationDraft {
  id: string;
  sourcePageId: string;
  version: number;
  annotations: AnnotationDocumentV1;
}

export interface EstimatePlanPage {
  id: string;
  uploadId: string;
  pageNumber: number;
  width: number;
  height: number;
  currentRevisionId: string;
  status: EstimatePlanPageStatus;
  thumbnailUrl: string;
  currentImageUrl: string;
  annotationDraft: EstimatePlanAnnotationDraft | null;
}

export interface EstimatePlanChangeRequest {
  id: string;
  sourcePageId: string;
  version: number;
  summary: string;
  annotations: AnnotationDocumentV1;
  targets: Array<{ drawingId: string; requestedRevisionId: string; status: "open" | "replacement_submitted" | "approved" | "resolved"; resolvedByRevisionId: string | null }>;
  unassigned: boolean;
  status: "open" | "resolved";
}

export interface EstimatePlanClientWorkspace {
  uploads: Array<{
    id: string;
    originalFilename: string;
    mimeType: string;
    pageCount: number;
    pages: EstimatePlanPage[];
  }>;
  pages: EstimatePlanPage[];
  openRequests: EstimatePlanChangeRequest[];
}

export interface EstimatePlanChangeRequestQueueItem {
  id: string;
  estimateId: string;
  uploadId: string;
  sourcePageId: string;
  clientId: string;
  version: number;
  summary: string;
  status: "open" | "resolved";
  unassigned: boolean;
  targetCount: number;
  targets: Array<{ drawingId: string; status: "open" | "replacement_submitted" | "approved" | "resolved" }>;
  createdAt: string;
}

export interface EstimatePlanChangeRequestDetail extends EstimatePlanChangeRequest {
  currentImageUrl: string;
  resolutionNote: string | null;
  drawingTargets: Array<{ drawingId: string; title: string; latestRevisionId: string; latestRevisionNumber: number; status: "open" | "replacement_submitted" | "approved" | "resolved" }>;
  drawingCandidates: Array<{ drawingId: string; title: string; latestRevisionId: string; latestRevisionNumber: number; status: "open" | "replacement_submitted" | "approved" | "resolved" | null }>;
}

export interface EstimateDesignDrawingUpdate extends EstimateDesignDrawing {
  revision: EstimateDesignRevision;
}

export interface EstimateDesignQueuedReplacement {
  queued: true;
  upload: EstimateDesignUpload;
}

export type EstimateDesignReplacementResult = EstimateDesignDrawingUpdate | EstimateDesignQueuedReplacement;

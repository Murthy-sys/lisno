export type Role =
  | "designer"
  | "design_manager"
  | "design_head"
  | "estimator_sales"
  | "client";

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
  evaluatorRole: "design_manager" | "design_head";
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

export type Role = "designer" | "design_manager" | "design_head" | "client";

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

export interface ProjectHierarchy extends Project {
  floors: Array<
    Floor & {
      stages: Array<
        DesignStage & {
          tasks: TaskRecord[];
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
  events: LinkedPageData<TaskEvent>;
}

export interface KpiRead {
  userId: string;
  periodStartAt: string;
  periodEndAt: string;
  score: number;
  components: KpiComponent[];
  tasks: PageData<KpiTaskRead>;
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
  clientId: string;
  assignedDesignerIds: string[];
  managerId: string;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
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
}

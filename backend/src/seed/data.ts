import type {
  DesignStageRecord,
  ProjectRecord,
  SeedData,
  TaskRecord,
  UserRecord
} from "../repositories/types.js";
import { normalizeEmail } from "../domain/email.js";

const CREATED_AT = "2026-06-01T08:00:00.000Z";
const UPDATED_AT = "2026-07-15T08:00:00.000Z";

// Demo login for every seeded account: password `LisnoDemo2026!`.
// This precomputed hash keeps seed imports deterministic and side-effect free.
const DEMO_PASSWORD_HASH =
  "$2b$10$7EqJtq98hPqEX7fNZaFWoOhqP8D5iEyOH6v9mJEkjEBlrptHw28.O";

const user = (
  input: Pick<UserRecord, "id" | "name" | "email" | "role"> &
    Partial<
      Pick<
        UserRecord,
        "managerId" | "title" | "authorizedClientIds" | "mobile" | "address"
      >
    >
): UserRecord => ({
  emailNormalized: normalizeEmail(input.email),
  mobile: input.mobile ?? null,
  address: input.address ?? null,
  passwordHash: DEMO_PASSWORD_HASH,
  active: true,
  managerId: input.managerId ?? null,
  authorizedClientIds: input.authorizedClientIds ?? [],
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  ...input
});

const project = (
  input: Pick<
    ProjectRecord,
    | "id"
    | "name"
    | "clientId"
    | "initiatingDesignerId"
    | "assignedDesignerIds"
    | "managerId"
    | "location"
  > &
    Partial<
      Pick<
        ProjectRecord,
        | "clientName"
        | "clientEmail"
        | "clientEmailNormalized"
        | "clientMobile"
        | "clientAddress"
      >
    >
): ProjectRecord => ({
  clientName: input.clientName ?? "",
  clientEmail: input.clientEmail ?? "",
  clientEmailNormalized: input.clientEmailNormalized ?? normalizeEmail(input.clientEmail ?? ""),
  clientMobile: input.clientMobile ?? "",
  clientAddress: input.clientAddress ?? "",
  status: "active",
  plannedStartAt: "2026-06-01T09:00:00.000Z",
  plannedEndAt: "2026-09-30T17:00:00.000Z",
  actualStartAt: "2026-06-01T09:00:00.000Z",
  actualEndAt: null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  ...input
});

const stage = (
  input: Pick<
    DesignStageRecord,
    "id" | "projectId" | "floorId" | "name" | "type" | "order"
  > &
    Partial<Pick<DesignStageRecord, "dependencyStageIds">>
): DesignStageRecord => ({
  dependencyStageIds: input.dependencyStageIds ?? [],
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  ...input
});

type IncompleteTask = Extract<TaskRecord, { completedAt: null }>;

const task = (
  input: Pick<
    IncompleteTask,
    | "id"
    | "projectId"
    | "floorId"
    | "stageId"
    | "title"
    | "order"
    | "ownerId"
    | "plannedStartAt"
    | "originalDeadlineAt"
    | "currentDeadlineAt"
    | "progress"
    | "status"
  > &
    Partial<
      Pick<
        IncompleteTask,
        | "description"
        | "plannedEffort"
        | "dependencyTaskIds"
        | "latestUpdateAt"
        | "wasYellow"
        | "approvalVersion"
        | "approvalStatus"
        | "revisionCount"
        | "hasReview"
        | "updateEvents"
      >
    >
): IncompleteTask => ({
  description: input.description ?? "",
  plannedEffort: input.plannedEffort ?? 8,
  dependencyTaskIds: input.dependencyTaskIds ?? [],
  latestUpdateAt: input.latestUpdateAt ?? UPDATED_AT,
  completedAt: null,
  version: 1,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  ...input
});

const users: UserRecord[] = [
  user({
    id: "user-head",
    name: "Devika Menon",
    email: "head@lisno.example",
    role: "design_head",
    title: "Design Head"
  }),
  user({
    id: "user-manager-aarav",
    name: "Aarav Mehta",
    email: "aarav@lisno.example",
    role: "design_manager",
    title: "Design Manager"
  }),
  user({
    id: "user-manager-meera",
    name: "Meera Iyer",
    email: "meera@lisno.example",
    role: "design_manager",
    title: "Design Manager"
  }),
  user({
    id: "user-designer-ananya",
    name: "Ananya Rao",
    email: "ananya@lisno.example",
    role: "designer",
    managerId: "user-manager-aarav",
    title: "Senior Designer",
    authorizedClientIds: ["user-client-aurora", "user-client-celeste"]
  }),
  user({
    id: "user-designer-kabir",
    name: "Kabir Shah",
    email: "kabir@lisno.example",
    role: "designer",
    managerId: "user-manager-aarav",
    title: "Designer",
    authorizedClientIds: ["user-client-aurora"]
  }),
  user({
    id: "user-designer-ishita",
    name: "Ishita Sen",
    email: "ishita@lisno.example",
    role: "designer",
    managerId: "user-manager-meera",
    title: "Senior Designer",
    authorizedClientIds: ["user-client-celeste"]
  }),
  user({
    id: "user-estimator-sales",
    name: "Priya Sharma",
    email: "sales@lisno.example",
    role: "estimator_sales",
    title: "Estimator / Sales"
  }),
  user({
    id: "user-designer-vikram",
    name: "Vikram Nair",
    email: "vikram@lisno.example",
    role: "designer",
    managerId: "user-manager-meera",
    title: "Designer",
    authorizedClientIds: ["user-client-celeste"]
  }),
  user({
    id: "user-client-aurora",
    name: "Rhea Kapoor",
    email: "client@aurora.example",
    role: "client",
    title: "Aurora Living"
  }),
  user({
    id: "user-client-celeste",
    name: "Noah Fernandes",
    email: "client@celeste.example",
    role: "client",
    title: "Celeste Works"
  })
];

const projects: ProjectRecord[] = [
  project({
    id: "project-aurora-villa",
    name: "Aurora Villa",
    clientId: "user-client-aurora",
    initiatingDesignerId: "user-designer-ananya",
    assignedDesignerIds: ["user-designer-ananya", "user-designer-kabir"],
    managerId: "user-manager-aarav",
    location: "Bengaluru",
    clientName: "Rhea Kapoor",
    clientEmail: "client@aurora.example",
    clientEmailNormalized: "client@aurora.example"
  }),
  project({
    id: "project-aurora-studio",
    name: "Aurora Studio",
    clientId: "user-client-aurora",
    initiatingDesignerId: "user-designer-kabir",
    assignedDesignerIds: ["user-designer-kabir"],
    managerId: "user-manager-aarav",
    location: "Mumbai",
    clientName: "Rhea Kapoor",
    clientEmail: "client@aurora.example",
    clientEmailNormalized: "client@aurora.example"
  }),
  project({
    id: "project-celeste-office",
    name: "Celeste Office",
    clientId: "user-client-celeste",
    initiatingDesignerId: "user-designer-ishita",
    assignedDesignerIds: ["user-designer-ananya", "user-designer-ishita", "user-designer-vikram"],
    managerId: "user-manager-meera",
    location: "Pune",
    clientName: "Noah Fernandes",
    clientEmail: "client@celeste.example",
    clientEmailNormalized: "client@celeste.example"
  })
];

const floors = [
  {
    id: "floor-aurora-ground",
    projectId: "project-aurora-villa",
    name: "Ground Floor",
    number: "G",
    order: 1,
    progress: 45,
    plannedStartAt: "2026-06-01T09:00:00.000Z",
    plannedEndAt: "2026-08-15T17:00:00.000Z",
    actualStartAt: "2026-06-01T09:00:00.000Z",
    actualEndAt: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  },
  {
    id: "floor-aurora-first",
    projectId: "project-aurora-villa",
    name: "First Floor",
    number: "1",
    order: 2,
    progress: 20,
    plannedStartAt: "2026-06-15T09:00:00.000Z",
    plannedEndAt: "2026-09-01T17:00:00.000Z",
    actualStartAt: "2026-06-15T09:00:00.000Z",
    actualEndAt: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  },
  {
    id: "floor-studio-main",
    projectId: "project-aurora-studio",
    name: "Main Studio",
    number: "1",
    order: 1,
    progress: 60,
    plannedStartAt: "2026-06-01T09:00:00.000Z",
    plannedEndAt: "2026-08-01T17:00:00.000Z",
    actualStartAt: "2026-06-01T09:00:00.000Z",
    actualEndAt: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  },
  {
    id: "floor-celeste-main",
    projectId: "project-celeste-office",
    name: "Office Floor",
    number: "7",
    order: 1,
    progress: 30,
    plannedStartAt: "2026-06-15T09:00:00.000Z",
    plannedEndAt: "2026-09-30T17:00:00.000Z",
    actualStartAt: "2026-06-15T09:00:00.000Z",
    actualEndAt: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT
  }
];

const groundStages: DesignStageRecord[] = [
  ["stage-ground-internal", "Internal kickoff", "internal_kickoff"],
  ["stage-ground-client", "Client kickoff", "client_kickoff"],
  ["stage-ground-keys", "Key collection", "key_collection"],
  ["stage-ground-site", "Site measurement", "site_measurement"],
  ["stage-ground-concept", "Concept and mood board", "concept_mood_board"],
  ["stage-ground-plan", "Floor plan", "floor_plan"],
  ["stage-ground-revisions", "Client revisions", "client_revisions"],
  ["stage-ground-approval", "Final approval", "final_approval"],
  ["stage-ground-handoff", "Design handoff", "design_handoff"]
].map(([id, name, type], index, entries) =>
  stage({
    id,
    projectId: "project-aurora-villa",
    floorId: "floor-aurora-ground",
    name,
    type: type as DesignStageRecord["type"],
    order: index + 1,
    dependencyStageIds: index === 0 ? [] : [entries[index - 1]![0]]
  })
);

const stages: DesignStageRecord[] = [
  ...groundStages,
  stage({
    id: "stage-first-concept",
    projectId: "project-aurora-villa",
    floorId: "floor-aurora-first",
    name: "Concept and mood board",
    type: "concept_mood_board",
    order: 1
  }),
  stage({
    id: "stage-studio-plan",
    projectId: "project-aurora-studio",
    floorId: "floor-studio-main",
    name: "Floor plan",
    type: "floor_plan",
    order: 1
  }),
  stage({
    id: "stage-celeste-site",
    projectId: "project-celeste-office",
    floorId: "floor-celeste-main",
    name: "Site measurement",
    type: "site_measurement",
    order: 1
  })
];

const tasks: TaskRecord[] = [
  task({
    id: "task-furniture-layout",
    projectId: "project-aurora-villa",
    floorId: "floor-aurora-ground",
    stageId: "stage-ground-plan",
    title: "Draft furniture layout",
    order: 1,
    ownerId: "user-designer-ananya",
    plannedStartAt: "2026-07-01T09:00:00.000Z",
    originalDeadlineAt: "2026-07-31T17:00:00.000Z",
    currentDeadlineAt: "2026-07-31T17:00:00.000Z",
    progress: 75,
    status: "in_progress",
    updateEvents: [{ occurredAt: "2026-07-14T09:00:00.000Z" }]
  }),
  task({
    id: "task-circulation",
    projectId: "project-aurora-villa",
    floorId: "floor-aurora-ground",
    stageId: "stage-ground-plan",
    title: "Validate circulation clearances",
    order: 2,
    ownerId: "user-designer-kabir",
    plannedStartAt: "2026-07-01T09:00:00.000Z",
    originalDeadlineAt: "2026-07-20T17:00:00.000Z",
    currentDeadlineAt: "2026-07-20T17:00:00.000Z",
    progress: 20,
    status: "in_progress"
  }),
  task({
    id: "task-overdue-measurement",
    projectId: "project-celeste-office",
    floorId: "floor-celeste-main",
    stageId: "stage-celeste-site",
    title: "Confirm services grid",
    order: 1,
    ownerId: "user-designer-ishita",
    plannedStartAt: "2026-06-15T09:00:00.000Z",
    originalDeadlineAt: "2026-07-10T17:00:00.000Z",
    currentDeadlineAt: "2026-07-10T17:00:00.000Z",
    progress: 70,
    status: "in_progress"
  }),
  task({
    id: "task-blocked-materials",
    projectId: "project-aurora-studio",
    floorId: "floor-studio-main",
    stageId: "stage-studio-plan",
    title: "Resolve material dimensions",
    order: 1,
    ownerId: "user-designer-kabir",
    plannedStartAt: "2026-07-10T09:00:00.000Z",
    originalDeadlineAt: "2026-07-25T17:00:00.000Z",
    currentDeadlineAt: "2026-07-25T17:00:00.000Z",
    progress: 30,
    status: "blocked"
  }),
  task({
    id: "task-future-concept",
    projectId: "project-aurora-villa",
    floorId: "floor-aurora-first",
    stageId: "stage-first-concept",
    title: "Prepare bedroom concept",
    order: 1,
    ownerId: "user-designer-ananya",
    plannedStartAt: "2026-08-01T09:00:00.000Z",
    originalDeadlineAt: "2026-08-15T17:00:00.000Z",
    currentDeadlineAt: "2026-08-15T17:00:00.000Z",
    progress: 0,
    status: "not_started",
    latestUpdateAt: null
  })
];

export const demoSeedData: SeedData = {
  users,
  leads: [],
  leadActivities: [],
  projects,
  floors,
  stages,
  tasks,
  taskEvents: [
    {
      id: "event-furniture-progress",
      taskId: "task-furniture-layout",
      actorId: "user-designer-ananya",
      type: "progress_changed",
      occurredAt: "2026-07-14T09:00:00.000Z",
      from: { progress: 55 },
      to: { progress: 75 },
      note: "Primary furniture zones complete",
      createdAt: "2026-07-14T09:00:00.000Z"
    }
  ],
  designVersions: [
    {
      id: "version-aurora-plan-1",
      projectId: "project-aurora-villa",
      floorId: "floor-aurora-ground",
      stageId: "stage-ground-plan",
      taskId: "task-furniture-layout",
      versionNumber: 1,
      originalFilename: "aurora-ground-plan-v1.pdf",
      storedFileReference: "seed/aurora-ground-plan-v1.pdf",
      mimeType: "application/pdf",
      sizeBytes: 245760,
      uploaderId: "user-designer-ananya",
      uploadedAt: "2026-07-14T10:00:00.000Z",
      approvalStatus: "approved",
      reviewerId: "user-manager-aarav",
      approvedAt: "2026-07-15T08:00:00.000Z",
      clientVisible: true,
      createdAt: "2026-07-14T10:00:00.000Z",
      updatedAt: "2026-07-15T08:00:00.000Z"
    }
  ],
  extractionJobs: [],
  sourcePages: [],
  designSections: [],
  designSectionRevisions: [],
  evaluations: [
    {
      id: "evaluation-kabir-june",
      subjectUserId: "user-designer-kabir",
      evaluatorUserId: "user-manager-aarav",
      evaluatorRole: "design_manager",
      periodStartAt: "2026-06-01T00:00:00.000Z",
      periodEndAt: "2026-06-30T23:59:59.999Z",
      score: 78,
      comments: "Consistent progress with room for earlier escalation",
      revisionOf: null,
      createdAt: "2026-07-01T09:00:00.000Z"
    }
  ],
  auditEvents: [
    {
      id: "audit-furniture-progress",
      actorId: "user-designer-ananya",
      action: "task_progress_changed",
      entityType: "task",
      entityId: "task-furniture-layout",
      occurredAt: "2026-07-14T09:00:00.000Z",
      oldValues: { progress: 55 },
      newValues: { progress: 75 },
      reason: null,
      createdAt: "2026-07-14T09:00:00.000Z"
    }
  ]
};

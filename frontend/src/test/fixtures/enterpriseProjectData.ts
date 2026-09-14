// Synthetic records reused from features/designer/ProjectWorkspace.test.tsx. No runtime test imports.
export const designer = {
  id: "user-designer-ananya",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer" as const
};

export const task = {
  id: "task-circulation",
  projectId: "project-aurora-villa",
  floorId: "floor-ground",
  stageId: "stage-plan",
  title: "Circulation planning",
  description: "Resolve primary movement paths.",
  order: 2,
  ownerId: designer.id,
  plannedStartAt: "2026-07-01T09:00:00.000Z",
  originalDeadlineAt: "2026-07-20T17:00:00.000Z",
  currentDeadlineAt: "2026-07-25T17:00:00.000Z",
  plannedEffort: 16,
  progress: 55,
  dependencyTaskIds: [],
  latestUpdateAt: "2026-07-18T12:00:00.000Z",
  status: "in_progress",
  completedAt: null,
  version: 3,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
  risk: {
    level: "yellow",
    reason: "Forecast completion crosses the deadline.",
    elapsedRatio: 0.72,
    progressRatio: 0.55,
    forecastCompletion: "2026-07-28T10:00:00.000Z"
  }
};

export const teammateTask = {
  ...task,
  id: "task-teammate",
  title: "Teammate lighting plan",
  order: 3,
  ownerId: "user-designer-kabir",
  risk: {
    level: "red",
    reason: "Deadline passed while work is incomplete.",
    elapsedRatio: 1.1,
    progressRatio: 0.55
  }
};

export const completedTask = {
  ...task,
  id: "task-completed",
  title: "Approved concept",
  order: 4,
  status: "completed",
  progress: 100,
  completedAt: "2026-07-18T12:00:00.000Z",
  risk: {
    level: "green",
    reason: "Completed on or before the current deadline.",
    elapsedRatio: 1,
    progressRatio: 1
  }
};

export const project = {
  id: "project-aurora-villa",
  name: "Aurora Villa",
  clientId: "user-client-aurora",
  initiatingDesignerId: designer.id,
  assignedDesignerIds: [designer.id],
  managerId: "user-manager-aarav",
  status: "active",
  location: "Bengaluru",
  plannedStartAt: "2026-06-01T09:00:00.000Z",
  plannedEndAt: "2026-09-30T17:00:00.000Z",
  actualStartAt: "2026-06-01T09:00:00.000Z",
  actualEndAt: null,
  createdAt: "2026-06-01T08:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z",
  floors: [
    {
      id: "floor-ground",
      projectId: "project-aurora-villa",
      name: "Ground Floor",
      number: "G",
      order: 1,
      progress: 45,
      plannedStartAt: "2026-06-01T09:00:00.000Z",
      plannedEndAt: "2026-08-15T17:00:00.000Z",
      actualStartAt: "2026-06-01T09:00:00.000Z",
      actualEndAt: null,
      createdAt: "2026-06-01T08:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z",
      stages: [
        {
          id: "stage-plan",
          projectId: "project-aurora-villa",
          floorId: "floor-ground",
          name: "Floor plan",
          type: "floor_plan",
          order: 1,
          dependencyStageIds: [],
          createdAt: "2026-06-01T08:00:00.000Z",
          updatedAt: "2026-07-18T12:00:00.000Z",
          tasks: [task, teammateTask, completedTask]
        }
      ]
    }
  ]
};

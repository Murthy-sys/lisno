// Synthetic records reused from features/designer/DesignerDashboard.test.tsx. No runtime test imports.
export const designer = {
  id: "user-designer-ananya",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer" as const
};

export const pagination = {
  limit: 100,
  offset: 0,
  total: 2,
  hasMore: false
};

export const projects = [
  {
    id: "project-aurora-villa",
    name: "Aurora Villa",
    clientId: "user-client-aurora",
    initiatingDesignerId: designer.id,
    assignedDesignerIds: [designer.id, "user-designer-kabir"],
    managerId: "user-manager-aarav",
    status: "active",
    location: "Bengaluru",
    plannedStartAt: "2026-06-01T09:00:00.000Z",
    plannedEndAt: "2026-09-30T17:00:00.000Z",
    actualStartAt: "2026-06-01T09:00:00.000Z",
    actualEndAt: null,
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z"
  },
  {
    id: "project-aurora-studio",
    name: "Aurora Studio",
    clientId: "user-client-aurora",
    initiatingDesignerId: designer.id,
    assignedDesignerIds: [designer.id],
    managerId: "user-manager-aarav",
    status: "completed",
    location: "Mumbai",
    plannedStartAt: "2026-06-01T09:00:00.000Z",
    plannedEndAt: "2026-08-01T17:00:00.000Z",
    actualStartAt: "2026-06-01T09:00:00.000Z",
    actualEndAt: "2026-07-15T17:00:00.000Z",
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z"
  }
];

export const designPlanTasks = [
  {
    id: "estimate-aurora-villa:design-plan-upload",
    estimateId: "estimate-aurora-villa",
    projectId: "project-aurora-villa",
    projectName: "Aurora Villa",
    clientName: "Priya Shah",
    status: "in_progress",
    designPlanVersion: 1,
    rooms: [{ id: "room-living", label: "Living Room" }],
    scopes: ["EL"],
    lineItems: []
  },
  {
    id: "estimate-aurora-studio:design-plan-upload",
    estimateId: "estimate-aurora-studio",
    projectId: "project-aurora-studio",
    projectName: "Aurora Studio",
    clientName: "Rhea Kapoor",
    status: "ready_for_client",
    designPlanVersion: 2,
    rooms: [{ id: "room-bedroom", label: "Bedroom" }],
    scopes: ["CA"],
    lineItems: []
  }
] as const;

export const components = [
  ["onTime", "On-time delivery", 82, 30],
  ["quality", "Quality", 91, 25],
  ["revisionEfficiency", "Revision efficiency", 76, 15],
  ["updateDiscipline", "Update discipline", 88, 15],
  ["workloadCompletion", "Workload completion", 80, 15]
].map(([key, label, score, weight]) => ({
  key,
  label,
  score,
  configuredWeight: weight,
  effectiveWeight: weight,
  eligibleCount: 4,
  explanation: `${label} is calculated by the server.`
}));

export const kpiTasks = [
  {
    id: "task-circulation",
    projectId: "project-aurora-villa",
    title: "Circulation planning",
    status: "blocked",
    progress: 55,
    currentDeadlineAt: "2026-07-29T17:00:00.000Z",
    plannedEffort: 16,
    risk: {
      level: "red",
      reason: "Deadline passed while work is incomplete.",
      elapsedRatio: 1.1,
      progressRatio: 0.55
    },
    events: {
      items: [
        {
          id: "event-note-1",
          taskId: "task-circulation",
          actorId: designer.id,
          type: "note_added",
          occurredAt: "2026-07-25T09:30:00.000Z",
          from: {},
          to: {},
          note: "Waiting for the revised structural grid.",
          createdAt: "2026-07-25T09:30:00.000Z"
        }
      ],
      href: "/api/v1/tasks/task-circulation/events",
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
    }
  },
  {
    id: "task-concept",
    projectId: "project-aurora-studio",
    title: "Concept direction",
    status: "in_progress",
    progress: 45,
    currentDeadlineAt: "2026-08-01T17:00:00.000Z",
    plannedEffort: 10,
    risk: {
      level: "yellow",
      reason: "Forecast completion crosses the deadline.",
      elapsedRatio: 0.6,
      progressRatio: 0.45,
      forecastCompletion: "2026-08-04T10:00:00.000Z"
    },
    events: {
      items: [],
      href: "/api/v1/tasks/task-concept/events",
      pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
    }
  }
];

export const aggregates = {
  taskCounts: { total: 2, completed: 0, active: 2 },
  riskCounts: { gray: 0, green: 0, yellow: 1, red: 1 },
  effort: {
    planned: 26,
    completed: 0,
    remaining: 26,
    workloadPercentage: 100
  },
  projects: [
    {
      projectId: "project-aurora-villa",
      totalTasks: 1,
      completedTasks: 0,
      progress: 0,
      riskCounts: { gray: 0, green: 0, yellow: 0, red: 1 }
    },
    {
      projectId: "project-aurora-studio",
      totalTasks: 1,
      completedTasks: 0,
      progress: 0,
      riskCounts: { gray: 0, green: 0, yellow: 1, red: 0 }
    }
  ],
  recentActivity: [
    {
      taskId: "task-circulation",
      projectId: "project-aurora-villa",
      taskTitle: "Circulation planning",
      event: kpiTasks[0].events.items[0]
    }
  ]
};

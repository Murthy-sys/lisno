// Synthetic records reused from features/client/ClientDashboard.test.tsx. No runtime test imports.
export const client = { id: "client-1", name: "Aurora Homes", email: "client@lisno.example", role: "client" as const };

export const projects = [
  { id: "project-villa", name: "Aurora Villa", clientId: "client-1", initiatingDesignerId: "designer-1", assignedDesignerIds: ["designer-1"], managerId: "manager-1", status: "active", location: "Bengaluru", plannedStartAt: "2026-06-01T00:00:00.000Z", plannedEndAt: "2026-09-30T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
  { id: "project-loft", name: "Cedar Loft", clientId: "client-1", initiatingDesignerId: "designer-1", assignedDesignerIds: ["designer-1"], managerId: "manager-1", status: "planning", location: "Mysuru", plannedStartAt: "2026-07-01T00:00:00.000Z", plannedEndAt: "2026-10-30T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" }
];

export const summaries = projects.map((project, index) => ({
  id: project.id,
  name: project.name,
  status: project.status,
  location: project.location,
  plannedStartAt: project.plannedStartAt,
  plannedEndAt: project.plannedEndAt,
  actualStartAt: project.actualStartAt,
  actualEndAt: project.actualEndAt,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  progress: index === 0 ? 64 : 0,
  floorCount: index === 0 ? 3 : 1
}));

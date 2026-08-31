const dashboardRead = {
  permission: "admin.dashboard.read",
  scope: { kind: "non_project", namespace: "super_admin_dashboard" },
  operationClass: "read",
  superAdminBehavior: "global_read",
  availability: "super_admin_dashboard"
} as const;

export const EXPECTED_SUPER_ADMIN_DASHBOARD_OPERATIONS = [
  { key: "GET /admin/dashboard/overview", ...dashboardRead },
  { key: "GET /admin/dashboard/projects", ...dashboardRead },
  { key: "GET /admin/dashboard/workforce", ...dashboardRead }
] as const;

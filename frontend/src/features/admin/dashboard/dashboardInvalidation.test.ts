import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mutationFiles = [
  "src/features/admin/AdminProjectInitiationDialog.tsx",
  "src/features/admin/ClientResponseDecisionDialog.tsx",
  "src/features/admin/DesignPlanResponseInboxPage.tsx",
  "src/features/admin/DesignAssignmentPanel.tsx",
  "src/features/admin/WorkerAssignmentPanel.tsx",
  "src/features/admin/UserMutationDialog.tsx",
  "src/features/admin/InviteUserDialog.tsx",
  "src/features/admin/InvitationActionDialog.tsx",
  "src/features/access/AccessRequestDecisionDialog.tsx",
  "src/features/finance/ProjectFinancePanel.tsx",
  "src/features/procurement/ProcurementProjectPage.tsx",
  "src/features/workflow/OperationalTaskQueue.tsx",
  "src/components/tasks/TaskUpdateDialog.tsx",
  "src/features/manager/DeadlineRevisionDialog.tsx"
] as const;

describe("dashboard mutation freshness registry", () => {
  it.each(mutationFiles)("keeps the dashboard root in the mutation's cache-invalidation registry in %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(source).toContain("dashboardKeys");
    expect(source).toContain("queryKey: dashboardKeys.all");
  });
});

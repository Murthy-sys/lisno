import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectWorkflowTask } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import { OperationalTaskQueue } from "./OperationalTaskQueue";

const statusAuth = vi.hoisted(() => ({ role: "worker_carpenter" as "worker_carpenter" | "site_manager" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  user: { id: "participant-a", role: statusAuth.role }, status: "authenticated",
  authorization: { role: statusAuth.role, permissions: statusAuth.role === "site_manager"
    ? ["projects.status.read", "procurement.site_completion.manage"] : ["projects.status.read"] }
}) }));

const carpenterTask: ProjectWorkflowTask = {
  id: "workflow-task-1",
  projectId: "project-1",
  projectName: "Aurora Villa",
  estimateId: "estimate-1",
  kind: "trade_execution",
  title: "Carpentry · Living Room",
  description: "Execute the approved wardrobe estimate section.",
  assigneeRole: "worker_carpenter",
  assignedWorker: {
    id: "worker-carpenter-1",
    name: "Kiran Carpenter",
    email: "kiran@example.com",
    role: "worker_carpenter",
    active: true
  },
  sourceSectionId: "CA",
  roomName: "Living Room",
  status: "in_progress",
  progress: 25,
  version: 2,
  openedAt: "2026-08-25T08:15:00.000Z",
  updatedAt: "2026-08-26T09:30:00.000Z"
};

beforeEach(() => server.use(http.get("/api/v1/projects/:projectId/status", ({ params }) => {
  const projectId = String(params.projectId);
  return HttpResponse.json({ data: {
    projectId, projectName: projectId === "project-1" ? "Aurora Villa" : "Lake House", projectStatus: "active",
    serverNow: "2026-10-01T08:00:00Z", state: "active", currentStage: { key: "trade_execution", label: "Trade execution" }, issue: null, pendingActions: []
  } });
})));
afterEach(() => { statusAuth.role = "worker_carpenter"; vi.restoreAllMocks(); });

describe("OperationalTaskQueue", () => {
  it("preserves an unsaved progress draft when the worker keeps editing", async () => {
    server.use(http.get("/api/v1/workflow-tasks", () => HttpResponse.json({ data: [carpenterTask] })));
    const user = userEvent.setup();
    renderWithQuery(<OperationalTaskQueue role="worker_carpenter" />);
    await user.click(await screen.findByRole("button", { name: "Update progress for Carpentry · Living Room" }));
    const progress = screen.getByLabelText("Progress percentage");
    await user.clear(progress);
    await user.type(progress, "60");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(progress).toHaveValue(60);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("25% complete")).toBeVisible();
  });

  it("renders the worker queue with progress and trade context", async () => {
    server.use(
      http.get("/api/v1/workflow-tasks", () =>
        HttpResponse.json({ data: [carpenterTask] })
      )
    );

    renderWithQuery(<OperationalTaskQueue role="worker_carpenter" />);

    await screen.findByRole("heading", { name: "Carpentry · Living Room" });
    const queue = screen.getByRole("region", { name: "Your project tasks" });
    const task = within(queue).getByRole("article", {
      name: "Carpentry · Living Room task"
    });
    expect(within(queue).getByText("1 open")).toBeVisible();
    expect(within(task).getByText("Aurora Villa")).toBeVisible();
    expect(within(task).getByText("Carpenter")).toBeVisible();
    expect(within(task).getByText("Kiran Carpenter")).toBeVisible();
    expect(within(task).getByText("Living Room")).toBeVisible();
    expect(within(task).getByText("25 Aug 2026, 08:15")).toBeVisible();
    expect(within(task).getByText("26 Aug 2026, 09:30")).toBeVisible();
    expect(within(task).getByText("25% complete")).toBeVisible();
    expect(within(task).getByText("Version 2")).toBeVisible();
    expect(within(task).getByRole("progressbar", {
      name: "Carpentry · Living Room: 25% complete"
    })).toHaveAttribute("aria-valuenow", "25");
    expect(within(task).getByRole("button", {
      name: "Update progress for Carpentry · Living Room"
    })).toBeEnabled();
    expect(await within(queue).findByRole("button", { name: "Project status for Aurora Villa" })).toBeEnabled();
  });

  it("opens the status of a worker's project without depending on project messaging", async () => {
    let statusReads = 0;
    server.use(
      http.get("/api/v1/workflow-tasks", () => HttpResponse.json({ data: [carpenterTask, { ...carpenterTask, id: "workflow-task-2", title: "Carpentry · Bedroom" }] })),
      http.get("/api/v1/projects/project-1/status", () => {
        statusReads += 1;
        return HttpResponse.json({ data: {
          projectId: "project-1", projectName: "Aurora Villa", projectStatus: "active", serverNow: "2026-10-01T08:00:00Z", state: "active",
          currentStage: { key: "trade_execution", label: "Trade execution" }, issue: null,
          pendingActions: [{ id: "task-1", stageKey: "trade_execution", stageLabel: "Trade execution", action: "Complete carpentry", responsibleRole: "worker_carpenter", people: [{ id: "worker-1", name: "Kiran Carpenter", role: "worker_carpenter" }], state: "pending", scheduledAt: null, deadlineAt: null, blocker: null }]
        } });
      })
    );
    renderWithQuery(<OperationalTaskQueue role="worker_carpenter" />);
    const trigger = await screen.findByRole("button", { name: "Project status for Aurora Villa" });
    expect(screen.getAllByRole("button", { name: "Project status for Aurora Villa" })).toHaveLength(1);
    expect(statusReads).toBe(1);
    await userEvent.click(trigger);
    expect(await screen.findByText("Complete carpentry")).toBeVisible();
    expect(screen.getByText("Kiran Carpenter", { selector: ".project-status-people strong" })).toBeVisible();
    expect(statusReads).toBe(2);
  });

  it("does not show status for a task project when current membership is denied", async () => {
    let statusReads = 0;
    server.use(
      http.get("/api/v1/workflow-tasks", () => HttpResponse.json({ data: [carpenterTask] })),
      http.get("/api/v1/projects/project-1/status", () => {
        statusReads += 1;
        return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Unavailable" } }, { status: 404 });
      })
    );
    renderWithQuery(<OperationalTaskQueue role="worker_carpenter" />);
    expect(await screen.findByRole("heading", { name: "Carpentry · Living Room" })).toBeVisible();
    await waitFor(() => expect(statusReads).toBe(1));
    expect(screen.queryByRole("button", { name: "Project status for Aurora Villa" })).not.toBeInTheDocument();
  });

  it("validates and saves a versioned worker progress update", async () => {
    let submitted: unknown;
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    server.use(
      http.get("/api/v1/workflow-tasks", () =>
        HttpResponse.json({ data: [carpenterTask] })
      ),
      http.patch("/api/v1/workflow-tasks/workflow-task-1", async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json({
          data: {
            ...carpenterTask,
            status: "in_progress",
            progress: 65,
            version: 3,
            updatedAt: "2026-08-26T10:00:00.000Z"
          }
        });
      })
    );
    const user = userEvent.setup();

    renderWithQuery(<OperationalTaskQueue role="worker_carpenter" />);
    await user.click(await screen.findByRole("button", {
      name: "Update progress for Carpentry · Living Room"
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Update Carpentry · Living Room progress"
    });
    const progress = within(dialog).getByLabelText("Progress percentage");
    await user.clear(progress);
    await user.type(progress, "101");
    await user.click(within(dialog).getByRole("button", { name: "Save progress" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Progress must be a whole number from 0 to 100."
    );
    expect(submitted).toBeUndefined();

    await user.clear(progress);
    await user.type(progress, "65");
    await user.click(within(dialog).getByRole("button", { name: "Save progress" }));

    await waitFor(() => expect(submitted).toEqual({ version: 2, progress: 65 }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const updated = screen.getByRole("article", {
      name: "Carpentry · Living Room task"
    });
    expect(within(updated).getByText("65% complete")).toBeVisible();
    expect(within(updated).getByText("Version 3")).toBeVisible();
    expect(within(updated).getByRole("progressbar", {
      name: "Carpentry · Living Room: 65% complete"
    })).toHaveAttribute("aria-valuenow", "65");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dashboardKeys.all });
  });

  it("refreshes a stale task version before the worker tries again", async () => {
    let listRequests = 0;
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const refreshedTask: ProjectWorkflowTask = {
      ...carpenterTask,
      progress: 40,
      version: 3,
      updatedAt: "2026-08-26T10:15:00.000Z"
    };
    server.use(
      http.get("/api/v1/workflow-tasks", () => {
        listRequests += 1;
        return HttpResponse.json({
          data: [listRequests === 1 ? carpenterTask : refreshedTask]
        });
      }),
      http.patch("/api/v1/workflow-tasks/workflow-task-1", () =>
        HttpResponse.json({
          error: {
            code: "WORKFLOW_TASK_STALE",
            message: "This task changed before your progress update was saved."
          }
        }, { status: 409 })
      )
    );
    const user = userEvent.setup();

    renderWithQuery(<OperationalTaskQueue role="worker_carpenter" />);
    await user.click(await screen.findByRole("button", {
      name: "Update progress for Carpentry · Living Room"
    }));
    let dialog = screen.getByRole("dialog", {
      name: "Update Carpentry · Living Room progress"
    });
    let progress = within(dialog).getByLabelText("Progress percentage");
    await user.clear(progress);
    await user.type(progress, "65");
    await user.click(within(dialog).getByRole("button", { name: "Save progress" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This task changed before your progress update was saved."
    );
    dialog = screen.getByRole("dialog", {
      name: "Update Carpentry · Living Room progress"
    });
    progress = within(dialog).getByLabelText("Progress percentage");
    expect(progress).toHaveValue(40);
    expect(listRequests).toBe(2);
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: dashboardKeys.all });
  });

  it("lets the assigned Site Manager save 100% before sending completion to the Client", async () => {
    statusAuth.role = "site_manager";
    const siteTask: ProjectWorkflowTask = {
      ...carpenterTask,
      id: "workflow-site-1",
      kind: "site_execution",
      completionAuthority: "vendor_client",
      title: "Plan site execution",
      description: "Coordinate the approved work.",
      assigneeRole: "site_manager",
      sourceSectionId: null,
      roomName: null,
      progress: 30,
      version: 1
    };
    let current = { projectId: "project-1", projectStatus: "active", version: 1, progress: 30,
      note: "", status: "draft", currentRound: 0, canSubmit: false, blockers: [] as string[], review: null };
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.get("/api/v1/workflow-tasks", () =>
        HttpResponse.json({ data: [siteTask] })
      ),
      http.get("/api/v1/projects/project-1/site-completion", () => HttpResponse.json({ data: current })),
      http.get("/api/v1/projects/project-1/vendor-work-progress", () => HttpResponse.json({ data: { projectId: "project-1", assignments: [{
        id: "vendor-section-1", projectId: "project-1", vendorId: "vendor-1", orderId: "order-1", sectionLabel: "Carpentry",
        roomName: "Living room", itemName: "TV unit", scopeType: "execution", description: "Install TV unit", targetDate: "2026-11-01",
        status: "ready", progress: 0, displayProgress: current.progress === 100 ? 100 : 0,
        progressSource: current.progress === 100 ? "site_manager" : "vendor", note: "", imageCount: 0, imageIds: [],
        requestedChangeReason: null, submittedAt: null, acceptedAt: null
      }], pendingOwner: "site_manager" } })),
      http.patch("/api/v1/projects/project-1/site-completion/progress", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        current = { ...current, version: current.version + 1, progress: Number(body.progress), note: String(body.note), canSubmit: body.progress === 100 };
        return HttpResponse.json({ data: current });
      }),
      http.post("/api/v1/projects/project-1/site-completion/submit", async ({ request }) => {
        sent.push(await request.json() as Record<string, unknown>);
        current = { ...current, version: current.version + 1, status: "pending_client", canSubmit: false };
        return HttpResponse.json({ data: current });
      })
    );

    renderWithQuery(<OperationalTaskQueue role="site_manager" />);

    const overview = await screen.findByRole("region", {
      name: "Site execution overview"
    });
    expect(await within(overview).findByRole("heading", { name: "Aurora Villa completion" })).toBeVisible();
    expect(within(overview).getByRole("button", { name: "Project status for Aurora Villa" })).toBeVisible();
    const complete = within(overview).getByRole("button", { name: "Complete and send to Client" });
    expect(complete).toBeDisabled();
    const progress = within(overview).getByRole("spinbutton", { name: "Project execution progress (%)" });
    await userEvent.clear(progress);
    await userEvent.type(progress, "100");
    expect(within(overview).getByText("Save 100% progress first. Then send completion to the Client.")).toBeVisible();
    await userEvent.click(within(overview).getByRole("button", { name: "Save 100% progress" }));
    await waitFor(() => expect(complete).toBeEnabled());
    expect(await within(overview).findByText("100% · Site Manager verified")).toBeVisible();
    await userEvent.click(complete);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ expectedVersion: 2 });
    expect(await within(overview).findByText("Completion is with the Client for review.")).toBeVisible();
  });

  it("keeps legacy Site Manager coordination tasks on their existing update action", async () => {
    statusAuth.role = "site_manager";
    server.use(http.get("/api/v1/workflow-tasks", () => HttpResponse.json({ data: [{
      ...carpenterTask, id: "legacy-site-task", kind: "site_execution", completionAuthority: "legacy_staff",
      title: "Plan site execution", assigneeRole: "site_manager", sourceSectionId: null, roomName: null
    }] })));
    renderWithQuery(<OperationalTaskQueue role="site_manager" />);
    expect(await screen.findByRole("heading", { name: "Your coordination tasks" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Update progress for Plan site execution" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Complete and send to Client" })).not.toBeInTheDocument();
  });
});

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import type { ProjectWorkflowTask } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { OperationalTaskQueue } from "./OperationalTaskQueue";

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

describe("OperationalTaskQueue", () => {
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
  });

  it("validates and saves a versioned worker progress update", async () => {
    let submitted: unknown;
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
  });

  it("refreshes a stale task version before the worker tries again", async () => {
    let listRequests = 0;
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
  });

  it("gives Site Managers a grouped, read-only view of trade progress", async () => {
    const siteTask: ProjectWorkflowTask = {
      ...carpenterTask,
      id: "workflow-site-1",
      kind: "site_execution",
      title: "Plan site execution",
      description: "Coordinate the approved work.",
      assigneeRole: "site_manager",
      sourceSectionId: null,
      roomName: null,
      progress: 30,
      version: 1
    };
    const completedPlumbing: ProjectWorkflowTask = {
      ...carpenterTask,
      id: "workflow-plumber-1",
      projectId: "project-2",
      projectName: "Lake House",
      title: "Civil & Plumbing · Kitchen",
      assigneeRole: "worker_plumber",
      sourceSectionId: "CV",
      roomName: "Kitchen",
      status: "completed",
      progress: 100,
      version: 4
    };
    server.use(
      http.get("/api/v1/workflow-tasks", () =>
        HttpResponse.json({ data: [siteTask, carpenterTask, completedPlumbing] })
      )
    );

    renderWithQuery(<OperationalTaskQueue role="site_manager" />);

    const overview = await screen.findByRole("region", {
      name: "Site execution overview"
    });
    expect(await within(overview).findByRole("heading", {
      name: "Your coordination tasks"
    })).toBeVisible();
    expect(within(overview).getByRole("button", {
      name: "Update progress for Plan site execution"
    })).toBeEnabled();
    const workers = within(overview).getByRole("region", {
      name: "Worker progress"
    });
    expect(within(workers).getByRole("heading", {
      name: "Aurora Villa",
      level: 4
    })).toBeVisible();
    expect(within(workers).getByRole("heading", {
      name: "Lake House",
      level: 4
    })).toBeVisible();
    expect(within(workers).getByText("0 of 1 complete")).toBeVisible();
    expect(within(workers).getByText("1 of 1 complete")).toBeVisible();
    expect(within(workers).getByRole("progressbar", {
      name: "Carpentry · Living Room: 25% complete"
    })).toHaveAttribute("aria-valuenow", "25");
    expect(within(workers).getByRole("progressbar", {
      name: "Civil & Plumbing · Kitchen: 100% complete"
    })).toHaveAttribute("aria-valuenow", "100");
    expect(within(workers).queryByRole("button", { name: /Update progress/ }))
      .not.toBeInTheDocument();
  });
});

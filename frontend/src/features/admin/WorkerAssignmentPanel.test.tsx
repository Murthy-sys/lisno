import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import type { AdminProjectSummary, ProjectWorkflowTask } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { WorkerAssignmentPanel } from "./WorkerAssignmentPanel";

const project: AdminProjectSummary = {
  id: "project-1",
  name: "Aurora Villa",
  status: "planning",
  location: "Bengaluru",
  client: { name: "Rhea", email: "rhea@example.com", mobile: "9000000000" },
  propertyType: "Villa",
  budgetMin: 1_000_000,
  budgetMax: 2_000_000,
  estimator: null,
  lead: null,
  estimate: {
    id: "estimate-1",
    status: "client_approved",
    total: 1_180_000,
    designPlanStatus: "approved",
    designPlanVersion: 2
  },
  createdAt: "2026-08-20T10:00:00.000Z"
};

const task: ProjectWorkflowTask = {
  id: "task-carpentry",
  projectId: project.id,
  projectName: project.name,
  estimateId: "estimate-1",
  kind: "trade_execution",
  title: "Carpentry · Living Room",
  description: "Execute approved carpentry work.",
  assigneeRole: "worker_carpenter",
  assignedWorker: {
    id: "worker-1",
    name: "Kiran Carpenter",
    email: "kiran@example.com",
    role: "worker_carpenter",
    active: true
  },
  sourceSectionId: "CA",
  roomName: "Living Room",
  status: "open",
  progress: 0,
  version: 1,
  openedAt: "2026-08-26T08:00:00.000Z",
  updatedAt: "2026-08-26T08:00:00.000Z"
};

const financeTask: ProjectWorkflowTask = {
  ...task,
  id: "task-finance",
  kind: "finance",
  title: "Open approved project budget",
  description: "Review the approved Estimate.",
  assigneeRole: "finance_head",
  assignedWorker: null,
  sourceSectionId: null,
  roomName: null,
  status: "in_progress",
  progress: 45
};

describe("WorkerAssignmentPanel", () => {
  it("filters workers by trade and saves a versioned reassignment", async () => {
    const received = vi.fn();
    server.use(
      http.get("/api/v1/admin/projects/project-1/workflow-tasks", () =>
        HttpResponse.json({ data: [financeTask, task] })
      ),
      http.get("/api/v1/admin/workers", () =>
        HttpResponse.json({
          data: [
            { id: "worker-1", name: "Kiran Carpenter", email: "kiran@example.com", role: "worker_carpenter" },
            { id: "worker-2", name: "Asha Carpenter", email: "asha@example.com", role: "worker_carpenter" },
            { id: "worker-electrician", name: "Dev Electrician", email: "dev@example.com", role: "worker_electrician" }
          ]
        })
      ),
      http.post("/api/v1/execution/worker-assignments/override", async ({ request }) => {
        received(await request.json());
        return HttpResponse.json({
          data: {
            ...task,
            version: 2,
            assignedWorker: {
              id: "worker-2",
              name: "Asha Carpenter",
              email: "asha@example.com",
              role: "worker_carpenter",
              active: true
            }
          }
        });
      })
    );

    const user = userEvent.setup();
    renderWithQuery(<WorkerAssignmentPanel project={project} />);

    const row = await screen.findByRole("article", {
      name: "Carpentry · Living Room worker assignment"
    });
    expect(screen.getByRole("article", {
      name: "Open approved project budget progress"
    })).toHaveTextContent("45% complete");
    const select = within(row).getByRole("combobox", { name: "Assigned worker" });
    expect(within(select).queryByRole("option", { name: /Dev Electrician/ })).not.toBeInTheDocument();
    await user.selectOptions(select, "worker-2");
    await user.click(within(row).getByRole("button", { name: "Reassign Worker" }));

    await waitFor(() => expect(received).toHaveBeenCalledWith({
      projectId: "project-1",
      taskId: "task-carpentry",
      expectedVersion: 1,
      workerId: "worker-2"
    }));
    expect(await within(row).findByText("Worker assignment saved.")).toBeVisible();
  });

  it("does not query execution data before design approval", () => {
    const projectRequests = vi.fn();
    server.use(
      http.get("/api/v1/admin/projects/project-1/workflow-tasks", () => {
        projectRequests();
        return HttpResponse.json({ data: [] });
      })
    );

    renderWithQuery(
      <WorkerAssignmentPanel
        project={{
          ...project,
          estimate: { ...project.estimate!, designPlanStatus: "ready_for_client" }
        }}
      />
    );

    expect(screen.getByText(/Worker assignment opens after/)).toBeVisible();
    expect(projectRequests).not.toHaveBeenCalled();
  });
});

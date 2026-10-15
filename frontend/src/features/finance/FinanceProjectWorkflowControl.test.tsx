import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { AUTHORIZATION_POLICY_VERSION, type PermissionCode } from "../../api/authorization-contract";
import { tokenStorage } from "../../api/client";
import type {
  AdminProjectSummary,
  ProjectWorkflowSectionAssignment,
  ProjectWorkflowTask,
  Role
} from "../../api/types";
import { ProjectWorkflowSnapshot } from "./FinanceProjectWorkflowControl";
import { renderWithQuery, renderApp } from "../../test/render";
import { server } from "../../test/server";

vi.mock("./ProjectFinancePanel", async (importOriginal) => ({
  ...await importOriginal<typeof import("./ProjectFinancePanel")>(),
  ProjectFinancePanel: () => (
    <section aria-labelledby="test-finance-bucket-title">
      <h2 id="test-finance-bucket-title">Finance bucket</h2>
      <p>No project costs have been recorded.</p>
    </section>
  )
}));

const project: AdminProjectSummary = {
  id: "project-one",
  name: "Aurora Villa",
  status: "active",
  location: "Bengaluru",
  client: { name: "Rhea", email: "rhea@example.com", mobile: "9000000000" },
  propertyType: "Villa",
  budgetMin: 1_000_000,
  budgetMax: 2_000_000,
  estimator: { id: "estimator-one", name: "Priya", email: "priya@example.com" },
  lead: null,
  estimate: {
    id: "estimate-one",
    leadId: "lead-one",
    projectId: "project-one",
    resolvedProjectId: "project-one",
    projectLinkSource: "estimate_and_lead",
    version: 4,
    status: "client_approved",
    subtotal: 1_000_000,
    gst: 180_000,
    total: 1_180_000,
    clientDecisionAt: "2026-08-24T09:00:00.000Z",
    clientDecisionSource: "client_portal",
    approvedBaseline: {
      estimateVersion: 4,
      reviewRoundId: "estimate-round-one",
      subtotal: 1_000_000,
      gst: 180_000,
      total: 1_180_000,
      decisionAt: "2026-08-24T09:00:00.000Z",
      decisionSource: "client_portal"
    },
    designPlanStatus: "approved",
    designPlanVersion: 2,
    designPlanDesigner: {
      id: "designer-one",
      name: "Ananya Designer",
      email: "ananya@example.com"
    }
  },
  createdAt: "2026-08-20T10:00:00.000Z"
};

const tradeTask: ProjectWorkflowTask = {
  id: "task-carpentry",
  projectId: project.id,
  projectName: project.name,
  estimateId: "estimate-one",
  kind: "trade_execution",
  title: "Carpentry · Living Room",
  description: "Execute approved carpentry work.",
  assigneeRole: "worker_carpenter",
  assignedWorker: {
    id: "worker-one",
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

const workflowTasks: ProjectWorkflowTask[] = [
  {
    ...tradeTask,
    id: "task-procurement",
    kind: "procurement",
    title: "Procure approved materials",
    description: "Purchase approved materials.",
    assigneeRole: "procurement",
    assignedWorker: null,
    sourceSectionId: null,
    roomName: null,
    status: "in_progress",
    progress: 50
  },
  {
    ...tradeTask,
    id: "task-site",
    kind: "site_execution",
    title: "Coordinate project delivery",
    description: "Monitor trade execution.",
    assigneeRole: "site_manager",
    assignedWorker: null,
    sourceSectionId: null,
    roomName: null,
    status: "in_progress",
    progress: 25
  },
  tradeTask
];

const carpentrySection: ProjectWorkflowSectionAssignment = {
  id: "section-assignment-carpentry",
  projectId: project.id,
  projectName: project.name,
  estimateId: "estimate-one",
  designPlanVersion: 2,
  sourceSectionId: "CA",
  sectionLabel: "Carpentry",
  assigneeRole: "worker_carpenter",
  assignedWorker: {
    id: "worker-one",
    name: "Kiran Carpenter",
    email: "kiran@example.com",
    role: "worker_carpenter",
    active: true
  },
  assignmentState: "assigned",
  status: "open",
  progress: 0,
  taskCount: 2,
  unfinishedTaskCount: 2,
  revision: "carpentry-revision-1",
  updatedAt: "2026-08-26T08:00:00.000Z"
};

function installSession(role: Role, permissions: PermissionCode[]) {
  tokenStorage.set(`${role}-token`);
  server.use(
    http.get("/api/v1/auth/me", () => HttpResponse.json({
      data: {
        id: `${role}-one`,
        name: role === "super_admin" ? "Super Admin" : "Finance Manager",
        email: `${role}@lisno.example`,
        role
      }
    })),
    http.get("/api/v1/auth/authorization", () => HttpResponse.json({
      data: {
        role,
        policyVersion: AUTHORIZATION_POLICY_VERSION,
        permissions
      }
    }))
  );
}

describe("Finance project workflow control", () => {
  it("shows Super Admin the complete workflow and saves one exact section reassignment", async () => {
    installSession("super_admin", [
      "identity.self.read",
      "identity.authorization.read",
      "projects.read",
      "execution.worker_assignment.override",
      "finance.bucket.read",
      "finance.entry.read",
      "finance.entry.create"
    ]);
    const assignment = vi.fn();
    const adminProjectRequest = vi.fn();
    const adminTaskRequest = vi.fn();
    const adminWorkerRequest = vi.fn();
    server.use(
      http.get("/api/v1/admin/projects/project-one", () => {
        adminProjectRequest();
        return HttpResponse.json({ data: project });
      }),
      http.get("/api/v1/admin/projects/project-one/workflow-tasks", () => {
        adminTaskRequest();
        return HttpResponse.json({ data: workflowTasks });
      }),
      http.get("/api/v1/admin/projects/project-one/section-assignments", () =>
        HttpResponse.json({ data: [carpentrySection] })
      ),
      http.get("/api/v1/admin/workers", () => {
        adminWorkerRequest();
        return HttpResponse.json({
          data: [
            { id: "worker-one", name: "Kiran Carpenter", email: "kiran@example.com", role: "worker_carpenter" },
            { id: "worker-two", name: "Asha Carpenter", email: "asha@example.com", role: "worker_carpenter" },
            { id: "worker-electrician", name: "Dev Electrician", email: "dev@example.com", role: "worker_electrician" }
          ]
        });
      }),
      http.post("/api/v1/execution/section-worker-assignments/override", async ({ request }) => {
        assignment(await request.json());
        return HttpResponse.json({
          data: {
            ...carpentrySection,
            revision: "carpentry-revision-2",
            assignedWorker: {
              id: "worker-two",
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

    renderApp(["/finance/projects/project-one"]);

    expect(await screen.findByRole("heading", { name: "Budget and delivery control" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Entire project workflow" })).toBeVisible();
    const estimateStage = screen.getByRole("heading", { name: "2. Estimate approved" }).closest("section")!;
    expect(estimateStage).toHaveTextContent("Approved");
    expect(estimateStage).toHaveTextContent("₹11,80,000 approved commercial value");
    const assignmentStage = screen.getByRole("heading", { name: "3. Designer assigned" }).closest("section")!;
    expect(assignmentStage).toHaveTextContent("Ananya Designer · ananya@example.com");
    const submissionStage = screen.getByRole("heading", { name: "4. Design uploaded and submitted to Client" }).closest("section")!;
    expect(submissionStage).toHaveTextContent("Submitted");
    expect(submissionStage).toHaveTextContent("design plan version 2");
    const approvalStage = screen.getByRole("heading", { name: "5. Design approved" }).closest("section")!;
    expect(approvalStage).toHaveTextContent("Approved by the Client, or by a Sales Manager with recorded proof.");
    const executionStage = screen.getByRole("heading", { name: "6. Execution queues" }).closest("section")!;
    expect(await within(executionStage).findByRole("progressbar", {
      name: "Overall project execution: 25% complete"
    })).toHaveAttribute("aria-valuenow", "25");
    expect(executionStage).toHaveTextContent("0 of 3 tasks complete");

    const taskAssignment = await screen.findByRole("button", { name: "Task assignment" });
    expect(taskAssignment).toHaveAttribute("aria-expanded", "false");
    await user.click(taskAssignment);
    const sectionTrigger = await screen.findByRole("button", { name: /^Carpentry/ });
    await user.click(sectionTrigger);
    expect(adminProjectRequest).toHaveBeenCalledTimes(1);
    expect(adminTaskRequest).toHaveBeenCalledTimes(1);
    expect(adminWorkerRequest).toHaveBeenCalledTimes(1);
    const workerSelect = screen.getByRole("combobox", { name: "Assign or reassign Carpentry" });
    expect(within(workerSelect).queryByRole("option", { name: /Dev Electrician/ })).not.toBeInTheDocument();
    await user.selectOptions(workerSelect, "worker-two");
    await user.click(screen.getByRole("button", { name: "Reassign person" }));

    await waitFor(() => expect(assignment).toHaveBeenCalledWith({
      projectId: "project-one",
      estimateId: "estimate-one",
      designPlanVersion: 2,
      sourceSectionId: "CA",
      expectedRevision: "carpentry-revision-1",
      workerId: "worker-two"
    }));
    expect(await screen.findByText("Carpentry assignment saved.")).toBeVisible();
  });

  it("keeps Finance Manager on the finance-only view without calling Admin APIs", async () => {
    installSession("finance_head", [
      "identity.self.read",
      "identity.authorization.read",
      "finance.bucket.read",
      "finance.entry.read",
      "finance.entry.create"
    ]);
    const adminProjectRequest = vi.fn();
    const adminTaskRequest = vi.fn();
    const adminSectionRequest = vi.fn();
    const adminWorkerRequest = vi.fn();
    server.use(
      http.get("/api/v1/admin/projects/project-one", () => {
        adminProjectRequest();
        return HttpResponse.json({ data: project });
      }),
      http.get("/api/v1/admin/projects/project-one/workflow-tasks", () => {
        adminTaskRequest();
        return HttpResponse.json({ data: workflowTasks });
      }),
      http.get("/api/v1/admin/projects/project-one/section-assignments", () => {
        adminSectionRequest();
        return HttpResponse.json({ data: [carpentrySection] });
      }),
      http.get("/api/v1/admin/workers", () => {
        adminWorkerRequest();
        return HttpResponse.json({ data: [] });
      })
    );

    renderApp(["/finance/projects/project-one"]);

    expect(await screen.findByRole("heading", { name: "Budget detail" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Finance bucket" })).toBeVisible();
    await waitFor(() => expect(screen.getByText("No project costs have been recorded.")).toBeVisible());
    expect(screen.queryByRole("heading", { name: "Entire project workflow" })).not.toBeInTheDocument();
    expect(adminProjectRequest).not.toHaveBeenCalled();
    expect(adminTaskRequest).not.toHaveBeenCalled();
    expect(adminSectionRequest).not.toHaveBeenCalled();
    expect(adminWorkerRequest).not.toHaveBeenCalled();
  });
});


describe("Collaborative project preparation snapshot", () => {
  it("loads post-estimate preparation during draft review and keeps preparation progress out of execution", async () => {
    const request = vi.fn(() => HttpResponse.json({ data: workflowTasks.map((task) => ({ ...task, preparationOnly: true, progress: 100, status: "completed" })) }));
    server.use(http.get("/api/v1/admin/projects/project-one/workflow-tasks", request));
    renderWithQuery(<ProjectWorkflowSnapshot project={{ ...project, estimationWorkflowVersion: 2,
      estimate: { ...project.estimate!, status: "draft", estimationPhase: "post", finalEstimateApproved: true } }} />);
    const stage = screen.getByRole("heading", { name: "7. Execution queues" }).closest("section")!;
    expect(await within(stage).findByText(/1 of 3 preparation tasks assigned/)).toBeVisible();
    expect(stage).toHaveTextContent("execution deadlines and effort tracking start only after Super Admin confirms the initial payment");
    expect(stage).toHaveTextContent("Preparation in progress");
    expect(within(stage).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(stage).queryByText("Complete", { exact: true })).not.toBeInTheDocument();
    const preApproval = screen.getByRole("heading", { name: "2. Pre-estimate approved" }).closest("section")!;
    expect(preApproval).toHaveTextContent("Approved"); expect(request).toHaveBeenCalledOnce();
  });

  it("keeps unequal pre and final amounts out of the pre-approval stage and labels only the approved final baseline", async () => {
    server.use(http.get("/api/v1/admin/projects/project-one/workflow-tasks", () => HttpResponse.json({ data: [] })));
    const preProject: AdminProjectSummary = { ...project, estimationWorkflowVersion: 2,
      estimate: { ...project.estimate!, estimationPhase: "post", finalEstimateApproved: false } };
    const first = renderWithQuery(<ProjectWorkflowSnapshot project={preProject} />);
    const preStageBefore = screen.getByRole("heading", { name: "2. Pre-estimate approved" }).closest("section")!;
    expect(preStageBefore).toHaveTextContent("The Client approved the pre-estimate.");
    expect(preStageBefore).not.toHaveTextContent("₹");
    expect(screen.getByRole("heading", { name: "6. Final estimate approval" }).closest("section")).not.toHaveTextContent("₹");
    await waitFor(() => expect(screen.queryByText("Loading execution and worker status…")).not.toBeInTheDocument());
    first.unmount();

    renderWithQuery(<ProjectWorkflowSnapshot project={{ ...preProject, estimate: { ...preProject.estimate!,
      finalEstimateApproved: true, total: 1_770_000, approvedBaseline: { ...preProject.estimate!.approvedBaseline!,
        estimateVersion: 8, reviewRoundId: "final-review", subtotal: 1_500_000, gst: 270_000, total: 1_770_000 } } }} />);
    const preStageAfter = screen.getByRole("heading", { name: "2. Pre-estimate approved" }).closest("section")!;
    const finalStage = screen.getByRole("heading", { name: "6. Final estimate approval" }).closest("section")!;
    expect(preStageAfter).toHaveTextContent("The Client approved the pre-estimate.");
    expect(preStageAfter).not.toHaveTextContent("₹");
    expect(finalStage).toHaveTextContent("₹17,70,000 final approved commercial value");
    expect(screen.queryByText(/₹11,80,000/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading execution and worker status…")).not.toBeInTheDocument());
  });

  it("shows execution progress only after tasks leave preparation", async () => {
    server.use(http.get("/api/v1/admin/projects/project-one/workflow-tasks", () => HttpResponse.json({ data: workflowTasks })));
    renderWithQuery(<ProjectWorkflowSnapshot project={{ ...project, estimationWorkflowVersion: 2,
      estimate: { ...project.estimate!, estimationPhase: "post", finalEstimateApproved: true } }} />);
    expect(await screen.findByRole("progressbar", { name: "Overall project execution: 25% complete" })).toBeVisible();
    expect(screen.queryByText(/preparation tasks assigned/)).not.toBeInTheDocument();
  });
});

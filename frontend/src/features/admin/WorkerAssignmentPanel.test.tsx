import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AdminProjectSummary,
  ProjectWorkflowSectionAssignment,
  ProjectWorkflowTask,
  WorkerAssignmentOption
} from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { adminProjectKeys } from "./adminProjectsApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";
import {
  sectionAssignmentsIntegrityError,
  WorkerAssignmentPanel
} from "./WorkerAssignmentPanel";

const MIXED_ASSIGNMENT_VALUE = "__multiple_assignees__";

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
    leadId: "lead-1",
    projectId: "project-1",
    resolvedProjectId: "project-1",
    projectLinkSource: "estimate_and_lead",
    version: 4,
    status: "client_approved",
    subtotal: 1_000_000,
    gst: 180_000,
    total: 1_180_000,
    clientDecisionAt: "2026-08-24T09:00:00.000Z",
    clientDecisionSource: "client_portal",
    approvedBaseline: {
      estimateVersion: 3,
      reviewRoundId: "round-1",
      subtotal: 1_000_000,
      gst: 180_000,
      total: 1_180_000,
      decisionAt: "2026-08-24T09:00:00.000Z",
      decisionSource: "client_portal"
    },
    designPlanStatus: "approved",
    designPlanVersion: 2
  },
  createdAt: "2026-08-20T10:00:00.000Z"
};

const secondProject: AdminProjectSummary = {
  ...project,
  id: "project-2",
  name: "Blue Loft",
  estimate: {
    ...project.estimate!,
    id: "estimate-2",
    projectId: "project-2",
    resolvedProjectId: "project-2"
  }
};

function ProjectSwitchHarness() {
  const [currentProject, setCurrentProject] = useState(project);
  return (
    <>
      <button type="button" onClick={() => setCurrentProject(secondProject)}>
        Open Blue Loft
      </button>
      <WorkerAssignmentPanel project={currentProject} />
    </>
  );
}

const tradeTask: ProjectWorkflowTask = {
  id: "task-carpentry-living",
  projectId: project.id,
  projectName: project.name,
  estimateId: "estimate-1",
  kind: "trade_execution",
  title: "Carpentry · Living Room",
  description: "Execute approved carpentry work.",
  assigneeRole: "worker_carpenter",
  assignedWorker: null,
  sourceSectionId: "CA",
  roomName: "Living Room",
  status: "open",
  progress: 0,
  version: 1,
  openedAt: "2026-08-26T08:00:00.000Z",
  updatedAt: "2026-08-26T08:00:00.000Z"
};

const procurementTask: ProjectWorkflowTask = {
  ...tradeTask,
  id: "task-procurement",
  kind: "procurement",
  title: "Coordinate approved procurement",
  description: "Coordinate purchases against the approved Estimate.",
  assigneeRole: "procurement",
  sourceSectionId: null,
  roomName: null
};

const financeTask: ProjectWorkflowTask = {
  ...tradeTask,
  id: "task-finance",
  kind: "finance",
  title: "Open approved project budget",
  assigneeRole: "finance_head",
  sourceSectionId: null,
  roomName: null,
  status: "in_progress",
  progress: 45
};

const siteTask: ProjectWorkflowTask = {
  ...tradeTask,
  id: "task-site",
  kind: "site_execution",
  title: "Coordinate site execution",
  assigneeRole: "site_manager",
  sourceSectionId: null,
  roomName: null,
  status: "in_progress",
  progress: 30
};

const kiran = {
  id: "worker-1",
  name: "Kiran Carpenter",
  email: "kiran@example.com",
  role: "worker_carpenter" as const,
  active: true
};

const sectionAssignments: ProjectWorkflowSectionAssignment[] = [
  {
    id: "section-assignment-ca",
    projectId: project.id,
    projectName: project.name,
    estimateId: "estimate-1",
    designPlanVersion: 2,
    sourceSectionId: "CA",
    sectionLabel: "Carpentry",
    assigneeRole: "worker_carpenter",
    assignedWorker: kiran,
    assignmentState: "assigned",
    status: "in_progress",
    progress: 35,
    taskCount: 2,
    unfinishedTaskCount: 2,
    revision: "revision-ca-1",
    updatedAt: "2026-08-26T08:00:00.000Z"
  },
  {
    id: "section-assignment-el",
    projectId: project.id,
    projectName: project.name,
    estimateId: "estimate-1",
    designPlanVersion: 2,
    sourceSectionId: "EL",
    sectionLabel: "Electrical",
    assigneeRole: "worker_electrician",
    assignedWorker: null,
    assignmentState: "unassigned",
    status: "open",
    progress: 0,
    taskCount: 3,
    unfinishedTaskCount: 3,
    revision: "revision-el-1",
    updatedAt: "2026-08-26T08:00:00.000Z"
  },
  {
    id: "section-assignment-pa",
    projectId: project.id,
    projectName: project.name,
    estimateId: "estimate-1",
    designPlanVersion: 2,
    sourceSectionId: "PA",
    sectionLabel: "Painting",
    assigneeRole: "worker_painter",
    assignedWorker: null,
    assignmentState: "mixed",
    status: "in_progress",
    progress: 55,
    taskCount: 2,
    unfinishedTaskCount: 1,
    revision: "revision-pa-1",
    updatedAt: "2026-08-26T08:00:00.000Z"
  },
  {
    id: "section-assignment-pl",
    projectId: project.id,
    projectName: project.name,
    estimateId: "estimate-1",
    designPlanVersion: 2,
    sourceSectionId: "PL",
    sectionLabel: "Plumbing",
    assigneeRole: "worker_plumber",
    assignedWorker: {
      id: "plumber-1",
      name: "Pavan Plumber",
      email: "pavan@example.com",
      role: "worker_plumber",
      active: true
    },
    assignmentState: "assigned",
    status: "completed",
    progress: 100,
    taskCount: 1,
    unfinishedTaskCount: 0,
    revision: "revision-pl-1",
    updatedAt: "2026-08-26T08:00:00.000Z"
  }
];

const workers: WorkerAssignmentOption[] = [
  { id: "worker-1", name: "Kiran Carpenter", email: "kiran@example.com", role: "worker_carpenter" },
  { id: "worker-2", name: "Asha Carpenter", email: "asha@example.com", role: "worker_carpenter" },
  { id: "electrician-1", name: "Dev Electrician", email: "dev@example.com", role: "worker_electrician" },
  { id: "painter-1", name: "Mina Painter", email: "mina@example.com", role: "worker_painter" },
  { id: "plumber-1", name: "Pavan Plumber", email: "pavan@example.com", role: "worker_plumber" },
  { id: "procurement-1", name: "Priya Procurement", email: "priya@example.com", role: "procurement" },
  { id: "site-manager-1", name: "Sana Project Manager", email: "sana@example.com", role: "site_manager" }
];

const allTasks = [
  procurementTask,
  financeTask,
  siteTask,
  tradeTask,
  { ...tradeTask, id: "task-carpentry-bedroom", title: "Carpentry · Bedroom", roomName: "Bedroom" }
];

function installPanel(options: {
  tasks?: ProjectWorkflowTask[];
  sections?: ProjectWorkflowSectionAssignment[];
  workers?: WorkerAssignmentOption[];
} = {}) {
  server.use(
    http.get("/api/v1/admin/projects/project-1/workflow-tasks", () =>
      HttpResponse.json({ data: options.tasks ?? allTasks })
    ),
    http.get("/api/v1/admin/projects/project-1/section-assignments", () =>
      HttpResponse.json({ data: options.sections ?? sectionAssignments })
    ),
    http.get("/api/v1/admin/workers", () =>
      HttpResponse.json({ data: options.workers ?? workers })
    )
  );
}

async function openTaskAssignment(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole("button", { name: "Task assignment" });
  await waitFor(() => expect(trigger).toHaveAccessibleDescription(/sections assigned|summary unavailable/i));
  await user.click(trigger);
  return trigger;
}

async function expectNoAxeViolations() {
  const context = {
    canvas: document.createElement("canvas"),
    clearRect: () => undefined,
    fillText: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    measureText: (text: string) => ({ width: Math.max(text.length, 1) * 10 })
  } as unknown as CanvasRenderingContext2D;
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  try {
    const results = await axe.run(document.body);
    expect(results.violations).toEqual([]);
  } finally {
    getContext.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkerAssignmentPanel", () => {
  it("keeps the Procurement view limited to its assignee without querying trade sections", async () => {
    installPanel();
    const sectionRequests = vi.fn();
    server.use(http.get("/api/v1/admin/projects/project-1/section-assignments", () => {
      sectionRequests();
      return HttpResponse.json({ data: sectionAssignments });
    }));
    renderWithQuery(<WorkerAssignmentPanel project={project} assignmentArea="procurement" />);
    const select = await screen.findByRole("combobox", { name: "Assigned Procurement" });
    expect(within(select).getByRole("option", { name: /Priya Procurement/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Procurement" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Assigned Project Manager" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Site Management/)).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Open approved project budget progress" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Work sections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Task assignment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(sectionRequests).not.toHaveBeenCalled();
    await expectNoAxeViolations();
  });

  it("keeps the Project Manager view separate from Procurement and trade controls", async () => {
    installPanel();
    renderWithQuery(<WorkerAssignmentPanel project={project} assignmentArea="manager" />);
    expect(await screen.findByRole("combobox", { name: "Assigned Project Manager" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Assigned Procurement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Carpentry/ })).not.toBeInTheDocument();
  });

  it("loads only trade sections and people in the Trade teams view", async () => {
    installPanel();
    const taskRequests = vi.fn();
    server.use(http.get("/api/v1/admin/projects/project-1/workflow-tasks", () => {
      taskRequests();
      return HttpResponse.json({ data: allTasks });
    }));
    renderWithQuery(<WorkerAssignmentPanel project={project} assignmentArea="trades" />);
    expect(await screen.findByRole("button", { name: /^Carpentry/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Trade teams" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Assigned Procurement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Assigned Project Manager" })).not.toBeInTheDocument();
    expect(taskRequests).not.toHaveBeenCalled();
    await expectNoAxeViolations();
  });

  it("keeps Trade teams locked before design approval even when initial approval allows coordination", () => {
    const requests = vi.fn();
    server.use(http.get("/api/v1/admin/workers", () => { requests(); return HttpResponse.json({ data: workers }); }));
    renderWithQuery(<WorkerAssignmentPanel assignmentArea="trades" project={{ ...project, estimationWorkflowVersion: 3,
      estimate: { ...project.estimate!, designPlanStatus: "assigned", initialEstimateApproval: { reviewRoundId: "initial-round", estimateVersion: 3, approvedAt: "2026-08-24T09:00:00.000Z" } } }} />);
    expect(screen.getByText("Trade assignment opens after the Client approves the design plan.")).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(requests).not.toHaveBeenCalled();
  });

  it.each([2, 3] as const)("opens v%s coordination after initial approval without fetching trade sections", async (estimationWorkflowVersion) => {
    const sectionRequests = vi.fn();
    installPanel({ tasks: [procurementTask, siteTask, financeTask] });
    server.use(http.get("/api/v1/admin/projects/project-1/section-assignments", () => {
      sectionRequests();
      return HttpResponse.json({ data: sectionAssignments });
    }));
    renderWithQuery(<WorkerAssignmentPanel defaultExpanded project={{ ...project, estimationWorkflowVersion,
      estimate: { ...project.estimate!, status: "draft", designPlanStatus: "pending_assignment", designPlanVersion: 0,
        initialEstimateApproval: { reviewRoundId: "initial-round", estimateVersion: 3, approvedAt: "2026-08-24T09:00:00.000Z" } } }} />);

    expect(await screen.findByRole("combobox", { name: "Assigned Procurement" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Assigned Project Manager" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Task assignment" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Trade assignment opens after the Client approves the design plan/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Carpentry/ })).not.toBeInTheDocument();
    expect(sectionRequests).not.toHaveBeenCalled();
  });

  it("refreshes an empty Procurement list and sends the exact active assignment payload", async () => {
    installPanel({ tasks: [procurementTask], sections: [] });
    let peopleAvailable = false;
    const received = vi.fn();
    server.use(
      http.get("/api/v1/admin/workers", () => HttpResponse.json({ data: peopleAvailable ? workers : [] })),
      http.post("/api/v1/execution/worker-assignments/override", async ({ request }) => {
        received(await request.json());
        return HttpResponse.json({ data: { ...procurementTask, version: 2, assignedWorker: { ...workers.find(worker => worker.role === "procurement"), active: true } } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<WorkerAssignmentPanel project={project} defaultExpanded />);
    expect(await screen.findByText(/No active Procurement people are available/)).toBeVisible();
    const select = screen.getByRole("combobox", { name: "Assigned Procurement" });
    expect(within(select).getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Assign Procurement" })).toBeDisabled();

    peopleAvailable = true;
    await user.click(screen.getByRole("button", { name: "Refresh people" }));
    await within(select).findByRole("option", { name: /Priya Procurement/ });
    expect(within(select).queryByRole("option", { name: /Sana Project Manager/ })).not.toBeInTheDocument();
    await user.selectOptions(select, "procurement-1");
    await user.click(screen.getByRole("button", { name: "Assign Procurement" }));
    expect(await screen.findByText("Procurement assignment saved.")).toBeVisible();
    expect(received).toHaveBeenCalledExactlyOnceWith({ projectId: project.id, taskId: procurementTask.id, expectedVersion: procurementTask.version, workerId: "procurement-1" });
    const current = screen.getByLabelText("Current Procurement");
    expect(current).toHaveTextContent("Priya Procurement");
    expect(current).toHaveTextContent("priya@example.com");
  });

  it("keeps an unavailable current Procurement assignee visible and prevents reassigning that choice", async () => {
    const assignedWorker = { id: "inactive-procurement", name: "Former Procurement", email: "former@example.com", role: "procurement" as const, active: false };
    installPanel({ tasks: [{ ...procurementTask, assignedWorker }], sections: [], workers: [] });
    renderWithQuery(<WorkerAssignmentPanel project={project} defaultExpanded />);
    const select = await screen.findByRole("combobox", { name: "Assigned Procurement" });
    expect(select).toHaveValue(assignedWorker.id);
    expect(within(select).getByRole("option", { name: "Former Procurement · Unavailable" })).toBeDisabled();
    const current = screen.getByLabelText("Current Procurement");
    expect(current).toHaveTextContent(assignedWorker.name);
    expect(current).toHaveTextContent(assignedWorker.email);
    expect(current).toHaveTextContent("unavailable for a new assignment");
    expect(screen.getByRole("button", { name: "Reassign Procurement" })).toBeDisabled();
    expect(screen.getByText(/No active Procurement people are available/)).toBeVisible();
  });

  it("blocks saving a selected person who disappears when the people list is refreshed", async () => {
    installPanel({ tasks: [procurementTask], sections: [] });
    let available = true;
    const received = vi.fn();
    server.use(
      http.get("/api/v1/admin/workers", () => HttpResponse.json({ data: available ? workers : [] })),
      http.post("/api/v1/execution/worker-assignments/override", () => { received(); return HttpResponse.json({ data: procurementTask }); })
    );
    const user = userEvent.setup();
    renderWithQuery(<WorkerAssignmentPanel project={project} defaultExpanded />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Assigned Procurement" }), "procurement-1");
    expect(screen.getByRole("button", { name: "Assign Procurement" })).toBeEnabled();
    available = false;
    await user.click(screen.getByRole("button", { name: "Refresh people" }));
    expect(await screen.findByText(/No active Procurement people are available/)).toBeVisible();
    const assign = screen.getByRole("button", { name: "Assign Procurement" });
    expect(assign).toBeDisabled();
    await user.click(assign);
    expect(received).not.toHaveBeenCalled();
  });

  it("can omit the duplicate Project Manager control while retaining Procurement, Finance and trade sections", async () => {
    installPanel();
    renderWithQuery(<WorkerAssignmentPanel project={project} defaultExpanded showProjectManager={false} />);
    expect(await screen.findByRole("combobox", { name: "Assigned Procurement" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Assigned Project Manager" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Open approved project budget progress" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Carpentry/ })).toBeVisible();
  });

  it("refreshes the matching identity and every scoped Project Manager reader after a site assignment", async () => {
    installPanel();
    const received = vi.fn();
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    server.use(http.post("/api/v1/execution/worker-assignments/override", async ({ request }) => {
      received(await request.json());
      return HttpResponse.json({ data: { ...siteTask, version: siteTask.version + 1, assignedWorker: { ...workers.at(-1), active: true } } });
    }));
    const user = userEvent.setup();
    renderWithQuery(<WorkerAssignmentPanel project={project} />);
    await openTaskAssignment(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "Assigned Project Manager" }), "site-manager-1");
    await user.click(screen.getByRole("button", { name: /^(Assign|Reassign) Project Manager$/ }));
    expect(await screen.findByText("Project Manager assignment saved.")).toBeVisible();
    expect(received).toHaveBeenCalledWith({ projectId: "project-1", taskId: siteTask.id, expectedVersion: siteTask.version, workerId: "site-manager-1" });
    for (const key of ["admin-projects", "project-workflow", "assigned-projects", "project-manager", "execution", "procurement", "project-chat"]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });
  it("resets the outer disclosure closed when the reused panel receives a new project", async () => {
    installPanel();
    server.use(
      http.get("/api/v1/admin/projects/project-2/workflow-tasks", () =>
        HttpResponse.json({ data: [] })
      ),
      http.get("/api/v1/admin/projects/project-2/section-assignments", () =>
        HttpResponse.json({ data: [] })
      )
    );
    const user = userEvent.setup();
    renderWithQuery(<ProjectSwitchHarness />);

    const firstTrigger = await openTaskAssignment(user);
    expect(firstTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Work sections" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Open Blue Loft" }));
    const secondTrigger = screen.getByRole("button", { name: "Task assignment" });
    expect(secondTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "Work sections" })).not.toBeInTheDocument();
    await waitFor(() => expect(secondTrigger).toHaveAccessibleDescription("0 of 0 sections assigned"));
  });

  it("renders one closed section panel per backend section and never renders trade item rows", async () => {
    installPanel();
    const user = userEvent.setup();
    renderWithQuery(<WorkerAssignmentPanel project={project} />);

    const outer = await screen.findByRole("button", { name: "Task assignment" });
    expect(outer).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "Project coordination" })).not.toBeInTheDocument();
    await openTaskAssignment(user);

    expect(screen.getByRole("heading", { name: "Project coordination" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Open approved project budget progress" })).toHaveTextContent("45% complete");
    const site = screen.getByRole("article", { name: "Coordinate site execution assignment" });
    expect(site).toHaveTextContent("30% complete");
    const siteSelect = within(site).getByRole("combobox", { name: "Assigned Project Manager" });
    expect(within(siteSelect).getByRole("option", { name: /Sana Project Manager/ })).toBeVisible();
    expect(within(siteSelect).queryByRole("option", { name: /Priya Procurement/ })).not.toBeInTheDocument();
    const procurement = screen.getByRole("article", { name: "Coordinate approved procurement assignment" });
    const procurementSelect = within(procurement).getByRole("combobox", { name: "Assigned Procurement" });
    expect(within(procurementSelect).getByRole("option", { name: /Priya Procurement/ })).toBeVisible();
    expect(within(procurementSelect).queryByRole("option", { name: /Kiran Carpenter/ })).not.toBeInTheDocument();

    const carpentry = screen.getByRole("button", { name: /^Carpentry/ });
    const electrical = screen.getByRole("button", { name: /^Electrical/ });
    const painting = screen.getByRole("button", { name: /^Painting/ });
    const plumbing = screen.getByRole("button", { name: /^Plumbing/ });
    for (const trigger of [carpentry, electrical, painting, plumbing]) {
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(document.getElementById(trigger.getAttribute("aria-controls")!)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Carpentry · Living Room")).not.toBeInTheDocument();
    expect(screen.queryByText("Carpentry · Bedroom")).not.toBeInTheDocument();

    await user.click(carpentry);
    expect(carpentry).toHaveAttribute("aria-expanded", "true");
    expect(electrical).toHaveAttribute("aria-expanded", "false");
    const carpenterSelect = screen.getByRole("combobox", { name: "Assign or reassign Carpentry" });
    expect(within(carpenterSelect).getByRole("option", { name: /Asha Carpenter/ })).toBeVisible();
    expect(within(carpenterSelect).queryByRole("option", { name: /Dev Electrician/ })).not.toBeInTheDocument();
    expect(screen.getByText("kiran@example.com")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Carpentry: 35% complete" })).toHaveAttribute("aria-valuenow", "35");

    await user.click(electrical);
    expect(carpentry).toHaveAttribute("aria-expanded", "true");
    expect(electrical).toHaveAttribute("aria-expanded", "true");
    await user.click(outer);
    expect(screen.queryByRole("heading", { name: "Work sections" })).not.toBeInTheDocument();
    await user.click(outer);
    expect(screen.getByRole("button", { name: /^Carpentry/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("posts one exact section reassignment and invalidates every affected cache", async () => {
    let snapshot = sectionAssignments;
    let taskRequests = 0;
    let sectionRequests = 0;
    const received = vi.fn();
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    server.use(
      http.get("/api/v1/admin/projects/project-1/workflow-tasks", () => {
        taskRequests += 1;
        return HttpResponse.json({ data: allTasks });
      }),
      http.get("/api/v1/admin/projects/project-1/section-assignments", () => {
        sectionRequests += 1;
        return HttpResponse.json({ data: snapshot });
      }),
      http.get("/api/v1/admin/workers", () => HttpResponse.json({ data: workers })),
      http.post("/api/v1/execution/section-worker-assignments/override", async ({ request }) => {
        received(await request.json());
        const updated = {
          ...sectionAssignments[0],
          assignedWorker: {
            id: "worker-2",
            name: "Asha Carpenter",
            email: "asha@example.com",
            role: "worker_carpenter" as const,
            active: true
          },
          assignmentState: "assigned" as const,
          revision: "revision-ca-2"
        };
        snapshot = [updated, ...sectionAssignments.slice(1)];
        return HttpResponse.json({ data: updated });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<WorkerAssignmentPanel project={project} />);
    await openTaskAssignment(user);
    await user.click(screen.getByRole("button", { name: /^Carpentry/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Assign or reassign Carpentry" }), "worker-2");
    await user.click(screen.getByRole("button", { name: "Reassign person" }));

    await waitFor(() => expect(received).toHaveBeenCalledWith({
      projectId: "project-1",
      estimateId: "estimate-1",
      designPlanVersion: 2,
      sourceSectionId: "CA",
      expectedRevision: "revision-ca-1",
      workerId: "worker-2"
    }));
    expect(await screen.findByText("Carpentry assignment saved.")).toBeVisible();
    await waitFor(() => {
      expect(taskRequests).toBeGreaterThan(1);
      expect(sectionRequests).toBeGreaterThan(1);
    });
    for (const queryKey of [
      projectWorkflowKeys.sectionAssignments("project-1"),
      projectWorkflowKeys.projectTasks("project-1"),
      projectWorkflowKeys.operational,
      adminProjectKeys.all,
      adminProjectKeys.detail("project-1"),
      dashboardKeys.all
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });

  it("requires an explicit mixed-state choice and disables completed assignment controls", async () => {
    installPanel();
    const user = userEvent.setup();
    renderWithQuery(<WorkerAssignmentPanel project={project} />);
    await openTaskAssignment(user);

    await user.click(screen.getByRole("button", { name: /^Painting/ }));
    const mixedSelect = screen.getByRole("combobox", { name: "Assign or reassign Painting" });
    expect(mixedSelect).toHaveValue(MIXED_ASSIGNMENT_VALUE);
    expect(screen.getByRole("button", { name: "Assign person" })).toBeDisabled();
    expect(screen.getAllByText("Multiple assignees")).toHaveLength(2);
    await user.selectOptions(mixedSelect, "painter-1");
    expect(screen.getByRole("button", { name: "Assign person" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /^Plumbing/ }));
    const completedSelect = screen.getByRole("combobox", { name: "Assign or reassign Plumbing" });
    expect(completedSelect).toBeDisabled();
    expect(screen.getByText("Completed section assignments are read-only.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reassign person" })).toBeDisabled();
  });

  it("refetches a stale section without showing a false success and clears obsolete conflict feedback", async () => {
    let snapshot = sectionAssignments;
    let sectionRequests = 0;
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    server.use(
      http.get("/api/v1/admin/projects/project-1/workflow-tasks", () => HttpResponse.json({ data: allTasks })),
      http.get("/api/v1/admin/projects/project-1/section-assignments", () => {
        sectionRequests += 1;
        return HttpResponse.json({ data: snapshot });
      }),
      http.get("/api/v1/admin/workers", () => HttpResponse.json({ data: workers })),
      http.post("/api/v1/execution/section-worker-assignments/override", () => {
        snapshot = sectionAssignments.map((section) => section.sourceSectionId === "EL"
          ? { ...section, revision: "revision-el-2", progress: 10, status: "in_progress" as const }
          : section
        );
        return HttpResponse.json({
          error: {
            code: "WORKFLOW_SECTION_ASSIGNMENT_STALE",
            message: "Section membership changed."
          }
        }, { status: 409 });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<WorkerAssignmentPanel project={project} />);
    await openTaskAssignment(user);
    await user.click(screen.getByRole("button", { name: /^Electrical/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Assign or reassign Electrical" }), "electrician-1");
    await user.click(screen.getByRole("button", { name: "Assign person" }));

    expect(await screen.findByText(/latest Electrical assignment was loaded after a conflict/i)).toBeVisible();
    expect(screen.queryByText("Electrical assignment saved.")).not.toBeInTheDocument();
    expect(screen.queryByText(/changed while you were assigning/i)).not.toBeInTheDocument();
    expect(sectionRequests).toBeGreaterThan(1);
    expect(screen.getByRole("combobox", { name: "Assign or reassign Electrical" })).toHaveValue("");
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: dashboardKeys.all });
  });

  it("keeps loading, error, and empty states inside the opened Task assignment panel", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/admin/projects/project-1/workflow-tasks", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
      http.get("/api/v1/admin/projects/project-1/section-assignments", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      }),
      http.get("/api/v1/admin/workers", async () => {
        await delay("infinite");
        return HttpResponse.json({ data: [] });
      })
    );
    const loadingRender = renderWithQuery(<WorkerAssignmentPanel project={project} />);
    await user.click(screen.getByRole("button", { name: "Task assignment" }));
    expect(screen.getByText("Loading task assignments and active workers…")).toBeVisible();
    loadingRender.unmount();

    server.use(
      http.get("/api/v1/admin/projects/project-1/workflow-tasks", () => HttpResponse.json({ data: [] })),
      http.get("/api/v1/admin/projects/project-1/section-assignments", () => HttpResponse.json({ error: { code: "FAILED", message: "Failed" } }, { status: 500 })),
      http.get("/api/v1/admin/workers", () => HttpResponse.json({ data: [] }))
    );
    const errorRender = renderWithQuery(<WorkerAssignmentPanel project={project} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Task assignment" })).toHaveAccessibleDescription("Assignment summary unavailable"));
    await user.click(screen.getByRole("button", { name: "Task assignment" }));
    expect(screen.getByText("Task assignments could not be loaded.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    errorRender.unmount();

    installPanel({ tasks: [], sections: [], workers: [] });
    renderWithQuery(<WorkerAssignmentPanel project={project} />);
    await openTaskAssignment(user);
    expect(screen.getByText("No project coordination tasks are available.")).toBeVisible();
    expect(screen.getByText("No trade work was selected in the approved Estimate.")).toBeVisible();
  });

  it("fails closed on foreign lineage or duplicate assignment identities", () => {
    expect(sectionAssignmentsIntegrityError(project, [
      { ...sectionAssignments[0], projectId: "foreign-project" }
    ])).toMatch(/do not match/);
    expect(sectionAssignmentsIntegrityError(project, [
      sectionAssignments[0],
      { ...sectionAssignments[1], id: sectionAssignments[0].id }
    ])).toMatch(/duplicate or missing/);
    expect(sectionAssignmentsIntegrityError(project, [
      sectionAssignments[0],
      { ...sectionAssignments[1], sourceSectionId: sectionAssignments[0].sourceSectionId }
    ])).toMatch(/duplicate or missing/);
  });

  it("passes accessibility checks while collapsed and with nested disclosures expanded", async () => {
    installPanel();
    const user = userEvent.setup();
    renderWithQuery(<WorkerAssignmentPanel project={project} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Task assignment" })).toHaveAccessibleDescription(/sections assigned/));
    await expectNoAxeViolations();
    await openTaskAssignment(user);
    await user.click(screen.getByRole("button", { name: /^Carpentry/ }));
    await user.click(screen.getByRole("button", { name: /^Painting/ }));
    await expectNoAxeViolations();
  });

  it("does not query execution data before Design approval", () => {
    const projectRequests = vi.fn();
    server.use(
      http.get("/api/v1/admin/projects/project-1/workflow-tasks", () => {
        projectRequests();
        return HttpResponse.json({ data: [] });
      }),
      http.get("/api/v1/admin/projects/project-1/section-assignments", () => {
        projectRequests();
        return HttpResponse.json({ data: [] });
      })
    );
    renderWithQuery(
      <WorkerAssignmentPanel project={{
        ...project,
        estimate: { ...project.estimate!, designPlanStatus: "ready_for_client" }
      }} />
    );
    expect(screen.getByText(/Worker assignment opens after/)).toBeVisible();
    expect(projectRequests).not.toHaveBeenCalled();
  });
});

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";

const designer = {
  id: "user-designer-ananya",
  name: "Ananya Rao",
  email: "ananya@lisno.example",
  role: "designer" as const
};

const pagination = {
  limit: 100,
  offset: 0,
  total: 2,
  hasMore: false
};

const projects = [
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

const designPlanTasks = [
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

const components = [
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

const kpiTasks = [
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

const aggregates = {
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

function response(data: unknown, init?: ResponseInit) {
  return Response.json({ data }, init);
}

function installDashboardApi(options?: {
  empty?: boolean;
  failProjectsOnce?: boolean;
  kpiHasMore?: boolean;
  missingProjectAggregates?: boolean;
  reverseDesignTasks?: boolean;
}) {
  let projectRequests = 0;
  const mainKpiRequests: string[] = [];
  const taskFeedRequests: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return response(designer);
    if (url === "/api/v1/auth/authorization") return response(authorizationFor(designer.role));
    if (url === "/api/v1/designer/design-plan-tasks") {
      const tasks = options?.reverseDesignTasks
        ? [...designPlanTasks].reverse()
        : designPlanTasks;
      return response(options?.empty ? [] : tasks);
    }
    if (url.startsWith("/api/v1/projects?")) {
      projectRequests += 1;
      if (options?.failProjectsOnce && projectRequests === 1) {
        return Response.json(
          { error: { code: "REQUEST_FAILED", message: "Projects unavailable." } },
          { status: 503 }
        );
      }
      return response({
        items: options?.empty ? [] : projects,
        pagination: options?.empty
          ? { ...pagination, total: 0 }
          : pagination
      });
    }
    if (url.startsWith(`/api/v1/kpis/users/${designer.id}/tasks?`)) {
      taskFeedRequests.push(url);
      const offset = Number(new URL(`https://lisno.test${url}`).searchParams.get("offset"));
      const firstPage = offset === 0;
      return response({
        items: options?.empty
          ? []
          : firstPage
            ? kpiTasks.map(({ events: _events, ...task }) => task)
            : [{
                ...kpiTasks[0],
                id: "task-page-2",
                title: "Loaded later",
                status: "in_progress",
                progress: 10,
                risk: {
                  ...kpiTasks[0].risk,
                  level: "red",
                  reason: "Task is overdue."
                },
                events: undefined
              }],
        pagination: {
          limit: 20,
          offset,
          total: options?.empty ? 0 : options?.kpiHasMore ? 21 : 2,
          hasMore: Boolean(options?.kpiHasMore && firstPage)
        }
      });
    }
    if (url.startsWith(`/api/v1/kpis/users/${designer.id}?`)) {
      mainKpiRequests.push(url);
      return response({
        userId: designer.id,
        periodStartAt: "2000-01-01T00:00:00.000Z",
        periodEndAt: "2100-01-01T00:00:00.000Z",
        score: options?.empty ? 0 : 84,
        components: options?.empty
          ? components.map((component) => ({ ...component, score: null, eligibleCount: 0 }))
          : components,
        aggregates: options?.empty
          ? {
              taskCounts: { total: 0, completed: 0, active: 0 },
              riskCounts: { gray: 0, green: 0, yellow: 0, red: 0 },
              effort: {
                planned: 0,
                completed: 0,
                remaining: 0,
                workloadPercentage: 0
              },
              projects: [],
              recentActivity: []
            }
          : options?.missingProjectAggregates
            ? { ...aggregates, projects: [] }
          : options?.kpiHasMore
            ? {
                ...aggregates,
                taskCounts: { total: 21, completed: 1, active: 20 },
                riskCounts: { gray: 17, green: 1, yellow: 1, red: 2 },
                effort: {
                  planned: 50,
                  completed: 10,
                  remaining: 40,
                  workloadPercentage: 80
                },
                projects: [
                  {
                    projectId: "project-aurora-villa",
                    totalTasks: 20,
                    completedTasks: 1,
                    progress: 5,
                    riskCounts: { gray: 17, green: 1, yellow: 0, red: 2 }
                  },
                  aggregates.projects[1]
                ],
                recentActivity: [
                  {
                    taskId: "task-later-completed",
                    projectId: "project-aurora-villa",
                    taskTitle: "Later completed task",
                    event: {
                      ...kpiTasks[0].events.items[0],
                      id: "event-later-completed",
                      taskId: "task-later-completed",
                      occurredAt: "2026-07-26T09:30:00.000Z",
                      note: "Later-page completion recorded."
                    }
                  }
                ]
              }
            : aggregates,
        tasks: {
          items: options?.empty ? [] : kpiTasks,
          pagination: {
            limit: 20,
            offset: 0,
            total: options?.empty ? 0 : options?.kpiHasMore ? 21 : 2,
            hasMore: Boolean(options?.kpiHasMore)
          }
        }
      });
    }
    throw new Error(`Unhandled request: ${url}`);
  });
  return {
    getMainKpiRequests: () => mainKpiRequests,
    getTaskFeedRequests: () => taskFeedRequests
  };
}

describe("DesignerDashboard", () => {
  it("shows one upload action, compact KPIs, assigned design rows, risk, and activity", async () => {
    tokenStorage.set("valid-token");
    installDashboardApi();
    const user = userEvent.setup();
    const { router } = renderApp(["/designer"]);

    expect(await screen.findByRole("heading", { name: "Design workspace" }))
      .toBeVisible();
    const hero = screen.getByRole("heading", { name: "Design workspace" })
      .closest("header")!;
    // The greeting is supporting copy on the page header, not the page title.
    expect(within(hero).getByText(/Good morning, Ananya\./)).toBeVisible();
    // Uploading starts from the Design plans workspace, so the hero is copy only.
    expect(within(hero).queryAllByRole("link")).toHaveLength(0);
    expect(within(hero).queryByRole("button", { name: "New project" }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Estimate approvals")).not.toBeInTheDocument();
    // The score stays in the collapsed summary; the breakdown is behind the toggle.
    expect(screen.getByLabelText("Personal KPI score")).toHaveTextContent("84");
    expect(screen.queryByLabelText("KPI component breakdown")).not.toBeInTheDocument();
    const kpiToggle = screen.getByRole("button", { name: "Show breakdown" });
    expect(kpiToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(kpiToggle);
    expect(screen.getByLabelText("KPI component breakdown")).toBeVisible();
    for (const component of components) {
      expect(screen.getByText(String(component.label))).toBeVisible();
    }
    await user.click(screen.getByRole("button", { name: "Hide breakdown" }));
    expect(screen.queryByLabelText("KPI component breakdown")).not.toBeInTheDocument();
    expect(
      within(screen.getByText("Active projects").closest("article")!)
        .getByText("1")
    ).toBeVisible();
    // The separate red/yellow queue is gone: priority rides on the project rows.
    expect(screen.queryByText("Red and yellow tasks")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Deadline passed while work is incomplete."))
      .not.toBeInTheDocument();

    const projectRow = screen.getByRole("article", { name: "Aurora Villa" });
    expect(within(projectRow).getByText("Priya Shah")).toBeVisible();
    expect(within(projectRow).getByText("Design plan v1")).toBeVisible();
    expect(within(projectRow).getByText("Extraction in progress")).toBeVisible();
    expect(within(projectRow).getByText(/1 red · 0 yellow/)).toBeVisible();
    expect(within(projectRow).getByText("High priority")).toBeVisible();
    const continueLink = within(projectRow).getByRole("link", {
      name: "Continue design for Aurora Villa"
    });
    expect(continueLink).toHaveAttribute(
      "href",
      "/designer/design-plans?estimate=estimate-aurora-villa"
    );
    await user.click(continueLink);
    expect(router.state.location.pathname).toBe(
      "/designer/design-plans"
    );
  });

  it("shows an assignment-owned empty state without project creation", async () => {
    tokenStorage.set("valid-token");
    installDashboardApi({ empty: true });
    const user = userEvent.setup();
    renderApp(["/designer"]);

    expect(await screen.findByText("No design projects assigned")).toBeVisible();
    expect(
      screen.getByText(
        "Approved estimates will appear after an Admin or Super Admin assigns you."
      )
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /create project/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new project/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByText("No recent task activity yet.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show breakdown" }));
    const unavailable = screen.getByText("On-time delivery").closest("article")!;
    expect(within(unavailable).getByText("Not available")).toBeVisible();
    expect(within(unavailable).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("does not report zero health when KPI project data is unavailable", async () => {
    tokenStorage.set("valid-token");
    installDashboardApi({ missingProjectAggregates: true });
    renderApp(["/designer"]);

    const projectRow = await screen.findByRole("article", { name: "Aurora Villa" });
    expect(within(projectRow).getByText("Not available")).toBeVisible();
    expect(within(projectRow).queryByText(/0% task completion/)).not.toBeInTheDocument();
    expect(within(projectRow).queryByText(/0 red · 0 yellow/)).not.toBeInTheDocument();
  });

  it("sorts red then yellow projects to the top and tags them", async () => {
    tokenStorage.set("valid-token");
    // The API hands back the yellow project first; priority order must win.
    installDashboardApi({ reverseDesignTasks: true });
    renderApp(["/designer"]);

    await screen.findByRole("heading", { name: "Design workspace" });
    const rows = screen.getAllByRole("article").filter((row) =>
      row.classList.contains("designer-project-row")
    );
    expect(rows.map((row) => row.getAttribute("aria-labelledby"))).toEqual([
      "designer-project-project-aurora-villa",
      "designer-project-project-aurora-studio"
    ]);
    expect(within(rows[0]).getByText("High priority")).toBeVisible();
    expect(within(rows[1]).getByText("Priority")).toBeVisible();
    expect(screen.getByText("2 priority · 2 assigned")).toBeVisible();
  });

  it("offers retry when dashboard data cannot be loaded", async () => {
    tokenStorage.set("valid-token");
    installDashboardApi({ failProjectsOnce: true });
    const user = userEvent.setup();
    renderApp(["/designer"]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load your designer workspace."
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Design workspace" }))
        .toBeVisible()
    );
  });

  it("reads the KPI aggregate once and no longer pages the task feed", async () => {
    tokenStorage.set("valid-token");
    const api = installDashboardApi({ kpiHasMore: true });
    renderApp(["/designer"]);

    await screen.findByRole("heading", { name: "Design workspace" });
    expect(api.getMainKpiRequests()).toHaveLength(1);
    // Every number on the page comes from the aggregate, so the paginated
    // task feed that backed the removed queue is never requested.
    expect(api.getTaskFeedRequests()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Load more tasks" }))
      .not.toBeInTheDocument();
    const riskMetric = screen.getByText("At-risk queue").closest("article")!;
    expect(within(riskMetric).getByText("2 red · 1 yellow")).toBeVisible();
    expect(screen.getByText("20 active · 1 completed tasks")).toBeVisible();
    expect(
      screen.getByText("10h completed of 50h · 80% remains")
    ).toBeVisible();
    const projectRow = screen.getByRole("article", { name: "Aurora Villa" });
    expect(within(projectRow).getByText("5%", { exact: false })).toBeVisible();
    expect(within(projectRow).getByText(/2 red · 0 yellow/)).toBeVisible();
    expect(
      within(screen.getByText("Open workload").closest("article")!)
        .getByText("40h")
    ).toBeVisible();
  });
});

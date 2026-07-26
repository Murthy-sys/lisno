import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
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
    status: "active",
    location: "Mumbai",
    plannedStartAt: "2026-06-01T09:00:00.000Z",
    plannedEndAt: "2026-08-01T17:00:00.000Z",
    actualStartAt: "2026-06-01T09:00:00.000Z",
    actualEndAt: null,
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-07-15T08:00:00.000Z"
  }
];

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
}) {
  let projectRequests = 0;
  const mainKpiRequests: string[] = [];
  const taskFeedRequests: string[] = [];
  let createBody: unknown;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return response(designer);
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
    if (url === "/api/v1/projects" && init?.method === "POST") {
      createBody = JSON.parse(String(init.body));
      return response(projects[0], { status: 201 });
    }
    throw new Error(`Unhandled request: ${url}`);
  });
  return {
    getCreateBody: () => createBody,
    getMainKpiRequests: () => mainKpiRequests,
    getTaskFeedRequests: () => taskFeedRequests
  };
}

describe("DesignerDashboard", () => {
  it("shows server KPI components, active project metrics, risk reasons, activity, and project navigation", async () => {
    tokenStorage.set("valid-token");
    installDashboardApi();
    const user = userEvent.setup();
    const { router } = renderApp(["/designer"]);

    expect(await screen.findByRole("heading", { name: "Good morning, Ananya." }))
      .toBeVisible();
    expect(screen.getByLabelText("Personal KPI score")).toHaveTextContent("84");
    for (const component of components) {
      expect(screen.getByText(String(component.label))).toBeVisible();
    }
    expect(
      within(screen.getByText("Active projects").closest("article")!)
        .getByText("2")
    ).toBeVisible();
    expect(screen.getByText("1 red")).toBeVisible();
    expect(screen.getByText("1 yellow")).toBeVisible();
    expect(screen.getByText("Deadline passed while work is incomplete.")).toBeVisible();
    expect(screen.getByText("Waiting for the revised structural grid.")).toBeVisible();

    const projectCard = screen.getByRole("article", { name: "Aurora Villa" });
    expect(within(projectCard).getByText("Bengaluru")).toBeVisible();
    expect(within(projectCard).getByText("Active")).toBeVisible();
    await user.click(within(projectCard).getByRole("link", { name: "Open project" }));
    expect(router.state.location.pathname).toBe(
      "/designer/projects/project-aurora-villa"
    );
  });

  it("shows a clear empty state and keeps project creation available", async () => {
    tokenStorage.set("valid-token");
    installDashboardApi({ empty: true });
    renderApp(["/designer"]);

    expect(await screen.findByText("No projects yet")).toBeVisible();
    expect(
      screen.getByText("Create your first project to start planning design work.")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
    expect(screen.getByText("No recent task activity yet.")).toBeVisible();
    const unavailable = screen.getByText("On-time delivery").closest("article")!;
    expect(within(unavailable).getByText("Not available")).toBeVisible();
    expect(within(unavailable).queryByRole("progressbar")).not.toBeInTheDocument();
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
      expect(screen.getByRole("heading", { name: "Good morning, Ananya." }))
        .toBeVisible()
    );
  });

  it("creates a project with explicit client and team IDs and includes the initiating designer", async () => {
    tokenStorage.set("valid-token");
    const api = installDashboardApi({ empty: true });
    const user = userEvent.setup();
    const { router } = renderApp(["/designer"]);
    await screen.findByText("No projects yet");

    await user.click(screen.getByRole("button", { name: "Create project" }));
    const dialog = screen.getByRole("dialog", { name: "Create project" });
    expect(within(dialog).getByLabelText("Client ID")).toHaveAttribute(
      "placeholder",
      "e.g. user-client-aurora"
    );
    expect(within(dialog).getByLabelText("Manager ID")).toHaveAttribute(
      "placeholder",
      "e.g. user-manager-aarav"
    );
    expect(within(dialog).getByLabelText("Assigned designer IDs")).toHaveAttribute(
      "placeholder",
      "e.g. user-designer-ananya, user-designer-kabir"
    );

    await user.type(within(dialog).getByLabelText("Project name"), "New Residence");
    await user.type(within(dialog).getByLabelText("Location"), "Chennai");
    await user.type(
      within(dialog).getByLabelText("Client ID"),
      "user-client-aurora"
    );
    await user.type(
      within(dialog).getByLabelText("Manager ID"),
      "user-manager-aarav"
    );
    await user.clear(within(dialog).getByLabelText("Assigned designer IDs"));
    await user.type(
      within(dialog).getByLabelText("Assigned designer IDs"),
      "user-designer-kabir"
    );
    fireEvent.change(within(dialog).getByLabelText("Planned start"), {
      target: { value: "2026-08-01T09:00" }
    });
    fireEvent.change(within(dialog).getByLabelText("Planned end"), {
      target: { value: "2026-10-01T17:00" }
    });
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        "/designer/projects/project-aurora-villa"
      )
    );
    expect(api.getCreateBody()).toMatchObject({
      name: "New Residence",
      clientId: "user-client-aurora",
      managerId: "user-manager-aarav",
      assignedDesignerIds: [designer.id, "user-designer-kabir"],
      location: "Chennai"
    });
  });

  it("bounds KPI task reads and loads another page only on request", async () => {
    tokenStorage.set("valid-token");
    const api = installDashboardApi({ kpiHasMore: true });
    const user = userEvent.setup();
    renderApp(["/designer"]);

    await screen.findByRole("heading", { name: "Good morning, Ananya." });
    expect(api.getMainKpiRequests()).toHaveLength(1);
    expect(api.getTaskFeedRequests()).toHaveLength(1);
    expect(api.getTaskFeedRequests()[0]).toMatch(/limit=20&offset=0$/);
    expect(screen.queryByText("Loaded later")).not.toBeInTheDocument();
    expect(screen.getByText("2 red")).toBeVisible();
    expect(screen.getByText("Later-page completion recorded.")).toBeVisible();
    expect(screen.getByText("20 active · 1 completed tasks")).toBeVisible();
    expect(
      screen.getByText("10h completed of 50h · 80% remains")
    ).toBeVisible();
    const projectCard = screen.getByRole("article", { name: "Aurora Villa" });
    expect(within(projectCard).getByText("5%")).toBeVisible();
    expect(within(projectCard).getByText("2 red")).toBeVisible();
    expect(
      within(screen.getByText("Open workload").closest("article")!)
        .getByText("40h")
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Load more tasks" }));

    expect(await screen.findByText("Loaded later")).toBeVisible();
    expect(api.getMainKpiRequests()).toHaveLength(1);
    expect(api.getTaskFeedRequests()).toHaveLength(2);
    expect(api.getTaskFeedRequests()[1]).toMatch(/limit=20&offset=20$/);
    expect(screen.getByText("2 red")).toBeVisible();
    expect(within(projectCard).getByText("5%")).toBeVisible();
    expect(within(projectCard).getByText("2 red")).toBeVisible();
    expect(screen.getByText("Later-page completion recorded.")).toBeVisible();
  });
});

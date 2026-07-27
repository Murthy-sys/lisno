import axe from "axe-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../api/client";
import { renderApp } from "./render";

const userFor = (role: "designer" | "design_manager" | "design_head" | "client") => ({ id: `${role}-1`, name: "Accessible Person", email: `${role}@lisno.example`, role });

const accessibleProject = {
  id: "project-a11y",
  name: "Accessible residence",
  clientId: "client-1",
  initiatingDesignerId: "designer-1",
  assignedDesignerIds: ["designer-1"],
  managerId: "manager-1",
  status: "active",
  location: "Bengaluru",
  plannedStartAt: "2026-07-01T00:00:00.000Z",
  plannedEndAt: "2026-08-01T00:00:00.000Z",
  actualStartAt: null,
  actualEndAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  floors: [{
    id: "floor-a11y",
    projectId: "project-a11y",
    name: "Accessible floor",
    number: "G",
    order: 1,
    progress: 50,
    plannedStartAt: "2026-07-01T00:00:00.000Z",
    plannedEndAt: "2026-08-01T00:00:00.000Z",
    actualStartAt: null,
    actualEndAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    stages: [{
      id: "stage-a11y",
      projectId: "project-a11y",
      floorId: "floor-a11y",
      name: "Accessible planning",
      type: "floor_plan",
      order: 1,
      dependencyStageIds: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      tasks: [{
        id: "task-a11y",
        projectId: "project-a11y",
        floorId: "floor-a11y",
        stageId: "stage-a11y",
        title: "Accessible task",
        description: "A task with an explicit textual risk signal.",
        order: 1,
        ownerId: "designer-1",
        plannedStartAt: "2026-07-01T00:00:00.000Z",
        originalDeadlineAt: "2026-08-01T00:00:00.000Z",
        currentDeadlineAt: "2026-08-01T00:00:00.000Z",
        plannedEffort: 8,
        progress: 50,
        status: "in_progress",
        completedAt: null,
        latestUpdateAt: "2026-07-01T00:00:00.000Z",
        version: 1,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        risk: { level: "red", reason: "Deadline needs attention", elapsedRatio: 1, progressRatio: 0.5 }
      }]
    }]
  }]
};

function fixtureFetch(user: ReturnType<typeof userFor>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return Response.json({ data: user });
    if (url.startsWith("/api/v1/projects?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url === "/api/v1/projects/project-a11y") return Response.json({ data: accessibleProject });
    if (url.startsWith("/api/v1/tasks/task-a11y/events?")) return Response.json({ data: { items: [], pagination: { limit: 1, offset: 0, total: 0, hasMore: false } } });
    if (url === "/api/v1/client/latest-approved-versions") return Response.json({ data: [] });
    if (url === "/api/v1/organization/team") return Response.json({ data: [] });
    if (url === "/api/v1/organization/tree") return Response.json({ data: [] });
    if (url.startsWith("/api/v1/kpis/users/") && url.endsWith("/tasks?from=2000-01-01T00%3A00%3A00.000Z&to=2100-01-01T00%3A00%3A00.000Z&limit=20&offset=0")) return Response.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } });
    if (url.startsWith("/api/v1/kpis/users/")) return Response.json({ data: { userId: user.id, periodStartAt: "2000-01-01T00:00:00.000Z", periodEndAt: "2100-01-01T00:00:00.000Z", score: 0, components: [], aggregates: { taskCounts: { total: 0, completed: 0, active: 0 }, riskCounts: { gray: 0, green: 0, yellow: 0, red: 0 }, effort: { planned: 0, completed: 0, remaining: 0, workloadPercentage: 0 }, projects: [], recentActivity: [] }, tasks: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } } });
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("accessibility smoke coverage", () => {
  it("keeps login fields labeled and password visibility keyboard-operable", async () => {
    renderApp(["/login"]);
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    const toggle = screen.getByRole("button", { name: "Show password" });
    toggle.focus();
    expect(toggle).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["designer", "/designer", "Good morning, Accessible."],
    ["design_manager", "/manager", "Team delivery pulse"],
    ["design_head", "/head", "Organization delivery health"],
    ["client", "/client", "Your design plans"]
  ] as const)("renders an accessible %s home", async (role, path, heading) => {
    tokenStorage.set(`${role}-token`);
    fixtureFetch(userFor(role));
    renderApp([path]);
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  it("keeps a workspace disclosure, upload dialog, mobile navigation, and textual risk status keyboard-accessible", async () => {
    const user = userEvent.setup();
    tokenStorage.set("designer-token");
    fixtureFetch(userFor("designer"));
    renderApp(["/designer/projects/project-a11y"]);

    await screen.findByRole("heading", { name: "Accessible residence" });
    const floor = screen.getByRole("button", { name: /Floor G Accessible floor/i });
    await user.click(floor);
    expect(floor).toHaveAttribute("aria-expanded", "true");
    const stage = screen.getByRole("button", { name: /Accessible planning/i });
    await user.click(stage);
    expect(stage).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Red risk")).toBeVisible();
    expect(screen.getAllByText(/Deadline needs attention/)).toHaveLength(2);

    const upload = screen.getByRole("button", { name: "Upload design for Accessible task" });
    await user.click(upload);
    const dialog = screen.getByRole("dialog", { name: "Upload design" });
    expect(dialog).toBeVisible();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Close Upload design" })).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Upload design" })).not.toBeInTheDocument();
    expect(upload).toHaveFocus();

    const menu = screen.getByRole("button", { name: "Open navigation" });
    await user.click(menu);
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
    expect(menu).toHaveFocus();

    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});

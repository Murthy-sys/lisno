import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";

import { tokenStorage } from "../../api/client";
import type { ClientProjectSummary } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import { clientKeys } from "./clientApi";

const client = { id: "client-1", name: "Aurora Homes", email: "client@lisno.example", role: "client" as const };
const summaries: ClientProjectSummary[] = [
  {
    id: "project-villa", name: "Aurora Villa", projectNumber: "Lisno000021",
    status: "active", location: "Bengaluru", progress: 64, floorCount: 3,
    plannedStartAt: "2026-06-01T00:00:00.000Z", plannedEndAt: "2026-09-30T00:00:00.000Z",
    actualStartAt: null, actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z"
  },
  {
    id: "project-loft", name: "Cedar Loft", projectNumber: "Lisno000083",
    status: "planning", location: "Mysuru", progress: 0, floorCount: 1,
    plannedStartAt: "2026-07-01T00:00:00.000Z", plannedEndAt: "2026-10-30T00:00:00.000Z",
    actualStartAt: null, actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z"
  }
];

function installApi({ projectError, detail = false }: { projectError?: () => number | "network" | undefined; detail?: boolean } = {}) {
  tokenStorage.set("client-token");
  return vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ data: client });
    if (url.endsWith("/auth/authorization")) return Response.json({ data: authorizationFor(client.role) });
    if (url.includes("/client/project-summaries?")) {
      const status = projectError?.();
      if (status === "network") throw new TypeError("Network unavailable");
      if (status) return Response.json({ error: { code: "UNAVAILABLE", message: "Project list unavailable." } }, { status });
      return Response.json({ data: { items: summaries, pagination: { limit: 100, offset: 0, total: 2, hasMore: false } } });
    }
    if (detail) {
      if (url.endsWith("/projects/project-villa")) return Response.json({ data: {
        ...summaries[0]!, clientId: client.id, initiatingDesignerId: "designer-1",
        assignedDesignerIds: ["designer-1"], managerId: "manager-1", floors: []
      } });
      if (url.includes("/projects/project-villa/design-versions?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      if (url.endsWith("/projects/project-villa/design-workflow")) return Response.json({ data: { projectId: "project-villa", projectName: "Aurora Villa", serverNow: "2026-11-24T00:00:00.000Z", floors: [] } });
      if (url.endsWith("/client/projects/project-villa/design-sections")) return Response.json({ data: { projectId: "project-villa", sections: [], progress: { total: 0, approved: 0, rejected: 0, awaitingReview: 0 } } });
      if (url.endsWith("/client/estimates") || url.includes("/admin/design-plan-response-tasks?")) return Response.json({ data: [] });
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

function expectNoProjectIdentifiers() {
  expect(screen.queryByRole("table", { name: "Projects" })).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("Aurora Villa");
  expect(document.body).not.toHaveTextContent("Cedar Loft");
  expect(document.body).not.toHaveTextContent("Lisno000021");
  expect(document.body).not.toHaveTextContent("Lisno000083");
  expect(document.querySelector('[href*="project-villa"], [href*="project-loft"]')).toBeNull();
  expect(screen.queryByRole("link", { name: /^Open project:/ })).not.toBeInTheDocument();
}

describe("Client project table interactions and authorization", () => {
  it.each([400, 401, 403, 404])("retires cached project rows after a %s response and never restores them from a transient retry", async status => {
    let projectError: number | undefined;
    installApi({ projectError: () => projectError });
    const user = userEvent.setup();
    const { queryClient } = renderApp(["/client"]);
    expect(await screen.findByRole("link", { name: "Open project: Aurora Villa" })).toBeVisible();

    projectError = status;
    await act(async () => { await queryClient.refetchQueries({ queryKey: clientKeys.projects, exact: true }); });
    await waitFor(expectNoProjectIdentifiers);
    if (status === 401) {
      expect(tokenStorage.get()).toBeNull();
      return;
    }

    projectError = 503;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(queryClient.getQueryState(clientKeys.projects)?.fetchStatus).toBe("idle"));
    expectNoProjectIdentifiers();
    expect(screen.queryByText(/Previously loaded projects are shown/)).not.toBeInTheDocument();

    projectError = undefined;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Open project: Aurora Villa" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open project: Cedar Loft" })).toBeVisible();
  });

  it.each([503, 408, 429, "network"] as const)("retains only the previously authorized rows after a transient %s failure and recovers on refresh", async failure => {
    let projectError: number | "network" | undefined;
    installApi({ projectError: () => projectError });
    const { queryClient } = renderApp(["/client"]);
    await screen.findByRole("table", { name: "Projects" });
    projectError = failure;
    await act(async () => { await queryClient.refetchQueries({ queryKey: clientKeys.projects, exact: true }); });

    expect(await screen.findByText("Your project list could not be refreshed. Previously loaded projects are shown.")).toBeVisible();
    const rows = within(screen.getByRole("table", { name: "Projects" })).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole("link", { name: "Open project: Aurora Villa" })).toHaveAttribute("href", "/client/projects/project-villa");
    expect(within(rows[0]!).getByText("64%")).toBeVisible();
    expect(within(rows[1]!).getByRole("link", { name: "Open project: Cedar Loft" })).toHaveAttribute("href", "/client/projects/project-loft");
    expect(within(rows[1]!).getByText("0%")).toBeVisible();
    projectError = undefined;
    await userEvent.click(screen.getByRole("button", { name: "Refresh projects" }));
    await waitFor(() => expect(screen.queryByText(/Previously loaded projects are shown/)).not.toBeInTheDocument());
    expect(screen.getByRole("table", { name: "Projects" })).toBeVisible();
  });

  it("keeps row identity and destinations correct through reorder, rename and removal", async () => {
    installApi();
    const { queryClient } = renderApp(["/client"]);
    await screen.findByRole("table", { name: "Projects" });

    act(() => queryClient.setQueryData(clientKeys.projects, [summaries[1], { ...summaries[0], name: "Renamed villa" }]));
    await screen.findByRole("link", { name: "Open project: Renamed villa" });
    const rows = within(screen.getByRole("table", { name: "Projects" })).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByRole("link", { name: "Cedar Loft" })).toHaveAttribute("href", "/client/projects/project-loft");
    expect(within(rows[0]!).getByText("Project ID: Lisno000083")).toBeVisible();
    expect(within(rows[1]!).getByRole("link", { name: "Renamed villa" })).toHaveAttribute("href", "/client/projects/project-villa");
    expect(within(rows[1]!).getByText("Project ID: Lisno000021")).toBeVisible();
    expect(within(rows[1]!).getByText("64%")).toBeVisible();

    act(() => queryClient.setQueryData(clientKeys.projects, [summaries[1]]));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Open project: Renamed villa" })).not.toBeInTheDocument());
    expect(screen.getByText("1 project")).toBeVisible();
    expect(document.body).not.toHaveTextContent("Lisno000021");
    expect(document.querySelector('[href*="project-villa"]')).toBeNull();
  });

  it("provides native table headers and a keyboard-focusable scroll region with accessible project links", async () => {
    installApi();
    const user = userEvent.setup();
    renderApp(["/client"]);
    const table = await screen.findByRole("table", { name: "Projects" });
    const region = screen.getByRole("region", { name: "Projects table" });
    expect(region).toContainElement(table);
    expect(region).toHaveAttribute("tabindex", "0");
    expect(table.tagName).toBe("TABLE");
    within(table).getAllByRole("columnheader").forEach(header => {
      expect(header.tagName).toBe("TH");
      expect(header).toHaveAttribute("scope", "col");
    });
    within(table).getAllByRole("rowheader").forEach(header => expect(header).toHaveAttribute("scope", "row"));

    region.focus();
    expect(region).toHaveFocus();
    await user.tab();
    expect(within(table).getByRole("link", { name: "Aurora Villa" })).toHaveFocus();
    await user.tab();
    expect(within(table).getByRole("link", { name: "Open project: Aurora Villa" })).toHaveFocus();
    await user.tab();
    expect(within(table).getByRole("link", { name: "Cedar Loft" })).toHaveFocus();
    await user.tab();
    expect(within(table).getByRole("link", { name: "Open project: Cedar Loft" })).toHaveFocus();
    expect((await axe.run(region, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("opens the existing full project by keyboard and returns directly to the project table", async () => {
    const api = installApi({ detail: true });
    const user = userEvent.setup();
    const { router } = renderApp(["/client"]);
    const open = await screen.findByRole("link", { name: "Open project: Aurora Villa" });
    expect(api.mock.calls.map(([input]) => String(input))).not.toContain("/api/v1/projects/project-villa");
    open.focus();
    await user.keyboard("{Enter}");

    const project = await screen.findByRole("region", { name: "Aurora Villa" });
    expect(project).toHaveClass("client-page--project");
    expect(router.state.location.pathname).toBe("/client/projects/project-villa");
    expect(within(project).getByRole("heading", { name: "Aurora Villa" })).toBeVisible();
    expect(within(project).getByText("Project ID: Lisno000021")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(within(project).getByRole("link", { name: "Back to projects" }));
    expect(await screen.findByRole("table", { name: "Projects" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/client");
  });
});

import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";

import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";

import { clientKeys } from "./clientApi";

const client = {
  id: "client-1",
  name: "Aurora Homes",
  email: "client@lisno.example",
  role: "client" as const
};

const summaries = [
  {
    id: "project-villa",
    name: "Aurora Villa",
    status: "active",
    location: "Bengaluru",
    plannedStartAt: "2026-06-01T00:00:00.000Z",
    plannedEndAt: "2026-09-30T00:00:00.000Z",
    actualStartAt: null,
    actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    progress: 64,
    floorCount: 3
  },
  {
    id: "project-loft",
    name: "Cedar Loft",
    status: "planning",
    location: "Mysuru",
    plannedStartAt: "2026-07-01T00:00:00.000Z",
    plannedEndAt: "2026-10-30T00:00:00.000Z",
    actualStartAt: null,
    actualEndAt: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    progress: 0,
    floorCount: 1
  }
];

function installClientDashboardApi({ projectError, latestError }: { projectError?: () => number | undefined; latestError?: () => number | undefined } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/auth/me")) {
      return Response.json({ data: client });
    }
    if (url.endsWith("/api/v1/auth/authorization")) {
      return Response.json({ data: authorizationFor(client.role) });
    }
    if (url.includes("/api/v1/client/project-summaries?")) {
      const status = projectError?.();
      if (status) return Response.json({ error: { code: "UNAVAILABLE", message: "Project list unavailable." } }, { status });
      return Response.json({
        data: {
          items: summaries,
          pagination: { limit: 100, offset: 0, total: 2, hasMore: false }
        }
      });
    }
    if (url.endsWith("/api/v1/client/latest-approved-versions")) {
      const status = latestError?.();
      if (status) return Response.json({ error: { code: "UNAVAILABLE", message: "Approved plans unavailable." } }, { status });
      return Response.json({
        data: [{
          id: "version-villa",
          projectId: "project-villa",
          floorId: "floor-1",
          stageId: "stage-1",
          taskId: null,
          versionNumber: 2,
          originalFilename: "Villa floor plan.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1200,
          uploadedAt: "2026-07-12T00:00:00.000Z",
          approvalStatus: "approved",
          approvedAt: "2026-07-14T00:00:00.000Z",
          clientVisible: true,
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z"
        }]
      });
    }
    if (url.endsWith("/api/v1/client/estimates")) {
      return Response.json({ data: [] });
    }
    if (url.endsWith("/design-workflow")) return Response.json({ data: { projectId: url.split("/").at(-2), projectName: "Shared project", serverNow: new Date().toISOString(), floors: [] } });
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("collapsible client project cards", () => {
  it.each([401, 403, 404])("removes cached project identifiers and the open panel after a %s response", async (status) => {
    tokenStorage.set("client-token");
    let projectError: number | undefined;
    installClientDashboardApi({ projectError: () => projectError });
    const user = userEvent.setup();
    const { queryClient } = renderApp(["/client"]);
    await user.click(await screen.findByRole("button", { name: "Project details: Aurora Villa" }));
    expect(screen.getByRole("dialog", { name: "Aurora Villa" })).toBeVisible();
    projectError = status;
    await act(async () => { await queryClient.refetchQueries({ queryKey: clientKeys.projects, exact: true }); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body).not.toHaveTextContent("Aurora Villa");
    expect(document.body).not.toHaveTextContent("Cedar Loft");
    expect(document.querySelector('[href*="project-villa"], [id*="project-villa"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /Open (full )?project/ })).not.toBeInTheDocument();
    if (status !== 401) {
      projectError = 503;
      await user.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(queryClient.getQueryState(clientKeys.projects)?.fetchStatus).toBe("idle"));
      expect(document.body).not.toHaveTextContent("Aurora Villa");
      projectError = undefined;
      await user.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("button", { name: "Project details: Aurora Villa" })).toBeVisible();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
  });

  it("keeps previously authorized project context for a transient failure and hides approved files when their read is denied", async () => {
    tokenStorage.set("client-token");
    let projectError: number | undefined;
    let latestError: number | undefined;
    installClientDashboardApi({ projectError: () => projectError, latestError: () => latestError });
    const user = userEvent.setup();
    const { queryClient } = renderApp(["/client"]);
    await user.click(await screen.findByRole("button", { name: "Project details: Aurora Villa" }));
    expect(within(screen.getByRole("dialog", { name: "Aurora Villa" })).getByText("Villa floor plan.pdf")).toBeVisible();
    projectError = 503;
    await act(async () => { await queryClient.refetchQueries({ queryKey: clientKeys.projects, exact: true }); });
    const panel = screen.getByRole("dialog", { name: "Aurora Villa" });
    expect(await within(panel).findByText(/Previously loaded project information/)).toBeVisible();
    latestError = 403;
    await act(async () => { await queryClient.refetchQueries({ queryKey: clientKeys.latestVersions }); });
    expect(await within(panel).findByText("Latest approved update unavailable.")).toBeVisible();
    expect(document.body).not.toHaveTextContent("Villa floor plan.pdf");
    expect(within(panel).queryByText("Version 2")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(within(screen.getByRole("region", { name: "Client overview" })).getByLabelText("Unavailable")).toHaveTextContent("—");
    await user.click(screen.getByRole("button", { name: "Aurora Villa" }));
    expect(screen.getByText("Latest approved update unavailable.")).toBeVisible();
    expect(document.body).not.toHaveTextContent("Villa floor plan.pdf");
  });

  it("opens client-only details without navigation or extra detail reads and restores the expanded card", async () => {
    tokenStorage.set("client-token");
    const api = installClientDashboardApi();
    const user = userEvent.setup();
    const { router } = renderApp(["/client"]);
    const toggle = await screen.findByRole("button", { name: "Aurora Villa" });
    await user.click(toggle);
    const trigger = screen.getByRole("button", { name: "Project details: Aurora Villa" });
    await user.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Aurora Villa" });
    expect(panel).toHaveClass("ui-drawer--contextual");
    expect(within(panel).getByText("64% complete")).toBeVisible();
    expect(within(panel).getByText("Villa floor plan.pdf")).toBeVisible();
    expect(within(panel).getByRole("link", { name: "Open full project" })).toHaveAttribute("href", "/client/projects/project-villa");
    expect(router.state.location.pathname).toBe("/client");
    expect((await axe.run(panel, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Villa floor plan.pdf")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Project details: Cedar Loft" }));
    const second = screen.getByRole("dialog", { name: "Cedar Loft" });
    expect(within(second).getByText("0% complete")).toBeVisible();
    expect(within(second).queryByText("Villa floor plan.pdf")).not.toBeInTheDocument();
    expect(within(second).getByRole("link", { name: "Open full project" })).toHaveAttribute("href", "/client/projects/project-loft");
    expect(api.mock.calls.map(([input]) => String(input)).filter((url) => /\/projects\/[^/?]+$/.test(url))).toEqual([]);
  });

  it("tracks the selected stable project ID through reordering and removes details when that ID disappears", async () => {
    tokenStorage.set("client-token");
    installClientDashboardApi();
    const user = userEvent.setup();
    const { queryClient } = renderApp(["/client"]);
    await user.click(await screen.findByRole("button", { name: "Project details: Aurora Villa" }));
    act(() => queryClient.setQueryData(clientKeys.projects, [summaries[1], { ...summaries[0], name: "Renamed villa" }]));
    const panel = await screen.findByRole("dialog", { name: "Renamed villa" });
    expect(within(panel).getByText("64% complete")).toBeVisible();
    expect(within(panel).getByRole("link", { name: "Open full project" })).toHaveAttribute("href", "/client/projects/project-villa");
    act(() => queryClient.setQueryData(clientKeys.projects, [summaries[1]]));
    const unavailable = await screen.findByRole("dialog", { name: "Project unavailable" });
    expect(within(unavailable).queryByRole("link", { name: "Open full project" })).not.toBeInTheDocument();
    expect(within(unavailable).queryByText("64% complete")).not.toBeInTheDocument();
    await user.click(within(unavailable).getByRole("button", { name: "Close details" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Projects" })).toHaveFocus());
  });

  it("starts collapsed and toggles projects independently", async () => {
    tokenStorage.set("client-token");
    installClientDashboardApi();
    const user = userEvent.setup();

    renderApp(["/client"]);

    const villaToggle = await screen.findByRole("button", {
      name: "Aurora Villa"
    });
    const loftToggle = screen.getByRole("button", { name: "Cedar Loft" });
    const villaHeading = screen.getByRole("heading", {
      name: "Aurora Villa",
      level: 2
    });

    expect(villaToggle).toHaveAttribute("aria-expanded", "false");
    expect(villaToggle).toHaveAttribute(
      "aria-controls",
      "client-project-project-villa-details"
    );
    expect(villaToggle).not.toContainElement(villaHeading);
    expect(loftToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Villa floor plan.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open project" })).not.toBeInTheDocument();

    await user.click(villaToggle);

    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(loftToggle).toHaveAttribute("aria-expanded", "false");
    const villaPanel = document.getElementById(
      "client-project-project-villa-details"
    )!;
    expect(villaPanel).toBeVisible();
    expect(within(villaPanel).getByText("Villa floor plan.pdf")).toBeVisible();
    expect(within(villaPanel).getByRole("link", {
      name: "Open project"
    })).toHaveAttribute("href", "/client/projects/project-villa");

    await user.click(loftToggle);
    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(loftToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(villaToggle);
    expect(villaToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Villa floor plan.pdf")).not.toBeInTheDocument();
  });
});

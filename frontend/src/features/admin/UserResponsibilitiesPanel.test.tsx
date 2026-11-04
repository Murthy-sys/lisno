import axe from "axe-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import type { Role } from "../../api/authorization-contract";
import type { UserResponsibilitiesPage } from "../../api/types";
import { server } from "../../test/server";
import { UserResponsibilitiesPanel } from "./UserResponsibilitiesPanel";
import { emptyResponsibilityCounts, responsibilityPage, responsibilityRow, responsibilityUser } from "./userResponsibilities.test-fixtures";

const endpoint = "/api/v1/admin/users/:userId/responsibilities";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function setup(options: { user?: typeof responsibilityUser; role?: Role; canReadProjects?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = (next = options) => <QueryClientProvider client={queryClient}><UserResponsibilitiesPanel
    user={next.user ?? responsibilityUser} destinationRole={next.role ?? "designer"} canReadProjects={next.canReadProjects ?? true} /></QueryClientProvider>;
  const result = render(view());
  return { ...result, queryClient, rerenderPanel: (next: typeof options) => result.rerender(view(next)) };
}

describe("UserResponsibilitiesPanel", () => {
  it("shows unequal projects, project stage and own work separately with accessible links", async () => {
    server.use(http.get(endpoint, () => HttpResponse.json({ data: responsibilityPage({ items: [
      responsibilityRow(), responsibilityRow({ id: "project:project-b", sourceType: "project", sourceId: "project-b", label: "Assigned Designer",
        projectId: "project-b", project: { id: "project-b", name: "South Apartment", projectNumber: "Lisno000158", status: "planning",
          currentStage: { key: "initial_payment", label: "Initial-payment confirmation" }, stageState: "available" }, workStage: null, workStatus: null })
    ], pagination: { limit: 20, offset: 0, total: 2, hasMore: false } }) })));
    const view = setup();
    expect(await screen.findByText("2 responsibilities")).toBeVisible();
    const first = screen.getByText("North Residence").closest("li")!;
    expect(within(first).getByText("Lisno000121")).toBeVisible();
    expect(within(first).getByText("Space planning")).toBeVisible();
    expect(within(first).getByText("Working drawings")).toBeVisible();
    expect(within(first).getByText("In Progress")).toBeVisible();
    expect(screen.getByText("Initial-payment confirmation")).toBeVisible();
    const link = screen.getByRole("link", { name: "Open project North Residence in a new tab" });
    expect(link).toHaveAttribute("href", "/admin/projects/project-a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Refresh assignments" })).toHaveFocus();
    await userEvent.tab(); expect(link).toHaveFocus();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps unavailable, unlinked and non-project responsibilities explicit without inventing IDs or stages", async () => {
    server.use(http.get(endpoint, () => HttpResponse.json({ data: responsibilityPage({ items: [
      responsibilityRow({ project: { id: "project-a", name: "Missing details", projectNumber: null, status: "active", currentStage: null, stageState: "unavailable" } }),
      responsibilityRow({ id: "lead:b", sourceType: "lead", sourceId: "lead-b", category: "ownedActiveLeads", projectId: null, project: null, contextState: "unlinked", label: "Sales owner · Garden renovation", workStage: { key: "new_lead", label: "New lead" }, workStatus: null }),
      responsibilityRow({ id: "user:c", sourceType: "user", sourceId: "report-c", category: "directReports", projectId: null, project: null, contextState: "not_applicable", label: "Direct report", relatedUser: { id: "report-c", name: "Nia Designer" }, workStage: null, workStatus: null }),
      responsibilityRow({ id: "task:d", sourceId: "task-d", projectId: "missing-project", project: null, contextState: "unavailable" })
    ], pagination: { limit: 20, offset: 0, total: 4, hasMore: false } }) })));
    setup({ canReadProjects: false });
    expect(await screen.findByText("Stage unavailable")).toBeVisible();
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.getByText("Lead without a project")).toBeVisible();
    expect(screen.getByText("New lead")).toBeVisible();
    expect(screen.getByText("Nia Designer")).toBeVisible();
    expect(screen.getByText("Project details unavailable")).toBeVisible();
    expect(screen.getByText("task-d")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("distinguishes loading, failure and retry from a real empty result", async () => {
    const pending = deferred<Response>(); let attempts = 0;
    server.use(http.get(endpoint, async () => {
      attempts++;
      if (attempts === 1) return pending.promise;
      return HttpResponse.json({ data: responsibilityPage({ items: [], counts: emptyResponsibilityCounts, pagination: { limit: 20, offset: 0, total: 0, hasMore: false } }) });
    }));
    setup();
    expect(screen.getByText("Loading assignments…")).toBeVisible();
    await act(async () => pending.resolve(HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: 503 })));
    expect(await screen.findByRole("alert")).toHaveTextContent("Assignments could not be loaded.");
    expect(screen.queryByText("No assignments.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry assignments" }));
    expect(await screen.findByText("No assignments.")).toBeVisible();
    expect(attempts).toBe(2);
  });

  it("keeps full blocker totals across pages and resets pagination on a destination change", async () => {
    const calls: Array<{ role: string | null; offset: number }> = [];
    server.use(http.get(endpoint, ({ request }) => {
      const query = new URL(request.url).searchParams; const offset = Number(query.get("offset")); const role = query.get("destinationRole") as Role;
      calls.push({ role, offset });
      return HttpResponse.json({ data: responsibilityPage({ destinationRole: role, blockingCount: role === "procurement" ? 21 : 0,
        items: Array.from({ length: offset === 0 ? 20 : 1 }, (_, index) => responsibilityRow({ id: `task:${offset + index}`, label: `Drawing ${offset + index}`, blocksRoleChange: role === "procurement" })),
        pagination: { limit: 20, offset, total: 21, hasMore: offset === 0 } }) });
    }));
    const view = setup({ role: "procurement" });
    expect(await screen.findByText("21 responsibilities · 21 require reassignment")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Next assignments" }));
    expect(await screen.findByText("Drawing 20")).toBeVisible();
    expect(screen.getByText("21 responsibilities · 21 require reassignment")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next assignments" })).toBeDisabled();
    view.rerenderPanel({ role: "designer" });
    expect(await screen.findByText("Drawing 0")).toBeVisible();
    expect(screen.queryByText("Reassignment required")).not.toBeInTheDocument();
    expect(calls).toContainEqual({ role: "designer", offset: 0 });
  });

  it("never shows another user's data or a late response for a previous destination", async () => {
    const oldRole = deferred<UserResponsibilitiesPage>(); const nextUser = deferred<UserResponsibilitiesPage>();
    const started: string[] = [];
    server.use(http.get(endpoint, async ({ request, params }) => {
      const role = new URL(request.url).searchParams.get("destinationRole") as Role;
      started.push(`${params.userId}:${role}`);
      if (params.userId === "designer-b") return HttpResponse.json({ data: await nextUser.promise });
      if (role === "procurement") return HttpResponse.json({ data: await oldRole.promise });
      return HttpResponse.json({ data: responsibilityPage() });
    }));
    const view = setup(); await screen.findByText("North Residence");
    view.rerenderPanel({ role: "procurement" });
    expect(screen.queryByText("North Residence")).not.toBeInTheDocument();
    await waitFor(() => expect(started).toContain("designer-a:procurement"));
    view.rerenderPanel({ role: "designer" });
    expect(await screen.findByText("North Residence")).toBeVisible();
    await act(async () => oldRole.resolve(responsibilityPage({ destinationRole: "procurement", items: [responsibilityRow({ label: "Old role response" })] })));
    expect(screen.queryByText("Old role response")).not.toBeInTheDocument();
    expect(screen.getByText("North Residence")).toBeVisible();
    view.rerenderPanel({ user: { ...responsibilityUser, id: "designer-b" }, role: "designer" });
    expect(screen.queryByText("North Residence")).not.toBeInTheDocument();
    await waitFor(() => expect(started).toContain("designer-b:designer"));
    await act(async () => nextUser.resolve(responsibilityPage({ user: { ...responsibilityUser, id: "designer-b" }, items: [responsibilityRow({ label: "Second user's task", project: null, projectId: null, contextState: "unlinked" })] })));
    expect(await screen.findByText("Second user's task")).toBeVisible();
    expect(screen.queryByText("North Residence")).not.toBeInTheDocument();
  });

  it("refreshes existing assignments and rejects a response for the wrong identity", async () => {
    let attempts = 0;
    server.use(http.get(endpoint, () => {
      attempts++;
      return HttpResponse.json({ data: attempts === 1 ? responsibilityPage() : responsibilityPage({ user: { ...responsibilityUser, id: "different-user" } }) });
    }));
    setup(); await screen.findByText("North Residence");
    await userEvent.click(screen.getByRole("button", { name: "Refresh assignments" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Assignments could not be loaded."));
    expect(screen.queryByText("North Residence")).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});

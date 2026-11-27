import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProjectCompletionPage } from "./ProjectCompletionPage";
import type { ProjectStatusSummary } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import * as statusApi from "../project-status/projectStatusApi";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "admin-viewer", role: "super_admin" }, status: "authenticated", authorization: authorizationFor("super_admin") }) }));

beforeEach(() => {
  vi.spyOn(statusApi, "getProjectStatus").mockImplementation(async projectId => ({
    projectId, projectName: projectId === "project-a" ? "Jayan Villa" : "Garden home", projectStatus: "active", state: "active", serverNow: "2026-11-24T10:00:00Z", issue: null,
    currentStage: { key: "final_completion", label: "Final project completion" },
    pendingActions: [{ id: `completion-${projectId}`, stageKey: "final_completion", stageLabel: "Final project completion", action: "Review completion", state: "pending", responsibleRole: "super_admin", people: [{ id: `owner-${projectId}`, name: projectId === "project-a" ? "First owner" : "Second owner", role: "super_admin" }], scheduledAt: null, deadlineAt: null, blocker: null }]
  } satisfies ProjectStatusSummary));
});

const summary = (ready: boolean) => ({
  projectId: "project-a", projectName: "Jayan Villa", projectStatus: "active", completionAuthorityVersion: 4,
  scope: [{ sourceLineItemKey: "line-a", sourceSectionId: "CA", roomName: "Living room", specification: "Floor finish", amountPaise: 100000, approvedOrderLineCount: ready ? 1 : 0, exception: null, status: ready ? "approved_order" : "uncovered" }],
  vendorWork: { totalAssignments: ready ? 1 : 0, approvedAssignments: ready ? 1 : 0, pendingAssignments: 0, openReviews: 0 },
  blockers: ready ? [] : [{ code: "SCOPE_UNCOVERED", message: "One approved estimate line has no order or scope decision.", sourceLineItemKey: "line-a" }],
  pendingOwner: ready ? "super_admin" : "procurement", readyForCompletion: ready, completedAt: null
});

describe("ProjectCompletionPage", () => {
  it("opens the exact linked project beyond the queue page and routes Procurement blockers", async () => {
    server.use(http.get("/api/v1/admin/project-completion-tasks", () => HttpResponse.json({ data: { items: [], total: 0, limit: 100, offset: 0 } })), http.get("/api/v1/admin/projects/project-linked/completion", () => HttpResponse.json({ data: { ...summary(false), projectId: "project-linked", projectName: "Linked courtyard", blockers: [{ code: "PROCUREMENT_READINESS_PENDING", message: "Vendor balance is outstanding.", procurementTab: "payments", entityId: "order-linked" }] } })));
    renderWithQuery(<MemoryRouter initialEntries={["/admin/project-completion?projectId=project-linked"]}><ProjectCompletionPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Linked courtyard" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Procurement action" })).toHaveAttribute("href", "/admin/procurement/projects/project-linked/lifecycle?tab=payments&entity=order-linked");
    expect(screen.getByRole("button", { name: "Mark project completed" })).toBeDisabled();
  });
  it("loads one chip for the selected final task and replaces its project identity when selection changes", async () => {
    server.use(http.get("/api/v1/admin/project-completion-tasks", () => HttpResponse.json({ data: { items: [summary(true), { ...summary(false), projectId: "project-b", projectName: "Garden home" }], total: 2, limit: 100, offset: 0 } })));
    renderWithQuery(<MemoryRouter><ProjectCompletionPage /></MemoryRouter>);
    const first = await screen.findByRole("button", { name: /Jayan Villa/ });
    expect(screen.queryByRole("button", { name: /Project status/ })).not.toBeInTheDocument();
    expect(statusApi.getProjectStatus).not.toHaveBeenCalled();
    await userEvent.click(first);
    const firstChip = await screen.findByRole("button", { name: "Project status for Jayan Villa" });
    expect(firstChip.closest(".project-completion-page__detail-head")).not.toBeNull();
    expect(firstChip).toHaveTextContent("First owner");
    expect(screen.queryByText("Site progress")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Project status/ })).toHaveLength(1);
    expect(statusApi.getProjectStatus).toHaveBeenCalledWith("project-a", expect.any(AbortSignal));
    await userEvent.click(screen.getByRole("button", { name: /Garden home Pending with/ }));
    const secondChip = await screen.findByRole("button", { name: "Project status for Garden home" });
    expect(secondChip).toHaveTextContent("Second owner");
    expect(screen.queryByText(/First owner/)).not.toBeInTheDocument();
    expect(statusApi.getProjectStatus).toHaveBeenCalledWith("project-b", expect.any(AbortSignal));
    expect(screen.getAllByRole("button", { name: /Project status/ })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open project" })).toHaveAttribute("href", "/admin/projects/project-b");
    expect(screen.getByRole("button", { name: "Mark project completed" })).toBeDisabled();
  });

  it("loads projects beyond the first hundred final tasks", async () => {
    server.use(http.get("/api/v1/admin/project-completion-tasks", ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get("offset") ?? "0");
      const items = offset === 0
        ? Array.from({ length: 100 }, (_, index) => ({ ...summary(true), projectId: `project-${index}`, projectName: `Residence ${index}` }))
        : [{ ...summary(true), projectId: "project-last", projectName: "Final Residence" }];
      return HttpResponse.json({ data: { items, total: 101, limit: 100, offset } });
    }));
    renderWithQuery(<MemoryRouter><ProjectCompletionPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: "Load more projects" }));
    expect(await screen.findByRole("button", { name: /Final Residence/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Load more projects" })).not.toBeInTheDocument();
  });

  it("records an uncovered scope decision with reason and version before enabling closure", async () => {
    let ready = false;
    const exceptions: Array<Record<string, unknown>> = [];
    server.use(
      http.get("/api/v1/admin/project-completion-tasks", () => HttpResponse.json({ data: { items: [summary(ready)], total: 1, limit: 100, offset: 0 } })),
      http.post("/api/v1/admin/projects/project-a/scope-exceptions", async ({ request }) => { exceptions.push(await request.json() as Record<string, unknown>); ready = true; return HttpResponse.json({ data: { id: "exception-a" } }); })
    );
    renderWithQuery(<MemoryRouter><ProjectCompletionPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: /Jayan Villa/ }));
    expect(screen.getByRole("button", { name: "Mark project completed" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Record scope decision" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Decision" }), "externally_fulfilled");
    await userEvent.type(screen.getByRole("textbox", { name: "Reason" }), "Client sourced and accepted this item separately.");
    await userEvent.click(screen.getByRole("button", { name: "Record decision" }));
    await waitFor(() => expect(exceptions).toHaveLength(1));
    expect(exceptions[0]).toEqual(expect.objectContaining({ sourceLineItemKey: "line-a", kind: "externally_fulfilled", expectedAuthorityVersion: 4, reason: "Client sourced and accepted this item separately." }));
  });

  it("distinguishes two zero-value specifications in one room while paid uncovered scope keeps its action", async () => {
    const pending = summary(false);
    const scope = [
      { ...pending.scope[0], sourceLineItemKey: "line-zero-ceiling", specification: "False ceiling", amountPaise: 0, status: "not_required" },
      { ...pending.scope[0], sourceLineItemKey: "line-zero-lighting", specification: "Decorative lighting", amountPaise: 0, status: "not_required" },
      pending.scope[0]
    ];
    server.use(http.get("/api/v1/admin/project-completion-tasks", () => HttpResponse.json({ data: { items: [{ ...pending, scope }], total: 1, limit: 100, offset: 0 } })));
    renderWithQuery(<MemoryRouter><ProjectCompletionPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: /Jayan Villa/ }));
    const lines = within(screen.getByRole("region", { name: "Approved estimate scope" })).getAllByRole("article");
    expect(lines).toHaveLength(3);
    expect(within(lines[0]).getByText("Living room · False ceiling")).toBeVisible();
    expect(within(lines[0]).getByText("No paid work required (₹0 estimate)")).toBeVisible();
    expect(within(lines[0]).queryByRole("button", { name: "Record scope decision" })).not.toBeInTheDocument();
    expect(within(lines[1]).getByText("Living room · Decorative lighting")).toBeVisible();
    expect(within(lines[1]).getByText("No paid work required (₹0 estimate)")).toBeVisible();
    expect(within(lines[1]).queryByRole("button", { name: "Record scope decision" })).not.toBeInTheDocument();
    expect(within(lines[2]).getByText("Living room · Floor finish")).toBeVisible();
    expect(within(lines[2]).getByText("Uncovered")).toBeVisible();
    expect(within(lines[2]).getByText("Section CA")).toBeVisible();
    expect(screen.queryByText(/line-zero-ceiling|line-zero-lighting|line-a/)).not.toBeInTheDocument();
    await userEvent.click(within(lines[2]).getByRole("button", { name: "Record scope decision" }));
    expect(screen.getByText("Approved estimate line: Living room · Floor finish")).toBeVisible();
    expect(screen.queryByText("Approved estimate line: line-a")).not.toBeInTheDocument();
  });

  it("sends a versioned final Super Admin decision only when all work is accepted", async () => {
    const complete = vi.fn(async ({ request }: { request: Request }) => HttpResponse.json({ data: { id: "decision-a", body: await request.json() } }));
    server.use(
      http.get("/api/v1/admin/project-completion-tasks", () => HttpResponse.json({ data: { items: [summary(true)], total: 1, limit: 100, offset: 0 } })),
      http.post("/api/v1/admin/projects/project-a/complete", complete)
    );
    renderWithQuery(<MemoryRouter><ProjectCompletionPage /></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: /Jayan Villa/ }));
    await userEvent.click(screen.getByRole("button", { name: "Mark project completed" }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Jayan Villa marked completed.")).toBeVisible();
  });
});

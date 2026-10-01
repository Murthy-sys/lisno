import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProjectCompletionPage } from "./ProjectCompletionPage";

const summary = (ready: boolean) => ({
  projectId: "project-a", projectName: "Jayan Villa", projectStatus: "active", completionAuthorityVersion: 4,
  scope: [{ sourceLineItemKey: "line-a", sourceSectionId: "CA", roomName: "Living room", specification: "Floor finish", amountPaise: 100000, approvedOrderLineCount: ready ? 1 : 0, exception: null, status: ready ? "approved_order" : "uncovered" }],
  vendorWork: { totalAssignments: ready ? 1 : 0, approvedAssignments: ready ? 1 : 0, pendingAssignments: 0, openReviews: 0 },
  blockers: ready ? [] : [{ code: "SCOPE_UNCOVERED", message: "One approved estimate line has no order or scope decision.", sourceLineItemKey: "line-a" }],
  pendingOwner: ready ? "super_admin" : "procurement", readyForCompletion: ready, completedAt: null
});

describe("ProjectCompletionPage", () => {
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

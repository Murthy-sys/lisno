import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { authorizationFor } from "../../test/authFixtures";
import { executionFixture, executionPageFixture } from "../execution/executionTestFixtures";
import { ProjectManagerProjectPage } from "./ProjectManagerWorkspace";

const actor = vi.hoisted(() => ({ id: "former-site-user" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: actor.id, role: "site_manager" }, authorization: authorizationFor("site_manager", ["projects.read", "pm.workspace.read", "execution.verify", "procurement.site_completion.manage", "procurement.work_order_approval.read"]) }) }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => "live" }));

function install(completionAuthority: "vendor_client" | "legacy_staff" = "vendor_client") {
  const work = { ...executionFixture, status: "awaiting_verification", progress: 100, allowedActions: ["verify"], submission: { id: "submission-one", submittedAt: "2026-10-09T09:00:00Z", note: "Inspect joinery", imageIds: ["photo-one"], version: 1 } };
  const hierarchy = { id: "project-one", name: "Oak residence", clientName: "Client A", location: "North district", status: "active", plannedStartAt: "2026-10-01", plannedEndAt: "2026-12-01", floors: [] };
  server.use(
    http.get("/api/v1/projects/project-one/pm/overview", () => HttpResponse.json({ data: { project: { ...hierarchy, health: "at_risk", approvedNetPaise: 12000000, progress: { actual: 70, planned: 80 } }, capabilities: [], calculatedAt: "2026-10-27T09:00:00Z" } })),
    http.get("/api/v1/projects/project-one", () => HttpResponse.json({ data: hierarchy })),
    http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: { ...executionPageFixture(), project: { ...executionPageFixture().project, completionAuthority }, items: [work] } })),
    http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ data: work })),
    http.get("/api/v1/projects/project-one/site-completion", () => HttpResponse.json({ data: { projectId: "project-one", projectStatus: "active", version: 3, progress: 70, note: "", status: "draft", currentRound: 0, canSubmit: false, needsReverification: false, blockers: ["Vendor work still needs verification."], review: null } })),
    http.get("/api/v1/workflow-tasks", () => HttpResponse.json({ data: [] }))
  );
}
function mount(path: string) {
  return renderWithQuery(<MemoryRouter initialEntries={[path]}><Routes><Route path="/projects/:projectId/execution" element={<ProjectManagerProjectPage />} /></Routes></MemoryRouter>);
}

describe("consolidated Project Manager operational access", () => {
  it.each(["former-site-user", "migrated-program-user"])("preserves verification, ownership details, handoff and approvals for %s", async id => {
    actor.id = id;
    install();
    mount("/projects/project-one/execution?assignment=work-one");
    const verification = await screen.findByRole("dialog", { name: "Oak wall panelling" });
    expect(within(verification).getByRole("textbox", { name: "Verification note" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Project details" })).toHaveTextContent("Client A");
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("heading", { name: "Execution operations" })).toBeVisible();
    await userEvent.click(await screen.findByText("Project actions"));
    expect(screen.getByRole("link", { name: "Work order approvals" })).toHaveAttribute("href", "/work-order-approvals");
    expect(screen.queryByText("Project coordination")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Completion & Client handoff" }));
    expect(await screen.findByRole("textbox", { name: "Completion note" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete and send to Client" })).toBeDisabled();
  });

  it("keeps legacy coordination available within full detail", async () => {
    install("legacy_staff");
    mount("/projects/project-one/execution?detail=1");
    await screen.findByRole("heading", { name: "Execution operations" });
    await userEvent.click(await screen.findByText("Project actions"));
    await userEvent.click(screen.getByRole("button", { name: "Coordination progress" }));
    expect(await screen.findByRole("dialog", { name: "Coordination progress" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Completion & Client handoff" })).not.toBeInTheDocument();
  });
});

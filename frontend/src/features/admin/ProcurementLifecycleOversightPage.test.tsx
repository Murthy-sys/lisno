import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { authorizationFor } from "../../test/authFixtures";
import type { Role } from "../../api/types";
import { lifecycleFixtures } from "../procurement/lifecycle/lifecycleFixtures.test-support";
import { paymentOrderFixture, paymentPageFixture } from "../procurement/lifecycle/paymentFixtures";
import { ProcurementLifecycleOversightPage } from "./ProcurementLifecycleOversightPage";

const session = vi.hoisted(() => ({ role: "super_admin" as Role }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "admin-a", role: session.role }, authorization: authorizationFor(session.role, ["procurement.lifecycle.oversight"]) }) }));
const base = "/api/v1/admin/projects/project-a/procurement-lifecycle";
function install() {
  const data = lifecycleFixtures(); data.summary.allowedActions = []; data.reviews.allowedActions = []; data.reviews.current!.allowedActions = []; data.reviews.current!.members.forEach(row => { row.canCheck = false; }); data.inspections.allowedActions = []; data.handover.allowedActions = []; data.readiness.allowedActions = ["request_correction"];
  server.use(http.get(base, () => HttpResponse.json({ data: data.summary })), http.get(`${base}/reviews`, () => HttpResponse.json({ data: data.reviews })), http.get(`${base}/inspections`, () => HttpResponse.json({ data: data.inspections })), http.get(`${base}/handover`, () => HttpResponse.json({ data: data.handover })), http.get(`${base}/readiness`, () => HttpResponse.json({ data: data.readiness })), http.get("/api/v1/admin/procurement-lifecycle/health", () => HttpResponse.json({ data: { status: "healthy", channel: "internal_feed", cadenceSeconds: 300, targetDelaySeconds: 900, lastAttemptAt: data.summary.serverNow, lastSuccessAt: data.summary.serverNow, lastSweepAt: data.summary.serverNow, backlog: 0, failureCode: null } })));
  return data;
}
function mount(tab: string) { return renderWithQuery(<MemoryRouter initialEntries={[`/admin/procurement/projects/project-a/lifecycle?tab=${tab}`]}><Routes><Route path="/admin/procurement/projects/:projectId/lifecycle" element={<ProcurementLifecycleOversightPage />} /></Routes></MemoryRouter>); }
describe("Super Admin Procurement oversight", () => {
  it("shows work reviews read-only with a separate final-completion link", async () => {
    session.role = "super_admin"; install(); mount("progress");
    expect(await screen.findByText("Ceiling framework")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Submit progress check|Save inspection|Submit procurement readiness/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review final project completion" })).toHaveAttribute("href", "/admin/project-completion?projectId=project-a");
    await userEvent.click(screen.getByText("Internal reminder service")); expect(await screen.findByText("healthy")).toBeVisible();
  });
  it("uses the Admin correction endpoint while preserving the Procurement signer", async () => {
    session.role = "super_admin"; const data = install(); const commands: Record<string, unknown>[] = [];
    server.use(http.post(`${base}/correction-requests`, async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: data.readiness }); }));
    mount("signoff"); await userEvent.click(await screen.findByRole("button", { name: "Request procurement correction" }));
    const field = screen.getByLabelText("Reason or declaration"); await userEvent.type(field, "Recheck the documented handover shortage");
    const form = field.closest("form")!; await userEvent.click(within(form).getByRole("button", { name: "Request procurement correction" }));
    await waitFor(() => expect(commands).toHaveLength(1)); expect(commands[0]).toMatchObject({ action: "request_correction", reason: "Recheck the documented handover shortage" });
    expect(screen.queryByRole("button", { name: "Submit procurement readiness" })).not.toBeInTheDocument();
  });
  it("acknowledges a Finance retention without showing Finance approval controls", async () => {
    session.role = "super_admin"; install(); const order = paymentOrderFixture(["acknowledge_retention"]);
    order.milestones[1]!.retention = { id: "retention-a", amountPaise: 49000, remainingPaise: 49000, dueDate: "2027-01-15", ownerId: "finance-a", approvedAt: "2026-11-27T06:00:00Z", acknowledgedAt: null };
    const commands: Record<string, unknown>[] = []; server.use(http.get(`${base}/payments`, () => HttpResponse.json({ data: paymentPageFixture(order) })), http.get(`${base}/payments/history`, () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })), http.post(`${base}/retention`, async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: order }); }));
    mount("payments"); await userEvent.click(await screen.findByRole("button", { name: "Acknowledge Final retention" }));
    const editor = within(screen.getByRole("region", { name: "Acknowledge retained balance" })); await userEvent.type(editor.getByLabelText("Reason"), "Finance remains responsible for the January retention");
    await userEvent.click(editor.getByRole("button", { name: "Acknowledge retained balance" }));
    await waitFor(() => expect(commands).toHaveLength(1)); expect(commands[0]).toMatchObject({ action: "acknowledge_retention", retentionId: "retention-a" });
    expect(screen.queryByRole("button", { name: "Approve retained balance" })).not.toBeInTheDocument();
  });
  it("does not mount protected project readers for a non-Admin identity", () => {
    session.role = "procurement"; mount("signoff"); expect(screen.getByRole("alert")).toHaveTextContent("not available"); expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});

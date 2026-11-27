import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { authorizationFor } from "../../test/authFixtures";
import type { Role } from "../../api/types";
import { paymentOrderFixture, paymentPageFixture } from "../procurement/lifecycle/paymentFixtures";
import { ProcurementPaymentControls } from "./ProcurementPaymentControls";

const session = vi.hoisted(() => ({ role: "finance_head" as Role }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "finance-a", role: session.role }, authorization: authorizationFor(session.role, ["finance.procurement_payments.manage"]) }) }));
describe("Finance vendor payment controls", () => {
  it("requires the Finance identity rather than a permission-shaped staff session", () => {
    session.role = "procurement";
    renderWithQuery(<MemoryRouter><ProcurementPaymentControls projectId="project-a" /></MemoryRouter>);
    expect(screen.queryByRole("region", { name: "Vendor payments" })).not.toBeInTheDocument();
  });
  it("records an explicit zero opening reconciliation and keeps retention owned by Finance", async () => {
    session.role = "finance_head"; const order = paymentOrderFixture(["reconcile", "confirm_dates", "approve_retention"]); Object.assign(order, { openingConfirmed: false, openingReconciliation: null, paidPaise: null, remainingPaise: null });
    const commands: Record<string, unknown>[] = []; const base = "/api/v1/finance/projects/project-a/procurement-lifecycle";
    server.use(http.get(`${base}/payments`, () => HttpResponse.json({ data: paymentPageFixture(order) })), http.get(`${base}/payments/history`, () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })), http.post(`${base}/payment-reconciliation`, async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: { ...order, version: 3 } }); }));
    renderWithQuery(<MemoryRouter><ProcurementPaymentControls projectId="project-a" /></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: "Reconcile opening payments" }));
    const editor = within(screen.getByRole("region", { name: "Reconcile opening payments" }));
    await userEvent.type(editor.getByLabelText("Reason"), "Bank statements confirm no earlier payments");
    await userEvent.click(editor.getByRole("button", { name: "Reconcile opening payments" })); expect(commands).toHaveLength(0);
    await userEvent.click(editor.getByRole("checkbox", { name: /I checked the previous payment records/ }));
    await userEvent.click(editor.getByRole("button", { name: "Reconcile opening payments" }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ action: "reconcile", openingBalances: [{ milestoneId: "advance", amountPaise: 0 }, { milestoneId: "final", amountPaise: 0 }], evidenceIds: [] });
    expect(screen.queryByRole("button", { name: /Acknowledge.*retention/ })).not.toBeInTheDocument();
  });
});

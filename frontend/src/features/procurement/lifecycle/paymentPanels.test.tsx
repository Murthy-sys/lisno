import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { renderWithQuery } from "../../../test/render";
import { server } from "../../../test/server";
import { apiClient } from "../../../api/client";
import { PaymentsPanel } from "./PaymentsPanel";
import { paymentOrderFixture, paymentPageFixture } from "./paymentFixtures";
import type { LifecycleAudience, PaymentOrder, PaymentTransactionHistory } from "./lifecycleApi";

function mount(order: PaymentOrder, audience: LifecycleAudience = "procurement", path = "/?tab=payments", loader?: (url: URL) => PaymentOrder | null) {
  const base = audience === "procurement" ? "/api/v1/procurement/projects/project-a/lifecycle" : `/api/v1/${audience}/projects/project-a/procurement-lifecycle`;
  server.use(http.get(`${base}/payments`, ({ request }) => { const current = loader ? loader(new URL(request.url)) : order; return HttpResponse.json({ data: current ? paymentPageFixture(current) : { ...paymentPageFixture(order), items: [] } }); }), http.get(`${base}/payments/history`, () => HttpResponse.json({ data: { projectId: "project-a", items: [], total: 0, limit: 20, offset: 0 } })));
  renderWithQuery(<MemoryRouter initialEntries={[path]}><PaymentsPanel projectId="project-a" actorId="buyer-a" audience={audience} /></MemoryRouter>);
  return base;
}
async function form(label: string) {
  await userEvent.click(await screen.findByRole("button", { name: label }));
  return within(screen.getByRole("region", { name: label }));
}

describe("Vendor payment workspace", () => {
  it("keeps unknown cash history explicit and filters by vendor identity", async () => {
    const order = paymentOrderFixture(); Object.assign(order, { openingConfirmed: false, openingReconciliation: null, paidPaise: null, remainingPaise: null, allowedActions: ["propose_dates"] });
    order.milestones[0]!.readiness = "awaiting_certification";
    const vendors: string[] = []; mount(order, "procurement", "/?tab=payments", url => { if (url.searchParams.has("vendorId")) vendors.push(url.searchParams.get("vendorId")!); return order; });
    expect(await screen.findByText(/Earlier payment history is unknown/)).toBeVisible();
    const cash = screen.getByText("Vendor cash paid").closest("div")!;
    expect(cash).toHaveTextContent("Not yet confirmed"); expect(cash).not.toHaveTextContent("₹0");
    expect(screen.getByText("Awaiting certification")).toBeVisible(); expect(within(screen.getByRole("table", { name: "Milestone obligations" })).getByText("Overdue", { exact: true })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Authorize milestone amounts" })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Vendor" }), "vendor-b");
    await waitFor(() => expect(vendors).toContain("vendor-b"));
  });

  it("records exact multi-milestone cash with private evidence and retries the same command", async () => {
    const order = paymentOrderFixture(); const base = mount(order); const attempts: Record<string, unknown>[] = []; let evidenceParent = "";
    // JSDOM File and Node's multipart parser use different realms. Assert the browser API boundary here;
    // real file signature/streaming checks run in the backend and browser suites.
    vi.spyOn(apiClient, "postMultipartWithProgress").mockImplementation(async (path, data) => {
      expect(path).toBe("/procurement/projects/project-a/lifecycle/evidence");
      evidenceParent = String(data.get("entityId")); expect(data.get("purpose")).toBe("payment"); expect((data.get("file") as File).name).toBe("payment.pdf");
      return { items: [{ id: "evidence-a", entityId: evidenceParent, purpose: "payment", name: "payment.pdf", mimeType: "application/pdf", kind: "document" }] } as never;
    });
    server.use(http.post(`${base}/payments`, async ({ request }) => { attempts.push(await request.json() as Record<string, unknown>); return attempts.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Temporary save failure" } }, { status: 503 }) : HttpResponse.json({ data: { ...order, version: 3 } }); }));
    const editor = await form("Record payment");
    expect((await axe.run(screen.getByRole("region", { name: "Vendor payments" }), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.type(editor.getByLabelText("Payment amount in rupees"), "120.34");
    await userEvent.type(editor.getByLabelText("Advance allocation in rupees"), "100");
    await userEvent.type(editor.getByLabelText("Final allocation in rupees"), "20.34");
    await userEvent.type(editor.getByLabelText("Transaction reference"), "SYNTHETIC-REF-103");
    await userEvent.upload(editor.getByLabelText("Evidence files"), new File(["%PDF-synthetic"], "payment.pdf", { type: "application/pdf" }));
    await editor.findByRole("button", { name: "payment.pdf" });
    await userEvent.click(editor.getByRole("button", { name: /^Record payment$/ }));
    expect(await editor.findByRole("alert")).toHaveTextContent("Temporary save failure");
    expect(editor.getByLabelText("Transaction reference")).toHaveValue("SYNTHETIC-REF-103");
    await userEvent.click(editor.getByRole("button", { name: /^Record payment$/ }));
    await waitFor(() => expect(attempts).toHaveLength(2)); expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]).toMatchObject({ amountPaise: 12034, expectedVersion: 2, transactionId: evidenceParent, evidenceIds: ["evidence-a"], allocations: [{ milestoneId: "advance", amountPaise: 10000 }, { milestoneId: "final", amountPaise: 2034 }] });
  });

  it("requires exact Finance allocations without spreading withholding automatically", async () => {
    const order = paymentOrderFixture(["confirm_dates", "authorize", "reconcile", "approve_retention"]); const base = mount(order, "finance"); const commands: Record<string, unknown>[] = [];
    server.use(http.post(`${base}/payment-authorizations`, async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: { ...order, version: 3 } }); }));
    const editor = await form("Authorize milestone amounts");
    expect(editor.getByLabelText("Advance withholding in rupees")).toHaveValue("");
    await userEvent.type(editor.getByLabelText("Advance gross allocation in rupees"), "500");
    await userEvent.type(editor.getByLabelText("Advance withholding in rupees"), "10");
    await userEvent.type(editor.getByLabelText("Final gross allocation in rupees"), "500");
    await userEvent.type(editor.getByLabelText("Final withholding in rupees"), "9");
    await userEvent.type(editor.getByLabelText("Reason"), "Allocate the assessed invoice");
    await userEvent.click(editor.getByRole("button", { name: "Authorize milestone amounts" }));
    expect(await editor.findByRole("alert")).toHaveTextContent("match the Finance assessment exactly"); expect(commands).toHaveLength(0);
    await userEvent.clear(editor.getByLabelText("Final withholding in rupees")); await userEvent.type(editor.getByLabelText("Final withholding in rupees"), "10");
    await userEvent.click(editor.getByRole("button", { name: "Authorize milestone amounts" }));
    await waitFor(() => expect(commands).toHaveLength(1)); expect(commands[0]).toMatchObject({ action: "authorize", basis: "invoice", assessmentRevisionId: "invoice-a", allocations: [{ milestoneId: "advance", grossPaise: 50000, withholdingPaise: 1000, netPaise: 49000 }, { milestoneId: "final", grossPaise: 50000, withholdingPaise: 1000, netPaise: 49000 }] });
  });

  it("retains the draft but blocks a stale write until the latest balances are reviewed", async () => {
    let current = paymentOrderFixture(); const base = mount(current, "procurement", "/?tab=payments", () => current); let calls = 0;
    server.use(http.post(`${base}/payment-dates`, () => { calls++; current = { ...current, version: 3 }; return HttpResponse.json({ error: { code: "PROCUREMENT_LIFECYCLE_CONFLICT", message: "Source changed" } }, { status: 409 }); }));
    const editor = await form("Propose payment dates"); await userEvent.type(editor.getByLabelText("Reason"), "Vendor requested revised dates");
    await userEvent.click(editor.getByRole("button", { name: "Propose payment dates" }));
    const review = await editor.findByRole("button", { name: "I reviewed the latest balances" });
    expect(editor.getByRole("button", { name: "Propose payment dates" })).toBeDisabled();
    expect(editor.getByLabelText("Reason")).toHaveValue("Vendor requested revised dates"); expect(calls).toBe(1);
    await waitFor(() => expect(review).toBeEnabled()); await userEvent.click(review);
    expect(editor.getByRole("button", { name: "Propose payment dates" })).toBeEnabled();
  });

  it("fetches a payment alert's order even beyond the first page and removes revoked data", async () => {
    const order = paymentOrderFixture(); const linked = { ...order, id: "order-last", orderNumber: "PO-999", vendorName: "Synthetic linked vendor" }; const base = mount(order, "procurement", "/?tab=payments&entity=order-last", url => url.searchParams.get("orderId") === "order-last" ? linked : order);
    expect(await screen.findByRole("article", { name: "Payments for PO-999" })).toBeVisible();
    server.use(http.get(`${base}/payments`, () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Assignment revoked" } }, { status: 403 })));
    await userEvent.click(screen.getByRole("button", { name: "Refresh payments" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer available"); expect(screen.queryByText("Synthetic linked vendor")).not.toBeInTheDocument();
  });

  it.each(["finance", "admin"] as const)("lets %s correct an opening balance with evidence and retains the original history", async audience => {
    // Closed orders expose only correction actions; the UI follows that server action set.
    let order = paymentOrderFixture(["reconcile"]);
    const original: PaymentTransactionHistory = { id: "opening-a", orderId: order.id, vendorId: order.vendorId, kind: "opening_reconciliation", amountPaise: 20000,
      allocations: order.openingReconciliation!.balances, paidAt: null, recordedAt: "2026-11-20T06:00:00Z", actorId: "finance-original", actorName: "Original reviewer",
      method: null, reference: null, note: "Original statement reconciliation", evidenceIds: [], relatedTransactionId: null, reversed: false };
    const history = [original], lookups: string[] = [], commands: Record<string, unknown>[] = [];
    const base = mount(order, audience, "/?tab=payments", () => order);
    let evidenceParent = "";
    vi.spyOn(apiClient, "postMultipartWithProgress").mockImplementation(async (path, data) => {
      expect(path).toBe(`/${audience}/projects/project-a/procurement-lifecycle/evidence`);
      evidenceParent = String(data.get("entityId"));
      return { items: [{ id: "evidence-correction", entityId: evidenceParent, purpose: "payment", name: "correction.pdf", mimeType: "application/pdf", kind: "document" }] } as never;
    });
    server.use(http.get(`${base}/payments/history`, ({ request }) => {
      const id = new URL(request.url).searchParams.get("transactionId"); if (id) lookups.push(id);
      const items = id ? history.filter(row => row.id === id) : history;
      return HttpResponse.json({ data: { projectId: order.projectId, items, total: items.length, limit: 20, offset: 0 } });
    }), http.post(`${base}/payment-reconciliation`, async ({ request }) => {
      const command = await request.json() as Record<string, unknown>; commands.push(command);
      const balances = command.openingBalances as Array<{ milestoneId: string; amountPaise: number }>;
      order = { ...order, version: 3, paidPaise: 0, remainingPaise: 98000, openingReconciliation: { id: String(command.reconciliationId), balances },
        milestones: order.milestones.map(row => ({ ...row, paidPaise: 0, remainingPaise: row.authorizedNetPaise })) };
      history.unshift({ ...original, id: String(command.reconciliationId), amountPaise: 0, allocations: balances, note: String(command.reason),
        evidenceIds: ["evidence-correction"], supersedesReconciliationId: original.id });
      return HttpResponse.json({ data: order });
    }));
    const editor = await form("Correct opening balance");
    expect(editor.getByLabelText("Advance previously paid in rupees")).toHaveValue("200.00");
    await userEvent.click(screen.getByRole("button", { name: "View linked original" }));
    await waitFor(() => expect(lookups).toContain("opening-a"));
    await userEvent.clear(editor.getByLabelText("Advance previously paid in rupees"));
    await userEvent.type(editor.getByLabelText("Advance previously paid in rupees"), "0.00");
    await userEvent.type(editor.getByLabelText("Reason"), "Statement confirms prior transfer was cancelled");
    await userEvent.click(editor.getByRole("checkbox", { name: /I checked the previous payment records/ }));
    await userEvent.click(editor.getByRole("button", { name: "Correct opening balance" }));
    expect(await editor.findByRole("alert")).toHaveTextContent("including a correction to zero"); expect(commands).toHaveLength(0);
    await userEvent.upload(editor.getByLabelText("Evidence files"), new File(["%PDF-synthetic"], "correction.pdf", { type: "application/pdf" }));
    await editor.findByRole("button", { name: "correction.pdf" });
    await userEvent.click(editor.getByRole("button", { name: "Correct opening balance" }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ action: "reconcile", supersedesReconciliationId: "opening-a", reconciliationId: evidenceParent,
      openingBalances: [{ milestoneId: "advance", amountPaise: 0 }, { milestoneId: "final", amountPaise: 0 }], evidenceIds: ["evidence-correction"], expectedVersion: 2 });
    expect(evidenceParent).not.toBe("opening-a");
    expect(await screen.findByText("Superseded opening balance")).toBeVisible();
    expect(screen.getByText("Original statement reconciliation")).toBeVisible();
    expect(screen.getByText("Corrects a previous opening balance.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });

  it("keeps opening corrections and linked replacements out of Procurement controls", async () => {
    const order = paymentOrderFixture(["record", "reconcile"]); const base = mount(order);
    server.use(http.get(`${base}/payments/history`, () => HttpResponse.json({ data: { items: [{ id: "payment-old", orderId: order.id, vendorId: order.vendorId,
      kind: "payment", amountPaise: 1000, allocations: [], paidAt: "2026-11-20T06:00:00Z", recordedAt: "2026-11-20T06:00:00Z", actorId: "finance-a", actorName: "Finance reviewer",
      method: "bank_transfer", reference: "Reversed original", note: null, evidenceIds: [], relatedTransactionId: null, reversed: true }], total: 1, limit: 20, offset: 0 } })));
    expect(await screen.findByText("Reversed original")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Correct opening balance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reconcile opening payments" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record replacement payment" })).not.toBeInTheDocument();
  });

  it("shows and enforces the unused retention grant separately from the milestone balance", async () => {
    const order = paymentOrderFixture(["record"]);
    order.milestones[0]!.retention = { id: "retention-a", amountPaise: 20000, remainingPaise: 4000, dueDate: "2027-01-15", ownerId: "finance-a", approvedAt: "2026-11-27T06:00:00Z", acknowledgedAt: "2026-11-27T07:00:00Z" };
    mount(order, "finance");
    expect(await screen.findByText(/Retention originally approved: ₹200.00. Retention remaining: ₹40.00/)).toBeVisible();
    const editor = await form("Record payment");
    await userEvent.type(editor.getByLabelText("Payment amount in rupees"), "50");
    await userEvent.type(editor.getByLabelText("Advance allocation in rupees"), "50");
    await userEvent.type(editor.getByLabelText("Transaction reference"), "EXCEEDS-RETENTION");
    await userEvent.click(editor.getByRole("button", { name: "Record payment" }));
    expect(await editor.findByRole("alert")).toHaveTextContent("cannot exceed the confirmed remaining retention");
  });

  it("does not substitute the approved grant when retention remaining is absent", async () => {
    const order = paymentOrderFixture([]);
    order.milestones[0]!.retention = { id: "retention-a", amountPaise: 20000, remainingPaise: 4000, dueDate: "2027-01-15", ownerId: "finance-a", approvedAt: "2026-11-27T06:00:00Z", acknowledgedAt: null };
    Reflect.deleteProperty(order.milestones[0]!.retention, "remainingPaise");
    mount(order, "finance");
    expect(await screen.findByText(/Retention originally approved: ₹200.00. Retention remaining: Not yet confirmed/)).toBeVisible();
  });
});

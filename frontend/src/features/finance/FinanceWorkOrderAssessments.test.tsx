import { act, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { FinanceWorkOrderAssessments } from "./FinanceWorkOrderAssessments";

describe("FinanceWorkOrderAssessments", () => {
  it("opens an issued order and records explicit invoice and withholding evidence in paise", async () => {
    const saved: unknown[] = [];
    let reviewed = false;
    const review = { orderId: "order-a", version: 1, revisionId: "revision-a",
      invoiceNumber: "INV-001", invoiceDate: "2026-10-05", invoiceEvidenceReference: "document-001",
      invoiceTotalPaise: 118_000, tdsBasisPaise: 100_000, tdsRateBasisPoints: 100,
      tdsPaise: 1_000, netPayablePaise: 117_000, withholdingEffectiveDate: "2026-10-05",
      withholdingRuleReference: "Reviewed rule reference", reason: "Verified invoice and withholding",
      assessedAt: "2026-10-05T01:00:00.000Z", assessedById: "finance-a" };
    server.use(
      http.get("/api/v1/finance/projects/project-a/work-orders", () => HttpResponse.json({ data: {
        items: [{ id: "order-a", orderNumber: "PO-001", vendorName: "Vendor A", netPaise: 100_000,
          gstPaise: 18_000, totalPaise: 118_000, approvedAt: "2026-10-05T00:00:00.000Z",
          assessmentStatus: reviewed ? "reviewed" : "pending", assessmentVersion: reviewed ? 1 : 0 }], total: 1, limit: 20, offset: 0
      } })),
      http.get("/api/v1/finance/work-orders/order-a/invoice-assessment", () => HttpResponse.json({ data: {
        order: { id: "order-a", orderNumber: "PO-001", projectId: "project-a", vendorName: "Vendor A",
          netPaise: 100_000, gstPaise: 18_000, totalPaise: 118_000 }, assessment: reviewed ? review : null
      } })),
      http.post("/api/v1/finance/work-orders/order-a/invoice-assessment", async ({ request }) => {
        saved.push(await request.json());
        reviewed = true;
        return HttpResponse.json({ data: review });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<FinanceWorkOrderAssessments projectId="project-a" />);
    await user.click(await screen.findByRole("button", { name: /PO-001/ }));
    const editor = await screen.findByRole("region", { name: "Invoice review for PO-001" });
    expect(within(editor).getByText(/pending Finance review/)).toBeVisible();
    await user.type(within(editor).getByLabelText(/Invoice number/), "INV-001");
    await user.type(within(editor).getByLabelText(/Invoice date/), "2026-10-05");
    await user.type(within(editor).getByLabelText(/Invoice evidence reference/), "document-001");
    await user.type(within(editor).getByLabelText(/Invoice total/), "1180.00");
    await user.type(within(editor).getByLabelText(/TDS basis/), "1000.00");
    await user.type(within(editor).getByLabelText(/TDS rate/), "1.00");
    await user.type(within(editor).getByLabelText(/Withholding effective date/), "2026-10-05");
    await user.type(within(editor).getByLabelText(/Withholding rule reference/), "Reviewed rule reference");
    await user.type(within(editor).getByLabelText(/Review reason/), "Verified invoice and withholding");
    await user.click(within(editor).getByRole("button", { name: "Record invoice review" }));
    expect(await screen.findByText(/Reviewed version 1/)).toBeVisible();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ expectedVersion: 0, invoiceTotalPaise: 118_000,
      tdsBasisPaise: 100_000, tdsRateBasisPoints: 100, withholdingEffectiveDate: "2026-10-05" });
  });

  it("blocks a stale Finance draft when another reviewer saves a newer revision", async () => {
    let version = 1;
    let posts = 0;
    const review = { orderId: "order-a", revisionId: "revision-a", invoiceDate: "2026-10-05",
      invoiceEvidenceReference: "document-001", invoiceTotalPaise: 118_000, tdsBasisPaise: 100_000,
      tdsRateBasisPoints: 100, tdsPaise: 1_000, netPayablePaise: 117_000,
      withholdingEffectiveDate: "2026-10-05", withholdingRuleReference: "Reviewed rule reference",
      reason: "Verified invoice and withholding", assessedAt: "2026-10-05T01:00:00.000Z",
      assessedById: "finance-a" };
    server.use(
      http.get("/api/v1/finance/projects/project-a/work-orders", () => HttpResponse.json({ data: {
        items: [{ id: "order-a", orderNumber: "PO-001", vendorName: "Vendor A", netPaise: 100_000,
          gstPaise: 18_000, totalPaise: 118_000, approvedAt: "2026-10-05T00:00:00.000Z",
          assessmentStatus: "reviewed", assessmentVersion: version }], total: 1, limit: 20, offset: 0
      } })),
      http.get("/api/v1/finance/work-orders/order-a/invoice-assessment", () => HttpResponse.json({ data: {
        order: { id: "order-a", orderNumber: "PO-001", projectId: "project-a", vendorName: "Vendor A",
          netPaise: 100_000, gstPaise: 18_000, totalPaise: 118_000 },
        assessment: { ...review, version, invoiceNumber: `INV-00${version}` }
      } })),
      http.post("/api/v1/finance/work-orders/order-a/invoice-assessment", () => {
        posts += 1; return HttpResponse.json({ data: null });
      })
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><FeedbackProvider>
      <FinanceWorkOrderAssessments projectId="project-a" />
    </FeedbackProvider></QueryClientProvider>);
    await user.click(await screen.findByRole("button", { name: /PO-001/ }));
    const editor = await screen.findByRole("region", { name: "Invoice review for PO-001" });
    const invoiceNumber = within(editor).getByLabelText(/Invoice number/);
    expect(invoiceNumber).toHaveValue("INV-001");
    await user.clear(invoiceNumber);
    await user.type(invoiceNumber, "UNSAVED-DRAFT");
    version = 2;
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ["finance", "work-order-assessment", "order-a"] }); });
    expect(await within(editor).findByRole("alert", { name: "" })).toHaveTextContent(/changed while you were editing/);
    expect(within(editor).getByRole("button", { name: "Revise invoice review" })).toBeDisabled();
    expect(invoiceNumber).toHaveValue("UNSAVED-DRAFT");
    await user.click(within(editor).getByRole("button", { name: "Load latest review" }));
    expect(invoiceNumber).toHaveValue("INV-002");
    expect(within(editor).getByRole("button", { name: "Revise invoice review" })).toBeEnabled();
    expect(posts).toBe(0);
  });
});

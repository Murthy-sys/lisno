import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Lead } from "../../api/types";
import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const salesUser = {
  id: "sales-1",
  name: "Priya Sharma",
  email: "sales@lisno.example",
  role: "estimator_sales" as const
};

const leads: Lead[] = [
  {
    id: "lead-draft",
    ownerId: "sales-1",
    clientName: "Aurora Homes",
    clientEmail: "aurora@example.com",
    clientMobile: "9000000001",
    projectName: "Aurora Villa",
    location: "Bengaluru",
    propertyType: "3BHK",
    budgetMin: 2500000,
    budgetMax: 3500000,
    source: "Referral",
    stage: "contacted",
    nextAction: "Contact architect",
    nextActionAt: "2026-08-05T10:00:00.000Z",
    builder: "Aurora Builders",
    areaSqft: 1800,
    targetHandoverAt: "2026-12-01T00:00:00.000Z",
    notes: "Prefers natural materials.",
    latestActivityAt: "2026-08-01T10:00:00.000Z",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z"
  },
  {
    id: "lead-sent",
    ownerId: "sales-1",
    clientName: "Cedar Homes",
    clientEmail: "cedar@example.com",
    clientMobile: "9000000002",
    projectName: "Cedar Loft",
    location: "Mysuru",
    propertyType: "2BHK",
    budgetMin: 1800000,
    budgetMax: 2400000,
    source: "Website",
    stage: "estimate_sent",
    nextAction: "Schedule review",
    nextActionAt: "2026-08-06T10:00:00.000Z",
    builder: null,
    areaSqft: null,
    targetHandoverAt: null,
    notes: null,
    latestActivityAt: null,
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z"
  }
];

const savedEstimates = [
  {
    id: "estimate-draft",
    leadId: "lead-draft",
    propertyType: "3BHK",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: 100000,
    gst: 18000,
    total: 118000,
    status: "draft",
    approvalRequired: true,
    assignedDesignerId: null,
    projectId: null,
    updatedAt: "2026-07-29T10:00:00.000Z",
    lead: {
      id: "lead-draft",
      clientName: "Aurora Homes",
      clientEmail: "aurora@example.com",
      clientMobile: "9000000001",
      projectName: "Aurora Villa",
      propertyType: "3BHK",
      location: "Bengaluru"
    }
  },
  {
    id: "estimate-sent",
    leadId: "lead-sent",
    propertyType: "2BHK",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: 200000,
    gst: 36000,
    total: 236000,
    status: "sent_to_client",
    approvalRequired: true,
    assignedDesignerId: "designer-1",
    projectId: "project-1",
    updatedAt: "2026-07-29T11:00:00.000Z",
    lead: {
      id: "lead-sent",
      clientName: "Cedar Homes",
      clientEmail: "cedar@example.com",
      clientMobile: "9000000002",
      projectName: "Cedar Loft",
      propertyType: "2BHK",
      location: "Mysuru"
    }
  }
];

describe("LeadDashboard", () => {
  it("shows the estimator pipeline overview, responsive lead fields, and creation dialog", async () => {
    tokenStorage.set("sales-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: salesUser });
      if (url.startsWith("/api/v1/leads?")) {
        return Response.json({
          data: {
            items: leads,
            pagination: { limit: 20, offset: 0, total: 2, hasMore: false }
          }
        });
      }
      if (url === "/api/v1/estimates") return Response.json({ data: savedEstimates });
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp(["/estimator-sales"]);

    expect(await screen.findByRole("heading", { name: "Lead workspace" })).toBeVisible();
    const overview = screen.getByRole("region", { name: "Pipeline overview" });
    expect(within(overview).getByText("Visible leads")).toBeVisible();
    expect(within(within(overview).getByText("Visible leads").parentElement!).getByText("2", { selector: "dd" })).toBeVisible();
    expect(within(overview).getByText("Saved estimates")).toBeVisible();
    expect(within(overview).getByText("Draft estimates")).toBeVisible();
    expect(within(overview).getByText("1", { selector: "dd" })).toBeVisible();
    expect(within(overview).getByText("Saved value")).toBeVisible();
    expect(within(overview).getByText("₹3,54,000", { selector: "dd" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Leads", level: 2 })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Saved estimates", level: 2 })).not.toBeInTheDocument();
    expect(screen.getByText("Estimate", { selector: ".lead-list__header span" })).toBeVisible();
    expect(screen.queryByText("Contact architect")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New lead" }));
    expect(await screen.findByRole("dialog", { name: "New lead" })).toBeVisible();
  });
});

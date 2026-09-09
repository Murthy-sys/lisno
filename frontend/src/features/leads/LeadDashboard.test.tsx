import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Lead } from "../../api/types";
import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
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
    projectId: null,
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
    projectId: null,
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
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(salesUser.role) });
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
    // Saved estimates live in the lead list only: the duplicate card grid is gone.
    expect(
      screen.queryByRole("region", { name: "Saved estimates" })
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Export as PDF" })
    ).toHaveLength(1);
    expect(within(screen.getByRole("article", { name: "Aurora Villa" })).queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
    expect(screen.getByText("Estimate", { selector: ".lead-list__header span" })).toBeVisible();
    expect(screen.queryByText("Contact architect")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Initiate project" })).toBeVisible();
    // Initiation replaces standalone lead creation.
    expect(screen.queryByRole("button", { name: "New lead" })).not.toBeInTheDocument();
  });

  it("keeps leads usable when saved estimates fail", async () => {
    tokenStorage.set("sales-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: salesUser });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(salesUser.role) });
      if (url.startsWith("/api/v1/leads?")) {
        return Response.json({
          data: {
            items: leads,
            pagination: { limit: 20, offset: 0, total: 2, hasMore: false }
          }
        });
      }
      if (url === "/api/v1/estimates") {
        return Response.json(
          { error: { code: "ESTIMATES_FAILED", message: "Unavailable" } },
          { status: 500 }
        );
      }
      throw new Error("Unhandled request: " + url);
    });

    renderApp(["/estimator-sales"]);

    expect(
      await screen.findByRole("heading", { name: "Aurora Villa", level: 3 })
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Saved estimates are unavailable."
    );
    const overview = screen.getByRole("region", { name: "Pipeline overview" });
    for (const label of ["Saved estimates", "Draft estimates", "Saved value"]) {
      const metric = within(overview).getByText(label).parentElement!;
      expect(within(metric).getByText("—", { selector: "dd" })).toBeVisible();
      expect(within(metric).queryByText("0", { selector: "dd" })).not.toBeInTheDocument();
      expect(within(metric).queryByText("₹0", { selector: "dd" })).not.toBeInTheDocument();
    }
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
  it("hides initiation when the backend permission snapshot does not grant it", async () => {
    tokenStorage.set("sales-token");
    const authorization = authorizationFor(salesUser.role);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: salesUser });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: {
        ...authorization,
        permissions: authorization.permissions.filter((permission) => permission !== "projects.initiate")
      } });
      if (url.startsWith("/api/v1/leads?")) return Response.json({ data: {
        items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false }
      } });
      if (url === "/api/v1/estimates") return Response.json({ data: [] });
      throw new Error(`Unhandled request: ${url}`);
    });
    renderApp(["/estimator-sales"]);
    expect(await screen.findByRole("heading", { name: "No leads yet" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Initiate project" })).not.toBeInTheDocument();
    expect(screen.getByText("Assigned project leads appear here.")).toBeVisible();
  });

  it("initiates from an empty sales pipeline and opens the created lead after refreshing the list", async () => {
    tokenStorage.set("sales-token");
    const manager = { id: "manager-1", name: "Meera Manager", email: "meera@example.com", title: "Sales Manager" };
    const createdLead = { ...leads[0]!, id: "lead-created", projectId: "project-created" };
    let initiated = false;
    let refreshed = false;
    let payload: Record<string, unknown> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: salesUser });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(salesUser.role) });
      if (url.startsWith("/api/v1/leads?")) {
        if (initiated) refreshed = true;
        return Response.json({ data: {
          items: initiated ? [createdLead] : [],
          pagination: { limit: 20, offset: 0, total: initiated ? 1 : 0, hasMore: false }
        } });
      }
      if (url === "/api/v1/estimates") return Response.json({ data: [] });
      if (url.startsWith("/api/v1/admin/sales-managers?")) return Response.json({ data: {
        items: [manager], pagination: { limit: 20, offset: 0, total: 1, hasMore: false }
      } });
      if (url === "/api/v1/admin/projects" && init?.method === "POST") {
        payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        initiated = true;
        return Response.json({ data: {
          id: "project-created", name: "Aurora Villa", status: "planning", location: "Bengaluru",
          client: { name: "Aurora Homes", email: "aurora@example.com", mobile: "9000000001" },
          propertyType: "3BHK", budgetMin: 2500000, budgetMax: 3500000,
          estimator: { id: salesUser.id, name: salesUser.name, email: salesUser.email },
          lead: { id: "lead-created", stage: "new_lead", nextAction: "Site visit", nextActionAt: "2026-10-01T05:00:00.000Z" },
          estimate: null, createdAt: "2026-09-09T10:00:00.000Z"
        } }, { status: 201 });
      }
      if (url === "/api/v1/leads/lead-created") return Response.json({ data: createdLead });
      if (url.startsWith("/api/v1/leads/lead-created/activities?")) return Response.json({ data: {
        items: [], pagination: { limit: 50, offset: 0, total: 0, hasMore: false }
      } });
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();
    const { router } = renderApp(["/estimator-sales"]);
    expect(await screen.findByText("Initiate a project to create your first lead.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Initiate project" }));
    const dialog = screen.getByRole("dialog", { name: "Initiate project" });
    for (const [label, value] of Object.entries({
      "Client name": "Aurora Homes", "Client email": "aurora@example.com", Mobile: "9000000001",
      "Project / property name": "Aurora Villa", Location: "Bengaluru", "Property type": "3BHK",
      "Minimum budget": "2500000", "Maximum budget": "3500000", "Next action": "Site visit", "Next action date": "2026-10-01T10:30"
    })) {
      await user.type(within(dialog).getByLabelText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*?$`)), value);
    }
    await user.click(within(dialog).getByRole("combobox", { name: "Sales Manager" }));
    await user.click(await within(dialog).findByRole("option", { name: /Meera Manager/ }));
    await user.click(within(dialog).getByRole("button", { name: "Initiate project" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/estimator-sales/leads/lead-created"));
    expect(await screen.findByRole("heading", { name: "Aurora Homes" })).toBeVisible();
    expect(refreshed).toBe(true);
    expect(payload).toMatchObject({ salesManagerId: "manager-1", projectName: "Aurora Villa" });
    expect(payload).not.toHaveProperty("estimatorId");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

});

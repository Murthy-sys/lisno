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

const stageFilters = [
  ["new_lead", "New lead"],
  ["contacted", "Contacted"],
  ["site_visit", "Site visit"],
  ["design_meeting", "Design meeting"],
  ["estimate_in_progress", "Estimate in progress"],
  ["estimate_sent", "Estimate sent"],
  ["negotiation", "Negotiation"],
  ["won", "Won"],
  ["lost", "Lost"]
] as const;

function mockDashboardReads(getLeads: (url: URL) => Lead[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/api/v1/auth/me") return Response.json({ data: salesUser });
    if (path === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(salesUser.role) });
    if (path.startsWith("/api/v1/leads?")) {
      const items = getLeads(new URL(path, "http://localhost"));
      return Response.json({ data: {
        items,
        pagination: { limit: 20, offset: 0, total: items.length, hasMore: false }
      } });
    }
    if (path === "/api/v1/estimates") return Response.json({ data: savedEstimates });
    throw new Error(`Unhandled request: ${path}`);
  });
}

describe("LeadDashboard", () => {
  it("shows truthful metrics, lead details, next actions, and the existing estimate routes", async () => {
    tokenStorage.set("sales-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: salesUser });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(salesUser.role) });
      if (url.startsWith("/api/v1/leads?")) {
        return Response.json({
          data: {
            items: leads,
            pagination: { limit: 20, offset: 0, total: 42, hasMore: true }
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
    expect(screen.getByText("2 shown of 42")).toBeVisible();
    expect(within(overview).getByText("Saved estimates")).toBeVisible();
    expect(within(overview).getByText("Draft estimates")).toBeVisible();
    expect(within(overview).getByText("1", { selector: "dd" })).toBeVisible();
    expect(within(overview).getByText("Saved value")).toBeVisible();
    expect(within(overview).getByText("₹3,54,000", { selector: "dd" })).toBeVisible();
    for (const helper of [
      "Shown on this page",
      "Includes draft estimates",
      "Of your saved estimates",
      "Sum of saved estimates, including drafts"
    ]) {
      expect(within(overview).getByText(helper)).toBeVisible();
    }
    expect(screen.getByRole("heading", { name: "Leads", level: 2 })).toBeVisible();
    // Saved estimates live in the lead list only: the duplicate card grid is gone.
    expect(
      screen.queryByRole("region", { name: "Saved estimates" })
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Export as PDF" })
    ).toHaveLength(1);
    expect(within(screen.getByRole("article", { name: "Aurora Villa" })).queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Created on")[0]).toBeVisible();
    expect(screen.getAllByText("Next action")[0]).toBeVisible();
    const draftRow = screen.getByRole("article", { name: "Aurora Villa" });
    expect(within(draftRow).getByText("Contact architect")).toBeVisible();
    expect(within(draftRow).getByText("01 Jul 2026")).toBeVisible();
    expect(within(draftRow).getByText("05 Aug 2026")).toBeVisible();
    expect(within(draftRow).getByRole("link", { name: "Continue estimate" })).toHaveAttribute(
      "href", "/estimator-sales/leads/lead-draft/estimate"
    );
    expect(within(screen.getByRole("article", { name: "Cedar Loft" })).getByRole("link", { name: "View details" })).toHaveAttribute(
      "href", "/estimator-sales/leads/lead-sent/estimate"
    );
    expect(screen.getByRole("button", { name: "Initiate project" })).toBeVisible();
  });

  it("requests each exact lead stage and marks the selected filter", async () => {
    tokenStorage.set("sales-token");
    const requests: URL[] = [];
    mockDashboardReads((url) => {
      requests.push(url);
      return [];
    });
    const user = userEvent.setup();
    renderApp(["/estimator-sales"]);

    expect(await screen.findByRole("heading", { name: "No leads yet" })).toBeVisible();
    const filters = screen.getByRole("group", { name: "Lead stage" });
    expect(within(filters).getByRole("button", { name: "All stages" })).toHaveAttribute("aria-pressed", "true");
    expect(requests[0]?.searchParams.get("stage")).toBeNull();

    for (const [value, label] of stageFilters) {
      const button = within(filters).getByRole("button", { name: label });
      await user.click(button);
      await waitFor(() => expect(requests.at(-1)?.searchParams.get("stage")).toBe(value));
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(requests.at(-1)?.searchParams.get("limit")).toBe("20");
      expect(requests.at(-1)?.searchParams.get("offset")).toBe("0");
      expect([...requests.at(-1)!.searchParams.keys()].sort()).toEqual(["limit", "offset", "stage"]);
    }

    await user.click(within(filters).getByRole("button", { name: "All stages" }));
    expect(within(filters).getByRole("button", { name: "All stages" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sends supported search terms and keeps search independent of the stage filter", async () => {
    tokenStorage.set("sales-token");
    const requests: URL[] = [];
    mockDashboardReads((url) => {
      requests.push(url);
      const search = url.searchParams.get("search")?.toLowerCase() ?? "";
      return leads.filter((lead) => [
        lead.clientName, lead.clientEmail, lead.clientMobile, lead.projectName
      ].some((field) => field.toLowerCase().includes(search)));
    });
    const user = userEvent.setup();
    renderApp(["/estimator-sales"]);

    const search = await screen.findByRole("searchbox", { name: "Search leads" });
    expect(search).toHaveAttribute("placeholder", "Search client name, email, mobile or project");
    for (const term of ["Aurora Homes", "aurora@example.com", "9000000001", "Aurora Villa"]) {
      await user.clear(search);
      await user.type(search, term);
      await waitFor(() => expect(requests.some((url) => url.searchParams.get("search") === term)).toBe(true));
      expect(await screen.findByRole("article", { name: "Aurora Villa" })).toBeVisible();
    }

    await user.click(within(screen.getByRole("group", { name: "Lead stage" })).getByRole("button", { name: "Contacted" }));
    await waitFor(() => expect(requests.some((url) =>
      url.searchParams.get("search") === "Aurora Villa" && url.searchParams.get("stage") === "contacted"
    )).toBe(true));
    expect(search).toHaveValue("Aurora Villa");
  });

  it("hides the previous page during a filter refresh and distinguishes no matches", async () => {
    tokenStorage.set("sales-token");
    let resolveFiltered!: (response: Response) => void;
    const filteredPage = new Promise<Response>((resolve) => { resolveFiltered = resolve; });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/v1/auth/me") return Response.json({ data: salesUser });
      if (path === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(salesUser.role) });
      if (path.startsWith("/api/v1/leads?")) {
        if (new URL(path, "http://localhost").searchParams.get("stage") === "lost") return filteredPage;
        return Response.json({ data: { items: leads, pagination: { limit: 20, offset: 0, total: 2, hasMore: false } } });
      }
      if (path === "/api/v1/estimates") return Response.json({ data: savedEstimates });
      throw new Error(`Unhandled request: ${path}`);
    });
    const user = userEvent.setup();
    renderApp(["/estimator-sales"]);

    expect(await screen.findByRole("article", { name: "Aurora Villa" })).toBeVisible();
    await user.click(within(screen.getByRole("group", { name: "Lead stage" })).getByRole("button", { name: "Lost" }));
    expect(await screen.findByText("Updating leads…")).toBeVisible();
    expect(screen.queryByRole("article", { name: "Aurora Villa" })).not.toBeInTheDocument();
    resolveFiltered(Response.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } }));
    expect(await screen.findByRole("heading", { name: "No matching leads" })).toBeVisible();
    expect(screen.getByText("Try a different search or stage.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "No leads yet" })).not.toBeInTheDocument();
  });

  it("uses explicit fallbacks for invalid or missing action dates", async () => {
    tokenStorage.set("sales-token");
    mockDashboardReads(() => [
      { ...leads[0]!, createdAt: "invalid-date", nextAction: "Email client", nextActionAt: "invalid-date" },
      { ...leads[1]!, nextAction: "", nextActionAt: "" }
    ]);
    renderApp(["/estimator-sales"]);

    const invalid = await screen.findByRole("article", { name: "Aurora Villa" });
    expect(within(invalid).getByText("Email client")).toBeVisible();
    expect(within(invalid).getByText("Date unavailable")).toBeVisible();
    expect(within(invalid).getByText("Date not set")).toBeVisible();
    expect(within(invalid).queryByText(/Overdue|Due today|Upcoming|Invalid Date/)).not.toBeInTheDocument();
    const missing = screen.getByRole("article", { name: "Cedar Loft" });
    expect(within(missing).getByText("No next action set")).toBeVisible();
    expect(within(missing).getByText("Date not set")).toBeVisible();
  });

  it("keeps the lead list loading and retry states usable", async () => {
    tokenStorage.set("sales-token");
    let resolveInitial!: (response: Response) => void;
    const initialPage = new Promise<Response>((resolve) => { resolveInitial = resolve; });
    let attempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/v1/auth/me") return Response.json({ data: salesUser });
      if (path === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(salesUser.role) });
      if (path.startsWith("/api/v1/leads?")) {
        attempts += 1;
        return attempts === 1 ? initialPage : Response.json({ data: {
          items: leads,
          pagination: { limit: 20, offset: 0, total: 2, hasMore: false }
        } });
      }
      if (path === "/api/v1/estimates") return Response.json({ data: savedEstimates });
      throw new Error(`Unhandled request: ${path}`);
    });
    const user = userEvent.setup();
    renderApp(["/estimator-sales"]);

    expect(await screen.findByText("Loading your leads…")).toBeVisible();
    resolveInitial(Response.json({ error: { code: "LEADS_FAILED", message: "Unavailable" } }, { status: 500 }));
    expect(await screen.findByText("We couldn't load your leads.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("article", { name: "Aurora Villa" })).toBeVisible();
    expect(attempts).toBe(2);
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

  it("keeps list context and isolates a late response after reviewing another lead", async () => {
    tokenStorage.set("sales-token");
    let resolveFirst!: (response: Response) => void;
    const firstDetail = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/v1/auth/me") return Response.json({ data: salesUser });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(salesUser.role) });
      if (url.startsWith("/api/v1/leads?")) return Response.json({ data: { items: leads, pagination: { limit: 20, offset: 0, total: 2, hasMore: false } } });
      if (url === "/api/v1/estimates") return Response.json({ data: savedEstimates });
      if (url === "/api/v1/leads/lead-draft") return firstDetail;
      if (url === "/api/v1/leads/lead-sent") return Response.json({ data: leads[1] });
      if (url.includes("/activities?")) return Response.json({ data: { items: [], pagination: { limit: 50, offset: 0, total: 0, hasMore: false } } });
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();
    const { router, queryClient } = renderApp(["/estimator-sales"]);
    await user.type(await screen.findByRole("searchbox", { name: "Search leads" }), "Homes");
    const firstTrigger = await screen.findByRole("button", { name: "Review Aurora Villa" });
    await user.click(firstTrigger);
    expect(screen.getByRole("dialog", { name: "Lead review" })).toHaveTextContent("Loading lead details");
    await user.click(within(screen.getByRole("dialog", { name: "Lead review" })).getByRole("button", { name: "Close lead review" }));
    await waitFor(() => expect(firstTrigger).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Review Cedar Loft" }));
    const panel = screen.getByRole("dialog", { name: "Lead review" });
    expect(await within(panel).findByText("Cedar Homes")).toBeVisible();
    resolveFirst(Response.json({ data: leads[0] }));
    await waitFor(() => expect(queryClient.getQueryData(["leads", "lead-draft"])).toMatchObject({ id: "lead-draft" }));
    await waitFor(() => expect(within(panel).queryByText("Aurora Homes")).not.toBeInTheDocument());
    expect(within(panel).getByRole("link", { name: "Open lead workspace" })).toHaveAttribute("href", "/estimator-sales/leads/lead-sent");
    expect(requests).toContain("/api/v1/leads/lead-draft");
    expect(requests).toContain("/api/v1/leads/lead-sent");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("searchbox", { name: "Search leads" })).toHaveValue("Homes");
    expect(router.state.location.pathname).toBe("/estimator-sales");
  });

  it("does not expose quick review or fetch detail without the read grant", async () => {
    tokenStorage.set("sales-token");
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/v1/auth/me") return Response.json({ data: salesUser });
      if (url === "/api/v1/auth/authorization") {
        const authorization = authorizationFor(salesUser.role);
        return Response.json({ data: { ...authorization, permissions: authorization.permissions.filter((permission) => permission !== "estimation.lead.read") } });
      }
      if (url.startsWith("/api/v1/leads?")) return Response.json({ data: { items: leads, pagination: { limit: 20, offset: 0, total: 2, hasMore: false } } });
      if (url === "/api/v1/estimates") return Response.json({ data: [] });
      throw new Error(`Unhandled request: ${url}`);
    });
    renderApp(["/estimator-sales"]);
    expect(await screen.findByRole("heading", { name: "Aurora Villa" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Review Aurora/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open lead" })[0]).toHaveAttribute("href", "/estimator-sales/leads/lead-draft");
    expect(requests.some((url) => url.startsWith("/api/v1/leads/"))).toBe(false);
  });

});

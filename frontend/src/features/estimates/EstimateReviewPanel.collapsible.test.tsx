import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const stylesheet = readFileSync("src/styles/index.css", "utf8");

const client = {
  id: "client-1",
  name: "Aurora Homes",
  email: "client@lisno.example",
  role: "client" as const
};

const clientEstimates = [
  {
    id: "estimate-ready",
    leadId: "lead-villa",
    propertyType: "3BHK",
    rooms: [],
    scopes: ["FC"],
    lineItems: [{ catalogueId: "FC01", roomName: "Living room", specification: "plain_gyp", unit: "sqft", rate: 95, quantity: 100, included: true }],
    subtotal: 100000,
    gst: 18000,
    total: 118000,
    status: "sent_to_client",
    approvalRequired: true,
    projectId: "project-villa",
    lead: { _id: "lead-villa", clientName: "Aurora Homes", clientEmail: "client@lisno.example", projectName: "Aurora Villa", location: "Bengaluru" }
  },
  {
    id: "estimate-approved",
    leadId: "lead-loft",
    propertyType: "2BHK",
    rooms: [],
    scopes: [],
    lineItems: [],
    subtotal: 200000,
    gst: 36000,
    total: 236000,
    status: "client_approved",
    approvalRequired: false,
    projectId: "project-loft",
    lead: { _id: "lead-loft", clientName: "Aurora Homes", clientEmail: "client@lisno.example", projectName: "Cedar Loft", location: "Mysuru" }
  }
];
const emptyDrawingWorkspace = {
  uploads: [],
  pages: [],
  drawings: [],
  revisions: [],
  readiness: {
    ready: true,
    total: 0,
    approved: 0,
    awaitingReview: 0,
    changesRequested: 0
  }
};
const planWorkspace = {
  pages: [{
    id: "plan-page-1", uploadId: "upload-1", pageNumber: 1,
    width: 1000, height: 800, currentRevisionId: "manifest-1",
    status: "awaiting_review", thumbnailUrl: "/plan-thumb-1",
    currentImageUrl: "/plan-page-1", annotationDraft: null
  }],
  openRequests: []
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function installClientApi() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: client });
    if (url.includes("/api/v1/client/project-summaries?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url.endsWith("/api/v1/client/latest-approved-versions")) return Response.json({ data: [] });
    if (url.endsWith("/api/v1/client/estimates")) return Response.json({ data: clientEstimates });
    if (url.includes("/api/v1/client/estimates/") && url.endsWith("/design-drawings")) {
      return Response.json({ data: emptyDrawingWorkspace });
    }
    if (url.includes("/api/v1/client/estimates/") && url.endsWith("/plan-review")) {
      return Response.json({ data: planWorkspace });
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

function ruleBody(source: string, selector: string) {
  const selectorIndex = source.indexOf(selector);
  if (selectorIndex < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const openingBrace = source.indexOf("{", selectorIndex + selector.length);
  if (openingBrace < 0) throw new Error(`Missing opening brace: ${selector}`);

  let depth = 1;
  for (let index = openingBrace + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  throw new Error(`Missing closing brace: ${selector}`);
}

describe("EstimateReviewPanel client disclosures", () => {
  it("stacks collapsed and expanded controls from the client card width before they collide", () => {
    expect(ruleBody(stylesheet, ".estimate-review-card--client")).toMatch(
      /container-type:\s*inline-size/
    );

    const narrowCardRules = ruleBody(stylesheet, "@container (max-width: 30rem)");
    expect(ruleBody(
      narrowCardRules,
      ".estimate-review-card__client-header"
    )).toContain('grid-template-areas: "heading" "total" "toggle"');
    expect(ruleBody(
      narrowCardRules,
      ".estimate-review-card__client-header--expanded"
    )).toContain('grid-template-areas: "heading" "total" "export" "toggle"');

    const controlRule = ruleBody(
      narrowCardRules,
      ".estimate-review-card__export, .estimate-review-card__toggle"
    );
    expect(controlRule).toMatch(/width:\s*100%/);
    const minimumHeightRem = Number(
      controlRule.match(/min-height:\s*([\d.]+)rem/)?.[1]
    );
    expect(minimumHeightRem * 16).toBeGreaterThanOrEqual(44);
  });

  it("uses compact 40 by 40 drawing thumbnails inside an expanded estimate", () => {
    const thumbnailRule = ruleBody(
      stylesheet,
      ".client-estimate-drawing__thumbnail"
    );
    expect(thumbnailRule).toMatch(/width:\s*40px/);
    expect(thumbnailRule).toMatch(/height:\s*40px/);
  });

  it("keeps the full uploaded design in a sticky right sidebar on desktop", () => {
    const workspaceRule = ruleBody(stylesheet, ".client-estimate-workspace");
    expect(workspaceRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+18rem/);
    expect(workspaceRule).toMatch(/min-width:\s*0/);
    expect(workspaceRule).toMatch(/width:\s*100%/);

    const contentRule = ruleBody(stylesheet, ".estimate-review-card__client-content");
    expect(contentRule).toMatch(/min-width:\s*0/);
    expect(contentRule).toMatch(/overflow:\s*hidden/);

    const navigationRule = ruleBody(stylesheet, ".client-plan-nav");
    expect(navigationRule).not.toMatch(/position:\s*sticky/);

    const railRule = ruleBody(stylesheet, ".client-estimate-workspace__rail");
    expect(railRule).toMatch(/position:\s*sticky/);
    expect(railRule).toMatch(/grid-column:\s*2/);
    expect(railRule).toMatch(/min-height:\s*calc\(100vh\s*-\s*2rem\)/);

    const launcherRule = ruleBody(stylesheet, ".ask-lisno-launcher");
    expect(launcherRule).toMatch(/margin-top:\s*auto/);

    const pageListRule = ruleBody(stylesheet, ".client-plan-nav__pages");
    expect(pageListRule).toMatch(/max-height:\s*none/);
    expect(pageListRule).toMatch(/overflow:\s*visible/);

    const mobileRules = ruleBody(
      stylesheet.slice(stylesheet.lastIndexOf("@media (max-width: 760px)")),
      "@media (max-width: 760px)"
    );
    expect(ruleBody(mobileRules, ".client-estimate-workspace")).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)/
    );
    const mobileRailRule = ruleBody(mobileRules, ".client-estimate-workspace__rail");
    expect(mobileRailRule).toMatch(/position:\s*static/);
    expect(mobileRailRule).toMatch(/min-height:\s*0/);
  });

  it("renders Ask Lisno as a sibling at the bottom of the design-tools rail", async () => {
    tokenStorage.set("client-token");
    installClientApi();
    await userEvent.click((renderApp(["/client"]), await screen.findByRole("button", { name: /Aurora Villa/i })));

    const rail = await screen.findByRole("complementary", { name: "Design tools" });
    const fullDesign = within(rail).getByRole("region", { name: "Full design plan" });
    expect(within(rail).getByRole("button", { name: "Ask Lisno" })).toBeDisabled();
    expect(within(fullDesign).queryByRole("button", { name: "Ask Lisno" })).not.toBeInTheDocument();
  });

  it("keeps client estimate details collapsed until each project is opened independently", async () => {
    tokenStorage.set("client-token");
    installClientApi();
    const user = userEvent.setup();

    renderApp(["/client"]);

    const villaHeading = await screen.findByRole("heading", { name: "Aurora Villa", level: 3 });
    const loftHeading = screen.getByRole("heading", { name: "Cedar Loft", level: 3 });
    const villaCard = villaHeading.closest("article")!;
    const loftCard = loftHeading.closest("article")!;
    const villaHeader = villaCard.querySelector<HTMLElement>(".estimate-review-card__client-header")!;
    const loftHeader = loftCard.querySelector<HTMLElement>(".estimate-review-card__client-header")!;
    expect(villaHeading).toBeVisible();
    expect(loftHeading).toBeVisible();
    expect(within(villaCard).getAllByText("₹1,18,000")[0]).toBeVisible();
    expect(within(loftCard).getAllByText("₹2,36,000")[0]).toBeVisible();
    expect(within(villaCard).queryByText("Bengaluru")).not.toBeInTheDocument();
    expect(within(loftCard).queryByText("Mysuru")).not.toBeInTheDocument();
    expect(within(villaCard).queryByText("Aurora Homes")).not.toBeInTheDocument();
    expect(within(loftCard).queryByText("Aurora Homes")).not.toBeInTheDocument();
    expect(within(villaCard).queryByText("1 items · GST included")).not.toBeInTheDocument();
    expect(within(loftCard).queryByText("0 items · GST included")).not.toBeInTheDocument();
    expect(within(villaCard).queryByText("Review section-wise estimate")).not.toBeInTheDocument();
    expect(within(loftCard).queryByText("Review section-wise estimate")).not.toBeInTheDocument();
    expect(screen.queryByText("Estimate approved")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Review note")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();

    const villaToggle = screen.getByRole("button", { name: /Aurora Villa/ });
    const loftToggle = screen.getByRole("button", { name: /Cedar Loft/ });
    expect(villaToggle).toHaveAttribute("aria-expanded", "false");
    expect(loftToggle).toHaveAttribute("aria-expanded", "false");
    expect(villaToggle).toHaveAttribute("aria-controls", "client-estimate-estimate-ready-details");
    expect(loftToggle).toHaveAttribute("aria-controls", "client-estimate-estimate-approved-details");
    expect(villaToggle.getAttribute("aria-controls")).not.toBe(loftToggle.getAttribute("aria-controls"));

    await user.click(villaToggle);

    const villaPanel = document.getElementById("client-estimate-estimate-ready-details")!;
    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(loftToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(villaPanel).getByText("Bengaluru")).toBeVisible();
    expect(within(villaPanel).getByText("Aurora Homes")).toBeVisible();
    expect(within(villaPanel).getByText("1 items · GST included")).toBeVisible();
    expect(within(villaPanel).getByText("False Ceiling")).toBeVisible();
    expect(within(villaPanel).getByLabelText("Review note")).toBeVisible();
    expect(within(villaPanel).getByRole("button", { name: "Approve estimate" })).toBeVisible();
    expect(within(villaPanel).getByRole("button", { name: "Request changes" })).toBeVisible();
    expect(within(villaHeader).getByRole("button", { name: "Export as PDF" })).toBeVisible();
    expect(within(loftHeader).queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
    expect(screen.queryByText("Estimate approved")).not.toBeInTheDocument();

    await user.click(loftToggle);

    const loftPanel = document.getElementById("client-estimate-estimate-approved-details")!;
    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(loftToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(loftPanel).getByText("Estimate approved")).toBeVisible();
    expect(within(loftHeader).getByRole("button", { name: "Export as PDF" })).toBeVisible();
    expect(within(loftPanel).queryByLabelText("Review note")).not.toBeInTheDocument();
    expect(within(loftPanel).queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    expect(within(loftPanel).queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();

    await user.click(villaToggle);

    expect(villaToggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("client-estimate-estimate-ready-details")).not.toBeInTheDocument();
    expect(within(villaHeader).queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
    expect(within(loftPanel).getByText("Estimate approved")).toBeVisible();
  });

  it("downloads an expanded estimate from the authenticated client endpoint without toggling it", async () => {
    tokenStorage.set("client-token");
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:client-estimate"),
      revokeObjectURL: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: client });
      if (url.includes("/api/v1/client/project-summaries?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      if (url.endsWith("/api/v1/client/latest-approved-versions")) return Response.json({ data: [] });
      if (url.endsWith("/api/v1/client/estimates")) return Response.json({ data: clientEstimates });
      if (url.includes("/api/v1/client/estimates/") && url.endsWith("/design-drawings")) {
        return Response.json({ data: emptyDrawingWorkspace });
      }
      if (url.endsWith("/api/v1/client/estimates/estimate-ready/pdf")) {
        return new Response(new Blob(["pdf"], { type: "application/pdf" }));
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp(["/client"]);

    const villaHeading = await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    });
    const villaCard = villaHeading.closest("article")!;
    const villaToggle = within(villaCard).getByRole("button", {
      name: /Aurora Villa/
    });
    await user.click(villaToggle);
    await user.click(within(villaCard).getByRole("button", {
      name: "Export as PDF"
    }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/client/estimates/estimate-ready/pdf",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers)
      })
    ));
    const pdfRequest = fetchSpy.mock.calls.find(
      ([input]) => String(input) === "/api/v1/client/estimates/estimate-ready/pdf"
    );
    expect((pdfRequest?.[1]?.headers as Headers).get("Authorization")).toBe(
      "Bearer client-token"
    );
    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("client-estimate-estimate-ready-details")).toBeInTheDocument();
  });

  it("identifies the expanded client estimate when its PDF export fails", async () => {
    tokenStorage.set("client-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: client });
      if (url.includes("/api/v1/client/project-summaries?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      if (url.endsWith("/api/v1/client/latest-approved-versions")) return Response.json({ data: [] });
      if (url.endsWith("/api/v1/client/estimates")) return Response.json({ data: clientEstimates });
      if (url.includes("/api/v1/client/estimates/") && url.endsWith("/design-drawings")) {
        return Response.json({ data: emptyDrawingWorkspace });
      }
      if (url.endsWith("/api/v1/client/estimates/estimate-ready/pdf")) {
        return Response.json(
          { error: { code: "PDF_FAILED", message: "PDF failed" } },
          { status: 500 }
        );
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp(["/client"]);

    const villaCard = (await screen.findByRole("heading", {
      name: "Aurora Villa",
      level: 3
    })).closest("article")!;
    await user.click(within(villaCard).getByRole("button", { name: /Aurora Villa/ }));
    await user.click(within(villaCard).getByRole("button", { name: "Export as PDF" }));

    expect(await within(villaCard).findByRole("alert")).toHaveTextContent(
      "PDF export failed for Aurora Villa. Try again."
    );
  });

  it("keeps manager estimate metadata and assignment immediately visible without a disclosure toggle", async () => {
    tokenStorage.set("manager-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: { id: "manager-1", name: "Meera Rao", email: "manager@lisno.example", role: "design_manager" } });
      if (url.endsWith("/api/v1/estimates/review-queue")) return Response.json({ data: [{
        id: "estimate-manager", leadId: "lead-manager", propertyType: "3BHK", rooms: [], scopes: [], lineItems: [], subtotal: 100000, gst: 18000, total: 118000, status: "pending_manager_assignment", approvalRequired: true, projectId: "project-manager",
        lead: { _id: "lead-manager", clientName: "Orchid Studio", clientEmail: "orchid@lisno.example", projectName: "Harbor House", location: "Kochi" }
      }] });
      if (url.endsWith("/api/v1/estimates/designers")) return Response.json({ data: [{ id: "designer-1", name: "Ananya Shah", email: "ananya@lisno.example", title: "Senior Designer" }] });
      if (url.includes("/api/v1/organization/team?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/manager"]);

    expect(await screen.findByRole("heading", { name: "Harbor House", level: 3 })).toBeVisible();
    expect(screen.getByText("Kochi")).toBeVisible();
    expect(screen.getByText("Orchid Studio")).toBeVisible();
    expect(screen.getByText("0 items · GST included")).toBeVisible();
    expect(screen.getByLabelText("Assign approval to")).toBeVisible();
    expect(screen.getByRole("button", { name: "Assign designer" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Harbor House/ })).not.toBeInTheDocument();
  });

  it("keeps designer estimate metadata and review actions immediately visible without a disclosure toggle", async () => {
    tokenStorage.set("designer-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: { id: "designer-1", name: "Ananya Shah", email: "ananya@lisno.example", role: "designer" } });
      if (url.endsWith("/api/v1/estimates/review-queue")) return Response.json({ data: [{
        id: "estimate-designer", leadId: "lead-designer", propertyType: "3BHK", rooms: [], scopes: [], lineItems: [], subtotal: 100000, gst: 18000, total: 118000, status: "pending_designer_approval", approvalRequired: true, projectId: "project-designer",
        lead: { _id: "lead-designer", clientName: "Orchid Studio", clientEmail: "orchid@lisno.example", projectName: "Harbor House", location: "Kochi" }
      }] });
      if (url.startsWith("/api/v1/projects?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      if (url.startsWith("/api/v1/kpis/users/designer-1/tasks?")) return Response.json({ data: { items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } } });
      if (url.startsWith("/api/v1/kpis/users/designer-1?")) return Response.json({ data: { score: 0, components: [], aggregates: { taskCounts: { total: 0, completed: 0, active: 0 }, riskCounts: { gray: 0, green: 0, yellow: 0, red: 0 }, effort: { planned: 0, completed: 0, remaining: 0, workloadPercentage: 0 }, projects: [], recentActivity: [] } } });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/designer"]);

    const card = (await screen.findByRole("heading", { name: "Harbor House", level: 3 })).closest("article")!;
    expect(within(card).getByText("Kochi")).toBeVisible();
    expect(within(card).getByText("Orchid Studio")).toBeVisible();
    expect(within(card).getByText("0 items · GST included")).toBeVisible();
    expect(within(card).getByLabelText("Review note")).toBeVisible();
    expect(within(card).getByRole("button", { name: "Request changes" })).toBeVisible();
    expect(within(card).getByRole("button", { name: "Approve for client" })).toBeVisible();
    expect(within(card).queryByRole("button", { name: /Harbor House/ })).not.toBeInTheDocument();
  });
});

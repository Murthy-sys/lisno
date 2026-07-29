import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

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

function installClientApi() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: client });
    if (url.includes("/api/v1/client/project-summaries?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url.endsWith("/api/v1/client/latest-approved-versions")) return Response.json({ data: [] });
    if (url.endsWith("/api/v1/client/estimates")) return Response.json({ data: clientEstimates });
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("EstimateReviewPanel client disclosures", () => {
  it("keeps client estimate details collapsed until each project is opened independently", async () => {
    tokenStorage.set("client-token");
    installClientApi();
    const user = userEvent.setup();

    renderApp(["/client"]);

    const villaHeading = await screen.findByRole("heading", { name: "Aurora Villa", level: 3 });
    const loftHeading = screen.getByRole("heading", { name: "Cedar Loft", level: 3 });
    const villaCard = villaHeading.closest("article")!;
    const loftCard = loftHeading.closest("article")!;
    expect(villaHeading).toBeVisible();
    expect(loftHeading).toBeVisible();
    expect(within(villaCard).getAllByText("₹1,18,000")[0]).toBeVisible();
    expect(within(loftCard).getAllByText("₹2,36,000")[0]).toBeVisible();
    expect(within(villaCard).queryByText("Bengaluru")).not.toBeInTheDocument();
    expect(within(loftCard).queryByText("Mysuru")).not.toBeInTheDocument();
    expect(within(villaCard).queryByText("Aurora Homes")).not.toBeInTheDocument();
    expect(within(villaCard).queryByText("1 items · GST included")).not.toBeInTheDocument();
    expect(within(villaCard).queryByText("Review section-wise estimate")).not.toBeInTheDocument();
    expect(screen.queryByText("Estimate approved")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Review note")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();

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
    expect(screen.queryByText("Estimate approved")).not.toBeInTheDocument();

    await user.click(loftToggle);

    const loftPanel = document.getElementById("client-estimate-estimate-approved-details")!;
    expect(villaToggle).toHaveAttribute("aria-expanded", "true");
    expect(loftToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(loftPanel).getByText("Estimate approved")).toBeVisible();
    expect(within(loftPanel).queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();

    await user.click(villaToggle);

    expect(villaToggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("client-estimate-estimate-ready-details")).not.toBeInTheDocument();
    expect(within(loftPanel).getByText("Estimate approved")).toBeVisible();
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
});

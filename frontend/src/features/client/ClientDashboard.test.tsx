import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const client = { id: "client-1", name: "Aurora Homes", email: "client@lisno.example", role: "client" as const };

const projects = [
  { id: "project-villa", name: "Aurora Villa", clientId: "client-1", initiatingDesignerId: "designer-1", assignedDesignerIds: ["designer-1"], managerId: "manager-1", status: "active", location: "Bengaluru", plannedStartAt: "2026-06-01T00:00:00.000Z", plannedEndAt: "2026-09-30T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
  { id: "project-loft", name: "Cedar Loft", clientId: "client-1", initiatingDesignerId: "designer-1", assignedDesignerIds: ["designer-1"], managerId: "manager-1", status: "planning", location: "Mysuru", plannedStartAt: "2026-07-01T00:00:00.000Z", plannedEndAt: "2026-10-30T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" }
];
const summaries = projects.map((project, index) => ({
  id: project.id,
  name: project.name,
  status: project.status,
  location: project.location,
  plannedStartAt: project.plannedStartAt,
  plannedEndAt: project.plannedEndAt,
  actualStartAt: project.actualStartAt,
  actualEndAt: project.actualEndAt,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  progress: index === 0 ? 64 : 0,
  floorCount: index === 0 ? 3 : 1
}));

describe("ClientDashboard", () => {
  it("shows an approved estimate as completed history without decision buttons", async () => {
    tokenStorage.set("client-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: client });
      if (url.includes("/api/v1/client/project-summaries?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      if (url.endsWith("/api/v1/client/estimates")) return Response.json({ data: [{
        id: "estimate-approved",
        leadId: "lead-1",
        propertyType: "2BHK",
        rooms: [],
        scopes: [],
        lineItems: [],
        subtotal: 100000,
        gst: 18000,
        total: 118000,
        status: "client_approved",
        approvalRequired: false,
        projectId: "project-1",
        lead: { _id: "lead-1", clientName: "Aurora Homes", clientEmail: "client@lisno.example", projectName: "Aurora Villa", location: "Bengaluru" }
      }] });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/client"]);

    expect(await screen.findByText("Estimate approved")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();
  });

  it("shows multiple client projects with their latest approved update and no internal metrics", async () => {
    tokenStorage.set("client-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: client });
      if (url.includes("/api/v1/client/project-summaries?")) return Response.json({ data: { items: summaries, pagination: { limit: 100, offset: 0, total: 2, hasMore: false } } });
      if (url.endsWith("/api/v1/client/latest-approved-versions")) return Response.json({ data: [
        { id: "version-villa", projectId: "project-villa", floorId: "floor-1", stageId: "stage-1", taskId: null, versionNumber: 2, originalFilename: "Villa floor plan.pdf", mimeType: "application/pdf", sizeBytes: 1200, uploadedAt: "2026-07-12T00:00:00.000Z", approvalStatus: "approved", approvedAt: "2026-07-14T00:00:00.000Z", clientVisible: true, createdAt: "2026-07-12T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z" },
        { id: "draft-never-show", projectId: "project-loft", floorId: "floor-2", stageId: "stage-2", taskId: null, versionNumber: 1, originalFilename: "Internal draft.pdf", mimeType: "application/pdf", sizeBytes: 1200, uploadedAt: "2026-07-12T00:00:00.000Z", approvalStatus: "draft", approvedAt: null, clientVisible: false, createdAt: "2026-07-12T00:00:00.000Z", updatedAt: "2026-07-12T00:00:00.000Z" }
      ] });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/client"]);

    expect(await screen.findByRole("heading", { name: "Your design plans" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Your design plans" })).not.toHaveClass("client-page--project");
    expect(screen.getByText("Aurora Villa")).toBeVisible();
    expect(screen.getByText("Cedar Loft")).toBeVisible();
    expect(screen.getByText("64% complete")).toBeVisible();
    expect(screen.getByText("3 floors")).toBeVisible();
    await userEvent.click(await screen.findByRole("button", { name: /Aurora Villa/ }));
    await userEvent.click(screen.getByRole("button", { name: /Cedar Loft/ }));
    expect(await screen.findByText("Villa floor plan.pdf")).toBeVisible();
    expect(screen.getByText(/No approved plan available yet/)).toBeVisible();
    expect(screen.queryByText("Internal draft.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText(/KPI|evaluation|internal note|draft/i)).not.toBeInTheDocument();
  });

  it("shows a retryable error per project when the bounded latest-update request fails", async () => {
    tokenStorage.set("client-token");
    let attempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: client });
      if (url.includes("/api/v1/client/project-summaries?")) return Response.json({ data: { items: summaries, pagination: { limit: 100, offset: 0, total: 2, hasMore: false } } });
      if (url.endsWith("/api/v1/client/latest-approved-versions")) {
        attempts += 1;
        return attempts === 1 ? Response.json({ error: { code: "REQUEST_FAILED", message: "Unavailable" } }, { status: 503 }) : Response.json({ data: [] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/client"]);
    await userEvent.click(await screen.findByRole("button", { name: /Aurora Villa/ }));
    await userEvent.click(screen.getByRole("button", { name: /Cedar Loft/ }));
    expect(await screen.findAllByText("Latest approved update unavailable.")).toHaveLength(2);
    expect(screen.queryByText("No approved plan available yet.")).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Retry approved updates" })[0]!);
    expect(await screen.findAllByText("No approved plan available yet.")).toHaveLength(2);
  });

  it("distinguishes an account with no projects from plans still being prepared", async () => {
    tokenStorage.set("client-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me")) return Response.json({ data: client });
      if (url.includes("/api/v1/client/project-summaries?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/client"]);
    expect(await screen.findByText("No projects have been shared with you yet.")).toBeVisible();
  });
});

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const client = { id: "client-1", name: "Aurora Homes", email: "client@lisno.example", role: "client" as const };

const projects = [
  { id: "project-villa", name: "Aurora Villa", clientId: "client-1", initiatingDesignerId: "designer-1", assignedDesignerIds: ["designer-1"], managerId: "manager-1", status: "active", location: "Bengaluru", plannedStartAt: "2026-06-01T00:00:00.000Z", plannedEndAt: "2026-09-30T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
  { id: "project-loft", name: "Cedar Loft", clientId: "client-1", initiatingDesignerId: "designer-1", assignedDesignerIds: ["designer-1"], managerId: "manager-1", status: "planning", location: "Mysuru", plannedStartAt: "2026-07-01T00:00:00.000Z", plannedEndAt: "2026-10-30T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" }
];

describe("ClientDashboard", () => {
  it("shows multiple client projects with their latest approved update and no internal metrics", async () => {
    tokenStorage.set("client-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: client });
      if (url.startsWith("/api/v1/projects?")) return Response.json({ data: { items: projects, pagination: { limit: 100, offset: 0, total: 2, hasMore: false } } });
      if (url.startsWith("/api/v1/projects/project-villa/design-versions?")) return Response.json({ data: { items: [{ id: "version-villa", projectId: "project-villa", floorId: "floor-1", stageId: "stage-1", taskId: null, versionNumber: 2, originalFilename: "Villa floor plan.pdf", mimeType: "application/pdf", sizeBytes: 1200, uploadedAt: "2026-07-12T00:00:00.000Z", approvalStatus: "approved", approvedAt: "2026-07-14T00:00:00.000Z", clientVisible: true, createdAt: "2026-07-12T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z" }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false } } });
      if (url.startsWith("/api/v1/projects/project-loft/design-versions?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/client"]);

    expect(await screen.findByRole("heading", { name: "Your design plans" })).toBeVisible();
    expect(screen.getByText("Aurora Villa")).toBeVisible();
    expect(screen.getByText("Cedar Loft")).toBeVisible();
    expect(await screen.findByText("Villa floor plan.pdf")).toBeVisible();
    expect(screen.getByText(/No approved plan available yet/)).toBeVisible();
    expect(screen.queryByText(/KPI|evaluation|internal note|draft/i)).not.toBeInTheDocument();
  });

  it("distinguishes an account with no projects from plans still being prepared", async () => {
    tokenStorage.set("client-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: client });
      if (url.startsWith("/api/v1/projects?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/client"]);
    expect(await screen.findByText("No projects have been shared with you yet.")).toBeVisible();
  });
});

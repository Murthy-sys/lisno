import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { renderApp } from "../../test/render";

const client = { id: "client-1", name: "Aurora Homes", email: "client@lisno.example", role: "client" as const };
const project = {
  id: "project-villa", name: "Aurora Villa", clientId: "client-1", initiatingDesignerId: "designer-1", assignedDesignerIds: ["designer-1"], managerId: "manager-1", status: "active", location: "Bengaluru", progress: 52, plannedStartAt: "2026-06-01T00:00:00.000Z", plannedEndAt: "2026-09-30T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
  floors: [
    { id: "floor-ground", projectId: "project-villa", name: "Ground floor", number: "G", order: 1, progress: 70, plannedStartAt: "2026-06-01T00:00:00.000Z", plannedEndAt: "2026-08-01T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", stages: [] },
    { id: "floor-first", projectId: "project-villa", name: "First floor", number: "1", order: 2, progress: 35, plannedStartAt: "2026-07-01T00:00:00.000Z", plannedEndAt: "2026-09-01T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", stages: [] }
  ]
};

describe("ClientProject", () => {
  it("shows floor progress and only approved visible files with preview and authenticated download", async () => {
    tokenStorage.set("client-token");
    const download = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(download);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: client });
      if (url === "/api/v1/projects/project-villa") return Response.json({ data: project });
      if (url.startsWith("/api/v1/projects/project-villa/design-versions?")) return Response.json({ data: { items: [
        { id: "version-visible", projectId: "project-villa", floorId: "floor-ground", stageId: "stage-1", taskId: null, versionNumber: 3, originalFilename: "Ground plan.pdf", mimeType: "application/pdf", sizeBytes: 1200, uploadedAt: "2026-07-12T00:00:00.000Z", approvalStatus: "approved", approvedAt: "2026-07-14T00:00:00.000Z", clientVisible: true, createdAt: "2026-07-12T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z" },
        { id: "version-image", projectId: "project-villa", floorId: "floor-ground", stageId: "stage-1", taskId: null, versionNumber: 2, originalFilename: "Elevation.png", mimeType: "image/png", sizeBytes: 900, uploadedAt: "2026-07-11T00:00:00.000Z", approvalStatus: "approved", approvedAt: "2026-07-14T00:00:00.000Z", clientVisible: true, createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z" },
        { id: "version-draft", projectId: "project-villa", floorId: "floor-ground", stageId: "stage-1", taskId: null, versionNumber: 4, originalFilename: "Internal draft.pdf", mimeType: "application/pdf", sizeBytes: 1200, uploadedAt: "2026-07-13T00:00:00.000Z", approvalStatus: "draft", approvedAt: null, clientVisible: false, createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z" },
        { id: "version-internal", projectId: "project-villa", floorId: "floor-first", stageId: "stage-2", taskId: null, versionNumber: 1, originalFilename: "Approved internal.pdf", mimeType: "application/pdf", sizeBytes: 1200, uploadedAt: "2026-07-13T00:00:00.000Z", approvalStatus: "approved", approvedAt: "2026-07-14T00:00:00.000Z", clientVisible: false, createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z" }
      ], pagination: { limit: 100, offset: 0, total: 3, hasMore: false } } });
      if (url === "/api/v1/design-versions/version-visible/download") { expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer client-token"); return new Response(new Blob(["file"], { type: "application/pdf" }), { headers: { "Content-Disposition": "attachment; filename=Ground plan.pdf" } }); }
      if (url === "/api/v1/design-versions/version-image/download") { expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer client-token"); return new Response(new Blob(["image"], { type: "image/png" }), { headers: { "Content-Disposition": "attachment; filename=Elevation.png" } }); }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/client/projects/project-villa"]);
    const user = userEvent.setup();
    const projectPage = await screen.findByRole("region", { name: "Aurora Villa" });
    expect(projectPage).toHaveClass("client-page--project");
    expect(projectPage).toHaveAttribute("data-theme", "sidebar");
    const hero = await screen.findByRole("region", { name: "Aurora Villa project overview" });
    expect(within(hero).getByRole("heading", { name: "Aurora Villa" })).toBeVisible();
    expect(within(hero).getByText("52%")).toBeVisible();
    expect(within(hero).getByText("Project complete")).toBeVisible();

    const floors = screen.getByRole("region", { name: "Floor progress" });
    expect(within(floors).getByText("Ground floor")).toBeVisible();
    expect(within(floors).getByText("70% complete")).toBeVisible();

    const documents = screen.getByRole("region", { name: "Approved documents" });
    expect(within(documents).getByText("Ground plan.pdf")).toBeVisible();
    expect(screen.getByText("First floor")).toBeVisible();
    expect(screen.getByText("35% complete")).toBeVisible();
    expect(await screen.findByText("Ground plan.pdf")).toBeVisible();
    expect(screen.queryByText("Internal draft.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved internal.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText(/draft|internal note|KPI|evaluation/i)).not.toBeInTheDocument();
    const thumbnail = await screen.findByRole("button", { name: "Preview Elevation.png" });
    expect(thumbnail).toHaveClass("file-preview__thumbnail");
    expect(within(thumbnail).getByRole("img")).toHaveClass("file-preview__thumbnail-image");
    await user.click(thumbnail);
    expect(screen.getByRole("dialog", { name: "Elevation.png" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Preview of Elevation.png" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close preview" })).toHaveClass("button--close");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Elevation.png" })).not.toBeInTheDocument();
    expect(thumbnail).toHaveFocus();
    const previewPdf = screen.getByRole("button", { name: "Preview Ground plan.pdf" });
    expect(previewPdf).toHaveClass("button--preview");
    await user.click(previewPdf);
    expect(await screen.findByRole("dialog", { name: "Ground plan.pdf" })).toBeVisible();
    expect(screen.getByTitle("Preview of Ground plan.pdf")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close preview" }));
    const downloadButton = screen.getByRole("button", { name: "Download Ground plan.pdf" });
    expect(downloadButton).toHaveClass("button--download");
    await user.click(downloadButton);
    expect(download).toHaveBeenCalled();
  });

  it("explains when a project is still in progress without an approved plan", async () => {
    tokenStorage.set("client-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: client });
      if (url === "/api/v1/projects/project-villa") return Response.json({ data: project });
      if (url.startsWith("/api/v1/projects/project-villa/design-versions?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderApp(["/client/projects/project-villa"]);
    const documents = await screen.findByRole("region", { name: "Approved documents" });
    expect(within(documents).getByText("Your project is in progress. Approved plans will appear here once ready.")).toBeVisible();
  });
});

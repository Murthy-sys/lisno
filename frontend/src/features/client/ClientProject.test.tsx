import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp } from "../../test/render";
import type { DesignWorkflowView } from "../workflow/projectWorkflowApi";

const client = { id: "client-1", name: "Aurora Homes", email: "client@lisno.example", role: "client" as const };
const project = {
  id: "project-villa", name: "Aurora Villa", clientId: "client-1", initiatingDesignerId: "designer-1", assignedDesignerIds: ["designer-1"], managerId: "manager-1", status: "active", location: "Bengaluru", progress: 52, plannedStartAt: "2026-06-01T00:00:00.000Z", plannedEndAt: "2026-09-30T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
  floors: [
    { id: "floor-ground", projectId: "project-villa", name: "Ground floor", number: "G", order: 1, progress: 70, plannedStartAt: "2026-06-01T00:00:00.000Z", plannedEndAt: "2026-08-01T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", stages: [] },
    { id: "floor-first", projectId: "project-villa", name: "First floor", number: "1", order: 2, progress: 35, plannedStartAt: "2026-07-01T00:00:00.000Z", plannedEndAt: "2026-09-01T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", stages: [] }
  ]
};

function kickoffWorkflow(state: "internal" | "client" | "keys" = "client"): DesignWorkflowView {
  const started = "2026-09-11T09:00:00.000Z";
  const stageNames = [["internal_kickoff", "Internal Kick off"], ["client_kickoff", "Client Kick off"], ["key_collection", "Key Collection"]] as const;
  const currentIndex = state === "internal" ? 0 : state === "client" ? 1 : 2;
  return {
    projectId: project.id, projectName: project.name, serverNow: started, floors: [],
    initialPayment: { confirmedAt: started, canConfirm: false, version: currentIndex + 1, status: "received" },
    projectStages: stageNames.map(([type, name], index) => ({
      id: `${project.id}:${type}`, type, name, order: index + 1, dependencyStageIds: [],
      status: index < currentIndex ? "completed" : index === currentIndex ? "in_progress" : "not_started", progress: index < currentIndex ? 100 : 0,
      deadlineAt: null, deadlineTaskId: null, tasks: [],
      operational: {
        status: index < currentIndex ? "completed" : index === currentIndex ? "in_progress" : "not_started", version: currentIndex + 1,
        availableActions: index === currentIndex && type === "client_kickoff" ? [{ id: "client_kickoff_complete", label: "Complete Client Kick off", actor: "client", requiresProof: false }] : [],
        timing: {
          state: index < currentIndex ? "completed" : index === currentIndex && index < 2 ? "running" : "not_applicable",
          startsAt: started, targetAt: index < 2 ? "2026-09-15T09:00:00.000Z" : null, originalTargetAt: index < 2 ? "2026-09-15T09:00:00.000Z" : null, endsAt: index < currentIndex ? started : null,
          remainingMs: index < 2 ? 4 * 86_400_000 : null, slaAllowanceMs: index < 2 ? 4 * 86_400_000 : null, band: index < 2 ? "On track" : null, clockOwner: index < 2 ? "Designer" : null, designerElapsedMs: 0, clientElapsedMs: 0
        },
        blockingReasons: [], facts: [], history: [],
        ...(type === "client_kickoff" && state !== "internal" ? { submittedDocument: { eventId: "internal-document-1", filename: "Kickoff brief.pdf", mimeType: "application/pdf", uploadedAt: started } } : {})
      }
    }))
  };
}

function installKickoffApi(getWorkflow: () => DesignWorkflowView, getDocuments = async () => Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } }), complete?: (body: unknown) => void, currentProject = project) {
  tokenStorage.set("client-token");
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/v1/auth/me") return Response.json({ data: client });
    if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor("client", ["projects.read", "projects.design_workflow.read", "projects.design_workflow.act", "design.plan_response_tasks.read"]) });
    if (url === "/api/v1/projects/project-villa") return Response.json({ data: currentProject });
    if (url === "/api/v1/projects/project-villa/design-workflow") return Response.json({ data: getWorkflow() });
    if (url === "/api/v1/projects/project-villa/design-workflow/history/internal-document-1/proof") {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer client-token");
      return new Response(new Blob(["brief"], { type: "application/pdf" }), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=Kickoff brief.pdf" } });
    }
    if (url.startsWith("/api/v1/projects/project-villa/design-versions?")) return getDocuments();
    if (url.startsWith("/api/v1/admin/design-plan-response-tasks?")) return Response.json({ data: [] });
    if (url === "/api/v1/client/projects/project-villa/design-sections") return Response.json({ data: { projectId: project.id, sections: [], progress: { total: 0, approved: 0, rejected: 0, awaitingReview: 0 } } });
    if (url === "/api/v1/projects/project-villa/design-workflow/actions" && init?.method === "POST") { complete?.(JSON.parse(String(init.body))); return Response.json({ data: { version: 3 } }); }
    throw new Error(`Unhandled request: ${url}`);
  });
}

describe("ClientProject", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:kickoff-document"), revokeObjectURL: vi.fn() });
  });
  it("shows the active Client task and one top countdown, then closes the task and stops its timer", async () => {
    let completed = false;
    const saved: unknown[] = [];
    installKickoffApi(() => kickoffWorkflow(completed ? "keys" : "client"), undefined, (body) => { saved.push(body); completed = true; });
    renderApp(["/client/projects/project-villa"]);
    const user = userEvent.setup();
    const complete = await screen.findByRole("button", { name: "Complete Client Kick off" });
    const timer = screen.getByRole("timer");
    expect(timer).toHaveAttribute("dateTime", "2026-09-15T09:00:00.000Z");
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(screen.getByRole("form", { name: "Complete Client Kick off" })).not.toContainElement(timer);
    expect(timer.compareDocumentPosition(screen.getByText("Floor progress")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Design reviews" })).not.toBeInTheDocument();
    const documentCard = screen.getByRole("region", { name: "Designer’s Internal Kick off document" });
    expect(documentCard.querySelector("img, iframe")).toBeNull();
    const viewDocument = within(documentCard).getByRole("button", { name: "View Kickoff brief.pdf" });
    expect(viewDocument).toHaveTextContent("View document");
    await waitFor(() => expect(viewDocument).toBeEnabled());
    await user.click(viewDocument);
    const dialog = screen.getByRole("dialog", { name: "Kickoff brief.pdf" });
    expect(within(dialog).getByTitle("Designer’s Internal Kick off document: Kickoff brief.pdf")).toBeVisible();
    expect(documentCard.querySelector("img, iframe")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Close Kickoff brief.pdf" }));
    expect(screen.queryByTitle("Designer’s Internal Kick off document: Kickoff brief.pdf")).not.toBeInTheDocument();
    expect((await axe.run(document.body, { iframes: false, rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    expect(screen.queryByLabelText(/Client action proof/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "I have reviewed the document submitted by the Designer" }));
    await user.click(complete);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual(expect.objectContaining({ action: "client_kickoff_complete", stageId: "project-villa:client_kickoff", expectedVersion: 2, data: { reviewedDocumentEventId: "internal-document-1" } }));
    expect(await screen.findByRole("button", { name: "Key Collection — In progress" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Client Kick off — Completed" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Complete Client Kick off" })).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it.each(["loading", "failed"] as const)("keeps Client Kick off available while approved documents are %s", async (state) => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    installKickoffApi(() => kickoffWorkflow(), () => state === "loading" ? pending : Promise.resolve(Response.json({ error: { code: "UNAVAILABLE", message: "Documents unavailable" } }, { status: 503 })));
    renderApp(["/client/projects/project-villa"]);
    try {
      expect(await screen.findByRole("button", { name: "Complete Client Kick off" })).toBeVisible();
      expect(screen.getByRole("timer")).toBeVisible();
      expect(screen.queryByRole("region", { name: "Approved documents" })).not.toBeInTheDocument();
      if (state === "failed") expect(await screen.findByRole("button", { name: "Retry approved documents" })).toBeVisible();
      else expect(screen.queryByText("Loading approved documents…")).not.toBeInTheDocument();
    } finally { release(Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } })); }
  });

  it("keeps the stage and acknowledgement when Escape reaches the View trigger before dialog focus transfers", async () => {
    installKickoffApi(() => kickoffWorkflow());
    renderApp(["/client/projects/project-villa"]);
    const user = userEvent.setup();
    const acknowledgement = await screen.findByRole("checkbox", { name: "I have reviewed the document submitted by the Designer" });
    await waitFor(() => expect(acknowledgement).toBeEnabled());
    await user.click(acknowledgement);
    const viewDocument = screen.getByRole("button", { name: "View Kickoff brief.pdf" });
    await user.click(viewDocument);
    expect(screen.getByRole("dialog", { name: "Kickoff brief.pdf" })).toBeVisible();
    fireEvent.keyDown(viewDocument, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Kickoff brief.pdf" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Client Kick off — In progress" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("checkbox", { name: "I have reviewed the document submitted by the Designer" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Complete Client Kick off" })).toBeEnabled();
    await waitFor(() => expect(viewDocument).toHaveFocus());

    await user.click(viewDocument);
    expect(screen.getByRole("dialog", { name: "Kickoff brief.pdf" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Kickoff brief.pdf" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "I have reviewed the document submitted by the Designer" })).toBeChecked();
    await waitFor(() => expect(viewDocument).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Client Kick off — In progress" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("form", { name: "Complete Client Kick off" })).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeVisible();
  });

  it("offers no Client completion task before Internal Kick off is completed", async () => {
    installKickoffApi(() => kickoffWorkflow("internal"));
    renderApp(["/client/projects/project-villa"]);
    expect(await screen.findByRole("button", { name: "Internal Kick off — In progress" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Complete Client Kick off" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Complete Client Kick off" })).not.toBeInTheDocument();
  });
  it("shows floor progress and only approved visible files with preview and authenticated download", async () => {
    tokenStorage.set("client-token");
    const download = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(download);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Response.json({ data: client });
      if (url === "/api/v1/auth/authorization") return Response.json({ data: authorizationFor(client.role) });
      if (url === "/api/v1/projects/project-villa") return Response.json({ data: project });
      if (url === "/api/v1/projects/project-villa/design-workflow") return Response.json({ data: { projectId: project.id, projectName: project.name, serverNow: new Date().toISOString(), floors: [] } });
      if (url.startsWith("/api/v1/admin/design-plan-response-tasks?")) return Response.json({ data: [] });
      if (url === "/api/v1/client/projects/project-villa/design-sections") return Response.json({ data: { projectId: project.id, sections: [], progress: { total: 0, approved: 0, rejected: 0, awaitingReview: 0 } } });
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
    expect(screen.getByRole("heading", { name: "Aurora Villa" })).toBeVisible();
    expect(screen.getByText("Bengaluru")).toBeVisible();
    expect(screen.queryByText("Project complete")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Aurora Villa project overview" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Floor progress" })).not.toBeVisible();
    await user.click(screen.getByText("Floor progress"));

    const floors = screen.getByRole("region", { name: "Floor progress" });
    expect(within(floors).getByText("Ground floor")).toBeVisible();
    expect(within(floors).getByText("70% complete")).toBeVisible();

    const documentSummary = await screen.findByText("Approved documents");
    expect(documentSummary.closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByText("Ground plan.pdf")).not.toBeInTheDocument();
    await user.click(documentSummary);
    const documents = await screen.findByRole("region", { name: "Approved documents" });
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
    await user.click(documentSummary);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Approved documents" })).not.toBeInTheDocument());
  });

  it("keeps early projects minimal without payment details, internal SLA facts, or empty future sections", async () => {
    installKickoffApi(() => {
      const workflow = kickoffWorkflow();
      workflow.notices = [{ id: "internal-notice", stageId: "project-villa:internal_kickoff", message: "Internal process notice" }];
      workflow.projectStages![1]!.operational!.facts = [{ label: "Clock ownership", value: "Designer bucket" }];
      return workflow;
    }, undefined, undefined, { ...project, floors: [] });
    renderApp(["/client/projects/project-villa"]);
    expect(await screen.findByRole("checkbox", { name: "I have reviewed the document submitted by the Designer" })).toBeVisible();
    expect(screen.getByRole("timer")).toBeVisible();
    expect(screen.queryByText("Floor progress")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved documents")).not.toBeInTheDocument();
    expect(screen.queryByText("No plans ready for review")).not.toBeInTheDocument();
    expect(screen.queryByText("No design reviews are awaiting a response.")).not.toBeInTheDocument();
    expect(screen.queryByText("Internal process notice")).not.toBeInTheDocument();
    expect(screen.queryByText("Designer bucket")).not.toBeInTheDocument();
    expect(screen.queryByText(/initial payment received/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /SLA|Stage requirements|Design review/ })).not.toBeInTheDocument();
  });
});

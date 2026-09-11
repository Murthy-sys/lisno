import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DesignPlanTask, EstimateDesignWorkspace } from "../../api/types";
import { apiClient } from "../../api/client";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { authorizationFor } from "../../test/authFixtures";
import { projectWorkflowKeys, type DesignWorkflowView } from "../workflow/projectWorkflowApi";
import { DesignerDesignPlanTasksPage } from "./DesignerDesignPlanTasksPage";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "designer-1", role: "designer", name: "Design team" },
    authorization: authorizationFor("designer", ["projects.design_workflow.read", "design.plan_response_tasks.read"])
  })
}));

const acknowledgementLabel = "I acknowledge that the design flow has been handed over to me after initial payment.";

const assignedTask: DesignPlanTask = {
  id: "design-task-1",
  estimateId: "estimate-1",
  projectId: "project-1",
  projectName: "Aurora Villa",
  clientName: "Priya Shah",
  status: "assigned",
  designPlanVersion: 0,
  rooms: [{ id: "room-living", label: "Living Room" }],
  scopes: ["EL"],
  lineItems: [
    {
      catalogueId: "EL01",
      roomName: "Living Room",
      specification: "Lighting point",
      unit: "point",
      quantity: 6,
      included: true
    }
  ]
};

const secondTask: DesignPlanTask = {
  ...assignedTask,
  id: "design-task-2",
  estimateId: "estimate-2",
  projectId: "project-2",
  projectName: "Coastal Apartment",
  clientName: "Rhea Kapoor",
  status: "in_progress"
};

beforeEach(() => {
  server.use(
    http.get("/api/v1/projects/:projectId/design-workflow", ({ params }) => HttpResponse.json({ data: uploadWorkflow(String(params.projectId)) })),
    http.get("/api/v1/admin/design-plan-response-tasks", () => HttpResponse.json({ data: [] }))
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:designer-extracted-image")
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn()
  });
});

function emptyWorkspace(): EstimateDesignWorkspace {
  return { uploads: [], pages: [], drawings: [], revisions: [] };
}

function renderPage(initialEntry = "/designer/design-plans") {
  let queryClient!: QueryClient;
  function CaptureQueryClient() { queryClient = useQueryClient(); return null; }
  const view = renderWithQuery(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CaptureQueryClient />
      <DesignerDesignPlanTasksPage />
    </MemoryRouter>
  );
  return { ...view, queryClient };
}

function kickoffWorkflow(): DesignWorkflowView {
  const confirmedAt = "2026-09-11T09:00:00.000Z";
  const targetAt = "2026-09-14T09:00:00.000Z";
  return {
    projectId: "project-1", projectName: "Aurora Villa", serverNow: confirmedAt,
    initialPayment: { confirmedAt, canConfirm: false, version: 1, status: "received" },
    floors: [],
    projectStages: [{
      id: "project-1:internal-kickoff", name: "Internal Kick off", type: "internal_kickoff", order: 1,
      dependencyStageIds: [], status: "in_progress", progress: 0, deadlineAt: null, deadlineTaskId: null, tasks: [],
      operational: {
        status: "in_progress", version: 1,
        availableActions: [{ id: "internal_kickoff_complete", label: "Complete Internal Kick off", actor: "designer", requiresProof: false }],
        timing: {
          state: "running", startsAt: confirmedAt, targetAt, originalTargetAt: targetAt, endsAt: null,
          slaAllowanceMs: 259200000, remainingMs: 259200000, band: "On track", clockOwner: "Designer",
          designerElapsedMs: 0, clientElapsedMs: 0
        },
        blockingReasons: [], facts: [], history: []
      }
    }]
  };
}

function uploadWorkflow(projectId = "project-1"): DesignWorkflowView {
  const workflow = kickoffWorkflow();
  const template = workflow.projectStages![0]!;
  const stages = [
    ["internal_kickoff", "Internal Kick off"],
    ["client_kickoff", "Client Kick off"],
    ["key_collection", "Key Collection"],
    ["site_measurement", "On Site Actual Measurement"],
    ["existing_furniture_dimensions", "Collection of existing furniture dimensions"],
    ["space_planning_tentative_look_feel", "Designer Uploading Space planning with Tentative look and Feel"]
  ] as const;
  return {
    ...workflow,
    projectId,
    projectName: projectId === "project-1" ? "Aurora Villa" : "Coastal Apartment",
    projectStages: stages.map(([type, name], index) => ({
      ...template, id: `${projectId}:${type}`, type, name, order: index + 1,
      dependencyStageIds: index === 5 ? stages.slice(0, 5).map(([previous]) => `${projectId}:${previous}`) : [],
      status: index === 5 ? "in_progress" : "completed", progress: index === 5 ? 0 : 100,
      operational: {
        ...template.operational!, status: index === 5 ? "in_progress" : "completed", availableActions: [],
        timing: { ...template.operational!.timing, state: index === 5 ? "not_applicable" : "completed", slaAllowanceMs: null, remainingMs: null, startsAt: null, targetAt: null, originalTargetAt: null, band: null, clockOwner: null }
      }
    }))
  };
}

function serveKickoffWorkspace(getWorkflow: () => DesignWorkflowView) {
  server.use(
    http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: [assignedTask] })),
    http.get("/api/v1/estimates/estimate-1/design-uploads", () => HttpResponse.json({ data: emptyWorkspace() })),
    http.get("/api/v1/projects/project-1/design-workflow", () => HttpResponse.json({ data: getWorkflow() }))
  );
}

function extractedWorkspace(estimateId: string, title = "Living Room Electrical Plan"):
EstimateDesignWorkspace {
  return {
    uploads: [{
      id: `upload-${estimateId}`,
      estimateId,
      leadId: "lead-1",
      originalFilename: "client-design.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      uploaderId: "designer-1",
      uploadedAt: "2026-08-26T08:00:00.000Z",
      extractionStatus: "estimator_review",
      failureCode: null,
      failureMessage: null,
      canRetry: false,
      canDelete: false
    }],
    pages: [{
      id: `page-${estimateId}`,
      uploadId: `upload-${estimateId}`,
      pageNumber: 1,
      width: 1200,
      height: 800
    }],
    drawings: [{
      id: `drawing-${estimateId}`,
      uploadId: `upload-${estimateId}`,
      sourcePageId: `page-${estimateId}`,
      estimateId,
      active: true,
      verified: false,
      roomId: "room-living",
      scopeSectionId: "EL",
      catalogueId: "EL01",
      mappingStatus: "auto_mapped",
      detectedTitle: title,
      displayTitle: title,
      source: "ocr",
      roomConfidence: 0.95,
      scopeConfidence: 0.96,
      ocrConfidence: 0.94,
      roomEvidence: [],
      scopeEvidence: []
    }],
    revisions: [{
      id: `revision-${estimateId}`,
      drawingId: `drawing-${estimateId}`,
      revisionNumber: 1,
      sourcePageId: `page-${estimateId}`,
      crop: { x: 0, y: 0, width: 1200, height: 800 },
      roomId: "room-living",
      scopeSectionId: "EL",
      catalogueId: "EL01",
      mappingStatus: "auto_mapped",
      label: title,
      reviewStatus: "draft",
      submittedAt: null,
      reviewerId: null,
      reviewedAt: null,
      changeSummary: null,
      annotationLayerId: null,
      annotations: null,
      replacementUploadId: null,
      replacesRevisionId: null
    }]
  };
}

describe("DesignerDesignPlanTasksPage", () => {
  it("shows acknowledgement after payment and saves the Designer receipt of the design flow with evidence", async () => {
    let completed = false;
    let workflowReads = 0;
    const submissions: string[] = [];
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress");
    const reads = vi.spyOn(apiClient, "get");
    serveKickoffWorkspace(() => {
      workflowReads += 1;
      const workflow = kickoffWorkflow();
      if (completed) {
        const stage = workflow.projectStages![0]!;
        stage.status = "completed";
        stage.progress = 100;
        stage.operational!.status = "completed";
        stage.operational!.version = 2;
        stage.operational!.availableActions = [];
        stage.operational!.timing.state = "completed";
        stage.operational!.timing.endsAt = "2026-09-11T09:10:00.000Z";
        stage.operational!.history = [{
          id: "kickoff-completed", action: "internal_kickoff_complete", actorName: "Design team", actorRole: "designer",
          onBehalfOfClient: false, at: "2026-09-11T09:10:00.000Z", note: "", proofAvailable: true
        }];
      }
      return workflow;
    });
    server.use(http.post("/api/v1/projects/project-1/design-workflow/actions", ({ request }) => {
      submissions.push(new URL(request.url).pathname);
      completed = true;
      return HttpResponse.json({ data: { version: 2 } });
    }));
    const user = userEvent.setup();

    renderPage();

    const checkbox = await screen.findByRole("checkbox", { name: acknowledgementLabel });
    expect(checkbox).toBeVisible();
    expect(checkbox).toBeRequired();
    expect(screen.getByRole("button", { name: "Collapse Internal Kick off" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Close stage details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Acknowledgement and completion" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Internal Kick off — In progress" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(/Meeting conducted at/)).toBeVisible();
    expect(screen.getByLabelText(/Signed kick-off checklist/)).toBeVisible();
    const save = screen.getByRole("button", { name: "Complete and save Internal Kick off" });
    expect(save).toBeVisible();
    expect(save).toBeDisabled();
    expect(within(screen.getByRole("group", { name: "Current stage timer" })).getByRole("timer")).toHaveAttribute("dateTime", "2026-09-14T09:00:00.000Z");
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "Internal Kick off details" })).queryByRole("timer")).not.toBeInTheDocument();
    const progress = screen.getByRole("region", { name: "Stage actions" });
    const stageBar = screen.getByRole("list", { name: "Project workflow stages" });
    const queue = screen.getByRole("region", { name: "Assigned projects" });
    const selectedProject = screen.getByRole("region", { name: "Selected project workspace" });
    expect(stageBar.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(stageBar.compareDocumentPosition(selectedProject) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(selectedProject).toContainElement(progress);
    expect(selectedProject).toContainElement(screen.getByRole("form", { name: "Complete Internal Kick off" }));
    expect(selectedProject).not.toContainElement(screen.getByRole("timer"));
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
    expect(within(selectedProject).getByText("Complete Internal Kick off", { selector: "dd" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Upload design" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload design" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    expect(screen.queryByText(/Design (?:plan v|version)/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("form", { name: "Complete Internal Kick off" })).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Recorded stage details" })).not.toBeInTheDocument();
    expect(submissions).toHaveLength(0);
    expect(reads.mock.calls.some(([path]) => path.includes("/design-uploads"))).toBe(false);
    expect(workflowReads).toBe(1);

    await user.click(checkbox);
    fireEvent.change(screen.getByLabelText(/Meeting conducted at/), { target: { value: "2026-09-11T14:30" } });
    await user.upload(screen.getByLabelText(/Signed kick-off checklist/), new File(["signed checklist"], "kickoff-checklist.pdf", { type: "application/pdf" }));
    expect(checkbox).toBeChecked();
    expect(screen.getByLabelText(/Meeting conducted at/)).toHaveValue("2026-09-11T14:30");
    expect((screen.getByLabelText(/Signed kick-off checklist/) as HTMLInputElement).files?.[0]?.name).toBe("kickoff-checklist.pdf");
    expect(save).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Collapse Internal Kick off" }));
    expect(screen.getByRole("button", { name: "Expand Internal Kick off" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox", { name: acknowledgementLabel })).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Expand Internal Kick off" }));
    expect(screen.getByRole("checkbox", { name: acknowledgementLabel })).toBeChecked();
    expect(screen.getByLabelText(/Meeting conducted at/)).toHaveValue("2026-09-11T14:30");
    expect((screen.getByLabelText(/Signed kick-off checklist/) as HTMLInputElement).files?.[0]?.name).toBe("kickoff-checklist.pdf");
    expect(save).toBeEnabled();
    // JSDOM does not consistently validate a user-uploaded required file input.
    fireEvent.submit(screen.getByRole("form", { name: "Complete Internal Kick off" }));

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions).toEqual(["/api/v1/projects/project-1/design-workflow/actions"]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]![0]).toBe("/projects/project-1/design-workflow/actions");
    // Inspect FormData before JSDOM's XHR adapter serializes it for MSW.
    const payload = upload.mock.calls[0]![1];
    expect(payload.get("action")).toBe("internal_kickoff_complete");
    expect(payload.get("stageId")).toBe("project-1:internal-kickoff");
    expect(payload.get("expectedVersion")).toBe("1");
    expect(JSON.parse(payload.get("data") as string)).toEqual({
      designHandoverAcknowledged: true, meetingAt: new Date("2026-09-11T14:30").toISOString()
    });
    expect(payload.get("file")).toMatchObject({ name: "kickoff-checklist.pdf", type: "application/pdf" });
    expect(await screen.findByRole("button", { name: "Internal Kick off — Completed" })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("timer")).not.toBeInTheDocument());
    expect(screen.queryByRole("checkbox", { name: acknowledgementLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete and save Internal Kick off" })).not.toBeInTheDocument();
    expect(workflowReads).toBeGreaterThan(1);
  });

  it("switches the top workflow with its project without leaking the previous timer or acknowledgement draft", async () => {
    let releaseWorkflow!: () => void;
    const pendingWorkflow = new Promise<void>((resolve) => { releaseWorkflow = resolve; });
    const secondWorkflow = kickoffWorkflow();
    secondWorkflow.projectId = "project-2";
    secondWorkflow.projectName = "Coastal Apartment";
    const nextStage = secondWorkflow.projectStages![0]!;
    nextStage.id = "project-2:internal-kickoff";
    nextStage.operational!.timing.remainingMs = 86_400_000;
    nextStage.operational!.timing.targetAt = "2026-09-12T09:00:00.000Z";
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: [assignedTask, secondTask] })),
      http.get("/api/v1/estimates/:estimateId/design-uploads", () => HttpResponse.json({ data: emptyWorkspace() })),
      http.get("/api/v1/projects/:projectId/design-workflow", async ({ params }) => {
        if (params.projectId === "project-2") {
          await pendingWorkflow;
          return HttpResponse.json({ data: secondWorkflow });
        }
        return HttpResponse.json({ data: kickoffWorkflow() });
      })
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("checkbox", { name: acknowledgementLabel }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Aurora draft only");
    await user.upload(screen.getByLabelText(/Signed kick-off checklist/), new File(["Aurora receipt"], "aurora-receipt.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /Coastal Apartment.*Extraction in progress/i }));
    expect(screen.getByText("Loading project stages and deadlines…")).toBeVisible();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Aurora draft only")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Upload design" })).not.toBeInTheDocument();
    releaseWorkflow();
    await screen.findByRole("checkbox", { name: acknowledgementLabel });
    expect(screen.getAllByRole("region", { name: "Stage actions" })).toHaveLength(1);
    expect(screen.getAllByRole("form", { name: "Complete Internal Kick off" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("");
    expect(screen.getByRole("timer")).toHaveAttribute("dateTime", "2026-09-12T09:00:00.000Z");
    expect(screen.getByRole("checkbox", { name: acknowledgementLabel })).not.toBeChecked();
    expect((screen.getByLabelText(/Signed kick-off checklist/) as HTMLInputElement).files).toHaveLength(0);
    expect(within(screen.getByRole("region", { name: "Selected project workspace" })).getByRole("heading", { name: "Coastal Apartment" })).toBeVisible();
  });

  it("keeps the kickoff completion action visible with the payment requirement before confirmation", async () => {
    const workflow = kickoffWorkflow();
    const reason = "Super Admin must mark the initial payment received before Internal Kick off can be completed.";
    workflow.initialPayment = { confirmedAt: null, canConfirm: false, version: 0, status: "awaiting_payment" };
    const operational = workflow.projectStages![0]!.operational!;
    operational.version = 0;
    operational.timing = { ...operational.timing, state: "waiting", startsAt: null, targetAt: null, originalTargetAt: null, remainingMs: null, band: null };
    operational.availableActions[0]!.disabledReason = reason;
    serveKickoffWorkspace(() => workflow);

    renderPage();

    const completion = await screen.findByRole("button", { name: "Complete Internal Kick off" });
    expect(completion).toBeVisible();
    expect(completion).toBeDisabled();
    expect(completion).toHaveAccessibleDescription(reason);
    expect(screen.getByText(reason)).toBeVisible();
    expect(screen.getByRole("button", { name: "Collapse Internal Kick off" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("checkbox", { name: acknowledgementLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Complete Internal Kick off" })).not.toBeInTheDocument();
  });

  it("does not manufacture kickoff completion controls when the backend grants no completion action", async () => {
    const workflow = kickoffWorkflow();
    workflow.projectStages![0]!.operational!.availableActions = [];
    serveKickoffWorkspace(() => workflow);

    renderPage();

    const stage = await screen.findByRole("button", { name: "Internal Kick off — In progress" });
    expect(stage).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("checkbox", { name: acknowledgementLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Complete.*Internal Kick off/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Complete Internal Kick off" })).not.toBeInTheDocument();
  });

  it("updates the next action from saved stages and unlocks design upload only after the predecessors complete", async () => {
    let workflow = kickoffWorkflow();
    const uploadReads: string[] = [];
    serveKickoffWorkspace(() => workflow);
    server.use(http.get("/api/v1/estimates/:estimateId/design-uploads", ({ params }) => {
      uploadReads.push(String(params.estimateId));
      return HttpResponse.json({ data: emptyWorkspace() });
    }));
    const { queryClient } = renderPage();
    const selected = await screen.findByRole("region", { name: "Selected project workspace" });
    await within(selected).findByText("Complete Internal Kick off", { selector: "dd" });
    expect(uploadReads).toEqual([]);

    workflow = uploadWorkflow();
    const clientKickoff = workflow.projectStages![1]!;
    clientKickoff.status = "in_progress";
    clientKickoff.operational!.status = "in_progress";
    clientKickoff.operational!.availableActions = [{ id: "client_kickoff_request", label: "Request Client Kick off", actor: "designer", requiresProof: false }];
    await act(async () => { await queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-1") }); });
    expect(await within(selected).findByText("Request Client Kick off", { selector: "dd" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Upload design" })).not.toBeInTheDocument();
    expect(uploadReads).toEqual([]);

    workflow = uploadWorkflow();
    await act(async () => { await queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-1") }); });
    expect(await screen.findByLabelText("Design plan file")).toBeVisible();
    expect(within(selected).getByText("Upload the design plan", { selector: "dd" })).toBeVisible();
    await waitFor(() => expect(uploadReads).toEqual(["estimate-1"]));
  });

  it("does not request or show design uploads while the selected workflow is loading", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const reads = vi.spyOn(apiClient, "get");
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: [assignedTask] })),
      http.get("/api/v1/projects/project-1/design-workflow", async () => { await pending; return HttpResponse.json({ data: uploadWorkflow() }); }),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () => HttpResponse.json({ data: emptyWorkspace() }))
    );
    renderPage();
    try {
      expect(await screen.findByText("Loading project workflow…")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Upload design" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
      expect(screen.queryByText(/Design version/)).not.toBeInTheDocument();
      expect(reads.mock.calls.some(([path]) => path.includes("/design-uploads"))).toBe(false);
    } finally { release(); }
    expect(await screen.findByRole("button", { name: "Upload design" })).toBeVisible();
  });

  it("requires a workflow reload after an initial error and fails closed without querying design files", async () => {
    const reads = vi.spyOn(apiClient, "get");
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: [assignedTask] })),
      http.get("/api/v1/projects/project-1/design-workflow", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Workflow unavailable" } }, { status: 503 }))
    );
    renderPage();
    expect(await screen.findByText("Refresh the project workflow")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload workflow" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /Upload design/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    expect(reads.mock.calls.some(([path]) => path.includes("/design-uploads"))).toBe(false);
  });

  it.each(["blocked", "paused", "missing_operational"] as const)("keeps reached Space planning images read-only when %s", async (state) => {
    const workflow = uploadWorkflow();
    const stage = workflow.projectStages![5]!;
    if (state === "blocked") {
      stage.operational!.status = "blocked";
      stage.operational!.blockingReasons = ["Site access must be restored before preparing drawings."];
    } else if (state === "paused") stage.operational!.timing.state = "paused";
    else delete stage.operational;
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: [{ ...assignedTask, status: "in_progress" }] })),
      http.get("/api/v1/projects/project-1/design-workflow", () => HttpResponse.json({ data: workflow })),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () => HttpResponse.json({ data: extractedWorkspace("estimate-1") })),
      http.get("/api/v1/estimate-design-revisions/:revisionId/image", () => new HttpResponse(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }))
    );
    renderPage();
    expect(await screen.findByRole("article", { name: "Living Room Electrical Plan drawing" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Design review" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Upload design" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload design" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit drawings to client" })).not.toBeInTheDocument();
  });

  it("keeps existing extracted images but removes editing after a background workflow refresh fails", async () => {
    let unavailable = false;
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: [{ ...assignedTask, status: "in_progress" }] })),
      http.get("/api/v1/projects/project-1/design-workflow", () => unavailable ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Workflow unavailable" } }, { status: 503 }) : HttpResponse.json({ data: uploadWorkflow() })),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () => HttpResponse.json({ data: extractedWorkspace("estimate-1") })),
      http.get("/api/v1/estimate-design-revisions/:revisionId/image", () => new HttpResponse(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }))
    );
    const { queryClient } = renderPage();
    await screen.findByRole("article", { name: "Living Room Electrical Plan drawing" });
    expect(screen.getByLabelText("Design plan file")).toBeVisible();
    unavailable = true;
    await act(async () => { await queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.designWorkflow("project-1") }); });
    expect(await screen.findByText("Refresh the project workflow")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Design review" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Living Room Electrical Plan drawing" })).toBeVisible();
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload design" })).not.toBeInTheDocument();
  });

  it("clears the selected design file when switching from eligible Space planning to an earlier project stage", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const uploadReads: string[] = [];
    const coastal = kickoffWorkflow();
    coastal.projectId = "project-2"; coastal.projectName = "Coastal Apartment";
    coastal.projectStages![0]!.id = "project-2:internal-kickoff";
    coastal.projectStages![0]!.operational!.timing.targetAt = "2026-09-12T09:00:00.000Z";
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: [assignedTask, secondTask] })),
      http.get("/api/v1/projects/:projectId/design-workflow", async ({ params }) => {
        if (params.projectId === "project-2") { await pending; return HttpResponse.json({ data: coastal }); }
        return HttpResponse.json({ data: uploadWorkflow() });
      }),
      http.get("/api/v1/estimates/:estimateId/design-uploads", ({ params }) => { uploadReads.push(String(params.estimateId)); return HttpResponse.json({ data: emptyWorkspace() }); })
    );
    const user = userEvent.setup();
    renderPage();
    await user.upload(await screen.findByLabelText("Design plan file"), new File(["Aurora design"], "aurora-only.pdf", { type: "application/pdf" }));
    expect(screen.getByRole("button", { name: "Upload design" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Coastal Apartment.*Extraction in progress/i }));
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByText(/Design version/)).not.toBeInTheDocument();
    release();
    await screen.findByRole("checkbox", { name: acknowledgementLabel });
    expect(screen.getByRole("timer")).toHaveAttribute("dateTime", "2026-09-12T09:00:00.000Z");
    expect(screen.queryByRole("button", { name: "Upload design" })).not.toBeInTheDocument();
    expect(uploadReads).toEqual(["estimate-1"]);
    await user.click(screen.getByRole("button", { name: /Aurora Villa.*Assigned/i }));
    const file = await screen.findByLabelText<HTMLInputElement>("Design plan file");
    expect(file.files).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Upload design" })).toBeDisabled();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("makes the assigned project and Upload Design action the primary workspace", async () => {
    const requests: string[] = [];
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", ({ request }) => {
        requests.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: [assignedTask] });
      }),
      http.get("/api/v1/estimates/estimate-1/design-uploads", ({ request }) => {
        requests.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: emptyWorkspace() });
      })
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Design plan workspace" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute(
      "href",
      "/designer"
    );
    // The upload action lives on the workspace panel alone, never in the header.
    expect(await screen.findAllByRole("button", { name: "Upload design" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Upload design" }))
      .not.toBeInTheDocument();
    const queue = screen.getByRole("region", { name: "Assigned projects" });
    expect(within(queue).getByRole("button", { name: /Aurora Villa.*Assigned/i }))
      .toHaveAttribute("aria-pressed", "true");
    const workspace = screen.getByRole("region", {
      name: "Selected project workspace"
    });
    expect(within(workspace).getByText("Upload the design plan")).toBeVisible();
    expect(
      within(workspace).getByRole("heading", { name: "Upload design" })
    ).toBeVisible();
    expect(screen.getByLabelText("Design plan file")).toHaveAttribute(
      "accept",
      expect.stringContaining("application/pdf")
    );
    expect(screen.getByRole("button", { name: "Upload design" })).toBeDisabled();
    const designSection = screen.getByRole("region", { name: "Upload design" });
    expect(within(designSection).getByText(/Design version/)).toBeVisible();
    expect(screen.getAllByText(/Design version/)).toHaveLength(1);
    expect(within(queue).queryByText(/Design (?:plan v|version)/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Aurora Villa" })).queryByText(/Design version/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ready for action/)).not.toBeInTheDocument();
    expect(requests).toEqual([
      "/api/v1/designer/design-plan-tasks",
      "/api/v1/estimates/estimate-1/design-uploads"
    ]);
  });

  it("shows extracted images as a visible Designer gallery", async () => {
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [{ ...assignedTask, status: "in_progress" }] })
      ),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () =>
        HttpResponse.json({ data: extractedWorkspace("estimate-1") })
      ),
      http.get("/api/v1/estimate-design-revisions/revision-estimate-1/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Extracted images" })
    ).toBeVisible();
    expect(screen.getByText("1 image")).toBeVisible();
    expect(
      await screen.findByRole("img", { name: "Living Room Electrical Plan thumbnail" })
    ).toHaveAttribute("src", "blob:designer-extracted-image");
    const drawing = screen.getByRole("article", {
      name: "Living Room Electrical Plan drawing"
    });
    expect(within(drawing).getByRole("button", { name: "Preview" })).toBeEnabled();
  });

  it("does not render the same extracted crop twice during a workspace refresh", async () => {
    const workspace = extractedWorkspace("estimate-1");
    const drawing = workspace.drawings[0]!;
    const revision = workspace.revisions[0]!;
    workspace.drawings.push({ ...drawing, id: "duplicate-drawing" });
    workspace.revisions.push({ ...revision, id: "duplicate-revision", drawingId: "duplicate-drawing" });
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [{ ...assignedTask, status: "in_progress" }] })
      ),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () =>
        HttpResponse.json({ data: workspace })
      ),
      http.get("/api/v1/estimate-design-revisions/:revisionId/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );

    renderPage();

    expect(await screen.findByRole("heading", { name: "Extracted images" })).toBeVisible();
    expect(screen.getByText("1 image")).toBeVisible();
    expect(screen.getAllByRole("article", { name: /drawing$/i })).toHaveLength(1);
  });

  it("maps line items to the canonical room when the estimate label uses an alias", async () => {
    const aliasedTask: DesignPlanTask = {
      ...assignedTask,
      rooms: [{ id: "room-living", label: "Living Room", aliases: ["living-room"] }],
      lineItems: [{ ...assignedTask.lineItems[0]!, roomName: "  LIVING-ROOM  " }]
    };
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [{ ...aliasedTask, status: "in_progress" }] })
      ),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () =>
        HttpResponse.json({ data: extractedWorkspace("estimate-1") })
      ),
      http.get("/api/v1/estimate-design-revisions/:revisionId/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );
    const user = userEvent.setup();

    renderPage();

    const drawing = await screen.findByRole("article", { name: /drawing$/i });
    await user.click(within(drawing).getByRole("button", { name: /More actions/ }));
    await user.click(screen.getByRole("menuitem", { name: "Change estimate item" }));
    expect(await screen.findByRole("option", { name: /EL01.*Light \/ fan \/ switch points.*Electrical/i })).toBeVisible();
  });

  it("opens the exact estimate selected from the dashboard project list", async () => {
    const workspaceRequests: string[] = [];
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [assignedTask, secondTask] })
      ),
      http.get("/api/v1/estimates/:estimateId/design-uploads", ({ request }) => {
        workspaceRequests.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: emptyWorkspace() });
      })
    );

    renderPage("/designer/design-plans?estimate=estimate-2");

    expect(
      await screen.findByRole("heading", { name: "Coastal Apartment" })
    ).toBeVisible();
    await waitFor(() => expect(workspaceRequests).toEqual([
      "/api/v1/estimates/estimate-2/design-uploads"
    ]));
  });

  it("switches the active project without mounting every extraction workspace", async () => {
    const workspaceRequests: string[] = [];
    const workflowRequests: string[] = [];
    server.use(
      http.get("/api/v1/projects/:projectId/design-workflow", ({ params }) => {
        const projectId = String(params.projectId);
        workflowRequests.push(projectId);
        return HttpResponse.json({ data: uploadWorkflow(projectId) });
      }),
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [assignedTask, secondTask] })
      ),
      http.get("/api/v1/estimates/:estimateId/design-uploads", ({ params, request }) => {
        workspaceRequests.push(new URL(request.url).pathname);
        return HttpResponse.json({
          data: params.estimateId === "estimate-2"
            ? extractedWorkspace("estimate-2", "Coastal Lighting Plan")
            : emptyWorkspace()
        });
      }),
      http.get("/api/v1/estimate-design-revisions/:revisionId/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );
    const user = userEvent.setup();

    renderPage();
    const queue = await screen.findByRole("region", { name: "Assigned projects" });
    await screen.findByRole("heading", { name: "Upload design" });
    await waitFor(() => expect(workspaceRequests).toEqual(["/api/v1/estimates/estimate-1/design-uploads"]));

    await user.click(
      within(queue).getByRole("button", { name: /Coastal Apartment.*Extraction in progress/i })
    );

    await waitFor(() => expect(workspaceRequests).toEqual([
      "/api/v1/estimates/estimate-1/design-uploads",
      "/api/v1/estimates/estimate-2/design-uploads"
    ]));
    expect(
      within(screen.getByRole("region", { name: "Selected project workspace" }))
        .getByRole("heading", { name: "Coastal Apartment" })
    ).toBeVisible();
    expect(await screen.findByText("Coastal Lighting Plan")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Designer Uploading Space planning with Tentative look and Feel — In progress" })).toBeVisible();
    expect(workflowRequests).toEqual(["project-1", "project-2"]);
  });

  it("keeps submitted extracted images visible and read-only", async () => {
    const readyTask: DesignPlanTask = {
      ...assignedTask,
      status: "ready_for_client",
      designPlanVersion: 1
    };
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () =>
        HttpResponse.json({ data: [readyTask] })
      ),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () =>
        HttpResponse.json({ data: extractedWorkspace("estimate-1") })
      ),
      http.get("/api/v1/estimate-design-revisions/revision-estimate-1/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      )
    );

    renderPage();

    expect(await screen.findByText(/Submitted to the Client/)).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Extracted images" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "View extracted images" }))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit drawings to client" }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/submitted design and extracted images are read-only/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Design review" })).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Design review" })).getByText(/Design version/)).toHaveTextContent("v1");
  });

  it.each(["approved", "in_progress"] as const)("retains the %s design gallery after Space planning has completed", async (status) => {
    const workflow = uploadWorkflow();
    workflow.projectStages![5]!.status = "completed";
    workflow.projectStages![5]!.operational!.status = "completed";
    workflow.projectStages![5]!.operational!.timing.state = "completed";
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: [{ ...assignedTask, status, designPlanVersion: 7 }] })),
      http.get("/api/v1/projects/project-1/design-workflow", () => HttpResponse.json({ data: workflow })),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () => HttpResponse.json({ data: extractedWorkspace("estimate-1") })),
      http.get("/api/v1/estimate-design-revisions/:revisionId/image", () => new HttpResponse(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }))
    );
    renderPage();
    const gallery = await screen.findByRole("region", { name: status === "approved" ? "Approved design" : "Design review" });
    expect(await within(gallery).findByRole("article", { name: "Living Room Electrical Plan drawing" })).toBeVisible();
    expect(within(gallery).getByText(/Design version/)).toHaveTextContent("v7");
    expect(screen.getAllByText(/Design version/)).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Upload design" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit drawings to client" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /More actions/ }));
    expect(screen.queryByRole("menuitem", { name: "Change estimate item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Replace|Edit|Verify|Correct/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Assigned projects" })).queryByText(/v7/)).not.toBeInTheDocument();
  });

  it("deletes a pending upload and refreshes the workspace and project queue for another upload", async () => {
    let deleted = false;
    const deleteRequests: string[] = [];
    let workspaceReads = 0;
    let taskReads = 0;
    server.use(
      http.get("/api/v1/designer/design-plan-tasks", () => {
        taskReads += 1;
        return HttpResponse.json({
          data: [{ ...assignedTask, status: deleted ? "assigned" : "ready_for_client", designPlanVersion: 1 }]
        });
      }),
      http.get("/api/v1/estimates/estimate-1/design-uploads", () => {
        workspaceReads += 1;
        const workspace = extractedWorkspace("estimate-1");
        workspace.uploads[0]!.canDelete = true;
        return HttpResponse.json({ data: deleted ? emptyWorkspace() : workspace });
      }),
      http.get("/api/v1/estimate-design-revisions/revision-estimate-1/image", () =>
        new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" }
        })
      ),
      http.delete("/api/v1/estimate-design-uploads/:uploadId", ({ params }) => {
        deleteRequests.push(String(params.uploadId));
        deleted = true;
        return HttpResponse.json({ data: { id: params.uploadId, deleted: true } });
      })
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/You can delete your unapproved uploads/)).toBeVisible();
    expect(screen.queryByLabelText("Design plan file")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Delete upload client-design.pdf" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete design upload?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete upload" }));

    expect(await screen.findByLabelText("Design plan file")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("client-design.pdf")).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Extracted images" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Design upload deleted.")).toBeVisible();
    const queue = screen.getByRole("region", { name: "Assigned projects" });
    expect(within(queue).getByRole("button", { name: /Aurora Villa.*Assigned/ })).toBeVisible();
    expect(taskReads).toBeGreaterThanOrEqual(2);
    expect(workspaceReads).toBeGreaterThanOrEqual(2);
    expect(deleteRequests).toEqual(["upload-estimate-1"]);
  });
});

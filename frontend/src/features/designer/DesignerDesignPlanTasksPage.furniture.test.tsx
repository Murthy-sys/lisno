import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import type { DesignPlanTask } from "../../api/types";
import { projectWorkflowKeys, type DesignWorkflowStage, type DesignWorkflowView } from "../workflow/projectWorkflowApi";
import { ProjectWorkflowProgress } from "../workflow/ProjectWorkflowProgress";
import { DesignerDesignPlanTasksPage } from "./DesignerDesignPlanTasksPage";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  user: { id: "designer-1", role: "designer", name: "Design team" },
  authorization: authorizationFor("designer", ["projects.design_workflow.read", "design.plan_response_tasks.read"])
}) }));

const stageName = "Collection of existing furniture dimensions";
const declareLabel = "Declare existing-furniture requirements";
const editLabel = "Edit furniture requirements";
const acceptanceStep = "Await Client acceptance of furniture requirements";
const task: DesignPlanTask = {
  id: "plan-1", estimateId: "estimate-1", projectId: "project-1", projectName: "Aurora Villa", clientName: "Test Client",
  status: "assigned", designPlanVersion: 0, rooms: [], scopes: [], lineItems: []
};

function furnitureWorkflow(): DesignWorkflowView {
  const stage: DesignWorkflowStage = {
    id: "project-1:furniture", name: stageName, type: "existing_furniture_dimensions", order: 5,
    dependencyStageIds: [], status: "in_progress", progress: null, deadlineAt: null, deadlineTaskId: null, tasks: [],
    operational: {
      status: "in_progress", version: 6,
      availableActions: [{ id: "furniture_scope", label: declareLabel, actor: "designer", requiresProof: false }],
      furniture: { phase: "requirements_pending", notApplicable: false, requiredRoomCount: 0, readyRoomCount: 0, pendingRoomCount: 0 },
      timing: { state: "not_applicable", startsAt: "2026-09-17T08:00:00.000Z", targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
      blockingReasons: [], facts: [], history: []
    }
  };
  return {
    projectId: task.projectId, projectName: task.projectName, serverNow: "2026-09-17T08:00:00.000Z", floors: [],
    furnitureRooms: [{ id: "room-living", name: "Living Room" }, { id: "room-study", name: "Study" }, { id: "room-bedroom", name: "Bedroom" }].map((room) => ({ ...room, estimateItems: [{ id: `item-${room.id}`, name: `Furniture in ${room.name}`, catalogueId: `catalogue-${room.id}`, specification: "Selected estimate item", quantity: 1, uom: "nos" }] })),
    projectStages: [stage, {
      ...stage, id: "project-1:planning", type: "space_planning_tentative_look_feel", name: "Space planning", order: 6, status: "blocked",
      operational: { ...stage.operational!, furniture: undefined, status: "blocked", availableActions: [], blockingReasons: ["Client acceptance is required."] }
    }]
  };
}

type DimensionInput = { roomId: string; items: { estimateItemId: string; length: number; width: number; height: number; uomId: string }[] };
function declare(workflow: DesignWorkflowView, notApplicable: boolean, dimensions?: DimensionInput[]) {
  const stage = workflow.projectStages![0]!;
  const op = stage.operational!;
  op.version += 1;
  op.availableActions[0]!.label = editLabel;
  op.furniture = { phase: "awaiting_client_acceptance", ...(dimensions ? { requirementsSubmissionEventId: "scope-submission" } : {}), notApplicable, requiredRoomCount: notApplicable ? 0 : 2, readyRoomCount: 0, pendingRoomCount: notApplicable ? 0 : 2 };
  op.rooms = notApplicable ? [] : workflow.furnitureRooms!.map(room => {
    const submitted = dimensions?.find((entry) => entry.roomId === room.id);
    return { ...room, required: room.id !== "room-bedroom", hasDimensions: Boolean(submitted), canProceed: room.id === "room-bedroom", ...(submitted ? { dimensions: {
      submissionEventId: "scope-submission", revision: 1, status: "pending" as const, submittedAt: "2026-09-17T09:00:00.000Z",
      items: submitted.items.map((item) => ({ ...item, id: item.estimateItemId, name: room.estimateItems!.find((source) => source.id === item.estimateItemId)!.name, unit: "mm", uomName: "Millimetres" }))
    } } : {}) };
  });
}

function serve(getWorkflow: () => DesignWorkflowView) {
  server.use(
    http.get("/api/v1/designer/design-plan-tasks", () => HttpResponse.json({ data: [task] })),
    http.get("/api/v1/projects/project-1/design-workflow/furniture-uoms", () => HttpResponse.json({ data: [{ id: "uom-mm", code: "mm", name: "Millimetres", decimalScale: 3 }] })),
    http.get("/api/v1/projects/project-1/design-workflow", () => HttpResponse.json({ data: getWorkflow() })),
    http.get("/api/v1/admin/design-plan-response-tasks", () => HttpResponse.json({ data: [] })),
    http.get("/api/v1/estimates/estimate-1/design-uploads", () => HttpResponse.json({ data: { uploads: [], pages: [], drawings: [], revisions: [] } }))
  );
}

function renderPage() {
  let client!: QueryClient;
  function Capture() { client = useQueryClient(); return null; }
  const view = renderWithQuery(<MemoryRouter><Capture /><DesignerDesignPlanTasksPage /></MemoryRouter>);
  return { ...view, client };
}

describe("Designer furniture requirements progress", () => {
  it.each([false, true])("refreshes saved requirements and preserves edits without bypassing Client acceptance, no furniture=%s", async noFurniture => {
    let workflow = furnitureWorkflow();
    const submissions: Array<Record<string, unknown>> = [];
    let reads = 0;
    serve(() => { reads++; return workflow; });
    function record(submission: Record<string, unknown>) {
      submissions.push(submission);
      workflow = structuredClone(workflow);
      declare(workflow, noFurniture, (submission.data as { dimensions?: DimensionInput[] }).dimensions);
    }
    server.use(http.post("/api/v1/projects/project-1/design-workflow/actions", async ({ request }) => {
      record(await request.json() as Record<string, unknown>);
      return HttpResponse.json({ data: { version: 7 } });
    }));
    // JSDOM/MSW cannot serialize the browser XHR FormData implementation.
    vi.spyOn(apiClient, "postMultipartWithProgress").mockImplementation(async (_path, form) => {
      record({ action: form.get("action"), expectedVersion: Number(form.get("expectedVersion")), data: JSON.parse(String(form.get("data"))) });
      return { version: 7 };
    });
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(await screen.findByRole("button", { name: declareLabel }));
    if (noFurniture) await user.click(screen.getByRole("checkbox", { name: "No existing furniture dimensions are needed" }));
    else {
      await user.click(screen.getByRole("checkbox", { name: "Living Room" }));
      await user.click(screen.getByRole("checkbox", { name: "Study" }));
      for (const room of ["Living Room", "Study"]) {
        const group = within(screen.getByRole("group", { name: `${room} dimensions` }));
        await user.type(group.getByRole("spinbutton", { name: "Length" }), "2100");
        await user.type(group.getByRole("spinbutton", { name: "Width" }), "900");
        await user.type(group.getByRole("spinbutton", { name: "Height" }), "850");
        await user.selectOptions(group.getByRole("combobox", { name: "UOM" }), "uom-mm");
      }
      await user.upload(screen.getByLabelText(/Furniture dimensions document/), new File(["dimensions"], "furniture.pdf", { type: "application/pdf" }));
    }
    fireEvent.submit(screen.getByRole("form"));
    expect(await screen.findByText(noFurniture ? acceptanceStep : "Await Client approval of furniture dimensions", { selector: "dd" })).toBeVisible();
    expect(await screen.findByRole("button", { name: `${stageName} — ${noFurniture ? "Awaiting Client acceptance" : "Awaiting dimensions approval"}` })).toBeVisible();
    expect(screen.queryByRole("button", { name: declareLabel })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Furniture requirements progress" })).toHaveTextContent(noFurniture ? "Furniture requirements saved" : "Furniture dimensions submitted");
    expect(screen.queryByRole("heading", { name: "Upload design" })).not.toBeInTheDocument();
    expect(reads).toBeGreaterThan(1);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({ action: "furniture_scope", expectedVersion: 6, data: noFurniture ? { rooms: [], notApplicable: true } : {
      notApplicable: false, rooms: [{ id: "room-living", required: true }, { id: "room-study", required: true }, { id: "room-bedroom", required: false }],
      dimensions: ["room-living", "room-study"].map((roomId) => ({ roomId, items: [{ estimateItemId: `item-${roomId}`, length: 2100, width: 900, height: 850, uomId: "uom-mm" }] }))
    } });

    await user.click(screen.getByRole("button", { name: editLabel }));
    const noFurnitureCheckbox = screen.getByRole("checkbox", { name: "No existing furniture dimensions are needed" });
    if (noFurniture) expect(noFurnitureCheckbox).toBeChecked();
    else expect(noFurnitureCheckbox).not.toBeChecked();
    if (!noFurniture) {
      expect(screen.getByRole("checkbox", { name: "Living Room" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Study" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Bedroom" })).not.toBeChecked();
    }
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();


    workflow = structuredClone(workflow);
    const completed = workflow.projectStages![0]!;
    completed.status = "completed"; completed.progress = 100;
    completed.operational = { ...completed.operational!, status: "completed", version: 9, availableActions: [], furniture: { ...completed.operational!.furniture!, phase: "completed", readyRoomCount: noFurniture ? 0 : 2, pendingRoomCount: 0 } };
    const planning = workflow.projectStages![1]!;
    planning.status = "in_progress"; planning.operational!.status = "in_progress"; planning.operational!.blockingReasons = [];
    await act(async () => { await view.client.invalidateQueries({ queryKey: projectWorkflowKeys.all }); });
    expect(await screen.findByRole("button", { name: `${stageName} — Completed` })).toBeVisible();
    expect(await screen.findByText("Upload the design plan", { selector: "dd" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Upload design" })).toBeVisible();
    expect(screen.queryByRole("button", { name: editLabel })).not.toBeInTheDocument();
  });

  it.each(["blocked", "not_started"] as const)("keeps %s prerequisites ahead of furniture waiting labels", async status => {
    const workflow = furnitureWorkflow(); declare(workflow, false);
    const stage = workflow.projectStages![0]!;
    stage.status = status; stage.operational!.status = status; stage.operational!.availableActions = [];
    stage.operational!.blockingReasons = ["Complete site measurement first."];
    serve(() => workflow); renderPage();
    expect(await screen.findByRole("button", { name: `${stageName} — ${status === "blocked" ? "Blocked" : "Not started"}` })).toBeVisible();
    expect(await screen.findByText("Complete site measurement first.", { selector: "dd" })).toBeVisible();
    expect(screen.queryByText(acceptanceStep, { selector: "dd" })).not.toBeInTheDocument();
  });

  it.each(["client", "full"] as const)("shows persistent no-furniture confirmation guidance in %s presentation", async presentation => {
    const workflow = furnitureWorkflow(); declare(workflow, true);
    renderWithQuery(<ProjectWorkflowProgress workflow={workflow} initialStageId="project-1:furniture" presentation={presentation} />);
    const summary = await screen.findByRole("group", { name: "Furniture requirements progress" });
    expect(summary).toHaveTextContent("No existing furniture dimensions are needed. Client acceptance is still required.");
    expect(screen.getByRole("button", { name: `${stageName} — Awaiting Client acceptance` })).toBeVisible();
  });
});

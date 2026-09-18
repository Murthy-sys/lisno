import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { WorkflowStageActions } from "./WorkflowStageActions";
import { projectWorkflowKeys, type DesignWorkflowAction, type DesignWorkflowStage, type DesignWorkflowView, type FurnitureDimensionsSubmission, type FurnitureUomOption } from "./projectWorkflowApi";
import { workflowStageNextStep, workflowStageStatusLabel } from "./projectWorkflowSelectors";

const submitAction: DesignWorkflowAction = { id: "furniture_upload", label: "Submit furniture dimensions", actor: "designer", requiresProof: true };
const approveAction: DesignWorkflowAction = { id: "furniture_dimensions_approve", label: "Approve furniture dimensions", actor: "client", requiresProof: false };
const returnAction: DesignWorkflowAction = { id: "furniture_dimensions_return", label: "Send back dimensions", actor: "client", requiresProof: false };
const scopeReturn: DesignWorkflowAction = { id: "furniture_scope_return", label: "Send back requirements", actor: "client", requiresProof: false };
const uomOptions: FurnitureUomOption[] = [{ id: "uom-mm", code: "mm", name: "Millimetres", decimalScale: 3 }, { id: "uom-cm", code: "cm", name: "Centimetres", decimalScale: 2 }];
beforeEach(() => { vi.spyOn(apiClient, "get").mockResolvedValue(uomOptions); });
const proof = new File(["synthetic dimensions"], "furniture.pdf", { type: "application/pdf" });
const submission = (id: string, status: FurnitureDimensionsSubmission["status"] = "pending"): FurnitureDimensionsSubmission => ({
  submissionEventId: `submission-${id}`, revision: 2, status, submittedAt: "2026-09-17T09:00:00.000Z",
  items: [{ id: `estimate-${id.replace(/^room-/, "")}`, estimateItemId: `estimate-${id.replace(/^room-/, "")}`, name: "Sofa", length: 2100, width: 900, height: 850, unit: "mm", uomId: "uom-mm", uomName: "Millimetres" }],
  ...(status === "changes_requested" ? { returnReason: "Measure the armrest width again." } : {})
});
function fixture(actions: DesignWorkflowAction[] = [submitAction]) {
  const stage: DesignWorkflowStage = {
    id: "project-a:furniture", type: "existing_furniture_dimensions", name: "Collection of existing furniture dimensions", order: 4,
    dependencyStageIds: [], status: "in_progress", progress: null, deadlineAt: null, deadlineTaskId: null, tasks: [],
    operational: {
      status: "in_progress", version: 7, availableActions: actions,
      timing: { state: "not_applicable", startsAt: "2026-09-17T08:00:00.000Z", targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
      blockingReasons: [], facts: [], history: [],
      furniture: { phase: "awaiting_dimensions", notApplicable: false, requiredRoomCount: 2, readyRoomCount: 0, pendingRoomCount: 2, evidence: [] },
      rooms: [{ id: "room-bedroom", name: "Bedroom", required: true, hasDimensions: false, canProceed: false }, { id: "room-living", name: "Living room", required: true, hasDimensions: false, canProceed: false }, { id: "room-study", name: "Study", required: false, hasDimensions: false, canProceed: true }]
    }
  };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-09-17T10:00:00.000Z", projectStages: [stage], floors: [], furnitureRooms: stage.operational!.rooms!.map(({ id, name }) => ({ id, name, estimateItems: [{ id: `estimate-${id.replace(/^room-/, "")}`, name: name === "Bedroom" ? "Sofa" : "Table", catalogueId: `catalogue-${id}`, specification: "Selected finish from approved estimate", quantity: 2, uom: "nos" }] })) };
  return { workflow, stage };
}
function pendingFixture() {
  const data = fixture([approveAction, returnAction]);
  data.stage.operational!.furniture!.phase = "awaiting_dimension_approval";
  data.stage.operational!.furniture!.evidence = [{ eventId: "submission-bedroom", filename: "furniture.pdf", mimeType: "application/pdf", byteSize: 1024, source: "furniture_dimensions" }];
  data.stage.operational!.rooms = data.stage.operational!.rooms!.map((room) => room.required ? { ...room, hasDimensions: true, dimensions: submission(room.id) } : room);
  return data;
}
function setup(data = fixture(), presentation: "designer" | "client" | "full" = "designer") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...data, client, ...render(<WorkflowStageActions {...data} presentation={presentation} />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }) };
}
async function fillItem(user: ReturnType<typeof userEvent.setup>, room = "Bedroom") {
  const group = within(screen.getByRole("group", { name: `${room} dimensions` }));
  await user.type(group.getByRole("spinbutton", { name: "Length" }), "210.5");
  await user.type(group.getByRole("spinbutton", { name: "Width" }), "90");
  await user.type(group.getByRole("spinbutton", { name: "Height" }), "85");
  await user.selectOptions(group.getByRole("combobox", { name: "UOM" }), "uom-cm");
}

describe("Furniture submission and Client decisions", () => {
  it.each(["designer", "client"] as const)("submits entered measurements, units and proof for selected rooms as %s without approval", async (presentation) => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
    const data = fixture([{ ...submitAction, actor: presentation }]);
    const { client } = setup(data, presentation); const invalidate = vi.spyOn(client, "invalidateQueries"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    expect(screen.queryByRole("checkbox", { name: "Study" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Bedroom" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Living room" }));
    await fillItem(user);
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    expect([...screen.getByRole("form").querySelectorAll<HTMLInputElement>('input:not([type="file"]),select,textarea')].filter((input) => !input.validity.valid).map((input) => ({ id: input.id, value: input.value, error: input.validationMessage }))).toEqual([]);
    // JSDOM does not update native file validity when user-event installs its FileList.
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const body = post.mock.calls[0]![1];
    expect(JSON.parse(body.get("data") as string)).toEqual({ rooms: [{ roomId: "room-bedroom", items: [{ estimateItemId: "estimate-bedroom", length: 210.5, width: 90, height: 85, uomId: "uom-cm" }] }] });
    expect(body.get("action")).toBe("furniture_upload"); expect(body.get("expectedVersion")).toBe("7"); expect(body.get("file")).toBe(proof);
    expect(await screen.findByRole("status")).toHaveTextContent("Awaiting Client approval");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.all });
  });

  it("requires positive item measurements in every selected room", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress"); setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    await fillItem(user); await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("each selected room");
    await fillItem(user, "Living room");
    const width = within(screen.getByRole("group", { name: "Living room dimensions" })).getByRole("spinbutton", { name: "Width" });
    fireEvent.change(width, { target: { value: "0" } }); fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("positive length, width and height"); expect(post).not.toHaveBeenCalled();
  });

  it("loads all selected estimate items and confirms discarding unsaved measurements", async () => {
    const data = fixture();
    data.workflow.furnitureRooms![0]!.estimateItems!.push({ id: "estimate-sideboard", name: "Sideboard", catalogueId: "CA-sideboard", specification: "Oak finish", quantity: 1, uom: "nos" });
    setup(data); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    const bedroom = within(screen.getByRole("group", { name: "Bedroom dimensions" }));
    expect(bedroom.getByRole("group", { name: "Sofa measurements" })).toBeVisible();
    expect(bedroom.getByRole("group", { name: "Sideboard measurements" })).toBeVisible();
    expect(bedroom.getByText("Estimate: 2 nos")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Furniture item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add item|Remove item/ })).not.toBeInTheDocument();
    const width = within(bedroom.getByRole("group", { name: "Sideboard measurements" })).getByRole("spinbutton", { name: "Width" });
    await user.type(width, "90");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(width).toHaveValue(90);
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("prefills returned measurements and shows the Client correction reason", async () => {
    const data = fixture(); data.stage.operational!.furniture!.phase = "dimension_changes_requested";
    data.stage.operational!.rooms![0] = { ...data.stage.operational!.rooms![0]!, hasDimensions: true, dimensions: submission("bedroom", "changes_requested") };
    setup(data); const user = userEvent.setup();
    expect(screen.getByText("Measure the armrest width again.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    const bedroom = within(screen.getByRole("group", { name: "Bedroom dimensions" }));
    expect(bedroom.getByText("Sofa")).toBeVisible();
    expect(bedroom.getByRole("spinbutton", { name: "Width" })).toHaveValue(900);
    expect(bedroom.getByRole("combobox", { name: "UOM" })).toHaveValue("uom-mm");
    expect(within(screen.getByRole("dialog")).getByText(/Measure the armrest width again/)).toBeVisible();
  });

  it("shows measurements, status and current proof before Client approval", async () => {
    const blob = vi.spyOn(apiClient, "getBlob"); const data = pendingFixture(); setup(data, "client");
    const review = screen.getByRole("region", { name: "Submitted furniture dimensions" });
    const table = within(review).getByRole("table", { name: "Furniture measurements for Bedroom" });
    expect(within(table).getByRole("row", { name: "Sofa 2100 900 850 mm" })).toBeVisible();
    expect(screen.getByRole("button", { name: "View furniture.pdf" })).toBeEnabled();
    expect(screen.getByText("Furniture dimensions · 1.0 KB")).toBeVisible();
    expect(screen.queryByText("Dimensions approved")).not.toBeInTheDocument();
    expect(blob).not.toHaveBeenCalled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("submits distinct estimate IDs when items in different rooms share a name", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
    const data = fixture(); data.workflow.furnitureRooms![1]!.estimateItems![0]!.name = "Sofa";
    setup(data); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    await fillItem(user); await fillItem(user, "Living room");
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(JSON.parse(post.mock.calls[0]![1].get("data") as string)).toEqual({ rooms: [
      { roomId: "room-bedroom", items: [{ estimateItemId: "estimate-bedroom", length: 210.5, width: 90, height: 85, uomId: "uom-cm" }] },
      { roomId: "room-living", items: [{ estimateItemId: "estimate-living", length: 210.5, width: 90, height: 85, uomId: "uom-cm" }] }
    ] });
  });

  it("blocks submission and explains when the approved estimate has no selected items for a room", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    const data = fixture(); data.workflow.furnitureRooms![0]!.estimateItems = [];
    setup(data); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    expect(screen.getByText(/No selected estimate items are available for Bedroom/)).toBeVisible();
    expect(screen.getByRole("button", { name: submitAction.label })).toBeDisabled();
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Selected estimate items are unavailable");
    expect(post).not.toHaveBeenCalled();
  });

  it("does not rebind legacy measurements to estimate items with matching names", async () => {
    const data = fixture();
    const legacy = submission("bedroom", "changes_requested");
    delete legacy.items[0]!.estimateItemId;
    data.stage.operational!.rooms![0]!.dimensions = legacy;
    setup(data); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    const bedroom = within(screen.getByRole("group", { name: "Bedroom dimensions" }));
    expect(bedroom.getByRole("spinbutton", { name: "Width" })).toHaveValue(null);
    expect(bedroom.getByText(/Previous measurements were not linked/)).toBeVisible();
    expect(screen.getByRole("row", { name: "Sofa 2100 900 850 mm" })).toBeInTheDocument();
  });

  it("blocks a dirty draft if selected estimate items change without a workflow-version change", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    const { workflow, stage, rerender } = setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label })); await fillItem(user);
    const replacement = structuredClone(workflow);
    replacement.furnitureRooms![0]!.estimateItems![0]!.id = "different-estimate-item";
    rerender(<WorkflowStageActions workflow={replacement} stage={stage} presentation="designer" />);
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed");
    expect(screen.getByRole("button", { name: submitAction.label })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
  });

  it("keeps measurements when a room is deselected and selected again", async () => {
    setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label })); await fillItem(user);
    await user.click(screen.getByRole("checkbox", { name: "Bedroom" }));
    expect(screen.queryByRole("group", { name: "Bedroom dimensions" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Bedroom" }));
    const bedroom = within(screen.getByRole("group", { name: "Bedroom dimensions" }));
    expect(bedroom.getByRole("spinbutton", { name: "Width" })).toHaveValue(90);
    expect(bedroom.getByRole("combobox", { name: "UOM" })).toHaveValue("uom-cm");
  });

  it("can close untouched preselected rooms without a discard warning", async () => {
    setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    expect(screen.getByRole("checkbox", { name: "Bedroom" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shares one Configuration UOM lookup across rooms and requires an explicit choice", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    await screen.findAllByRole("option", { name: /Centimetres/ });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith("/projects/project-a/design-workflow/furniture-uoms", expect.objectContaining({ showGlobalLoader: false }));
    await user.click(screen.getByRole("checkbox", { name: "Living room" }));
    for (const name of ["Length", "Width", "Height"]) await user.type(screen.getByRole("spinbutton", { name }), "90");
    expect(screen.getByRole("combobox", { name: "UOM" })).toHaveValue("");
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Select an active configured UOM");
    expect(post).not.toHaveBeenCalled();
  });

  it("preserves legacy dimensions but does not infer a Configuration ID from their unit label", async () => {
    const data = fixture();
    const legacy = submission("bedroom", "changes_requested");
    delete legacy.items[0]!.uomId;
    delete legacy.items[0]!.uomName;
    data.stage.operational!.rooms![0]!.dimensions = legacy;
    setup(data); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    const bedroom = within(screen.getByRole("group", { name: "Bedroom dimensions" }));
    await waitFor(() => expect(bedroom.getByRole("combobox", { name: "UOM" })).toBeEnabled());
    expect(bedroom.getByRole("spinbutton", { name: "Width" })).toHaveValue(900);
    expect(bedroom.getByRole("combobox", { name: "UOM" })).toHaveValue("");
    expect(screen.getByRole("row", { name: "Sofa 2100 900 850 mm" })).toBeInTheDocument();
  });

  it("keeps returned measurements and blocks an archived UOM until replaced", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    vi.mocked(apiClient.get).mockResolvedValue([uomOptions[1]!]);
    const data = fixture(); data.stage.operational!.rooms![0]!.dimensions = submission("bedroom", "changes_requested");
    setup(data); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    await user.click(screen.getByRole("checkbox", { name: "Living room" }));
    await screen.findByRole("option", { name: /Centimetres/ });
    expect(screen.getByRole("spinbutton", { name: "Width" })).toHaveValue(900);
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Select an active configured UOM");
    expect(post).not.toHaveBeenCalled();
  });

  it("adds a reusable UOM for one item without losing measurements or submitting the parent form", async () => {
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress");
    const created = { id: "uom-in", code: "in", name: "Inches", decimalScale: 3 };
    const post = vi.spyOn(apiClient, "post").mockImplementation(async () => {
      vi.mocked(apiClient.get).mockResolvedValue([...uomOptions, created]);
      return { uom: created, reused: false } as never;
    });
    setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: submitAction.label }));
    await fillItem(user); await fillItem(user, "Living room");
    const bedroom = within(screen.getByRole("group", { name: "Bedroom dimensions" }));
    await user.click(bedroom.getByRole("button", { name: "Add UOM" }));
    const add = within(screen.getByRole("dialog", { name: "Add UOM" }));
    await user.type(add.getByRole("textbox", { name: "UOM code" }), "in");
    await user.type(add.getByRole("textbox", { name: "UOM name" }), "Inches");
    await user.click(add.getByRole("button", { name: "Save UOM" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add UOM" })).not.toBeInTheDocument());
    expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/furniture-uoms", { code: "in", name: "Inches", decimalScale: 3 }, { showGlobalLoader: false });
    expect(upload).not.toHaveBeenCalled();
    expect(bedroom.getByRole("spinbutton", { name: "Length" })).toHaveValue(210.5);
    expect(bedroom.getByRole("combobox", { name: "UOM" })).toHaveValue("uom-in");
    const living = within(screen.getByRole("group", { name: "Living room dimensions" }));
    expect(living.getByRole("combobox", { name: "UOM" })).toHaveValue("uom-cm");
    expect(screen.getByRole("button", { name: submitAction.label })).toBeEnabled();
  });

  it.each([approveAction, returnAction])("binds $id to the selected current submission", async (action) => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 8 });
    setup(pendingFixture(), "client"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: action.label }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Living room" }));
    if (action.id === "furniture_dimensions_return") {
      fireEvent.submit(screen.getByRole("form")); expect(screen.getByRole("alert")).toHaveTextContent("Add a reason"); expect(post).not.toHaveBeenCalled();
      await user.type(screen.getByRole("textbox", { name: "Reason" }), "Please check the sofa height.");
    }
    await user.click(screen.getByRole("button", { name: action.label }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", expect.objectContaining({ action: action.id, expectedVersion: 7, data: { submissions: [{ roomId: "room-living", submissionEventId: "submission-room-living" }] } }), { showGlobalLoader: false });
  });

  it("blocks review when its submission is replaced even with an unchanged projection version", async () => {
    const post = vi.spyOn(apiClient, "post"); const { workflow, stage, rerender } = setup(pendingFixture(), "client"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: approveAction.label })); await user.click(screen.getByRole("checkbox", { name: "Bedroom" }));
    const replacement = { ...stage, operational: { ...stage.operational!, rooms: stage.operational!.rooms!.map((room) => room.id === "room-bedroom" ? { ...room, dimensions: submission("replacement") } : room) } };
    rerender(<WorkflowStageActions workflow={workflow} stage={replacement} presentation="client" />);
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed"); expect(screen.getByRole("button", { name: approveAction.label })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
  });

  it("requires a scope correction reason and submits it without inventing room decisions", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 8 });
    const data = fixture([scopeReturn]); data.stage.operational!.furniture!.phase = "awaiting_client_acceptance";
    setup(data, "client"); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: scopeReturn.label }));
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "The bedroom also needs wardrobe measurements.");
    await user.click(screen.getByRole("button", { name: scopeReturn.label }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toEqual(expect.objectContaining({ action: "furniture_scope_return", data: {}, note: "The bedroom also needs wardrobe measurements." }));
  });

  it("shows returned scope feedback to the Designer and preserves room selections on reopening", async () => {
    const action: DesignWorkflowAction = { id: "furniture_scope", label: "Resubmit furniture requirements", actor: "designer", requiresProof: false };
    const data = fixture([action]); data.stage.operational!.furniture = { ...data.stage.operational!.furniture!, phase: "requirements_changes_requested", scopeReturn: { reason: "Include the bedroom wardrobes.", at: "2026-09-17T10:00:00Z" } };
    setup(data); const user = userEvent.setup(); expect(screen.getByText("Include the bedroom wardrobes.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: action.label }));
    expect(screen.getByRole("checkbox", { name: "Bedroom" })).toBeChecked(); expect(screen.getByRole("checkbox", { name: "Living room" })).toBeChecked(); expect(screen.getByRole("checkbox", { name: "Study" })).not.toBeChecked();
  });

  it.each([
    ["requirements_changes_requested", "Requirements sent back", "Revise and resubmit furniture requirements"],
    ["awaiting_dimension_approval", "Awaiting dimensions approval", "Await Client approval of furniture dimensions"],
    ["dimension_changes_requested", "Dimensions sent back", "Correct and resubmit furniture dimensions"]
  ] as const)("projects %s consistently in badges and next steps", (phase, label, nextStep) => {
    const { stage } = fixture(); stage.operational!.furniture!.phase = phase;
    expect(workflowStageStatusLabel(stage)).toBe(label); expect(workflowStageNextStep(stage)).toBe(nextStep);
  });
});

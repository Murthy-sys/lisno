import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { WorkflowStageActions } from "./WorkflowStageActions";
import type { DesignWorkflowAction, DesignWorkflowStage, DesignWorkflowView, FurnitureDimensionsSubmission } from "./projectWorkflowApi";

const scopeAction: DesignWorkflowAction = { id: "furniture_scope", label: "Edit furniture requirements", actor: "designer", requiresProof: false };
const acceptAction: DesignWorkflowAction = { id: "furniture_accept", label: "Approve furniture dimensions", actor: "client", requiresProof: false };
const returnAction: DesignWorkflowAction = { id: "furniture_scope_return", label: "Send back requirements", actor: "client", requiresProof: false };
const uoms = [{ id: "uom-mm", code: "mm", name: "Millimetres", decimalScale: 3 }];
const proof = new File(["Synthetic furniture dimensions"], "measurements.pdf", { type: "application/pdf" });
beforeEach(() => { vi.spyOn(apiClient, "get").mockResolvedValue(uoms); });

function fixture() {
  const stage: DesignWorkflowStage = {
    id: "project-a:furniture", type: "existing_furniture_dimensions", name: "Collection of existing furniture dimensions", order: 4,
    dependencyStageIds: [], status: "in_progress", progress: null, deadlineAt: null, deadlineTaskId: null, tasks: [],
    operational: {
      status: "in_progress", version: 7, availableActions: [scopeAction],
      timing: { state: "not_applicable", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
      blockingReasons: [], facts: [], history: [], rooms: [],
      furniture: { phase: "requirements_pending", notApplicable: false, requiredRoomCount: 0, readyRoomCount: 0, pendingRoomCount: 0 }
    }
  };
  const workflow: DesignWorkflowView = {
    projectId: "project-a", projectName: "Project A", serverNow: "2026-09-17T10:00:00.000Z", projectStages: [stage], floors: [],
    furnitureRooms: [
      { id: "bedroom", name: "Bedroom", estimateItems: [
        { id: "wardrobe", name: "Wardrobe", catalogueId: "catalogue-wardrobe", specification: "Oak", quantity: 1, uom: "nos" },
        { id: "bedside", name: "Bedside table", catalogueId: "catalogue-bedside", specification: "Oak", quantity: 2, uom: "nos" }
      ] },
      { id: "living", name: "Living room", estimateItems: [{ id: "sofa", name: "Sofa", catalogueId: "catalogue-sofa", specification: "Grey", quantity: 1, uom: "nos" }] }
    ]
  };
  return { workflow, stage };
}

function savedFixture(status: FurnitureDimensionsSubmission["status"] = "pending") {
  const data = fixture();
  data.stage.operational!.furniture = { ...data.stage.operational!.furniture!, phase: status === "pending" ? "awaiting_client_acceptance" : "requirements_changes_requested", requiredRoomCount: 1, pendingRoomCount: 1, requirementsSubmissionEventId: "scope-1" };
  data.stage.operational!.rooms = data.workflow.furnitureRooms!.map((room) => ({
    id: room.id, name: room.name, required: room.id === "bedroom", canProceed: room.id !== "bedroom", hasDimensions: room.id === "bedroom",
    ...(room.id === "bedroom" ? { dimensions: {
      submissionEventId: "scope-1", revision: 1, status, submittedAt: "2026-09-17T09:00:00.000Z",
      ...(status === "changes_requested" ? { returnReason: "Check the wardrobe width." } : {}),
      items: room.estimateItems!.map((item) => ({ id: item.id, estimateItemId: item.id, name: item.name, length: 2100, width: 900, height: 850, uomId: "uom-mm", unit: "mm", uomName: "Millimetres" }))
    } } : {})
  }));
  return data;
}

function setup(data = fixture(), presentation: "designer" | "client" = "designer") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...data, client, ...render(<WorkflowStageActions {...data} presentation={presentation} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }) };
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: scopeAction.label }));
}
async function fillItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const item = within(screen.getByRole("group", { name: `${name} measurements` }));
  await user.type(item.getByRole("spinbutton", { name: "Length" }), "2100.125");
  await user.type(item.getByRole("spinbutton", { name: "Width" }), "900");
  await user.type(item.getByRole("spinbutton", { name: "Height" }), "850");
  await user.selectOptions(item.getByRole("combobox", { name: "UOM" }), "uom-mm");
}

describe("Furniture dimensions at requirements entry", () => {
  it("shows every selected item across Living, Master Bedroom and Kitchen even when estimate quantities are zero", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
    const data = fixture();
    data.workflow.furnitureRooms![0]!.name = "Master Bedroom";
    data.workflow.furnitureRooms![0]!.estimateItems!.forEach((item) => { item.quantity = 0; });
    data.workflow.furnitureRooms!.push({ id: "kitchen", name: "Kitchen", estimateItems: [
      { id: "kitchen-points", name: "Kitchen switch points", catalogueId: "EL01", specification: "Selected switches", quantity: 0, uom: "pts", measurementType: "count" }
    ] });
    vi.mocked(apiClient.get).mockResolvedValue([...uoms, { id: "uom-pts", code: "pts", name: "Points", decimalScale: 0 }]);
    setup(data); const user = userEvent.setup(); await open(user);
    for (const name of ["Master Bedroom", "Living room", "Kitchen"]) {
      await user.click(screen.getByRole("checkbox", { name }));
    }
    for (const name of ["Wardrobe", "Bedside table", "Sofa"]) await fillItem(user, name);
    const points = within(screen.getByRole("group", { name: "Kitchen switch points measurements" }));
    expect(points.getByText("Estimate: 0 pts")).toBeVisible();
    expect(points.queryByRole("spinbutton", { name: "Length" })).not.toBeInTheDocument();
    await user.type(points.getByRole("spinbutton", { name: "Number of points" }), "12");
    await user.selectOptions(points.getByRole("combobox", { name: "UOM" }), "uom-pts");
    const bedroom = within(screen.getByRole("group", { name: "Master Bedroom dimensions" }));
    expect(bedroom.getAllByText("Estimate: 0 nos")).toHaveLength(2);
    expect(bedroom.queryByRole("group", { name: "Sofa measurements" })).not.toBeInTheDocument();
    expect(screen.queryByText(/No selected estimate items/)).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    expect(screen.getByRole("button", { name: scopeAction.label })).toBeEnabled();
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    const body = post.mock.calls[0]![1];
    const submitted = JSON.parse(body.get("data") as string);
    expect(body.get("file")).toBe(proof);
    expect(submitted.rooms).toEqual([{ id: "bedroom", required: true }, { id: "living", required: true }, { id: "kitchen", required: true }]);
    expect(submitted.dimensions).toEqual([
      { roomId: "bedroom", items: ["wardrobe", "bedside"].map((estimateItemId) => ({ estimateItemId, length: 2100.125, width: 900, height: 850, uomId: "uom-mm" })) },
      { roomId: "living", items: [{ estimateItemId: "sofa", length: 2100.125, width: 900, height: 850, uomId: "uom-mm" }] },
      { roomId: "kitchen", items: [{ estimateItemId: "kitchen-points", measurementType: "count", quantity: 12, uomId: "uom-pts" }] }
    ]);
    expect(data.workflow.furnitureRooms![0]!.estimateItems!.map((item) => item.quantity)).toEqual([0, 0]);
  });

  it("retains returned measurements and requires newly visible selected items before resubmission", async () => {
    const data = savedFixture("changes_requested");
    data.workflow.furnitureRooms![0]!.name = "Master Bedroom";
    data.stage.operational!.rooms![0]!.name = "Master Bedroom";
    data.workflow.furnitureRooms![0]!.estimateItems!.push({ id: "dresser-zero", name: "Dresser", catalogueId: "CA07", specification: "Oak dresser", quantity: 0, uom: "nos" });
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
    setup(data); const user = userEvent.setup(); await open(user);
    const wardrobe = within(screen.getByRole("group", { name: "Wardrobe measurements" }));
    expect(wardrobe.getByRole("spinbutton", { name: "Width" })).toHaveValue(900);
    await waitFor(() => expect(wardrobe.getByRole("combobox", { name: "UOM" })).toHaveValue("uom-mm"));
    const dresser = within(screen.getByRole("group", { name: "Dresser measurements" }));
    expect(dresser.getByRole("spinbutton", { name: "Length" })).toHaveValue(null);
    expect(dresser.getByRole("combobox", { name: "UOM" })).toHaveValue("");
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("positive length, width and height");
    expect(post).not.toHaveBeenCalled();
    await fillItem(user, "Dresser");
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    const submitted = JSON.parse(post.mock.calls[0]![1].get("data") as string);
    expect(submitted.dimensions[0].items.map((item: { estimateItemId: string }) => item.estimateItemId)).toEqual(["wardrobe", "bedside", "dresser-zero"]);
    expect(submitted.dimensions[0].items[0]).toEqual({ estimateItemId: "wardrobe", length: 2100, width: 900, height: 850, uomId: "uom-mm" });
  });

  it("shows selected estimate items before any scope acceptance and submits measurements, room scope and proof together", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
    setup(); const user = userEvent.setup(); await open(user);
    expect(screen.getByRole("checkbox", { name: "No existing furniture dimensions are needed" })).not.toBeChecked();
    expect(apiClient.get).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Bedroom" }));
    expect(screen.getByRole("group", { name: "Wardrobe measurements" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Bedside table measurements" })).toBeVisible();
    await fillItem(user, "Wardrobe"); await fillItem(user, "Bedside table");
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    const body = post.mock.calls[0]![1];
    expect(body.get("action")).toBe("furniture_scope"); expect(body.get("file")).toBe(proof);
    expect(JSON.parse(body.get("data") as string)).toEqual({
      rooms: [{ id: "bedroom", required: true }, { id: "living", required: false }], notApplicable: false,
      dimensions: [{ roomId: "bedroom", items: ["wardrobe", "bedside"].map((estimateItemId) => ({ estimateItemId, length: 2100.125, width: 900, height: 850, uomId: "uom-mm" })) }]
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Awaiting Client approval");
  });

  it.each(["pending", "changes_requested"] as const)("immediately displays saved dimensions and configured units while editing %s requirements", async (status) => {
    setup(savedFixture(status)); const user = userEvent.setup(); await open(user);
    expect(screen.getByRole("checkbox", { name: "Bedroom" })).toBeChecked();
    const room = within(screen.getByRole("group", { name: "Bedroom dimensions" }));
    expect(room.getAllByRole("spinbutton", { name: "Width" })).toHaveLength(2);
    expect(room.getAllByRole("spinbutton", { name: "Width" })[0]).toHaveValue(900);
    await waitFor(() => expect(room.getAllByRole("combobox", { name: "UOM" })[0]).toHaveValue("uom-mm"));
    if (status === "changes_requested") expect(room.getByText("Check the wardrobe width.")).toBeVisible();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps measurements, room selections and attached proof when temporarily toggling no furniture", async () => {
    setup(savedFixture()); const user = userEvent.setup(); await open(user);
    const width = within(screen.getByRole("group", { name: "Wardrobe measurements" })).getByRole("spinbutton", { name: "Width" });
    await user.clear(width); await user.type(width, "901.5");
    const fileInput = screen.getByLabelText(/Furniture dimensions document/) as HTMLInputElement;
    await user.upload(fileInput, proof);
    const noFurniture = screen.getByRole("checkbox", { name: "No existing furniture dimensions are needed" });
    await user.click(noFurniture);
    expect(screen.queryByRole("group", { name: "Bedroom dimensions" })).not.toBeInTheDocument();
    expect(fileInput).not.toBeVisible();
    await user.click(noFurniture);
    expect(screen.getByRole("checkbox", { name: "Bedroom" })).toBeChecked();
    expect(within(screen.getByRole("group", { name: "Wardrobe measurements" })).getByRole("spinbutton", { name: "Width" })).toHaveValue(901.5);
    expect(screen.getByLabelText(/Furniture dimensions document/)).toBe(fileInput);
    expect(fileInput.files?.[0]).toBe(proof);
  });

  it("omits hidden dimensions and document when changing to an explicit no-furniture declaration", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 8 });
    const multipart = vi.spyOn(apiClient, "postMultipartWithProgress");
    setup(savedFixture()); const user = userEvent.setup(); await open(user);
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    await user.click(screen.getByRole("checkbox", { name: "No existing furniture dimensions are needed" }));
    await user.click(screen.getByRole("button", { name: scopeAction.label }));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post.mock.calls[0]![1]).toEqual(expect.objectContaining({ data: { rooms: [], notApplicable: true } }));
    expect(multipart).not.toHaveBeenCalled();
  });

  it("still requires representative proof for a no-furniture declaration", async () => {
    const multipart = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
    const data = fixture(); data.stage.operational!.availableActions = [{ ...scopeAction, actor: "client", requiresProof: true }];
    setup(data); const user = userEvent.setup(); await open(user);
    await user.click(screen.getByRole("checkbox", { name: "No existing furniture dimensions are needed" }));
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the required evidence file");
    await user.upload(screen.getByLabelText(/Client action proof/), proof); fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(multipart).toHaveBeenCalledOnce());
    expect(multipart.mock.calls[0]![1].get("file")).toBe(proof);
  });

  it("requires positive dimensions, an active UOM and a fresh document on a returned submission", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress"); setup(savedFixture("changes_requested"));
    const user = userEvent.setup(); await open(user);
    await waitFor(() => expect(screen.getAllByRole("combobox", { name: "UOM" })[0]).toBeEnabled());
    fireEvent.submit(screen.getByRole("form")); expect(screen.getByRole("alert")).toHaveTextContent("Choose the required evidence file");
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    const width = within(screen.getByRole("group", { name: "Wardrobe measurements" })).getByRole("spinbutton", { name: "Width" });
    fireEvent.change(width, { target: { value: "0" } }); fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("positive length, width and height");
    fireEvent.change(width, { target: { value: "900" } });
    fireEvent.change(screen.getAllByRole("combobox", { name: "UOM" })[0]!, { target: { value: "" } });
    fireEvent.submit(screen.getByRole("form")); expect(screen.getByRole("alert")).toHaveTextContent("active configured UOM");
    expect(post).not.toHaveBeenCalled();
  });

  it("blocks missing estimate items and stale source replacements in the scope editor", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    const { workflow, stage, rerender } = setup(savedFixture()); const user = userEvent.setup(); await open(user);
    const replacement = structuredClone(workflow); replacement.furnitureRooms![0]!.estimateItems![0]!.id = "new-wardrobe";
    rerender(<WorkflowStageActions workflow={replacement} stage={stage} presentation="designer" />);
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed");
    expect(screen.getByRole("button", { name: scopeAction.label })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
  });

  it("blocks dimensions on a UOM lookup failure but permits an explicit no-furniture declaration", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error("Options unavailable"));
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 8 });
    setup(savedFixture()); const user = userEvent.setup(); await open(user);
    expect((await screen.findAllByText("UOMs could not be loaded. Try again."))[0]).toBeVisible();
    expect(screen.getByRole("button", { name: scopeAction.label })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "No existing furniture dimensions are needed" }));
    expect(screen.getByRole("button", { name: scopeAction.label })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: scopeAction.label }));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
  });

  it.each([acceptAction, returnAction])("binds combined $id to the exact submitted requirements", async (action) => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 8 });
    const data = savedFixture(); data.stage.operational!.availableActions = [action];
    setup(data, "client"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: action.label }));
    expect(screen.getByRole("table", { name: "Furniture measurements for Bedroom" })).toBeVisible();
    if (action.id === "furniture_scope_return") await user.type(screen.getByRole("textbox", { name: "Reason" }), "Check the wardrobe width.");
    await user.click(screen.getByRole("button", { name: action.label }));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post.mock.calls[0]![1]).toEqual(expect.objectContaining({ action: action.id, expectedVersion: 7, data: { submissionEventId: "scope-1" } }));
  });

  it("blocks a combined approval after its token changes without a projection version change", async () => {
    const post = vi.spyOn(apiClient, "post"); const data = savedFixture(); data.stage.operational!.availableActions = [acceptAction];
    const { workflow, stage, rerender } = setup(data, "client"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: acceptAction.label }));
    rerender(<WorkflowStageActions workflow={workflow} stage={{ ...stage, operational: { ...stage.operational!, furniture: { ...stage.operational!.furniture!, requirementsSubmissionEventId: "scope-2" } } }} presentation="client" />);
    expect(screen.getByRole("button", { name: acceptAction.label })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed");
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
  });

  it("does not silently submit a legacy approval when dimensions exist but their requirements token is missing", async () => {
    const post = vi.spyOn(apiClient, "post"); const data = savedFixture();
    delete data.stage.operational!.furniture!.requirementsSubmissionEventId; data.stage.operational!.availableActions = [acceptAction];
    setup(data, "client"); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: acceptAction.label }));
    expect(screen.getByRole("button", { name: acceptAction.label })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
  });
});

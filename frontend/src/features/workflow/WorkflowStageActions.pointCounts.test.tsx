import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { createFurnitureDimensionsDraft, parseFurnitureDimensionsDraft } from "./FurnitureDimensionsEditor";
import { FurnitureRequirementsReview } from "./FurnitureRequirementsReview";
import { WorkflowStageActions } from "./WorkflowStageActions";
import type { DesignWorkflowAction, DesignWorkflowStage, DesignWorkflowView, FurnitureDimensionItem, FurnitureEstimateRoom } from "./projectWorkflowApi";

const scopeAction: DesignWorkflowAction = { id: "furniture_scope", label: "Edit furniture requirements", actor: "designer", requiresProof: false };
const uploadAction: DesignWorkflowAction = { id: "furniture_upload", label: "Submit furniture dimensions", actor: "designer", requiresProof: true };
const units = [{ id: "uom-mm", code: "mm", name: "Millimetres", decimalScale: 3 }, { id: "uom-pts", code: "pts", name: "Points", decimalScale: 0 }];
const proof = new File(["Synthetic site measurements"], "measurements.pdf", { type: "application/pdf" });
const estimateRooms: FurnitureEstimateRoom[] = [{ id: "bedroom", name: "Bedroom", estimateItems: [
  { id: "wardrobe", name: "Wardrobe", specification: "Oak", catalogueId: "cat-wardrobe", quantity: 1, uom: "nos", measurementType: "dimensions" },
  { id: "lights", name: "Light / fan / switch points", specification: "Selected switch finish", catalogueId: "cat-lights", quantity: 8, uom: "pts", measurementType: "count" }
] }];
const savedItems: FurnitureDimensionItem[] = [
  { id: "wardrobe", estimateItemId: "wardrobe", name: "Wardrobe", length: 1800, width: 600, height: 2100, unit: "mm", uomId: "uom-mm", uomName: "Millimetres" },
  { id: "lights", estimateItemId: "lights", name: "Light / fan / switch points", measurementType: "count", quantity: 9, unit: "pts", uomId: "uom-pts", uomName: "Points" }
];
beforeEach(() => { vi.spyOn(apiClient, "get").mockResolvedValue(units); });

function fixture(action = scopeAction, returned = false) {
  const stage: DesignWorkflowStage = {
    id: "project-a:furniture", type: "existing_furniture_dimensions", name: "Collection of existing furniture dimensions", order: 4,
    dependencyStageIds: [], status: "in_progress", progress: null, deadlineAt: null, deadlineTaskId: null, tasks: [],
    operational: {
      status: "in_progress", version: 7, availableActions: [action],
      timing: { state: "not_applicable", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
      blockingReasons: [], facts: [], history: [],
      furniture: { phase: returned ? action.id === "furniture_scope" ? "requirements_changes_requested" : "dimension_changes_requested" : action.id === "furniture_scope" ? "requirements_pending" : "awaiting_dimensions", notApplicable: false, requiredRoomCount: 1, readyRoomCount: 0, pendingRoomCount: 1 },
      rooms: [{ id: "bedroom", name: "Bedroom", required: true, hasDimensions: returned, canProceed: false, ...(returned ? { dimensions: {
        submissionEventId: "submission-6", revision: 1, submittedAt: "2026-09-17T09:00:00Z", status: "changes_requested" as const,
        returnReason: "Check the number of switch points.", items: structuredClone(savedItems)
      } } : {}) }]
    }
  };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-09-17T10:00:00Z", projectStages: [stage], floors: [], furnitureRooms: structuredClone(estimateRooms) };
  return { workflow, stage };
}
function setup(data = fixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...data, ...render(<WorkflowStageActions {...data} presentation="designer" />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }) };
}
async function open(user: ReturnType<typeof userEvent.setup>, action = scopeAction) {
  await user.click(screen.getByRole("button", { name: action.label }));
  await screen.findAllByRole("option", { name: /Points/ });
}
const pointGroup = () => within(screen.getByRole("group", { name: "Light / fan / switch points measurements" }));
async function fill(user: ReturnType<typeof userEvent.setup>) {
  const dimensions = within(screen.getByRole("group", { name: "Wardrobe measurements" }));
  for (const [name, value] of [["Length", "1800"], ["Width", "600"], ["Height", "2100"]]) await user.type(dimensions.getByRole("spinbutton", { name }), value!);
  await user.selectOptions(dimensions.getByRole("combobox", { name: "UOM" }), "uom-mm");
  await user.type(pointGroup().getByRole("spinbutton", { name: "Number of points" }), "9");
  await user.selectOptions(pointGroup().getByRole("combobox", { name: "UOM" }), "uom-pts");
  await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
}

const expectedItems = [
  { estimateItemId: "wardrobe", length: 1800, width: 600, height: 2100, uomId: "uom-mm" },
  { estimateItemId: "lights", measurementType: "count", quantity: 9, uomId: "uom-pts" }
];

describe("Point-count entry and submission", () => {
  it.each([scopeAction, uploadAction])("submits mixed points and furniture dimensions through $id without invented fields", async (action) => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
    setup(fixture(action)); const user = userEvent.setup(); await open(user, action);
    expect(pointGroup().getAllByRole("spinbutton")).toHaveLength(1);
    expect(pointGroup().queryByRole("spinbutton", { name: /Length|Width|Height/ })).not.toBeInTheDocument();
    const count = pointGroup().getByRole("spinbutton", { name: "Number of points" });
    expect(count).toHaveAttribute("min", "1"); expect(count).toHaveAttribute("step", "1"); expect(count).toHaveAttribute("max", String(Number.MAX_SAFE_INTEGER));
    expect(within(screen.getByRole("group", { name: "Wardrobe measurements" })).getAllByRole("spinbutton")).toHaveLength(3);
    await fill(user); fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    const body = post.mock.calls[0]![1];
    expect(body.get("file")).toBe(proof); expect(body.get("action")).toBe(action.id);
    expect(JSON.parse(body.get("data") as string)).toEqual(action.id === "furniture_scope"
      ? { rooms: [{ id: "bedroom", required: true }], notApplicable: false, dimensions: [{ roomId: "bedroom", items: expectedItems }] }
      : { rooms: [{ roomId: "bedroom", items: expectedItems }] });
  });

  it.each([scopeAction, uploadAction])("prefills returned counts and units in $id while keeping room-toggle drafts", async (action) => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
    setup(fixture(action, true)); const user = userEvent.setup(); await open(user, action);
    expect(pointGroup().getByRole("spinbutton", { name: "Number of points" })).toHaveValue(9);
    expect(pointGroup().getByRole("combobox", { name: "UOM" })).toHaveValue("uom-pts");
    expect(within(screen.getByRole("dialog")).getByText("Check the number of switch points.")).toBeVisible();
    fireEvent.change(pointGroup().getByRole("spinbutton", { name: "Number of points" }), { target: { value: "12" } });
    await user.click(screen.getByRole("checkbox", { name: "Bedroom" }));
    expect(screen.queryByRole("spinbutton", { name: "Number of points" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Bedroom" }));
    expect(pointGroup().getByRole("spinbutton", { name: "Number of points" })).toHaveValue(12);
    expect(pointGroup().getByRole("combobox", { name: "UOM" })).toHaveValue("uom-pts");
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof); fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    const data = JSON.parse(post.mock.calls[0]![1].get("data") as string);
    expect((data.dimensions ?? data.rooms)[0].items[1]).toEqual({ estimateItemId: "lights", measurementType: "count", quantity: 12, uomId: "uom-pts" });
  });

  it("keeps count/UOM values when no furniture is toggled and warns before discarding an edited count", async () => {
    setup(fixture(scopeAction, true)); const user = userEvent.setup(); await open(user);
    fireEvent.change(pointGroup().getByRole("spinbutton", { name: "Number of points" }), { target: { value: "13" } });
    const toggle = screen.getByRole("checkbox", { name: "No existing furniture dimensions are needed" });
    await user.click(toggle); await user.click(toggle);
    expect(pointGroup().getByRole("spinbutton", { name: "Number of points" })).toHaveValue(13);
    expect(pointGroup().getByRole("combobox", { name: "UOM" })).toHaveValue("uom-pts");
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
  });

  it.each(["", "0", "-1", "1.5", "9007199254740992"])("blocks invalid point count %s before sending", async (value) => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    setup(fixture(scopeAction, true)); const user = userEvent.setup(); await open(user);
    await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
    fireEvent.change(pointGroup().getByRole("spinbutton", { name: "Number of points" }), { target: { value } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("positive whole number of points"); expect(post).not.toHaveBeenCalled();
  });

  it("does not convert legacy LWH point entries into counts or copy their UOM", async () => {
    const data = fixture(scopeAction, true);
    data.stage.operational!.rooms![0]!.dimensions!.items[1] = { id: "lights", estimateItemId: "lights", name: "Light / fan / switch points", length: 5, width: 5, height: 5, uomId: "uom-mm", unit: "mm" };
    setup(data); const user = userEvent.setup(); await open(user);
    expect(pointGroup().getByRole("spinbutton", { name: "Number of points" })).toHaveValue(null);
    expect(pointGroup().getByRole("combobox", { name: "UOM" })).toHaveValue("");
    expect(pointGroup().getByText(/Earlier length, width and height values do not represent a point count/)).toBeVisible();
    expect(screen.getByRole("row", { name: "Light / fan / switch points 5 5 5 mm" })).toBeInTheDocument();
  });

  it("uses only canonical measurement metadata, never item names or UOM labels", async () => {
    const data = fixture(); delete data.workflow.furnitureRooms![0]!.estimateItems![1]!.measurementType;
    setup(data); const user = userEvent.setup(); await open(user);
    expect(pointGroup().queryByRole("spinbutton", { name: "Number of points" })).not.toBeInTheDocument();
    expect(pointGroup().getAllByRole("spinbutton")).toHaveLength(3);
    await user.selectOptions(pointGroup().getByRole("combobox", { name: "UOM" }), "uom-pts");
    expect(pointGroup().getAllByRole("spinbutton")).toHaveLength(3);
  });

  it("blocks an open draft when the canonical measurement mode changes", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    const { workflow, stage, rerender } = setup(); const user = userEvent.setup(); await open(user);
    const changed = structuredClone(workflow); changed.furnitureRooms![0]!.estimateItems![1]!.measurementType = "dimensions";
    rerender(<WorkflowStageActions workflow={changed} stage={stage} presentation="designer" />);
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed");
    expect(screen.getByRole("button", { name: scopeAction.label })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
  });
});

describe("Point-count draft boundaries", () => {
  const draft = () => createFurnitureDimensionsDraft(fixture(scopeAction, true).stage.operational!.rooms!, estimateRooms);
  it.each(["NaN", "Infinity", "-Infinity", "9007199254740992", "9007199254740991.1", "1.00000000000000001"])("rejects nonfinite, fractional or unsafe draft count %s", (quantity) => {
    const values = draft(); values.bedroom![1] = { estimateItemId: "lights", measurementType: "count", quantity, uomId: "uom-pts" };
    expect(parseFurnitureDimensionsDraft(["bedroom"], values, estimateRooms, units)).toEqual({ error: expect.stringContaining("positive whole number") });
  });
  it("retains full count precision at the maximum safe integer", () => {
    const values = draft(); values.bedroom![1] = { estimateItemId: "lights", measurementType: "count", quantity: String(Number.MAX_SAFE_INTEGER), uomId: "uom-pts" };
    const parsed = parseFurnitureDimensionsDraft(["bedroom"], values, estimateRooms, units);
    expect(parsed.rooms?.[0]!.items[1]).toEqual({ estimateItemId: "lights", measurementType: "count", quantity: Number.MAX_SAFE_INTEGER, uomId: "uom-pts" });
  });
  it("requires an active configured unit for points", () => {
    expect(parseFurnitureDimensionsDraft(["bedroom"], draft(), estimateRooms, [units[0]!])).toEqual({ error: expect.stringContaining("active configured UOM") });
  });
  it("rejects a draft mode that does not match the estimate item", () => {
    const values = draft(); values.bedroom![1] = { estimateItemId: "lights", measurementType: "dimensions", length: "5", width: "5", height: "5", uomId: "uom-pts" };
    expect(parseFurnitureDimensionsDraft(["bedroom"], values, estimateRooms, units)).toEqual({ error: expect.stringContaining("unavailable or have changed") });
  });
  it("never prefills a different estimate item by name", () => {
    const data = fixture(scopeAction, true); data.stage.operational!.rooms![0]!.dimensions!.items[1]!.estimateItemId = "old-lights";
    const values = createFurnitureDimensionsDraft(data.stage.operational!.rooms!, estimateRooms);
    expect(values.bedroom![1]).toEqual({ estimateItemId: "lights", measurementType: "count", quantity: "", uomId: "" });
  });
});

describe("Client count review", () => {
  it("shows count-only submissions without dimensional columns", async () => {
    const { stage } = fixture(scopeAction, true); stage.operational!.rooms![0]!.dimensions!.items = [savedItems[1]!];
    render(<FurnitureRequirementsReview projectId="project-a" operational={stage.operational!} />);
    const table = within(screen.getByRole("table", { name: "Point counts for Bedroom" }));
    expect(table.getByRole("row", { name: "Light / fan / switch points 9 pts" })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: /Length|Width|Height/ })).not.toBeInTheDocument();
    expect(table.getByRole("columnheader", { name: "Number of points" })).toBeVisible();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
  it("separates counts from physical dimensions in mixed submissions", () => {
    const { stage } = fixture(scopeAction, true);
    render(<FurnitureRequirementsReview projectId="project-a" operational={stage.operational!} />);
    const points = within(screen.getByRole("table", { name: "Point counts for Bedroom" }));
    const dimensions = within(screen.getByRole("table", { name: "Furniture measurements for Bedroom" }));
    expect(points.getByRole("row", { name: "Light / fan / switch points 9 pts" })).toBeVisible();
    expect(points.queryByRole("columnheader", { name: "Length" })).not.toBeInTheDocument();
    expect(dimensions.getByRole("row", { name: "Wardrobe 1800 600 2100 mm" })).toBeVisible();
    expect(dimensions.queryByRole("rowheader", { name: "Light / fan / switch points" })).not.toBeInTheDocument();
  });
  it("preserves approved legacy dimensional snapshots for point items", () => {
    const { stage } = fixture(scopeAction, true); const room = stage.operational!.rooms![0]!;
    room.dimensions!.status = "approved"; room.canProceed = true;
    room.dimensions!.items = [{ id: "lights", estimateItemId: "lights", name: "Light / fan / switch points", length: 5, width: 6, height: 7, unit: "nos" }];
    render(<FurnitureRequirementsReview projectId="project-a" operational={stage.operational!} />);
    expect(screen.getByRole("row", { name: "Light / fan / switch points 5 6 7 nos" })).toBeVisible();
    expect(screen.queryByRole("table", { name: "Point counts for Bedroom" })).not.toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { WorkflowStageActions } from "./WorkflowStageActions";
import { projectWorkflowKeys, type DesignWorkflowAction, type DesignWorkflowStage, type DesignWorkflowView, type FurnitureUomOption } from "./projectWorkflowApi";

const scopeAction: DesignWorkflowAction = { id: "furniture_scope", label: "Edit furniture requirements", actor: "designer", requiresProof: false };
const uploadAction: DesignWorkflowAction = { id: "furniture_upload", label: "Submit furniture dimensions", actor: "designer", requiresProof: true };
const units: FurnitureUomOption[] = [{ id: "uom-mm", code: "mm", name: "Millimetres", decimalScale: 3 }, { id: "uom-pts", code: "pts", name: "Points", decimalScale: 0 }];
const proof = new File(["Synthetic site measurements"], "measurements.pdf", { type: "application/pdf" });
beforeEach(() => { vi.spyOn(apiClient, "get").mockResolvedValue(units); });

function fixture(action = scopeAction, emptyRooms = ["Study"]) {
  const furnitureRooms: NonNullable<DesignWorkflowView["furnitureRooms"]> = [
    { id: "bedroom", name: "Bedroom", estimateItems: [{ id: "wardrobe", name: "Wardrobe", specification: "Oak", catalogueId: "cat-wardrobe", quantity: 1, uom: "nos", measurementType: "dimensions" }] },
    { id: "living", name: "Living room", estimateItems: [{ id: "lights", name: "Switch points", specification: "Selected finish", catalogueId: "cat-lights", quantity: 8, uom: "pts", measurementType: "count" }] },
    ...emptyRooms.map((name, index) => ({ id: `empty-${index}`, name, estimateItems: [] }))
  ];
  const stage: DesignWorkflowStage = {
    id: "project-a:furniture", type: "existing_furniture_dimensions", name: "Collection of existing furniture dimensions", order: 4,
    dependencyStageIds: [], status: "in_progress", progress: null, deadlineAt: null, deadlineTaskId: null, tasks: [],
    operational: {
      status: "in_progress", version: 7, availableActions: [action],
      timing: { state: "not_applicable", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
      blockingReasons: [], facts: [], history: [],
      furniture: { phase: action.id === "furniture_scope" ? "requirements_changes_requested" : "awaiting_dimensions", notApplicable: false, requiredRoomCount: furnitureRooms.length, readyRoomCount: 0, pendingRoomCount: furnitureRooms.length },
      rooms: furnitureRooms.map((room) => ({ id: room.id, name: room.name, required: true, hasDimensions: false, canProceed: false }))
    }
  };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-09-17T10:00:00Z", projectStages: [stage], floors: [], furnitureRooms };
  return { workflow, stage };
}
function setup(data = fixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...data, client, ...render(<WorkflowStageActions {...data} presentation="designer" />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }) };
}
async function open(user: ReturnType<typeof userEvent.setup>, action = scopeAction) {
  await user.click(screen.getByRole("button", { name: action.label }));
}
const footer = () => within(document.querySelector<HTMLElement>(".workflow-stage-actions__submit-footer")!);
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await screen.findAllByRole("option", { name: /Points/ });
  const dimensions = within(screen.getByRole("group", { name: "Wardrobe measurements" }));
  for (const [name, value] of [["Length", "1800"], ["Width", "600"], ["Height", "2100"]]) await user.type(dimensions.getByRole("spinbutton", { name }), value!);
  await user.selectOptions(dimensions.getByRole("combobox", { name: "UOM" }), "uom-mm");
  const points = within(screen.getByRole("group", { name: "Switch points measurements" }));
  await user.type(points.getByRole("spinbutton", { name: "Number of points" }), "9");
  await user.selectOptions(points.getByRole("combobox", { name: "UOM" }), "uom-pts");
  await user.upload(screen.getByLabelText(/Furniture dimensions document/), proof);
  await user.type(screen.getByRole("textbox", { name: "Note" }), "Measured at site.");
}
function expectDraft(fileInput: HTMLElement) {
  expect(screen.getByRole("spinbutton", { name: "Length" })).toHaveValue(1800);
  expect(screen.getByRole("spinbutton", { name: "Width" })).toHaveValue(600);
  expect(screen.getByRole("spinbutton", { name: "Height" })).toHaveValue(2100);
  expect(screen.getByRole("spinbutton", { name: "Number of points" })).toHaveValue(9);
  expect(screen.getAllByRole("combobox", { name: "UOM" }).map((item) => (item as HTMLSelectElement).value)).toEqual(["uom-mm", "uom-pts"]);
  expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Measured at site.");
  expect(screen.getByLabelText(/Furniture dimensions document/)).toBe(fileInput);
  expect((fileInput as HTMLInputElement).files?.[0]).toBe(proof);
}

describe("Furniture submission blocker guidance", () => {
  it.each([scopeAction, uploadAction])("names an empty selected room and preserves full drafts through explicit selection recovery in $id", async (action) => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
    setup(fixture(action)); const user = userEvent.setup(); await open(user, action); await fill(user);
    const fileInput = screen.getByLabelText(/Furniture dimensions document/);
    const submit = footer().getByRole("button", { name: action.label });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(/No selected estimate items in Study/);
    expect(footer().getByRole("status")).toHaveTextContent("Uncheck rooms that do not need measurements, or update the approved estimate.");
    const study = screen.getByRole("checkbox", { name: "Study" });
    expect(study).toBeChecked(); expect(study).toHaveAccessibleDescription(/No selected estimate items/);
    expect(study).toHaveAttribute("aria-invalid", "true");
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
    await user.click(footer().getByRole("button", { name: "Review rooms" })); expect(study).toHaveFocus();
    await user.click(study); expect(submit).toBeEnabled(); expect(submit).not.toHaveAttribute("aria-describedby");
    expect(study).not.toHaveAttribute("aria-invalid"); expectDraft(fileInput);
    await user.click(study); expect(submit).toBeDisabled(); expect(submit).toHaveAccessibleDescription(/Study/);
    await user.click(study); expectDraft(fileInput);
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    fireEvent.submit(screen.getByRole("form")); await waitFor(() => expect(post).toHaveBeenCalledOnce());
    const body = post.mock.calls[0]![1]; expect(body.get("file")).toBe(proof); expect(body.get("note")).toBe("Measured at site.");
    const data = JSON.parse(body.get("data") as string);
    if (action.id === "furniture_scope") expect(data.rooms).toEqual([{ id: "bedroom", required: true }, { id: "living", required: true }, { id: "empty-0", required: false }]);
    expect((data.dimensions ?? data.rooms).map((room: { roomId: string }) => room.roomId)).toEqual(["bedroom", "living"]);
    expect((data.dimensions ?? data.rooms)[1].items).toEqual([{ estimateItemId: "lights", measurementType: "count", quantity: 9, uomId: "uom-pts" }]);
  });

  it("summarizes more than three unavailable rooms while Review rooms targets the first selected one", async () => {
    setup(fixture(scopeAction, ["Study", "Utility", "Terrace", "Balcony", "Store"])); const user = userEvent.setup(); await open(user);
    expect(footer().getByRole("status")).toHaveTextContent("No selected estimate items in Study, Utility, Terrace and 2 more.");
    expect(footer().getByRole("status")).not.toHaveTextContent("Balcony");
    await user.click(screen.getByRole("checkbox", { name: "Study" }));
    await user.click(footer().getByRole("button", { name: "Review rooms" }));
    expect(screen.getByRole("checkbox", { name: "Utility" })).toHaveFocus();
    await user.click(screen.getByRole("checkbox", { name: "Study" }));
    await user.click(footer().getByRole("button", { name: "Review rooms" }));
    expect(screen.getByRole("checkbox", { name: "Study" })).toHaveFocus();
  });

  it("explains initial UOM loading and releases the disabled button on success without weakening field validation", async () => {
    let resolveUnits!: (value: FurnitureUomOption[]) => void;
    vi.mocked(apiClient.get).mockImplementation(() => new Promise((resolve) => { resolveUnits = resolve as typeof resolveUnits; }));
    setup(fixture(scopeAction, [])); const user = userEvent.setup(); await open(user);
    const submit = footer().getByRole("button", { name: scopeAction.label });
    expect(submit).toBeDisabled(); expect(submit).toHaveAccessibleDescription("Loading configured UOMs. Please wait before submitting.");
    await act(async () => resolveUnits(units)); await waitFor(() => expect(submit).toBeEnabled());
    expect(submit).not.toHaveAttribute("aria-describedby");
    fireEvent.submit(screen.getByRole("form")); expect(screen.getByRole("alert")).toHaveTextContent("Choose the required evidence file");
  });

  it("offers footer retry after initial UOM failure", async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue(units);
    setup(fixture(scopeAction, [])); const user = userEvent.setup(); await open(user);
    const submit = footer().getByRole("button", { name: scopeAction.label });
    await waitFor(() => expect(submit).toHaveAccessibleDescription(/Configured UOMs could not be loaded/));
    expect(footer().getAllByRole("button", { name: "Retry UOMs" })).toHaveLength(1);
    await user.click(footer().getByRole("button", { name: "Retry UOMs" }));
    await waitFor(() => expect(submit).toBeEnabled()); expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it("blocks cached UOMs after a failed refetch, keeps the draft and only resumes after retry succeeds", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    const { client } = setup(fixture(scopeAction, [])); const user = userEvent.setup(); await open(user); await fill(user);
    const fileInput = screen.getByLabelText(/Furniture dimensions document/);
    const submit = footer().getByRole("button", { name: scopeAction.label }); expect(submit).toBeEnabled();
    vi.mocked(apiClient.get).mockRejectedValue(new Error("Lookup failed"));
    await act(async () => { await client.refetchQueries({ queryKey: projectWorkflowKeys.furnitureUoms("project-a") }); });
    await waitFor(() => expect(submit).toHaveAccessibleDescription(/Configured UOMs could not be loaded/));
    expect(client.getQueryData(projectWorkflowKeys.furnitureUoms("project-a"))).toEqual(units);
    expect(submit).toBeDisabled(); expectDraft(fileInput);
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
    let resolveUnits!: (value: FurnitureUomOption[]) => void;
    vi.mocked(apiClient.get).mockImplementation(() => new Promise((resolve) => { resolveUnits = resolve as typeof resolveUnits; }));
    await user.click(footer().getByRole("button", { name: "Retry UOMs" }));
    expect(submit).toBeDisabled(); expect(submit).toHaveAccessibleDescription(/Loading configured UOMs/);
    expect(footer().getByRole("button", { name: "Retry UOMs" })).toBeDisabled(); expectDraft(fileInput);
    await act(async () => resolveUnits(units)); await waitFor(() => expect(submit).toBeEnabled()); expectDraft(fileInput);
    expect(submit).not.toHaveAttribute("aria-describedby"); expect(post).not.toHaveBeenCalled();
  });

  it.each(["version", "source", "action removed", "action blocked"])("keeps a single stale footer alert for %s without rebasing the draft", async (change) => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    const { workflow, stage, rerender } = setup(fixture(scopeAction, [])); const user = userEvent.setup(); await open(user); await fill(user);
    const nextWorkflow = structuredClone(workflow); const nextStage = structuredClone(stage);
    if (change === "version") nextStage.operational!.version += 1;
    if (change === "source") nextWorkflow.furnitureRooms![0]!.estimateItems![0]!.id = "replacement";
    if (change === "action removed") nextStage.operational!.availableActions = [];
    if (change === "action blocked") nextStage.operational!.availableActions[0]!.disabledReason = "Your assignment changed. Reopen the latest workflow.";
    rerender(<WorkflowStageActions workflow={nextWorkflow} stage={nextStage} presentation="designer" />);
    const submit = footer().getByRole("button", { name: scopeAction.label }); expect(submit).toBeDisabled();
    expect(screen.getAllByRole("alert")).toHaveLength(1); expect(footer().getByRole("alert")).toBeVisible();
    expect(submit).toHaveAccessibleDescription(change === "action blocked" ? /Your assignment changed/ : /workflow changed/);
    expect(footer().queryByRole("button", { name: "Retry UOMs" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Measured at site.");
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
  });

  it("explains the open Add UOM panel and restores submit when it closes", async () => {
    setup(fixture(scopeAction, [])); const user = userEvent.setup(); await open(user);
    const submit = footer().getByRole("button", { name: scopeAction.label });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(screen.getAllByRole("button", { name: "Add UOM" })[0]!);
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription("Finish adding the UOM or close the Add UOM panel before submitting.");
    await user.click(within(screen.getByRole("dialog", { name: "Add UOM" })).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(submit).toBeEnabled()); expect(submit).not.toHaveAttribute("aria-describedby");
  });

  it("retains the established busy state during upload without stale blocker guidance", async () => {
    vi.spyOn(apiClient, "postMultipartWithProgress").mockImplementation(() => new Promise(() => undefined));
    setup(fixture(scopeAction, [])); const user = userEvent.setup(); await open(user); await fill(user);
    fireEvent.submit(screen.getByRole("form"));
    const submit = footer().getByRole("button", { name: scopeAction.label });
    await waitFor(() => expect(submit).toHaveAttribute("aria-busy", "true")); expect(submit).toBeDisabled();
    expect(submit).not.toHaveAttribute("aria-describedby"); expect(footer().queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Uploading evidence");
  });
});

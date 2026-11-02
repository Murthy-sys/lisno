import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/client";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { WorkflowStageActions } from "./WorkflowStageActions";
import type { DesignWorkflowAction, DesignWorkflowStage, DesignWorkflowView } from "./projectWorkflowApi";

function fixture(action: DesignWorkflowAction = { id: "furniture_choice", label: "Confirm existing furniture", actor: "client", requiresProof: false }) {
  const stage: DesignWorkflowStage = { id: "furniture", name: "Existing furniture", type: "existing_furniture_dimensions", order: 5, status: "in_progress", progress: null, deadlineAt: null, deadlineTaskId: null, dependencyStageIds: [], tasks: [], operational: {
    workflowVersion: 3, status: "in_progress", version: 8, availableActions: [action], blockingReasons: [], facts: [], history: [],
    timing: { state: "running", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
    clientFurnitureRequest: { requestEventId: "request-1", requestedById: "primary", requestedAt: "2026-10-30T10:00:00Z", roomIds: ["living"], hasFurniture: null, needsAssistance: null, assistanceFeePaise: null },
    rooms: [{ id: "living", name: "Living room", required: true, hasDimensions: false, canProceed: false }, { id: "bedroom", name: "Bedroom", required: false, hasDimensions: false, canProceed: true }]
  } };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-10-30T10:00:00Z", projectStages: [stage], floors: [], furnitureRooms: [{ id: "living", name: "Living room", estimateItems: [] }, { id: "bedroom", name: "Bedroom", estimateItems: [] }] };
  return { workflow, stage };
}
function setup(data = fixture()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...data, ...render(<WorkflowStageActions {...data} presentation="client" />, { wrapper: ({ children }) => <QueryClientProvider client={client}><FeedbackProvider>{children}</FeedbackProvider></QueryClientProvider> }) };
}
describe("Client-owned existing furniture", () => {
  it.each([true, false])("records explicit existing furniture choice without a manufactured charge: %s", async hasFurniture => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 9 }); setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Confirm existing furniture" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Do you have existing furniture?" }), String(hasFurniture));
    if (hasFurniture) {
      await user.selectOptions(screen.getByRole("combobox", { name: "Need Lisno assistance?" }), "true");
      expect(screen.getByText(/Additional charges: to be determined. Your team/)).toBeVisible();
    }
    expect((await axe.run(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", expect.objectContaining({ expectedVersion: 8, action: "furniture_choice", data: hasFurniture ? { hasFurniture: true, needsAssistance: true } : { hasFurniture: false } }), { showGlobalLoader: false }));
  });
  it("lets the Client confirm personal furniture dimensions without estimate items or a document", async () => {
    const data = fixture({ id: "furniture_upload", label: "Enter furniture dimensions", actor: "client", requiresProof: false });
    Object.assign(data.stage.operational!.clientFurnitureRequest!, { hasFurniture: true, needsAssistance: false });
    vi.spyOn(apiClient, "get").mockResolvedValue([{ id: "uom-mm", name: "Millimetres", code: "mm", decimalScale: 3 }]);
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 9 }); setup(data); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Enter furniture dimensions" }));
    expect(screen.queryByRole("checkbox", { name: "Bedroom" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Item name in Living room" }), "Existing sofa");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit for item 1" }), "uom-mm");
    await user.type(screen.getByRole("textbox", { name: "Length for item 1" }), "2100");
    await user.type(screen.getByRole("textbox", { name: "Width for item 1" }), "900");
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Confirm that you have checked"); expect(post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: /I have checked and confirm/ }));
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toMatchObject({ action: "furniture_upload", expectedVersion: 8, data: { confirmed: true, rooms: [{ roomId: "living", items: [{ id: expect.any(String), name: "Existing sofa", uomId: "uom-mm", measurementType: "dimensions", length: 2100, width: 900 }] }] } });
    expect(JSON.stringify(post.mock.calls[0]![1])).not.toContain("estimateItemId");
  });
  it("reviews only the assisted submission's exact room and version", async () => {
    const data = fixture({ id: "furniture_dimensions_approve", label: "Approve furniture dimensions", actor: "client", requiresProof: false });
    Object.assign(data.stage.operational!.clientFurnitureRequest!, { hasFurniture: true, needsAssistance: true });
    data.stage.operational!.rooms![0]!.dimensions = { submissionEventId: "assisted-round", revision: 2, status: "pending", provenance: "designer_assisted", submittedAt: "2026-10-30T11:00:00Z", items: [{ id: "sofa", name: "Sofa", uomId: "mm", unit: "mm", length: 2000, width: 900 }] };
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 9 }); setup(data); const user = userEvent.setup();
    expect(screen.getByRole("region", { name: "Living room submitted dimensions" })).toHaveTextContent("Sofa");
    await user.click(screen.getByRole("button", { name: "Approve furniture dimensions" }));
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toMatchObject({ expectedVersion: 8, data: { submissions: [{ roomId: "living", submissionEventId: "assisted-round" }] } });
  });
  it("requires evidence for Designer assistance and sends count items for Client review without self-confirmation", async () => {
    const data = fixture({ id: "furniture_upload", label: "Submit assisted dimensions", actor: "designer", requiresProof: true });
    Object.assign(data.stage.operational!.clientFurnitureRequest!, { hasFurniture: true, needsAssistance: true });
    vi.spyOn(apiClient, "get").mockResolvedValue([{ id: "uom-count", name: "Number", code: "nos", decimalScale: 0 }]);
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 9 }); setup(data); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Submit assisted dimensions" }));
    await user.type(screen.getByRole("textbox", { name: "Item name in Living room" }), "Chairs");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit for item 1" }), "uom-count");
    await user.selectOptions(screen.getByRole("combobox", { name: "Measurement type for item 1" }), "count");
    await user.type(screen.getByRole("textbox", { name: "Count for item 1" }), "4");
    expect(screen.queryByRole("checkbox", { name: /I have checked and confirm/ })).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Attach the required evidence"); expect(post).not.toHaveBeenCalled();
    await user.upload(screen.getByLabelText("Furniture dimensions evidence", { exact: false }), new File(["dimensions"], "furniture.pdf", { type: "application/pdf" }));
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(post.mock.calls[0]![1].get("data")));
    expect(body).toEqual({ rooms: [{ roomId: "living", items: [{ id: expect.any(String), name: "Chairs", uomId: "uom-count", measurementType: "count", quantity: 4 }] }] });
    expect(await screen.findByText("Dimensions submitted for Client approval.")).toBeVisible();
  });
  it("preserves choices while rejecting submission from a stale workflow and returns focus on cancel", async () => {
    const post = vi.spyOn(apiClient, "post"); const { workflow, stage, rerender } = setup(); const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Confirm existing furniture" }); await user.click(trigger);
    await user.selectOptions(screen.getByRole("combobox", { name: "Do you have existing furniture?" }), "false");
    rerender(<WorkflowStageActions workflow={workflow} stage={{ ...stage, operational: { ...stage.operational!, version: 9 } }} presentation="client" />);
    expect(screen.getByRole("alert")).toHaveTextContent("request changed");
    expect(screen.getByRole("combobox", { name: "Do you have existing furniture?" })).toHaveValue("false");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm existing furniture" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form")); expect(post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

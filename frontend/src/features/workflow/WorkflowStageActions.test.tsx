import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { WorkflowStageActions } from "./WorkflowStageActions";
import { performDesignWorkflowAction, projectWorkflowKeys, type DesignWorkflowAction, type DesignWorkflowStage, type DesignWorkflowView } from "./projectWorkflowApi";

const acknowledgementLabel = "I acknowledge that the design flow has been handed over to me after initial payment.";

function fixture(action?: DesignWorkflowAction) {
  const stage: DesignWorkflowStage = {
    id: "project-a:keys", type: "key_collection", name: "Key Collection", order: 2,
    dependencyStageIds: [], status: "in_progress", progress: 0, deadlineAt: null, deadlineTaskId: null, tasks: [],
    operational: {
      status: "in_progress", version: 4, availableActions: action ? [action] : [],
      timing: { state: "not_applicable", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
      blockingReasons: [], facts: [], history: [],
      rooms: [{ id: "room-bedroom", name: "Bedroom", required: true, hasDimensions: false, canProceed: false }, { id: "room-living", name: "Living room", required: true, hasDimensions: false, canProceed: false }]
    }
  };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-09-11T09:00:00.000Z", projectStages: [stage], floors: [], furnitureRooms: [{ id: "room-bedroom", name: "Bedroom" }, { id: "room-living", name: "Living room" }], measurementDesigners: [{ id: "designer-b", name: "Assigned Designer B" }] };
  return { stage, workflow };
}

function setup(action?: DesignWorkflowAction, expandKickoff = false) {
  const data = fixture(action);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<WorkflowStageActions {...data} expandKickoff={expandKickoff} />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { ...view, ...data, client };
}

describe("WorkflowStageActions", () => {
  it("keeps the kickoff control visible with the backend payment prerequisite", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    setup({ id: "internal_kickoff_complete", label: "Complete Internal Kick off and save", actor: "designer", requiresProof: true, disabledReason: "Awaiting initial payment received confirmation." }, true);
    const button = screen.getByRole("button", { name: "Complete Internal Kick off and save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Awaiting initial payment received confirmation.");
    expect(screen.getByText("Awaiting initial payment received confirmation.")).toBeVisible();
    await userEvent.setup().click(button);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("opens enabled kickoff acknowledgement directly and lets the Designer cancel and reopen it", async () => {
    setup({ id: "internal_kickoff_complete", label: "Complete Internal Kick off and save", actor: "designer", requiresProof: true }, true);
    expect(screen.getByRole("checkbox", { name: acknowledgementLabel })).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete and save Internal Kick off" })).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Complete Internal Kick off and save" }));
    expect(screen.getByRole("form", { name: "Complete Internal Kick off and save" })).toBeVisible();
  });

  it("blocks an already open form when the backend disables its action without changing the workflow version", async () => {
    const action: DesignWorkflowAction = { id: "internal_kickoff_complete", label: "Complete Internal Kick off and save", actor: "designer", requiresProof: true };
    const post = vi.spyOn(apiClient, "postMultipartWithProgress");
    const { workflow, stage, rerender } = setup(action, true);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Note" }), "Preserve the handover details");
    rerender(<WorkflowStageActions expandKickoff workflow={workflow} stage={{ ...stage, operational: { ...stage.operational!, availableActions: [{ ...action, disabledReason: "Awaiting initial payment received confirmation." }] } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Awaiting initial payment received confirmation.");
    expect(screen.getByRole("button", { name: "Complete and save Internal Kick off" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Preserve the handover details");
    fireEvent.submit(screen.getByRole("form", { name: action.label }));
    expect(post).not.toHaveBeenCalled();
  });

  it("renders no action button without an authoritative capability", () => {
    setup();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("records the same Client handover without representative proof and refreshes dependent data", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    const { client } = setup({ id: "keys_handed_over", label: "Mark keys handed over", actor: "client", requiresProof: false });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Mark keys handed over" }));
    expect(screen.queryByLabelText(/proof/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark keys handed over" }));
    await screen.findByText("Action recorded. The project workflow has been updated.");
    expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", expect.objectContaining({ expectedVersion: 4, stageId: "project-a:keys", action: "keys_handed_over", idempotencyKey: expect.any(String) }), { showGlobalLoader: false });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.all });
  });

  it("keeps representative evidence upload busy through persistence and prevents duplicate actions", async () => {
    let resolve!: (value: { version: number }) => void;
    let updateProgress!: (percent: number) => void;
    const pending = new Promise<{ version: number }>((done) => { resolve = done; });
    const upload = vi.spyOn(apiClient, "postMultipartWithProgress").mockImplementation(async <T,>(_path: string, _data: FormData, progress: (percent: number) => void): Promise<T> => { updateProgress = progress; return await pending as T; });
    const user = userEvent.setup();
    setup({ id: "keys_handed_over", label: "Mark keys handed over", actor: "client", requiresProof: true });
    await user.click(screen.getByRole("button", { name: "Mark keys handed over" }));
    expect(screen.getByLabelText(/Client action proof/)).toBeRequired();
    await user.upload(screen.getByLabelText(/Client action proof/), new File(["proof"], "handover.pdf", { type: "application/pdf" }));
    const form = screen.getByRole("form", { name: "Mark keys handed over" });
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    act(() => updateProgress(100));
    expect(screen.getByText("Saving action and evidence…")).toBeVisible();
    expect(screen.getByRole("button", { name: /Mark keys handed over/ })).toBeDisabled();
    const data = upload.mock.calls[0]![1];
    expect(data.get("stageId")).toBe("project-a:keys");
    expect(data.get("file")).toBeInstanceOf(File);
    await act(async () => resolve({ version: 5 }));
    await screen.findByText("Action recorded. The project workflow has been updated.");
  });

  it("blocks a form whose server workflow version changed while it was open", async () => {
    const post = vi.spyOn(apiClient, "post");
    const user = userEvent.setup();
    const { workflow, stage, rerender } = setup({ id: "keys_received", label: "Mark keys received", actor: "designer", requiresProof: false });
    await user.click(screen.getByRole("button", { name: "Mark keys received" }));
    rerender(<WorkflowStageActions workflow={workflow} stage={{ ...stage, operational: { ...stage.operational!, version: 5 } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed");
    fireEvent.submit(screen.getByRole("form", { name: "Mark keys received" }));
    expect(post).not.toHaveBeenCalled();
  });

  it("sends only the selected persisted room IDs when Client permits work to proceed", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    setup({ id: "furniture_proceed", label: "Allow selected rooms to proceed", actor: "client", requiresProof: false });
    await user.click(screen.getByRole("button", { name: "Allow selected rooms to proceed" }));
    await user.click(screen.getByRole("checkbox", { name: "Bedroom" }));
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "Proceed with Bedroom while the remaining dimensions are collected.");
    await user.click(screen.getByRole("button", { name: "Allow selected rooms to proceed" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).toEqual(expect.objectContaining({ data: { roomIds: ["room-bedroom"] } }));
  });

  it("records an explicit no-furniture declaration without inventing a room", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    setup({ id: "furniture_scope", label: "Set furniture requirement", actor: "designer", requiresProof: false });
    await user.click(screen.getByRole("button", { name: "Set furniture requirement" }));
    await user.click(screen.getByRole("checkbox", { name: "No existing furniture dimensions are needed" }));
    await user.click(screen.getByRole("button", { name: "Set furniture requirement" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).toEqual(expect.objectContaining({ data: { rooms: [], notApplicable: true } }));
  });

  it("declares applicability for every canonical room, including rooms without existing furniture", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    setup({ id: "furniture_scope", label: "Set furniture requirement", actor: "designer", requiresProof: false });
    await user.click(screen.getByRole("button", { name: "Set furniture requirement" }));
    await user.click(screen.getByRole("checkbox", { name: "Bedroom" }));
    await user.click(screen.getByRole("button", { name: "Set furniture requirement" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).toEqual(expect.objectContaining({ data: { rooms: [{ id: "room-bedroom", required: true }, { id: "room-living", required: false }], notApplicable: false } }));
  });

  it("requires assignment from the supplied project design team and provides accessible controls", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    setup({ id: "measurement_assign", label: "Assign measurement taker", actor: "designer", requiresProof: false });
    await user.click(screen.getByRole("button", { name: "Assign measurement taker" }));
    const select = screen.getByRole("combobox", { name: "Measurement taker" });
    expect(within(select).getAllByRole("option")).toHaveLength(2);
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.selectOptions(select, "designer-b");
    await user.click(screen.getByRole("button", { name: "Assign measurement taker" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).toEqual(expect.objectContaining({ data: { designerId: "designer-b" } }));
  });

  it("requires a reason before Client stops the entire workflow clock", async () => {
    const post = vi.spyOn(apiClient, "post");
    const user = userEvent.setup();
    setup({ id: "measurement_access_block", label: "Report site access unavailable", actor: "client", requiresProof: false });
    await user.click(screen.getByRole("button", { name: "Report site access unavailable" }));
    fireEvent.submit(screen.getByRole("form", { name: "Report site access unavailable" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add a reason");
    expect(post).not.toHaveBeenCalled();
  });

  it("shows immutable actor history with representation and authenticated evidence access", async () => {
    const data = fixture();
    data.stage.operational!.history = [{ id: "event-client", action: "keys_handed_over", actorName: "Sales Manager A", actorRole: "admin", onBehalfOfClient: true, at: "2026-09-11T09:00:00.000Z", note: "Client confirmed key handover.", proofAvailable: true }];
    render(<WorkflowStageActions {...data} />);
    await userEvent.setup().click(screen.getByText("Action history"));
    expect(screen.getByText(/Sales Manager A.*On behalf of Client/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Download evidence" })).toBeVisible();
  });

  it("requires explicit design receipt acknowledgement, meeting and signed evidence before the Designer completes kickoff", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    setup({ id: "internal_kickoff_complete", label: "Complete Internal Kick off", actor: "designer", requiresProof: false });
    await user.click(screen.getByRole("button", { name: "Complete Internal Kick off" }));
    const checkbox = screen.getByRole("checkbox", { name: acknowledgementLabel });
    const save = screen.getByRole("button", { name: "Complete and save Internal Kick off" });
    expect(checkbox).toBeRequired();
    expect(save).toBeDisabled();
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Acknowledge receipt of the design flow");
    expect(post).not.toHaveBeenCalled();
    await user.click(checkbox);
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the required evidence file");
    await user.upload(screen.getByLabelText(/Signed kick-off checklist/), new File(["checklist"], "checklist.pdf", { type: "application/pdf" }));
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the meeting date and time");
    fireEvent.change(screen.getByLabelText(/Meeting conducted at/), { target: { value: "2026-09-11T12:30" } });
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const payload = post.mock.calls[0]![1];
    expect(payload.get("action")).toBe("internal_kickoff_complete");
    expect(JSON.parse(payload.get("data") as string)).toEqual({ designHandoverAcknowledged: true, meetingAt: new Date("2026-09-11T12:30").toISOString() });
    expect(payload.get("file")).toBeInstanceOf(File);
  });

  it("lets the Designer acknowledge and save receipt when no Design Manager is assigned", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    const { workflow } = setup({ id: "internal_kickoff_complete", label: "Complete Internal Kick off", actor: "designer", requiresProof: false });
    expect(workflow).not.toHaveProperty("kickoffManager");
    await user.click(screen.getByRole("button", { name: "Complete Internal Kick off" }));
    expect(screen.getByText("Design handover acknowledgement")).toBeVisible();
    expect(screen.queryByText(/Design Manager/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: acknowledgementLabel }));
    fireEvent.change(screen.getByLabelText(/Meeting conducted at/), { target: { value: "2026-09-11T12:30" } });
    await user.upload(screen.getByLabelText(/Signed kick-off checklist/), new File(["checklist"], "checklist.pdf", { type: "application/pdf" }));
    expect(screen.getByRole("button", { name: "Complete and save Internal Kick off" })).toBeEnabled();
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(JSON.parse(post.mock.calls[0]![1].get("data") as string)).toEqual({ designHandoverAcknowledged: true, meetingAt: new Date("2026-09-11T12:30").toISOString() });
  });

  it("preserves the receipt acknowledgement draft when unrelated manager metadata changes", async () => {
    const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 5 });
    const user = userEvent.setup();
    const { workflow, stage, rerender } = setup({ id: "internal_kickoff_complete", label: "Complete Internal Kick off", actor: "designer", requiresProof: false });
    const firstLegacyWorkflow = { ...workflow, kickoffManager: { id: "manager-a", name: "Design Manager A" } };
    rerender(<WorkflowStageActions workflow={firstLegacyWorkflow} stage={stage} />);
    await user.click(screen.getByRole("button", { name: "Complete Internal Kick off" }));
    await user.click(screen.getByRole("checkbox", { name: acknowledgementLabel }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "I received the design flow after payment.");
    fireEvent.change(screen.getByLabelText(/Meeting conducted at/), { target: { value: "2026-09-11T12:30" } });
    await user.upload(screen.getByLabelText(/Signed kick-off checklist/), new File(["checklist"], "receipt.pdf", { type: "application/pdf" }));
    const secondLegacyWorkflow = { ...workflow, kickoffManager: { id: "manager-b", name: "Design Manager B" } };
    rerender(<WorkflowStageActions workflow={secondLegacyWorkflow} stage={stage} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: acknowledgementLabel })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("I received the design flow after payment.");
    expect(screen.getByLabelText(/Meeting conducted at/)).toHaveValue("2026-09-11T12:30");
    expect((screen.getByLabelText(/Signed kick-off checklist/) as HTMLInputElement).files?.[0]?.name).toBe("receipt.pdf");
    expect(screen.getByRole("button", { name: "Complete and save Internal Kick off" })).toBeEnabled();
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(JSON.parse(post.mock.calls[0]![1].get("data") as string)).toEqual({ designHandoverAcknowledged: true, meetingAt: new Date("2026-09-11T12:30").toISOString() });
  });
});

it("serializes evidence and versioned action data using the protected multipart endpoint", async () => {
  const post = vi.spyOn(apiClient, "postMultipartWithProgress").mockResolvedValue({ version: 8 });
  await performDesignWorkflowAction({ projectId: "project/a", stageId: "stage:b", expectedVersion: 7, action: "measurement_complete", idempotencyKey: "measurement-confirmed-1", data: { mediaFolderUrl: "https://example.com/site" }, note: "Checked on site", file: new File(["sketch"], "sketch.pdf", { type: "application/pdf" }) });
  expect(post.mock.calls[0]![0]).toBe("/projects/project%2Fa/design-workflow/actions");
  const body = post.mock.calls[0]![1];
  expect(body.get("expectedVersion")).toBe("7");
  expect(JSON.parse(body.get("data") as string)).toEqual({ mediaFolderUrl: "https://example.com/site" });
  expect(body.get("note")).toBe("Checked on site");
});

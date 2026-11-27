import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXECUTION_CHOICE_OPTIONS, type ExecutionChoiceOptionId, type ExecutionChoiceView } from "../../../../shared/projects/executionChoice";
import type { Role } from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { ProjectExecutionChoice } from "./ProjectExecutionChoice";
import * as api from "./projectWorkflowApi";
import type { DesignWorkflowView } from "./projectWorkflowApi";

const access = vi.hoisted(() => ({ id: "client-one", role: "client" as Role, session: "session-one", canAct: true }));
const refresh = vi.hoisted(() => vi.fn<() => Promise<unknown[]>>());
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: access.id, role: access.role }, reviewSession: { id: access.session }, authorization: authorizationFor(access.role, access.canAct ? ["projects.design_workflow.act"] : []) }) }));
vi.mock("./useRefreshDesignWorkflow", () => ({ useRefreshDesignWorkflow: () => refresh }));

const initial: DesignWorkflowView = {
  projectId: "project-one", projectName: "Courtyard Home", serverNow: "2026-11-27T08:00:00.000Z", floors: [],
  executionChoice: { status: "available", version: 7, canSelect: true, blockingReason: null, keyCollectionStageId: "project-one:keys", options: EXECUTION_CHOICE_OPTIONS, selection: null }
};

function renderWithQuery(element: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(element, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
}

function locked(optionId: ExecutionChoiceOptionId = "option_1"): DesignWorkflowView {
  const option = EXECUTION_CHOICE_OPTIONS.find(row => row.id === optionId)!;
  return { ...initial, executionChoice: { ...initial.executionChoice!, version: 8, status: "locked", canSelect: false,
    selection: { optionId, optionLabel: option.label, definitionVersion: 1, phases: option.phases, selectedAt: "2026-11-27T08:05:00.000Z" } } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  access.id = "client-one"; access.role = "client"; access.session = "session-one"; access.canAct = true;
  refresh.mockReset().mockResolvedValue([]);
});

describe("ProjectExecutionChoice", () => {
  it("starts unselected and describes the exact two different phase orders", () => {
    renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={vi.fn()} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    radios.forEach(radio => expect(radio).not.toBeChecked());
    expect(radios[0]).toHaveAccessibleName("Option 1");
    expect(radios[0]).toHaveAccessibleDescription("2D layout → 3D layout → Selections → Renders → Production");
    expect(radios[1]).toHaveAccessibleDescription("3D layout → Renders → Selections → Production");
    expect(screen.getByRole("button", { name: "Save execution choice" })).toBeDisabled();
  });

  it("does not save on selection or cancelled confirmation and returns keyboard focus", async () => {
    const save = vi.spyOn(api, "saveProjectExecutionChoice");
    const user = userEvent.setup();
    renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Option 2" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    const dialog = screen.getByRole("dialog", { name: "Save execution choice" });
    expect(dialog).toHaveAccessibleDescription("Once saved, this choice cannot be changed or revoked.");
    expect(within(dialog).getByRole("list", { name: "Chosen sequence" })).toHaveTextContent("3D layoutRendersSelectionsProduction");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Go back" })).toHaveFocus());
    await user.click(within(dialog).getByRole("button", { name: "Go back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Option 2" })).toBeChecked();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save execution choice" })).toHaveFocus());
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["option_1", "option_2"] as const)("saves %s only after explicit confirmation and displays the canonical locked result", async optionId => {
    const save = vi.spyOn(api, "saveProjectExecutionChoice").mockResolvedValue({ version: 8 });
    const read = vi.fn().mockResolvedValue(locked(optionId));
    const user = userEvent.setup();
    renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={read} />);
    await user.click(screen.getByRole("radio", { name: optionId === "option_1" ? "Option 1" : "Option 2" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    await user.click(screen.getByRole("button", { name: "Save permanently" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved permanently"));
    expect(save).toHaveBeenCalledWith("project-one", { action: "execution_path_select", expectedVersion: 7, stageId: "project-one:keys", idempotencyKey: expect.any(String), data: { optionId, definitionVersion: 1, acknowledgedIrreversible: true } });
    expect(refresh).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    expect(screen.getByRole("list", { name: "Planned sequence" }).children).toHaveLength(optionId === "option_1" ? 5 : 4);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save|Edit|Revoke|Undo/ })).not.toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-11-27T08:05:00.000Z");
  });

  it("prevents duplicate submits synchronously while a save is pending", async () => {
    const pending = deferred<{ version: number }>();
    const save = vi.spyOn(api, "saveProjectExecutionChoice").mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={vi.fn().mockResolvedValue(locked())} />);
    await user.click(screen.getByRole("radio", { name: "Option 1" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    const button = screen.getByRole("button", { name: "Save permanently" });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Go back" })).toBeDisabled();
    await act(async () => { pending.resolve({ version: 8 }); });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved permanently"));
  });

  it("retries the exact uncertain command and prevents choosing a different option", async () => {
    const save = vi.spyOn(api, "saveProjectExecutionChoice").mockRejectedValueOnce(new TypeError("Network unavailable")).mockResolvedValue({ version: 8 });
    const user = userEvent.setup();
    renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={vi.fn().mockResolvedValue(locked("option_2"))} />);
    await user.click(screen.getByRole("radio", { name: "Option 2" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    await user.click(screen.getByRole("button", { name: "Save permanently" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("save result could not be confirmed");
    screen.getAllByRole("radio").forEach(radio => expect(radio).toBeDisabled());
    expect(screen.getByRole("button", { name: "Save execution choice" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry saved choice" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved permanently"));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  });

  it("resolves an uncertain result by reading the server's locked choice without resubmitting", async () => {
    const save = vi.spyOn(api, "saveProjectExecutionChoice").mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    const user = userEvent.setup();
    renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={vi.fn().mockResolvedValue(locked())} />);
    await user.click(screen.getByRole("radio", { name: "Option 1" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    await user.click(screen.getByRole("button", { name: "Save permanently" }));
    await user.click(await screen.findByRole("button", { name: "Refresh choice" }));
    expect(await screen.findByRole("list", { name: "Planned sequence" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry saved choice" })).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledOnce();
  });

  it("refreshes a conflict and shows the other tab's saved choice", async () => {
    const save = vi.spyOn(api, "saveProjectExecutionChoice").mockRejectedValue(new ApiError(409, "EXECUTION_CHOICE_ALREADY_SELECTED", "Already selected"));
    const user = userEvent.setup();
    renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={vi.fn().mockResolvedValue(locked("option_2"))} />);
    await user.click(screen.getByRole("radio", { name: "Option 1" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    await user.click(screen.getByRole("button", { name: "Save permanently" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Option 2 · Saved permanently"));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledOnce();
  });

  it("requires renewed confirmation after a version conflict without a saved choice", async () => {
    const save = vi.spyOn(api, "saveProjectExecutionChoice").mockRejectedValueOnce(new ApiError(409, "WORKFLOW_VERSION_CONFLICT", "Changed")).mockResolvedValue({ version: 10 });
    const updated = { ...initial, executionChoice: { ...initial.executionChoice!, version: 9 } };
    const read = vi.fn().mockResolvedValue(updated);
    const user = userEvent.setup();
    const view = renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={read} />);
    await user.click(screen.getByRole("radio", { name: "Option 1" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    await user.click(screen.getByRole("button", { name: "Save permanently" }));
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    view.rerender(<ProjectExecutionChoice workflow={updated} onRefresh={read} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    read.mockResolvedValue(locked());
    await user.click(screen.getByRole("button", { name: "Save permanently" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![1].expectedVersion).toBe(9);
    expect(save.mock.calls[1]![1].idempotencyKey).not.toBe(save.mock.calls[0]![1].idempotencyKey);
  });

  it("keeps a successful save locked when invalidation or canonical refresh fails without inventing a timestamp", async () => {
    vi.spyOn(api, "saveProjectExecutionChoice").mockResolvedValue({ version: 8 });
    refresh.mockRejectedValueOnce(new Error("Refresh failed"));
    const read = vi.fn().mockResolvedValue(null);
    const user = userEvent.setup();
    renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={read} />);
    await user.click(screen.getByRole("radio", { name: "Option 1" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    await user.click(screen.getByRole("button", { name: "Save permanently" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your choice was saved permanently");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
    read.mockResolvedValue(locked());
    await user.click(screen.getByRole("button", { name: "Refresh choice" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved permanently"));
    expect(document.querySelector("time")).toBeInTheDocument();
  });

  it("disables an open confirmation when the workflow version changes", async () => {
    const save = vi.spyOn(api, "saveProjectExecutionChoice");
    const user = userEvent.setup();
    const view = renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Option 1" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    view.rerender(<ProjectExecutionChoice workflow={{ ...initial, executionChoice: { ...initial.executionChoice!, version: 8 } }} onRefresh={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("workflow changed");
    expect(screen.getByRole("button", { name: "Save permanently" })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["designer", "admin", "super_admin"] as const)("keeps %s read-only even if a malformed capability grants selection", role => {
    access.role = role;
    renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Awaiting Client selection");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it.each(["waiting_for_keys", "unavailable"] as const)("shows a read-only %s state", status => {
    renderWithQuery(<ProjectExecutionChoice workflow={{ ...initial, executionChoice: { ...initial.executionChoice!, status, canSelect: false, blockingReason: status === "unavailable" ? "Workflow evidence is unavailable." : null } }} onRefresh={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(status === "waiting_for_keys" ? "Available after you and your Designer confirm key collection" : "Workflow evidence is unavailable");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it.each([undefined, { ...initial.executionChoice!, version: -1 }, { ...initial.executionChoice!, options: [] }])("fails closed for a missing or unsupported projection", executionChoice => {
    renderWithQuery(<ProjectExecutionChoice workflow={{ ...initial, executionChoice: executionChoice as ExecutionChoiceView | undefined }} onRefresh={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Execution choice is unavailable");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("disables saving during a background refresh error", () => {
    renderWithQuery(<ProjectExecutionChoice workflow={initial} refreshError onRefresh={vi.fn()} />);
    screen.getAllByRole("radio").forEach(radio => expect(radio).toBeDisabled());
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh before saving");
  });

  it.each(["project", "identity", "session"] as const)("clears drafts and confirmation when the %s changes", async change => {
    const user = userEvent.setup();
    const view = renderWithQuery(<ProjectExecutionChoice workflow={initial} onRefresh={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Option 1" }));
    await user.click(screen.getByRole("button", { name: "Save execution choice" }));
    if (change === "identity") access.id = "client-two";
    if (change === "session") access.session = "session-two";
    view.rerender(<ProjectExecutionChoice workflow={change === "project" ? { ...initial, projectId: "project-two" } : initial} onRefresh={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    screen.getAllByRole("radio").forEach(radio => expect(radio).not.toBeChecked());
  });
});

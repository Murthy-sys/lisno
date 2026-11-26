import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { renderWithQuery } from "../../test/render";
import { authorizationFor } from "../../test/authFixtures";
import * as workflowApi from "./projectWorkflowApi";
import type { DesignWorkflowView } from "./projectWorkflowApi";
import { DesignerHandoff, indiaDateTimeToUtc } from "./DesignerHandoff";

const access = vi.hoisted(() => ({ role: "client" as "client" | "super_admin" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "client-one", role: access.role }, authorization: authorizationFor(access.role, ["projects.design_workflow.act"]) }) }));
const initial: DesignWorkflowView = {
  projectId: "project-one", projectName: "Courtyard Home", serverNow: "2026-11-25T09:00:00.000Z", floors: [], estimateApprovalStatus: "approved",
  designerHandoff: { initialEstimateApproved: true, executionAvailable: false, state: "awaiting_client_schedule", designer: { id: "designer-one", name: "Ananya" }, assignmentRevision: "accepted-v2", appointment: null, canSchedule: true, blockers: ["Complete Internal Kickoff.", "Complete Client Kickoff."] },
  projectStages: [{ id: "key-stage", type: "key_collection", name: "Key Collection", order: 3, dependencyStageIds: [], status: "not_started", progress: null, deadlineAt: null, deadlineTaskId: null, tasks: [],
    operational: { status: "not_started", version: 7, availableActions: [], blockingReasons: [], facts: [], history: [], timing: { state: "waiting", startsAt: null, targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 } }
  }]
};
function scheduledWorkflow(): DesignWorkflowView {
  return { ...initial, receivedAt: Date.now(), designerHandoff: { ...initial.designerHandoff!, state: "scheduled", canSchedule: false,
    appointment: { mode: "within_48_hours", confirmedAt: initial.serverNow, originalDeadlineAt: "2026-11-27T09:00:00Z", deadlineAt: "2026-11-27T09:00:00Z",
      receivedAt: null, handedOverAt: null, completedAt: null, remainingMs: 48 * 60 * 60_000, overdue: false }
  } };
}
beforeEach(() => { access.role = "client"; });
afterEach(() => { vi.useRealTimers(); });

describe("DesignerHandoff", () => {
  it("confirms 48 hours before kickoffs with exact assignment and workflow versions", async () => {
    const save = vi.spyOn(workflowApi, "performDesignWorkflowAction").mockResolvedValue({ version: 8 });
    const user = userEvent.setup(); const view = renderWithQuery(<DesignerHandoff workflow={initial} presentation="client" />);
    expect(screen.getByText(/Your designer, Ananya, is assigned/)).toBeVisible();
    expect(screen.getByText("Complete Internal Kickoff.")).toBeVisible(); expect(screen.getByText("Complete Client Kickoff.")).toBeVisible();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm 48-hour window" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ projectId: "project-one", stageId: "key-stage", action: "key_collection_schedule", expectedVersion: 7, idempotencyKey: expect.any(String), data: { mode: "within_48_hours", expectedAssignmentRevision: "accepted-v2" } }));
    expect(await screen.findByText("Key collection time confirmed.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm 48-hour window" })).toBeDisabled();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    view.rerender(<DesignerHandoff workflow={scheduledWorkflow()} presentation="client" />);
    expect(screen.getByRole("timer", { name: "Time until key collection" })).toHaveTextContent("48:00:00 remaining");
  });

  it("does not start a countdown when the 48-hour confirmation fails", async () => {
    vi.spyOn(workflowApi, "performDesignWorkflowAction").mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Please retry."));
    const user = userEvent.setup(); renderWithQuery(<DesignerHandoff workflow={initial} presentation="client" />);
    await user.click(screen.getByRole("button", { name: "Confirm 48-hour window" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry.");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm 48-hour window" })).toBeEnabled();
  });

  it("submits a chosen date explicitly in Asia/Kolkata and rejects past times", async () => {
    const save = vi.spyOn(workflowApi, "performDesignWorkflowAction").mockResolvedValue({ version: 8 });
    const user = userEvent.setup(); renderWithQuery(<DesignerHandoff workflow={initial} presentation="client" />);
    await user.click(screen.getByRole("radio", { name: "Choose date and time" }));
    const input = screen.getByLabelText("Key collection date and time (Asia/Kolkata)");
    fireEvent.change(input, { target: { value: "2026-11-24T14:30" } }); await user.click(screen.getByRole("button", { name: "Confirm date" }));
    expect(screen.getByText("Choose a future date and time in Asia/Kolkata.")).toBeVisible(); expect(save).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "2026-11-28T14:30" } }); await user.click(screen.getByRole("button", { name: "Confirm date" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ data: { mode: "chosen_datetime", scheduledAt: "2026-11-28T09:00:00.000Z", expectedAssignmentRevision: "accepted-v2" } })));
  });

  it("preserves entered time and the same idempotency key after a transport error", async () => {
    const save = vi.spyOn(workflowApi, "performDesignWorkflowAction").mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Please retry."));
    const user = userEvent.setup(); renderWithQuery(<DesignerHandoff workflow={initial} presentation="client" />);
    await user.click(screen.getByRole("radio", { name: "Choose date and time" }));
    const input = screen.getByLabelText("Key collection date and time (Asia/Kolkata)"); fireEvent.change(input, { target: { value: "2026-11-28T14:30" } });
    await user.click(screen.getByRole("button", { name: "Confirm date" })); expect(await screen.findByRole("alert")).toHaveTextContent("Please retry.");
    expect(input).toHaveValue("2026-11-28T14:30"); await user.click(screen.getByRole("button", { name: "Confirm date" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2)); expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
  });

  it("anchors the deadline to server time, retains it on remount and stops on receipt", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const workflow = { ...scheduledWorkflow(), receivedAt: Date.now() - 60 * 60_000 };
    const view = renderWithQuery(<DesignerHandoff workflow={workflow} presentation="designer" />);
    expect(screen.getByRole("timer")).toHaveTextContent("47:00:00 remaining");
    act(() => { vi.advanceTimersByTime(60 * 60_000); }); expect(screen.getByRole("timer")).toHaveTextContent("46:00:00 remaining");
    view.unmount(); const remounted = renderWithQuery(<DesignerHandoff workflow={workflow} presentation="designer" />);
    expect(screen.getByRole("timer")).toHaveTextContent("46:00:00 remaining");
    remounted.rerender(<DesignerHandoff workflow={{ ...workflow, designerHandoff: { ...workflow.designerHandoff!, state: "received", appointment: { ...workflow.designerHandoff!.appointment!, receivedAt: "2026-11-25T11:00:00Z" } } }} presentation="designer" />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument(); expect(screen.getByText(/Designer has received the keys/)).toBeVisible();
  });

  it.each(["client", "designer"] as const)("ticks every second in the %s view with total hours and quiet timer semantics", presentation => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(initial.serverNow));
    renderWithQuery(<DesignerHandoff workflow={scheduledWorkflow()} presentation={presentation} />);
    const timer = screen.getByRole("timer", { name: "Time until key collection" });
    expect(timer).toHaveAttribute("aria-live", "off");
    expect(timer).toHaveTextContent("48:00:00 remaining");
    act(() => { vi.advanceTimersByTime(1000); }); expect(timer).toHaveTextContent("47:59:59 remaining");
    act(() => { vi.advanceTimersByTime(1000); }); expect(timer).toHaveTextContent("47:59:58 remaining");
    act(() => { vi.advanceTimersByTime(59_000); }); expect(timer).toHaveTextContent("47:58:59 remaining");
    expect(screen.getByText("Complete Internal Kickoff.")).toBeVisible();
    expect(screen.getByText("Complete Client Kickoff.")).toBeVisible();
  });

  it("reanchors refreshed workflow time without resetting the saved deadline and cleans up its interval", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const setInterval = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const workflow = scheduledWorkflow();
    const view = renderWithQuery(<DesignerHandoff workflow={workflow} presentation="client" />);
    const originalInterval = setInterval.mock.results.at(-1)!.value;
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole("timer")).toHaveTextContent("47:59:58 remaining");
    view.rerender(<DesignerHandoff workflow={{ ...workflow, serverNow: "2026-11-25T10:15:30Z", receivedAt: Date.now() }} presentation="client" />);
    expect(screen.getByRole("timer")).toHaveTextContent("46:44:30 remaining");
    expect(screen.getByRole("timer")).toHaveAttribute("datetime", workflow.designerHandoff!.appointment!.deadlineAt);
    expect(clearInterval).toHaveBeenCalledWith(originalInterval);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("timer")).toHaveTextContent("46:44:29 remaining");
    const refreshedInterval = setInterval.mock.results.at(-1)!.value;
    view.unmount(); expect(clearInterval).toHaveBeenCalledWith(refreshedInterval);
    setInterval.mockRestore(); clearInterval.mockRestore();
  });

  it("accounts for elapsed time when a background tab misses ticks", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(initial.serverNow));
    const workflow = scheduledWorkflow();
    renderWithQuery(<DesignerHandoff workflow={workflow} presentation="designer" />);
    act(() => { vi.setSystemTime(new Date(Date.now() + 5 * 60 * 60_000)); vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("timer")).toHaveTextContent("42:59:59 remaining");
    expect(screen.getByRole("timer")).toHaveAttribute("datetime", workflow.designerHandoff!.appointment!.deadlineAt);
  });

  it("changes from the last second through due now into an increasing overdue clock", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(initial.serverNow));
    const workflow = { ...scheduledWorkflow(), serverNow: "2026-11-27T08:59:59Z" };
    renderWithQuery(<DesignerHandoff workflow={workflow} presentation="client" />);
    expect(screen.getByRole("timer", { name: "Time until key collection" })).toHaveTextContent("00:00:01 remaining");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("timer", { name: "Key collection due now" })).toHaveTextContent("00:00:00 · Due now");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("timer", { name: "Key collection overdue" })).toHaveTextContent("Overdue by 00:00:01");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("timer")).toHaveTextContent("Overdue by 00:00:02");
  });

  it("uses the saved chosen date beyond 48 hours and suppresses the timer after completion", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(initial.serverNow));
    const workflow = scheduledWorkflow();
    workflow.designerHandoff!.appointment = { ...workflow.designerHandoff!.appointment!, mode: "chosen_datetime", deadlineAt: "2026-11-28T11:04:05Z", originalDeadlineAt: "2026-11-28T11:04:05Z" };
    const view = renderWithQuery(<DesignerHandoff workflow={workflow} presentation="client" />);
    expect(screen.getByRole("timer")).toHaveTextContent("74:04:05 remaining");
    expect(screen.getByRole("timer")).toHaveAttribute("datetime", "2026-11-28T11:04:05Z");
    view.rerender(<DesignerHandoff workflow={{ ...workflow, designerHandoff: { ...workflow.designerHandoff!, state: "completed", appointment: { ...workflow.designerHandoff!.appointment!, completedAt: initial.serverNow } } }} presentation="client" />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Designer handoff" })).getByRole("status")).toHaveTextContent("Key collection completed.");
  });

  it.each(["deadline", "server clock", "appointment"])("shows unavailable timing rather than a fabricated countdown for invalid %s", invalid => {
    const workflow = scheduledWorkflow();
    if (invalid === "deadline") workflow.designerHandoff!.appointment!.deadlineAt = "invalid";
    if (invalid === "server clock") workflow.serverNow = "invalid";
    if (invalid === "appointment") workflow.designerHandoff!.appointment = null;
    renderWithQuery(<DesignerHandoff workflow={workflow} presentation="designer" />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Designer handoff" })).getByRole("status")).toHaveTextContent("The collection deadline is unavailable.");
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });

  it("shows pending and missing assignment states distinctly and prevents on-behalf scheduling", () => {
    access.role = "super_admin";
    const view = renderWithQuery(<DesignerHandoff workflow={initial} presentation="client" />);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    view.rerender(<DesignerHandoff workflow={{ ...initial, designerHandoff: { ...initial.designerHandoff!, state: "awaiting_designer", designer: null, canSchedule: false } }} presentation="client" />);
    expect(screen.getByText("Your estimate is approved. We’ll assign your designer soon.")).toBeVisible();
    view.rerender(<DesignerHandoff workflow={{ ...initial, designerHandoff: undefined }} presentation="client" />);
    expect(screen.queryByText(/assign your designer soon/)).not.toBeInTheDocument(); expect(screen.getByText(/assignment details are unavailable/)).toBeVisible();
  });

  it("converts India calendar time without using the browser timezone or normalizing invalid dates", () => {
    expect(indiaDateTimeToUtc("2026-12-01T09:30")).toBe("2026-12-01T04:00:00.000Z");
    expect(indiaDateTimeToUtc("2026-02-30T09:30")).toBeNull(); expect(indiaDateTimeToUtc("not-a-date")).toBeNull();
  });
});

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectWorkflowProgress } from "./ProjectWorkflowProgress";
import type { DesignStageOperational, DesignWorkflowStage, DesignWorkflowTask, DesignWorkflowView } from "./projectWorkflowApi";

const serverNow = "2026-09-11T09:00:00.000Z";

function task(overrides: Partial<DesignWorkflowTask> = {}): DesignWorkflowTask {
  return {
    id: "task-layout", title: "Review the living room layout", description: "Check the saved furniture dimensions and circulation space.",
    status: "in_progress", progress: 40, order: 1, ownerName: "Maya Designer",
    plannedStartAt: "2026-09-10T09:00:00.000Z", originalDeadlineAt: "2026-09-12T09:00:00.000Z",
    currentDeadlineAt: "2026-09-13T09:00:00.000Z", completedAt: null,
    dependencyTaskIds: [], blockedByTaskIds: [],
    risk: { level: "yellow", reason: "Progress is behind the saved task schedule.", elapsedRatio: 0.5, progressRatio: 0.4 },
    ...overrides
  };
}

function stage(overrides: Partial<DesignWorkflowStage> = {}): DesignWorkflowStage {
  return {
    id: "stage-layout", name: "Space planning with tentative look and feel", type: "floor_plan", order: 1,
    dependencyStageIds: [], status: "in_progress", progress: 40,
    deadlineAt: "2026-09-13T09:00:00.000Z", deadlineTaskId: "task-layout", tasks: [task()],
    ...overrides
  };
}

function workflow(stages: DesignWorkflowStage[] = [stage()]): DesignWorkflowView {
  return {
    projectId: "project-example", projectName: "Courtyard residence", serverNow,
    floors: [{ id: "floor-ground", name: "Ground floor", number: "0", order: 1, stages }]
  };
}

function operational(timing: Partial<DesignStageOperational["timing"]> = {}, fields: Partial<Omit<DesignStageOperational, "timing">> = {}): DesignStageOperational {
  return {
    status: "in_progress", version: 2, availableActions: [], blockingReasons: [], facts: [], history: [],
    timing: {
      state: "running", startsAt: "2026-09-11T08:00:00.000Z", targetAt: "2026-09-11T10:00:00.000Z",
      originalTargetAt: "2026-09-11T10:00:00.000Z", endsAt: null, remainingMs: 3_600_000,
      band: "Green", clockOwner: "Designer", designerElapsedMs: 3_600_000, clientElapsedMs: 0,
      ...timing
    },
    ...fields
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  // The browser clock deliberately differs from server time by several years.
  vi.setSystemTime(new Date("2030-01-02T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

function user() {
  return userEvent.setup();
}

describe("ProjectWorkflowProgress", () => {
  describe.each([32_400_000, 1_296_000_000])("with a %s millisecond allowance", (slaAllowanceMs) => {
    it.each([
      [slaAllowanceMs + 1, "comfortable", "More than two thirds of the allowed time remaining."],
      [slaAllowanceMs, "comfortable", "More than two thirds of the allowed time remaining."],
      [slaAllowanceMs * 2 / 3 + 1, "comfortable", "More than two thirds of the allowed time remaining."],
      [slaAllowanceMs * 2 / 3, "approaching", "Between one third and two thirds of the allowed time remaining."],
      [slaAllowanceMs / 3 + 1, "approaching", "Between one third and two thirds of the allowed time remaining."],
      [slaAllowanceMs / 3, "urgent", "One third or less of the allowed time remaining."],
      [0, "urgent", "One third or less of the allowed time remaining."],
      [-1_000, "urgent", "One third or less of the allowed time remaining."]
    ] as const)("uses proportional urgency at %s remaining milliseconds", (remainingMs, urgency, description) => {
      render(<ProjectWorkflowProgress workflow={workflow([stage({ operational: operational({ slaAllowanceMs, remainingMs, band: "Amber" }) })])} />);
      const timer = screen.getByRole("timer");
      expect(timer.closest(".workflow-progress__deadline")).toHaveAttribute("data-urgency", urgency);
      expect(timer).toHaveAccessibleDescription(description);
      if (remainingMs <= 0) expect(timer).toHaveTextContent("00:00:00");
    });
  });

  it("changes relative urgency as the running timer crosses both thirds", () => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ operational: operational({ slaAllowanceMs: 9_000, remainingMs: 7_000 }) })])} />);
    const timer = screen.getByRole("timer");
    const deadline = timer.closest(".workflow-progress__deadline");
    expect(deadline).toHaveAttribute("data-urgency", "comfortable");
    act(() => vi.advanceTimersByTime(1_000));
    expect(timer).toHaveTextContent("00:00:06");
    expect(deadline).toHaveAttribute("data-urgency", "approaching");
    expect(timer).toHaveAccessibleDescription("Between one third and two thirds of the allowed time remaining.");
    act(() => vi.advanceTimersByTime(3_000));
    expect(timer).toHaveTextContent("00:00:03");
    expect(deadline).toHaveAttribute("data-urgency", "urgent");
    expect(timer).toHaveAccessibleDescription("One third or less of the allowed time remaining.");
  });

  it("keeps paused thirds fixed and recalculates urgency when the allowance or remaining time refreshes", () => {
    const paused = (slaAllowanceMs: number, remainingMs = 5_000) => ({
      ...workflow([stage({ operational: operational({ state: "paused", slaAllowanceMs, remainingMs }) })]),
      receivedAt: Date.now()
    });
    const { rerender } = render(<ProjectWorkflowProgress workflow={paused(6_000)} />);
    const timer = screen.getByRole("timer");
    const deadline = timer.closest(".workflow-progress__deadline");
    expect(deadline).toHaveAttribute("data-urgency", "comfortable");
    act(() => vi.advanceTimersByTime(60_000));
    expect(timer).toHaveTextContent("00:00:05");
    expect(deadline).toHaveAttribute("data-urgency", "comfortable");
    rerender(<ProjectWorkflowProgress workflow={paused(9_000)} />);
    expect(deadline).toHaveAttribute("data-urgency", "approaching");
    rerender(<ProjectWorkflowProgress workflow={paused(15_000)} />);
    expect(deadline).toHaveAttribute("data-urgency", "urgent");
    rerender(<ProjectWorkflowProgress workflow={paused(15_000, 12_000)} />);
    expect(deadline).toHaveAttribute("data-urgency", "comfortable");
    expect(timer).toHaveAccessibleDescription("More than two thirds of the allowed time remaining.");
    expect(screen.getByText("Paused")).toBeVisible();
  });

  describe.each([undefined, null, 0, -9_000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("with invalid allowance %s", (slaAllowanceMs) => {
    it.each([
      [172_800_001, "comfortable", "More than 2 days remaining."],
      [172_800_000, "approaching", "1 to 2 days remaining."],
      [86_400_000, "approaching", "1 to 2 days remaining."],
      [86_399_999, "urgent", "Less than 1 day remaining."]
    ] as const)("preserves fixed urgency at %s remaining milliseconds", (remainingMs, urgency, description) => {
      render(<ProjectWorkflowProgress workflow={workflow([stage({ operational: operational({ slaAllowanceMs, remainingMs }) })])} />);
      const timer = screen.getByRole("timer");
      expect(timer.closest(".workflow-progress__deadline")).toHaveAttribute("data-urgency", urgency);
      expect(timer).toHaveAccessibleDescription(description);
    });
  });

  it.each([
    [172_800_001, "comfortable", "More than 2 days remaining."],
    [172_800_000, "approaching", "1 to 2 days remaining."],
    [86_400_000, "approaching", "1 to 2 days remaining."],
    [86_399_999, "urgent", "Less than 1 day remaining."],
    [0, "urgent", "Less than 1 day remaining."],
    [-1_000, "urgent", "Less than 1 day remaining."]
  ] as const)("shows countdown urgency for %s remaining milliseconds without changing the backend band", (remainingMs, urgency, description) => {
    const targetAt = new Date(Date.parse(serverNow) + remainingMs).toISOString();
    render(<ProjectWorkflowProgress workflow={workflow([stage({ operational: operational({ remainingMs, targetAt, band: "Amber" }) })])} />);
    const timer = screen.getByRole("timer");
    expect(timer.closest(".workflow-progress__deadline")).toHaveAttribute("data-urgency", urgency);
    expect(timer).toHaveAccessibleDescription(description);
    if (remainingMs <= 0) expect(timer).toHaveTextContent("00:00:00");
  });

  it.each(["operational", "legacy"] as const)("updates %s timer urgency when each threshold is crossed", (source) => {
    const targetAt = "2026-09-13T09:00:01.000Z";
    render(<ProjectWorkflowProgress workflow={workflow([stage({ deadlineAt: targetAt, operational: source === "operational" ? operational({ targetAt, remainingMs: 172_801_000 }) : undefined })])} />);
    const timer = screen.getByRole("timer");
    const deadline = timer.closest(".workflow-progress__deadline");
    expect(deadline).toHaveAttribute("data-urgency", "comfortable");
    act(() => vi.advanceTimersByTime(1_000));
    expect(timer).toHaveTextContent("2d 00:00:00");
    expect(deadline).toHaveAttribute("data-urgency", "approaching");
    act(() => vi.advanceTimersByTime(86_400_000));
    expect(timer).toHaveTextContent("1d 00:00:00");
    expect(deadline).toHaveAttribute("data-urgency", "approaching");
    act(() => vi.advanceTimersByTime(1_000));
    expect(timer).toHaveTextContent("23:59:59");
    expect(deadline).toHaveAttribute("data-urgency", "urgent");
    expect(timer).toHaveAccessibleDescription("Less than 1 day remaining.");
  });

  it("keeps paused urgency fixed and derives a refreshed timer color from its new remaining value", () => {
    const paused = (remainingMs: number) => workflow([stage({ operational: operational({ state: "paused", remainingMs }) })]);
    const { rerender } = render(<ProjectWorkflowProgress workflow={paused(172_801_000)} />);
    const timer = screen.getByRole("timer");
    act(() => vi.advanceTimersByTime(259_200_000));
    expect(timer).toHaveTextContent("2d 00:00:01");
    expect(timer.closest(".workflow-progress__deadline")).toHaveAttribute("data-urgency", "comfortable");
    rerender(<ProjectWorkflowProgress workflow={{ ...paused(86_400_000), receivedAt: Date.now() }} />);
    expect(timer.closest(".workflow-progress__deadline")).toHaveAttribute("data-urgency", "approaching");
    act(() => vi.advanceTimersByTime(1_000));
    expect(timer).toHaveTextContent("1d 00:00:00");
    expect(timer.closest(".workflow-progress__deadline")).toHaveAttribute("data-urgency", "approaching");
    rerender(<ProjectWorkflowProgress workflow={{ ...paused(86_399_000), receivedAt: Date.now() }} />);
    expect(timer.closest(".workflow-progress__deadline")).toHaveAttribute("data-urgency", "urgent");
    expect(screen.getByText("Paused")).toBeVisible();
  });

  it("uses the operational remaining time and server anchor instead of a legacy task deadline", () => {
    const data = workflow([stage({ operational: operational(), deadlineAt: "2035-01-01T00:00:00.000Z" })]);
    const { rerender } = render(<ProjectWorkflowProgress workflow={{ ...data, receivedAt: Date.now() - 60_000 }} />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("00:59:00");
    expect(timer).toHaveAttribute("aria-live", "off");
    act(() => vi.advanceTimersByTime(1_000));
    expect(timer).toHaveTextContent("00:58:59");
    rerender(<ProjectWorkflowProgress workflow={{ ...workflow([stage({ operational: operational({ remainingMs: 1_800_000 }) })]), serverNow: "2026-09-11T09:30:00.000Z", receivedAt: Date.now() }} />);
    expect(timer).toHaveTextContent("00:30:00");
  });

  it("keeps a paused operational clock fixed while preserving its backend band and attribution", async () => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ operational: operational({ state: "paused", remainingMs: 90_000, band: "Amber", clockOwner: "Client", designerElapsedMs: 7_200_000, clientElapsedMs: 1_800_000 }) })])} />);
    const timer = screen.getByRole("timer");
    expect(screen.getByText("Paused")).toBeVisible();
    expect(timer).toHaveTextContent("00:01:30");
    act(() => vi.advanceTimersByTime(120_000));
    expect(timer).toHaveTextContent("00:01:30");
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
    await user().click(screen.getByRole("button"));
    const details = screen.getByRole("region", { name: "Recorded stage details" });
    expect(within(details).getByText("Current SLA band").nextElementSibling).toHaveTextContent("Amber");
    expect(within(details).getByText("Clock attributed to").nextElementSibling).toHaveTextContent("Client");
    expect(within(details).getByText("Recorded Designer elapsed time").nextElementSibling).toHaveTextContent("02:00:00");
    expect(within(details).getByText("Recorded Client elapsed time").nextElementSibling).toHaveTextContent("00:30:00");
  });

  it("hides the allowance before payment and shows the current timer after confirmation", () => {
    const kickoff = stage({ name: "Internal Kick off", type: "internal_kickoff", tasks: [], operational: operational({
      state: "waiting", slaAllowanceMs: 259_200_000, remainingMs: null, startsAt: null, targetAt: null, originalTargetAt: null
    }, { status: "not_started" }) });
    const { rerender } = render(<ProjectWorkflowProgress workflow={{ ...workflow([]), projectStages: [kickoff] }} />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByText("Starts after payment")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();

    rerender(<ProjectWorkflowProgress workflow={{ ...workflow([]), receivedAt: Date.now(), initialPayment: { confirmedAt: serverNow, canConfirm: false, version: 1 }, projectStages: [{
      ...kickoff, operational: operational({ state: "running", slaAllowanceMs: 259_200_000, remainingMs: 259_200_000,
        startsAt: serverNow, targetAt: "2026-09-14T09:00:00.000Z", originalTargetAt: "2026-09-14T09:00:00.000Z" })
    }] }} />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("3d 00:00:00");
    expect(timer).toHaveAttribute("datetime", "2026-09-14T09:00:00.000Z");
    act(() => vi.advanceTimersByTime(1_000));
    expect(timer).toHaveTextContent("2d 23:59:59");
  });

  it.each([
    ["scheduled", 86_402_000], ["scheduled", null], ["waiting", null],
    ["not_applicable", null], ["running", null], ["paused", null], ["completed", 3_600_000]
  ] as const)("never shows a timer for %s with remaining %s", (state, remainingMs) => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ operational: operational({ state, remainingMs }) })])} />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("keeps one current timer when future or completed stages are inspected and advances only on saved completion", async () => {
    const completed = stage({ id: "previous", name: "Earlier stage", order: 0, operational: operational({ state: "completed" }, { status: "completed" }) });
    const kickoff = stage({ id: "kickoff", name: "Internal Kick off", order: 1, operational: operational({ remainingMs: 259_200_000 }) });
    const client = stage({ id: "client", name: "Client Kick off", order: 2, operational: operational({ remainingMs: 345_600_000 }) });
    const data = { ...workflow(), projectStages: [client, kickoff, completed] };
    const { rerender } = render(<ProjectWorkflowProgress workflow={data} />);
    const current = screen.getByRole("group", { name: "Current stage timer" });
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(current).toHaveTextContent("Internal Kick off");
    expect(current).toHaveTextContent("3d 00:00:00");
    await user().click(screen.getByRole("button", { name: "Client Kick off — In progress" }));
    expect(current).toHaveTextContent("Internal Kick off");
    await user().click(screen.getByRole("button", { name: "Earlier stage — Completed" }));
    expect(current).toHaveTextContent("Internal Kick off");
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    for (const list of screen.getAllByRole("list", { name: / stages$/ })) expect(within(list).queryByRole("timer")).not.toBeInTheDocument();

    rerender(<ProjectWorkflowProgress workflow={{ ...data, receivedAt: Date.now(), projectStages: [
      client, { ...kickoff, operational: operational({ state: "completed" }, { status: "completed" }) }, completed
    ] }} />);
    expect(current).toHaveTextContent("Client Kick off");
    expect(current).toHaveTextContent("4d 00:00:00");
    expect(screen.getAllByRole("timer")).toHaveLength(1);
  });

  it("does not skip an untimed current project stage to display a later stage timer", () => {
    const data = { ...workflow(), projectStages: [
      stage({ id: "keys", name: "Key Collection", order: 1, operational: operational({ state: "not_applicable", remainingMs: null }) }),
      stage({ id: "measure", name: "Measurement", order: 2, operational: operational() })
    ] };
    render(<ProjectWorkflowProgress workflow={data} />);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("uses an eligible floor timer only after every project stage is complete", () => {
    const data = { ...workflow([stage({ operational: operational() })]), projectStages: [
      stage({ id: "project", operational: operational({ state: "completed" }, { status: "completed" }) })
    ] };
    render(<ProjectWorkflowProgress workflow={data} />);
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Current stage timer" })).toHaveTextContent("Space planning with tentative look and feel");
  });

  it("clamps the running clock at zero and keeps the server-provided SLA band in details", async () => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ operational: operational({ remainingMs: 0, band: "Amber" }) })])} />);
    const timer = screen.getByRole("timer");
    expect(screen.getByText("Due now")).toBeVisible();
    expect(timer).toHaveTextContent("00:00:00");
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("Overdue")).toBeVisible();
    expect(timer).toHaveTextContent("00:00:00");
    expect(screen.queryByText("SLA band: Amber")).not.toBeInTheDocument();
    await user().click(screen.getByRole("button"));
    expect(screen.getByText("Current SLA band").nextElementSibling).toHaveTextContent("Amber");
    expect(screen.queryByText(/Red/)).not.toBeInTheDocument();
  });

  it("honors waiting, completed and untimed operational states even if old tasks have a deadline", () => {
    render(<ProjectWorkflowProgress workflow={workflow([
      stage({ id: "waiting", name: "Payment-dependent stage", operational: operational({ state: "waiting", startsAt: null, remainingMs: null, targetAt: null }, { status: "not_started" }) }),
      stage({ id: "completed", name: "Recorded handover", order: 2, status: "in_progress", operational: operational({ state: "completed", endsAt: serverNow }, { status: "completed" }) }),
      stage({ id: "untimed", name: "Key Collection", order: 3, operational: operational({ state: "not_applicable", startsAt: null, targetAt: null, remainingMs: null, band: null }, { status: "not_started" }) })
    ])} />);
    expect(screen.queryByText("Awaiting payment")).not.toBeInTheDocument();
    const completed = screen.getByRole("button", { name: "Recorded handover — Completed" });
    expect(completed.closest("li")).toHaveAttribute("data-state", "completed");
    expect(screen.queryByText("No SLA")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("stages completed").parentElement).toHaveTextContent("1 / 3");
    expect(screen.getByRole("button", { name: "Payment-dependent stage — Not started" })).not.toHaveAttribute("aria-current");
  });

  it("shows recorded blockers, facts, room readiness and reminders without exposing identifiers", async () => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ tasks: [], operational: operational({}, {
      status: "not_started", blockingReasons: ["Waiting for room dimensions from the client."],
      facts: [{ label: "Assigned measurement owner", value: "Alex Designer" }],
      rooms: [
        { id: "private-room-id", name: "Living room", required: true, hasDimensions: false, canProceed: false },
        { id: "private-room-other", name: "Bedroom", required: false, hasDimensions: false, canProceed: true }
      ],
      reminders: [{ id: "private-reminder-id", label: "Follow up for dimensions", dueAt: "2026-09-12T09:00:00.000Z" }]
    }) })])} />);
    const button = screen.getByRole("button", { name: /— Not started$/ });
    expect(button.closest("li")).toHaveAttribute("data-state", "blocked");
    await user().click(button);
    const details = screen.getByRole("region", { name: "Recorded stage details" });
    expect(within(details).getByText("Waiting for room dimensions from the client.")).toBeVisible();
    expect(within(details).getByText("Assigned measurement owner").nextElementSibling).toHaveTextContent("Alex Designer");
    expect(within(details).getByText("Living room").parentElement).toHaveTextContent("Dimensions pending");
    expect(within(details).getByText("Bedroom").parentElement).toHaveTextContent("Existing furniture not requiredCan proceed");
    expect(within(details).getByText("Follow up for dimensions").nextElementSibling).toHaveTextContent("12 Sept 2026");
    expect(screen.queryByText("No tasks are configured for this stage.")).not.toBeInTheDocument();
    expect(screen.queryByText(/private-/)).not.toBeInTheDocument();
  });

  it("shows the full server-provided requirements and SLA bands without inventing activity or a deadline", async () => {
    const instructions: NonNullable<DesignWorkflowStage["instructions"]> = {
      objective: "Connect the confirmed project brief to its delivery team.",
      owner: "Assigned design coordinator",
      trigger: "The project payment has been verified.",
      start: "Begin when the coordinator accepts the assignment.",
      completion: ["Record the reviewed scope.", "Confirm the handover with the assigned designer."],
      sla: {
        enabled: true,
        bands: [
          { label: "On target", description: "Complete within two calendar days.", tone: "success" },
          { label: "Follow up", description: "Review any item open on the third calendar day.", tone: "warning" },
          { label: "Escalate", description: "Manager intervention is required after the third calendar day.", tone: "danger" }
        ],
        clockOwner: "Design coordinator until handover",
        clockRule: "Count all calendar days from the recorded start.",
        pauseRule: "Pause only while the required client information is outstanding."
      },
      dependencies: ["Verified payment receipt.", "A confirmed project address."],
      clientExperience: ["The client sees the assigned point of contact."],
      clientMessage: "We will contact you when your handover is ready.",
      managerReminders: ["Review incomplete handovers during the daily check."],
      requirements: ["Preserve the original scope and record any requested changes."]
    };
    const data = workflow([stage({ instructions, status: null, progress: null, tasks: [], deadlineAt: null, deadlineTaskId: null })]);
    render(<ProjectWorkflowProgress workflow={data} />);
    const button = screen.getByRole("button", { name: "Space planning with tentative look and feel — No tasks configured" });
    expect(within(button).queryByText(instructions.owner)).not.toBeInTheDocument();
    expect(screen.queryByText(instructions.objective!)).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    await user().click(button);
    const requirements = screen.getByRole("region", { name: "Stage requirements" });
    for (const text of [instructions.objective!, instructions.owner, instructions.trigger, instructions.start,
      ...instructions.completion, ...instructions.dependencies, ...instructions.clientExperience,
      instructions.clientMessage!, ...instructions.managerReminders, ...instructions.requirements,
      instructions.sla.clockOwner!, instructions.sla.clockRule, instructions.sla.pauseRule]) {
      expect(within(requirements).getByText(text)).toBeVisible();
    }
    const bands = within(requirements).getByRole("list", { name: "Service level bands" });
    expect(within(bands).getAllByRole("listitem")).toHaveLength(3);
    for (const band of instructions.sla.bands) {
      expect(within(bands).getByText(band.label)).toBeVisible();
      expect(within(bands).getByText(band.description)).toBeVisible();
    }
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(button).toHaveAccessibleName("Space planning with tentative look and feel — No tasks configured");
    expect(button.closest("li")).toHaveAttribute("data-state", "upcoming");
    expect(screen.queryByText("Waiting for dependencies")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
    expect(screen.getByText("stages completed").parentElement).toHaveTextContent("0 / 1");
  });

  it("renders disabled SLA guidance and omits unavailable requirements for a custom stage", async () => {
    const instructions: NonNullable<DesignWorkflowStage["instructions"]> = {
      objective: null, owner: "Sales manager", trigger: "Assignment is confirmed.", start: "Owner receives the project.",
      completion: ["Save the handover."],
      sla: { enabled: false, bands: [], clockOwner: null, clockRule: "No timed SLA applies.", pauseRule: "No clock is running." },
      dependencies: [], clientExperience: [], clientMessage: null, managerReminders: [], requirements: []
    };
    render(<ProjectWorkflowProgress workflow={workflow([
      stage({ instructions, id: "guided", name: "Guided stage" }),
      stage({ id: "custom", name: "Custom stage", order: 2 })
    ])} />);
    await user().click(screen.getByRole("button", { name: "Guided stage — In progress" }));
    const requirements = screen.getByRole("region", { name: "Stage requirements" });
    expect(within(requirements).getByText("SLA disabled")).toBeVisible();
    expect(within(requirements).getByText("No timed SLA applies.")).toBeVisible();
    expect(within(requirements).queryByRole("list", { name: "Service level bands" })).not.toBeInTheDocument();
    expect(within(requirements).queryByText("Clock attributed to")).not.toBeInTheDocument();
    expect(within(requirements).queryByRole("heading", { name: "Client guidance" })).not.toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: "Custom stage — In progress" }));
    expect(screen.queryByRole("region", { name: "Stage requirements" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Custom stage" })).queryByText("Sales manager")).not.toBeInTheDocument();
  });

  it("renders supplied actions only for the selected stage", async () => {
    const action = vi.fn();
    render(<ProjectWorkflowProgress workflow={workflow()} renderStageActions={(selectedStage) => <button type="button" onClick={() => action(selectedStage.id)}>Record stage outcome</button>} />);
    expect(screen.queryByRole("button", { name: "Record stage outcome" })).not.toBeInTheDocument();
    await user().click(screen.getByRole("button"));
    await user().click(screen.getByRole("button", { name: "Record stage outcome" }));
    expect(action).toHaveBeenCalledExactlyOnceWith("stage-layout");
  });

  it("places the status line before one kickoff acknowledgement and omits its duplicate details", async () => {
    const kickoff = stage({ id: "kickoff", name: "Internal Kick off", type: "internal_kickoff", operational: operational() });
    const next = stage({ id: "client", name: "Client Kick off", type: "client_kickoff", order: 2, operational: operational() });
    const data = { ...workflow([]), projectStages: [kickoff, next] };
    const renderActions = (selectedStage: DesignWorkflowStage) => <form aria-label={`${selectedStage.name} action`}>
      <label>Handover notes<input defaultValue="" /></label>
    </form>;
    const { rerender } = render(<ProjectWorkflowProgress workflow={data} initialStageId="kickoff" renderStageActions={renderActions} />);
    const timeline = screen.getByRole("list", { name: "Project workflow stages" });
    const acknowledgement = screen.getByRole("region", { name: "Internal Kick off acknowledgement" });
    const kickoffButton = screen.getByRole("button", { name: "Internal Kick off — In progress" });
    expect(timeline.compareDocumentPosition(acknowledgement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(within(acknowledgement).getByRole("form", { name: "Internal Kick off action" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Internal Kick off" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recorded stage details" })).not.toBeInTheDocument();
    expect(kickoffButton).toHaveAttribute("aria-controls", acknowledgement.id);
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(within(acknowledgement).queryByRole("timer")).not.toBeInTheDocument();

    await user().type(screen.getByRole("textbox", { name: "Handover notes" }), "Reviewed scope");
    rerender(<ProjectWorkflowProgress workflow={{ ...data, serverNow: "2026-09-11T09:00:01.000Z" }} initialStageId="kickoff" renderStageActions={renderActions} />);
    expect(screen.getByRole("textbox", { name: "Handover notes" })).toHaveValue("Reviewed scope");
    expect(screen.getAllByRole("form")).toHaveLength(1);

    await user().click(screen.getByRole("button", { name: "Client Kick off — In progress" }));
    expect(screen.queryByRole("region", { name: "Internal Kick off acknowledgement" })).not.toBeInTheDocument();
    const details = screen.getByRole("region", { name: "Client Kick off" });
    expect(within(details).getByRole("form", { name: "Client Kick off action" })).toBeVisible();
    expect(within(details).getByRole("region", { name: "Recorded stage details" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Client Kick off — In progress" })).toHaveAttribute("aria-controls", details.id);
    expect(screen.getAllByRole("form")).toHaveLength(1);
  });

  it("closes the initially open acknowledgement with Escape and restores its stage button focus", async () => {
    const keyboard = user();
    render(<ProjectWorkflowProgress workflow={{ ...workflow([]), projectStages: [stage({
      id: "kickoff", name: "Internal Kick off", type: "internal_kickoff", operational: operational()
    })] }} initialStageId="kickoff" renderStageActions={() => <button type="button">Acknowledge handover</button>} />);
    const kickoffButton = screen.getByRole("button", { name: "Internal Kick off — In progress" });
    screen.getByRole("button", { name: "Acknowledge handover" }).focus();
    await keyboard.keyboard("{Escape}");
    expect(kickoffButton).toHaveFocus();
    expect(kickoffButton).toHaveAttribute("aria-expanded", "false");
    expect(kickoffButton).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("region", { name: "Internal Kick off acknowledgement" })).not.toBeInTheDocument();
    await keyboard.keyboard("{Enter}");
    const acknowledgement = screen.getByRole("region", { name: "Internal Kick off acknowledgement" });
    expect(kickoffButton).toHaveAttribute("aria-controls", acknowledgement.id);
    expect(screen.getAllByRole("button", { name: "Acknowledge handover" })).toHaveLength(1);
    await keyboard.keyboard(" ");
    expect(kickoffButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Internal Kick off acknowledgement" })).not.toBeInTheDocument();
  });

  it("opens the next stage actions after saved completion while preserving a draft on ordinary refresh", async () => {
    const kickoff = stage({ id: "kickoff", name: "Internal Kick off", type: "internal_kickoff", operational: operational() });
    const client = stage({ id: "client", name: "Client Kick off", type: "client_kickoff", order: 2, operational: operational({ state: "waiting", remainingMs: null }, { status: "not_started" }) });
    const data = { ...workflow([]), projectStages: [kickoff, client] };
    const renderActions = (selectedStage: DesignWorkflowStage) => <form aria-label={`${selectedStage.name} action`}><input aria-label="Action notes" defaultValue="" /></form>;
    const { rerender } = render(<ProjectWorkflowProgress workflow={data} initialStageId="kickoff" renderStageActions={renderActions} />);
    const draft = screen.getByRole("textbox", { name: "Action notes" });
    await user().type(draft, "Existing handover draft");
    rerender(<ProjectWorkflowProgress workflow={{ ...data, projectStages: [{ ...kickoff, operational: { ...kickoff.operational!, version: 3 } }, client] }} initialStageId="kickoff" renderStageActions={renderActions} />);
    expect(screen.getByRole("textbox", { name: "Action notes" })).toBe(draft);
    expect(draft).toHaveValue("Existing handover draft");

    rerender(<ProjectWorkflowProgress workflow={{ ...data, projectStages: [
      { ...kickoff, operational: operational({ state: "completed" }, { status: "completed" }) },
      { ...client, operational: operational({ remainingMs: 345_600_000 }) }
    ] }} initialStageId="client" renderStageActions={renderActions} />);
    expect(screen.getByRole("button", { name: "Client Kick off — In progress" })).toHaveAttribute("aria-expanded", "true");
    const nextDetails = screen.getByRole("region", { name: "Client Kick off" });
    expect(within(nextDetails).getByRole("form", { name: "Client Kick off action" })).toBeVisible();
    expect(within(nextDetails).getByRole("region", { name: "Recorded stage details" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Internal Kick off acknowledgement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Client Kick off acknowledgement" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Current stage timer" })).toHaveTextContent("Client Kick off");
  });

  it.each(["future", "completed", "collapsed"] as const)("preserves deliberate %s inspection when the current stage completes", async (choice) => {
    const earlier = stage({ id: "earlier", name: "Earlier stage", order: 0, operational: operational({ state: "completed" }, { status: "completed" }) });
    const kickoff = stage({ id: "kickoff", name: "Internal Kick off", type: "internal_kickoff", order: 1, operational: operational() });
    const client = stage({ id: "client", name: "Client Kick off", type: "client_kickoff", order: 2, operational: operational({ state: "waiting", remainingMs: null }, { status: "not_started" }) });
    const data = { ...workflow([]), projectStages: [earlier, kickoff, client] };
    const renderActions = (selectedStage: DesignWorkflowStage) => <form aria-label={`${selectedStage.name} action`}><input aria-label="Action notes" defaultValue="" /></form>;
    const { rerender } = render(<ProjectWorkflowProgress workflow={data} initialStageId="kickoff" renderStageActions={renderActions} />);
    const selectedName = choice === "future" ? "Client Kick off — Not started" : choice === "completed" ? "Earlier stage — Completed" : "Internal Kick off — In progress";
    await user().click(screen.getByRole("button", { name: selectedName }));
    const draft = screen.queryByRole("textbox", { name: "Action notes" });
    if (draft) await user().type(draft, "Keep inspected stage draft");
    rerender(<ProjectWorkflowProgress workflow={{ ...data, projectStages: [earlier,
      { ...kickoff, operational: operational({ state: "completed" }, { status: "completed" }) },
      { ...client, operational: operational() }
    ] }} initialStageId="client" renderStageActions={renderActions} />);
    if (choice === "collapsed") {
      expect(screen.queryByRole("form")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Client Kick off — In progress" })).toHaveAttribute("aria-expanded", "false");
    } else {
      const expectedName = choice === "future" ? "Client Kick off" : "Earlier stage";
      expect(screen.getByRole("form", { name: `${expectedName} action` })).toBeVisible();
      expect(screen.getByRole("textbox", { name: "Action notes" })).toBe(draft);
      expect(draft).toHaveValue("Keep inspected stage draft");
    }
  });

  it("uses normal details for a newly opened non-kickoff stage and keeps the final completion receipt", () => {
    const client = stage({ id: "client", name: "Client Kick off", type: "client_kickoff", operational: operational() });
    const data = { ...workflow([]), projectStages: [client] };
    const renderActions = (selectedStage: DesignWorkflowStage) => <p>{selectedStage.operational?.status === "completed" ? "Stage completion recorded" : "Client meeting action"}</p>;
    const { rerender } = render(<ProjectWorkflowProgress workflow={data} initialStageId="client" renderStageActions={renderActions} />);
    expect(within(screen.getByRole("region", { name: "Client Kick off" })).getByText("Client meeting action")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Client Kick off acknowledgement" })).not.toBeInTheDocument();
    rerender(<ProjectWorkflowProgress workflow={{ ...data, projectStages: [{ ...client, operational: operational({ state: "completed" }, { status: "completed" }) }] }} renderStageActions={renderActions} />);
    expect(screen.getByRole("button", { name: "Client Kick off — Completed" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Stage completion recorded")).toBeVisible();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it.each(["external", "inline"] as const)("handles the upload-stage transition in %s navigation without an empty action card", async (mode) => {
    const host = render(<div data-testid="upload-navigation-host" />).getByTestId("upload-navigation-host");
    const timelineContainer = mode === "external" ? host : undefined;
    const furniture = stage({ id: "furniture", name: "Existing furniture dimensions", type: "existing_furniture_dimensions", operational: operational({ state: "not_applicable", remainingMs: null }) });
    const planning = stage({ id: "planning", name: "Space planning", type: "space_planning_tentative_look_feel", order: 2, operational: operational({ state: "waiting", remainingMs: null }, { status: "not_started" }) });
    const data = { ...workflow([]), projectStages: [furniture, planning] };
    const { rerender } = render(<ProjectWorkflowProgress workflow={data} initialStageId="furniture" timelineContainer={timelineContainer} />);
    expect(screen.getByRole("region", { name: "Existing furniture dimensions" })).toBeVisible();
    rerender(<ProjectWorkflowProgress workflow={{ ...data, projectStages: [
      { ...furniture, operational: operational({ state: "completed" }, { status: "completed" }) },
      { ...planning, operational: operational() }
    ] }} timelineContainer={timelineContainer} />);
    const local = screen.getByRole("region", { name: mode === "external" ? "Stage actions" : "Project progress" });
    const planningButton = screen.getByRole("button", { name: "Space planning — In progress" });
    if (mode === "external") {
      expect(local).toHaveClass("workflow-progress--empty");
      expect(planningButton).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("region", { name: "Space planning" })).not.toBeInTheDocument();
      expect(within(local).queryByRole("region", { name: "Recorded stage details" })).not.toBeInTheDocument();
      expect(within(host).getByRole("timer")).toBeVisible();
      await user().click(planningButton);
      expect(local).not.toHaveClass("workflow-progress--empty");
      expect(screen.getByRole("region", { name: "Space planning" })).toBeVisible();
      await user().click(screen.getByRole("button", { name: "Close stage details" }));
      expect(local).toHaveClass("workflow-progress--empty");
    } else {
      expect(local).not.toHaveClass("workflow-progress--empty");
      expect(planningButton).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("region", { name: "Space planning" })).toBeVisible();
    }
  });

  it("portals the stage navigation and single timer while preserving the original form through host changes", async () => {
    const hosts = render(<><div data-testid="first-navigation-host" /><div data-testid="second-navigation-host" /></>);
    const firstHost = hosts.getByTestId("first-navigation-host");
    const secondHost = hosts.getByTestId("second-navigation-host");
    const data = { ...workflow([]), projectStages: [stage({
      id: "kickoff", name: "Internal Kick off", type: "internal_kickoff", operational: operational()
    })] };
    const renderActions = () => <form aria-label="Internal Kick off action"><label>Handover notes<input defaultValue="" /></label></form>;
    const progress = render(<ProjectWorkflowProgress workflow={data} initialStageId="kickoff" renderStageActions={renderActions} timelineContainer={null} />);
    const local = screen.getByRole("region", { name: "Stage actions" });
    expect(screen.queryByRole("list", { name: "Project workflow stages" })).not.toBeInTheDocument();
    const draft = screen.getByRole("textbox", { name: "Handover notes" });
    await user().type(draft, "Keep this handover draft");

    progress.rerender(<ProjectWorkflowProgress workflow={data} initialStageId="kickoff" renderStageActions={renderActions} timelineContainer={firstHost} />);
    expect(within(firstHost).getByRole("heading", { name: "Project workflow", level: 2 })).toBeVisible();
    expect(within(firstHost).getByRole("list", { name: "Project workflow stages" })).toBeVisible();
    expect(within(firstHost).getByText("1 stage")).toBeVisible();
    expect(within(firstHost).queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
    expect(within(firstHost).getByRole("timer")).toBeVisible();
    expect(within(firstHost).queryByRole("form")).not.toBeInTheDocument();
    expect(within(local).queryByRole("heading", { name: "Project workflow" })).not.toBeInTheDocument();
    expect(within(local).getByRole("heading", { name: "Project workflow actions and details", level: 3 })).toHaveClass("sr-only");
    expect(within(local).queryByRole("list", { name: "Project workflow stages" })).not.toBeInTheDocument();
    expect(within(local).queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByText("Design workflow")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project progress" })).not.toBeInTheDocument();
    expect(screen.queryByText("Open a stage for requirements and actions.")).not.toBeInTheDocument();
    expect(screen.queryByText("stages completed")).not.toBeInTheDocument();
    expect(within(local).getByRole("heading", { name: "Stage actions", level: 2 })).toHaveClass("sr-only");
    expect(within(local).getByRole("textbox", { name: "Handover notes" })).toBe(draft);
    expect(draft).toHaveValue("Keep this handover draft");

    progress.rerender(<ProjectWorkflowProgress workflow={data} initialStageId="kickoff" renderStageActions={renderActions} timelineContainer={secondHost} />);
    expect(firstHost).toBeEmptyDOMElement();
    const stageButton = within(secondHost).getByRole("button", { name: "Internal Kick off — In progress" });
    const acknowledgement = within(local).getByRole("region", { name: "Internal Kick off acknowledgement" });
    expect(stageButton).toHaveAttribute("aria-controls", acknowledgement.id);
    expect(within(local).getByRole("textbox", { name: "Handover notes" })).toBe(draft);
    expect(draft).toHaveValue("Keep this handover draft");
    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    await user().click(stageButton);
    expect(within(local).queryByRole("form")).not.toBeInTheDocument();
    await user().click(stageButton);
    expect(within(local).getByRole("form", { name: "Internal Kick off action" })).toBeVisible();
    screen.getByRole("textbox", { name: "Handover notes" }).focus();
    await user().keyboard("{Escape}");
    expect(stageButton).toHaveFocus();
    expect(stageButton).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the six saved Excel stages before any physical floor or task exists", async () => {
    const names = [
      "Internal Kick off",
      "Client Kick off",
      "Key Collection",
      "On Site Actual Measurement",
      "Collection of existing furniture dimensions",
      "Designer Uploading Space planning with Tentative look and Feel"
    ];
    const types: DesignWorkflowStage["type"][] = [
      "internal_kickoff", "client_kickoff", "key_collection", "site_measurement",
      "existing_furniture_dimensions", "space_planning_tentative_look_feel"
    ];
    const data: DesignWorkflowView = {
      ...workflow(), floors: [],
      projectStages: names.map((name, index) => stage({
        id: `saved-workflow-${index}`, name, type: types[index], order: index,
        tasks: [], status: null, progress: null, deadlineAt: null, deadlineTaskId: null
      })).reverse()
    };
    render(<ProjectWorkflowProgress workflow={data} />);
    const stages = within(screen.getByRole("list", { name: "Project workflow stages" })).getAllByRole("button");
    expect(stages.map((button) => button.getAttribute("aria-label"))).toEqual(names.map((name) => `${name} — No tasks configured`));
    expect(screen.queryByText("No deadline set")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ground floor" })).not.toBeInTheDocument();
    expect(screen.getByText("stages completed").parentElement).toHaveTextContent("0 / 6");
    expect(screen.queryByText(/saved-workflow-/)).not.toBeInTheDocument();
    await user().click(stages[5]);
    expect(screen.getByRole("region", { name: names[5] })).toHaveTextContent("Final stage in this workflow");
  });

  it("shows task floors within project stages and resolves custom dependencies through stored source IDs", async () => {
    const data: DesignWorkflowView = {
      ...workflow([stage({ id: "custom-stage", name: "Custom lighting review", dependencyStageIds: ["ground-source"] })]),
      projectStages: [stage({
        id: "project-stage", name: "Internal Kick off",
        sourceStages: [
          { id: "ground-source", name: "Internal Kick off", floorName: "Ground floor" },
          { id: "first-source", name: "Internal Kick off", floorName: "First floor" }
        ],
        tasks: [
          task({ id: "ground-task", title: "Review ground floor brief", floorName: "Ground floor" }),
          task({ id: "first-task", title: "Review first floor brief", floorName: "First floor" })
        ]
      })]
    };
    const openTask = vi.fn();
    render(<ProjectWorkflowProgress workflow={data} onOpenTask={openTask} />);
    expect(screen.getAllByRole("list", { name: / stages$/ })).toHaveLength(2);
    await user().click(screen.getByRole("button", { name: "Internal Kick off — In progress" }));
    const details = screen.getByRole("region", { name: "Internal Kick off" });
    expect(within(details).getAllByText("Floor", { selector: "dt" })).toHaveLength(2);
    expect(within(details).getByText("Ground floor", { selector: "dd" })).toBeVisible();
    expect(within(details).getByText("First floor", { selector: "dd" })).toBeVisible();
    await user().click(within(details).getByRole("button", { name: "Open task: Review first floor brief" }));
    expect(openTask).toHaveBeenCalledExactlyOnceWith("first-task");
    await user().click(screen.getByRole("button", { name: "Custom lighting review — In progress" }));
    const custom = screen.getByRole("region", { name: "Custom lighting review" });
    expect(within(custom).getByText("Ground floor · Internal Kick off")).toBeVisible();
    expect(within(custom).queryByText("Dependency unavailable")).not.toBeInTheDocument();
  });

  it("renders all floors and stages in saved order without exposing their identifiers", () => {
    const data = workflow([
      stage({ id: "stage-z", name: "Client review", order: 3, status: "not_started" }),
      stage({ id: "stage-b", name: "Measurements", order: 2, status: "completed" }),
      stage({ id: "stage-a", name: "Kick off", order: 2, status: "completed" })
    ]);
    data.floors.unshift({ id: "floor-first", name: "First floor", number: "1", order: 2, stages: [stage({ id: "stage-upstairs", name: "Measurements" })] });
    render(<ProjectWorkflowProgress workflow={data} />);

    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Ground floor", "First floor"]);
    expect(within(screen.getByRole("list", { name: "Ground floor stages" })).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Kick off — Completed", "Measurements — Completed", "Client review — Not started"]);
    expect(within(screen.getByRole("list", { name: "First floor stages" })).getByRole("button", { name: "Measurements — In progress" })).toBeVisible();
    expect(screen.getByText("stages completed").parentElement).toHaveTextContent("2 / 4");
    for (const id of ["stage-z", "stage-b", "stage-a", "floor-first", "project-example"]) expect(screen.queryByText(id)).not.toBeInTheDocument();
  });

  it.each([
    ["completed", "Completed", "completed"],
    ["in_progress", "In progress", "current"],
    ["in_review", "In review", "current"],
    ["not_started", "Not started", "upcoming"],
    ["blocked", "Blocked", "blocked"]
  ] as const)("keeps the existing %s status terminology", (status, label, appearance) => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ status })])} />);
    const button = screen.getByRole("button", { name: `Space planning with tentative look and feel — ${label}` });
    expect(button).toHaveTextContent(/^Space planning with tentative look and feel$/);
    expect(within(button).queryByText(label, { selector: ".ui-status" })).not.toBeInTheDocument();
    expect(button.closest("li")).toHaveAttribute("data-state", appearance);
    if (appearance === "current") expect(button).toHaveAttribute("aria-current", "step");
    else expect(button).not.toHaveAttribute("aria-current");
  });

  it("uses server time for a multi-day top-corner countdown that decreases every second", () => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ deadlineAt: "2026-09-13T12:04:00.000Z" })])} />);
    const button = screen.getByRole("button");
    expect(within(button).queryByText("Time remaining")).not.toBeInTheDocument();
    const timer = within(screen.getByRole("group", { name: "Current stage timer" })).getByRole("timer");
    expect(timer).toHaveTextContent("2d 03:04:00");
    expect(button).toHaveAccessibleDescription("Time remaining 2d 03:04:00");
    expect(timer.tagName).toBe("TIME");
    expect(timer).toHaveAttribute("datetime", "2026-09-13T12:04:00.000Z");
    expect(timer).toHaveAttribute("aria-live", "off");
    act(() => vi.advanceTimersByTime(1000));
    expect(timer).toHaveTextContent("2d 03:03:59");
    expect(button).toHaveAccessibleDescription("Time remaining 2d 03:03:59");
  });

  it.each([
    ["2026-09-12T09:00:00.000Z", "1d 00:00:00", "23:59:59"],
    ["2026-09-11T10:00:00.000Z", "01:00:00", "00:59:59"],
    ["2026-09-11T09:01:00.000Z", "00:01:00", "00:00:59"]
  ])("counts down through clock boundaries from %s", (deadlineAt, initialClock, nextClock) => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ deadlineAt })])} />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent(initialClock);
    act(() => vi.advanceTimersByTime(1000));
    expect(timer).toHaveTextContent(nextClock);
  });

  it("honors the original response receipt time when mounting cached data", () => {
    render(<ProjectWorkflowProgress workflow={{ ...workflow([stage({ deadlineAt: "2026-09-11T09:02:00.000Z" })]), receivedAt: Date.now() - 60000 }} />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("00:01:00");
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByText("Due now")).toBeVisible();
    expect(timer).toHaveTextContent("00:00:00");
    expect(timer.closest(".workflow-progress__deadline")).not.toHaveAttribute("data-overdue", "true");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("Overdue")).toBeVisible();
    expect(timer).toHaveTextContent("00:00:00");
    expect(timer.closest(".workflow-progress__deadline")).toHaveAttribute("data-overdue", "true");
    act(() => vi.advanceTimersByTime(3600000));
    expect(timer).toHaveTextContent("00:00:00");
    expect(screen.getByRole("button")).toHaveAccessibleDescription("Overdue 00:00:00");
  });

  it("starts an already overdue stage at zero without counting upwards", () => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ deadlineAt: "2026-09-10T09:00:00.000Z" })])} />);
    const timer = screen.getByRole("timer");
    expect(screen.getByText("Overdue")).toBeVisible();
    expect(timer).toHaveTextContent("00:00:00");
    expect(timer.closest(".workflow-progress__deadline")).toHaveAttribute("data-overdue", "true");
    act(() => vi.advanceTimersByTime(1000));
    expect(timer).toHaveTextContent("00:00:00");
  });

  it("uses the server-provided next task deadline without rebuilding the task schedule", () => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ deadlineAt: "2026-09-11T10:00:00.000Z", deadlineTaskId: "task-next", tasks: [task(), task({ id: "task-next", title: "Confirm window dimensions", currentDeadlineAt: "2026-09-11T10:00:00.000Z" })] })])} />);
    expect(screen.getByRole("timer")).toHaveTextContent("01:00:00");
    expect(screen.getByRole("timer")).toHaveAttribute("title", expect.stringContaining("Confirm window dimensions"));
    expect(screen.queryByText("2d 00:00:00")).not.toBeInTheDocument();
  });

  it("stops showing active countdowns for completed stages and exposes absent deadlines honestly", () => {
    render(<ProjectWorkflowProgress workflow={workflow([
      stage({ id: "completed", name: "Kick off", status: "completed", deadlineAt: "2026-09-10T09:00:00.000Z" }),
      stage({ id: "empty", name: "Saved stage without tasks", status: null, progress: null, tasks: [], deadlineAt: null, deadlineTaskId: null })
    ])} />);
    const completed = screen.getByRole("button", { name: "Kick off — Completed" });
    expect(completed.querySelector("time")).toBeNull();
    expect(within(completed).queryByText("Stage timing")).not.toBeInTheDocument();
    const empty = screen.getByRole("button", { name: "Saved stage without tasks — No tasks configured" });
    expect(empty).toHaveTextContent(/^Saved stage without tasks$/);
    expect(empty).toHaveAccessibleName("Saved stage without tasks — No tasks configured");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("reanchors the countdown when a refreshed server response arrives and cleans up its interval", () => {
    const data = workflow([stage({ deadlineAt: "2026-09-11T10:00:00.000Z" })]);
    const { rerender, unmount } = render(<ProjectWorkflowProgress workflow={data} />);
    expect(screen.getByRole("timer")).toHaveTextContent("01:00:00");
    rerender(<ProjectWorkflowProgress workflow={{ ...data, serverNow: "2026-09-11T09:30:00.000Z", receivedAt: Date.now() }} />);
    expect(screen.getByRole("timer")).toHaveTextContent("00:30:00");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:29:59");
    rerender(<ProjectWorkflowProgress workflow={{ ...workflow([stage({ deadlineAt: "2026-09-11T11:00:00.000Z" })]), serverNow: "2026-09-11T09:30:01.000Z", receivedAt: Date.now() }} />);
    expect(screen.getByRole("timer")).toHaveTextContent("01:29:59");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("opens task details with keyboard and restores focus when closed", async () => {
    const keyboard = user();
    render(<ProjectWorkflowProgress workflow={workflow()} />);
    const button = screen.getByRole("button");
    button.focus();
    await keyboard.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByRole("region", { name: "Space planning with tentative look and feel" });
    expect(button).toHaveAttribute("aria-controls", details.id);
    expect(within(details).getByRole("heading", { name: "Review the living room layout" })).toBeVisible();
    expect(within(details).getByText("Check the saved furniture dimensions and circulation space.")).toBeVisible();
    expect(within(details).getByText("Maya Designer")).toBeVisible();
    expect(within(details).getByText("Original deadline").nextElementSibling).toHaveTextContent("12 Sept 2026");
    expect(within(details).getByText("Current deadline").nextElementSibling).toHaveTextContent("13 Sept 2026");
    expect(within(details).getByText("Progress is behind the saved task schedule.")).toBeVisible();
    expect(within(details).getByText("Yellow risk")).toBeVisible();
    expect(within(details).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    expect(within(details).queryByRole("button", { name: /^Open task/ })).not.toBeInTheDocument();
    within(details).getByRole("button", { name: "Close stage details" }).focus();
    await keyboard.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Space planning with tentative look and feel" })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    await keyboard.keyboard(" ");
    expect(button).toHaveAttribute("aria-expanded", "true");
    await keyboard.click(screen.getByRole("button", { name: "Close stage details" }));
    expect(button).toHaveFocus();
  });

  it("shows stored dependency names and the next stage without deriving new locks from stage dependencies", async () => {
    const stages = [
      stage({ id: "intro", name: "Internal Kick off", order: 1, status: "not_started", tasks: [task({ id: "intro-task", title: "Agree the project brief" })] }),
      stage({ id: "planning", name: "Space planning", order: 2, status: "not_started", dependencyStageIds: ["intro"], tasks: [task({ dependencyTaskIds: ["intro-task"] })] }),
      stage({ id: "review", name: "Client review", order: 3 })
    ];
    render(<ProjectWorkflowProgress workflow={workflow(stages)} />);
    const button = screen.getByRole("button", { name: "Space planning — Not started" });
    expect(button.closest("li")).toHaveAttribute("data-state", "upcoming");
    await user().click(button);
    const details = screen.getByRole("region", { name: "Space planning" });
    expect(within(details).getByText("Ground floor · Internal Kick off")).toBeVisible();
    expect(within(details).getByText("Ground floor · Internal Kick off · Agree the project brief")).toBeVisible();
    expect(within(details).getByText("Next stage").parentElement).toHaveTextContent("Client review");
    expect(within(details).queryByText("Waiting for")).not.toBeInTheDocument();
  });

  it("shows backend task blockers while keeping the saved stage status unchanged", async () => {
    render(<ProjectWorkflowProgress workflow={workflow([stage({ status: "not_started", tasks: [task({ blockedByTaskIds: ["unavailable-task"] })] })])} />);
    const button = screen.getByRole("button", { name: /— Not started$/ });
    expect(button.closest("li")).toHaveAttribute("data-state", "blocked");
    expect(within(button).queryByText("Waiting for dependencies")).not.toBeInTheDocument();
    await user().click(button);
    expect(screen.getByText("Dependency unavailable")).toBeVisible();
    expect(screen.queryByText("unavailable-task")).not.toBeInTheDocument();
  });

  it("renders tasks in saved order and only opens a task through the supplied callback", async () => {
    const onOpenTask = vi.fn();
    render(<ProjectWorkflowProgress workflow={workflow([stage({ tasks: [task({ id: "second", title: "Second saved task", order: 2 }), task({ id: "first", title: "First saved task", order: 1 })] })])} onOpenTask={onOpenTask} actionLabel="View task" />);
    await user().click(screen.getByRole("button"));
    const details = screen.getByRole("region", { name: "Space planning with tentative look and feel" });
    expect(within(details).getAllByRole("heading", { level: 5 }).map((heading) => heading.textContent)).toEqual(["First saved task", "Second saved task"]);
    await user().click(within(details).getByRole("button", { name: "View task: Second saved task" }));
    expect(onOpenTask).toHaveBeenCalledExactlyOnceWith("second");
  });

  it("keeps empty floors visible and removes stale selected details when switching projects", async () => {
    const { rerender } = render(<ProjectWorkflowProgress workflow={workflow()} />);
    await user().click(screen.getByRole("button"));
    rerender(<ProjectWorkflowProgress workflow={{ ...workflow([]), projectId: "different-project" }} />);
    expect(screen.getByRole("heading", { name: "Ground floor" })).toBeVisible();
    expect(screen.getByText("No stages configured for this floor.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Close stage details" })).not.toBeInTheDocument();
    rerender(<ProjectWorkflowProgress workflow={{ ...workflow(), floors: [] }} />);
    expect(screen.getByText("No workflow stages have been configured for this project.")).toBeVisible();
  });
});

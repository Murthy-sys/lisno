import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { ProjectWorkflowProgress } from "./ProjectWorkflowProgress";
import { WorkflowStageActions } from "./WorkflowStageActions";
import type { DesignStageOperational, DesignWorkflowStage, DesignWorkflowView } from "./projectWorkflowApi";

const serverNow = "2026-09-11T09:00:00.000Z";
const acknowledgement = "I acknowledge that the design flow has been handed over to me after initial payment.";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function operational(overrides: Partial<DesignStageOperational> = {}): DesignStageOperational {
  return {
    status: "in_progress", version: 4,
    availableActions: [], blockingReasons: [], facts: [], history: [],
    timing: {
      state: "running", startsAt: serverNow, targetAt: "2026-09-14T09:00:00.000Z", originalTargetAt: "2026-09-14T09:00:00.000Z",
      endsAt: null, remainingMs: 259_200_000, slaAllowanceMs: 259_200_000, band: "On track", clockOwner: "Designer",
      designerElapsedMs: 3_600_000, clientElapsedMs: 0
    },
    ...overrides
  };
}

function fixture(): DesignWorkflowView {
  const stages: DesignWorkflowStage[] = [
    {
      id: "project-a:internal", type: "internal_kickoff", name: "Internal Kick off", order: 1,
      status: "in_progress", progress: 0, dependencyStageIds: [], deadlineAt: null, deadlineTaskId: null, tasks: [],
      operational: operational({ availableActions: [{ id: "internal_kickoff_complete", label: "Complete Internal Kick off and save", actor: "designer", requiresProof: true }] })
    },
    {
      id: "project-a:client", type: "client_kickoff", name: "Client Kick off", order: 2,
      status: "not_started", progress: 0, dependencyStageIds: ["project-a:internal"], deadlineAt: null, deadlineTaskId: null, tasks: [],
      operational: operational({ status: "not_started", availableActions: [], blockingReasons: ["Complete Internal Kick off first."] })
    }
  ];
  return {
    projectId: "project-a", projectName: "Courtyard residence", serverNow, receivedAt: Date.now(), projectStages: stages, floors: [],
    initialPayment: { confirmedAt: serverNow, canConfirm: false, version: 4, status: "received" }
  };
}

function DesignerWorkflow({ workflow, onOpenTask }: { workflow: DesignWorkflowView; onOpenTask?: (taskId: string) => void }) {
  const [timelineContainer, setTimelineContainer] = useState<HTMLDivElement | null>(null);
  const current = workflow.projectStages?.find((stage) => stage.operational?.status !== "completed");
  return <>
    <div ref={setTimelineContainer} role="region" aria-label="Top workflow navigation" />
    <ProjectWorkflowProgress workflow={workflow} presentation="designer" timelineContainer={timelineContainer} initialStageId={current?.id} onOpenTask={onOpenTask}
      renderStageActions={(stage) => <WorkflowStageActions key={`${workflow.projectId}:${stage.id}`} workflow={workflow} stage={stage} presentation="designer" expandKickoff={stage.type === "internal_kickoff"} />} />
  </>;
}

function setup(workflow = fixture(), onOpenTask?: (taskId: string) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<DesignerWorkflow workflow={workflow} onOpenTask={onOpenTask} />, {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  });
  return { ...view, workflow };
}

describe("Designer workflow stage panels", () => {
  it.each([
    { filename: "signed-checklist.pdf", mimeType: "application/pdf" },
    { filename: "signed-checklist.png", mimeType: "image/png" }
  ])("shows the saved $filename directly under completed Internal Kick off and opens it only on request", async ({ filename, mimeType }) => {
    const user = userEvent.setup();
    const download = vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["Signed checklist"], { type: mimeType }), filename });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:saved-internal-document"), revokeObjectURL: vi.fn() });
    const data = fixture();
    const internal = data.projectStages![0]!;
    internal.status = "completed";
    internal.progress = 100;
    internal.operational = operational({ status: "completed", timing: { ...internal.operational!.timing, state: "completed", endsAt: serverNow },
      submittedDocument: { eventId: "saved-internal-event", filename, mimeType, uploadedAt: serverNow },
      history: [{ id: "saved-internal-event", action: "internal_kickoff_complete", actorName: "Designer A", actorRole: "designer", onBehalfOfClient: false, at: serverNow, note: "Kick off completed.", proofAvailable: true }]
    });
    data.projectStages![1]!.status = "in_progress";
    data.projectStages![1]!.operational = operational();
    setup(data);
    await user.click(screen.getByRole("button", { name: "Internal Kick off — Completed" }));
    const panel = screen.getByRole("region", { name: "Internal Kick off details" });
    expect(within(panel).queryByRole("form")).not.toBeInTheDocument();
    expect(within(panel).getByText(filename)).toBeVisible();
    const history = within(panel).getByText("Action history").closest("details")!;
    expect(history).not.toHaveAttribute("open");
    expect(within(history).getByRole("button", { name: "Download evidence", hidden: true })).not.toBeVisible();
    const view = within(panel).getByRole("button", { name: `View ${filename}` });
    await waitFor(() => expect(view).toBeEnabled());
    expect(view).toHaveTextContent("View document");
    expect(panel.querySelector("img, iframe")).toBeNull();
    await user.click(view);
    const dialog = screen.getByRole("dialog", { name: filename });
    const title = `Designer’s Internal Kick off document: ${filename}`;
    const preview = mimeType === "application/pdf" ? within(dialog).getByTitle(title) : within(dialog).getByRole("img", { name: title });
    expect(preview).toHaveAttribute("src", "blob:saved-internal-document");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Collapse Internal Kick off" })).toHaveAttribute("aria-expanded", "true");
    await user.click(within(panel).getByRole("button", { name: "Collapse Internal Kick off" }));
    await user.click(within(panel).getByRole("button", { name: "Expand Internal Kick off" }));
    expect(view).toBeVisible();
    expect(download).toHaveBeenCalledExactlyOnceWith("/projects/project-a/design-workflow/history/saved-internal-event/proof");
    expect(screen.getAllByRole("timer")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Current stage timer" })).toHaveTextContent("Client Kick off");
  });

  it("preserves the whole unsaved kickoff form when its header is collapsed by keyboard and the workflow refreshes", async () => {
    const user = userEvent.setup();
    const { workflow, rerender } = setup();
    const region = screen.getByRole("region", { name: "Internal Kick off details" });
    const checkbox = within(region).getByRole("checkbox", { name: acknowledgement });
    const meeting = within(region).getByLabelText(/Meeting conducted at/);
    const note = within(region).getByRole("textbox", { name: "Note" });
    const fileInput = within(region).getByLabelText(/Signed kick-off checklist/) as HTMLInputElement;
    const file = new File(["Signed checklist"], "signed-kickoff.pdf", { type: "application/pdf" });
    await user.click(checkbox);
    fireEvent.change(meeting, { target: { value: "2026-09-11T14:30" } });
    await user.type(note, "Keep the existing living room furniture.");
    await user.upload(fileInput, file);
    const collapse = within(region).getByRole("button", { name: "Collapse Internal Kick off" });
    const bodyId = collapse.getAttribute("aria-controls")!;
    const body = document.getElementById(bodyId)!;
    expect(body).toContainElement(fileInput);
    collapse.focus();
    await user.keyboard("{Enter}");
    expect(collapse).toHaveAccessibleName("Expand Internal Kick off");
    expect(collapse).toHaveAttribute("aria-expanded", "false");
    expect(body).toHaveAttribute("hidden");
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).not.toBeVisible();
    rerender(<DesignerWorkflow workflow={{ ...structuredClone(workflow), serverNow: "2026-09-11T09:01:00.000Z", receivedAt: Date.now() }} />);
    expect(body).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "Expand Internal Kick off" })).toBe(collapse);
    await user.keyboard(" ");
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(body).not.toHaveAttribute("hidden");
    expect(within(region).getByRole("checkbox", { name: acknowledgement })).toBe(checkbox);
    expect(checkbox).toBeChecked();
    expect(within(region).getByLabelText(/Meeting conducted at/)).toBe(meeting);
    expect(meeting).toHaveValue("2026-09-11T14:30");
    expect(within(region).getByRole("textbox", { name: "Note" })).toBe(note);
    expect(note).toHaveValue("Keep the existing living room furniture.");
    expect(within(region).getByLabelText(/Signed kick-off checklist/)).toBe(fileInput);
    expect(fileInput.files?.[0]).toBe(file);
  });

  it("toggles the selected timeline stage without losing its draft or the single top timer", async () => {
    const user = userEvent.setup();
    setup();
    const navigation = screen.getByRole("region", { name: "Top workflow navigation" });
    const stageButton = within(navigation).getByRole("button", { name: "Internal Kick off — In progress" });
    const region = screen.getByRole("region", { name: "Internal Kick off details" });
    const note = within(region).getByRole("textbox", { name: "Note" });
    await user.type(note, "Unsaved handover note");
    const timer = screen.getByRole("timer");
    expect(navigation).toContainElement(timer);
    expect(region).not.toContainElement(timer);
    await user.click(stageButton);
    expect(stageButton).toHaveAttribute("aria-expanded", "false");
    expect(note).toBeInTheDocument();
    expect(note).not.toBeVisible();
    expect(screen.getByRole("timer")).toBe(timer);
    await user.click(stageButton);
    expect(stageButton).toHaveAttribute("aria-expanded", "true");
    expect(within(region).getByRole("textbox", { name: "Note" })).toBe(note);
    expect(note).toHaveValue("Unsaved handover note");
    expect(screen.getAllByRole("timer")).toHaveLength(1);
  });

  it("opens another selected stage while retaining the current stage timer", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Collapse Internal Kick off" }));
    await user.click(screen.getByRole("button", { name: "Client Kick off — Not started" }));
    const client = screen.getByRole("region", { name: "Client Kick off details" });
    expect(within(client).getByRole("button", { name: "Collapse Client Kick off" })).toHaveAttribute("aria-expanded", "true");
    expect(within(client).getByText("Complete Internal Kick off first.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Internal Kick off details" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Current stage timer" })).toHaveTextContent("Internal Kick off");
  });

  it("opens the next current stage after saved completion even when the completed stage was collapsed", async () => {
    const user = userEvent.setup();
    const { workflow, rerender } = setup();
    await user.click(screen.getByRole("button", { name: "Collapse Internal Kick off" }));
    const updated = structuredClone(workflow);
    const internal = updated.projectStages![0]!;
    const client = updated.projectStages![1]!;
    internal.status = "completed";
    internal.progress = 100;
    internal.operational = operational({ status: "completed", version: 5, timing: { ...internal.operational!.timing, state: "completed", endsAt: serverNow }, availableActions: [] });
    client.status = "in_progress";
    client.operational = operational({ version: 5, blockingReasons: [], availableActions: [{ id: "client_kickoff_request", label: "Request Client Kick off", actor: "designer", requiresProof: false }] });
    rerender(<DesignerWorkflow workflow={updated} />);
    const details = await screen.findByRole("region", { name: "Client Kick off details" });
    expect(within(details).getByRole("button", { name: "Collapse Client Kick off" })).toHaveAttribute("aria-expanded", "true");
    expect(within(details).getByRole("button", { name: "Request Client Kick off" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Current stage timer" })).toHaveTextContent("Client Kick off");
    expect(screen.getAllByRole("timer")).toHaveLength(1);
  });

  it("lets the Designer read requirements for all six stages without unlocking actions or changing the current timer", async () => {
    const user = userEvent.setup();
    const data = fixture();
    const stageTypes = ["internal_kickoff", "client_kickoff", "key_collection", "site_measurement", "existing_furniture_dimensions", "space_planning_tentative_look_feel"] as const;
    const names = ["Internal Kick off", "Client Kick off", "Key Collection", "On Site Actual Measurement", "Collection of existing furniture dimensions", "Designer Uploading Space planning with Tentative look and Feel"];
    data.projectStages = stageTypes.map((type, index) => ({
      ...data.projectStages![0]!, id: `project-a:${type}`, type, name: names[index]!, order: index + 1,
      status: index === 0 ? "completed" : index === 1 ? "in_progress" : "blocked",
      operational: operational({ status: index === 0 ? "completed" : index === 1 ? "in_progress" : "blocked", availableActions: [] }),
      instructions: {
        objective: `Purpose of ${names[index]}`, owner: "Designer", trigger: "The preceding stage is complete.", start: "Follow the saved workflow order.",
        completion: [`Required evidence for ${names[index]}`],
        sla: { enabled: index < 2 || index === 3, bands: [{ label: "On track", description: "Saved stage target", tone: "success" }, { label: "Late", description: "Escalation threshold", tone: "warning" }], clockOwner: "Internal clock attribution", clockRule: "Long clock policy.", pauseRule: "Repeated pause policy." },
        dependencies: ["Repeated dependency explanation."], clientExperience: ["Client progress explanation."], clientMessage: "Client congratulations message.", managerReminders: ["Manager reminder policy."], requirements: ["Repeated additional instructions."]
      }
    }));
    setup(data);
    const navigation = screen.getByRole("region", { name: "Top workflow navigation" });
    for (const [index, name] of names.entries()) {
      const status = index === 0 ? "Completed" : index === 1 ? "In progress" : "Blocked";
      const stageButton = within(navigation).getByRole("button", { name: `${name} — ${status}` });
      expect(stageButton).toBeEnabled();
      await user.click(stageButton);
      const region = screen.getByRole("region", { name: `${name} details` });
      expect(within(region).getByRole("button", { name: `Collapse ${name}` })).toHaveAttribute("aria-expanded", "true");
      expect(within(region).queryByText(`Purpose of ${name}`)).not.toBeInTheDocument();
      expect(within(region).getByText(`Required evidence for ${name}`)).not.toBeVisible();
      const information = within(region).getByText("Stage information");
      await user.click(information);
      expect(within(region).getByText("Follow the saved workflow order.")).toBeVisible();
      expect(within(region).getByText(`Required evidence for ${name}`)).toBeVisible();
      const requirements = within(region).getByRole("region", { name: "Stage requirements" });
      expect(within(requirements).getByText("Owner")).toBeVisible();
      expect(within(requirements).getByText("To complete")).toBeVisible();
      if (index < 2 || index === 3) expect(within(requirements).getByText("Saved stage target")).toBeVisible();
      else expect(within(requirements).queryByText("Target")).not.toBeInTheDocument();
      for (const removed of ["Trigger", "Service levels and clock rules", "SLA disabled", "Internal clock attribution", "Long clock policy.", "Repeated pause policy.", "Repeated dependency explanation.", "Client progress explanation.", "Client congratulations message.", "Manager reminder policy.", "Repeated additional instructions.", "Escalation threshold"]) {
        expect(within(requirements).queryByText(removed)).not.toBeInTheDocument();
      }
      expect(within(region).queryByRole("form")).not.toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Current stage timer" })).toHaveTextContent("Client Kick off");
      expect(screen.getAllByRole("timer")).toHaveLength(1);
    }
  });

  it("keeps blockers, saved facts, room readiness and authenticated history evidence without internal timing metadata", async () => {
    const user = userEvent.setup();
    const download = vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["Evidence"], { type: "application/pdf" }), filename: "handover.pdf" });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:designer-evidence"), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const data = fixture();
    const stage = data.projectStages![0]!;
    stage.operational = operational({
      blockingReasons: ["Client access confirmation is pending."], facts: [{ label: "Measurement taker", value: "Maya Designer" }],
      rooms: [{ id: "room-living", name: "Living room", required: true, hasDimensions: true, canProceed: true }, { id: "room-study", name: "Study", required: true, hasDimensions: false, canProceed: false }],
      reminders: [{ id: "internal-reminder", label: "Contact the line manager before the SLA threshold.", dueAt: serverNow }],
      history: [{ id: "key-receipt-proof", action: "keys_received", actorName: "Maya Designer", actorRole: "designer", onBehalfOfClient: false, at: serverNow, note: "Two entrance keys received.", proofAvailable: true }]
    });
    stage.instructions = {
      objective: "Ensure the detailed handover scope is understood.", owner: "Designer", trigger: "Initial payment confirmation", start: "Start from the recorded payment timestamp.", completion: ["Attach the signed checklist."],
      sla: { enabled: true, bands: [{ label: "Green", description: "Within three days", tone: "success" }], clockOwner: "Designer", clockRule: "Charge elapsed time to the Designer bucket.", pauseRule: "Pause during restricted site access." },
      dependencies: [], clientExperience: [], clientMessage: null, managerReminders: ["Review the line manager reminder."], requirements: ["Record the full handover context."]
    };
    setup(data);
    const region = screen.getByRole("region", { name: "Internal Kick off details" });
    expect(within(region).getByText("Client access confirmation is pending.")).toBeVisible();
    expect(within(region).getByText("Measurement taker").nextElementSibling).toHaveTextContent("Maya Designer");
    expect(within(region).getByText("Living room").closest("li")).toHaveTextContent("Dimensions received");
    expect(within(region).getByText("Study").closest("li")).toHaveTextContent("Dimensions pending");
    expect(within(region).getByText("Can proceed")).toBeVisible();
    for (const label of ["Stage requirements", "Current SLA band", "Clock attributed to", "Activity opens", "Original SLA target", "Current SLA target", "Recorded Designer elapsed time", "Recorded Client elapsed time", "Due reminders"]) {
      const detail = within(region).queryByText(label);
      if (detail) expect(detail).not.toBeVisible();
    }
    expect(within(region).queryByText(stage.instructions.objective!)).not.toBeInTheDocument();
    expect(within(region).queryByText(stage.operational.reminders![0]!.label)).not.toBeInTheDocument();
    const history = within(region).getByText("Action history").closest("details")!;
    expect(history).not.toHaveAttribute("open");
    expect(within(history).getByText("Two entrance keys received.")).not.toBeVisible();
    await user.click(within(region).getByText("Action history"));
    expect(within(history).getByText("Two entrance keys received.")).toBeVisible();
    await user.click(within(history).getByRole("button", { name: "Download evidence" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(download).toHaveBeenCalledWith("/projects/project-a/design-workflow/history/key-receipt-proof/proof");
  });

  it("does not show a Client-only missing-document prompt in the Designer Client Kick off stage", () => {
    const data = fixture();
    data.projectStages = [data.projectStages![1]!];
    data.projectStages[0]!.operational = operational({ availableActions: [{ id: "client_kickoff_request", label: "Request Client Kick off", actor: "designer", requiresProof: false }] });
    setup(data);
    expect(screen.getByRole("region", { name: "Client Kick off details" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Request Client Kick off" })).toBeVisible();
    expect(screen.queryByText("The Designer’s Internal Kick off document is not available yet.")).not.toBeInTheDocument();
  });

  it("retains actionable legacy floor tasks without repeating task deadlines", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const data = fixture();
    data.projectStages = [];
    data.floors = [{ id: "floor-ground", name: "Ground floor", number: "G", order: 1, stages: [{
      id: "ground-layout", type: "floor_plan", name: "Ground floor layout", order: 1, status: "in_progress", progress: 40,
      dependencyStageIds: [], deadlineAt: "2026-09-14T09:00:00.000Z", deadlineTaskId: "task-ground-layout", tasks: [{
        id: "task-ground-layout", title: "Upload the ground floor layout", description: "Use the approved room measurements.", status: "in_progress", progress: 40, order: 1, ownerName: "Maya Designer",
        plannedStartAt: serverNow, originalDeadlineAt: "2026-09-13T09:00:00.000Z", currentDeadlineAt: "2026-09-14T09:00:00.000Z", completedAt: null,
        dependencyTaskIds: [], blockedByTaskIds: [], risk: { level: "yellow", reason: "Awaiting the revised layout.", elapsedRatio: 0.5, progressRatio: 0.4 }
      }]
    }] }];
    setup(data, onOpenTask);
    await user.click(screen.getByRole("button", { name: "Ground floor layout — In progress" }));
    const details = screen.getByRole("region", { name: "Ground floor layout details" });
    expect(within(details).getByText("Upload the ground floor layout")).toBeVisible();
    for (const label of ["Planned start", "Original deadline", "Current deadline", "Recorded stage details"]) {
      expect(within(details).queryByText(label)).not.toBeInTheDocument();
    }
    await user.click(within(details).getByRole("button", { name: /Open task/ }));
    expect(onOpenTask).toHaveBeenCalledExactlyOnceWith("task-ground-layout");
  });
});

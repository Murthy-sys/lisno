import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { FurnitureRequirementsReview } from "./FurnitureRequirementsReview";
import { ProjectWorkflowProgress } from "./ProjectWorkflowProgress";
import type { DesignStageOperational, DesignWorkflowStage, DesignWorkflowView } from "./projectWorkflowApi";
import { workflowStageNextStep, workflowStageStatusLabel } from "./projectWorkflowSelectors";

function fixture(phase: "awaiting_client_acceptance" | "requirements_changes_requested" = "awaiting_client_acceptance") {
  const operational: DesignStageOperational = {
    status: "in_progress", version: 8, availableActions: [], facts: [], history: [], blockingReasons: [],
    timing: { state: "not_applicable", startsAt: "2026-09-17T08:00:00Z", targetAt: null, originalTargetAt: null, endsAt: null, remainingMs: null, band: null, clockOwner: null, designerElapsedMs: 0, clientElapsedMs: 0 },
    furniture: { phase, requirementsSubmissionEventId: "requirements-8", notApplicable: false, requiredRoomCount: 1, pendingRoomCount: 1, readyRoomCount: 0,
      evidence: [{ eventId: "requirements-8", filename: "dimensions.pdf", mimeType: "application/pdf", byteSize: 1024, source: "furniture_dimensions" }],
      ...(phase === "requirements_changes_requested" ? { scopeReturn: { reason: "Recheck the wardrobe depth.", at: "2026-09-17T10:00:00Z" } } : {}) },
    rooms: [{ id: "bedroom", name: "Bedroom", required: true, hasDimensions: true, canProceed: false, dimensions: {
      submissionEventId: "requirements-8", revision: 2, status: phase === "requirements_changes_requested" ? "changes_requested" : "pending", submittedAt: "2026-09-17T09:00:00Z",
      items: [{ id: "estimate-wardrobe", estimateItemId: "estimate-wardrobe", name: "Wardrobe", length: 2100.125, width: 600, height: 2400, uomId: "uom-mm", unit: "mm", uomName: "Millimetres" }]
    } }]
  };
  const stage: DesignWorkflowStage = { id: "stage-furniture", name: "Collection of existing furniture dimensions", type: "existing_furniture_dimensions", order: 4, dependencyStageIds: [], status: "in_progress", progress: null, deadlineAt: null, deadlineTaskId: null, tasks: [], operational };
  const workflow: DesignWorkflowView = { projectId: "project-a", projectName: "Project A", serverNow: "2026-09-17T10:00:00Z", projectStages: [stage], floors: [] };
  return { operational, stage, workflow };
}

describe("Combined furniture requirements and dimensions review", () => {
  it("shows measurements and the document before Client acceptance and explains one approval", async () => {
    const { operational } = fixture();
    render(<FurnitureRequirementsReview projectId="project-a" operational={operational} />);
    expect(screen.getByRole("heading", { name: "Review furniture requirements and dimensions" })).toBeVisible();
    expect(screen.getByText(/Approval accepts the room requirements and measurements together/)).toBeVisible();
    expect(within(screen.getByRole("table", { name: "Furniture measurements for Bedroom" })).getByRole("row", { name: "Wardrobe 2100.125 600 2400 mm" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "View dimensions.pdf" })).toHaveLength(1);
    expect(screen.queryByText("Dimensions approved")).not.toBeInTheDocument();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it.each([
    ["awaiting_client_acceptance", "Awaiting dimensions approval", "Await Client approval of furniture dimensions"],
    ["requirements_changes_requested", "Dimensions sent back", "Correct and resubmit furniture dimensions"]
  ] as const)("uses dimension review labels for a combined %s submission", (phase, status, next) => {
    const { stage } = fixture(phase);
    expect(workflowStageStatusLabel(stage)).toBe(status);
    expect(workflowStageNextStep(stage)).toBe(next);
    delete stage.operational!.furniture!.requirementsSubmissionEventId;
    expect(workflowStageStatusLabel(stage)).toBe(phase === "awaiting_client_acceptance" ? "Awaiting Client acceptance" : "Requirements sent back");
  });

  it("explains the combined approval in project progress without presenting pending rooms as ready", () => {
    const { workflow, stage } = fixture();
    render(<ProjectWorkflowProgress workflow={workflow} initialStageId={stage.id} />);
    const summary = screen.getByRole("group", { name: "Furniture requirements progress" });
    expect(summary).toHaveTextContent("Furniture dimensions submitted");
    expect(summary).toHaveTextContent("approve them together");
    expect(summary).toHaveTextContent("0 of 1 required rooms ready");
  });

  it("retains the submitted measurements beside Client correction feedback", () => {
    const { operational } = fixture("requirements_changes_requested");
    render(<FurnitureRequirementsReview projectId="project-a" operational={operational} />);
    expect(screen.getByText("Recheck the wardrobe depth.")).toBeVisible();
    expect(screen.getByRole("row", { name: "Wardrobe 2100.125 600 2400 mm" })).toBeVisible();
  });
});

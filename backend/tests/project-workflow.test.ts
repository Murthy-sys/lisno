import { describe, expect, it } from "vitest";

import {
  DESIGN_PLAN_STATUSES,
  PROJECT_WORKFLOW_TASK_KINDS,
  PROJECT_WORKFLOW_TASK_STATUSES,
  ProjectWorkflowSectionAssignmentConflict,
  projectWorkflowBlueprints,
  projectWorkflowSectionAssignments,
  WORKFLOW_TASK_SCHEDULE,
  workerRoleForCatalogueId,
  type EstimateWorkflowLine,
  type ProjectWorkflowSectionTask
} from "../src/domain/project-workflow.js";

const line = (
  catalogueId: string,
  roomName: string,
  included = true,
  id: string | null = `line-${catalogueId.toLowerCase()}-${roomName.toLowerCase().replaceAll(" ", "-")}`
): EstimateWorkflowLine => ({
  id,
  catalogueId,
  roomName,
  specification: `Specification for ${catalogueId}`,
  unit: "nos",
  quantity: 2,
  amount: 1_000,
  included
});

describe("project workflow state catalogues", () => {
  it("keeps Design work assignment and Client review as explicit states", () => {
    expect(DESIGN_PLAN_STATUSES).toEqual([
      "pending_assignment",
      "assigned",
      "in_progress",
      "ready_for_client",
      "changes_requested",
      "approved"
    ]);
  });

  it("keeps Design delivery separate from downstream operational work", () => {
    expect(PROJECT_WORKFLOW_TASK_KINDS).toEqual([
      "design_plan_upload",
      "procurement",
      "finance",
      "site_execution",
      "trade_execution"
    ]);
    expect(PROJECT_WORKFLOW_TASK_STATUSES).toEqual([
      "open",
      "in_progress",
      "completed"
    ]);
  });
});

describe("project workflow trade-role mapping", () => {
  it.each([
    ["FC01", "worker_civil"],
    ["FC02", "worker_civil"],
    ["FC03", "worker_other"],
    ["FL01", "worker_civil"],
    ["FL02", "worker_civil"],
    ["FL03", "worker_civil"],
    ["LF01", "worker_carpenter"],
    ["LF02", "worker_carpenter"],
    ["LF03", "worker_carpenter"],
    ["LF04", "worker_carpenter"],
    ["CA01", "worker_carpenter"],
    ["CA02", "worker_carpenter"],
    ["CA03", "worker_carpenter"],
    ["CA04", "worker_carpenter"],
    ["CA05", "worker_carpenter"],
    ["CA06", "worker_carpenter"],
    ["CA07", "worker_carpenter"],
    ["CA08", "worker_carpenter"],
    ["CA09", "worker_carpenter"],
    ["CA10", "worker_carpenter"],
    ["CA11", "worker_carpenter"],
    ["CA12", "worker_carpenter"],
    ["CV01", "worker_civil"],
    ["CV02", "worker_plumber"],
    ["CV03", "worker_plumber"],
    ["CV04", "worker_plumber"],
    ["EL01", "worker_electrician"],
    ["EL02", "worker_electrician"],
    ["EL03", "worker_electrician"],
    ["EL04", "worker_electrician"],
    ["EL05", "worker_electrician"],
    ["PA01", "worker_painter"],
    ["PA02", "worker_painter"],
    ["PA03", "worker_painter"]
  ] as const)("maps %s to %s", (catalogueId, expectedRole) => {
    expect(workerRoleForCatalogueId(catalogueId)).toBe(expectedRole);
  });

  it("normalizes catalogue IDs and explicitly falls back to Other Worker", () => {
    expect(workerRoleForCatalogueId("  cv02  ")).toBe("worker_plumber");
    expect(workerRoleForCatalogueId("ca99")).toBe("worker_carpenter");
    expect(workerRoleForCatalogueId("FC99")).toBe("worker_other");
    expect(workerRoleForCatalogueId("future01")).toBe("worker_other");
    expect(workerRoleForCatalogueId(" ")).toBe("worker_other");
  });
});

describe("project workflow task blueprints", () => {
  it("opens Procurement, Finance Manager, Site Manager, and one trade task per included estimate line", () => {
    const blueprints = projectWorkflowBlueprints({
      estimateId: "estimate-1",
      estimateVersion: 1,
      lineItems: [
        line("ca01", "Living Room"),
        line("CV02", "Kitchen"),
        line("EL03", "Bedroom"),
        line("PA01", "Excluded Room", false)
      ]
    });

    expect(blueprints).toHaveLength(6);
    expect(blueprints.slice(0, 3)).toEqual([
      {
        dedupeKey: "estimate-1:procurement",
        kind: "procurement",
        assigneeRole: "procurement",
        title: "Prepare procurement plan",
        description:
          "Prepare materials and sourcing for: Carpentry, Civil & Plumbing, Electrical.",
        sourceSectionId: null,
        sourceLineItemKey: null,
        roomName: null,
        ...WORKFLOW_TASK_SCHEDULE.procurement
      },
      {
        dedupeKey: "estimate-1:finance",
        kind: "finance",
        assigneeRole: "finance_head",
        title: "Open approved project budget",
        description:
          "Review the approved estimate and establish financial controls.",
        sourceSectionId: null,
        sourceLineItemKey: null,
        roomName: null,
        ...WORKFLOW_TASK_SCHEDULE.finance
      },
      {
        dedupeKey: "estimate-1:site",
        kind: "site_execution",
        assigneeRole: "site_manager",
        title: "Plan site execution",
        description:
          "Coordinate execution for: Carpentry, Civil & Plumbing, Electrical.",
        sourceSectionId: null,
        sourceLineItemKey: null,
        roomName: null,
        ...WORKFLOW_TASK_SCHEDULE.site_execution
      }
    ]);

    expect(blueprints.slice(3)).toEqual([
      {
        dedupeKey: "estimate-1:trade:line-ca01-living-room",
        kind: "trade_execution",
        assigneeRole: "worker_carpenter",
        title: "Carpentry · Living Room",
        description: "CA01 · Specification for ca01 · 2 nos",
        sourceSectionId: "CA",
        sourceLineItemKey: "line-ca01-living-room",
        roomName: "Living Room",
        ...WORKFLOW_TASK_SCHEDULE.trade_execution
      },
      {
        dedupeKey: "estimate-1:trade:line-cv02-kitchen",
        kind: "trade_execution",
        assigneeRole: "worker_plumber",
        title: "Civil & Plumbing · Kitchen",
        description: "CV02 · Specification for CV02 · 2 nos",
        sourceSectionId: "CV",
        sourceLineItemKey: "line-cv02-kitchen",
        roomName: "Kitchen",
        ...WORKFLOW_TASK_SCHEDULE.trade_execution
      },
      {
        dedupeKey: "estimate-1:trade:line-el03-bedroom",
        kind: "trade_execution",
        assigneeRole: "worker_electrician",
        title: "Electrical · Bedroom",
        description: "EL03 · Specification for EL03 · 2 nos",
        sourceSectionId: "EL",
        sourceLineItemKey: "line-el03-bedroom",
        roomName: "Bedroom",
        ...WORKFLOW_TASK_SCHEDULE.trade_execution
      }
    ]);
    expect(new Set(blueprints.map(({ dedupeKey }) => dedupeKey)).size).toBe(
      blueprints.length
    );
  });

  it("does not create trade work or include section summaries for excluded lines", () => {
    const blueprints = projectWorkflowBlueprints({
      estimateId: "estimate-empty",
      estimateVersion: 3,
      lineItems: [line("PA01", "Bedroom", false)]
    });

    expect(blueprints).toHaveLength(3);
    expect(blueprints.map(({ kind, assigneeRole }) => ({
      kind,
      assigneeRole
    }))).toEqual([
      { kind: "procurement", assigneeRole: "procurement" },
      { kind: "finance", assigneeRole: "finance_head" },
      { kind: "site_execution", assigneeRole: "site_manager" }
    ]);
    expect(blueprints[0]?.description).toBe(
      "Prepare materials and sourcing for the approved estimate."
    );
    expect(blueprints[2]?.description).toBe(
      "Coordinate execution for the approved design."
    );
  });

  it("keeps repeated catalogue items in different rooms independently traceable", () => {
    const blueprints = projectWorkflowBlueprints({
      estimateId: "estimate-room-scope",
      estimateVersion: 2,
      lineItems: [
        line("CA02", "Master Bedroom"),
        line("CA02", "Guest Bedroom")
      ]
    }).filter(({ kind }) => kind === "trade_execution");

    expect(blueprints.map(({ sourceLineItemKey }) => sourceLineItemKey)).toEqual([
      "line-ca02-master-bedroom",
      "line-ca02-guest-bedroom"
    ]);
    expect(new Set(blueprints.map(({ dedupeKey }) => dedupeKey)).size).toBe(2);
  });

  it("uses immutable ids to keep duplicate room/catalogue rows separate", () => {
    const blueprints = projectWorkflowBlueprints({
      estimateId: "estimate-duplicates",
      estimateVersion: 4,
      lineItems: [
        line("CA02", "Master Bedroom", true, "estimate-line-first"),
        line("CA02", "Master Bedroom", true, "estimate-line-second")
      ]
    }).filter(({ kind }) => kind === "trade_execution");

    expect(blueprints.map(({ sourceLineItemKey }) => sourceLineItemKey)).toEqual([
      "estimate-line-first",
      "estimate-line-second"
    ]);
    expect(new Set(blueprints.map(({ dedupeKey }) => dedupeKey)).size).toBe(2);
  });

  it("derives deterministic version-and-position identities for legacy lines", () => {
    const blueprints = projectWorkflowBlueprints({
      estimateId: "estimate-legacy",
      estimateVersion: 7,
      lineItems: [
        line("CA02", "Master Bedroom", true, null),
        line("CA02", "Master Bedroom", true, null)
      ]
    }).filter(({ kind }) => kind === "trade_execution");

    expect(blueprints.map(({ sourceLineItemKey }) => sourceLineItemKey)).toEqual([
      "legacy-estimate-line:estimate-legacy:7:0",
      "legacy-estimate-line:estimate-legacy:7:1"
    ]);
    expect(new Set(blueprints.map(({ dedupeKey }) => dedupeKey)).size).toBe(2);
  });
});

describe("project workflow section assignment aggregation", () => {
  it("uses unfinished assignment state and weighted progress while preserving completed history", () => {
    const assignments = projectWorkflowSectionAssignments([
      sectionTask({
        id: "task-ca-completed",
        sourceLineItemKey: "line-ca-completed",
        assigneeUserId: "worker-historical",
        status: "completed",
        progress: 10,
        plannedEffort: 3,
        version: 4,
        updatedAt: "2026-08-26T09:00:00.000Z"
      }),
      sectionTask({
        id: "task-ca-current",
        sourceLineItemKey: "line-ca-current",
        assigneeUserId: "worker-current",
        status: "in_progress",
        progress: 20,
        plannedEffort: 1,
        version: 2,
        updatedAt: "2026-08-27T09:00:00.000Z"
      })
    ]);

    expect(assignments).toEqual([expect.objectContaining({
      projectId: "project-one",
      estimateId: "estimate-one",
      designPlanVersion: 3,
      sourceSectionId: "CA",
      sectionLabel: "Carpentry",
      assigneeRole: "worker_carpenter",
      assignedWorkerId: "worker-current",
      assignmentState: "assigned",
      status: "in_progress",
      progress: 80,
      taskCount: 2,
      unfinishedTaskCount: 1,
      revision: expect.stringMatching(/^[a-f0-9]{64}$/u),
      updatedAt: new Date("2026-08-27T09:00:00.000Z")
    })]);
    expect(assignments[0]!.members.map(({ id }) => id)).toEqual([
      "task-ca-completed",
      "task-ca-current"
    ]);
  });

  it("derives mixed state and changes revision for any member version change", () => {
    const tasks = [
      sectionTask({ id: "task-one", sourceLineItemKey: "line-one", assigneeUserId: null }),
      sectionTask({ id: "task-two", sourceLineItemKey: "line-two", assigneeUserId: "worker-one" })
    ];
    const before = projectWorkflowSectionAssignments(tasks)[0]!;
    const after = projectWorkflowSectionAssignments(tasks.map((task) =>
      task.id === "task-two" ? { ...task, version: task.version + 1 } : task
    ))[0]!;

    expect(before).toMatchObject({
      assignmentState: "mixed",
      assignedWorkerId: null,
      status: "open",
      progress: 0
    });
    expect(after.revision).not.toBe(before.revision);
  });

  it("fails closed for duplicate member lineage or mixed roles within one section", () => {
    const duplicateLine = [
      sectionTask({ id: "task-one", sourceLineItemKey: "line-duplicate" }),
      sectionTask({ id: "task-two", sourceLineItemKey: "line-duplicate" })
    ];
    expect(() => projectWorkflowSectionAssignments(duplicateLine))
      .toThrow(ProjectWorkflowSectionAssignmentConflict);

    const mixedCivilAndPlumbing = [
      sectionTask({
        id: "task-cv-civil",
        sourceSectionId: "CV",
        sourceLineItemKey: "line-cv-civil",
        assigneeRole: "worker_civil"
      }),
      sectionTask({
        id: "task-cv-plumbing",
        sourceSectionId: "CV",
        sourceLineItemKey: "line-cv-plumbing",
        assigneeRole: "worker_plumber"
      })
    ];
    expect(() => projectWorkflowSectionAssignments(mixedCivilAndPlumbing))
      .toThrow(ProjectWorkflowSectionAssignmentConflict);
  });
});

function sectionTask(
  overrides: Partial<ProjectWorkflowSectionTask>
): ProjectWorkflowSectionTask {
  return {
    id: "task-default",
    projectId: "project-one",
    estimateId: "estimate-one",
    designPlanVersion: 3,
    kind: "trade_execution",
    sourceSectionId: "CA",
    sourceLineItemKey: "line-default",
    assigneeRole: "worker_carpenter",
    assigneeUserId: null,
    status: "open",
    progress: 0,
    version: 1,
    plannedEffort: null,
    updatedAt: "2026-08-27T08:00:00.000Z",
    ...overrides
  };
}

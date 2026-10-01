import type { ProjectPendingAction, ProjectStatusPerson, ProjectStatusSummary } from "../contracts/project-status.js";
import type { ProjectCompletionSummary } from "./project-completion.js";
import type { ChatEstimateSource, ChatWorkflowSource } from "../repositories/project-chat.js";
import type { ProjectRecord } from "../repositories/types.js";
import { emptyDesignWorkflowState, workflowFurnitureRoomReady, workflowIsPaused, workflowStagePrerequisiteBlockers, workflowSubmissionBlockers, type DesignWorkflowState } from "./design-workflow-state.js";
import { createProjectDesignWorkflow, type DesignStageType } from "./design-workflow.js";
import { projectWorkflowBlueprints } from "./project-workflow.js";
import type { Role } from "./roles.js";
import type { WorkflowSpacePlanningSource } from "./workflow-space-planning.js";

/** Approval evidence and source selection are validated by the source reader, not status labels. */
export interface ProjectStatusInput {
  project: Pick<ProjectRecord, "id" | "name" | "status" | "clientId" | "assignedEstimatorId" | "initiatingDesignerId" | "assignedDesignerIds" | "managerId" | "designWorkflowStages" | "completionAuthority" | "completionAuthorityVersion" | "completionDecisionId">;
  participants: readonly ProjectStatusPerson[];
  estimate: ChatEstimateSource | null;
  salesOwnerIds: readonly string[];
  designAssignmentOwnerIds?: readonly string[];
  /** estimateVersion is the immutable approved snapshot version after approval, otherwise the live version. */
  commercial: { state: "none" | "pending" | "approved" | "conflict"; estimateId: string | null; estimateVersion: number | null };
  workflow: DesignWorkflowState | null;
  design: WorkflowSpacePlanningSource | null;
  tasks: readonly ChatWorkflowSource[];
  execution?: { completion: ProjectCompletionSummary | null; hasApprovedOrder: boolean; procurementOwnerIds: readonly string[];
    pendingVendorUserIds: readonly string[]; hasCurrentProcurementItems?: boolean };
  issues?: { workflow?: boolean; furniture?: boolean; design?: boolean; execution?: boolean };
  serverNow: string;
}

const STAGES = new Map(createProjectDesignWorkflow("").map(stage => [stage.type, stage.name]));
const REVIEW_ISSUE = "Status needs review. The recorded sources are missing or inconsistent.";
const stageLabel = (key: string) => STAGES.get(key as DesignStageType) ?? ({
  estimate_preparation: "Estimate preparation", estimate_internal_review: "Internal estimate review",
  estimate_submission: "Estimate submission", estimate_approval: "Estimate approval",
  initial_payment: "Initial-payment confirmation", execution: "Project execution",
  purchase_order: "Purchase order", vendor_work: "Vendor work",
  client_vendor_review: "Client work review", site_execution: "Site completion",
  client_completion: "Client completion review", final_completion: "Final project completion"
}[key] ?? "Project status");
const recordedDate = (date: string | Date | null | undefined): string | null => {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

/** Viewer-independent, read-only projection. Participant membership has already been authorized. */
export function deriveProjectStatus(input: ProjectStatusInput): ProjectStatusSummary {
  const { project, estimate, commercial } = input;
  const result: ProjectStatusSummary = {
    projectId: project.id, projectName: project.name, projectStatus: project.status,
    serverNow: input.serverNow, state: "active", currentStage: null, pendingActions: [], issue: null
  };
  const peopleById = new Map(input.participants.map(person => [person.id, person]));
  const people = (roles: Role | readonly Role[], ids: readonly (string | null | undefined)[]): ProjectStatusPerson[] =>
    [...new Set(ids)].flatMap(id => {
      const person = id ? peopleById.get(id) : undefined;
      return person && (Array.isArray(roles) ? roles.includes(person.role) : person.role === roles)
        ? [{ id: person.id, name: person.name, role: person.role }] : [];
    }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const salesCandidates = [...new Set(input.salesOwnerIds.filter(Boolean))];
  const salesIds = project.assignedEstimatorId ? [project.assignedEstimatorId] : salesCandidates.length === 1 ? salesCandidates : [];
  const designerIds = [...project.assignedDesignerIds, project.initiatingDesignerId];
  const clientIds = [project.clientId];
  const add = (key: string, source: string, action: string, role: Role, ids: readonly (string | null | undefined)[], extra: Partial<Pick<ProjectPendingAction, "state" | "scheduledAt" | "deadlineAt" | "blocker">> = {}, eligibleRoles: readonly Role[] = [role]) => {
    const assigned = people(eligibleRoles, ids);
    const item: ProjectPendingAction = {
      id: `${project.id}:${source}`, stageKey: key, stageLabel: stageLabel(key), action,
      state: assigned.length ? "pending" : "unassigned", responsibleRole: role, people: assigned,
      scheduledAt: null, deadlineAt: null, blocker: assigned.length ? null : "Assignment needed.", ...extra
    };
    result.pendingActions.push(item);
    result.currentStage ??= { key, label: item.stageLabel };
  };
  const unavailable = (key: string) => {
    result.state = "unavailable";
    result.currentStage = { key, label: stageLabel(key) };
    result.issue = REVIEW_ISSUE;
    return result;
  };
  const finish = (): ProjectStatusSummary => {
    if (result.state !== "unavailable" && result.state !== "paused") {
      result.state = !result.pendingActions.length
        ? project.status === "completed" ? "completed" : "no_pending"
        : result.pendingActions.every(action => action.state === "scheduled") ? "scheduled" : "active";
    }
    if (result.state !== "unavailable" && project.status === "on_hold") {
      result.state = "paused";
      result.issue = "The project is on hold.";
    }
    return result;
  };

  if (!recordedDate(input.serverNow) || commercial.state === "conflict" ||
      (estimate?.projectId && estimate.projectId !== project.id) ||
      commercial.estimateId !== (estimate?.id ?? null) ||
      (estimate && commercial.estimateVersion !== (commercial.state === "approved" ? Math.max(1, estimate.version - 1) : estimate.version))) return unavailable("estimate_approval");

  if (project.completionAuthority === "vendor_client" && commercial.state !== "approved" &&
      (input.execution?.hasApprovedOrder || input.participants.some(person => person.role === "vendor"))) return unavailable("estimate_approval");

  if (commercial.state !== "approved") {
    const status = estimate?.status ?? "draft";
    if (commercial.state === "pending") {
      if (status !== "sent_to_client") return unavailable("estimate_approval");
      add("estimate_approval", `estimate:${estimate!.id}:client-review`, "Review and approve the submitted estimate or request changes.", "client", clientIds);
    } else if (["draft", "client_changes_requested", "designer_changes_requested"].includes(status)) {
      add("estimate_preparation", `estimate:${estimate?.id ?? "new"}:prepare`, status === "draft" ? "Prepare and submit the estimate." : "Revise the returned estimate and submit it again.", "estimator_sales", salesIds);
    } else if (status === "pending_manager_assignment") {
      add("estimate_internal_review", `estimate:${estimate!.id}:assign-review`, "Assign a Designer to review the estimate.", "design_manager", [estimate!.assignedManagerId ?? project.managerId]);
    } else if (status === "pending_designer_approval") {
      add("estimate_internal_review", `estimate:${estimate!.id}:designer-review`, "Review the estimate and approve it or request corrections.", "designer", [estimate!.assignedDesignerId]);
    } else if (status === "ready_for_client") {
      add("estimate_submission", `estimate:${estimate!.id}:submit`, "Submit the estimate to the Client for approval.", "estimator_sales", salesIds);
    } else return unavailable("estimate_approval");
    return finish();
  }
  if (!estimate || estimate.status !== "client_approved") return unavailable("estimate_approval");
  const workflowEnabled = Boolean(project.designWorkflowStages?.length);
  const addDesignAssignment = () => {
    const source = `estimate:${estimate.id}:assign-design`;
    if (!result.pendingActions.some(action => action.id === `${project.id}:${source}`)) {
      add("space_planning_tentative_look_feel", source, "Assign a Designer to prepare the Design plan.", "admin", input.designAssignmentOwnerIds ?? []);
    }
  };
  const designAssignmentPending = estimate.designPlanStatus === "pending_assignment";
  const invalidDesignSource = Boolean(input.issues?.design || input.design?.sourceIssue || input.design && (input.design.estimateId !== estimate.id || input.design.designPlanVersion !== estimate.designPlanVersion));
  const workflow = workflowEnabled ? input.workflow ?? emptyDesignWorkflowState(project.id) : emptyDesignWorkflowState(project.id);
  if (workflowEnabled && input.issues?.workflow) return unavailable("internal_kickoff");
  if (workflowEnabled && (workflow.projectId !== project.id ||
      workflow.initialPaymentEstimateId && workflow.initialPaymentEstimateId !== estimate.id ||
      workflow.initialPaymentEstimateVersion !== undefined && workflow.initialPaymentEstimateVersion !== commercial.estimateVersion)) return unavailable("initial_payment");
  if (workflowEnabled && !workflow.initialPaymentAt) {
    const financeHeads = input.participants.filter(person => person.role === "finance_head");
    const superAdmins = input.participants.filter(person => person.role === "super_admin");
    const soleSuperAdminId = superAdmins.length === 1 ? superAdmins[0]!.id : null;
    add("initial_payment", "initial-payment", "Record confirmation that the initial payment was received.", financeHeads.length ? "finance_head" : "super_admin", [...financeHeads.map(person => person.id), soleSuperAdminId], {}, ["finance_head", "super_admin"]);
    if (designAssignmentPending) {
      if (invalidDesignSource) return unavailable("space_planning_tentative_look_feel");
      addDesignAssignment();
    }
    return finish();
  }
  if (workflowEnabled && !recordedDate(workflow.initialPaymentAt)) return unavailable("initial_payment");
  if (workflowEnabled && project.designWorkflowStages && (project.designWorkflowStages.length !== 6 || new Set(project.designWorkflowStages.map(stage => stage.type)).size !== 6 || project.designWorkflowStages.some(stage => !STAGES.has(stage.type)))) return unavailable("internal_kickoff");

  const internal = workflow.stages.internal_kickoff ?? {};
  const kickoff = workflow.stages.client_kickoff ?? {};
  const keys = workflow.stages.key_collection ?? {};
  const measurement = workflow.stages.site_measurement ?? {};
  const furniture = workflow.stages.existing_furniture_dimensions ?? {};
  const planning = workflow.stages.space_planning_tentative_look_feel ?? {};
  for (const [key, stage] of Object.entries(workflow.stages)) {
    if (stage?.completedAt && (!recordedDate(stage.completedAt) || Date.parse(stage.completedAt) > Date.parse(input.serverNow) || workflowStagePrerequisiteBlockers(workflow, key as DesignStageType).length)) return unavailable(key);
  }
  if (furniture.rooms && (input.issues?.furniture || furniture.scopeEstimateId && furniture.scopeEstimateId !== estimate.id || furniture.scopeEstimateVersion !== undefined && furniture.scopeEstimateVersion !== commercial.estimateVersion)) return unavailable("existing_furniture_dimensions");
  if (furniture.completedAt && (!furniture.acceptedAt || !furniture.rooms || furniture.scopeReturn || !furniture.noExistingFurniture && furniture.rooms.some(room => !workflowFurnitureRoomReady(furniture, room)))) return unavailable("existing_furniture_dimensions");
  if (workflowEnabled && planning.completedAt) {
    const planningStageId = project.designWorkflowStages?.find(stage => stage.type === "space_planning_tentative_look_feel")?.id;
    const approval = planning.spacePlanningApproval;
    const matchingEvents = workflow.history.filter(event => event.action === "space_planning_complete" && event.stageId === planningStageId && event.at === planning.completedAt);
    const confirmation = matchingEvents[0];
    if (!approval || matchingEvents.length !== 1 || confirmation?.actorId !== project.clientId || confirmation.actorRole !== "client" || confirmation.onBehalfOfClient ||
        confirmation.data?.estimateId !== approval.estimateId || confirmation.data?.designPlanVersion !== approval.designPlanVersion ||
        confirmation.data?.reviewRoundId !== approval.reviewRoundId || confirmation.data?.completedAt !== planning.completedAt) return unavailable("space_planning_tentative_look_feel");
  }
  const isPaused = workflowIsPaused(workflow);
  let current: DesignStageType = "space_planning_tentative_look_feel";
  if (workflowEnabled) {
    if (!internal.completedAt) current = "internal_kickoff";
    else if (!kickoff.completedAt) current = "client_kickoff";
    else if (!keys.completedAt || !keys.handedOverAt || !keys.receivedAt) current = "key_collection";
    else if (!measurement.completedAt) current = "site_measurement";
    else if (!furniture.completedAt) current = "existing_furniture_dimensions";
  }
  result.currentStage = { key: current, label: stageLabel(current) };

  if (current === "internal_kickoff") {
    add(current, "internal-kickoff:complete", "Complete Internal Kick off and submit the signed checklist.", "designer", designerIds);
  } else if (current === "client_kickoff") {
    if (!kickoff.requestedAt) add(current, "client-kickoff:request", "Request Client Kick off or record that the meeting is not required.", "designer", designerIds);
    else if (!kickoff.scheduledAt) add(current, "client-kickoff:schedule", "Choose a date for Client Kick off.", "client", clientIds);
    else {
      const scheduledAt = recordedDate(kickoff.scheduledAt);
      if (!scheduledAt) return unavailable(current);
      const future = Date.parse(scheduledAt) > Date.parse(input.serverNow);
      add(current, "client-kickoff:complete", future ? "Client Kick off is scheduled." : "Review the Internal Kick off document and confirm Client Kick off is complete.", "client", clientIds, { scheduledAt, ...(future ? { state: "scheduled" as const, blocker: null } : {}) });
    }
  } else if (current === "key_collection") {
    if (!keys.handedOverAt) add(current, "keys:handover", "Confirm that the keys have been handed over.", "client", clientIds);
    if (!keys.receivedAt) add(current, "keys:receipt", "Confirm receipt of the keys.", "designer", designerIds);
    if (keys.handedOverAt && keys.receivedAt && !keys.completedAt) return unavailable(current);
  } else if (current === "site_measurement" && !isPaused) {
    if (!measurement.assignedDesignerId) add(current, "measurement:assign", "Assign a project Designer to complete the site measurement.", "designer", designerIds);
    else add(current, "measurement:complete", "Complete the site measurement and upload the site photos or videos.", "designer", project.assignedDesignerIds.includes(measurement.assignedDesignerId) ? [measurement.assignedDesignerId] : []);
  } else if (current === "existing_furniture_dimensions") {
    if (input.issues?.furniture) return unavailable(current);
    if (!furniture.rooms || furniture.scopeReturn) {
      add(current, "furniture:prepare", furniture.scopeReturn ? "Revise and resubmit the existing-furniture requirements and dimensions." : "Declare existing-furniture requirements and submit the dimensions.", "designer", designerIds);
    } else if (!furniture.acceptedAt) {
      add(current, "furniture:requirements-review", furniture.requirementsSubmissionEventId ? "Review the existing-furniture requirements and dimensions." : "Review and accept the existing-furniture requirements.", "client", clientIds);
    } else {
      for (const room of furniture.rooms.filter(room => room.required)) {
        if (workflowFurnitureRoomReady(furniture, room)) continue;
        if (room.dimensions?.status === "pending") add(current, `furniture:${room.id}:review`, "Review the submitted furniture dimensions.", "client", clientIds);
        else if (!room.dimensions || room.dimensions.status === "changes_requested") {
          // Supported separate-submission path allows either the Client or project Designer to provide dimensions.
          add(current, `furniture:${room.id}:submit-client`, "Provide or resubmit the outstanding furniture dimensions.", "client", clientIds);
          add(current, `furniture:${room.id}:submit-designer`, "Provide or resubmit the outstanding furniture dimensions for the Client.", "designer", designerIds);
        } else return unavailable(current);
      }
      if (!result.pendingActions.length) return unavailable(current);
    }
  }

  if (isPaused) {
    add("site_measurement", "measurement:restore-access", "Confirm that site access has been restored.", "client", clientIds, { blocker: "The workflow is paused while site access is unavailable." });
    result.state = "paused";
  }
  // Assignment can proceed as soon as the commercial approval is recorded;
  // preparation/upload still follows the stage prerequisites below.
  if (designAssignmentPending) {
    if (invalidDesignSource) return unavailable("space_planning_tentative_look_feel");
    addDesignAssignment();
  }

  const designCanUpload = !isPaused && workflowSubmissionBlockers(workflow, undefined, "upload").length === 0;
  const designActive = current === "space_planning_tentative_look_feel" || designCanUpload;
  if (designActive) {
    const design = input.design;
    const designStatus = estimate.designPlanStatus;
    if (invalidDesignSource) return unavailable("space_planning_tentative_look_feel");
    if (!workflowEnabled && !designStatus) {
      if (design || input.tasks.length) return unavailable("space_planning_tentative_look_feel");
      result.currentStage = null;
      return finish();
    }
    if (!planning.completedAt) {
      const key = "space_planning_tentative_look_feel";
      if (!designStatus || designStatus === "pending_assignment") {
        addDesignAssignment();
      } else if (["assigned", "in_progress", "changes_requested"].includes(designStatus)) {
        if (!design || design.entryBlockingReasons.length) return unavailable(key);
        if (!isPaused) add(key, `estimate:${estimate.id}:prepare-design`, designStatus === "changes_requested" ? "Revise the Design plan and submit it again for Client review." : current === "existing_furniture_dimensions" ? "Prepare and upload the Design plan while furniture confirmation is in progress." : "Prepare and submit the Design plan for Client review.", "designer", [estimate.designPlanDesignerId]);
      } else if (designStatus === "ready_for_client") {
        if (!design || design.entryBlockingReasons.length) return unavailable(key);
        add(key, `estimate:${estimate.id}:design-review:${design.reviewRoundId}`, "Review and approve the submitted Design plan or request changes.", "client", clientIds);
      } else if (designStatus === "approved") {
        if (!design?.readyForCompletion) return unavailable(key);
        if (workflowEnabled && !isPaused && workflowStagePrerequisiteBlockers(workflow, key).length === 0) add(key, `design:${design.reviewRoundId}:acknowledge`, "Acknowledge the approved Design plan and complete the design workflow stage.", "client", clientIds);
      } else return unavailable(key);
    } else if (!design?.readyForCompletion || planning.spacePlanningApproval?.estimateId !== estimate.id || planning.spacePlanningApproval.designPlanVersion !== design.designPlanVersion || planning.spacePlanningApproval.reviewRoundId !== design.reviewRoundId) return unavailable("space_planning_tentative_look_feel");
  }

  if (estimate.designPlanStatus === "approved" && input.design?.readyForCompletion) {
    if (input.issues?.execution) return unavailable("execution");
    if (project.completionAuthority !== "vendor_client" && input.execution?.hasCurrentProcurementItems) {
      const earlierActions = result.pendingActions;
      result.pendingActions = [];
      result.currentStage = null;
      add("purchase_order", "purchase-order:prepare", "Review section totals and send the project purchase order request to Super Admin.",
        "procurement", input.execution.procurementOwnerIds);
      result.pendingActions.push(...earlierActions);
      return finish();
    }
    if (project.completionAuthority === "vendor_client") {
      const completion = input.execution?.completion;
      if (!completion || completion.projectId !== project.id || completion.projectName !== project.name ||
          completion.projectStatus !== project.status || completion.completionAuthorityVersion !== project.completionAuthorityVersion ||
          completion.estimateSource.estimateId !== estimate.id || completion.estimateSource.estimateVersion !== commercial.estimateVersion ||
          completion.completedAt !== null && !recordedDate(completion.completedAt) ||
          (project.status === "completed") !== Boolean(completion.completedAt) ||
          (project.status === "completed") !== Boolean(completion.completionDecisionId) ||
          completion.completionDecisionId !== (project.completionDecisionId ?? null) ||
          completion.readyForCompletion && completion.pendingOwner !== "super_admin") return unavailable("execution");
      if (project.status === "completed") {
        result.pendingActions = [];
        result.currentStage = null;
        return finish();
      }
      // Keep outstanding design acknowledgements visible, with the active
      // purchase-order or vendor decision first once Design is approved.
      const earlierActions = result.pendingActions;
      result.pendingActions = [];
      result.currentStage = null;
      const owner = completion.pendingOwner;
      if (owner === "none") return unavailable("execution");
      if (owner === "procurement") {
        add("purchase_order", "purchase-order:prepare", completion.blockers.some(blocker => blocker.code === "ORDER_PENDING")
          ? "Revise and submit the purchase order for approval." : "Create purchase orders or record a scope decision for uncovered approved items.",
        "procurement", input.execution?.procurementOwnerIds ?? []);
      } else if (owner === "super_admin") {
        if (completion.readyForCompletion) add("final_completion", "project:complete", "Review the accepted work and mark the project complete.", "super_admin", input.participants.filter(person => person.role === "super_admin").map(person => person.id));
        else if (completion.blockers.some(blocker => blocker.code === "ORDER_PENDING")) add("purchase_order", "purchase-order:approve", "Review the submitted purchase order and approve it or request changes.", "super_admin", input.participants.filter(person => person.role === "super_admin").map(person => person.id));
        else if (completion.blockers.some(blocker => blocker.code === "PROJECT_NOT_ACTIVE")) add("execution", "project:resume", "Resolve the project hold before final completion.", "super_admin", input.participants.filter(person => person.role === "super_admin").map(person => person.id));
        else return unavailable("execution");
      } else if (owner === "vendor") {
        if (!completion.approvedOrders.length || completion.vendorWork.pendingAssignments < 1) return unavailable("vendor_work");
        const vendorIds = input.execution?.pendingVendorUserIds ?? [];
        add("vendor_work", "vendor-work:deliver", "Update and submit the assigned work with any supporting images.", "vendor", vendorIds,
          vendorIds.length ? {} : { blocker: "Invite an active user for the assigned Vendor." });
      } else if (owner === "site_manager") {
        add("site_execution", "site-completion:submit", "Update site progress to 100% and send completion to the Client.",
          "site_manager", input.tasks.filter(task => task.kind === "site_execution" && task.assigneeRole === "site_manager")
            .map(task => task.assigneeUserId));
      } else if (owner === "client") {
        if (completion.siteCompletion?.status === "pending_client") {
          add("client_completion", "site-completion:client-review", "Review the Site Manager completion and accept it or request changes.", "client", clientIds);
        } else {
          if (completion.vendorWork.openReviews < 1) return unavailable("client_vendor_review");
          add("client_vendor_review", "vendor-work:client-review", "Review submitted Vendor work and approve it or request changes.", "client", clientIds);
        }
      }
      result.pendingActions.push(...earlierActions);
      const primary = result.pendingActions[0];
      result.currentStage = primary ? { key: primary.stageKey, label: primary.stageLabel } : null;
      return finish();
    }
    if (!project.completionAuthority && project.status !== "completed") return unavailable("execution");
    let blueprints: ReturnType<typeof projectWorkflowBlueprints>;
    try { blueprints = projectWorkflowBlueprints({ estimateId: estimate.id, estimateVersion: Math.max(1, estimate.version - 1), lineItems: estimate.lineItems }); }
    catch { return unavailable("execution"); }
    const tasks = input.tasks.filter(task => task.kind !== "design_plan_upload");
    const matchesBlueprint = (task: ChatWorkflowSource, blueprint: (typeof blueprints)[number]) => blueprint.kind === task.kind && blueprint.assigneeRole === task.assigneeRole && blueprint.sourceSectionId === task.sourceSectionId && blueprint.sourceLineItemKey === task.sourceLineItemKey;
    if (new Set(tasks.map(task => task.id)).size !== tasks.length || blueprints.some(blueprint => tasks.filter(task => matchesBlueprint(task, blueprint)).length !== 1) || tasks.some(task => task.projectId !== project.id || task.estimateId !== estimate.id || task.designPlanVersion !== input.design!.designPlanVersion || !["open", "in_progress", "completed"].includes(task.status ?? "") || !blueprints.some(blueprint => matchesBlueprint(task, blueprint)))) return unavailable("execution");
    for (const task of [...tasks].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))) {
      if (task.status === "completed") continue;
      const action = { procurement: "Prepare and complete procurement for the approved project.", finance: "Establish and complete the approved project budget controls.", site_execution: "Coordinate and complete site execution.", trade_execution: "Complete the assigned trade work." }[task.kind as Exclude<ChatWorkflowSource["kind"], "design_plan_upload">];
      add("execution", `task:${task.id}`, action, task.assigneeRole, [task.assigneeUserId], { deadlineAt: recordedDate(task.dueAt) });
    }
  }
  // An outstanding calendar acceptance remains visible, but the current stage's
  // action stays first when later work has already started.
  if (workflowEnabled && !internal.calendarAcceptedAt) add("internal_kickoff", "internal-kickoff:calendar", "Accept the Internal Kick off calendar meeting.", "estimator_sales", [project.assignedEstimatorId]);
  const primary = result.pendingActions[0];
  result.currentStage = primary ? { key: primary.stageKey, label: primary.stageLabel } : null;
  return finish();
}

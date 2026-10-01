import type { ChatActor } from "../contracts/project-chat.js";
import type { ProjectStatusSummary } from "../contracts/project-status.js";
import type { ProjectCompletionSummary } from "../domain/project-completion.js";
import { deriveProjectStatus, type ProjectStatusInput } from "../domain/project-status.js";
import { resolveChatMembership } from "../domain/project-chat-membership.js";
import { chatNotFound } from "../domain/project-chat.js";
import { ApiError } from "../middleware/errors.js";
import { RepositoryConflictError, type AppRepository } from "../repositories/types.js";
import type { ChatEstimateSource, ChatSources, ProjectChatRepository } from "../repositories/project-chat.js";
import { readMongoProjectStatusExecutionEvidence, type ProjectStatusEstimateEvidence, type ProjectStatusExecutionEvidence } from "../repositories/project-status.js";
import { authenticatedChatUser } from "./project-chat-context.js";
import type { Clock } from "./workflow.js";
import { projectStatusWorkflowEvidence } from "./design-workflow-state.service.js";
import { readProjectCompletionSummary } from "./project-completion.service.js";
import type { ClientSession } from "mongoose";

export interface ProjectStatusService {
  get(actor: ChatActor, projectId: string): Promise<ProjectStatusSummary>;
}

const validDate = (value: string | null) => Boolean(value && Number.isFinite(Date.parse(value)));
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

function commercialSource(sources: ChatSources, evidence: ProjectStatusEstimateEvidence): Pick<ProjectStatusInput, "estimate" | "commercial"> {
  const projectId = sources.project.id;
  const conflict = (estimate: ChatEstimateSource | null = null): Pick<ProjectStatusInput, "estimate" | "commercial"> => ({ estimate,
    commercial: { state: "conflict", estimateId: estimate?.id ?? null, estimateVersion: estimate?.version ?? null } });
  if (evidence.projectId !== projectId) return conflict();
  const leadById = new Map(sources.leads.map(lead => [lead.id, lead]));
  const candidates = sources.estimates.filter(estimate => estimate.projectId === projectId || leadById.get(estimate.leadId)?.projectId === projectId);
  if (candidates.some(estimate => {
    const lead = leadById.get(estimate.leadId);
    return !lead || estimate.projectId && estimate.projectId !== projectId || lead.projectId && lead.projectId !== projectId;
  })) return conflict();
  const approved = candidates.filter(estimate => estimate.status === "client_approved");
  const estimate = approved.length === 1 ? approved[0]! : approved.length === 0 && candidates.length === 1 ? candidates[0]! : null;
  if (!estimate) {
    if (candidates.length || evidence.estimates.length || evidence.rounds.length || evidence.financeSource) return conflict();
    return { estimate: null, commercial: { state: "none", estimateId: null, estimateVersion: null } };
  }
  if (!positiveInteger(estimate.version) || new Set(candidates.map(row => row.id)).size !== candidates.length ||
      evidence.estimates.length !== candidates.length || evidence.estimates.some(row => {
        const projected = candidates.find(candidate => candidate.id === row.id);
        return !projected || row.leadId !== projected.leadId || row.projectId !== projected.projectId || row.version !== projected.version || row.status !== projected.status;
      })) return conflict(estimate);
  if (evidence.rounds.some(round => {
    const owner = candidates.find(candidate => candidate.id === round.estimateId);
    return !owner || owner.leadId !== round.leadId || round.projectId && round.projectId !== projectId ||
      !positiveInteger(round.estimateVersion) || !positiveInteger(round.sendGeneration) || !validDate(round.createdAt);
  })) return conflict(estimate);
  const rounds = evidence.rounds.filter(round => round.estimateId === estimate.id).sort((a, b) => b.sendGeneration - a.sendGeneration);
  if (new Set(rounds.map(round => round.id)).size !== rounds.length || new Set(rounds.map(round => round.sendGeneration)).size !== rounds.length ||
      rounds.some(round => round.estimateVersion > estimate.version)) return conflict(estimate);
  const latest = rounds[0];
  const row = evidence.estimates.find(item => item.id === estimate.id)!;
  const commercial: ProjectStatusInput["commercial"] = { state: "none", estimateId: estimate.id, estimateVersion: estimate.version };
  if (estimate.status === "sent_to_client") {
    if (!latest || latest.status !== "pending" || latest.estimateVersion !== estimate.version || latest.decision || latest.decisionSource || latest.decidedById || latest.decidedAt || evidence.financeSource) return conflict(estimate);
    commercial.state = "pending";
  } else if (estimate.status === "client_approved") {
    const version = estimate.version - 1;
    const validDecision = latest && latest.status === "approved" && latest.decision === "approve" && validDate(latest.decidedAt) &&
      latest.decidedAt === row.clientDecisionAt && Boolean(latest.decidedById) && (
        latest.decisionSource === "client_portal" && latest.decidedById === sources.project.clientId ||
        latest.decisionSource === "admin_proof" && latest.proofValid);
    const finance = evidence.financeSource;
    if (estimate.projectId !== projectId || !validDecision || !positiveInteger(version) || latest.estimateVersion !== version ||
        rounds.filter(round => round.status === "approved").length !== 1 ||
        finance && (finance.estimateId !== estimate.id || finance.estimateVersion !== version || finance.reviewRoundId !== latest.id)) return conflict(estimate);
    commercial.state = "approved";
    commercial.estimateVersion = version;
  } else if (evidence.financeSource || rounds.some(round => round.status === "approved") || latest && (
      latest.status === "changes_requested" && (latest.decision !== "request_changes" || !validDate(latest.decidedAt) || latest.estimateVersion >= estimate.version) ||
      latest.status === "pending" && (latest.decision !== null || latest.estimateVersion >= estimate.version && estimate.status !== "client_changes_requested") ||
      !["pending", "changes_requested"].includes(latest.status))) return conflict(estimate);
  return { estimate, commercial };
}

const emptyExecutionEvidence = (): ProjectStatusExecutionEvidence => ({ hasApprovedOrder: false, people: [], procurementOwnerIds: [], pendingVendorUserIds: [], vendorMemberIds: [] });

export function createProjectStatusService(options: {
  repository: AppRepository;
  chatRepository: ProjectChatRepository;
  clock?: Clock;
  /** Allows the memory repository to exercise the same status projection without a Mongo session. */
  executionEvidence?: (projectId: string, session?: ClientSession) => Promise<ProjectStatusExecutionEvidence>;
  completionSummary?: (projectId: string, session?: ClientSession) => Promise<ProjectCompletionSummary>;
}): ProjectStatusService {
  const clock = options.clock ?? (() => new Date());
  const executionEvidence = options.executionEvidence ?? ((projectId: string, session?: ClientSession) =>
    session ? readMongoProjectStatusExecutionEvidence(projectId, session) : Promise.resolve(emptyExecutionEvidence()));
  const completionSummary = options.completionSummary ?? ((projectId: string, session?: ClientSession) =>
    session ? readProjectCompletionSummary(projectId, session) : Promise.reject(new ApiError(409, "PROJECT_COMPLETION_LINEAGE_CONFLICT", "The completion snapshot is unavailable.")));
  return {
    async get(actor, projectId) {
      return options.chatRepository.snapshot(async tx => {
        // Membership and every source read share one snapshot; no chat office-hours or write path.
        const user = await authenticatedChatUser(tx, actor, clock, "projects.status.read");
        const sources = await tx.sources(projectId);
        if (!sources) chatNotFound();
        const membership = resolveChatMembership(sources, await tx.selections(projectId));
        const execution = await executionEvidence(projectId, tx.session);
        if (actor.role === "vendor") {
          if (!user.vendorId || !execution.people.some(person => person.id === actor.id && person.role === "vendor" && person.vendorId === user.vendorId) ||
            !execution.vendorMemberIds.includes(actor.id)) chatNotFound();
        } else if (!membership.participants.some(person => person.id === actor.id) &&
            !execution.people.some(person => person.id === actor.id && person.role === "procurement" && actor.role === "procurement")) {
          chatNotFound();
        }
        const estimateEvidence = await tx.app.findProjectStatusEstimateEvidence(projectId);
        const selected = commercialSource(sources, estimateEvidence);
        const input: ProjectStatusInput = {
          project: sources.project,
          participants: [...membership.participants.map(({ id, name, role }) => ({ id, name, role })), ...execution.people],
          ...selected,
          salesOwnerIds: [...sources.leads.filter(lead => lead.projectId === projectId).map(lead => lead.ownerId), ...(selected.estimate ? [selected.estimate.ownerId] : [])],
          designAssignmentOwnerIds: sources.grants.filter(grant => grant.projectId === projectId && grant.active && grant.source === "admin_initiator").map(grant => grant.userId),
          workflow: null, design: null, tasks: sources.workflowTasks, serverNow: clock().toISOString(), issues: {},
          execution: { completion: null, hasApprovedOrder: execution.hasApprovedOrder,
            procurementOwnerIds: execution.procurementOwnerIds, pendingVendorUserIds: execution.pendingVendorUserIds,
            hasCurrentProcurementItems: Boolean(selected.commercial.state === "approved" && execution.procurementSources?.some(source =>
              source.estimateId === selected.commercial.estimateId && source.estimateVersion === selected.commercial.estimateVersion &&
              source.estimateReviewRoundId === estimateEvidence.financeSource?.reviewRoundId)) }
        };
        if (selected.commercial.state === "approved") {
          input.workflow = await tx.app.findDesignWorkflowState(projectId);
          if (input.workflow) Object.assign(input.issues!, projectStatusWorkflowEvidence(input.workflow, sources.project.designWorkflowStages ?? []));
          try {
            const rooms = await tx.app.findDesignWorkflowRoomContext(projectId, true);
            if (!rooms || rooms.estimateId !== selected.estimate?.id || rooms.estimateVersion !== selected.commercial.estimateVersion) input.commercial.state = "conflict";
            const furniture = input.workflow?.stages.existing_furniture_dimensions;
            if (furniture?.requirementsSubmissionEventId && rooms && !furniture.noExistingFurniture && (
              furniture.rooms?.length !== rooms.rooms.length || furniture.rooms?.some(room => !rooms.rooms.some(source => source.id === room.id))
            )) input.issues!.furniture = true;
          } catch (error) {
            if (!(error instanceof RepositoryConflictError)) throw error;
            input.commercial.state = "conflict";
          }
          if (input.commercial.state === "approved") {
            try {
              input.design = await tx.app.findDesignWorkflowSpacePlanningSource(projectId);
              if (input.design && (input.design.estimateId !== selected.estimate?.id || input.design.designPlanVersion !== selected.estimate?.designPlanVersion ||
                input.design.sourceIssue === "source_conflict")) input.issues!.design = true;
            } catch (error) {
              if (!(error instanceof RepositoryConflictError)) throw error;
              input.issues!.design = true;
            }
          }
          if (input.commercial.state === "approved" && sources.project.completionAuthority === "vendor_client" &&
              selected.estimate?.designPlanStatus === "approved" && input.design?.readyForCompletion) {
            try {
              input.execution!.completion = await completionSummary(projectId, tx.session);
            } catch (error) {
              if (!(error instanceof ApiError && error.status === 409) && !(error instanceof RepositoryConflictError)) throw error;
              input.issues!.execution = true;
            }
          }
        }
        return deriveProjectStatus(input);
      });
    }
  };
}

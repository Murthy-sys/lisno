import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CALENDAR_DAY_MS as DAY, DESIGN_WORKFLOW_ACTIONS, emptyDesignWorkflowState, WORKFLOW_STAGE_CLOCKS, workflowStageElapsedMs, workflowStageStartAt, workflowStagePrerequisiteBlockers, workflowIsPaused, workflowPausedMs, workflowSubmissionBlockers, type DesignWorkflowAction, type DesignWorkflowState, type WorkflowStageState } from "../domain/design-workflow-state.js";
import type { DesignStageType, ProjectDesignWorkflowStage } from "../domain/design-workflow.js";
import { sha256Hex, type StoredEstimateClientResponseProof } from "../domain/estimate-client-review.js";
import { ApiError } from "../middleware/errors.js";
import { RepositoryConflictError, type AppRepository } from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";
import { requireActor, type Clock } from "./workflow.js";

export const workflowActionSchema = z.object({
  expectedVersion: z.coerce.number().int().nonnegative(),
  action: z.enum(DESIGN_WORKFLOW_ACTIONS),
  stageId: z.string().min(1).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
  note: z.string().trim().max(2000).default(""),
  data: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
  }, z.record(z.unknown()).default({}))
}).strict();
export type WorkflowActionInput = z.infer<typeof workflowActionSchema>;
export type WorkflowCapabilities = { designer: boolean; client: boolean; sales: boolean; finance: boolean; representative: boolean; manager: boolean };
export interface WorkflowAvailableAction { id: DesignWorkflowAction; label: string; actor: "designer" | "client" | "sales" | "finance"; requiresProof: boolean; disabledReason?: string }
const ACTIONS: Record<Exclude<DesignWorkflowAction, "confirm_initial_payment">, { type: DesignStageType; label: string; actor: WorkflowAvailableAction["actor"]; file?: boolean }> = {
  internal_kickoff_complete: { type: "internal_kickoff", label: "Complete Internal Kick off and save", actor: "designer", file: true },
  sales_calendar_accept: { type: "internal_kickoff", label: "Accept calendar meeting", actor: "sales" },
  client_kickoff_request: { type: "client_kickoff", label: "Request Client kickoff", actor: "designer" },
  client_kickoff_schedule: { type: "client_kickoff", label: "Choose meeting date", actor: "client" },
  client_kickoff_complete: { type: "client_kickoff", label: "Complete Client Kick off", actor: "client" },
  client_kickoff_not_required: { type: "client_kickoff", label: "Mark meeting not necessary", actor: "designer" },
  keys_handed_over: { type: "key_collection", label: "Confirm keys handed over", actor: "client" },
  keys_received: { type: "key_collection", label: "Confirm keys received", actor: "designer" },
  measurement_assign: { type: "site_measurement", label: "Assign measurement team member", actor: "designer" },
  measurement_access_block: { type: "site_measurement", label: "Report site access unavailable", actor: "client" },
  measurement_access_restore: { type: "site_measurement", label: "Confirm site access restored", actor: "client" },
  measurement_complete: { type: "site_measurement", label: "Complete measurement and upload sketch", actor: "designer", file: true },
  furniture_scope: { type: "existing_furniture_dimensions", label: "Declare existing-furniture requirements", actor: "designer" },
  furniture_accept: { type: "existing_furniture_dimensions", label: "Accept furniture requirements", actor: "client" },
  furniture_upload: { type: "existing_furniture_dimensions", label: "Upload furniture dimensions", actor: "client", file: true },
  furniture_proceed: { type: "existing_furniture_dimensions", label: "Confirm selected rooms can proceed", actor: "client" }
};
function missing(): never { throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); }
function blocked(reasons: string[]): never { throw new ApiError(409, "DESIGN_WORKFLOW_BLOCKED", reasons.join(" ")); }
export type WorkflowPaymentStatus = "awaiting_estimate_approval" | "awaiting_payment" | "received";
type WorkflowStageContext = { paymentStatus: WorkflowPaymentStatus; projectId?: string; internalKickoffStageId?: string };
const PAYMENT_APPROVAL_REQUIRED = "The project needs a confirmed approved estimate before Initial payment received can be recorded.";
const PAYMENT_SOURCE_ISSUE = "Reconcile the project's approved estimate source before confirming Initial payment received.";
const KICKOFF_DOCUMENT_UNAVAILABLE = "The submitted Internal Kick off document is unavailable. Contact your Designer to resolve the missing document.";

function submittedInternalKickoffEvent(state: DesignWorkflowState, projectId?: string, stageId?: string) {
  const completedAt = state.stages.internal_kickoff?.completedAt;
  if (!projectId || state.projectId !== projectId || !stageId || !state.initialPaymentAt || !completedAt) return undefined;
  const matches = state.history.filter((event) => event.action === "internal_kickoff_complete" && event.stageId === stageId && event.at === completedAt && event.actorRole === "designer" && !event.onBehalfOfClient && event.proof);
  return matches.length === 1 ? matches[0] : undefined;
}

function paymentBlockingReason(context?: WorkflowStageContext): string {
  return context?.paymentStatus === "awaiting_estimate_approval" ? "Awaiting estimate approval before initial-payment confirmation." : "Awaiting Super Admin confirmation of Initial payment received.";
}

async function paymentApprovalSource(repository: AppRepository, projectId: string) {
  try {
    const source = await repository.findDesignWorkflowRoomContext(projectId);
    return { source, issue: source ? undefined : PAYMENT_APPROVAL_REQUIRED };
  } catch (error) {
    if (!(error instanceof RepositoryConflictError)) throw error;
    return { source: null, issue: PAYMENT_SOURCE_ISSUE };
  }
}

export async function projectInitialPayment(repository: AppRepository, projectId: string, state: DesignWorkflowState, canConfirm: boolean) {
  if (state.initialPaymentAt) return { confirmedAt: state.initialPaymentAt, canConfirm: false, version: state.version, status: "received" as WorkflowPaymentStatus };
  const { source, issue } = await paymentApprovalSource(repository, projectId);
  return { confirmedAt: null, canConfirm: canConfirm && Boolean(source), version: state.version, status: (source ? "awaiting_payment" : "awaiting_estimate_approval") as WorkflowPaymentStatus, ...(issue ? { issue } : {}) };
}

export async function requireDesignWorkflowScope(repository: AppRepository, actor: PublicUser, projectId: string, allowFinance = false) {
  const user = await requireActor(repository, actor);
  const project = await repository.findProjectById(projectId);
  if (!project) missing();
  const representative = user.role === "super_admin" || user.role === "admin" && Boolean(await repository.findActiveProjectAccessGrant(user.id, projectId, "projects").then((grant) => grant?.source === "admin_initiator" && grant.active));
  const designer = user.role === "designer" && (project.assignedDesignerIds.includes(user.id) || project.initiatingDesignerId === user.id);
  const client = user.role === "client" && project.clientId === user.id;
  const sales = user.role === "estimator_sales" && project.assignedEstimatorId === user.id;
  const finance = user.role === "finance_head" || user.role === "super_admin";
  const manager = user.role === "design_head" || user.role === "design_manager" && project.managerId === user.id;
  if (!(representative || designer || client || sales || manager || allowFinance && finance)) missing();
  return { project, capabilities: { designer, client: client || representative, sales, finance, representative, manager: manager || representative } };
}
export async function assertDesignWorkflowSubmissionAllowed(repository: AppRepository, projectId: string, options: { lock?: boolean; roomIds?: string[]; phase?: "upload" | "submission" } = {}) {
  const project = await repository.findProjectById(projectId);
  if (!project) missing();
  if (!project.designWorkflowStages) return;
  const state = await repository.findDesignWorkflowState(projectId) ?? emptyDesignWorkflowState(projectId);
  const reasons = workflowSubmissionBlockers(state, options.roomIds, options.phase);
  const furniture = state.stages.existing_furniture_dimensions;
  if (options.phase !== "upload" && furniture?.acceptedAt && !furniture.noExistingFurniture) {
    const context = await repository.findDesignWorkflowRoomContext(projectId).catch((error: unknown) => {
      if (error instanceof RepositoryConflictError) blocked(["The project approved estimate source must be reconciled before submission."]);
      throw error;
    });
    if (!context || furniture.scopeEstimateId !== context.estimateId || furniture.scopeEstimateVersion !== context.estimateVersion) reasons.push("The approved estimate no longer matches this furniture confirmation. Reconcile the project approved source before submitting.");
  }
  if (reasons.length) blocked(reasons);
  if (options.lock) {
    try { await repository.saveDesignWorkflowState(projectId, state.version, state); }
    catch (error) { if (error instanceof RepositoryConflictError) blocked(["The workflow changed. Refresh before submitting."]); throw error; }
  }
}
function allowed(state: DesignWorkflowState, action: Exclude<DesignWorkflowAction, "confirm_initial_payment">, at: number, actorId?: string): boolean {
  if (!state.initialPaymentAt) return false;
  const paused = workflowIsPaused(state);
  if (action === "measurement_access_restore") return paused;
  if (action !== "sales_calendar_accept" && !workflowStageStartAt(state, ACTIONS[action].type, at)) return false;
  if (paused && action === "measurement_complete") return false;
  const internal = state.stages.internal_kickoff ?? {};
  const kickoff = state.stages.client_kickoff ?? {};
  const keys = state.stages.key_collection ?? {};
  const measurement = state.stages.site_measurement ?? {};
  const furniture = state.stages.existing_furniture_dimensions ?? {};
  switch (action) {
    case "internal_kickoff_complete": return !internal.completedAt;
    case "sales_calendar_accept": return !internal.calendarAcceptedAt;
    case "client_kickoff_request": return !kickoff.completedAt && !kickoff.requestedAt;
    case "client_kickoff_schedule": return Boolean(kickoff.requestedAt && !kickoff.completedAt);
    case "client_kickoff_complete": return !kickoff.completedAt;
    case "client_kickoff_not_required": return !kickoff.completedAt;
    case "keys_handed_over": return !keys.handedOverAt;
    case "keys_received": return !keys.receivedAt;
    case "measurement_assign": return !measurement.completedAt;
    case "measurement_access_block": return !measurement.completedAt && !paused;
    case "measurement_complete": return !measurement.completedAt && Boolean(measurement.assignedDesignerId) && (!actorId || measurement.assignedDesignerId === actorId);
    case "furniture_scope": return !furniture.acceptedAt;
    case "furniture_accept": return Boolean(furniture.rooms) && !furniture.acceptedAt;
    case "furniture_upload": return Boolean(furniture.acceptedAt) && Boolean(furniture.rooms?.some((room) => room.required && !room.uploadedAt));
    case "furniture_proceed": return Boolean(furniture.acceptedAt) && Boolean(furniture.rooms?.some((room) => room.required && !room.uploadedAt && !room.proceed));
  }
}
export function workflowAvailableActions(state: DesignWorkflowState, type: DesignStageType, capabilities: WorkflowCapabilities, at: number, actorId?: string, context?: WorkflowStageContext): WorkflowAvailableAction[] {
  return Object.entries(ACTIONS).flatMap(([id, definition]) => {
    if (definition.type !== type || !capabilities[definition.actor]) return [];
    let disabledReason: string | undefined;
    if (id === "internal_kickoff_complete") {
      if (state.stages.internal_kickoff?.completedAt) return [];
      if (!state.initialPaymentAt) disabledReason = paymentBlockingReason(context);
    } else if (!allowed(state, id as keyof typeof ACTIONS, at, actorId)) return [];
    if (id === "client_kickoff_complete" && !submittedInternalKickoffEvent(state, context?.projectId, context?.internalKickoffStageId)) disabledReason = KICKOFF_DOCUMENT_UNAVAILABLE;
    return [{ id: id as keyof typeof ACTIONS, label: definition.label, actor: definition.actor, requiresProof: Boolean(definition.file || definition.actor === "client" && capabilities.representative), ...(disabledReason ? { disabledReason } : {}) }];
  });
}
function dateField(data: Record<string, unknown>, key: string, at: number, future: boolean, optional = false): string | undefined {
  if (optional && data[key] === undefined) return undefined;
  const value = z.string().datetime({ offset: true }).safeParse(data[key]);
  if (!value.success || (future ? Date.parse(value.data) < at : Date.parse(value.data) > at)) throw new ApiError(400, "INVALID_WORKFLOW_DATE", future ? "Choose a current or future meeting date." : "A completed meeting cannot have a future date.");
  return value.data;
}
function checkData(data: Record<string, unknown>, fields: string[]) {
  if (Object.keys(data).some((key) => !fields.includes(key))) throw new ApiError(400, "INVALID_WORKFLOW_ACTION", "This action contains unsupported fields.");
}
export function createDesignWorkflowStateService(repository: AppRepository, audit: AuditService, clock: Clock) {
  return {
    async queue(actor: PublicUser) {
      const user = await requireActor(repository, actor);
      if (user.role !== "finance_head" && user.role !== "super_admin") missing();
      const rows = await Promise.all((await repository.listDesignWorkflowPaymentProjects()).map(async (project) => {
        const state = await repository.findDesignWorkflowState(project.id) ?? emptyDesignWorkflowState(project.id);
        const payment = await projectInitialPayment(repository, project.id, state, true);
        return payment.canConfirm ? { projectId: project.id, projectName: project.name, ...payment } : null;
      }));
      return rows.filter((row): row is NonNullable<typeof row> => row !== null);
    },
    async preflight(actor: PublicUser, projectId: string) { return requireDesignWorkflowScope(repository, actor, projectId, true); },
    async proof(actor: PublicUser, projectId: string, eventId: string) {
      const { project, capabilities } = await requireDesignWorkflowScope(repository, actor, projectId);
      const state = await repository.findDesignWorkflowState(projectId);
      const event = state?.history.find((event) => event.id === eventId);
      if (!event?.proof) missing();
      if (actor.role === "client" && event.action === "internal_kickoff_complete" && submittedInternalKickoffEvent(state!, projectId, project.designWorkflowStages?.find((stage) => stage.type === "internal_kickoff")?.id)?.id !== eventId) missing();
      if (!capabilities.client && !capabilities.designer && !capabilities.manager && !capabilities.sales) missing();
      return event.proof;
    },
    async act(actor: PublicUser, projectId: string, input: WorkflowActionInput, proof: StoredEstimateClientResponseProof | null) {
      const at = clock();
      const timestamp = at.toISOString();
      let attemptedWrite = false;
      const hash = sha256Hex(Buffer.from(JSON.stringify({ action: input.action, stageId: input.stageId, data: input.data, note: input.note, proof: proof?.sha256 })));
      try {
        return await repository.runInTransaction(async (tx) => {
          await tx.coordinateAuthorizationMutation();
          const { project, capabilities } = await requireDesignWorkflowScope(tx, actor, projectId, true);
          if (!project.designWorkflowStages?.length) blocked(["This project does not have the configured design workflow."]);
          const state = await tx.findDesignWorkflowState(projectId) ?? emptyDesignWorkflowState(projectId);
          const repeated = state.history.find((event) => event.idempotencyKey === input.idempotencyKey);
          if (repeated) {
            if (repeated.actorId !== actor.id || repeated.requestHash !== hash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This action key was already used for a different request.");
            return { version: state.version, replayed: true };
          }
          if (state.version !== input.expectedVersion) throw new ApiError(409, "WORKFLOW_VERSION_CONFLICT", "The workflow changed. Refresh and try again.");
          let onBehalfOfClient = false;
          let recordedActorName = actor.name;
          let recordedData = structuredClone(input.data);
          let auditDetails: Record<string, unknown> = {};
          if (input.action === "confirm_initial_payment") {
            checkData(input.data, []);
            if (!capabilities.finance || !input.note) throw new ApiError(403, "PAYMENT_CONFIRMATION_NOT_ALLOWED", "Super Admin or Finance must record a payment receipt reference.");
            if (input.stageId || state.initialPaymentAt) blocked(["The initial payment is already confirmed or this request names a stage."]);
            const { source, issue } = await paymentApprovalSource(tx, projectId);
            if (!source) blocked([issue!]);
            state.initialPaymentAt = timestamp;
            state.initialPaymentEstimateId = source.estimateId;
            state.initialPaymentEstimateVersion = source.estimateVersion;
            recordedData = { estimateId: source.estimateId, estimateVersion: source.estimateVersion, confirmedAt: timestamp };
            auditDetails = recordedData;
          } else {
            const definition = ACTIONS[input.action];
            const stage = project.designWorkflowStages.find((stage) => stage.id === input.stageId && stage.type === definition.type);
            if (!stage) missing();
            if (!capabilities[definition.actor]) throw new ApiError(403, "FORBIDDEN", "You cannot perform this stage action.");
            if (!allowed(state, input.action, at.getTime(), actor.id)) blocked(["This action is not available until its stage prerequisites are met."]);
            onBehalfOfClient = definition.actor === "client" && capabilities.representative;
            if ((definition.file || onBehalfOfClient) && !proof) throw new ApiError(400, "WORKFLOW_PROOF_REQUIRED", "Upload the required supporting document.");
            const current = state.stages[definition.type] ??= {};
            switch (input.action) {
              case "internal_kickoff_complete": {
                checkData(input.data, ["meetingAt", "designHandoverAcknowledged"]);
                if (input.data.designHandoverAcknowledged !== true) throw new ApiError(400, "KICKOFF_HANDOVER_REQUIRED", "Acknowledge that the design flow has been handed over to you after initial payment.");
                const designer = await requireActor(tx, actor);
                recordedActorName = designer.name;
                current.meetingAt = dateField(input.data, "meetingAt", at.getTime(), false);
                current.handoverAcknowledgedAt = timestamp;
                current.handoverAcknowledgedById = designer.id;
                current.handoverAcknowledgedByName = designer.name;
                current.completedAt = timestamp;
                recordedData = { designHandoverAcknowledged: true, meetingAt: current.meetingAt, completedAt: timestamp, handoverAcknowledgedAt: timestamp, handoverAcknowledgedById: designer.id, handoverAcknowledgedByName: designer.name };
                auditDetails = recordedData;
                break;
              }
              case "sales_calendar_accept": checkData(input.data, []); current.calendarAcceptedAt = timestamp; break;
              case "client_kickoff_request": checkData(input.data, ["preferredAt"]); current.preferredAt = dateField(input.data, "preferredAt", at.getTime(), true); current.requestedAt = timestamp; break;
              case "client_kickoff_schedule": checkData(input.data, ["scheduledAt"]); current.scheduledAt = dateField(input.data, "scheduledAt", at.getTime(), true); break;
              case "client_kickoff_complete": {
                checkData(input.data, ["reviewedDocumentEventId"]);
                const submitted = submittedInternalKickoffEvent(state, projectId, project.designWorkflowStages.find((stage) => stage.type === "internal_kickoff")?.id);
                if (!submitted) throw new ApiError(409, "KICKOFF_DOCUMENT_UNAVAILABLE", KICKOFF_DOCUMENT_UNAVAILABLE);
                if (input.data.reviewedDocumentEventId !== submitted.id) throw new ApiError(400, "KICKOFF_DOCUMENT_REVIEW_REQUIRED", "Review the submitted Internal Kick off document and confirm it before completing Client Kick off.");
                current.completedAt = timestamp;
                recordedData = { reviewedDocumentEventId: submitted.id, completedAt: timestamp };
                auditDetails = recordedData;
                break;
              }
              case "client_kickoff_not_required": checkData(input.data, []); if (!input.note) throw new ApiError(400, "WORKFLOW_NOTE_REQUIRED", "Explain why the meeting is not necessary."); current.notRequired = true; current.completedAt = timestamp; break;
              case "keys_handed_over": checkData(input.data, []); current.handedOverAt = timestamp; if (current.receivedAt) current.completedAt = timestamp; break;
              case "keys_received": checkData(input.data, []); current.receivedAt = timestamp; if (current.handedOverAt) current.completedAt = timestamp; break;
              case "measurement_assign": {
                checkData(input.data, ["designerId"]);
                const designer = typeof input.data.designerId === "string" ? await tx.findUserById(input.data.designerId) : null;
                if (!designer?.active || designer.role !== "designer" || !project.assignedDesignerIds.includes(designer.id)) throw new ApiError(400, "INVALID_MEASUREMENT_ASSIGNEE", "Select an assigned project Designer.");
                current.assignedDesignerId = designer.id; break;
              }
              case "measurement_access_block": checkData(input.data, []); if (!input.note) throw new ApiError(400, "WORKFLOW_NOTE_REQUIRED", "Explain why site access is unavailable."); state.pauses.push({ startedAt: timestamp, endedAt: null }); break;
              case "measurement_access_restore": checkData(input.data, []); state.pauses.find((pause) => pause.endedAt === null)!.endedAt = timestamp; break;
              case "measurement_complete": {
                checkData(input.data, ["mediaFolderUrl"]);
                const url = z.string().url().max(2000).safeParse(input.data.mediaFolderUrl);
                if (!url.success || new URL(url.data).protocol !== "https:" || new URL(url.data).username || new URL(url.data).password) throw new ApiError(400, "INVALID_MEDIA_FOLDER", "Provide an HTTPS media folder link without embedded credentials.");
                current.mediaFolderUrl = url.data; current.completedAt = timestamp; break;
              }
              case "furniture_scope": {
                checkData(input.data, ["rooms", "notApplicable"]);
                const parsed = z.object({ rooms: z.array(z.object({ id: z.string().min(1), required: z.boolean() }).strict()).max(100), notApplicable: z.boolean().optional() }).strict().safeParse(input.data);
                if (!parsed.success || parsed.data.notApplicable && parsed.data.rooms.length || !parsed.data.notApplicable && !parsed.data.rooms.length) throw new ApiError(400, "INVALID_FURNITURE_SCOPE", "Choose the project rooms, or explicitly declare no existing furniture.");
                const roomContext = await tx.findDesignWorkflowRoomContext(projectId);
                const rooms = roomContext?.rooms ?? [];
                if (roomContext) { current.scopeEstimateId = roomContext.estimateId; current.scopeEstimateVersion = roomContext.estimateVersion; }
                if (!parsed.data.notApplicable && (new Set(parsed.data.rooms.map((room) => room.id)).size !== parsed.data.rooms.length || parsed.data.rooms.length !== rooms.length || parsed.data.rooms.some((room) => !rooms.some((saved) => saved.id === room.id)))) throw new ApiError(400, "INVALID_FURNITURE_ROOMS", "Declare applicability for each room in the approved estimate.");
                current.noExistingFurniture = Boolean(parsed.data.notApplicable);
                current.rooms = parsed.data.rooms.map((room) => ({ ...room, name: rooms.find((saved) => saved.id === room.id)!.name, uploadedAt: null, proceed: false })); break;
              }
              case "furniture_accept": checkData(input.data, []); current.acceptedAt = timestamp; if (current.noExistingFurniture || current.rooms?.every((room) => !room.required)) current.completedAt = timestamp; break;
              case "furniture_upload":
              case "furniture_proceed": {
                checkData(input.data, ["roomIds"]);
                const selected = z.array(z.string().min(1)).min(1).max(100).safeParse(input.data.roomIds);
                if (!selected.success || new Set(selected.data).size !== selected.data.length || selected.data.some((id) => !current.rooms?.some((room) => room.id === id))) throw new ApiError(400, "INVALID_FURNITURE_ROOMS", "Choose rooms from the accepted furniture scope.");
                if (input.action === "furniture_proceed" && selected.data.some((id) => current.rooms!.some((room) => room.id === id && (!room.required || room.uploadedAt || room.proceed)))) throw new ApiError(400, "INVALID_FURNITURE_ROOMS", "Choose only rooms still awaiting required dimensions.");
                if (input.action === "furniture_proceed" && !input.note) throw new ApiError(400, "WORKFLOW_NOTE_REQUIRED", "Acknowledge the effect of missing dimensions for selected rooms.");
                for (const room of current.rooms!) if (selected.data.includes(room.id)) {
                  if (input.action === "furniture_upload") room.uploadedAt = timestamp;
                  else room.proceed = true;
                }
                if (current.rooms!.every((room) => !room.required || room.uploadedAt || room.proceed)) current.completedAt ??= timestamp;
                break;
              }
            }
            if (["internal_kickoff_complete", "client_kickoff_complete", "client_kickoff_not_required", "measurement_complete"].includes(input.action)) {
              current.timingBasis = "sequential";
              recordedData = { ...recordedData, timingBasis: "sequential" };
              auditDetails = { ...auditDetails, timingBasis: "sequential" };
            }
          }
          const eventId = `workflow-event-${randomUUID()}`;
          state.history.push({ id: eventId, idempotencyKey: input.idempotencyKey, requestHash: hash, action: input.action, stageId: input.stageId ?? null, actorId: actor.id, actorName: recordedActorName, actorRole: actor.role, onBehalfOfClient, at: timestamp, note: input.note, data: recordedData, proof });
          attemptedWrite = true;
          const saved = await tx.saveDesignWorkflowState(projectId, state.version, state);
          await audit.append({ actorId: actor.id, action: "design_workflow_action_recorded", entityType: "design_workflow", entityId: projectId, occurredAt: timestamp, newValues: { action: input.action, stageId: input.stageId ?? null, eventId, onBehalfOfClient, proofAvailable: Boolean(proof), version: saved.version, ...auditDetails }, reason: input.note || null }, tx);
          return { version: saved.version, replayed: false };
        });
      } catch (error) {
        if (proof && attemptedWrite) {
          let latest: DesignWorkflowState | null;
          try { latest = await repository.findDesignWorkflowState(projectId); }
          catch { throw new WorkflowProofRetentionError(); }
          const committed = latest?.history.find((event) => event.idempotencyKey === input.idempotencyKey && event.actorId === actor.id && event.requestHash === hash);
          if (committed) return { version: latest!.version, replayed: committed.proof?.storageReference !== proof.storageReference };
          if (unknownCommit(error)) throw new WorkflowProofRetentionError();
        }
        if (error instanceof RepositoryConflictError) throw new ApiError(409, "WORKFLOW_VERSION_CONFLICT", "The workflow changed. Refresh and try again.");
        throw error;
      }
    }
  };
}

function wallAt(state: DesignWorkflowState, startsAt: string | null, offset: number, now: number): string | null {
  if (!startsAt) return null;
  const start = Date.parse(startsAt);
  let target = start + offset;
  for (const pause of state.pauses) {
    const pauseStart = Math.max(start, Date.parse(pause.startedAt));
    const pauseEnd = pause.endedAt ? Math.min(Date.parse(pause.endedAt), now) : now;
    if (pauseStart < target) target += Math.max(0, pauseEnd - pauseStart);
  }
  return new Date(target).toISOString();
}
export function projectOperationalStage(stage: ProjectDesignWorkflowStage, state: DesignWorkflowState, capabilities: WorkflowCapabilities, now: Date, actorId: string, measurementAssigneeName?: string, context?: WorkflowStageContext) {
  const current = state.stages[stage.type] ?? {};
  const at = current.completedAt ? Date.parse(current.completedAt) : now.getTime();
  const clock = WORKFLOW_STAGE_CLOCKS[stage.type];
  const legacyCompleted = Boolean(clock && current.completedAt && !current.timingBasis);
  const legacyStartDays = legacyCompleted && stage.type !== "internal_kickoff" ? 3 : 0;
  const startsAt = legacyCompleted ? state.initialPaymentAt : workflowStageStartAt(state, stage.type, at);
  const elapsed = workflowStageElapsedMs(state, startsAt, at);
  const paused = Boolean(startsAt) && workflowIsPaused(state) && !current.completedAt;
  const activeElapsed = clock ? Math.max(0, elapsed - legacyStartDays * DAY) : 0;
  let clientElapsed = 0;
  let owner = "Designer";
  if (stage.type === "client_kickoff" && startsAt && current.requestedAt) {
    const requestedElapsed = workflowStageElapsedMs(state, startsAt, Date.parse(current.requestedAt));
    const choices: Array<{ at: string; data?: Record<string, unknown> }> = state.history.filter((event) => event.action === "client_kickoff_schedule" && Date.parse(event.at) <= at);
    if (choices.length === 0 && current.scheduledAt) choices.push({ at: current.requestedAt, data: { scheduledAt: current.scheduledAt } });
    choices.forEach((choice, index) => {
      const selected = choice.data?.scheduledAt ?? (index === choices.length - 1 ? current.scheduledAt : undefined);
      if (typeof selected !== "string") return;
      const selectedAt = Date.parse(selected);
      const selectedElapsed = selectedAt - Date.parse(startsAt) - workflowPausedMs(state, Math.min(selectedAt, at), Date.parse(startsAt));
      if (selectedElapsed <= 4 * DAY) return;
      const segmentStart = Math.max(4 * DAY, requestedElapsed, workflowStageElapsedMs(state, startsAt, Date.parse(choice.at)));
      const nextChoice = choices[index + 1];
      const segmentEnd = nextChoice ? workflowStageElapsedMs(state, startsAt, Date.parse(nextChoice.at)) : elapsed;
      clientElapsed += Math.max(0, segmentEnd - segmentStart);
      if (!nextChoice && elapsed > segmentStart) owner = "Client";
    });
  }
  const actions = workflowAvailableActions(state, stage.type, capabilities, now.getTime(), actorId, context);
  const submitted = submittedInternalKickoffEvent(state, context?.projectId, context?.internalKickoffStageId);
  const canReadProof = capabilities.client || capabilities.designer || capabilities.manager || capabilities.sales;
  const showSubmittedDocument = stage.type === "client_kickoff" ? capabilities.client : stage.type === "internal_kickoff" && stage.id === submitted?.stageId && canReadProof;
  const submittedDocument = showSubmittedDocument && submitted?.proof ? { eventId: submitted.id, filename: submitted.proof.originalFilename, mimeType: submitted.proof.mimeType, uploadedAt: submitted.at } : undefined;
  const reasons: string[] = [];
  if (!state.initialPaymentAt) reasons.push(paymentBlockingReason(context));
  if (paused) reasons.push("Site access is unavailable. All workflow clocks are paused.");
  if (!current.completedAt) reasons.push(...workflowStagePrerequisiteBlockers(state, stage.type));
  if (stage.type === "space_planning_tentative_look_feel") reasons.push(...workflowSubmissionBlockers(state));
  const facts: Array<{ label: string; value: string }> = [];
  for (const [field, label] of [["meetingAt", "Meeting conducted"], ["calendarAcceptedAt", "Sales calendar accepted"], ["requestedAt", "Meeting requested"], ["preferredAt", "Requested meeting date"], ["scheduledAt", "Client meeting date"], ["handedOverAt", "Client handed over keys"], ["receivedAt", "Designer received keys"], ["mediaFolderUrl", "Photos and videos folder"]] as const) if (current[field]) facts.push({ label, value: current[field]! });
  if (current.assignedDesignerId) facts.push({ label: "Assigned measurement Designer", value: measurementAssigneeName ?? "Assigned project Designer" });
  if (current.handoverAcknowledgedAt) facts.push({ label: "Design handover acknowledged by", value: current.handoverAcknowledgedByName ?? "Designer" }, { label: "Design handover acknowledged at", value: current.handoverAcknowledgedAt });
  if (current.managerHandedOverAt) facts.push({ label: "Previous manager handover", value: current.handoverManagerName ?? "Design Manager" }, { label: "Previous manager handover recorded at", value: current.managerHandedOverAt });
  if (current.notRequired) facts.push({ label: "Client kickoff", value: "Not necessary" });
  if (current.noExistingFurniture) facts.push({ label: "Existing furniture", value: current.acceptedAt ? "Not applicable — accepted by Client" : "Not applicable — Client confirmation required" });
  const history = state.history.filter((event) => event.stageId === stage.id).map((event) => ({ id: event.id, action: event.action, actorName: event.actorName, actorRole: event.actorRole, onBehalfOfClient: event.onBehalfOfClient, at: event.at, note: event.action === "internal_kickoff_complete" && actorId && !capabilities.designer && !capabilities.sales && !capabilities.manager ? "" : event.note, proofAvailable: Boolean(event.proof) && (event.action !== "internal_kickoff_complete" || capabilities.designer || capabilities.sales || capabilities.manager || capabilities.client && submitted?.id === event.id) }));
  const reminders: Array<{ id: string; label: string; dueAt: string }> = [];
  if (capabilities.manager && clock && !current.completedAt && startsAt && !paused) {
    const greenEnd = clock.bands[0] * DAY;
    const reminderAt = elapsed >= greenEnd ? greenEnd + Math.floor((elapsed - greenEnd) / 10_800_000) * 10_800_000 : greenEnd - DAY;
    if (elapsed >= reminderAt) reminders.push({ id: `${state.projectId}:${stage.id}:${reminderAt}`, label: elapsed >= greenEnd ? "Stage SLA needs attention" : "Stage approaches Yellow in one day", dueAt: wallAt(state, startsAt, reminderAt, at)! });
  }
  return {
    status: (current.completedAt ? "completed" : !startsAt ? "not_started" : reasons.length ? "blocked" : "in_progress") as "completed" | "blocked" | "not_started" | "in_progress",
    version: state.version, availableActions: actions,
    timing: {
      state: current.completedAt ? current.notRequired || current.noExistingFurniture ? "not_applicable" : "completed" : !startsAt ? "waiting" : paused ? "paused" : clock ? "running" : "not_applicable",
      startsAt: legacyCompleted ? wallAt(state, startsAt, legacyStartDays * DAY, at) : startsAt,
      originalTargetAt: startsAt && clock ? new Date(Date.parse(startsAt) + clock.bands[0] * DAY).toISOString() : null,
      targetAt: clock ? wallAt(state, startsAt, clock.bands[0] * DAY, at) : null,
      endsAt: current.completedAt ?? null,
      slaAllowanceMs: clock ? clock.bands[0] * DAY : null,
      remainingMs: clock && startsAt ? Math.max(0, clock.bands[0] * DAY - elapsed) : null,
      band: clock && startsAt ? elapsed <= clock.bands[0] * DAY ? "On track" : elapsed <= clock.bands[1] * DAY ? "Yellow" : elapsed <= clock.bands[2] * DAY ? "Late" : "Overdue" : null,
      clockOwner: clock && startsAt ? owner : null, designerElapsedMs: Math.max(0, activeElapsed - clientElapsed), clientElapsedMs: clientElapsed
    }, blockingReasons: [...new Set(reasons)], facts, history, reminders,
    ...(submittedDocument ? { submittedDocument } : {}),
    ...(current.rooms ? { rooms: current.rooms.map((room) => ({ id: room.id, name: room.name, required: room.required, hasDimensions: Boolean(room.uploadedAt), canProceed: !room.required || Boolean(room.uploadedAt) || room.proceed })) } : {})
  };
}

export class WorkflowProofRetentionError extends ApiError {
  constructor() { super(503, "WORKFLOW_OUTCOME_UNCERTAIN", "This action could not be confirmed. Refresh before retrying."); }
}
function unknownCommit(error: unknown): boolean {
  const visited = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const value = current as { hasErrorLabel?: (label: string) => boolean; errorLabels?: unknown; cause?: unknown };
    if (value.hasErrorLabel?.("UnknownTransactionCommitResult") || Array.isArray(value.errorLabels) && value.errorLabels.includes("UnknownTransactionCommitResult")) return true;
    current = value.cause;
  }
  return false;
}

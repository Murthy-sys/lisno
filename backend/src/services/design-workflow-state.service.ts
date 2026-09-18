import type { WorkflowSpacePlanningSource } from "../domain/workflow-space-planning.js";
import { furnitureUomCreateSchema, type FurnitureUomCreateInput } from "../domain/workflow-uoms.js";
import { normalizeKnowledgeIdentity } from "../domain/ai-estimator-knowledge.js";
import type { WorkflowEstimateRoomContext } from "../domain/workflow-estimate-items.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CALENDAR_DAY_MS as DAY, DESIGN_WORKFLOW_ACTIONS, emptyDesignWorkflowState, WORKFLOW_STAGE_CLOCKS, workflowStageElapsedMs, workflowStageStartAt, workflowStagePrerequisiteBlockers, workflowIsPaused, workflowPausedMs, workflowSubmissionBlockers, workflowFurnitureRoomReady, type DesignWorkflowAction, type DesignWorkflowState, type WorkflowStageState, type StoredWorkflowMedia, type WorkflowRoom, type DesignWorkflowHistoryEvent } from "../domain/design-workflow-state.js";
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
  measurement_complete: { type: "site_measurement", label: "Complete measurement", actor: "designer" },
  furniture_scope: { type: "existing_furniture_dimensions", label: "Declare existing-furniture requirements", actor: "designer" },
  furniture_accept: { type: "existing_furniture_dimensions", label: "Accept furniture requirements", actor: "client" },
  furniture_scope_return: { type: "existing_furniture_dimensions", label: "Send back requirements", actor: "client" },
  furniture_upload: { type: "existing_furniture_dimensions", label: "Submit furniture dimensions", actor: "client", file: true },
  furniture_dimensions_approve: { type: "existing_furniture_dimensions", label: "Approve dimensions", actor: "client" },
  furniture_dimensions_return: { type: "existing_furniture_dimensions", label: "Send back dimensions", actor: "client" },
  space_planning_complete: { type: "space_planning_tentative_look_feel", label: "Approve and complete stage", actor: "client" },
  furniture_proceed: { type: "existing_furniture_dimensions", label: "Confirm selected rooms can proceed", actor: "client" }
};
function missing(): never { throw new ApiError(404, "NOT_FOUND", "The requested resource was not found."); }
function blocked(reasons: string[]): never { throw new ApiError(409, "DESIGN_WORKFLOW_BLOCKED", reasons.join(" ")); }
export type WorkflowPaymentStatus = "awaiting_estimate_approval" | "awaiting_payment" | "received";
type WorkflowStageContext = { spacePlanning?: WorkflowSpacePlanningSource | null; spacePlanningIssue?: string; paymentStatus: WorkflowPaymentStatus; projectId?: string; internalKickoffStageId?: string; measurementStageId?: string };
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
  if (options.phase !== "upload" && furniture?.acceptedAt) {
    const context = await repository.findDesignWorkflowRoomContext(projectId, true).catch((error: unknown) => {
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
    case "furniture_scope": return !furniture.acceptedAt && !furniture.completedAt;
    case "furniture_accept":
    case "furniture_scope_return": return Boolean(furniture.rooms) && !furniture.acceptedAt && !furniture.completedAt && !furniture.scopeReturn;
    case "furniture_upload": return Boolean(furniture.acceptedAt) && !furniture.completedAt && Boolean(furniture.rooms?.some((room) => room.required && (!room.dimensions || room.dimensions.status === "changes_requested")));
    case "furniture_dimensions_approve":
    case "furniture_dimensions_return": return Boolean(furniture.acceptedAt) && !furniture.completedAt && Boolean(furniture.rooms?.some((room) => room.dimensions?.status === "pending"));
    case "space_planning_complete": return !state.stages.space_planning_tentative_look_feel?.completedAt && !paused && workflowSubmissionBlockers(state).length === 0;
    case "furniture_proceed": return false;
  }
}
export function workflowAvailableActions(state: DesignWorkflowState, type: DesignStageType, capabilities: WorkflowCapabilities, at: number, actorId?: string, context?: WorkflowStageContext): WorkflowAvailableAction[] {
  return Object.entries(ACTIONS).flatMap(([id, definition]) => {
    const actionActor = id === "furniture_upload" && capabilities.designer ? "designer" : definition.actor;
    if (definition.type !== type || !capabilities[actionActor]) return [];
    if (id === "space_planning_complete" && (capabilities.representative || !context?.spacePlanning?.readyForCompletion || context.spacePlanningIssue)) return [];
    let disabledReason: string | undefined;
    if (id === "internal_kickoff_complete") {
      if (state.stages.internal_kickoff?.completedAt) return [];
      if (!state.initialPaymentAt) disabledReason = paymentBlockingReason(context);
    } else if (!allowed(state, id as keyof typeof ACTIONS, at, actorId)) return [];
    if (id === "client_kickoff_complete" && !submittedInternalKickoffEvent(state, context?.projectId, context?.internalKickoffStageId)) disabledReason = KICKOFF_DOCUMENT_UNAVAILABLE;
    const label = id === "furniture_scope" && state.stages.existing_furniture_dimensions?.rooms ? "Edit furniture requirements" : id === "furniture_upload" && state.stages.existing_furniture_dimensions?.rooms?.some((room) => room.dimensions?.status === "changes_requested") ? "Resubmit returned dimensions" : definition.label;
    return [{ id: id as keyof typeof ACTIONS, label, actor: actionActor, requiresProof: Boolean(definition.file || actionActor === "client" && capabilities.representative), ...(disabledReason ? { disabledReason } : {}) }];
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
const furnitureMeasurementsSchema = z.object({ measurementType: z.literal("dimensions").optional(), length: z.number().finite().positive(), width: z.number().finite().positive(), height: z.number().finite().positive() });
const furnitureCountSchema = z.object({ measurementType: z.literal("count"), quantity: z.number().finite().int().positive().max(Number.MAX_SAFE_INTEGER) });
const estimateItemIdSchema = z.string().min(1).max(500).refine((value) => value === value.trim());
const furnitureInputIdentity = { estimateItemId: estimateItemIdSchema, uomId: z.string().trim().min(1).max(128) };
const furnitureInputItemSchema = z.union([furnitureMeasurementsSchema.extend(furnitureInputIdentity).strict(), furnitureCountSchema.extend(furnitureInputIdentity).strict()]);
const furnitureStoredIdentity = { id: estimateItemIdSchema, estimateItemId: estimateItemIdSchema.optional(), name: z.string().min(1), unit: z.string().min(1).max(64), uomId: z.string().min(1).max(128).optional(), uomName: z.string().min(1).max(240).optional() };
const furnitureStoredItemSchema = z.union([furnitureMeasurementsSchema.extend(furnitureStoredIdentity).strict(), furnitureCountSchema.extend(furnitureStoredIdentity).strict()]).refine(item => Boolean(item.uomId) === Boolean(item.uomName));
const furnitureUploadSchema = z.object({ rooms: z.array(z.object({ roomId: z.string().min(1), items: z.array(furnitureInputItemSchema).min(1) }).strict()).min(1).max(100) }).strict();
const furnitureStoredSubmissionSchema = z.object({ rooms: z.array(z.object({ roomId: z.string().min(1), items: z.array(furnitureStoredItemSchema).min(1) }).strict()).min(1).max(100) }).strict();
function canonicalFurnitureItems<T extends { estimateItemId: string }>(source: WorkflowEstimateRoomContext, roomId: string, items: T[], requireComplete = true) {
  const selected = source.rooms.find((room) => room.id === roomId)?.estimateItems ?? [];
  if (!selected.length) blocked(["This room has no selected items in the approved estimate. Correct the approved estimate or declare that the room has no existing furniture before continuing."]);
  if (requireComplete && items.length !== selected.length || new Set(items.map((item) => item.estimateItemId)).size !== items.length || items.some((item) => !selected.some((entry) => entry.id === item.estimateItemId))) throw new ApiError(400, "INVALID_FURNITURE_DIMENSIONS", "Enter measurements for every selected estimate item in this room, using its current estimate item ID.");
  return items.map((item) => ({ ...item, id: item.estimateItemId, name: selected.find((entry) => entry.id === item.estimateItemId)!.name }));
}
function assertFurnitureMeasurementTypes(source: WorkflowEstimateRoomContext, roomId: string, items: Array<{ estimateItemId: string; measurementType?: "count" | "dimensions" }>, reviewing = false) {
  const selected = source.rooms.find(room => room.id === roomId)!.estimateItems;
  if (items.some(item => (item.measurementType ?? "dimensions") !== selected.find(entry => entry.id === item.estimateItemId)!.measurementType)) {
    const message = "Point items require an actual number of points; other items require length, width and height. Send existing measurements back for correction before approval.";
    if (reviewing) blocked([message]);
    throw new ApiError(400, "INVALID_FURNITURE_MEASUREMENT_TYPE", message);
  }
}
const furnitureScopeRoomsSchema = z.array(z.object({ id: z.string().min(1), required: z.boolean() }).strict()).max(100);
const furnitureScopeSchema = z.object({ rooms: furnitureScopeRoomsSchema, notApplicable: z.boolean().optional(), dimensions: furnitureUploadSchema.shape.rooms.min(0).optional() }).strict();
const furnitureStoredScopeSchema = z.object({ rooms: furnitureScopeRoomsSchema, notApplicable: z.boolean().optional(), dimensions: furnitureStoredSubmissionSchema.shape.rooms.min(0) }).strict();
const furnitureRequirementsReviewSchema = z.object({ submissionEventId: z.string().min(1) }).strict();
async function canonicalDimensionRooms(repository: AppRepository, source: WorkflowEstimateRoomContext, submitted: z.infer<typeof furnitureUploadSchema>["rooms"]) {
  const itemRooms = submitted.map(entry => ({ roomId: entry.roomId, items: canonicalFurnitureItems(source, entry.roomId, entry.items) }));
  for (const room of itemRooms) assertFurnitureMeasurementTypes(source, room.roomId, room.items);
  const uomIds = [...new Set(itemRooms.flatMap(room => room.items.map(item => item.uomId)))];
  const uoms = new Map((await repository.referenceWorkflowUoms(uomIds)).map(uom => [uom.id, uom]));
  if (uomIds.some(id => !uoms.has(id))) throw new ApiError(400, "FURNITURE_UOM_UNAVAILABLE", "A selected UOM is no longer active. Choose an active configured UOM before submitting.");
  return itemRooms.map(room => ({ roomId: room.roomId, items: room.items.map(item => ({ ...item, unit: uoms.get(item.uomId)!.code, uomName: uoms.get(item.uomId)!.name })) }));
}
function nextFurnitureRevision(state: DesignWorkflowState, stageId: string, roomId: string) {
  const eventIds = new Set(state.history.flatMap(event => {
    if (event.stageId !== stageId) return [];
    const parsed = event.action === "furniture_scope" ? furnitureStoredScopeSchema.safeParse(event.data) : event.action === "furniture_upload" ? furnitureStoredSubmissionSchema.safeParse(event.data) : undefined;
    if (!parsed?.success) return [];
    const rooms = "dimensions" in parsed.data ? parsed.data.dimensions : parsed.data.rooms;
    return rooms.some(room => room.roomId === roomId) ? [event.id] : [];
  }));
  return Math.max(state.stages.existing_furniture_dimensions?.rooms?.find(room => room.id === roomId)?.dimensions?.revision ?? 0, eventIds.size) + 1;
}
const furnitureReviewSchema = z.object({ submissions: z.array(z.object({ roomId: z.string().min(1), submissionEventId: z.string().min(1) }).strict()).min(1).max(100) }).strict();
async function assertFurnitureScopeSource(repository: AppRepository, projectId: string, current: WorkflowStageState) {
  const source = await repository.findDesignWorkflowRoomContext(projectId, true);
  if (!source || current.scopeEstimateId !== source.estimateId || current.scopeEstimateVersion !== source.estimateVersion || !current.rooms || !current.noExistingFurniture && (current.rooms.length !== source.rooms.length || current.rooms.some((room) => !source.rooms.some((saved) => saved.id === room.id)))) blocked(["The approved estimate no longer matches this furniture confirmation. Reconcile the project approved source before continuing."]);
  return source!;
}
async function requireFurnitureUomScope(repository: AppRepository, actor: PublicUser, projectId: string) {
  const scope = await requireDesignWorkflowScope(repository, actor, projectId);
  if (!scope.capabilities.designer && !scope.capabilities.client) missing();
  if (!scope.project.designWorkflowStages?.some(stage => stage.type === "existing_furniture_dimensions")) missing();
  return scope;
}
export function createDesignWorkflowStateService(repository: AppRepository, audit: AuditService, clock: Clock) {
  return {
    async listFurnitureUoms(actor: PublicUser, projectId: string) {
      await requireFurnitureUomScope(repository, actor, projectId);
      return repository.listActiveWorkflowUoms();
    },
    async createFurnitureUom(actor: PublicUser, projectId: string, value: FurnitureUomCreateInput) {
      return repository.runInTransaction(async tx => {
        await tx.coordinateAuthorizationMutation();
        const { capabilities } = await requireFurnitureUomScope(tx, actor, projectId);
        const state = await tx.findDesignWorkflowState(projectId) ?? emptyDesignWorkflowState(projectId);
        const declaringScope = capabilities.designer && allowed(state, "furniture_scope", clock().getTime(), actor.id);
        if (!declaringScope && !allowed(state, "furniture_upload", clock().getTime(), actor.id)) blocked(["Furniture requirements or dimensions must be awaiting your submission before adding a UOM."]);
        if (declaringScope) {
          if (!await tx.findDesignWorkflowRoomContext(projectId, true)) blocked(["The project's approved estimate room source is unavailable."]);
        } else await assertFurnitureScopeSource(tx, projectId, state.stages.existing_furniture_dimensions!);
        const parsed = furnitureUomCreateSchema.safeParse(value);
        if (!parsed.success) throw new ApiError(400, "INVALID_FURNITURE_UOM", "Enter a UOM code, name and quantity decimal places from 0 to 3.");
        const fields = parsed.data;
        const codeNormalized = normalizeKnowledgeIdentity(fields.code);
        const nameNormalized = normalizeKnowledgeIdentity(fields.name);
        const matches = await tx.findWorkflowUomsByIdentity(codeNormalized, nameNormalized);
        if (matches.some(row => row.status === "inactive")) throw new ApiError(409, "FURNITURE_UOM_INACTIVE", "A UOM with this code or name is inactive. Ask Configuration to reactivate it or choose an active UOM.");
        if (matches.length === 1 && normalizeKnowledgeIdentity(matches[0]!.code) === codeNormalized && normalizeKnowledgeIdentity(matches[0]!.name) === nameNormalized) {
          const { status: _status, ...uom } = matches[0]!;
          return { uom, reused: true };
        }
        if (matches.length) throw new ApiError(409, "FURNITURE_UOM_IDENTITY_CONFLICT", "This code or name already belongs to another UOM. Choose the existing UOM or use a distinct code and name.");
        const at = clock().toISOString();
        const uom = await tx.createWorkflowUom({ id: `knowledge-uom-${randomUUID()}`, ...fields, actorId: actor.id, at });
        await audit.append({ actorId: actor.id, action: "ai_estimator_knowledge_master_created", entityType: "ai_estimator_knowledge_uom", entityId: uom.id, occurredAt: at, newValues: { masterType: "uoms", ...uom, status: "active", version: 1, source: "furniture_dimensions", projectId } }, tx);
        return { uom, reused: false };
      });
    },
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
    async media(actor: PublicUser, projectId: string, eventId: string, mediaId: string) {
      const { project, capabilities } = await requireDesignWorkflowScope(repository, actor, projectId);
      if (!capabilities.client && !capabilities.designer && !capabilities.manager && !capabilities.sales) missing();
      const state = await repository.findDesignWorkflowState(projectId);
      const event = state?.projectId === projectId ? state.history.find((item) => item.id === eventId && item.action === "measurement_complete" && project.designWorkflowStages?.some((stage) => stage.id === item.stageId && stage.type === "site_measurement")) : undefined;
      const media = event?.mediaFiles?.find((item) => item.id === mediaId);
      if (!media) missing();
      return media;
    },
    async act(actor: PublicUser, projectId: string, input: WorkflowActionInput, proof: StoredEstimateClientResponseProof | null, mediaFiles: StoredWorkflowMedia[] = []) {
      const at = clock();
      const timestamp = at.toISOString();
      let attemptedWrite = false;
      const hash = sha256Hex(Buffer.from(JSON.stringify({ action: input.action, stageId: input.stageId, data: input.data, note: input.note, proof: proof?.sha256, ...(mediaFiles.length ? { mediaFiles: mediaFiles.map(({ sha256, originalFilename, mimeType, byteSize, kind }) => ({ sha256, originalFilename, mimeType, byteSize, kind })) } : {}) })));
      try {
        return await repository.runInTransaction(async (tx) => {
          await tx.coordinateAuthorizationMutation();
          const { project, capabilities } = await requireDesignWorkflowScope(tx, actor, projectId, true);
          if (!project.designWorkflowStages?.length) blocked(["This project does not have the configured design workflow."]);
          const state = await tx.findDesignWorkflowState(projectId) ?? emptyDesignWorkflowState(projectId);
          if (input.action === "space_planning_complete" && (actor.role !== "client" || project.clientId !== actor.id || capabilities.representative)) throw new ApiError(403, "FORBIDDEN", "Only the project Client can complete this stage.");
          const repeated = state.history.find((event) => event.idempotencyKey === input.idempotencyKey);
          if (repeated) {
            if (repeated.actorId !== actor.id || repeated.requestHash !== hash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This action key was already used for a different request.");
            return { version: state.version, replayed: true };
          }
          if (mediaFiles.length && input.action !== "measurement_complete") throw new ApiError(400, "INVALID_WORKFLOW_EVIDENCE", "Photos and videos are supported only for measurement completion.");
          if (state.version !== input.expectedVersion) throw new ApiError(409, "WORKFLOW_VERSION_CONFLICT", "The workflow changed. Refresh and try again.");
          let onBehalfOfClient = false;
          let recordedActorName = actor.name;
          let recordedData = structuredClone(input.data);
          let auditDetails: Record<string, unknown> = {};
          const eventId = `workflow-event-${randomUUID()}`;
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
            const actionActor = input.action === "furniture_upload" && capabilities.designer ? "designer" : definition.actor;
            if (!capabilities[actionActor]) throw new ApiError(403, "FORBIDDEN", "You cannot perform this stage action.");
            if (!allowed(state, input.action, at.getTime(), actor.id)) blocked(["This action is not available until its stage prerequisites are met."]);
            onBehalfOfClient = actionActor === "client" && capabilities.representative;
            if ((definition.file || onBehalfOfClient) && !proof) throw new ApiError(400, "WORKFLOW_PROOF_REQUIRED", "Upload the required supporting document.");
            const current = state.stages[definition.type] ??= {};
            const furnitureSource = definition.type === "existing_furniture_dimensions" && input.action !== "furniture_scope" ? await assertFurnitureScopeSource(tx, projectId, current) : undefined;
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
                checkData(input.data, []);
                if (!mediaFiles.length) throw new ApiError(400, "WORKFLOW_MEDIA_REQUIRED", "Upload at least one site photo or video.");
                current.completedAt = timestamp; break;
              }
              case "furniture_scope": {
                checkData(input.data, ["rooms", "notApplicable", "dimensions"]);
                const parsed = furnitureScopeSchema.safeParse(input.data);
                if (!parsed.success || parsed.data.notApplicable && parsed.data.rooms.length || !parsed.data.notApplicable && !parsed.data.rooms.length) throw new ApiError(400, "INVALID_FURNITURE_SCOPE", "Choose the project rooms, or explicitly declare no existing furniture.");
                const roomContext = await tx.findDesignWorkflowRoomContext(projectId, true);
                if (!roomContext) blocked(["The project's approved estimate room source is unavailable."]);
                const rooms = roomContext?.rooms ?? [];
                if (roomContext) { current.scopeEstimateId = roomContext.estimateId; current.scopeEstimateVersion = roomContext.estimateVersion; }
                if (!parsed.data.notApplicable && (new Set(parsed.data.rooms.map((room) => room.id)).size !== parsed.data.rooms.length || parsed.data.rooms.length !== rooms.length || parsed.data.rooms.some((room) => !rooms.some((saved) => saved.id === room.id)))) throw new ApiError(400, "INVALID_FURNITURE_ROOMS", "Declare applicability for each room in the approved estimate.");
                if (parsed.data.rooms.some((room) => room.required && !rooms.find((saved) => saved.id === room.id)?.estimateItems.length)) throw new ApiError(400, "INVALID_FURNITURE_ROOMS", "A required room must contain selected items in the approved estimate. Correct the estimate or mark this room as not requiring furniture dimensions.");
                const requiredRooms = parsed.data.rooms.filter(room => room.required);
                const combined = parsed.data.dimensions !== undefined;
                if (!combined && requiredRooms.length && furnitureRequirementsSubmission(state, stage.id).kind !== "legacy") blocked(["Include dimensions and a supporting document when replacing this furniture submission."]);
                let dimensionRooms: Awaited<ReturnType<typeof canonicalDimensionRooms>> = [];
                if (combined) {
                  const dimensions = parsed.data.dimensions!;
                  if (dimensions.length !== requiredRooms.length || new Set(dimensions.map(room => room.roomId)).size !== dimensions.length || dimensions.some(room => !requiredRooms.some(required => required.id === room.roomId))) throw new ApiError(400, "INVALID_FURNITURE_DIMENSIONS", "Provide dimensions for every required room and no optional rooms.");
                  if (requiredRooms.length && !proof) throw new ApiError(400, "WORKFLOW_PROOF_REQUIRED", "Upload the supporting furniture dimensions document.");
                  dimensionRooms = await canonicalDimensionRooms(tx, roomContext!, dimensions);
                }
                const nextRooms = parsed.data.rooms.map(room => {
                  const submitted = dimensionRooms.find(entry => entry.roomId === room.id);
                  return { ...room, name: rooms.find(saved => saved.id === room.id)!.name, uploadedAt: submitted ? timestamp : null, proceed: false,
                    ...(submitted ? { dimensions: { submissionEventId: eventId, revision: nextFurnitureRevision(state, stage.id, room.id), status: "pending" as const, items: structuredClone(submitted.items), submittedAt: timestamp } } : {}) };
                });
                current.noExistingFurniture = Boolean(parsed.data.notApplicable);
                current.rooms = nextRooms;
                if (combined) current.requirementsSubmissionEventId = eventId;
                else delete current.requirementsSubmissionEventId;
                recordedData = { rooms: parsed.data.rooms, ...(parsed.data.notApplicable !== undefined ? { notApplicable: parsed.data.notApplicable } : {}), ...(combined ? { dimensions: dimensionRooms } : {}) };
                delete current.scopeReturn; break;
              }
              case "furniture_accept":
              case "furniture_scope_return": {
                const bundle = furnitureRequirementsSubmission(state, stage.id);
                if (bundle.kind === "invalid") blocked(["The furniture requirements evidence does not match the current submission. Ask the Designer to resubmit the complete requirements and dimensions."]);
                if (input.action === "furniture_scope_return" && !input.note) throw new ApiError(400, "WORKFLOW_NOTE_REQUIRED", "Explain which furniture requirements need correction.");
                if (bundle.kind === "combined") {
                  const parsed = furnitureRequirementsReviewSchema.safeParse(input.data);
                  if (!parsed.success || parsed.data.submissionEventId !== bundle.event.id) blocked(["The furniture requirements changed. Refresh and review the current submission before deciding."]);
                  for (const room of current.rooms!.filter(room => room.required)) {
                    if (room.dimensions!.status !== "pending") blocked(["The furniture dimensions are not pending review."]);
                    const items = room.dimensions!.items;
                    if (items.some(item => !item.estimateItemId || item.id !== item.estimateItemId)) blocked(["The furniture submission must reference the selected estimate items."]);
                    // Older submissions may omit selected zero-quantity lines; returning them still validates every submitted identity.
                    const canonical = canonicalFurnitureItems(furnitureSource!, room.id, items.map(item => ({ ...item, estimateItemId: item.estimateItemId! })), input.action === "furniture_accept");
                    if (input.action === "furniture_accept") assertFurnitureMeasurementTypes(furnitureSource!, room.id, canonical, true);
                    if (canonical.some((item, index) => item.name !== items[index]!.name) || room.name !== furnitureSource!.rooms.find(source => source.id === room.id)?.name) blocked(["The submitted furniture items no longer match the approved estimate. Ask the Designer to resubmit them."]);
                  }
                  for (const room of current.rooms!.filter(room => room.required)) {
                    room.dimensions!.status = input.action === "furniture_accept" ? "approved" : "changes_requested";
                    room.dimensions!.reviewedAt = timestamp;
                    if (input.action === "furniture_scope_return") room.dimensions!.returnReason = input.note;
                  }
                  recordedData = { submissionEventId: bundle.event.id, submissions: current.rooms!.filter(room => room.required).map(room => ({ roomId: room.id, submissionEventId: bundle.event.id })) };
                } else checkData(input.data, []);
                if (input.action === "furniture_accept") {
                  if (current.rooms?.some(room => room.required && !furnitureSource!.rooms.find(entry => entry.id === room.id)?.estimateItems.length)) blocked(["A required room has no selected estimate items. Send the furniture requirements back for correction before accepting them."]);
                  current.acceptedAt = timestamp;
                  if (current.noExistingFurniture || current.rooms?.every(room => workflowFurnitureRoomReady(current, room))) current.completedAt = timestamp;
                } else current.scopeReturn = { reason: input.note, at: timestamp };
                break;
              }
              case "furniture_upload": {
                const parsed = furnitureUploadSchema.safeParse(input.data);
                if (!parsed.success) throw new ApiError(400, "INVALID_FURNITURE_DIMENSIONS", "Enter a positive whole number for points or positive length, width and height for other items, with a configured UOM and the approved estimate item ID.");
                const submittedRooms = parsed.data.rooms;
                if (new Set(submittedRooms.map((room) => room.roomId)).size !== submittedRooms.length || submittedRooms.some((entry) => !current.rooms?.some((room) => room.id === entry.roomId && room.required))) throw new ApiError(400, "INVALID_FURNITURE_ROOMS", "Choose unique required rooms from the accepted furniture scope.");
                const canonicalRooms = await canonicalDimensionRooms(tx, furnitureSource!, submittedRooms);
                for (const entry of canonicalRooms) {
                  const room = current.rooms!.find((room) => room.id === entry.roomId)!;
                  if (room.dimensions && room.dimensions.status !== "changes_requested") blocked(["Pending or approved furniture dimensions cannot be overwritten. The Client must send pending dimensions back before correction."]);
                  room.dimensions = { submissionEventId: eventId, revision: nextFurnitureRevision(state, stage.id, room.id), status: "pending", items: structuredClone(entry.items), submittedAt: timestamp };
                  room.uploadedAt = timestamp;
                  room.proceed = false;
                }
                recordedData = { rooms: canonicalRooms };
                break;
              }
              case "furniture_dimensions_approve":
              case "furniture_dimensions_return": {
                const parsed = furnitureReviewSchema.safeParse(input.data);
                if (!parsed.success || new Set(parsed.data.submissions.map((entry) => entry.roomId)).size !== parsed.data.submissions.length) throw new ApiError(400, "INVALID_FURNITURE_REVIEW", "Choose unique rooms and their current dimension submissions.");
                if (input.action === "furniture_dimensions_return" && !input.note) throw new ApiError(400, "WORKFLOW_NOTE_REQUIRED", "Explain which furniture dimensions need correction.");
                for (const entry of parsed.data.submissions) {
                  const room = current.rooms?.find((room) => room.id === entry.roomId && room.required);
                  const dimensions = room?.dimensions;
                  const submission = room ? currentFurnitureSubmission(state, stage.id, room) : undefined;
                  if (!dimensions || dimensions.status !== "pending" || dimensions.submissionEventId !== entry.submissionEventId || !submission) blocked(["The furniture dimensions changed. Refresh and review the current pending submission."]);
                  if (input.action === "furniture_dimensions_approve") {
                    if (dimensions.items.some((item) => !item.estimateItemId || item.id !== item.estimateItemId)) blocked(["These dimensions predate estimate item links. Send them back for a fresh submission against the selected estimate items."]);
                    const canonical = canonicalFurnitureItems(furnitureSource!, room!.id, dimensions.items.map((item) => ({ ...item, estimateItemId: item.estimateItemId! })));
                    assertFurnitureMeasurementTypes(furnitureSource!, room!.id, canonical, true);
                    if (canonical.some((item, index) => item.name !== dimensions.items[index]!.name)) blocked(["The submitted furniture items no longer match the approved estimate. Send the dimensions back for correction."]);
                  }
                  dimensions.status = input.action === "furniture_dimensions_approve" ? "approved" : "changes_requested";
                  dimensions.reviewedAt = timestamp;
                  if (input.action === "furniture_dimensions_return") dimensions.returnReason = input.note;
                }
                if (current.rooms!.every((room) => workflowFurnitureRoomReady(current, room))) current.completedAt ??= timestamp;
                break;
              }
              case "space_planning_complete": {
                const parsed = z.object({ estimateId: z.string().min(1), designPlanVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), reviewRoundId: z.string().min(1) }).strict().safeParse(input.data);
                if (!parsed.success) throw new ApiError(400, "INVALID_SPACE_PLANNING_CONFIRMATION", "Confirm the current estimate, Design plan version and review round.");
                const source = await tx.findDesignWorkflowSpacePlanningSource(projectId, true);
                if (!source?.readyForCompletion || source.estimateId !== parsed.data.estimateId || source.designPlanVersion !== parsed.data.designPlanVersion || source.reviewRoundId !== parsed.data.reviewRoundId) blocked(["The Design plan approval changed or is incomplete. Refresh and review the current plan before completing this stage."]);
                current.spacePlanningApproval = parsed.data;
                current.completedAt = timestamp;
                recordedData = { ...parsed.data, completedAt: timestamp };
                auditDetails = recordedData;
                break;
              }
              case "furniture_proceed": blocked(["Required furniture dimensions need Client approval before proceeding."]);
            }
            if (["internal_kickoff_complete", "client_kickoff_complete", "client_kickoff_not_required", "measurement_complete"].includes(input.action)) {
              current.timingBasis = "sequential";
              recordedData = { ...recordedData, timingBasis: "sequential" };
              auditDetails = { ...auditDetails, timingBasis: "sequential" };
            }
          }
          state.history.push({ id: eventId, idempotencyKey: input.idempotencyKey, requestHash: hash, action: input.action, stageId: input.stageId ?? null, actorId: actor.id, actorName: recordedActorName, actorRole: actor.role, onBehalfOfClient, at: timestamp, note: input.note, data: recordedData, proof, ...(mediaFiles.length ? { mediaFiles } : {}) });
          attemptedWrite = true;
          const saved = await tx.saveDesignWorkflowState(projectId, state.version, state);
          await audit.append({ actorId: actor.id, action: "design_workflow_action_recorded", entityType: "design_workflow", entityId: projectId, occurredAt: timestamp, newValues: { action: input.action, stageId: input.stageId ?? null, eventId, onBehalfOfClient, proofAvailable: Boolean(proof), ...(mediaFiles.length ? { mediaCount: mediaFiles.length } : {}), version: saved.version, ...auditDetails }, reason: input.note || null }, tx);
          return { version: saved.version, replayed: false };
        });
      } catch (error) {
        if ((proof || mediaFiles.length) && attemptedWrite) {
          let latest: DesignWorkflowState | null;
          try { latest = await repository.findDesignWorkflowState(projectId); }
          catch { throw new WorkflowProofRetentionError(); }
          const committed = latest?.history.find((event) => event.idempotencyKey === input.idempotencyKey && event.actorId === actor.id && event.requestHash === hash);
          if (committed) {
            const attemptedReferences = [...(proof ? [proof.storageReference] : []), ...mediaFiles.map((item) => item.storageReference)];
            const committedReferences = [...(committed.proof ? [committed.proof.storageReference] : []), ...(committed.mediaFiles ?? []).map((item) => item.storageReference)];
            const sameEvidence = attemptedReferences.length === committedReferences.length && attemptedReferences.every((reference, index) => reference === committedReferences[index]);
            // A partial match is not a safe cleanup signal; retain the entire attempt for reconciliation.
            if (!sameEvidence && attemptedReferences.some((reference) => committedReferences.includes(reference))) throw new WorkflowProofRetentionError();
            return { version: latest!.version, replayed: !sameEvidence };
          }
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
type FurnitureReviewEvidence = { eventId: string; mediaId?: string; filename: string; mimeType: string; byteSize: number; source: "site_measurement" | "furniture_requirements" | "furniture_dimensions" };

type FurnitureRequirementsSubmission = { kind: "legacy" } | { kind: "invalid" } | { kind: "combined"; event: DesignWorkflowHistoryEvent };
function furnitureRequirementsSubmission(state: DesignWorkflowState, stageId: string): FurnitureRequirementsSubmission {
  const current = state.stages.existing_furniture_dimensions;
  const latest = state.history.filter(event => event.action === "furniture_scope" && event.stageId === stageId).at(-1);
  const pointer = current?.requirementsSubmissionEventId;
  const combined = pointer !== undefined || Boolean(latest && Object.hasOwn(latest.data ?? {}, "dimensions")) || Boolean(!current?.acceptedAt && current?.rooms?.some(room => room.dimensions));
  if (!combined) return { kind: "legacy" };
  const invalid = { kind: "invalid" } as const;
  const matches = state.history.filter(event => event.id === pointer);
  const event = matches.length === 1 ? matches[0] : undefined;
  if (!pointer || !current?.rooms || !event || event !== latest || event.actorRole !== "designer" || event.onBehalfOfClient) return invalid;
  const parsed = furnitureStoredScopeSchema.safeParse(event.data);
  if (!parsed.success) return invalid;
  const submitted = parsed.data;
  if (submitted.notApplicable ? submitted.rooms.length !== 0 : submitted.rooms.length === 0) return invalid;
  if (Boolean(current.noExistingFurniture) !== Boolean(submitted.notApplicable) || new Set(submitted.rooms.map(room => room.id)).size !== submitted.rooms.length || new Set(current.rooms.map(room => room.id)).size !== current.rooms.length || current.rooms.length !== submitted.rooms.length) return invalid;
  if (current.rooms.some(room => !submitted.rooms.some(saved => saved.id === room.id && saved.required === room.required))) return invalid;
  const required = current.rooms.filter(room => room.required);
  if (required.length && !event.proof || submitted.dimensions.length !== required.length || new Set(submitted.dimensions.map(room => room.roomId)).size !== submitted.dimensions.length || submitted.dimensions.some(room => !required.some(saved => saved.id === room.roomId))) return invalid;
  for (const room of current.rooms) {
    const dimensions = room.dimensions;
    if (!room.required) { if (dimensions) return invalid; else continue; }
    if (!dimensions || dimensions.submissionEventId !== pointer || dimensions.submittedAt !== event.at || room.uploadedAt !== event.at || room.proceed || !["pending", "changes_requested", "approved"].includes(dimensions.status) || !Number.isInteger(dimensions.revision) || dimensions.revision < 1) return invalid;
    const items = z.array(furnitureStoredItemSchema).safeParse(dimensions.items);
    const saved = submitted.dimensions.find(entry => entry.roomId === room.id)!;
    if (!items.success || JSON.stringify(items.data) !== JSON.stringify(saved.items)) return invalid;
  }
  return { kind: "combined", event };
}

function currentFurnitureSubmission(state: DesignWorkflowState, stageId: string, room: WorkflowRoom): DesignWorkflowHistoryEvent | undefined {
  const dimensions = room.dimensions;
  if (!dimensions) return undefined;
  const matches = state.history.filter((event) => event.id === dimensions.submissionEventId);
  const event = matches.length === 1 ? matches[0] : undefined;
  if (event?.action === "furniture_scope") {
    const bundle = furnitureRequirementsSubmission(state, stageId);
    return bundle.kind === "combined" && bundle.event.id === event.id ? event : undefined;
  }
  if (!event?.proof || event.action !== "furniture_upload" || event.stageId !== stageId || event.at !== dimensions.submittedAt || !["designer", "client", "admin", "super_admin"].includes(event.actorRole)) return undefined;
  if (event.onBehalfOfClient !== (event.actorRole === "admin" || event.actorRole === "super_admin")) return undefined;
  const submitted = furnitureStoredSubmissionSchema.safeParse(event.data);
  if (!submitted.success) return undefined;
  const entries = submitted.data.rooms.filter((entry) => entry.roomId === room.id);
  const currentItems = z.array(furnitureStoredItemSchema).safeParse(dimensions.items);
  return entries.length === 1 && currentItems.success && JSON.stringify(entries[0]!.items) === JSON.stringify(currentItems.data) ? event : undefined;
}

function projectFurnitureEvidence(stageId: string, state: DesignWorkflowState, canReadProof: boolean, context?: WorkflowStageContext): FurnitureReviewEvidence[] | undefined {
  if (!canReadProof || !context?.projectId || state.projectId !== context.projectId) return undefined;
  const evidence: FurnitureReviewEvidence[] = [];
  const completedAt = state.stages.site_measurement?.completedAt;
  const measurementEvents = completedAt && context.measurementStageId ? state.history.filter((event) => event.action === "measurement_complete" && event.stageId === context.measurementStageId && event.at === completedAt && event.actorRole === "designer" && !event.onBehalfOfClient) : [];
  const measurement = measurementEvents.length === 1 ? measurementEvents[0] : undefined;
  if (measurement) {
    if (measurement.proof) evidence.push({ eventId: measurement.id, filename: measurement.proof.originalFilename, mimeType: measurement.proof.mimeType, byteSize: measurement.proof.byteSize, source: "site_measurement" });
    for (const media of measurement.mediaFiles ?? []) evidence.push({ eventId: measurement.id, mediaId: media.id, filename: media.originalFilename, mimeType: media.mimeType, byteSize: media.byteSize, source: "site_measurement" });
  }
  const bundle = furnitureRequirementsSubmission(state, stageId);
  const declaration = bundle.kind === "combined" ? bundle.event : bundle.kind === "legacy" ? state.history.filter((event) => event.action === "furniture_scope" && event.stageId === stageId).at(-1) : undefined;
  if (declaration?.proof && declaration.actorRole === "designer" && !declaration.onBehalfOfClient) evidence.push({ eventId: declaration.id, filename: declaration.proof.originalFilename, mimeType: declaration.proof.mimeType, byteSize: declaration.proof.byteSize, source: "furniture_requirements" });
  const dimensionEventIds = new Set(evidence.map(entry => entry.eventId));
  for (const room of state.stages.existing_furniture_dimensions?.rooms ?? []) {
    const event = currentFurnitureSubmission(state, stageId, room);
    if (event?.proof && !dimensionEventIds.has(event.id)) {
      dimensionEventIds.add(event.id);
      evidence.push({ eventId: event.id, filename: event.proof.originalFilename, mimeType: event.proof.mimeType, byteSize: event.proof.byteSize, source: "furniture_dimensions" });
    }
  }
  return evidence;
}

function projectFurnitureProgress(current: WorkflowStageState, evidence?: FurnitureReviewEvidence[], canReadProof = false, requirementsSubmissionEventId?: string) {
  const requiredRooms = current.rooms?.filter((room) => room.required) ?? [];
  const readyRoomCount = requiredRooms.filter((room) => workflowFurnitureRoomReady(current, room)).length;
  const phase = current.completedAt ? "completed" as const
    : !current.rooms ? "requirements_pending" as const
    : current.scopeReturn ? "requirements_changes_requested" as const
    : !current.acceptedAt ? "awaiting_client_acceptance" as const
    : requiredRooms.some((room) => room.dimensions?.status === "changes_requested") ? "dimension_changes_requested" as const
    : requiredRooms.some((room) => room.dimensions?.status === "pending") ? "awaiting_dimension_approval" as const
    : "awaiting_dimensions" as const;
  return { phase, notApplicable: Boolean(current.noExistingFurniture), requiredRoomCount: requiredRooms.length, readyRoomCount, pendingRoomCount: requiredRooms.length - readyRoomCount, ...(requirementsSubmissionEventId && canReadProof ? { requirementsSubmissionEventId } : {}), ...(current.scopeReturn && canReadProof ? { scopeReturn: { ...current.scopeReturn } } : {}), ...(evidence ? { evidence } : {}) };
}

function confirmedSpacePlanning(state: DesignWorkflowState, stageId: string, source: WorkflowSpacePlanningSource | null | undefined): boolean {
  const current = state.stages.space_planning_tentative_look_feel;
  const approval = current?.spacePlanningApproval;
  if (!current?.completedAt || !approval || !source?.readyForCompletion || approval.estimateId !== source.estimateId || approval.designPlanVersion !== source.designPlanVersion || approval.reviewRoundId !== source.reviewRoundId) return false;
  const events = state.history.filter(event => event.action === "space_planning_complete" && event.stageId === stageId && event.at === current.completedAt);
  return events.length === 1 && events[0]!.actorRole === "client" && !events[0]!.onBehalfOfClient && Boolean(events[0]!.actorId) && events[0]!.data?.estimateId === approval.estimateId && events[0]!.data?.designPlanVersion === approval.designPlanVersion && events[0]!.data?.reviewRoundId === approval.reviewRoundId && events[0]!.data?.completedAt === current.completedAt;
}

export function projectOperationalStage(stage: ProjectDesignWorkflowStage, state: DesignWorkflowState, capabilities: WorkflowCapabilities, now: Date, actorId: string, measurementAssigneeName?: string, context?: WorkflowStageContext) {
  const stored = state.stages[stage.type] ?? {};
  const spacePlanning = stage.type === "space_planning_tentative_look_feel" ? context?.spacePlanning : undefined;
  const validSpaceCompletion = stage.type !== "space_planning_tentative_look_feel" || confirmedSpacePlanning(state, stage.id, spacePlanning);
  const current = validSpaceCompletion ? stored : { ...stored, completedAt: undefined };
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
  const furnitureSubmission = stage.type === "existing_furniture_dimensions" ? furnitureRequirementsSubmission(state, stage.id) : undefined;
  const actions = workflowAvailableActions(state, stage.type, capabilities, now.getTime(), actorId, context).map(action => {
    if (furnitureSubmission?.kind !== "combined") return action;
    if (action.id === "furniture_accept") return { ...action, label: "Approve requirements and dimensions" };
    if (action.id === "furniture_scope_return") return { ...action, label: "Send back requirements and dimensions" };
    return action;
  });
  const submitted = submittedInternalKickoffEvent(state, context?.projectId, context?.internalKickoffStageId);
  const canReadProof = capabilities.client || capabilities.designer || capabilities.manager || capabilities.sales;
  const canReadFurnitureDetails = canReadProof && context?.projectId === state.projectId;
  const showSubmittedDocument = stage.type === "client_kickoff" ? capabilities.client : stage.type === "internal_kickoff" && stage.id === submitted?.stageId && canReadProof;
  const submittedDocument = showSubmittedDocument && submitted?.proof ? { eventId: submitted.id, filename: submitted.proof.originalFilename, mimeType: submitted.proof.mimeType, uploadedAt: submitted.at } : undefined;
  const reasons: string[] = [];
  if (!state.initialPaymentAt) reasons.push(paymentBlockingReason(context));
  if (paused) reasons.push("Site access is unavailable. All workflow clocks are paused.");
  if (!current.completedAt && (stage.type !== "space_planning_tentative_look_feel" || spacePlanning || context?.spacePlanningIssue || stored.spacePlanningApproval)) reasons.push(...workflowStagePrerequisiteBlockers(state, stage.type));
  if (stage.type === "space_planning_tentative_look_feel") {
    reasons.push(...workflowSubmissionBlockers(state));
    if (context?.spacePlanningIssue) reasons.push(context.spacePlanningIssue);
    if (spacePlanning) reasons.push(...spacePlanning.blockingReasons);
    if (stored.completedAt && !validSpaceCompletion) reasons.push("The stage confirmation no longer matches the current approved Design plan. Reconcile the approval source.");
  }
  const facts: Array<{ label: string; value: string }> = [];
  for (const [field, label] of [["meetingAt", "Meeting conducted"], ["calendarAcceptedAt", "Sales calendar accepted"], ["requestedAt", "Meeting requested"], ["preferredAt", "Requested meeting date"], ["scheduledAt", "Client meeting date"], ["handedOverAt", "Client handed over keys"], ["receivedAt", "Designer received keys"], ["mediaFolderUrl", "Photos and videos folder"]] as const) if (current[field]) facts.push({ label, value: current[field]! });
  if (current.assignedDesignerId) facts.push({ label: "Assigned measurement Designer", value: measurementAssigneeName ?? "Assigned project Designer" });
  if (current.handoverAcknowledgedAt) facts.push({ label: "Design handover acknowledged by", value: current.handoverAcknowledgedByName ?? "Designer" }, { label: "Design handover acknowledged at", value: current.handoverAcknowledgedAt });
  if (current.managerHandedOverAt) facts.push({ label: "Previous manager handover", value: current.handoverManagerName ?? "Design Manager" }, { label: "Previous manager handover recorded at", value: current.managerHandedOverAt });
  if (current.notRequired) facts.push({ label: "Client kickoff", value: "Not necessary" });
  if (current.noExistingFurniture) facts.push({ label: "Existing furniture", value: current.acceptedAt ? "Not applicable — accepted by Client" : "Not applicable — Client confirmation required" });
  const history = state.history.filter((event) => event.stageId === stage.id).map((event) => ({ id: event.id, action: event.action, actorName: event.actorName, actorRole: event.actorRole, onBehalfOfClient: event.onBehalfOfClient, at: event.at, mediaFiles: canReadProof ? (event.mediaFiles ?? []).map(({ id, originalFilename, mimeType, byteSize, kind }) => ({ id, filename: originalFilename, mimeType, byteSize, kind })) : [], note: event.action === "internal_kickoff_complete" && actorId && !capabilities.designer && !capabilities.sales && !capabilities.manager ? "" : event.note, proofAvailable: Boolean(event.proof) && (event.action !== "internal_kickoff_complete" || capabilities.designer || capabilities.sales || capabilities.manager || capabilities.client && submitted?.id === event.id) }));
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
    ...(spacePlanning && canReadProof ? { spacePlanning: { estimateId: spacePlanning.estimateId, designPlanVersion: spacePlanning.designPlanVersion, reviewRoundId: spacePlanning.reviewRoundId, totalImages: spacePlanning.totalImages, approvedImages: spacePlanning.approvedImages, readyForCompletion: spacePlanning.readyForCompletion && reasons.length === 0 && !current.completedAt, completedAt: current.completedAt ?? null } } : {}),
    ...(stage.type === "existing_furniture_dimensions" ? { furniture: projectFurnitureProgress(current, projectFurnitureEvidence(stage.id, state, canReadProof, context), canReadFurnitureDetails, furnitureSubmission?.kind === "combined" ? furnitureSubmission.event.id : undefined) } : {}),
    ...(submittedDocument ? { submittedDocument } : {}),
    ...(current.rooms ? { rooms: current.rooms.map((room) => ({ id: room.id, name: room.name, required: room.required, hasDimensions: Boolean(room.uploadedAt), canProceed: workflowFurnitureRoomReady(current, room), ...(room.dimensions && canReadFurnitureDetails ? { dimensions: structuredClone(room.dimensions) } : {}) })) } : {})
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

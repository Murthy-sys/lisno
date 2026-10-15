import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";
import { designRequirementActionSchema, designRequirementsDigest, designRequirementsSourceToken,
  designRequirementsSubmissionBlockers, projectDesignRequirements, type DesignRequirementEntry,
  type DesignRequirementsSource, type DesignRequirementsState, type DesignRequirementActionInput
} from "../domain/design-requirements.js";
import { ApiError } from "../middleware/errors.js";
import { mongoDesignRequirementsSource, mongoDesignRequirementsState } from "../repositories/design-requirements-mongo.js";
import { RepositoryConflictError, type AppRepository } from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { requireDesignWorkflowReadScope } from "./design-workflow-state.service.js";
import { requireActor, systemClock, type Clock } from "./workflow.js";

function conflict(message = "Design requirements changed. Refresh before continuing."): never {
  throw new ApiError(409, "DESIGN_REQUIREMENTS_CONFLICT", message);
}
function missing(): never { throw new ApiError(404, "NOT_FOUND", "The requested project was not found."); }
const emptyState = (projectId: string): DesignRequirementsState => ({ projectId, version: 0, history: [] });

function allowedActions(actor: PublicUser, source: DesignRequirementsSource, entry: DesignRequirementEntry): DesignRequirementEntry["availableActions"] {
  const designer = actor.role === "designer" && source.designerIds.includes(actor.id);
  const client = actor.role === "client" && source.clientId === actor.id;
  const procurement = actor.role === "procurement" && source.procurementIds.includes(actor.id);
  if (entry.ruleKey === "clientFinishApproval") {
    if (client) return entry.status === "approved" ? ["reopen"] : ["approve"];
    if (designer) return entry.status === "pending" ? ["defer"] : entry.status === "deferred" ? ["reopen"] : [];
    return [];
  }
  if (entry.category === "stock") return procurement ? entry.status === "completed" ? ["reopen"] : ["complete"] : [];
  if (!designer) return [];
  if (entry.category === "po_approval" && source.poDesignerId !== actor.id) return [];
  if (entry.status === "completed" || entry.status === "approved") return ["reopen"];
  if (entry.category === "selection") return entry.status === "deferred" ? ["approve", "reopen"] : ["approve", "defer"];
  return [entry.category === "po_approval" ? "approve" : "complete"];
}

function present(actor: PublicUser, source: DesignRequirementsSource, state: DesignRequirementsState) {
  const internal = actor.role !== "client";
  const all = projectDesignRequirements(source, state);
  const entries = all.filter(entry => internal || entry.ruleKey === "clientFinishApproval").map(entry => {
    const { sourceDigest: _privateDigest, ...safe } = entry;
    return { ...safe, ...(!internal && entry.completedById !== actor.id ? { note: "", deferredReason: null } : {}), availableActions: allowedActions(actor, source, entry) };
  });
  return { projectId: source.projectId, version: state.version, sourceToken: designRequirementsSourceToken(source),
    entries, canReadInternal: internal,
    blockers: internal ? designRequirementsSubmissionBlockers(source, all) : entries.filter(entry => entry.status === "pending").map(entry => `${entry.lineName}: ${entry.label} is awaiting your approval.`)
  };
}

export function createDesignRequirementsService(input: { repository: AppRepository; audit: AuditService; clock?: Clock }) {
  const { repository, audit } = input;
  const clock = input.clock ?? systemClock;
  return {
    async get(actor: PublicUser, projectId: string) {
      return repository.runInTransaction(async tx => {
        await requireDesignWorkflowReadScope(tx, actor, projectId);
        const source = await tx.findDesignRequirementsSource(projectId);
        if (!source) missing();
        return present(actor, source, await tx.findDesignRequirementsState(projectId) ?? emptyState(projectId));
      });
    },
    async act(actor: PublicUser, projectId: string, raw: DesignRequirementActionInput) {
      const parsed = designRequirementActionSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Supply a valid requirement action, note and source version.");
      const action = parsed.data;
      const requestDigest = designRequirementsDigest([actor.id, projectId, action]);
      try {
        return await repository.runInTransaction(async tx => {
          await tx.coordinateAuthorizationMutation();
          await requireActor(tx, actor);
          const source = await tx.findDesignRequirementsSource(projectId, true);
          if (!source || !(actor.role === "designer" && source.designerIds.includes(actor.id) || actor.role === "client" && source.clientId === actor.id || actor.role === "procurement" && source.procurementIds.includes(actor.id))) missing();
          const state = await tx.findDesignRequirementsState(projectId, true) ?? emptyState(projectId);
          const replay = state.history.find(event => event.idempotencyKey === action.idempotencyKey);
          if (replay) {
            if (replay.requestDigest !== requestDigest || replay.actorId !== actor.id) conflict("This idempotency key belongs to another action.");
            return { ...present(actor, source, state), replayed: true };
          }
          if (state.version !== action.expectedVersion || designRequirementsSourceToken(source) !== action.sourceToken) conflict();
          if (source.issues.length) conflict("Current Configuration must be reconciled before recording requirements.");
          const entry = projectDesignRequirements(source, state).find(row => row.id === action.entryId);
          if (!entry || !allowedActions(actor, source, entry).includes(action.action)) throw new ApiError(403, "DESIGN_REQUIREMENT_ACTION_FORBIDDEN", "This requirement action is not available for your assignment.");
          const checkedIds = [...new Set(action.checkedPointIds)].sort();
          if (entry.category === "po_approval" && action.action === "approve") {
            if (!entry.checklist.length || checkedIds.length !== entry.checklist.length || entry.checklist.some(point => !checkedIds.includes(point.id))) {
              throw new ApiError(400, "DESIGN_PO_CHECKLIST_INCOMPLETE", "Confirm every Designer PO Approval Checklist point before signing off.");
            }
          } else if (checkedIds.length) throw new ApiError(400, "DESIGN_REQUIREMENT_CHECKLIST_INVALID", "Checklist points apply only to Designer PO approval.");
          const occurredAt = clock().toISOString();
          const event = { id: `design-requirement-event-${randomUUID()}`, entryId: entry.id, sourceDigest: entry.sourceDigest,
            ruleKey: entry.ruleKey, lineItemId: entry.lineItemId, mainLineId: entry.mainLineId, action: action.action,
            actorId: actor.id, actorRole: actor.role, occurredAt, note: action.note, checkedPointIds: checkedIds,
            idempotencyKey: action.idempotencyKey, requestDigest };
          const saved = await tx.saveDesignRequirementsState(projectId, state.version, { ...state, history: [...state.history, event] });
          await audit.append({ actorId: actor.id, action: "design_requirement_action_recorded", entityType: "design_requirement", entityId: entry.id,
            occurredAt, oldValues: { status: entry.status, version: state.version }, newValues: { projectId, eventId: event.id, ruleKey: entry.ruleKey,
              lineItemId: entry.lineItemId, mainLineId: entry.mainLineId, action: action.action, checkedPointIds: checkedIds, version: saved.version }, reason: action.note }, tx);
          return { ...present(actor, source, saved), replayed: false };
        });
      } catch (error) { if (error instanceof RepositoryConflictError) conflict(error.message); throw error; }
    }
  };
}

export async function assertDesignRequirementsSubmissionAllowed(repository: AppRepository, projectId: string, lock = false) {
  const source = await repository.findDesignRequirementsSource(projectId, lock);
  if (!source) missing();
  const state = await repository.findDesignRequirementsState(projectId, lock) ?? emptyState(projectId);
  const entries = projectDesignRequirements(source, state);
  const blockers = designRequirementsSubmissionBlockers(source, entries);
  if (blockers.length) throw new ApiError(409, "DESIGN_REQUIREMENTS_BLOCKED", blockers.join(" "));
  return { version: state.version, sourceToken: designRequirementsSourceToken(source), entries };
}

/** Shared projection for PO preparation and all transaction-bound PO mutations. */
async function poBlockers(projectId: string, sourceLineItemKeys: readonly string[], session?: ClientSession, lock = false) {
  const source = await mongoDesignRequirementsSource(projectId, session, lock, sourceLineItemKeys);
  if (!source) missing();
  const state = await mongoDesignRequirementsState(projectId, session, lock) ?? emptyState(projectId);
  const selected = new Set(sourceLineItemKeys);
  const entries = projectDesignRequirements(source, state).filter(entry => selected.has(entry.lineItemId) && (entry.ruleKey === "designerPoApproval" || entry.ruleKey === "designerVendorSelection"));
  return [...source.issues, ...entries.filter(entry => entry.status !== "approved" && entry.status !== "completed").map(entry => `${entry.lineName}: ${entry.label} must be signed off by the assigned Designer before the PO is raised.`)];
}
export async function designRequirementsPoBlockers(projectId: string, sourceLineItemKeys: readonly string[], session?: ClientSession) {
  return poBlockers(projectId, sourceLineItemKeys, session);
}
export async function assertDesignRequirementsPoAllowed(projectId: string, sourceLineItemKeys: readonly string[], session: ClientSession) {
  if (!session.inTransaction()) throw new Error("Designer PO approval must be checked in the PO transaction.");
  const blockers = await poBlockers(projectId, sourceLineItemKeys, session, true);
  if (blockers.length) throw new ApiError(409, "DESIGN_REQUIREMENTS_PO_BLOCKED", blockers.join(" "));
}

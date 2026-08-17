import { randomUUID } from "node:crypto";

import { ApiError } from "../middleware/errors.js";
import type { AppRepository, LeadActivityRecord, LeadFilters, LeadRecord, PageResult, PaginationInput } from "../repositories/types.js";
import type { PublicUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";
import { forbidden, requireActor, type Clock } from "./workflow.js";

export interface CreateLeadInput {
  clientName: string; clientEmail: string; clientMobile: string; projectName: string; location: string; propertyType: string;
  budgetMin?: number | null; budgetMax?: number | null; source: string; nextAction: string; nextActionAt: string;
  builder?: string | null; areaSqft?: number | null; targetHandoverAt?: string | null; notes?: string | null;
}
export interface UpdateLeadInput extends Partial<CreateLeadInput> { stage?: LeadRecord["stage"]; }
export interface CreateLeadActivityInput { type: LeadActivityRecord["type"]; note: string; occurredAt: string; }
export interface LeadService {
  page(actor: PublicUser, filters: LeadFilters, pagination: PaginationInput): Promise<PageResult<LeadRecord>>;
  get(actor: PublicUser, leadId: string): Promise<LeadRecord>;
  create(actor: PublicUser, input: CreateLeadInput): Promise<LeadRecord>;
  update(actor: PublicUser, leadId: string, input: UpdateLeadInput): Promise<LeadRecord>;
  listActivities(actor: PublicUser, leadId: string): Promise<LeadActivityRecord[]>;
  addActivity(actor: PublicUser, leadId: string, input: CreateLeadActivityInput): Promise<LeadActivityRecord>;
}

export function createLeadService(repository: AppRepository, audit: AuditService, clock: Clock): LeadService {
  const owned = async (actor: PublicUser, id: string) => {
    await requireEstimator(repository, actor);
    const lead = await repository.findLeadById(id);
    if (!lead || lead.ownerId !== actor.id) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    return lead;
  };
  const findLeadForReader = async (actor: PublicUser, id: string) => {
    await requireActor(repository, actor);
    if (actor.role !== "super_admin") return owned(actor, id);
    const lead = await repository.findLeadById(id);
    if (!lead) throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
    return lead;
  };
  return {
    async page(actor, filters, pagination) {
      await requireActor(repository, actor);
      if (actor.role === "super_admin") return repository.pageAllLeads(filters, pagination);
      if (actor.role !== "estimator_sales") forbidden();
      return repository.pageLeadsForOwner(actor.id, filters, pagination);
    },
    async get(actor, leadId) { return findLeadForReader(actor, leadId); },
    async create(actor, input) {
      await requireEstimator(repository, actor);
      const now = clock().toISOString();
      const fields = clean(input) as CreateLeadInput;
      const record: LeadRecord = { id: `lead-${randomUUID()}`, ownerId: actor.id, ...fields, budgetMin: fields.budgetMin ?? null, budgetMax: fields.budgetMax ?? null, builder: fields.builder ?? null, areaSqft: fields.areaSqft ?? null, targetHandoverAt: fields.targetHandoverAt ?? null, notes: fields.notes ?? null, stage: "new_lead", latestActivityAt: null, createdAt: now, updatedAt: now };
      return repository.runInTransaction(async (tx) => { const lead = await tx.createLead(record); await audit.append({ actorId: actor.id, action: "lead_created", entityType: "lead", entityId: lead.id, occurredAt: now, newValues: { stage: lead.stage } }, tx); return lead; });
    },
    async update(actor, leadId, input) {
      const current = await owned(actor, leadId); const now = clock().toISOString();
      return repository.runInTransaction(async (tx) => { const lead = await tx.updateLead(leadId, { ...clean(input), stage: input.stage, updatedAt: now }); await audit.append({ actorId: actor.id, action: "lead_updated", entityType: "lead", entityId: leadId, occurredAt: now, oldValues: { stage: current.stage }, newValues: { stage: lead.stage } }, tx); return lead; });
    },
    async listActivities(actor, leadId) { await findLeadForReader(actor, leadId); return repository.listLeadActivities(leadId); },
    async addActivity(actor, leadId, input) {
      await owned(actor, leadId); const now = clock().toISOString();
      return repository.runInTransaction(async (tx) => { const activity = await tx.appendLeadActivity({ id: `lead-activity-${randomUUID()}`, leadId, actorId: actor.id, type: input.type, note: input.note.trim(), occurredAt: input.occurredAt, createdAt: now }); await tx.updateLead(leadId, { latestActivityAt: input.occurredAt, updatedAt: now }); await audit.append({ actorId: actor.id, action: "lead_activity_added", entityType: "lead", entityId: leadId, occurredAt: now, newValues: { type: input.type } }, tx); return activity; });
    }
  };
}
async function requireEstimator(repository: AppRepository, actor: PublicUser) { await requireActor(repository, actor); if (actor.role !== "estimator_sales") forbidden(); }
function clean(input: Partial<CreateLeadInput>): Partial<CreateLeadInput> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]).filter(([, value]) => value !== undefined));
}

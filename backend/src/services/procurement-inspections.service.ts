import { randomInt } from "node:crypto";
import type { ClientSession } from "mongoose";
import type { LifecycleItem, LifecycleReadiness, LifecycleSource } from "../contracts/procurement-lifecycle.js";
import type { ProcurementInspectionFinding, ProcurementInspectionPage, ProcurementInspectionPlan, ProcurementInspectionVisit } from "../contracts/procurement-inspections.js";
import { chooseInspectionInstant, procurementInspectionCorrectionSchema, procurementInspectionPlanSchema, procurementInspectionRecordSchema, type ProcurementInspectionRecordInput, type ProcurementInspectionCorrectionInput } from "../domain/procurement-inspections.js";
import { lcConflict, lcDigest, lcLocalDate, lcMissing, lcPage, lcParse } from "../domain/procurement-lifecycle.js";
import { ProcurementInspectionPlanModel } from "../models/ProcurementInspectionPlan.js";
import { ProcurementInspectionVisitModel } from "../models/ProcurementInspectionVisit.js";
import { ProcurementLifecycleStateModel } from "../models/ProcurementLifecycleState.js";
import { ProcurementFindingModel } from "../models/ProcurementFinding.js";
import type { PublicUser } from "./auth.service.js";
import { requireLifecycleProject, type LifecycleRow } from "./procurement-lifecycle/access.js";
import { assertLifecycleEvidence } from "./procurement-lifecycle/evidence.js";
import { assertLifecycleSource, readLifecycleSource } from "./procurement-lifecycle/source.js";
import { lcHistory, lcRunCommand, lcTransaction, type LifecycleDependencies } from "./procurement-lifecycle/transaction.js";
import { recordLifecycleFindingInSession, type CreateLifecycleFinding } from "./procurement-findings.service.js";

interface InspectionDependencies extends LifecycleDependencies { random?: () => number; createFindingInSession?: CreateLifecycleFinding; }
const readers = ["procurement", "super_admin"] as const;
const iso = (value: unknown): string => new Date(value as string | Date).toISOString();

function visitDto(row: LifecycleRow): ProcurementInspectionVisit {
  return { id: String(row._id), projectId: row.projectId, planId: row.planId, planVersion: row.planVersion, slotId: row.slotId ?? null,
    sourceDigest: row.sourceDigest, inspectedAt: iso(row.inspectedAt), recordedAt: iso(row.recordedAt), inspectorId: row.inspectorId, inspectorName: row.inspectorName,
    itemIds: row.itemIds, items: row.items, notes: row.notes, delayed: row.delayed, delayReason: row.delayReason ?? null,
    responsibleParty: row.responsibleParty ?? null, recoveryAction: row.recoveryAction ?? null, recoveryDate: row.recoveryDate ?? null,
    evidenceIds: row.evidenceIds, findings: row.findings, late: row.late, revision: row.revision,
    correctionOf: row.correctionOf ?? null, correctionReason: row.correctionReason ?? null };
}

async function planDto(row: LifecycleRow, at: Date, session: ClientSession): Promise<ProcurementInspectionPlan> {
  const visits = await ProcurementInspectionVisitModel.find({ projectId: row.projectId, planId: row._id, isOriginal: true, slotId: { $type: "string" } }).session(session).lean() as LifecycleRow[];
  return { id: String(row._id), projectId: row.projectId, version: row.version, count: row.count, sourceDigest: row.sourceDigest,
    slots: (row.slots as LifecycleRow[]).map(slot => {
      const visit = visits.find(candidate => candidate.slotId === slot.id);
      return { id: slot.id, startsAt: iso(slot.startsAt), endsAt: iso(slot.endsAt), plannedAt: iso(slot.plannedAt), originalPlannedAt: iso(slot.originalPlannedAt),
        visitId: visit ? String(visit._id) : null, late: visit ? Boolean(visit.late) : at > new Date(slot.originalPlannedAt) };
    }), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

export async function readInspectionReadiness(projectId: string, session: ClientSession, at = new Date()): Promise<LifecycleReadiness> {
  const source = await readLifecycleSource(projectId, session);
  const row = await ProcurementInspectionPlanModel.findOne({ projectId }).session(session).lean() as LifecycleRow | null;
  if (!row) return { ready: false, sourceDigest: source.digest, blockers: [{ code: "INSPECTION_PLAN_REQUIRED", message: "Plan two or three project inspections before signoff.", tab: "progress" }], references: {} };
  const plan = await planDto(row, at, session); const blockers: LifecycleReadiness["blockers"] = [...source.blockers];
  const visitRows = await ProcurementInspectionVisitModel.find({ projectId, planId: plan.id }).sort({ revision: -1, _id: 1 }).session(session).lean() as LifecycleRow[];
  const latestVisitIds = plan.slots.flatMap(slot => {
    if (!slot.visitId) return [];
    const latest = visitRows.find(visit => visit.rootVisitId === slot.visitId);
    return latest ? [String(latest._id)] : [];
  });
  if (plan.sourceDigest !== source.digest) blockers.push({ code: "INSPECTION_SOURCE_CHANGED", message: "Reconcile the project inspection plan with current appointed work.", tab: "progress", entityId: plan.id });
  for (const slot of plan.slots) if (!slot.visitId) blockers.push({ code: "INSPECTION_REQUIRED", message: `Record planned project inspection ${plan.slots.indexOf(slot) + 1} of ${plan.count}.`, tab: "progress", entityId: slot.id });
  return { ready: blockers.length === 0, sourceDigest: lcDigest({ source: source.digest, planId: plan.id, version: plan.version, visits: latestVisitIds }), blockers,
    references: { inspectionPlanId: plan.id, inspectionPlanVersion: String(plan.version), inspectionVisitIds: latestVisitIds } };
}

export function createProcurementInspectionsService(deps: InspectionDependencies) {
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? (() => randomInt(0, 2 ** 32) / 2 ** 32);
  async function pageInSession(actor: PublicUser, projectId: string, session: ClientSession, page: { limit: number; offset: number }, source?: LifecycleSource): Promise<ProcurementInspectionPage> {
    const currentSource = source ?? await readLifecycleSource(projectId, session); const at = now();
    const row = await ProcurementInspectionPlanModel.findOne({ projectId }).session(session).lean() as LifecycleRow | null;
    const state = await ProcurementLifecycleStateModel.findById(projectId).session(session).lean();
    const plan = row ? await planDto(row, at, session) : null;
    const rows = await ProcurementInspectionVisitModel.find({ projectId }).sort({ recordedAt: -1, revision: -1, _id: 1 }).skip(page.offset).limit(page.limit).session(session).lean() as LifecycleRow[];
    const total = await ProcurementInspectionVisitModel.countDocuments({ projectId }).session(session);
    const blockers: ProcurementInspectionPage["blockers"] = [...currentSource.blockers];
    if (!state) blockers.push({ code: "LIFECYCLE_SETUP_REQUIRED", message: "Set up the Procurement lifecycle before planning visits.", tab: "progress" });
    if (!plan) blockers.push({ code: "INSPECTION_PLAN_REQUIRED", message: "Plan two or three physical inspections across this project.", tab: "progress" });
    if (plan && plan.sourceDigest !== currentSource.digest) blockers.push({ code: "INSPECTION_SOURCE_CHANGED", message: "Reconcile the inspection plan with current appointed work.", tab: "progress", entityId: plan.id });
    const history = await lcHistory(projectId, session, `inspection-plan:${projectId}`);
    return { projectId, serverNow: at.toISOString(), sourceDigest: currentSource.digest, plan, visits: rows.map(visitDto), total, ...page,
      completedCount: plan?.slots.filter(slot => Boolean(slot.visitId)).length ?? 0, requiredCount: plan?.count ?? state?.policy.inspectionCount ?? 2,
      blockers, allowedActions: actor.role === "procurement" && state && currentSource.available ? ["plan", ...(plan && plan.sourceDigest === currentSource.digest ? ["record", "correct"] : [])] : [], history: history.items };
  }
  async function findings(actor: PublicUser, projectId: string, entityId: string, input: ProcurementInspectionRecordInput | ProcurementInspectionCorrectionInput, source: LifecycleSource, session: ClientSession): Promise<ProcurementInspectionFinding[]> {
    const result: ProcurementInspectionFinding[] = [];
    if (new Set(input.findings.map(finding => finding.id)).size !== input.findings.length) lcConflict("Each inspection finding needs a distinct identity.");
    for (const finding of input.findings) {
      if (!deps.createFindingInSession) lcConflict("Inspection findings are unavailable. Refresh or contact the project administrator.");
      const sourceItem = finding.itemId ? source.items.find(item => item.id === finding.itemId) : null;
      if (finding.itemId && (!sourceItem || !input.itemIds.includes(finding.itemId))) lcConflict("A finding must refer to an item covered by this visit.");
      await recordLifecycleFindingInSession({ ...deps, createFindingInSession: deps.createFindingInSession }, { actor, projectId,
        findingId: finding.id, sourceItem: sourceItem ?? null, title: finding.title, note: finding.note,
        ownerId: finding.ownerId, dueAt: finding.dueAt, evidenceIds: finding.evidenceIds,
        origin: { kind: "inspection", entityId, checkId: finding.id }, sourceDigest: source.digest, evidenceEntityId: entityId }, session);
      const stored = await ProcurementFindingModel.findOne({ _id: finding.id, projectId }).session(session).lean();
      if (!stored) lcConflict("Inspection finding history could not be linked.");
      result.push({ ...finding, snagId: stored.snagId });
    }
    return result;
  }
  async function validateVisit(projectId: string, input: ProcurementInspectionRecordInput | ProcurementInspectionCorrectionInput, evidenceEntityId: string, source: LifecycleSource, at: Date, session: ClientSession): Promise<LifecycleItem[]> {
    if (new Date(input.inspectedAt) > at) lcConflict("The inspection time cannot be in the future.");
    const state = await ProcurementLifecycleStateModel.findById(projectId).session(session).lean();
    if (!state || new Date(input.inspectedAt) < new Date(state.activatedAt)) lcConflict("A project inspection must occur after lifecycle activation.");
    const items = input.itemIds.map(id => source.items.find(item => item.id === id));
    if (items.some(item => !item)) lcConflict("Choose inspected items from the project's current appointments.");
    if (input.recoveryDate && input.recoveryDate < lcLocalDate(new Date(input.inspectedAt), state.policy.timezone)) lcConflict("Recovery cannot precede the inspection.");
    await assertLifecycleEvidence(projectId, evidenceEntityId, input.evidenceIds, session, "inspection");
    return items as LifecycleItem[];
  }
  return {
    async list(actor: PublicUser, projectId: string, query: unknown = {}): Promise<ProcurementInspectionPage> {
      const page = lcParse(lcPage, query);
      return lcTransaction(async session => {
        const project = await requireLifecycleProject(actor, projectId, session, false, readers);
        const result = await pageInSession(actor, projectId, session, page);
        if (project.status === "completed") result.allowedActions = [];
        return result;
      });
    },
    async plan(actor: PublicUser, projectId: string, value: unknown): Promise<ProcurementInspectionPage> {
      const input = lcParse(procurementInspectionPlanSchema, value);
      return lcRunCommand(deps, actor, projectId, input, "inspection.plan", ["procurement"], async session => {
        const at = now(); const source = await readLifecycleSource(projectId, session, true); assertLifecycleSource(source, input.sourceDigest);
        const state = await ProcurementLifecycleStateModel.findById(projectId).session(session).lean();
        if (!state || !source.items.length) lcConflict("Set up the lifecycle and appoint work before planning inspections.");
        const current = await ProcurementInspectionPlanModel.findOne({ projectId }).session(session).lean() as LifecycleRow | null;
        if (Number(current?.version ?? 0) !== input.expectedVersion) lcConflict();
        const originalVisits = await ProcurementInspectionVisitModel.find({ projectId, isOriginal: true }).session(session).lean() as LifecycleRow[];
        if (current && originalVisits.length && input.count < current.count) lcConflict("The planned inspection count cannot decrease after the first visit.");
        const oldSlots = (current?.slots ?? []) as LifecycleRow[];
        // Stable slots carry original deadlines; renaming them must not reset overdue history.
        const retainedSlots = oldSlots.slice(0, Math.min(oldSlots.length, input.count));
        if (retainedSlots.some((slot, index) => input.windows[index]?.id !== slot.id)) lcConflict("Retain the existing inspection slot identities and order when rescheduling. A lower pre-visit quota removes only the last slot.");
        const slots: LifecycleRow[] = [];
        for (const window of input.windows) {
          const old = oldSlots.find(slot => slot.id === window.id);
          const unchanged = old && iso(old.startsAt) === iso(window.startsAt) && iso(old.endsAt) === iso(window.endsAt);
          const completed = originalVisits.some(visit => visit.slotId === window.id);
          if (completed && !unchanged) lcConflict("A completed inspection's original plan cannot be changed.");
          if (!unchanged && new Date(window.startsAt) < at) lcConflict("New or rescheduled inspection windows must be prospective.");
          const plannedAt = unchanged ? iso(old.plannedAt) : chooseInspectionInstant(window, random);
          slots.push({ id: window.id, startsAt: new Date(window.startsAt), endsAt: new Date(window.endsAt), plannedAt: new Date(plannedAt), originalPlannedAt: old?.originalPlannedAt ?? new Date(plannedAt) });
        }
        const version = input.expectedVersion + 1; const revision = { version, count: input.count, sourceDigest: source.digest, slots, at, actorId: actor.id, reason: input.reason };
        if (current) {
          const changed = await ProcurementInspectionPlanModel.updateOne({ _id: current._id, version: input.expectedVersion }, { $set: { version, count: input.count, sourceDigest: source.digest, slots, updatedAt: at }, $push: { revisions: revision } }, { session, runValidators: true });
          if (!changed.matchedCount) lcConflict();
        } else await ProcurementInspectionPlanModel.create([{ _id: `inspection-plan:${projectId}`, projectId, version, count: input.count, sourceDigest: source.digest, slots, revisions: [revision], createdAt: at, updatedAt: at }], { session });
        if (state.policy.inspectionCount !== input.count) {
          const updated = await ProcurementLifecycleStateModel.updateOne({ _id: state._id, version: state.version }, { $set: { "policy.inspectionCount": input.count, updatedAt: at, updatedById: actor.id }, $inc: { version: 1 } }, { session, runValidators: true });
          if (!updated.matchedCount) lcConflict();
        }
        return pageInSession(actor, projectId, session, { limit: 30, offset: 0 }, source);
      }, { entityId: `inspection-plan:${projectId}`, reason: input.reason });
    },
    async record(actor: PublicUser, projectId: string, value: unknown): Promise<ProcurementInspectionVisit> {
      const input = lcParse(procurementInspectionRecordSchema, value);
      return lcRunCommand(deps, actor, projectId, input, "inspection.record", ["procurement"], async session => {
        const at = now(); const source = await readLifecycleSource(projectId, session, true); assertLifecycleSource(source, input.sourceDigest);
        const plan = await ProcurementInspectionPlanModel.findOne({ projectId }).session(session).lean() as LifecycleRow | null;
        if (!plan || plan.version !== input.expectedVersion || plan.sourceDigest !== source.digest) lcConflict("Refresh and reconcile the inspection plan before recording this visit.");
        const slot = input.slotId ? (plan.slots as LifecycleRow[]).find(candidate => candidate.id === input.slotId) : null;
        if (input.slotId && !slot) lcMissing();
        if (await ProcurementInspectionVisitModel.exists({ $or: [{ _id: input.visitId }, { projectId, inspectedAt: new Date(input.inspectedAt), isOriginal: true }, ...(input.slotId ? [{ projectId, slotId: input.slotId, isOriginal: true }] : [])] }).session(session)) lcConflict("This visit or planned inspection has already been recorded.");
        if (slot && new Date(input.inspectedAt) < new Date(slot.startsAt)) lcConflict("A planned visit cannot occur before its inspection window. Record an additional corrective visit instead.");
        const items = await validateVisit(projectId, input, input.visitId, source, at, session);
        const linkedFindings = await findings(actor, projectId, input.visitId, input, source, session);
        const [row] = await ProcurementInspectionVisitModel.create([{ _id: input.visitId, projectId, planId: plan._id, planVersion: plan.version,
          rootVisitId: input.visitId, slotId: input.slotId, revision: 1, correctionOf: null, correctionReason: null, isOriginal: true,
          sourceDigest: source.digest, inspectedAt: new Date(input.inspectedAt), recordedAt: at, inspectorId: actor.id, inspectorName: actor.name,
          itemIds: input.itemIds, items, notes: input.notes, delayed: input.delayed, delayReason: input.delayReason, responsibleParty: input.responsibleParty,
          recoveryAction: input.recoveryAction, recoveryDate: input.recoveryDate, evidenceIds: input.evidenceIds, findings: linkedFindings,
          late: Boolean(slot && (at > new Date(slot.originalPlannedAt) || new Date(input.inspectedAt) > new Date(slot.originalPlannedAt))) }], { session });
        return visitDto(row!.toObject());
      }, { entityId: input.visitId, reason: input.notes });
    },
    async correct(actor: PublicUser, projectId: string, visitId: string, value: unknown): Promise<ProcurementInspectionVisit> {
      const input = lcParse(procurementInspectionCorrectionSchema, value);
      return lcRunCommand(deps, actor, projectId, input, `inspection.correct:${visitId}`, ["procurement"], async session => {
        const source = await readLifecycleSource(projectId, session, true); assertLifecycleSource(source, input.sourceDigest); const at = now();
        const original = await ProcurementInspectionVisitModel.findOne({ _id: visitId, projectId }).session(session).lean() as LifecycleRow | null;
        if (!original) lcMissing();
        const latest = await ProcurementInspectionVisitModel.findOne({ projectId, rootVisitId: original.rootVisitId }).sort({ revision: -1 }).session(session).lean() as LifecycleRow | null;
        if (!latest || latest._id !== visitId || latest.revision !== input.expectedVersion) lcConflict("Correct the latest revision of this inspection.");
        if (iso(original.inspectedAt) !== iso(input.inspectedAt)) lcConflict("The time of a recorded physical visit is immutable. Record a new visit for a different occurrence.");
        if (await ProcurementInspectionVisitModel.exists({ _id: input.correctionId }).session(session)) lcConflict("This correction identity is already used.");
        const items = await validateVisit(projectId, input, input.correctionId, source, at, session);
        const linkedFindings = await findings(actor, projectId, input.correctionId, input, source, session);
        const [row] = await ProcurementInspectionVisitModel.create([{ _id: input.correctionId, projectId, planId: original.planId, planVersion: original.planVersion,
          rootVisitId: original.rootVisitId, slotId: original.slotId, revision: original.revision + 1, correctionOf: visitId, correctionReason: input.reason, isOriginal: false,
          sourceDigest: source.digest, inspectedAt: original.inspectedAt, recordedAt: at, inspectorId: actor.id, inspectorName: actor.name,
          itemIds: input.itemIds, items, notes: input.notes, delayed: input.delayed, delayReason: input.delayReason, responsibleParty: input.responsibleParty,
          recoveryAction: input.recoveryAction, recoveryDate: input.recoveryDate, evidenceIds: input.evidenceIds,
          findings: [...original.findings, ...linkedFindings], late: original.late }], { session });
        return visitDto(row!.toObject());
      }, { entityId: visitId, reason: input.reason });
    }
  };
}

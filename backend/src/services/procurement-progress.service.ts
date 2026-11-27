import type { ClientSession } from "mongoose";
import type { LifecycleItem, LifecycleReadiness, LifecycleSource } from "../contracts/procurement-lifecycle.js";
import type { ProcurementProgressCheck, ProcurementReviewDetail, ProcurementReviewPage, ProcurementReviewRound } from "../contracts/procurement-progress.js";
import { lcAddDays, lcConflict, lcDigest, lcLocalDate, lcMissing, lcNewId, lcPage, lcParse } from "../domain/procurement-lifecycle.js";
import { priorUncheckedItemIds, procurementProgressCommandSchema, reviewDueAfter, reviewMemberDigest } from "../domain/procurement-progress.js";
import { ProcurementLifecycleStateModel } from "../models/ProcurementLifecycleState.js";
import { ProcurementProgressCheckModel } from "../models/ProcurementProgressCheck.js";
import { ProcurementReviewRoundModel } from "../models/ProcurementReviewRound.js";
import { ProjectModel } from "../models/Project.js";
import type { PublicUser } from "./auth.service.js";
import { requireLifecycleProject, type LifecycleRow } from "./procurement-lifecycle/access.js";
import { assertLifecycleSource, readLifecycleSource } from "./procurement-lifecycle/source.js";
import { lcHistory, lcRunCommand, lcTransaction, type LifecycleDependencies } from "./procurement-lifecycle/transaction.js";

export type ReviewRoundRow = LifecycleRow;
interface MemberSnapshot { item: LifecycleItem; membershipDigest: string; }
const iso = (value: unknown): string => new Date(value as string | Date).toISOString();
const membersFor = (source: LifecycleSource): MemberSnapshot[] => source.items.map(item => ({ item, membershipDigest: reviewMemberDigest(item) }));
const activeRoles = ["procurement", "super_admin"] as const;

function makeRound(projectId: string, sequence: number, opensAt: Date, dueAt: Date, state: LifecycleRow, source: LifecycleSource, at: Date, historical = false): ReviewRoundRow {
  return { _id: `proc-review-${lcDigest([projectId, sequence]).slice(0, 40)}`, projectId, sequence, version: 1,
    status: historical ? "missed" : "open", sourceDigest: historical ? lcDigest({ projectId, sequence, historical: true }) : source.digest,
    members: historical ? [] : membersFor(source), opensAt, originalDueAt: dueAt, effectiveDueAt: dueAt,
    timezone: state.policy.timezone, intervalDays: state.policy.reviewIntervalDays, policyVersion: state.version,
    pausedAt: null, lateBeforePause: false, submittedAt: null, submittedById: null, notes: null, createdAt: at,
    changes: [{ action: historical ? "missed_round_observed" : "opened", actorId: "system:procurement-review", at, reason: null, sourceDigest: source.digest, members: historical ? [] : membersFor(source) }] };
}

/** Used by setup, policy changes and the scheduler; no GET calls this helper. */
export async function ensureReviewRoundInSession(projectId: string, session: ClientSession, at: Date, suppliedSource?: LifecycleSource): Promise<ReviewRoundRow | null> {
  if (!session.inTransaction()) throw new Error("Review scheduling requires a transaction.");
  const fenced = await ProjectModel.updateOne({ _id: projectId, status: { $ne: "completed" } }, { $inc: { siteCompletionFenceEpoch: 1 } }, { session, timestamps: false });
  if (!fenced.matchedCount) return null;
  const state = await ProcurementLifecycleStateModel.findById(projectId).session(session).lean() as LifecycleRow | null;
  if (!state) return null;
  const source = suppliedSource ?? await readLifecycleSource(projectId, session, true);
  if (!source.available || !source.items.length) return null;
  let latest = await ProcurementReviewRoundModel.findOne({ projectId }).sort({ sequence: -1 }).session(session).lean() as ReviewRoundRow | null;
  for (let attempts = 0; attempts < 366; attempts++) {
    if (latest?.status === "paused" || latest && at < new Date(latest.effectiveDueAt)) return latest;
    if (latest?.status === "open") {
      const changed = await ProcurementReviewRoundModel.findOneAndUpdate({ _id: latest._id, version: latest.version, status: "open" }, { $set: { status: "missed" }, $inc: { version: 1 } }, { session, returnDocument: "after" }).lean();
      if (!changed) lcConflict();
      latest = changed;
    }
    const opensAt = latest ? new Date(latest.effectiveDueAt) : new Date(state.activatedAt);
    const dueAt = reviewDueAfter(opensAt, Number(state.policy.reviewIntervalDays), state.policy.timezone);
    const next = makeRound(projectId, Number(latest?.sequence ?? 0) + 1, opensAt, dueAt, state, source, at, at >= dueAt);
    const [created] = await ProcurementReviewRoundModel.create([next], { session });
    latest = created!.toObject();
  }
  return latest;
}

function checkDto(row: LifecycleRow): ProcurementProgressCheck {
  return { id: String(row._id), roundId: row.roundId, itemId: row.itemId, revision: row.revision,
    correctionOf: row.correctionOf ?? null, correctionReason: row.correctionReason ?? null,
    sourceDigest: row.sourceDigest, checkedAt: iso(row.checkedAt), status: row.status, progress: row.progress ?? null,
    notes: row.notes, nextAction: row.nextAction, nextCheckDate: row.nextCheckDate, delayed: row.delayed,
    delayReason: row.delayReason ?? null, responsibleParty: row.responsibleParty ?? null,
    recoveryAction: row.recoveryAction ?? null, recoveryDate: row.recoveryDate ?? null,
    forecastDate: row.forecastDate ?? null, forecastReason: row.forecastReason ?? null,
    submittedAt: iso(row.submittedAt), submittedById: row.submittedById, submittedByName: row.submittedByName, late: Boolean(row.late) };
}

async function roundDto(row: ReviewRoundRow, source: LifecycleSource, at: Date, session: ClientSession, canManage: boolean): Promise<ProcurementReviewRound> {
  const checks = await ProcurementProgressCheckModel.find({ projectId: row.projectId, roundId: row._id }).sort({ revision: -1, _id: 1 }).session(session).lean() as LifecycleRow[];
  const members = row.members as MemberSnapshot[];
  const effective = new Map(members.flatMap(member => {
    const check = checks.find(candidate => candidate.itemId === member.item.id && candidate.membershipDigest === member.membershipDigest);
    return check ? [[member.item.id, check] as const] : [];
  }));
  const sourceChanged = row.sourceDigest !== source.digest;
  const status = row.status === "open" && at >= new Date(row.effectiveDueAt) ? "missed" : row.status;
  const editable = canManage && status === "open" && !sourceChanged && source.available;
  const blockers: ProcurementReviewRound["blockers"] = [...source.blockers];
  if (sourceChanged) blockers.push({ code: "REVIEW_SOURCE_CHANGED", message: "Appointment or Configuration changed. Reconcile the review scope before continuing.", tab: "progress", entityId: row._id });
  if (status === "paused") blockers.push({ code: "REVIEW_PAUSED", message: "Resume the Procurement review before submitting checks.", tab: "progress", entityId: row._id });
  for (const member of members) {
    if (member.item.priority === null) blockers.push({ code: "REVIEW_PRIORITY_REQUIRED", message: `Set the Configuration priority for ${member.item.itemName}.`, tab: "progress", entityId: member.item.id });
    if (!effective.has(member.item.id)) blockers.push({ code: "REVIEW_CHECK_REQUIRED", message: `Record a progress check for ${member.item.itemName}.`, tab: "progress", entityId: member.item.id });
  }
  return { id: String(row._id), projectId: row.projectId, sequence: row.sequence, version: row.version,
    status, sourceDigest: row.sourceDigest, currentSourceDigest: source.digest, sourceChanged,
    opensAt: iso(row.opensAt), originalDueAt: iso(row.originalDueAt), effectiveDueAt: iso(row.effectiveDueAt),
    timezone: row.timezone, intervalDays: row.intervalDays, pausedAt: row.pausedAt ? iso(row.pausedAt) : null,
    submittedAt: row.submittedAt ? iso(row.submittedAt) : null, submittedById: row.submittedById ?? null,
    late: Boolean(row.lateBeforePause) || Boolean(row.submittedAt && new Date(row.submittedAt) > new Date(row.effectiveDueAt)) || status === "missed",
    members: members.map(member => {
      const blockingItemIds = priorUncheckedItemIds(members.map(entry => entry.item), new Set(effective.keys()), member.item.id);
      const currentItem = ["open", "paused"].includes(row.status) ? source.items.find(item => item.id === member.item.id) : null;
      const item = currentItem ? { ...member.item, vendorProgress: currentItem.vendorProgress, vendorNote: currentItem.vendorNote, vendorStatus: currentItem.vendorStatus } : member.item;
      return { ...member, item, check: effective.has(member.item.id) ? checkDto(effective.get(member.item.id)!) : null,
        canCheck: editable && member.item.priority !== null && blockingItemIds.length === 0 && !effective.has(member.item.id), blockingItemIds };
    }), requiredCount: members.length, checkedCount: effective.size, blockers,
    allowedActions: !canManage ? [] : status === "paused" ? ["resume"] : status === "open" ? sourceChanged ? ["reconcile", "pause"] : ["check", "correct", "pause", ...(blockers.length ? [] : ["finalize"])] : [] };
}

async function projectedCurrent(projectId: string, state: LifecycleRow, source: LifecycleSource, at: Date, session: ClientSession): Promise<ReviewRoundRow | null> {
  if (!source.items.length) return null;
  const latest = await ProcurementReviewRoundModel.findOne({ projectId }).sort({ sequence: -1 }).session(session).lean() as ReviewRoundRow | null;
  if (latest?.status === "paused" || latest && at < new Date(latest.effectiveDueAt)) return latest;
  let sequence = Number(latest?.sequence ?? 0) + 1;
  let opensAt = latest ? new Date(latest.effectiveDueAt) : new Date(state.activatedAt);
  let dueAt = reviewDueAfter(opensAt, state.policy.reviewIntervalDays, state.policy.timezone);
  for (let i = 0; at >= dueAt && i < 3660; i++) { sequence++; opensAt = dueAt; dueAt = reviewDueAfter(opensAt, state.policy.reviewIntervalDays, state.policy.timezone); }
  return { ...makeRound(projectId, sequence, opensAt, dueAt, state, source, at), version: 0 };
}

export async function readReviewReadiness(projectId: string, session: ClientSession, at = new Date()): Promise<LifecycleReadiness> {
  const source = await readLifecycleSource(projectId, session);
  const state = await ProcurementLifecycleStateModel.findById(projectId).session(session).lean() as LifecycleRow | null;
  if (!state) return { ready: false, sourceDigest: source.digest, blockers: [{ code: "LIFECYCLE_SETUP_REQUIRED", message: "Set up Procurement reviews before signoff.", tab: "progress" }], references: {} };
  if (!source.available) return { ready: false, sourceDigest: source.digest, blockers: source.blockers, references: {} };
  const current = await projectedCurrent(projectId, state, source, at, session);
  if (!current) return { ready: true, sourceDigest: source.digest, blockers: [], references: {} };
  const blockers: LifecycleReadiness["blockers"] = [];
  if (current.sourceDigest !== source.digest) blockers.push({ code: "REVIEW_SOURCE_CHANGED", message: "Review current appointment and priority changes before signoff.", tab: "progress", entityId: current._id });
  if (current.status !== "submitted" || current.version === 0) blockers.push({ code: "REVIEW_NOT_SUBMITTED", message: "Submit the current Procurement progress-review round.", tab: "progress", entityId: current._id });
  return { ready: blockers.length === 0, sourceDigest: lcDigest({ source: source.digest, roundId: current._id, version: current.version, status: current.status }), blockers,
    references: current.version ? { reviewRoundId: String(current._id), reviewRoundVersion: String(current.version) } : {} };
}

export function createProcurementProgressService(deps: LifecycleDependencies) {
  const now = deps.now ?? (() => new Date());
  async function detail(actor: PublicUser, projectId: string, roundId: string, session: ClientSession, source?: LifecycleSource): Promise<ProcurementReviewDetail> {
    const row = await ProcurementReviewRoundModel.findOne({ _id: roundId, projectId }).session(session).lean(); if (!row) lcMissing();
    const currentSource = source ?? await readLifecycleSource(projectId, session);
    const checks = await ProcurementProgressCheckModel.find({ projectId, roundId }).sort({ submittedAt: -1, revision: -1 }).session(session).lean() as LifecycleRow[];
    const history = await lcHistory(projectId, session, roundId);
    return { ...await roundDto(row, currentSource, now(), session, actor.role === "procurement"), checks: checks.map(checkDto), history: history.items };
  }
  return {
    async list(actor: PublicUser, projectId: string, query: unknown = {}): Promise<ProcurementReviewPage> {
      const page = lcParse(lcPage, query);
      return lcTransaction(async session => {
        const project = await requireLifecycleProject(actor, projectId, session, false, activeRoles);
        const source = await readLifecycleSource(projectId, session); const at = now();
        const state = await ProcurementLifecycleStateModel.findById(projectId).session(session).lean() as LifecycleRow | null;
        const rows = await ProcurementReviewRoundModel.find({ projectId }).sort({ sequence: -1 }).skip(page.offset).limit(page.limit).session(session).lean();
        const total = await ProcurementReviewRoundModel.countDocuments({ projectId }).session(session);
        const canManage = actor.role === "procurement" && project.status !== "completed";
        const items: ProcurementReviewRound[] = [];
        for (const row of rows) items.push(await roundDto(row, source, at, session, canManage));
        const currentRow = state ? await projectedCurrent(projectId, state, source, at, session) : null;
        const current = currentRow ? await roundDto(currentRow, source, at, session, canManage) : null;
        const blockers = [...source.blockers, ...(!state ? [{ code: "LIFECYCLE_SETUP_REQUIRED", message: "Set up the Procurement lifecycle to start review rounds.", tab: "progress" as const }] : [])];
        const mayOpen = Boolean(state && source.available && source.items.length && (!current || current.version === 0 || current.status === "submitted" && current.sourceChanged));
        return { projectId, serverNow: at.toISOString(), sourceDigest: source.digest, current, items, total, ...page, blockers,
          allowedActions: canManage && mayOpen ? ["open"] : [] };
      });
    },
    get(actor: PublicUser, projectId: string, roundId: string): Promise<ProcurementReviewDetail> {
      return lcTransaction(async session => {
        const project = await requireLifecycleProject(actor, projectId, session, false, activeRoles);
        const result = await detail(actor, projectId, roundId, session);
        if (project.status === "completed") { result.allowedActions = []; for (const member of result.members) member.canCheck = false; }
        return result;
      });
    },
    async command(actor: PublicUser, projectId: string, raw: unknown): Promise<ProcurementReviewDetail> {
      const input = lcParse(procurementProgressCommandSchema, raw);
      return lcRunCommand(deps, actor, projectId, input, `review.${input.action}`, ["procurement"], async (session, project) => {
        if (project.status !== "active") lcConflict("Procurement review rounds require an active project.");
        const at = now(); const source = await readLifecycleSource(projectId, session, true); assertLifecycleSource(source, input.sourceDigest);
        const state = await ProcurementLifecycleStateModel.findById(projectId).session(session).lean() as LifecycleRow | null;
        if (!state) lcConflict("Set up the Procurement lifecycle first.");
        if (input.action === "open") {
          if (input.expectedVersion !== 0) lcConflict();
          const existing = await ensureReviewRoundInSession(projectId, session, at, source);
          if (!existing) lcConflict("No appointed procurement items require a progress round.");
          let row: ReviewRoundRow = existing;
          if (row.status === "submitted" && row.sourceDigest !== source.digest) {
            const next = makeRound(projectId, row.sequence + 1, at, new Date(row.effectiveDueAt), state, source, at);
            const [created] = await ProcurementReviewRoundModel.create([next], { session }); row = created!.toObject();
          }
          return detail(actor, projectId, String(row._id), session, source);
        }
        const row = await ProcurementReviewRoundModel.findOne({ _id: input.roundId, projectId }).session(session).lean() as ReviewRoundRow | null;
        if (!row) lcMissing();
        if (row.version !== input.expectedVersion || ["submitted", "missed"].includes(row.status)) lcConflict("This round is finalized or changed. Open the current round.");
        const update: LifecycleRow = {}; let change: LifecycleRow | null = null;
        if (input.action === "pause") {
          if (row.status !== "open") lcConflict("Only an open review can be paused.");
          update.status = "paused"; update.pausedAt = at; update.lateBeforePause = row.lateBeforePause || at >= new Date(row.effectiveDueAt);
        } else if (input.action === "resume") {
          if (row.status !== "paused" || !row.pausedAt) lcConflict("This review is not paused.");
          update.status = "open"; update.pausedAt = null;
          update.effectiveDueAt = row.lateBeforePause ? row.effectiveDueAt : new Date(new Date(row.effectiveDueAt).getTime() + at.getTime() - new Date(row.pausedAt).getTime());
        } else {
          if (row.status !== "open") lcConflict("Resume the review before updating it.");
          if (input.action === "reconcile") {
            update.sourceDigest = source.digest; update.members = membersFor(source);
            change = { action: "reconciled", actorId: actor.id, at, reason: input.reason, sourceDigest: source.digest, members: membersFor(source) };
          } else {
            if (row.sourceDigest !== source.digest) lcConflict("Reconcile the current appointment and Configuration before updating this round.");
            const projection = await roundDto(row, source, at, session, true);
            if (input.action === "finalize") {
              if (projection.blockers.length) lcConflict(projection.blockers[0]!.message);
              update.status = "submitted"; update.submittedAt = at; update.submittedById = actor.id; update.notes = input.notes;
            } else {
              const member = (row.members as MemberSnapshot[]).find(candidate => candidate.item.id === input.itemId);
              if (!member) lcMissing();
              if (member.item.priority === null) lcConflict("Resolve this item's priority in Configuration before recording its ordered check.");
              const itemProjection = projection.members.find(candidate => candidate.item.id === input.itemId)!;
              if (itemProjection.blockingItemIds.length) lcConflict("Record all lower-priority group checks before updating this item.");
              if (input.action === "check" && itemProjection.check) lcConflict("This item already has a check. Append a correction instead.");
              if (input.action === "correct" && itemProjection.check?.id !== input.checkId) lcConflict("Only the current item check can receive a correction.");
              const observation = input.observation; const observedAt = new Date(observation.checkedAt);
              if (observedAt > at || observedAt < new Date(row.opensAt)) lcConflict("The check time must be within this round and cannot be in the future.");
              const observedDate = lcLocalDate(observedAt, row.timezone);
              if (observation.nextCheckDate < observedDate || observation.nextCheckDate > lcAddDays(observedDate, row.intervalDays)) lcConflict("The next check must be within the configured review interval.");
              if (observation.recoveryDate && observation.recoveryDate < observedDate) lcConflict("The recovery date cannot precede the observation.");
              const prior = await ProcurementProgressCheckModel.findOne({ projectId, roundId: row._id, itemId: input.itemId }).sort({ revision: -1 }).session(session).lean();
              await ProcurementProgressCheckModel.create([{ _id: lcNewId("check"), projectId, roundId: row._id, itemId: input.itemId,
                revision: Number(prior?.revision ?? 0) + 1, correctionOf: input.action === "correct" ? input.checkId : null,
                correctionReason: input.action === "correct" ? input.reason : null, membershipDigest: member.membershipDigest,
                sourceDigest: source.digest, itemSnapshot: member.item, ...observation, checkedAt: observedAt,
                submittedAt: at, submittedById: actor.id, submittedByName: actor.name, late: Boolean(row.lateBeforePause) || at >= new Date(row.effectiveDueAt) }], { session });
            }
          }
        }
        if (!change) change = { action: input.action, actorId: actor.id, at, reason: "reason" in input ? input.reason : null, sourceDigest: source.digest, members: [] };
        const changed = await ProcurementReviewRoundModel.updateOne({ _id: row._id, version: input.expectedVersion, status: row.status }, { $set: update, $inc: { version: 1 }, $push: { changes: change } }, { session, runValidators: true });
        if (!changed.matchedCount) lcConflict();
        return detail(actor, projectId, String(row._id), session, source);
      }, { entityId: "roundId" in input ? input.roundId : projectId, reason: "reason" in input ? input.reason : null });
    }
  };
}

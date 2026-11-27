import type { ClientSession } from "mongoose";
import type { HandoverAnswer, HandoverAuditContext, HandoverCheck, HandoverRevisionSummary, HandoverSourceChange, HandoverSupplyContext, HandoverWorkspace } from "../contracts/procurement-handover.js";
import type { LifecycleBlocker, LifecycleItem, LifecycleReadiness, LifecycleSource } from "../contracts/procurement-lifecycle.js";
import { handoverAnswerIssues, handoverCommandSchema, handoverCompletionIssues } from "../domain/procurement-handover.js";
import { lcConflict, lcDigest, lcId, lcMissing, lcNewId, lcPage, lcParse } from "../domain/procurement-lifecycle.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { ProcurementHandoverModel } from "../models/ProcurementHandover.js";
import { ProcurementHandoverRevisionModel } from "../models/ProcurementHandoverRevision.js";
import { ProcurementLifecycleEvidenceModel } from "../models/ProcurementLifecycleEvidence.js";
import { ProcurementLifecycleStateModel } from "../models/ProcurementLifecycleState.js";
import { ProjectQualityAuditModel } from "../models/ProjectQualityAudit.js";
import { ProjectSupplyMilestoneModel } from "../models/ProjectSupplyMilestone.js";
import { mandatoryQualityParameters, readBasketQualityRevision } from "./ai-estimator-knowledge-basket-quality.js";
import type { PublicUser } from "./auth.service.js";
import { listLifecycleFindings, recordLifecycleFindingInSession, type FindingsDependencies } from "./procurement-findings.service.js";
import { requireLifecycleState } from "./procurement-lifecycle.service.js";
import { requireLifecycleProject, type LifecycleRow } from "./procurement-lifecycle/access.js";
import { assertLifecycleEvidence } from "./procurement-lifecycle/evidence.js";
import { readLifecycleSource } from "./procurement-lifecycle/source.js";
import { lcHistory, lcRunCommand, lcTransaction } from "./procurement-lifecycle/transaction.js";

export interface HandoverDependencies extends FindingsDependencies {}
interface Requirements { source: LifecycleSource; digest: string; checks: HandoverCheck[]; blockers: LifecycleBlocker[]; }
const block = (code: string, message: string, entityId?: string): LifecycleBlocker => ({ code, message, tab: "handover", ...(entityId ? { entityId } : {}) });
export const handoverEvidenceEntityId = (projectId: string): string => `proc-handover-${lcDigest(projectId).slice(0, 40)}`;
const photo = { photos: true, documents: false, video: false, minPhotosPerSample: 1 };
const document = { photos: false, documents: true, video: false, minPhotosPerSample: null };

function itemCheck(item: LifecycleItem, key: string, section: HandoverCheck["section"], label: string,
  required: boolean, evidence: HandoverCheck["evidence"] = null): HandoverCheck {
  return { id: `handover-check-${lcDigest([item.id, key]).slice(0, 40)}`, section, label, instructions: null,
    itemId: item.id, itemName: item.itemName, vendorId: item.vendorId, vendorName: item.vendorName,
    orderId: item.orderId, basketId: item.basketId, parameterId: null, checklistRevisionId: null,
    required, allowNotApplicable: !required, evidence, parameterSnapshot: null };
}

async function requirements(projectId: string, session: ClientSession, forWrite = false): Promise<Requirements> {
  const source = await readLifecycleSource(projectId, session, forWrite);
  const checks: HandoverCheck[] = [], blockers = [...source.blockers];
  const quality = new Map<string, Awaited<ReturnType<typeof readBasketQualityRevision>>>();
  for (const basketId of [...new Set(source.items.map(item => item.basketId))].sort()) {
    const basket = forWrite
      ? await AiEstimatorKnowledgeBasketModel.findOneAndUpdate({ _id: basketId }, { $inc: { dependencyEpoch: 1 } }, { session, new: true, timestamps: false }).lean()
      : await AiEstimatorKnowledgeBasketModel.findById(basketId).session(session).lean();
    if (!basket) { blockers.push(block("HANDOVER_QUALITY_UNAVAILABLE", "The appointed item's shared quality checklist is unavailable.", basketId)); continue; }
    try {
      const revision = await readBasketQualityRevision(basket, session);
      quality.set(basketId, revision);
      if (!revision?.parameters.length) blockers.push(block("HANDOVER_QUALITY_SETUP_REQUIRED", "Configure the appointed basket's quality checklist before handover.", basketId));
    } catch (error) {
      if ((error as { code?: string }).code !== "BASKET_QUALITY_NOT_RESOLVABLE") throw error;
      blockers.push(block("HANDOVER_QUALITY_UNAVAILABLE", "The current shared quality checklist could not be resolved.", basketId));
    }
  }
  for (const item of source.items) {
    const revision = quality.get(item.basketId);
    for (const parameter of mandatoryQualityParameters(revision?.parameters ?? [])) {
      const check = itemCheck(item, `quality:${String(parameter.id)}`, "quality", String(parameter.label), true);
      const raw = parameter.evidence as Record<string, unknown> | null;
      checks.push({ ...check, parameterId: String(parameter.id), checklistRevisionId: revision!._id,
        parameterSnapshot: structuredClone(parameter),
        instructions: [parameter.instructions, parameter.acceptanceCriteria].filter(Boolean).join("\n") || null,
        evidence: raw ? { photos: raw.photos === true, documents: raw.documents === true, video: raw.video === true,
          minPhotosPerSample: typeof raw.minPhotosPerSample === "number" ? raw.minPhotosPerSample : null } : null });
    }
    checks.push(itemCheck(item, "specification", "quality", "Matches approved specification", true));
    checks.push(itemCheck(item, "functionality", "quality", "Functional checks completed", false));
    if (item.scopeType !== "execution") {
      checks.push(itemCheck(item, "quantity-condition", "delivery", "Accepted quantity and condition confirmed; shortages and damage recorded", true, photo));
      checks.push(itemCheck(item, "receipt", "delivery", "Delivery receipt recorded", true, document));
    }
    if (item.scopeType !== "supply") {
      checks.push(itemCheck(item, "installation", "delivery", "Installation completion checked", true, photo));
      checks.push(itemCheck(item, "cleanup", "handover", "Work area cleaned and cleared", true, photo));
    }
    checks.push(itemCheck(item, "manuals-warranty", "handover", "Required manuals and warranties handed over", false, document));
  }
  checks.push({ id: "project-handover-acknowledgement", section: "handover", label: "Project handover acknowledgement recorded",
    instructions: "Record the acknowledgement and attach the handover document. Existing Client acceptance remains a separate requirement.",
    itemId: null, itemName: null, vendorId: null, vendorName: null, orderId: null, basketId: null, parameterId: null,
    checklistRevisionId: null, required: true, allowNotApplicable: false, evidence: document, parameterSnapshot: null });
  return { source, checks, blockers, digest: lcDigest({ source: source.digest, checks,
    quality: [...quality].map(([basketId, revision]) => ({ basketId, revisionId: revision?._id ?? null, digest: revision?.contentDigest ?? null })) }) };
}

async function context(projectId: string, req: Requirements, session: ClientSession): Promise<{ qualityAudits: HandoverAuditContext[]; supplyReviews: HandoverSupplyContext[] }> {
  const audits = await ProjectQualityAuditModel.find({ projectId, status: "signed" }).sort({ signedAt: -1, _id: 1 }).session(session).lean() as LifecycleRow[];
  const corrected = new Set(audits.map(row => row.correctionOf).filter(Boolean));
  const qualityAudits: HandoverAuditContext[] = audits.map(row => {
    const current = req.source.items.some(item => item.orderId === row.orderId && item.orderRevisionId === row.orderRevisionId && item.basketId === row.basketId)
      && req.checks.some(check => check.basketId === row.basketId && check.checklistRevisionId === row.checklistRevisionId);
    const failedLabels = (row.answers as LifecycleRow[]).filter(answer => answer.answer === "fail").map(answer =>
      String((row.parameters as LifecycleRow[]).find(parameter => parameter.id === answer.id)?.label ?? answer.id));
    return { id: String(row._id), orderId: row.orderId, basketId: row.basketId, checklistRevisionId: row.checklistRevisionId,
      status: corrected.has(String(row._id)) ? "corrected" : !current ? "historical" : failedLabels.length ? "signed_with_findings" : "signed",
      signedById: row.signedById, signedAt: new Date(row.signedAt).toISOString(), failedLabels };
  });
  const supplies = await ProjectSupplyMilestoneModel.find({ projectId }).sort({ createdAt: -1, _id: 1 }).session(session).lean() as LifecycleRow[];
  return { qualityAudits, supplyReviews: supplies.map(row => ({ id: String(row._id), sourceLineItemKey: row.sourceLineItemKey,
    title: row.title, round: row.round, signatureCount: row.signatures.length, requiredCount: row.requiredReviewerIds.length, meaning: "supply_review" })) };
}

async function currentRevision(projectId: string, session: ClientSession) {
  const state = await ProcurementHandoverModel.findOne({ projectId }).session(session).lean() as LifecycleRow | null;
  const revision = state ? await ProcurementHandoverRevisionModel.findOne({ _id: state.currentRevisionId, projectId, version: state.version }).session(session).lean() as LifecycleRow | null : null;
  if (state && !revision) lcConflict("The current handover revision could not be resolved.");
  return { state, revision };
}

function changedChecks(previous: HandoverCheck[], current: HandoverCheck[]): string[] {
  const before = new Map(previous.map(check => [check.id, lcDigest(check)]));
  const after = new Map(current.map(check => [check.id, lcDigest(check)]));
  return [...new Set([...before.keys(), ...after.keys()])].filter(id => before.get(id) !== after.get(id));
}

function sourceChanges(revision: LifecycleRow, req: Requirements): HandoverSourceChange[] {
  const changes: HandoverSourceChange[] = changedChecks(revision.checks, req.checks).map(entityId => {
    const previous = (revision.checks as HandoverCheck[]).find(check => check.id === entityId) ?? null;
    const current = req.checks.find(check => check.id === entityId) ?? null;
    return { entityId, kind: !previous ? "added" : !current ? "removed" : "changed", label: current?.label ?? previous!.label, previous, current };
  });
  if (revision.lifecycleSourceDigest !== req.source.digest) changes.push({ entityId: "appointed-source", kind: "changed",
    label: "Approved or appointed scope changed", previous: revision.sourceSnapshot ?? null, current: req.source });
  return changes;
}

async function completionBlockers(projectId: string, req: Requirements, revision: LifecycleRow | null,
  session: ClientSession, audits: HandoverAuditContext[], forWrite = false): Promise<LifecycleBlocker[]> {
  const blockers = [...req.blockers];
  const findings = await listLifecycleFindings(projectId, session);
  for (const finding of findings.filter(row => row.status !== "verified")) blockers.push(block("HANDOVER_FINDING_UNVERIFIED", `Verify corrective action: ${finding.title}`, finding.id));
  for (const audit of audits.filter(row => row.status === "signed_with_findings")) blockers.push(block("HANDOVER_SITE_QUALITY_FINDINGS", "A current signed Site Manager quality audit still records failed checks.", audit.id));
  if (!revision) return [...blockers, block("HANDOVER_NOT_SUBMITTED", "Complete and submit the procurement handover checklist.")];
  if (revision.sourceDigest !== req.digest) return [...blockers, block("HANDOVER_SOURCE_CHANGED", "Reconcile changed appointed work or quality requirements before submitting handover.")];
  const answers = revision.answers as HandoverAnswer[];
  for (const message of handoverCompletionIssues(req.checks, answers)) blockers.push(block("HANDOVER_CHECK_INCOMPLETE", message));
  for (const answer of answers) {
    const check = req.checks.find(row => row.id === answer.checkId); if (!check) continue;
    const evidence = forWrite ? await assertLifecycleEvidence(projectId, handoverEvidenceEntityId(projectId), answer.evidenceIds, session, "handover")
      : await ProcurementLifecycleEvidenceModel.find({ projectId, entityId: handoverEvidenceEntityId(projectId), purpose: "handover", _id: { $in: answer.evidenceIds } }).session(session).lean();
    if (evidence.length !== answer.evidenceIds.length) blockers.push(block("HANDOVER_EVIDENCE_UNAVAILABLE", "Checklist evidence is unavailable.", check.id));
    for (const message of handoverAnswerIssues(check, answer, evidence, true)) blockers.push(block("HANDOVER_EVIDENCE_REQUIRED", message, check.id));
  }
  if (revision.status !== "submitted") blockers.push(block("HANDOVER_NOT_SUBMITTED", "Submit the completed procurement handover checklist."));
  return blockers;
}

/** Used inside the caller's completion transaction; the source and Configuration fences prevent a stale signoff. */
export async function readHandoverReadiness(projectId: string, session: ClientSession, _at: Date, forWrite = false): Promise<LifecycleReadiness> {
  if (!session.inTransaction()) throw new Error("Handover readiness requires the caller's transaction.");
  const req = await requirements(projectId, session, forWrite);
  const { revision } = await currentRevision(projectId, session);
  const contexts = await context(projectId, req, session);
  const blockers = await completionBlockers(projectId, req, revision, session, contexts.qualityAudits, forWrite);
  if (!await ProcurementLifecycleStateModel.exists({ _id: projectId }).session(session)) blockers.push(block("LIFECYCLE_SETUP_REQUIRED", "Set up the procurement lifecycle before signoff."));
  return { ready: blockers.length === 0, sourceDigest: req.digest, blockers,
    references: { handoverRevisionId: revision ? String(revision._id) : "", qualityAuditIds: contexts.qualityAudits.filter(row => row.status === "signed").map(row => row.id) } };
}

export function createProcurementHandoverService(deps: HandoverDependencies) {
  const now = deps.now ?? (() => new Date());
  async function workspace(actor: PublicUser, projectId: string, session: ClientSession, page = { limit: 30, offset: 0 }): Promise<HandoverWorkspace> {
    const project = await requireLifecycleProject(actor, projectId, session, false, ["procurement", "super_admin"]);
    const req = await requirements(projectId, session);
    const { state, revision } = await currentRevision(projectId, session);
    const contexts = await context(projectId, req, session);
    const blockers = await completionBlockers(projectId, req, revision, session, contexts.qualityAudits);
    const active = !!await ProcurementLifecycleStateModel.exists({ _id: projectId }).session(session);
    if (!active) blockers.push(block("LIFECYCLE_SETUP_REQUIRED", "Set up the procurement lifecycle before recording handover."));
    const changed = !!revision && revision.sourceDigest !== req.digest;
    const rows = await ProcurementHandoverRevisionModel.find({ projectId }).sort({ version: -1 }).skip(page.offset).limit(page.limit).session(session).lean() as LifecycleRow[];
    const total = await ProcurementHandoverRevisionModel.countDocuments({ projectId }).session(session);
    const canWrite = actor.role === "procurement" && project.status !== "completed" && active && req.source.available && !req.blockers.length;
    return { projectId, version: state?.version ?? 0, sourceDigest: req.digest, lifecycleSourceDigest: req.source.digest,
      evidenceEntityId: handoverEvidenceEntityId(projectId), serverNow: now().toISOString(),
      status: !req.source.available || req.blockers.length ? "unavailable" : changed ? "source_changed" : state?.status ?? "not_started",
      checks: req.checks, answers: revision?.answers ?? [], sourceChanges: changed ? sourceChanges(revision!, req) : [],
      currentRevisionId: state?.currentRevisionId ?? null, submittedRevisionId: state?.submittedRevisionId ?? null,
      selectedRevision: null,
      findings: await listLifecycleFindings(projectId, session), ...contexts,
      history: { items: rows.map((row): HandoverRevisionSummary => ({ id: String(row._id), version: row.version, status: row.status,
        sourceDigest: row.sourceDigest, action: row.action, actorId: row.actorId, at: new Date(row.occurredAt).toISOString(), reason: row.reason ?? null,
        previousRevisionId: row.previousRevisionId ?? null })), total, ...page },
      auditHistory: (await lcHistory(projectId, session, handoverEvidenceEntityId(projectId))).items, blockers,
      allowedActions: !canWrite ? [] : changed ? ["reconcile"] : state?.status === "submitted" ? ["correct"] : ["save", "submit"] };
  }

  return {
    get: (actor: PublicUser, projectId: string, query: unknown = {}) => {
      const { revisionId, ...page } = lcParse(lcPage.extend({ revisionId: lcId.optional() }), query);
      return lcTransaction(async session => {
        const result = await workspace(actor, projectId, session, page);
        if (revisionId) {
          const row = await ProcurementHandoverRevisionModel.findOne({ _id: revisionId, projectId }).session(session).lean() as LifecycleRow | null;
          if (!row) lcMissing();
          result.selectedRevision = { id: String(row._id), version: row.version, checks: row.checks, answers: row.answers, actorId: row.actorId, at: new Date(row.occurredAt).toISOString(), reason: row.reason ?? null };
        }
        return result;
      });
    },
    async command(actor: PublicUser, projectId: string, value: unknown): Promise<HandoverWorkspace> {
      const input = lcParse(handoverCommandSchema, value);
      return lcRunCommand(deps, actor, projectId, input, `handover.${input.action}`, ["procurement"], async session => {
        await requireLifecycleState(projectId, session);
        const req = await requirements(projectId, session, true);
        if (req.digest !== input.sourceDigest) lcConflict("The handover checklist source changed. Refresh before recording this action.");
        if (req.blockers.length) lcConflict(req.blockers[0]!.message);
        const { state, revision } = await currentRevision(projectId, session);
        if ((state?.version ?? 0) !== input.expectedVersion) lcConflict();
        const changed = !!revision && revision.sourceDigest !== req.digest;
        if (changed && input.action !== "reconcile") lcConflict("Reconcile the changed source before editing or submitting handover.");
        if (input.action === "reconcile" && !changed) lcConflict("There are no source changes to reconcile.");
        if (input.action === "correct" && state?.status !== "submitted") lcConflict("Only a submitted handover can be corrected.");
        if (state?.status === "submitted" && input.action !== "correct" && input.action !== "reconcile") lcConflict("Start a reasoned correction before changing submitted handover.");
        let answers = structuredClone(revision?.answers ?? []) as HandoverAnswer[];
        const at = now(), version = (state?.version ?? 0) + 1;
        if (input.action === "reconcile") {
          const changes = new Set(changedChecks(revision!.checks, req.checks));
          // An issued source change can alter quantities/specification without changing the display labels.
          answers = revision!.lifecycleSourceDigest !== req.source.digest ? [] : answers.filter(answer => !changes.has(answer.checkId));
        }
        if (input.action === "save") {
          if (new Set(input.answers.map(answer => answer.checkId)).size !== input.answers.length) lcConflict("Each check can be answered only once in a command.");
          for (const answer of input.answers) {
            const check = req.checks.find(row => row.id === answer.checkId);
            if (!check) lcConflict("This answer does not belong to the current handover checklist.");
            const evidence = await assertLifecycleEvidence(projectId, handoverEvidenceEntityId(projectId), answer.evidenceIds, session, "handover");
            const issues = handoverAnswerIssues(check, answer, evidence, false); if (issues.length) lcConflict(issues[0]);
            const prior = answers.find(row => row.checkId === check.id);
            let findingId = prior?.findingId ?? null;
            if (answer.answer === "fail") {
              if (prior?.answer === "fail" && prior.findingId) {
                if (lcDigest(prior.finding) !== lcDigest(answer.finding)) lcConflict("Update corrective-action ownership and deadlines through the canonical snag.");
              } else {
                findingId = lcNewId("finding");
                await recordLifecycleFindingInSession(deps, { actor, projectId, findingId, sourceDigest: req.digest,
                  sourceItem: req.source.items.find(item => item.id === check.itemId) ?? null, title: check.label.slice(0, 180),
                  note: answer.note, ownerId: answer.finding!.ownerId, dueAt: answer.finding!.dueAt, evidenceIds: answer.evidenceIds,
                  evidenceEntityId: handoverEvidenceEntityId(projectId), origin: { kind: "handover", entityId: findingId, checkId: check.id } }, session);
              }
            }
            const next: HandoverAnswer = { ...answer, actorId: actor.id, recordedAt: at.toISOString(), findingId };
            answers = [...answers.filter(row => row.checkId !== check.id), next];
          }
        }
        const contexts = await context(projectId, req, session);
        if (input.action === "submit") {
          const issues = await completionBlockers(projectId, req, { sourceDigest: req.digest, answers, status: "submitted" }, session, contexts.qualityAudits, true);
          if (issues.length) lcConflict(issues[0]!.message);
        }
        const revisionId = lcNewId("handover-revision"), handoverId = handoverEvidenceEntityId(projectId);
        const status = input.action === "submit" ? "submitted" : "draft";
        await ProcurementHandoverRevisionModel.create([{ _id: revisionId, handoverId, projectId, version,
          sourceDigest: req.digest, lifecycleSourceDigest: req.source.digest, status, action: input.action,
          checks: req.checks, answers, sourceSnapshot: req.source, qualityAuditIds: contexts.qualityAudits.map(row => row.id), supplyReviewIds: contexts.supplyReviews.map(row => row.id),
          previousRevisionId: revision?._id ?? null, reason: "reason" in input ? input.reason : null, actorId: actor.id, occurredAt: at }], { session });
        const update = { currentRevisionId: revisionId, submittedRevisionId: status === "submitted" ? revisionId : state?.submittedRevisionId ?? null,
          status, version, updatedAt: at, updatedById: actor.id };
        if (!state) await ProcurementHandoverModel.create([{ _id: handoverId, projectId, ...update }], { session });
        else {
          const updated = await ProcurementHandoverModel.updateOne({ _id: state._id, version: input.expectedVersion }, { $set: update }, { session, runValidators: true });
          if (updated.modifiedCount !== 1) lcConflict();
        }
        return workspace(actor, projectId, session);
      }, { entityId: handoverEvidenceEntityId(projectId), reason: "reason" in input ? input.reason : null });
    }
  };
}

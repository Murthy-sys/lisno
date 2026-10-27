import type { ClientSession } from "mongoose";
import type { PMItem, PMPanel } from "../../contracts/project-manager.js";
import { pmQualityAnswerSchema, pmQualitySaveSchema, pmQualitySignSchema, pmQualityListSchema, qualityEvidenceIssues, qualityWeek, type PMQualityAnswer, type PMQualityQuery } from "../../domain/project-manager/quality.js";
import { ApiError } from "../../middleware/errors.js";
import { ProjectQualityAuditModel } from "../../models/ProjectQualityAudit.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../../models/ProjectPurchaseOrderRevision.js";
import { AiEstimatorKnowledgeBasketModel } from "../../models/AiEstimatorKnowledgeBasket.js";
import { UserModel } from "../../models/User.js";
import { mandatoryQualityParameters, readBasketQualityRevision } from "../ai-estimator-knowledge-basket-quality.js";
import type { PublicUser } from "../auth.service.js";
import { assertPMEvidence } from "./evidence.js";
import { pmConflict, pmDigest, pmHistory, pmMissing, pmPanel, pmRecord, pmReplay, pmTransaction, requirePMProject, type PMDependencies, type PMRow } from "./common.js";

function invalid(message: string): never { throw new ApiError(400, "VALIDATION_ERROR", message); }
const readers = ["site_manager", "procurement", "designer"] as const;
interface QualitySource { order: PMRow; basket: PMRow; revisionId: string; revisionNumber: number; parameters: PMRow[]; token: string; }
export function pmQualityAuditId(projectId: string, orderId: string, basketId: string, week: string, sourceToken: string, correctionOf: string | null = null): string {
  return `pm-quality-${pmDigest([projectId, orderId, basketId, week, sourceToken, correctionOf]).slice(0, 48)}`;
}
async function readSource(projectId: string, orderId: string, basketId: string, session: ClientSession, lock = false): Promise<QualitySource> {
  const order = await ProjectPurchaseOrderModel.findOne({ _id: orderId, projectId, cancelledAt: null, approvedRevisionId: { $type: "string" } }).session(session).lean(); if (!order) pmConflict("This issued package is no longer current.");
  const revision = await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId, projectId, orderId }).session(session).lean();
  if (!revision || !(revision.lines as PMRow[]).some(line => line.sourceSectionId === basketId && ["execution", "supply_and_execution"].includes(line.scopeType))) pmConflict("The package has no current executable scope for this Main Basket.");
  const basket = lock ? await AiEstimatorKnowledgeBasketModel.findOneAndUpdate({ _id: basketId, status: { $ne: "archived" } }, { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean() : await AiEstimatorKnowledgeBasketModel.findOne({ _id: basketId, status: { $ne: "archived" } }).session(session).lean();
  if (!basket) pmConflict("The current Main Basket quality source is unavailable.");
  const checklist = await readBasketQualityRevision(basket, session); if (!checklist?.parameters.length) pmConflict("No current quality checklist is configured for this Main Basket.");
  if (lock) { const fenced = await ProjectPurchaseOrderModel.updateOne({ _id: orderId, approvedRevisionId: order.approvedRevisionId, cancelledAt: null }, { $inc: { accessAuthorityEpoch: 1 } }, { session, timestamps: false }); if (!fenced.matchedCount) pmConflict(); }
  return { order, basket, revisionId: checklist._id, revisionNumber: checklist.revisionNumber, parameters: mandatoryQualityParameters(checklist.parameters), token: pmDigest({ projectId, orderId, orderRevisionId: order.approvedRevisionId, basketId, checklistRevisionId: checklist._id, digest: checklist.contentDigest }) };
}
function blankRow(projectId: string, source: QualitySource, week: string, correctionOf: string | null = null): PMRow {
  return { _id: pmQualityAuditId(projectId, String(source.order._id), String(source.basket._id), week, source.token, correctionOf), projectId, orderId: String(source.order._id), orderRevisionId: source.order.approvedRevisionId,
    vendorId: source.order.vendorId, orderNumber: source.order.orderNumber, basketId: String(source.basket._id), basketName: source.basket.name, checklistRevisionId: source.revisionId, checklistRevisionNumber: source.revisionNumber, sourceToken: source.token, parameters: source.parameters, week, correctionOf, version: 0, status: "draft", answers: [] };
}
async function auditDto(row: PMRow, actor: PublicUser, session: ClientSession, available = true): Promise<PMItem> {
  const signed = row.status === "signed"; const answers = row.answers as PMQualityAnswer[];
  const correction = signed ? await ProjectQualityAuditModel.findOne({ projectId: row.projectId, orderId: row.orderId, orderRevisionId: row.orderRevisionId,
    basketId: row.basketId, sourceToken: row.sourceToken, week: row.week, correctionOf: String(row._id) }).select({ status: 1 }).session(session).lean() : null;
  const corrected = correction?.status === "signed";
  const effective = signed && available && !corrected;
  const findings = answers.some(answer => answer.answer === "fail");
  const signer = row.signedById ? await UserModel.findById(row.signedById).select({ name: 1 }).session(session).lean() : null;
  return { id: String(row._id), kind: "quality_audit", title: String(row.basketName), status: signed ? corrected ? "corrected" : !available ? findings ? "historical_signed_with_findings" : "historical_signed" : findings ? "signed_with_findings" : "signed" : available ? row.version ? "draft" : "not_started" : "source_changed",
    severity: effective ? findings ? "warning" : "success" : "neutral", version: row.version, sourceToken: row.sourceToken, sourceId: row.orderId, orderId: row.orderId, basketId: row.basketId, week: row.week, vendorId: row.vendorId, sourceAvailable: available,
    description: `Week of ${row.week}. Checklist from current Configuration, snapshotted for this audit.`,
    facts: [{ label: "Order", value: row.orderNumber }, { label: "Week", value: row.week }, { label: "Checklist revision", value: String(row.checklistRevisionNumber) }, { label: "Answered", value: `${answers.length} / ${row.parameters.length}` }, ...(signed ? [{ label: "Signed by", value: signer?.name ?? "Recorded staff member" }, { label: "Signed at", value: new Date(row.signedAt).toISOString() },
      { label: "Applicability", value: corrected ? "Replaced by a signed correction; original findings retained." : !available ? "Historical issued source; original inspection retained." : correction ? "Findings remain current until the correction is signed." : "Current signed inspection for this audit round." }] : []), ...(row.correctionOf ? [{ label: "Correction reason", value: row.correctionReason }] : [])],
    checks: (row.parameters as PMRow[]).map(parameter => { const answer = answers.find(candidate => candidate.id === parameter.id); return { id: parameter.id, label: parameter.label, answer: answer?.answer ?? null, reason: answer?.reason ?? null, evidenceIds: answer?.evidenceIds ?? [], instructions: parameter.instructions ?? parameter.acceptanceCriteria ?? null, evidence: parameter.evidence ?? null, sampleCount: answer?.sampleCount ?? 1 }; }),
    actions: actor.role === "site_manager" && available ? signed ? correction ? [] : [{ id: "correct", label: "Create correction", reasonRequired: true }] : [{ id: "save_audit", label: "Save draft" }, ...(row.version > 0 ? [{ id: "sign_audit", label: "Sign audit", reasonRequired: true }] : [])] : [],
    history: row.version ? await pmHistory(row.projectId, String(row._id), session) : [] };
}
async function validateAnswers(projectId: string, auditId: string, parameters: PMRow[], answers: PMQualityAnswer[], session: ClientSession, complete: boolean): Promise<void> {
  const ids = new Set(answers.map(answer => answer.id)); if (ids.size !== answers.length || answers.some(answer => !parameters.some(parameter => parameter.id === answer.id))) invalid("Answers must refer to distinct checks in this audit revision.");
  if (complete && parameters.some(parameter => !ids.has(parameter.id))) pmConflict("Answer every required check before signing.");
  for (const answer of answers) {
    const rows = await assertPMEvidence(projectId, auditId, answer.evidenceIds, session);
    if (complete) { const parameter = parameters.find(row => row.id === answer.id)!; const issues = qualityEvidenceIssues({ id: parameter.id, label: parameter.label, evidence: parameter.evidence }, answer, rows); if (issues.length) pmConflict(issues.join(" ")); }
  }
}

export function createProjectManagerQualityService(deps: PMDependencies) {
  const now = deps.now ?? (() => new Date());
  return {
    async quality(actor: PublicUser, projectId: string, query: PMQualityQuery = {}): Promise<PMPanel> {
      const parsed = pmQualityListSchema.safeParse(query); if (!parsed.success) invalid("Quality list pagination is invalid."); const filters = parsed.data;
      return pmTransaction(async session => {
      await requirePMProject(actor, projectId, session, false, readers); const panel = pmPanel("quality", now()); const week = qualityWeek(now());
      const audits = await ProjectQualityAuditModel.find({ projectId }).sort({ week: -1, createdAt: -1, _id: 1 }).session(session).lean();
      const orders = await ProjectPurchaseOrderModel.find({ projectId, cancelledAt: null, approvedRevisionId: { $type: "string" } }).sort({ _id: 1 }).session(session).lean();
      const currentIds = new Set<string>();
      const records: Array<{ row: PMRow; available?: boolean }> = [];
      for (const order of orders) {
        const revision = await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId, projectId, orderId: order._id }).session(session).lean();
        if (!revision) { panel.issues.push(`${order.orderNumber}: issued scope is unavailable.`); continue; }
        const basketIds = [...new Set((revision.lines as PMRow[]).filter(line => ["execution", "supply_and_execution"].includes(line.scopeType)).map(line => String(line.sourceSectionId)))];
        for (const basketId of basketIds) {
          try {
            const source = await readSource(projectId, String(order._id), basketId, session); const blank = blankRow(projectId, source, week); const existing = audits.find(row => row._id === blank._id); currentIds.add(blank._id);
            records.push({ row: existing ?? blank, available: true }); panel.sources.push({ id: blank._id, label: `${source.basket.name} · ${order.orderNumber}`, sourceToken: source.token, vendorId: order.vendorId, sectionId: basketId });
          } catch (error) { if (!(error instanceof ApiError && error.status === 409)) throw error; panel.issues.push(`${order.orderNumber}: ${(error as Error).message}`); }
        }
      }
      for (const audit of audits) if (!currentIds.has(String(audit._id))) records.push({ row: audit });
      panel.total = records.length;
      for (const record of records.slice(filters.offset, filters.offset + filters.limit)) {
        let current = record.available ?? false;
        if (record.available === undefined) { try { current = (await readSource(projectId, record.row.orderId, record.row.basketId, session)).token === record.row.sourceToken; } catch (error) { if (!(error instanceof ApiError && error.status === 409)) throw error; } }
        panel.items.push(await auditDto(record.row, actor, session, current));
      }
      const visibleIds = new Set(panel.items.map(item => item.id)); panel.sources = panel.sources.filter(source => visibleIds.has(source.id));
      panel.availability = panel.total ? "available" : panel.issues.length ? "not_configured" : "no_data"; return panel;
    }); },
    async saveAudit(actor: PublicUser, projectId: string, auditId: string, value: unknown): Promise<PMItem> { const parsed = pmQualitySaveSchema.safeParse(value); if (!parsed.success) invalid(parsed.error.issues.map(issue => issue.message).join(" ")); const input = parsed.data; return pmTransaction(async session => {
      await requirePMProject(actor, projectId, session, true); const payload = { auditId, ...input }; const replay = await pmReplay(projectId, actor, input.idempotencyKey, payload, session); if (replay) return replay as PMItem;
      const previous = await ProjectQualityAuditModel.findOne({ _id: auditId, projectId }).session(session).lean();
      if (input.action === "correct") {
        if (!previous || previous.status !== "signed" || previous.version !== input.expectedVersion) pmConflict("Only a current signed audit can receive a correction.");
        const source = await readSource(projectId, previous.orderId, previous.basketId, session, true); if (source.token !== previous.sourceToken) pmConflict("Configuration changed. Start the new current checklist instead.");
        const candidate = blankRow(projectId, source, previous.week, auditId);
        if (await ProjectQualityAuditModel.exists({ _id: candidate._id }).session(session)) pmConflict("A correction already exists for this signature.");
        const [created] = await ProjectQualityAuditModel.create([{ ...candidate, correctionReason: input.reason, version: 1, createdById: actor.id, createdAt: now(), updatedById: actor.id, updatedAt: now() }], { session });
        const result = await auditDto(created!.toObject(), actor, session); await pmRecord(deps, { projectId, entityId: candidate._id, family: "quality", actor, key: input.idempotencyKey, payload, action: "correction_created", version: 1, reason: input.reason, result }, session); return result;
      }
      if (previous?.status === "signed") pmConflict("Signed audits are immutable. Create a correction.");
      if ((previous?.version ?? 0) !== input.expectedVersion) pmConflict();
      const source = await readSource(projectId, input.orderId, input.basketId, session, true);
      if (source.token !== input.sourceToken || previous && previous.sourceToken !== source.token) pmConflict("The checklist or issued package changed. Start the current audit revision.");
      const blank = blankRow(projectId, source, input.week, previous?.correctionOf ?? null);
      if (auditId !== blank._id || !previous && input.week !== qualityWeek(now()) || previous && previous.week !== input.week) pmConflict("Use the current weekly audit identity.");
      await validateAnswers(projectId, auditId, source.parameters, input.answers, session, false);
      let row: PMRow;
      if (previous) { const updated = await ProjectQualityAuditModel.findOneAndUpdate({ _id: auditId, projectId, status: "draft", version: input.expectedVersion }, { $inc: { version: 1 }, $set: { answers: input.answers, updatedById: actor.id, updatedAt: now() } }, { session, returnDocument: "after", runValidators: true }).lean(); if (!updated) pmConflict(); row = updated; }
      else { const [created] = await ProjectQualityAuditModel.create([{ ...blank, version: 1, answers: input.answers, createdById: actor.id, createdAt: now(), updatedById: actor.id, updatedAt: now() }], { session }); row = created!.toObject(); }
      const result = await auditDto(row, actor, session); await pmRecord(deps, { projectId, entityId: auditId, family: "quality", actor, key: input.idempotencyKey, payload, action: "draft_saved", version: row.version, result }, session); return result;
    }); },
    async signAudit(actor: PublicUser, projectId: string, auditId: string, value: unknown): Promise<PMItem> { const parsed = pmQualitySignSchema.safeParse(value); if (!parsed.success) invalid("Provide a signature reason and current audit version."); const input = parsed.data; return pmTransaction(async session => {
      await requirePMProject(actor, projectId, session, true); const payload = { auditId, ...input }; const replay = await pmReplay(projectId, actor, input.idempotencyKey, payload, session); if (replay) return replay as PMItem;
      const row = await ProjectQualityAuditModel.findOne({ _id: auditId, projectId }).session(session).lean(); if (!row) pmMissing();
      if (row.status !== "draft" || row.version !== input.expectedVersion) pmConflict();
      const source = await readSource(projectId, row.orderId, row.basketId, session, true); if (source.token !== row.sourceToken || input.sourceToken !== row.sourceToken) pmConflict("The checklist or issued package changed. Start the current audit revision.");
      const storedAnswers = pmQualityAnswerSchema.array().safeParse(row.answers); if (!storedAnswers.success) pmConflict("Stored audit answers are invalid. Correct the draft before signing.");
      await validateAnswers(projectId, auditId, row.parameters, storedAnswers.data, session, true);
      const updated = await ProjectQualityAuditModel.findOneAndUpdate({ _id: auditId, projectId, status: "draft", version: input.expectedVersion }, { $inc: { version: 1 }, $set: { status: "signed", signedById: actor.id, signedAt: now(), signatureReason: input.reason, updatedById: actor.id, updatedAt: now() } }, { session, returnDocument: "after", runValidators: true }).lean(); if (!updated) pmConflict();
      const result = await auditDto(updated, actor, session); await pmRecord(deps, { projectId, entityId: auditId, family: "quality", actor, key: input.idempotencyKey, payload, action: "signed", version: updated.version, reason: input.reason, result }, session); return result;
    }); }
  };
}

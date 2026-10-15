import type { AssistantProjectEstimate, AssistantProjectPricing } from "../contracts/project-chat-assistant.js";
import { currentEstimationApproval, isCollaborativeEstimate } from "../domain/estimation-lifecycle.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import type { ChatTransaction } from "../repositories/project-chat.js";
import { toPublicUser } from "./auth.service.js";
import { presentClientEstimate } from "./estimate-client-presentation.js";
import { financeApprovalLineage } from "./project-finance.service.js";
import { sourceWitness, type AssistantContext } from "./project-assistant-context.js";

type Row = Record<string, any>;
type Basis = "current" | "approved" | "published";
const date = (value: unknown): string | null => (typeof value === "string" || value instanceof Date) && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
const paise = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
/** Legacy immutable publications used rupees. Convert exactly, never round an ambiguous value. */
function amount(exact: unknown, rupees: unknown): number | null {
  if (exact !== undefined) return paise(exact) && typeof rupees === "number" && rupees === exact / 100 ? exact : null;
  if (typeof rupees !== "number" || !Number.isSafeInteger(rupees) || rupees < 0) return null;
  const converted = rupees * 100;
  return paise(converted) && converted / 100 === rupees ? converted : null;
}

/** Narrow immutable snapshot projection. No working-copy, Configuration or private metadata fallback. */
export function projectPricingFromPublication(input: { estimateId: string; projectId: string; round: Row; snapshot: Row; approved: boolean }): AssistantProjectPricing | null {
  const { round, snapshot } = input;
  const publishedAt = date(round.createdAt);
  const totals = [amount(snapshot.subtotalPaise, snapshot.subtotal), amount(snapshot.gstPaise, snapshot.gst), amount(snapshot.totalPaise, snapshot.total)];
  if (!publishedAt || !Number.isSafeInteger(round.estimateVersion) || round.estimateVersion < 1 || !Number.isSafeInteger(round.version) || round.version < 1 ||
      totals.some(value => value === null) || totals[0]! + totals[1]! !== totals[2] || !Array.isArray(snapshot.lineItems)) return null;
  const included = snapshot.lineItems.filter((line: Row) => line.included === true);
  if (!included.length) return null;
  const lines: AssistantProjectPricing["lines"] = [];
  let sum = 0;
  for (let index = 0; index < included.length; index++) {
    const line = included[index] as Row;
    const ratePaise = amount(line.ratePaise, line.rate), amountPaise = amount(line.amountPaise, line.amount);
    const label = line.source === "configuration" ? line.mainLineName : line.specification;
    if (ratePaise === null || amountPaise === null || typeof label !== "string" || !label.trim() || label.length > 300 ||
        typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity < 0 ||
        typeof line.unit !== "string" || !line.unit.trim() || line.unit.length > 80 || /[\u0000-\u001f\u007f]/u.test(label + line.unit)) return null;
    sum += amountPaise;
    if (!Number.isSafeInteger(sum)) return null;
    const id = typeof line.id === "string" && line.id ? line.id : `published-line-${index + 1}`;
    if (id.length > 200 || /[\u0000-\u001f\u007f]/u.test(id)) return null;
    if (lines.length < 100) lines.push({ id, label, quantity: String(line.quantity), unit: line.unit, ratePaise, amountPaise });
  }
  if (sum !== totals[0] || new Set(lines.map(line => line.id)).size !== lines.length) return null;
  return { policy: "published-project-estimate-v1", currency: "INR", state: input.approved ? "approved" : "published",
    estimateId: input.estimateId, estimateVersion: round.estimateVersion, reviewRoundId: String(round._id), reviewVersion: round.version,
    publishedAt, source: { id: String(round._id), label: input.approved ? "Approved project estimate" : "Published project estimate", href: null },
    lines, lineCount: included.length, hasMoreLines: included.length > lines.length, subtotalPaise: totals[0]!, gstPaise: totals[1]!, totalPaise: totals[2]! };
}

export async function readAssistantProjectEstimate(context: AssistantContext, input: { basis: Basis }, tx?: ChatTransaction): Promise<AssistantProjectEstimate> {
  const projectId = context.sources.project.id;
  const finish = (report: AssistantProjectPricing | null, unavailableReason: AssistantProjectEstimate["unavailableReason"], evidence: unknown): AssistantProjectEstimate => ({ report, unavailableReason,
    freshness: [sourceWitness("assistant-project-estimate", `${projectId}:${input.basis}`, evidence)] });
  if (!tx?.session) return finish(null, "not_published", null);
  const candidates = context.sources.estimates.filter(row => row.projectId === projectId || context.sources.leads.some(lead => lead.id === row.leadId && lead.projectId === projectId));
  if (!candidates.length) return finish(null, "not_published", []);
  if (candidates.length !== 1) return finish(null, "source_conflict", candidates);
  const selected = candidates[0]!;
  const estimate = await EstimateModel.findById(selected.id).session(tx.session).lean().exec() as Row | null;
  const lead = context.sources.leads.find(row => row.id === selected.leadId);
  if (!estimate || !lead || (estimate.projectId && estimate.projectId !== projectId) || (lead.projectId && lead.projectId !== projectId) || estimate.leadId !== lead.id) return finish(null, "source_conflict", { estimate, lead });
  const rounds = await EstimateClientReviewRoundModel.find({ estimateId: selected.id }).limit(501).session(tx.session).lean().exec() as Row[];
  const evidence = await tx.app.findProjectStatusEstimateEvidence(projectId);
  const witness = { estimate, lead, rounds, evidence };
  if (rounds.length > 500 || evidence.projectId !== projectId) return finish(null, "source_conflict", witness);
  const reference = currentEstimationApproval(estimate);
  const approvedRounds = rounds.filter(row => row.status === "approved" && row.decision === "approve");
  const useApproval = input.basis === "approved" || input.basis === "current" && (reference !== null || estimate.status === "client_approved");
  let round: Row | undefined;
  if (useApproval) {
    const matching = isCollaborativeEstimate(estimate) ? approvedRounds.filter(row => String(row._id) === reference?.reviewRoundId && row.estimateVersion === reference.estimateVersion) : approvedRounds;
    if (matching.length !== 1) return finish(null, "source_conflict", witness);
    round = matching[0];
  } else {
    const ordered = [...rounds].sort((a, b) => b.sendGeneration - a.sendGeneration);
    if (ordered.length > 1 && ordered[0]!.sendGeneration === ordered[1]!.sendGeneration) return finish(null, "source_conflict", witness);
    round = ordered[0];
  }
  if (!round) return finish(null, "not_published", witness);
  const presented = presentClientEstimate(toPublicUser(context.user), estimate, { ...lead, _id: lead.id }, round, context.sources.project);
  if (!presented?.publishedReview || presented.reviewSourceIssue !== null || presented.projectId !== projectId) return finish(null, "source_conflict", witness);
  const approved = round.status === "approved";
  let baseline: ReturnType<typeof financeApprovalLineage>["baseline"] | null = null;
  if (approved) {
    const evidenceRound = evidence.rounds.find(row => row.id === String(round!._id));
    const approvedAt = reference ? date(reference.approvedAt) : date(estimate.clientDecisionAt);
    if (!evidenceRound || evidenceRound.estimateId !== selected.id || evidenceRound.leadId !== lead.id ||
        evidenceRound.projectId && evidenceRound.projectId !== projectId || evidenceRound.estimateVersion !== round.estimateVersion || evidenceRound.decidedAt !== approvedAt ||
        !isCollaborativeEstimate(estimate) && rounds.some(row => row.sendGeneration > round!.sendGeneration) ||
        evidence.financeSource && (evidence.financeSource.estimateId !== selected.id || evidence.financeSource.estimateVersion !== round.estimateVersion || evidence.financeSource.reviewRoundId !== String(round._id)) ||
        !["client_portal", "admin_proof"].includes(round.decisionSource) ||
        round.decisionSource === "client_portal" && round.decidedById !== context.user.id || round.decisionSource === "admin_proof" && !evidenceRound.proofValid) return finish(null, "source_conflict", witness);
    try {
      const lineage = financeApprovalLineage(estimate, approvedRounds);
      if (!lineage.immutable || lineage.estimateReviewRoundId !== String(round._id) || lineage.estimateVersion !== round.estimateVersion) return finish(null, "source_conflict", witness);
      baseline = lineage.baseline;
    } catch (error) { if (!(error instanceof ApiError)) throw error; return finish(null, "source_conflict", witness); }
  }
  const report = projectPricingFromPublication({ estimateId: selected.id, projectId, round, snapshot: presented.publishedReview.snapshot, approved });
  if (report && baseline && (report.subtotalPaise !== baseline.approvedSubtotalPaise || report.gstPaise !== baseline.approvedGstPaise || report.totalPaise !== baseline.approvedContractTotalPaise)) return finish(null, "source_conflict", witness);
  return finish(report, report ? null : "incomplete", witness);
}

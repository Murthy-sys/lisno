import type { ClientSession } from "mongoose";
import { z } from "zod";
import type { LifecycleBlocker, LifecycleReadiness } from "../contracts/procurement-lifecycle.js";
import type { ProcurementReadinessWorkspace } from "../contracts/procurement-readiness.js";
import { lcCommand, lcConflict, lcDigest, lcNewId, lcParse, lcReason } from "../domain/procurement-lifecycle.js";
import { ProcurementLifecycleStateModel } from "../models/ProcurementLifecycleState.js";
import { ProcurementReadinessDeclarationModel, ProcurementReadinessStateModel } from "../models/ProcurementReadiness.js";
import { ProjectCompletionDecisionModel } from "../models/ProjectCompletionDecision.js";
import { ProjectModel } from "../models/Project.js";
import type { PublicUser } from "./auth.service.js";
import { requireLifecycleProject, type LifecycleRow } from "./procurement-lifecycle/access.js";
import { readLifecycleSource } from "./procurement-lifecycle/source.js";
import { lcHistory, lcRunCommand, lcTransaction, type LifecycleDependencies } from "./procurement-lifecycle/transaction.js";
import { readPaymentReadiness } from "./procurement-payments.service.js";
import { readReviewReadiness } from "./procurement-progress.service.js";
import { readInspectionReadiness } from "./procurement-inspections.service.js";
import { readHandoverReadiness } from "./procurement-handover.service.js";

const commandSchema = z.object({ ...lcCommand, action: z.enum(["submit", "withdraw", "request_correction"]), reason: lcReason }).strict();

/** No writes on reads. The final completion caller supplies forWrite to fence Configuration too. */
export async function readProcurementReadiness(projectId: string, session: ClientSession, at = new Date(), forWrite = false): Promise<LifecycleReadiness & { declarationId: string | null }> {
  const state = await ProcurementLifecycleStateModel.findById(projectId).session(session).lean();
  const project = await ProjectModel.findById(projectId).select({ status: 1, completionDecisionId: 1 }).session(session).lean();
  if (project?.status === "completed") {
    const closeout = project.completionDecisionId ? await ProjectCompletionDecisionModel.findOne({ _id: project.completionDecisionId, projectId }).session(session).lean() : null;
    // Closed work is evaluated against its signed snapshot. Only financial exceptions continue.
    const payments = state ? await readPaymentReadiness(projectId, session, at) : null;
    return { ready: Boolean(closeout?.procurementReadinessDeclarationId) && !payments?.blockers.length,
      sourceDigest: closeout?.procurementReadinessDigest ?? lcDigest({ projectId, legacyCompleted: true }),
      declarationId: closeout?.procurementReadinessDeclarationId ?? null,
      references: closeout?.procurementReadinessReferences ?? {}, blockers: payments?.blockers ?? [] };
  }
  if (!state) return { ready: false, sourceDigest: lcDigest({ projectId, setup: false }), declarationId: null,
    references: {}, blockers: [{ code: "LIFECYCLE_SETUP_REQUIRED", message: "Procurement must set up this project's lifecycle before final signoff.", tab: "progress" }] };
  const source = await readLifecycleSource(projectId, session, forWrite);
  const parts: [string, LifecycleReadiness][] = [
    ["payments", await readPaymentReadiness(projectId, session, at)],
    ["reviews", await readReviewReadiness(projectId, session, at)],
    ["inspections", await readInspectionReadiness(projectId, session, at)],
    ["handover", await readHandoverReadiness(projectId, session, at, forWrite)]
  ];
  const blockers: LifecycleBlocker[] = [...source.blockers];
  const references: Record<string, string | string[]> = { orderRevisionIds: source.orders.map(order => order.revisionId) };
  for (const [name, part] of parts) {
    blockers.push(...part.blockers);
    for (const [key, value] of Object.entries(part.references)) references[`${name}.${key}`] = value;
  }
  const sourceDigest = lcDigest({ source: source.digest, parts: parts.map(([key, part]) => [key, part.sourceDigest, part.references]) });
  const current = await ProcurementReadinessStateModel.findById(projectId).session(session).lean();
  const declaration = current?.declarationId ? await ProcurementReadinessDeclarationModel.findOne({ _id: current.declarationId, projectId }).session(session).lean() : null;
  if (!declaration || current?.status !== "submitted") blockers.push({ code: "READINESS_REQUIRED", message: current?.status === "correction_requested" ? "Super Admin requested a Procurement correction. Review the request and submit readiness again." : "Procurement must submit its readiness declaration.", tab: "signoff" });
  else if (declaration.sourceDigest !== sourceDigest) blockers.push({ code: "READINESS_STALE", message: "Project records changed after the Procurement declaration. Review them and submit a fresh declaration.", tab: "signoff" });
  return { ready: blockers.length === 0, sourceDigest, references, blockers, declarationId: declaration ? String(declaration._id) : null };
}

export function createProcurementReadinessService(deps: LifecycleDependencies) {
  const now = deps.now ?? (() => new Date());
  async function workspace(actor: PublicUser, projectId: string, session: ClientSession, project?: LifecycleRow): Promise<ProcurementReadinessWorkspace> {
    const currentProject = project ?? await requireLifecycleProject(actor, projectId, session, false, ["procurement", "super_admin"]);
    const readiness = await readProcurementReadiness(projectId, session, now());
    const state = await ProcurementReadinessStateModel.findById(projectId).session(session).lean();
    const declarationId = currentProject.status === "completed" ? readiness.declarationId : state?.declarationId;
    const declaration = declarationId ? await ProcurementReadinessDeclarationModel.findOne({ _id: declarationId, projectId }).session(session).lean() : null;
    const status = currentProject.status === "completed" && declaration ? "submitted" : state?.status === "submitted" && declaration?.sourceDigest !== readiness.sourceDigest ? "stale" : state?.status ?? "not_submitted";
    const eligible = readiness.blockers.every(b => b.code === "READINESS_REQUIRED" || b.code === "READINESS_STALE");
    const closeout = currentProject.completionDecisionId ? await ProjectCompletionDecisionModel.findOne({ _id: currentProject.completionDecisionId, projectId }).session(session).lean() : null;
    return { ...readiness, projectId, projectStatus: currentProject.status, version: state?.version ?? 0, serverNow: now().toISOString(), status,
      declaration: declaration ? { id: String(declaration._id), version: declaration.version, actorId: declaration.actorId, actorName: declaration.actorName, at: declaration.at.toISOString(), reason: declaration.reason, sourceDigest: declaration.sourceDigest, references: declaration.references } : null,
      history: await lcHistory(projectId, session, `readiness:${projectId}`),
      allowedActions: currentProject.status !== "active" ? [] : actor.role === "super_admin" ? ["request_correction"] : [...(eligible && status !== "submitted" ? ["submit" as const] : []), ...(status === "submitted" ? ["withdraw" as const] : [])],
      completion: { decisionId: currentProject.completionDecisionId ?? null, completedAt: currentProject.actualEndAt ? new Date(currentProject.actualEndAt).toISOString() : null, procurementDeclarationId: closeout?.procurementReadinessDeclarationId ?? null, sourceDigest: closeout?.procurementReadinessDigest ?? null, references: closeout?.procurementReadinessReferences ?? null } };
  }
  return {
    get: (actor: PublicUser, projectId: string) => lcTransaction(session => workspace(actor, projectId, session)),
    command: (actor: PublicUser, projectId: string, value: unknown) => {
      const input = lcParse(commandSchema, value);
      return lcRunCommand(deps, actor, projectId, input, `readiness.${input.action}`, input.action === "request_correction" ? ["super_admin"] : ["procurement"], async (session, project) => {
        const state = await ProcurementReadinessStateModel.findById(projectId).session(session).lean();
        if ((state?.version ?? 0) !== input.expectedVersion) lcConflict();
        const readiness = await readProcurementReadiness(projectId, session, now(), true);
        if (readiness.sourceDigest !== input.sourceDigest) lcConflict("Readiness changed. Refresh before continuing.");
        const at = now(), version = input.expectedVersion + 1;
        let declarationId = state?.declarationId ?? null;
        if (input.action === "submit") {
          const blockers = readiness.blockers.filter(b => !["READINESS_REQUIRED", "READINESS_STALE"].includes(b.code));
          if (blockers.length) lcConflict(blockers.map(b => b.message).join(" "));
          declarationId = lcNewId("readiness");
          await ProcurementReadinessDeclarationModel.create([{ _id: declarationId, projectId, version, actorId: actor.id, actorName: actor.name, at, sourceDigest: readiness.sourceDigest, references: readiness.references, reason: input.reason }], { session });
        } else if (input.action === "withdraw" && state?.status !== "submitted") lcConflict("There is no submitted declaration to withdraw.");
        await ProcurementReadinessStateModel.updateOne({ _id: projectId }, { $set: { projectId, version, declarationId, status: input.action === "submit" ? "submitted" : input.action === "withdraw" ? "withdrawn" : "correction_requested", updatedAt: at } }, { session, upsert: true, runValidators: true });
        return workspace(actor, projectId, session, project);
      }, { reason: input.reason, entityId: `readiness:${projectId}` });
    }
  };
}

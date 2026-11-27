import type { ClientSession } from "mongoose";
import type { LifecycleItem } from "../contracts/procurement-lifecycle.js";
import type { ProcurementFinding } from "../contracts/procurement-handover.js";
import { findingReportSchema } from "../domain/procurement-handover.js";
import { lcConflict, lcDigest, lcParse } from "../domain/procurement-lifecycle.js";
import { ProcurementFindingModel } from "../models/ProcurementFinding.js";
import { ProjectSnagModel } from "../models/ProjectSnag.js";
import type { PublicUser } from "./auth.service.js";
import { assertLifecycleEvidence } from "./procurement-lifecycle/evidence.js";
import { assertLifecycleSource, readLifecycleSource } from "./procurement-lifecycle/source.js";
import { lcRunCommand, type LifecycleDependencies } from "./procurement-lifecycle/transaction.js";
import type { LifecycleRow } from "./procurement-lifecycle/access.js";

export interface CreateLifecycleFindingInput {
  actor: PublicUser; projectId: string; findingId: string; sourceItem: LifecycleItem | null;
  title: string; note: string; ownerId: string; dueAt: string; evidenceIds: string[];
  origin: { kind: "handover" | "inspection" | "urgent"; entityId: string; checkId?: string };
}
export type CreateLifecycleFinding = (input: CreateLifecycleFindingInput, session: ClientSession) => Promise<{ snagId: string }>;
export interface FindingsDependencies extends LifecycleDependencies { createFindingInSession: CreateLifecycleFinding; }
export interface RecordLifecycleFindingInput extends CreateLifecycleFindingInput { sourceDigest: string; evidenceEntityId?: string; }

/** One immutable origin record points to the existing snag workflow. No resolution state is copied here. */
export async function recordLifecycleFindingInSession(deps: FindingsDependencies, input: RecordLifecycleFindingInput, session: ClientSession): Promise<string> {
  if (!session.inTransaction()) throw new Error("A procurement finding requires the caller's transaction.");
  const digest = lcDigest({ ...input, actor: input.actor.id, sourceItem: input.sourceItem?.id ?? null });
  const filter = { projectId: input.projectId, "origin.kind": input.origin.kind, "origin.entityId": input.origin.entityId,
    "origin.checkId": input.origin.checkId ?? { $exists: false } };
  const existing = await ProcurementFindingModel.findOne(filter).session(session).lean();
  if (existing) {
    if (existing.digest !== digest || String(existing._id) !== input.findingId) lcConflict("The original finding cannot be changed. Update its canonical snag.");
    return String(existing._id);
  }
  await assertLifecycleEvidence(input.projectId, input.evidenceEntityId ?? input.origin.entityId, input.evidenceIds, session,
    input.origin.kind === "inspection" ? "inspection" : "handover");
  const result = await deps.createFindingInSession(input, session);
  const snag = await ProjectSnagModel.findOne({ _id: result.snagId, projectId: input.projectId, procurementFindingId: input.findingId }).session(session).lean();
  if (!snag) lcConflict("The corrective action could not be linked to its canonical snag.");
  await ProcurementFindingModel.create([{ _id: input.findingId, projectId: input.projectId, snagId: result.snagId,
    sourceDigest: input.sourceDigest, digest, origin: input.origin, itemId: input.sourceItem?.id ?? null,
    vendorId: input.sourceItem?.vendorId ?? null, title: input.title, note: input.note, ownerId: input.ownerId,
    dueAt: new Date(input.dueAt), evidenceIds: input.evidenceIds, reportedById: input.actor.id,
    reportedAt: (deps.now ?? (() => new Date()))() }], { session });
  return input.findingId;
}

export async function listLifecycleFindings(projectId: string, session: ClientSession): Promise<ProcurementFinding[]> {
  const rows = await ProcurementFindingModel.find({ projectId }).sort({ reportedAt: -1, _id: 1 }).session(session).lean() as LifecycleRow[];
  const snags = await ProjectSnagModel.find({ projectId, _id: { $in: rows.map(row => row.snagId) } }).session(session).lean() as LifecycleRow[];
  const byId = new Map(snags.map(row => [String(row._id), row]));
  return rows.map(row => {
    const snag = byId.get(row.snagId);
    return { id: String(row._id), projectId, snagId: row.snagId, status: snag?.status ?? "unavailable", title: row.title,
      note: row.note, itemId: row.itemId ?? null, vendorId: row.vendorId ?? null, ownerId: snag?.ownerId ?? row.ownerId,
      dueAt: new Date(snag?.dueAt ?? row.dueAt).toISOString(), reportedAt: new Date(row.reportedAt).toISOString(),
      reportedById: row.reportedById, evidenceIds: row.evidenceIds, origin: row.origin };
  });
}

export function createProcurementFindingsService(deps: FindingsDependencies) {
  return {
    async report(actor: PublicUser, projectId: string, value: unknown): Promise<ProcurementFinding> {
      const input = lcParse(findingReportSchema, value);
      return lcRunCommand(deps, actor, projectId, input, "finding.report", ["procurement"], async session => {
        if (input.expectedVersion !== 0) lcConflict("New findings start at version zero.");
        const source = await readLifecycleSource(projectId, session, true);
        assertLifecycleSource(source, input.sourceDigest);
        const item = input.itemId ? source.items.find(row => row.id === input.itemId) : null;
        if (input.itemId && !item) lcConflict("Choose an appointed item from this project.");
        await recordLifecycleFindingInSession(deps, { ...input, actor, projectId, findingId: input.recordId,
          sourceItem: item ?? null, origin: { kind: "urgent", entityId: input.recordId } }, session);
        return (await listLifecycleFindings(projectId, session)).find(row => row.id === input.recordId)!;
      }, { entityId: input.recordId, reason: input.note });
    }
  };
}

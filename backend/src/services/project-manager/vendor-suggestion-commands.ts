import type { ClientSession } from "mongoose";
import type { ZodType } from "zod";
import type { PMApprovedSourceRef, PMVendorSuggestionCommandResult, PMVendorSuggestionCreate,
  PMVendorSuggestionUpdate } from "../../contracts/project-manager-estimates.js";
import { pmVendorSuggestionCreateSchema, pmVendorSuggestionUpdateSchema } from "../../domain/project-manager/estimates.js";
import { assertVendorSuggestionIndexesReady } from "../../domain/project-vendor-suggestion-scope-index.js";
import { ApiError } from "../../middleware/errors.js";
import { ProjectManagerEventModel } from "../../models/ProjectManagerEvent.js";
import { ProjectVendorSuggestionModel } from "../../models/ProjectVendorSuggestion.js";
import type { PublicUser } from "../auth.service.js";
import { appendExecutionChange } from "../execution-change-events.js";
import { activeVendor } from "../project-vendor-suggestions.service.js";
import { requireLinkedMainLineVendor } from "../main-line-vendor-links.service.js";
import { readPMApprovedSource, requirePMApprovedSource, requirePMMainLineScope } from "./approved-source.js";
import { pmDigest, pmNewId, pmReplay, pmTransaction, requirePMProject, type PMDependencies, type PMRow } from "./common.js";

export interface PMVendorSuggestionCommandService {
  create(actor: PublicUser, projectId: string, input: PMVendorSuggestionCreate): Promise<PMVendorSuggestionCommandResult>;
  update(actor: PublicUser, projectId: string, suggestionId: string, input: PMVendorSuggestionUpdate): Promise<PMVendorSuggestionCommandResult>;
}

function validate<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.",
    Object.fromEntries(result.error.issues.map(issue => [issue.path.join("."), issue.message])));
  return result.data;
}
function sourceFields(source: PMApprovedSourceRef) {
  return { estimateId: source.estimateId, estimateVersion: source.estimateVersion,
    estimateReviewRoundId: source.estimateReviewRoundId, designPlanVersion: source.designPlanVersion,
    sourcePhase: source.phase, sourceSnapshotId: source.sourceSnapshotId, sourceDigest: source.sourceDigest };
}
function storedSource(row: PMRow): PMApprovedSourceRef {
  return { estimateId: row.estimateId, estimateVersion: row.estimateVersion,
    estimateReviewRoundId: row.estimateReviewRoundId, designPlanVersion: row.designPlanVersion,
    phase: row.sourcePhase, sourceSnapshotId: row.sourceSnapshotId ?? null, sourceDigest: row.sourceDigest ?? null };
}
const resultOf = (row: PMRow): PMVendorSuggestionCommandResult => ({ id: String(row._id), version: row.version, status: row.status });
function duplicate(row?: PMRow): never {
  throw new ApiError(409, "VENDOR_SUGGESTION_DUPLICATE", "This vendor is already suggested for this Main Line. Review the existing suggestion.",
    row ? { suggestionId: String(row._id), suggestedBy: String(row.createdByName), suggestedById: String(row.createdById) } : undefined);
}
function sourceConflict(): never { throw new ApiError(409, "VENDOR_SUGGESTION_SOURCE_CONFLICT", "The approved Main Line scope changed. Refresh and review it before saving."); }
function versionConflict(): never { throw new ApiError(409, "VENDOR_SUGGESTION_VERSION_CONFLICT", "This suggestion changed. Refresh and review it before saving."); }

/** One command receipt and one semantic audit share the suggestion transaction; no notification recipients. */
async function receipt(deps: PMDependencies, actor: PublicUser, row: PMRow, key: string, payload: unknown,
  action: string, at: Date, session: ClientSession, previous?: PMRow, changed = true) {
  const result = resultOf(row);
  await ProjectManagerEventModel.create([{ _id: pmNewId("event"), projectId: row.projectId, entityId: String(row._id),
    family: "vendor_suggestion", actorId: actor.id, actorName: actor.name, idempotencyKey: key,
    digest: pmDigest(payload), action, version: row.version, occurredAt: at, result, recipientIds: [] }], { session });
  if (changed) {
    const auditValue = (value: PMRow) => ({ projectId: value.projectId, ...sourceFields(storedSource(value)),
      scope: "main_line", mainLineId: value.mainLineId, mainBasketId: value.mainBasketId,
      scopeOccurrences: value.scopeOccurrences, scopeDigest: value.scopeDigest, vendorId: value.vendorId,
      note: value.note, status: value.status, version: value.version, createdById: value.createdById });
    await deps.audit.appendInMongoTransaction({ actorId: actor.id, action: previous ? "project_vendor_suggestion_updated" : "project_vendor_suggestion_created", entityType: "project_vendor_suggestion",
      entityId: String(row._id), occurredAt: at.toISOString(), ...(previous ? { oldValues: auditValue(previous) } : {}), newValues: auditValue(row) }, session);
    await appendExecutionChange({ projectId: row.projectId, version: row.version, kind: `pm.vendor_suggestion.${action}`, occurredAt: at }, session);
  }
  return result;
}

export function createPMVendorSuggestionCommandService(deps: PMDependencies): PMVendorSuggestionCommandService {
  const now = deps.now ?? (() => new Date());
  return {
    async create(actor, projectId, input) {
      const fields = validate(pmVendorSuggestionCreateSchema, input);
      const payload = { action: "suggest_vendor", projectId, ...fields };
      for (let attempt = 0; ; attempt++) {
        try {
          return await pmTransaction(async session => {
            await requirePMProject(actor, projectId, session, true);
            const replay = await pmReplay(projectId, actor, fields.idempotencyKey, payload, session);
            if (replay !== undefined) return replay as PMVendorSuggestionCommandResult;
            await assertVendorSuggestionIndexesReady(session);
            const approved = await readPMApprovedSource(projectId, session, { forWrite: true });
            const source = requirePMApprovedSource(approved, fields.expectedSource);
            const scope = await requirePMMainLineScope(approved, fields.mainLineId, session, { forWrite: true });
            const priorKey = await ProjectVendorSuggestionModel.findOne({ createdById: actor.id, idempotencyKey: fields.idempotencyKey }).session(session).lean();
            if (priorKey) throw new ApiError(409, "VENDOR_SUGGESTION_IDEMPOTENCY_CONFLICT", "This request key was already used for another suggestion.");
            const existing = await ProjectVendorSuggestionModel.findOne({ projectId, ...sourceFields(source),
              mainLineId: scope.mainLineId, vendorId: fields.vendorId }).session(session).lean();
            if (existing) duplicate(existing);
            await requireLinkedMainLineVendor(scope.mainLineId, fields.vendorId, session);
            const vendor = await activeVendor(fields.vendorId, session);
            const at = now();
            const [row] = await ProjectVendorSuggestionModel.create([{ _id: pmNewId("vendor-suggestion"), projectId,
              ...sourceFields(source), scope: "main_line", mainLineId: scope.mainLineId,
              mainLineNameSnapshot: scope.mainLineName, mainBasketId: scope.mainBasketId,
              mainBasketNameSnapshot: scope.mainBasketName, scopeOccurrences: scope.occurrences, scopeDigest: scope.scopeDigest,
              vendorId: fields.vendorId, vendorCodeSnapshot: vendor.code, vendorNameSnapshot: vendor.name,
              note: fields.note, status: "suggested", version: 1, idempotencyKey: fields.idempotencyKey,
              requestHash: pmDigest(payload), createdById: actor.id, createdByName: actor.name,
              updatedById: actor.id, updatedByName: actor.name, createdAt: at, updatedAt: at }], { session });
            if (!row) throw new Error("Suggestion was not persisted.");
            return receipt(deps, actor, row.toObject(), fields.idempotencyKey, payload, "project_vendor_suggestion_created", at, session);
          });
        } catch (error) {
          const uniqueConflict = error && typeof error === "object" && "code" in error && error.code === 11000;
          if (!uniqueConflict) throw error;
          if (attempt >= 2) duplicate();
        }
      }
    },
    async update(actor, projectId, suggestionId, input) {
      const fields = validate(pmVendorSuggestionUpdateSchema, input);
      const payload = { action: "update_vendor_suggestion", projectId, suggestionId, ...fields };
      return pmTransaction(async session => {
        await requirePMProject(actor, projectId, session, true);
        const replay = await pmReplay(projectId, actor, fields.idempotencyKey, payload, session);
        if (replay !== undefined) return replay as PMVendorSuggestionCommandResult;
        await assertVendorSuggestionIndexesReady(session);
        const approved = await readPMApprovedSource(projectId, session, { forWrite: true });
        requirePMApprovedSource(approved, fields.expectedSource);
        const row = await ProjectVendorSuggestionModel.findOne({ _id: suggestionId, projectId, scope: "main_line", createdById: actor.id }).session(session).lean();
        if (!row) throw new ApiError(404, "PM_NOT_FOUND", "This suggestion is not available for editing.");
        requirePMApprovedSource(approved, storedSource(row));
        const scope = await requirePMMainLineScope(approved, String(row.mainLineId), session, { forWrite: true });
        if (scope.scopeDigest !== row.scopeDigest) sourceConflict();
        if (row.version !== fields.expectedVersion) versionConflict();
        if (fields.status === "suggested" && row.status === "withdrawn") {
          await requireLinkedMainLineVendor(scope.mainLineId, String(row.vendorId), session);
          await activeVendor(row.vendorId, session);
        }
        const at = now();
        if (row.note === fields.note && row.status === fields.status) {
          return receipt(deps, actor, row, fields.idempotencyKey, payload, "project_vendor_suggestion_unchanged", at, session, undefined, false);
        }
        const updated = await ProjectVendorSuggestionModel.findOneAndUpdate({ _id: suggestionId, projectId,
          createdById: actor.id, scope: "main_line", version: fields.expectedVersion }, {
          $set: { note: fields.note, status: fields.status, updatedById: actor.id, updatedByName: actor.name, updatedAt: at },
          $inc: { version: 1 }
        }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
        if (!updated) versionConflict();
        const action = row.status !== updated.status
          ? updated.status === "withdrawn" ? "project_vendor_suggestion_withdrawn" : "project_vendor_suggestion_reinstated"
          : "project_vendor_suggestion_updated";
        return receipt(deps, actor, updated, fields.idempotencyKey, payload, action, at, session, row);
      });
    }
  };
}

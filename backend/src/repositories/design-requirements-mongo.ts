import type { ClientSession } from "mongoose";
import { approvedEstimateLineItemKey } from "../domain/estimate-line-item.js";
import { designRequirementsDigest, type DesignRequirementsSource, type DesignRequirementsState } from "../domain/design-requirements.js";
import { ProjectModel } from "../models/Project.js";
import { EstimateModel } from "../models/Estimate.js";
import { UserModel } from "../models/User.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { DesignWorkflowStateModel } from "../models/DesignWorkflowState.js";
import { DesignRequirementsStateModel } from "../models/DesignRequirementsState.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AuthorizationCoordinationModel } from "../models/AuthorizationCoordination.js";
import { resolveCurrentMainLineDesignRules } from "../services/estimator-catalogue.service.js";
import { RepositoryConflictError } from "./types.js";
import type { DesignRules } from "../domain/main-line-design-rules.js";
type SourceLine = { id?: string; source?: "legacy" | "configuration"; included: boolean; mainLineId?: string | null; roomId?: string; roomName?: string; quantity?: number; specification?: string; designRules?: DesignRules };

export async function mongoDesignRequirementsSource(projectId: string, session?: ClientSession, lock = false, selectedLineItemKeys?: readonly string[]): Promise<DesignRequirementsSource | null> {
  if (lock && !session?.inTransaction()) throw new Error("Design requirements coordination requires a transaction.");
  if (lock) await AuthorizationCoordinationModel.updateOne({ _id: "authorization" }, { $inc: { revision: 1 }, $set: { updatedAt: new Date() } }, { upsert: true, session });
  const project = lock
    ? await ProjectModel.findOneAndUpdate({ _id: projectId }, { $inc: { estimationFenceEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean()
    : await ProjectModel.findById(projectId).session(session ?? null).lean();
  if (!project) return null;
  const estimates = await EstimateModel.find({ projectId }).limit(2).session(session ?? null).lean();
  if (estimates.length > 1) throw new RepositoryConflictError("The project estimate source is ambiguous.");
  const estimate = estimates[0];
  if (lock && estimate) {
    const result = await EstimateModel.updateOne({ _id: estimate._id, version: estimate.version }, { $inc: { procurementSourceEpoch: 1 } }, { session, timestamps: false });
    if (result.matchedCount !== 1) throw new RepositoryConflictError("The estimate requirements source changed.");
  }
  const tasks = await ProjectWorkflowTaskModel.find({ projectId, kind: "procurement", assigneeRole: "procurement", supersededAt: null }).session(session ?? null).lean();
  if (lock && tasks.length) await ProjectWorkflowTaskModel.updateMany({ _id: { $in: tasks.map(row => row._id) } }, { $inc: { awardApprovalEpoch: 1 } }, { session, timestamps: false });
  const designers: string[] = [...new Set(project.assignedDesignerIds ?? [])].map(String);
  const designTasks = estimate ? await ProjectWorkflowTaskModel.find({ projectId, estimateId: estimate._id, kind: "design_plan_upload" }).session(session ?? null).lean() : [];
  if (lock && designTasks.length) await ProjectWorkflowTaskModel.updateMany({ _id: { $in: designTasks.map(row => row._id) } }, { $inc: { awardApprovalEpoch: 1 } }, { session, timestamps: false });
  const designSourceIds = [...new Set<string>([estimate?.designPlanDesignerId, ...designTasks.map(row => row.assigneeUserId)].filter(Boolean).map(String))];
  const poCandidate = designSourceIds.length === 1 ? designSourceIds[0]! : designers.length === 1 ? designers[0]! : null;
  const poAssignmentConsistent = designSourceIds.length <= 1 && designTasks.length <= 1 &&
    designTasks.every(row => row.assigneeRole === "designer" && row.assigneeUserId) && poCandidate !== null && designers.includes(poCandidate);
  const procurements = [...new Set(tasks.flatMap(row => row.assigneeUserId ? [String(row.assigneeUserId)] : []))];
  const users = await UserModel.find({ _id: { $in: [...designers, ...procurements, ...(project.clientId ? [String(project.clientId)] : [])] }, active: true }).select({ _id: 1, role: 1 }).session(session ?? null).lean();
  const activeIds = (ids: string[], role: string) => ids.filter(id => users.some(user => String(user._id) === id && user.role === role)).sort();
  const payment = await DesignWorkflowStateModel.findById(projectId).select("+history").session(session ?? null).lean();
  const source: DesignRequirementsSource = { projectId, estimateId: estimate ? String(estimate._id) : null,
    estimateVersion: estimate ? Number(estimate.version) : null, clientId: activeIds(project.clientId ? [String(project.clientId)] : [], "client")[0] ?? null,
    designerIds: activeIds(designers, "designer"), procurementIds: activeIds(procurements, "procurement"),
    poDesignerId: poAssignmentConsistent && activeIds(designers, "designer").includes(poCandidate!) ? poCandidate : null,
    initialPaymentAt: payment?.initialPaymentAt ?? (payment?.history as Array<{ action: string; at: string }> | undefined)?.find(event => event.action === "confirm_initial_payment")?.at ?? null, lines: [], issues: [] };
  if (!estimate) return source;
  const selected = selectedLineItemKeys ? new Set(selectedLineItemKeys) : null;
  const included = ((estimate.lineItems ?? []) as SourceLine[]).flatMap((line, index) => {
    const key = approvedEstimateLineItemKey({ id: line.id, estimateId: String(estimate._id), estimateVersion: Number(estimate.version), index });
    if (line.included && (!selected || selected.has(key)) && line.source === "configuration" && !line.mainLineId)
      source.issues.push(`Estimate item ${key} is missing its configured Main Line identity.`);
    return line.included && line.mainLineId && (!selected || selected.has(key)) ? [{ line, index }] : [];
  });
  const includedKeys = included.map(({ line, index }) => approvedEstimateLineItemKey({ id: line.id, estimateId: String(estimate._id), estimateVersion: Number(estimate.version), index }));
  if (new Set(includedKeys).size !== includedKeys.length) source.issues.push("The estimate contains duplicate Design requirement line identities. Reconcile the estimate before continuing.");
  const mainLineIds = [...new Set(included.map(({ line }) => String(line.mainLineId)))];
  if (lock && mainLineIds.length) await AiEstimatorKnowledgeMainLineModel.updateMany({ _id: { $in: mainLineIds } }, { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
  const catalogue = await resolveCurrentMainLineDesignRules(mainLineIds, session);
  for (const { line, index } of included) {
    const current = catalogue.get(String(line.mainLineId));
    if (!current) {
      // Only actual historical imports can lack Configuration. A configured line can never silently lose its rules.
      const recorded = await DesignRequirementsStateModel.exists({ _id: projectId, history: { $elemMatch: { lineItemId: String(line.id), mainLineId: String(line.mainLineId) } } }).session(session ?? null);
      if (line.source === "configuration" || recorded || line.designRules && Object.values(line.designRules.answers ?? {}).some(Boolean)) source.issues.push(`Current Configuration for estimate item ${String(line.id ?? index)} is unavailable. Reconcile the Main Line before submission.`);
      continue;
    }
    const lineItemId = approvedEstimateLineItemKey({ id: line.id, estimateId: String(estimate._id), estimateVersion: Number(estimate.version), index });
    source.lines.push({ lineItemId, mainLineId: current.mainLineId, lineName: current.name,
      designRules: current.designRules,
      sourceDigest: designRequirementsDigest([String(estimate._id), lineItemId, current.mainLineId,
        current.revisionId, current.revisionVersion, current.designRulesDigest,
        line.roomId, line.roomName, line.quantity, line.specification]) });
  }
  if (selected) {
    const presentKeys = new Set(((estimate.lineItems ?? []) as SourceLine[]).flatMap((line, index) => line.included ? [approvedEstimateLineItemKey({ id: line.id, estimateId: String(estimate._id), estimateVersion: Number(estimate.version), index })] : []));
    for (const key of selected) if (!presentKeys.has(key)) {
      const recorded = await DesignRequirementsStateModel.exists({ _id: projectId, "history.lineItemId": key }).session(session ?? null);
      if (recorded) source.issues.push(`The selected estimate item ${key} is no longer present in the current Design requirements source.`);
    }
  }
  source.lines.sort((a, b) => a.lineItemId.localeCompare(b.lineItemId));
  return source;
}

export async function mongoDesignRequirementsState(projectId: string, session?: ClientSession, lock = false): Promise<DesignRequirementsState | null> {
  if (lock && !session?.inTransaction()) throw new Error("Design requirements coordination requires a transaction.");
  const row = lock
    ? await DesignRequirementsStateModel.findOneAndUpdate({ _id: projectId }, {
      $inc: { dependencyEpoch: 1 }, $setOnInsert: { projectId, version: 0, history: [] }
    }, { upsert: true, session, returnDocument: "after" }).select("+history").lean()
    : await DesignRequirementsStateModel.findById(projectId).select("+history").session(session ?? null).lean();
  return row ? { projectId, version: row.version, history: row.history as DesignRequirementsState["history"] } : null;
}

export async function mongoSaveDesignRequirementsState(projectId: string, expectedVersion: number, next: DesignRequirementsState, session?: ClientSession) {
  if (!session?.inTransaction()) throw new Error("Design requirements writes require a transaction.");
  const current = await mongoDesignRequirementsState(projectId, session, true);
  if (!current || current.version !== expectedVersion || next.history.length !== current.history.length + 1 ||
    JSON.stringify(next.history.slice(0, -1)) !== JSON.stringify(current.history)) throw new RepositoryConflictError("Design requirements history or version changed.");
  const saved = { projectId, version: expectedVersion + 1, history: next.history };
  const result = await DesignRequirementsStateModel.updateOne({ _id: projectId, version: expectedVersion }, {
    $inc: { version: 1 }, $push: { history: next.history.at(-1)! }
  }, { session, runValidators: true });
  if (result.matchedCount !== 1) throw new RepositoryConflictError("Design requirements changed.");
  return saved;
}

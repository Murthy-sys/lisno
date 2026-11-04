import type { ClientSession, Model } from "mongoose";
import type { Role } from "../domain/roles.js";
import { responsibilityCategories, responsibilityPageOrder } from "../domain/user-responsibilities.js";
import type { UserResponsibilityCategory, UserResponsibilityQuery, UserResponsibilityRow } from "../contracts/user-responsibilities.js";
import type { SeedData, UserResponsibilityCounts } from "./types.js";
import { LeadModel } from "../models/Lead.js";
import { EstimateModel } from "../models/Estimate.js";
import { ProjectModel } from "../models/Project.js";
import { TaskModel } from "../models/Task.js";
import { UserModel } from "../models/User.js";
import { ProjectAccessGrantModel } from "../models/ProjectAccessGrant.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { DesignStageModel } from "../models/DesignStage.js";

type PageQuery = UserResponsibilityQuery & { currentRole: Role };
type Source = { id: string; projectId?: string | null; leadId?: string | null; stageId?: string; projectName?: string; name?: string; title?: string; status?: string; stage?: string; fixtureReference?: boolean };
const labels: Record<UserResponsibilityCategory, string> = {
  ownedActiveLeads: "Sales lead owner", ownedActiveEstimates: "Estimate owner",
  initiatedActiveProjects: "Initiating Designer", assignedActiveProjects: "Assigned Designer",
  managedActiveProjects: "Design Manager", ownedActiveTasks: "Design task",
  directReports: "Direct report", linkedClientProjects: "Linked Client",
  adminInitiatorGrants: "Sales Manager project access", assignedExecutionProjects: "Execution project assignment",
  assignedWorkflowTasks: "Workflow task"
};
const sourceTypes: Record<UserResponsibilityCategory, UserResponsibilityRow["sourceType"]> = {
  ownedActiveLeads: "lead", ownedActiveEstimates: "estimate", initiatedActiveProjects: "project",
  assignedActiveProjects: "project", managedActiveProjects: "project", ownedActiveTasks: "task",
  directReports: "user", linkedClientProjects: "project", adminInitiatorGrants: "project_access_grant",
  assignedExecutionProjects: "project", assignedWorkflowTasks: "workflow_task"
};
const compareIds = (a: Source, b: Source) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const displayStatus = (value: string) => value.replaceAll("_", " ").replace(/^./, character => character.toUpperCase());

function row(category: UserResponsibilityCategory, source: Source, blocksRoleChange: boolean, leads: Map<string, Source>, stages: Map<string, Source>): UserResponsibilityRow {
  const sourceType = sourceTypes[category];
  let projectId = sourceType === "project" ? source.id : source.projectId ?? null;
  let contextState: UserResponsibilityRow["contextState"] = sourceType === "user" ? "not_applicable" : projectId ? "unavailable" : "unlinked";
  if (sourceType === "estimate") {
    const lead = source.leadId ? leads.get(source.leadId) : undefined;
    if (source.leadId && !lead || (projectId && lead?.projectId && projectId !== lead.projectId)) {
      projectId = null;
      contextState = "unavailable";
    } else {
      projectId ??= lead?.projectId ?? null;
      contextState = projectId ? "unavailable" : source.leadId ? "unlinked" : "unavailable";
    }
  }
  if (source.fixtureReference) { projectId = null; contextState = "unavailable"; }
  const stage = source.stageId ? stages.get(source.stageId) : undefined;
  return {
    id: `${category}:${source.id}`, category, sourceType, sourceId: source.id,
    label: source.title || (sourceType === "lead" && source.projectName ? `${labels[category]} · ${source.projectName}` : labels[category]),
    workStatus: source.status ?? (sourceType === "lead" ? source.stage ?? null : null),
    workStage: sourceType === "lead" && source.stage ? { key: source.stage, label: displayStatus(source.stage) }
      : stage && stage.projectId === projectId && stage.name ? { key: stage.id, label: stage.name } : null,
    projectId, project: null, contextState,
    relatedUser: sourceType === "user" ? { id: source.id, name: source.name ?? source.id } : null,
    blocksRoleChange
  };
}

function memorySources(state: SeedData, userId: string): Record<UserResponsibilityCategory, Source[]> {
  return {
    ownedActiveLeads: state.leads.filter(x => x.ownerId === userId && x.stage !== "won" && x.stage !== "lost"),
    ownedActiveEstimates: state.estimateResponsibilities.filter(x => x.ownerId === userId && x.status !== "client_approved").map(x => {
      const summary = state.estimateSummaries?.find(summary => summary.id === x.id);
      return { ...x, projectId: x.projectId === undefined ? summary?.projectId : x.projectId, leadId: x.leadId === undefined ? summary?.leadId : x.leadId };
    }),
    initiatedActiveProjects: state.projects.filter(x => x.initiatingDesignerId === userId && x.status !== "completed"),
    assignedActiveProjects: state.projects.filter(x => x.assignedDesignerIds.includes(userId) && x.status !== "completed"),
    managedActiveProjects: state.projects.filter(x => x.managerId === userId && x.status !== "completed"),
    ownedActiveTasks: state.tasks.filter(x => x.ownerId === userId && x.status !== "completed"),
    directReports: state.users.filter(x => x.managerId === userId),
    linkedClientProjects: state.projects.filter(x => x.clientId === userId),
    adminInitiatorGrants: state.projectAccessGrants.filter(x => x.userId === userId && x.module === "projects" && x.source === "admin_initiator" && x.active),
    assignedExecutionProjects: state.projects.filter(x => x.programManagerId === userId && x.status !== "completed"),
    assignedWorkflowTasks: (state.projectWorkflowAssignments ?? []).map((x, index) => ({ ...x, id: x.id ?? `unresolved-fixture-${index}`, fixtureReference: !x.id }))
      .filter(x => x.assigneeUserId === userId && !x.supersededAt && x.status !== "completed")
  };
}

export function memoryUserResponsibilityCounts(state: SeedData, userId: string): UserResponsibilityCounts {
  const sources = memorySources(state, userId);
  return Object.fromEntries(responsibilityCategories.map(category => [category, sources[category].length])) as unknown as UserResponsibilityCounts;
}

export function memoryUserResponsibilities(state: SeedData, userId: string, query: PageQuery) {
  const sources = memorySources(state, userId);
  const counts = Object.fromEntries(responsibilityCategories.map(category => [category, sources[category].length])) as unknown as UserResponsibilityCounts;
  const { blocks, categories } = responsibilityPageOrder(query.currentRole, query.destinationRole);
  const all = categories.flatMap(category => [...sources[category]].sort(compareIds).map(source => ({ category, source })));
  const leads = new Map(state.leads.map(lead => [lead.id, lead]));
  const stages = new Map(state.stages.map(stage => [stage.id, stage]));
  return {
    items: all.slice(query.offset, query.offset + query.limit).map(({ category, source }) => row(category, source, blocks(category), leads, stages)),
    counts, total: all.length, blockingCount: categories.reduce((sum, category) => sum + (blocks(category) ? counts[category] : 0), 0)
  };
}

function mongoSources(userId: string): Record<UserResponsibilityCategory, { model: Model<any>; filter: Record<string, unknown> }> {
  return {
    ownedActiveLeads: { model: LeadModel, filter: { ownerId: userId, stage: { $nin: ["won", "lost"] } } },
    ownedActiveEstimates: { model: EstimateModel, filter: { ownerId: userId, status: { $ne: "client_approved" } } },
    initiatedActiveProjects: { model: ProjectModel, filter: { initiatingDesignerId: userId, status: { $ne: "completed" } } },
    assignedActiveProjects: { model: ProjectModel, filter: { assignedDesignerIds: userId, status: { $ne: "completed" } } },
    managedActiveProjects: { model: ProjectModel, filter: { managerId: userId, status: { $ne: "completed" } } },
    ownedActiveTasks: { model: TaskModel, filter: { ownerId: userId, status: { $ne: "completed" } } },
    directReports: { model: UserModel, filter: { managerId: userId } },
    linkedClientProjects: { model: ProjectModel, filter: { clientId: userId } },
    adminInitiatorGrants: { model: ProjectAccessGrantModel, filter: { userId, module: "projects", source: "admin_initiator", active: true } },
    assignedExecutionProjects: { model: ProjectModel, filter: { programManagerId: userId, status: { $ne: "completed" } } },
    assignedWorkflowTasks: { model: ProjectWorkflowTaskModel, filter: { assigneeUserId: userId, supersededAt: null, status: { $ne: "completed" } } }
  };
}

export async function mongoUserResponsibilityCounts(userId: string, session?: ClientSession): Promise<UserResponsibilityCounts> {
  const sources = mongoSources(userId);
  const counts = {} as UserResponsibilityCounts;
  // Sequential reads also work inside an existing Mongo transaction.
  for (const category of responsibilityCategories) {
    const { model, filter } = sources[category];
    counts[category] = await model.countDocuments(filter).session(session ?? null).exec();
  }
  return counts;
}

export async function mongoUserResponsibilities(userId: string, query: PageQuery, session?: ClientSession) {
  const counts = await mongoUserResponsibilityCounts(userId, session);
  const sources = mongoSources(userId);
  const { blocks, categories } = responsibilityPageOrder(query.currentRole, query.destinationRole);
  const selected: Array<{ category: UserResponsibilityCategory; source: Source }> = [];
  let skip = query.offset;
  let remaining = query.limit;
  for (const category of categories) {
    if (skip >= counts[category]) { skip -= counts[category]; continue; }
    if (!remaining) break;
    const { model, filter } = sources[category];
    const documents = await model.find(filter).select("_id projectId leadId stageId projectName name title status stage").sort({ _id: 1 }).collation({ locale: "simple" })
      .skip(skip).limit(remaining).session(session ?? null).lean().exec();
    selected.push(...documents.map(document => ({ category, source: { ...document, id: String(document._id) } as Source })));
    remaining -= documents.length;
    skip = 0;
  }
  const leadIds = [...new Set(selected.filter(x => x.category === "ownedActiveEstimates").map(x => x.source.leadId).filter((id): id is string => Boolean(id)))];
  const stageIds = [...new Set(selected.filter(x => x.category === "ownedActiveTasks").map(x => x.source.stageId).filter((id): id is string => Boolean(id)))];
  const leads = leadIds.length ? await LeadModel.find({ _id: { $in: leadIds } }).select("_id projectId").session(session ?? null).lean().exec() : [];
  const stages = stageIds.length ? await DesignStageModel.find({ _id: { $in: stageIds } }).select("_id projectId name").session(session ?? null).lean().exec() : [];
  const leadMap = new Map(leads.map(x => [String(x._id), { id: String(x._id), projectId: x.projectId }]));
  const stageMap = new Map(stages.map(x => [String(x._id), { id: String(x._id), projectId: x.projectId, name: x.name }]));
  return {
    items: selected.map(({ category, source }) => row(category, source, blocks(category), leadMap, stageMap)), counts,
    total: categories.reduce((sum, category) => sum + counts[category], 0),
    blockingCount: categories.reduce((sum, category) => sum + (blocks(category) ? counts[category] : 0), 0)
  };
}

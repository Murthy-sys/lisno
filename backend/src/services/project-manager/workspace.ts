import { projectManagerProjectIds } from "../project-manager-assignment.service.js";
import { requireExecutionActor } from "../vendor-execution-access.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import { z } from "zod";
import { ProjectModel } from "../../models/Project.js";
import { UserModel } from "../../models/User.js";
import { ProjectManagerEventModel } from "../../models/ProjectManagerEvent.js";
import type { PMAlert, PMPanel, PMPortfolio, PMProject, PMTab, PMItem, PMOverview, PMPerformance, PMLeaderboard, PMBonus } from "../../contracts/project-manager.js";
import { approvedExecutionProgress, pmHealth } from "../../domain/project-manager/progress.js";
import { ApiError } from "../../middleware/errors.js";
import type { PublicUser } from "../auth.service.js";
import { pmMissing, pmPanel, pmTransaction, requirePMProject, type PMDependencies, type PMRow } from "./common.js";
import { readPMSources } from "./sources.js";
export const pmPortfolioQuerySchema = z.object({ q: z.string().trim().max(160).optional(), status: z.enum(["current", "all", "planning", "active", "on_hold", "completed"]).default("current"), health: z.enum(["all", "critical", "at_risk", "incomplete", "setup", "on_track", "completed"]).default("all"), offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
type Query = z.input<typeof pmPortfolioQuerySchema>;
type Reader = (actor: PublicUser, id: string, query?: { limit?: number; offset?: number }) => Promise<PMPanel>;
export function createProjectManagerWorkspace(deps: PMDependencies & { panels: Partial<Record<PMTab, Reader>> }) {
  const now = deps.now ?? (() => new Date());
  async function actorAccess(actor: PublicUser) { if (actor.role !== "site_manager" || !await UserModel.exists({ _id: actor.id, active: true, role: "site_manager" })) pmMissing(); }
  async function snapshot(actor: PublicUser, projectId: string) { return pmTransaction(async session => { const project = await requirePMProject(actor, projectId, session); return { project, ...await readPMSources(actor, project, session, now()) }; }); }
  async function projectSummary(actor: PublicUser, projectId: string): Promise<{ project: PMProject; alerts: PMAlert[]; source: Awaited<ReturnType<typeof snapshot>> }> {
    const source = await snapshot(actor, projectId); const project = source.project;
    const alerts: PMAlert[] = [];
    for (const work of source.work) for (const flag of work.flags) {
      if (["setup_required", "schedule_required", "source_unavailable"].includes(flag)) continue;
      const critical = ["original_deadline_overdue", "overdue", "verification_overdue"].includes(flag);
      alerts.push({ id: `execution:${work.id}:${flag}`, projectId, projectName: project.name, tab: "site", entityId: work.id, title: `${work.itemName}: ${flag.replaceAll("_", " ")}`, detail: `${work.roomName} · ${work.vendorName}`, severity: critical ? "critical" : "warning", dueAt: work.schedule?.finishDate ?? work.originalTargetDate });
    }
    const panelTabs: PMTab[] = ["procurement", "selections", "supply", "vendors", "client", "snagging", "quality"];
    const panels = await Promise.all(panelTabs.map(async tab => {
      const reader = deps.panels[tab]; if (!reader) return undefined;
      const panel = await reader(actor, projectId, { limit: 100, offset: 0 });
      while (panel.items.length < panel.total) {
        const next = await reader(actor, projectId, { limit: 100, offset: panel.items.length });
        if (!next.items.length) { panel.issues.push("Project records changed while loading. Refresh to reconcile the complete alert list."); panel.availability = "source_unavailable"; break; }
        const ids = new Set(panel.items.map(item => item.id));
        if (next.items.every(item => ids.has(item.id))) { panel.issues.push("Additional records need reconciliation before health can be determined."); panel.availability = "source_unavailable"; break; }
        panel.items.push(...next.items.filter(item => !ids.has(item.id)));
        panel.total = next.total;
      }
      return panel;
    }));
    const healthIssues: string[] = [];
    panels.forEach((panel, index) => {
      if (!panel) return;
      if (panel.availability === "source_unavailable") healthIssues.push(...panel.issues);
      for (const {item, offset} of panel.items.flatMap((item,index) => [item, ...(item.children ?? [])].map(row => ({item:row,offset:Math.floor(index/25)*25})))) {
        if (!["critical", "warning"].includes(item.severity) || ["resolved", "verified", "fulfilled", "rejected", "completed", "signed", "done"].includes(item.status)) continue;
        alerts.push({ id: `${panelTabs[index]}:${item.id}`, projectId, projectName: project.name, tab: panelTabs[index]!, entityId: item.id, offset, title: item.title, detail: item.description ?? item.status.replaceAll("_", " "), severity: item.severity, dueAt: item.dueAt ?? null });
      }
    });
    const progress = source.progress;
    const health = pmHealth({ status: project.status, critical: alerts.some(a => a.severity === "critical"), warning: alerts.some(a => a.severity === "warning"), progress: healthIssues.length ? { ...progress, actual: null } : progress,
      started: source.work.some(w => w.progress > 0 || ["in_progress", "blocked", "awaiting_verification", "site_verified", "awaiting_client", "client_approved"].includes(w.status)), setup: !source.work.length || source.work.some(w => ["setup_required", "schedule_required"].some(flag => w.flags.includes(flag)) || ["assigned", "awaiting_schedule", "not_started"].includes(w.status)) });
    return { source, project: { id: projectId, name: String(project.name), clientName: String(project.clientName ?? ""), location: String(project.location ?? ""), status: project.status, health, progress,
      plannedEndAt: project.plannedEndAt ? new Date(project.plannedEndAt).toISOString() : null, approvedNetPaise: source.source?.subtotalPaise ?? null, issues: [...new Set([...progress.issues, ...healthIssues])], activeAlerts: alerts.length }, alerts };
  }
  async function portfolio(actor: PublicUser, query: Query = {}): Promise<PMPortfolio> {
    await actorAccess(actor); const q = pmPortfolioQuerySchema.parse(query);
    const filter: PMRow = { _id: { $in: await projectManagerProjectIds(actor.id) } };
    if (q.status === "current") filter.status = { $ne: "completed" }; else if (q.status !== "all") filter.status = q.status;
    const rows = await ProjectModel.find(filter).select({ _id: 1, name: 1, clientName: 1, location: 1 }).sort({ name: 1, _id: 1 }).lean();
    const matching = rows.filter(row => !q.q || [row.name, row.clientName, row.location].join(" ").toLocaleLowerCase().includes(q.q.toLocaleLowerCase()));
    const results: Awaited<ReturnType<typeof projectSummary>>[] = [];
    // Bound expensive projections without truncating the summary denominator.
    for (let offset = 0; offset < matching.length; offset += 4) results.push(...await Promise.all(matching.slice(offset, offset + 4).map(row => projectSummary(actor, String(row._id)))));
    const items = results.map(row => row.project);
    const counts = { active: items.filter(p => p.status !== "completed").length, atRisk: items.filter(p => ["critical", "at_risk"].includes(p.health)).length, critical: items.filter(p => p.health === "critical").length, setup: items.filter(p => p.health === "setup").length, onTrack: items.filter(p => p.health === "on_track").length, incomplete: items.filter(p => p.health === "incomplete").length };
    const filtered = results.filter(({ project: p }) => q.health === "all" || q.health === "at_risk" && p.health === "critical" || p.health === q.health);
    const alerts = filtered.flatMap(row => row.alerts).sort((a,b) => Number(b.severity === "critical") - Number(a.severity === "critical") || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || a.projectId.localeCompare(b.projectId) || a.id.localeCompare(b.id));
    await actorAccess(actor);
    return { items: filtered.slice(q.offset, q.offset + q.limit).map(row => row.project), total: filtered.length, counts, alerts: alerts.slice(0, 8), alertTotal: alerts.length, calculatedAt: now().toISOString() };
  }
  return {
    portfolio,
    async alerts(actor: PublicUser, query: Query = {}) { const q = pmPortfolioQuerySchema.parse(query); await actorAccess(actor); const rows = await ProjectModel.find({ _id: { $in: await projectManagerProjectIds(actor.id) } }).select({ _id: 1, status: 1, name: 1, clientName: 1, location: 1 }).sort({ _id: 1 }).lean(); const all: PMAlert[] = [];
      for (const row of rows) { if (q.status === "current" && row.status === "completed" || !["all", "current"].includes(q.status) && row.status !== q.status || q.q && ![row.name,row.clientName,row.location].join(" ").toLowerCase().includes(q.q.toLowerCase())) continue; const summary = await projectSummary(actor, String(row._id)); if (q.health === "all" || summary.project.health === q.health || q.health === "at_risk" && summary.project.health === "critical") all.push(...summary.alerts); }
      all.sort((a,b) => Number(b.severity === "critical") - Number(a.severity === "critical") || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || a.projectId.localeCompare(b.projectId) || a.id.localeCompare(b.id)); return { items: all.slice(q.offset,q.offset+q.limit), total: all.length }; },
    async overview(actor: PublicUser, id: string): Promise<PMOverview> { const result = await projectSummary(actor,id); return { project: result.project, capabilities: ["project_messages", "execution_detail"], calculatedAt: now().toISOString() }; },
    async site(actor: PublicUser, id: string): Promise<PMPanel> {
      const data = await snapshot(actor,id); const panel = pmPanel("site",now()); panel.availability = data.progress.availability; panel.issues = data.progress.issues;
      const rooms = new Map<string, PMItem>();
      for (const line of data.source?.allLineItems ?? []) {
        const scope = data.lines.find(row => row.id === line.key);
        if (!line.included || scope?.scope === "supply" || scope?.exception === "not_applicable") continue;
        const roomId = line.roomId ?? `unresolved:${line.key}`;
        if (!rooms.has(roomId)) rooms.set(roomId, { id: roomId, kind: "room", title: line.roomName, status: "execution", severity: "neutral", version: 0, sourceToken: null, roomId, facts: [], actions: [], children: [] });
      }
      for (const w of data.work) {
        const line = data.source?.allLineItems.find(line => line.key === w.sourceLineItemKey); const roomId = line?.roomId ?? `unresolved:${w.id}`;
        const room = rooms.get(roomId) ?? { id: roomId, kind: "room", title: line?.roomName ?? w.roomName, status: "execution", severity: "neutral" as const, version: 0, sourceToken: null, roomId, facts: [], actions: [], children: [] };
        const severity = w.flags.some(f => ["overdue", "verification_overdue", "original_deadline_overdue"].includes(f)) ? "critical" : w.flags.some(f => ["blocked", "missing_update", "hold_review_due"].includes(f)) ? "warning" : w.status === "client_approved" ? "success" : "neutral";
        room.children!.push({ id: w.id, assignmentId: w.id, kind: "execution", title: w.itemName, status: w.status, severity, version: w.version, sourceToken: null, roomId, vendorId: w.vendorId, ownerName: w.vendorName, progress: w.tracking === "tracked" && w.sourceAvailable && Number.isFinite(w.progress) ? w.progress : null,
          description: w.flags.map(f => f.replaceAll("_", " ")).join(" · "), facts: [{ label: "Vendor", value: w.vendorName }, { label: "Site verified", value: w.verification ? "Verified" : "Pending" }, { label: "Client acceptance", value: w.legacyStatus === "client_approved" ? "Accepted" : "Pending" }], actions: [], href: `/projects/${encodeURIComponent(id)}/execution?tab=site&detail=1&assignment=${encodeURIComponent(w.id)}` });
        rooms.set(roomId,room);
      }
      for (const room of rooms.values()) {
        const keys = new Set((data.source?.allLineItems ?? []).filter(line => (line.roomId ?? `unresolved:${line.key}`) === room.id).map(line => line.key));
        const progress = approvedExecutionProgress(data.lines.filter(line => keys.has(line.id)), data.progress.sourceRevision, data.localDate);
        room.progress = progress.actual;
        room.description = progress.issues.length ? progress.issues[0] : null;
      }
      panel.items = [...rooms.values()]; panel.total = panel.items.length; return panel;
    },
    async performance(actor: PublicUser): Promise<PMPerformance> { const data = await portfolio(actor); return { availability: "not_configured", policy: null, message: "A Project Manager KPI policy has not been configured. Operational evidence is available below; no composite score is calculated.", calculatedAt: now().toISOString(), metrics: [{label:"Active projects",value:String(data.counts.active)},{label:"At risk",value:String(data.counts.atRisk)},{label:"On track",value:String(data.counts.onTrack)},{label:"Incomplete source",value:String(data.counts.incomplete)}] }; },
    async leaderboard(actor: PublicUser): Promise<PMLeaderboard> { await actorAccess(actor); return { availability: "not_configured", period: now().toISOString().slice(0,7), policy: null, message: "Project Managers are unranked until a comparable KPI policy and reporting period are configured.", items: [] }; },
    async bonus(actor: PublicUser): Promise<PMBonus> { await actorAccess(actor); return { availability: "not_configured", policy: null, message: "Your bonus policy is not configured. No estimated earnings, penalties or payment statements have been generated.", statements: [] }; },
    async notifications(actor: PublicUser, query: { limit?: number; offset?: number } = {}) {
      const limit = Math.min(100, Math.max(1, query.limit ?? 50)); const offset = Math.max(0, query.offset ?? 0);
      const projectIds = await ProjectManagerEventModel.distinct("projectId", { recipientIds: actor.id });
      const authorized: string[] = [];
      for (const projectId of projectIds) {
        try { await requirePMProject(actor, String(projectId), undefined, false, ["site_manager","designer","procurement","finance_head","vendor","client","design_manager","design_head"]); }
        catch(error) { if (error instanceof ApiError && error.status === 404) continue; throw error; }
        if (actor.role === "vendor") { await requireExecutionActor(actor); if (!await ProjectPurchaseOrderModel.exists({ projectId, vendorId: actor.vendorId, approvedRevisionId: { $ne: null }, cancelledAt: null })) continue; }
        authorized.push(String(projectId));
      }
      const filter = { recipientIds: actor.id, projectId: { $in: authorized } };
      const [rows,total,unreadTotal] = await Promise.all([
        ProjectManagerEventModel.find(filter).sort({occurredAt:-1,_id:1}).skip(offset).limit(limit).lean(),
        ProjectManagerEventModel.countDocuments(filter), ProjectManagerEventModel.countDocuments({...filter,readBy:{$ne:actor.id}})
      ]);
      const items = rows.map(row=>({id:String(row._id),projectId:row.projectId,entityId:typeof row.result?.id === "string" ? row.result.id : row.entityId,family:row.family,action:row.action,description:["design_manager","design_head"].includes(actor.role)?row.reason??null:null,title:row.result?.title??row.action.replaceAll("_"," "),at:new Date(row.occurredAt).toISOString(),read:row.readBy.includes(actor.id)}));
      return { items,total,unreadTotal };
    },
    async readNotification(actor: PublicUser,id:string) { return pmTransaction(async session => { const row = await ProjectManagerEventModel.findOne({ _id:id,recipientIds:actor.id }).session(session).lean(); if(!row)pmMissing(); await requirePMProject(actor,row.projectId,session,true,["site_manager","designer","procurement","finance_head","vendor","client","design_manager","design_head"]); if (actor.role === "vendor") { await requireExecutionActor(actor,session); if (!await ProjectPurchaseOrderModel.exists({projectId:row.projectId,vendorId:actor.vendorId,approvedRevisionId:{$ne:null},cancelledAt:null}).session(session)) pmMissing(); } await ProjectManagerEventModel.updateOne({_id:id},{$addToSet:{readBy:actor.id}},{session}); return {read:true}; }); }
  };
}

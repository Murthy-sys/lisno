import type { ProjectHierarchy } from "../../api/types";
import type { ExecutionCounts, ExecutionWork } from "../../features/execution/executionApi";
import { executionFixture, executionPageFixture } from "../../features/execution/executionTestFixtures";
import { chatTestSummary } from "../../features/messages/projectChatFixtures";
import { PM_TABS, type PMAlert, type PMItem, type PMPanel, type PMPortfolio, type PMProgress, type PMProject, type PMTab } from "../../features/project-manager/projectManagerTypes";

const calculatedAt = "2026-10-28T09:00:00.000Z";

function progress(actual: number | null): PMProgress {
  return { basis: "approved_execution_scope_v1", actual, planned: actual === null ? null : 70,
    availability: actual === null ? "source_unavailable" : "available", sourceRevision: actual === null ? null : "synthetic-approved-scope-1",
    issues: actual === null ? ["Approved execution scope needs reconciliation."] : [],
    requiredLines: 8, coveredLines: actual === null ? 0 : 8, zeroValueLines: 0,
    reportedComplete: actual === 100 ? 8 : 2, siteVerified: actual === 100 ? 8 : 1, clientAccepted: actual === 100 ? 8 : 0 };
}

const projects: PMProject[] = [
  { id: "pm-cedar", name: "Cedar residence", clientName: "Cedar household", location: "Hyderabad", status: "active", health: "critical", progress: progress(62.5), plannedEndAt: "2026-11-20T00:00:00.000Z", approvedNetPaise: 125000000, issues: [], activeAlerts: 0 },
  { id: "pm-courtyard", name: "Courtyard apartment", clientName: "Courtyard household", location: "Bengaluru", status: "active", health: "at_risk", progress: progress(34), plannedEndAt: "2026-12-12T00:00:00.000Z", approvedNetPaise: 48750000, issues: [], activeAlerts: 0 },
  { id: "pm-garden", name: "Garden house · living and dining extension", clientName: "Garden household", location: "Whitefield, Bengaluru", status: "on_hold", health: "at_risk", progress: progress(18), plannedEndAt: "2027-01-15T00:00:00.000Z", approvedNetPaise: 63250000, issues: [], activeAlerts: 0 },
  { id: "pm-studio", name: "North studio", clientName: "North studio team", location: "Chennai", status: "planning", health: "setup", progress: progress(0), plannedEndAt: null, approvedNetPaise: 0, issues: [], activeAlerts: 0 },
  { id: "pm-riverside", name: "Riverside duplex", clientName: "Riverside household", location: "Hyderabad", status: "active", health: "on_track", progress: progress(83), plannedEndAt: "2026-11-08T00:00:00.000Z", approvedNetPaise: 98600000, issues: [], activeAlerts: 0 },
  { id: "pm-orchard", name: "Orchard residence", clientName: "Orchard household", location: "Pune", status: "active", health: "on_track", progress: progress(47), plannedEndAt: "2026-12-04T00:00:00.000Z", approvedNetPaise: 71500000, issues: [], activeAlerts: 0 },
  { id: "pm-terrace", name: "Terrace renovation", clientName: "", location: "", status: "planning", health: "incomplete", progress: progress(null), plannedEndAt: null, approvedNetPaise: null, issues: ["Approved execution scope needs reconciliation."], activeAlerts: 0 },
  { id: "pm-lakeside", name: "Lakeside home", clientName: "Lakeside household", location: "Kochi", status: "completed", health: "completed", progress: progress(100), plannedEndAt: "2026-09-30T00:00:00.000Z", approvedNetPaise: 82400000, issues: [], activeAlerts: 0 }
];

function projectAlerts(project: PMProject): PMAlert[] {
  if (!["critical", "at_risk"].includes(project.health)) return [];
  return ["False ceiling: overdue", "Cove in gypsum: access blocked", "False ceiling painting in Royal Emulsion: access blocked"].map((title, index) => ({
    id: `${project.id}-alert-${index + 1}`, projectId: project.id, projectName: project.name, tab: "site", entityId: `${project.id}-work-${index + 1}`,
    title, detail: index === 0 ? "Living & dining · Ceiling works team" : "Living & dining · Finishing works team",
    severity: project.health === "critical" && index === 0 ? "critical" : "warning", dueAt: "2026-10-24T00:00:00.000Z"
  }));
}

function pageBounds(params: URLSearchParams) {
  const number = (key: string, fallback: number) => { const value = Number(params.get(key) ?? fallback); return Number.isSafeInteger(value) && value >= 0 ? value : fallback; };
  return { offset: number("offset", 0), limit: Math.min(50, Math.max(1, number("limit", 20))) };
}

const detailNotes = {
  overview: "The retained design clarification for estimate-line-synthetic-cedar-ceiling-001 includes the agreed ceiling access sequence and approval context. Review the saved project documents before changing the confirmed execution scope.",
  site: "The current site record includes a pending clarification for estimate-line-synthetic-cedar-service-access-002. The source note remains available for review alongside the separately reported execution and verification values.",
  room: "The room includes a retained source note for estimate-line-synthetic-cedar-living-and-dining-003. Confirm the service-access detail against the latest saved drawing before closing the room review.",
  trade: "The approved finish reference is recorded against estimate-line-synthetic-cedar-finish-reference-004. The final paint sample and lighting conditions must be reviewed together before the client acceptance appointment is arranged."
};
const detailProjectIds = ["pm-cedar", "pm-garden", "pm-studio", "pm-terrace"];

function detailProject(project: PMProject): PMProject {
  if (project.id === "pm-cedar") return { ...project, issues: [detailNotes.overview], progress: { ...project.progress, reportedComplete: 3, siteVerified: 3, clientAccepted: 1 } };
  if (project.id === "pm-garden") return { ...project, name: "Garden house · first-floor living, dining and covered terrace extension", clientName: "Garden household and extended family renovation team", issues: [detailNotes.overview],
    progress: { ...progress(62.5), reportedComplete: 3, siteVerified: 3, clientAccepted: 1 } };
  return project;
}

function detailRooms(project: PMProject): PMItem[] {
  if (project.id === "pm-studio") return [];
  if (project.id === "pm-terrace") return [{ id: `${project.id}-living`, kind: "room", title: "Living & dining", status: "execution", severity: "neutral", version: 0, sourceToken: null, progress: null,
    description: "Execution scope is not established for estimate-line-synthetic-terrace-unreconciled-001. Confirm the approved scope before calculating room progress.", facts: [], actions: [], children: [{
      id: `${project.id}-work-1`, assignmentId: `${project.id}-work-1`, kind: "execution", title: "Ceiling scope awaiting reconciliation", status: "assigned", severity: "neutral", version: 0,
      sourceToken: null, ownerName: null, progress: null, facts: [{ label: "Site verified", value: "Pending" }, { label: "Client acceptance", value: "Pending" }], actions: []
    }] }];
  const trade = (index: number, title: string, value: number, roomName: string): PMItem => {
    const verified = [4, 5, 7].includes(index), accepted = index === 4;
    return { id: `${project.id}-work-${index}`, assignmentId: `${project.id}-work-${index}`, kind: "execution", title, roomName,
      status: accepted ? "client_approved" : verified ? "site_verified" : value === 0 ? "not_started" : "in_progress",
      severity: index === 1 ? "critical" : index === 2 ? "warning" : verified ? "success" : "neutral", version: 2, sourceToken: "synthetic-approved-scope-1",
      ownerName: index === 2 ? "Courtyard architectural finishing and specialist installation team" : "Ceiling works team",
      description: index === 1 ? "missing update · overdue" : index === 2 ? "access blocked" : index === 3 ? detailNotes.trade : undefined,
      progress: value, facts: [{ label: "Site verified", value: verified ? "Verified" : "Pending" }, { label: "Client acceptance", value: accepted ? "Accepted" : "Pending" }], actions: [] };
  };
  const room = (id: string, title: string, value: number | null, children: PMItem[], description?: string): PMItem => ({ id: `${project.id}-${id}`, kind: "room", title, status: "execution", severity: "neutral", version: 0,
    sourceToken: "synthetic-approved-scope-1", progress: value, facts: [], actions: [], children, description });
  return [
    room("living", "Living & dining", 65.5, [
      trade(1, "POP false ceiling", 10, "Living & dining"),
      trade(2, "Cove in gypsum with recessed lighting and service access panels", 35, "Living & dining"),
      trade(3, "False ceiling painting in Royal Emulsion", 0, "Living & dining"),
      trade(4, "Curtain pelmet and wall preparation", 100, "Living & dining"),
      trade(5, "Decorative wall panels", 100, "Living & dining")
    ], detailNotes.room),
    room("bedroom", "Primary bedroom, dressing area and attached study", 45, [
      trade(6, "Wardrobe shutters and internal fittings", 75, "Primary bedroom"),
      trade(7, "Bedside electrical points", 100, "Primary bedroom"),
      trade(8, "Study joinery and window seat", 30, "Primary bedroom")
    ]),
    room("utility", "Utility", null, [])
  ];
}

function detailExecution(project: PMProject, rooms: PMItem[]): ExecutionWork[] {
  return rooms.flatMap(room => (room.children ?? []).flatMap((item): ExecutionWork[] => {
    // The execution endpoint requires numeric progress; unreconciled PM rows have no issued execution record.
    if (item.progress == null) return [];
    const verified = item.facts.some(fact => fact.label === "Site verified" && fact.value === "Verified");
    return [{ ...executionFixture, id: item.assignmentId!, projectId: project.id, projectName: project.name, itemName: item.title, roomName: room.title,
      vendorId: `${project.id}-vendor`, vendorName: item.ownerName!, progress: item.progress, status: item.status as ExecutionWork["status"],
      description: item.description ?? "Complete the issued work to the approved project scope.", latestNote: item.description ?? "Latest vendor report recorded.",
      latestVendorReport: null, sourceLineItemKey: `${item.id}-source`, lineId: `${item.id}-line`, orderId: `${project.id}-order`, orderNumber: "PO-SYNTHETIC-CEDAR",
      allowedActions: [], flags: item.id.endsWith("-1") ? ["missing_update", "overdue"] : item.id.endsWith("-2") ? ["blocked"] : [],
      verification: verified ? { id: `${item.id}-verification`, verifiedAt: calculatedAt, verifiedById: "site_manager-1", executionRound: 1 } : null }];
  }));
}

function executionCounts(items: ExecutionWork[]): ExecutionCounts {
  return { total: items.length, open: items.filter(item => !["site_verified", "client_approved"].includes(item.status)).length, reported: 0,
    verified: items.filter(item => item.verification).length, clientAccepted: items.filter(item => item.status === "client_approved").length,
    missing: items.filter(item => item.flags.includes("missing_update")).length, blocked: items.filter(item => item.flags.includes("blocked")).length,
    overdue: items.filter(item => item.flags.includes("overdue")).length, awaitingVerification: 0, setupRequired: 0 };
}

function projectHierarchy(project: PMProject): ProjectHierarchy {
  return { id: project.id, name: project.name, clientId: null, clientName: project.clientName, clientEmail: "", clientMobile: "", clientAddress: "",
    initiatingDesignerId: null, assignedEstimatorId: null, assignedDesignerIds: [], managerId: "site_manager-1", status: project.status as ProjectHierarchy["status"],
    location: project.location, plannedStartAt: "2026-10-01", plannedEndAt: project.plannedEndAt ?? "", actualStartAt: null, actualEndAt: null,
    createdAt: calculatedAt, updatedAt: calculatedAt, ...(project.progress.actual === null ? {} : { progress: project.progress.actual }), floors: [] };
}

/** Local QA records only; enabled explicitly by the enterprise transport. */
export function createEnterpriseProjectManager({ empty = false, paging = false, detail = false }: { empty?: boolean; paging?: boolean; detail?: boolean } = {}) {
  const extra = paging ? Array.from({ length: 24 }, (_, index): PMProject => ({ ...projects[1]!, id: `pm-studio-${index + 1}`, name: `Studio fit-out ${index + 1}`, clientName: `Studio team ${index + 1}`, progress: progress(10 + index * 2), approvedNetPaise: 18500000 + index * 100000 })) : [];
  const records = empty ? [] : [...projects, ...extra].map(project => ({ ...(detail ? detailProject(project) : project), activeAlerts: projectAlerts(project).length }));
  const alerts = records.flatMap(projectAlerts).sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));

  function filtered(params: URLSearchParams) {
    const q = (params.get("q") ?? "").trim().toLowerCase(), status = params.get("status") ?? "current", health = params.get("health") ?? "all";
    const base = records.filter(project => (status === "all" || status === "current" ? status === "all" || project.status !== "completed" : project.status === status) &&
      (!q || [project.name, project.clientName, project.location].join(" ").toLowerCase().includes(q)));
    const items = base.filter(project => health === "all" || project.health === health || health === "at_risk" && project.health === "critical");
    const ids = new Set(items.map(project => project.id));
    return { base, items, alerts: alerts.filter(alert => ids.has(alert.projectId)) };
  }
  function portfolio(params: URLSearchParams): PMPortfolio {
    const { base, items, alerts: matchingAlerts } = filtered(params), { offset, limit } = pageBounds(params);
    return { items: items.slice(offset, offset + limit), total: items.length,
      counts: { active: base.filter(project => project.status !== "completed").length,
        atRisk: base.filter(project => ["critical", "at_risk"].includes(project.health)).length,
        critical: base.filter(project => project.health === "critical").length, setup: base.filter(project => project.health === "setup").length,
        onTrack: base.filter(project => project.health === "on_track").length, incomplete: base.filter(project => project.health === "incomplete").length },
      alerts: matchingAlerts.slice(0, 8), alertTotal: matchingAlerts.length, calculatedAt };
  }
  function panel(project: PMProject, tab: PMTab): PMPanel {
    if (detail && tab === "site" && detailProjectIds.includes(project.id)) {
      const items = detailRooms(project);
      return { tab, availability: project.progress.availability, calculatedAt, items, total: items.length,
        issues: project.id === "pm-studio" ? [] : project.id === "pm-terrace" ? project.issues : [detailNotes.site], sources: [], people: [], actions: [] };
    }
    const projectWork = alerts.filter(alert => alert.projectId === project.id);
    return { tab, availability: project.progress.availability, calculatedAt, total: tab === "site" && projectWork.length ? 1 : 0,
      issues: project.issues, sources: [], people: [], actions: [], items: tab === "site" && projectWork.length ? [{
        id: `${project.id}-living`, kind: "room", title: "Living & dining", status: "execution", severity: "neutral", version: 0,
        sourceToken: "synthetic-approved-scope-1", progress: project.progress.actual, facts: [], actions: [],
        children: projectWork.map(alert => ({ id: alert.entityId!, assignmentId: alert.entityId!, kind: "execution", title: alert.title,
          status: "blocked", severity: alert.severity, version: 1, sourceToken: "synthetic-approved-scope-1", ownerName: "Ceiling works team",
          description: alert.detail, progress: project.progress.actual, facts: [{ label: "Site verified", value: "Pending" }, { label: "Client acceptance", value: "Pending" }], actions: [] }))
      }] : [] };
  }
  return { read(path: string, params: URLSearchParams): unknown {
    if (detail) {
      const projectMatch = path.match(/^\/projects\/([^/]+)(?:\/(execution|status|design-workflow|design-requirements|chat))?$/u);
      if (projectMatch) {
        const project = records.find(record => record.id === decodeURIComponent(projectMatch[1]!));
        if (!project) return Response.json({ error: { code: "PM_NOT_FOUND", message: "Synthetic project is unavailable." } }, { status: 404 });
        if (!projectMatch[2]) return projectHierarchy(project);
        if (projectMatch[2] === "chat") return chatTestSummary({ project: { id: project.id, name: project.name, status: project.status },
          counts: { openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0 }, participantCount: 1, cursor: "synthetic-pm-detail-chat",
          latestMessageSequence: 0, capabilities: { canSend: false, canManageParticipants: false, canManageIssues: false } });
        if (projectMatch[2] === "status") return { projectId: project.id, projectName: project.name, projectStatus: project.status, serverNow: calculatedAt, state: "no_pending", currentStage: null, pendingActions: [], issue: null };
        if (projectMatch[2] === "design-workflow") return { projectId: project.id, projectName: project.name, estimateApprovalStatus: "approved", serverNow: calculatedAt, floors: [] };
        if (projectMatch[2] === "design-requirements") return { version: 0, sourceToken: "synthetic-empty", entries: [], blockers: [], canReadInternal: false };
        if (!detailProjectIds.includes(project.id)) return undefined;
        const all = detailExecution(project, detailRooms(project)), { offset, limit } = pageBounds(params);
        const filtered = all.filter(item => (!params.get("q") || [item.itemName, item.vendorName, item.roomName].join(" ").toLowerCase().includes(params.get("q")!.trim().toLowerCase())) &&
          (!params.get("status") || item.status === params.get("status")) && (!params.get("flag") || item.flags.includes(params.get("flag")!)));
        const result = executionPageFixture(filtered.slice(offset, offset + limit));
        return { ...result, project: { ...result.project!, id: project.id, name: project.name, status: project.status }, counts: executionCounts(filtered), projectCounts: executionCounts(all),
          total: filtered.length, offset, limit, policy: result.policy ? { ...result.policy, projectId: project.id } : null };
      }
      const workMatch = path.match(/^\/execution\/work\/([^/]+)(\/history)?$/u);
      if (workMatch) {
        const work = records.filter(project => detailProjectIds.includes(project.id)).flatMap(project => detailExecution(project, detailRooms(project))).find(item => item.id === decodeURIComponent(workMatch[1]!));
        if (!work) return Response.json({ error: { code: "EXECUTION_NOT_FOUND", message: "Synthetic issued execution work is unavailable." } }, { status: 404 });
        return workMatch[2] ? { items: [], total: 0, limit: 20, offset: 0 } : work;
      }
    }
    if (path === "/project-manager/projects") return portfolio(params);
    if (path === "/project-manager/alerts") { const { alerts: items } = filtered(params), { offset, limit } = pageBounds(params); return { items: items.slice(offset, offset + limit), total: items.length }; }
    if (path === "/project-manager/performance") return { availability: "not_configured", policy: null,
      message: "A Project Manager KPI policy has not been configured. Operational evidence is available below; no composite score is calculated.", calculatedAt,
      metrics: [{ label: "Active projects", value: String(portfolio(new URLSearchParams()).counts.active) }] };
    if (path === "/kpis/users/site_manager-1") return { score: 82, components: [] };
    const match = path.match(/^\/projects\/([^/]+)\/pm\/([^/]+)$/u);
    if (!match) return undefined;
    const project = records.find(record => record.id === decodeURIComponent(match[1]!));
    if (!project) return Response.json({ error: { code: "PM_NOT_FOUND", message: "Synthetic project is unavailable." } }, { status: 404 });
    if (match[2] === "overview") return { project, capabilities: ["project_messages", "execution_detail"], calculatedAt };
    if (PM_TABS.includes(match[2] as PMTab)) return panel(project, match[2] as PMTab);
    return undefined;
  } };
}

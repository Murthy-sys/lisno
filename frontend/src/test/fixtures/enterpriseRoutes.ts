import { ROLE_CODES, OPERATIONAL_ROLES, type Role } from "../../api/authorization-contract";
import type { Lead, ProjectWorkflowTask, UserInvitationItem, ProjectFinanceBucket } from "../../api/types";
import { superAdminDashboardOverviewFixture, superAdminDashboardProjectsPageFixture, superAdminDashboardWorkforcePageFixture } from "../../features/admin/dashboard/dashboardFixtures";
import type { EnterpriseScenario } from "./enterpriseTransport";
import * as admin from "./enterpriseAdminData";
import * as users from "./enterpriseUsersData";
import * as access from "./enterpriseAccessData";
import * as responses from "./enterpriseResponsesData";
import * as designer from "./enterpriseDesignerData";
import * as project from "./enterpriseProjectData";
import * as client from "./enterpriseClientData";
import * as finance from "./enterpriseFinanceData";
import * as procurement from "./enterpriseProcurementData";
import * as knowledge from "./enterpriseKnowledgeData";
import * as drawing from "./enterpriseDrawingData";
import type { KnowledgeSectionKey } from "../../features/ai-estimator-knowledge/knowledgeTypes";

const lead: Lead = { id: "lead-1", projectId: "project-1", ownerId: "estimator_sales-1", clientName: "Asha Shah", clientEmail: "asha@example.com", clientMobile: "+91 90000 00000", projectName: "Asha home — complete residence and terrace refurbishment", location: "Pune", propertyType: "3BHK", budgetMin: 800000, budgetMax: 1200000, source: "Referral", stage: "estimate_in_progress", nextAction: "Review updated living room measurements", nextActionAt: "2026-09-15T10:00:00.000Z", builder: null, areaSqft: 1400, targetHandoverAt: null, notes: "Synthetic project record for visual review.", latestActivityAt: null, createdAt: "2026-08-23T10:00:00.000Z", updatedAt: "2026-09-10T10:00:00.000Z" };
const estimate = { id: "estimate-1", leadId: lead.id, projectId: lead.projectId, propertyType: "3BHK", rooms: [{ id: "living-room", label: "Living Room", type: "living", length: 16, width: 12, height: 10 }], scopes: ["FC"], lineItems: responses.pendingDetail.estimateSnapshot.lineItems, subtotal: 1200, gst: 216, total: 1416, status: "draft", approvalRequired: false, updatedAt: lead.updatedAt, lead };
const team = [
  { user: { id: "designer-1", name: "Ananya Rao", email: "ananya@lisno.example" }, activeProjectCount: 2, workload: 24, overdueCount: 1, yellowRiskCount: 2, pendingEvaluation: true, kpi: { score: 84, components: designer.components }, projects: designer.projects.map((p) => ({ ...p, progress: 45 })), tasks: designer.kpiTasks },
  { user: { id: "designer-2", name: "Kabir Shah", email: "kabir@lisno.example" }, activeProjectCount: 1, workload: 12, overdueCount: 0, yellowRiskCount: 1, pendingEvaluation: false, kpi: { score: 79, components: designer.components }, projects: [], tasks: [] }
];
const buckets = [finance.baseBucket, finance.overBudgetBucket, finance.unknownCompletionBucket, finance.lateCompletionBucket];
function zeroAggregates(value: unknown): unknown {
  if (typeof value === "number") return 0;
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, zeroAggregates(v)]));
  return value;
}

export function enterpriseDataFor(path: string, params: URLSearchParams, scenario: EnterpriseScenario): unknown {
  const empty = scenario.state === "empty";
  const list = <T,>(rows: readonly T[]): T[] => empty ? [] : [...rows];
  const page = <T,>(rows: readonly T[]) => {
    const filtered = list(rows).filter((row) => !params.get("search") || JSON.stringify(row).toLowerCase().includes(params.get("search")!.toLowerCase()));
    const limit = Number(params.get("limit") ?? 100), offset = Number(params.get("offset") ?? 0);
    return { items: filtered.slice(offset, offset + limit), pagination: { limit, offset, total: filtered.length, hasMore: offset + limit < filtered.length } };
  };
  if (path === "/admin/dashboard/overview") return empty ? { ...superAdminDashboardOverviewFixture, projects: zeroAggregates(superAdminDashboardOverviewFixture.projects), estimation: zeroAggregates(superAdminDashboardOverviewFixture.estimation), design: zeroAggregates(superAdminDashboardOverviewFixture.design), finance: zeroAggregates(superAdminDashboardOverviewFixture.finance), workforce: zeroAggregates(superAdminDashboardOverviewFixture.workforce), execution: zeroAggregates(superAdminDashboardOverviewFixture.execution), procurement: zeroAggregates(superAdminDashboardOverviewFixture.procurement), governance: zeroAggregates(superAdminDashboardOverviewFixture.governance), risk: zeroAggregates(superAdminDashboardOverviewFixture.risk), trends: [] } : superAdminDashboardOverviewFixture;
  if (path === "/admin/dashboard/projects") return { ...superAdminDashboardProjectsPageFixture, ...page(superAdminDashboardProjectsPageFixture.items) };
  if (path === "/admin/dashboard/workforce") return { ...superAdminDashboardWorkforcePageFixture, ...page(superAdminDashboardWorkforcePageFixture.items) };
  if (path === "/admin/projects") return page([admin.project, { ...admin.approvedPendingProject, name: "North Residence — upper floor and garden apartment renovation" }]);
  if (/^\/admin\/projects\/[^/]+$/.test(path)) return path.endsWith("project-murthy") ? admin.approvedPendingProject : { ...admin.project, id: decodeURIComponent(path.split("/").at(-1)!) };
  if (path === "/admin/users") return { ...page(users.directoryRows), filterRoles: ROLE_CODES, manageableRoles: OPERATIONAL_ROLES };
  if (path === "/admin/user-invitations") return { ...page<UserInvitationItem>([{ id: "invitation-1", email: "new-designer@lisno.example", name: "Synthetic invited designer", role: "designer", mobile: "+91 90000 00000", status: "pending", currentLinkAvailable: true, availableActions: ["resend", "revoke"], invitedBy: { id: "super_admin-1", name: "Synthetic reviewer", email: "reviewer@lisno.example", role: "super_admin" }, deliveryStatus: "sent", deliveryAttemptedAt: "2026-09-12T10:00:00.000Z", sentAt: "2026-09-12T10:00:00.000Z", issuedAt: "2026-09-12T10:00:00.000Z", expiresAt: "2026-09-20T00:00:00.000Z", version: 1, createdAt: "2026-09-12T10:00:00.000Z", updatedAt: "2026-09-12T10:00:00.000Z" }]), invitableRoles: OPERATIONAL_ROLES };
  if (path === "/admin/estimators" || path === "/admin/sales-managers") return page([{ id: "estimator-1", name: "Ravi Estimator", email: "ravi@lisno.example", active: true }]);
  if (path === "/admin/designers") return list(team.map((t) => ({ ...t.user, activeProjectCount: t.activeProjectCount })));
  if (path === "/admin/workers") return list([{ id: "worker-1", name: "Aarav Electrician", email: "electrician@lisno.example", role: "worker_electrician" }]);
  if (path === "/access-requests/review" || path === "/access-requests/mine") return page([access.reviewRow, { ...access.reviewRow, id: "request-approved", status: "approved", activeGrant: access.activeGrant }]);
  if (path === "/admin/estimate-client-response-tasks") return page([responses.pendingDetail]);
  if (/^\/admin\/estimate-client-response-tasks\/[^/]+$/.test(path)) return responses.pendingDetail;
  if (path === "/admin/design-plan-response-tasks") return [];
  if (path === "/projects") return page(designer.projects);
  if (/^\/projects\/[^/]+$/.test(path)) return { ...project.project, id: decodeURIComponent(path.split("/").at(-1)!), progress: 45, ...(empty ? { floors: [] } : {}) };
  if (/^\/projects\/[^/]+\/design-workflow$/.test(path)) return empty ? { projectId: path.split("/")[2], projectName: "Aurora Villa", serverNow: "2026-09-13T10:00:00.000Z", floors: [] } : drawing.drawingWorkflow(path.split("/")[2], scenario.role === "designer");
  if (path === "/design-workflow/payment-confirmations") return [];
  if (/^\/projects\/[^/]+\/design-versions$/.test(path)) return page([{ ...drawing.approvedDocument, projectId: path.split("/")[2] }]);
  if (path === "/design-versions/qa-approved-document/sections") return empty ? { ...drawing.approvedExtraction, pages: [], sections: [] } : drawing.approvedExtraction;
  if (/^\/projects\/[^/]+\/activity$/.test(path)) return page([]);
  if (/^\/admin\/projects\/[^/]+\/(workflow-tasks|section-assignments)$/.test(path)) return [];
  if (path === "/designer/design-plan-tasks") return list(designer.designPlanTasks.map((task) => ({ ...task, rooms: [{ id: "room-living", label: "Living Room" }], scopes: ["EL"], lineItems: [{ catalogueId: "EL01", roomName: "Living Room", specification: "Lighting point", unit: "point", quantity: 6, included: true }] })));
  if (/^\/kpis\/users\/[^/]+\/tasks$/.test(path)) return page(designer.kpiTasks);
  if (/^\/kpis\/users\/[^/]+$/.test(path)) return { userId: path.split("/")[3], periodStartAt: params.get("from"), periodEndAt: params.get("to"), score: empty ? 0 : 84, components: empty ? designer.components.map((c) => ({ ...c, score: null, eligibleCount: 0 })) : designer.components, aggregates: empty ? zeroAggregates(designer.aggregates) : designer.aggregates, tasks: page(designer.kpiTasks) };
  if (/^\/tasks\/[^/]+\/events$/.test(path)) return page(designer.kpiTasks[0].events.items);
  if (path === "/organization/team") return page(team);
  if (path === "/organization/managers") return page([{ id: "manager-1", name: "Aarav Shah", email: "aarav@lisno.example" }]);
  if (path === "/organization/tree") return page([{ id: "manager-1", name: "Aarav Shah", email: "aarav@lisno.example", designers: page(team.map(({ user, ...summary }) => ({ ...user, summary }))), summary: { teamKpi: { score: 82, components: [] }, workload: 36, redCount: 1, yellowCount: 3, evaluationCoverage: 50 } }]);
  if (/^\/designers\/[^/]+\/summary$/.test(path)) return team.find((t) => t.user.id === path.split("/")[2]) ?? team[0];
  if (/^\/(evaluations\/[^/]+|designers\/[^/]+\/audit)$/.test(path)) return page([]);
  if (path === "/client/project-summaries") return page(client.summaries);
  if (path === "/client/latest-approved-versions") return list([drawing.approvedDocument]);
  if (path === "/client/estimates") return list([{ ...estimate, projectId: "project-villa", status: "client_approved", designPlanStatus: "ready_for_client", designPlanVersion: 1, rooms: [{ id: "room-living", label: "Living Room" }], scopes: ["EL"], lineItems: [{ catalogueId: "EL01", roomName: "Living Room", specification: "Lighting point", unit: "point", quantity: 6, rate: 200, amount: 1200, included: true }], lead: { ...lead, _id: lead.id, projectName: "Aurora Villa" } }]);
  if (path === "/client/estimates/estimate-1/design-drawings") return empty ? { uploads: [], pages: [], drawings: [], revisions: [], readiness: { ready: false, total: 0, approved: 0, awaitingReview: 0, changesRequested: 0 } } : drawing.clientDrawingWorkspace("estimate-1");
  if (path === "/client/estimates/estimate-1/plan-review") return empty ? { uploads: [], pages: [], openRequests: [] } : drawing.clientPlanWorkspace("estimate-1");
  if (/^\/client\/projects\/[^/]+\/design-sections$/.test(path)) return empty ? { projectId: path.split("/")[3], sections: [], progress: { total: 0, approved: 0, awaitingReview: 0, rejected: 0 } } : { ...drawing.review, projectId: path.split("/")[3] };
  if (path === "/leads") return page([lead]);
  if (path === "/leads/lead-1") return lead;
  if (path === "/leads/lead-1/activities") return page([{ id: "activity-1", leadId: lead.id, actorId: lead.ownerId, type: "meeting", note: "Reviewed kitchen and living room measurements with the client.", occurredAt: lead.updatedAt, createdAt: lead.updatedAt }]);
  if (path === "/leads/lead-1/estimate") return empty ? null : estimate;
  if (path === "/estimates") return list([estimate]);
  if (/^\/estimates\/(estimate-1|estimate-aurora-villa|estimate-aurora-studio)\/design-uploads$/.test(path)) return empty ? { uploads: [], pages: [], drawings: [], revisions: [] } : drawing.extractedWorkspace(path.split("/")[2]);
  if (path === "/estimates/pending-review" || path === "/estimates/review-queue") return [];
  if (path === "/estimates/designers") return team.map((t) => t.user);
  if (path === "/finance/projects") return { ...page(buckets), summary: empty ? zeroAggregates(finance.portfolioSummary) : finance.portfolioSummary };
  if (/^\/finance\/projects\/[^/]+(?:\/entries)?$/.test(path)) {
    const projectId = decodeURIComponent(path.split("/")[3]);
    const bucket = [...buckets, admin.approvedPendingBucket].find((candidate) => candidate.projectId === projectId);
    if (!bucket) return Response.json({ error: { code: "FINANCE_BUCKET_NOT_FOUND", message: "The synthetic project has no approved finance baseline yet." } }, { status: 404 });
    return path.endsWith("/entries") ? page(financeLedgerFor(bucket)) : bucket;
  }
  if (path === "/procurement/projects") return list([procurement.procurementProject]);
  if (/^\/procurement\/projects\/[^/]+\/items$/.test(path)) return { items: [], total: 0, limit: Number(params.get("limit") ?? 20), offset: Number(params.get("offset") ?? 0) };
  if (path === "/procurement/uoms") return [];
  if (path === "/workflow-tasks") return list([workflowTask(scenario.role)]);
  if (/^\/design-section-revisions\/(revision-1|revision-2|revision-3)\/image$/.test(path)) return drawing.syntheticDrawingResponse(drawing.revision.crop);
  if (/^\/design-source-pages\/(page-1|page-2)\/image$/.test(path)) return drawing.syntheticDrawingResponse();
  if (/^\/(estimate-design-source-pages\/page-|estimate-design-revisions\/revision-)(estimate-1|estimate-aurora-villa|estimate-aurora-studio)\/image$/.test(path)) return drawing.syntheticDrawingResponse();
  if (/^\/client\/estimate-plan-pages\/page-estimate-1\/(thumbnail|current-image)$/.test(path)) return drawing.syntheticDrawingResponse();
  if (path === "/design-versions/qa-approved-document/download" || path === "/client/estimates/estimate-1/pdf" || /^\/projects\/[^/]+\/design-workflow\/history\/qa-internal-document\/proof$/.test(path)) return drawing.syntheticDocumentResponse();
  const prefix = "/admin/ai-estimator-knowledge";
  if (path === `${prefix}/items`) return { ...page([knowledge.item]), facets: {} };
  if (path === `${prefix}/main-lines/line-1`) return knowledge.item;
  if (path === `${prefix}/baskets`) return page([{ id: "basket-1", name: "Carpentry", description: "Furniture and interior timber work", displayOrder: 1, status: "active", version: 1, itemCount: 1, createdAt: knowledge.item.createdAt, updatedAt: knowledge.item.updatedAt }]);
  if (path === `${prefix}/main-lines`) return page([{ id: "line-1", name: "Wall panelling", basketId: "basket-1", status: "active", version: 1, displayOrder: 1 }]);
  if (path === `${prefix}/uoms`) return page([knowledge.squareFoot, knowledge.squareMetre]);
  if (path === `${prefix}/priorities`) return page(knowledge.canonicalPriorities);
  if (path === `${prefix}/surfaces`) return page([knowledge.wallSurface]);
  if (path === `${prefix}/modes`) return page([{ ...knowledge.squareFoot, id: "mode-in-house", masterType: "modes", code: "IN_HOUSE", name: "In-house", modeKind: "in_house" }]);
  if (path === `${prefix}/taxes`) return page([{ ...knowledge.squareFoot, id: "gst-18", masterType: "taxes", code: "GST_18", name: "GST 18%", rateBps: 1800 }]);
  if (path === `${prefix}/baskets/basket-1/main-lines`) return page([{ ...knowledge.item, name: knowledge.item.mainLineName }]);
  if (path === `${prefix}/vendors`) return page([{ ...knowledge.squareFoot, id: "vendor-1", masterType: "vendors", code: "TIMBER", name: "Timber House" }]);
  if (path === `${prefix}/main-lines/line-1/history`) return page([]);
  if (path === `${prefix}/quality-control-options`) return { items: [] };
  if (/^\/admin\/ai-estimator-knowledge\/main-lines\/line-1\/revisions\/revision-1\/sections\//.test(path)) {
    const sectionKey = path.split("/").at(-1) as KnowledgeSectionKey;
    const marginState = new URLSearchParams(scenario.route.split("?")[1]).get("qaMargin");
    if (marginState && ["ready", "legacy", "legacy-below-range", "legacy-between-steps", "empty"].includes(marginState)) {
      if (sectionKey === "advanced") return knowledge.marginSection(marginState);
      if (sectionKey === "overview") return knowledge.section("overview", { uomId: knowledge.squareFoot.id });
    }
    const scopeState = new URLSearchParams(scenario.route.split("?")[1]).get("qaScope");
    if (sectionKey === "advanced" && scopeState && ["ready", "conflict", "empty"].includes(scopeState)) {
      return knowledge.scopeSection(scopeState);
    }
    return knowledge.section(sectionKey);
  }
  if (path === `${prefix}/baskets/basket-1/sub-baskets`) return page([]);
  if (path === `${prefix}/baskets/basket-1/quality`) return { basketId: "basket-1", basketName: "Carpentry", basketStatus: "active", revisionId: null, revisionNumber: 0, contentDigest: null, parameters: [], updatedAt: null, version: 1 };
  return undefined;
}
function workflowTask(role: Role): ProjectWorkflowTask {
  return { id: "workflow-task-1", projectId: "project-one", projectName: "Aurora Villa", estimateId: "estimate-one", kind: role === "site_manager" ? "site_execution" : role === "procurement" ? "procurement" : role === "finance_head" ? "finance" : "trade_execution", assigneeRole: role, assignedWorker: null, sourceSectionId: "EL", roomName: "Living Room", title: "Install and verify living room electrical points", description: "Review the approved room layout before completing the installation.", status: "in_progress", progress: 40, version: 2, openedAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" };
}

function financeLedgerFor(bucket: ProjectFinanceBucket) {
  const common = { bucketId: bucket.id, projectId: bucket.projectId };
  return [
    finance.financeEntry(`${bucket.id}-procurement`, { ...common, expenseClass: "procurement", category: "Materials", amountPaise: bucket.procurementCostPaise }),
    finance.financeEntry(`${bucket.id}-payroll`, { ...common, expenseClass: "employee_payment", category: "Site team", amountPaise: bucket.employeePaymentPaise }),
    finance.financeEntry(`${bucket.id}-other`, { ...common, category: "Other site expenses", amountPaise: bucket.otherExpensePaise }),
    finance.financeEntry(`${bucket.id}-overhead`, { ...common, type: "overhead", expenseClass: null, category: "Project overhead", amountPaise: bucket.overheadPaise })
  ].filter((entry) => entry.amountPaise > 0);
}

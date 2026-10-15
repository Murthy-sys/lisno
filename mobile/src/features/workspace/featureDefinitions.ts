import type { Role } from "../../contracts/authorization";
import type { QueryFamily } from "../../core/query/invalidationRegistry";
import type { FeatureId } from "../../navigation/registry";

export interface FeatureDefinition {
  readonly id: FeatureId;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly family: QueryFamily;
  readonly endpoint: string | ((role: Role) => string);
  readonly detail?: (role: Role, recordId: string) => string | null;
}

function projectEndpoint(role: Role): string {
  if (role === "client") return "/client/project-summaries";
  if (role === "admin" || role === "super_admin") return "/admin/projects?limit=30&offset=0";
  return "/projects?limit=30&offset=0";
}

export function projectDetailEndpoint(role: Role, id: string): string {
  if (role === "client") return `/projects/${encodeURIComponent(id)}`;
  if (role === "admin" || role === "super_admin") return `/admin/projects/${encodeURIComponent(id)}`;
  return `/projects/${encodeURIComponent(id)}`;
}

export const FEATURE_DEFINITIONS: Readonly<Record<FeatureId, FeatureDefinition>> = Object.freeze({
  "ask-lisno": { id: "ask-lisno", eyebrow: "YOUR PRIVATE ASSISTANT", title: "Ask Lisno", description: "Ask about your projects, plans and estimates.", emptyMessage: "How can Lisno help you today?", family: "chat", endpoint: "/client/ask-lisno" },
  performance: { id: "performance", eyebrow: "MY PERFORMANCE", title: "My performance", description: "Monthly delivery and quality measures from your assigned work.", emptyMessage: "No performance data for this month.", family: "kpi", endpoint: "/auth/me" },
  "staff-estimates": { id: "staff-estimates", eyebrow: "ESTIMATION", title: "Estimate review", description: "Saved estimates, review and client publication.", emptyMessage: "No estimates are available.", family: "estimates", endpoint: "/estimates" },
  execution: { id: "execution", eyebrow: "EXECUTION", title: "Execution", description: "Project delivery, vendor progress and verification.", emptyMessage: "No execution projects are available.", family: "operations", endpoint: "/execution/projects?limit=30&offset=0", detail: (_role, id) => `/projects/${encodeURIComponent(id)}/execution?limit=30&offset=0` },
  "vendor-work": { id: "vendor-work", eyebrow: "YOUR WORK", title: "My work", description: "Issued work, progress and evidence for your assignments.", emptyMessage: "No work is assigned to this account.", family: "operations", endpoint: "/vendor/work?limit=30&offset=0", detail: (_role, id) => `/vendor/work/${encodeURIComponent(id)}` },
  "work-order-approvals": { id: "work-order-approvals", eyebrow: "APPROVALS", title: "Work order approvals", description: "Review the work orders assigned to you.", emptyMessage: "No work orders need your review.", family: "procurement", endpoint: "/work-order-approvals?limit=30&offset=0", detail: (_role, id) => `/work-order-approvals/${encodeURIComponent(id)}` },
  "purchase-orders": { id: "purchase-orders", eyebrow: "APPROVALS", title: "Purchase orders", description: "Purchase orders and project requests awaiting approval.", emptyMessage: "No purchase orders need review.", family: "procurement", endpoint: "/admin/purchase-orders/pending?limit=30&offset=0" },
  "project-completion": { id: "project-completion", eyebrow: "COMPLETION", title: "Project completion", description: "Review final delivery and client acceptance.", emptyMessage: "No projects need completion review.", family: "workflow", endpoint: "/admin/project-completion-tasks?limit=30&offset=0", detail: (_role, id) => `/admin/projects/${encodeURIComponent(id)}/completion` },
  "my-requests": { id: "my-requests", eyebrow: "PROCUREMENT", title: "All my requests", description: "Basket requests, review feedback and submitted changes.", emptyMessage: "No requests have been submitted.", family: "knowledge", endpoint: "/procurement/vendor-basket-proposals/mine?limit=30&offset=0" },
  "payment-confirmations": { id: "payment-confirmations", eyebrow: "PAYMENTS", title: "Payment confirmations", description: "Project payments awaiting confirmation.", emptyMessage: "No payments need confirmation.", family: "workflow", endpoint: "/design-workflow/payment-confirmations" },
  dashboard: { id: "dashboard", eyebrow: "ORGANIZATION", title: "Dashboard", description: "Current project, workforce and delivery signals from Lisno.", emptyMessage: "No dashboard data is available for this period.", family: "dashboard", endpoint: "/admin/dashboard/overview?periodDays=30" },
  projects: { id: "projects", eyebrow: "PROJECTS", title: "Projects", description: "Projects visible to your current account and assignments.", emptyMessage: "No projects have been shared with this account.", family: "projects", endpoint: projectEndpoint, detail: projectDetailEndpoint },
  estimates: { id: "estimates", eyebrow: "CLIENT REVIEW", title: "Estimates & design review", description: "Review published estimates, download the approved artifact and record your decision.", emptyMessage: "No estimates are awaiting your review.", family: "estimates", endpoint: "/client/estimates" },
  work: { id: "work", eyebrow: "YOUR WORK", title: "Assigned work", description: "Execution and coordination tasks assigned to you.", emptyMessage: "There is no assigned work right now.", family: "operations", endpoint: "/workflow-tasks?limit=40&offset=0" },
  "design-plans": { id: "design-plans", eyebrow: "DESIGN", title: "Design plans", description: "Assigned design-plan work and Client response state.", emptyMessage: "There are no design-plan tasks right now.", family: "design-plans", endpoint: "/designer/design-plan-tasks?limit=30&offset=0" },
  leads: { id: "leads", eyebrow: "SALES", title: "Leads & estimates", description: "Lead pipeline and saved estimate work.", emptyMessage: "No leads match the current view.", family: "leads", endpoint: "/leads?limit=30&offset=0", detail: (_role, id) => `/leads/${encodeURIComponent(id)}` },
  team: { id: "team", eyebrow: "MANAGEMENT", title: "Team", description: "Direct reports, project risk and performance signals.", emptyMessage: "No team members are available.", family: "management", endpoint: "/organization/team?limit=100&offset=0", detail: (_role, id) => `/designers/${encodeURIComponent(id)}/summary` },
  organization: { id: "organization", eyebrow: "ORGANIZATION", title: "Organization", description: "Manager and Designer delivery structure.", emptyMessage: "No organization data is available.", family: "management", endpoint: "/organization/tree" },
  procurement: { id: "procurement", eyebrow: "PROCUREMENT", title: "Procurement", description: "Approved project items, vendors and sourcing work.", emptyMessage: "No procurement projects are available.", family: "procurement", endpoint: (role) => role === "procurement" ? "/procurement/projects?limit=30&offset=0" : "/procurement/suggestion-projects?limit=30&offset=0", detail: (_role, id) => `/procurement/projects/${encodeURIComponent(id)}/items?limit=50&offset=0` },
  "procurement-vendors": { id: "procurement-vendors", eyebrow: "PROCUREMENT", title: "Vendors", description: "Approved vendor directory.", emptyMessage: "No vendors are available.", family: "knowledge", endpoint: "/admin/ai-estimator-knowledge/vendors?limit=30&offset=0" },
  finance: { id: "finance", eyebrow: "FINANCE", title: "Finance", description: "Backend-reconciled approved budgets, recorded cost and schedule state.", emptyMessage: "No finance projects are available.", family: "finance-portfolio", endpoint: "/finance/projects?limit=30&offset=0", detail: (_role, id) => `/finance/projects/${encodeURIComponent(id)}` },
  messages: { id: "messages", eyebrow: "CONVERSATIONS", title: "Project messages", description: "Conversations for projects where you are an active participant.", emptyMessage: "No project conversations are available.", family: "chat", endpoint: "/project-messages?limit=30&offset=0", detail: (_role, id) => `/projects/${encodeURIComponent(id)}/chat/messages?limit=40` },
  users: { id: "users", eyebrow: "ADMINISTRATION", title: "Users", description: "Managed user identities and account status.", emptyMessage: "No users match this view.", family: "users", endpoint: "/admin/users?limit=30&offset=0" },
  configuration: { id: "configuration", eyebrow: "CONFIGURATION", title: "Configuration", description: "Versioned estimation catalog and calculation configuration.", emptyMessage: "No knowledge items are configured.", family: "knowledge", endpoint: "/admin/ai-estimator-knowledge/items?limit=30&offset=0" },
  "client-responses": { id: "client-responses", eyebrow: "REVIEW QUEUE", title: "Client responses", description: "Estimate response rounds awaiting an authorized decision.", emptyMessage: "No Client responses need review.", family: "estimate-responses", endpoint: "/admin/estimate-client-response-tasks?limit=30&offset=0", detail: (_role, id) => `/admin/estimate-client-response-tasks/${encodeURIComponent(id)}` },
  "design-approvals": { id: "design-approvals", eyebrow: "REVIEW QUEUE", title: "Design approvals", description: "Design plan response rounds awaiting review.", emptyMessage: "No design approvals need review.", family: "design-plans", endpoint: "/admin/design-plan-response-tasks?limit=30&offset=0" },
  "access-review": { id: "access-review", eyebrow: "ACCESS", title: "Access requests", description: "Scoped project-module access awaiting review.", emptyMessage: "No access requests need review.", family: "access-review", endpoint: "/access-requests/review?limit=30&offset=0" },
  "access-self": { id: "access-self", eyebrow: "ACCESS", title: "My access requests", description: "Your current and previous project-module access requests.", emptyMessage: "You have not requested project access.", family: "access-self", endpoint: "/access-requests/mine?limit=30&offset=0" },
  notifications: { id: "notifications", eyebrow: "UPDATES", title: "Notifications", description: "Recent Lisno activity for your authorized work.", emptyMessage: "You’re all caught up.", family: "notifications", endpoint: "/notifications?limit=30&offset=0" }
});

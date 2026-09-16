import type { ChatParticipant, ChatPerson } from "../contracts/project-chat.js";
import { grantCanSupplyProjectModuleScope } from "./project-access.js";
import { projectWorkflowBlueprints } from "./project-workflow.js";
import { isWorkerRole, type Role } from "./roles.js";
import type { ChatSelection, ChatSources } from "../repositories/project-chat.js";
export interface ChatMembership {
    participants: ChatParticipant[];
    warnings: string[];
    selectionManagers: Set<string>;
    eligibleTrades: Map<Role, {
        estimateId: string;
        designPlanVersion: number;
        role: Role;
    }>;
}
/** Every source is validated independently. Ambiguous legacy lineage never widens membership. */
export function resolveChatMembership(sources: ChatSources, selections: readonly ChatSelection[]): ChatMembership {
    const { project, users } = sources;
    const active = new Map(users.filter((user) => user.active).map((user) => [user.id, user]));
    const members = new Map<string, ChatParticipant>();
    const warnings = new Set<string>();
    const selectionManagers = new Set<string>();
    const eligibleTrades: ChatMembership["eligibleTrades"] = new Map();
    const add = (userId: string | null | undefined, role: Role | null, kind: ChatParticipant["sources"][number]["kind"], id: string) => {
        if (!userId)
            return;
        const user = active.get(userId);
        if (!user || (role && user.role !== role))
            return;
        const participant = members.get(userId) ?? { id: user.id, name: user.name, role: user.role, sources: [], selection: null };
        if (!participant.sources.some((source) => source.kind === kind && source.id === id))
            participant.sources.push({ kind, id });
        members.set(userId, participant);
    };
    add(project.clientId, "client", "client", project.id);
    const superAdmins = [...active.values()].filter((user) => user.role === "super_admin");
    if (superAdmins.length === 1) {
        add(superAdmins[0]!.id, "super_admin", "super_admin", superAdmins[0]!.id);
        selectionManagers.add(superAdmins[0]!.id);
    }
    else if (superAdmins.length > 1)
        warnings.add("The Super Admin account needs administrative review.");
    add(project.initiatingDesignerId, "designer", "project_assignment", project.id);
    for (const id of project.assignedDesignerIds)
        add(id, "designer", "project_assignment", project.id);
    add(project.managerId, "design_manager", "project_assignment", project.id);
    add(project.assignedEstimatorId, "estimator_sales", "project_assignment", project.id);
    for (const grant of sources.grants) {
        const user = active.get(grant.userId);
        if (grant.projectId !== project.id || !user || !grantCanSupplyProjectModuleScope(user.role, grant))
            continue;
        add(user.id, user.role, "access_grant", grant.id);
        if (grant.source === "admin_initiator" && user.role === "admin")
            selectionManagers.add(user.id);
    }
    const leadById = new Map(sources.leads.map((lead) => [lead.id, lead]));
    const linkedLeads = sources.leads.filter((lead) => lead.projectId === project.id);
    const estimates = sources.estimates.filter((estimate) => {
        const lead = leadById.get(estimate.leadId);
        const relevant = estimate.projectId === project.id || lead?.projectId === project.id;
        if (!relevant)
            return false;
        if (!lead || (estimate.projectId && lead.projectId && estimate.projectId !== lead.projectId)) {
            warnings.add("An estimate link needs administrative review.");
            return false;
        }
        return true;
    });
    if (!project.assignedEstimatorId) {
        const salesIds = new Set([...linkedLeads.map((lead) => lead.ownerId), ...estimates.map((estimate) => estimate.ownerId)]);
        if (salesIds.size === 1)
            add([...salesIds][0], "estimator_sales", "estimate_assignment", estimates[0]?.id ?? linkedLeads[0]!.id);
        if (salesIds.size > 1)
            warnings.add("The Sales assignment needs administrative review.");
    }
    const approved = estimates.filter((estimate) => estimate.status === "client_approved");
    const current = approved.length === 1 ? approved[0] : approved.length > 1 ? null : estimates.length === 1 ? estimates[0] : null;
    if (approved.length > 1 || (approved.length === 0 && estimates.length > 1))
        warnings.add("The current estimate assignment needs administrative review.");
    if (current) {
        if (current.status === "client_approved") {
            if (["assigned", "in_progress", "ready_for_client", "changes_requested", "approved"].includes(current.designPlanStatus ?? ""))
                add(current.designPlanDesignerId, "designer", "estimate_assignment", current.id);
        }
        else if (current.approvalRequired && ["pending_designer_approval", "designer_changes_requested", "ready_for_client", "sent_to_client", "client_changes_requested"].includes(current.status)) {
            add(current.assignedManagerId, "design_manager", "estimate_assignment", current.id);
            add(current.assignedDesignerId, "designer", "estimate_assignment", current.id);
        }
    }
    for (const task of sources.designTasks) {
        if (task.projectId === project.id)
            add(task.ownerId, "designer", "workflow_assignment", task.id);
    }
    const canonicalCandidates = estimates.filter((estimate) => estimate.projectId === project.id && estimate.status === "client_approved" && estimate.designPlanStatus === "approved");
    const canonical = canonicalCandidates.length === 1 ? canonicalCandidates[0]! : null;
    if (canonicalCandidates.length > 1)
        warnings.add("The approved trade source needs administrative review.");
    if (canonical && Number.isSafeInteger(canonical.designPlanVersion) && canonical.designPlanVersion > 0) {
        let blueprints: ReturnType<typeof projectWorkflowBlueprints> = [];
        try {
            blueprints = projectWorkflowBlueprints({ estimateId: canonical.id, estimateVersion: Math.max(1, canonical.version - 1), lineItems: canonical.lineItems });
        }
        catch {
            warnings.add("The approved trade source needs administrative review.");
        }
        const tradeBlueprints = blueprints.filter((item) => item.kind === "trade_execution");
        const uniqueLines = new Set(tradeBlueprints.map((item) => item.sourceLineItemKey));
        if (uniqueLines.size !== tradeBlueprints.length) {
            warnings.add("The approved trade source needs administrative review.");
        }
        else {
            for (const blueprint of tradeBlueprints)
                eligibleTrades.set(blueprint.assigneeRole, { estimateId: canonical.id, designPlanVersion: canonical.designPlanVersion, role: blueprint.assigneeRole });
            const tradeTasks = sources.workflowTasks.filter((task) => task.projectId === project.id && task.kind === "trade_execution");
            const staleTrades = tradeTasks.some((task) => task.estimateId !== canonical.id || task.designPlanVersion !== canonical.designPlanVersion);
            const taskLineKeys = new Set(tradeTasks.map((task) => task.sourceLineItemKey));
            const malformedTrades = staleTrades || taskLineKeys.size !== tradeTasks.length;
            if (malformedTrades)
                warnings.add("Trade assignments need administrative review.");
            for (const task of sources.workflowTasks) {
                if (task.projectId !== project.id || task.estimateId !== canonical.id || task.designPlanVersion !== canonical.designPlanVersion)
                    continue;
                const blueprint = blueprints.find((item) => item.kind === task.kind && item.assigneeRole === task.assigneeRole && item.sourceSectionId === task.sourceSectionId && item.sourceLineItemKey === task.sourceLineItemKey);
                if (!blueprint || (task.kind === "trade_execution" && malformedTrades))
                    continue;
                add(task.assigneeUserId, task.assigneeRole, "workflow_assignment", task.id);
            }
        }
    }
    for (const selection of selections) {
        if (!selection.active || selection.projectId !== project.id || selection.selectedRole === "client" || selection.selectedRole === "super_admin")
            continue;
        const user = active.get(selection.userId);
        if (!user || user.role !== selection.selectedRole)
            continue;
        if (isWorkerRole(user.role)) {
            const canonicalTrade = eligibleTrades.get(user.role);
            if (!canonicalTrade || !selection.tradeReference || canonicalTrade.estimateId !== selection.tradeReference.estimateId || canonicalTrade.designPlanVersion !== selection.tradeReference.designPlanVersion || canonicalTrade.role !== selection.tradeReference.role)
                continue;
        }
        add(user.id, user.role, "selection", selection.id);
        members.get(user.id)!.selection = { id: selection.id, version: selection.version };
    }
    for (const role of eligibleTrades.keys()) {
        if (![...members.values()].some((person) => person.role === role)) {
            warnings.add("Participant not selected for one or more approved trades.");
        }
    }
    return { participants: [...members.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), warnings: [...warnings], selectionManagers, eligibleTrades };
}
export function canSelectChatPerson(person: ChatPerson, membership: ChatMembership): boolean {
    return person.role !== "client" && person.role !== "super_admin" && (!isWorkerRole(person.role) || membership.eligibleTrades.has(person.role));
}

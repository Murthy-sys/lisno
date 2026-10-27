import { describe, it, expect } from "vitest";
import { resolveChatMembership } from "../src/domain/project-chat-membership.js";
import type { ChatSelection } from "../src/repositories/project-chat.js";
import { chatUser, membershipSources, CHAT_NOW } from "./helpers/project-chat.js";
const ids = (sources: ReturnType<typeof membershipSources>, selections: ChatSelection[] = []) => resolveChatMembership(sources, selections).participants.map((row) => row.id);
describe("project chat current membership", () => {
    it("derives PM membership from current assignment and rejects stale manual selection", () => {
        const source = membershipSources();
        source.users.push(chatUser("pm-a", "site_manager"), chatUser("pm-b", "site_manager"));
        source.project.programManagerId = "pm-a";
        expect(ids(source)).toContain("pm-a");
        expect(ids(source)).not.toContain("pm-b");
        const selection: ChatSelection = { id: "old-pm", projectId: "a", userId: "pm-a", selectedRole: "site_manager", active: true, version: 1, selectedBy: { id: "admin-a", name: "Admin", role: "admin" }, selectedAt: CHAT_NOW, reason: "Legacy selection", tradeReference: null, revokedAt: null, revokedBy: null, revocationReason: null };
        source.project.programManagerId = "pm-b";
        expect(ids(source, [selection])).not.toContain("pm-a");
        expect(ids(source, [selection])).toContain("pm-b");
        source.users.find(user => user.id === "pm-b")!.active = false;
        expect(ids(source, [selection])).not.toContain("pm-b");
    });
    it("requires the scalar and current Site task to agree and ignores retired identities", () => {
        const source = membershipSources();
        source.project.programManagerId = "site-a";
        const task = { ...source.workflowTasks[0]!, id: "site-task", kind: "site_execution" as const,
            assigneeRole: "site_manager" as const, assigneeUserId: "site-a", sourceSectionId: null, sourceLineItemKey: null };
        source.workflowTasks.push(task);
        expect(ids(source)).toContain("site-a");
        source.workflowTasks.push({ ...task, id: "duplicate-site" });
        expect(ids(source)).not.toContain("site-a");
        source.workflowTasks.pop();
        source.project.programManagerId = null;
        expect(ids(source)).not.toContain("site-a");
        source.project.programManagerId = "site-a";
        source.users.find(user => user.id === "site-a")!.role = "program_manager";
        expect(ids(source)).not.toContain("site-a");
    });
    it("uses only current involved identities and canonical included trade rows", () => {
        const members = ids(membershipSources());
        expect(members).toEqual(expect.arrayContaining(["super", "admin-a", "client-a", "designer-a", "manager-a", "sales-a", "electric-a"]));
        for (const id of ["client-b", "admin-b", "head", "site-a", "electric-b", "plumber", "old-manager", "old-designer", "procurement"])
            expect(members).not.toContain(id);
    });
    it("rejects stale approved trade versions and retains independently proven core people", () => {
        const source = membershipSources();
        source.workflowTasks[0]!.designPlanVersion = 1;
        expect(ids(source)).not.toContain("electric-a");
        expect(ids(source)).toContain("client-a");
        source.estimates.push({ ...source.estimates[0]!, id: "duplicate", leadId: "lead-2" });
        source.leads.push({ ...source.leads[0]!, id: "lead-2" });
        expect(resolveChatMembership(source, []).eligibleTrades.size).toBe(0);
        expect(ids(source)).not.toContain("electric-a");
    });
    it("validates exact stable trade line and role instead of trusting a role label", () => {
        const source = membershipSources();
        source.workflowTasks[0]!.sourceLineItemKey = "foreign-line";
        expect(ids(source)).not.toContain("electric-a");
        source.workflowTasks[0]!.sourceLineItemKey = "line-electric";
        source.workflowTasks[0]!.assigneeRole = "worker_plumber";
        source.workflowTasks[0]!.assigneeUserId = "plumber";
        expect(ids(source)).not.toContain("plumber");
    });
    it("uses review fields only in applicable review stages with approvalRequired", () => {
        const source = membershipSources();
        const estimate = source.estimates[0]!;
        estimate.status = "pending_designer_approval";
        estimate.designPlanStatus = null;
        expect(ids(source)).toEqual(expect.arrayContaining(["old-designer", "old-manager"]));
        estimate.status = "draft";
        expect(ids(source)).not.toContain("old-manager");
        estimate.status = "ready_for_client";
        estimate.approvalRequired = false;
        expect(ids(source)).not.toContain("old-designer");
    });
    it("withholds conflicting legacy Sales linkage without widening membership", () => {
        const source = membershipSources();
        source.project.assignedEstimatorId = null;
        expect(ids(source)).toContain("sales-a");
        source.users.push(chatUser("sales-b", "estimator_sales"));
        source.leads[0]!.ownerId = "sales-b";
        expect(ids(source)).not.toContain("sales-a");
        expect(ids(source)).not.toContain("sales-b");
        expect(ids(source)).toContain("client-a");
        source.estimates[0]!.projectId = "b";
        expect(ids(source)).not.toContain("electric-a");
    });
    it("does not let module grants bypass the current Project Manager assignment", () => {
        const source = membershipSources();
        const grant = source.grants[0]!;
        source.grants.push({ ...grant, id: "direct", userId: "site-a", module: "execution", source: "direct_assignment" });
        expect(ids(source)).not.toContain("site-a");
        source.grants[1]!.source = "access_request";
        expect(ids(source)).not.toContain("site-a");
        source.grants[1]!.module = "finance";
        expect(ids(source)).not.toContain("site-a");
    });
    it("invalidates selections on role/lineage changes and preserves additional sources", () => {
        const source = membershipSources();
        const selection: ChatSelection = { id: "selection", projectId: "a", userId: "electric-b", selectedRole: "worker_electrician", active: true, version: 1, selectedBy: { id: "admin-a", name: "admin-a", role: "admin" }, selectedAt: CHAT_NOW, reason: "Help", tradeReference: { estimateId: "estimate-a", designPlanVersion: 2, role: "worker_electrician" }, revokedAt: null, revokedBy: null, revocationReason: null };
        expect(ids(source, [selection])).toContain("electric-b");
        source.users.find((user) => user.id === "electric-b")!.role = "worker_plumber";
        expect(ids(source, [selection])).not.toContain("electric-b");
        selection.userId = "electric-a";
        selection.active = false;
        expect(ids(source, [selection])).toContain("electric-a");
        source.users.find((user) => user.id === "electric-a")!.active = false;
        expect(ids(source, [selection])).not.toContain("electric-a");
    });
    it("fails closed when multiple active Super Admin identities appear", () => { const source = membershipSources(); source.users.push(chatUser("super-2", "super_admin")); expect(ids(source)).not.toContain("super"); expect(ids(source)).toContain("client-a"); });
});

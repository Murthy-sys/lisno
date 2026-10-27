import { PMCounterpartPanel } from "../project-manager/PMCounterpartPanel";
import { ProjectChatNavigation } from "../messages";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { FinanceProjectWorkflowControl } from "./FinanceProjectWorkflowControl";
import { ProjectFinancePanel } from "./ProjectFinancePanel";
import { FinanceWorkOrderAssessments } from "./FinanceWorkOrderAssessments";
import { projectBudgetListHref } from "./projectBudgetNavigation";

export function FinanceProjectPage() {
  const { projectId = "" } = useParams();
  const [params] = useSearchParams();
  const auth = useAuth();
  const isProjectBudget = auth.user?.role === "super_admin";
  const canControlWorkflow = auth.user?.role === "super_admin" &&
    hasFrontendPermission(auth.authorization, "projects.read") &&
    hasFrontendPermission(auth.authorization, "execution.worker_assignment.override");

  return (
    <section className="finance-project-page" aria-labelledby="finance-project-title">
      <PMCounterpartPanel projectId={projectId ?? ""} />
      <PageHeader
        id="finance-project-title"
        eyebrow="Project finance"
        title={isProjectBudget ? "Project budget" : canControlWorkflow ? "Budget and delivery control" : "Budget detail"}
        description={isProjectBudget ? "Approved budget, reserved margin, and actual spending in one view." : canControlWorkflow
          ? "Review project finances, monitor the complete workflow, and assign exact trade workers."
          : "Review the approved commercial baseline and record actual project costs."}
        breadcrumb={<Link to={isProjectBudget ? projectBudgetListHref(params.get("returnTo")) : "/finance"}>{isProjectBudget ? "Back to Project Budgets" : "Back to Project finance"}</Link>}
      />
      <ProjectChatNavigation projectId={projectId} overviewTo={`/finance/projects/${projectId}`} overviewLabel="Finance" />
      <ProjectFinancePanel projectId={projectId} presentation={isProjectBudget ? "project-budget" : "standard"} />
      {auth.user?.role === "finance_head" && hasFrontendPermission(auth.authorization, "finance.vendor_invoice.manage")
        ? <FinanceWorkOrderAssessments projectId={projectId} /> : null}
      {canControlWorkflow ? <FinanceProjectWorkflowControl projectId={projectId} /> : null}
    </section>
  );
}

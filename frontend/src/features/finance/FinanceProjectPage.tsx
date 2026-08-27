import { Link, useParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { FinanceProjectWorkflowControl } from "./FinanceProjectWorkflowControl";
import { ProjectFinancePanel } from "./ProjectFinancePanel";

export function FinanceProjectPage() {
  const { projectId = "" } = useParams();
  const auth = useAuth();
  const canControlWorkflow = auth.user?.role === "super_admin" &&
    hasFrontendPermission(auth.authorization, "projects.read") &&
    hasFrontendPermission(auth.authorization, "execution.worker_assignment.override");

  return (
    <section className="finance-project-page" aria-labelledby="finance-project-title">
      <PageHeader
        id="finance-project-title"
        eyebrow="Project finance"
        title={canControlWorkflow ? "Budget and delivery control" : "Budget detail"}
        description={canControlWorkflow
          ? "Review project finances, monitor the complete workflow, and assign exact trade workers."
          : "Review the approved commercial baseline and record actual project costs."}
        breadcrumb={<Link to="/finance">Back to Project finance</Link>}
      />
      <ProjectFinancePanel projectId={projectId} />
      {canControlWorkflow ? <FinanceProjectWorkflowControl projectId={projectId} /> : null}
    </section>
  );
}

import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { PageHeader } from "../../components/ui/PageHeader";
import { ClientQuotation } from "../client/ClientQuotation";
import { ClientEstimationWorkspace } from "../client/ClientEstimationWorkspace";

/** Project-scoped safe quotation view; the primary Designer's editor stays on the staff route. */
export function ProjectQuotationWorkspace() {
  const { projectId = "" } = useParams();
  const { user, reviewSession } = useAuth();
  return <QuotationForProject key={`${projectId}:${reviewSession?.id ?? user?.id}`} projectId={projectId} client={user?.role === "client"} />;
}

function QuotationForProject({ projectId, client }: { projectId: string; client: boolean }) {
  return <section className="project-quotation-workspace" aria-labelledby="project-estimation-title">
    <PageHeader id="project-estimation-title" title="Estimation"
      breadcrumb={<Link to={client ? `/client/projects/${encodeURIComponent(projectId)}` : "/designer/design-plans"}>{client ? "Back to project" : "Back to design plans"}</Link>} />
    {client ? <ClientEstimationWorkspace projectId={projectId} workspace /> : <ClientQuotation projectId={projectId} workspace readOnly />}
  </section>;
}

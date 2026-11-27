import { ClientEstimateQueryProvider, useClientEstimates } from "../estimates/clientEstimateQuery";
import { useAuth } from "../../auth/AuthProvider";
import { ClientEstimateDesignReview } from "../estimates/ClientEstimateDesignReview";
import { ClientQuotation } from "./ClientQuotation";

export function ClientEstimationWorkspace({ projectId, workspace = false, showDesignReview = true }: { projectId: string; workspace?: boolean; showDesignReview?: boolean }) {
  const { user, reviewSession } = useAuth();
  return <ClientEstimateQueryProvider><WorkspaceForProject key={`${projectId}:${reviewSession?.id ?? user?.id}`} projectId={projectId} workspace={workspace} showDesignReview={showDesignReview} /></ClientEstimateQueryProvider>;
}

function WorkspaceForProject({ projectId, workspace, showDesignReview }: { projectId: string; workspace: boolean; showDesignReview: boolean }) {
  const reviews = useClientEstimates();
  const matching = reviews.isError ? [] : reviews.data?.filter(estimate => estimate.projectId === projectId) ?? [];
  const estimate = matching.length === 1 ? matching[0]! : null;
  return <div id="estimate-review-title" className="client-estimation-workspace" tabIndex={-1}>
    <ClientQuotation projectId={projectId} workspace={workspace} review={{ estimate,
      loading: reviews.isPending, refreshing: reviews.isFetching,
      error: reviews.isError ? "The submitted estimate could not be verified. Refresh before reviewing or approving."
        : matching.length > 1 ? "The current estimate for this project could not be verified. Please contact your Sales team." : null,
      refresh: async () => (await reviews.refetch()).isSuccess
    }} />
    {showDesignReview && estimate ? <ClientEstimateDesignReview estimate={estimate} /> : null}
  </div>;
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { listKnowledgeMasters } from "../ai-estimator-knowledge/knowledgeApi";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";

export function ProcurementDashboardPage() {
  const auth = useAuth();
  const canRead = auth.user?.role === "super_admin" &&
    hasFrontendPermission(auth.authorization, "procurement.vendor_directory.read");
  const overview = useQuery({
    queryKey: knowledgeQueryKeys.vendorDirectoryOverview(),
    queryFn: () => listKnowledgeMasters("vendors", {
      includeDirectoryOverview: true,
      limit: 1,
      offset: 0
    }),
    enabled: canRead
  });
  const denied = overview.error instanceof ApiError &&
    (overview.error.status === 401 || overview.error.status === 403);
  const counts = overview.data?.directoryOverview;

  return (
    <section className="procurement-dashboard" aria-labelledby="procurement-dashboard-title">
      <PageHeader
        id="procurement-dashboard-title"
        eyebrow="Procurement"
        title="Procurement dashboard"
        description="Vendor activity across the shared directory."
      />
      {!canRead || denied ? (
        <PageState state="error" message="You do not have permission to view procurement metrics." />
      ) : overview.isPending ? (
        <p role="status">Loading procurement metrics…</p>
      ) : overview.isError || !counts ? (
        <PageState
          state="error"
          message="Procurement metrics could not be loaded."
          action={{ label: "Retry metrics", onAction: () => void overview.refetch() }}
        />
      ) : (
        <section className="procurement-dashboard__overview" aria-labelledby="procurement-dashboard-overview-title" aria-busy={overview.isFetching || undefined}>
          <h2 id="procurement-dashboard-overview-title" className="procurement-dashboard__overview-heading">Vendor overview</h2>
          <dl className="procurement-dashboard__metrics">
            <div className="procurement-dashboard__metric"><dt>Total vendors</dt><dd>{counts.totalVendors.toLocaleString("en-IN")}</dd></div>
            <div className="procurement-dashboard__metric"><dt>Active vendors</dt><dd>{counts.activeVendors.toLocaleString("en-IN")}</dd></div>
            <div className="procurement-dashboard__metric"><dt>Under review</dt><dd>{counts.underReviewVendors.toLocaleString("en-IN")}</dd></div>
          </dl>
          {counts.totalVendors === 0 ? <p className="procurement-dashboard__next">No vendors are in the directory yet. <Link to="/admin/procurement/vendors">Open Vendors</Link> to add one.</p> : <p className="procurement-dashboard__next"><Link to="/admin/procurement/vendors">Open Vendors</Link> to manage vendor profiles.</p>}
          {overview.isFetching ? <p className="procurement-dashboard__refresh" role="status">Refreshing vendor metrics…</p> : null}
        </section>
      )}
    </section>
  );
}

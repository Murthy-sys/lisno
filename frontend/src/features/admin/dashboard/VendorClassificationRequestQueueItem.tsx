import { Link } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { VENDOR_REQUEST_REVIEW_HREF } from "../../procurement/useVendorBasketRequestCount";
import type { DashboardVendorQuery } from "./dashboardViewModel";

export function VendorClassificationRequestQueueItem({ count }: { count: DashboardVendorQuery }) {
  const detail = count.isError
    ? count.data === undefined ? "Count unavailable" : "Previous count; refresh failed"
    : count.isPending ? "Loading count…" : count.data === 0 ? "No pending requests" : "Requires review";

  return <tr className="dashboard-vendor-request-queue">
    <th scope="row"><Link to={VENDOR_REQUEST_REVIEW_HREF}>Vendor classification requests</Link></th>
    <td><strong aria-label={count.data === undefined ? detail : `${count.data} pending vendor classification requests`}>
      {count.data ?? "Not available"}
    </strong></td>
    <td><span className="dashboard-action-status">{detail}</span>
      <Button variant="quiet" disabled={count.isFetching} onClick={() => void count.refetch()}>
        {count.isError ? "Retry request count" : "Refresh request count"}
      </Button>
    </td>
  </tr>;
}

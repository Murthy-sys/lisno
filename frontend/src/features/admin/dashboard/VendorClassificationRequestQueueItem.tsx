import { Link } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { useVendorBasketRequestCount, VENDOR_REQUEST_REVIEW_HREF } from "../../procurement/useVendorBasketRequestCount";

export function VendorClassificationRequestQueueItem() {
  const count = useVendorBasketRequestCount(true);
  const detail = count.isError
    ? count.data === undefined ? "Count unavailable" : "Previous count; refresh failed"
    : count.isPending ? "Loading count…" : count.data === 0 ? "No pending requests" : "Requires review";

  return <li className="dashboard-vendor-request-queue">
    <Link to={VENDOR_REQUEST_REVIEW_HREF}>
      <span>
        <strong>Vendor classification requests</strong>
        <small>{detail} · Review requests</small>
      </span>
      <b aria-label={count.data === undefined ? detail : `${count.data} pending vendor classification requests`}>
        {count.data ?? "—"}
      </b>
    </Link>
    <Button variant="quiet" disabled={count.isFetching} onClick={() => void count.refetch()}>
      {count.isError ? "Retry request count" : "Refresh request count"}
    </Button>
  </li>;
}

import { useQuery } from "@tanstack/react-query";

import { listVendorBasketRequestsForReview, vendorBasketRequestKeys } from "./vendorBasketRequestApi";

export const VENDOR_REQUEST_REFRESH_INTERVAL = 30_000;
export const VENDOR_REQUEST_REVIEW_HREF = "/admin/configuration/estimation?basketRequests=pending";

export function useVendorBasketRequestCount(enabled: boolean) {
  return useQuery({
    queryKey: vendorBasketRequestKeys.reviewPage("pending", 1, 0),
    queryFn: () => listVendorBasketRequestsForReview("pending", 1, 0),
    select: (page) => page.pagination.total,
    enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: VENDOR_REQUEST_REFRESH_INTERVAL,
    refetchIntervalInBackground: false
  });
}

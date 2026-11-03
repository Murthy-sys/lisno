import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { listKnowledgeMasters } from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import "./knowledgeVendorBlockers.css";

export interface KnowledgeVendorBlockersProps {
  readonly basketId: string;
  readonly subBasketId?: string;
  readonly vendorReferenceCount: number;
  readonly onOpenVendor?: (vendorId: string) => void;
  readonly onRefreshImpact: () => void | Promise<unknown>;
  /** True while the list cannot verify the reviewed impact count. */
  readonly onMismatchChange?: (mismatch: boolean) => void;
  readonly disabled?: boolean;
}

const PAGE_SIZE = 20;

export function KnowledgeVendorBlockers(props: KnowledgeVendorBlockersProps) {
  const auth = useAuth();
  const actorId = auth.user?.id ?? "";
  const staff = auth.user?.role === "super_admin" || auth.user?.role === "procurement";
  const canRead = Boolean(actorId && staff && hasFrontendPermission(auth.authorization, "procurement.vendor_directory.read"));
  const canOpen = canRead && hasFrontendPermission(auth.authorization, "procurement.vendor_kpi.read");
  return <VendorBlockerPage key={JSON.stringify([actorId, props.basketId, props.subBasketId])}
    {...props} actorId={actorId} canRead={canRead} canOpen={canOpen} />;
}

function VendorBlockerPage({ basketId, subBasketId, vendorReferenceCount, onOpenVendor, onRefreshImpact,
  onMismatchChange, disabled = false, actorId, canRead, canOpen
}: KnowledgeVendorBlockersProps & { actorId: string; canRead: boolean; canOpen: boolean }) {
  const headingId = useId();
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);
  const focusPage = useRef(false);
  const params = { includeArchived: true, limit: PAGE_SIZE, offset,
    ...(subBasketId ? { subBasketId } : { mainBasketId: basketId }) };
  const query = useQuery({
    queryKey: [...knowledgeQueryKeys.masterLists("vendors"), "deletion-blockers", actorId, params],
    queryFn: () => listKnowledgeMasters("vendors", params),
    enabled: canRead, retry: false, gcTime: 0, staleTime: 0, refetchOnMount: "always"
  });
  const denied = query.error instanceof ApiError && [401, 403].includes(query.error.status);
  const data = canRead && !denied ? query.data : undefined;
  const mismatch = data !== undefined && data.pagination.total !== vendorReferenceCount;
  const unverified = canRead && (!query.isSuccess || query.isFetching || query.isPaused || refreshing || Boolean(refreshError) || mismatch);

  useEffect(() => { onMismatchChange?.(unverified); }, [onMismatchChange, unverified]);
  useEffect(() => {
    if (query.isFetching || !focusPage.current) return;
    focusPage.current = false;
    resultsRef.current?.focus();
  }, [offset, query.isFetching]);

  async function refresh() {
    setRefreshing(true);
    setRefreshError("");
    const results = await Promise.allSettled([Promise.resolve().then(onRefreshImpact), query.refetch({ throwOnError: true })]);
    if (results.some((result) => result.status === "rejected")) {
      setRefreshError("The latest vendor assignments or deletion impact could not be loaded. Retry before confirming deletion.");
    }
    setRefreshing(false);
  }

  function goToPage(nextOffset: number) {
    focusPage.current = true;
    setRefreshError("");
    setOffset(Math.max(0, nextOffset));
  }

  if (!canRead || denied) return <InlineMessage tone="warning">
    You do not have access to the vendors blocking deletion. Ask an authorized administrator to review their basket assignments.
  </InlineMessage>;

  return <section className="knowledge-vendor-blockers" aria-labelledby={headingId}>
    <h3 id={headingId}>Vendors assigned to this {subBasketId ? "Sub-basket" : "Main Basket"}</h3>
    <p>Open a vendor to reassign or remove its basket assignment. Archived vendors retain their assignments.</p>
    <div ref={resultsRef} tabIndex={-1} className="knowledge-vendor-blockers__results" aria-busy={query.isFetching || refreshing || undefined}>
      {query.isPaused ? <InlineMessage tone="warning" role="status">The vendor list is paused while offline. Reconnect and retry.</InlineMessage>
        : query.isPending ? <p role="status">Loading assigned vendors…</p>
          : query.isError ? <InlineMessage tone="error" title="Assigned vendors could not be loaded">
            {query.error.message} Deletion still requires a current impact check.
          </InlineMessage>
            : data ? <>
              {query.isFetching ? <p role="status">Refreshing assigned vendors…</p> : null}
              {data.items.length ? <ul aria-label="Vendors blocking deletion" className="knowledge-vendor-blockers__list">
                {data.items.map((vendor) => <li key={vendor.id}>
                  <div><strong>{vendor.name}</strong><span>{vendor.code} · {vendor.status === "archived" ? "Archived" : vendor.status === "inactive" ? "Inactive" : "Active"}</span></div>
                  {canOpen && onOpenVendor ? <Button size="compact" variant="secondary"
                    disabled={disabled || refreshing || query.isFetching}
                    aria-label={`Open vendor details for ${vendor.name} (${vendor.code})`}
                    onClick={() => onOpenVendor(vendor.id)}>Open vendor details</Button> : null}
                </li>)}
              </ul> : <p role="status">{offset ? "No assigned vendors remain on this page. Return to the previous page or refresh the impact." : "No assigned vendors were found. Refresh the deletion impact before continuing."}</p>}
              {!canOpen || !onOpenVendor ? <p>Vendor details navigation is unavailable with your current access.</p> : null}
            </> : null}
      {mismatch && !query.isError ? <InlineMessage tone="warning" title="Vendor assignments changed">
        The vendor list and deletion preview no longer agree. Refresh the deletion impact and review it again.
      </InlineMessage> : null}
      {refreshError ? <InlineMessage tone="error">{refreshError}</InlineMessage> : null}
    </div>
    <div className="knowledge-vendor-blockers__actions">
      <Button variant="quiet" size="compact" disabled={disabled || query.isFetching || refreshing}
        onClick={() => void refresh()}>{query.isError || query.isPaused || refreshError ? "Retry vendor list and impact" : "Refresh vendor list and impact"}</Button>
      {offset > 0 || data?.pagination.hasMore ? <nav aria-label="Assigned vendor pages">
        <Button variant="secondary" size="compact" aria-label="Previous assigned vendor page"
          disabled={disabled || offset === 0 || query.isFetching || refreshing} onClick={() => goToPage(offset - PAGE_SIZE)}>Previous</Button>
        {data && !query.isError ? <span>{data.items.length ? offset + 1 : 0}–{Math.min(offset + data.items.length, data.pagination.total)} of {data.pagination.total}</span> : null}
        <Button variant="secondary" size="compact" aria-label="Next assigned vendor page"
          disabled={disabled || !data?.pagination.hasMore || query.isError || query.isFetching || refreshing} onClick={() => goToPage(offset + PAGE_SIZE)}>Next</Button>
      </nav> : null}
    </div>
  </section>;
}

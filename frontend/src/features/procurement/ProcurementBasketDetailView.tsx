import { useQuery } from "@tanstack/react-query";

import { PageState } from "../../components/ui/PageState";
import { ProcurementBasketEnquiry } from "./ProcurementBasketEnquiry";
import { ProcurementBasketScopePanel } from "./ProcurementBasketScopePanel";
import { getProcurementBasket, procurementBasketKeys, type ProcurementBasketSummary } from "./procurementBasketApi";
import { procurementError } from "./procurementPresentation";

export function ProcurementBasketDetailView({ projectId, projectName, basket, frozen }: {
  projectId: string;
  projectName: string;
  basket: ProcurementBasketSummary;
  frozen: boolean;
}) {
  const detail = useQuery({ queryKey: procurementBasketKeys.detail(projectId, basket.id), queryFn: ({ signal }) => getProcurementBasket(projectId, basket.id, signal),
    refetchOnMount: "always", refetchOnWindowFocus: "always" });
  if (detail.isPending) return <PageState state="loading" message={`Loading ${basket.name}…`} />;
  if (detail.isError) return <PageState state="error" message={procurementError(detail.error, "This basket could not be loaded.")} action={{ label: "Try again", onAction: () => void detail.refetch() }} />;
  const current = detail.data;
  const busy = frozen || detail.isFetching;

  return <div className="procurement-basket__detail">
    {busy ? <p className="procurement-basket__stale" role="status">Refreshing approved source. Changes are paused until it is current.</p> : null}
    <ProcurementBasketScopePanel projectId={projectId} projectName={projectName} basket={current} frozen={busy} />
    <ProcurementBasketEnquiry projectId={projectId} projectName={projectName} basket={current} frozen={busy} />
  </div>;
}

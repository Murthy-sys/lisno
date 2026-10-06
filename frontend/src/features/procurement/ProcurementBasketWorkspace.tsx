import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { ProcurementBasketDetailView } from "./ProcurementBasketDetailView";
import { getProcurementBaskets, procurementBasketKeys } from "./procurementBasketApi";
import { procurementError } from "./procurementPresentation";
import "./procurementBasket.css";

export function ProcurementBasketWorkspace({ projectId, projectName, projectSourceStale, currentEstimate }: {
  projectId: string;
  projectName: string;
  projectSourceStale: boolean;
  currentEstimate?: { estimateId: string; estimateVersion: number };
}) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("basket");
  const list = useQuery({ queryKey: procurementBasketKeys.list(projectId), queryFn: ({ signal }) => getProcurementBaskets(projectId, signal),
    refetchOnMount: "always", refetchOnWindowFocus: "always" });
  const sourceMismatch = Boolean(currentEstimate && list.data && (currentEstimate.estimateId !== list.data.estimateSource.estimateId || currentEstimate.estimateVersion !== list.data.estimateSource.estimateVersion));
  const frozen = projectSourceStale || sourceMismatch || list.isFetching || list.isError;
  const selectedBasket = list.data?.baskets.find((basket) => basket.id === selectedId) ?? null;

  function selectBasket(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("basket", id); else next.delete("basket");
    setParams(next, { replace: false });
  }

  return <section className="procurement-basket" aria-label="Project baskets">
    <nav className="procurement-basket__breadcrumb" aria-label="Procurement breadcrumb">
      <button type="button" onClick={() => selectBasket(null)} disabled={!selectedId}>Projects</button>
      <span aria-hidden="true">/</span>
      <button type="button" onClick={() => selectBasket(null)} disabled={!selectedId}>{projectName}</button>
      {selectedBasket ? <><span aria-hidden="true">/</span><strong aria-current="page">{selectedBasket.name}</strong></> : null}
    </nav>
    {list.isPending ? <PageState state="loading" message="Loading approved main baskets…" /> : list.isError ? <PageState state="error" message={procurementError(list.error, "Main baskets could not be loaded.")} action={{ label: "Try again", onAction: () => void list.refetch() }} /> : sourceMismatch ? <PageState state="error" message="The approved estimate changed. Refresh the project before preparing vendor work." action={{ label: "Refresh baskets", onAction: () => void list.refetch() }} /> : !selectedId ? <>
      <div className="procurement-basket__intro"><div><p className="eyebrow">Approved estimate</p><h2>Main baskets</h2></div><span>{list.data.baskets.length} basket{list.data.baskets.length === 1 ? "" : "s"}</span></div>
      {!list.data.baskets.length ? <PageState state="empty" message="No approved main baskets are available for this project." /> : <div className="procurement-basket__cards">{list.data.baskets.map((basket) => {
        const standard = basket.classification === "standard";
        const cost = basket.standardCost;
        const standardComplete = Boolean(cost?.complete && cost.totalPaise !== null);
        return <button className="procurement-basket__card" key={basket.id} type="button" onClick={() => selectBasket(basket.id)}>
        <span className="procurement-basket__card-top"><strong>{basket.name}</strong><span aria-hidden="true">→</span></span>
        <span className="procurement-basket__card-detail">{basket.includedLineCount} included line{basket.includedLineCount === 1 ? "" : "s"}</span>
        <span className="procurement-basket__card-values"><span>Approved estimate <strong>{formatPaise(basket.approvedEstimatePaise)}</strong></span><span>Total<strong>{standard ? standardComplete ? formatPaise(cost!.totalPaise!) : "Incomplete" : basket.workingTotalComplete ? formatPaise(basket.adjustedCostPaise) : "Incomplete"}</strong></span></span>
        <span className="procurement-basket__card-foot">Committed net {formatPaise(basket.committedNetPaise)}</span>
      </button>})}</div>}
    </> : !selectedBasket ? <PageState state="empty" message="This main basket is no longer in the approved estimate." action={{ label: "Back to baskets", onAction: () => selectBasket(null) }} /> : <>
      <button className="procurement-basket__back" type="button" onClick={() => selectBasket(null)}>← Back to main baskets</button>
      <ProcurementBasketDetailView key={`${projectId}:${selectedBasket.id}`} projectId={projectId} projectName={projectName} basket={selectedBasket} frozen={frozen} />
    </>}
  </section>;
}

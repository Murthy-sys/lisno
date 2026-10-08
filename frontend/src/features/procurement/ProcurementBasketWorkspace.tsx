import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PageState } from "../../components/ui/PageState";
import { ProcurementBasketDetailView } from "./ProcurementBasketDetailView";
import { initialProcurementBasketView, ProcurementBasketModeGroups } from "./ProcurementBasketModeGroups";
import { getProcurementBaskets, hasValidProcurementModeGroups, procurementBasketKeys } from "./procurementBasketApi";
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
  const [viewPreferences, setViewPreferences] = useState(initialProcurementBasketView);
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
      {hasValidProcurementModeGroups(list.data)
        ? <ProcurementBasketModeGroups groups={list.data.modeGroups} preferences={viewPreferences} onPreferencesChange={setViewPreferences} onOpen={selectBasket} />
        : <PageState state="error" message="Approved estimate mode groups are unavailable. Refresh baskets to load the current grouping." action={{ label: "Refresh baskets", onAction: () => void list.refetch() }} />}
    </> : !selectedBasket ? <PageState state="empty" message="This main basket is no longer in the approved estimate." action={{ label: "Back to baskets", onAction: () => selectBasket(null) }} /> : <>
      <button className="procurement-basket__back" type="button" onClick={() => selectBasket(null)}>← Back to main baskets</button>
      <ProcurementBasketDetailView key={`${projectId}:${selectedBasket.id}`} projectId={projectId} projectName={projectName} basket={selectedBasket} frozen={frozen} />
    </>}
  </section>;
}

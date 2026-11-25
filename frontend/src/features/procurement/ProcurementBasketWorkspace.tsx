import type { WorkOrderIssueReadiness } from "../../api/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PageState } from "../../components/ui/PageState";
import { ProcurementBasketDetailView } from "./ProcurementBasketDetailView";
import { initialProcurementBasketView, ProcurementBasketModeGroups } from "./ProcurementBasketModeGroups";
import { initialProcurementPriorityView, ProcurementBasketPriorityGroups } from "./ProcurementBasketPriorityGroups";
import { getProcurementBaskets, hasValidProcurementModeGroups, hasValidProcurementPriorityGroups, procurementBasketKeys } from "./procurementBasketApi";
import { procurementError } from "./procurementPresentation";
import "./procurementBasket.css";

interface ProcurementBasketWorkspaceProps {
  issueReadiness?: WorkOrderIssueReadiness;
  projectId: string;
  projectName: string;
  projectSourceStale: boolean;
  currentEstimate?: { estimateId: string; estimateVersion: number };
}

export function ProcurementBasketWorkspace(props: ProcurementBasketWorkspaceProps) {
  return <ProjectBasketWorkspace key={props.projectId} {...props} />;
}

function ProjectBasketWorkspace({ projectId, projectName, projectSourceStale, currentEstimate, issueReadiness }: ProcurementBasketWorkspaceProps) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("basket");
  const [viewPreferences, setViewPreferences] = useState(initialProcurementBasketView);
  const [overview, setOverview] = useState<"priority" | "mode">("priority");
  const [priorityPreferences, setPriorityPreferences] = useState(initialProcurementPriorityView);
  const list = useQuery({ queryKey: procurementBasketKeys.list(projectId), queryFn: ({ signal }) => getProcurementBaskets(projectId, signal),
    refetchOnMount: "always", refetchOnWindowFocus: "always" });
  const identityMismatch = Boolean(list.data && list.data.projectId !== projectId);
  const sourceMismatch = Boolean(currentEstimate && list.data && (currentEstimate.estimateId !== list.data.estimateSource.estimateId || currentEstimate.estimateVersion !== list.data.estimateSource.estimateVersion));
  const frozen = projectSourceStale || sourceMismatch || identityMismatch || list.isFetching || list.isError;
  const selectedBasket = !list.isError && !identityMismatch ? list.data?.baskets.find((basket) => basket.id === selectedId) ?? null : null;

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
    {list.isPending ? <PageState state="loading" message="Loading approved main baskets…" /> : list.isError ? <PageState state="error" message={procurementError(list.error, "Main baskets could not be loaded.")} action={{ label: "Try again", onAction: () => void list.refetch() }} /> : identityMismatch ? <PageState state="error" message="Procurement data does not match this project. Refresh baskets to try again." action={{ label: "Refresh baskets", onAction: () => void list.refetch() }} /> : sourceMismatch ? <PageState state="error" message="The approved estimate changed. Refresh the project before preparing vendor work." action={{ label: "Refresh baskets", onAction: () => void list.refetch() }} /> : !selectedId ? <>
      <div className="procurement-basket__overview-choice" role="group" aria-label="Project item grouping">
        <button type="button" aria-pressed={overview === "priority"} onClick={() => setOverview("priority")}>By priority</button>
        <button type="button" aria-pressed={overview === "mode"} onClick={() => setOverview("mode")}>By execution mode</button>
      </div>
      {list.isFetching ? <p className="procurement-basket__stale" role="status">Refreshing project items…</p> : null}
      <div aria-busy={list.isFetching || undefined}>
        {overview === "priority" ? hasValidProcurementPriorityGroups(list.data)
          ? <ProcurementBasketPriorityGroups groups={list.data.priorityGroups} preferences={priorityPreferences} onPreferencesChange={setPriorityPreferences} onOpen={selectBasket} />
          : <PageState state="error" message="Main Line priorities are unavailable. Refresh baskets or use By execution mode." action={{ label: "Refresh baskets", onAction: () => void list.refetch() }} />
          : hasValidProcurementModeGroups(list.data)
            ? <ProcurementBasketModeGroups groups={list.data.modeGroups} preferences={viewPreferences} onPreferencesChange={setViewPreferences} onOpen={selectBasket} />
            : <PageState state="error" message="Approved estimate mode groups are unavailable. Refresh baskets to load the current grouping." action={{ label: "Refresh baskets", onAction: () => void list.refetch() }} />}
      </div>
    </> : !selectedBasket ? <PageState state="empty" message="This main basket is no longer in the approved estimate." action={{ label: "Back to baskets", onAction: () => selectBasket(null) }} /> : <>
      <button className="procurement-basket__back" type="button" onClick={() => selectBasket(null)}>← Back to main baskets</button>
      <ProcurementBasketDetailView key={`${projectId}:${selectedBasket.id}`} projectId={projectId} projectName={projectName} basket={selectedBasket} frozen={frozen} issueReadiness={issueReadiness} />
    </>}
  </section>;
}

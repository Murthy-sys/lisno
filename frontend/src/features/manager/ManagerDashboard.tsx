import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AsyncState } from "../../components/ui/AsyncState";
import { DesignerCard } from "../../components/ui/DesignerCard";
import { getManagerTeam, managementKeys } from "./managerApi";

export function ManagerDashboard() {
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: managementKeys.team, queryFn: getManagerTeam });
  const designers = useMemo(() => (query.data ?? []).filter((designer) => designer.user.name.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  if (query.isPending) return <AsyncState state="loading" message="Loading your team…" />;
  if (query.isError) return <AsyncState state="error" message="We couldn't load your team." actionLabel="Try again" onAction={() => void query.refetch()} />;
  return <section className="designer-page" aria-labelledby="manager-title">
    <header className="workspace-header"><div><p className="eyebrow">Design manager</p><h1 id="manager-title">Team delivery pulse</h1><p>Review workload, delivery risk, and calculated KPI by direct report.</p></div></header>
    <label className="sr-only" htmlFor="designer-search">Search designers</label><input id="designer-search" placeholder="Search designers" value={search} onChange={(event) => setSearch(event.target.value)} />
    {designers.length ? <div className="designer-grid">{designers.map((designer) => <DesignerCard key={designer.user.id} designer={designer} to={`/manager/designers/${designer.user.id}`} />)}</div> : <p className="inline-empty">No matching direct reports.</p>}
  </section>;
}

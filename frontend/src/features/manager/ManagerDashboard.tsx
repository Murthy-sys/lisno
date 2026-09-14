import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AsyncState } from "../../components/ui/AsyncState";
import { Field, Input } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { getManagerTeam, managementKeys } from "./managerApi";
import { EstimateReviewPanel } from "../estimates/EstimateReviewPanel";
import { DesignerQuickReview, DesignerRecord } from "./DesignerQuickReview";
import "./managementWorkspace.css";

export function ManagerDashboard() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: managementKeys.team, queryFn: getManagerTeam });
  const designers = useMemo(() => (query.data ?? []).filter((designer) => designer.user.name.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  if (query.isPending) return <AsyncState state="loading" message="Loading your team…" />;
  if (query.isError) return <AsyncState state="error" message="We couldn't load your team." actionLabel="Try again" onAction={() => void query.refetch()} />;
  const selectedDesigner = query.data.find((designer) => designer.user.id === selectedId);
  return (
    <section className="designer-page management-workspace" aria-labelledby="manager-title">
      <PageHeader id="manager-title" eyebrow="Design manager" title="Team delivery pulse" description="Review workload, delivery risk, and calculated KPI by direct report." />
      <EstimateReviewPanel />
      <section aria-labelledby="manager-team-title">
        <div className="management-toolbar">
          <div><h2 id="manager-team-title">Direct reports</h2><p>{designers.length} of {query.data.length} designers</p></div>
          <Field id="designer-search" label="Search designers">{(props) => <Input {...props} type="search" placeholder="Search designers" value={search} onChange={(event) => setSearch(event.target.value)} />}</Field>
        </div>
        {designers.length ? <div className="management-designer-list">{designers.map((designer) => <DesignerRecord key={designer.user.id} designer={designer} base="/manager" onReview={() => setSelectedId(designer.user.id)} />)}</div> : <p className="inline-empty">No matching direct reports.</p>}
      </section>
      {selectedDesigner ? <DesignerQuickReview key={selectedDesigner.user.id} designer={selectedDesigner} base="/manager" onClose={() => setSelectedId(null)} /> : null}
    </section>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AsyncState } from "../../components/ui/AsyncState";
import { Field, Input } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { OrganizationTree } from "./OrganizationTree";
import { getOrganization, managementKeys } from "../manager/managerApi";
import "../manager/managementWorkspace.css";

export function HeadDashboard() {
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: managementKeys.organization, queryFn: getOrganization });
  if (query.isPending) return <AsyncState state="loading" message="Loading organization health…" />;
  if (query.isError) return <AsyncState state="error" message="We couldn't load the organization." actionLabel="Try again" onAction={() => void query.refetch()} />;
  const searchText = search.trim().toLowerCase();
  const managers = query.data.filter((manager) => manager.name.toLowerCase().includes(searchText) || manager.designers.some((designer) => designer.name.toLowerCase().includes(searchText)));
  return (
    <section className="designer-page management-workspace" aria-labelledby="head-title">
      <PageHeader id="head-title" eyebrow="Design head" title="Organization delivery health" description="Expand a manager to review team performance and evaluation coverage." />
      <div className="management-toolbar">
        <div><h2>Design organization</h2><p>{managers.length} of {query.data.length} teams</p></div>
        <Field id="organization-search" label="Search managers or designers">{(props) => <Input {...props} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />}</Field>
      </div>
      {managers.length ? <OrganizationTree managers={managers} /> : <p className="inline-empty">No matching teams.</p>}
    </section>
  );
}

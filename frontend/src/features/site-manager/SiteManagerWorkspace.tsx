import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { KpiPanel } from "../../components/kpi/KpiPanel";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { useExecutionConnection } from "../execution/ExecutionLiveProvider";
import { executionApi, executionKeys } from "../execution/executionApi";
import { executionLabel } from "../execution/executionPresentation";
import { procurementError } from "../procurement/procurementPresentation";
import { isSiteAccessError, SitePagination, siteOffset, sitePageSize } from "./siteManagerPresentation";
import "./site-manager.css";

export function SiteManagerWorkspace() {
  const auth = useAuth();
  const client = useQueryClient();
  const [accessRemoved, setAccessRemoved] = useState(false);
  const connection = useExecutionConnection();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filters = { projectScope: "current" as const, q: params.get("q")?.slice(0, 200) || undefined, limit: sitePageSize, offset: siteOffset(params.get("offset")) };
  const query = useQuery({ queryKey: executionKeys.projects(filters), queryFn: ({ signal }) => executionApi.projects(filters, signal), enabled: !accessRemoved, refetchInterval: connection === "live" || connection === "denied" ? false : 15_000, refetchIntervalInBackground: false, retry: (count, error) => !isSiteAccessError(error) && count < 1 });
  const denied = accessRemoved || isSiteAccessError(query.error) || connection === "denied";
  useEffect(() => {
    if (!denied || accessRemoved) return;
    setAccessRemoved(true);
    void client.cancelQueries({ queryKey: ["execution", "projects"] });
    client.removeQueries({ queryKey: ["execution", "projects"] });
  }, [accessRemoved, client, denied]);
  const data = denied ? undefined : query.data;
  function filter(key: string, value: string) {
    setParams(old => { const next = new URLSearchParams(old); value ? next.set(key, value) : next.delete(key); if (key !== "offset") next.delete("offset"); return next; }, { replace: true });
  }
  return <div className="site-workspace">
    <h1>Site Manager workspace</h1>
    {auth.user ? <KpiPanel userId={auth.user.id} /> : null}
    <section className="site-workspace__projects" aria-labelledby="site-assigned-projects">
      <div className="site-workspace__heading"><h2 id="site-assigned-projects">Assigned projects</h2><Button variant="secondary" size="compact" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh projects</Button></div>
      <Field id="site-project-search" label="Search assigned projects">{props => <Input {...props} type="search" maxLength={200} value={filters.q ?? ""} onChange={event => filter("q", event.target.value)} />}</Field>
      {connection === "offline" ? <p className="site-workspace__muted" role="status">Offline. Project information may be out of date.</p> : null}
      {denied ? <PageState state="error" message="Your assigned projects are no longer available. Sign in again or contact your administrator." /> : query.isPending ? <PageState state="loading" message="Loading assigned projects…" /> : !data ? <PageState state="error" message={procurementError(query.error, "Assigned projects could not be loaded.")} action={{ label: "Try again", onAction: () => void query.refetch() }} /> : <>
        {query.isError ? <InlineMessage tone="warning">Refresh failed. This project list may be out of date.</InlineMessage> : null}
        {data.items.length ? <ul className="site-workspace__project-list">{data.items.map(project => <li key={project.id}><div><h3>{project.name}</h3><span className="site-workspace__muted">{executionLabel(project.status)}</span></div><Link to={`/projects/${encodeURIComponent(project.id)}/execution`} state={{ siteManagerReturnTo: `/home${location.search}` }} aria-label={`Open project ${project.name}`}>Open project</Link></li>)}</ul> : <PageState state="empty" message={filters.q ? "No assigned projects match your search." : "You have no current assigned projects."} />}
        <SitePagination offset={data.offset} count={data.items.length} total={data.total} busy={query.isFetching} onChange={offset => filter("offset", String(offset))} />
      </>}
    </section>
  </div>;
}

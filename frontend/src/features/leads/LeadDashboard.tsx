import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";

import type { LeadStage } from "../../api/types";
import { AsyncState } from "../../components/ui/AsyncState";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { LeadCreateDialog } from "./LeadCreateDialog";
import {
  downloadEstimatePdf,
  getLeadPage,
  getSavedEstimates,
  leadKeys
} from "./leadsApi";

const labels: Record<LeadStage, string> = {
  new_lead: "New lead",
  contacted: "Contacted",
  site_visit: "Site visit",
  design_meeting: "Design meeting",
  estimate_in_progress: "Estimate in progress",
  estimate_sent: "Estimate sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost"
};
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function LeadDashboard() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: leadKeys.page(search, stage),
    queryFn: () => getLeadPage(search, stage)
  });
  const estimates = useQuery({
    queryKey: [...leadKeys.all, "saved-estimates"],
    queryFn: getSavedEstimates
  });

  if (query.isPending) return <AsyncState state="loading" message="Loading your leads…" />;
  if (query.isError) return <AsyncState state="error" message="We couldn't load your leads." actionLabel="Try again" onAction={() => void query.refetch()} />;

  return <section className="lead-page" aria-labelledby="lead-title">
    <header className="workspace-header">
      <div>
        <p className="eyebrow">Estimator / Sales</p>
        <h1 id="lead-title">Lead workspace</h1>
        <p>Track client conversations and continue every saved estimate.</p>
      </div>
      <button className="button button--primary" onClick={() => setCreating(true)}>New lead</button>
    </header>

    <section className="saved-estimates" aria-labelledby="saved-estimates-title">
      <header>
        <div>
          <p className="eyebrow">Estimate pipeline</p>
          <h2 id="saved-estimates-title">Saved estimates</h2>
        </div>
        {estimates.data ? <strong>{estimates.data.length} total</strong> : null}
      </header>
      {estimates.isPending ? <p>Loading saved estimates…</p> : null}
      {estimates.isError ? <p role="alert">Saved estimates are unavailable. <button type="button" onClick={() => void estimates.refetch()}>Try again</button></p> : null}
      {estimates.data?.length ? <div className="saved-estimate-grid">
        {estimates.data.map((estimate) => <article className="saved-estimate-card" key={estimate.id}>
          <div className="saved-estimate-card__top">
            <div className="saved-estimate-card__summary">
              <span className="estimate-status">{estimate.status.replaceAll("_", " ")}</span>
              <strong>{money(estimate.total)}</strong>
            </div>
            <DownloadButton
              className="button button--secondary saved-estimate-card__export"
              label="Export as PDF"
              loadingLabel="Preparing PDF..."
              fallbackFilename={`lisno-${estimate.id}.pdf`}
              getFile={() => downloadEstimatePdf(estimate.id)}
            />
          </div>
          <h3>{estimate.lead?.projectName ?? "Saved estimate"}</h3>
          <dl>
            <div><dt>Client</dt><dd>{estimate.lead?.clientName ?? "—"}</dd></div>
            <div><dt>Email</dt><dd>{estimate.lead?.clientEmail ?? "—"}</dd></div>
            <div><dt>Phone</dt><dd>{estimate.lead?.clientMobile ?? "—"}</dd></div>
            <div><dt>Property</dt><dd>{estimate.propertyType}</dd></div>
          </dl>
          <Link className="button button--primary" to={`/estimator-sales/leads/${estimate.leadId}/estimate`}>
            {estimate.status === "draft" ? "Continue estimate" : "View estimate"}
          </Link>
        </article>)}
      </div> : estimates.isSuccess ? <p className="inline-empty">No saved estimates yet. Start one from a lead.</p> : null}
    </section>

    <div className="lead-controls">
      <label>Search leads<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Client, email or project" /></label>
      <label>Lead stage<select value={stage} onChange={(event) => setStage(event.target.value as LeadStage | "all")}><option value="all">All stages</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>

    {query.data.items.length ? <div className="lead-list">
      {query.data.items.map((lead) => <Link key={lead.id} className="lead-row" to={`/estimator-sales/leads/${lead.id}`}>
        <span className="lead-row__client"><strong>{lead.clientName}</strong><small>{lead.clientEmail} · {lead.clientMobile}</small></span>
        <span>{lead.projectName} · {lead.propertyType} · {lead.location}</span>
        <span>{labels[lead.stage]}</span>
        <span>Next: {lead.nextAction}</span>
      </Link>)}
    </div> : <div className="inline-empty"><h2>No leads yet</h2><p>Create a lead to start tracking an opportunity.</p></div>}

    {creating ? <LeadCreateDialog onClose={() => setCreating(false)} /> : null}
  </section>;
}

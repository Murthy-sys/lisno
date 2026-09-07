import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { Download } from "lucide-react";

import type { Lead, LeadStage } from "../../api/types";
import { AsyncState } from "../../components/ui/AsyncState";
import { DownloadButton } from "../../components/ui/DownloadButton";
import "../../styles/estimator-dashboard.css";
import {
  downloadEstimatePdf,
  getLeadPage,
  getSavedEstimates,
  leadKeys,
  type SavedEstimate
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
  const query = useQuery({
    queryKey: leadKeys.page(search, stage),
    queryFn: () => getLeadPage(search, stage)
  });
  const estimates = useQuery({
    queryKey: [...leadKeys.all, "saved-estimates"],
    queryFn: getSavedEstimates
  });
  const savedEstimates = estimates.data ?? [];
  const draftEstimates = savedEstimates.filter((estimate) => estimate.status === "draft").length;
  const savedValue = savedEstimates.reduce((total, estimate) => total + estimate.total, 0);
  const estimateByLead = new Map(savedEstimates.map((estimate) => [estimate.leadId, estimate]));

  if (query.isPending) return <AsyncState state="loading" message="Loading your leads…" />;
  if (query.isError) return <AsyncState state="error" message="We couldn't load your leads." actionLabel="Try again" onAction={() => void query.refetch()} />;

  return <section className="lead-page estimator-dashboard" aria-labelledby="lead-title">
    <header className="workspace-header">
      <div>
        <p className="eyebrow">Estimator / Sales</p>
        <h1 id="lead-title">Lead workspace</h1>
        <p>Track client conversations and continue every saved estimate.</p>
      </div>
    </header>

    <section className="estimator-dashboard__overview" aria-label="Pipeline overview">
      <dl>
        <div><dt>Visible leads</dt><dd>{query.data.items.length}</dd></div>
        <div><dt>Saved estimates</dt><dd>{estimates.isSuccess ? savedEstimates.length : "—"}</dd></div>
        <div><dt>Draft estimates</dt><dd>{estimates.isSuccess ? draftEstimates : "—"}</dd></div>
        <div><dt>Saved value</dt><dd>{estimates.isSuccess ? money(savedValue) : "—"}</dd></div>
      </dl>
      {estimates.isError ? (
        <p role="alert">
          Saved estimates are unavailable.{" "}
          <button type="button" onClick={() => void estimates.refetch()}>
            Try again
          </button>
        </p>
      ) : null}
    </section>

    <div className="lead-controls">
      <label>Search leads<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Client, email or project" /></label>
      <label>Lead stage<select value={stage} onChange={(event) => setStage(event.target.value as LeadStage | "all")}><option value="all">All stages</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>

    <section className="estimator-dashboard__section" aria-labelledby="leads-title">
      <header className="estimator-dashboard__section-heading">
        <div><p className="eyebrow">Opportunity pipeline</p><h2 id="leads-title">Leads</h2></div>
        <span>{query.data.items.length} total</span>
      </header>
      {query.data.items.length ? <div className="lead-list">
        <div className="lead-list__header" aria-hidden="true">
          <span>Client</span><span>Project</span><span>Stage</span><span>Estimate</span><span>Actions</span>
        </div>
        {query.data.items.map((lead) => <LeadRow
          key={lead.id}
          lead={lead}
          estimate={estimateByLead.get(lead.id)}
          estimatesPending={estimates.isPending}
          estimatesUnavailable={estimates.isError}
        />)}
      </div> : <div className="inline-empty"><h2>No leads yet</h2><p>Leads appear here once an admin initiates a project.</p></div>}
    </section>
  </section>;
}

function LeadRow({
  lead,
  estimate,
  estimatesPending,
  estimatesUnavailable
}: {
  lead: Lead;
  estimate: SavedEstimate | undefined;
  estimatesPending: boolean;
  estimatesUnavailable: boolean;
}) {
  const leadPath = `/estimator-sales/leads/${lead.id}`;
  const projectHeadingId = `lead-${lead.id}-project`;

  return <article className="lead-row" aria-labelledby={projectHeadingId}>
    <span className="lead-row__client" data-label="Client">
      <Link className="lead-row__name" to={leadPath}>{lead.clientName}</Link>
      <small>{lead.clientEmail} · {lead.clientMobile}</small>
    </span>
    <span className="lead-row__project" data-label="Project">
      <h3 id={projectHeadingId}>{lead.projectName}</h3>
      <small>{lead.propertyType} · {lead.location}</small>
    </span>
    <span data-label="Stage"><span className={`lead-stage-badge lead-stage-badge--${lead.stage}`}>{labels[lead.stage]}</span></span>
    <span className="lead-row__estimate" data-label="Estimate">
      {estimate ? <>
        <span className="estimate-status">{estimate.status.replaceAll("_", " ")}</span>
        <strong>{money(estimate.total)}</strong>
      </> : <small>
        {estimatesPending
          ? "Loading…"
          : estimatesUnavailable
            ? "Unavailable"
            : "No estimate yet"}
      </small>}
    </span>
    <span className="lead-row__actions" data-label="Actions">
      {estimate ? <>
        <Link className="secondary-button lead-row__open" to={`${leadPath}/estimate`}>
          {estimate.status === "draft" ? "Continue estimate" : "View details"}
        </Link>
        {estimate.status !== "draft" ? <DownloadButton
          iconOnly
          className="secondary-button lead-row__export"
          label="Export as PDF"
          loadingLabel="Preparing PDF..."
          errorMessage={`PDF export failed for ${lead.projectName}. Try again.`}
          fallbackFilename={`lisno-${estimate.id}.pdf`}
          getFile={() => downloadEstimatePdf(estimate.id)}
        /> : <div><button type="button" className="secondary-button lead-row__export" disabled aria-hidden="true" tabIndex={-1}>
          <Download aria-hidden="true" size={18} />
        </button></div>}
      </> : <>
        <Link className="secondary-button lead-row__open" to={leadPath}>Open lead</Link>
        <div><button type="button" className="secondary-button lead-row__export" disabled aria-hidden="true" tabIndex={-1}>
          <Download aria-hidden="true" size={18} />
        </button></div>
      </>}
    </span>
  </article>;
}

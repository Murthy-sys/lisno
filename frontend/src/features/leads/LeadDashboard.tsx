import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

import type { Lead, LeadStage } from "../../api/types";
import projectInterior from "../../assets/projects-living-room.webp";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { AsyncState } from "../../components/ui/AsyncState";
import { Button } from "../../components/ui/Button";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { Field, Input } from "../../components/ui/Field";
import { LeadQuickReview } from "./LeadQuickReview";
import { AdminProjectInitiationDialog } from "../admin/AdminProjectInitiationDialog";
import "../../styles/estimator-dashboard.css";
import "./lead-workspace.css";
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
const stages = Object.keys(labels) as LeadStage[];
const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase() ?? "").join("");
}

function nextActionTiming(date: Date | null) {
  if (!date) return null;
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return dueDay < todayStart ? "Overdue" : dueDay === todayStart ? "Due today" : "Upcoming";
}

export function LeadDashboard() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [initiationOpen, setInitiationOpen] = useState(false);
  const [reviewLeadId, setReviewLeadId] = useState<string | null>(null);
  const canReview = hasFrontendPermission(auth.authorization, "estimation.lead.read");
  const canInitiate = hasFrontendPermission(auth.authorization, "projects.initiate");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const query = useQuery({
    queryKey: leadKeys.page(search, stage),
    queryFn: () => getLeadPage(search, stage),
    placeholderData: keepPreviousData
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

  const visibleLeads = query.isPlaceholderData ? [] : query.data.items;
  const filtered = search.trim().length > 0 || stage !== "all";

  return <section className="lead-page estimator-dashboard lead-workspace" aria-labelledby="lead-title">
    <header className="workspace-header lead-workspace__hero">
      <div className="lead-workspace__hero-copy">
        <p className="eyebrow">Sales</p>
        <h1 id="lead-title">Lead workspace</h1>
        <p>Track client conversations and continue every saved estimate.</p>
      </div>
      <img className="lead-workspace__hero-image" src={projectInterior} alt="" aria-hidden="true" />
      {canInitiate ? (
        <Button className="lead-workspace__initiate" onClick={() => setInitiationOpen(true)}>
          Initiate project
        </Button>
      ) : null}
    </header>

    <section className="estimator-dashboard__overview lead-workspace__overview" aria-label="Pipeline overview">
      <dl>
        <div className="lead-workspace__metric lead-workspace__metric--leads">
          <dt>Visible leads</dt><dd>{query.isPlaceholderData ? "—" : visibleLeads.length}</dd>
          <dd className="lead-workspace__metric-note">Shown on this page</dd>
        </div>
        <div className="lead-workspace__metric lead-workspace__metric--saved">
          <dt>Saved estimates</dt><dd>{estimates.isSuccess ? savedEstimates.length : "—"}</dd>
          <dd className="lead-workspace__metric-note">Includes draft estimates</dd>
        </div>
        <div className="lead-workspace__metric lead-workspace__metric--drafts">
          <dt>Draft estimates</dt><dd>{estimates.isSuccess ? draftEstimates : "—"}</dd>
          <dd className="lead-workspace__metric-note">Of your saved estimates</dd>
        </div>
        <div className="lead-workspace__metric lead-workspace__metric--value">
          <dt>Saved value</dt><dd>{estimates.isSuccess ? money(savedValue) : "—"}</dd>
          <dd className="lead-workspace__metric-note">Sum of saved estimates, including drafts</dd>
        </div>
      </dl>
      {estimates.isError ? (
        <p className="lead-workspace__estimate-error" role="alert">
          Saved estimates are unavailable.{" "}
          <button type="button" onClick={() => void estimates.refetch()}>
            Try again
          </button>
        </p>
      ) : null}
    </section>

    <div className="lead-controls lead-workspace__controls">
      <Field id="lead-search" label="Search leads">{(props) => <Input {...props} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client name, email, mobile or project" type="search" />}</Field>
    </div>

    <div className="lead-workspace__stage-bar" role="group" aria-label="Lead stage">
      <div className="lead-workspace__stage-scroll">
        <button type="button" className="lead-workspace__stage-option" aria-pressed={stage === "all"} onClick={() => setStage("all")}>All stages</button>
        {stages.map((value) => <button key={value} type="button" className="lead-workspace__stage-option" aria-pressed={stage === value} onClick={() => setStage(value)}>{labels[value]}</button>)}
      </div>
      <p className="lead-workspace__stage-hint">Scroll to see all stages</p>
    </div>

    <section className="estimator-dashboard__section lead-workspace__list-section" aria-labelledby="leads-title" aria-busy={query.isFetching}>
      <header className="estimator-dashboard__section-heading lead-workspace__section-heading">
        <div><p className="eyebrow">Opportunity pipeline</p><h2 id="leads-title">Leads</h2></div>
        <span>{query.isPlaceholderData ? "Updating results" : `${visibleLeads.length} shown${query.data.pagination.hasMore ? ` of ${query.data.pagination.total}` : ""}`}</span>
      </header>
      {query.isFetching ? <p className="lead-workspace__refresh" role="status">Updating leads…</p> : null}
      {query.isPlaceholderData ? null : visibleLeads.length ? <>
        <p className="lead-workspace__table-hint">Scroll table to view all columns and actions.</p>
        <div className="lead-list lead-workspace__list">
        <div className="lead-list__header" aria-hidden="true">
          <span>Client</span><span>Project</span><span>Stage</span><span>Estimate</span><span>Created on</span><span>Next action</span><span>Actions</span>
        </div>
        <ul className="lead-workspace__rows">
          {visibleLeads.map((lead) => <li key={lead.id}><LeadRow
            lead={lead}
            estimate={estimateByLead.get(lead.id)}
            estimatesPending={estimates.isPending}
            estimatesUnavailable={estimates.isError}
            onReview={canReview ? () => setReviewLeadId(lead.id) : undefined}
          /></li>)}
        </ul>
        </div>
      </> : <div className="inline-empty lead-workspace__empty">
        <h2>{filtered ? "No matching leads" : "No leads yet"}</h2>
        <p>{filtered ? "Try a different search or stage." : canInitiate ? "Initiate a project to create your first lead." : "Assigned project leads appear here."}</p>
      </div>}
    </section>
    {reviewLeadId && canReview ? <LeadQuickReview key={reviewLeadId} leadId={reviewLeadId} onClose={() => setReviewLeadId(null)} /> : null}
    {initiationOpen && canInitiate ? (
      <AdminProjectInitiationDialog
        assignmentMode="sales-manager"
        onClose={() => setInitiationOpen(false)}
        onCreated={(project) => navigate(`/estimator-sales/leads/${encodeURIComponent(project.lead.id)}`)}
      />
    ) : null}
  </section>;
}

function LeadRow({
  lead,
  estimate,
  estimatesPending,
  estimatesUnavailable,
  onReview
}: {
  lead: Lead;
  estimate: SavedEstimate | undefined;
  estimatesPending: boolean;
  estimatesUnavailable: boolean;
  onReview?: () => void;
}) {
  const leadPath = `/estimator-sales/leads/${encodeURIComponent(lead.id)}`;
  const projectHeadingId = `lead-${lead.id}-project`;
  const createdAt = parseDate(lead.createdAt);
  const nextActionAt = parseDate(lead.nextActionAt);
  const timing = lead.nextAction ? nextActionTiming(nextActionAt) : null;

  return <article className="lead-row" aria-labelledby={projectHeadingId}>
    <div className="lead-row__client" data-label="Client">
      <span className="lead-row__field-label">Client</span>
      <span className="lead-row__avatar" aria-hidden="true">{initials(lead.clientName)}</span>
      <div className="lead-row__client-details">
        <Link className="lead-row__name" to={leadPath}>{lead.clientName}</Link>
        <small>{lead.clientEmail}</small>
        <small>{lead.clientMobile}</small>
      </div>
    </div>
    <div className="lead-row__project" data-label="Project">
      <span className="lead-row__field-label">Project</span>
      <h3 id={projectHeadingId}>{lead.projectName}</h3>
      <small>{lead.propertyType} · {lead.location}</small>
    </div>
    <div className="lead-row__stage" data-label="Stage"><span className="lead-row__field-label">Stage</span><span className={`lead-stage-badge lead-stage-badge--${lead.stage}`}>{labels[lead.stage]}</span></div>
    <div className="lead-row__estimate" data-label="Estimate">
      <span className="lead-row__field-label">Estimate</span>
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
    </div>
    <div className="lead-row__created" data-label="Created on">
      <span className="lead-row__field-label">Created on</span>
      <time dateTime={createdAt ? lead.createdAt : undefined}>{createdAt ? dateFormatter.format(createdAt) : "Date unavailable"}</time>
    </div>
    <div className="lead-row__next" data-label="Next action">
      <span className="lead-row__field-label">Next action</span>
      <strong>{lead.nextAction || "No next action set"}</strong>
      {nextActionAt ? <span><time dateTime={lead.nextActionAt}>{dateFormatter.format(nextActionAt)}</time>{timing ? <span className={`lead-row__timing lead-row__timing--${timing.toLowerCase().replaceAll(" ", "-")}`}>{timing}</span> : null}</span> : <small>Date not set</small>}
    </div>
    <div className="lead-row__actions" data-label="Actions">
      <span className="lead-row__field-label">Actions</span>
      {estimate ? <Link className="secondary-button lead-row__open" to={`${leadPath}/estimate`}>
        {estimate.status === "draft" ? "Continue estimate" : "View details"}
      </Link> : <Link className="secondary-button lead-row__open" to={leadPath}>Open lead</Link>}
      {onReview ? <button type="button" className="lead-row__review" aria-label={`Review ${lead.projectName}`} onClick={onReview}>Quick review</button> : null}
      {estimate && estimate.status !== "draft" ? <DownloadButton
        className="secondary-button lead-row__export"
        label="Export as PDF"
        loadingLabel="Preparing PDF..."
        errorMessage={`PDF export failed for ${lead.projectName}. Try again.`}
        fallbackFilename={`lisno-${estimate.id}.pdf`}
        getFile={() => downloadEstimatePdf(estimate.id)}
      /> : null}
    </div>
  </article>;
}

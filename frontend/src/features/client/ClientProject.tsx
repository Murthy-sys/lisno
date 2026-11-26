import { KeyCollectionHeader } from "../workflow/KeyCollectionHeader";
import { ProjectStatusButton } from "../project-status/ProjectStatusButton";
import { ProjectId } from "../../components/projects/ProjectId";
import { ProjectChatNavigation } from "../messages";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { PageHeader } from "../../components/ui/PageHeader";
import { EstimateReviewPanel } from "../estimates/EstimateReviewPanel";
import { ClientEstimateQueryProvider, useClientEstimates } from "../estimates/clientEstimateQuery";
import type { ClientDesignVersion } from "../../api/types";
import { FilePreview } from "../../components/ui/FilePreview";
import { AsyncState } from "../../components/ui/AsyncState";
import { clientKeys, getClientProject, getClientVersions } from "./clientApi";
import { DesignSectionReview } from "./DesignSectionReview";
import { ProjectWorkflowPanel } from "../workflow/ProjectWorkflowPanel";
import { ClientVendorWorkReview } from "./ClientVendorWorkReview";
import { ClientSiteCompletionReview } from "./ClientSiteCompletionReview";
import { ClientEstimateTiers } from "./ClientEstimateTiers";
import { ClientEstimationWorkspace } from "./ClientEstimationWorkspace";
import { ClientProjectPhasePanel } from "./ClientProjectPhasePanel";
import { useDesignWorkflowQuery } from "../workflow/useDesignWorkflowQuery";
import "./clientWorkflow.css";

export function ClientProject() {
  return <ClientEstimateQueryProvider><ProjectContent /></ClientEstimateQueryProvider>;
}

function ProjectContent() {
  const { projectId = "" } = useParams();
  const location = useLocation();
  const [timelineContainer, setTimelineContainer] = useState<HTMLDivElement | null>(null);
  const projectQuery = useQuery({ queryKey: clientKeys.project(projectId), queryFn: () => getClientProject(projectId), enabled: Boolean(projectId) });
  const versionsQuery = useQuery({ queryKey: clientKeys.versions(projectId), queryFn: () => getClientVersions(projectId), enabled: Boolean(projectId) });
  const requiresPublication = projectQuery.data?.estimationWorkflowVersion === 2 || projectQuery.data?.estimationWorkflowVersion === 3;
  const reviews = useClientEstimates();
  const { data: workflow } = useDesignWorkflowQuery(projectId);
  const handoff = workflow?.designerHandoff;
  const initialApproved = handoff?.initialEstimateApproved === true;
  if (projectQuery.isPending) return <AsyncState state="loading" message="Loading your project…" />;
  if (projectQuery.isError) return <AsyncState state="error" message="We couldn't load this project." actionLabel="Try again" onAction={() => void projectQuery.refetch()} />;
  const project = projectQuery.data;
  const sharedEstimation = project.estimationWorkflowVersion === 3;
  const matchingReviews = reviews.isSuccess ? (reviews.data ?? []).filter(estimate => estimate.projectId === projectId) : [];
  const showSubmittedSections = !requiresPublication || matchingReviews.length === 1 && Boolean(matchingReviews[0]!.publishedReview) && !matchingReviews[0]!.reviewSourceIssue;
  const versions = (versionsQuery.data ?? []).filter((version) => version.approvalStatus === "approved" && version.clientVisible);
  return <section className="client-page client-page--project" data-theme="sidebar" aria-labelledby="client-project-title">
    <PageHeader id="client-project-title" title={project.name} description={project.location} breadcrumb={<Link className="client-project-back" to="/client">Back to projects</Link>} metadata={<><ProjectId projectNumber={project.projectNumber} /><span className="client-project-status">{project.status.replaceAll("_", " ")}</span></>} actions={<div className="project-status-header-actions">{sharedEstimation ? <ProjectChatNavigation projectId={projectId} overviewTo={`/client/projects/${projectId}`} presentation="client-project" showStatus={false} /> : null}<KeyCollectionHeader projectId={project.id} projectName={project.name} /><ProjectStatusButton projectId={project.id} projectName={project.name} presentation="chip" /></div>} />
    {!sharedEstimation ? <ProjectChatNavigation projectId={projectId} overviewTo={`/client/projects/${projectId}`} showStatus={false} /> : null}
    <ClientProjectPhasePanel key={`estimation-phase-${projectId}`} title="Estimation" enabled={initialApproved}>
    {project.estimationWorkflowVersion === 2 ? <ClientEstimateTiers key={`tiers-${projectId}`} projectId={projectId} /> : null}
    {project.estimationWorkflowVersion === 3 ? <ClientEstimationWorkspace key={`quotation-${projectId}`} projectId={projectId} />
      : <EstimateReviewPanel key={`estimate-${projectId}`} projectId={projectId} />}
    </ClientProjectPhasePanel>
    <ClientProjectPhasePanel key={`design-phase-${projectId}`} title="Design flow" enabled={initialApproved} initiallyOpen revealKey={location.hash === "#key-collection" ? location.key : undefined}>
    <div className="client-project-workflow" ref={setTimelineContainer} />
    <ProjectWorkflowPanel showAppointmentTimer={false} key={projectId} projectId={projectId} timelineContainer={timelineContainer} presentation="client" showDesignRequirements={showSubmittedSections} />
    {project.floors.length ? <details key={`floors-${projectId}`} className="client-project-disclosure">
      <summary>Floors <span>{project.floors.length} {project.floors.length === 1 ? "floor" : "floors"}</span></summary>
      <section className="client-floor-progress" aria-label="Floors">
        {project.floors.slice().sort((left, right) => left.order - right.order).map((floor) => <article key={floor.id} className="client-floor-card"><div><p>Floor {floor.number}</p><h3>{floor.name}</h3></div></article>)}
      </section>
    </details> : null}
    <DesignSectionReview key={`reviews-${projectId}`} projectId={projectId} mode="client" hideWhenEmpty collapsible />
    {versionsQuery.isError ? <div className="client-project-secondary-state" role="status"><p>Approved documents could not be {versions.length ? "refreshed. Saved documents are available below." : "loaded."}</p><button className="secondary-button" type="button" disabled={versionsQuery.isFetching} onClick={() => void versionsQuery.refetch()}>Retry approved documents</button></div> : null}
    {versions.length ? <ApprovedDocuments key={`documents-${projectId}`} versions={versions} /> : null}
    </ClientProjectPhasePanel>
    <ClientProjectPhasePanel key={`execution-phase-${projectId}`} title="Execution" enabled={initialApproved}>
      {handoff?.executionAvailable ? <>
        <ClientSiteCompletionReview key={`site-completion-${projectId}`} projectId={projectId} />
        <ClientVendorWorkReview key={`vendor-work-${projectId}`} projectId={projectId} />
      </> : initialApproved ? <p>{handoff?.state === "source_issue" ? "Execution availability could not be confirmed. Refresh the project to try again." : "Execution will be available after design approval."}</p> : null}
    </ClientProjectPhasePanel>
  </section>;
}

function ApprovedDocuments({ versions }: { versions: ClientDesignVersion[] }) {
  const [open, setOpen] = useState(false);
  return <details className="client-project-disclosure" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Approved documents <span>{versions.length} {versions.length === 1 ? "document" : "documents"}</span></summary>
    {open ? <section className="client-approved-documents" aria-label="Approved documents">
      {versions.map((version) => <VisibleVersion key={version.id} version={version} />)}
    </section> : null}
  </details>;
}

function VisibleVersion({ version }: { version: ClientDesignVersion }) {
  return <article className="client-version"><div className="client-version__identity"><strong>{version.originalFilename}</strong><p>Approved{version.approvedAt ? ` ${formatDate(version.approvedAt)}` : " · Approval date unavailable"} · Version {version.versionNumber}</p></div><FilePreview version={version} /></article>;
}

const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
function formatDate(value: string) { return date.format(new Date(value)); }

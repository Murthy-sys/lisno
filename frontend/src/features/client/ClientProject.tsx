import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import type { ClientDesignVersion } from "../../api/types";
import { FilePreview } from "../../components/ui/FilePreview";
import { AsyncState } from "../../components/ui/AsyncState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { clientKeys, getClientProject, getClientVersions } from "./clientApi";
import { DesignSectionReview } from "./DesignSectionReview";

export function ClientProject() {
  const { projectId = "" } = useParams();
  const projectQuery = useQuery({ queryKey: clientKeys.project(projectId), queryFn: () => getClientProject(projectId), enabled: Boolean(projectId) });
  const versionsQuery = useQuery({ queryKey: clientKeys.versions(projectId), queryFn: () => getClientVersions(projectId), enabled: Boolean(projectId) });
  if (projectQuery.isPending || versionsQuery.isPending) return <AsyncState state="loading" message="Loading your approved project plans…" />;
  if (projectQuery.isError || versionsQuery.isError) return <AsyncState state="error" message="We couldn't load this project." actionLabel="Try again" onAction={() => { void projectQuery.refetch(); void versionsQuery.refetch(); }} />;
  const project = projectQuery.data;
  const versions = versionsQuery.data.filter((version) => version.approvalStatus === "approved" && version.clientVisible);
  const versionsByFloor = new Map(project.floors.map((floor) => [floor.id, versions.filter((version) => version.floorId === floor.id)]));
  return <section className="client-page" aria-labelledby="client-project-title">
    <Link className="back-link" to="/client">Back to projects</Link>
    <header className="workspace-header"><div><p className="eyebrow">Project plan</p><h1 id="client-project-title">{project.name}</h1><p>{project.location} · Expected completion {formatDate(project.plannedEndAt)}</p></div></header>
    <DesignSectionReview projectId={projectId} mode="client" />
    <section className="client-floor-list" aria-labelledby="floor-progress-title"><h2 id="floor-progress-title">Floor progress</h2>{project.floors.slice().sort((left, right) => left.order - right.order).map((floor) => <article key={floor.id} className="client-floor-card"><div><p>Floor {floor.number}</p><h3>{floor.name}</h3></div><div><strong>{floor.progress}% complete</strong><ProgressBar value={floor.progress} label={`${floor.name}: ${floor.progress}% complete`} /></div>{(versionsByFloor.get(floor.id) ?? []).map((version) => <VisibleVersion key={version.id} version={version} />)}</article>)}</section>
    {!versions.length ? <div className="project-empty"><div><h2>Your project is in progress. Approved plans will appear here once ready.</h2><p>Your team will share documents here after review and approval.</p></div></div> : null}
  </section>;
}

function VisibleVersion({ version }: { version: ClientDesignVersion }) {
  return <article className="client-version"><div><strong>{version.originalFilename}</strong><p>Approved {version.approvedAt ? formatDate(version.approvedAt) : "recently"} · Version {version.versionNumber}</p></div><FilePreview version={version} /></article>;
}

const date = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
function formatDate(value: string) { return date.format(new Date(value)); }

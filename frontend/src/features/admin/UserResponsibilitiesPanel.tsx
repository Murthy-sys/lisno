import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import type { Role } from "../../api/authorization-contract";
import type { UserDirectoryItem, UserResponsibilityRow } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { adminUserKeys, getUserResponsibilities } from "./adminApi";
import { formatWorkflowLabel } from "./adminProjectPresentation";
import "./userResponsibilities.css";

interface UserResponsibilitiesPanelProps {
  user: Pick<UserDirectoryItem, "id" | "role" | "version">;
  destinationRole: Role;
  canReadProjects: boolean;
  enabled?: boolean;
}

function ResponsibilityRow({ row, canReadProjects }: { row: UserResponsibilityRow; canReadProjects: boolean }) {
  const project = row.contextState === "available" && row.project?.id === row.projectId ? row.project : null;
  const workStage = row.workStage?.key !== project?.currentStage?.key ? row.workStage?.label : null;
  return <li className="user-responsibilities__row">
    <div className="user-responsibilities__row-heading">
      <strong>{project?.name ?? row.relatedUser?.name ?? (row.contextState === "unlinked" ? "Lead without a project" : "Project details unavailable")}</strong>
      {row.blocksRoleChange ? <span className="user-responsibilities__blocker">Reassignment required</span> : null}
    </div>
    <dl>
      {project ? <>
        <div><dt>Project ID</dt><dd>{project.projectNumber ?? "Unavailable"}</dd></div>
        <div><dt>Current stage</dt><dd>{project.stageState === "available" && project.currentStage ? project.currentStage.label : "Stage unavailable"}</dd></div>
      </> : null}
      <div><dt>Responsibility</dt><dd>{row.label}</dd></div>
      {workStage ? <div><dt>Work stage</dt><dd>{workStage}</dd></div> : null}
      {row.workStatus ? <div><dt>Work status</dt><dd>{formatWorkflowLabel(row.workStatus)}</dd></div> : null}
      {!project && !row.relatedUser ? <div><dt>Reference</dt><dd>{row.sourceId}</dd></div> : null}
    </dl>
    {project && canReadProjects ? <a className="user-responsibilities__project-link"
      href={`/admin/projects/${encodeURIComponent(project.id)}`} target="_blank" rel="noopener noreferrer"
      aria-label={`Open project ${project.name} in a new tab`}>Open project <span className="sr-only">in a new tab</span></a> : null}
  </li>;
}

function ResponsibilityPage({ user, destinationRole, canReadProjects, enabled = true }: UserResponsibilitiesPanelProps) {
  const headingId = useId();
  const [offset, setOffset] = useState(0);
  const input = { destinationRole, limit: 20, offset };
  const query = useQuery({
    queryKey: adminUserKeys.responsibilityPage(user.id, user.version, input),
    queryFn: async ({ signal }) => {
      const result = await getUserResponsibilities(user.id, input, signal);
      if (result.user.id !== user.id || result.destinationRole !== destinationRole || result.pagination.offset !== offset) {
        throw new Error("Assignment response does not match the selected user and role.");
      }
      return result;
    },
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false
  });
  const data = query.data;
  const roleChangedElsewhere = data && (data.user.version !== user.version || data.user.role !== user.role);
  return <section className="user-responsibilities" aria-labelledby={headingId}>
    <div className="user-responsibilities__header">
      <h3 id={headingId}>Current assignments</h3>
      <Button variant="quiet" size="compact" disabled={!enabled || query.isFetching} onClick={() => void query.refetch()}
        aria-label="Refresh assignments">Refresh</Button>
    </div>
    {!enabled ? <p>Assignments are unavailable for this directory entry.</p> : query.isPending ? <p role="status">Loading assignments…</p> : query.isError ?
      <div role="alert"><p>Assignments could not be loaded.</p><Button variant="quiet" size="compact" onClick={() => void query.refetch()}>Retry assignments</Button></div> : data ? <>
        <p className="user-responsibilities__summary" role="status">
          {data.pagination.total} {data.pagination.total === 1 ? "responsibility" : "responsibilities"}
          {destinationRole !== data.user.role ? ` · ${data.blockingCount} ${data.blockingCount === 1 ? "requires" : "require"} reassignment` : ""}
          {query.isFetching ? " · Refreshing…" : ""}
        </p>
        {roleChangedElsewhere ? <p role="alert">User access changed. Close this panel and reopen the latest directory entry.</p> : null}
        {data.pagination.total === 0 ? <p>No assignments.</p> : <>
          <ul className="user-responsibilities__list">{data.items.map(row => <ResponsibilityRow key={row.id} row={row} canReadProjects={canReadProjects} />)}</ul>
          {data.items.length === 0 ? <p>No assignments on this page. Return to the previous page or refresh.</p> : null}
          {offset > 0 || data.pagination.hasMore ? <nav className="user-responsibilities__pagination" aria-label="Assignment pages">
            <Button variant="quiet" size="compact" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - input.limit))}>Previous assignments</Button>
            <span>Page {Math.floor(offset / input.limit) + 1}</span>
            <Button variant="quiet" size="compact" disabled={!data.pagination.hasMore || query.isFetching} onClick={() => setOffset(offset + input.limit)}>Next assignments</Button>
          </nav> : null}
        </>}
      </> : null}
  </section>;
}

export function UserResponsibilitiesPanel(props: UserResponsibilitiesPanelProps) {
  return <ResponsibilityPage key={`${props.user.id}:${props.user.version}:${props.destinationRole}`} {...props} />;
}

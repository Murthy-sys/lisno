import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../api/client";
import type { ProjectStatusSummary } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { getProjectStatus, projectStatusKeys } from "../project-status/projectStatusApi";
import { useClientEstimates } from "../estimates/clientEstimateQuery";
import { resolveClientProjectPhase } from "./clientProjectPhase";

type Props = { projectId: string; projectName: string; projectNumber?: string | null };

export function ClientProjectStatus(props: Props) {
  const { user, status, authorization, reviewSession } = useAuth();
  if (!user || status !== "authenticated" || !hasFrontendPermission(authorization, "projects.status.read")) {
    return <span className="client-dashboard__status">Status unavailable</span>;
  }
  const identity = `${user.id}:${user.role}${reviewSession?.id ? `:${reviewSession.id}` : ""}`;
  return <VisibleProjectStatus key={`${props.projectId}:${identity}`} {...props} identity={identity} />;
}

function VisibleProjectStatus({ projectId, projectName, projectNumber, identity }: Props & { identity: string }) {
  const estimates = useClientEstimates();
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [accessRemoved, setAccessRemoved] = useState(false);
  const [verified, setVerified] = useState<ProjectStatusSummary>();
  const queryClient = useQueryClient();

  useEffect(() => {
    const row = element.current?.closest("tr") ?? element.current;
    if (!row) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { threshold: 0 });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  const query = useQuery({
    queryKey: projectStatusKeys.detail(projectId, identity),
    queryFn: async ({ signal }) => {
      const summary = await getProjectStatus(projectId, signal);
      if (!validSummary(summary, projectId)) throw new Error("Project status response is invalid.");
      return summary;
    },
    enabled: visible && !accessRemoved,
    staleTime: 0,
    refetchOnWindowFocus: visible && !accessRemoved,
    refetchInterval: false,
    retry: false
  });
  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  const matching = validSummary(query.data, projectId) ? query.data : undefined;
  // Retained cache is not proof of access in this mounted project/session.
  const summary = !denied && !accessRemoved && matching === verified && (!query.isError || transientError(query.error)) ? matching : undefined;

  useEffect(() => {
    if (denied) {
      setAccessRemoved(true);
      setVerified(undefined);
      queryClient.removeQueries({ queryKey: projectStatusKeys.detail(projectId, identity), exact: true });
    } else if ((query.isError && !transientError(query.error)) || (query.data && !matching)) {
      setVerified(undefined);
    } else if (matching && query.isSuccess && query.isFetchedAfterMount && !query.isFetching) {
      setVerified(matching);
    }
  }, [denied, identity, matching, projectId, query.data, query.error, query.isError, query.isFetchedAfterMount, query.isFetching, query.isSuccess, queryClient]);

  const phase = summary && estimates.data ? resolveClientProjectPhase(projectId, summary, estimates.data) : undefined;
  const loading = !estimates.isError && !accessRemoved && !query.isError && (estimates.isPending || !summary && (query.isPending || query.isFetching || Boolean(matching)));
  const stale = Boolean(summary && query.isError);
  const label = phase?.kind === "resolved" ? phase.phase : loading ? "Loading status…" : phase ? "Status needs review" : "Status unavailable";
  const needsRetry = stale || phase?.kind !== "resolved" && !loading;
  return <span ref={element} className="client-dashboard__status" aria-busy={query.isFetching || estimates.isFetching}>
    <span>{label}</span>
    {phase?.kind === "resolved" && phase.state ? <span className="client-dashboard__status-notice">{phase.state}</span> : null}
    {stale ? <span className="client-dashboard__status-notice">Out of date</span> : null}
    {needsRetry ? <button type="button" className="client-dashboard__status-retry" disabled={query.isFetching || estimates.isFetching} aria-label={`Retry status for ${projectName} (${projectNumber ?? projectId})`} onClick={() => {
      if (accessRemoved) setAccessRemoved(false);
      else void query.refetch();
      void estimates.refetch();
    }}>Retry</button> : null}
  </span>;
}

function transientError(error: Error) {
  return error instanceof ApiError ? error.status >= 500 || error.status === 408 || error.status === 429 : error instanceof TypeError;
}

function validSummary(value: ProjectStatusSummary | undefined, projectId: string): value is ProjectStatusSummary {
  return Boolean(value && value.projectId === projectId &&
    ["active", "scheduled", "paused", "completed", "no_pending", "unavailable"].includes(value.state) &&
    (value.currentStage === null || value.currentStage && typeof value.currentStage.key === "string" && typeof value.currentStage.label === "string") &&
    Array.isArray(value.pendingActions) && value.pendingActions.every(action => action &&
      typeof action.id === "string" && action.id.trim().length > 0 &&
      typeof action.stageKey === "string" && typeof action.action === "string" &&
      ["pending", "scheduled", "blocked", "unassigned"].includes(action.state) &&
      Array.isArray(action.people) && action.people.every(person => person && typeof person.name === "string" && typeof person.role === "string")));
}

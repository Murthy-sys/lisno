import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { apiClient } from "../../api/client";
import type { ProjectHierarchy } from "../../api/types";
import { AsyncState } from "../../components/ui/AsyncState";
import { RiskBadge } from "../../components/tasks/RiskBadge";

export function ManagementProjectWorkspace() {
  const { projectId = "" } = useParams();
  const auth = useAuth();
  const base = auth.user?.role === "design_head" ? "/head" : "/manager";
  const query = useQuery({ queryKey: ["management", "project", projectId], queryFn: () => apiClient.get<ProjectHierarchy>(`/projects/${encodeURIComponent(projectId)}`), enabled: Boolean(projectId) });
  if (query.isPending) return <AsyncState state="loading" message="Loading project inspection…" />;
  if (query.isError) return <AsyncState state="error" message="We couldn't load this project." actionLabel="Try again" onAction={() => void query.refetch()} />;
  return <section className="designer-page"><Link className="back-link" to={base}>Back to workspace</Link><h1>{query.data.name}</h1>{query.data.floors.flatMap((floor) => floor.stages.flatMap((stage) => stage.tasks)).map((task) => <article key={task.id} className="risk-item"><strong>{task.title}</strong><span>{task.status} · {task.progress}%</span><RiskBadge risk={task.risk} /></article>)}</section>;
}

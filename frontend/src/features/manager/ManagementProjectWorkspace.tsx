import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import type {
  AuditEvent,
  DesignVersion,
  ProjectHierarchy,
  ProjectTask
} from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { RiskBadge } from "../../components/tasks/RiskBadge";
import { AsyncState } from "../../components/ui/AsyncState";
import { DesignSectionReview } from "../client/DesignSectionReview";
import {
  getManagementProjectActivity,
  getManagementProjectVersions
} from "./managerApi";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC"
});

export function ManagementProjectWorkspace() {
  const { projectId = "" } = useParams();
  const auth = useAuth();
  const base = auth.user?.role === "design_head" ? "/head" : "/manager";
  const project = useQuery({
    queryKey: ["management", "project", projectId],
    queryFn: () =>
      apiClient.get<ProjectHierarchy>(
        `/projects/${encodeURIComponent(projectId)}`
      ),
    enabled: Boolean(projectId)
  });
  const versions = useQuery({
    queryKey: ["management", "project", projectId, "versions"],
    queryFn: () => getManagementProjectVersions(projectId),
    enabled: Boolean(projectId)
  });
  const activity = useQuery({
    queryKey: ["management", "project", projectId, "activity"],
    queryFn: () => getManagementProjectActivity(projectId),
    enabled: Boolean(projectId)
  });

  if (project.isPending) {
    return (
      <AsyncState state="loading" message="Loading project inspection…" />
    );
  }
  if (project.isError) {
    return (
      <AsyncState
        state="error"
        message="We couldn't load this project."
        actionLabel="Try again"
        onAction={() => void project.refetch()}
      />
    );
  }

  const data = project.data;
  const taskTitles = new Map(
    data.floors.flatMap((floor) =>
      floor.stages.flatMap((stage) =>
        stage.tasks.map((task) => [task.id, task.title] as const)
      )
    )
  );

  return (
    <section
      className="designer-page"
      aria-labelledby="management-project-title"
    >
      <Link className="back-link" to={base}>
        Back to workspace
      </Link>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Project inspection</p>
          <h1 id="management-project-title">{data.name}</h1>
          <p>
            {data.location} · {data.status}
          </p>
        </div>
      </header>

      <section aria-labelledby="delivery-structure-title">
        <h2 id="delivery-structure-title">Delivery structure</h2>
        {data.floors.map((floor) => (
          <article key={floor.id} className="floor-card">
            <h3>
              Floor {floor.number}: {floor.name} · {floor.progress}%
            </h3>
            {floor.stages.map((stage) => (
              <section key={stage.id} className="stage-card">
                <h4>{stage.name}</h4>
                {stage.tasks.map((task) => (
                  <TaskHistory key={task.id} task={task} />
                ))}
              </section>
            ))}
          </article>
        ))}
      </section>

      <DesignSectionReview projectId={projectId} mode="read-only" />

      <section aria-labelledby="version-timeline-title">
        <h2 id="version-timeline-title">Design-version timeline</h2>
        {versions.isPending ? (
          <p>Loading versions…</p>
        ) : versions.isError ? (
          <p role="alert">Versions could not be loaded.</p>
        ) : versions.data.items.length ? (
          <ol className="activity-list">
            {versions.data.items.map((version) => (
              <VersionHistory key={version.id} version={version} />
            ))}
          </ol>
        ) : (
          <p>No design versions yet.</p>
        )}
      </section>

      <section aria-labelledby="project-audit-title">
        <h2 id="project-audit-title">Project activity</h2>
        {activity.isPending ? (
          <p>Loading activity…</p>
        ) : activity.isError ? (
          <p role="alert">Activity could not be loaded.</p>
        ) : activity.data.items.length ? (
          <ol className="activity-list">
            {activity.data.items.map((event) => (
              <ActivityHistory
                key={event.id}
                event={event}
                taskTitle={taskTitles.get(event.entityId)}
              />
            ))}
          </ol>
        ) : (
          <p>No project activity yet.</p>
        )}
      </section>
    </section>
  );
}

function TaskHistory({ task }: { task: ProjectTask }) {
  return (
    <article className="risk-item">
      <strong>{task.title}</strong>
      <span>
        {task.status} · {task.progress}%
      </span>
      <span>Original deadline: {formatDate(task.originalDeadlineAt)}</span>
      <span>Current deadline: {formatDate(task.currentDeadlineAt)}</span>
      <RiskBadge risk={task.risk} />
    </article>
  );
}

function VersionHistory({ version }: { version: DesignVersion }) {
  const approvalDetail = version.approvedAt
    ? `Approved ${formatDateTime(version.approvedAt)} by ${version.reviewerId ?? "unknown reviewer"}`
    : version.reviewerId
      ? `Reviewer ${version.reviewerId} · approval time not recorded`
      : "Reviewer not assigned · approval time not recorded";
  return (
    <li>
      <strong>
        v{version.versionNumber} · {version.originalFilename}
      </strong>
      <span>
        Uploaded {formatDateTime(version.uploadedAt)} by {version.uploaderId}
      </span>
      <span>
        {version.approvalStatus} · {approvalDetail} ·{" "}
        {version.clientVisible ? "client visible" : "internal"}
      </span>
    </li>
  );
}

function ActivityHistory({
  event,
  taskTitle
}: {
  event: AuditEvent;
  taskTitle?: string;
}) {
  const entity =
    event.entityType === "task" && taskTitle
      ? `Task: ${taskTitle} (${event.entityId})`
      : `${label(event.entityType)}: ${event.entityId}`;
  return (
    <li>
      <strong>{event.action}</strong>
      <span>{entity}</span>
      <span>
        Actor: {event.actorId} · {formatDateTime(event.occurredAt)}
      </span>
      <span>Changes: {summarizeChanges(event)}</span>
      {event.reason ? <span>Reason: {event.reason}</span> : null}
    </li>
  );
}

function summarizeChanges(event: AuditEvent) {
  const keys = [
    ...new Set([
      ...Object.keys(event.oldValues),
      ...Object.keys(event.newValues)
    ])
  ];
  if (keys.length === 0) return "No field values recorded";
  return keys
    .map(
      (key) =>
        `${key}: ${formatValue(key, event.oldValues[key])} → ${formatValue(
          key,
          event.newValues[key]
        )}`
    )
    .join("; ");
}

function formatValue(key: string, value: unknown) {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string" && key.endsWith("At")) {
    return formatDateTime(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function label(value: string) {
  const readable = value.replaceAll("_", " ");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

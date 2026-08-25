import { useQuery } from "@tanstack/react-query";

import { ROLE_LABELS } from "../../api/authorization-contract";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  getOperationalWorkflowTasks,
  projectWorkflowKeys
} from "./projectWorkflowApi";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

export function OperationalTaskQueue() {
  const tasks = useQuery({
    queryKey: projectWorkflowKeys.operational,
    queryFn: getOperationalWorkflowTasks
  });

  return (
    <Surface as="section" className="workflow-task-queue" aria-labelledby="workflow-task-queue-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Approved design handoff</p>
          <h2 id="workflow-task-queue-title">Your project tasks</h2>
        </div>
        {tasks.data ? <span>{tasks.data.filter((task) => task.status !== "completed").length} open</span> : null}
      </div>

      {tasks.isPending ? <p role="status">Loading approved project tasks…</p> : null}
      {tasks.isError ? (
        <p role="alert">
          We couldn't load project tasks.{" "}
          <button type="button" className="secondary-button" onClick={() => void tasks.refetch()}>
            Try again
          </button>
        </p>
      ) : null}
      {tasks.data?.length === 0 ? (
        <p className="inline-empty">Tasks will appear here after the Client approves a design plan.</p>
      ) : null}
      {tasks.data?.length ? (
        <div className="project-grid">
          {tasks.data.map((task) => (
            <article className="project-card" key={task.id}>
              <div className="project-card__heading">
                <div>
                  <p className="eyebrow">{task.projectName}</p>
                  <h3>{task.title}</h3>
                </div>
                <StatusBadge
                  tone={task.status === "completed" ? "success" : task.status === "in_progress" ? "warning" : "info"}
                  label={task.status.replaceAll("_", " ")}
                />
              </div>
              <p>{task.description}</p>
              <dl>
                <div><dt>Queue</dt><dd>{ROLE_LABELS[task.assigneeRole]}</dd></div>
                {task.roomName ? <div><dt>Room</dt><dd>{task.roomName}</dd></div> : null}
                <div><dt>Opened</dt><dd>{dateTime.format(new Date(task.openedAt))}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </Surface>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Layers3,
  MapPin,
  Plus
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { apiClient } from "../../api/client";
import type {
  DesignVersion,
  ProjectHierarchy,
  ProjectTask
} from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { DesignUploadDialog } from "../../components/tasks/DesignUploadDialog";
import { TaskRow } from "../../components/tasks/TaskRow";
import { TaskUpdateDialog } from "../../components/tasks/TaskUpdateDialog";
import { AsyncState } from "../../components/ui/AsyncState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { designerKeys } from "./designerApi";
import { DesignUploadsWorkspace } from "./DesignUploadsWorkspace";
import { EstimatePlanChangeRequests } from "../leads/EstimatePlanChangeRequests";
import {
  ProjectStructureDialog,
  type StructureAction
} from "./ProjectStructureDialog";

type TaskAction = { kind: "update" | "upload"; taskId: string } | null;

const projectStatuses = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed"
} as const;

const projectTones = {
  planning: "info",
  active: "success",
  on_hold: "warning",
  completed: "neutral"
} as const;

export function ProjectWorkspace() {
  const { projectId = "" } = useParams();
  const auth = useAuth();
  const user = auth.user!;
  const [openFloors, setOpenFloors] = useState<Set<string>>(() => new Set());
  const [openStages, setOpenStages] = useState<Set<string>>(() => new Set());
  const [taskAction, setTaskAction] = useState<TaskAction>(null);
  const [structureAction, setStructureAction] =
    useState<StructureAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [planRequestsOpen, setPlanRequestsOpen] = useState(false);

  const projectQuery = useQuery({
    queryKey: designerKeys.project(projectId),
    queryFn: () =>
      apiClient.get<ProjectHierarchy>(
        `/projects/${encodeURIComponent(projectId)}`
      ),
    enabled: Boolean(projectId)
  });

  if (projectQuery.isPending) {
    return <AsyncState state="loading" message="Opening the project workspace…" />;
  }
  if (projectQuery.isError) {
    return (
      <AsyncState
        state="error"
        message="We couldn't load this project workspace."
        actionLabel="Try again"
        onAction={() => {
          void projectQuery.refetch();
        }}
      />
    );
  }

  const project = projectQuery.data;
  const selectedTask = taskAction
    ? findTask(project, taskAction.taskId)
    : undefined;

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string
  ) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="designer-page project-workspace" aria-labelledby="project-title">
      <Link to="/designer" className="back-link">
        <ArrowLeft aria-hidden="true" /> Back to dashboard
      </Link>

      <header className="project-hero">
        <div>
          <p className="eyebrow">Project workspace</p>
          <h1 id="project-title">{project.name}</h1>
          <div className="project-hero__meta">
            <span><MapPin aria-hidden="true" /> {project.location}</span>
            <span><Building2 aria-hidden="true" /> {project.floors.length} floors</span>
          </div>
        </div>
        <StatusBadge
          label={projectStatuses[project.status]}
          tone={projectTones[project.status]}
        />
      </header>

      {notice ? (
        <div className="workspace-notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      ) : null}

      <div className="workspace-overview">
        <div>
          <span>Client account</span>
          <strong>{project.clientId}</strong>
        </div>
        <div>
          <span>Assigned team</span>
          <strong>{project.assignedDesignerIds.length} designers</strong>
        </div>
        <div>
          <span>Delivery window</span>
          <strong>
            {formatMonth(project.plannedStartAt)} – {formatMonth(project.plannedEndAt)}
          </strong>
        </div>
      </div>

      <details className="project-plan-requests" open={planRequestsOpen} onToggle={(event) => setPlanRequestsOpen(event.currentTarget.open)}>
        <summary>Client plan change requests</summary>
        {planRequestsOpen ? <EstimatePlanChangeRequests /> : null}
      </details>

      <section className="project-structure" aria-labelledby="structure-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Delivery structure</p>
            <h2 id="structure-title">Floors, stages, and tasks</h2>
          </div>
          <button
            type="button"
            className="button button--secondary"
            onClick={() =>
              setStructureAction({
                kind: "floor",
                projectId: project.id,
                nextOrder: nextOrder(project.floors)
              })
            }
          >
            <Plus aria-hidden="true" /> Add floor
          </button>
        </div>

        {project.floors.length ? (
          <div className="floor-list">
            {project.floors
              .slice()
              .sort((left, right) => left.order - right.order)
              .map((floor) => {
                const floorOpen = openFloors.has(floor.id);
                const floorPanelId = `floor-panel-${floor.id}`;
                return (
                  <article className="floor-card" key={floor.id}>
                    <button
                      type="button"
                      className="disclosure disclosure--floor"
                      aria-expanded={floorOpen}
                      aria-controls={floorPanelId}
                      onClick={() => toggle(setOpenFloors, floor.id)}
                    >
                      <span className="disclosure__icon">
                        <Layers3 aria-hidden="true" />
                      </span>
                      <span className="disclosure__title">
                        <span>Floor {floor.number}</span>
                        <strong>{floor.name}</strong>
                      </span>
                      <span className="disclosure__progress">
                        <b>{floor.progress}%</b>
                        <ProgressBar
                          value={floor.progress}
                          label={`${floor.name}: ${floor.progress}% complete`}
                        />
                      </span>
                      <ChevronDown
                        className={floorOpen ? "chevron chevron--open" : "chevron"}
                        aria-hidden="true"
                      />
                    </button>

                    {floorOpen ? (
                      <div id={floorPanelId} className="floor-card__content">
                        <div className="structure-actions">
                          <button
                            type="button"
                            className="button button--secondary"
                            aria-label={`Add stage to ${floor.name}`}
                            onClick={() =>
                              setStructureAction({
                                kind: "stage",
                                projectId: project.id,
                                floorId: floor.id,
                                nextOrder: nextOrder(floor.stages)
                              })
                            }
                          >
                            <Plus aria-hidden="true" /> Add stage
                          </button>
                        </div>
                        {floor.stages.length ? (
                          floor.stages
                            .slice()
                            .sort((left, right) => left.order - right.order)
                            .map((stage) => {
                              const stageOpen = openStages.has(stage.id);
                              const stagePanelId = `stage-panel-${stage.id}`;
                              return (
                                <section className="stage-card" key={stage.id}>
                                  <button
                                    type="button"
                                    className="disclosure disclosure--stage"
                                    aria-expanded={stageOpen}
                                    aria-controls={stagePanelId}
                                    onClick={() => toggle(setOpenStages, stage.id)}
                                  >
                                    <span className="disclosure__title">
                                      <span>Stage {String(stage.order).padStart(2, "0")}</span>
                                      <strong>{stage.name}</strong>
                                    </span>
                                    <span>{stage.tasks.length} tasks</span>
                                    <ChevronDown
                                      className={
                                        stageOpen ? "chevron chevron--open" : "chevron"
                                      }
                                      aria-hidden="true"
                                    />
                                  </button>
                                  {stageOpen ? (
                                    <div id={stagePanelId} className="task-list">
                                      <div className="structure-actions">
                                        <button
                                          type="button"
                                          className="button button--secondary"
                                          aria-label={`Add task to ${stage.name}`}
                                          onClick={() =>
                                            setStructureAction({
                                              kind: "task",
                                              projectId: project.id,
                                              stageId: stage.id,
                                              assignedDesignerIds:
                                                project.assignedDesignerIds,
                                              nextOrder: nextOrder(stage.tasks)
                                            })
                                          }
                                        >
                                          <Plus aria-hidden="true" /> Add task
                                        </button>
                                      </div>
                                      {stage.tasks.length ? (
                                        stage.tasks
                                          .slice()
                                          .sort((left, right) => left.order - right.order)
                                          .map((task) => (
                                            <TaskRow
                                              key={task.id}
                                              task={task}
                                              userId={user.id}
                                              onUpdate={() =>
                                                setTaskAction({
                                                  kind: "update",
                                                  taskId: task.id
                                                })
                                              }
                                              onUpload={() =>
                                                setTaskAction({
                                                  kind: "upload",
                                                  taskId: task.id
                                                })
                                              }
                                            />
                                          ))
                                      ) : (
                                        <p className="inline-empty">
                                          No tasks have been added to this stage.
                                        </p>
                                      )}
                                    </div>
                                  ) : null}
                                </section>
                              );
                            })
                        ) : (
                          <p className="inline-empty">
                            No stages have been added to this floor.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
          </div>
        ) : (
          <div className="project-empty project-empty--compact">
            <div>
              <h3>No floors planned yet</h3>
              <p>This project has no delivery structure to display.</p>
            </div>
          </div>
        )}
      </section>

      <DesignUploadsWorkspace projectId={project.id} />

      {taskAction?.kind === "update" && selectedTask ? (
        <TaskUpdateDialog
          task={selectedTask}
          userId={user.id}
          onClose={() => setTaskAction(null)}
          onSaved={() => setNotice("Task update saved.")}
        />
      ) : null}
      {taskAction?.kind === "upload" && selectedTask ? (
        <DesignUploadDialog
          task={selectedTask}
          onClose={() => setTaskAction(null)}
          onUploaded={(version: DesignVersion) =>
            setNotice(
              `${version.originalFilename} uploaded as version ${version.versionNumber}.`
            )
          }
        />
      ) : null}
      {structureAction ? (
        <ProjectStructureDialog
          action={structureAction}
          onClose={() => setStructureAction(null)}
          onCreated={setNotice}
        />
      ) : null}
    </section>
  );
}

function nextOrder(items: Array<{ order: number }>): number {
  return items.reduce((highest, item) => Math.max(highest, item.order), 0) + 1;
}

function findTask(
  project: ProjectHierarchy,
  taskId: string
): ProjectTask | undefined {
  for (const floor of project.floors) {
    for (const stage of floor.stages) {
      const task = stage.tasks.find((candidate) => candidate.id === taskId);
      if (task) return task;
    }
  }
  return undefined;
}

const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

function formatMonth(value: string): string {
  return monthFormatter.format(new Date(value));
}

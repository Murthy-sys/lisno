import { refreshProjectManagerAssignment } from "./projectManagerAssignmentCache";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { ROLE_LABELS } from "../../api/authorization-contract";
import { ApiError } from "../../api/client";
import type {
  AdminProjectSummary,
  ProjectWorkflowSectionAssignment,
  ProjectWorkflowTask,
  WorkerAssignmentOption
} from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Field";
import { PageState } from "../../components/ui/PageState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { adminProjectKeys } from "./adminProjectsApi";
import { canAssignProjectCoordination } from "./adminProjectPresentation";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";
import {
  getAdminProjectSectionAssignments,
  getAdminProjectWorkflowTasks,
  getWorkerAssignmentOptions,
  overrideSectionWorkerAssignment,
  overrideWorkerAssignment,
  projectWorkflowKeys
} from "../workflow/projectWorkflowApi";

const MIXED_ASSIGNMENT_VALUE = "__multiple_assignees__";

type AssignmentArea = "all" | "procurement" | "manager" | "trades";

export function WorkerAssignmentPanel({ project, defaultExpanded = false, showProjectManager = true, assignmentArea = "all" }: {
  project: AdminProjectSummary; defaultExpanded?: boolean; showProjectManager?: boolean; assignmentArea?: AssignmentArea;
}) {
  return <WorkerAssignmentPanelForProject key={`${project.id}:${assignmentArea}`} project={project} defaultExpanded={defaultExpanded} showProjectManager={showProjectManager} assignmentArea={assignmentArea} />;
}

function WorkerAssignmentPanelForProject({ project, defaultExpanded, showProjectManager, assignmentArea }: {
  project: AdminProjectSummary; defaultExpanded: boolean; showProjectManager: boolean; assignmentArea: AssignmentArea;
}) {
  const approved = project.estimate?.designPlanStatus === "approved";
  const coordinationAvailable = canAssignProjectCoordination(project);
  const showCoordination = assignmentArea !== "trades";
  const showTradeSections = assignmentArea === "all" || assignmentArea === "trades";
  const scoped = assignmentArea !== "all";
  const panelTitle = assignmentArea === "procurement" ? "Procurement" : assignmentArea === "manager" ? "Project Manager" : assignmentArea === "trades" ? "Trade teams" : "Task assignment";
  const peopleAvailable = showCoordination ? coordinationAvailable : approved;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const tasks = useQuery({
    queryKey: projectWorkflowKeys.projectTasks(project.id),
    queryFn: () => getAdminProjectWorkflowTasks(project.id),
    enabled: showCoordination && coordinationAvailable
  });
  const sections = useQuery({
    queryKey: projectWorkflowKeys.sectionAssignments(project.id),
    queryFn: () => getAdminProjectSectionAssignments(project.id),
    enabled: showTradeSections && approved
  });
  const workers = useQuery({
    queryKey: projectWorkflowKeys.workers,
    queryFn: getWorkerAssignmentOptions,
    enabled: peopleAvailable
  });
  const taskIntegrityError = showCoordination && (tasks.data?.some(
    (task) => task.projectId !== project.id ||
      (project.estimate !== null && task.estimateId !== project.estimate.id)
  ) ?? false);
  const sectionIntegrityError = showTradeSections && approved && sections.data
    ? sectionAssignmentsIntegrityError(project, sections.data)
    : null;
  const trustedTasks = showCoordination && !taskIntegrityError ? tasks.data ?? [] : [];
  const trustedSections = showTradeSections && approved && !sectionIntegrityError ? sections.data ?? [] : [];
  const procurementTasks = assignmentArea !== "manager" ? trustedTasks.filter((task) => task.kind === "procurement") : [];
  const siteTasks = showProjectManager && assignmentArea !== "procurement" ? trustedTasks.filter((task) => task.kind === "site_execution") : [];
  const coordinationTasks = assignmentArea === "all" ? trustedTasks.filter((task) => task.kind === "finance") : [];
  const assignedSections = trustedSections.filter(
    (section) => section.assignmentState === "assigned"
  ).length;
  const outerTriggerId = `task-assignment-${project.id}-${assignmentArea}-trigger`;
  const outerTitleId = `task-assignment-${project.id}-${assignmentArea}-title`;
  const outerPanelId = `task-assignment-${project.id}-${assignmentArea}-panel`;
  const summaryId = `task-assignment-${project.id}-${assignmentArea}-summary`;
  const queryPending = workers.isPending || showCoordination && tasks.isPending || showTradeSections && approved && sections.isPending;
  const queryFailed = workers.isError || showCoordination && tasks.isError || showTradeSections && approved && sections.isError;

  if (!peopleAvailable) {
    return (
      <Surface as="section" className="admin-project-detail__surface worker-assignment" aria-labelledby={outerTitleId}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Approved design execution</p>
            <h2 id={outerTitleId}>{panelTitle}</h2>
          </div>
        </div>
        <p>{assignmentArea === "trades" ? "Trade assignment opens after the Client approves the design plan." : project.estimationWorkflowVersion === 2 || project.estimationWorkflowVersion === 3
          ? "Project coordination opens after the Client approves the initial estimate. Trade assignment opens after design approval."
          : "Worker assignment opens after the Client—or a Sales Manager acting with proof—approves the design plan."}</p>
      </Surface>
    );
  }

  const summary = queryPending
    ? "Loading assignment summary"
    : queryFailed || taskIntegrityError || sectionIntegrityError
      ? "Assignment summary unavailable"
      : approved ? `${assignedSections} of ${trustedSections.length} ${trustedSections.length === 1 ? "section" : "sections"} assigned`
      : `${[...procurementTasks, ...siteTasks].filter(task => task.assignedWorker).length} of ${procurementTasks.length + siteTasks.length} coordination roles assigned`;

  return (
    <Surface as="section" className="admin-project-detail__surface worker-assignment" aria-labelledby={outerTitleId}>
      <h2 id={outerTitleId} className={scoped ? "worker-assignment__title" : "sr-only"}>{panelTitle}</h2>
      {!scoped ? <button
        id={outerTriggerId}
        className="worker-assignment__disclosure-trigger"
        type="button"
        aria-labelledby={outerTitleId}
        aria-describedby={summaryId}
        aria-expanded={expanded}
        aria-controls={outerPanelId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="worker-assignment__disclosure-identity" aria-hidden="true">
          <span className="eyebrow">{approved ? "Approved design execution" : "Project preparation"}</span>
          <span className="worker-assignment__disclosure-title">Task assignment</span>
        </span>
        <span id={summaryId} className="worker-assignment__disclosure-summary">{summary}</span>
        <ChevronDown className="worker-assignment__chevron" aria-hidden="true" />
      </button> : null}

      {scoped || expanded ? (
        <div id={outerPanelId} className="worker-assignment__body">
          {queryPending ? (
            <PageState state="loading" message="Loading task assignments and active workers…" />
          ) : queryFailed || taskIntegrityError || sectionIntegrityError ? (
            <PageState
              state="error"
              message={sectionIntegrityError ?? (taskIntegrityError
                ? "Execution assignments do not match this project's approved estimate."
                : "Task assignments could not be loaded.")}
              action={{
                label: "Try again",
                onAction: () => void Promise.all([workers.refetch(), ...(showCoordination ? [tasks.refetch()] : []), ...(showTradeSections && approved ? [sections.refetch()] : [])])
              }}
            />
          ) : (
            <>
              {showCoordination ? <ProjectCoordination
                projectId={project.id}
                title={scoped ? panelTitle : undefined}
                headingId={scoped ? outerTitleId : `${outerTitleId}-coordination`}
                showTaskProgress={!scoped}
                assignmentTasks={[...procurementTasks, ...siteTasks]}
                progressTasks={coordinationTasks}
                workers={workers.data ?? []}
                refreshingPeople={workers.isFetching}
                onRefreshPeople={() => void workers.refetch()}
                onStale={() => void tasks.refetch()}
              /> : null}
              {showTradeSections ? <section className="worker-assignment__sections" aria-labelledby={`${outerTitleId}-sections`}>
                <div className="section-heading">
                  <div>
                    <h3 id={`${outerTitleId}-sections`} className={assignmentArea === "trades" ? "sr-only" : undefined}>Work sections</h3>
                    <p>{approved ? "Assign one eligible person to every unfinished task in a selected Estimate section." : "Trade assignment opens after the Client approves the design plan. Procurement and Project Manager coordination can be assigned now."}</p>
                  </div>
                  {approved ? <span>{assignedSections} of {trustedSections.length} assigned</span> : null}
                </div>
                {!approved ? null : trustedSections.length === 0 ? (
                  <p className="inline-empty">No trade work was selected in the approved Estimate.</p>
                ) : (
                  <div className="worker-assignment__section-list">
                    {trustedSections.map((section) => (
                      <SectionAssignmentDisclosure key={section.id} section={section} workers={workers.data ?? []} />
                    ))}
                  </div>
                )}
              </section> : null}
            </>
          )}
        </div>
      ) : null}
    </Surface>
  );
}

function ProjectCoordination({
  projectId,
  title,
  headingId,
  showTaskProgress = true,
  assignmentTasks,
  progressTasks,
  workers,
  refreshingPeople,
  onRefreshPeople,
  onStale
}: {
  projectId: string;
  title?: string;
  headingId: string;
  showTaskProgress?: boolean;
  assignmentTasks: ProjectWorkflowTask[];
  progressTasks: ProjectWorkflowTask[];
  workers: WorkerAssignmentOption[];
  refreshingPeople: boolean;
  onRefreshPeople: () => void;
  onStale: () => void;
}) {
  return (
    <section className="worker-assignment__coordination" aria-labelledby={title ? undefined : headingId}>
      <div className="section-heading">
        <div>
          {!title ? <h3 id={headingId}>Project coordination</h3> : null}
          <p>{title ? title === "Procurement" ? "Assign the person responsible for purchasing and vendor coordination." : "Assign the Project Manager responsible for site coordination." : assignmentTasks.some(task => task.kind === "site_execution") ? "Assign Procurement and Project Manager, then follow their progress." : "Assign Procurement, then follow project coordination progress."}</p>
        </div>
        <Button variant="secondary" busy={refreshingPeople} busyLabel="Refreshing people…" onClick={onRefreshPeople}>Refresh people</Button>
      </div>
      {assignmentTasks.length === 0 && progressTasks.length === 0 ? (
        <p className="inline-empty">{title ? `No ${title} assignment is available for this project yet.` : "No project coordination tasks are available."}</p>
      ) : (
        <div className="worker-assignment__coordination-grid">
          {assignmentTasks.map((task) => (
            <WorkerAssignmentRow key={task.id} projectId={projectId} task={task} workers={workers} onStale={onStale} showTaskProgress={showTaskProgress} />
          ))}
          {progressTasks.map((task) => <CoordinationProgressCard key={task.id} task={task} />)}
        </div>
      )}
    </section>
  );
}

function CoordinationProgressCard({ task }: { task: ProjectWorkflowTask }) {
  return (
    <article className="worker-assignment__coordination-card" aria-label={`${task.title} progress`}>
      <div>
        <span>{ROLE_LABELS[task.assigneeRole]}</span>
        <StatusBadge tone={statusTone(task.status)} label={statusLabel(task.status)} />
      </div>
      <strong>{task.title}</strong>
      <ProgressBar value={task.progress} label={`${task.title}: ${task.progress}% complete`} />
      <small>{task.progress}% complete</small>
    </article>
  );
}

function SectionAssignmentDisclosure({ section, workers }: {
  section: ProjectWorkflowSectionAssignment;
  workers: WorkerAssignmentOption[];
}) {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [workerId, setWorkerId] = useState(() => sectionSelection(section));
  const [staleRevision, setStaleRevision] = useState<string | null>(null);
  const [conflictRefreshed, setConflictRefreshed] = useState(false);
  useEffect(() => setWorkerId(sectionSelection(section)), [section.assignmentState, section.assignedWorker?.id, section.revision]);
  const candidates = workers.filter((worker) => worker.role === section.assigneeRole);
  const triggerId = `section-assignment-${section.projectId}-${section.sourceSectionId}-trigger`;
  const panelId = `section-assignment-${section.projectId}-${section.sourceSectionId}-panel`;
  const selectId = `section-assignment-${section.projectId}-${section.sourceSectionId}-worker`;
  const completed = section.status === "completed";
  const unchanged = section.assignmentState !== "mixed" && workerId === (section.assignedWorker?.id ?? "");
  const explicitChoiceRequired = workerId === MIXED_ASSIGNMENT_VALUE;
  const assignment = useMutation({
    mutationFn: () => overrideSectionWorkerAssignment({
      projectId: section.projectId,
      estimateId: section.estimateId,
      designPlanVersion: section.designPlanVersion,
      sourceSectionId: section.sourceSectionId,
      expectedRevision: section.revision,
      workerId: workerId || null
    }),
    onSuccess: (updated) => {
      setStaleRevision(null);
      setConflictRefreshed(false);
      client.setQueryData<ProjectWorkflowSectionAssignment[]>(
        projectWorkflowKeys.sectionAssignments(section.projectId),
        (current) => current?.map((candidate) => candidate.id === updated.id ? updated : candidate)
      );
      void Promise.all([
        client.invalidateQueries({ queryKey: projectWorkflowKeys.sectionAssignments(section.projectId) }),
        client.invalidateQueries({ queryKey: projectWorkflowKeys.projectTasks(section.projectId) }),
        client.invalidateQueries({ queryKey: projectWorkflowKeys.operational }),
        client.invalidateQueries({ queryKey: projectStatusKeys.all }),
        client.invalidateQueries({ queryKey: adminProjectKeys.all }),
        client.invalidateQueries({ queryKey: adminProjectKeys.detail(section.projectId) }),
        client.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "WORKFLOW_SECTION_ASSIGNMENT_STALE") {
        setStaleRevision(section.revision);
        void client.invalidateQueries({ queryKey: projectWorkflowKeys.sectionAssignments(section.projectId) });
      }
    }
  });
  useEffect(() => {
    if (staleRevision !== null && staleRevision !== section.revision) {
      setStaleRevision(null);
      setConflictRefreshed(true);
      assignment.reset();
    }
  }, [section.revision, staleRevision]);
  const assignedLabel = section.assignmentState === "assigned" && section.assignedWorker
    ? section.assignedWorker.name
    : section.assignmentState === "mixed" ? "Multiple assignees" : "Unassigned";

  return (
    <div className="worker-assignment__section">
      <h4 className="worker-assignment__section-heading">
        <button
          id={triggerId}
          className="worker-assignment__section-trigger"
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="worker-assignment__section-identity">
            <span className="worker-assignment__section-title">{section.sectionLabel}</span>
            <span>{assignedLabel}</span>
          </span>
          <span className="worker-assignment__section-state">
            <StatusBadge tone={statusTone(section.status)} label={statusLabel(section.status)} />
            <span>{section.progress}% complete</span>
            <span>{section.unfinishedTaskCount} of {section.taskCount} tasks unfinished</span>
          </span>
          <ChevronDown className="worker-assignment__chevron" aria-hidden="true" />
        </button>
      </h4>
      {expanded ? (
        <div id={panelId} className="worker-assignment__section-panel" role="region" aria-labelledby={triggerId}>
          <dl className="worker-assignment__section-details">
            <div>
              <dt>Assigned person</dt>
              <dd>
                {section.assignmentState === "assigned" && section.assignedWorker ? (
                  <><strong>{section.assignedWorker.name}</strong><span>{section.assignedWorker.email}</span></>
                ) : section.assignmentState === "mixed" ? (
                  <><strong>Multiple assignees</strong><span>Select one person or Unassigned to reconcile unfinished tasks.</span></>
                ) : <strong>Unassigned</strong>}
              </dd>
            </div>
            <div><dt>Required role</dt><dd>{ROLE_LABELS[section.assigneeRole]}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(section.status)}</dd></div>
            <div><dt>Task count</dt><dd>{section.taskCount} total · {section.unfinishedTaskCount} unfinished</dd></div>
          </dl>
          <div className="worker-assignment__section-progress">
            <ProgressBar value={section.progress} label={`${section.sectionLabel}: ${section.progress}% complete`} />
            <span>{section.progress}% complete</span>
          </div>
          <div className="worker-assignment__section-controls">
            <label htmlFor={selectId}>Assign or reassign {section.sectionLabel}</label>
            <Select
              id={selectId}
              value={workerId}
              disabled={completed || assignment.isPending}
              onChange={(event) => {
                setWorkerId(event.target.value);
                setStaleRevision(null);
                setConflictRefreshed(false);
                assignment.reset();
              }}
            >
              {section.assignmentState === "mixed" ? (
                <option value={MIXED_ASSIGNMENT_VALUE} disabled>Choose a person or Unassigned</option>
              ) : null}
              <option value="">Unassigned</option>
              {section.assignedWorker && !candidates.some((worker) => worker.id === section.assignedWorker?.id) ? (
                <option value={section.assignedWorker.id} disabled>
                  {section.assignedWorker.name} · {section.assignedWorker.email} (unavailable)
                </option>
              ) : null}
              {candidates.map((worker) => (
                <option value={worker.id} key={worker.id}>{worker.name} · {worker.email}</option>
              ))}
            </Select>
            <Button
              type="button"
              busy={assignment.isPending}
              busyLabel="Saving assignment…"
              disabled={completed || explicitChoiceRequired || unchanged}
              onClick={() => assignment.mutate()}
            >
              {sectionActionLabel(section, workerId)}
            </Button>
          </div>
          {completed ? <p className="worker-assignment__section-note">Completed section assignments are read-only.</p> : null}
          {assignment.isError ? (
            <p role="alert" className="worker-assignment__section-error">
              {assignment.error instanceof ApiError && assignment.error.code === "WORKFLOW_SECTION_ASSIGNMENT_STALE"
                ? "This section changed while you were assigning it. The latest assignment is being refreshed; review it and try again."
                : assignment.error instanceof ApiError ? assignment.error.message : "The section assignment could not be saved."}
            </p>
          ) : null}
          {assignment.isSuccess ? <p role="status" className="worker-assignment__section-success">{section.sectionLabel} assignment saved.</p> : null}
          {conflictRefreshed ? (
            <p role="status" className="worker-assignment__section-note">
              The latest {section.sectionLabel} assignment was loaded after a conflict. Review it before saving again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkerAssignmentRow({ projectId, task, workers, onStale, showTaskProgress = true }: {
  projectId: string;
  task: ProjectWorkflowTask;
  workers: WorkerAssignmentOption[];
  onStale: () => void;
  showTaskProgress?: boolean;
}) {
  const client = useQueryClient();
  const [workerId, setWorkerId] = useState(task.assignedWorker?.id ?? "");
  useEffect(() => setWorkerId(task.assignedWorker?.id ?? ""), [task.assignedWorker?.id]);
  const assigneeLabel = task.kind === "site_execution" ? "Project Manager" : "Procurement";
  const candidates = workers.filter((worker) => worker.role === task.assigneeRole);
  const assignment = useMutation({
    mutationFn: () => overrideWorkerAssignment({ projectId, taskId: task.id, expectedVersion: task.version, workerId: workerId || null }),
    onSuccess: (updated) => {
      client.setQueryData<ProjectWorkflowTask[]>(
        projectWorkflowKeys.projectTasks(projectId),
        (current) => current?.map((candidate) => candidate.id === updated.id ? updated : candidate)
      );
      void Promise.all([
        ...(task.kind === "site_execution" ? [refreshProjectManagerAssignment(client)] : []),
        client.invalidateQueries({ queryKey: projectWorkflowKeys.operational }),
        client.invalidateQueries({ queryKey: projectStatusKeys.all }),
        client.invalidateQueries({ queryKey: adminProjectKeys.all }),
        client.invalidateQueries({ queryKey: adminProjectKeys.detail(projectId) }),
        client.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "WORKFLOW_TASK_STALE") onStale();
    }
  });
  const unchanged = workerId === (task.assignedWorker?.id ?? "");
  const validSelection = workerId === "" || candidates.some(worker => worker.id === workerId);
  const assignedUnavailable = Boolean(task.assignedWorker && !candidates.some(worker => worker.id === task.assignedWorker!.id));

  return (
    <article id={task.kind === "procurement" ? `procurement-assignment-${projectId}` : undefined} className="worker-assignment__row worker-assignment__row--coordination" aria-label={`${task.title} assignment`}>
      {showTaskProgress ? <><div className="worker-assignment__task">
        <div><strong>{task.title}</strong><span>{ROLE_LABELS[task.assigneeRole]}</span></div>
        <StatusBadge tone={statusTone(task.status)} label={statusLabel(task.status)} />
      </div>
      <div className="worker-assignment__progress">
        <ProgressBar value={task.progress} label={`${task.title}: ${task.progress}% complete`} />
        <span>{task.progress}% complete</span>
      </div></> : null}
      <div className="worker-assignment__current" role="group" aria-label={`Current ${assigneeLabel}`}>
        <small>Current assignee</small>
        {task.assignedWorker ? <><strong>{task.assignedWorker.name}</strong><span>{task.assignedWorker.email}</span>{assignedUnavailable ? <small>Currently assigned; unavailable for a new assignment.</small> : null}</> : <span>Not assigned</span>}
      </div>
      {!candidates.length ? <p role="status" className="worker-assignment__empty-people">No active {assigneeLabel} people are available. Refresh people after an eligible account is activated.</p> : null}
      <label>
        Assigned {assigneeLabel}
        <Select
          value={workerId}
          disabled={task.status === "completed" || assignment.isPending}
          onChange={(event) => {
            setWorkerId(event.target.value);
            assignment.reset();
          }}
        >
          <option value="">Unassigned</option>
          {assignedUnavailable && task.assignedWorker ? <option value={task.assignedWorker.id} disabled>{task.assignedWorker.name} · Unavailable</option> : null}
          {candidates.map((worker) => <option value={worker.id} key={worker.id}>{worker.name} · {worker.email}</option>)}
        </Select>
      </label>
      <Button type="button" busy={assignment.isPending} busyLabel="Saving…" disabled={task.status === "completed" || unchanged || !validSelection} onClick={() => { if (validSelection) assignment.mutate(); }}>
        {!workerId && task.assignedWorker ? `Unassign ${assigneeLabel}` : task.assignedWorker ? `Reassign ${assigneeLabel}` : `Assign ${assigneeLabel}`}
      </Button>
      {assignment.isError ? <p role="alert">{assignment.error instanceof ApiError ? assignment.error.message : "The assignment could not be saved."}</p> : null}
      {assignment.isSuccess ? <p role="status">{ROLE_LABELS[task.assigneeRole]} assignment saved.</p> : null}
    </article>
  );
}

export function sectionAssignmentsIntegrityError(project: AdminProjectSummary, sections: ProjectWorkflowSectionAssignment[]): string | null {
  const estimate = project.estimate;
  if (!estimate || estimate.designPlanVersion === undefined) {
    return "Section assignments cannot be matched to this project's approved Design plan.";
  }
  const assignmentIds = new Set<string>();
  const sectionIds = new Set<string>();
  for (const section of sections) {
    if (section.projectId !== project.id || section.estimateId !== estimate.id || section.designPlanVersion !== estimate.designPlanVersion) {
      return "Section assignments do not match this project's approved Estimate and Design plan.";
    }
    if (!section.id || assignmentIds.has(section.id) || !section.sourceSectionId || sectionIds.has(section.sourceSectionId)) {
      return "Section assignments contain a duplicate or missing stable identity.";
    }
    assignmentIds.add(section.id);
    sectionIds.add(section.sourceSectionId);
  }
  return null;
}

function sectionSelection(section: ProjectWorkflowSectionAssignment) {
  if (section.assignmentState === "mixed") return MIXED_ASSIGNMENT_VALUE;
  return section.assignedWorker?.id ?? "";
}

function sectionActionLabel(section: ProjectWorkflowSectionAssignment, workerId: string) {
  if (!workerId && section.assignmentState !== "unassigned") return "Unassign person";
  if (section.assignmentState === "assigned") return "Reassign person";
  return "Assign person";
}

function statusTone(status: "open" | "in_progress" | "completed") {
  return status === "completed" ? "success" : status === "in_progress" ? "warning" : "info";
}

function statusLabel(status: "open" | "in_progress" | "completed") {
  return status.replaceAll("_", " ");
}

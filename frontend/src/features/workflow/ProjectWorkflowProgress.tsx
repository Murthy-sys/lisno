import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, Circle, Clock3, LockKeyhole, X } from "lucide-react";
import { createPortal } from "react-dom";

import type { TaskStatus } from "../../api/types";
import { RiskBadge } from "../../components/tasks/RiskBadge";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import type { DesignWorkflowView } from "./projectWorkflowApi";
import { currentProjectWorkflowStage, workflowStageStatus as savedStageStatus } from "./projectWorkflowSelectors";
import { WorkflowStageRequirements } from "./WorkflowStageRequirements";
import "./projectWorkflowProgress.css";

type WorkflowStage = DesignWorkflowView["floors"][number]["stages"][number];
type WorkflowTask = WorkflowStage["tasks"][number];

const statusLabels: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  completed: "Completed"
};

const statusTones: Record<TaskStatus, StatusTone> = {
  not_started: "neutral",
  in_progress: "info",
  in_review: "warning",
  blocked: "danger",
  completed: "success"
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", timeZoneName: "short"
});

function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not set";
  return dateFormatter.format(new Date(value));
}

function savedOrder<T extends { order: number; id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function useWorkflowClock(serverNow: string, receivedAt?: number) {
  const anchor = useMemo(() => ({
    serverTime: Date.parse(serverNow), receivedAt: receivedAt ?? Date.now()
  }), [serverNow, receivedAt]);
  const [clientNow, setClientNow] = useState(Date.now);
  useEffect(() => {
    setClientNow(Date.now());
    const interval = window.setInterval(() => setClientNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [serverNow, receivedAt]);
  return anchor.serverTime + Math.max(0, clientNow - anchor.receivedAt);
}

function countdown(deadline: number, now: number): string {
  const totalSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds % 86400 / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  return `${days > 0 ? `${days}d ` : ""}${clock}`;
}

function countdownUrgency(remainingMs: number, allowanceMs?: number | null) {
  if (typeof allowanceMs === "number" && Number.isFinite(allowanceMs) && allowanceMs > 0) {
    if (remainingMs > allowanceMs * (2 / 3)) return { level: "comfortable", description: "More than two thirds of the allowed time remaining." };
    if (remainingMs > allowanceMs / 3) return { level: "approaching", description: "Between one third and two thirds of the allowed time remaining." };
    return { level: "urgent", description: "One third or less of the allowed time remaining." };
  }
  if (remainingMs > 172_800_000) return { level: "comfortable", description: "More than 2 days remaining." };
  if (remainingMs >= 86_400_000) return { level: "approaching", description: "1 to 2 days remaining." };
  return { level: "urgent", description: "Less than 1 day remaining." };
}

function OperationalStageDeadline({ stage, now, serverNow, id }: { stage: WorkflowStage; now: number; serverNow: string; id: string }) {
  const timing = stage.operational!.timing;
  const serverTime = Date.parse(serverNow);
  const ticking = timing.state === "running";
  const elapsed = ticking && Number.isFinite(serverTime) && Number.isFinite(now) ? Math.max(0, now - serverTime) : 0;
  const adjusted = timing.remainingMs! - elapsed;
  const overdue = ticking && (adjusted < 0 || Boolean(timing.targetAt && Date.parse(timing.targetAt) < now));
  const label = timing.state === "paused" ? "Paused" : overdue ? "Overdue" : adjusted === 0 ? "Due now" : "Time remaining";
  const urgency = countdownUrgency(adjusted, timing.slaAllowanceMs);
  return (
    <><span id={id} className="workflow-progress__deadline" data-overdue={overdue || undefined} data-urgency={urgency.level}>
      <span><Clock3 aria-hidden="true" />{label}</span>
      <time role="timer" aria-live="off" aria-describedby={`${id}-urgency`} dateTime={timing.targetAt ?? undefined}>{countdown(adjusted, 0)}</time>
    </span><span id={`${id}-urgency`} className="sr-only">{urgency.description}</span></>
  );
}

function StageDeadline({ stage, now, serverNow, id }: { stage: WorkflowStage; now: number; serverNow: string; id: string }) {
  if (stage.operational) return <OperationalStageDeadline stage={stage} now={now} serverNow={serverNow} id={id} />;
  const deadline = stage.deadlineAt ? Date.parse(stage.deadlineAt) : NaN;
  const deadlineTask = stage.tasks.find((task) => task.id === stage.deadlineTaskId);
  const isCompleted = stage.status === "completed";
  const hasDeadline = Number.isFinite(deadline);
  const clockAvailable = Number.isFinite(now);
  const timingLabel = isCompleted ? "Stage timing"
    : hasDeadline && clockAvailable && deadline < now ? "Overdue"
      : hasDeadline && clockAvailable && deadline === now ? "Due now" : "Time remaining";
  const urgency = hasDeadline && clockAvailable ? countdownUrgency(deadline - now) : undefined;
  return (
    <><span id={id} className="workflow-progress__deadline" data-overdue={!isCompleted && hasDeadline && deadline < now || undefined} data-urgency={urgency?.level}>
      <span><Clock3 aria-hidden="true" />{timingLabel}</span>
      {isCompleted ? <strong>Completed</strong> : hasDeadline ? (
        <time role="timer" aria-live="off" aria-describedby={urgency ? `${id}-urgency` : undefined} dateTime={stage.deadlineAt!} title={`Next task due${deadlineTask ? ` · ${deadlineTask.title}` : ""}: ${formatDate(stage.deadlineAt)}`}>
          {clockAvailable ? countdown(deadline, now) : formatDate(stage.deadlineAt)}
        </time>
      ) : <strong>No deadline set</strong>}
    </span>{urgency ? <span id={`${id}-urgency`} className="sr-only">{urgency.description}</span> : null}</>
  );
}

function hasActiveStageTimer(stage: WorkflowStage) {
  if (savedStageStatus(stage) === "completed") return false;
  if (stage.operational) {
    const { state, remainingMs } = stage.operational.timing;
    return (state === "running" || state === "paused") && remainingMs !== null && Number.isFinite(remainingMs);
  }
  return (stage.status === "in_progress" || stage.status === "in_review") && Boolean(stage.deadlineAt && Number.isFinite(Date.parse(stage.deadlineAt)));
}

function hasStageBlockers(stage: WorkflowStage) {
  return stage.operational ? stage.operational.blockingReasons.length > 0
    : stage.tasks.some((task) => task.blockedByTaskIds.length > 0 || task.status === "blocked");
}

function stageAppearance(stage: WorkflowStage, current: boolean) {
  const status = savedStageStatus(stage);
  if (status === "completed") return "completed";
  if (status === "blocked" || hasStageBlockers(stage)) return "blocked";
  if (current && (status === "in_progress" || status === "in_review")) return "current";
  return "upcoming";
}

function StageOperationalDetails({ stage, compact = false }: { stage: WorkflowStage; compact?: boolean }) {
  const id = useId();
  const RoomHeading = compact ? "h5" : "h6";
  const operational = stage.operational!;
  const { timing } = operational;
  const showElapsed = timing.clockOwner !== null || timing.designerElapsedMs > 0 || timing.clientElapsedMs > 0 || ["running", "paused", "completed"].includes(timing.state);
  if (compact && !operational.blockingReasons.length && !operational.facts.length && !operational.rooms?.length) return null;
  return (
    <section className={`workflow-progress__operational${compact ? " workflow-progress__operational--compact" : ""}`} aria-labelledby={compact ? undefined : `${id}-heading`} aria-label={compact ? `${stage.name} recorded information` : undefined}>
      {!compact ? <h5 id={`${id}-heading`}>Recorded stage details</h5> : null}
      {operational.blockingReasons.length ? <div className="workflow-progress__dependency-group workflow-progress__dependency-group--blocked"><strong><LockKeyhole aria-hidden="true" />Waiting for</strong><ul className="workflow-progress__dependencies">{operational.blockingReasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul></div> : null}
      {!compact || operational.facts.length > 0 ? <dl className="workflow-progress__facts">
        {!compact ? <>
        {timing.band ? <div><dt>Current SLA band</dt><dd>{timing.band}</dd></div> : null}
        {timing.clockOwner ? <div><dt>Clock attributed to</dt><dd>{timing.clockOwner}</dd></div> : null}
        {timing.startsAt ? <div><dt>Activity opens</dt><dd>{formatDate(timing.startsAt)}</dd></div> : null}
        {timing.originalTargetAt ? <div><dt>Original SLA target</dt><dd>{formatDate(timing.originalTargetAt)}</dd></div> : null}
        {timing.targetAt ? <div><dt>Current SLA target</dt><dd>{formatDate(timing.targetAt)}</dd></div> : null}
        {timing.endsAt ? <div><dt>Clock ended</dt><dd>{formatDate(timing.endsAt)}</dd></div> : null}
        {showElapsed ? <><div><dt>Recorded Designer elapsed time</dt><dd>{countdown(timing.designerElapsedMs, 0)}</dd></div><div><dt>Recorded Client elapsed time</dt><dd>{countdown(timing.clientElapsedMs, 0)}</dd></div></> : null}
        </> : null}
        {operational.facts.map((fact, index) => <div key={`${index}-${fact.label}`}><dt>{fact.label}</dt><dd>{/^\d{4}-\d{2}-\d{2}T/.test(fact.value) && Number.isFinite(Date.parse(fact.value)) ? formatDate(fact.value) : fact.value.startsWith("https://") ? <a href={fact.value} target="_blank" rel="noopener noreferrer">Open {fact.label.toLowerCase()}</a> : fact.value}</dd></div>)}
      </dl> : null}
      {operational.rooms?.length ? <div className="workflow-progress__room-group"><RoomHeading>Room readiness</RoomHeading><ul className="workflow-progress__rooms">{operational.rooms.map((room) => <li key={room.id}><strong>{room.name}</strong><span>{!room.required ? "Existing furniture not required" : room.hasDimensions ? "Dimensions received" : "Dimensions pending"}</span>{room.canProceed ? <StatusBadge label="Can proceed" tone="success" /> : null}</li>)}</ul></div> : null}
      {!compact && operational.reminders?.length ? <div className="workflow-progress__room-group"><h6>Due reminders</h6><ul className="workflow-progress__reminders">{operational.reminders.map((reminder) => <li key={reminder.id}><span>{reminder.label}</span><time dateTime={reminder.dueAt}>{formatDate(reminder.dueAt)}</time></li>)}</ul></div> : null}
    </section>
  );
}

function DependencyNames({ ids, names }: { ids: string[]; names: Map<string, string> }) {
  return <ul className="workflow-progress__dependencies">{ids.map((id) => <li key={id}>{names.get(id) ?? "Dependency unavailable"}</li>)}</ul>;
}

function TaskDetails({ task, taskNames, onOpenTask, actionLabel }: {
  task: WorkflowTask;
  taskNames: Map<string, string>;
  onOpenTask?: (taskId: string) => void;
  actionLabel: string;
}) {
  return (
    <li className="workflow-progress__task">
      <div className="workflow-progress__task-heading">
        <h5>{task.title}</h5>
        <div className="workflow-progress__badges">
          <StatusBadge label={statusLabels[task.status]} tone={statusTones[task.status]} />
          <RiskBadge risk={task.risk} />
        </div>
      </div>
      {task.description ? <p className="workflow-progress__description">{task.description}</p> : null}
      <p className="workflow-progress__risk-reason">{task.risk.reason}</p>
      <dl className="workflow-progress__facts">
        {task.floorName ? <div><dt>Floor</dt><dd>{task.floorName}</dd></div> : null}
        <div><dt>Owner</dt><dd>{task.ownerName ?? "Unassigned"}</dd></div>
        <div><dt>Planned start</dt><dd>{formatDate(task.plannedStartAt)}</dd></div>
        <div><dt>Original deadline</dt><dd>{formatDate(task.originalDeadlineAt)}</dd></div>
        <div><dt>Current deadline</dt><dd>{formatDate(task.currentDeadlineAt)}</dd></div>
        {task.completedAt ? <div><dt>Completed</dt><dd>{formatDate(task.completedAt)}</dd></div> : null}
      </dl>
      <div className="workflow-progress__task-progress">
        <span>{task.progress}% complete</span>
        <ProgressBar value={task.progress} label={`${task.title}: ${task.progress}% complete`} />
      </div>
      {task.dependencyTaskIds.length > 0 ? <div className="workflow-progress__dependency-group"><strong>Depends on</strong><DependencyNames ids={task.dependencyTaskIds} names={taskNames} /></div> : null}
      {task.blockedByTaskIds.length > 0 ? <div className="workflow-progress__dependency-group workflow-progress__dependency-group--blocked"><strong><LockKeyhole aria-hidden="true" />Waiting for</strong><DependencyNames ids={task.blockedByTaskIds} names={taskNames} /></div> : null}
      {onOpenTask ? <Button variant="secondary" size="compact" onClick={() => onOpenTask(task.id)} aria-label={`${actionLabel}: ${task.title}`} trailingIcon={<ArrowRight />}>{actionLabel}</Button> : null}
    </li>
  );
}

export function ProjectWorkflowProgress({ workflow, onOpenTask, actionLabel = "Open task", className, renderStageActions, initialStageId, timelineContainer, presentation = "full" }: {
  workflow: DesignWorkflowView;
  onOpenTask?: (taskId: string) => void;
  actionLabel?: string;
  className?: string;
  renderStageActions?: (stage: WorkflowStage) => ReactNode;
  initialStageId?: string;
  timelineContainer?: HTMLElement | null;
  presentation?: "full" | "client" | "designer";
}) {
  const id = useId();
  const now = useWorkflowClock(workflow.serverNow, workflow.receivedAt);
  const [initialActionStageId] = useState(initialStageId);
  const [selected, setSelected] = useState<{ projectId: string; groupKey: string; stageId: string; collapsed?: boolean } | null>(() =>
    initialStageId && workflow.projectStages?.some((stage) => stage.id === initialStageId)
      ? { projectId: workflow.projectId, groupKey: "project", stageId: initialStageId } : null
  );
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const disclosureButton = useRef<HTMLButtonElement | null>(null);
  const groups = useMemo(() => [
    ...(workflow.projectStages?.length ? [{
      key: "project", name: "Project workflow", scope: "project" as const,
      stages: savedOrder(workflow.projectStages)
    }] : []),
    ...savedOrder(workflow.floors).map((floor) => ({
      key: `floor:${floor.id}`, name: floor.name, scope: "floor" as const,
      stages: savedOrder(floor.stages)
    }))
  ], [workflow.projectStages, workflow.floors]);
  const { stageNames, taskNames } = useMemo(() => {
    const stageNames = new Map<string, string>();
    const taskNames = new Map<string, string>();
    for (const group of groups) {
      for (const stage of group.stages) {
        stageNames.set(stage.id, `${group.name} · ${stage.name}`);
        for (const source of stage.sourceStages ?? []) stageNames.set(source.id, `${source.floorName} · ${source.name}`);
        for (const task of stage.tasks) taskNames.set(task.id, `${task.floorName ?? group.name} · ${stage.name} · ${task.title}`);
      }
    }
    return { stageNames, taskNames };
  }, [groups]);
  const stageCount = groups.reduce((total, group) => total + group.stages.length, 0);
  const completedCount = groups.reduce((total, group) => total + group.stages.filter((stage) => savedStageStatus(stage) === "completed").length, 0);
  const projectStages = groups.find((group) => group.scope === "project")?.stages;
  const floorStages = groups.filter((group) => group.scope === "floor").flatMap((group) => group.stages);
  const currentStage = currentProjectWorkflowStage(workflow)
    ?? (projectStages ? floorStages.find(hasActiveStageTimer) : floorStages.find((stage) => savedStageStatus(stage) !== "completed"));
  const previousCurrentStage = useRef({ projectId: workflow.projectId, stageId: currentStage?.id });
  useEffect(() => {
    const previous = previousCurrentStage.current;
    previousCurrentStage.current = { projectId: workflow.projectId, stageId: currentStage?.id };
    if (previous.projectId !== workflow.projectId || !previous.stageId || !currentStage || previous.stageId === currentStage.id) return;
    const previousStage = groups.flatMap((group) => group.stages).find((stage) => stage.id === previous.stageId);
    const nextGroup = groups.find((group) => group.stages.some((stage) => stage.id === currentStage.id));
    if (!previousStage || savedStageStatus(previousStage) !== "completed" || !nextGroup) return;
    setSelected((selection) => {
      if (selection?.projectId !== workflow.projectId || selection.stageId !== previous.stageId) return selection;
      if (presentation !== "client" && timelineContainer !== undefined && currentStage.type === "space_planning_tentative_look_feel") return null;
      return { projectId: workflow.projectId, groupKey: nextGroup.key, stageId: currentStage.id };
    });
  }, [workflow.projectId, currentStage, groups, timelineContainer, presentation]);
  const hasSelectedStage = selected?.projectId === workflow.projectId && groups.some((group) => group.key === selected.groupKey && group.stages.some((stage) => stage.id === selected.stageId));
  const emptyExternalActions = timelineContainer !== undefined && groups.length > 0 && !hasSelectedStage;
  const timerStage = currentStage && hasActiveStageTimer(currentStage) ? currentStage : undefined;
  const deadlineId = `${id}-current-stage-deadline`;
  const closeDetails = () => {
    if (presentation === "designer") {
      setSelected((selection) => selection ? { ...selection, collapsed: true } : null);
      disclosureButton.current?.focus();
    } else {
      setSelected(null);
      selectedButton.current?.focus();
    }
  };
  const handleStageKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
    // A mounted dialog owns Escape even before its deferred focus transfer finishes.
    if (event.currentTarget.ownerDocument.querySelector('[data-overlay-root][aria-modal="true"]')) return;
    event.preventDefault();
    closeDetails();
  };
  const currentTimer = timerStage ? <div className="workflow-progress__current-timer" role="group" aria-label="Current stage timer"><strong>{timerStage.name}</strong><StageDeadline stage={timerStage} now={now} serverNow={workflow.serverNow} id={deadlineId} /></div> : null;

  return (
    <section className={["workflow-progress", presentation === "designer" && "workflow-progress--designer", timelineContainer !== undefined && "workflow-progress--external", emptyExternalActions && "workflow-progress--empty", className].filter(Boolean).join(" ")} aria-labelledby={`${id}-heading`}>
      {timelineContainer === undefined && presentation !== "designer" ? <header className="workflow-progress__heading">
        <div><p className="workflow-progress__eyebrow">Design workflow</p><h2 id={`${id}-heading`}>Project progress</h2><p>Open a stage for requirements and actions.</p>
          {stageCount > 0 ? <p className="workflow-progress__summary"><strong>{completedCount}<span> / {stageCount}</span></strong><span>stages completed</span></p> : null}
        </div>
        {currentTimer}
      </header> : <><h2 id={`${id}-heading`} className="sr-only">Stage actions</h2>{timelineContainer === undefined ? currentTimer : null}</>}
      {groups.length === 0 ? <p className="workflow-progress__empty">No workflow stages have been configured for this project.</p> : groups.map((group, groupIndex) => {
        const selectedStage = selected?.projectId === workflow.projectId && selected.groupKey === group.key ? group.stages.find((stage) => stage.id === selected.stageId) : undefined;
        const selectedIndex = selectedStage ? group.stages.indexOf(selectedStage) : -1;
        const selectedStatus = selectedStage ? savedStageStatus(selectedStage) : null;
        const nextStage = group.stages[selectedIndex + 1];
        const panelId = `${id}-group-${groupIndex}-details`;
        const showPrimaryAction = Boolean(presentation === "full" && selectedStage?.type === "internal_kickoff" && selectedStage.id === initialActionStageId && renderStageActions);
        const NavigationHeading = timelineContainer === undefined ? "h3" : "h2";
        const localHeadingId = timelineContainer === undefined ? `${id}-group-${groupIndex}` : `${id}-group-${groupIndex}-content`;
        const navigationLabel = <><NavigationHeading id={`${id}-group-${groupIndex}`}>{group.name}</NavigationHeading><span>{group.stages.length} {group.stages.length === 1 ? "stage" : "stages"}</span></>;
        const navigation = <div className="workflow-progress__navigation">
            <div className="workflow-progress__floor-heading">{timelineContainer === undefined ? navigationLabel : <div className="workflow-progress__navigation-label">{navigationLabel}</div>}{timelineContainer !== undefined && groupIndex === 0 ? currentTimer : null}</div>
            {group.stages.length === 0 ? <p className="workflow-progress__empty">No stages configured for this floor.</p> : (
              <ol className="workflow-progress__timeline" aria-label={`${group.name} stages`}>
                {group.stages.map((stage) => {
                  const appearance = stageAppearance(stage, stage.id === currentStage?.id);
                  const status = savedStageStatus(stage);
                  const Icon = appearance === "completed" ? Check : appearance === "blocked" ? LockKeyhole : appearance === "current" ? ArrowRight : Circle;
                  const selectedInGroup = selectedStage?.id === stage.id;
                  const expanded = selectedInGroup && (presentation !== "designer" || !selected?.collapsed);
                  return (
                    <li className="workflow-progress__step" data-state={appearance} key={stage.id}>
                      <span className="workflow-progress__node" aria-hidden="true"><Icon /></span>
                      <button ref={selectedInGroup ? (element) => { if (element) selectedButton.current = element; } : undefined} type="button" className="workflow-progress__stage" aria-expanded={expanded} aria-controls={selectedInGroup && presentation === "designer" ? `${panelId}-body` : expanded ? showPrimaryAction ? `${panelId}-acknowledgement` : panelId : undefined} aria-describedby={stage.id === timerStage?.id ? deadlineId : undefined} aria-current={stage.id === currentStage?.id && (status === "in_progress" || status === "in_review") ? "step" : undefined} aria-label={`${stage.name} — ${status ? statusLabels[status] : "No tasks configured"}`} onClick={(event) => {
                        selectedButton.current = event.currentTarget;
                        if (presentation === "designer" && selectedInGroup) setSelected((selection) => selection ? { ...selection, collapsed: !selection.collapsed } : null);
                        else setSelected(expanded ? null : { projectId: workflow.projectId, groupKey: group.key, stageId: stage.id });
                      }}>
                        <span className="workflow-progress__stage-name">{stage.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
        </div>;
        return (
          <section className="workflow-progress__floor" key={group.key} aria-labelledby={localHeadingId}>
            {timelineContainer === undefined ? navigation : timelineContainer ? createPortal(navigation, timelineContainer, group.key) : null}
            {timelineContainer !== undefined ? <h3 id={localHeadingId} className="sr-only">{group.name} actions and details</h3> : null}
            {selectedStage && presentation === "designer" ? <section id={panelId} className="workflow-progress__disclosure" aria-label={`${selectedStage.name} details`} onKeyDown={handleStageKeyDown}>
              <h4 className="workflow-progress__disclosure-heading"><button ref={disclosureButton} type="button" className="workflow-progress__disclosure-toggle" aria-label={`${selected?.collapsed ? "Expand" : "Collapse"} ${selectedStage.name}`} aria-expanded={!selected?.collapsed} aria-controls={`${panelId}-body`} onClick={() => setSelected((selection) => selection ? { ...selection, collapsed: !selection.collapsed } : null)}>
                <span>{selectedStage.name}</span><StatusBadge label={selectedStatus ? statusLabels[selectedStatus] : "No tasks configured"} tone={selectedStatus ? statusTones[selectedStatus] : "neutral"} /><ChevronDown aria-hidden="true" />
              </button></h4>
              <div id={`${panelId}-body`} className="workflow-progress__disclosure-body" hidden={Boolean(selected?.collapsed)}>
                {renderStageActions?.(selectedStage)}
                {selectedStage.operational ? <StageOperationalDetails stage={selectedStage} compact /> : null}
                {selectedStage.instructions ? <details key={selectedStage.id} className="workflow-progress__stage-information">
                  <summary>Stage information</summary>
                  <WorkflowStageRequirements instructions={selectedStage.instructions} compact />
                </details> : null}
                {selectedStage.tasks.length ? <ul className="workflow-progress__compact-tasks" aria-label={`${selectedStage.name} tasks`}>{savedOrder(selectedStage.tasks).map((task) => <li key={task.id}>
                  <div><strong>{task.title}</strong><StatusBadge label={statusLabels[task.status]} tone={statusTones[task.status]} /></div>
                  {task.blockedByTaskIds.length ? <div className="workflow-progress__dependency-group workflow-progress__dependency-group--blocked"><strong>Waiting for</strong><DependencyNames ids={task.blockedByTaskIds} names={taskNames} /></div> : null}
                  {onOpenTask ? <Button variant="secondary" size="compact" onClick={() => onOpenTask(task.id)} aria-label={`${actionLabel}: ${task.title}`} trailingIcon={<ArrowRight />}>{actionLabel}</Button> : null}
                </li>)}</ul> : !selectedStage.operational ? <p className="workflow-progress__empty">No tasks are configured for this stage.</p> : null}
              </div>
            </section> : null}
            {showPrimaryAction && selectedStage ? <section id={`${panelId}-acknowledgement`} className="workflow-progress__primary-action" aria-label={`${selectedStage.name} acknowledgement`} onKeyDown={handleStageKeyDown}>
              <div className="workflow-progress__detail-heading"><h4>{selectedStage.name}</h4></div>
              {renderStageActions?.(selectedStage)}
            </section> : null}
            {selectedStage && !showPrimaryAction && presentation !== "designer" ? (
              <section id={panelId} className={`workflow-progress__details${presentation === "client" ? " workflow-progress__details--client" : ""}`} aria-labelledby={`${panelId}-heading`} onKeyDown={handleStageKeyDown}>
                <div className="workflow-progress__detail-heading"><div>{presentation !== "client" ? <p className="workflow-progress__eyebrow">{group.name}</p> : null}<h4 id={`${panelId}-heading`}>{selectedStage.name}</h4><StatusBadge label={selectedStatus ? statusLabels[selectedStatus] : "No tasks configured"} tone={selectedStatus ? statusTones[selectedStatus] : "neutral"} /></div><Button variant="secondary" size="compact" onClick={closeDetails} aria-label="Close stage details" leadingIcon={<X />}>Close</Button></div>
                {renderStageActions?.(selectedStage)}
                {presentation === "client" ? <>
                  {!selectedStage.operational?.availableActions.length && selectedStatus !== "completed" && !selectedStage.operational?.submittedDocument ? <p className="workflow-progress__empty">{selectedStage.operational?.blockingReasons[0] ?? (selectedStage.id === currentStage?.id ? `Your project team is completing ${selectedStage.name}.` : "This stage is not ready yet.")}</p> : null}
                </> : <>
                  {selectedStage.operational ? <StageOperationalDetails stage={selectedStage} /> : null}
                  {selectedStage.instructions ? <WorkflowStageRequirements instructions={selectedStage.instructions} /> : null}
                  {selectedStage.dependencyStageIds.length > 0 ? <div className="workflow-progress__dependency-group"><strong>Stage dependencies</strong><DependencyNames ids={selectedStage.dependencyStageIds} names={stageNames} /></div> : null}
                  {selectedStage.tasks.length > 0 ? <ol className="workflow-progress__tasks" aria-label={`${selectedStage.name} tasks`}>{savedOrder(selectedStage.tasks).map((task) => <TaskDetails key={task.id} task={task} taskNames={taskNames} onOpenTask={onOpenTask} actionLabel={actionLabel} />)}</ol> : !selectedStage.operational ? <p className="workflow-progress__empty">No tasks are configured for this stage.</p> : null}
                  <p className="workflow-progress__next"><ArrowRight aria-hidden="true" /><span>{nextStage ? <>Next stage <strong>{nextStage.name}</strong></> : group.scope === "project" ? "Final stage in this workflow" : "Final stage on this floor"}</span></p>
                </>}
              </section>
            ) : null}
          </section>
        );
      })}
    </section>
  );
}

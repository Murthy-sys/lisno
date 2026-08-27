import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import type { DesignPlanStatus, DesignPlanTask } from "../../api/types";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  EstimateDesignUploads,
  type EstimateDesignItemOption,
  type EstimateDesignPlacementOption
} from "../leads/EstimateDesignUploads";
import { estimateBuilderSections } from "../leads/estimateBuilderCatalogue";
import { EstimatePlanChangeRequests } from "../leads/EstimatePlanChangeRequests";
import {
  getDesignerPlanTasks,
  projectWorkflowKeys
} from "../workflow/projectWorkflowApi";

const statusLabels: Record<DesignPlanStatus, string> = {
  pending_assignment: "Awaiting assignment",
  assigned: "Ready to upload",
  in_progress: "Extraction in progress",
  ready_for_client: "Awaiting Client approval",
  changes_requested: "Changes requested",
  approved: "Approved"
};

const statusTones: Record<DesignPlanStatus, StatusTone> = {
  pending_assignment: "neutral",
  assigned: "info",
  in_progress: "warning",
  ready_for_client: "info",
  changes_requested: "danger",
  approved: "success"
};

function taskAction(status: DesignPlanStatus) {
  if (status === "changes_requested") return "Update and resubmit the design";
  if (status === "ready_for_client") return "Review submitted images";
  if (status === "approved") return "View approved design images";
  if (status === "in_progress") return "Review extracted images";
  return "Upload the design plan";
}

function isReadOnly(status: DesignPlanStatus) {
  return status === "ready_for_client" || status === "approved";
}

export function DesignerDesignPlanTasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tasks = useQuery({
    queryKey: projectWorkflowKeys.designerPlans,
    queryFn: getDesignerPlanTasks
  });

  if (tasks.isPending) {
    return <PageState state="loading" message="Loading your design-plan tasks…" />;
  }
  if (tasks.isError) {
    return (
      <PageState
        state="error"
        message="We couldn't load your design-plan tasks."
        action={{ label: "Try again", onAction: () => void tasks.refetch() }}
      />
    );
  }

  const requestedEstimateId = searchParams.get("estimate");
  const task = tasks.data.find((item) => item.estimateId === requestedEstimateId) ??
    tasks.data[0];
  const uploadReadyCount = tasks.data.filter((item) =>
    ["assigned", "in_progress", "changes_requested"].includes(item.status)
  ).length;

  return (
    <section
      className="designer-plan-page"
      aria-labelledby="design-plan-tasks-title"
    >
      <PageHeader
        id="design-plan-tasks-title"
        eyebrow="Assigned design work"
        title="Design plan workspace"
        description="Upload the assigned project design, review every extracted image, and submit the final set for Client approval."
        breadcrumb={(
          <Link to="/designer" className="back-link">
            <ArrowLeft aria-hidden="true" /> Back to dashboard
          </Link>
        )}
        metadata={(
          <StatusBadge
            tone={uploadReadyCount ? "warning" : "info"}
            label={`${uploadReadyCount} ready for action`}
          />
        )}
      />

      {!task ? (
        <PageState
          state="empty"
          message="No approved estimates are assigned to you for design planning."
        />
      ) : (
        <div className="designer-plan-layout">
          <Surface
            as="section"
            padding="compact"
            className="designer-plan-queue"
            aria-labelledby="designer-plan-queue-title"
          >
            <div className="designer-plan-queue__heading">
              <div>
                <p className="eyebrow">Project queue</p>
                <h2 id="designer-plan-queue-title">Assigned projects</h2>
              </div>
              <span>{tasks.data.length}</span>
            </div>
            <ol className="designer-plan-queue__list">
              {tasks.data.map((item) => {
                const selected = item.id === task.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`designer-plan-task${selected ? " designer-plan-task--selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setSearchParams({ estimate: item.estimateId }, { replace: true });
                      }}
                    >
                      <span className="designer-plan-task__topline">
                        <strong>{item.projectName}</strong>
                        <StatusBadge
                          tone={statusTones[item.status]}
                          label={statusLabels[item.status]}
                        />
                      </span>
                      <span>{item.clientName}</span>
                      <small>Design plan v{item.designPlanVersion}</small>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Surface>

          <section
            className="designer-plan-workspace"
            id="designer-plan-workspace"
            aria-label="Selected project workspace"
          >
            <Surface
              as="section"
              className="designer-plan-project"
              aria-labelledby="designer-plan-project-title"
            >
              <div className="designer-plan-project__heading">
                <div>
                  <p className="eyebrow">Selected project</p>
                  <h2 id="designer-plan-project-title">{task.projectName}</h2>
                </div>
                <StatusBadge
                  tone={statusTones[task.status]}
                  label={statusLabels[task.status]}
                />
              </div>
              <dl>
                <div><dt>Client</dt><dd>{task.clientName}</dd></div>
                <div><dt>Design version</dt><dd>v{task.designPlanVersion}</dd></div>
                <div><dt>Next action</dt><dd>{taskAction(task.status)}</dd></div>
              </dl>
            </Surface>

            {task.status === "changes_requested" ? (
              <EstimatePlanChangeRequests estimateId={task.estimateId} />
            ) : null}
            {task.status === "ready_for_client" ? (
              <p className="designer-plan-workspace__notice" role="status">
                Submitted to the Client. The design and extracted images are read-only while approval is pending.
              </p>
            ) : null}
            <EstimateDesignUploads
              key={task.estimateId}
              estimateId={task.estimateId}
              rooms={roomOptions(task)}
              scopes={scopeOptions(task)}
              items={itemOptions(task)}
              variant="designer"
              readOnly={isReadOnly(task.status)}
              onUploaded={() => void tasks.refetch()}
              onSubmitted={() => void tasks.refetch()}
            />
          </section>
        </div>
      )}
    </section>
  );
}

function normalizePlacementValue(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function roomOptions(task: DesignPlanTask): EstimateDesignPlacementOption[] {
  const seen = new Set<string>();
  return task.rooms.flatMap((room) => {
    const id = typeof room.id === "string" ? room.id : "";
    const label = typeof room.label === "string" ? room.label : "";
    if (!id || !label || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label }];
  });
}

function scopeOptions(task: DesignPlanTask): EstimateDesignPlacementOption[] {
  return task.scopes.map((id) => ({
    id,
    label: estimateBuilderSections.find((section) => section.id === id)?.label ?? id
  }));
}

function itemOptions(task: DesignPlanTask): EstimateDesignItemOption[] {
  const rooms = roomOptions(task);
  return task.lineItems.flatMap((line) => {
    if (!line.included) return [];
    const sourceRoom = task.rooms.find((room) => {
      const id = typeof room.id === "string" ? room.id : "";
      const label = typeof room.label === "string" ? room.label : "";
      const aliases = Array.isArray(room.aliases)
        ? room.aliases.filter((alias): alias is string => typeof alias === "string")
        : [];
      const terms = [id, label, ...aliases].map(normalizePlacementValue).filter(Boolean);
      const roomName = normalizePlacementValue(line.roomName);
      return terms.includes(roomName);
    });
    const room = sourceRoom
      ? rooms.find((item) => item.id === sourceRoom.id)
      : undefined;
    const section = estimateBuilderSections.find((candidate) =>
      candidate.rows.some((row) => row.id === line.catalogueId)
    );
    const row = section?.rows.find((candidate) => candidate.id === line.catalogueId);
    if (!room || !section) return [];
    return [{
      roomId: room.id,
      catalogueId: line.catalogueId,
      label: `${line.catalogueId} · ${row?.description ?? line.specification}`,
      scopeLabel: section.label
    }];
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "../../api/client";
import type { AdminProjectSummary } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Field, Select } from "../../components/ui/Field";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { adminProjectKeys } from "./adminProjectsApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";
import {
  assignProjectDesigner,
  getDesignerAssignmentOptions,
  projectWorkflowKeys
} from "../workflow/projectWorkflowApi";

export function DesignAssignmentPanel({ project }: { project: AdminProjectSummary }) {
  const client = useQueryClient();
  const [designerId, setDesignerId] = useState(
    project.estimate?.designPlanDesigner?.id ?? ""
  );
  const eligible = project.estimate?.status === "client_approved" &&
    project.estimate.designPlanStatus !== "ready_for_client" &&
    project.estimate.designPlanStatus !== "approved";
  const designers = useQuery({
    queryKey: projectWorkflowKeys.designerOptions,
    queryFn: getDesignerAssignmentOptions,
    enabled: eligible
  });
  const assignment = useMutation({
    mutationFn: () => assignProjectDesigner(project.id, designerId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: adminProjectKeys.detail(project.id) }),
        client.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
        client.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
    }
  });

  if (!project.estimate || project.estimate.status !== "client_approved") {
    return (
      <Surface as="section" className="admin-project-detail__surface" aria-labelledby="design-assignment-title">
        <h2 id="design-assignment-title">Design plan assignment</h2>
        <p>This task opens after the Client—or an Admin acting with proof—approves the estimate.</p>
      </Surface>
    );
  }

  const workflowStatus = project.estimate.designPlanStatus ?? "pending_assignment";
  return (
    <Surface as="section" className="admin-project-detail__surface" aria-labelledby="design-assignment-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Approved estimate handoff</p>
          <h2 id="design-assignment-title">Design plan assignment</h2>
        </div>
        <StatusBadge
          tone={workflowStatus === "approved" ? "success" : workflowStatus === "changes_requested" ? "warning" : "info"}
          label={workflowStatus.replaceAll("_", " ")}
        />
      </div>
      {workflowStatus === "approved" ? (
        <p>
          Design plan v{project.estimate.designPlanVersion ?? 0} is approved. Procurement,
          Finance, Site Management, and the estimated trade queues are now open.
        </p>
      ) : workflowStatus === "ready_for_client" ? (
        <p>The submitted plan is locked while the Client response is pending.</p>
      ) : (
        <form
          className="admin-design-assignment__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (designerId) assignment.mutate();
          }}
        >
          <Field
            id="design-assignment-designer"
            label="Assigned Designer"
            hint={designers.isPending ? "Loading active Designers…" : undefined}
          >
            {(controlProps) => (
              <Select
                {...controlProps}
                value={designerId}
                disabled={designers.isPending || assignment.isPending}
                onChange={(event) => setDesignerId(event.target.value)}
              >
                <option value="">Choose an active Designer</option>
                {designers.data?.map((designer) => (
                  <option value={designer.id} key={designer.id}>
                    {designer.name} · {designer.email}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {designers.isError ? <p role="alert">Active Designers could not be loaded.</p> : null}
          {assignment.isError ? (
            <p role="alert">
              {assignment.error instanceof ApiError
                ? assignment.error.message
                : "The Designer could not be assigned."}
            </p>
          ) : null}
          {assignment.isSuccess ? <p role="status">Designer assigned. The design-plan task is open.</p> : null}
          <Button
            type="submit"
            busy={assignment.isPending}
            busyLabel="Assigning…"
            disabled={!designerId}
          >
            {project.estimate.designPlanDesigner
              ? "Reassign Designer"
              : "Assign Designer"}
          </Button>
        </form>
      )}
    </Surface>
  );
}

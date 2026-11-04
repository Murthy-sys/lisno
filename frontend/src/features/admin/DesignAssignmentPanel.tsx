import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PenTool } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../../api/client";
import type { AdminProjectSummary } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Field, Select } from "../../components/ui/Field";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { clientKeys } from "../client/clientApi";
import { quotationKeys } from "../client/quotationApi";
import { designerKeys } from "../designer/designerApi";
import { designTeamKeys } from "../designer/designTeamApi";
import { leadKeys } from "../leads/leadsApi";
import { projectReadKeys } from "../projects/projectReadQueries";
import { AdminDetailSection } from "./AdminDetailSection";
import { canAssignProjectDesigner, hasInitialEstimateApproval } from "./adminProjectPresentation";
import { adminProjectKeys } from "./adminProjectsApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";
import {
  assignProjectDesigner,
  getDesignerAssignmentOptions,
  projectWorkflowKeys
} from "../workflow/projectWorkflowApi";

export function DesignAssignmentPanel({ project, canManage = false }: { project: AdminProjectSummary; canManage?: boolean }) {
  const client = useQueryClient();
  const [designerId, setDesignerId] = useState(
    project.estimate?.designPlanDesigner?.id ?? ""
  );
  const eligible = canManage && canAssignProjectDesigner(project);
  const designers = useQuery({
    queryKey: projectWorkflowKeys.designerOptions,
    queryFn: getDesignerAssignmentOptions,
    enabled: eligible
  });
  const assignment = useMutation({
    mutationFn: () => assignProjectDesigner(project.id, designerId),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: adminProjectKeys.all }),
        client.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
        client.invalidateQueries({ queryKey: dashboardKeys.all }),
        client.invalidateQueries({ queryKey: designTeamKeys.all }),
        client.invalidateQueries({ queryKey: designerKeys.projects() }),
        client.invalidateQueries({ queryKey: projectReadKeys.all }),
        client.invalidateQueries({ queryKey: leadKeys.all }),
        client.invalidateQueries({ queryKey: clientKeys.projects }),
        client.invalidateQueries({ queryKey: quotationKeys.detail(project.id) }),
        client.invalidateQueries({ queryKey: quotationKeys.revision(project.id) })
      ]);
    }
  });

  const blockedReason = !canManage ? "You do not have permission to assign a Designer."
    : project.estimate?.designerAssignmentBlockedReason
      ?? (project.estimationWorkflowVersion === 3
        ? project.estimate?.canAssignDesigner === undefined
          ? "Assignment availability is unavailable. Refresh the project to try again."
          : "Initial Client approval is required before assigning a Designer."
        : "This task opens after the Client or a Sales Manager acting with proof approves the estimate.");
  if (!project.estimate || !hasInitialEstimateApproval(project)) {
    return (
      <AdminDetailSection
        icon={<PenTool aria-hidden="true" />}
        tone="warm"
        title="Design plan assignment"
        subtitle="Assign and track the Designer handoff"
        id="design-assignment-title"
        defaultOpen
      >
        <p>{blockedReason}</p>
      </AdminDetailSection>
    );
  }

  const workflowStatus = project.estimate.designPlanStatus ?? "pending_assignment";
  return (
    <AdminDetailSection
      icon={<PenTool aria-hidden="true" />}
      tone="warm"
      title="Design plan assignment"
      subtitle="Assign and track the Designer handoff"
      id="design-assignment-title"
      defaultOpen
    >
      <StatusBadge
        tone={workflowStatus === "approved" ? "success" : workflowStatus === "changes_requested" ? "warning" : "info"}
        label={workflowStatus.replaceAll("_", " ")}
      />
      {project.estimate.designPlanDesigner ? <p>Assigned Designer: {project.estimate.designPlanDesigner.name}</p> : null}
      {workflowStatus === "approved" ? (
        <p>
          Design plan v{project.estimate.designPlanVersion ?? 0} is approved. Procurement,
          Finance, Site Management, and the estimated trade queues are now open.
        </p>
      ) : workflowStatus === "ready_for_client" ? (
        <p>The submitted plan is locked while the Client response is pending.</p>
      ) : !eligible ? (
        <p>{blockedReason}</p>
      ) : (
        <form
          className="admin-design-assignment__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (eligible && designers.data?.some(designer => designer.id === designerId) && !designers.isError && !designers.isFetching && !assignment.isPending) assignment.mutate();
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
                disabled={designers.isPending || designers.isError || assignment.isPending}
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
          {designers.isError ? <div role="alert"><p>Active Designers could not be loaded.</p><Button type="button" variant="secondary" size="compact" onClick={() => void designers.refetch()}>Retry Designers</Button></div> : null}
          {designers.isSuccess && designers.data.length === 0 ? <p>No active Designers are available.</p> : null}
          {assignment.isError ? (
            <p role="alert">
              {assignment.error instanceof ApiError
                ? assignment.error.message
                : "The Designer could not be assigned."}
            </p>
          ) : null}
          {assignment.isSuccess ? <p role="status">{project.estimationWorkflowVersion === 3 ? "Designer assigned. Design workflow is ready while the approved estimate remains unchanged." : "Designer assigned. The design-plan task is open."}</p> : null}
          <Button
            type="submit"
            busy={assignment.isPending}
            busyLabel="Assigning…"
            disabled={!designers.data?.some(designer => designer.id === designerId) || designers.isError || designers.isFetching}
          >
            {project.estimate.designPlanDesigner
              ? "Reassign Designer"
              : "Assign Designer"}
          </Button>
        </form>
      )}
    </AdminDetailSection>
  );
}

import type { Role, WorkerRole } from "../../contracts/authorization";
type WorkflowAssignmentRole = WorkerRole | "procurement" | "site_manager";
export interface ProjectWorkflowTask {
  preparationOnly?: boolean;
  id: string;
  projectId: string;
  projectName: string;
  completionAuthority?: "legacy_staff" | "vendor_client";
  estimateId: string;
  kind:
    | "design_plan_upload"
    | "procurement"
    | "finance"
    | "site_execution"
    | "trade_execution";
  title: string;
  description: string;
  assigneeRole: Role;
  assignedWorker: {
    id: string;
    name: string;
    email: string;
    role: WorkflowAssignmentRole;
    active: boolean;
  } | null;
  sourceSectionId: string | null;
  roomName: string | null;
  status: "open" | "in_progress" | "completed";
  progress: number;
  version: number;
  openedAt: string;
  updatedAt: string;
}

export interface ProjectWorkflowSectionAssignment {
  id: string;
  projectId: string;
  projectName: string;
  estimateId: string;
  designPlanVersion: number;
  sourceSectionId: string;
  sectionLabel: string;
  assigneeRole: WorkerRole;
  assignedWorker: {
    id: string;
    name: string;
    email: string;
    role: WorkerRole;
    active: boolean;
  } | null;
  assignmentState: "unassigned" | "assigned" | "mixed";
  status: "open" | "in_progress" | "completed";
  progress: number;
  taskCount: number;
  unfinishedTaskCount: number;
  revision: string;
  updatedAt: string;
}

export interface WorkerAssignmentOption {
  id: string;
  name: string;
  email: string;
  role: WorkflowAssignmentRole;
}


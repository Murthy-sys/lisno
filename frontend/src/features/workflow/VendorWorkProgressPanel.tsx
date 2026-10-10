import { ProjectExecutionTracker } from "../execution/ExecutionWorkspace";

// Retained for existing site-completion cache invalidation callers.
export const vendorWorkProgressKey = (projectId: string) => ["vendor-work", "progress", projectId] as const;

export function VendorWorkProgressPanel({ projectId, projectName }: { projectId: string; projectName?: string }) {
  return <ProjectExecutionTracker projectId={projectId} projectName={projectName} />;
}

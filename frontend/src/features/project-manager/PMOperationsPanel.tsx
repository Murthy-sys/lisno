import type { PMProgress } from "./projectManagerTypes";
import { PMVendorPanel } from "./PMVendorPanel";
import { PMClientPanel } from "./PMClientPanel";
import { PMQualityPanel } from "./PMQualityPanel";
import "./pm-operations.css";

export function PMOperationsPanel({ projectId, tab, progress }: { projectId: string; tab: "vendors" | "client" | "snagging" | "quality"; progress?: PMProgress }) {
  if (tab === "vendors") return <PMVendorPanel key={`${projectId}:vendors`} projectId={projectId} />;
  if (tab === "quality") return <PMQualityPanel key={`${projectId}:quality`} projectId={projectId} />;
  return <PMClientPanel key={`${projectId}:${tab}`} projectId={projectId} tab={tab} progress={progress} />;
}

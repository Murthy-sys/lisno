import { View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ExecutionSession } from "../execution/ExecutionWorkspace";
import { p, useDeliveryContext, type DeliveryContext } from "../execution/executionNative";
import { SiteCompletionPanel } from "./SiteCompletionPanel";
import { ClientVendorWorkReviews } from "./ClientVendorWorkReviews";
import { ProjectCompletionDetail } from "./ProjectCompletionWorkspace";
export function ProjectDeliveryPanel({ projectId, session }: { projectId: string; session: AuthenticatedSession }) {
  const c = useDeliveryContext(session);
  return <DeliveryContent key={`${c.scope}:${projectId}`} context={c} projectId={projectId} />;
}
function DeliveryContent({ context: c, projectId }: { context: DeliveryContext; projectId: string }) {
  const admin = c.can("GET /admin/projects/:projectId/completion");
  return <View style={p.stack}>{c.can("GET /projects/:projectId/execution") ? <ExecutionSession context={c} session={c.session} projectId={projectId} embedded /> : null}{admin ? <ProjectCompletionDetail context={c} projectId={projectId} /> : <SiteCompletionPanel context={c} projectId={projectId} />}<ClientVendorWorkReviews context={c} projectId={projectId} /></View>;
}

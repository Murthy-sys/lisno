import type { Role } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { useNativeWorkspace } from "../admin/nativeWorkspace";
import { OperationalProgressEditor, operationalTaskSchema } from "./TasksWorkspace";

/** Legacy generic-list adapter; the typed queue uses the same versioned controls. */
export function OperationalTaskAction({ record, role }: { record: Record<string, unknown>; role: Role }) {
  const runtime = useConfiguredRuntime();
  if (runtime.session.status !== "authenticated" || !runtime.session.session || runtime.session.session.user.role !== role) return null;
  return <Action record={record} session={runtime.session.session} />;
}
function Action({ record, session }: { record: Record<string, unknown>; session: AuthenticatedSession }) {
  const c = useNativeWorkspace(session, "operations"); const task = operationalTaskSchema.safeParse(record);
  return task.success ? <OperationalProgressEditor key={`${c.scope}:${task.data.id}`} context={c} task={task.data} refresh={c.refresh} /> : null;
}

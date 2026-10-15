import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { AuthenticatedSession } from "../../contracts/session";
import { Button, Copy, Pager, Panel, QueryState, useNativeWorkspace } from "../admin/nativeWorkspace";

const eventSchema = z.object({ id: z.string(), actorId: z.string(), action: z.string(), entityType: z.string(), entityId: z.string(), occurredAt: z.string(), reason: z.string().nullable(), oldValues: z.record(z.string(), z.unknown()), newValues: z.record(z.string(), z.unknown()) });
const pageSchema = z.object({ items: z.array(eventSchema), pagination: z.object({ total: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), limit: z.number().int().positive() }) });
// Audit responses are sanitized by the API. Do not turn stored references into links or previews.
export function activityValues(values: Record<string, unknown>): string {
  return Object.entries(values).filter(([key, value]) => !/token|secret|password|url|uri|storage|attachment|filename/i.test(key) && (value === null || ["string", "number", "boolean"].includes(typeof value)))
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value === null ? "None" : String(value).replace(/https?:\/\/\S+/gi, "[private reference]")}`).join(" · ") || "No displayable changes";
}
export function ProjectActivityPanel({ projectId, session }: { projectId: string; session: AuthenticatedSession }) {
  const c = useNativeWorkspace(session, "projects"); const [offset, setOffset] = useState(0);
  const allowed = c.can("GET /projects/:projectId/activity");
  const query = useQuery({ queryKey: c.key("activity", projectId, offset), queryFn: async ({ signal }) => pageSchema.parse(await c.http.get(`/projects/${encodeURIComponent(projectId)}/activity?limit=20&offset=${offset}`, { signal })), enabled: c.ready && allowed, retry: false });
  if (!allowed) return null;
  return <Panel title="Project activity"><QueryState query={query} title="Project activity" />{query.data && !query.isError ? <>{query.data.items.map(event => <Panel key={event.id} title={event.action.replaceAll("_", " ")}><Copy>{event.entityType} · {event.entityId}</Copy><Copy>Actor: {event.actorId} · {new Date(event.occurredAt).toLocaleString()}</Copy><Copy>Before: {activityValues(event.oldValues)}</Copy><Copy>After: {activityValues(event.newValues)}</Copy>{event.reason ? <Copy>Reason: {event.reason}</Copy> : null}</Panel>)}{!query.data.items.length ? <Copy>No project activity yet.</Copy> : null}<Pager offset={offset} limit={query.data.pagination.limit} total={query.data.pagination.total} onChange={setOffset} /></> : null}<Button label="Refresh project activity" variant="secondary" disabled={query.isFetching} onPress={() => void query.refetch()} /></Panel>;
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { Button } from "../../ui/primitives";
import { AccessLost, CommandFeedback, dateTime, p, Pager, Panel, QueryState, unavailable, useDeliveryCommand, useDeliveryGuard, type DeliveryContext } from "./executionNative";
export function ExecutionNotifications({ context: c, onSelect, initiallyOpen = false }: { initiallyOpen?: boolean; context: DeliveryContext; onSelect: (assignmentId: string, projectId: string) => void }) {
  const [open, setOpen] = useState(initiallyOpen); const [offset, setOffset] = useState(0); const allowed = c.can("GET /execution/notifications");
  const query = useQuery({ queryKey: c.key("notifications", offset), queryFn: ({ signal }) => c.execution.notifications(offset, signal), enabled: allowed && c.ready && open, retry: false });
  const command = useDeliveryCommand(async () => { await Promise.all([query.refetch(), c.refresh()]); }); useDeliveryGuard(c, false, command.locked);
  if (!allowed) return null;
  if (unavailable(query.error) || command.accessLost) return <AccessLost title="Execution notifications unavailable" />;
  return <Panel title="Execution notifications"><Button label={open ? "Hide execution notifications" : "Show execution notifications"} variant="quiet" onPress={() => c.navigate(() => setOpen(value => !value))} />{open ? <><QueryState query={query} title="Execution notifications" />{!query.isError && query.data ? <><Text style={p.copy}>{query.data.unreadCount} unread</Text>{query.data.items.map(item => <Panel key={item.id} title={item.title}><Text style={p.copy}>{item.projectName} · {dateTime(item.createdAt)}</Text>{item.assignmentIds.map((id, index) => <Button key={id} label={`Open assignment ${index + 1} for ${item.projectName}`} variant="secondary" onPress={() => onSelect(id, item.projectId)} />)}{!item.readAt && c.can("POST /execution/notifications/:notificationId/read") ? <Button label={`Mark ${item.title} read`} variant="quiet" disabled={c.locked} onPress={() => void command.execute(() => c.execution.readNotification(item.id))} /> : null}</Panel>)}{!query.data.items.length ? <Text style={p.copy}>No execution notifications.</Text> : null}<Pager offset={query.data.offset} limit={query.data.limit} total={query.data.total} onChange={setOffset} /></> : null}</> : null}<CommandFeedback command={command} /></Panel>;
}

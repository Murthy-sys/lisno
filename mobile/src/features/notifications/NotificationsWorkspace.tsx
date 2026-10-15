import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useScaffoldNavigationBlocked, useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, StateView } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { ExecutionNotifications } from "../execution/ExecutionNotifications";
import { ExecutionWorkspace } from "../execution/ExecutionWorkspace";
import { useDeliveryContext } from "../execution/executionNative";
import { BasketRequestDetailWorkspace } from "../vendor-requests/MyRequestsWorkspace";
import { FEATURE_DEFINITIONS } from "../workspace/featureDefinitions";
import { NotificationsScreen } from "./NotificationsScreen";
import type { ChatNotification } from "./notificationPresentation";

type Source = "chat" | "execution" | "baskets";
interface Page<T> { items: T[]; unreadCount: number; pagination: { offset: number; limit: number; total: number; hasMore: boolean } }
interface BasketNotification { id: string; requestId: string; proposedName: string; target: { kind: string }; requester: { id: string; name: string }; vendorName: string | null; createdAt: string; readAt: string | null; status: string }
const labels = { chat: "Project messages", execution: "Execution", baskets: "Basket requests" };
export function NotificationsWorkspace({ session }: { session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  return <NotificationSession key={`${context.environment.environment.id}:${session.user.id}:${context.session.generation}`} session={session} />;
}
function NotificationSession({ session }: { session: AuthenticatedSession }) {
  const context = useConfiguredRuntime(); const blocked = useScaffoldNavigationBlocked();
  const available: Source[] = (["baskets", "execution", "chat"] as const).filter(source => canPerformOperation(session, source === "baskets" ? "GET /admin/ai-estimator-knowledge/basket-request-notifications" : source === "execution" ? "GET /execution/notifications" : "GET /notifications"));
  const [selected, setSelected] = useState<Source>(available[0] ?? "chat"); const source = available.includes(selected) ? selected : available[0];
  if (!source) return <StateView title="Notifications unavailable" message="There are no notification sources for this account." tone="denied" />;
  return <View style={{ flex: 1 }}><View accessibilityRole="tablist" style={s.sources}>{available.map(value => <Button key={value} label={labels[value]} variant={value === source ? "primary" : "secondary"} disabled={blocked} onPress={() => setSelected(value)} />)}</View>{source === "chat" ? <ChatInbox key={session.user.id} session={session} /> : source === "baskets" ? <BasketInbox session={session} /> : <ExecutionInbox session={session} />}</View>;
}
function NotificationPager({ page, offset, disabled, onChange }: { page: Page<unknown>; offset: number; disabled: boolean; onChange: (offset: number) => void }) {
  if (!offset && !page.pagination.hasMore) return null;
  return <View style={s.sources}><Button label="Newer notifications" variant="secondary" disabled={disabled || offset === 0} onPress={() => onChange(Math.max(0, offset - 20))} /><Text style={s.copy}>Page {Math.floor(offset / 20) + 1}</Text><Button label="Older notifications" variant="secondary" disabled={disabled || !page.pagination.hasMore} onPress={() => onChange(offset + 20)} /></View>;
}
function ChatInbox({ session }: { session: AuthenticatedSession }) {
  const context = useConfiguredRuntime(); const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "notifications", "inbox", offset), queryFn: ({ signal }) => context.runtime.api.authenticated.get<Page<ChatNotification>>(`/notifications?limit=20&offset=${offset}`, { signal }), retry: false });
  if (query.isPending) return <StateView title="Loading notifications" message="Checking your project updates." />;
  if (query.isError) return <StateView title="Notifications unavailable" message="Refresh to check current access and updates." tone={query.error instanceof ApiError && [401, 403, 404].includes(query.error.status) ? "denied" : "error"} actionLabel="Retry notifications" onAction={() => void query.refetch()} />;
  return <NotificationsScreen definition={FEATURE_DEFINITIONS.notifications} data={query.data} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} footer={<NotificationPager page={query.data} offset={offset} disabled={query.isFetching} onChange={setOffset} />} />;
}
function BasketInbox({ session }: { session: AuthenticatedSession }) {
  const context = useConfiguredRuntime(); const [offset, setOffset] = useState(0); const [requestId, setRequestId] = useState<string | null>(null); const [reading, setReading] = useState(false); const [error, setError] = useState("");
  const guard = useScaffoldNavigationGuard(); const alive = useRef(true); const opening = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { guard?.setBlocked(reading); return () => guard?.setBlocked(false); }, [guard, reading]);
  const path = "/admin/ai-estimator-knowledge/basket-request-notifications";
  const query = useQuery({ queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "notifications", "baskets", offset), queryFn: ({ signal }) => context.runtime.api.authenticated.get<Page<BasketNotification>>(`${path}?limit=20&offset=${offset}`, { signal }), enabled: !requestId, retry: false });
  async function open(item: BasketNotification) {
    if (opening.current) return; opening.current = true; setReading(true); setError("");
    try { if (!item.readAt) await context.runtime.api.authenticated.put(`${path}/${encodeURIComponent(item.id)}/read`, {}); if (alive.current) setRequestId(item.requestId); }
    catch { if (alive.current) setError("The request notification could not be opened. Refresh and try again."); }
    finally { opening.current = false; if (alive.current) setReading(false); }
  }
  if (requestId) return <BasketRequestDetailWorkspace requestId={requestId} session={session} onBack={() => { setRequestId(null); void query.refetch(); }} />;
  return <ScrollView contentContainerStyle={s.page}><Text style={s.title} accessibilityRole="header">Basket requests</Text>{query.isPending ? <Text style={s.copy}>Loading basket notifications…</Text> : query.isError ? <StateView title="Basket notifications unavailable" message="Refresh to check current access." actionLabel="Retry basket notifications" onAction={() => void query.refetch()} /> : <><Text style={s.copy}>{query.data.unreadCount} unread</Text>{query.data.items.map(item => <View key={item.id} style={s.row}><Text style={s.title}>{item.proposedName}</Text><Text style={s.copy}>{item.target.kind === "new_sub_basket" ? "Sub Basket" : "Main Basket"} · {item.requester.name} · {item.status}</Text>{item.vendorName ? <Text style={s.copy}>{item.vendorName}</Text> : null}<Text style={s.copy}>{new Date(item.createdAt).toLocaleString()}</Text><Button label={`Review ${item.proposedName}`} disabled={reading} variant="secondary" onPress={() => void open(item)} /></View>)}{!query.data.items.length ? <StateView title="No basket notifications" message="Submitted requests will appear here." /> : null}<NotificationPager page={query.data} offset={offset} disabled={query.isFetching || reading} onChange={setOffset} /></>}{error ? <Text style={s.error}>{error}</Text> : null}<Button label="Refresh basket notifications" variant="quiet" disabled={reading} onPress={() => void query.refetch()} /></ScrollView>;
}
function ExecutionInbox({ session }: { session: AuthenticatedSession }) {
  const context = useDeliveryContext(session); const [selected, setSelected] = useState<{ assignmentId: string; projectId: string } | null>(null); const blocked = useScaffoldNavigationBlocked();
  if (selected) return <View style={{ flex: 1 }}><Button label="Back to execution notifications" variant="quiet" disabled={blocked} onPress={() => setSelected(null)} /><ExecutionWorkspace session={session} projectId={selected.projectId} workId={selected.assignmentId} /></View>;
  return <ScrollView contentContainerStyle={s.page}><ExecutionNotifications context={context} initiallyOpen onSelect={(assignmentId, projectId) => setSelected({ assignmentId, projectId })} /></ScrollView>;
}
const s = StyleSheet.create({ sources: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, padding: spacing.sm }, page: { padding: spacing.lg, gap: spacing.md }, row: { gap: spacing.sm, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: spacing.md }, title: { fontFamily: fonts.semibold, fontSize: 17, color: colors.ink }, copy: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkMuted }, error: { fontFamily: fonts.regular, color: colors.danger, fontSize: 13 } });

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { TransferHttpError } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { useScaffoldNavigationGuard, useScaffoldNavigationBlocked } from "../../navigation/AdaptiveAppScaffold";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { createIdempotencyKey } from "../finance/money";
import { isNativeWorkflowAction } from "./workflowModel";
import { NativeWorkflowActionForm } from "./NativeWorkflowActionForm";
import type { DesignStageOperational, DesignWorkflowAction, DesignWorkflowView } from "./workflowTypes";

type Row = Record<string, unknown>;
function record(value: unknown): Row | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Row : null; }
function rows(value: unknown): readonly Row[] { return Array.isArray(value) ? value.filter((item): item is Row => record(item) !== null) : []; }
function strings(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function requestMessage(cause: unknown): string { return cause instanceof ApiError || cause instanceof TransferHttpError ? cause.message : cause instanceof Error ? cause.message : "The workflow action could not be saved."; }
export function InitialPaymentAction({ projectId, payment, refresh }: { readonly projectId: string; readonly payment: Row; readonly refresh: () => void }) {
  const context = useConfiguredRuntime(); const invalidate = useInvalidateEvent();
  const [version, setVersion] = useState<number | null>(null); const [reference, setReference] = useState(""); const [error, setError] = useState("");
  const [retry, setRetry] = useState<Record<string, unknown> | null>(null); const lock = useRef(false);
  const guard = useScaffoldNavigationGuard();
  const editing = version !== null || Boolean(retry);
  useEffect(() => { guard?.setBlocked(editing); const back = editing ? BackHandler.addEventListener("hardwareBackPress", () => true) : null; return () => { back?.remove(); guard?.setBlocked(false); }; }, [editing, guard]);
  const currentVersion = typeof payment.version === "number" ? payment.version : null;
  const mutation = useMutation({ retry: false, mutationFn: (command: Record<string, unknown>) => context.runtime.api.authenticated.post(`/projects/${encodeURIComponent(projectId)}/design-workflow/actions`, command),
    onSuccess: async () => { setVersion(null); setRetry(null); setReference(""); await invalidate("design-workflow-changed").catch(() => undefined); refresh(); },
    onError: (cause, command) => { const uncertain = !(cause instanceof ApiError) || cause.status >= 500 || cause.status === 408; setRetry(uncertain ? command : null); setError(uncertain ? "The payment confirmation could not be verified. Retry the same saved confirmation." : requestMessage(cause)); if (!uncertain) refresh(); },
    onSettled: () => { lock.current = false; }
  });
  const submit = () => {
    if (lock.current || mutation.isPending) return;
    if (!retry && (version === null || version !== currentVersion || !reference.trim() || payment.canConfirm !== true)) { setError("Refresh the payment status and enter a verified receipt reference."); return; }
    lock.current = true; setError(""); mutation.mutate(retry ?? { expectedVersion: version, action: "confirm_initial_payment", idempotencyKey: createIdempotencyKey(), note: reference.trim(), data: {} });
  };
  if (!retry && version === null && payment.confirmedAt && payment.requiresAttestation !== true) return <Text style={styles.success}>Initial payment confirmed {new Date(String(payment.confirmedAt)).toLocaleString()}.</Text>;
  if (payment.canConfirm !== true && !retry) return <Text style={styles.blocker}>{typeof payment.issue === "string" ? payment.issue : "Initial payment is awaiting confirmation."}</Text>;
  if (version === null) return <Button label={payment.requiresAttestation === true ? "Confirm existing receipt" : "Confirm initial payment"} variant="secondary" disabled={currentVersion === null} onPress={() => { setVersion(currentVersion); setError(""); }} />;
  return <View style={styles.form}>
    {payment.requiresAttestation === true ? <Text style={styles.copy}>Confirm the existing receipt against the final approved estimate. This does not record another payment.{typeof payment.existingReceiptAt === "string" ? ` Receipt recorded ${new Date(payment.existingReceiptAt).toLocaleString()}.` : ""}</Text> : <Text style={styles.copy}>Verify the receipt before confirming the initial payment.</Text>}
    <Field label="Payment receipt reference" value={reference} onChangeText={setReference} editable={!mutation.isPending && !retry} />
    {version !== currentVersion ? <Text style={styles.blocker}>The payment state changed. Close and review it before submitting a new confirmation.</Text> : null}
    {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
    <Button label={retry ? "Retry saved confirmation" : payment.requiresAttestation === true ? "Confirm existing receipt" : "Confirm payment"} loading={mutation.isPending} disabled={!retry && (version !== currentVersion || !reference.trim())} onPress={submit} />
    <Button label="Cancel confirmation" variant="quiet" disabled={mutation.isPending || Boolean(retry)} onPress={() => { setVersion(null); setRetry(null); }} />
  </View>;
}

function History({ projectId, events }: { readonly projectId: string; readonly events: readonly Row[] }) {
  const context = useConfiguredRuntime(); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const download = async (event: Row, media?: Row) => { const eventId = typeof event.id === "string" ? event.id : null; const mediaId = media && typeof media.id === "string" ? media.id : null; if (!eventId) return; setBusy(mediaId ?? eventId); setError(null); try { const name = media && typeof media.filename === "string" ? media.filename : "workflow-evidence"; const mime = media && typeof media.mimeType === "string" ? media.mimeType : "application/octet-stream"; const path = mediaId ? `/projects/${encodeURIComponent(projectId)}/design-workflow/history/${encodeURIComponent(eventId)}/media/${encodeURIComponent(mediaId)}` : `/projects/${encodeURIComponent(projectId)}/design-workflow/history/${encodeURIComponent(eventId)}/proof`; const artifact = await context.runtime.transfers.download({ path, fileName: name, mimeType: mime, maxBytes: 50 * 1024 * 1024 }).result; try { await artifact.share(); } finally { await artifact.release(); } } catch (cause) { setError(requestMessage(cause)); } finally { setBusy(null); } };
  if (!events.length) return null;
  return <View style={styles.history}><Text style={styles.label}>ACTION HISTORY</Text>{[...events].reverse().map((event, index) => <View key={typeof event.id === "string" ? event.id : index} style={styles.historyRow}><Text style={styles.itemTitle}>{typeof event.action === "string" ? event.action.replaceAll("_", " ") : "Workflow action"}</Text><Text style={styles.copy}>{typeof event.actorName === "string" ? event.actorName : "Lisno user"}{typeof event.at === "string" ? ` · ${new Date(event.at).toLocaleString()}` : ""}</Text>{typeof event.note === "string" && event.note ? <Text style={styles.copy}>{event.note}</Text> : null}{event.proofAvailable === true ? <Button label="Download evidence" variant="quiet" loading={busy === event.id} onPress={() => void download(event)} /> : null}{rows(event.mediaFiles).map((media) => <Button key={String(media.id)} label={`Download ${String(media.filename ?? "media")}`} variant="quiet" loading={busy === media.id} onPress={() => void download(event, media)} />)}</View>)}{error ? <Text style={styles.error}>{error}</Text> : null}</View>;
}

function WorkflowTiming({ value, reminders }: { value: Row | null; reminders: readonly Row[] }) {
  if (!value) return null;
  const stamp = (date: unknown) => typeof date === "string" && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleString() : null;
  return <View style={styles.compact}>
    {typeof value.state === "string" ? <Text style={styles.copy}>Timing: {value.state.replaceAll("_", " ")}{typeof value.clockOwner === "string" ? ` · ${value.clockOwner.replaceAll("_", " ")}` : ""}</Text> : null}
    {stamp(value.startsAt) ? <Text style={styles.copy}>Started: {stamp(value.startsAt)}</Text> : null}
    {stamp(value.targetAt) ? <Text style={styles.copy}>Target: {stamp(value.targetAt)}</Text> : null}
    {stamp(value.originalTargetAt) && value.originalTargetAt !== value.targetAt ? <Text style={styles.copy}>Original target: {stamp(value.originalTargetAt)}</Text> : null}
    {stamp(value.endsAt) ? <Text style={styles.copy}>Completed: {stamp(value.endsAt)}</Text> : null}
    {typeof value.band === "string" ? <Text style={styles.copy}>Timing band: {value.band.replaceAll("_", " ")}</Text> : null}
    {reminders.map((reminder) => <Text key={String(reminder.id)} style={styles.blocker}>{String(reminder.label ?? "Reminder")}{stamp(reminder.dueAt) ? ` · ${stamp(reminder.dueAt)}` : ""}</Text>)}
  </View>;
}

export function WorkflowWorkspace({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime(); const navigationBlocked = useScaffoldNavigationBlocked(); const [expanded, setExpanded] = useState<string | null>(null); const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  const query = useQuery({ queryKey: privateQueryKey(scope, "workflow", "project", projectId), queryFn: ({ signal }) => context.runtime.api.authenticated.get<Row>(`/projects/${encodeURIComponent(projectId)}/design-workflow`, { signal }), enabled: session.authorization.permissions.includes("projects.design_workflow.read") && !navigationBlocked, refetchOnWindowFocus: false });
  if (!session.authorization.permissions.includes("projects.design_workflow.read")) return null;
  if (query.isPending) return <BrandLoader label="Loading project workflow" tone="dark" />;
  if (query.isError) return <Text style={styles.error}>The project workflow could not be loaded.</Text>;
  const workflow = query.data; const stages = rows(workflow.projectStages); const payment = record(workflow.initialPayment);
  return <View style={styles.workspace}><View><Text style={styles.eyebrow}>WORKFLOW</Text><Text accessibilityRole="header" style={styles.title}>Project journey</Text><Text style={styles.copy}>Stage availability, blockers and timing come directly from Lisno.</Text></View>{payment ? <InitialPaymentAction projectId={projectId} payment={payment} refresh={() => void query.refetch()} /> : null}{stages.map((stage, index) => { const id = typeof stage.id === "string" ? stage.id : `stage-${index}`; const operational = record(stage.operational); const open = expanded === id; return <View key={id} style={styles.stage}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.stageHeader} onPress={() => setExpanded(open ? null : id)}><View style={styles.itemCopy}><Text style={styles.itemTitle}>{typeof stage.name === "string" ? stage.name : `Stage ${index + 1}`}</Text><Text style={styles.copy}>{operational && typeof operational.status === "string" ? operational.status.replaceAll("_", " ") : "Status unavailable"}{operational && typeof operational.progress === "number" ? ` · ${operational.progress}%` : ""}</Text></View><Text style={styles.chevron}>{open ? "−" : "+"}</Text></Pressable>{open && operational ? <View style={styles.stageBody}><WorkflowTiming value={record(operational.timing)} reminders={rows(operational.reminders)} />{rows(workflow.notices).filter((notice) => notice.stageId === id).map((notice) => <Text key={String(notice.id)} style={styles.blocker}>{String(notice.message)}</Text>)}{rows(operational.facts).map((fact, factIndex) => <Text key={factIndex} style={styles.copy}>{String(fact.label ?? "Detail")}: {String(fact.value ?? "Unavailable")}</Text>)}{strings(operational.blockingReasons).map((blocker, blockerIndex) => <Text key={blockerIndex} style={styles.blocker}>{blocker}</Text>)}{rows(operational.availableActions).filter((action) => isNativeWorkflowAction(action.id)).map((action) => <NativeWorkflowActionForm key={String(action.id)} projectId={projectId} stageId={id} operational={operational as unknown as DesignStageOperational} action={action as unknown as DesignWorkflowAction} workflow={workflow as unknown as DesignWorkflowView} refresh={() => void query.refetch()} />)}<History projectId={projectId} events={rows(operational.history)} /></View> : null}</View>; })}<Button label="Refresh workflow" variant="secondary" disabled={navigationBlocked} onPress={() => void query.refetch()} /></View>;
}

const styles = StyleSheet.create({ workspace: { gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, eyebrow: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.2 }, title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20 }, stage: { borderRadius: radii.surface, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }, stageHeader: { minHeight: 68, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }, itemCopy: { flex: 1, gap: 3 }, itemTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, textTransform: "capitalize" }, copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }, chevron: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 22 }, stageBody: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, compact: { gap: spacing.sm }, form: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.control, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border }, actionChoice: { gap: spacing.xs }, actionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 }, actions: { flexDirection: "row", gap: spacing.sm }, action: { flex: 1 }, blocker: { color: colors.warning, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 }, success: { color: colors.success, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }, label: { color: colors.inkMuted, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.7 }, options: { gap: spacing.xs }, option: { minHeight: 46, justifyContent: "center", padding: spacing.sm, borderRadius: radii.control, borderWidth: 1, borderColor: colors.borderStrong }, selected: { backgroundColor: colors.midnight }, optionText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12 }, selectedText: { color: colors.surface }, history: { gap: spacing.sm, paddingTop: spacing.sm }, historyRow: { gap: 3, padding: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.canvas } });

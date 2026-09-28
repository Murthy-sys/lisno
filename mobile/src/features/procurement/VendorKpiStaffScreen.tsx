import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import type { ProcurementVendorDetail } from "../../../../shared/knowledge/knowledgeTypes";
import {
  VENDOR_KPI_RUBRICS, VENDOR_KPI_RUBRIC_VERSION,
  type VendorKpiCategoryScore, type VendorKpiSaveInput, type VendorKpiStaffDetail,
  type VendorKpiRequestInput, type VendorKpiAssessment
} from "../../../../shared/knowledge/vendorKpi";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { ScaffoldContentBack } from "../../navigation/AdaptiveAppScaffold";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field, StateView } from "../../ui/primitives";
import { colors, fonts, spacing, typography } from "../../ui/tokens";
import { createIdempotencyKey } from "../finance/money";
import { KnowledgeVendorEditor } from "../knowledge/KnowledgeVendorEditor";
import { useKnowledgeContext } from "../knowledge/knowledgeRuntime";
import { useProcurementVendorContext } from "../knowledge/vendorRuntime";
import { formatVendorKpiScore, scoreRows } from "./vendorKpiPresentation";

const denied = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.status === 403);
const conflict = (error: unknown) => error instanceof ApiError && error.status === 409;
const detailPath = (vendorId: string) => `/procurement/vendor-kpis/${encodeURIComponent(vendorId)}`;
const dateLabel = (value: string) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Date unavailable";
};

export function VendorKpiStaffScreen({ session, vendorId }: { readonly session: AuthenticatedSession; readonly vendorId: string }) {
  const configured = useConfiguredRuntime();
  const client = useQueryClient();
  const invalidate = useInvalidateEvent();
  const knowledgeContext = useKnowledgeContext(session);
  const procurementContext = useProcurementVendorContext(session);
  const vendorContext = session.user.role === "super_admin" ? knowledgeContext : procurementContext;
  const permissions = session.authorization.permissions;
  const canRead = (session.user.role === "procurement" || session.user.role === "super_admin") && permissions.includes("procurement.vendor_kpi.read");
  const canRate = canRead && permissions.includes("procurement.vendor_kpi.rate");
  const canRequest = canRead && permissions.includes("procurement.vendor_kpi.request");
  const queryKey = privateQueryKey({ environmentId: configured.environment.environment.id, userId: session.user.id }, "vendors", "vendor-kpi", vendorId);
  const [editing, setEditing] = useState<ProcurementVendorDetail | null>(null);
  const [editError, setEditError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const requestKey = useRef(createIdempotencyKey());
  const query = useQuery({ queryKey, queryFn: async ({ signal }) => {
    const result = await configured.runtime.api.authenticated.get<VendorKpiStaffDetail>(detailPath(vendorId), { signal });
    if (result.vendor.id !== vendorId) throw new Error("Vendor identity changed. Refresh before continuing.");
    return result;
  }, enabled: canRead && configured.environment.status === "ready", retry: false, refetchOnMount: "always" });
  const edit = useMutation({ mutationFn: async () => {
    if (!vendorContext.canRead) throw new Error("Vendor profile access is required.");
    const result = await configured.runtime.api.authenticated.get<ProcurementVendorDetail>(`/admin/ai-estimator-knowledge/vendors/${encodeURIComponent(vendorId)}`);
    if (result.id !== vendorId || result.masterType !== "vendors") throw new Error("Vendor identity changed. Refresh before editing.");
    return result;
  }, retry: false, onSuccess: result => { setEditError(null); setEditing(result); }, onError: setEditError });
  const save = useMutation({ mutationFn: async (input: VendorKpiSaveInput) => {
    if (!canRate || !query.data) throw new Error("Procurement KPI permission is required.");
    const result = await configured.runtime.api.authenticated.put<VendorKpiStaffDetail>(`${detailPath(vendorId)}/procurement`, input);
    if (result.vendor.id !== vendorId) throw new Error("Vendor identity changed. Refresh before continuing.");
    return result;
  }, retry: false, onSuccess: async result => { client.setQueryData(queryKey, result); setNotice("Procurement KPI saved."); await invalidate("knowledge-changed"); } });
  const request = useMutation({ mutationFn: async (input: VendorKpiRequestInput) => {
    if (!canRequest || !query.data) throw new Error("Vendor KPI request permission is required.");
    const result = await configured.runtime.api.authenticated.post<VendorKpiStaffDetail>(`${detailPath(vendorId)}/requests`, input);
    if (result.vendor.id !== vendorId) throw new Error("Vendor identity changed. Refresh before continuing.");
    return result;
  }, retry: false, onSuccess: async result => { client.setQueryData(queryKey, result); requestKey.current = createIdempotencyKey(); setNotice("KPI request saved. Check its delivery status below."); await invalidate("knowledge-changed"); } });

  const accessLost = denied(query.error) || denied(editError) || denied(save.error) || denied(request.error);
  if (!canRead || accessLost) return <StateView tone="denied" title="Vendor KPI unavailable" message="Your current account cannot view this vendor KPI." />;
  if (configured.environment.status !== "ready" || query.isPending) return <StateView title="Loading Vendor KPI" message="Loading the latest vendor assessment…" />;
  if (query.isError && !query.data) return <StateView tone="error" title="Vendor KPI could not be loaded" message="Check your connection and try again." actionLabel="Retry Vendor KPI" onAction={() => void query.refetch()} />;
  const detail = query.data;
  if (!detail) return <StateView tone="error" title="Vendor KPI unavailable" message="The vendor assessment was not returned." />;
  const rubricCurrent = detail.rubricVersion === VENDOR_KPI_RUBRIC_VERSION;
  const vendorType = detail.vendor.vendorType;
  const mayRequest = canRequest && detail.requestEligibility === "ready" && !detail.selfAssessment && vendorType !== null && detail.vendor.emailAvailable && detail.vendor.status !== "archived" && !query.isRefetchError;
  const requestLabel = detail.request ? "Resend KPI request" : "Request KPI from vendor";
  const refresh = () => { requestKey.current = createIdempotencyKey(); setNotice(""); save.reset(); request.reset(); edit.reset(); setEditError(null); void query.refetch(); };

  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}>
    <ScaffoldContentBack />
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>VENDOR PERFORMANCE</Text>
      <Text accessibilityRole="header" style={styles.title}>{detail.vendor.name}</Text>
      <Text style={styles.meta}>{detail.vendor.code} · {detail.vendor.status} · {vendorType === "execution" ? "Execution vendor" : vendorType === "supplier" ? "Supplier" : "Type not configured"}</Text>
      <View style={styles.actions}>
        {mayRequest ? <Button label={requestLabel} size="compact" loading={request.isPending} disabled={request.isPending || save.isPending || !rubricCurrent} onPress={() => request.mutate({ idempotencyKey: requestKey.current, expectedRequestVersion: detail.request?.version ?? null })} /> : null}
        {vendorContext.canRead ? <Button label={vendorContext.canUpdate && detail.vendor.status !== "archived" ? "Edit vendor" : "View vendor profile"} variant="secondary" size="compact" loading={edit.isPending} onPress={() => edit.mutate()} /> : null}
      </View>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    </View>
    {query.isRefetchError ? <StateView tone="error" title="Vendor KPI may be out of date" message="Refresh before making another change." actionLabel="Refresh Vendor KPI" onAction={refresh} /> : null}
    {query.isRefetching ? <Text accessibilityLiveRegion="polite" style={styles.meta}>Updating Vendor KPI…</Text> : null}
    {edit.isError ? <StateView tone="error" title="Vendor profile unavailable" message="The vendor profile could not be loaded. Retry from this page." actionLabel="Retry profile" onAction={() => edit.mutate()} /> : null}
    <View style={styles.summary}>
      <Metric label="Official Vendor KPI" value={formatVendorKpiScore(detail.officialScoreBps)} />
      <Metric label="Vendor self rating" value={formatVendorKpiScore(detail.selfAssessment?.averageScoreBps ?? null)} />
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Vendor details</Text>
      <Text style={styles.meta}>Work profile: {detail.vendor.workProfile || "Not provided"}</Text>
      <Text style={styles.meta}>Main baskets: {detail.vendor.mainBasketNames.length ? detail.vendor.mainBasketNames.join(", ") : "None selected"}</Text>
      <Text style={styles.meta}>Sub baskets: {detail.vendor.subBasketNames.length ? detail.vendor.subBasketNames.join(", ") : "None selected"}</Text>
    </View>
    {!rubricCurrent ? <StateView tone="error" title="KPI rubric update required" message="This app cannot edit the current rubric. Update the app, then refresh." /> : vendorType ? <>
      <Assessment title="Vendor self rating" assessment={detail.selfAssessment} vendorType={vendorType} />
      <Assessment title="Procurement rating" assessment={detail.procurementAssessment} vendorType={vendorType} />
      {canRate && detail.vendor.status !== "archived" ? <ProcurementRatingForm key={`${detail.vendor.id}:${vendorType}:${detail.procurementAssessment?.revision ?? 0}`} vendorType={vendorType} assessment={detail.procurementAssessment} busy={save.isPending} error={save.error} stale={query.isRefetchError || conflict(save.error)} onSave={input => save.mutate(input)} onReload={refresh} /> : null}
    </> : <StateView title="Vendor type required" message="Complete the vendor profile before requesting or rating KPI." />}
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Vendor request</Text>
      {detail.selfAssessment ? <Text style={styles.meta}>Self assessment submitted on {dateLabel(detail.selfAssessment.submittedAt)}.</Text>
        : detail.request ? <Text style={styles.meta}>Status: {detail.request.status.replaceAll("_", " ")} · Requested {dateLabel(detail.request.requestedAt)} · Expires {dateLabel(detail.request.expiresAt)}</Text>
        : <Text style={styles.meta}>No self assessment request has been sent.</Text>}
      {detail.requestEligibility === "missing_profile" ? <Text style={styles.meta}>Add a vendor type and saved email in the vendor profile to request KPI.</Text> : null}
      {detail.requestEligibility === "cooldown" || detail.requestEligibility === "pending" ? <Text style={styles.meta}>A request is already in progress. {detail.request?.canResendAt ? `Resend available after ${dateLabel(detail.request.canResendAt)}.` : "Refresh for its latest delivery status."}</Text> : null}
      {detail.requestEligibility === "archived" ? <Text style={styles.meta}>Archived vendors cannot receive requests.</Text> : null}
      {request.isError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{conflict(request.error) ? "The request changed. Refresh before retrying." : "The request could not be confirmed. Retry keeps the same request identity."}</Text> : null}
    </View>
    {editing ? <KnowledgeVendorEditor context={vendorContext} existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void invalidate("knowledge-changed"); void query.refetch(); }} /> : null}
  </ScrollView>;
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function Assessment({ title, assessment, vendorType }: { readonly title: string; readonly assessment: VendorKpiAssessment | null; readonly vendorType: "execution" | "supplier" }) {
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
    {assessment ? <>
      <Text style={styles.meta}>Average {formatVendorKpiScore(assessment.averageScoreBps)} · Revision {assessment.revision} · Saved {dateLabel(assessment.submittedAt)}</Text>
      {scoreRows(vendorType, assessment).map(row => <View key={row.key} style={styles.scoreRow}><Text style={styles.scoreName}>{row.label}</Text><Text style={styles.scoreValue}>{row.score === null ? "—" : `${row.score}/100`}</Text></View>)}
      {assessment.comment ? <Text style={styles.meta}>Comment: {assessment.comment}</Text> : null}
    </> : <Text style={styles.meta}>No {title.toLowerCase()} has been saved for this rubric.</Text>}
  </View>;
}

function ProcurementRatingForm({ vendorType, assessment, busy, error, stale, onSave, onReload }: {
  readonly vendorType: "execution" | "supplier";
  readonly assessment: VendorKpiAssessment | null;
  readonly busy: boolean;
  readonly error: unknown;
  readonly stale: boolean;
  readonly onSave: (input: VendorKpiSaveInput) => void;
  readonly onReload: () => void;
}) {
  const rubric = VENDOR_KPI_RUBRICS[vendorType];
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(assessment?.scores.map(row => [row.key, String(row.score)]) ?? []));
  const [comment, setComment] = useState(assessment?.comment ?? "");
  const key = useRef(createIdempotencyKey());
  const parsed: VendorKpiCategoryScore[] = [];
  const errors: Record<string, string> = {};
  for (const category of rubric) {
    const value = scores[category.key] ?? "";
    if (!/^(?:0|[1-9]\d{0,2})$/.test(value) || Number(value) > 100) errors[category.key] = "Enter an integer from 0 to 100.";
    else parsed.push({ key: category.key, score: Number(value) });
  }
  const dirty = rubric.some(category => scores[category.key] !== String(assessment?.scores.find(row => row.key === category.key)?.score ?? "")) || comment !== (assessment?.comment ?? "");
  const valid = parsed.length === rubric.length && comment.length <= 1000;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>{assessment ? "Revise Procurement KPI" : "Add Procurement KPI"}</Text>
    <Text style={styles.meta}>Rate every category from 0 to 100. The server calculates the official average.</Text>
    {rubric.map(category => <Field key={category.key} label={`${category.label} rating (0–100)`} value={scores[category.key] ?? ""} keyboardType="number-pad" maxLength={3} editable={!busy && !stale} error={(scores[category.key] ?? "") && errors[category.key] ? errors[category.key] : undefined} onChangeText={value => { setScores(current => ({ ...current, [category.key]: value })); key.current = createIdempotencyKey(); }} />)}
    <Field label="Procurement comment (optional)" value={comment} multiline maxLength={1000} editable={!busy && !stale} onChangeText={value => { setComment(value); key.current = createIdempotencyKey(); }} />
    {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{conflict(error) ? "This assessment changed. Reload the latest version before saving." : "The KPI save could not be confirmed. Retry keeps the same request identity."}</Text> : null}
    {stale ? <Button label="Reload latest KPI" variant="secondary" onPress={onReload} /> : null}
    <Button label="Save Procurement KPI" loading={busy} disabled={!valid || !dirty || stale || busy} onPress={() => onSave({ rubricVersion: VENDOR_KPI_RUBRIC_VERSION, expectedRevision: assessment?.revision ?? null, idempotencyKey: key.current, scores: parsed, comment: comment.trim() || null })} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { width: "100%", maxWidth: 920, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg },
  heading: { gap: spacing.xs },
  eyebrow: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.2 },
  title: { color: colors.ink, ...typography.pageTitle },
  meta: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  notice: { color: colors.success, fontFamily: fonts.medium, fontSize: 13 },
  summary: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  metric: { flexGrow: 1, flexBasis: "46%", minWidth: 170, padding: spacing.md, gap: spacing.xs },
  metricLabel: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 12 },
  metricValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 22 },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.md },
  sectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18 },
  scoreRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  scoreName: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  scoreValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, fontVariant: ["tabular-nums"] },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20 }
});

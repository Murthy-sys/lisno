import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import { getVendorDetail } from "./vendorProfileApi";
import { ProcurementVendorEditor } from "./ProcurementVendorEditor";
import { procurementError, procurementRequestKey } from "./procurementPresentation";
import { getVendorKpi, requestVendorKpi, saveProcurementVendorKpi, vendorKpiKeys } from "./vendorKpiApi";
import { VendorKpiAssessmentView, VendorKpiScoreForm } from "./VendorKpiScoreForm";
import { formatVendorKpiScore } from "./vendorKpiPresentation";
import type { VendorKpiRequestInput, VendorKpiSaveInput } from "../../../../shared/knowledge/vendorKpi";
import "./vendorKpi.css";

const denied = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.status === 403);
const conflict = (error: unknown) => error instanceof ApiError && error.status === 409;

export function VendorKpiStaffPage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const auth = useAuth();
  const client = useQueryClient();
  const actorId = auth.user?.id ?? "";
  const staffRole = auth.user?.role === "procurement" || auth.user?.role === "super_admin";
  const canRead = staffRole && hasFrontendPermission(auth.authorization, "procurement.vendor_kpi.read");
  const canRate = staffRole && hasFrontendPermission(auth.authorization, "procurement.vendor_kpi.rate");
  const canRequest = staffRole && hasFrontendPermission(auth.authorization, "procurement.vendor_kpi.request");
  const canEdit = staffRole && hasFrontendPermission(auth.authorization, "procurement.vendor_directory.update");
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const saveInput = useRef<VendorKpiSaveInput | null>(null);
  const requestInput = useRef<VendorKpiRequestInput | null>(null);
  const backPath = auth.user?.role === "super_admin" ? "/admin/procurement/vendors" : "/procurement/vendors";
  const query = useQuery({ queryKey: vendorKpiKeys.detail(actorId, vendorId ?? ""), queryFn: ({ signal }) => getVendorKpi(vendorId!, signal), enabled: canRead && Boolean(vendorId), gcTime: 0, refetchOnWindowFocus: true });
  const privateDetail = useQuery({ queryKey: knowledgeQueryKeys.vendorDetail(vendorId ?? ""), queryFn: ({ signal }) => getVendorDetail(vendorId!, signal), enabled: canEdit && editOpen && Boolean(vendorId), gcTime: 0 });

  async function refreshAffected() {
    await Promise.all([
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.masterLists("vendors") }),
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.vendorDirectoryOverview() }),
      client.invalidateQueries({ queryKey: ["procurement", "vendor-suggestions"] })
    ]);
  }
  const save = useMutation({ mutationFn: (input: VendorKpiSaveInput) => saveProcurementVendorKpi(vendorId!, input), onSuccess: async (detail) => {
    if (detail.vendor.id !== vendorId) throw new Error("The saved KPI belongs to a different vendor.");
    client.setQueryData(vendorKpiKeys.detail(actorId, vendorId!), detail);
    saveInput.current = null;
    setNotice("Procurement KPI saved.");
    await refreshAffected();
  } });
  const request = useMutation({ mutationFn: (input: VendorKpiRequestInput) => requestVendorKpi(vendorId!, input), onSuccess: async (detail) => {
    if (detail.vendor.id !== vendorId) throw new Error("The request belongs to a different vendor.");
    client.setQueryData(vendorKpiKeys.detail(actorId, vendorId!), detail);
    requestInput.current = null;
    setNotice(detail.request?.status === "sent" ? "KPI request sent to the vendor profile email." : detail.request?.status === "failed" ? "Email delivery failed. You can retry the KPI request." : "KPI request is being processed. Refresh to check delivery.");
    await refreshAffected();
  } });

  async function saveScores(values: { scores: VendorKpiSaveInput["scores"]; comment: string | null }) {
    if (!query.data || !vendorId) return;
    if (!saveInput.current || JSON.stringify(saveInput.current.scores) !== JSON.stringify(values.scores) || saveInput.current.comment !== values.comment) {
      saveInput.current = { ...values, rubricVersion: query.data.rubricVersion, expectedRevision: query.data.procurementAssessment?.revision ?? null, idempotencyKey: procurementRequestKey() };
    }
    try { await save.mutateAsync(saveInput.current); } catch (error) {
      if (conflict(error)) { saveInput.current = null; void query.refetch(); }
    }
  }
  async function sendRequest() {
    if (!query.data || !vendorId) return;
    requestInput.current ??= { expectedRequestVersion: query.data.request?.version ?? null, idempotencyKey: procurementRequestKey() };
    try { await request.mutateAsync(requestInput.current); } catch (error) {
      if (conflict(error)) { requestInput.current = null; void query.refetch(); }
    }
  }

  if (!canRead || !vendorId || denied(query.error) || denied(save.error) || denied(request.error) || denied(privateDetail.error)) {
    return <PageState state="error" message="You do not have permission to view this vendor KPI." />;
  }
  if (query.isPending) return <PageState state="loading" message="Loading vendor KPI…" />;
  if (query.isError) return <PageState state="error" message={procurementError(query.error, "Vendor KPI could not be loaded.")} action={{ label: "Retry", onAction: () => void query.refetch() }} />;
  const detail = query.data;
  if (detail.vendor.id !== vendorId) return <PageState state="error" message="Vendor KPI identity changed. Refresh the directory." />;
  const { vendor } = detail;
  const type = vendor.vendorType;
  const canSendNow = detail.requestEligibility === "ready" || (detail.requestEligibility === "cooldown" && detail.request?.canResendAt && new Date(detail.request.canResendAt).getTime() <= Date.now());
  const requestAllowed = canRequest && vendor.status !== "archived" && !detail.selfAssessment && vendor.emailAvailable && type && canSendNow;
  const requestLabel = detail.request?.status === "sent" || detail.request?.status === "pending" ? "Resend KPI request" : "Request KPI from vendor";

  return <main className="vendor-kpi vendor-kpi--staff" aria-labelledby="vendor-kpi-title">
    <Link className="vendor-kpi__back" to={backPath}>Back to vendors</Link>
    <header className="vendor-kpi__header"><div><p className="vendor-kpi__eyebrow">Procurement / Vendor performance</p><div className="vendor-kpi__title-row"><h1 id="vendor-kpi-title">{vendor.name}</h1>{requestAllowed ? <Button busy={request.isPending} onClick={() => void sendRequest()}>{requestLabel}</Button> : null}<Button variant="secondary" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh KPI</Button></div><p>{vendor.code} · {type === "execution" ? "Execution vendor" : type === "supplier" ? "Supplier" : "Type not recorded"} · {vendor.status}</p></div><div className="vendor-kpi__official"><span>Official Vendor KPI</span><strong>{formatVendorKpiScore(detail.officialScoreBps)}</strong><small>Procurement rating</small></div></header>
    {notice ? <p className="vendor-kpi__notice" role="status">{notice}</p> : null}
    {request.isError ? <InlineMessage tone="error">{conflict(request.error) ? "The request state changed. Review the latest status and try again." : procurementError(request.error, "The KPI request could not be sent. Retry when delivery is available.")}</InlineMessage> : null}
    {detail.request && !detail.selfAssessment ? <p className="vendor-kpi__request" role="status">Vendor request: {detail.request.status}. {detail.request.status === "sent" ? `Link expires ${new Date(detail.request.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.` : ""}</p> : null}
    {!detail.selfAssessment && detail.requestEligibility === "missing_profile" ? <InlineMessage tone="warning">Complete the vendor type and profile email before requesting a self assessment.</InlineMessage> : null}
    <section className="vendor-kpi__identity" aria-label="Vendor details"><div><h2>Vendor details</h2><dl><div><dt>Work profile</dt><dd>{vendor.workProfile || "Not recorded"}</dd></div><div><dt>Main baskets</dt><dd>{vendor.mainBasketNames.join(", ") || "Not recorded"}</dd></div><div><dt>Sub baskets</dt><dd>{vendor.subBasketNames.join(", ") || "Not recorded"}</dd></div></dl></div>{canEdit && vendor.status !== "archived" ? <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit vendor</Button> : null}</section>
    {type ? <div className="vendor-kpi__columns"><VendorKpiAssessmentView title="Vendor self rating" assessment={detail.selfAssessment} type={type} />{canRate && vendor.status !== "archived" ? <VendorKpiScoreForm key={`${type}-${detail.procurementAssessment?.revision ?? 0}`} title="Procurement rating" type={type} initial={detail.procurementAssessment} busy={save.isPending} submitLabel="Save Procurement KPI" error={save.isError ? conflict(save.error) ? "The KPI changed while you were editing. Review the latest scores before saving." : procurementError(save.error, "The KPI could not be saved. Retry or refresh to check its status.") : undefined} onSave={saveScores} /> : <VendorKpiAssessmentView title="Procurement rating" assessment={detail.procurementAssessment} type={type} />}</div> : <PageState state="empty" message="Set the vendor type before rating this vendor." />}
    {editOpen && canEdit ? privateDetail.isPending ? <PageState state="loading" message="Loading vendor editor…" /> : privateDetail.isError ? <InlineMessage tone="error">{procurementError(privateDetail.error, "Vendor details could not be loaded.")}<Button variant="secondary" onClick={() => setEditOpen(false)}>Close</Button></InlineMessage> : privateDetail.data ? <ProcurementVendorEditor existing={privateDetail.data} canCreateBasket={hasFrontendPermission(auth.authorization, "procurement.vendor_classification.create")} canUpdate={canEdit} canCorrectBaseline={hasFrontendPermission(auth.authorization, "procurement.vendor_allocation_baseline.correct")} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); void query.refetch(); }} /> : null : null}
  </main>;
}

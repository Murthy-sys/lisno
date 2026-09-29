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
import { VendorInductionStaffPanel } from "./VendorInductionStaffPanel";
import { getVendorInduction, vendorInductionKeys } from "./vendorInductionApi";
import { procurementError, procurementRequestKey } from "./procurementPresentation";
import { projectProcurementKeys } from "./projectProcurementApi";
import { getVendorKpi, requestVendorKpi, saveProcurementVendorKpi, vendorKpiKeys } from "./vendorKpiApi";
import { VendorKpiAssessmentView, VendorKpiScoreForm } from "./VendorKpiScoreForm";
import { formatVendorKpiScore } from "./vendorKpiPresentation";
import type { VendorKpiRequestInput, VendorKpiSaveInput } from "../../../../shared/knowledge/vendorKpi";
import type { VendorActivation } from "../../../../shared/knowledge/vendorInduction";
import "./vendorKpi.css";
import "./vendorInduction.css";

const denied = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.status === 403);
const conflict = (error: unknown) => error instanceof ApiError && error.status === 409;
const activationStatus = (activation: VendorActivation | undefined) => activation?.effectiveStatus === "active" ? "Active" : activation?.effectiveStatus === "under_review" ? "Under Review" : activation?.effectiveStatus === "inactive" ? "Inactive" : activation?.effectiveStatus === "archived" ? "Archived" : "Status unavailable";

function VendorActivationOverview({ activation, loading, error, onInduction, onKpi, onVerification }: {
  activation?: VendorActivation; loading: boolean; error: boolean;
  onInduction: () => void; onKpi: () => void; onVerification?: () => void;
}) {
  if (loading) return <section className="vendor-induction__activation" aria-label="Vendor activation"><h2>Vendor activation</h2><p>Loading activation requirements…</p></section>;
  if (error || !activation) return <section className="vendor-induction__activation" aria-label="Vendor activation"><h2>Vendor activation</h2><p>Availability is unavailable. Refresh the page before using this vendor for new work.</p></section>;
  const gates = [
    { title: "Induction", complete: activation.gates.inductionApproved, detail: activation.gates.inductionApproved ? "Submitted answers approved by Procurement" : "Vendor answers need Procurement approval", action: onInduction, label: "Open induction" },
    { title: "KPI", complete: activation.gates.vendorSelfKpiComplete && activation.gates.procurementKpiComplete, detail: [activation.gates.vendorSelfKpiComplete ? null : "Vendor self KPI missing", activation.gates.procurementKpiComplete ? null : "Procurement KPI missing"].filter(Boolean).join(" · ") || "Both assessments complete", action: onKpi, label: "Open KPI" },
    { title: "Verification", complete: activation.gates.profileComplete && activation.gates.physicalAddressVerified, detail: [activation.gates.profileComplete ? null : "Complete vendor profile", activation.gates.physicalAddressVerified ? null : "Confirm physical address"].filter(Boolean).join(" · ") || "Profile and physical address verified", action: onVerification, label: "Edit vendor" }
  ];
  return <section className="vendor-induction__activation" aria-label="Vendor activation"><div className="vendor-induction__section-heading"><div><h2>Vendor activation</h2><p>All three requirements must be complete before this vendor is available for new work.</p></div><strong className={`vendor-induction__availability vendor-induction__availability--${activation.effectiveStatus}`}>{activationStatus(activation)}</strong></div><div className="vendor-induction__gate-list">{gates.map((gate) => <div key={gate.title}><div><strong>{gate.title}</strong><span>{gate.complete ? "Complete" : "Pending"}</span><p>{gate.detail}</p></div>{!gate.complete && gate.action ? <Button variant="quiet" onClick={gate.action}>{gate.label}</Button> : null}</div>)}</div></section>;
}

export function VendorKpiStaffPage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const auth = useAuth();
  const client = useQueryClient();
  const actorId = auth.user?.id ?? "";
  const staffRole = auth.user?.role === "procurement" || auth.user?.role === "super_admin";
  const canRead = staffRole && hasFrontendPermission(auth.authorization, "procurement.vendor_kpi.read");
  const canReadInduction = staffRole && hasFrontendPermission(auth.authorization, "procurement.vendor_induction.read");
  const canRate = staffRole && hasFrontendPermission(auth.authorization, "procurement.vendor_kpi.rate");
  const canRequest = staffRole && hasFrontendPermission(auth.authorization, "procurement.vendor_kpi.request");
  const canEdit = staffRole && hasFrontendPermission(auth.authorization, "procurement.vendor_directory.update");
  const [editOpen, setEditOpen] = useState(false);
  const [section, setSection] = useState<"overview" | "induction">("overview");
  const [notice, setNotice] = useState("");
  const saveInput = useRef<VendorKpiSaveInput | null>(null);
  const requestInput = useRef<VendorKpiRequestInput | null>(null);
  const backPath = auth.user?.role === "super_admin" ? "/admin/procurement/vendors" : "/procurement/vendors";
  const query = useQuery({ queryKey: vendorKpiKeys.detail(actorId, vendorId ?? ""), queryFn: ({ signal }) => getVendorKpi(vendorId!, signal), enabled: canRead && Boolean(vendorId), gcTime: 0, refetchOnWindowFocus: true });
  const induction = useQuery({ queryKey: vendorInductionKeys.detail(actorId, vendorId ?? ""), queryFn: ({ signal }) => getVendorInduction(vendorId!, signal), enabled: canReadInduction && Boolean(vendorId), gcTime: 0, refetchOnWindowFocus: true });
  const privateDetail = useQuery({ queryKey: knowledgeQueryKeys.vendorDetail(vendorId ?? ""), queryFn: ({ signal }) => getVendorDetail(vendorId!, signal), enabled: canEdit && editOpen && Boolean(vendorId), gcTime: 0 });

  async function refreshAffected() {
    await Promise.all([
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.masterLists("vendors") }),
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.vendorDirectoryOverview() }),
      client.invalidateQueries({ queryKey: projectProcurementKeys.vendors }),
      client.invalidateQueries({ queryKey: ["procurement", "vendor-suggestions"] }),
      client.invalidateQueries({ queryKey: vendorInductionKeys.detail(actorId, vendorId ?? "") })
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

  if (!canRead || !vendorId || denied(query.error) || denied(save.error) || denied(request.error) || denied(privateDetail.error) || denied(induction.error)) {
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
  const activation = induction.data?.vendor.id === vendorId ? induction.data.activation : undefined;

  return <main className="vendor-kpi vendor-kpi--staff" aria-labelledby="vendor-kpi-title">
    <Link className="vendor-kpi__back" to={backPath}>Back to vendors</Link>
    <header className="vendor-kpi__header"><div><p className="vendor-kpi__eyebrow">Procurement / Vendor details</p><div className="vendor-kpi__title-row"><h1 id="vendor-kpi-title">{vendor.name}</h1>{section === "overview" && requestAllowed ? <Button busy={request.isPending} onClick={() => void sendRequest()}>{requestLabel}</Button> : null}{section === "overview" ? <Button variant="secondary" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh KPI</Button> : null}</div><p>{vendor.code} · {type === "execution" ? "Execution vendor" : type === "supplier" ? "Supplier" : "Type not recorded"} · {activationStatus(activation)}</p></div><div className="vendor-kpi__official"><span>Official Vendor KPI</span><strong>{formatVendorKpiScore(detail.officialScoreBps)}</strong><small>Procurement rating</small></div></header>
    <nav className="vendor-induction__tabs" aria-label="Vendor detail sections"><button type="button" aria-current={section === "overview" ? "page" : undefined} onClick={() => setSection("overview")}>Overview</button><button type="button" aria-current={section === "induction" ? "page" : undefined} onClick={() => setSection("induction")}>Induction</button></nav>
    {section === "induction" ? !canReadInduction ? <PageState state="error" message="You do not have permission to view vendor induction." /> : induction.isPending ? <PageState state="loading" message="Loading vendor induction…" /> : induction.isError ? <PageState state="error" message={procurementError(induction.error, "Vendor induction could not be loaded.")} action={{ label: "Retry induction", onAction: () => void induction.refetch() }} /> : induction.data.vendor.id !== vendorId ? <PageState state="error" message="Vendor induction identity changed. Refresh the directory." /> : <VendorInductionStaffPanel vendorId={vendorId} detail={induction.data} refetch={() => void induction.refetch()} /> : <>
    <VendorActivationOverview activation={activation} loading={induction.isPending && canReadInduction} error={!canReadInduction || induction.isError} onInduction={() => setSection("induction")} onKpi={() => document.getElementById("vendor-kpi-assessments")?.scrollIntoView({ block: "start" })} onVerification={canEdit && vendor.status !== "archived" ? () => setEditOpen(true) : undefined} />
    {notice ? <p className="vendor-kpi__notice" role="status">{notice}</p> : null}
    {request.isError ? <InlineMessage tone="error">{conflict(request.error) ? "The request state changed. Review the latest status and try again." : procurementError(request.error, "The KPI request could not be sent. Retry when delivery is available.")}</InlineMessage> : null}
    {detail.request && !detail.selfAssessment ? <p className="vendor-kpi__request" role="status">Vendor request: {detail.request.status}. {detail.request.status === "sent" ? `Link expires ${new Date(detail.request.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.` : ""}</p> : null}
    {!detail.selfAssessment && detail.requestEligibility === "missing_profile" ? <InlineMessage tone="warning">Complete the vendor type and profile email before requesting a self assessment.</InlineMessage> : null}
    <section className="vendor-kpi__identity" aria-label="Vendor details"><div><h2>Vendor details</h2><dl><div><dt>Work profile</dt><dd>{vendor.workProfile || "Not recorded"}</dd></div><div><dt>Main baskets</dt><dd>{vendor.mainBasketNames.join(", ") || "Not recorded"}</dd></div><div><dt>Sub baskets</dt><dd>{vendor.subBasketNames.join(", ") || "Not recorded"}</dd></div></dl></div>{canEdit && vendor.status !== "archived" ? <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit vendor</Button> : null}</section>
    {type ? <div id="vendor-kpi-assessments" className="vendor-kpi__columns"><VendorKpiAssessmentView title="Vendor self rating" assessment={detail.selfAssessment} type={type} />{canRate && vendor.status !== "archived" ? <VendorKpiScoreForm key={`${type}-${detail.procurementAssessment?.revision ?? 0}`} title="Procurement rating" type={type} initial={detail.procurementAssessment} busy={save.isPending} submitLabel="Save Procurement KPI" error={save.isError ? conflict(save.error) ? "The KPI changed while you were editing. Review the latest scores before saving." : procurementError(save.error, "The KPI could not be saved. Retry or refresh to check its status.") : undefined} onSave={saveScores} /> : <VendorKpiAssessmentView title="Procurement rating" assessment={detail.procurementAssessment} type={type} />}</div> : <PageState state="empty" message="Set the vendor type before rating this vendor." />}
    {editOpen && canEdit ? privateDetail.isPending ? <PageState state="loading" message="Loading vendor editor…" /> : privateDetail.isError ? <InlineMessage tone="error">{procurementError(privateDetail.error, "Vendor details could not be loaded.")}<Button variant="secondary" onClick={() => setEditOpen(false)}>Close</Button></InlineMessage> : privateDetail.data ? <ProcurementVendorEditor existing={privateDetail.data} canCreateBasket={hasFrontendPermission(auth.authorization, "procurement.vendor_classification.create")} canUpdate={canEdit} canCorrectBaseline={hasFrontendPermission(auth.authorization, "procurement.vendor_allocation_baseline.correct")} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); void query.refetch(); void induction.refetch(); }} /> : null : null}
    </>}
  </main>;
}

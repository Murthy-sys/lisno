import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, StateView } from "../../ui/primitives";
import { LeadActions } from "../leads/LeadActions";
import { EstimateDesignPreparation } from "../design-plans/EstimateDesignPreparation";
import { designEstimateOptions } from "../design-plans/designPlanModel";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { EstimateRequirementsPanel } from "../estimates/EstimateRequirementsPanel";
import { estimateRequirementsKey, getEstimateRequirements } from "../estimates/estimateRequirementsApi";
import { EstimateBasketSelection, EstimateItemEditor } from "./EstimateItemEditor";
import { EstimateRecommendations } from "./EstimateRecommendations";
import { EstimateRoomSetup } from "./EstimateRoomSetup";
import { StaffEstimateLifecycle } from "./StaffEstimateLifecycle";
import { EstimateChoice, EstimateSection, EstimateText, EstimateTheme, estimateStyles as styles } from "./EstimateUI";
import { getStaffCatalogue, getStaffEstimate, getStaffLead, saveStaffEstimate, staffCatalogueKey, staffEstimateKey, staffLeadKey, submitStaffEstimate } from "./staffEstimateApi";
import { estimateEditable, estimatePaise, previewEstimateTotals, refreshStaffForm, restoreStaffForm, staffFormFingerprint, staffFormInput, validateStaffForm, type StaffEstimateForm } from "./staffEstimateModel";
import type { EstimateDraft } from "./types";

export function StaffEstimateWorkspace({ leadId, session }: { readonly leadId: string; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  return <StaffEstimateEditor key={`${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${session.user.id}:${leadId}`} leadId={leadId} session={session} />;
}
function StaffEstimateEditor({ leadId, session }: { readonly leadId: string; readonly session: AuthenticatedSession }) {
  const activeOwner = useRef(true); useEffect(() => () => { activeOwner.current = false; }, []);
  const context = useConfiguredRuntime(); const client = useQueryClient(); const invalidate = useInvalidateEvent(); const navigation = useNavigation();
  const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  const allowed = session.user.role !== "client" && canPerformOperation(session, "GET /leads/:leadId/estimate") && canPerformOperation(session, "GET /leads/:leadId");
  const canSave = canPerformOperation(session, "PUT /leads/:leadId/estimate");
  const canCatalogue = canPerformOperation(session, "GET /estimation/catalogue");
  const [denied, setDenied] = useState(false);
  const enabled = allowed && !denied && context.environment.status === "ready";
  const lead = useQuery({ queryKey: staffLeadKey(scope, leadId), queryFn: ({ signal }) => getStaffLead(context.runtime, leadId, signal), enabled });
  const saved = useQuery({ queryKey: staffEstimateKey(scope, leadId), queryFn: ({ signal }) => getStaffEstimate(context.runtime, leadId, signal), enabled, refetchOnMount: "always" });
  const catalogue = useQuery({ queryKey: staffCatalogueKey(scope), queryFn: ({ signal }) => getStaffCatalogue(context.runtime, signal), enabled: enabled && canCatalogue, staleTime: 60_000, refetchOnMount: "always" });
  const collaborative = saved.data?.estimation?.workflowVersion === 2 || lead.data?.estimationWorkflowVersion === 2;
  const projectId = lead.data?.projectId ?? saved.data?.projectId;
  const requirements = useQuery({ queryKey: estimateRequirementsKey(scope, projectId ?? ""), queryFn: ({ signal }) => getEstimateRequirements(context.runtime, projectId!, signal), enabled: enabled && collaborative && Boolean(projectId) && canPerformOperation(session, "GET /projects/:projectId/estimate-requirements") });
  const [form, setForm] = useState<StaffEstimateForm | null>(null); const [baseline, setBaseline] = useState("");
  const [version, setVersion] = useState<number | undefined>(); const versionRef = useRef<number | undefined>(undefined);
  const [step, setStep] = useState<"rooms" | "scope" | "items" | "summary">("rooms"); const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false); const busyRef = useRef(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [conflict, setConflict] = useState(false); const [conflictRefreshed, setConflictRefreshed] = useState(false);
  const navigationGuard = useScaffoldNavigationGuard();
  useEffect(() => { navigationGuard?.setBlocked(busy || conflict); return () => navigationGuard?.setBlocked(false); }, [navigationGuard, busy, conflict]);
  const dirty = form !== null && staffFormFingerprint(form) !== baseline;
  usePreventRemove(dirty || busy || conflict, ({ data }) => {
    if (busyRef.current || conflict) { Alert.alert("Estimate action in progress", "Wait for the result before leaving this estimate."); return; }
    Alert.alert("Discard unsaved estimate changes?", "Your current draft has not been saved.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard changes", style: "destructive", onPress: () => navigation.dispatch(data.action) }]);
  });
  function hydrate(estimate: EstimateDraft | null) {
    if (!lead.data) return;
    const next = restoreStaffForm(estimate, lead.data, catalogue.data);
    setForm(next); setBaseline(staffFormFingerprint(next)); versionRef.current = estimate?.version; setVersion(estimate?.version); setRoomId((previous) => next.rooms.some((room) => room.id === previous) ? previous : next.rooms[0]?.id ?? "");
  }
  useEffect(() => {
    if (!lead.data || saved.data === undefined) return;
    if (!form) { try { hydrate(saved.data); } catch { setError("Saved room identities could not be verified. Refresh the estimate before editing."); } }
    else if (!busyRef.current && saved.data?.version !== versionRef.current) { setConflictRefreshed(true); setConflict(true); setError("The saved estimate changed. Review the refreshed version before continuing."); }
  }, [lead.data, saved.data]);
  useEffect(() => {
    if (!catalogue.data || !form || busyRef.current) return;
    setForm((current) => current ? refreshStaffForm(current, catalogue.data!, !estimateEditable(saved.data ?? null)) : current);
  }, [catalogue.data]);
  async function refresh() { await Promise.all([saved.refetch({ throwOnError: true }), ...(canCatalogue ? [catalogue.refetch({ throwOnError: true })] : [])]); setConflictRefreshed(true); }
  function change(next: StaffEstimateForm) {
    if (busyRef.current || conflict || !canSave || !estimateEditable(saved.data ?? null)) return;
    setForm(catalogue.data ? refreshStaffForm(next, catalogue.data) : next); setNotice(""); setError("");
  }
  async function execute(work: () => Promise<EstimateDraft | null>, message: string): Promise<boolean> {
    if (busyRef.current || conflict || denied || saved.isError) return false;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await work();
      if (!activeOwner.current) return false;
      if (result) { hydrate(result); client.setQueryData(staffEstimateKey(scope, leadId), result); }
      else { const current = await getStaffEstimate(context.runtime, leadId); if (!activeOwner.current) return false; hydrate(current); client.setQueryData(staffEstimateKey(scope, leadId), current); }
      setNotice(message);
      await invalidate("estimate-decision-changed").catch(() => setNotice(`${message} Refresh to load related project updates.`));
      return true;
    } catch (cause) {
      if (!activeOwner.current) return false;
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        setDenied(true); await Promise.all([client.cancelQueries({ queryKey: staffEstimateKey(scope, leadId) }), client.cancelQueries({ queryKey: staffLeadKey(scope, leadId) })]); client.removeQueries({ queryKey: staffEstimateKey(scope, leadId) }); client.removeQueries({ queryKey: staffLeadKey(scope, leadId) });
      } else {
        setConflict(true); setConflictRefreshed(false);
        setError(cause instanceof ApiError ? `${cause.message} Refresh and review the saved version before retrying.` : "The result could not be confirmed. Your local draft is preserved. Refresh and compare the saved estimate before retrying.");
      }
      return false;
    } finally { if (activeOwner.current) { busyRef.current = false; setBusy(false); } }
  }
  async function save(submit: boolean) {
    if (!form || !canSave || !estimateEditable(saved.data ?? null) || catalogue.isError || catalogue.isFetching) return;
    if (submit && collaborative && (requirements.isPending || requirements.isError || requirements.isFetching || !requirements.data || requirements.data.requirements.some((request) => request.status === "open"))) { setError("Resolve all Client requirements and refresh their current status before submitting."); return; }
    const validation = validateStaffForm(form, submit);
    if (validation) { setError(validation); return; }
    const input = staffFormInput(form, version);
    await execute(async () => {
      const draft = await saveStaffEstimate(context.runtime, leadId, input);
      if (!activeOwner.current) return null;
      hydrate(draft); client.setQueryData(staffEstimateKey(scope, leadId), draft);
      if (!submit) return draft;
      const submitted = await submitStaffEstimate(context.runtime, leadId, draft.version!);
      return submitted;
    }, submit ? "Estimate submitted. Review the approval and email delivery status below." : "Estimate draft saved.");
  }
  if (!allowed || denied || [lead.error, saved.error].some((cause) => cause instanceof ApiError && [401, 403, 404].includes(cause.status))) return <StateView tone="denied" title="Estimate unavailable" message="This estimate is outside your current access." />;
  if (context.environment.status !== "ready") return <StateView tone="error" title="Estimate unavailable" message="Connect to the service before editing." />;
  if (lead.isPending || saved.isPending) return <BrandLoader label="Loading estimate workspace" tone="dark" />;
  if (lead.isError || saved.isError || !lead.data) return <StateView tone="error" title="Estimate could not be verified" message="Refresh before reviewing or changing this estimate." actionLabel="Refresh estimate" onAction={() => void Promise.all([lead.refetch(), saved.refetch()])} />;
  if (!form) return <StateView tone="error" title="Estimate unavailable" message={error || "The saved estimate could not be verified."} />;
  const editable = canSave && estimateEditable(saved.data ?? null) && !busy && !conflict && !saved.isFetching && !catalogue.isFetching && !catalogue.isError;
  const totals = previewEstimateTotals(form);
  const activeRoom = form.rooms.some((room) => room.id === roomId) ? roomId : form.rooms[0]?.id ?? "";
  const sourceReady = !canCatalogue || Boolean(catalogue.data && !catalogue.isError);
  const requirementsBlocked = collaborative && (requirements.isPending || requirements.isError || requirements.isFetching || !requirements.data || requirements.data.requirements.some((request) => request.status === "open"));
  const advanceWorkingVersion = (before: number, after: number) => {
    if (versionRef.current === before && after === before + 1) { versionRef.current = after; setVersion(after); }
  };
  const finalWaiting = saved.data?.estimation?.phase === "post" && (saved.data.designPlanStatus !== "approved" || saved.data.estimation.approvedDesignScopeRevision !== saved.data.estimation.designScopeRevision);
  return <EstimateTheme><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.screen}>
    <EstimateSection title={lead.data.projectName}><EstimateText>{lead.data.clientName} · {lead.data.location}</EstimateText><EstimateText>{saved.data?.estimation?.phase === "post" ? "Final post-estimate" : "Pre-estimate"} · {dirty ? "Unsaved changes" : "Saved state"}</EstimateText></EstimateSection>
    {error ? <EstimateText error>{error}</EstimateText> : null}{notice ? <EstimateText>{notice}</EstimateText> : null}
    {conflict ? <EstimateSection title="Review the saved version">
      <EstimateText>Your local draft is preserved. Current saved version: {saved.data?.version ?? "not available"}. Refresh first, then choose how to continue.</EstimateText>
      <Button label="Refresh saved estimate" disabled={busy || saved.isFetching} onPress={() => void refresh().catch(() => setError("The saved state could not be loaded. Keep your draft and retry when connected."))} />
      <Button label="Use saved estimate" variant="secondary" disabled={busy || saved.isFetching || !conflictRefreshed} onPress={() => Alert.alert("Replace local edits?", "This loads the latest saved estimate and discards your local edits.", [{ text: "Keep edits", style: "cancel" }, { text: "Use saved estimate", onPress: () => { hydrate(saved.data ?? null); setConflict(false); setError(""); } }])} />
      {estimateEditable(saved.data ?? null) ? <Button label="Keep local edits on refreshed version" variant="quiet" disabled={busy || saved.isFetching || !conflictRefreshed} onPress={() => { versionRef.current = saved.data?.version; setVersion(saved.data?.version); setForm(catalogue.data ? refreshStaffForm(form, catalogue.data) : form); setConflict(false); setError(""); }} /> : null}
    </EstimateSection> : null}
    {saved.data ? <StaffEstimateLifecycle key={`${saved.data.id}:${saved.data.version}`} estimate={saved.data} session={session} disabled={busy || conflict || dirty || saved.isFetching} execute={execute} /> : null}
    {collaborative && projectId ? <EstimateRequirementsPanel projectId={projectId} session={session} estimate={saved.data ?? null} disabled={busy || conflict || dirty || saved.isFetching} onVersionAdvance={advanceWorkingVersion} /> : null}
    <View style={styles.row}>{([["rooms", "1 Rooms & dimensions"], ["scope", "2 Select scope"], ["items", "3 Estimate items"], ["summary", "4 Generate estimate"]] as const).map(([value, label]) => <EstimateChoice key={value} label={label} selected={step === value} disabled={busy} onPress={() => setStep(value)} />)}</View>
    {!estimateEditable(saved.data ?? null) ? <EstimateText>The current estimate is read-only. Pending submissions and approved history cannot be edited.</EstimateText> : null}
    {canCatalogue ? <View style={styles.stack}><Button label="Refresh Configuration items" variant="quiet" disabled={busy || catalogue.isFetching} onPress={() => void catalogue.refetch()} />{catalogue.isError ? <EstimateText error>Current Configuration could not be loaded. Editing is paused until its source is verified.</EstimateText> : null}{catalogue.isPending ? <BrandLoader label="Loading Configuration" tone="dark" /> : null}</View> : null}
    {step === "rooms" ? <EstimateRoomSetup form={form} disabled={!editable} onChange={change} /> : null}
    {step === "scope" && catalogue.data && !catalogue.isError ? <EstimateBasketSelection form={form} catalogue={catalogue.data} disabled={!editable} onChange={change} /> : null}
    {step === "items" ? <><EstimateItemEditor form={form} activeRoomId={activeRoom} onRoomChange={setRoomId} disabled={!editable || !sourceReady} onChange={change} />{catalogue.data && !catalogue.isError ? <EstimateRecommendations form={form} catalogue={catalogue.data} roomId={activeRoom} session={session} disabled={!editable} onChange={change} /> : null}</> : null}
    {step === "summary" ? <EstimateSection title="Estimate preview">
      <EstimateText>{form.lines.filter((line) => line.included).length + form.legacyLines.filter((line) => line.included).length} included items across {form.rooms.length} rooms.</EstimateText>
      <EstimateText>Subtotal: {estimatePaise(totals?.subtotalPaise)}</EstimateText><EstimateText>GST: {estimatePaise(totals?.gstPaise)}</EstimateText><EstimateText>Total including GST: {estimatePaise(totals?.totalPaise)}</EstimateText>
      <EstimateText>These are draft calculations. Saving verifies current Configuration and stores the authoritative totals. Open the saved proposal PDF to review the generated estimate.</EstimateText>
      {form.lines.filter((line) => line.included).map((line) => <View key={line.key} style={styles.stack}><EstimateText>{line.roomName} · {line.mainLineName} · {line.quantity} {line.uomName}</EstimateText>{line.estimateNotes?.map((note, index) => <EstimateText key={index}>{note}</EstimateText>)}</View>)}
    </EstimateSection> : null}
    <View style={styles.row}>
      {step !== "summary" ? <Button label={step === "rooms" ? "Continue to scope" : step === "scope" ? "Continue to estimate items" : "Generate estimate"} disabled={busy} onPress={() => { const validation = validateStaffForm(form); if (validation) setError(validation); else setStep(step === "rooms" ? "scope" : step === "scope" ? "items" : "summary"); }} /> : null}
      {canSave && estimateEditable(saved.data ?? null) ? <Button label="Save draft" disabled={!editable || !sourceReady} loading={busy} onPress={() => void save(false)} /> : null}
      {canSave && estimateEditable(saved.data ?? null) && canPerformOperation(session, "POST /leads/:leadId/estimate/submit") ? <Button label={saved.data?.estimation?.phase === "post" ? "Submit final estimate" : "Submit pre-estimate"} disabled={!editable || !sourceReady || finalWaiting || requirementsBlocked} onPress={() => Alert.alert("Submit this estimate?", "This saves the current scope and submits it for required approval. A frozen Client submission may be published and emailed.", [{ text: "Keep editing", style: "cancel" }, { text: "Submit estimate", onPress: () => void save(true) }])} /> : null}
    </View>
    <LeadActions lead={lead.data} session={session} disabled={busy || lead.isFetching} />
    {saved.data ? <EstimateDesignPreparation estimateId={saved.data.id} session={session} {...designEstimateOptions(saved.data)} readOnly allowDeletion={false} /> : null}
  </ScrollView></EstimateTheme>;
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { ApiError } from "../../api/client";
import type { ProcurementVendorReference } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { ProcurementVendorField } from "./ProcurementVendorField";
import { procurementError, procurementRequestKey } from "./procurementPresentation";
import { VendorKpiPlaceholder } from "./VendorKpiPlaceholder";
import { createVendorSuggestion, getVendorSuggestions, sameSuggestionSource, updateVendorSuggestion, vendorSuggestionKeys, type CreateVendorSuggestionInput, type VendorSuggestion, type VendorSuggestionProject } from "./vendorSuggestionsApi";

interface Props { project: VendorSuggestionProject; onClose: () => void; returnFocusRef: RefObject<HTMLElement | null>; fallbackFocusRef: RefObject<HTMLElement | null> }
export function ProjectVendorSuggestionsPanel({ project, onClose, returnFocusRef, fallbackFocusRef }: Props) {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.vendor_suggestions.read");
  const canManage = canRead && auth.user?.role === "admin" && hasFrontendPermission(auth.authorization, "procurement.vendor_suggestions.manage");
  const client = useQueryClient();
  const id = useId();
  const [offset, setOffset] = useState(0);
  const [vendor, setVendor] = useState<ProcurementVendorReference | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<VendorSuggestion | null>(null);
  const [status, setStatus] = useState<VendorSuggestion["status"]>("suggested");
  const [vendorBusy, setVendorBusy] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  const [fieldRevision, setFieldRevision] = useState(0);
  const [fieldError, setFieldError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRequest = useRef<{ signature: string; key: string } | null>(null);
  const query = useQuery({ queryKey: vendorSuggestionKeys.page(project.projectId, offset), queryFn: ({ signal }) => getVendorSuggestions(project.projectId, offset, signal), enabled: canRead });
  const sourceChanged = Boolean(query.data && !sameSuggestionSource(query.data.project, project));
  const unavailable = !canRead || query.isError || sourceChanged;
  const accessChanged = query.error instanceof ApiError && [403, 404].includes(query.error.status);
  useEffect(() => {
    if (sourceChanged || accessChanged) void client.invalidateQueries({ queryKey: vendorSuggestionKeys.projects });
  }, [accessChanged, client, sourceChanged]);
  const dirty = editing ? note !== editing.note || status !== editing.status : Boolean(vendor || note.trim() || unresolved);
  const save = useMutation({
    mutationFn: (input: CreateVendorSuggestionInput) => editing ? updateVendorSuggestion(project.projectId, editing, { expectedVersion: editing.version, note: input.note, status }) : createVendorSuggestion(project.projectId, input),
    onSuccess: async () => { resetForm(); setNotice("Vendor suggestion saved."); await client.invalidateQueries({ queryKey: vendorSuggestionKeys.project(project.projectId) }); },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 404 || error.status === 403)) {
        setConflict(true);
        void client.invalidateQueries({ queryKey: vendorSuggestionKeys.projects });
        void client.invalidateQueries({ queryKey: vendorSuggestionKeys.project(project.projectId) });
      }
    }
  });
  function resetForm() { setVendor(null); setNote(""); setEditing(null); setStatus("suggested"); setUnresolved(false); setFieldError(""); setFieldRevision((value) => value + 1); pendingRequest.current = null; setConflict(false); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage || unavailable || query.isPending || query.isFetching || save.isPending || vendorBusy || unresolved || conflict) return;
    if (!vendor || (status === "suggested" && vendor.status !== "active")) { setFieldError("Choose an active vendor before suggesting it."); return; }
    const values = { estimateId: project.estimateId, estimateVersion: project.estimateVersion, designPlanVersion: project.designPlanVersion, vendorId: vendor.id, note: note.trim() };
    const signature = JSON.stringify(values);
    if (pendingRequest.current?.signature !== signature) pendingRequest.current = { signature, key: procurementRequestKey() };
    save.mutate({ ...values, idempotencyKey: pendingRequest.current.key });
  }
  return <ContextPanel title="Project vendor suggestions" eyebrow={project.projectName} description="Recommend saved vendors for this approved Design. Procurement chooses vendors when adding items." width="medium" className="vendor-suggestions-panel" dirty={dirty} busy={save.isPending || vendorBusy} onClose={onClose} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}
    footer={({ requestClose }) => <div className="vendor-procurement__actions"><Button variant="secondary" onClick={requestClose} disabled={save.isPending || vendorBusy}>Close</Button>{canManage ? <Button type="submit" form={`${id}-form`} busy={save.isPending} disabled={unavailable || query.isPending || query.isFetching || vendorBusy || unresolved || conflict}>{editing ? "Save changes" : "Suggest vendor"}</Button> : null}</div>}>
    <div className="vendor-procurement__stack">
      {notice ? <p role="status">{notice}</p> : null}
      {unavailable ? <InlineMessage tone="error">{!canRead ? "Your access to vendor suggestions is no longer available." : sourceChanged ? "The approved Design changed. Close this panel and reopen the project to review its current version." : procurementError(query.error, "Vendor suggestions could not be refreshed. Your draft is preserved.")}<Button variant="quiet" size="compact" onClick={() => void query.refetch()}>Refresh suggestions</Button></InlineMessage> : null}
      {query.isPending ? <PageState state="loading" message="Loading project suggestions…" /> : null}
      {!unavailable && query.data ? <section aria-label="Saved vendor suggestions" className="vendor-procurement__stack">
        <div className="vendor-procurement__heading"><h3>Saved suggestions</h3><span>{query.data.total}</span></div>
        {!query.data.items.length ? <p className="vendor-procurement__muted">No vendors suggested for this Design yet.</p> : <ul className="vendor-suggestions-list">{query.data.items.map((item) => <li key={item.id}>
          <div><strong>{item.vendor.name}</strong><small>{item.status === "withdrawn" ? "Withdrawn" : "Suggested"} by {item.suggestedBy.name} · KPI not rated yet</small>{item.vendor.status !== "active" ? <small>Vendor {item.vendor.status} · unavailable for new selection</small> : null}{item.note ? <p>{item.note}</p> : null}</div>
          {canManage ? <Button size="compact" variant="quiet" disabled={dirty || save.isPending || query.isFetching} aria-label={`Edit suggestion for ${item.vendor.name}`} onClick={() => { setEditing(item); setVendor(item.vendor); setNote(item.note); setStatus(item.status); setFieldError(""); setNotice(""); setConflict(false); save.reset(); formRef.current?.scrollIntoView?.({ block: "nearest" }); }}>Edit</Button> : null}
        </li>)}</ul>}
        {query.data.total > 20 || offset > 0 ? <nav className="vendor-procurement__pagination" aria-label="Suggestion pages"><Button size="compact" variant="secondary" disabled={!offset || query.isFetching} onClick={() => setOffset((value) => Math.max(0, value - 20))}>Previous</Button><span>{query.data.total} suggestions</span><Button size="compact" variant="secondary" disabled={offset + 20 >= query.data.total || query.isFetching} onClick={() => setOffset((value) => value + 20)}>Next</Button></nav> : null}
      </section> : null}
      {canManage ? <form id={`${id}-form`} ref={formRef} onSubmit={submit} noValidate className="vendor-procurement__stack">
        <fieldset disabled={save.isPending || vendorBusy} className="vendor-procurement__fieldset">
        <h3>{editing ? `Edit ${editing.vendor.name}` : "Suggest a vendor"}</h3>
        {editing ? <p className="vendor-procurement__muted">The vendor stays linked to this Design.</p> : <ProcurementVendorField key={fieldRevision} value={vendor} required onChange={(value) => { setVendor(value); setFieldError(""); }} error={fieldError} onBusyChange={setVendorBusy} onUnresolvedChange={setUnresolved} />}
        <Field id={`${id}-note`} label="Why suggest this vendor?" hint="Optional. Give Procurement useful context for the choice.">{(props) => <Textarea {...props} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />}</Field>
        {editing ? <Field id={`${id}-status`} label="Suggestion status">{(props) => <Select {...props} value={status} onChange={(event) => setStatus(event.target.value as VendorSuggestion["status"])}><option value="suggested">Suggested</option><option value="withdrawn">Withdrawn</option></Select>}</Field> : null}
        {fieldError && editing ? <InlineMessage tone="error">{fieldError}</InlineMessage> : null}
        {save.isError ? <InlineMessage tone="error">{procurementError(save.error, "The suggestion could not be saved. Try again.")}{conflict ? " Your draft is preserved. Review the refreshed list before starting again." : ""}</InlineMessage> : null}
        {editing || conflict ? <Button variant="quiet" size="compact" onClick={() => { resetForm(); save.reset(); }} disabled={save.isPending}>Discard draft and start again</Button> : null}
        </fieldset>
      </form> : null}
      <VendorKpiPlaceholder />
    </div>
  </ContextPanel>;
}

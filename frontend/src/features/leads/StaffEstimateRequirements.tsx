import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Select, Textarea } from "../../components/ui/Field";
import { estimateRequirementsKeys, getEstimateRequirements, resolveEstimateRequirement, type EstimateRequirement, type ResolveEstimateRequirementInput } from "../client/estimateRequirementsApi";
import { refreshEstimateCollaboration } from "./estimateCollaborationQueries";
import type { EstimateDraft } from "./leadsApi";
import "./staffEstimateCollaboration.css";

const labels: Record<EstimateRequirement["status"], string> = { open: "Open", included: "Included", declined: "Declined", superseded: "Replaced", withdrawn: "Withdrawn" };

export function StaffEstimateRequirements({ projectId, estimate, disabled = false, onVersionAdvance }: {
  projectId: string; estimate: EstimateDraft | null; disabled?: boolean; onVersionAdvance?: (before: number, after: number) => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: estimateRequirementsKeys.detail(projectId), queryFn: () => getEstimateRequirements(projectId) });
  const [draft, setDraft] = useState<{ request: EstimateRequirement; collectionVersion: number; estimateVersion: number | null; status: ResolveEstimateRequirementInput["status"]; lineItemIds: string[]; reason: string; supersededById: string } | null>(null);
  const [validation, setValidation] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const selectRef = useRef<HTMLSelectElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const command = useMutation({
    mutationFn: (value: NonNullable<typeof draft>) => resolveEstimateRequirement(projectId, value.request.id, {
      expectedRequirementsVersion: value.collectionVersion, expectedVersion: value.request.version,
      status: value.status, lineItemIds: value.status === "included" ? value.lineItemIds : [], reason: value.reason.trim(),
      ...(value.status === "superseded" ? { supersededById: value.supersededById } : {})
    }),
    onSuccess: async (detail, source) => {
      if (source.estimateVersion !== null && detail.estimateVersion !== null) onVersionAdvance?.(source.estimateVersion, detail.estimateVersion);
      queryClient.setQueryData(estimateRequirementsKeys.detail(projectId), detail);
      setDraft(null); setNotice("Client requirement resolved.");
      await refreshEstimateCollaboration(queryClient); sectionRef.current?.focus();
    },
    onError: async (error) => {
      if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) { setConflict(true); await refreshEstimateCollaboration(queryClient); }
    },
    onSettled: () => { submitting.current = false; }
  });
  if (query.isPending) return <p role="status">Loading client requirements…</p>;
  if (query.isError || !query.data) return <div role="alert"><p>Client requirements could not be verified. Refresh before submitting this estimate.</p><Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh client requirements</Button></div>;
  const detail = query.data;
  const openCount = detail.requirements.filter((item) => item.status === "open").length;
  const lines = draft ? (estimate?.lineItems ?? []).filter((line) => line.source === "configuration" && line.id && line.included && line.mainBasketId === draft.request.mainBasketId && (!draft.request.mainLineId || (line.mainLineId === draft.request.mainLineId && line.catalogueId === draft.request.mainLineId)) && (!draft.request.roomId || line.roomId === draft.request.roomId)) : [];
  const locked = disabled || query.isFetching || !detail.canResolve || command.isPending;
  return <div ref={sectionRef} tabIndex={-1} className="staff-estimate-flow" aria-label="Client estimate requests">
    <details className="staff-estimate-requests" open={openCount > 0 || undefined}><summary>Client requirements · {openCount} open · {detail.requirements.length} total</summary>
      <p>Resolve each open request against saved estimate items before submission. Save new items before linking them.</p>
      {!detail.editingAllowed ? <p role="status">{detail.editingBlockReason === "review_pending" ? "Withdraw the pending estimate review before resolving requests." : "The estimate is closed for changes. Request history remains available."}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!detail.requirements.length ? <p>No client requirements have been added.</p> : detail.requirements.map((request, index) => <article className="staff-estimate-request" key={request.id}>
        <div className="staff-estimate-flow__heading"><h3>{detail.mainBaskets.find((basket) => basket.id === request.mainBasketId)?.name ?? "Previous Main Basket"}</h3><span>{labels[request.status]}</span></div>
        <p>{request.roomId ? detail.rooms.find((room) => room.id === request.roomId)?.label ?? "Previous room" : "Whole project"} · {request.phase === "post" ? "Post-estimation" : "Pre-estimation"}</p><p>{request.text}</p>
        {request.mainLineId ? <p>Requested Main Line: {detail.mainLines?.find((line) => line.id === request.mainLineId)?.name ?? "Selected item unavailable"}</p> : null}
        {request.reason ? <p><strong>Resolution:</strong> {request.reason}</p> : null}
        {detail.canResolve && ["open", "included"].includes(request.status) ? <Button variant="secondary" disabled={locked} aria-label={`Resolve requirement ${index + 1}`} onClick={(event) => {
          triggerRef.current = event.currentTarget; setValidation(""); setConflict(false); setNotice(""); command.reset();
          setDraft({ request, collectionVersion: detail.requirementsVersion, estimateVersion: detail.estimateVersion, status: "included", lineItemIds: request.lineItemIds, reason: request.reason, supersededById: "" });
        }}>{request.status === "included" ? "Review linked items" : "Resolve request"}</Button> : null}
      </article>)}
    </details>
    {draft ? <Dialog title="Resolve client requirement" eyebrow="Estimate requirements" busy={command.isPending} onClose={() => setDraft(null)} initialFocusRef={selectRef} returnFocusRef={triggerRef} fallbackFocusRef={sectionRef}>
      <form className="ui-dialog__form" noValidate onSubmit={(event) => {
        event.preventDefault(); if (submitting.current || locked || conflict) return;
        if (draft.status === "included" && (!draft.lineItemIds.length || draft.lineItemIds.some((id) => !lines.some((line) => line.id === id)))) { setValidation("Select at least one current saved item matching this request's Main Basket, requested Main Line and room."); return; }
        if (draft.status !== "included" && !draft.reason.trim()) { setValidation("Explain how this request was resolved."); reasonRef.current?.focus(); return; }
        if (draft.status === "superseded" && !draft.supersededById) { setValidation("Select the replacement request."); return; }
        submitting.current = true; setValidation(""); command.mutate(draft);
      }}>
        <div className="ui-dialog__body"><p>{draft.request.text}</p>
          <Field id="requirement-resolution" label="Resolution">{(props) => <Select {...props} ref={selectRef} value={draft.status} disabled={locked || conflict} onChange={(event) => { setDraft({ ...draft, status: event.target.value as typeof draft.status }); setValidation(""); }}><option value="included">Included in estimate</option><option value="declined">Declined</option><option value="superseded">Replaced by another request</option></Select>}</Field>
          {draft.status === "included" ? <fieldset disabled={locked || conflict}><legend>Saved estimate items</legend>
            {!lines.length ? <p>No matching saved items. Save an included item matching this Main Basket, requested Main Line and room, then reopen this request.</p> : <ul className="staff-estimate-request__lines">{lines.map((line) => <li key={line.id}><label><input type="checkbox" checked={draft.lineItemIds.includes(line.id!)} onChange={(event) => setDraft({ ...draft, lineItemIds: event.target.checked ? [...draft.lineItemIds, line.id!] : draft.lineItemIds.filter((id) => id !== line.id) })} /><span>{line.source === "configuration" ? line.mainLineName : line.specification} · {line.roomName} · {line.quantity} {line.unit}</span></label></li>)}</ul>}
          </fieldset> : null}
          {draft.status === "superseded" ? <Field id="requirement-replacement" label="Replacement request" required>{(props) => <Select {...props} value={draft.supersededById} disabled={locked || conflict} onChange={(event) => setDraft({ ...draft, supersededById: event.target.value })}><option value="">Select a request</option>{detail.requirements.filter((request) => request.id !== draft.request.id).map((request) => <option key={request.id} value={request.id}>{request.text}</option>)}</Select>}</Field> : null}
          <Field id="requirement-resolution-reason" label={draft.status === "included" ? "Note (optional)" : "Resolution reason"} required={draft.status !== "included"}>{(props) => <Textarea {...props} ref={reasonRef} rows={3} maxLength={2000} value={draft.reason} disabled={command.isPending} onChange={(event) => { setDraft({ ...draft, reason: event.target.value }); setValidation(""); }} />}</Field>
          {validation ? <p role="alert">{validation}</p> : null}
          {command.isError ? <p role="alert">{command.error instanceof ApiError ? command.error.message : "The resolution could not be saved. Try again."}{conflict ? " Your text is preserved. Close this dialog and review the refreshed request before resolving it again." : ""}</p> : null}
        </div><div className="ui-dialog__actions"><Button variant="secondary" disabled={command.isPending} onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" busy={command.isPending} disabled={locked || conflict}>Save resolution</Button></div>
      </form>
    </Dialog> : null}
  </div>;
}

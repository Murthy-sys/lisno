import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Select, Textarea } from "../../components/ui/Field";
import { estimateWorkflowKeys } from "../estimates/estimateWorkflowApi";
import { leadKeys } from "../leads/leadsApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { clientKeys } from "./clientApi";
import {
  createEstimateRequirement,
  estimateRequirementsKeys,
  getEstimateRequirements,
  updateEstimateRequirement,
  type CreateEstimateRequirementInput,
  type EstimateRequirement,
  type EstimateRequirementsDetail,
  type UpdateEstimateRequirementInput
} from "./estimateRequirementsApi";
import "./clientEstimateRequirements.css";

interface RequestDraft {
  requirementId: string | null;
  expectedVersion: number | null;
  expectedRequirementsVersion: number;
  idempotencyKey: string;
  mainBasketId: string;
  mainLineId: string;
  roomId: string;
  text: string;
}

type RequestCommand =
  | { action: "create"; input: CreateEstimateRequirementInput }
  | { action: "update" | "withdraw"; id: string; input: UpdateEstimateRequirementInput };

const statusLabels: Record<EstimateRequirement["status"], string> = {
  open: "Awaiting estimate", included: "Included in estimate", declined: "Declined",
  superseded: "Replaced by another request", withdrawn: "Withdrawn"
};

const formatPrice = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function ClientEstimateRequirements({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const id = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const basketRef = useRef<HTMLSelectElement>(null);
  const roomRef = useRef<HTMLSelectElement>(null);
  const lineRef = useRef<HTMLSelectElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const cancelWithdrawRef = useRef<HTMLButtonElement>(null);
  const withdrawTriggerRef = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [withdrawal, setWithdrawal] = useState<{ request: EstimateRequirement; collectionVersion: number } | null>(null);
  const query = useQuery({
    queryKey: estimateRequirementsKeys.detail(projectId),
    queryFn: () => getEstimateRequirements(projectId),
    enabled: Boolean(projectId)
  });

  const mutation = useMutation({
    mutationFn: (command: RequestCommand) => command.action === "create"
      ? createEstimateRequirement(projectId, command.input)
      : updateEstimateRequirement(projectId, command.id, command.input),
    onSuccess: async (detail, command) => {
      queryClient.setQueryData(estimateRequirementsKeys.detail(projectId), detail);
      setDraft(null);
      setWithdrawal(null);
      setConflict(false);
      setFeedback(command.action === "withdraw" ? "Your request was withdrawn." : command.action === "create" ? "Your requirement was sent to the team." : "Your requirement was updated.");
      sectionRef.current?.focus();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: estimateRequirementsKeys.detail(projectId) }),
        queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.client }),
        queryClient.invalidateQueries({ queryKey: clientKeys.projects }),
        queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
        queryClient.invalidateQueries({ queryKey: leadKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["estimate-collaboration", projectId] })
      ]);
    },
    onError: async (error) => {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        await queryClient.invalidateQueries({ queryKey: estimateRequirementsKeys.detail(projectId) });
      } else if (error instanceof ApiError && error.code === "ESTIMATE_REQUIREMENT_MAIN_LINE_INVALID") {
        setErrors((current) => ({ ...current, mainLineId: "Choose an available Main Line or continue with a general request." }));
        await queryClient.invalidateQueries({ queryKey: estimateRequirementsKeys.detail(projectId) });
      } else if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        setWithdrawal(null);
        await queryClient.invalidateQueries({ queryKey: estimateRequirementsKeys.detail(projectId) });
      }
    },
    onSettled: () => { submitting.current = false; }
  });

  useEffect(() => {
    if (draft) basketRef.current?.focus();
  }, [draft?.requirementId, Boolean(draft)]);

  useEffect(() => {
    if (!mutation.isPending && mutation.error instanceof ApiError
      && mutation.error.code === "ESTIMATE_REQUIREMENT_MAIN_LINE_INVALID") lineRef.current?.focus();
  }, [mutation.isPending, mutation.error]);

  const startDraft = (detail: EstimateRequirementsDetail, request?: EstimateRequirement) => {
    if (!detail.editingAllowed || draft || mutation.isPending || (request && !request.canEdit)) return;
    setErrors({}); setFeedback(null); setConflict(false); mutation.reset();
    setDraft({
      requirementId: request?.id ?? null, expectedVersion: request?.version ?? null,
      expectedRequirementsVersion: detail.requirementsVersion, idempotencyKey: crypto.randomUUID(),
      mainBasketId: request?.mainBasketId ?? "", mainLineId: request?.mainLineId ?? "", roomId: request?.roomId ?? "", text: request?.text ?? ""
    });
  };

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const detail = query.data;
    if (!draft || !detail?.editingAllowed || query.isError || query.isFetching || conflict || submitting.current) return;
    const nextErrors: Record<string, string> = {};
    if (!detail.mainBaskets.some((basket) => basket.id === draft.mainBasketId)) nextErrors.mainBasketId = "Select an available Main Basket.";
    if (draft.mainLineId && !detail.mainLines?.some((line) => line.id === draft.mainLineId && line.mainBasketId === draft.mainBasketId)) nextErrors.mainLineId = "Choose an available Main Line or continue with a general request.";
    if (draft.roomId && !detail.rooms.some((room) => room.id === draft.roomId)) nextErrors.roomId = "Select a current room or choose the whole project.";
    if (!draft.text.trim() || draft.text.trim().length > 4000) nextErrors.text = "Describe your requirement in 1 to 4,000 characters.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      if (nextErrors.mainBasketId) basketRef.current?.focus();
      else if (nextErrors.mainLineId) lineRef.current?.focus();
      else if (nextErrors.roomId) roomRef.current?.focus();
      else textRef.current?.focus();
      return;
    }
    if (draft.requirementId && !detail.requirements.find((request) => request.id === draft.requirementId)?.canEdit) return;
    submitting.current = true;
    setFeedback(null);
    const supportsMainLines = detail.mainLines !== undefined || Boolean(draft.mainLineId)
      || selectedRequestHasLine(detail, draft.requirementId);
    const values = {
      mainBasketId: draft.mainBasketId,
      ...(supportsMainLines ? { mainLineId: draft.mainLineId || null } : {}),
      roomId: draft.roomId || null,
      text: draft.text.trim(),
      expectedRequirementsVersion: draft.expectedRequirementsVersion
    };
    mutation.mutate(draft.requirementId && draft.expectedVersion !== null
      ? { action: "update", id: draft.requirementId, input: { ...values, expectedVersion: draft.expectedVersion } }
      : { action: "create", input: { ...values, idempotencyKey: draft.idempotencyKey } });
  };

  const resumeDraft = () => {
    if (!draft || !query.data || query.isError || query.isFetching || !query.data.editingAllowed) return;
    const current = query.data.requirements.find((request) => request.id === draft.requirementId);
    if (draft.requirementId && !current?.canEdit) return;
    setDraft({ ...draft, expectedRequirementsVersion: query.data.requirementsVersion, expectedVersion: current?.version ?? null,
      ...(draft.requirementId ? {} : { idempotencyKey: crypto.randomUUID() }) });
    setConflict(false); mutation.reset(); textRef.current?.focus();
  };

  if (query.isPending) return <section className="client-requirements" aria-label="Estimate requirements"><h2>Estimate requirements</h2><p role="status">Loading your requirements…</p></section>;
  if (query.isError || !query.data) return <section className="client-requirements" aria-label="Estimate requirements"><h2>Estimate requirements</h2>
    <p role="alert">{query.error instanceof ApiError && [401, 403, 404].includes(query.error.status) ? "Requirements are unavailable for this project or your access has changed." : "We couldn't load your requirements. Refresh before making changes."}</p>
    <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh requirements</Button>
  </section>;

  const detail = query.data;
  const phaseLabel = detail.phase === "post" ? "Post-estimation" : "Pre-estimation";
  const selectedRequest = detail.requirements.find((request) => request.id === draft?.requirementId);
  const originalRequestLocked = Boolean(draft?.requirementId && !selectedRequest?.canEdit);
  const draftDisabled = mutation.isPending || !detail.editingAllowed || originalRequestLocked;
  const safePrice = detail.indicativeTotalPaise !== null && Number.isSafeInteger(detail.indicativeTotalPaise) && detail.indicativeTotalPaise >= 0;
  const availableLines = (detail.mainLines ?? []).filter((line) => line.mainBasketId === draft?.mainBasketId);
  const updateDraft = (field: "mainBasketId" | "mainLineId" | "roomId" | "text", value: string) => {
    setDraft((current) => current ? { ...current, [field]: value, ...(field === "mainBasketId" ? { mainLineId: "" } : {}) } : current);
    setErrors((current) => ({ ...current, [field]: "", ...(field === "mainBasketId" ? { mainLineId: "" } : {}) }));
  };
  const errorMessage = mutation.error instanceof ApiError && mutation.error.code === "ESTIMATE_REQUIREMENT_MAIN_LINE_INVALID"
    ? "The selected Main Line is no longer available. Your draft is preserved. Choose another item or General request."
    : mutation.error instanceof ApiError && mutation.error.status === 409
    ? "The estimate or its requests changed. Your draft is preserved. Review the latest requests below before continuing."
    : "We couldn't save this change. Your draft is preserved; please try again.";

  return <section className="client-requirements" aria-labelledby={`${id}-title`} ref={sectionRef} tabIndex={-1}>
    <header className="client-requirements__header">
      <div><p className="eyebrow">{phaseLabel}</p><h2 id={`${id}-title`}>Your estimate requirements</h2>
        <p>Select a Main Basket and describe what you need. You can also choose an available Main Line. Your team will prepare the pricing.</p></div>
      <dl className="client-requirements__price"><div><dt>Indicative total</dt><dd>{safePrice ? formatPrice.format(detail.indicativeTotalPaise! / 100) : "Awaiting estimate"}</dd></div></dl>
    </header>
    <p className="client-requirements__hint">Prices are read-only. {detail.pricingComplete ? "Review the submitted estimate below for approval." : "Your team is still preparing the estimate or pricing outstanding requests."}</p>
    {!detail.editingAllowed ? <div className="client-requirements__notice" role="status">
      <strong>{detail.editingBlockReason === "review_pending" ? "Estimate review in progress" : "Requirements are read-only"}</strong>
      <p>{detail.editingBlockReason === "review_pending" ? "Use Request changes in the submitted estimate before updating your requirements." : "The estimate is closed for changes. Your recorded requirements remain available here."}</p>
      {detail.editingBlockReason === "review_pending" ? <a href="#estimate-review-title">Review the submitted estimate</a> : null}
    </div> : null}
    {feedback ? <p role="status" className="client-requirements__notice">{feedback}</p> : null}
    {mutation.isError ? <div className="client-requirements__notice" role="alert"><p>{errorMessage}</p>
      {conflict && draft && detail.editingAllowed && !originalRequestLocked ? <Button variant="secondary" disabled={query.isFetching} onClick={resumeDraft}>Continue with refreshed requests</Button> : null}
      {conflict && !draft ? <Button variant="secondary" disabled={query.isFetching} onClick={() => { mutation.reset(); setConflict(false); }}>Review refreshed requests</Button> : null}
    </div> : null}
    {detail.editingAllowed && !draft ? <div className="client-requirements__actions">
      <Button disabled={mutation.isPending || query.isFetching || !detail.mainBaskets.length} onClick={() => startDraft(detail)}>Add requirement</Button>
      {!detail.mainBaskets.length ? <p>Your team needs to make a Main Basket available before you can add a requirement.</p> : null}
    </div> : null}
    {draft ? <form className="client-requirements__form" onSubmit={saveDraft} noValidate aria-label={draft.requirementId ? "Edit estimate requirement" : "Add estimate requirement"}>
      <h3>{draft.requirementId ? "Edit requirement" : "New requirement"}</h3>
      {originalRequestLocked ? <p role="status">This request can no longer be edited. Your unsaved text is preserved below.</p> : null}
      <div className="client-requirements__selectors">
        <Field id={`${id}-basket`} label="Main Basket" required error={errors.mainBasketId}>{(props) => <Select {...props} ref={basketRef} value={draft.mainBasketId} disabled={draftDisabled} onChange={(event) => updateDraft("mainBasketId", event.target.value)}>
          <option value="">Select a Main Basket</option>
          {draft.mainBasketId && !detail.mainBaskets.some((basket) => basket.id === draft.mainBasketId) ? <option value={draft.mainBasketId} disabled>Basket no longer available</option> : null}
          {detail.mainBaskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}
        </Select>}</Field>
        {detail.mainLines !== undefined || draft.mainLineId ? <Field id={`${id}-line`} label="Main Line (optional)" error={errors.mainLineId} hint={draft.mainLineId && !availableLines.some((line) => line.id === draft.mainLineId) ? "This selection is unavailable. Choose another item or General request to continue." : !draft.mainBasketId ? "Choose a Main Basket first." : !availableLines.length ? "No items are available to select. You can still send a general request." : "Choose an item or describe a general requirement for this basket."}>{(props) => <Select {...props} ref={lineRef} value={draft.mainLineId} disabled={draftDisabled || !draft.mainBasketId} onChange={(event) => updateDraft("mainLineId", event.target.value)}>
          <option value="">General request</option>
          {draft.mainLineId && !availableLines.some((line) => line.id === draft.mainLineId) ? <option value={draft.mainLineId} disabled>Selected item unavailable</option> : null}
          {availableLines.map((line) => <option key={line.id} value={line.id}>{line.name}{line.subBasketName ? ` · ${line.subBasketName}` : ""}</option>)}
        </Select>}</Field> : null}
        <Field id={`${id}-room`} label="Room (optional)" error={errors.roomId} hint={!detail.rooms.length ? "You can add a project-wide request before your team adds rooms." : undefined}>{(props) => <Select {...props} ref={roomRef} value={draft.roomId} disabled={draftDisabled} onChange={(event) => updateDraft("roomId", event.target.value)}>
          <option value="">Whole project</option>
          {draft.roomId && !detail.rooms.some((room) => room.id === draft.roomId) ? <option value={draft.roomId} disabled>Room no longer available</option> : null}
          {detail.rooms.map((room) => <option key={room.id} value={room.id}>{room.label}</option>)}
        </Select>}</Field>
      </div>
      <Field id={`${id}-text`} label="What would you like?" required error={errors.text} hint={`${draft.text.length.toLocaleString("en-IN")} / 4,000 characters. Describe the items, finish, or changes you need.`}>{(props) => <Textarea {...props} ref={textRef} rows={4} maxLength={4000} value={draft.text} disabled={mutation.isPending} readOnly={!detail.editingAllowed || originalRequestLocked} onChange={(event) => updateDraft("text", event.target.value)} />}</Field>
      <div className="client-requirements__actions">
        <Button type="submit" busy={mutation.isPending && mutation.variables?.action !== "withdraw"} busyLabel="Saving requirement…" disabled={draftDisabled || conflict || query.isFetching}>{draft.requirementId ? "Save requirement" : "Send requirement"}</Button>
        <Button variant="secondary" disabled={mutation.isPending} onClick={() => { setDraft(null); setErrors({}); setConflict(false); mutation.reset(); sectionRef.current?.focus(); }}>Cancel</Button>
      </div>
    </form> : null}
    <div className="client-requirements__list" aria-label="Your requests">
      {!detail.requirements.length ? <p className="client-requirements__empty">No requirements yet. Add what you would like your team to include in the estimate.</p> : detail.requirements.map((request, index) => <article key={request.id} className="client-requirements__request" aria-labelledby={`${id}-request-${index}`}>
        <div className="client-requirements__request-heading"><h3 id={`${id}-request-${index}`}>{detail.mainBaskets.find((basket) => basket.id === request.mainBasketId)?.name ?? "Basket no longer available"}</h3><span>{statusLabels[request.status]}</span></div>
        <p className="client-requirements__hint">{request.phase === "post" ? "Post-estimation" : "Pre-estimation"} · {request.roomId ? detail.rooms.find((room) => room.id === request.roomId)?.label ?? "Previous room" : "Whole project"}</p>
        {request.mainLineId ? <p className="client-requirements__hint">Requested Main Line: {detail.mainLines?.find((line) => line.id === request.mainLineId && line.mainBasketId === request.mainBasketId)?.name ?? "Selected item unavailable"}</p> : null}
        <p className="client-requirements__request-text">{request.text}</p>
        {request.reason ? <p className="client-requirements__resolution"><strong>Team response</strong> {request.reason}</p> : null}
        {request.status === "superseded" && request.supersededById ? <p className="client-requirements__hint">{detail.requirements.find((item) => item.id === request.supersededById)?.text ? `Replacement request: ${detail.requirements.find((item) => item.id === request.supersededById)!.text}` : "Your team has linked a replacement request."}</p> : null}
        {detail.editingAllowed && request.canEdit && request.status === "open" ? <div className="client-requirements__actions">
          <Button variant="secondary" disabled={Boolean(draft) || mutation.isPending || query.isFetching} onClick={() => startDraft(detail, request)} aria-label={`Edit requirement ${index + 1}`}>Edit</Button>
          <Button variant="quiet" disabled={Boolean(draft) || mutation.isPending || query.isFetching} onClick={(event) => { withdrawTriggerRef.current = event.currentTarget; setWithdrawal({ request, collectionVersion: detail.requirementsVersion }); mutation.reset(); setFeedback(null); }} aria-label={`Withdraw requirement ${index + 1}`}>Withdraw</Button>
        </div> : null}
      </article>)}
    </div>
    {withdrawal ? <Dialog title="Withdraw this requirement?" eyebrow="Estimate requirement" onClose={() => setWithdrawal(null)} busy={mutation.isPending} initialFocusRef={cancelWithdrawRef} returnFocusRef={withdrawTriggerRef} fallbackFocusRef={sectionRef}>
      <div className="ui-dialog__body"><p>{withdrawal.request.text}</p><p>Your request stays in the history. Your team will no longer treat it as an open requirement.</p></div>
      <div className="ui-dialog__actions"><Button ref={cancelWithdrawRef} variant="secondary" disabled={mutation.isPending} onClick={() => setWithdrawal(null)}>Keep requirement</Button>
        <Button busy={mutation.isPending} busyLabel="Withdrawing…" disabled={!detail.editingAllowed || query.isFetching} variant="destructive-outline" onClick={() => {
          if (submitting.current || !detail.editingAllowed) return;
          submitting.current = true;
          mutation.mutate({ action: "withdraw", id: withdrawal.request.id, input: { withdraw: true, expectedRequirementsVersion: withdrawal.collectionVersion, expectedVersion: withdrawal.request.version } });
        }}>Withdraw requirement</Button></div>
    </Dialog> : null}
  </section>;
}

function selectedRequestHasLine(detail: EstimateRequirementsDetail, requestId: string | null): boolean {
  return Boolean(requestId && detail.requirements.find((request) => request.id === requestId)?.mainLineId);
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState, type FormEvent, type RefObject } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Checkbox, Field, Input, Radio, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { procurementRequestKey } from "../procurement/procurementPresentation";
import { decideVendorBasketRequest, vendorBasketRequestKeys, type DecideVendorBasketRequestInput, type VendorBasketRequest } from "../procurement/vendorBasketRequestApi";
import { listKnowledgeBaskets, listKnowledgeSubBaskets } from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";

function normalizeName(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " "); }
function identity(value: string) { return normalizeName(value).toLowerCase(); }
function errorMessage(error: unknown, fallback: string) { return error instanceof ApiError ? error.message : fallback; }

interface Submission {
  input: DecideVendorBasketRequestInput;
  subBasketLabel?: string;
}

export function KnowledgeBasketRequestDecisionPanel({ request, decision: decisionKind, idempotencyKey, fallbackFocusRef, onClose, onDecided, onRefreshRequests }: {
  readonly request: VendorBasketRequest;
  readonly decision: "fulfill" | "reject";
  readonly idempotencyKey: string;
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onDecided: (result: VendorBasketRequest) => void;
  readonly onRefreshRequests: () => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [setup, setSetup] = useState(false);
  const [subBasketChoice, setSubBasketChoice] = useState<"new" | "existing">("new");
  const [subBasketId, setSubBasketId] = useState("");
  const [subBasketName, setSubBasketName] = useState("");
  const [mainLineName, setMainLineName] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const commandKey = useRef(idempotencyKey);
  const submitting = useRef(false);
  const [saved, setSaved] = useState<VendorBasketRequest | null>(null);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fulfill = decisionKind === "fulfill";
  const baskets = useQuery({
    queryKey: [...knowledgeQueryKeys.basketLists(), "request-approval-catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeBaskets(page), "Main Basket"),
    enabled: fulfill && !saved,
    refetchOnMount: "always"
  });
  const basket = baskets.data?.items.find((entry) => identity(entry.name) === identity(request.proposedName));
  const subBaskets = useQuery({
    queryKey: [...knowledgeQueryKeys.subBasketLists(basket?.id ?? ""), "request-approval-catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((page) => listKnowledgeSubBaskets(basket!.id, page), "Sub Basket"),
    enabled: fulfill && setup && basket?.status === "active" && !saved,
    refetchOnMount: "always"
  });
  const availableSubBaskets = subBaskets.data?.items.filter((entry) => entry.basketId === basket?.id) ?? [];
  const existingSubBasket = availableSubBaskets.find((entry) => entry.id === subBasketId);
  const existingChoice = Boolean(basket && subBasketChoice === "existing");
  const normalizedSubName = normalizeName(subBasketName);
  const normalizedMainName = normalizeName(mainLineName);
  const subError = !setup ? undefined : existingChoice
    ? !existingSubBasket ? "Select an available Sub Basket from this Main Basket." : undefined
    : !normalizedSubName || normalizedSubName.length > 240 ? "Enter a Sub Basket name between 1 and 240 characters." : undefined;
  const mainError = setup && (mainLineName !== "" && (!normalizedMainName || normalizedMainName.length > 240))
    ? "Enter a Main Line name between 1 and 240 characters, or leave it empty." : undefined;
  const catalogReady = !fulfill || (baskets.isSuccess && !baskets.isFetching && basket?.status !== "inactive"
    && (!setup || !basket || (subBaskets.isSuccess && !subBaskets.isFetching)));

  async function refreshSaved(result: VendorBasketRequest) {
    setRefreshing(true);
    const keys: (readonly unknown[])[] = [vendorBasketRequestKeys.review, vendorBasketRequestKeys.mine];
    if (result.status === "fulfilled") {
      keys.push(knowledgeQueryKeys.basketLists(), knowledgeQueryKeys.itemLists(), knowledgeQueryKeys.items(),
        knowledgeQueryKeys.mainLineLists(), knowledgeQueryKeys.contexts(), knowledgeQueryKeys.basketDeletionImpacts(), knowledgeQueryKeys.subBasketDeletionImpacts());
      if (result.basketId) keys.push(knowledgeQueryKeys.subBasketLists(result.basketId));
    }
    const outcomes = await Promise.allSettled(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }, { throwOnError: true })));
    setRefreshWarning(outcomes.some((outcome) => outcome.status === "rejected"));
    setRefreshing(false);
  }
  const mutation = useMutation({
    mutationFn: (command: Submission) => decideVendorBasketRequest(request.id, command.input),
    onSuccess: async (result) => {
      setSaved(result);
      onDecided(result);
      await refreshSaved(result);
    },
    onSettled: () => { submitting.current = false; }
  });
  const frozen = Boolean(submission) || mutation.isPending;
  const definiteFailure = mutation.error instanceof ApiError && mutation.error.status >= 400 && mutation.error.status < 500 && mutation.error.status !== 408;
  const serverFields = mutation.error instanceof ApiError ? mutation.error.fields : undefined;
  const serverSubError = serverFields?.["configuration.subBasketId"] ?? serverFields?.["configuration.subBasketName"]
    ?? serverFields?.subBasketId ?? serverFields?.subBasketName ?? (setup && !normalizedMainName ? serverFields?.name : undefined);
  const serverMainError = serverFields?.["configuration.mainLineName"] ?? serverFields?.mainLineName
    ?? (normalizedMainName ? serverFields?.name : undefined);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || saved) return;
    setAttempted(true);
    if (!submission && (!catalogReady || subError || mainError || (!fulfill && !reason.trim()))) return;
    const command: Submission = submission ?? {
      input: {
        decision: decisionKind, expectedVersion: request.version, idempotencyKey: commandKey.current,
        reason: fulfill ? null : reason.trim(),
        ...(fulfill && setup ? { configuration: {
          ...(existingChoice ? { subBasketId } : { subBasketName: normalizedSubName }),
          ...(normalizedMainName ? { mainLineName: normalizedMainName } : {})
        } } : {})
      },
      ...(fulfill && setup ? { subBasketLabel: existingChoice ? existingSubBasket?.name : normalizedSubName } : {})
    };
    submitting.current = true;
    setSubmission(command);
    mutation.mutate(command);
  }

  function editDetails() {
    setSubmission(null);
    commandKey.current = procurementRequestKey();
    mutation.reset();
    void baskets.refetch();
    if (setup && basket) void subBaskets.refetch();
  }

  const savedSubLabel = saved?.subBasketId && submission?.input.configuration
    && (!submission.input.configuration.subBasketId || submission.input.configuration.subBasketId === saved.subBasketId)
    ? submission.subBasketLabel : saved?.subBasketId;

  return <ContextPanel title={fulfill ? "Review Main Basket request" : "Reject Main Basket request"}
    eyebrow="Configuration" description={`${request.proposedName} · ${request.vendorName}`}
    onClose={onClose} busy={mutation.isPending && !saved} width="medium" className="knowledge-basket-requests__panel"
    fallbackFocusRef={fallbackFocusRef}
    dirty={!saved && Boolean(reason || setup || submission)}>
    {({ requestClose }) => saved ? <div className="knowledge-basket-requests__decision">
      <p role="status">{saved.status === "fulfilled" ? "Request approved and Configuration saved." : "Request rejected."}</p>
      {saved.status === "fulfilled" ? <>
        <dl className="knowledge-basket-requests__hierarchy">
          <div><dt>Main Basket</dt><dd>{saved.proposedName}</dd></div>
          {saved.subBasketId ? <div><dt>Sub Basket</dt><dd>{savedSubLabel}</dd></div> : null}
          {saved.mainLineId ? <div><dt>Main Line</dt><dd>{submission?.input.configuration?.mainLineName ?? saved.mainLineId} <span className="knowledge-basket-requests__draft">Draft</span></dd></div> : null}
        </dl>
        <p>Procurement can refresh the vendor form, select the approved Main Basket and Sub Basket, and finish saving the vendor.</p>
        {saved.mainLineId ? <p><a href={`/admin/configuration/estimation/items/${encodeURIComponent(saved.mainLineId)}`}>Open Main Line</a> to finish configuration before activation.</p> : null}
      </> : null}
      {refreshWarning ? <InlineMessage tone="warning" action={<Button variant="secondary" busy={refreshing} onClick={() => void refreshSaved(saved)}>Retry refresh</Button>}>Your decision was saved, but some lists could not refresh. Do not submit another approval.</InlineMessage> : null}
      <div className="knowledge-basket-requests__dialog-actions"><Button onClick={requestClose}>Done</Button></div>
    </div> : <form className="knowledge-basket-requests__decision" onSubmit={submit} noValidate>
      {fulfill ? <>
        <p>Approve the requested Main Basket. Procurement will select it for the vendor afterwards.</p>
        {baskets.isPending ? <p role="status">Checking Main Baskets…</p> : null}
        {baskets.isError ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void baskets.refetch()}>Retry Main Baskets</Button>}>{errorMessage(baskets.error, "Main Baskets could not be checked. Try again before approving.")}</InlineMessage> : null}
        {baskets.isSuccess && basket?.status === "inactive" ? <InlineMessage tone="error">The matching Main Basket is inactive. Resolve it in Configuration before approving this request.</InlineMessage> : null}
        {baskets.isSuccess && basket?.status !== "inactive" ? <p className="knowledge-basket-requests__context">{basket ? `Existing Main Basket: ${basket.name}` : `New Main Basket: ${request.proposedName}`}</p> : null}
        <label className="knowledge-basket-requests__setup-toggle"><Checkbox checked={setup} disabled={frozen} onChange={(event) => setSetup(event.target.checked)} /> Set up Sub Basket and Main Line</label>
        {setup ? <div className="knowledge-basket-requests__setup">
          {basket?.status === "active" ? <fieldset className="knowledge-basket-requests__choices" disabled={frozen}>
            <legend>Sub Basket setup</legend>
            <label><Radio name={`${id}-sub-choice`} checked={subBasketChoice === "new"} onChange={() => setSubBasketChoice("new")} /> New Sub Basket</label>
            <label><Radio name={`${id}-sub-choice`} checked={subBasketChoice === "existing"} onChange={() => setSubBasketChoice("existing")} /> Existing Sub Basket</label>
          </fieldset> : null}
          {basket?.status === "active" && subBaskets.isPending ? <p role="status">Loading Sub Baskets…</p> : null}
          {basket?.status === "active" && subBaskets.isError ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void subBaskets.refetch()}>Retry Sub Baskets</Button>}>{errorMessage(subBaskets.error, "Sub Baskets could not be checked. Your entries have been kept.")}</InlineMessage> : null}
          {existingChoice ? <Field id={`${id}-sub-id`} label="Sub Basket" required error={serverSubError ?? (attempted ? subError : undefined)}>
            {(props) => <Select {...props} value={subBasketId} disabled={frozen || !subBaskets.isSuccess} onChange={(event) => setSubBasketId(event.target.value)}>
              <option value="">Select a Sub Basket</option>
              {availableSubBaskets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </Select>}
          </Field> : <Field id={`${id}-sub-name`} label="New Sub Basket name" required error={serverSubError ?? (attempted ? subError : undefined)}>
            {(props) => <Input {...props} value={subBasketName} maxLength={240} disabled={frozen} onChange={(event) => setSubBasketName(event.target.value)} />}
          </Field>}
          {existingChoice && subBaskets.isSuccess && availableSubBaskets.length === 0 ? <p>No Sub Baskets yet. Choose New Sub Basket to add one.</p> : null}
          <Field id={`${id}-main-name`} label="Main Line name (optional)" hint="The Main Line will be saved as a draft in this Sub Basket." error={serverMainError ?? (attempted ? mainError : undefined)}>
            {(props) => <Input {...props} value={mainLineName} maxLength={240} disabled={frozen} onChange={(event) => setMainLineName(event.target.value)} />}
          </Field>
        </div> : null}
      </> : <Field id={`${id}-reason`} label="Reason" required error={serverFields?.reason ?? (attempted && !reason.trim() ? "Enter a reason for rejection." : undefined)}>
        {(props) => <Textarea {...props} value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} disabled={frozen} />}
      </Field>}
      {mutation.isError ? <InlineMessage tone="error" action={mutation.error instanceof ApiError && mutation.error.status === 409
        ? <Button variant="secondary" onClick={onRefreshRequests}>Refresh requests</Button> : undefined}>
        {errorMessage(mutation.error, "The decision could not be confirmed. Retry this decision.")}
      </InlineMessage> : null}
      {mutation.isError && submission ? <p>{definiteFailure ? "The decision was not accepted. Retry it or edit the details." : "The decision could not be confirmed. Retry uses the same submitted details and will not create duplicates."}</p> : null}
      <div className="knowledge-basket-requests__dialog-actions">
        <Button variant="secondary" disabled={mutation.isPending} onClick={requestClose}>Cancel</Button>
        {definiteFailure ? <Button variant="secondary" onClick={editDetails}>Edit details</Button> : null}
        <Button type="submit" busy={mutation.isPending} disabled={!submission && (!catalogReady || (!fulfill && !reason.trim()))}>
          {mutation.isError ? "Retry decision" : fulfill ? setup ? "Approve and save" : "Approve request" : "Reject request"}
        </Button>
      </div>
    </form>}
  </ContextPanel>;
}

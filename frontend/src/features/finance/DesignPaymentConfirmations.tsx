import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Textarea } from "../../components/ui/Field";
import { Surface } from "../../components/ui/Surface";
import { useRefreshDesignWorkflow } from "../workflow/WorkflowStageActions";
import { getDesignPaymentConfirmations, performDesignWorkflowAction, projectWorkflowKeys, type DesignPaymentConfirmation, type DesignWorkflowView } from "../workflow/projectWorkflowApi";

function useCanRecordPayment() {
  const { user, authorization } = useAuth();
  return (user?.role === "finance_head" || user?.role === "super_admin") && hasFrontendPermission(authorization, "projects.design_workflow.act");
}

function ReceiptTime({ confirmedAt }: { confirmedAt: string }) {
  return <p>Received confirmation recorded <time dateTime={confirmedAt}>{new Date(confirmedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>.</p>;
}

export function ProjectInitialPaymentStatus({ workflow }: { workflow: DesignWorkflowView }) {
  const canRecord = useCanRecordPayment();
  const [receiptRecorded, setReceiptRecorded] = useState(false);
  const payment = workflow.initialPayment;
  if (!payment) return null;
  const status = payment.confirmedAt ? "received" : payment.status;
  const received = status === "received" || receiptRecorded;
  const canConfirm = !received && canRecord && payment.canConfirm && status === "awaiting_payment";
  return <section className="workflow-payment-status" data-received={received || undefined} aria-label="Initial payment status">
    <div className="workflow-payment-status__summary">
      <div><h3>Initial payment</h3><strong className="workflow-payment-status__label">{received ? "Initial payment received" : status === "awaiting_estimate_approval" ? "Awaiting estimate approval" : status === "awaiting_payment" ? "Awaiting initial payment" : "Payment status unavailable"}</strong></div>
      <div>{payment.confirmedAt ? <ReceiptTime confirmedAt={payment.confirmedAt} /> : received ? <p role="status">Initial payment received. The Designer’s Internal Kick off countdown has started. The recorded time will appear when the workflow refreshes.</p> : <p>{status === "awaiting_estimate_approval" ? "The estimate must be approved before the initial payment can be recorded." : "Super Admin or Finance verifies the actual receipt before recording payment."} The Designer’s Internal Kick off countdown starts when initial payment is marked received.</p>}
        {payment.issue ? <p>{payment.issue}</p> : null}</div>
    </div>
    {canConfirm ? <PaymentConfirmationForm project={{ projectId: workflow.projectId, projectName: workflow.projectName, ...payment }} canConfirm={canConfirm} onRecorded={() => setReceiptRecorded(true)} /> : null}
  </section>;
}

export function DesignPaymentConfirmations() {
  const { user, authorization } = useAuth();
  const canRead = (user?.role === "finance_head" || user?.role === "super_admin") && hasFrontendPermission(authorization, "projects.design_workflow.payments.read");
  const canRecord = useCanRecordPayment();
  const query = useQuery({
    queryKey: projectWorkflowKeys.paymentConfirmations,
    queryFn: getDesignPaymentConfirmations,
    enabled: canRead,
    refetchInterval: 60_000
  });
  if (!canRead) return null;
  return <Surface as="section" className="design-payment-confirmations" aria-label="Initial payment confirmations">
    <h2>Initial payment confirmations</h2>
    <p>After estimate approval, check whether the initial payment has actually been received. Mark it received only after verifying the receipt; this starts the Designer’s Internal Kick off countdown.</p>
    {query.isError ? <div role="alert"><p>Payment confirmations could not be refreshed.</p><Button variant="secondary" onClick={() => void query.refetch()}>Reload confirmations</Button></div> : null}
    {query.isPending ? <p role="status">Loading payment confirmations…</p> : query.data
      ? query.data.length === 0 ? <p>No projects are waiting for initial-payment confirmation.</p>
        : <ul className="design-payment-confirmations__list">{query.data.map((project) => <li key={project.projectId}>
          <h3>{project.projectName}</h3>
          {project.confirmedAt ? <ReceiptTime confirmedAt={project.confirmedAt} /> : canRecord && project.canConfirm === true ? <PaymentConfirmationForm project={project} canConfirm={project.canConfirm} /> : <p>Awaiting initial payment confirmation.</p>}
        </li>)}</ul> : null}
  </Surface>;
}

function PaymentConfirmationForm({ project, canConfirm, onRecorded }: { project: DesignPaymentConfirmation; canConfirm: boolean; onRecorded?: () => void }) {
  const id = useId();
  const refresh = useRefreshDesignWorkflow();
  const [note, setNote] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [version, setVersion] = useState(project.version);
  const [recorded, setRecorded] = useState(false);
  const [conflict, setConflict] = useState(false);
  const inFlight = useRef(false);
  const stale = project.version !== version || conflict || !canConfirm || Boolean(project.confirmedAt);
  const mutation = useMutation({
    mutationFn: () => performDesignWorkflowAction({
      projectId: project.projectId, expectedVersion: version, action: "confirm_initial_payment", note: note.trim(), idempotencyKey: key
    }),
    onSuccess: async () => { setRecorded(true); onRecorded?.(); await refresh(); },
    onError: async (error) => { if (error instanceof ApiError && error.status === 409) { setConflict(true); await refresh(); } },
    onSettled: () => { inFlight.current = false; }
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || recorded || stale || !note.trim()) return;
    inFlight.current = true; mutation.mutate();
  }
  return <form className="workflow-stage-actions__form" onSubmit={submit} aria-label={`Record initial payment for ${project.projectName}`}>
    {recorded ? <p role="status">Initial payment received. The Designer’s Internal Kick off countdown has started.</p> : <>
      <Field id={`${id}-reference`} label="Payment reference / receipt note" required hint="Record the verified receipt reference. The confirmation time is recorded automatically.">{(props) => <Textarea {...props} value={note} maxLength={1000} rows={2} onChange={(event) => setNote(event.target.value)} disabled={mutation.isPending || stale} />}</Field>
      {stale ? <div role="alert"><p>The payment or workflow status changed. Review the latest status before saving. Your receipt note has been kept.</p>{project.version !== version && canConfirm && !project.confirmedAt ? <Button variant="secondary" disabled={mutation.isPending} onClick={() => { setVersion(project.version); setConflict(false); setKey(crypto.randomUUID()); mutation.reset(); }}>Use latest status</Button> : <Button variant="secondary" disabled={mutation.isPending} onClick={() => void refresh()}>Refresh payment status</Button>}</div> : null}
      {mutation.isError ? <p role="alert">{mutation.error instanceof Error ? mutation.error.message : "The confirmation could not be saved."}</p> : null}
      <div className="workflow-stage-actions__buttons"><Button type="submit" busy={mutation.isPending} busyLabel="Recording payment…" disabled={!note.trim() || stale}>Mark initial payment received</Button></div>
    </>}
  </form>;
}

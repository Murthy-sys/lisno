import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { procurementError } from "../procurement/procurementPresentation";
import { executionApi, executionKeys, type ExecutionPolicy } from "./executionApi";

export function ExecutionPolicyPanel({ projectId, onClose, onDirty, onBusy }: { projectId: string; onClose: () => void; onDirty?: (dirty: boolean) => void; onBusy?: (busy: boolean) => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: executionKeys.policy(projectId), queryFn: ({ signal }) => executionApi.policy(projectId,signal) });
  const [draft,setDraft] = useState<ExecutionPolicy | null>(null);
  const [reason,setReason] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const receipt = useRef({ signature: "", key: "" });
  const current = draft ?? query.data;
  const save = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error("Load the reporting schedule first.");
      const { projectId: _projectId, version, ...policy } = current;
      const input = { ...policy, expectedVersion: version, reason: reason.trim() };
      const signature = JSON.stringify(input);
      if (receipt.current.signature !== signature) receipt.current = { signature, key: crypto.randomUUID() };
      return executionApi.savePolicy(projectId,{ ...input, idempotencyKey: receipt.current.key });
    },
    onSuccess: async policy => { queryClient.setQueryData(executionKeys.policy(projectId),policy); setDraft(null); setReason(""); setNotice("Reporting schedule saved. Existing daily cutoffs remain unchanged."); await queryClient.invalidateQueries({ queryKey: executionKeys.all }); }
  });
  useEffect(() => { onDirty?.(Boolean(draft || reason)); }, [draft, reason, onDirty]);
  useEffect(() => { onBusy?.(save.isPending); }, [save.isPending, onBusy]);
  useEffect(() => () => { onDirty?.(false); onBusy?.(false); }, [onDirty, onBusy]);
  function edit(key: keyof ExecutionPolicy, value: string) { if (current) { setDraft({ ...current, [key]: value }); setNotice(""); } }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!current || !reason.trim()) return setError("Enter a reason for this schedule change.");
    if (!(current.reminderTime < current.deadlineTime && current.deadlineTime < current.escalationTime)) return setError("Reminder must be before the update deadline, and escalation must be after it.");
    setError(""); save.mutate();
  }
  const conflict = save.error instanceof ApiError && save.error.status === 409;
  return <ContextPanel title="Reporting schedule" eyebrow="Project execution" width="medium" dirty={Boolean(draft || reason)} busy={save.isPending} onClose={onClose}>
    {query.isPending ? <PageState state="loading" message="Loading reporting schedule…" /> : query.isError ? <PageState state="error" message={procurementError(query.error,"The reporting schedule could not be loaded.")} action={{ label: "Try again", onAction: () => void query.refetch() }} /> : current ? <form className="execution__form" aria-label="Project reporting schedule" onSubmit={submit}><p className="execution__muted">Changes apply prospectively. Recorded report deadlines and missed updates remain in the history.</p><fieldset disabled={save.isPending}>
      <Field id="execution-timezone" label="Timezone" required>{props => <Input {...props} value={current.timezone} onChange={event => edit("timezone",event.target.value)} />}</Field>
      <div className="execution__form-row"><Field id="execution-reminder" label="Daily reminder" required>{props => <Input {...props} type="time" value={current.reminderTime} onChange={event => edit("reminderTime",event.target.value)} />}</Field><Field id="execution-deadline" label="Daily update deadline" required>{props => <Input {...props} type="time" value={current.deadlineTime} onChange={event => edit("deadlineTime",event.target.value)} />}</Field></div>
      <div className="execution__form-row"><Field id="execution-escalation" label="Daily escalation" required>{props => <Input {...props} type="time" value={current.escalationTime} onChange={event => edit("escalationTime",event.target.value)} />}</Field><Field id="execution-effective" label="Effective from" required>{props => <Input {...props} type="date" value={current.effectiveDate} onChange={event => edit("effectiveDate",event.target.value)} />}</Field></div>
      <Field id="execution-policy-reason" label="Reason for change" required>{props => <Textarea {...props} rows={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} />}</Field>
      <Button type="submit" busy={save.isPending}>Save reporting schedule</Button>
    </fieldset>{error ? <InlineMessage tone="error">{error}</InlineMessage> : null}{save.isError ? <InlineMessage tone="error">{procurementError(save.error,"Schedule could not be saved.")}{conflict ? <><p>Your entered values are preserved. Review the latest schedule before retrying.</p><Button size="compact" variant="secondary" onClick={async () => { const latest = await query.refetch(); if (latest.data) { setDraft({ ...current, version: latest.data.version }); save.reset(); setNotice(`Latest saved schedule: ${latest.data.reminderTime} reminder, ${latest.data.deadlineTime} deadline, ${latest.data.escalationTime} escalation (${latest.data.timezone}). Review your changes and save again.`); } }}>Review latest version</Button></> : null}</InlineMessage> : null}{notice ? <p role="status" className="execution__notice">{notice}</p> : null}</form> : null}
  </ContextPanel>;
}

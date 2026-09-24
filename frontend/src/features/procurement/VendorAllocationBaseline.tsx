import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PanelSection } from "../../components/ui/PanelSection";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { ProcurementVendorBaselineInput, ProcurementVendorBaselineRow } from "../ai-estimator-knowledge/knowledgeTypes";
import { completeVendorBaseline, getVendorBaseline } from "./vendorProfileApi";
import { procurementError, procurementRequestKey, rupeesToPaise } from "./procurementPresentation";
import { MAX_PROCUREMENT_ITEM_PRICE_PAISE, projectProcurementKeys } from "./projectProcurementApi";

export function VendorAllocationBaseline({ vendorId, canUpdate, disabled, onBusyChange, onDirtyChange }: { vendorId: string; canUpdate: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void; onDirtyChange: (dirty: boolean) => void }) {
  const id = useId();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ProcurementVendorBaselineRow | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const command = useRef<{ row: ProcurementVendorBaselineRow; input: ProcurementVendorBaselineInput } | null>(null);
  const query = useQuery({ queryKey: [...knowledgeQueryKeys.vendorBaseline(vendorId), offset], queryFn: () => getVendorBaseline(vendorId, offset), enabled: open, gcTime: 0 });
  const mutation = useMutation({ mutationFn: () => completeVendorBaseline(vendorId, command.current!.row.itemId, command.current!.input), onSuccess: async (result) => {
    setSelected(null); command.current = null; setNotice("Historical allocation recorded. This correction does not create new work.");
    await Promise.all([client.invalidateQueries({ queryKey: knowledgeQueryKeys.vendorBaseline(vendorId) }), client.invalidateQueries({ queryKey: projectProcurementKeys.lists(result.projectId) }), client.invalidateQueries({ queryKey: knowledgeQueryKeys.vendorDetail(vendorId), exact: true })]);
  } });
  useEffect(() => { onBusyChange(mutation.isPending); return () => onBusyChange(false); }, [mutation.isPending, onBusyChange]);
  useEffect(() => { onDirtyChange(Boolean(selected)); return () => onDirtyChange(false); }, [selected, onDirtyChange]);
  const uncertain = mutation.isError && (!(mutation.error instanceof ApiError) || mutation.error.status >= 500 || mutation.error.status < 400 || mutation.error.status === 408);
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  function submit() {
    if (!selected || mutation.isPending || disabled || conflict) return;
    if (!uncertain) {
      const value = rupeesToPaise(amount);
      if (value === null || value > MAX_PROCUREMENT_ITEM_PRICE_PAISE || !reason.trim()) { setError("Enter a positive amount with up to two decimals and a correction reason."); return; }
      command.current = { row: selected, input: { expectedVersion: selected.version, allocatedWorkPaise: value, reason: reason.trim(), idempotencyKey: procurementRequestKey() } };
    }
    setError(""); mutation.mutate();
  }
  return <PanelSection className="vendor-profile__section vendor-profile__section--baseline" icon={<History aria-hidden="true" />} title="Historical allocation correction">
    <p className="vendor-procurement__muted">Record missing amounts for existing vendor work only. New work must use the project procurement flow. Factual historical totals may exceed the unverified vendor limit and will block further increases.</p>
    {!open ? <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>Review missing historical allocations</Button> : <>
      {query.isPending ? <p role="status">Loading historical allocations…</p> : query.isError ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry historical allocations</Button>}>{procurementError(query.error, "Historical allocations could not be loaded.")}</InlineMessage> : !query.data.items.length ? <p>No eligible historical allocations are missing in this view.</p> : <ul className="vendor-profile__baseline-list">{query.data.items.map((row) => <li key={row.itemId}><div><strong>{row.projectName}: {row.itemName}</strong><small>{row.brand} · Item {row.itemId} · Project {row.projectId}</small><span>Not recorded</span></div>{canUpdate ? <Button variant="secondary" size="compact" disabled={disabled || mutation.isPending || Boolean(selected)} onClick={() => { setSelected(row); setAmount(""); setReason(""); mutation.reset(); command.current = null; setError(""); }}>Record historical amount</Button> : null}</li>)}</ul>}
      {query.data && (query.data.total > 20 || offset > 0) ? <nav aria-label="Historical allocation pages" className="vendor-procurement__pagination"><Button variant="secondary" disabled={Boolean(selected) || query.isFetching || !offset} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</Button><span>{query.data.total} missing amounts</span><Button variant="secondary" disabled={Boolean(selected) || query.isFetching || offset + 20 >= query.data.total} onClick={() => setOffset(offset + 20)}>Next</Button></nav> : null}
      {selected ? <div role="group" aria-label={`Correct historical amount for ${selected.itemName}`} className="vendor-profile__correction">
        <p><strong>{selected.itemName}</strong> in {selected.projectName}</p>
        <Field id={`${id}-amount`} label="Historical allocated work (INR)" required hint="Total committed value including applicable tax. Unit price remains unchanged.">{(props) => <Input {...props} inputMode="decimal" value={amount} disabled={mutation.isPending || uncertain || conflict || disabled} onChange={(event) => setAmount(event.target.value)} />}</Field>
        <Field id={`${id}-reason`} label="Historical correction reason" required>{(props) => <Textarea {...props} value={reason} maxLength={2000} disabled={mutation.isPending || uncertain || conflict || disabled} onChange={(event) => setReason(event.target.value)} />}</Field>
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
        {mutation.isError ? <InlineMessage tone="error">{procurementError(mutation.error, "The correction response was not received.")}{uncertain ? " Retry the same correction to confirm its result." : ""}</InlineMessage> : null}
        <div className="vendor-profile__inline-actions"><Button disabled={mutation.isPending || disabled || uncertain} variant="secondary" onClick={() => { setSelected(null); command.current = null; mutation.reset(); void query.refetch(); }}>Cancel correction</Button><Button disabled={disabled || conflict} busy={mutation.isPending} onClick={submit}>{uncertain ? "Retry same correction" : "Record historical amount"}</Button></div>
        {conflict ? <Button variant="secondary" onClick={() => { setSelected(null); command.current = null; mutation.reset(); void query.refetch(); }}>Reload eligible historical items</Button> : null}
      </div> : null}
    </>}
    {notice ? <p role="status">{notice}</p> : null}
  </PanelSection>;
}

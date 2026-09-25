import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { View } from "react-native";
import type { ProcurementVendorBaselineInput, ProcurementVendorBaselinePage, ProcurementVendorBaselineResult, ProcurementVendorBaselineRow } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field, StateView } from "../../ui/primitives";
import { createIdempotencyKey, parseInrToPaise } from "../finance/money";
import type { KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeCard, KnowledgeModal, KnowledgeText, knowledgeStyles as s } from "./knowledgeUi";
import { catalogError, closeCatalogDraft } from "./knowledgeCatalogForms";

interface Props { readonly context: KnowledgeMobileContext; readonly vendorId: string; readonly canUpdate: boolean; readonly onClose: () => void }
export function KnowledgeVendorBaseline(props: Props) {
  return <VendorBaselineContent key={`${props.context.scopeKey}:${props.vendorId}`} {...props} />;
}
function VendorBaselineContent({ context, vendorId, canUpdate, onClose }: Props) {
  const runtime = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ProcurementVendorBaselineRow | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const command = useRef<{ itemId: string; projectId: string; input: ProcurementVendorBaselineInput } | null>(null);
  const path = `/admin/ai-estimator-knowledge/vendors/${encodeURIComponent(vendorId)}/allocation-baseline`;
  const query = useQuery({ queryKey: context.key("vendor-baseline", vendorId, offset), queryFn: ({ signal }) => runtime.runtime.api.authenticated.get<ProcurementVendorBaselinePage>(`${path}?limit=20&offset=${offset}`, { signal }), enabled: context.ready && context.canRead, gcTime: 0 });
  const mutation = useMutation({ mutationFn: async () => {
    if (!context.ready || !context.canRead || !canUpdate || !command.current) throw new Error("Choose an eligible historical allocation first.");
    const submitted = command.current;
    const result = await runtime.runtime.api.authenticated.post<ProcurementVendorBaselineResult>(`${path}/${encodeURIComponent(submitted.itemId)}`, submitted.input);
    if (result.itemId !== submitted.itemId || result.projectId !== submitted.projectId || result.vendorId !== vendorId || result.allocatedWorkPaise !== submitted.input.allocatedWorkPaise) throw new Error("The historical correction could not be confirmed.");
    return result;
  }, retry: false, onSuccess: async () => {
    setSelected(null); command.current = null; setNotice("Historical allocation recorded. This correction does not create new work.");
    // The correction has already committed. A refresh failure must not turn it into
    // an uncertain mutation with no retry command left to confirm.
    const refreshed = await Promise.allSettled([context.refresh(), invalidate("procurement-changed"), query.refetch()]);
    if (refreshed.some(result => result.status === "rejected")) setNotice("Historical allocation recorded. Some views could not refresh; reload them to see the correction.");
  } });
  const uncertain = mutation.isError && (!(mutation.error instanceof ApiError) || mutation.error.status >= 500 || mutation.error.status < 400 || mutation.error.status === 408);
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  function cancel() { setSelected(null); command.current = null; mutation.reset(); setError(""); void query.refetch(); }
  function submit() {
    if (!selected || !context.ready || !context.canRead || !canUpdate || mutation.isPending || conflict) return;
    if (!uncertain) {
      const value = parseInrToPaise(amount);
      if (value === null || value > 9_000_000_000_000 || !reason.trim()) { setError("Enter a positive amount with up to two decimal places and a correction reason."); return; }
      command.current = { itemId: selected.itemId, projectId: selected.projectId, input: { expectedVersion: selected.version, allocatedWorkPaise: value, reason: reason.trim(), idempotencyKey: createIdempotencyKey() } };
    }
    setError(""); mutation.mutate();
  }
  if (!context.canRead) return <KnowledgeModal title="Historical allocation correction" onClose={onClose}><KnowledgeText>Your current access does not allow historical allocations.</KnowledgeText></KnowledgeModal>;
  return <KnowledgeModal title="Historical allocation correction" busy={mutation.isPending || uncertain} onClose={() => closeCatalogDraft(Boolean(selected), onClose)}>
    <KnowledgeText>Record missing amounts for existing vendor work only. New work uses project procurement. Historical totals may exceed the unverified vendor limit and block further increases.</KnowledgeText>
    {query.isPending ? <KnowledgeText>Loading historical allocations…</KnowledgeText> : null}
    {query.isError ? <StateView title="Historical allocations unavailable" message={catalogError(query.error)} actionLabel="Retry historical allocations" onAction={() => void query.refetch()} /> : null}
    {query.data?.items.map(row => <KnowledgeCard key={row.itemId} title={`${row.projectName}: ${row.itemName}`}>
      <KnowledgeText>{row.brand} · Not recorded</KnowledgeText>
      {canUpdate ? <Button label={`Record historical amount for ${row.itemName}`} variant="secondary" disabled={!context.ready || query.isFetching || query.isError || Boolean(selected) || mutation.isPending} onPress={() => { setSelected(row); setAmount(""); setReason(""); command.current = null; mutation.reset(); setError(""); setNotice(""); }} /> : null}
    </KnowledgeCard>)}
    {query.isSuccess && !query.data.items.length ? <KnowledgeText>No eligible historical allocations are missing in this view.</KnowledgeText> : null}
    {query.data && (query.data.total > 20 || offset > 0) ? <View style={s.row}><Button label="Previous historical page" variant="secondary" disabled={Boolean(selected) || query.isFetching || offset === 0} onPress={() => setOffset(current => Math.max(0, current - 20))} /><KnowledgeText>{query.data.total} missing amounts</KnowledgeText><Button label="Next historical page" variant="secondary" disabled={Boolean(selected) || query.isFetching || offset + 20 >= query.data.total} onPress={() => setOffset(current => current + 20)} /></View> : null}
    {selected ? <KnowledgeCard title={`Correct ${selected.itemName}`}>
      <Field label="Historical allocated work (INR)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={64} editable={context.ready && canUpdate && !mutation.isPending && !uncertain && !conflict} />
      <KnowledgeText>Total committed value including applicable tax. Unit price remains unchanged.</KnowledgeText>
      <Field label="Historical correction reason" value={reason} onChangeText={setReason} multiline maxLength={2000} editable={context.ready && canUpdate && !mutation.isPending && !uncertain && !conflict} />
      {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
      {mutation.isError ? <KnowledgeText error>{catalogError(mutation.error)}{uncertain ? " Retry the same correction to confirm its result." : ""}</KnowledgeText> : null}
      <View style={s.row}><Button label="Cancel correction" variant="secondary" disabled={mutation.isPending || uncertain} onPress={() => closeCatalogDraft(Boolean(amount || reason), cancel)} /><Button label={uncertain ? "Retry same correction" : "Record historical amount"} loading={mutation.isPending} disabled={!context.ready || !canUpdate || conflict} onPress={submit} /></View>
      {conflict ? <Button label="Reload eligible historical items" onPress={cancel} /> : null}
    </KnowledgeCard> : null}
    {notice ? <KnowledgeText>{notice}</KnowledgeText> : null}
  </KnowledgeModal>;
}

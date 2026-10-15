import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { pickDocument, releaseSelectedAsset, type SelectedAsset } from "../../platform/files";
import { Button, Field, StateView } from "../../ui/primitives";
import { createIdempotencyKey, parseInrToPaise } from "../finance/money";
import { extractRecords, isRecord, recordId, recordSubtitle, recordTitle } from "../workspace/recordPresentation";
import { Choice, CommandFeedback, p, Panel, useProcurementCommand, useProcurementContext, useProcurementFormGuard, type ProcurementContext } from "./procurementNative";
const RECEIPT_POLICY = { acceptedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], maxBytes: 25 * 1024 * 1024 } as const;
function sourceKey(record: Record<string, unknown>): string | null { const source = record.estimateSource; return isRecord(source) && typeof source.sourceLineItemKey === "string" ? source.sourceLineItemKey : typeof record.sourceLineItemKey === "string" ? record.sourceLineItemKey : null; }
export function ProcurementProject({ projectId, data, session, onRefresh, procurementContext }: { readonly projectId: string; readonly data: unknown; readonly session: AuthenticatedSession; readonly onRefresh: () => void; readonly procurementContext?: ProcurementContext }) {
  const ownContext = useProcurementContext(session); const c = procurementContext ?? ownContext; const records = extractRecords(data); const canPost = c.can("POST /procurement/projects/:projectId/expenses");
  const [selected, setSelected] = useState<string | null>(null); const [amount, setAmount] = useState(""); const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)); const [description, setDescription] = useState(""); const [vendor, setVendor] = useState(""); const [reference, setReference] = useState(""); const [receipt, setReceipt] = useState<SelectedAsset | null>(null); const [progress, setProgress] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const alive = useRef(true); const pickerVersion = useRef(0); const pickerActive = useRef(false); const selectedAsset = useRef<SelectedAsset | null>(null);
  const activeUploads = useRef(new Set<SelectedAsset>()); const deferredRelease = useRef(new Set<SelectedAsset>()); const released = useRef(new WeakSet<SelectedAsset>());
  function release(asset: SelectedAsset | null) {
    if (!asset || released.current.has(asset)) return;
    if (activeUploads.current.has(asset)) { deferredRelease.current.add(asset); return; }
    deferredRelease.current.delete(asset); released.current.add(asset);
    void releaseSelectedAsset(asset).catch(() => undefined);
  }
  function replaceReceipt(asset: SelectedAsset | null) {
    const previous = selectedAsset.current; selectedAsset.current = asset; setReceipt(asset);
    if (previous !== asset) release(previous);
  }
  function clearDraft() {
    pickerVersion.current += 1; pickerActive.current = false; setPicking(false);
    setSelected(null); setAmount(""); setDescription(""); setVendor(""); setReference(""); replaceReceipt(null); setProgress(null);
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; pickerVersion.current += 1; release(selectedAsset.current); selectedAsset.current = null; }; }, []);
  const command = useProcurementCommand(async () => { await c.refresh(); onRefresh(); });
  useEffect(() => { if (!canPost || command.accessLost) clearDraft(); }, [canPost, command.accessLost]);
  const record = records.find(value => sourceKey(value) === selected);
  useProcurementFormGuard(c, Boolean(selected && (amount || description || vendor || reference || receipt || picking)), command.pending || command.uncertain);
  const choose = async () => {
    if (command.locked || pickerActive.current) return;
    const version = ++pickerVersion.current; pickerActive.current = true; setPicking(true);
    try {
      const result = await pickDocument(RECEIPT_POLICY);
      if (result.status === "selected") {
        if (!alive.current || version !== pickerVersion.current) release(result.asset);
        else replaceReceipt(result.asset);
      }
    } catch (error) { if (alive.current && version === pickerVersion.current) command.validation(error instanceof Error ? error.message : "The receipt could not be selected."); }
    finally { if (alive.current && version === pickerVersion.current) { pickerActive.current = false; setPicking(false); } }
  };
  const submit = () => {
    if (command.locked || pickerActive.current) return;
    const amountPaise = parseInrToPaise(amount); if (!canPost || !record || !selected || !amountPaise || !receipt || !description.trim()) { command.validation("Choose an approved item and receipt, then enter a positive amount and description."); return; }
    const instant = new Date(`${date}T00:00:00.000Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) { command.validation("Enter a valid incurred date as YYYY-MM-DD."); return; }
    const asset = receipt;
    const input = { path: `/procurement/projects/${encodeURIComponent(projectId)}/expenses`, fileUri: asset.uri, fileName: asset.name, mimeType: asset.mimeType, fieldName: "receipt", maxBytes: RECEIPT_POLICY.maxBytes, parameters: { sourceLineItemKey: selected, amountPaise: String(amountPaise), incurredAt: instant.toISOString(), description: description.trim(), ...(vendor.trim() ? { vendor: vendor.trim() } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}), idempotencyKey: createIdempotencyKey() }, onProgress: (value: { fraction: number | null }) => { if (alive.current) setProgress(value.fraction); } };
    void command.execute(async () => {
      activeUploads.current.add(asset);
      try { return await c.transfers.upload(input).result; }
      finally { activeUploads.current.delete(asset); if (deferredRelease.current.has(asset)) release(asset); }
    }, clearDraft);
  };
  if (command.accessLost) return <StateView title="Procurement access changed" message="Reload the project before recording expenses." tone="denied" />;
  return <View style={p.stack}><Text accessibilityRole="header" style={p.heading}>Approved procurement items</Text><Text style={p.copy}>Every cost stays linked to its approved estimate source.</Text>{!records.length ? <StateView title="No approved items" message="Approved estimate items appear when this project is ready for procurement." /> : records.map((value, index) => <View key={recordId(value) ?? `item-${index}`} style={p.stack}><Choice radio label={recordTitle(value, index)} checked={selected === sourceKey(value)} disabled={!canPost || !sourceKey(value) || command.locked} onPress={() => c.navigate(() => { clearDraft(); setSelected(sourceKey(value)); })} />{recordSubtitle(value) ? <Text style={p.copy}>{recordSubtitle(value)}</Text> : null}</View>)}{canPost && selected ? record ? <Panel title={`Record cost for ${recordTitle(record, 0)}`}><Field label="Amount (INR)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!command.locked} /><Field label="Incurred date (YYYY-MM-DD)" value={date} onChangeText={setDate} editable={!command.locked} /><Field label="Description" value={description} onChangeText={setDescription} multiline maxLength={1000} editable={!command.locked} /><Field label="Vendor (optional)" value={vendor} onChangeText={setVendor} maxLength={200} editable={!command.locked} /><Field label="Reference (optional)" value={reference} onChangeText={setReference} maxLength={200} editable={!command.locked} /><Button label={receipt ? `Receipt: ${receipt.name}` : "Choose receipt"} variant="secondary" disabled={command.locked || picking} loading={picking} onPress={() => void choose()} />{progress !== null ? <Text accessibilityLiveRegion="polite" style={p.copy}>{progress >= 1 ? "Upload complete. Recording cost…" : `Uploading ${Math.round(progress * 100)}%`}</Text> : null}<View style={p.row}><Button label="Cancel cost entry" variant="quiet" disabled={command.pending || command.uncertain} onPress={() => c.navigate(clearDraft)} /><Button label="Record cost" disabled={command.locked || picking} loading={command.pending} onPress={submit} /></View></Panel> : <StateView title="Approved source changed" message="Reload before recording a cost for this item." tone="error" /> : null}<CommandFeedback command={command} /><Button label="Refresh procurement" variant="secondary" disabled={command.pending || command.uncertain} onPress={onRefresh} /></View>;
}

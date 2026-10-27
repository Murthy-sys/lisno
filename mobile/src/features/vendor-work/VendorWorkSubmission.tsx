import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { Button, Field } from "../../ui/primitives";
import { createIdempotencyKey } from "../finance/money";
import type { ExecutionWork } from "../execution/executionTypes";
import { AccessLost, CommandFeedback, p, Panel, QueryState, ScopeMismatch, unavailable, useDeliveryCommand, useDeliveryGuard, type DeliveryContext } from "../execution/executionNative";
export function VendorWorkSubmission({ context: c, work }: { context: DeliveryContext; work: ExecutionWork }) {
  const allowed = work.canSubmitToClient && c.can("POST /vendor/work/:assignmentId/submit") && c.can("GET /vendor/work/:assignmentId");
  const query = useQuery({ queryKey: c.key("vendor-task", work.id), queryFn: ({ signal }) => c.vendor.detail(work.id, signal), enabled: allowed && c.ready, retry: false });
  const [note, setNote] = useState(""); const [version, setVersion] = useState<number | null>(null);
  const command = useDeliveryCommand(async () => { await Promise.all([query.refetch(), c.refresh()]); }); useDeliveryGuard(c, Boolean(note), command.locked);
  if (command.accessLost || unavailable(query.error)) return <AccessLost title="Client submission unavailable" />;
  if (!allowed) return command.locked || command.error || note ? <Panel title="Client submission"><Text style={p.copy}>The current work is no longer available for a new Client submission.</Text><CommandFeedback command={command} /></Panel> : null;
  const data = !query.isError && query.data?.id === work.id && query.data.projectId === work.projectId ? query.data : null;
  const stale = Boolean(data && version !== null && version !== data.version);
  function submit() {
    if (!data || c.locked || stale || !note.trim()) return;
    const body = { expectedVersion: version ?? data.version, idempotencyKey: createIdempotencyKey(), note: note.trim() };
    void command.execute(async () => { const saved = await c.vendor.submit(work.id, body); if (saved.projectId !== work.projectId || saved.assignmentId !== work.id) throw new Error("The review response does not match this work."); return saved; }, () => { setNote(""); setVersion(null); });
  }
  return <Panel title="Send verified work to Client"><Text style={p.copy}>The Project Manager has verified this Main Line. The Client makes a separate completion decision.</Text><QueryState title="Client submission" query={query} />{query.data && !query.isError && !data ? <ScopeMismatch /> : null}{data ? <><Field label="Note for Client" value={note} editable={!c.locked} multiline maxLength={2000} onChangeText={value => { setVersion(current => current ?? data.version); setNote(value); }} />{stale ? <Text style={p.error}>This work changed. Discard your note and review the current version.</Text> : null}<Button label="Send verified work to Client" disabled={c.locked || stale || !note.trim() || query.isFetching} onPress={submit} /><Button label="Discard Client note" variant="quiet" disabled={command.pending || command.uncertain} onPress={() => { setNote(""); setVersion(null); }} /></> : null}<CommandFeedback command={command} /></Panel>;
}

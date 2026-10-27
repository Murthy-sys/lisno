import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { Button, Field } from "../../ui/primitives";
import { KnowledgeSelect } from "../knowledge/knowledgeUi";
import { createIdempotencyKey } from "../finance/money";
import { VendorApprovedOrder } from "../vendor-work/VendorApprovedOrder";
import { VendorWorkSubmission } from "../vendor-work/VendorWorkSubmission";
import { WorkEvidence } from "../vendor-work/WorkEvidence";
import { actionLabels, buildExecutionCommand, makeDraft, type ExecutionDraft } from "./executionModel";
import type { ExecutionAction, ExecutionWork } from "./executionTypes";
import { AccessLost, CommandFeedback, dateTime, label, p, Pager, Panel, QueryState, ScopeMismatch, unavailable, useDeliveryCommand, useDeliveryGuard, type DeliveryContext } from "./executionNative";

export function ExecutionDetailPanel({ context: c, assignmentId, expectedProjectId, vendor = false }: { context: DeliveryContext; assignmentId: string; expectedProjectId?: string; vendor?: boolean }) {
  const canRead = c.can("GET /execution/work/:assignmentId");
  const query = useQuery({ queryKey: c.key("work", assignmentId), queryFn: ({ signal }) => c.execution.detail(assignmentId, signal), enabled: canRead && c.ready, retry: false, refetchInterval: state => state.state.error ? false : 15_000, refetchIntervalInBackground: false });
  const command = useDeliveryCommand(async () => { await Promise.all([query.refetch(), c.refresh()]); });
  const [draft, setDraft] = useState<ExecutionDraft | null>(null); const [history, setHistory] = useState(false); const [order, setOrder] = useState(false);
  useDeliveryGuard(c, Boolean(draft), command.locked);
  if (!canRead || unavailable(query.error) || command.accessLost) return <AccessLost title="Assignment unavailable" />;
  const work = query.data?.id === assignmentId && (!expectedProjectId || query.data.projectId === expectedProjectId) ? query.data : null;
  const canCommand = c.can(vendor ? "POST /vendor/work/:assignmentId/execution" : "POST /projects/:projectId/execution/:assignmentId");
  const actions = work && canCommand && work.tracking !== "legacy_review" ? work.allowedActions.filter(action => action in actionLabels) : [];
  const current = draft ?? (work && actions[0] ? makeDraft(work, actions.includes("report") ? "report" : actions[0]) : null);
  const stale = Boolean(draft && work && draft.version !== work.version);
  const edit = <K extends keyof ExecutionDraft>(key: K, value: ExecutionDraft[K]) => { if (current) setDraft({ ...current, [key]: value }); };
  function submit() {
    if (!work || !current || !canCommand || c.locked || query.isError || query.isFetching) return;
    try {
      const body = buildExecutionCommand(work, current, createIdempotencyKey());
      void command.execute(async () => { const saved = await c.execution.command(work.id, work.projectId, vendor, body); if (saved.id !== work.id || saved.projectId !== work.projectId) throw new Error("The saved assignment does not match this work."); return saved; }, () => setDraft(null));
    } catch (cause) { command.validation(cause instanceof Error ? cause.message : "Review the entered values."); }
  }
  return <View style={p.stack}><QueryState title="Assignment" query={query} />{query.data && !query.isError && !work ? <ScopeMismatch /> : null}{work ? <>
    <Panel title={work.itemName}><Text style={p.strong}>{work.projectName} · {work.vendorName}</Text><Text style={p.copy}>{[work.mainBasketName, work.subBasketName, work.roomName].filter(Boolean).join(" · ")}</Text><Text style={p.copy}>{work.description}</Text><Text style={p.strong}>{label(work.status)} · {work.progress}% vendor reported</Text><Text style={p.copy}>Next owner: {label(work.nextOwner)} · Execution round {work.executionRound}</Text><Text style={p.copy}>{work.orderNumber} · Revision {work.orderRevision} · {work.quantityMilliUnits !== null && work.uomCode ? `${work.quantityMilliUnits / 1000} ${work.uomCode}` : "Issued quantity unavailable"}</Text><Text style={p.copy}>Original issued target: {work.originalTargetDate ?? "Not set"}</Text><Text style={p.copy}>Confirmed schedule: {work.schedule ? `${work.schedule.startDate} to ${work.schedule.finishDate} · Revision ${work.schedule.revision}` : "Not confirmed"}</Text><Text style={p.copy}>Daily reporting: {label(work.daily.state)} · {work.timezone}</Text><Text style={p.copy}>Due {dateTime(work.daily.dueAt, work.timezone)} · Starts {work.reportingStartsOn ?? "when eligible"}</Text><Text style={p.copy}>Last report: {dateTime(work.latestReportAt, work.timezone)}</Text><Text style={p.copy}>Site verification: {work.verification ? dateTime(work.verification.verifiedAt, work.timezone) : "Not verified"}</Text>{work.flags.map(flag => <Text key={flag} style={p.error}>{label(flag)}</Text>)}{!work.sourceAvailable ? <Text style={p.error}>The Configuration link is unavailable. The issued scope is retained.</Text> : null}{work.proposedSchedule ? <Text style={p.copy}>Proposed schedule: {work.proposedSchedule.startDate} to {work.proposedSchedule.finishDate}{work.proposedSchedule.reason ? ` · ${work.proposedSchedule.reason}` : ""}</Text> : null}{work.hold ? <Text style={p.error}>On hold: {work.hold.reason} · Review {work.hold.reviewDate}</Text> : null}{work.evidenceExemption ? <Text style={p.copy}>Photo exemption: {work.evidenceExemption.reason}. Completion still requires verification.</Text> : null}{work.latestVendorReport ? <><Text style={p.strong}>Latest vendor report</Text><Text style={p.copy}>{work.latestVendorReport.note}</Text>{work.latestVendorReport.reason ? <Text style={p.copy}>Reason: {work.latestVendorReport.reason}</Text> : null}{work.latestVendorReport.nextAction ? <Text style={p.copy}>Next action: {work.latestVendorReport.nextAction}</Text> : null}</> : work.latestNote ? <Text style={p.copy}>{work.latestNote}</Text> : null}{work.submission ? <><Text style={p.strong}>Completion submission</Text><Text style={p.copy}>{work.submission.note}</Text><Text style={p.copy}>Submitted {dateTime(work.submission.submittedAt, work.timezone)} · Version {work.submission.version}</Text></> : null}<Button label="Refresh assignment" variant="quiet" disabled={c.locked || query.isFetching} onPress={() => void query.refetch()} /></Panel>
    <WorkEvidence key={`${work.id}:evidence`} context={c} projectId={work.projectId} assignmentId={work.id} imageIds={work.submission?.imageIds ?? work.imageIds} canUpload={vendor && !query.isError && work.allowedActions.includes("report")} />
    {work.tracking === "legacy_review" ? <Text style={p.copy}>This assignment retains its existing Client review and approval history.</Text> : null}
    {current && actions.length ? <Panel title="Update assigned work">
      <KnowledgeSelect label="Execution action" value={current.action} allowEmpty={false} disabled={c.locked} options={actions.map(value => ({ value, label: actionLabels[value] }))} onChange={value => setDraft(makeDraft(work, value as ExecutionAction))} />
      {stale || !actions.includes(current.action) ? <Text accessibilityRole="alert" style={p.error}>The assignment changed. Discard your draft and review the current action before continuing.</Text> : null}
      {current.action === "acknowledge" ? <Text style={p.copy}>Confirm that you have reviewed the issued scope. You can propose dates next.</Text> : null}
      {current.action === "setup" ? <Text style={p.copy}>Enable execution tracking while preserving previous reports and approvals.</Text> : null}
      {["propose_schedule", "confirm_schedule"].includes(current.action) ? <><Field label="Start date (YYYY-MM-DD)" value={current.startDate} editable={!c.locked} onChangeText={value => edit("startDate", value)} maxLength={10} autoCapitalize="none" /><Field label="Finish date (YYYY-MM-DD)" value={current.finishDate} editable={!c.locked} onChangeText={value => edit("finishDate", value)} maxLength={10} autoCapitalize="none" /></> : null}
      {current.action === "report" ? <><KnowledgeSelect label="Work status" value={current.status} allowEmpty={false} disabled={c.locked} options={["not_started", "in_progress", "blocked"].map(value => ({ value, label: label(value) }))} onChange={value => edit("status", value as ExecutionDraft["status"])} /><Field label="Vendor reported progress (%)" keyboardType="number-pad" value={current.progress} editable={!c.locked} onChangeText={value => edit("progress", value)} maxLength={3} /><Text style={p.copy}>A report at 100% requires a separate completion submission and Project Manager verification.</Text></> : null}
      {["report", "submit", "verify"].includes(current.action) ? <Field label={current.action === "submit" ? "Completion note" : current.action === "verify" ? "Verification note" : "Work note"} value={current.note} multiline maxLength={2000} editable={!c.locked} onChangeText={value => edit("note", value)} /> : null}
      {["report", "request_changes", "hold", "resume", "exempt_evidence", "propose_schedule", "confirm_schedule"].includes(current.action) ? <Field label="Reason" value={current.reason} multiline maxLength={2000} editable={!c.locked} onChangeText={value => edit("reason", value)} /> : null}
      {current.action === "report" && current.status === "blocked" ? <Field label="Next action to resolve blocker" value={current.nextAction} multiline maxLength={2000} editable={!c.locked} onChangeText={value => edit("nextAction", value)} /> : null}
      {current.action === "hold" ? <Field label="Hold review date (YYYY-MM-DD)" value={current.reviewDate} maxLength={10} editable={!c.locked} onChangeText={value => edit("reviewDate", value)} /> : null}
      <Button label={actionLabels[current.action]} disabled={c.locked || query.isError || stale || !actions.includes(current.action) || query.isFetching} onPress={submit} />
      {draft ? <Button label="Discard execution draft" variant="quiet" disabled={command.pending || command.uncertain} onPress={() => setDraft(null)} /> : null}
    </Panel> : null}
    {vendor ? <VendorWorkSubmission key={`${work.id}:submission`} context={c} work={{ ...work, canSubmitToClient: work.canSubmitToClient && !query.isError }} /> : null}
    {vendor && c.can("GET /vendor/purchase-orders/:orderId") ? <><Button label={order ? "Hide approved order" : "View approved order"} variant="secondary" onPress={() => setOrder(value => !value)} />{order ? <VendorApprovedOrder context={c} orderId={work.orderId} projectId={work.projectId} /> : null}</> : null}
    {c.can("GET /execution/work/:assignmentId/history") ? <><Button label={history ? "Hide activity history" : "View activity history"} variant="secondary" onPress={() => setHistory(value => !value)} />{history ? <ExecutionHistory context={c} work={work} /> : null}</> : null}
  </> : null}<CommandFeedback command={command} /></View>;
}

function ExecutionHistory({ context: c, work }: { context: DeliveryContext; work: ExecutionWork }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: c.key("history", work.id, offset), queryFn: ({ signal }) => c.execution.history(work.id, { limit: 25, offset }, signal), enabled: c.ready, retry: false });
  if (unavailable(query.error)) return <AccessLost title="Activity history unavailable" />;
  const data = !query.isError && query.data?.items.every(event => event.assignmentId === work.id) ? query.data : null;
  return <Panel title="Activity history"><QueryState title="Activity history" query={query} />{query.data && !query.isError && !data ? <ScopeMismatch /> : null}{data ? <>{data.items.map(event => <View key={event.id} style={p.panel}><Text style={p.strong}>{label(event.action)}{event.progress !== null ? ` · ${event.progress}%` : ""}</Text><Text style={p.copy}>{dateTime(event.occurredAt, work.timezone)} · Round {event.executionRound}</Text><Text style={p.copy}>Reporting date {event.localDate} · Actor {event.actorId}</Text>{event.note ? <Text style={p.copy}>{event.note}</Text> : null}{event.reason ? <Text style={p.copy}>Reason: {event.reason}</Text> : null}{event.nextAction ? <Text style={p.copy}>Next: {event.nextAction}</Text> : null}{event.startDate && event.finishDate ? <Text style={p.copy}>{event.startDate} to {event.finishDate}</Text> : null}{event.reviewDate ? <Text style={p.copy}>Review {event.reviewDate}</Text> : null}</View>)}{!data.items.length ? <Text style={p.copy}>No activity has been recorded.</Text> : null}<Pager offset={data.offset} limit={data.limit} total={data.total} onChange={setOffset} /></> : null}</Panel>;
}

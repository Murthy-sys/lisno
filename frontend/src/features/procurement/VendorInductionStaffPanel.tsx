import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import type { VendorInductionDraftSaveInput, VendorInductionPublishInput, VendorInductionQuestion, VendorInductionReopenInput, VendorInductionRequestInput, VendorInductionReviewInput, VendorInductionStaffDetail, VendorInductionSubmission } from "../../../../shared/knowledge/vendorInduction";
import { vendorInductionStarterQuestions } from "../../../../shared/knowledge/vendorInduction";
import { vendorInductionQuestionVisible } from "../../../../shared/knowledge/vendorInduction";
import { createVendorInductionWorkbookTools, VENDOR_INDUCTION_WORKBOOK_MAX_BYTES, VENDOR_INDUCTION_WORKBOOK_MIME, type VendorInductionWorkbookResult } from "../../../../shared/knowledge/vendorInductionWorkbook";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import { procurementError, procurementRequestKey } from "./procurementPresentation";
import { projectProcurementKeys } from "./projectProcurementApi";
import { publishVendorInduction, reopenVendorInduction, requestVendorInduction, reviewVendorInduction, saveVendorInductionDraft, vendorInductionKeys } from "./vendorInductionApi";
import { VendorInductionQuestionEditor } from "./VendorInductionQuestionEditor";
import { answerTypeLabels, validateVendorInductionQuestions } from "./vendorInductionQuestions";

type Command =
  | { kind: "draft"; input: VendorInductionDraftSaveInput }
  | { kind: "publish"; input: VendorInductionPublishInput }
  | { kind: "request"; input: VendorInductionRequestInput }
  | { kind: "review"; input: VendorInductionReviewInput }
  | { kind: "reopen"; input: VendorInductionReopenInput };
const workbookTools = createVendorInductionWorkbookTools(() => import("exceljs"));
const date = (value: string) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const denied = (error: unknown) => error instanceof ApiError && [401, 403].includes(error.status);
const conflict = (error: unknown) => error instanceof ApiError && error.status === 409;

function download(buffer: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: VENDOR_INDUCTION_WORKBOOK_MIME }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function responseText(question: VendorInductionQuestion, value: VendorInductionSubmission["answers"][number]["value"]): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return `${value}${question.unit ? ` ${question.unit}` : ""}`;
  if (Array.isArray(value)) return value.map((id) => question.options.find((option) => option.id === id)?.label ?? "Unavailable option").join(", ");
  if (question.type === "single_choice") return question.options.find((option) => option.id === value)?.label ?? "Unavailable option";
  return String(value);
}

function VendorResponse({ submission }: { submission: VendorInductionSubmission }) {
  return <section className="vendor-induction__response" aria-label="Vendor response"><h3>Vendor answers</h3><p>Submitted {date(submission.submittedAt)} · Questionnaire version {submission.questionnaireVersion}</p><dl>{submission.questionnaire.questions.filter((question) => question.enabled && vendorInductionQuestionVisible(question, submission.answers)).map((question) => {
    const answer = submission.answers.find((entry) => entry.questionId === question.id);
    return <div key={question.id}><dt>{question.prompt}</dt><dd>{answer ? responseText(question, answer.value) : "No answer"}</dd></div>;
  })}</dl></section>;
}

export function VendorInductionStaffPanel({ vendorId, detail, refetch }: { vendorId: string; detail: VendorInductionStaffDetail; refetch: () => void }) {
  const auth = useAuth(); const client = useQueryClient();
  const actorId = auth.user?.id ?? "";
  const canManage = hasFrontendPermission(auth.authorization, "procurement.vendor_induction.manage");
  const canRequest = hasFrontendPermission(auth.authorization, "procurement.vendor_induction.request");
  const canReview = hasFrontendPermission(auth.authorization, "procurement.vendor_induction.review");
  const [questions, setQuestions] = useState<VendorInductionQuestion[]>(() => [...(detail.draft?.questions ?? [])]);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [localError, setLocalError] = useState("");
  const [importResult, setImportResult] = useState<VendorInductionWorkbookResult | null>(null);
  const [selectedImport, setSelectedImport] = useState<Set<string>>(new Set());
  const [importBusy, setImportBusy] = useState(false);
  const [importReviewed, setImportReviewed] = useState(false);
  const [importWarning, setImportWarning] = useState(false);
  const pendingKeys = useRef(new Map<Command["kind"], { signature: string; key: string }>());

  useEffect(() => { setQuestions([...(detail.draft?.questions ?? [])]); setImportResult(null); setSelectedImport(new Set()); setImportReviewed(false); setImportWarning(false); }, [detail.draft?.version, detail.vendor.vendorType]);
  async function refreshAffected() {
    await Promise.all([
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.masterLists("vendors") }),
      client.invalidateQueries({ queryKey: knowledgeQueryKeys.vendorDirectoryOverview() }),
      client.invalidateQueries({ queryKey: projectProcurementKeys.vendors }),
      client.invalidateQueries({ queryKey: ["procurement", "vendor-suggestions"] })
    ]);
  }
  const mutation = useMutation({
    mutationFn: (command: Command) => {
      if (command.kind === "draft") return saveVendorInductionDraft(vendorId, command.input);
      if (command.kind === "publish") return publishVendorInduction(vendorId, command.input);
      if (command.kind === "request") return requestVendorInduction(vendorId, command.input);
      if (command.kind === "review") return reviewVendorInduction(vendorId, command.input);
      return reopenVendorInduction(vendorId, command.input);
    },
    onSuccess: async (updated, command) => {
      if (updated.vendor.id !== vendorId) throw new Error("The induction response belongs to a different vendor.");
      client.setQueryData(vendorInductionKeys.detail(actorId, vendorId), updated);
      pendingKeys.current.delete(command.kind);
      setLocalError("");
      setNotice(command.kind === "draft" ? "Draft saved." : command.kind === "publish" ? "Questionnaire version published." : command.kind === "request" ? updated.request?.status === "sent" ? "Induction request sent to the vendor profile email." : updated.request?.status === "failed" ? "Email delivery failed. You can retry the induction request." : "Induction request is being processed. Refresh to check delivery." : command.kind === "reopen" ? "Induction reopened." : command.input.decision === "approved" ? "Vendor induction approved." : "Changes requested. Send a new link when ready.");
      if (command.kind === "review" || command.kind === "reopen") setReason("");
      await refreshAffected();
    },
    onError: (error, command) => {
      if (conflict(error)) { pendingKeys.current.delete(command.kind); refetch(); }
    }
  });
  function run<T extends Command["kind"]>(kind: T, input: Omit<Extract<Command, { kind: T }>["input"], "idempotencyKey">) {
    if (mutation.isPending) return;
    const signature = JSON.stringify(input);
    let pending = pendingKeys.current.get(kind);
    if (!pending || pending.signature !== signature) { pending = { signature, key: procurementRequestKey() }; pendingKeys.current.set(kind, pending); }
    mutation.mutate({ kind, input: { ...input, idempotencyKey: pending.key } } as unknown as Command);
  }
  function saveDraft() {
    if (!detail.vendor.vendorType) { setLocalError("Set the vendor type in Overview before creating induction questions."); return; }
    const error = validateVendorInductionQuestions(questions);
    if (error) { setLocalError(error); return; }
    if ((importWarning || questions.some((question) => question.key.startsWith("legacy_row_"))) && !importReviewed) { setLocalError("Review and repair imported questions, answer types, and conditions before saving."); return; }
    setLocalError("");
    run("draft", { expectedVersion: detail.draft?.version ?? null, vendorType: detail.vendor.vendorType, questions });
  }
  function requestNow() { run("request", { expectedRequestVersion: detail.request?.version ?? null }); }
  function review(decision: "approved" | "changes_requested") {
    if (!detail.submission) return;
    if (decision === "changes_requested" && !reason.trim()) { setLocalError("Enter a reason so the vendor knows what to change."); return; }
    setLocalError("");
    run("review", { submissionId: detail.submission.id, decision, reason: decision === "changes_requested" ? reason.trim() : null, expectedReviewVersion: detail.review?.version ?? null });
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    setLocalError(""); setImportResult(null); setSelectedImport(new Set()); setImportReviewed(false);
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > VENDOR_INDUCTION_WORKBOOK_MAX_BYTES || file.size === 0) { setLocalError("Choose a non-empty .xlsx workbook up to 5 MiB."); return; }
    setImportBusy(true);
    try { setImportResult(await workbookTools.parseBuffer(await file.arrayBuffer())); }
    catch { setLocalError("This workbook could not be read. Save a fresh .xlsx copy and try again."); }
    finally { setImportBusy(false); }
  }
  async function exportWorkbook(template: boolean) {
    try { download(template ? await workbookTools.createTemplateBuffer() : await workbookTools.createExportBuffer(questions), template ? "vendor-induction-template.xlsx" : "vendor-induction-draft.xlsx"); }
    catch { setLocalError("The workbook could not be prepared. Try again."); }
  }
  function addImported() {
    if (!importResult || !selectedImport.size) return;
    const selected = importResult.questions.filter((question) => selectedImport.has(question.id));
    const ids = new Set(questions.map((question) => question.id));
    const keys = new Set(questions.map((question) => question.key));
    if (selected.some((question) => ids.has(question.id) || keys.has(question.key))) { setLocalError("An imported question matches an existing key. Edit the draft or workbook before adding it."); return; }
    setQuestions([...questions, ...selected]); setImportWarning(importResult.legacy || importResult.issues.length > 0); setImportReviewed(false); setImportResult(null); setSelectedImport(new Set()); setNotice(`${selected.length} questions added to the unsaved draft. Review every question before saving or publishing.`);
  }

  if (denied(mutation.error)) return <div className="vendor-induction__panel"><InlineMessage tone="error">You no longer have permission to manage this induction.</InlineMessage></div>;
  const dirty = JSON.stringify(questions) !== JSON.stringify(detail.draft?.questions ?? []);
  const canSendNow = detail.requestEligibility === "ready" || detail.requestEligibility === "cooldown" && Boolean(detail.request?.canResendAt && new Date(detail.request.canResendAt).getTime() <= Date.now());
  const requestAllowed = canRequest && !!detail.published && detail.vendor.emailAvailable && canSendNow;
  const hasPendingReview = !!detail.submission && (!detail.review || detail.review.submissionId !== detail.submission.id);
  const approved = detail.review?.decision === "approved";
  return <div className="vendor-induction__panel">
    {notice ? <p className="vendor-kpi__notice" role="status">{notice}</p> : null}
    {localError ? <InlineMessage tone="error">{localError}</InlineMessage> : null}
    {mutation.isError ? <InlineMessage tone="error">{conflict(mutation.error) ? "The induction changed while you were working. Review the latest version before trying again." : procurementError(mutation.error, "The induction action could not be completed. Retry or refresh to check its status.")}</InlineMessage> : null}
    <section className="vendor-induction__status" aria-label="Induction status"><div><span className="vendor-induction__eyebrow">Current induction</span><h2>{approved ? "Approved" : hasPendingReview ? "Awaiting Procurement review" : detail.review?.decision === "changes_requested" ? "Changes requested" : detail.request?.status === "sent" ? "Awaiting vendor answers" : "Not approved"}</h2><p>{detail.published ? `Published questionnaire version ${detail.published.version}.` : "Publish a questionnaire before requesting answers."} {detail.request?.status === "sent" ? `Link expires ${date(detail.request.expiresAt)}.` : detail.request?.status === "failed" ? "The last email delivery failed." : ""}</p></div><Button variant="secondary" onClick={refetch}>Refresh induction</Button></section>
    <section className="vendor-induction__authoring" aria-label="Questionnaire draft"><div className="vendor-induction__section-heading"><div><h2>Questionnaire</h2><p>Prepare this vendor's questions. A published version and sent form stay unchanged when you edit the draft.</p></div><span>{detail.draft ? `Draft version ${detail.draft.version}` : "No saved draft"}</span></div>
      {canManage && detail.vendor.vendorType ? <div className="vendor-induction__toolbar"><Button variant="secondary" disabled={mutation.isPending || questions.length > 0} onClick={() => setQuestions(vendorInductionStarterQuestions(detail.vendor.vendorType!))}>Use {detail.vendor.vendorType === "execution" ? "Execution" : "Supplier"} starter questions</Button><Button variant="quiet" onClick={() => void exportWorkbook(true)}>Download Excel template</Button><Button variant="quiet" disabled={!questions.length} onClick={() => void exportWorkbook(false)}>Export draft</Button><label className="vendor-induction__file-button">Import Excel questions<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={importBusy || mutation.isPending} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} /></label></div> : null}
      {importBusy ? <p role="status">Reading workbook…</p> : null}
      {importResult ? <section className="vendor-induction__import" aria-label="Import preview"><h3>Workbook preview</h3><p>{importResult.legacy ? "Legacy sheet detected. Client office-brief and buyer-policy questions are not appropriate for vendor induction. Choose only relevant vendor questions and confirm their answer types and conditions." : "Choose the questions to add to this vendor's unsaved draft."}</p>{importResult.issues.length ? <div className="vendor-induction__import-issues"><h4>Review these workbook issues</h4><ul>{importResult.issues.map((issue, index) => <li key={index}>{issue.row === null ? "Workbook" : `Row ${issue.row}`}{issue.column ? `, ${issue.column}` : ""}: {issue.message}</li>)}</ul></div> : null}<div className="vendor-induction__import-list">{importResult.questions.map((question) => <label key={question.id}><Checkbox checked={selectedImport.has(question.id)} onChange={(event) => setSelectedImport((current) => { const next = new Set(current); if (event.target.checked) next.add(question.id); else next.delete(question.id); return next; })} /><span><strong>{question.prompt}</strong><small>{question.section} · {answerTypeLabels[question.type]} · {question.key}</small></span></label>)}</div>{!importResult.questions.length ? <p>No importable question rows were found.</p> : null}<div className="vendor-induction__actions"><Button disabled={!selectedImport.size} onClick={addImported}>Add selected to draft</Button><Button variant="secondary" onClick={() => setImportResult(null)}>Close preview</Button></div></section> : null}
      {canManage ? <><VendorInductionQuestionEditor questions={questions} onChange={(next) => { setQuestions(next); setLocalError(""); }} disabled={mutation.isPending} />{importWarning || questions.some((question) => question.key.startsWith("legacy_row_")) ? <label className="vendor-induction__review-check"><Checkbox checked={importReviewed} onChange={(event) => setImportReviewed(event.target.checked)} />I reviewed and repaired workbook issues, answer types, and conditions for vendor induction.</label> : null}<div className="vendor-induction__actions"><Button disabled={!dirty || mutation.isPending} busy={mutation.isPending} onClick={saveDraft}>Save draft</Button><Button variant="secondary" disabled={!detail.draft || dirty || mutation.isPending} busy={mutation.isPending} onClick={() => detail.draft && run("publish", { expectedDraftVersion: detail.draft.version })}>Publish version</Button></div>{dirty ? <p className="vendor-induction__hint" role="status">Unsaved draft changes. Save before publishing.</p> : null}</> : <p>You have read-only access to this questionnaire.</p>}
      {detail.published ? <details className="vendor-induction__published"><summary>Preview published version {detail.published.version}</summary><ol>{detail.published.questions.filter((question) => question.enabled).map((question) => <li key={question.id}><strong>{question.prompt}</strong><span>{question.section} · {answerTypeLabels[question.type]}{question.required ? " · Required" : ""}</span></li>)}</ol></details> : null}
    </section>
    <section className="vendor-induction__request" aria-label="Vendor induction request"><div className="vendor-induction__section-heading"><div><h2>Vendor response</h2><p>Send a one-time link to the saved vendor profile email. The vendor can only answer the published questions.</p></div>{detail.request ? <span>{detail.request.status}</span> : null}</div>
      {detail.request && detail.request.status === "sent" ? <p>Sent {detail.request.sentAt ? date(detail.request.sentAt) : date(detail.request.requestedAt)}. Link expires {date(detail.request.expiresAt)}.</p> : null}
      {detail.requestEligibility === "missing_profile" ? <InlineMessage tone="warning">Complete the vendor profile and profile email before requesting induction.</InlineMessage> : null}
      {detail.requestEligibility === "cooldown" && detail.request?.canResendAt ? <p>Request again after {date(detail.request.canResendAt)}.</p> : null}
      {detail.request?.status === "failed" ? <InlineMessage tone="error">Email delivery failed. You can retry when delivery is available.</InlineMessage> : null}
      {requestAllowed ? <Button busy={mutation.isPending} onClick={requestNow}>{detail.request ? "Send new induction link" : "Request induction from vendor"}</Button> : null}
      {detail.submission ? <VendorResponse submission={detail.submission} /> : <p className="vendor-induction__empty">No vendor answers have been submitted for the current request.</p>}
      {hasPendingReview && canReview ? <div className="vendor-induction__review-actions"><Field id="vendor-induction-review-reason" label="Reason for requested changes" hint="Required when asking the vendor to revise answers">{(props) => <Textarea {...props} rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field><div className="vendor-induction__actions"><Button busy={mutation.isPending} onClick={() => review("approved")}>Approve induction</Button><Button variant="secondary" busy={mutation.isPending} disabled={!reason.trim()} onClick={() => review("changes_requested")}>Request changes</Button></div></div> : null}
      {approved && canReview ? <div className="vendor-induction__review-actions"><Field id="vendor-induction-reopen-reason" label="Reason for reopening induction" required>{(props) => <Textarea {...props} rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field><Button variant="secondary" disabled={!reason.trim() || mutation.isPending} busy={mutation.isPending} onClick={() => detail.review && run("reopen", { reason: reason.trim(), expectedReviewVersion: detail.review.version })}>Reopen induction</Button></div> : null}
    </section>
    <section className="vendor-induction__history" aria-label="Induction history"><h2>Review history</h2>{detail.history.reviews.length || detail.history.submissions.length ? <ol>{detail.history.reviews.map((review) => <li key={review.id}><strong>{review.decision === "approved" ? "Approved" : review.decision === "changes_requested" ? "Changes requested" : "Reopened"}</strong><span>{date(review.reviewedAt)} · Review version {review.version}</span>{review.reason ? <p>{review.reason}</p> : null}</li>)}{detail.history.submissions.map((submission) => <li key={submission.id}><strong>Vendor answers submitted</strong><span>{date(submission.submittedAt)} · Questionnaire version {submission.questionnaireVersion}</span><details><summary>View saved answers</summary><VendorResponse submission={submission} /></details></li>)}</ol> : <p>No submissions or decisions yet.</p>}</section>
  </div>;
}

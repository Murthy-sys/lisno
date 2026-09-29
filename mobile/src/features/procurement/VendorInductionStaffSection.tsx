import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  vendorInductionQuestionVisible,
  type VendorActivation,
  type VendorInductionAnswer,
  type VendorInductionAnswerType,
  type VendorInductionQuestion,
  type VendorInductionStaffDetail,
  type VendorInductionSubmission,
  vendorInductionStarterQuestions,
} from "../../../../shared/knowledge/vendorInduction";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field, StateView } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { createIdempotencyKey } from "../finance/money";
import { KnowledgeChoice, KnowledgeSelect, KnowledgeText, knowledgeStyles } from "../knowledge/knowledgeUi";
import { selectVendorInductionWorkbook, shareVendorInductionWorkbook } from "./VendorInductionWorkbook";

const path = (vendorId: string) => `/procurement/vendor-inductions/${encodeURIComponent(vendorId)}`;
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Date unavailable";
};
const statusLabel = { active: "Active", under_review: "Under Review", inactive: "Inactive", archived: "Archived" } as const;
const typeOptions = [
  { value: "short_text", label: "Short text" }, { value: "paragraph", label: "Paragraph" },
  { value: "number", label: "Number" }, { value: "yes_no", label: "Yes or no" },
  { value: "single_choice", label: "Single choice" }, { value: "multi_choice", label: "Multiple choice" },
] as const;
const isChoice = (type: VendorInductionAnswerType) => type === "single_choice" || type === "multi_choice";
const newId = () => createIdempotencyKey().replace(/^mobile-/, "question-");
const newKey = () => `question_${createIdempotencyKey().replace(/[^a-z0-9]/gu, "_")}`.slice(0, 64);
const keyPattern = /^[a-z][a-z0-9_]{0,63}$/u;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const MAX_QUESTIONS = 100;
const createQuestion = (): VendorInductionQuestion => {
  return { id: newId(), key: newKey(), section: "Capability", prompt: "", helpText: null, type: "short_text", required: true, enabled: true, options: [], unit: null, min: null, max: null, showIf: null };
};
type ImportPreview = { readonly questions: readonly VendorInductionQuestion[]; readonly issues: readonly { readonly row: number | null; readonly column?: string; readonly message: string }[]; readonly legacy: boolean };
type Command =
  | { readonly kind: "save"; readonly input: { readonly expectedVersion: number | null; readonly idempotencyKey: string; readonly vendorType: "execution" | "supplier"; readonly questions: readonly VendorInductionQuestion[] } }
  | { readonly kind: "publish"; readonly input: { readonly expectedDraftVersion: number; readonly idempotencyKey: string } }
  | { readonly kind: "request"; readonly input: { readonly expectedRequestVersion: number | null; readonly idempotencyKey: string } }
  | { readonly kind: "review"; readonly input: { readonly submissionId: string; readonly decision: "approved" | "changes_requested"; readonly reason: string | null; readonly expectedReviewVersion: number | null; readonly idempotencyKey: string } }
  | { readonly kind: "reopen"; readonly input: { readonly reason: string; readonly expectedReviewVersion: number; readonly idempotencyKey: string } };

function VendorSection({ title, children, nested = false }: { readonly title: string; readonly children: ReactNode; readonly nested?: boolean }) {
  return <View style={nested ? styles.subsection : styles.card}>
    <Text accessibilityRole="header" style={nested ? styles.subheading : styles.sectionTitle}>{title}</Text>
    {children}
  </View>;
}

export function VendorActivationSummary({ activation, onOpenInduction }: { readonly activation: VendorActivation; readonly onOpenInduction?: () => void }) {
  const gates = activation.gates;
  return <VendorSection title="Vendor availability">
    <Text style={styles.status}>{statusLabel[activation.effectiveStatus]}</Text>
    <KnowledgeText>Only Active vendors can be selected for new procurement work. Existing allocations remain visible.</KnowledgeText>
    <Gate label="Induction approved" complete={gates.inductionApproved} />
    <Gate label="Vendor self KPI" complete={gates.vendorSelfKpiComplete} />
    <Gate label="Procurement KPI" complete={gates.procurementKpiComplete} />
    <Gate label="Vendor profile complete" complete={gates.profileComplete} />
    <Gate label="Physical address verified by Procurement" complete={gates.physicalAddressVerified} />
    {!gates.inductionApproved && onOpenInduction ? <Button label="Open induction" variant="secondary" size="compact" onPress={onOpenInduction} /> : null}
  </VendorSection>;
}

function Gate({ label, complete }: { readonly label: string; readonly complete: boolean }) {
  return <View style={styles.gate}><Text style={styles.gateLabel}>{label}</Text><Text style={complete ? styles.complete : styles.incomplete}>{complete ? "Complete" : "Required"}</Text></View>;
}

export function VendorInductionStaffSection({ session, vendorId, detail, loading, error, stale, onRefresh }: {
  readonly session: AuthenticatedSession;
  readonly vendorId: string;
  readonly detail: VendorInductionStaffDetail | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly stale: boolean;
  readonly onRefresh: () => void;
}) {
  const configured = useConfiguredRuntime();
  const client = useQueryClient();
  const invalidate = useInvalidateEvent();
  const queryKey = privateQueryKey({ environmentId: configured.environment.environment.id, userId: session.user.id }, "vendors", "vendor-induction", vendorId);
  const permissions = session.authorization.permissions;
  const grants = new Set<string>(permissions);
  const canManage = grants.has("procurement.vendor_induction.manage");
  const canRequest = grants.has("procurement.vendor_induction.request");
  const canReview = grants.has("procurement.vendor_induction.review");
  const sourceVersion = `${vendorId}:${detail?.draft?.version ?? "none"}:${detail?.published?.version ?? "none"}`;
  const [questions, setQuestions] = useState<readonly VendorInductionQuestion[]>(detail?.draft?.questions ?? detail?.published?.questions ?? []);
  const [preview, setPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<readonly VendorInductionAnswer[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importSelected, setImportSelected] = useState<readonly string[]>([]);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const saveKey = useRef(createIdempotencyKey());
  const publishKey = useRef(createIdempotencyKey());
  const requestKey = useRef(createIdempotencyKey());
  const reviewKey = useRef(createIdempotencyKey());
  const reopenKey = useRef(createIdempotencyKey());
  useEffect(() => {
    setQuestions(detail?.draft?.questions ?? detail?.published?.questions ?? []);
    setImportPreview(null);
    setPreviewAnswers([]);
  }, [sourceVersion]);
  const dirty = JSON.stringify(questions) !== JSON.stringify(detail?.draft?.questions ?? detail?.published?.questions ?? []);
  const validation = validateQuestions(questions);
  const action = useMutation({ mutationFn: async (command: Command) => {
    if (!detail || detail.vendor.id !== vendorId) throw new Error("Refresh the vendor before changing induction.");
    const endpoint = path(vendorId);
    const api = configured.runtime.api.authenticated;
    let result: VendorInductionStaffDetail;
    if (command.kind === "save") result = await api.put<VendorInductionStaffDetail>(`${endpoint}/draft`, command.input);
    else if (command.kind === "publish") result = await api.post<VendorInductionStaffDetail>(`${endpoint}/publish`, command.input);
    else if (command.kind === "request") result = await api.post<VendorInductionStaffDetail>(`${endpoint}/requests`, command.input);
    else if (command.kind === "review") result = await api.post<VendorInductionStaffDetail>(`${endpoint}/reviews`, command.input);
    else result = await api.post<VendorInductionStaffDetail>(`${endpoint}/reopen`, command.input);
    if (result.vendor.id !== vendorId) throw new Error("Vendor identity changed. Refresh before continuing.");
    return { result, kind: command.kind };
  }, retry: false, onSuccess: async ({ result, kind }) => {
    client.setQueryData(queryKey, result);
    saveKey.current = createIdempotencyKey(); publishKey.current = createIdempotencyKey(); requestKey.current = createIdempotencyKey(); reviewKey.current = createIdempotencyKey(); reopenKey.current = createIdempotencyKey();
    setReason("");
    setNotice(({ save: "Induction draft saved.", publish: "Questionnaire published.", request: "Induction request saved. Check delivery status below.", review: "Review decision saved.", reopen: "Induction reopened." } as const)[kind]);
    await invalidate("knowledge-changed");
  } });
  const workbookImport = useMutation({ mutationFn: selectVendorInductionWorkbook, retry: false, onSuccess: result => { if (result) { setImportPreview(result); setImportSelected(result.legacy ? [] : result.questions.map(question => question.id)); } } });
  const workbookShare = useMutation({ mutationFn: async (kind: "template" | "saved") => shareVendorInductionWorkbook(kind, questions), retry: false });
  const updateQuestions = (next: readonly VendorInductionQuestion[]) => { setQuestions(next); saveKey.current = createIdempotencyKey(); action.reset(); setNotice(""); };
  const update = (id: string, change: Partial<VendorInductionQuestion>) => updateQuestions(questions.map(question => question.id === id ? { ...question, ...change } : question));
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target]!, next[index]!];
    updateQuestions(next);
  };
  const blocked = stale || (action.isError && action.error instanceof ApiError && action.error.status === 409);
  const busy = action.isPending || workbookImport.isPending || workbookShare.isPending;
  const canEdit = canManage && detail?.vendor.vendorType && detail.activation.lifecycleStatus !== "archived" && !blocked;
  const hasDraft = Boolean(detail?.draft);
  const canPublish = canEdit && hasDraft && !dirty && Boolean(questions.length) && !validation.length && !busy;
  const canSend = canRequest && detail?.requestEligibility === "ready" && !dirty && !busy && !blocked;

  if (loading && !detail) return <StateView title="Loading induction" message="Loading the current questionnaire and review…" />;
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return <StateView title="Induction unavailable" message="Your current account cannot view this vendor induction." tone="denied" />;
  if (action.error instanceof ApiError && (action.error.status === 401 || action.error.status === 403)) return <StateView title="Induction unavailable" message="Your current account cannot manage this vendor induction. Refresh your session." tone="denied" />;
  if (error && !detail) return <StateView title="Induction could not be loaded" message="Check your connection and try again." tone="error" actionLabel="Retry induction" onAction={onRefresh} />;
  if (!detail) return <StateView title="Induction unavailable" message="The vendor induction was not returned." tone="error" />;
  return <View style={styles.stack}>
    <VendorActivationSummary activation={detail.activation} />
    {stale || blocked ? <StateView tone="error" title="Induction may be out of date" message="Reload the latest version before making another change." actionLabel="Reload induction" onAction={onRefresh} /> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.complete}>{notice}</Text> : null}
    <VendorSection title="Questionnaire">
      <KnowledgeText>{detail.published ? `Published version ${detail.published.version} · ${formatDate(detail.published.publishedAt)}. Sent versions stay unchanged when you edit this draft.` : "No questionnaire has been published."}</KnowledgeText>
      <KnowledgeText>{detail.draft ? `Draft version ${detail.draft.version} · ${detail.draft.questions.length} questions` : "No saved draft. Begin with the interior procurement starter set or add your own questions."}</KnowledgeText>
      {detail.vendor.vendorType ? <KnowledgeText>For {detail.vendor.vendorType === "execution" ? "execution vendors" : "suppliers"}. The starter set is editable and does not include client office-brief or buyer-policy questions.</KnowledgeText> : <KnowledgeText>Set the vendor type in its profile before preparing induction.</KnowledgeText>}
      {canEdit ? <View style={knowledgeStyles.row}>
        <Button label="Use starter questions" variant="secondary" size="compact" disabled={busy || Boolean(questions.length)} onPress={() => { if (detail.vendor.vendorType) updateQuestions(vendorInductionStarterQuestions(detail.vendor.vendorType)); }} />
        <Button label="Add question" variant="secondary" size="compact" disabled={busy || questions.length >= MAX_QUESTIONS} onPress={() => updateQuestions([...questions, createQuestion()])} />
        <Button label="Import Excel" variant="secondary" size="compact" disabled={busy} loading={workbookImport.isPending} onPress={() => workbookImport.mutate()} />
        <Button label="Share template" variant="quiet" size="compact" disabled={busy} onPress={() => workbookShare.mutate("template")} />
        {questions.length ? <Button label="Export draft" variant="quiet" size="compact" disabled={busy} onPress={() => workbookShare.mutate("saved")} /> : null}
      </View> : null}
      {workbookImport.isError ? <KnowledgeText error>Workbook could not be read safely. Check the file and try again.</KnowledgeText> : null}
      {workbookShare.isError ? <KnowledgeText error>The workbook could not be shared on this device.</KnowledgeText> : null}
      {importPreview ? <VendorSection title="Import preview" nested>
        <KnowledgeText>{importPreview.legacy ? "Legacy question sheet: review every candidate before adding it. Client brief and internal buyer-policy rows are not selected." : "Review the parsed questions before adding them to this draft."}</KnowledgeText>
        {importPreview.issues.map((issue, index) => <KnowledgeText key={`${issue.row}:${issue.column ?? ""}:${index}`} error>{issue.row === null ? "Workbook" : `Row ${issue.row}`}{issue.column ? `, ${issue.column}` : ""}: {issue.message}</KnowledgeText>)}
        {importPreview.questions.map(question => <KnowledgeChoice key={question.id} label={`${question.section}: ${question.prompt}`} selected={importSelected.includes(question.id)} multiple onPress={() => setImportSelected(current => current.includes(question.id) ? current.filter(id => id !== question.id) : [...current, question.id])} />)}
        <Button label="Add selected questions to draft" disabled={!importSelected.length || busy || questions.length + importSelected.length > MAX_QUESTIONS} onPress={() => {
          const selected = importPreview.questions.filter(question => importSelected.includes(question.id));
          const identifiers = new Map(selected.map(question => [question.id, newId()]));
          updateQuestions([...questions, ...selected.map(question => ({ ...question, id: identifiers.get(question.id)!, showIf: question.showIf ? { ...question.showIf, questionId: identifiers.get(question.showIf.questionId) ?? question.showIf.questionId } : null }))]);
          setImportPreview(null); setImportSelected([]);
        }} />
      </VendorSection> : null}
      {questions.map((question, index) => <QuestionEditor key={question.id} question={question} index={index} questions={questions} editable={Boolean(canEdit) && !busy} canDuplicate={questions.length < MAX_QUESTIONS} onChange={change => update(question.id, change)} onMove={offset => move(index, offset)} onDuplicate={() => updateQuestions([...questions.slice(0, index + 1), { ...question, id: newId(), key: newKey(), options: question.options.map(option => ({ ...option, id: newId() })) }, ...questions.slice(index + 1)])} onRemove={() => updateQuestions(questions.filter(item => item.id !== question.id))} />)}
      {validation.map((message, index) => <KnowledgeText key={`${message}:${index}`} error>{message}</KnowledgeText>)}
      {questions.length ? <Button label={preview ? "Close question preview" : "Preview vendor questions"} variant="secondary" disabled={busy} onPress={() => setPreview(current => !current)} /> : null}
      {preview ? <QuestionPreview questions={questions} answers={previewAnswers} onChange={setPreviewAnswers} /> : null}
      {canEdit ? <View style={knowledgeStyles.row}>
        <Button label="Save induction draft" disabled={!dirty || Boolean(validation.length) || !questions.length || busy} loading={action.isPending && action.variables?.kind === "save"} onPress={() => { if (detail.vendor.vendorType) action.mutate({ kind: "save", input: { expectedVersion: detail.draft?.version ?? null, idempotencyKey: saveKey.current, vendorType: detail.vendor.vendorType, questions } }); }} />
        <Button label="Publish questionnaire" variant="secondary" disabled={!canPublish} loading={action.isPending && action.variables?.kind === "publish"} onPress={() => { if (detail.draft) action.mutate({ kind: "publish", input: { expectedDraftVersion: detail.draft.version, idempotencyKey: publishKey.current } }); }} />
      </View> : null}
    </VendorSection>
    <VendorSection title="Vendor request">
      <KnowledgeText>{detail.request ? `Status: ${detail.request.status.replaceAll("_", " ")} · Requested ${formatDate(detail.request.requestedAt)} · Expires ${formatDate(detail.request.expiresAt)}` : "No induction request has been sent."}</KnowledgeText>
      {detail.requestEligibility === "missing_profile" ? <KnowledgeText>Complete the vendor profile and saved email before sending.</KnowledgeText> : null}
      {detail.requestEligibility === "no_published_questionnaire" ? <KnowledgeText>Publish a questionnaire before requesting vendor answers.</KnowledgeText> : null}
      {detail.requestEligibility === "pending" || detail.requestEligibility === "cooldown" ? <KnowledgeText>Wait for delivery or resend availability. {detail.request?.canResendAt ? `Resend available after ${formatDate(detail.request.canResendAt)}.` : "Refresh for the latest status."}</KnowledgeText> : null}
      {detail.requestEligibility === "awaiting_review" ? <KnowledgeText>The submitted answers are awaiting Procurement review.</KnowledgeText> : null}
      {detail.requestEligibility === "approved" ? <KnowledgeText>Induction is approved. Reopen it if a fresh vendor response is needed.</KnowledgeText> : null}
      {canRequest ? <Button label={detail.request ? "Resend induction request" : "Request induction from vendor"} disabled={!canSend} loading={action.isPending && action.variables?.kind === "request"} onPress={() => action.mutate({ kind: "request", input: { expectedRequestVersion: detail.request?.version ?? null, idempotencyKey: requestKey.current } })} /> : null}
    </VendorSection>
    <VendorSection title="Vendor answers and review">
      {detail.submission ? <>
        <KnowledgeText>Submitted {formatDate(detail.submission.submittedAt)} for questionnaire version {detail.submission.questionnaireVersion}.</KnowledgeText>
        <AnswerList submission={detail.submission} questions={detail.submission.questionnaire.questions} />
      </> : <KnowledgeText>No answers have been submitted for review.</KnowledgeText>}
      {detail.review ? <KnowledgeText>Latest decision: {detail.review.decision.replaceAll("_", " ")} · {formatDate(detail.review.reviewedAt)}{detail.review.reason ? ` · ${detail.review.reason}` : ""}</KnowledgeText> : null}
      {canReview && detail.submission && detail.review?.submissionId !== detail.submission.id ? <>
        <Field label="Review reason (required when requesting changes)" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!busy && !blocked} />
        <View style={knowledgeStyles.row}>
          <Button label="Approve induction" disabled={busy || blocked} loading={action.isPending && action.variables?.kind === "review"} onPress={() => action.mutate({ kind: "review", input: { submissionId: detail.submission!.id, decision: "approved", reason: reason.trim() || null, expectedReviewVersion: detail.review?.version ?? null, idempotencyKey: reviewKey.current } })} />
          <Button label="Request changes" variant="secondary" disabled={!reason.trim() || busy || blocked} onPress={() => action.mutate({ kind: "review", input: { submissionId: detail.submission!.id, decision: "changes_requested", reason: reason.trim(), expectedReviewVersion: detail.review?.version ?? null, idempotencyKey: reviewKey.current } })} />
        </View>
      </> : null}
      {canReview && detail.review?.decision === "approved" ? <>
        <Field label="Reason to reopen induction" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!busy && !blocked} />
        <Button label="Reopen induction" variant="secondary" disabled={!reason.trim() || busy || blocked} loading={action.isPending && action.variables?.kind === "reopen"} onPress={() => action.mutate({ kind: "reopen", input: { reason: reason.trim(), expectedReviewVersion: detail.review!.version, idempotencyKey: reopenKey.current } })} />
      </> : null}
    </VendorSection>
    {detail.history.submissions.length || detail.history.reviews.length ? <VendorSection title="Induction history">
      {detail.history.submissions.map(submission => <View key={submission.id} style={styles.history}><KnowledgeText>Vendor response · version {submission.questionnaireVersion} · {formatDate(submission.submittedAt)}</KnowledgeText><AnswerList submission={submission} questions={submission.questionnaire.questions} /></View>)}
      {detail.history.reviews.map(review => <KnowledgeText key={review.id}>Procurement {review.decision.replaceAll("_", " ")} · {formatDate(review.reviewedAt)}{review.reason ? ` · ${review.reason}` : ""}</KnowledgeText>)}
    </VendorSection> : null}
    {action.isError ? <KnowledgeText error>{blocked ? "This induction changed. Reload before retrying." : "The action could not be confirmed. Retry with the same request identity."}</KnowledgeText> : null}
  </View>;
}

function validateQuestions(questions: readonly VendorInductionQuestion[]): readonly string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  const ids = new Set<string>();
  if (questions.length > MAX_QUESTIONS) errors.push(`A questionnaire can contain at most ${MAX_QUESTIONS} questions.`);
  for (const [index, question] of questions.entries()) {
    if (!idPattern.test(question.id) || ids.has(question.id)) errors.push(`Question ${index + 1}: stable ID is invalid or duplicated.`);
    ids.add(question.id);
    if (!keyPattern.test(question.key) || keys.has(question.key.toLowerCase())) errors.push(`Question ${index + 1}: use a unique key starting with a letter, followed by lowercase letters, numbers or underscores (up to 64 characters).`);
    keys.add(question.key.toLowerCase());
    if (!question.section.trim() || question.section.length > 120 || !question.prompt.trim() || question.prompt.length > 500 || question.helpText !== null && question.helpText.length > 1000) errors.push(`Question ${index + 1}: section, prompt or help text exceeds its limit.`);
    const choice = isChoice(question.type);
    if (choice && (question.options.length < 2 || question.options.length > 12) || !choice && question.options.length) errors.push(`Question ${index + 1}: choice questions need 2 to 12 options; other types have none.`);
    const optionIds = new Set<string>();
    const optionLabels = new Set<string>();
    for (const option of question.options) {
      const label = option.label.trim().toLowerCase();
      if (!idPattern.test(option.id) || optionIds.has(option.id) || !label || option.label.length > 120 || optionLabels.has(label)) errors.push(`Question ${index + 1}: choice labels and IDs must be unique; labels are limited to 120 characters.`);
      optionIds.add(option.id); optionLabels.add(label);
    }
    const predecessor = question.showIf ? questions.slice(0, index).find(other => other.id === question.showIf?.questionId && other.enabled) : null;
    if (question.showIf && !predecessor) errors.push(`Question ${index + 1}: condition must refer to an earlier enabled question.`);
    if (question.showIf && predecessor) {
      const validOptions = predecessor.type === "yes_no" ? ["yes", "no"] : isChoice(predecessor.type) ? predecessor.options.map(option => option.id) : [];
      if (!question.showIf.optionIds.length || new Set(question.showIf.optionIds).size !== question.showIf.optionIds.length || question.showIf.optionIds.some(optionId => !validOptions.includes(optionId))) errors.push(`Question ${index + 1}: choose distinct valid answers for its display condition.`);
    }
    if (question.type === "number") {
      if (question.unit !== null && (!question.unit.trim() || question.unit.length > 40)) errors.push(`Question ${index + 1}: unit must be at most 40 characters.`);
      if ([question.min, question.max].some(value => value !== null && (!Number.isFinite(value) || value < 0))) errors.push(`Question ${index + 1}: number bounds must be non-negative numbers.`);
      if (question.min !== null && question.max !== null && question.min > question.max) errors.push(`Question ${index + 1}: minimum must not exceed maximum.`);
    } else if (question.unit !== null || question.min !== null || question.max !== null) errors.push(`Question ${index + 1}: only number questions may have a unit or bounds.`);
  }
  return errors;
}

function QuestionEditor({ question, index, questions, editable, canDuplicate, onChange, onMove, onDuplicate, onRemove }: {
  readonly question: VendorInductionQuestion; readonly index: number; readonly questions: readonly VendorInductionQuestion[]; readonly editable: boolean;
  readonly canDuplicate: boolean;
  readonly onChange: (change: Partial<VendorInductionQuestion>) => void; readonly onMove: (offset: number) => void; readonly onDuplicate: () => void; readonly onRemove: () => void;
}) {
  const predecessors = questions.slice(0, index).filter(item => item.enabled && (item.type === "yes_no" || isChoice(item.type)));
  const target = predecessors.find(item => item.id === question.showIf?.questionId);
  const options = target?.type === "yes_no" ? [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] : target?.options ?? [];
  return <VendorSection title={`Question ${index + 1}${question.enabled ? "" : " · disabled"}`} nested>
    <Field label={`Question ${index + 1} key`} value={question.key} onChangeText={value => onChange({ key: value })} maxLength={64} editable={editable} />
    <Field label={`Question ${index + 1} section`} value={question.section} onChangeText={value => onChange({ section: value })} maxLength={120} editable={editable} />
    <Field label={`Question ${index + 1} prompt`} value={question.prompt} onChangeText={value => onChange({ prompt: value })} multiline maxLength={500} editable={editable} />
    <Field label={`Question ${index + 1} help text (optional)`} value={question.helpText ?? ""} onChangeText={value => onChange({ helpText: value.trim() ? value : null })} multiline maxLength={1000} editable={editable} />
    <KnowledgeSelect label={`Question ${index + 1} answer type`} value={question.type} options={typeOptions} allowEmpty={false} disabled={!editable} onChange={value => onChange({ type: value as VendorInductionAnswerType, options: isChoice(value as VendorInductionAnswerType) ? question.options : [], unit: value === "number" ? question.unit : null, min: value === "number" ? question.min : null, max: value === "number" ? question.max : null })} />
    <KnowledgeChoice label="Required answer" selected={question.required} multiple disabled={!editable} onPress={() => onChange({ required: !question.required })} />
    <KnowledgeChoice label="Include in vendor form" selected={question.enabled} multiple disabled={!editable} onPress={() => onChange({ enabled: !question.enabled })} />
    {question.type === "number" ? <View style={knowledgeStyles.row}>
      <Field label="Unit (optional)" value={question.unit ?? ""} onChangeText={value => onChange({ unit: value.trim() ? value : null })} maxLength={40} editable={editable} />
      <Field label="Minimum (optional)" value={question.min === null ? "" : String(question.min)} keyboardType="decimal-pad" onChangeText={value => onChange({ min: value.trim() === "" ? null : Number(value) })} editable={editable} />
      <Field label="Maximum (optional)" value={question.max === null ? "" : String(question.max)} keyboardType="decimal-pad" onChangeText={value => onChange({ max: value.trim() === "" ? null : Number(value) })} editable={editable} />
    </View> : null}
    {isChoice(question.type) ? <View style={styles.stack}>
      <Text style={styles.subheading}>Answer choices</Text>
      {question.options.map((option, optionIndex) => <View key={option.id} style={knowledgeStyles.row}><View style={styles.flex}><Field label={`Choice ${optionIndex + 1}`} value={option.label} onChangeText={value => onChange({ options: question.options.map(item => item.id === option.id ? { ...item, label: value } : item) })} maxLength={120} editable={editable} /></View><Button label={`Remove choice ${optionIndex + 1}`} variant="quiet" size="compact" disabled={!editable} onPress={() => onChange({ options: question.options.filter(item => item.id !== option.id) })} /></View>)}
      <Button label="Add choice" variant="secondary" size="compact" disabled={!editable || question.options.length >= 12} onPress={() => onChange({ options: [...question.options, { id: newId(), label: "" }] })} />
    </View> : null}
    <KnowledgeSelect label={`Question ${index + 1} display condition`} value={question.showIf?.questionId ?? ""} options={predecessors.map(item => ({ value: item.id, label: item.prompt || item.key }))} placeholder="Always show" disabled={!editable || !predecessors.length} onChange={value => onChange({ showIf: value ? { questionId: value, optionIds: [] } : null })} />
    {target ? <View style={styles.stack}><KnowledgeText>Show when {target.prompt || target.key} has any selected answer:</KnowledgeText>{options.map(option => <KnowledgeChoice key={option.id} label={option.label} multiple selected={question.showIf?.optionIds.includes(option.id) ?? false} disabled={!editable} onPress={() => onChange({ showIf: { questionId: target.id, optionIds: question.showIf?.optionIds.includes(option.id) ? question.showIf.optionIds.filter(id => id !== option.id) : [...(question.showIf?.optionIds ?? []), option.id] } })} />)}</View> : null}
    {editable ? <View style={knowledgeStyles.row}>
      <Button label={`Move question ${index + 1} up`} variant="quiet" size="compact" disabled={index === 0} onPress={() => onMove(-1)} />
      <Button label={`Move question ${index + 1} down`} variant="quiet" size="compact" disabled={index === questions.length - 1} onPress={() => onMove(1)} />
      <Button label={`Duplicate question ${index + 1}`} variant="quiet" size="compact" disabled={!canDuplicate} onPress={onDuplicate} />
      <Button label={`Remove question ${index + 1}`} variant="danger" size="compact" onPress={onRemove} />
    </View> : null}
  </VendorSection>;
}

function QuestionPreview({ questions, answers, onChange }: { readonly questions: readonly VendorInductionQuestion[]; readonly answers: readonly VendorInductionAnswer[]; readonly onChange: (answers: readonly VendorInductionAnswer[]) => void }) {
  const setAnswer = (questionId: string, value: VendorInductionAnswer["value"]) => onChange([...answers.filter(answer => answer.questionId !== questionId), { questionId, value }]);
  return <VendorSection title="Vendor form preview" nested>
    <KnowledgeText>Only enabled questions and conditions that match the sample answers appear here. Preview answers are not saved.</KnowledgeText>
    {questions.filter(question => question.enabled && vendorInductionQuestionVisible(question, answers)).map(question => {
      const value = answers.find(answer => answer.questionId === question.id)?.value;
      return <View key={question.id} style={styles.stack}>
        <Text style={styles.subheading}>{question.prompt}{question.required ? " *" : ""}</Text>
        {question.helpText ? <KnowledgeText>{question.helpText}</KnowledgeText> : null}
        {question.type === "yes_no" ? ["yes", "no"].map(option => <KnowledgeChoice key={option} label={option === "yes" ? "Yes" : "No"} selected={value === (option === "yes")} onPress={() => setAnswer(question.id, option === "yes")} />) : null}
        {isChoice(question.type) ? question.options.map(option => <KnowledgeChoice key={option.id} label={option.label} multiple={question.type === "multi_choice"} selected={Array.isArray(value) ? value.includes(option.id) : value === option.id} onPress={() => setAnswer(question.id, question.type === "multi_choice" ? Array.isArray(value) ? value.includes(option.id) ? value.filter(id => id !== option.id) : [...value, option.id] : [option.id] : option.id)} />) : null}
        {question.type === "short_text" || question.type === "paragraph" || question.type === "number" ? <Field label={question.prompt} value={typeof value === "string" || typeof value === "number" ? String(value) : ""} multiline={question.type === "paragraph"} keyboardType={question.type === "number" ? "decimal-pad" : "default"} onChangeText={text => setAnswer(question.id, question.type === "number" && text.trim() !== "" ? Number(text) : text)} /> : null}
      </View>;
    })}
  </VendorSection>;
}

function AnswerList({ submission, questions }: { readonly submission: VendorInductionSubmission; readonly questions: readonly VendorInductionQuestion[] }) {
  return <View style={styles.stack}>{submission.answers.map(answer => {
    const question = questions.find(item => item.id === answer.questionId);
    const value = Array.isArray(answer.value) ? answer.value.map(id => question?.options.find(option => option.id === id)?.label ?? id).join(", ") : typeof answer.value === "boolean" ? answer.value ? "Yes" : "No" : String(answer.value);
    return <KnowledgeText key={answer.questionId}>{question?.prompt ?? `Earlier question ${answer.questionId}`}: {value}</KnowledgeText>;
  })}</View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.md },
  sectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18 },
  subsection: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm },
  status: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 22 },
  gate: { flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  gateLabel: { color: colors.ink, fontFamily: fonts.regular, fontSize: 13, flex: 1 },
  complete: { color: colors.success, fontFamily: fonts.medium, fontSize: 13 },
  incomplete: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 13 },
  subheading: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14 },
  flex: { flex: 1, minWidth: 180 },
  history: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
});

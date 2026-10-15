import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { AssistantProjectPrice } from "./AssistantProjectPrice";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { KnowledgeModal, KnowledgeText } from "../knowledge/knowledgeUi";
import { assistantFailureNotice, retryAssistantRead } from "./assistantRecovery";
import { assistantStateSchema, parseAssistantResult } from "./chatAssistantModel";
import { createClientMessageId, type PresentedMessage } from "./chatModel";
import { chatPath } from "./chatEnhancementsApi";
import { chatQueryKeys } from "./chatQueryKeys";


export function ChatAssistantMessage({ message, onDenied }: { readonly message: PresentedMessage; readonly onDenied: () => void }) {
 const context = useConfiguredRuntime(); const session = context.session.status === "authenticated" ? context.session.session : null;
 if (!session || !message.assistant) return null;
 return <AssistantDetails key={`${context.environment.environment.id}:${context.session.generation}:${session.user.id}:${message.id}`} message={message} onDenied={onDenied} />;
}
function AssistantDetails({ message, onDenied }: { readonly message: PresentedMessage; readonly onDenied: () => void }) {
 const context = useConfiguredRuntime(); const session = context.session.session!; const client = useQueryClient(); const state = message.assistant!;
 const [resumeVersion, setResumeVersion] = useState(0);
 const [foreground, setForeground] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
 const scope = { environmentId: context.environment.environment.id, userId: session.user.id }; const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const pending = useRef(false); const [error, setError] = useState(""); const mounted = useRef(true);
 useEffect(() => () => { mounted.current = false; }, []);
 const attempt = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
 const canRead = canPerformOperation(session, "GET /projects/:projectId/chat/assistant/results/:resultId");
 const canRequest = session.user.role === "client" && message.authorRole === "client" && message.authorId === session.user.id && state.canRequest && canPerformOperation(session, "POST /projects/:projectId/chat/messages/:messageId/assistant/request");
 const result = useQuery({ queryKey: [...chatQueryKeys.project(scope, message.projectId), "assistant-result", context.session.generation, resumeVersion, state.resultId ?? "unavailable"], queryFn: async ({ signal }) => {
  try { return { result: parseAssistantResult(await context.runtime.api.authenticated.get(`${chatPath(message.projectId)}/assistant/results/${encodeURIComponent(state.resultId!)}`, { signal, safeRetryCount: 0 }), message.projectId, state.resultId!) }; }
  catch (cause) { if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { if (cause.status === 401) onDenied(); return { denied: true }; } throw cause; }
 }, enabled: open && foreground && canRead && Boolean(state.resultId), retry: retryAssistantRead, retryDelay: 250, staleTime: 0, gcTime: 0, refetchOnMount: "always" });
 useEffect(() => {
  if (!open) return;
  setForeground(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const listener = AppState.addEventListener("change", next => {
   if (next === "active") setResumeVersion(version => version + 1);
   setForeground(next === "active");
   if (next !== "active") {
    void client.cancelQueries({ queryKey: [...chatQueryKeys.project(scope, message.projectId), "assistant-result", context.session.generation] });
    client.removeQueries({ queryKey: [...chatQueryKeys.project(scope, message.projectId), "assistant-result", context.session.generation] });
   }
  });
  return () => listener.remove();
 }, [open, client, context.session.generation, scope.environmentId, scope.userId, message.projectId]);
 async function request() {
  if (!canRequest || pending.current) return;
  const fingerprint = `${message.id}:${message.version}:${state.generation}`; if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, idempotencyKey: createClientMessageId() };
  pending.current = true; setBusy(true); setError("");
  try {
   const response = assistantStateSchema.safeParse(await context.runtime.api.authenticated.post(`${chatPath(message.projectId)}/messages/${encodeURIComponent(message.id)}/assistant/request`, { expectedVersion: message.version, idempotencyKey: attempt.current.idempotencyKey }));
   if (!response.success) throw new ApiProtocolError(); if (!mounted.current) return;
   await client.invalidateQueries({ queryKey: chatQueryKeys.project(scope, message.projectId) }).catch(() => setError("The AI reply was requested. Refresh the conversation for its latest status."));
  } catch (cause) { if (mounted.current) { if (cause instanceof ApiError && cause.status === 401) onDenied(); else setError(cause instanceof ApiError && [403, 404].includes(cause.status) ? "An AI answer cannot be requested with your current access." : cause instanceof ApiError && cause.status === 409 ? "This message changed. Refresh the conversation before requesting an AI answer." : cause instanceof ApiError && (cause.status === 429 || cause.code.startsWith("ASSISTANT_")) ? assistantFailureNotice(cause.code) : "The request could not be confirmed. Retry to recover the same request."); } }
  finally { if (mounted.current) { pending.current = false; setBusy(false); } }
 }
 const answer = open && foreground && canRead && !result.isFetching && !result.isError && result.data && "result" in result.data ? result.data.result : null;
 return <View style={{ gap: 6 }}>
  {message.authorRole !== "service" && ["leased", "ready"].includes(state.status) ? <KnowledgeText>Lisno AI is checking your project.</KnowledgeText> : null}
  {message.authorRole !== "service" && state.status === "failed" ? <KnowledgeText>{assistantFailureNotice(state.failureCode)} Your message remains in Project messages.</KnowledgeText> : null}
  {session.user.role !== "client" && state.routing === "notified" && state.notified ? <KnowledgeText>Alert sent to {state.notified.name}.</KnowledgeText> : null}
  {session.user.role !== "client" && state.routing === "unroutable" ? <KnowledgeText>No responsible team member is currently available for this request.</KnowledgeText> : null}
  {state.resultId && canRead ? <Button label="View Lisno AI answer" variant="quiet" onPress={() => setOpen(true)} /> : null}
  {canRequest ? <Button label={state.resultId ? "Refresh AI answer" : state.status === "failed" ? "Retry AI reply" : "Request AI answer"} variant="quiet" loading={busy} onPress={() => void request()} /> : null}
  {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
  {open ? <KnowledgeModal title="Lisno AI answer" onClose={() => setOpen(false)}>
   {!foreground ? <KnowledgeText>Checking current access to the AI answer…</KnowledgeText> : !canRead ? <KnowledgeText>This AI answer is unavailable for your current access.</KnowledgeText> : result.isFetching || result.isPending ? <KnowledgeText>Checking current access to the AI answer…</KnowledgeText> : result.data && "denied" in result.data ? <KnowledgeText>This AI answer is unavailable for your current access.</KnowledgeText> : result.isError ? <><KnowledgeText error>The AI answer could not be loaded.</KnowledgeText><Button label="Retry AI answer" onPress={() => void result.refetch()} /></> : null}
   {answer && answer.disclosurePolicy !== "project-publication-v1" ? <KnowledgeText>This answer needs to be refreshed. Ask Lisno again for current information.</KnowledgeText> : null}
   {answer?.disclosurePolicy === "project-publication-v1" ? <>
    {answer.narrative?.map((paragraph, index) => <KnowledgeText key={index}>{paragraph.text}</KnowledgeText>)}
    {answer.stale ? <KnowledgeText>Project information has changed since this answer. Refresh the AI answer from the original message before relying on it.</KnowledgeText> : null}
    <KnowledgeText>Checked: {answer.checkedAt}</KnowledgeText>
    {answer.facts.map(fact => <View key={fact.id}><KnowledgeText>{fact.label}: {fact.value}</KnowledgeText><KnowledgeText>Source: {fact.source.label}</KnowledgeText></View>)}
    {answer.missingInputs.map((value, index) => <KnowledgeText key={index}>Details needed: {value}</KnowledgeText>)}
    {answer.commercialAccess === "restricted" ? <KnowledgeText>Price details are restricted to authorised project users.</KnowledgeText> : null}
    {answer.commercialAccess === "allowed" && !answer.stale && answer.projectPricing ? <AssistantProjectPrice price={answer.projectPricing} /> : null}
    {answer.kind === "price" && !answer.stale && answer.commercialAccess !== "restricted" && !answer.projectPricing ? <KnowledgeText>Published estimate details are unavailable. Ask Lisno again to check the latest information.</KnowledgeText> : null}
    {(answer.kind === "handoff" || answer.kind === "no_answer" && !answer.narrative?.length) ? <KnowledgeText>The project team needs to confirm this request.</KnowledgeText> : null}
   </> : null}
  </KnowledgeModal> : null}
 </View>;
}

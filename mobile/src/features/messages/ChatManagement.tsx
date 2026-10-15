import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { KnowledgeModal, KnowledgeText } from "../knowledge/knowledgeUi";
import { createClientMessageId, type PresentedChatParticipantPage, type PresentedChatSummary } from "./chatModel";
import { requireChatParticipantPage } from "./chatParticipants";
import { chatPath, renameChatProject } from "./chatEnhancementsApi";
import { chatQueryKeys } from "./chatQueryKeys";

function useManagementOwner(projectId: string, session: AuthenticatedSession) {
 const context = useConfiguredRuntime(); const currentKey = `${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${session.user.id}:${projectId}`;
 const owner = useRef(currentKey); owner.current = currentKey;
 useEffect(() => () => { owner.current = ""; }, []);
 return { context, owner, currentKey, scope: { environmentId: context.environment.environment.id, userId: session.user.id } };
}
export function ChatProjectNameDialog({ summary, session, onClose, onRefresh, onDenied, onBusy }: { readonly summary: PresentedChatSummary; readonly session: AuthenticatedSession; readonly onClose: () => void; readonly onRefresh: () => Promise<void>; readonly onDenied: () => void; readonly onBusy?: (busy: boolean) => void }) {
 const { context, owner, currentKey, scope } = useManagementOwner(summary.project.id, session); const client = useQueryClient();
 const [name, setName] = useState(summary.project.name); const [nameVersion, setNameVersion] = useState(summary.project.nameVersion); const latestSummary = useRef(summary); latestSummary.current = summary; const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [blocked, setBlocked] = useState(false); const pending = useRef(false);
 const attempt = useRef<{ name: string; expectedVersion: number; idempotencyKey: string } | null>(null);
 useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);
 const permitted = summary.capabilities.canRenameProject && summary.project.nameVersion !== undefined && canPerformOperation(session, "PATCH /projects/:projectId/chat/project-name");
 async function save() {
  if (!permitted || pending.current || blocked) return;
  if (nameVersion !== summary.project.nameVersion) { setBlocked(true); setError("The project name changed. Refresh and review it before saving."); return; }
  const normalized = name.trim(); if (!normalized || normalized.length > 160) { setError("Enter a project name of 1 to 160 characters."); return; }
  const input = { name: normalized, expectedVersion: nameVersion! };
  if (!attempt.current || attempt.current.name !== input.name || attempt.current.expectedVersion !== input.expectedVersion) attempt.current = { ...input, idempotencyKey: createClientMessageId() };
  pending.current = true; setBusy(true); setError(""); const frozen = currentKey;
  try {
   const result = await renameChatProject(context.runtime, summary.project.id, attempt.current);
   if (owner.current !== frozen) return;
   client.setQueryData(chatQueryKeys.summary(scope, summary.project.id), result);
   await Promise.all([client.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) }), onRefresh()]).catch(() => undefined);
   if (owner.current === frozen) onClose();
  } catch (cause) {
   if (owner.current !== frozen) return;
   if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) onDenied();
   else { setBlocked(cause instanceof ApiError && cause.status < 500); setError(cause instanceof ApiError ? cause.message : "The rename result could not be confirmed. Retry the same name to recover the result."); }
  } finally { if (owner.current === frozen) { pending.current = false; setBusy(false); } }
 }
 return <KnowledgeModal title="Edit project name" busy={busy} onClose={onClose}>
  <KnowledgeText>This updates the project name shown across its conversation and project screens.</KnowledgeText>
  <Field label="Project name" value={name} onChangeText={setName} editable={!busy && !blocked} maxLength={160} />
  {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
  {blocked ? <Button label="Refresh project name" onPress={() => void onRefresh().then(() => { attempt.current = null; setName(latestSummary.current.project.name); setNameVersion(latestSummary.current.project.nameVersion); setBlocked(false); setError(""); }).catch(() => setError("The project name could not be refreshed."))} /> : null}
  <Button label="Save project name" loading={busy} disabled={!permitted || blocked || !name.trim()} onPress={() => void save()} />
 </KnowledgeModal>;
}

type ParticipantAction = { mode: "remove" | "restore" | "revoke"; userId: string; expectedVersion: number; targetId: string };
export function ChatParticipantManagement({ projectId, session, page, disabled, onChanged, onRefresh, onDenied, onBusy }: { readonly projectId: string; readonly session: AuthenticatedSession; readonly page: PresentedChatParticipantPage; readonly disabled: boolean; readonly onChanged: (page: PresentedChatParticipantPage) => Promise<void> | void; readonly onRefresh: () => Promise<unknown>; readonly onDenied: () => void; readonly onBusy?: (busy: boolean) => void }) {
 const { context, owner, currentKey, scope } = useManagementOwner(projectId, session); const client = useQueryClient();
 const [action, setAction] = useState<ParticipantAction | null>(null); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [blocked, setBlocked] = useState(false); const pending = useRef(false);
 const attempt = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
 useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);
 const active = action ? page.items.find(person => person.id === action.userId) : null; const removed = action ? page.removed?.find(person => person.id === action.userId) : null;
 const selected = action?.mode === "restore" ? removed : active;
 const permitted = action?.mode === "restore" ? removed?.canRestore && canPerformOperation(session, "POST /projects/:projectId/chat/participants/:userId/restore") : action?.mode === "remove" ? active?.canRemove && canPerformOperation(session, "POST /projects/:projectId/chat/participants/:userId/remove") : Boolean(active?.selection) && canPerformOperation(session, "POST /projects/:projectId/chat/participants/:selectionId/revoke");
 function open(next: Pick<ParticipantAction, "mode" | "userId">) { const person = next.mode === "restore" ? page.removed?.find(item => item.id === next.userId) : page.items.find(item => item.id === next.userId); if (!person) return; const selection = "selection" in person ? person.selection : null; setAction({ ...next, targetId: next.mode === "revoke" ? selection!.id : person.id, expectedVersion: next.mode === "revoke" ? selection!.version : person.removalVersion ?? 0 }); setReason(""); setError(""); setBlocked(false); attempt.current = null; }
 async function save() {
  if (!action || !permitted || disabled || blocked || pending.current || !reason.trim()) return;
  const targetId = action.targetId;
  const currentVersion = action.mode === "revoke" ? active!.selection!.version : selected!.removalVersion ?? 0;
  if (action.expectedVersion !== currentVersion || action.mode === "revoke" && active!.selection!.id !== targetId) { setBlocked(true); setError("Participant access changed. Refresh and review it before saving."); return; }
  const input = { expectedVersion: action.expectedVersion, reason: reason.trim() };
  const fingerprint = JSON.stringify({ ...action, targetId, input }); if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, idempotencyKey: createClientMessageId() };
  pending.current = true; setBusy(true); setError(""); const frozen = currentKey;
  try {
   const result = requireChatParticipantPage(await context.runtime.api.authenticated.post(`${chatPath(projectId)}/participants/${encodeURIComponent(targetId)}/${action.mode}`, { ...input, idempotencyKey: attempt.current.idempotencyKey }));
   if (owner.current !== frozen) return;
   const stillActive = result.items.some(person => person.id === action.userId); const resultPerson = result.items.find(person => person.id === action.userId);
   if (action.mode === "remove" && stillActive || action.mode === "restore" && !stillActive || action.mode === "revoke" && resultPerson?.selection?.id === targetId) throw new Error("Participant acknowledgement could not be verified");
   client.setQueryData(chatQueryKeys.participants(scope, projectId), result); setAction(null);
   try { await onChanged(result); } catch { /* The committed page is already in cache; a later refresh can recover derived counts. */ }
  } catch (cause) {
   if (owner.current !== frozen) return;
   if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) onDenied();
   else { setBlocked(cause instanceof ApiError && cause.status < 500); setError(cause instanceof ApiError ? cause.message : "The participant update could not be confirmed. Retry with the same reason to recover its result."); }
  } finally { if (owner.current === frozen) { pending.current = false; setBusy(false); } }
 }
 return <View style={{ gap: 8 }}>
  {page.items.map(person => <View key={person.id} style={{ gap: 4 }}>
   {person.canRemove && canPerformOperation(session, "POST /projects/:projectId/chat/participants/:userId/remove") ? <Button label={`Remove participant ${person.name}`} variant="quiet" disabled={disabled || busy} onPress={() => open({ mode: "remove", userId: person.id })} /> : person.removalBlockedReason ? <KnowledgeText>{person.name}: {person.removalBlockedReason}</KnowledgeText> : null}
   {person.selection && canPerformOperation(session, "POST /projects/:projectId/chat/participants/:selectionId/revoke") ? <Button label={`Revoke added access for ${person.name}`} variant="quiet" disabled={disabled || busy} onPress={() => open({ mode: "revoke", userId: person.id })} /> : null}
  </View>)}
  {page.removed?.length ? <KnowledgeText>Removed participants</KnowledgeText> : null}
  {page.removed?.map(person => <View key={person.id}><KnowledgeText>{person.name} · {person.role.replaceAll("_", " ")}</KnowledgeText>{person.canRestore ? <Button label={`Restore participant ${person.name}`} variant="quiet" disabled={disabled || busy || !canPerformOperation(session, "POST /projects/:projectId/chat/participants/:userId/restore")} onPress={() => open({ mode: "restore", userId: person.id })} /> : <KnowledgeText>Currently unavailable for restoration.</KnowledgeText>}</View>)}
  {action ? <KnowledgeModal title={`${action.mode === "remove" ? "Remove" : action.mode === "restore" ? "Restore" : "Revoke added access for"} ${selected?.name ?? "participant"}`} busy={busy} onClose={() => setAction(null)}>
   <KnowledgeText>{action.mode === "remove" ? "This removes conversation and attachment access. Project assignments and historical messages remain." : action.mode === "restore" ? "This restores conversation history access if the participant is still eligible." : "This revokes the manually added membership. Other project assignments may still give this participant access."}</KnowledgeText>
   <Field label="Participant change reason" value={reason} onChangeText={setReason} editable={!busy && !blocked} multiline maxLength={1000} />
   {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
   {blocked ? <Button label="Refresh participant access" onPress={() => void onRefresh().then(() => { attempt.current = null; setAction(null); setBlocked(false); setError(""); }).catch(() => setError("Participant access could not be refreshed."))} /> : null}
   <Button label="Confirm participant change" loading={busy} disabled={disabled || !permitted || blocked || !reason.trim()} onPress={() => void save()} />
  </KnowledgeModal> : null}
 </View>;
}

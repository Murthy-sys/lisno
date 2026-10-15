import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { KnowledgeModal, KnowledgeSelect, KnowledgeText } from "../knowledge/knowledgeUi";
import { ApiError } from "../../core/http/apiClient";
import { createClientMessageId, type ChatMention, type PresentedPriority } from "./chatModel";
import { mentionsAfterEdit, isChatDueDate } from "./chatDraftMetadata";
import { buildChatParticipantsPath, requireChatParticipantPage } from "./chatParticipants";
import { createChatActionType, getChatActionTypes } from "./chatEnhancementsApi";
import { chatQueryKeys } from "./chatQueryKeys";

export function useChatComposerMetadata(projectId: string, session: AuthenticatedSession, ownerKey: string, enabled: boolean) {
 const context = useConfiguredRuntime(); const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
 const participants = useQuery({ queryKey: chatQueryKeys.participants(scope, projectId), queryFn: async ({ signal }) => requireChatParticipantPage(await context.runtime.api.authenticated.get(buildChatParticipantsPath(projectId), { signal })), enabled: enabled && canPerformOperation(session, "GET /projects/:projectId/chat/participants"), staleTime: 10_000, retry: false });
 const typesKey = [...chatQueryKeys.project(scope, projectId), "action-types"];
 const types = useQuery({ queryKey: typesKey, queryFn: ({ signal }) => getChatActionTypes(context.runtime, projectId, signal), enabled: enabled && canPerformOperation(session, "GET /projects/:projectId/chat/action-types"), staleTime: 30_000, retry: false });
 const [mentions, setMentions] = useState<ChatMention[]>([]); const [responsibleUserId, setResponsible] = useState(""); const [action, setAction] = useState<{ typeId: string; dueDate: string } | null>(null); const [open, setOpen] = useState(false);
 const reset = useCallback(() => { setMentions([]); setResponsible(""); setAction(null); setOpen(false); }, []);
 useEffect(reset, [ownerKey, reset]);
 const validate = (body: string) => {
  if (mentions.length || responsibleUserId || action) {
   if (participants.isError || participants.isFetching || !participants.data) return "Refresh current participants before sending mentions or assigned work.";
   if (mentions.some(mention => !participants.data.items.some(person => person.id === mention.userId))) return "A mentioned person is unavailable. Edit their mention and choose a current participant.";
   if (responsibleUserId && !participants.data.items.some(person => person.id === responsibleUserId)) return "Choose a current responsible participant.";
  }
  if (new Set(mentions.map(mention => mention.userId)).size > 20) return "Mention up to 20 people per message.";
  if (action && (types.isError || types.isFetching || !types.data?.items.some(type => type.id === action.typeId) || !responsibleUserId || !body.trim() || !isChatDueDate(action.dueDate))) return "Choose an available action type, responsible participant and valid due date.";
  return null;
 };
 return { mentions, setMentions, responsibleUserId, setResponsible, action, setAction, open, setOpen, participants, types, typesKey, reset, validate };
}
type MetadataController = ReturnType<typeof useChatComposerMetadata>;
export function ChatComposerMetadata({ controller, projectId, session, ownerKey, body, cursor, priority, disabled, onBodyChange, onPriorityChange, onChanged, onDenied }: {
 readonly controller: MetadataController; readonly projectId: string; readonly session: AuthenticatedSession; readonly ownerKey: string; readonly body: string; readonly cursor: number; readonly priority: PresentedPriority; readonly disabled: boolean;
 readonly onBodyChange: (body: string, cursor: number) => void; readonly onPriorityChange: (priority: PresentedPriority) => void; readonly onChanged: () => void; readonly onDenied?: (() => void) | undefined;
}) {
 const context = useConfiguredRuntime(); const client = useQueryClient(); const [typeName, setTypeName] = useState(""); const [creating, setCreating] = useState(false); const [error, setError] = useState(""); const pending = useRef(false); const owner = useRef(ownerKey); owner.current = ownerKey;
 useEffect(() => () => { owner.current = ""; }, []);
 const attempt = useRef<{ name: string; idempotencyKey: string } | null>(null);
 const { participants, types } = controller;
 const participantOptions = (participants.data?.items ?? []).map(person => ({ value: person.id, label: `${person.name} · ${person.role.replaceAll("_", " ")}${participants.data!.items.filter(other => other.name === person.name && other.role === person.role).length > 1 ? ` · ${person.id.slice(-6)}` : ""}` }));
 const mutateDraft = () => { if (!disabled) onChanged(); };
 async function createType() {
  const name = typeName.trim(); if (disabled || pending.current || !types.data?.canCreate || !canPerformOperation(session, "POST /projects/:projectId/chat/action-types") || !name || name.length > 60) return;
  if (!attempt.current || attempt.current.name !== name) attempt.current = { name, idempotencyKey: createClientMessageId() };
  const current = ownerKey; pending.current = true; setCreating(true); setError("");
  try {
   const type = await createChatActionType(context.runtime, projectId, attempt.current);
   if (owner.current !== current) return;
   client.setQueryData(controller.typesKey, { items: [...(types.data?.items.filter(item => item.id !== type.id) ?? []), type], canCreate: types.data.canCreate });
   void client.invalidateQueries({ predicate: query => query.queryKey[query.queryKey.length - 1] === "action-types" && JSON.stringify(query.queryKey) !== JSON.stringify(controller.typesKey) });
   controller.setAction({ typeId: type.id, dueDate: "" }); onPriorityChange(type.priority); onChanged(); setTypeName(""); attempt.current = null;
  } catch (cause) {
   if (owner.current !== current) return;
   if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) onDenied?.();
   else setError(cause instanceof ApiError ? cause.message : "Action creation could not be confirmed. Retry the same name to recover its result.");
  } finally { if (owner.current === current) { pending.current = false; setCreating(false); } }
 }
 return <View>
  <Button label={controller.action ? "Edit tracked action and mentions" : "Mentions and actions"} variant="quiet" disabled={disabled} onPress={() => controller.setOpen(true)} />
  {controller.action ? <KnowledgeText>{types.data?.items.find(type => type.id === controller.action?.typeId)?.name ?? "Action unavailable"} · {participants.data?.items.find(person => person.id === controller.responsibleUserId)?.name ?? "Choose responsible person"} · {controller.action.dueDate || "Choose due date"}</KnowledgeText> : controller.responsibleUserId ? <KnowledgeText>Responsible: {participants.data?.items.find(person => person.id === controller.responsibleUserId)?.name ?? "Unavailable participant"}</KnowledgeText> : null}
  {controller.open ? <KnowledgeModal title="Message mentions and actions" busy={disabled || creating} onClose={() => controller.setOpen(false)}>
   {(participants.isError || types.isError) ? <><KnowledgeText error>Current participants or action types could not be loaded.</KnowledgeText><Button label="Refresh message options" onPress={() => void Promise.all([participants.refetch(), types.refetch()])} /></> : null}
   <KnowledgeSelect label="Mention participant" value="" placeholder="Choose a person to mention" options={participantOptions} disabled={disabled || creating || participants.isFetching || participants.isError} onChange={id => {
    const person = participants.data?.items.find(item => item.id === id); if (!person) return;
    const position = Math.max(0, Math.min(cursor, body.length)); const prefix = position > 0 && !/\s/.test(body[position - 1]!) ? " " : ""; const mention = `@${person.name}`;
    const next = `${body.slice(0, position)}${prefix}${mention} ${body.slice(position)}`;
    controller.setMentions([...mentionsAfterEdit(body, next, controller.mentions), { userId: person.id, start: position + prefix.length, end: position + prefix.length + mention.length }].sort((a, b) => a.start - b.start));
    onBodyChange(next, position + prefix.length + mention.length + 1); mutateDraft(); controller.setOpen(false);
   }} />
   <KnowledgeText>A mention alerts a participant. Responsibility is selected separately.</KnowledgeText>
   <KnowledgeSelect label="Tracked action" value={controller.action?.typeId ?? ""} placeholder="No tracked action" options={(types.data?.items ?? []).map(type => ({ value: type.id, label: type.name }))} disabled={disabled || creating || types.isFetching || types.isError} onChange={id => {
    const type = types.data?.items.find(item => item.id === id); controller.setAction(type ? { typeId: type.id, dueDate: controller.action?.dueDate ?? "" } : null); onPriorityChange(type?.priority ?? "normal"); if (!type) controller.setResponsible(""); mutateDraft();
   }} />
   {priority !== "normal" || controller.action ? <KnowledgeSelect label={controller.action ? "Responsible participant" : "Responsible participant (optional)"} value={controller.responsibleUserId} placeholder="Unassigned" options={participantOptions} disabled={disabled || creating || participants.isError || participants.isFetching} onChange={id => { controller.setResponsible(id); mutateDraft(); }} /> : null}
   {controller.action ? <Field label="Action due date (YYYY-MM-DD)" value={controller.action.dueDate} editable={!disabled && !creating} maxLength={10} onChangeText={dueDate => { controller.setAction({ ...controller.action!, dueDate }); mutateDraft(); }} /> : null}
   {types.data?.canCreate && canPerformOperation(session, "POST /projects/:projectId/chat/action-types") ? <><KnowledgeText>New action types are available across project conversations and use Important priority.</KnowledgeText><Field label="New action type name" value={typeName} editable={!disabled && !creating} maxLength={60} onChangeText={setTypeName} /><Button label="Add action type" loading={creating} disabled={disabled || !typeName.trim()} onPress={() => void createType()} /></> : null}
   {error ? <KnowledgeText error>{error}</KnowledgeText> : null}
   <Button label="Done with message options" disabled={disabled || creating} onPress={() => controller.setOpen(false)} />
  </KnowledgeModal> : null}
 </View>;
}

/** Synthetic data for the opt-in enterprise messaging browser harness. Never used by production routes. */
import type { Role } from "../../api/authorization-contract";
import type { ProjectStatusSummary } from "../../api/types";
import { LISNO_AI, type ChatAssistantResult } from "../../features/messages/projectChatAssistantTypes";
import { chatTestMessage, chatTestPolicy } from "../../features/messages/projectChatFixtures";
import type {
  ChatActionType, ChatAttachment, ChatConversation, ChatConversationPage, ChatEventBatch,
  ChatIssueInput, ChatMessage, ChatMessagePage, ChatParticipant, ChatParticipantPage,
  ChatPerson, ChatReadInput, ChatRemovedParticipant, ChatSendInput, ChatSummary
} from "../../features/messages/projectChatTypes";

export interface EnterpriseMessagesOptions {
  role: Role;
  state?: "populated" | "empty" | "error" | "denied" | "loading" | "mutation-error";
  writable?: boolean;
}

interface SyntheticConversation {
  project: ChatSummary["project"];
  messages: ChatMessage[];
  participants: ChatParticipant[];
  removed: ChatRemovedParticipant[];
  lastReadSequence: number;
  revision: number;
}

const CLOCK = "2026-10-27T12:00:00.000Z";
const assistant = { ...LISNO_AI, available: true };
const noIssueCapabilities: ChatMessage["capabilities"] = {
  canRaise: false, canResolve: false, canReopen: false,
  canAssign: false, canAssignSelf: false, canReschedule: false
};
const failure = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });
const clone = <T,>(value: T): T => structuredClone(value);
const member = (person: ChatPerson, projectId: string): ChatParticipant => ({
  ...person, sources: [{ kind: person.role === "client" ? "client" : "project_assignment", id: projectId }], selection: null
});

// A generated geometric room study, with no external image or client content.
const previewPng = "iVBORw0KGgoAAAANSUhEUgAAAoAAAAFoCAIAAABIUN0GAAAK00lEQVR42u3aLW6UYRSG4bNENA7JAkg3QDBVJKwAi8PWYnAYPJkEU9E10AQEIbRMmZnz/jxXcm9gMud9LvPVl883d7cHSZLUWd0DzGBJktr6Ke8vgDEsSVIPvX8BGMOSJF2a3gcBxrAkSRfV9zGAGSxJ0iXo/TfAGJYk6ez0HgswhiVJOiO9TwMYw5IknUvfJwPMYEmSTqT3PwHGsCRJp9B7EsAYliTpFENPAhjDkiT6DgOYwZIk9I4BGMOSJPQOAxjDkiT0DgMYw5Ik+g4DmMGSJPSOARjDkiT0DgMYw5Ik9A4DGMOSJPoOA5jBkiT0jgEYw5KkcHpHAoxhSVIsveMBxrAkKVPfKQBmsCQpit6JAMawJCmH3ukAxrAkKYHeSQHGsCRpe33nBZjBkqRd6Z0dYAxLkrakdw2AMSxJ2ozelQDGsCRpJ30XA5jBkqQN6F0SYAxLkland2GAMSxJWpfe5QHGsCTRF8AMliShNwxgDEsSegGMYUkSevMAxrAk0RfADJYkoTcMYAxLEnoBjGFJEnrzAMawJNEXwAyWJEXTmwgwhiUJvQDGsCTpEMtQLsAYliT6ApjBkoReAGNYkoReAGNYktALYAxLkugLYAZLEnoBjGFJEnoBjGFJQi+AMSxJ9BWAGSxJ6AUwhiUJvQAWhiUJvQDGsCTRF8BisCShF8AYliT0AlgYloReARjDkkRfADNYktArAGNYktALYAxLEnoBLAxLEn0BzGBJQi+AhWFJ6BWAMSxJ6AWwMCyJvgIwgyUJvQAWhiWhVwDGsCT0CsDCsCT6AlgMloReAVgmQxJ6ASwMS0KvAJzX929fJen4zCaABWBJABaAASwJwAKwACwJwAAWgCUBWADWEQB/uvkgKTwAA1gAlgRgARjAkgAsAAvAkgAsAANYEoAFYAFYEoABLABLArAALABLAjCABWBJABaAAQxgSQAGsAAsCcACMIAlAdhyAlgAlgRgARjAkgAsAAvAkgAMYAFYEoAFYAFYEoABLABLArAADGAASwIwgAVgSQAWgAGsh7u6frNNd7eH39vmd7lSAANYAAYwgAEMYAEYwAAGMIAFYAALwAAGMIABLAADWAAGMIABDGABGMAABjCABWAAC8AABrAALAADGMAABrAADGAAAxjAABaABWAAAxjAAAawAAxgAAMYwAKwAAxgAAvAABaAAQxgAANYAAawAAxgAAMYwAIwgAEMYAALwAAWgAEMYAFYAAYwgAEMYAEYwAAGMIABLAALwAAGMIABDGABGMAABjCABWABGMAAFoABLAADGMAABrAADGDrA2AAAxjAABaAAQxgAANYAAawAAxgAAvAAjCAAQxgAAvAAAYwgAEMYAFYAAYwgAEMYAALwAAGMIABLAALwAAGsAAMYAEYwAAGMIAFYAADGMAAFoABLAADGMAABrAADGABGMAAFoAFYAADGMAAFoABDGAAAxjAArAADGAAAxjAABaAAQxgAANYABaAAQxgARjAAjCAAQxgAAvAAAYwgAEsAANYAAYwgAEMYAEYwAIwgAFsNgEsAAMYwAAGsAAMYAADGMAAFoAFYAADGMAABrAADGAAAxjAArAADGAAC8AAFoD36A+0NGGuFMAAFoABLAADWAAGMIABDGABGMACMIAFYAALwAAWgAEMYAADWAD2FbSvoH0FDWABGMACMIABLAALwAAGMIABLAADGMAABjCABWABGMAABjCAASwAAxjAAAawACwAAxjAAjCABWAAAxjAABaAASwAAxjAAAawAAxgAAMYwAIwgAVgAANYABaAAQxgAANYAAYwgAEMYAALwAIwgAEMYAADWAAGMIABDGABWAAGMIAFYAALwAAGMIABLAAD2PoAGMAABjCABWAAAxjAABaAASwAAxjAArAADGAAAxjAAjCAAQxgAANYABaAAQxgAAMYwAIwgAEMYAALwAIwgAEsAANYAAYwgAEMYAEYwAAGMIAFYAALwAAGMIABLAADWAAGMIAFYAEYwAAGMIAFYAADGMAABrAALAADGMAABjCABWAAAxjAABaABWAAA1gABrAADGAAAxjAAjCAAQxgAAvAABaAAQxgAANYAAawAAxgAJtNAAvAAAYwgAEsAAMYwAAGMIAFYAEYwAAGMIABLAADGMAABrAALAADGMACMIAFYAADGMAAFoABDGAAA1gABrAAfHTv3r6WJg/AArAALAEYwAAWgAEsAANYAAYwgCUAAxjAAjCABWAAC8AABrAEYAADWAAGsAAMYAEYwACWACwAC8ASgAEMYAEYwBKABWABWAIwgAEsAANYAAawAAxgAEsABjCABWAAC8AAFoABDGAJwAAGsAAMYAEYwAIwgAEsAVgAFoAlAAMYwAIwgCUAC8ACsARgAANYAAawAAxgARjAAJYADGAAC8AAFoABLAADGMASgAEMYIUAfPXq5fEZd83fk04awAIwgAEsARjAABaAASwAA1gABjCAJQALwAKwBGAAC8AABrAEYAFYAJYADGAAC8AAFoABLAADGMASgAEMYAEYwAIwgAVgAANYAjCAASwAA1gABrAADGAASwAWgAVg+y4AA1gABjCAJQALwAKwBGAAA1gABrAADGABWACWAAxgAAvAABaAASwAAxjAEoABDGABGMACMIAFYAADWAKwACwAA1gABrAADGAASwAWgAVgCcAABrAADGABGMACsAAsARjAABaAASwAA1gABvBiAEubBWABGMAAlgAMYAALwBKAASwAAxjAEoAFYAFYAjCABeB1+vj+es5MsJKb9mHeZzYBrG3pBbA0+fO0nwDWtvoCWABmsACMXgBLAMYwgJWhL4AFYAYLwPQFsARgDANYAfQCWFrxzVpaAGsHfQEsADNYAEYvgCUAYxjAytAXwAIwgwVg+gJYAjCGAawAegEsbfOQbTKA6QtgCcAMBrDQC2ApBmAMA5i+AJYAzGAAi74AlsIAxjCA0QtgCcAMBrDoC2ApDGAGAxi9AJYAjGEAi74AlsIAZjCA6StJGAaw0CuJwQIwfSWJwQBGr7btxfNneiQXgmEBmL4CMIDFYADTVwAGsDAsAKNXAAawGAxg+grAABaDASz0CsAAFoYBTF8BGMBiMIDp62kJwAAWhgGMXgEYwGIwgOkrSWIwgNErSRgGMH0licECMH0lCcMARq8kMRjA9PU8JInBAEavJGEYwPSVJDEYwPSVJAwDGL2SJAYDmL6SxGAAo1eShGEAu29JYjCA6StJymW40CtJYjCA6StJijC40CtJwjCA6StJijC46CtJwjCA0StJijC46CtJYjCA0StJimC46CtJYjCA6StJimC40CtJYjCA6StJijC40CtJwjCA6StJijC46CtJwjCA0StJijC46CtJYjCA0StJimC46CtJYjCA6StJimC40CtJYnA6wO5DkhRicKFXkoThUIBdgyQpzeCiryQJw1kA++8lSbEGF30lSQyOANifLUnCcNFXkqR+g4u+kiT1M1zolSSp3+CiryRJ/QYXeiVJ6me46CtJUr/BRV9JkvoZLvRKktRvcNFXkqR+gwu9kiT1M1z0lSSp3+CiryRJ/QwXeiVJ6je46CtJUr/BhV5JkvoZLvpKktRvcNFXkqR+hgu9kiT1G1z0lSSp3+BCryRJ/QwXfSVJ6je46CtJUj/DhV5JkvoNLvpKktRvcKFXkqR+hou+kiT1G/wD5O1XoN+j++IAAAAASUVORK5CYII=";
const previewBytes = () => Uint8Array.from(atob(previewPng), character => character.charCodeAt(0));

function syntheticPdf(): string {
  const content = "BT /F1 18 Tf 40 130 Td (Synthetic drawing review) Tj 0 -30 Td /F1 11 Tf (QA fixture: no client document or project information.) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(document.length); document += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const crossReference = document.length;
  return `${document}xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${crossReference}\n%%EOF\n`;
}

function silentWave(): Uint8Array {
  const data = new Uint8Array(44 + 8_000 * 2);
  const view = new DataView(data.buffer);
  const label = (offset: number, value: string) => [...value].forEach((letter, index) => { data[offset + index] = letter.charCodeAt(0); });
  label(0, "RIFF"); view.setUint32(4, data.length - 8, true); label(8, "WAVE"); label(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8_000, true); view.setUint32(28, 16_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  label(36, "data"); view.setUint32(40, data.length - 44, true);
  return data;
}

export function createEnterpriseMessages(options: EnterpriseMessagesOptions) {
  const writable = options.writable ?? true;
  const state = options.state ?? "populated";
  const user: ChatPerson = {
    id: options.role === "designer" ? "user-designer-ananya" : `${options.role}-1`,
    name: "Synthetic workspace reviewer", role: options.role
  };
  const manager = ["super_admin", "admin", "design_manager", "site_manager"].includes(options.role);
  const canManage = ["super_admin", "admin"].includes(options.role) && writable;
  const client: ChatPerson = options.role === "client" ? user : { id: "qa-client", name: "Aster Client", role: "client" };
  const designer: ChatPerson = options.role === "designer" ? user : { id: "qa-designer", name: "Rowan Designer", role: "designer" };
  const siteManager: ChatPerson = options.role === "site_manager" ? user : { id: "qa-manager", name: "Cedar Manager", role: "site_manager" };
  const worker: ChatPerson = { id: "qa-electrician", name: "Willow Electrician", role: "worker_electrician" };
  const eligible: ChatPerson = { id: "qa-procurement", name: "Ash Procurement", role: "procurement" };
  const actionTypes: ChatActionType[] = [
    { id: "action", name: "Action", priority: "important", builtIn: true },
    { id: "escalation", name: "Escalation", priority: "critical", builtIn: true },
    { id: "qa-design-review", name: "Design review", priority: "important", builtIn: false }
  ];
  const files: ChatAttachment[] = [
    { id: "qa-ceiling-drawing", kind: "document", filename: "Aster_Ceiling_Revision_03_Review_Notes.pdf", mimeType: "application/pdf", byteSize: syntheticPdf().length, preview: null },
    { id: "qa-room-study", kind: "image", filename: "Aster_Living_Room_Study_With_Long_Filename_For_Compact_Attachment_Layout.png", mimeType: "image/png", byteSize: 2828, preview: { mimeType: "image/png", byteSize: 2828, width: 640, height: 360 } },
    { id: "qa-voice-note", kind: "audio", filename: "Synthetic_site_voice_note.wav", mimeType: "audio/wav", byteSize: 16_044, preview: null },
    { id: "qa-older-notes", kind: "document", filename: "Earlier_material_review.txt", mimeType: "text/plain", byteSize: 41, preview: null }
  ];
  const conversations = new Map<string, SyntheticConversation>();
  const streams = new Map<string, Set<(batch: ChatEventBatch) => void>>();
  const stopStreams = new Set<() => void>();
  const replays = new Map<string, unknown>();

  function presentMessage(message: ChatMessage): ChatMessage {
    const owns = manager || message.raisedBy?.id === user.id || message.responsible?.id === user.id;
    return { ...clone(message), capabilities: !writable || message.author.kind === "service" ? noIssueCapabilities : {
      canRaise: message.priority === "normal" || message.priority === "important" && message.issueStatus === "open",
      canResolve: message.issueStatus === "open" && owns,
      canReopen: message.issueStatus === "resolved",
      canAssign: message.priority !== "normal" && (manager || message.raisedBy?.id === user.id),
      canAssignSelf: message.priority !== "normal",
      canReschedule: Boolean(message.action) && owns
    } };
  }

  const names = ["Aster courtyard residence", "Birch compact apartment", ...Array.from({ length: 31 }, (_, index) => `Cedar residence ${String(index + 3).padStart(2, "0")}`), "Zinnia courtyard 34"];
  names.forEach((name, index) => {
    const id = `qa-project-${index + 1}`;
    const people = [client, designer, siteManager, worker, user].filter((person, position, all) => all.findIndex(item => item.id === person.id) === position);
    const participantPeople = index === 1 ? [client, siteManager, user].filter((person, position, all) => all.findIndex(item => item.id === person.id) === position) : people;
    const conversation: SyntheticConversation = {
      project: { id, name, status: index === 1 || index % 4 === 3 ? "planning" : "active", nameVersion: 1 },
      messages: [], participants: participantPeople.map(person => member(person, id)), removed: [], lastReadSequence: 0, revision: 1
    };
    const add = (body: string, overrides: Partial<ChatMessage> = {}) => {
      const sequence = conversation.messages.length + 1;
      const createdAt = new Date(Date.parse(CLOCK) - index * 86_400_000 - (20 - sequence) * 60_000).toISOString();
      conversation.messages.push(chatTestMessage({ id: `${id}-message-${sequence}`, projectId: id, author: sequence % 2 ? designer : client,
        body, createdAt, sequence, clientMessageId: `${id}-attempt-${sequence}`, ...overrides }));
    };
    if (index === 0) {
      add("Initial room measurements are available for the review.");
      add("The material review from the previous meeting is attached.", { attachments: [files[3]!] });
      add("Please confirm the proposed outlet locations.");
      add("The sample schedule is ready for the project team.");
      add("I have uploaded the revised ceiling drawing and a room study for review.", { author: designer, attachments: files.slice(0, 2) });
      add("Please keep the warm lighting and allow a little more clearance above the curtain track.", { author: client });
      const action = { typeId: "escalation", typeName: "Escalation", originalDueDate: "2026-10-28", dueDate: "2026-10-29" };
      add(`@${user.name} Please confirm the ceiling clearance before the installation team starts.`, {
        author: siteManager, priority: "critical", issueStatus: "open", raisedBy: siteManager,
        responsible: { ...designer, available: true }, action,
        mentions: [{ userId: user.id, start: 0, end: user.name.length + 1 }], version: 2,
        issueHistory: [{ id: "qa-issue-raised", action: "raise", actor: siteManager, occurredAt: "2026-10-26T08:00:00.000Z", note: "Review is needed before installation.", priority: "critical", status: "open", responsibleUserId: designer.id, actionMetadata: { ...action, dueDate: action.originalDueDate } },
          { id: "qa-issue-rescheduled", action: "reschedule", actor: siteManager, occurredAt: "2026-10-27T09:00:00.000Z", note: "The revised drawing will be reviewed on Thursday.", priority: "critical", status: "open", responsibleUserId: designer.id, actionMetadata: action }]
      });
      add("I will review the updated drawing before tomorrow's site visit.", { author: user, replyTo: { id: `${id}-message-5`, author: designer, body: "I have uploaded the revised ceiling drawing and a room study for review.", attachmentSummary: { count: 2, kind: "document", filename: files[0]!.filename } } });
      add("Site voice note for the project team.", { author: worker, attachments: [files[2]!] });
      add("Confirm the switch plate sample with the client.", { author: siteManager, priority: "important", issueStatus: "open", raisedBy: siteManager, responsible: { ...worker, available: true }, action: { typeId: "action", typeName: "Action", originalDueDate: "2026-10-30", dueDate: "2026-10-30" } });
      add("The mock-up position has been confirmed.", { author: designer, priority: "important", issueStatus: "resolved", raisedBy: client, responsible: { ...designer, available: true }, issueHistory: [{ id: "qa-resolved", action: "resolve", actor: designer, occurredAt: "2026-10-27T10:00:00.000Z", note: "Client reviewed the marked position.", priority: "important", status: "resolved", responsibleUserId: designer.id }] });
      add("The next project action is the ceiling review.", { author: LISNO_AI, assistant: { runId: "qa-assistant-run", generation: 1, status: "answered", eligibleAt: CLOCK, resultId: "qa-assistant-result", checkedAt: CLOCK, notified: null, routing: "not_required", canRequest: false, failureCode: null } });
      conversation.lastReadSequence = 6;
    } else {
      add(index === 1 ? "The first layout review is scheduled for next week." : "The project team has shared its latest site update.", { author: siteManager });
      const critical = index === 1 ? 0 : index % 3;
      const important = index === 1 ? 2 : index % 4;
      for (let issue = 0; issue < critical; issue++) add(`Confirm critical site detail ${issue + 1}.`, { author: siteManager, priority: "critical", issueStatus: "open", raisedBy: siteManager, responsible: { ...siteManager, available: true } });
      for (let issue = 0; issue < important; issue++) add(`Review material selection ${issue + 1}.`, { author: client, priority: "important", issueStatus: "open", raisedBy: client, responsible: { ...siteManager, available: true } });
      conversation.lastReadSequence = index % 3 === 0 ? conversation.messages.length : Math.max(0, conversation.messages.length - (index % 2 + 1));
    }
    if (state === "empty") { conversation.messages = []; conversation.lastReadSequence = 0; }
    conversations.set(id, conversation);
  });

  function summary(conversation: SyntheticConversation): ChatSummary {
    const unread = conversation.messages.filter(message => message.sequence > conversation.lastReadSequence && message.author.id !== user.id);
    return {
      assistant, project: clone(conversation.project), participantCount: conversation.participants.length,
      counts: {
        openCritical: conversation.messages.filter(message => message.priority === "critical" && message.issueStatus === "open").length,
        openImportant: conversation.messages.filter(message => message.priority === "important" && message.issueStatus === "open").length,
        unread: unread.length, unreadMentions: unread.filter(message => message.mentions.some(mention => mention.userId === user.id)).length
      },
      cursor: `qa-${conversation.project.id}-${conversation.revision}`, lastReadSequence: conversation.lastReadSequence,
      latestMessageSequence: conversation.messages.at(-1)?.sequence ?? 0,
      capabilities: { canSend: writable, canManageIssues: manager && writable, canManageParticipants: canManage, canRenameProject: canManage },
      setupWarnings: []
    };
  }

  function participants(conversation: SyntheticConversation): ChatParticipantPage {
    return { assistant, setupWarnings: [], ...(canManage ? { removed: clone(conversation.removed) } : {}), items: conversation.participants.map(person => {
      const blocked = person.id === user.id ? "You cannot remove yourself." : person.role === "client" ? "The linked Client must remain in the conversation." : person.role === "super_admin" ? "The Super Admin must remain in the conversation." : undefined;
      return { ...clone(person), sources: canManage ? person.sources : [], selection: canManage ? person.selection : null,
        ...(canManage ? { removalVersion: person.removalVersion ?? 0, canRemove: !blocked, ...(blocked ? { removalBlockedReason: blocked } : {}) } : {}) };
    }) };
  }

  function list(params: URLSearchParams): ChatConversationPage {
    const all: ChatConversation[] = state === "empty" ? [] : [...conversations.values()].map(conversation => {
      const last = conversation.messages.at(-1);
      return { ...summary(conversation), lastMessageAt: last?.createdAt ?? null, lastMessage: last ? {
        id: last.id, author: last.author, excerpt: last.body.slice(0, 120), createdAt: last.createdAt,
        attachments: last.attachments.slice(0, 3).map(file => ({ id: file.id, filename: file.filename, kind: file.kind, hasPreview: Boolean(file.preview) })), attachmentCount: last.attachments.length
      } : null };
    }).sort((left, right) => (right.lastMessageAt ?? "").localeCompare(left.lastMessageAt ?? "") || left.project.name.localeCompare(right.project.name));
    const filter = params.get("filter") ?? "all";
    const search = params.get("search")?.trim().toLocaleLowerCase() ?? "";
    const matches = all.filter(item => item.project.name.toLocaleLowerCase().includes(search) && (filter === "all" || filter === "unread" && item.counts.unread > 0 || filter === "critical" && item.counts.openCritical > 0 || filter === "important" && item.counts.openImportant > 0));
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const limit = Math.max(1, Math.min(50, Number(params.get("limit")) || 30));
    return { items: matches.slice(offset, offset + limit), pagination: { limit, offset, total: matches.length, hasMore: offset + limit < matches.length }, totals: {
      unread: all.filter(item => item.counts.unread > 0).length,
      critical: all.reduce((sum, item) => sum + item.counts.openCritical, 0),
      important: all.reduce((sum, item) => sum + item.counts.openImportant, 0)
    } };
  }

  function messages(conversation: SyntheticConversation, params: URLSearchParams): ChatMessagePage {
    const filter = params.get("filter") ?? "all";
    const filtered = conversation.messages.filter(message => filter === "all" || filter === "mentions" && message.mentions.some(mention => mention.userId === user.id) || filter === "critical" && message.priority === "critical" && message.issueStatus === "open" || filter === "important" && message.priority === "important" && message.issueStatus === "open" || filter === "resolved" && message.issueStatus === "resolved");
    const requestedLimit = Math.max(1, Math.min(100, Number(params.get("limit")) || 40));
    const limit = params.has("around") ? requestedLimit : Math.min(requestedLimit, 8);
    let selected: ChatMessage[];
    if (params.has("around")) {
      const position = filtered.findIndex(message => message.id === params.get("around"));
      selected = position < 0 ? [] : filtered.slice(Math.max(0, position - Math.floor(limit / 2)), Math.max(0, position - Math.floor(limit / 2)) + limit);
    } else if (params.has("after")) selected = filtered.filter(message => message.sequence > Number(params.get("after"))).slice(0, limit);
    else selected = filtered.filter(message => !params.has("before") || message.sequence < Number(params.get("before"))).slice(-limit);
    const first = selected[0]?.sequence;
    const last = selected.at(-1)?.sequence;
    return { items: selected.map(presentMessage), olderCursor: first !== undefined && filtered.some(message => message.sequence < first) ? String(first) : null,
      newerCursor: last !== undefined && filtered.some(message => message.sequence > last) ? String(last) : null,
      snapshotCursor: summary(conversation).cursor, latestMessageSequence: conversation.messages.at(-1)?.sequence ?? 0 };
  }

  function status(conversation: SyntheticConversation): ProjectStatusSummary {
    return { projectId: conversation.project.id, projectName: conversation.project.name, projectStatus: conversation.project.status, serverNow: CLOCK,
      state: "active", currentStage: { key: "design_review", label: "Design review" }, issue: null,
      pendingActions: [{ id: `${conversation.project.id}-next-action`, stageKey: "design_review", stageLabel: "Design review",
        action: conversation.project.id === "qa-project-1" ? "Review revised ceiling drawing" : "Review initial layout",
        state: "pending", responsibleRole: "designer", people: [designer], scheduledAt: null, deadlineAt: "2026-10-29T12:30:00.000Z", blocker: null }]
    };
  }

  function read(path: string, params = new URLSearchParams()): unknown {
    if (path === "/chat/availability") return { timezone: "Asia/Kolkata", writable, nextOpenAt: writable ? null : "2099-01-01T02:00:00.000Z", nextChangeAt: "2099-01-01T02:00:00.000Z" };
    if (path === "/daily-critical-tasks") return null;
    if (path === "/daily-critical-tasks/current") return { timezone: "Asia/Kolkata", checkedAt: CLOCK, items: [], receipt: null };
    if (path === "/notifications" || path === "/project-manager/notifications") return { items: [], unreadCount: 0, pagination: { limit: 20, offset: 0, total: 0, hasMore: false } };
    if (path === "/project-messages") return state === "denied" ? failure(403, "FORBIDDEN", "Project conversations are unavailable.") : list(params);
    const match = path.match(/^\/projects\/([^/]+)\/(chat(?:\/.*)?|status)$/);
    if (!match) return undefined;
    const conversation = conversations.get(decodeURIComponent(match[1]!));
    if (!conversation || state === "denied") return failure(404, "NOT_FOUND", "The requested resource was not found.");
    const suffix = match[2]!;
    if (suffix === "status") return status(conversation);
    if (suffix === "chat") return summary(conversation);
    if (suffix === "chat/messages") return messages(conversation, params);
    if (suffix === "chat/participants") return participants(conversation);
    if (suffix === "chat/participant-options") return canManage ? { items: conversation.participants.some(person => person.id === eligible.id) || !`${eligible.name} ${eligible.role}`.toLocaleLowerCase().includes((params.get("search") ?? "").toLocaleLowerCase()) ? [] : [eligible], hasMore: false } : failure(403, "FORBIDDEN", "Participant management is unavailable.");
    if (suffix === "chat/action-types") return { items: clone(actionTypes), canCreate: options.role === "super_admin" && writable };
    if (suffix === "chat/attachment-policy") return { ...chatTestPolicy(), capabilities: { canUpload: writable, canRecord: writable } };
    if (suffix === "chat/assistant/results/qa-assistant-result" && conversation.project.id === "qa-project-1") return {
      id: "qa-assistant-result", projectId: conversation.project.id, messageId: "qa-project-1-message-12", kind: "status", checkedAt: CLOCK,
      stale: false, commercialAccess: "none", disclosurePolicy: "project-publication-v1", projectPricing: null,
      narrative: [{ text: "The next project action is the ceiling review, due on 29 October.", factIds: ["qa-review-due"] }],
      facts: [{ id: "qa-review-due", label: "Ceiling review", value: "Due 29 October 2026", source: { id: "qa-status-source", label: "Project workflow status", href: null } }],
      candidates: [], missingInputs: [], commercial: null
    } satisfies ChatAssistantResult;
    const attachment = suffix.match(/^chat\/attachments\/([^/]+)\/(preview|content)$/);
    if (attachment) {
      const file = conversation.messages.flatMap(message => message.attachments).find(item => item.id === attachment[1]);
      if (!file) return failure(404, "NOT_FOUND", "The requested resource was not found.");
      if (file.id === "qa-room-study") return new Response(previewBytes().buffer as ArrayBuffer, { headers: { "Content-Type": "image/png", "Content-Length": String(file.byteSize) } });
      if (file.id === "qa-voice-note") return new Response(silentWave().buffer as ArrayBuffer, { headers: { "Content-Type": "audio/wav", "Content-Length": String(file.byteSize) } });
      return new Response(file.id === "qa-ceiling-drawing" ? syntheticPdf() : "Synthetic QA material review notes only.\n", { headers: { "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="${file.filename}"` } });
    }
    return undefined;
  }

  function publish(conversation: SyntheticConversation, type: ChatEventBatch["events"][number]["type"], recordId: string, version: number) {
    conversation.revision += 1;
    const batch: ChatEventBatch = { events: [{ id: `qa-event-${conversation.project.id}-${conversation.revision}`, projectId: conversation.project.id,
      sequence: conversation.revision, type, recordId, version, occurredAt: CLOCK }], cursor: summary(conversation).cursor, hasMore: false, resync: false };
    for (const emit of streams.get(conversation.project.id) ?? []) emit(batch);
  }

  function mutate(method: string, path: string, body: unknown): unknown {
    const match = path.match(/^\/projects\/([^/]+)\/chat(?:\/(.*))?$/);
    if (!match) return undefined;
    const conversation = conversations.get(decodeURIComponent(match[1]!));
    if (!conversation || state === "denied") return failure(404, "NOT_FOUND", "The requested resource was not found.");
    const suffix = match[2] ?? "";
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    if (suffix === "read" && method === "PUT") {
      const readInput = input as unknown as ChatReadInput;
      if (conversation.messages.some(message => message.id === readInput.messageId && message.sequence === readInput.sequence)) conversation.lastReadSequence = Math.max(conversation.lastReadSequence, readInput.sequence);
      return { lastReadSequence: conversation.lastReadSequence, counts: summary(conversation).counts };
    }
    if (suffix === "typing" && method === "PUT") return { sequence: input.sequence, typing: writable && input.typing === true, expiresAt: input.typing && writable ? "2099-01-01T00:00:00.000Z" : null };
    if (!writable) return failure(403, "CHAT_CLOSED", "Chat is read-only until 7:30 AM India time.");
    if (state === "mutation-error") return failure(503, "SYNTHETIC_MUTATION_FAILURE", "Synthetic QA: the change was not saved. Your values remain available to review.");
    const replayKey = `${method}:${path}:${String(input.idempotencyKey ?? input.clientMessageId ?? "")}`;
    if (replays.has(replayKey)) return clone(replays.get(replayKey));
    const remember = <T,>(data: T) => { replays.set(replayKey, clone(data)); return data; };
    if (suffix === "messages" && method === "POST") {
      const send = input as unknown as ChatSendInput;
      if (!send.body?.trim() || !send.clientMessageId) return failure(400, "CHAT_INVALID_INPUT", "Enter a message.");
      if (send.attachmentIds?.length) return failure(400, "CHAT_INVALID_INPUT", "Synthetic attachment uploads are not enabled in this fixture.");
      const type = send.action ? actionTypes.find(item => item.id === send.action?.typeId) : undefined;
      const owner = conversation.participants.find(person => person.id === send.responsibleUserId);
      if (send.action && (!type || !owner || !send.action.dueDate)) return failure(400, "CHAT_INVALID_INPUT", "Select an action, responsible person, and due date.");
      const replied = conversation.messages.find(message => message.id === send.replyToId);
      const priority = type?.priority ?? send.priority;
      const sequence = (conversation.messages.at(-1)?.sequence ?? 0) + 1;
      const message = chatTestMessage({ id: `${conversation.project.id}-message-${sequence}`, projectId: conversation.project.id, author: user,
        body: send.body, mentions: send.mentions ?? [], sequence, createdAt: new Date(Date.parse(CLOCK) + sequence * 60_000).toISOString(), clientMessageId: send.clientMessageId,
        replyTo: replied ? { id: replied.id, author: replied.author, body: replied.body } : null,
        priority, issueStatus: priority === "normal" ? null : "open", raisedBy: priority === "normal" ? null : user,
        responsible: owner ? { ...owner, available: true } : null,
        ...(type && send.action ? { action: { typeId: type.id, typeName: type.name, originalDueDate: send.action.dueDate, dueDate: send.action.dueDate } } : {})
      });
      conversation.messages.push(message); publish(conversation, "message.created", message.id, message.version);
      return remember(presentMessage(message));
    }
    const issueMatch = suffix.match(/^messages\/([^/]+)\/issue$/);
    if (issueMatch && method === "PATCH") {
      const message = conversation.messages.find(item => item.id === issueMatch[1]);
      if (!message) return failure(404, "NOT_FOUND", "The requested resource was not found.");
      const update = input as unknown as ChatIssueInput;
      if (update.expectedVersion !== message.version) return failure(409, "CHAT_CONFLICT", "The conversation changed. Refresh its current state and retry.");
      const capabilities = presentMessage(message).capabilities;
      const permitted = update.action === "raise" || update.action === "escalate" ? capabilities.canRaise : update.action === "resolve" || update.action === "lower" || update.action === "clear" ? capabilities.canResolve : update.action === "reopen" ? capabilities.canReopen : update.action === "reschedule" ? capabilities.canReschedule : update.action === "assign" && (capabilities.canAssign || update.responsibleUserId === user.id && capabilities.canAssignSelf);
      if (!permitted) return failure(403, "FORBIDDEN", "This issue update is unavailable.");
      if (["resolve", "reopen", "lower", "clear", "reschedule"].includes(update.action) && !update.note?.trim()) return failure(400, "CHAT_INVALID_INPUT", "A reason is required.");
      if (update.action === "raise") { message.priority = update.priority ?? "important"; message.issueStatus = "open"; message.raisedBy = user; }
      if (update.action === "escalate") message.priority = "critical";
      if (update.action === "resolve") message.issueStatus = "resolved";
      if (update.action === "reopen") message.issueStatus = "open";
      if (update.action === "lower") message.priority = "important";
      if (update.action === "clear") { if (message.action) return failure(400, "CHAT_INVALID_INPUT", "A tracked action must retain its priority."); message.priority = "normal"; message.issueStatus = null; message.raisedBy = null; message.responsible = null; }
      if (update.action === "assign") {
        const person = conversation.participants.find(item => item.id === update.responsibleUserId);
        if (update.responsibleUserId && !person || message.action && !person) return failure(400, "CHAT_INVALID_INPUT", "Select a current participant.");
        message.responsible = person ? { ...person, available: true } : null;
      }
      if (update.action === "reschedule" && message.action) { if (!update.dueDate) return failure(400, "CHAT_INVALID_INPUT", "Choose a due date."); message.action.dueDate = update.dueDate; }
      message.version += 1;
      message.issueHistory.push({ id: `qa-history-${message.id}-${message.version}`, actor: user, occurredAt: CLOCK, action: update.action, note: update.note ?? "", priority: message.priority, status: message.issueStatus, responsibleUserId: message.responsible?.id ?? null, actionMetadata: message.action ? clone(message.action) : null });
      publish(conversation, "issue.changed", message.id, message.version);
      return remember(presentMessage(message));
    }
    if (suffix === "action-types" && method === "POST") {
      if (options.role !== "super_admin") return failure(403, "FORBIDDEN", "Action type creation is unavailable.");
      const name = String(input.name ?? "").trim();
      if (!name) return failure(400, "CHAT_INVALID_INPUT", "Enter an action type name.");
      const type: ChatActionType = { id: `qa-action-type-${actionTypes.length}`, name, priority: "important", builtIn: false };
      actionTypes.push(type); return remember(type);
    }
    if (suffix === "project-name" && method === "PATCH") {
      if (!canManage) return failure(403, "FORBIDDEN", "Project naming is unavailable.");
      if (input.expectedVersion !== conversation.project.nameVersion) return failure(409, "CHAT_CONFLICT", "The project name has changed.");
      const name = String(input.name ?? "").trim();
      if (!name) return failure(400, "CHAT_INVALID_INPUT", "Enter a project name.");
      conversation.project.name = name; conversation.project.nameVersion = (conversation.project.nameVersion ?? 1) + 1;
      return remember(summary(conversation));
    }
    if (suffix === "participants" && method === "POST") {
      if (!canManage) return failure(403, "FORBIDDEN", "Participant management is unavailable.");
      if (!String(input.reason ?? "").trim() || input.userId !== eligible.id) return failure(400, "CHAT_INVALID_INPUT", "Choose an eligible participant and enter a reason.");
      if (!conversation.participants.some(person => person.id === eligible.id)) conversation.participants.push({ ...member(eligible, conversation.project.id), sources: [{ kind: "selection", id: "qa-selection" }], selection: { id: "qa-selection", version: 1 } });
      publish(conversation, "participants.changed", eligible.id, 1); return remember(participants(conversation));
    }
    const participantMatch = suffix.match(/^participants\/([^/]+)\/(remove|restore)$/);
    if (participantMatch && method === "POST") {
      if (!canManage) return failure(403, "FORBIDDEN", "Participant management is unavailable.");
      if (!String(input.reason ?? "").trim()) return failure(400, "CHAT_INVALID_INPUT", "Enter a reason.");
      const personId = participantMatch[1]!;
      if (participantMatch[2] === "remove") {
        const person = participants(conversation).items.find(item => item.id === personId);
        if (!person?.canRemove) return failure(403, "FORBIDDEN", "This participant must remain in the conversation.");
        if (input.expectedVersion !== person.removalVersion) return failure(409, "CHAT_CONFLICT", "This participant has changed.");
        conversation.participants = conversation.participants.filter(item => item.id !== personId);
        conversation.removed.push({ id: person.id, name: person.name, role: person.role, removalVersion: (person.removalVersion ?? 0) + 1, canRestore: true });
      } else {
        const person = conversation.removed.find(item => item.id === personId);
        if (!person) return failure(404, "NOT_FOUND", "The requested resource was not found.");
        if (input.expectedVersion !== person.removalVersion) return failure(409, "CHAT_CONFLICT", "This participant has changed.");
        conversation.participants.push({ ...member(person, conversation.project.id), removalVersion: person.removalVersion + 1 });
        conversation.removed = conversation.removed.filter(item => item.id !== personId);
      }
      publish(conversation, "participants.changed", personId, conversation.revision + 1); return remember(participants(conversation));
    }
    return undefined;
  }

  function stream(path: string, signal?: AbortSignal | null): Response | undefined {
    const match = path.match(/^\/projects\/([^/]+)\/chat\/events$/);
    if (!match && !["/notifications/events", "/execution/events"].includes(path)) return undefined;
    const projectId = match?.[1];
    if (projectId && (!conversations.has(projectId) || state === "denied")) return failure(404, "NOT_FOUND", "The requested resource was not found.");
    let cancel = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const emit = (batch: ChatEventBatch) => { if (!closed) controller.enqueue(encoder.encode(`event: chat\ndata: ${JSON.stringify(batch)}\n\n`)); };
        const heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": synthetic heartbeat\n\n")); }, 20_000);
        const clean = () => { closed = true; clearInterval(heartbeat); signal?.removeEventListener("abort", stop); stopStreams.delete(stop); if (projectId) streams.get(projectId)?.delete(emit); };
        const stop = () => { if (!closed) { clean(); controller.close(); } };
        cancel = clean; stopStreams.add(stop);
        if (projectId) { if (!streams.has(projectId)) streams.set(projectId, new Set()); streams.get(projectId)!.add(emit); }
        if (signal?.aborted) { stop(); return; }
        signal?.addEventListener("abort", stop, { once: true });
        controller.enqueue(encoder.encode('event: state\ndata: {"status":"live"}\n\n'));
      },
      cancel() { cancel(); }
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }

  return { read, mutate, stream, dispose: () => { for (const stop of stopStreams) stop(); }, projectIds: [...conversations.keys()] };
}

import { ApiProtocolError } from "../../core/http/apiClient";
import {
  presentChatParticipantOptions,
  presentChatParticipantPage,
  type PresentedChatParticipantOptions,
  type PresentedChatParticipantPage
} from "./chatModel";

export const CHAT_PARTICIPANT_OPTION_LIMIT = 30;
export const CHAT_PARTICIPANT_SEARCH_MAX_LENGTH = 100;

export function normalizeChatParticipantSearch(value: string): string {
  return value.trim().slice(0, CHAT_PARTICIPANT_SEARCH_MAX_LENGTH);
}

function chatPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/chat`;
}

export function buildChatParticipantsPath(projectId: string): string {
  return `${chatPath(projectId)}/participants`;
}

export function buildChatParticipantOptionsPath(projectId: string, search: string): string {
  const parameters = new URLSearchParams();
  const normalizedSearch = normalizeChatParticipantSearch(search);
  if (normalizedSearch) parameters.set("search", normalizedSearch);
  parameters.set("limit", String(CHAT_PARTICIPANT_OPTION_LIMIT));
  return `${chatPath(projectId)}/participant-options?${parameters.toString()}`;
}

export function requireChatParticipantPage(value: unknown): PresentedChatParticipantPage {
  const page = presentChatParticipantPage(value);
  if (!page) throw new ApiProtocolError();
  return page;
}

export function requireChatParticipantOptions(value: unknown): PresentedChatParticipantOptions {
  const options = presentChatParticipantOptions(value);
  if (!options) throw new ApiProtocolError();
  return options;
}

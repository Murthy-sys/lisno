import { AssistantFailure } from "../domain/project-chat-assistant.js";
import type { AssistantProvider } from "./project-assistant-provider.js";

/** Retired compatibility boundary. Neither chat surface can construct a cloud provider. */
export function createGeminiAssistantProvider(_options: {apiKey: string; model: string; fetch?: typeof fetch; requestTimeoutMs?: number}): AssistantProvider {
  throw new AssistantFailure("ASSISTANT_CLOUD_PROVIDER_DISABLED");
}

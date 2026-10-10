import type { AssistantGeneratedResult, AssistantReadSources, AssistantFactBundle } from "../contracts/project-chat-assistant.js";
import type { AskLisnoResolution } from "../contracts/ask-lisno.js";

export interface AssistantProviderContext {
  messages: Array<{id: string; body: string; hasAttachments?: boolean}>;
  sources: AssistantReadSources;
  /** Only private Ask Lisno requests provide these allowlisted account facts. */
  profile?: () => Promise<AssistantFactBundle>;
  projectAvailable?: boolean | (() => boolean);
  /** Private-only resolver binds an authorized stable project before any project read. */
  resolveProject?: (input: {name: string | null}) => Promise<AskLisnoResolution>;
  signal: AbortSignal;
  reserveAttempt(payloadBytes: number): Promise<string>;
  settleAttempt(reservationId: string, usage: {inputTokens: number; outputTokens: number} | null): Promise<void>;
}
export interface AssistantProvider { generate(context: AssistantProviderContext): Promise<AssistantGeneratedResult> }

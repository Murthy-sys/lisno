import { z } from "zod";
import { ApiError } from "../../api/client";
import { assistantId, parseAssistantAnswer } from "./assistantAnswerSchema";
import type { ChatAssistantResult } from "./projectChatAssistantTypes";

const envelope = z.object({ id: assistantId, projectId: assistantId, messageId: assistantId, checkedAt: z.string().datetime({ offset: true }), stale: z.boolean(), commercialAccess: z.enum(["allowed", "restricted", "none"]) });
export function parseAssistantResult(value: unknown, projectId: string, resultId: string): ChatAssistantResult {
  try {
    const metadata = envelope.parse(value);
    if (metadata.projectId !== projectId || metadata.id !== resultId) throw new Error();
    const raw = { ...(value as Record<string, unknown>) };
    for (const key of Object.keys(metadata)) delete raw[key];
    const answer = parseAssistantAnswer(raw);
    if (answer.projectPricing && (metadata.stale || metadata.commercialAccess !== "allowed")) throw new Error();
    return { ...metadata, ...answer };
  } catch { throw new ApiError(502, "ASSISTANT_INVALID_RESPONSE", "This answer could not be verified."); }
}

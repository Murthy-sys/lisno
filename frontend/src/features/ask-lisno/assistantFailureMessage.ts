import { ApiError } from "../../api/client";

/** Only application-owned recovery copy may cross the assistant UI boundary. */
export function assistantFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "ASSISTANT_BUSY") return "Lisno AI is answering another request. Please try again shortly.";
    if (["ASSISTANT_TIMEOUT", "ASSISTANT_TIME_LIMIT"].includes(error.code)) return "Lisno AI took too long to answer. Please try again or message your project team.";
    if (error.code === "ASSISTANT_CONTEXT_LIMIT") return "This question or conversation is too long. Try a shorter question.";
    if (error.status === 429) return "The AI request limit has been reached. Please try again later.";
  }
  return "Lisno AI could not answer right now. Try again or contact your project team.";
}

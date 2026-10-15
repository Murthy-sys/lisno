import { ApiError, ApiNetworkError, ApiTimeoutError } from "../../core/http/apiClient";

export function retryAssistantRead(count: number, error: unknown): boolean {
  if (count >= 1) return false;
  return error instanceof ApiNetworkError || error instanceof ApiTimeoutError
    || error instanceof ApiError && [502, 503, 504].includes(error.status);
}

export function assistantFailureNotice(code: string | null): string {
  if (code === "ASSISTANT_BUSY") return "Lisno AI is busy. Please retry shortly.";
  if (["ASSISTANT_RATE_LIMIT", "ASSISTANT_ADMISSION_LIMIT", "ASSISTANT_TOKEN_LIMIT"].includes(code ?? "")) return "Lisno AI has reached its current usage limit. Please try again later.";
  if (code === "ASSISTANT_TIMEOUT") return "Lisno AI took too long to reply. You can retry your question.";
  if (code === "ASSISTANT_CONTEXT_LIMIT") return "This question has too much context. Try a shorter question in a new message.";
  return "Lisno AI could not reply right now. You can retry your question.";
}

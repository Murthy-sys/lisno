import type { ChatMentionEmailInput } from "./chat-mention-mailer.js";
import { escapeMailHtml } from "./smtp-transport.js";

export function renderChatMentionEmail(
  publicFrontendUrl: string,
  input: ChatMentionEmailInput
): { subject: string; text: string; html: string } {
  const frontendUrl = new URL(publicFrontendUrl);
  if (frontendUrl.protocol !== "https:" && frontendUrl.protocol !== "http:") {
    throw new Error("Chat notification frontend URL is invalid.");
  }
  const messageUrl = `${frontendUrl.origin}/projects/${encodeURIComponent(input.projectId)}/messages?message=${encodeURIComponent(input.messageId)}`;
  const mentionDescription = input.kind === "chat.mention"
    ? "mentioned you"
    : "mentioned someone";
  const summary = `${input.actorName} ${mentionDescription} in ${input.projectName}.`;
  const oversightNotice = input.kind === "chat.mention.oversight"
    ? "You received this notification as Super Admin."
    : undefined;

  return {
    subject: `Lisno: ${input.actorName} ${mentionDescription} in ${input.projectName}`
      .replace(/[\r\n]+/g, " "),
    text: [
      `Hello ${input.recipient.name},`,
      "",
      summary,
      ...(oversightNotice ? [oversightNotice] : []),
      "",
      input.excerpt,
      "",
      `Open message and reply: ${messageUrl}`,
      "Sign in to Lisno to view the conversation and reply."
    ].join("\n"),
    html: [
      "<!doctype html>",
      "<html><body>",
      `<p>Hello ${escapeMailHtml(input.recipient.name)},</p>`,
      `<p>${escapeMailHtml(summary)}</p>`,
      ...(oversightNotice ? [`<p>${oversightNotice}</p>`] : []),
      `<blockquote style="white-space: pre-wrap">${escapeMailHtml(input.excerpt)}</blockquote>`,
      `<p><a href="${escapeMailHtml(messageUrl)}">Open message and reply</a></p>`,
      "<p>Sign in to Lisno to view the conversation and reply.</p>",
      "</body></html>"
    ].join("")
  };
}

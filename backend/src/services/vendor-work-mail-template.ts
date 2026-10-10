import { escapeMailHtml } from "./smtp-transport.js";
import type { VendorWorkMail } from "./vendor-work-mailer.js";
export function vendorWorkMailTemplate(input: VendorWorkMail, publicFrontendUrl: string) {
  const url = `${publicFrontendUrl.replace(/\/$/, "")}/vendor`;
  const instruction = input.setupPending ? "Use your previously sent invitation to create your password, then sign in to review your assigned work." : "Sign in to review your assigned Main Lines and update work progress.";
  return {
    subject: "New work assigned in Lisno",
    text: [`Hello ${input.recipient.name},`, "A work order has been issued to you in Lisno.", instruction, `View assigned work: ${url}`].join("\n\n"),
    html: `<html><body><p>Hello ${escapeMailHtml(input.recipient.name)},</p><p>A work order has been issued to you in Lisno.</p><p>${escapeMailHtml(instruction)}</p><p><a href="${escapeMailHtml(url)}">View assigned work</a></p></body></html>`
  };
}

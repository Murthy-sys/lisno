import nodemailer from "nodemailer";
import type { VendorInductionMailer } from "./vendor-induction-mailer.js";
import { createIsolatedSmtpTransport, escapeMailHtml, parseMailbox, safeMailDeliveryError, type MailDeliveryConfig } from "./smtp-transport.js";

export function createSmtpVendorInductionMailer(config: Extract<MailDeliveryConfig, { kind: "smtp" }>): Extract<VendorInductionMailer, { deliveryKind: "external" | "local_test" }> {
  const sender = parseMailbox(config.from);
  const transport = nodemailer.createTransport(createIsolatedSmtpTransport(config));
  return { deliveryKind: "external", async sendRequest({ recipient, rawToken, expiresAt, changeNote }) {
    const url = `${config.publicFrontendUrl}/vendor-induction#token=${encodeURIComponent(rawToken)}`;
    const note = changeNote ? `\n\nProcurement note: ${changeNote}` : "";
    try {
      await transport.sendMail({ from: sender, to: { name: recipient.name, address: recipient.email },
        subject: "Complete your Lisno vendor induction",
        text: `Hello ${recipient.name},\n\nPlease complete your vendor induction: ${url}${note}\n\nThis link expires at ${expiresAt} and can be used once.`,
        html: `<!doctype html><html><body><p>Hello ${escapeMailHtml(recipient.name)},</p><p>Please complete your vendor induction: <a href="${escapeMailHtml(url)}">Open induction</a></p>${changeNote ? `<p>Procurement note: ${escapeMailHtml(changeNote)}</p>` : ""}<p>This link expires at ${escapeMailHtml(expiresAt)} and can be used once.</p></body></html>`,
        disableFileAccess: true, disableUrlAccess: true, xMailer: false });
    } catch (error) { throw safeMailDeliveryError(error); }
  } };
}

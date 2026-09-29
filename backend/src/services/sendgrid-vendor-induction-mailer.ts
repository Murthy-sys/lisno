import type { VendorInductionMailer } from "./vendor-induction-mailer.js";
import { createIsolatedSendGridTransport, parseSendGridMailbox, safeSendGridDeliveryError, type MailDeliveryConfig, type SendGridTransport } from "./sendgrid-transport.js";
import { escapeMailHtml } from "./smtp-transport.js";

export function createSendGridVendorInductionMailer(config: Extract<MailDeliveryConfig, { kind: "sendgrid_web_api" }>, transport: SendGridTransport = createIsolatedSendGridTransport(config)): Extract<VendorInductionMailer, { deliveryKind: "external" | "local_test" }> {
  const sender = parseSendGridMailbox(config.from);
  return { deliveryKind: "external", async sendRequest({ recipient, rawToken, expiresAt, changeNote }) {
    const url = `${config.publicFrontendUrl}/vendor-induction#token=${encodeURIComponent(rawToken)}`;
    const note = changeNote ? `\n\nProcurement note: ${changeNote}` : "";
    try {
      await transport.send({ from: sender, to: { name: recipient.name, email: recipient.email },
        subject: "Complete your Lisno vendor induction",
        text: `Hello ${recipient.name},\n\nPlease complete your vendor induction: ${url}${note}\n\nThis link expires at ${expiresAt} and can be used once.`,
        html: `<!doctype html><html><body><p>Hello ${escapeMailHtml(recipient.name)},</p><p>Please complete your vendor induction: <a href="${escapeMailHtml(url)}">Open induction</a></p>${changeNote ? `<p>Procurement note: ${escapeMailHtml(changeNote)}</p>` : ""}<p>This link expires at ${escapeMailHtml(expiresAt)} and can be used once.</p></body></html>` });
    } catch (error) { throw safeSendGridDeliveryError(error); }
  } };
}

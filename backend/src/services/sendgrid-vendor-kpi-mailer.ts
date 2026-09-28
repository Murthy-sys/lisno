import type { VendorKpiMailer } from "./vendor-kpi-mailer.js";
import { createIsolatedSendGridTransport, parseSendGridMailbox, safeSendGridDeliveryError, type MailDeliveryConfig, type SendGridTransport } from "./sendgrid-transport.js";
import { escapeMailHtml } from "./smtp-transport.js";

export function createSendGridVendorKpiMailer(config: Extract<MailDeliveryConfig, { kind: "sendgrid_web_api" }>, transport: SendGridTransport = createIsolatedSendGridTransport(config)): Extract<VendorKpiMailer, { deliveryKind: "external" }> {
  const sender = parseSendGridMailbox(config.from);
  return { deliveryKind: "external", async sendRequest({ recipient, rawToken, expiresAt }) {
    const url = `${config.publicFrontendUrl}/vendor-kpi#token=${encodeURIComponent(rawToken)}`;
    try {
      await transport.send({ from: sender, to: { name: recipient.name, email: recipient.email },
        subject: "Your Lisno vendor KPI self assessment",
        text: `Hello ${recipient.name},\n\nPlease enter your vendor KPI self assessment: ${url}\n\nThis link expires at ${expiresAt} and can be used once.`,
        html: `<!doctype html><html><body><p>Hello ${escapeMailHtml(recipient.name)},</p><p>Please enter your vendor KPI self assessment: <a href="${escapeMailHtml(url)}">Open assessment</a></p><p>This link expires at ${escapeMailHtml(expiresAt)} and can be used once.</p></body></html>` });
    } catch (error) { throw safeSendGridDeliveryError(error); }
  } };
}

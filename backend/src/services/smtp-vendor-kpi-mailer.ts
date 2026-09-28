import nodemailer from "nodemailer";
import type { VendorKpiMailer } from "./vendor-kpi-mailer.js";
import { createIsolatedSmtpTransport, escapeMailHtml, parseMailbox, safeMailDeliveryError, type MailDeliveryConfig } from "./smtp-transport.js";

export function createSmtpVendorKpiMailer(config: Extract<MailDeliveryConfig, { kind: "smtp" }>): Extract<VendorKpiMailer, { deliveryKind: "external" }> {
  const sender = parseMailbox(config.from);
  const transport = nodemailer.createTransport(createIsolatedSmtpTransport(config));
  return { deliveryKind: "external", async sendRequest({ recipient, rawToken, expiresAt }) {
    const url = `${config.publicFrontendUrl}/vendor-kpi#token=${encodeURIComponent(rawToken)}`;
    try {
      await transport.sendMail({ from: sender, to: { name: recipient.name, address: recipient.email },
        subject: "Your Lisno vendor KPI self assessment",
        text: `Hello ${recipient.name},\n\nPlease enter your vendor KPI self assessment: ${url}\n\nThis link expires at ${expiresAt} and can be used once.`,
        html: `<!doctype html><html><body><p>Hello ${escapeMailHtml(recipient.name)},</p><p>Please enter your vendor KPI self assessment: <a href="${escapeMailHtml(url)}">Open assessment</a></p><p>This link expires at ${escapeMailHtml(expiresAt)} and can be used once.</p></body></html>`,
        disableFileAccess: true, disableUrlAccess: true, xMailer: false });
    } catch (error) { throw safeMailDeliveryError(error); }
  } };
}

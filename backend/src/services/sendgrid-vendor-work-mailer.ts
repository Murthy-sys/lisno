import { createIsolatedSendGridTransport, parseSendGridMailbox, safeSendGridDeliveryError, type MailDeliveryConfig, type SendGridTransport } from "./sendgrid-transport.js";
import type { VendorWorkMailer } from "./vendor-work-mailer.js";
import { vendorWorkMailTemplate } from "./vendor-work-mail-template.js";
export function createSendGridVendorWorkMailer(config: Extract<MailDeliveryConfig, { kind: "sendgrid_web_api" }>, transport: SendGridTransport = createIsolatedSendGridTransport(config)): Exclude<VendorWorkMailer, { deliveryKind: "disabled" }> {
  const from = parseSendGridMailbox(config.from);
  return { deliveryKind: "external", async sendNewWork(input) {
    try { await transport.send({ from, to: input.recipient, ...vendorWorkMailTemplate(input, config.publicFrontendUrl) }); }
    catch (error) { throw safeSendGridDeliveryError(error); }
  } };
}

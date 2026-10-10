import { createIsolatedSendGridTransport, parseSendGridMailbox, safeSendGridDeliveryError, type MailDeliveryConfig, type SendGridTransport } from "./sendgrid-transport.js";
import { executionDigestTemplate, type ExecutionDigestMailer } from "./execution-digest-mailer.js";
export function createSendGridExecutionDigestMailer(config: Extract<MailDeliveryConfig, { kind: "sendgrid_web_api" }>, transport: SendGridTransport = createIsolatedSendGridTransport(config)): Exclude<ExecutionDigestMailer, { deliveryKind: "disabled" }> {
  return { deliveryKind: "external", async sendDigest(input) {
    try { await transport.send({ from: parseSendGridMailbox(config.from), to: input.recipient, ...executionDigestTemplate(input, config.publicFrontendUrl) }); }
    catch (error) { throw safeSendGridDeliveryError(error); }
  } };
}

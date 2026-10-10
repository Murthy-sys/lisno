import nodemailer from "nodemailer";
import { createIsolatedSmtpTransport, parseMailbox, safeMailDeliveryError, type MailDeliveryConfig } from "./smtp-transport.js";
import { executionDigestTemplate, type ExecutionDigestMailer } from "./execution-digest-mailer.js";
export function createSmtpExecutionDigestMailer(config: Extract<MailDeliveryConfig, { kind: "smtp" }>): Exclude<ExecutionDigestMailer, { deliveryKind: "disabled" }> {
  const transport = nodemailer.createTransport(createIsolatedSmtpTransport(config));
  return { deliveryKind: "external", async sendDigest(input) {
    try { await transport.sendMail({ from: parseMailbox(config.from), to: { name: input.recipient.name, address: input.recipient.email }, ...executionDigestTemplate(input, config.publicFrontendUrl), disableFileAccess: true, disableUrlAccess: true, xMailer: false }); }
    catch (error) { throw safeMailDeliveryError(error); }
  } };
}

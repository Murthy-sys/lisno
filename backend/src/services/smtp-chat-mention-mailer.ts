import { createHash } from "node:crypto";
import nodemailer from "nodemailer";

import { renderChatMentionEmail } from "./chat-mention-email-template.js";
import type { EnabledChatMentionMailer } from "./chat-mention-mailer.js";
import {
  createIsolatedSmtpTransport,
  parseMailbox,
  safeMailDeliveryError,
  type MailDeliveryConfig
} from "./smtp-transport.js";

export function createSmtpChatMentionMailer(
  config: Extract<MailDeliveryConfig, { kind: "smtp" }>
): EnabledChatMentionMailer & { readonly deliveryKind: "external" } {
  const sender = parseMailbox(config.from);
  const transporter = nodemailer.createTransport(createIsolatedSmtpTransport(config));

  return {
    deliveryKind: "external",
    async sendMention(input) {
      try {
        const content = renderChatMentionEmail(config.publicFrontendUrl, input);
        // Retries share an identifier, but provider acceptance is not exactly-once.
        const digest = createHash("sha256").update(input.notificationId).digest("hex");
        await transporter.sendMail({
          from: sender,
          to: { name: input.recipient.name, address: input.recipient.email },
          ...content,
          messageId: `<chat-mention-${digest}@notifications.lisno.invalid>`,
          disableFileAccess: true,
          disableUrlAccess: true,
          xMailer: false
        });
      } catch (error) {
        throw safeMailDeliveryError(error);
      }
    }
  };
}

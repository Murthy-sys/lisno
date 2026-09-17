import { renderChatMentionEmail } from "./chat-mention-email-template.js";
import type { EnabledChatMentionMailer } from "./chat-mention-mailer.js";
import {
  createIsolatedSendGridTransport,
  parseSendGridMailbox,
  safeSendGridDeliveryError,
  type MailDeliveryConfig,
  type SendGridTransport
} from "./sendgrid-transport.js";

export function createSendGridChatMentionMailer(
  config: Extract<MailDeliveryConfig, { kind: "sendgrid_web_api" }>,
  transport: SendGridTransport = createIsolatedSendGridTransport(config)
): EnabledChatMentionMailer & { readonly deliveryKind: "external" } {
  const sender = parseSendGridMailbox(config.from);

  return {
    deliveryKind: "external",
    async sendMention(input) {
      try {
        await transport.send({
          from: sender,
          to: { name: input.recipient.name, email: input.recipient.email },
          ...renderChatMentionEmail(config.publicFrontendUrl, input)
        });
      } catch (error) {
        throw safeSendGridDeliveryError(error);
      }
    }
  };
}

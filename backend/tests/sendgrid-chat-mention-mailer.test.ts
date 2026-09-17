import { describe, expect, it, vi } from "vitest";

import type { ChatMentionEmailInput } from "../src/services/chat-mention-mailer.js";
import { createSendGridChatMentionMailer } from "../src/services/sendgrid-chat-mention-mailer.js";
import type { SendGridTransport } from "../src/services/sendgrid-transport.js";
import { MailDeliveryError } from "../src/services/smtp-transport.js";

const config = {
  kind: "sendgrid_web_api" as const,
  publicFrontendUrl: "https://app.lisno.example",
  apiKey: "SG.fabricated-chat-mention-test-key",
  from: "Lisno Chat <chat@lisno.example>",
  deliveryTimeoutMs: 30_000
};

const input: ChatMentionEmailInput = {
  notificationId: "notification-one",
  recipient: { name: 'Asha <Client> "quoted"', email: "asha@example.com" },
  actorName: "Morgan & Designer",
  projectName: "Home <Studio>",
  projectId: "project/one",
  messageId: "message#two&other=true",
  excerpt: '<img src="https://evil.example/tracker" onerror="bad()">\nPlease reply.',
  kind: "chat.mention"
};

function recordingTransport(implementation: SendGridTransport["send"] = async () => undefined) {
  return { send: vi.fn(implementation) } satisfies SendGridTransport;
}

describe("SendGrid chat mention mailer", () => {
  it("sends one escaped message to one person and an authenticated deep link, without attachments", async () => {
    const transport = recordingTransport();
    const mailer = createSendGridChatMentionMailer(config, transport);
    await expect(mailer.sendMention(input)).resolves.toBeUndefined();

    expect(mailer.deliveryKind).toBe("external");
    expect(transport.send).toHaveBeenCalledOnce();
    const message = transport.send.mock.calls[0]![0];
    expect(message).toMatchObject({
      from: { name: "Lisno Chat", email: "chat@lisno.example" },
      to: input.recipient,
      subject: "Lisno: Morgan & Designer mentioned you in Home <Studio>"
    });
    expect(message.text).toContain(input.excerpt);
    expect(message.text).toContain("Open message and reply: https://app.lisno.example/projects/project%2Fone/messages?message=message%23two%26other%3Dtrue");
    expect(message.html).toContain("Asha &lt;Client&gt; &quot;quoted&quot;");
    expect(message.html).toContain("Morgan &amp; Designer mentioned you in Home &lt;Studio&gt;");
    expect(message.html).toContain("&lt;img src=&quot;https://evil.example/tracker&quot; onerror=&quot;bad()&quot;&gt;");
    expect(message.html).not.toContain("<img");
    expect(message.html).not.toContain("Super Admin");
    expect(message).not.toHaveProperty("attachments");
    expect(message).not.toHaveProperty("cc");
    expect(message).not.toHaveProperty("bcc");
  });

  it("clearly identifies oversight mail and keeps line breaks out of the subject", async () => {
    const transport = recordingTransport();
    await createSendGridChatMentionMailer(config, transport).sendMention({
      ...input,
      actorName: "Morgan\r\nOther Header: value",
      projectName: "Home\nStudio",
      kind: "chat.mention.oversight"
    });

    const message = transport.send.mock.calls[0]![0];
    expect(message.subject).toBe("Lisno: Morgan Other Header: value mentioned someone in Home Studio");
    expect(message.text).toContain("You received this notification as Super Admin.");
    expect(message.html).toContain("You received this notification as Super Admin.");
  });

  it("keeps a safe transport failure code and hides raw provider details", async () => {
    const safeFailure = new MailDeliveryError("SENDGRID_RATE_LIMITED");
    const transport = recordingTransport(async () => { throw safeFailure; });
    const mailer = createSendGridChatMentionMailer(config, transport);
    await expect(mailer.sendMention(input)).rejects.toBe(safeFailure);

    transport.send.mockRejectedValueOnce(Object.assign(
      new Error(`provider-private-secret ${input.recipient.email} ${config.apiKey}`),
      { code: 403, response: { body: "provider-private-secret" } }
    ));
    const failure: unknown = await mailer.sendMention(input).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SENDGRID_FORBIDDEN" });
    expect(`${String(failure)} ${JSON.stringify(failure)}`).not.toMatch(/provider-private-secret|asha@example.com|fabricated-chat/);
    expect(failure).not.toHaveProperty("response");
    expect(failure).not.toHaveProperty("cause");
  });

  it("fails safely for a non-web frontend URL before sending", async () => {
    const transport = recordingTransport();
    const mailer = createSendGridChatMentionMailer({ ...config, publicFrontendUrl: "javascript:private-value" }, transport);
    await expect(mailer.sendMention(input)).rejects.toMatchObject({
      message: "Mail delivery failed.",
      failureCode: "SENDGRID_DELIVERY_FAILED"
    });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("rejects ambiguous sender configuration", () => {
    expect(() => createSendGridChatMentionMailer({ ...config, from: "first@example.com, second@example.com" }, recordingTransport()))
      .toThrow("SendGrid sender mailbox is invalid.");
  });
});

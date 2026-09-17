import type { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMentionEmailInput } from "../src/services/chat-mention-mailer.js";
import { createSmtpChatMentionMailer } from "../src/services/smtp-chat-mention-mailer.js";
import { MailDeliveryError } from "../src/services/smtp-transport.js";

const state = vi.hoisted(() => ({
  messages: [] as Array<Record<string, unknown>>,
  connections: [] as Array<{
    options: Record<string, unknown>;
    envelope?: unknown;
    closeCount: number;
  }>,
  failure: null as Error | null
}));

vi.mock("nodemailer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("nodemailer")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      createTransport(...args: Parameters<typeof actual.default.createTransport>) {
        const transporter = actual.default.createTransport(...args);
        const sendMail = transporter.sendMail.bind(transporter);
        transporter.sendMail = ((options: Record<string, unknown>) => {
          state.messages.push(options);
          return sendMail(options);
        }) as typeof transporter.sendMail;
        return transporter;
      }
    }
  };
});

vi.mock("nodemailer/lib/smtp-connection/index.js", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    default: class FakeSmtpConnection extends EventEmitter {
      readonly connection: (typeof state.connections)[number];
      allowsAuth = true;

      constructor(options: Record<string, unknown>) {
        super();
        this.connection = { options, closeCount: 0 };
        state.connections.push(this.connection);
      }

      connect(callback: (error?: Error | null) => void) {
        queueMicrotask(() => callback());
      }
      login(_auth: unknown, callback: (error?: Error | null) => void) {
        queueMicrotask(() => callback(state.failure));
      }
      send(envelope: unknown, message: Readable, callback: (error?: Error | null) => void) {
        this.connection.envelope = envelope;
        message.resume();
        message.once("end", () => callback());
      }
      close() { this.connection.closeCount += 1; }
    }
  };
});

const config = {
  kind: "smtp" as const,
  publicFrontendUrl: "https://app.lisno.example/",
  host: "smtp.lisno.example",
  port: 587,
  tlsMode: "starttls" as const,
  username: "test-user",
  password: "fabricated-test-password",
  from: "Lisno Chat <chat@lisno.example>",
  deliveryTimeoutMs: 30_000
};

const input: ChatMentionEmailInput = {
  notificationId: "notification-one",
  recipient: { name: "Asha <Client>", email: "asha@example.com" },
  actorName: "Morgan <Designer>",
  projectName: "Home & Studio",
  projectId: "project/a?redirect=evil",
  messageId: "message?x=1&y='two'",
  excerpt: "Please check <script>alert('bad')</script> & reply.\nSecond line.",
  kind: "chat.mention"
};

afterEach(() => {
  state.messages.length = 0;
  state.connections.length = 0;
  state.failure = null;
});

describe("SMTP chat mention mailer", () => {
  it("sends escaped content to one recipient with an encoded authenticated message link", async () => {
    const mailer = createSmtpChatMentionMailer(config);
    await expect(mailer.sendMention(input)).resolves.toBeUndefined();

    expect(mailer.deliveryKind).toBe("external");
    expect(state.messages).toHaveLength(1);
    const message = state.messages[0]!;
    const messageUrl = "https://app.lisno.example/projects/project%2Fa%3Fredirect%3Devil/messages?message=message%3Fx%3D1%26y%3D'two'";
    expect(message).toMatchObject({
      from: { name: "Lisno Chat", address: "chat@lisno.example" },
      to: { name: input.recipient.name, address: input.recipient.email },
      subject: "Lisno: Morgan <Designer> mentioned you in Home & Studio",
      disableFileAccess: true,
      disableUrlAccess: true,
      xMailer: false
    });
    expect(message.text).toContain(input.excerpt);
    expect(message.text).toContain(`Open message and reply: ${messageUrl}`);
    expect(message.html).toContain("Hello Asha &lt;Client&gt;");
    expect(message.html).toContain("Morgan &lt;Designer&gt; mentioned you in Home &amp; Studio.");
    expect(message.html).toContain("&lt;script&gt;alert(&#39;bad&#39;)&lt;/script&gt; &amp; reply.");
    expect(message.html).toContain('href="' + messageUrl.replaceAll("'", "&#39;") + '"');
    expect(message.html).not.toContain("<script>");
    expect(message).not.toHaveProperty("attachments");
    expect(message).not.toHaveProperty("cc");
    expect(message).not.toHaveProperty("bcc");
    expect(state.connections[0]).toMatchObject({
      options: { requireTLS: true, ignoreTLS: false, tls: { rejectUnauthorized: true } },
      envelope: { from: "chat@lisno.example", to: ["asha@example.com"] },
      closeCount: 1
    });
  });

  it("gives retries a stable safe Message-ID, changes it for another notification, and distinguishes oversight", async () => {
    const mailer = createSmtpChatMentionMailer(config);
    const oversight = { ...input, kind: "chat.mention.oversight" as const, notificationId: "private\r\nBcc: injected@example.com" };
    await mailer.sendMention(oversight);
    await mailer.sendMention(oversight);
    await mailer.sendMention({ ...oversight, notificationId: "notification-two" });

    const first = state.messages[0]!;
    expect(first.messageId).toMatch(/^<chat-mention-[a-f0-9]{64}@notifications\.lisno\.invalid>$/);
    expect(state.messages[1]!.messageId).toBe(first.messageId);
    expect(state.messages[2]!.messageId).not.toBe(first.messageId);
    expect(first.subject).toContain("mentioned someone");
    expect(first.text).toContain("You received this notification as Super Admin.");
    expect(first.html).toContain("You received this notification as Super Admin.");
    expect(state.connections).toHaveLength(3);
  });

  it("redacts provider detail and preserves only a bounded delivery failure", async () => {
    state.failure = Object.assign(new Error("victim@example.com provider-private-secret"), {
      code: "EAUTH",
      response: "AUTH PLAIN provider-private-secret"
    });
    const failure: unknown = await createSmtpChatMentionMailer(config)
      .sendMention(input).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SMTP_AUTH_FAILED" });
    expect(`${String(failure)} ${JSON.stringify(failure)}`).not.toMatch(/victim|private-secret|AUTH PLAIN/);
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("response");
    expect(state.connections[0]!.closeCount).toBe(1);
  });

  it("rejects ambiguous sender configuration without starting delivery", () => {
    expect(() => createSmtpChatMentionMailer({ ...config, from: "first@example.com, second@example.com" }))
      .toThrow("SMTP sender mailbox is invalid.");
    expect(state.connections).toHaveLength(0);
  });
});

import { EventEmitter } from "node:events";
import type { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startTricklingSmtpServer } from "./helpers/trickling-smtp-server.js";

const connectionState = vi.hoisted(() => ({
  instances: [] as Array<{
    options: Record<string, unknown>;
    closeCount: number;
    envelope?: unknown;
    message?: string;
  }>,
  failure: null as Error | null,
  connectFailure: null as Error | null
}));

const messageState = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null
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
          messageState.options = options;
          return sendMail(options);
        }) as typeof transporter.sendMail;
        return transporter;
      }
    }
  };
});

vi.mock("nodemailer/lib/smtp-connection", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    default: class FakeSmtpConnection extends EventEmitter {
      readonly state: (typeof connectionState.instances)[number];
      allowsAuth = true;

      constructor(options: Record<string, unknown>) {
        super();
        this.state = { options, closeCount: 0 };
        connectionState.instances.push(this.state);
      }

      connect(callback: (error?: Error | null) => void) {
        queueMicrotask(() => callback(connectionState.connectFailure));
      }
      login(_auth: unknown, callback: (error?: Error | null) => void) {
        queueMicrotask(() => callback(connectionState.failure));
      }
      send(envelope: unknown, message: Readable, callback: (error?: Error | null, info?: unknown) => void) {
        this.state.envelope = envelope;
        const chunks: Buffer[] = [];
        message.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        message.once("end", () => {
          this.state.message = Buffer.concat(chunks).toString("utf8");
          callback(connectionState.failure, { response: "provider detail" });
        });
      }
      close() { this.state.closeCount += 1; }
    }
  };
});

const smtpConfig = {
  kind: "smtp" as const,
  publicFrontendUrl: "https://app.lisno.example",
  host: "smtp.lisno.example",
  port: 587,
  tlsMode: "starttls" as const,
  username: "mailer-user",
  password: "mailer-password",
  from: "Lisno Invitations <invitations@lisno.example>",
  deliveryTimeoutMs: 120_000
};

afterEach(() => {
  connectionState.instances.length = 0;
  connectionState.failure = null;
  connectionState.connectFailure = null;
  messageState.options = null;
});

describe.sequential("SMTP invitation mailer", () => {
  it("builds a fragment-only escaped invitation and strict STARTTLS connection", async () => {
    const { createSmtpInvitationMailer } = await import("../src/services/smtp-invitation-mailer.js");
    const mailer = createSmtpInvitationMailer(smtpConfig);
    const rawToken = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";

    await mailer.sendInvitation({
      recipient: { name: "Asha <script>alert(1)</script>", email: "asha@example.com" },
      roleLabel: "Designer & Planner",
      rawToken,
      expiresAt: "2026-08-24T10:00:00.000Z"
    });

    expect(mailer.deliveryKind).toBe("external");
    expect(connectionState.instances).toHaveLength(1);
    const state = connectionState.instances[0]!;
    expect(state.options).toMatchObject({
      host: "smtp.lisno.example",
      port: 587,
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
      logger: false,
      debug: false,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
      dnsTimeout: 15_000,
      tls: { rejectUnauthorized: true }
    });
    expect(messageState.options).toMatchObject({
      from: {
        name: "Lisno Invitations",
        address: "invitations@lisno.example"
      },
      to: { name: "Asha <script>alert(1)</script>", address: "asha@example.com" },
      disableFileAccess: true,
      disableUrlAccess: true,
      xMailer: false
    });
    expect(state.closeCount).toBe(1);
    expect(state.envelope).toEqual({
      from: "invitations@lisno.example",
      to: ["asha@example.com"]
    });
    const normalizedMessage = state.message!
      .replace(/=\r\n/gu, "")
      .replace(/=3D/gu, "=");
    const invitationUrl =
      `https://app.lisno.example/accept-invitation#token=${rawToken}`;
    expect(normalizedMessage).toContain(
      `Accept your invitation: ${invitationUrl}`
    );
    expect(normalizedMessage).toContain(`href="${invitationUrl}"`);
    expect(normalizedMessage.split(invitationUrl)).toHaveLength(3);
    expect(normalizedMessage).not.toContain("/accept-invitation?token=");
    expect(normalizedMessage).not.toContain(`/accept-invitation#${rawToken}`);
    expect(normalizedMessage).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(normalizedMessage).toContain("Designer &amp; Planner");
    expect(normalizedMessage.toLowerCase()).not.toContain("tracking");
  });

  it("uses implicit TLS without STARTTLS fallback and owns one connection per send", async () => {
    const { createSmtpInvitationMailer } = await import("../src/services/smtp-invitation-mailer.js");
    const mailer = createSmtpInvitationMailer({
      ...smtpConfig,
      port: 465,
      tlsMode: "implicit"
    });
    const input = {
      recipient: { name: "Asha", email: "asha@example.com" },
      roleLabel: "Designer",
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
      expiresAt: "2026-08-24T10:00:00.000Z"
    };

    await mailer.sendInvitation(input);
    await mailer.sendInvitation(input);

    expect(connectionState.instances).toHaveLength(2);
    expect(connectionState.instances[0]?.options).toMatchObject({
      secure: true,
      requireTLS: false,
      ignoreTLS: false,
      tls: { rejectUnauthorized: true }
    });
    expect(connectionState.instances[0]).not.toBe(connectionState.instances[1]);
  });

  it("replaces provider failures with one bounded internal code", async () => {
    const { USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN } = await import(
      "../src/domain/user-invitations.js"
    );
    const provider = Object.assign(new Error("550 5.1.1 victim@example.com rejected"), {
      code: "EAUTH",
      response: "550 provider response",
      command: "AUTH PLAIN secret"
    });
    connectionState.failure = provider;
    const { createSmtpInvitationMailer, InvitationDeliveryError } = await import("../src/services/smtp-invitation-mailer.js");
    const mailer = createSmtpInvitationMailer(smtpConfig);

    const failure = await mailer.sendInvitation({
      recipient: { name: "Asha", email: "victim@example.com" },
      roleLabel: "Designer",
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
      expiresAt: "2026-08-24T10:00:00.000Z"
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(InvitationDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SMTP_AUTH_FAILED" });
    expect(USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN.test(failure.failureCode)).toBe(true);
    expect(String(failure)).not.toMatch(/victim|provider|AUTH PLAIN|550/i);
  });

  it("keeps the invitation delivery error export as the shared transport class", async () => {
    const { InvitationDeliveryError } = await import(
      "../src/services/smtp-invitation-mailer.js"
    );
    const { MailDeliveryError } = await import("../src/services/smtp-transport.js");

    expect(InvitationDeliveryError).toBe(MailDeliveryError);
    expect(new InvitationDeliveryError("SMTP_DELIVERY_FAILED"))
      .toBeInstanceOf(MailDeliveryError);
  });

  it("classifies a connect callback error and closes the isolated connection once", async () => {
    connectionState.connectFailure = Object.assign(
      new Error("connect failed with provider detail"),
      { code: "ECONNREFUSED" }
    );
    const { createSmtpInvitationMailer, InvitationDeliveryError } = await import(
      "../src/services/smtp-invitation-mailer.js"
    );
    const mailer = createSmtpInvitationMailer(smtpConfig);

    const failure = await mailer.sendInvitation({
      recipient: { name: "Asha", email: "asha@example.com" },
      roleLabel: "Designer",
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
      expiresAt: "2026-08-24T10:00:00.000Z"
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(InvitationDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SMTP_CONNECTION_FAILED" });
    expect(connectionState.instances[0]?.closeCount).toBe(1);
  });

  it("closes the exact real socket at the wall-clock deadline and settles once", async () => {
    vi.doUnmock("nodemailer/lib/smtp-connection");
    vi.resetModules();
    const server = await startTricklingSmtpServer();
    try {
      const { createSmtpInvitationMailer, InvitationDeliveryError } = await import("../src/services/smtp-invitation-mailer.js");
      const mailer = createSmtpInvitationMailer({
        ...smtpConfig,
        host: server.host,
        port: server.port,
        deliveryTimeoutMs: 1_000
      });
      let settlements = 0;
      const sending = mailer.sendInvitation({
        recipient: { name: "Asha", email: "asha@example.com" },
        roleLabel: "Designer",
        rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
        expiresAt: "2026-08-24T10:00:00.000Z"
      }).then(
        () => { settlements += 1; },
        (error: unknown) => {
          settlements += 1;
          expect(error).toBeInstanceOf(InvitationDeliveryError);
          expect(error).toMatchObject({ failureCode: "SMTP_TIMEOUT" });
        }
      );

      await server.waitForConnection();
      await sending;
      await server.waitForPeerClose();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(settlements).toBe(1);
      expect(server.activeConnectionCount()).toBe(0);
      expect(server.activeTimerCount()).toBe(0);
    } finally {
      await server.close();
    }
  }, 15_000);
});

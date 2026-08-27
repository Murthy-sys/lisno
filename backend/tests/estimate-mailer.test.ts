import { EventEmitter } from "node:events";
import type { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { startTricklingSmtpServer } from "./helpers/trickling-smtp-server.js";

const connectionState = vi.hoisted(() => ({
  instances: [] as Array<{
    options: Record<string, unknown>;
    closeCount: number;
    envelope?: unknown;
    message?: Buffer;
  }>,
  failure: null as Error | null
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
        queueMicrotask(() => callback(null));
      }

      login(_auth: unknown, callback: (error?: Error | null) => void) {
        queueMicrotask(() => callback(connectionState.failure));
      }

      send(
        envelope: unknown,
        message: Readable,
        callback: (error?: Error | null, info?: unknown) => void
      ) {
        this.state.envelope = envelope;
        const chunks: Buffer[] = [];
        message.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        message.once("end", () => {
          this.state.message = Buffer.concat(chunks);
          callback(connectionState.failure, { response: "provider detail" });
        });
      }

      close() {
        this.state.closeCount += 1;
      }
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
  from: "Lisno <mail@lisno.example>",
  deliveryTimeoutMs: 120_000
};

const pdfBytes = Buffer.from("%PDF-1.7\nLisno estimate fixture\n%%EOF", "utf8");

const hostileInput = {
  to: "client@example.com",
  clientName: "A <Client>",
  projectName: "Home & Studio",
  estimateVersion: 4,
  total: 1_234_500,
  portalUrl: "https://attacker.example/client?token=secret",
  attachment: {
    filename: "lisno-estimate-home-v4.pdf",
    mimeType: "application/pdf" as const,
    bytes: pdfBytes
  }
};

afterEach(() => {
  connectionState.instances.length = 0;
  connectionState.failure = null;
  messageState.options = null;
});

describe.sequential("SMTP estimate mailer", () => {
  it("sends escaped summaries and exactly one byte-only PDF to the configured client portal", async () => {
    const { createSmtpEstimateMailer } = await import(
      "../src/services/smtp-estimate-mailer.js"
    );
    const mailer = createSmtpEstimateMailer(smtpConfig);

    await expect(mailer.send(hostileInput)).resolves.toEqual({ kind: "sent" });

    expect(mailer.deliveryKind).toBe("external");
    expect(connectionState.instances).toHaveLength(1);
    expect(connectionState.instances[0]?.envelope).toEqual({
      from: "mail@lisno.example",
      to: ["client@example.com"]
    });
    expect(messageState.options).toMatchObject({
      from: { name: "Lisno", address: "mail@lisno.example" },
      to: { name: "A <Client>", address: "client@example.com" },
      subject: "Lisno estimate for Home & Studio · v4",
      disableFileAccess: true,
      disableUrlAccess: true,
      xMailer: false
    });
    expect(messageState.options?.text).toContain("A <Client>");
    expect(messageState.options?.text).toContain("Home & Studio");
    expect(messageState.options?.text).toContain("INR 12,34,500");
    expect(messageState.options?.text).toContain("https://app.lisno.example/client");
    expect(messageState.options?.html).toContain("A &lt;Client&gt;");
    expect(messageState.options?.html).toContain("Home &amp; Studio");
    expect(messageState.options?.html).toContain(
      'href="https://app.lisno.example/client"'
    );
    expect(JSON.stringify(messageState.options)).not.toMatch(/attacker|token|secret/i);

    const attachments = messageState.options?.attachments as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toEqual({
      filename: "lisno-estimate-home-v4.pdf",
      contentType: "application/pdf",
      content: pdfBytes
    });
    expect(Buffer.isBuffer(attachments[0]?.content)).toBe(true);
    expect(attachments[0]).not.toHaveProperty("path");
    expect(attachments[0]).not.toHaveProperty("href");
    expect(attachments[0]).not.toHaveProperty("contentStream");
    expect(connectionState.instances[0]?.message?.includes(pdfBytes.toString("base64")))
      .toBe(true);
  });

  it("returns only a bounded failure code when the SMTP provider rejects delivery", async () => {
    connectionState.failure = Object.assign(
      new Error("550 victim@example.com rejected AUTH PLAIN secret"),
      { code: "EAUTH", response: "provider payload" }
    );
    const { createSmtpEstimateMailer } = await import(
      "../src/services/smtp-estimate-mailer.js"
    );
    const mailer = createSmtpEstimateMailer(smtpConfig);

    const result = await mailer.send(hostileInput);

    expect(result).toEqual({ kind: "failed", failureCode: "SMTP_AUTH_FAILED" });
    expect(JSON.stringify(result)).not.toMatch(/victim|provider|AUTH PLAIN|550|secret/i);
  });

  it("closes a trickling real SMTP socket at the wall-clock deadline", async () => {
    vi.doUnmock("nodemailer");
    vi.doUnmock("nodemailer/lib/smtp-connection");
    vi.resetModules();
    const server = await startTricklingSmtpServer();
    try {
      const { createSmtpEstimateMailer } = await import(
        "../src/services/smtp-estimate-mailer.js"
      );
      const mailer = createSmtpEstimateMailer({
        ...smtpConfig,
        host: server.host,
        port: server.port,
        deliveryTimeoutMs: 1_000
      });

      const sending = mailer.send(hostileInput);
      await server.waitForConnection();
      await expect(sending).resolves.toEqual({
        kind: "failed",
        failureCode: "SMTP_TIMEOUT"
      });
      await server.waitForPeerClose();
      expect(server.activeConnectionCount()).toBe(0);
      expect(server.activeTimerCount()).toBe(0);
    } finally {
      await server.close();
    }
  }, 15_000);
});

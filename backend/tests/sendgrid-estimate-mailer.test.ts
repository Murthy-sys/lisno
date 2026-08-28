import { describe, expect, it, vi } from "vitest";

import { createSendGridEstimateMailer } from "../src/services/sendgrid-estimate-mailer.js";
import type {
  SendGridMessage,
  SendGridTransport
} from "../src/services/sendgrid-transport.js";
import { MailDeliveryError } from "../src/services/smtp-transport.js";

const sendGridConfig = {
  kind: "sendgrid_web_api" as const,
  publicFrontendUrl: "https://app.lisno.example",
  apiKey: "SG.fabricated-sendgrid-key",
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

function recordingTransport() {
  const messages: SendGridMessage[] = [];
  const transport: SendGridTransport = {
    send: vi.fn(async (message) => {
      messages.push(structuredClone(message));
    })
  };
  return { messages, transport };
}

describe("SendGrid estimate mailer", () => {
  it("preserves the SMTP content and sends exactly one base64 byte-only PDF", async () => {
    const { messages, transport } = recordingTransport();
    const mailer = createSendGridEstimateMailer(sendGridConfig, transport);

    await expect(mailer.send(hostileInput)).resolves.toEqual({ kind: "sent" });

    expect(mailer.deliveryKind).toBe("external");
    expect(transport.send).toHaveBeenCalledOnce();
    expect(messages).toHaveLength(1);
    const message = messages[0]!;
    expect(message).toMatchObject({
      from: { name: "Lisno", email: "mail@lisno.example" },
      to: { name: "A <Client>", email: "client@example.com" },
      subject: "Lisno estimate for Home & Studio · v4"
    });
    expect(message.text).toContain("A <Client>");
    expect(message.text).toContain("Home & Studio");
    expect(message.text).toContain("INR 12,34,500");
    expect(message.text).toContain("https://app.lisno.example/client");
    expect(message.html).toContain("A &lt;Client&gt;");
    expect(message.html).toContain("Home &amp; Studio");
    expect(message.html).toContain(
      'href="https://app.lisno.example/client"'
    );
    expect(JSON.stringify(message)).not.toMatch(/attacker|token|secret/i);

    expect(message.attachments).toHaveLength(1);
    const attachment = message.attachments![0]!;
    expect(attachment).toEqual({
      content: pdfBytes.toString("base64"),
      filename: "lisno-estimate-home-v4.pdf",
      type: "application/pdf",
      disposition: "attachment"
    });
    expect(Buffer.from(attachment.content, "base64")).toEqual(pdfBytes);
    expect(attachment).not.toHaveProperty("path");
    expect(attachment).not.toHaveProperty("url");
    expect(attachment).not.toHaveProperty("href");
    expect(attachment).not.toHaveProperty("stream");
    expect(attachment).not.toHaveProperty("contentStream");
  });

  it("returns only the bounded transport failure code", async () => {
    const hostileFilename = "victim@example.com-secret.pdf";
    const transport: SendGridTransport = {
      send: vi.fn(async () => {
        throw new MailDeliveryError("SENDGRID_FORBIDDEN");
      })
    };
    const mailer = createSendGridEstimateMailer(sendGridConfig, transport);

    const result = await mailer.send({
      ...hostileInput,
      to: "victim@example.com",
      attachment: { ...hostileInput.attachment, filename: hostileFilename }
    });

    expect(result).toEqual({
      kind: "failed",
      failureCode: "SENDGRID_FORBIDDEN"
    });
    expect(JSON.stringify(result)).not.toMatch(/victim|secret|pdf|provider/i);
  });
});

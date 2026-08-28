import { describe, expect, it, vi } from "vitest";

import { createSendGridDesignPlanMailer } from "../src/services/sendgrid-design-plan-mailer.js";
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

const firstBytes = Buffer.from("first design attachment", "utf8");
const secondBytes = Buffer.from([0, 255, 1, 2, 3, 128]);

function recordingTransport() {
  const messages: SendGridMessage[] = [];
  const transport: SendGridTransport = {
    send: vi.fn(async (message) => {
      messages.push(structuredClone(message));
    })
  };
  return { messages, transport };
}

describe("SendGrid design-plan mailer", () => {
  it("preserves one-attachment content, trusted portal URL, and escaped HTML", async () => {
    const { messages, transport } = recordingTransport();
    const mailer = createSendGridDesignPlanMailer(sendGridConfig, transport);

    await expect(mailer.sendDesignPlan({
      to: "client@example.com",
      clientName: "A <Client>",
      projectName: "Home & Studio",
      designPlanVersion: 7,
      portalUrl: "https://app.lisno.example/client/design-review",
      attachments: [{
        filename: "ground-floor.png",
        mimeType: "image/png",
        bytes: firstBytes
      }]
    })).resolves.toEqual({ kind: "sent" });

    expect(mailer.deliveryKind).toBe("external");
    expect(transport.send).toHaveBeenCalledOnce();
    const message = messages[0]!;
    expect(message).toMatchObject({
      from: { name: "Lisno", email: "mail@lisno.example" },
      to: { name: "A <Client>", email: "client@example.com" },
      subject: "Lisno design plan for Home & Studio · v7"
    });
    expect(message.text).toContain("A <Client>");
    expect(message.text).toContain("Home & Studio");
    expect(message.text).toContain("Design version: 7");
    expect(message.text).toContain(
      "Review it in your client portal: https://app.lisno.example/client/design-review"
    );
    expect(message.text).toContain("The uploaded plan is attached.");
    expect(message.html).toContain("A &lt;Client&gt;");
    expect(message.html).toContain("Home &amp; Studio");
    expect(message.html).toContain(
      'href="https://app.lisno.example/client/design-review"'
    );
    expect(message.html).toContain("The uploaded plan is attached.");

    expect(message.attachments).toHaveLength(1);
    expect(message.attachments![0]).toEqual({
      content: firstBytes.toString("base64"),
      filename: "ground-floor.png",
      type: "image/png",
      disposition: "attachment"
    });
    expect(Buffer.from(message.attachments![0]!.content, "base64"))
      .toEqual(firstBytes);
  });

  it("preserves multiple attachment order, count, metadata, and bytes", async () => {
    const { messages, transport } = recordingTransport();
    const mailer = createSendGridDesignPlanMailer(sendGridConfig, transport);

    await expect(mailer.sendDesignPlan({
      to: "client@example.com",
      clientName: "Client",
      projectName: "Residence",
      designPlanVersion: 3,
      portalUrl: "https://app.lisno.example/client/design-review?round=3",
      attachments: [
        {
          filename: "first.pdf",
          mimeType: "application/pdf",
          bytes: firstBytes
        },
        {
          filename: "second.bin",
          mimeType: "application/octet-stream",
          bytes: secondBytes
        }
      ]
    })).resolves.toEqual({ kind: "sent" });

    const message = messages[0]!;
    expect(message.text).toContain("The uploaded plans are attached.");
    expect(message.html).toContain("The uploaded plans are attached.");
    expect(message.attachments).toEqual([
      {
        content: firstBytes.toString("base64"),
        filename: "first.pdf",
        type: "application/pdf",
        disposition: "attachment"
      },
      {
        content: secondBytes.toString("base64"),
        filename: "second.bin",
        type: "application/octet-stream",
        disposition: "attachment"
      }
    ]);
    expect(message.attachments!.map((attachment) =>
      Buffer.from(attachment.content, "base64")
    )).toEqual([firstBytes, secondBytes]);
    for (const attachment of message.attachments!) {
      expect(attachment).not.toHaveProperty("path");
      expect(attachment).not.toHaveProperty("url");
      expect(attachment).not.toHaveProperty("href");
      expect(attachment).not.toHaveProperty("stream");
      expect(attachment).not.toHaveProperty("contentStream");
    }
  });

  it("returns only the bounded transport failure code", async () => {
    const transport: SendGridTransport = {
      send: vi.fn(async () => {
        throw new MailDeliveryError("SENDGRID_REQUEST_REJECTED");
      })
    };
    const mailer = createSendGridDesignPlanMailer(sendGridConfig, transport);

    const result = await mailer.sendDesignPlan({
      to: "victim@example.com",
      clientName: "Private Client",
      projectName: "Secret Project",
      designPlanVersion: 1,
      portalUrl: "https://app.lisno.example/client/private-token",
      attachments: [{
        filename: "provider-private-secret.pdf",
        mimeType: "application/pdf",
        bytes: Buffer.from("confidential attachment", "utf8")
      }]
    });

    expect(result).toEqual({
      kind: "failed",
      failureCode: "SENDGRID_REQUEST_REJECTED"
    });
    expect(JSON.stringify(result)).not.toMatch(
      /victim|private|secret|project|provider|confidential|pdf/i
    );
  });
});

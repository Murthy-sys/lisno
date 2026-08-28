import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createIsolatedSendGridTransport,
  parseSendGridMailbox,
  safeSendGridDeliveryError,
  type SendGridMessage,
  type SendGridSdk
} from "../src/services/sendgrid-transport.js";
import { MailDeliveryError } from "../src/services/smtp-transport.js";

const config = {
  kind: "sendgrid_web_api",
  publicFrontendUrl: "https://app.lisno.example",
  apiKey: "SG.fabricated-safe-key-for-tests",
  from: "Lisno <notifications@lisno.example>",
  deliveryTimeoutMs: 30_000
} as const;

const message: SendGridMessage = {
  from: { name: "Lisno", email: "notifications@lisno.example" },
  to: { name: "Recipient", email: "recipient@example.test" },
  subject: "Fabricated delivery",
  text: "Secret fragment token=fabricated-token",
  html: "<p>Secret fragment token=fabricated-token</p>",
  attachments: [{
    content: Buffer.from("fabricated attachment").toString("base64"),
    filename: "fabricated.pdf",
    type: "application/pdf",
    disposition: "attachment"
  }]
};

function createSdk(
  sendImplementation: SendGridSdk["send"] = async () => [
    { statusCode: 202 },
    {}
  ]
) {
  return {
    setApiKey: vi.fn<SendGridSdk["setApiKey"]>(),
    setTimeout: vi.fn<SendGridSdk["setTimeout"]>(),
    send: vi.fn(sendImplementation)
  } satisfies SendGridSdk;
}

function providerError(properties: Record<string, unknown>) {
  return Object.assign(new Error("hostile provider message with fabricated-token"), {
    ...properties,
    response: {
      headers: { authorization: config.apiKey },
      body: "hostile provider body recipient@example.test fabricated attachment",
      ...(typeof properties.response === "object" && properties.response !== null
        ? properties.response
        : {})
    }
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SendGrid Web API transport", () => {
  it("constructs the official SDK boundary without making a request", () => {
    expect(() => createIsolatedSendGridTransport(config)).not.toThrow();
  });

  it("parses a configured sender into the SendGrid mailbox shape", () => {
    expect(parseSendGridMailbox("Lisno <notifications@lisno.example>")).toEqual({
      name: "Lisno",
      email: "notifications@lisno.example"
    });
    expect(parseSendGridMailbox("notifications@lisno.example")).toEqual({
      name: undefined,
      email: "notifications@lisno.example"
    });
    expect(() => parseSendGridMailbox("first@example.com, second@example.com"))
      .toThrow("SendGrid sender mailbox is invalid.");
  });

  it("configures one isolated SDK and accepts only a 202 response", async () => {
    const sdk = createSdk();
    const transport = createIsolatedSendGridTransport(config, sdk);

    await expect(transport.send(message)).resolves.toBeUndefined();
    expect(sdk.setApiKey).toHaveBeenCalledOnce();
    expect(sdk.setApiKey).toHaveBeenCalledWith(config.apiKey);
    expect(sdk.setTimeout).toHaveBeenCalledOnce();
    expect(sdk.setTimeout).toHaveBeenCalledWith(config.deliveryTimeoutMs);
    expect(sdk.send).toHaveBeenCalledOnce();
    expect(sdk.send).toHaveBeenCalledWith(message);
  });

  it.each([
    [401, "SENDGRID_AUTH_FAILED"],
    [403, "SENDGRID_FORBIDDEN"],
    [429, "SENDGRID_RATE_LIMITED"],
    [400, "SENDGRID_REQUEST_REJECTED"],
    [422, "SENDGRID_REQUEST_REJECTED"],
    [500, "SENDGRID_UNAVAILABLE"],
    [503, "SENDGRID_UNAVAILABLE"]
  ])("maps structured HTTP %i without retrying", async (statusCode, failureCode) => {
    const sdk = createSdk(async () => {
      throw providerError({ code: statusCode });
    });
    const transport = createIsolatedSendGridTransport(config, sdk);

    await expect(transport.send(message)).rejects.toMatchObject({ failureCode });
    expect(sdk.send).toHaveBeenCalledOnce();
  });

  it.each([
    [400, "SENDGRID_REQUEST_REJECTED"],
    [500, "SENDGRID_UNAVAILABLE"],
    [200, "SENDGRID_DELIVERY_FAILED"],
    [302, "SENDGRID_DELIVERY_FAILED"]
  ])("rejects a resolved non-202 status %i", async (statusCode, failureCode) => {
    const sdk = createSdk(async () => [{ statusCode }, {}]);
    const transport = createIsolatedSendGridTransport(config, sdk);

    await expect(transport.send(message)).rejects.toMatchObject({ failureCode });
    expect(sdk.send).toHaveBeenCalledOnce();
  });

  it.each([
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "CERT_HAS_EXPIRED"
  ])("maps recognized connection code %s", async (code) => {
    const sdk = createSdk(async () => {
      throw providerError({ code });
    });
    const transport = createIsolatedSendGridTransport(config, sdk);

    await expect(transport.send(message)).rejects.toMatchObject({
      failureCode: "SENDGRID_CONNECTION_FAILED"
    });
    expect(sdk.send).toHaveBeenCalledOnce();
  });

  it.each(["ECONNABORTED", "ETIMEDOUT"])(
    "maps configured SDK timeout code %s to the bounded timeout",
    async (code) => {
      const sdk = createSdk(async () => {
        throw providerError({ code });
      });
      const transport = createIsolatedSendGridTransport(config, sdk);

      await expect(transport.send(message)).rejects.toMatchObject({
        failureCode: "SENDGRID_TIMEOUT"
      });
      expect(sdk.send).toHaveBeenCalledOnce();
    }
  );

  it("enforces the configured wall-clock timeout without retrying", async () => {
    vi.useFakeTimers();
    const sdk = createSdk(() => new Promise(() => undefined));
    const transport = createIsolatedSendGridTransport(config, sdk);
    const delivery = transport.send(message);
    const timeoutAssertion = expect(delivery).rejects.toMatchObject({
      failureCode: "SENDGRID_TIMEOUT"
    });

    await vi.advanceTimersByTimeAsync(config.deliveryTimeoutMs);

    await timeoutAssertion;
    expect(sdk.send).toHaveBeenCalledOnce();
  });

  it.each([
    "provider threw a string",
    401,
    null,
    undefined,
    { message: "hostile", response: { body: config.apiKey } },
    { code: "UNKNOWN_CODE", headers: { authorization: config.apiKey } }
  ])("collapses an unrecognized failure to the bounded fallback", (rawFailure) => {
    const error = safeSendGridDeliveryError(rawFailure);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error.failureCode).toBe("SENDGRID_DELIVERY_FAILED");
    expect(error.message).toBe("Mail delivery failed.");
  });

  it("discards hostile provider payloads, message data, and secrets", async () => {
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined)
    ];
    const sdk = createSdk(async () => {
      throw providerError({ response: { statusCode: 403 } });
    });
    const transport = createIsolatedSendGridTransport(config, sdk);

    const failure = await transport.send(message).catch((error: unknown) => error);
    const exposed = `${String(failure)} ${JSON.stringify(failure)}`;
    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SENDGRID_FORBIDDEN" });
    for (const sensitive of [
      config.apiKey,
      "recipient@example.test",
      "fabricated-token",
      "fabricated attachment",
      "authorization",
      "hostile provider body",
      "hostile provider message"
    ]) {
      expect(exposed).not.toContain(sensitive);
    }
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("sanitizes SDK initialization failures without exposing the API key", () => {
    const sdk = createSdk();
    sdk.setApiKey.mockImplementation(() => {
      throw new Error(`Invalid credential ${config.apiKey}`);
    });

    let failure: unknown;
    try {
      createIsolatedSendGridTransport(config, sdk);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(MailDeliveryError);
    expect(failure).toMatchObject({ failureCode: "SENDGRID_DELIVERY_FAILED" });
    expect(`${String(failure)} ${JSON.stringify(failure)}`).not.toContain(config.apiKey);
    expect(sdk.send).not.toHaveBeenCalled();
  });

  it("handles hostile structured-code accessors without throwing raw values", () => {
    const hostile = new Error("hostile raw error");
    Object.defineProperty(hostile, "code", {
      get() {
        throw new Error(config.apiKey);
      }
    });
    Object.defineProperty(hostile, "response", {
      get() {
        throw new Error("recipient@example.test");
      }
    });

    const failure = safeSendGridDeliveryError(hostile);
    expect(failure.failureCode).toBe("SENDGRID_DELIVERY_FAILED");
    expect(`${String(failure)} ${JSON.stringify(failure)}`).not.toContain(config.apiKey);
  });
});

import { describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/config/env.js";

const OCR_WORKER_TOKEN = "config-worker-token-with-at-least-32-characters";

describe("environment authentication configuration", () => {
  it("fails closed when JWT_SECRET is missing", () => {
    expect(() => loadEnvironment({})).toThrow();
  });

  it("rejects a weak JWT_SECRET", () => {
    expect(() =>
      loadEnvironment({
        JWT_SECRET: "development-only-secret",
        OCR_WORKER_TOKEN
      })
    ).toThrow();
  });

  it("accepts an explicitly supplied strong JWT_SECRET", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN
      }).JWT_SECRET
    ).toBe("runtime-secret-with-at-least-32-characters");
  });

  it("parses local MongoDB origins into a CORS allow-list", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        CORS_ORIGIN: "http://localhost:5173, https://lisno.example"
      }).CORS_ORIGIN
    ).toEqual(["http://localhost:5173", "https://lisno.example"]);
  });

  it("loads a positive configurable upload size in megabytes", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        MAX_UPLOAD_MB: "12.5"
      }).MAX_UPLOAD_MB
    ).toBe(12.5);

    expect(() =>
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        MAX_UPLOAD_MB: "0"
      })
    ).toThrow();
  });

  it("loads a positive OCR lease duration and defaults it to five minutes", () => {
    const env = loadEnvironment({
      JWT_SECRET: "runtime-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN
    });
    expect(env.OCR_LEASE_SECONDS).toBe(300);

    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        OCR_LEASE_SECONDS: "30"
      }).OCR_LEASE_SECONDS
    ).toBe(30);

    expect(() =>
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        OCR_LEASE_SECONDS: "0"
      })
    ).toThrow();
  });

  it("loads the bounded extraction retry policy defaults", () => {
    const env = loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN: "config-worker-token-with-at-least-32-characters"
    });
    expect(env.OCR_MAX_ATTEMPTS).toBe(5);
    expect(env.OCR_RETRY_INITIAL_SECONDS).toBe(30);
    expect(env.OCR_RETRY_MAX_SECONDS).toBe(900);
  });

  it("rejects an extraction retry cap below its initial delay", () => {
    expect(() => loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN: "config-worker-token-with-at-least-32-characters",
      OCR_RETRY_INITIAL_SECONDS: "60",
      OCR_RETRY_MAX_SECONDS: "30"
    })).toThrow("OCR_RETRY_MAX_SECONDS");
  });

  it("loads a bounded OCR confidence floor and defaults it to 0.2", () => {
    expect(loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN
    }).OCR_CONFIDENCE_FLOOR).toBe(0.2);
    expect(loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN,
      OCR_CONFIDENCE_FLOOR: "0.35"
    }).OCR_CONFIDENCE_FLOOR).toBe(0.35);
    expect(() => loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN,
      OCR_CONFIDENCE_FLOOR: "1.1"
    })).toThrow();
  });

  it("requires a separate strong OCR worker token", () => {
    expect(() =>
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters"
      })
    ).toThrow();
    expect(() =>
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN: "weak-worker-token"
      })
    ).toThrow();
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN
      }).OCR_WORKER_TOKEN
    ).toBe(OCR_WORKER_TOKEN);
  });

  it("enables API docs outside production and requires a production opt-in", () => {
    const base = {
      JWT_SECRET: "runtime-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN
    };

    expect(loadEnvironment({ ...base, NODE_ENV: "development" }).apiDocsEnabled)
      .toBe(true);
    expect(loadEnvironment({ ...base, NODE_ENV: "production" }).apiDocsEnabled)
      .toBe(false);
    expect(loadEnvironment({
      ...base,
      NODE_ENV: "production",
      API_DOCS_ENABLED: "true"
    }).apiDocsEnabled).toBe(true);
    expect(loadEnvironment({ ...base, API_DOCS_ENABLED: "false" }).apiDocsEnabled)
      .toBe(false);
    expect(() => loadEnvironment({ ...base, API_DOCS_ENABLED: "yes" }))
      .toThrow();
  });

  describe("mail delivery", () => {
    const base = {
      JWT_SECRET: "runtime-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN,
      PUBLIC_FRONTEND_URL: "https://app.lisno.example",
      SMTP_HOST: "smtp.lisno.example",
      SMTP_PORT: "587",
      SMTP_TLS_MODE: "starttls",
      SMTP_USERNAME: "mailer-user",
      SMTP_PASSWORD: "mailer-password",
      SMTP_FROM: "Lisno Invitations <invitations@lisno.example>"
    } as const;

    it("returns disabled only when the entire SMTP group is absent", () => {
      expect(loadEnvironment({
        JWT_SECRET: base.JWT_SECRET,
        OCR_WORKER_TOKEN
      }).mailDelivery).toEqual({ kind: "disabled" });

      for (const key of Object.keys(base).filter((key) =>
        key === "PUBLIC_FRONTEND_URL" || key.startsWith("SMTP_")
      )) {
        const partial = { ...base } as Record<string, string | undefined>;
        delete partial[key];
        expect(() => loadEnvironment(partial), key).toThrow();
      }
    });

    it("parses the complete SMTP group into the public delivery union", () => {
      expect(loadEnvironment(base).mailDelivery).toEqual({
        kind: "smtp",
        publicFrontendUrl: "https://app.lisno.example",
        host: "smtp.lisno.example",
        port: 587,
        tlsMode: "starttls",
        username: "mailer-user",
        password: "mailer-password",
        from: "Lisno Invitations <invitations@lisno.example>",
        deliveryTimeoutMs: 120_000
      });
    });

    it("loads a bounded SMTP delivery deadline for attachment uploads", () => {
      expect(loadEnvironment({
        ...base,
        SMTP_DELIVERY_TIMEOUT_SECONDS: "180"
      }).mailDelivery).toMatchObject({
        kind: "smtp",
        deliveryTimeoutMs: 180_000
      });

      for (const value of ["29", "601", "60.5", "not-a-number"]) {
        expect(() => loadEnvironment({
          ...base,
          SMTP_DELIVERY_TIMEOUT_SECONDS: value
        }), value).toThrow();
      }
    });

    it("accepts credential-free origin-only HTTP frontend URLs", () => {
      expect(loadEnvironment({
        ...base,
        PUBLIC_FRONTEND_URL: "http://app.lisno.example"
      }).mailDelivery).toMatchObject({
        kind: "smtp",
        publicFrontendUrl: "http://app.lisno.example"
      });
    });

    it("rejects the TLS verification setting when the rest of the SMTP group is absent", () => {
      expect(() => loadEnvironment({
        JWT_SECRET: base.JWT_SECRET,
        OCR_WORKER_TOKEN,
        SMTP_TLS_REJECT_UNAUTHORIZED: "true"
      })).toThrow("Mail delivery configuration must be supplied as one complete group.");
    });

    it("rejects the delivery deadline when the rest of the SMTP group is absent", () => {
      expect(() => loadEnvironment({
        JWT_SECRET: base.JWT_SECRET,
        OCR_WORKER_TOKEN,
        SMTP_DELIVERY_TIMEOUT_SECONDS: "120"
      })).toThrow("Mail delivery configuration must be supplied as one complete group.");
    });

    it.each([
      ["PUBLIC_FRONTEND_URL", "https://user:pass@app.lisno.example"],
      ["PUBLIC_FRONTEND_URL", "https://app.lisno.example/path"],
      ["PUBLIC_FRONTEND_URL", "https://app.lisno.example?source=email"],
      ["PUBLIC_FRONTEND_URL", "https://app.lisno.example#invite"],
      ["SMTP_PORT", "0"],
      ["SMTP_PORT", "65536"],
      ["SMTP_PORT", "587.5"],
      ["SMTP_TLS_MODE", "optional"],
      ["SMTP_FROM", "not-an-address"],
      ["SMTP_FROM", "one@example.com, two@example.com"],
      ["SMTP_FROM", "Sender\r\nBcc: victim@example.com <sender@example.com>"],
      ["SMTP_HOST", "smtp.example.com\nunsafe"],
      ["SMTP_USERNAME", "mailer\ruser"],
      ["SMTP_PASSWORD", "password\nunsafe"]
    ])("rejects unsafe %s configuration", (key, value) => {
      expect(() => loadEnvironment({ ...base, [key]: value })).toThrow();
    });

    it("does not permit TLS certificate verification to be disabled", () => {
      expect(() => loadEnvironment({
        ...base,
        SMTP_TLS_REJECT_UNAUTHORIZED: "false"
      })).toThrow();
      expect(loadEnvironment({
        ...base,
        SMTP_TLS_REJECT_UNAUTHORIZED: "true"
      }).mailDelivery.kind).toBe("smtp");
    });

    describe("SendGrid Web API", () => {
      const sendGridBase = {
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        PUBLIC_FRONTEND_URL: "https://app.lisno.example",
        SENDGRID_API_KEY: "SG.fabricated-safe-key-for-tests",
        SENDGRID_FROM: "Lisno Notifications <notifications@lisno.example>"
      } as const;

      it("parses the complete group and defaults its bounded deadline", () => {
        expect(loadEnvironment(sendGridBase).mailDelivery).toEqual({
          kind: "sendgrid_web_api",
          publicFrontendUrl: "https://app.lisno.example",
          apiKey: "SG.fabricated-safe-key-for-tests",
          from: "Lisno Notifications <notifications@lisno.example>",
          deliveryTimeoutMs: 120_000
        });
      });

      it("requires the complete SendGrid group", () => {
        for (const key of [
          "PUBLIC_FRONTEND_URL",
          "SENDGRID_API_KEY",
          "SENDGRID_FROM"
        ] as const) {
          const partial = { ...sendGridBase } as Record<string, string | undefined>;
          delete partial[key];
          expect(() => loadEnvironment(partial), key).toThrow(
            "Mail delivery configuration must be supplied as one complete group."
          );
        }

        expect(() => loadEnvironment({
          JWT_SECRET: sendGridBase.JWT_SECRET,
          OCR_WORKER_TOKEN,
          SENDGRID_DELIVERY_TIMEOUT_SECONDS: "120"
        })).toThrow("Mail delivery configuration must be supplied as one complete group.");
      });

      it("loads a 30-600 second SendGrid delivery deadline", () => {
        expect(loadEnvironment({
          ...sendGridBase,
          SENDGRID_DELIVERY_TIMEOUT_SECONDS: "180"
        }).mailDelivery).toMatchObject({
          kind: "sendgrid_web_api",
          deliveryTimeoutMs: 180_000
        });

        for (const value of ["29", "601", "60.5", "not-a-number"]) {
          expect(() => loadEnvironment({
            ...sendGridBase,
            SENDGRID_DELIVERY_TIMEOUT_SECONDS: value
          }), value).toThrow();
        }
      });

      it.each([
        ["SENDGRID_API_KEY", ""],
        ["SENDGRID_API_KEY", " SG.fabricated-safe-key-for-tests"],
        ["SENDGRID_API_KEY", "SG.fabricated key"],
        ["SENDGRID_API_KEY", "SG.fabricated\nkey"],
        ["SENDGRID_FROM", "not-an-address"],
        ["SENDGRID_FROM", "one@example.com, two@example.com"],
        ["SENDGRID_FROM", "Sender\r\nBcc: victim@example.com <sender@example.com>"]
      ])("rejects unsafe %s configuration", (key, value) => {
        expect(() => loadEnvironment({ ...sendGridBase, [key]: value })).toThrow();
      });

      it("fails closed when any SMTP and SendGrid settings are supplied together", () => {
        const combined = { ...base, ...sendGridBase };
        expect(() => loadEnvironment(combined)).toThrow(
          "SMTP and SendGrid Web API configuration are mutually exclusive."
        );
        expect(() => loadEnvironment({
          ...sendGridBase,
          SMTP_DELIVERY_TIMEOUT_SECONDS: "120"
        })).toThrow("SMTP and SendGrid Web API configuration are mutually exclusive.");
      });

      it("rejects a provider-less frontend URL and non-HTTPS production origin", () => {
        expect(() => loadEnvironment({
          JWT_SECRET: sendGridBase.JWT_SECRET,
          OCR_WORKER_TOKEN,
          PUBLIC_FRONTEND_URL: "https://app.lisno.example"
        })).toThrow("Mail delivery configuration must be supplied as one complete group.");

        expect(() => loadEnvironment({
          ...sendGridBase,
          NODE_ENV: "production",
          PUBLIC_FRONTEND_URL: "http://app.lisno.example"
        })).toThrow("PUBLIC_FRONTEND_URL must use HTTPS in production.");
      });

      it("never includes the SendGrid API key in configuration errors", () => {
        const secret = "SG.fabricated-secret-that-must-not-appear\n";
        let failure: unknown;
        try {
          loadEnvironment({ ...sendGridBase, SENDGRID_API_KEY: secret });
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeDefined();
        expect(String(failure)).not.toContain(secret.trim());
        expect(JSON.stringify(failure)).not.toContain(secret.trim());
      });
    });
  });
});

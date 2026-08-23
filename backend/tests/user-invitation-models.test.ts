import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "../src/domain/audit-actions.js";
import { ROLE_CODES } from "../src/domain/roles.js";
import {
  CONTROL_CHARACTERS,
  INVITABLE_ROLE_CODES,
  USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN,
  USER_INVITATION_EMAIL_MAX,
  USER_INVITATION_MOBILE_MAX,
  USER_INVITATION_NAME_MAX,
  USER_INVITATION_TOKEN_PATTERN,
  USER_INVITATION_TTL_MS,
  expiresAtForInvitation,
  generateUserInvitationToken,
  hashUserInvitationToken,
  invitationEmailSchema,
  invitationMobileSchema,
  invitationNameSchema,
  normalizeInvitationEmail,
  normalizeInvitationMobile,
  presentationStatusForInvitation,
  tokenValidityForInvitation
} from "../src/domain/user-invitations.js";
import { UserInvitationModel } from "../src/models/UserInvitation.js";

const ISSUED_AT = "2026-08-18T10:30:00.000Z";
const EXPIRES_AT = "2026-08-19T10:30:00.000Z";
const NOW = "2026-08-18T12:00:00.000Z";
const TOKEN_HASH = "a".repeat(64);

function invitation(overrides: Record<string, unknown> = {}) {
  return new UserInvitationModel({
    _id: "invitation-1",
    name: "  Priya Rao  ",
    email: "  Priya.Rao@Example.COM  ",
    emailNormalized: "must-not-be-trusted@example.invalid",
    role: "designer",
    mobile: "  +91  98765 43210  ",
    tokenHash: TOKEN_HASH,
    tokenGeneration: 1,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    status: "pending",
    invitedById: "user-super-admin",
    tokenIssuedById: "user-super-admin",
    tokenIssuerVersion: 4,
    acceptedUserId: null,
    acceptedAt: null,
    revokedById: null,
    revokedAt: null,
    supersededByInvitationId: null,
    supersededAt: null,
    deliveryStatus: "queued",
    deliveryAttemptedAt: null,
    sentAt: null,
    deliveryFailureCode: null,
    version: 1,
    ...overrides
  });
}

describe("user invitation domain", () => {
  it("derives every invitable role from the canonical roles except client and super admin", () => {
    expect(INVITABLE_ROLE_CODES).toEqual(
      ROLE_CODES.filter((role) => role !== "client" && role !== "super_admin")
    );
  });

  it("trims names and enforces the explicit 1/120 character boundaries", () => {
    expect(invitationNameSchema.parse("  Priya Rao  ")).toBe("Priya Rao");
    expect(invitationNameSchema.parse("n".repeat(USER_INVITATION_NAME_MAX))).toHaveLength(120);
    expect(() => invitationNameSchema.parse("   ")).toThrow();
    expect(() =>
      invitationNameSchema.parse("n".repeat(USER_INVITATION_NAME_MAX + 1))
    ).toThrow();
  });

  it("preserves a trimmed display email while deriving a bounded lowercase identity", () => {
    const emailAtLimit = `${"a".repeat(242)}@example.com`;
    const emailOverLimit = `${"a".repeat(243)}@example.com`;

    expect(emailAtLimit).toHaveLength(USER_INVITATION_EMAIL_MAX);
    expect(invitationEmailSchema.parse(`  ${emailAtLimit}  `)).toBe(emailAtLimit);
    expect(normalizeInvitationEmail("  Priya.Rao@Example.COM  ")).toBe(
      "priya.rao@example.com"
    );
    expect(() => invitationEmailSchema.parse(emailOverLimit)).toThrow();
  });

  it("normalizes only supported mobile display characters without inventing a country code", () => {
    expect(normalizeInvitationMobile("  +91  98765 43210  ")).toBe(
      "+91 98765 43210"
    );
    expect(normalizeInvitationMobile("9876543210")).toBe("9876543210");
    expect(invitationMobileSchema.parse("+1-2-3-4-5-6-7-8-9-0-1-2-3-4-5")).toHaveLength(
      USER_INVITATION_MOBILE_MAX
    );
    expect(() =>
      invitationMobileSchema.parse("+1-2-3-4-5-6-7-8-9-0-1-2-3-4-5-")
    ).toThrow();
  });

  it.each([
    ["too few digits", "123456"],
    ["too many digits", "1234567890123456"],
    ["misplaced plus", "91+9876543"],
    ["multiple pluses", "++919876543"],
    ["non-ASCII digits", "१२३४५६७८९०"],
    ["letters", "+91 CALL-NOW"],
    ["dot", "+91.9876543"],
    ["slash", "+91/9876543"]
  ])("rejects %s in a mobile number", (_label, value) => {
    expect(() => invitationMobileSchema.parse(value)).toThrow();
  });

  it.each([
    ["CR", "\r"],
    ["LF", "\n"],
    ["NUL", "\u0000"],
    ["DEL", "\u007f"],
    ["C1", "\u0085"]
  ])("rejects %s controls in each identity field before trimming", (_label, control) => {
    expect(CONTROL_CHARACTERS.test(control)).toBe(true);
    expect(() => invitationNameSchema.parse(`Priya${control}Rao`)).toThrow();
    expect(() =>
      invitationEmailSchema.parse(`priya@example.com${control}`)
    ).toThrow();
    expect(() => invitationMobileSchema.parse(`987${control}6543`)).toThrow();
  });

  it("rejects SMTP header injection in both name and email", () => {
    expect(() => invitationNameSchema.parse("Priya\r\nBcc: victim@example.com")).toThrow();
    expect(() =>
      invitationEmailSchema.parse("priya@example.com\nCc: victim@example.com")
    ).toThrow();
  });

  it("generates a 32-byte base64url token, validates its shape, and hashes it to lowercase SHA-256", () => {
    const token = generateUserInvitationToken();

    expect(token).toHaveLength(43);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(USER_INVITATION_TOKEN_PATTERN.test(token)).toBe(true);
    expect(hashUserInvitationToken("A".repeat(43))).toBe(
      "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a"
    );
  });

  it.each([
    "A".repeat(42),
    "A".repeat(44),
    `${"A".repeat(42)}=`,
    `${"A".repeat(42)}+`,
    `${"A".repeat(42)}/`,
    `${"A".repeat(42)}é`
  ])("rejects malformed token shape %s", (token) => {
    expect(USER_INVITATION_TOKEN_PATTERN.test(token)).toBe(false);
    expect(() => hashUserInvitationToken(token)).toThrow();
  });

  it("uses an exact 24-hour invitation interval", () => {
    expect(USER_INVITATION_TTL_MS).toBe(86_400_000);
    expect(expiresAtForInvitation(ISSUED_AT)).toBe(EXPIRES_AT);
  });

  it.each(["accepted", "revoked", "superseded"] as const)(
    "presents terminal %s state before all token and delivery considerations",
    (storedStatus) => {
      expect(
        tokenValidityForInvitation({
          storedStatus,
          expiresAt: "2020-01-01T00:00:00.000Z",
          issuerMatches: false,
          now: NOW
        })
      ).toBe("unavailable");
      expect(
        presentationStatusForInvitation({
          storedStatus,
          expiresAt: "2020-01-01T00:00:00.000Z",
          deliveryStatus: "failed",
          now: NOW
        })
      ).toBe(storedStatus);
    }
  );

  it("separates token validity from presentation status with the required precedence", () => {
    const expired = {
      storedStatus: "pending" as const,
      expiresAt: NOW,
      now: NOW
    };
    expect(tokenValidityForInvitation({ ...expired, issuerMatches: true })).toBe("expired");
    expect(
      presentationStatusForInvitation({ ...expired, deliveryStatus: "failed" })
    ).toBe("expired");

    const unexpired = { ...expired, expiresAt: EXPIRES_AT };
    expect(
      presentationStatusForInvitation({ ...unexpired, deliveryStatus: "failed" })
    ).toBe("delivery_failed");
    expect(
      presentationStatusForInvitation({ ...unexpired, deliveryStatus: "sent" })
    ).toBe("pending");

    const invalidatedValidity = tokenValidityForInvitation({
      ...unexpired,
      issuerMatches: false
    });
    expect(invalidatedValidity).toBe("invalidated");
    expect(invalidatedValidity === "current").toBe(false);
    expect(
      presentationStatusForInvitation({ ...unexpired, deliveryStatus: "sent" })
    ).toBe("pending");
  });

  it("registers the exact invitation audit vocabulary", () => {
    expect(
      AUDIT_ACTIONS.filter(
        (action) => action.startsWith("user_invitation.") || action === "user.invited_created"
      )
    ).toEqual([
      "user_invitation.created",
      "user_invitation.superseded",
      "user_invitation.delivery_sent",
      "user_invitation.delivery_failed",
      "user_invitation.resent",
      "user_invitation.revoked",
      "user_invitation.accepted",
      "user.invited_created"
    ]);
  });

  it("accepts only bounded uppercase-safe delivery failure codes", () => {
    expect(USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN.test("SMTP_TIMEOUT_1")).toBe(true);
    for (const providerText of [
      "smtp_timeout",
      "SMTP-TIMEOUT",
      "550 mailbox rejected: priya@example.com",
      "A".repeat(65)
    ]) {
      expect(USER_INVITATION_DELIVERY_FAILURE_CODE_PATTERN.test(providerText)).toBe(false);
    }
  });
});

describe("UserInvitation model", () => {
  it("persists normalized identity fields without an invitation title", async () => {
    const document = invitation({ title: "Must be discarded" });

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.name).toBe("Priya Rao");
    expect(document.email).toBe("Priya.Rao@Example.COM");
    expect(document.emailNormalized).toBe("priya.rao@example.com");
    expect(document.mobile).toBe("+91 98765 43210");
    expect(document.toObject()).not.toHaveProperty("title");
  });

  it("rejects identity controls at the persistence boundary", async () => {
    await expect(invitation({ name: "Priya\r\nBcc: victim@example.com" }).validate()).rejects.toThrow();
    await expect(invitation({ email: "priya@example.com\u007f" }).validate()).rejects.toThrow();
    await expect(invitation({ mobile: "987\u00856543" }).validate()).rejects.toThrow();
  });

  it("accepts each exact stored state invariant", async () => {
    await expect(invitation().validate()).resolves.toBeUndefined();
    await expect(
      invitation({
        status: "accepted",
        tokenHash: null,
        acceptedUserId: "user-priya",
        acceptedAt: NOW
      }).validate()
    ).resolves.toBeUndefined();
    await expect(
      invitation({
        status: "revoked",
        tokenHash: null,
        revokedById: "user-super-admin",
        revokedAt: NOW
      }).validate()
    ).resolves.toBeUndefined();
    await expect(
      invitation({
        status: "superseded",
        tokenHash: null,
        supersededByInvitationId: "invitation-2",
        supersededAt: NOW
      }).validate()
    ).resolves.toBeUndefined();
  });

  it.each([
    ["pending without hash", { tokenHash: null }],
    ["pending without issuer", { tokenIssuedById: "" }],
    ["pending without issuer version", { tokenIssuerVersion: 0 }],
    ["pending with terminal fields", { acceptedUserId: "user-priya", acceptedAt: NOW }],
    ["wrong current-generation expiry", { expiresAt: "2026-08-19T10:29:59.999Z" }],
    ["accepted without user", { status: "accepted", tokenHash: null, acceptedAt: NOW }],
    ["accepted with hash", { status: "accepted", acceptedUserId: "user-priya", acceptedAt: NOW }],
    ["revoked without actor", { status: "revoked", tokenHash: null, revokedAt: NOW }],
    ["superseded without successor", { status: "superseded", tokenHash: null, supersededAt: NOW }],
    [
      "terminal state with unrelated metadata",
      {
        status: "revoked",
        tokenHash: null,
        revokedById: "user-super-admin",
        revokedAt: NOW,
        acceptedUserId: "user-priya",
        acceptedAt: NOW
      }
    ]
  ])("rejects %s", async (_label, overrides) => {
    await expect(invitation(overrides).validate()).rejects.toThrow();
  });

  it("accepts each exact delivery telemetry state", async () => {
    await expect(invitation().validate()).resolves.toBeUndefined();
    await expect(
      invitation({
        deliveryStatus: "sent",
        deliveryAttemptedAt: NOW,
        sentAt: NOW
      }).validate()
    ).resolves.toBeUndefined();
    await expect(
      invitation({
        deliveryStatus: "failed",
        deliveryAttemptedAt: NOW,
        deliveryFailureCode: "SMTP_TIMEOUT"
      }).validate()
    ).resolves.toBeUndefined();
  });

  it.each([
    ["queued telemetry", { deliveryAttemptedAt: NOW }],
    ["sent without attempt", { deliveryStatus: "sent", sentAt: NOW }],
    ["sent with failure", { deliveryStatus: "sent", deliveryAttemptedAt: NOW, sentAt: NOW, deliveryFailureCode: "SMTP_TIMEOUT" }],
    ["failed without attempt", { deliveryStatus: "failed", deliveryFailureCode: "SMTP_TIMEOUT" }],
    ["failed without code", { deliveryStatus: "failed", deliveryAttemptedAt: NOW }],
    ["failed with sent time", { deliveryStatus: "failed", deliveryAttemptedAt: NOW, sentAt: NOW, deliveryFailureCode: "SMTP_TIMEOUT" }],
    ["failed with provider text", { deliveryStatus: "failed", deliveryAttemptedAt: NOW, deliveryFailureCode: "550 mailbox rejected: priya@example.com" }]
  ])("rejects %s", async (_label, overrides) => {
    await expect(invitation(overrides).validate()).rejects.toThrow();
  });

  it("registers exactly five history-preserving indexes without TTL or pending-email uniqueness", () => {
    const indexes = UserInvitationModel.schema.indexes();

    expect(indexes).toEqual([
      [
        { tokenHash: 1 },
        {
          unique: true,
          partialFilterExpression: { tokenHash: { $type: "string" } }
        }
      ],
      [{ emailNormalized: 1, status: 1, createdAt: -1, _id: -1 }, {}],
      [{ status: 1, createdAt: -1, _id: -1 }, {}],
      [{ status: 1, expiresAt: 1, _id: 1 }, {}],
      [
        { acceptedUserId: 1 },
        {
          unique: true,
          partialFilterExpression: { acceptedUserId: { $type: "string" } }
        }
      ]
    ]);
    expect(indexes.some(([, options]) => "expireAfterSeconds" in options)).toBe(false);
    expect(
      indexes.some(
        ([fields, options]) =>
          options.unique === true && "emailNormalized" in fields && "status" in fields
      )
    ).toBe(false);
  });
});

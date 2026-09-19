import {
  invitationActionCommand,
  invitationDeliveryMessage,
  managedUserActiveCommand,
  validateInvitationDraft,
  type InvitableRole,
  type UserInvitationDraft
} from "./adminIdentityModel";

const roles: readonly InvitableRole[] = ["designer", "site_manager"];
const validDraft: UserInvitationDraft = {
  name: "  Asha Rao  ",
  email: "  asha@example.com ",
  role: "designer",
  mobile: "  +91   98765  43210  "
};

describe("admin identity contracts", () => {
  it("normalizes only the four invitation fields accepted by the backend", () => {
    expect(validateInvitationDraft(validDraft, roles)).toEqual({
      errors: {},
      value: {
        name: "Asha Rao",
        email: "asha@example.com",
        role: "designer",
        mobile: "+91 98765 43210"
      }
    });
  });

  it("rejects roles outside the server-provided list and invalid contact input", () => {
    const result = validateInvitationDraft(
      { ...validDraft, name: "Asha\u0000", email: "bad", role: "client", mobile: "+12" },
      roles
    );
    expect(result.value).toBeUndefined();
    expect(result.errors).toEqual({
      name: expect.stringMatching(/valid name/i),
      email: expect.stringMatching(/valid email/i),
      role: expect.stringMatching(/available role/i),
      mobile: expect.stringMatching(/7 to 15 ASCII digits/i)
    });
  });

  it("builds encoded stable-ID commands with exact CAS bodies", () => {
    expect(managedUserActiveCommand({
      id: "user/a b?",
      name: "Asha",
      email: "asha@example.com",
      active: true,
      version: 7
    }, false)).toEqual({
      path: "/admin/users/user%2Fa%20b%3F",
      body: { version: 7, active: false }
    });
    expect(invitationActionCommand({ id: "invitation/a b?", version: 2 }, "resend")).toEqual({
      path: "/admin/user-invitations/invitation%2Fa%20b%3F/resend",
      body: { version: 2 }
    });
  });

  it("rejects missing or invalid CAS snapshots", () => {
    expect(() => invitationActionCommand({ id: "", version: 1 }, "revoke")).toThrow(/server version/i);
    expect(() => managedUserActiveCommand({
      id: "user-1",
      name: "Asha",
      email: "asha@example.com",
      active: true,
      version: 0
    }, false)).toThrow(/server version/i);
  });

  it("reports delivery from the returned backend state", () => {
    expect(invitationDeliveryMessage("sent")).toBe("Email sent.");
    expect(invitationDeliveryMessage("queued")).toBe("Email queued.");
    expect(invitationDeliveryMessage("failed")).toMatch(/delivery failed/i);
  });
});

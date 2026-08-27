import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { tokenStorage } from "../../api/client";
import type {
  CreateUserInvitationInput,
  InvitableRole,
  UserInvitationItem,
  UserInvitationPresentationStatus
} from "../../api/types";
import {
  createUserInvitation,
  getUserInvitations,
  resendUserInvitation,
  revokeUserInvitation,
  userInvitationKeys,
  userInvitationsPath
} from "./userInvitationsApi";
import {
  acceptUserInvitation,
  inspectUserInvitation
} from "../../auth/userInvitationsApi";

const invitation: UserInvitationItem = {
  id: "invitation-1",
  name: "Asha Rao",
  email: "asha@example.com",
  role: "designer",
  mobile: "+91 98765 43210",
  status: "pending",
  currentLinkAvailable: true,
  availableActions: ["resend", "revoke"],
  invitedBy: {
    id: "user-super-admin",
    name: "Aditi Rao",
    email: "super-admin@lisno.example",
    role: "super_admin"
  },
  issuedAt: "2026-08-23T10:00:00.000Z",
  expiresAt: "2026-08-24T10:00:00.000Z",
  deliveryStatus: "sent",
  deliveryAttemptedAt: "2026-08-23T10:00:01.000Z",
  sentAt: "2026-08-23T10:00:01.000Z",
  version: 2,
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:00:01.000Z"
};

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status });
}

describe("user invitation API contracts", () => {
  it("keeps invitable roles and the six presentation statuses exact", () => {
    expectTypeOf<"client">().not.toMatchTypeOf<InvitableRole>();
    expectTypeOf<"super_admin">().not.toMatchTypeOf<InvitableRole>();
    expectTypeOf<"designer">().toMatchTypeOf<InvitableRole>();

    const statuses: UserInvitationPresentationStatus[] = [
      "pending",
      "delivery_failed",
      "expired",
      "accepted",
      "revoked",
      "superseded"
    ];
    expect(
      statuses.map((status) =>
        userInvitationsPath(
          { status },
          { limit: 20, offset: 0 }
        )
      )
    ).toEqual([
      "/admin/user-invitations?status=pending&limit=20&offset=0",
      "/admin/user-invitations?status=delivery_failed&limit=20&offset=0",
      "/admin/user-invitations?status=expired&limit=20&offset=0",
      "/admin/user-invitations?status=accepted&limit=20&offset=0",
      "/admin/user-invitations?status=revoked&limit=20&offset=0",
      "/admin/user-invitations?status=superseded&limit=20&offset=0"
    ]);
  });

  it("uses canonical protected query order and stable query keys", async () => {
    tokenStorage.set("protected-invitation-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        items: [invitation],
        pagination: { limit: 20, offset: 40, total: 41, hasMore: false },
        invitableRoles: ["admin", "designer", "finance_head", "site_manager"]
      })
    );
    const filters = {
      search: "asha",
      role: "designer" as const,
      status: "delivery_failed" as const,
      deliveryStatus: "failed" as const
    };
    const pagination = { limit: 20, offset: 40 };

    await expect(getUserInvitations(filters, pagination)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "invitation-1", mobile: "+91 98765 43210" })],
      invitableRoles: ["admin", "designer", "finance_head", "site_manager"]
    });

    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "/api/v1/admin/user-invitations?search=asha&role=designer&status=delivery_failed&deliveryStatus=failed&limit=20&offset=40"
    );
    expect(userInvitationKeys.page(filters, pagination)).toEqual([
      "user-invitations",
      filters,
      pagination
    ]);
  });

  it("whitelists create fields and encodes mutation IDs with exact version bodies", async () => {
    tokenStorage.set("protected-invitation-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => jsonResponse(invitation)
    );
    const createInput = {
      name: "Asha Rao",
      email: "asha@example.com",
      role: "designer",
      mobile: "+91 98765 43210",
      title: "must-not-send",
      unexpected: "must-not-send"
    } as CreateUserInvitationInput & Record<string, string>;

    await createUserInvitation(createInput);
    await resendUserInvitation("invitation/a b?", { version: 2 });
    await revokeUserInvitation("invitation/a b?", { version: 3 });

    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "/api/v1/admin/user-invitations"
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      name: "Asha Rao",
      email: "asha@example.com",
      role: "designer",
      mobile: "+91 98765 43210"
    });
    expect(String(fetchSpy.mock.calls[1]?.[0])).toBe(
      "/api/v1/admin/user-invitations/invitation%2Fa%20b%3F/resend"
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({
      version: 2
    });
    expect(String(fetchSpy.mock.calls[2]?.[0])).toBe(
      "/api/v1/admin/user-invitations/invitation%2Fa%20b%3F/revoke"
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[2]?.[1]?.body))).toEqual({
      version: 3
    });
  });

  it("keeps public tokens in no-store request bodies without touching the session", async () => {
    tokenStorage.set("existing-session-token");
    const rawToken = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        name: "Asha Rao",
        email: "asha@example.com",
        role: "designer",
        expiresAt: "2026-08-24T10:00:00.000Z"
      }))
      .mockResolvedValueOnce(jsonResponse({ accepted: true }, 201));

    const inspected = await inspectUserInvitation(rawToken);
    await expect(acceptUserInvitation({
      token: rawToken,
      password: "StrongPassword123!",
      passwordConfirmation: "StrongPassword123!"
    })).resolves.toEqual({ accepted: true });

    expect(inspected).toEqual({
      name: "Asha Rao",
      email: "asha@example.com",
      role: "designer",
      expiresAt: "2026-08-24T10:00:00.000Z"
    });
    expect(inspected).not.toHaveProperty("mobile");
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/v1/auth/user-invitations/inspect",
      "/api/v1/auth/user-invitations/accept"
    ]);
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init).toMatchObject({
        method: "POST",
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      expect(new Headers(init?.headers).get("authorization")).toBeNull();
    }
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      token: rawToken
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))).toEqual({
      token: rawToken,
      password: "StrongPassword123!",
      passwordConfirmation: "StrongPassword123!"
    });
    expect(tokenStorage.get()).toBe("existing-session-token");
    expect(JSON.stringify(userInvitationKeys)).not.toContain(rawToken);
  });
});

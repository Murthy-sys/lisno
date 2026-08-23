import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import type { InvitableRole, UserInvitationItem, UserInvitationPage } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { InviteUserDialog } from "./InviteUserDialog";
import { UserInvitationsPanel } from "./UserInvitationsPanel";
import { userInvitationKeys } from "./userInvitationsApi";

const roles: InvitableRole[] = ["site_manager", "finance_head", "designer"];

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
    name: "Sana Super Admin",
    email: "sana@lisno.example",
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

function page(item: UserInvitationItem = invitation): UserInvitationPage {
  return {
    items: [item],
    pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
    invitableRoles: roles
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function InviteHarness({ onClient }: { onClient?: (client: QueryClient) => void } = {}) {
  const queryClient = useQueryClient();
  onClient?.(queryClient);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open invite</Button>
      {open ? <InviteUserDialog roles={roles} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

async function fillInviteForm(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole("dialog", { name: "Invite user" });
  await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Asha Rao");
  await user.type(within(dialog).getByRole("textbox", { name: "Email" }), "asha@example.com");
  await user.selectOptions(within(dialog).getByRole("combobox", { name: "Role" }), "designer");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Mobile" }), {
    target: { value: "  +91   98765  43210  " }
  });
  return dialog;
}

describe("invitation dialogs", () => {
  it("shows exactly four required server-ordered controls and associates mobile errors", async () => {
    let requestCount = 0;
    server.use(
      http.post("/api/v1/admin/user-invitations", () => {
        requestCount += 1;
        return HttpResponse.error();
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<InviteHarness />);
    const trigger = screen.getByRole("button", { name: "Open invite" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Invite user" });
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(3);
    expect(within(dialog).getAllByRole("combobox")).toHaveLength(1);
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toBeRequired();
    expect(within(dialog).getByRole("textbox", { name: "Email" })).toBeRequired();
    expect(within(dialog).getByRole("combobox", { name: "Role" })).toBeRequired();
    expect(within(dialog).getByRole("textbox", { name: "Mobile" })).toBeRequired();
    expect(
      within(within(dialog).getByRole("combobox", { name: "Role" }))
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Site Manager", "Finance Manager", "Designer"]);
    expect(dialog).not.toHaveTextContent(/title|password|client|project|assignment|impersonat/i);
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveFocus());

    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Asha Rao");
    await user.type(within(dialog).getByRole("textbox", { name: "Email" }), "asha@example.com");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Mobile" }), {
      target: { value: "not-a-number" }
    });
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    const mobile = within(dialog).getByRole("textbox", { name: "Mobile" });
    expect(mobile).toHaveAttribute("aria-invalid", "true");
    expect(mobile).toHaveAccessibleDescription(/7 to 15 ASCII digits/i);
    expect(mobile).toHaveFocus();
    expect(requestCount).toBe(0);
  });

  it("sends one exact normalized body, has no optimistic cache, blocks busy close, and announces safe delivery", async () => {
    const response = deferred<Response>();
    let requestBody: unknown;
    let requestCount = 0;
    server.use(
      http.post("/api/v1/admin/user-invitations", async ({ request }) => {
        requestCount += 1;
        requestBody = await request.json();
        return response.promise;
      })
    );
    const user = userEvent.setup();
    let queryClient!: QueryClient;
    renderWithQuery(<InviteHarness onClient={(client) => { queryClient = client; }} />);
    const filters = { status: "pending" as const };
    const pagination = { limit: 20, offset: 0 };
    const cachedPage = page();
    queryClient.setQueryData(userInvitationKeys.page(filters, pagination), cachedPage);
    const trigger = screen.getByRole("button", { name: "Open invite" });
    await user.click(trigger);
    const dialog = await fillInviteForm(user);
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(requestCount).toBe(1));
    expect(requestBody).toEqual({
      name: "Asha Rao",
      email: "asha@example.com",
      role: "designer",
      mobile: "+91 98765 43210"
    });
    expect(queryClient.getQueryData(userInvitationKeys.page(filters, pagination))).toBe(cachedPage);
    expect(queryClient.getMutationCache().getAll().at(-1)?.options.retry).toBe(false);
    expect(within(dialog).getByRole("button", { name: "Close Invite user" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();

    response.resolve(HttpResponse.json({ data: invitation }, { status: 201 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("status", { name: "Application announcements" })).toHaveTextContent(
      "Invitation created. Email sent."
    );
  });

  it("preserves every create field after a one-shot 503 and never exposes a link", async () => {
    let requestCount = 0;
    server.use(
      http.post("/api/v1/admin/user-invitations", () => {
        requestCount += 1;
        return HttpResponse.json(
          { error: { code: "INVITATION_DELIVERY_UNAVAILABLE", message: "Delivery unavailable." } },
          { status: 503 }
        );
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<InviteHarness />);
    await user.click(screen.getByRole("button", { name: "Open invite" }));
    const dialog = await fillInviteForm(user);
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Invitation delivery is unavailable"
    );
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Asha Rao");
    expect(within(dialog).getByRole("textbox", { name: "Email" })).toHaveValue("asha@example.com");
    expect(within(dialog).getByRole("combobox", { name: "Role" })).toHaveValue("designer");
    expect(within(dialog).getByRole("textbox", { name: "Mobile" })).toHaveValue("  +91   98765  43210  ");
    expect(dialog).not.toHaveTextContent(/token|https?:\/\//i);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(requestCount).toBe(1);
  });

  it("latches VERSION_CONFLICT for the dialog lifetime even when refetch returns the same version", async () => {
    let listCount = 0;
    let resendCount = 0;
    server.use(
      http.get("/api/v1/admin/user-invitations", () => {
        listCount += 1;
        return HttpResponse.json({ data: page() });
      }),
      http.post("/api/v1/admin/user-invitations/invitation-1/resend", async ({ request }) => {
        resendCount += 1;
        expect(await request.json()).toEqual({ version: 2 });
        return HttpResponse.json(
          { error: { code: "VERSION_CONFLICT", message: "Invitation changed." } },
          { status: 409 }
        );
      })
    );
    const user = userEvent.setup();
    renderWithQuery(
      <UserInvitationsPanel
        actorRole="super_admin"
        permissions={[
          "identity.user_invitations.read",
          "identity.user_invitations.resend",
          "identity.user_invitations.revoke"
        ]}
      />
    );
    await user.click(await screen.findByRole("button", { name: "Resend Asha Rao" }));
    const dialog = screen.getByRole("dialog", { name: "Resend invitation for Asha Rao" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm resend" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Close this dialog and reopen"
    );
    await waitFor(() => expect(listCount).toBe(2));
    expect(within(dialog).getByRole("button", { name: "Confirm resend" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Revoke instead" })).toBeDisabled();
    expect(resendCount).toBe(1);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Resend Asha Rao" }));
    expect(
      within(screen.getByRole("dialog", { name: "Resend invitation for Asha Rao" }))
        .getByRole("button", { name: "Confirm resend" })
    ).toBeEnabled();
    expect(resendCount).toBe(1);
  });

  it("updates the accessible dialog title when switching to the alternate action", async () => {
    server.use(
      http.get("/api/v1/admin/user-invitations", () =>
        HttpResponse.json({ data: page() })
      )
    );
    const user = userEvent.setup();
    renderWithQuery(
      <UserInvitationsPanel
        actorRole="super_admin"
        permissions={[
          "identity.user_invitations.read",
          "identity.user_invitations.resend",
          "identity.user_invitations.revoke"
        ]}
      />
    );

    await user.click(await screen.findByRole("button", { name: "Resend Asha Rao" }));
    const resendDialog = screen.getByRole("dialog", {
      name: "Resend invitation for Asha Rao"
    });
    await user.click(within(resendDialog).getByRole("button", { name: "Revoke instead" }));

    expect(
      screen.getByRole("dialog", { name: "Revoke invitation for Asha Rao" })
    ).toBeVisible();
  });

  it("retains the safe resend snapshot after a one-shot delivery 503", async () => {
    let resendCount = 0;
    server.use(
      http.get("/api/v1/admin/user-invitations", () =>
        HttpResponse.json({ data: page() })
      ),
      http.post("/api/v1/admin/user-invitations/invitation-1/resend", async ({ request }) => {
        resendCount += 1;
        expect(await request.json()).toEqual({ version: 2 });
        return HttpResponse.json(
          { error: { code: "INVITATION_DELIVERY_UNAVAILABLE", message: "Delivery unavailable." } },
          { status: 503 }
        );
      })
    );
    const user = userEvent.setup();
    renderWithQuery(
      <UserInvitationsPanel
        actorRole="super_admin"
        permissions={[
          "identity.user_invitations.read",
          "identity.user_invitations.resend"
        ]}
      />
    );
    await user.click(await screen.findByRole("button", { name: "Resend Asha Rao" }));
    const dialog = screen.getByRole("dialog", { name: "Resend invitation for Asha Rao" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm resend" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Invitation delivery is unavailable"
    );
    expect(dialog).toHaveTextContent("Asha Rao");
    expect(dialog).toHaveTextContent("asha@example.com");
    expect(dialog).not.toHaveTextContent(/token|https?:\/\//i);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(resendCount).toBe(1);
    expect(within(dialog).getByRole("button", { name: "Confirm resend" })).toBeEnabled();
  });
});

interface EnabledInvitationMailer {
  sendInvitation(input: {
    recipient: { name: string; email: string };
    roleLabel: string;
    rawToken: string;
    expiresAt: string;
  }): Promise<void>;
}

export type InvitationMailer =
  | { readonly deliveryKind: "disabled" }
  | (EnabledInvitationMailer & { readonly deliveryKind: "external" })
  | (EnabledInvitationMailer & { readonly deliveryKind: "local_test" });

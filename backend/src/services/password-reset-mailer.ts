interface EnabledPasswordResetMailer {
  sendResetLink(input: {
    recipient: { name: string; email: string };
    rawToken: string;
    expiresAt: string;
  }): Promise<void>;

  sendPasswordChanged(input: {
    recipient: { name: string; email: string };
    changedAt: string;
  }): Promise<void>;
}

export type PasswordResetMailer =
  | { readonly deliveryKind: "disabled" }
  | (EnabledPasswordResetMailer & { readonly deliveryKind: "external" })
  | (EnabledPasswordResetMailer & { readonly deliveryKind: "local_test" });

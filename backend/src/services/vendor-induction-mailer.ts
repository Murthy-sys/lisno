export interface VendorInductionMailMessage {
  readonly recipient: { readonly name: string; readonly email: string };
  readonly rawToken: string;
  readonly expiresAt: string;
  readonly changeNote: string | null;
}
export type VendorInductionMailer =
  | { readonly deliveryKind: "disabled" }
  | { readonly deliveryKind: "external" | "local_test"; sendRequest(message: VendorInductionMailMessage): Promise<void> };

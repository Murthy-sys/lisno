interface EnabledVendorKpiMailer {
  sendRequest(input: { recipient: { name: string; email: string }; rawToken: string; expiresAt: string }): Promise<void>;
}
export type VendorKpiMailer =
  | { readonly deliveryKind: "disabled" }
  | (EnabledVendorKpiMailer & { readonly deliveryKind: "external" })
  | (EnabledVendorKpiMailer & { readonly deliveryKind: "local_test" });

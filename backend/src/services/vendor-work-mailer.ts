export interface VendorWorkMail {
  recipient: { name: string; email: string };
  projectId: string;
  orderId: string;
  setupPending: boolean;
}
export type VendorWorkMailer = { readonly deliveryKind: "disabled" } | {
  readonly deliveryKind: "external" | "local_test";
  sendNewWork(input: VendorWorkMail): Promise<void>;
};

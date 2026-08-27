export interface EnabledEstimateMailer {
  send(input: {
    to: string;
    clientName: string;
    projectName: string;
    estimateVersion: number;
    total: number;
    portalUrl: string;
    attachment: {
      filename: string;
      mimeType: "application/pdf";
      bytes: Buffer;
    };
  }): Promise<{ kind: "sent" } | { kind: "failed"; failureCode: string }>;
}

export type EstimateMailer =
  | { readonly deliveryKind: "disabled" }
  | (EnabledEstimateMailer & {
      readonly deliveryKind: "external" | "local_test";
    });

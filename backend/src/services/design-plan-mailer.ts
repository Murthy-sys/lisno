export interface DesignPlanAttachment {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export interface EnabledDesignPlanMailer {
  sendDesignPlan(input: {
    to: string;
    clientName: string;
    projectName: string;
    designPlanVersion: number;
    portalUrl: string;
    attachments: DesignPlanAttachment[];
  }): Promise<{ kind: "sent" } | { kind: "failed"; failureCode: string }>;
}

export type DesignPlanMailer =
  | { readonly deliveryKind: "disabled" }
  | (EnabledDesignPlanMailer & {
      readonly deliveryKind: "external" | "local_test";
    });

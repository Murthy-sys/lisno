export interface ProposalTextSection {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface ProposalPaymentStage {
  readonly id: string;
  readonly title: string;
  readonly trigger: string;
  readonly description: string;
  readonly basisPoints: number;
}

export interface EstimateProposalTerms {
  readonly designWorkingDays: number;
  readonly executionWorkingDays: number;
  readonly paymentDueWorkingDays: number;
  readonly validityDays: number;
  readonly paymentStages: readonly ProposalPaymentStage[];
  readonly clauses: readonly ProposalTextSection[];
  readonly materials: readonly { readonly area: string; readonly specification: string }[];
  readonly exclusions: readonly ProposalTextSection[];
  readonly workflow: readonly { readonly id: string; readonly title: string; readonly timing: string; readonly steps: readonly string[] }[];
  readonly changeReasons: readonly ProposalTextSection[];
  readonly company: {
    readonly name: string;
    readonly phone: string;
    readonly email: string;
    readonly website: string;
    readonly social: string;
    readonly studioAddress: string;
  };
}

/** Frozen document metadata. Absent on publications made before the proposal template. */
export interface EstimateProposalMetadata {
  readonly templateVersion: "lisno-proposal-v1";
  readonly defaultsVersion: 1;
  readonly issuedAt: string;
  readonly validUntil: string;
  readonly reference: string;
  readonly preparedBy: string;
  readonly signatoryName: string;
  readonly terms: EstimateProposalTerms;
}

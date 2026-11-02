import type { EstimatePdfInput } from "../estimate-pdf.service.js";
import { estimateProposalSchema, type EstimateProposalMetadata } from "../../domain/estimate-proposal.js";
import { loadProposalAssets } from "./assets.js";
import { ProposalDocument } from "./document.js";
import { proposalGroups, proposalTotals } from "./content.js";
import { details } from "./details.js";
import { acceptance, cover, exclusions, investment, payments, scope, terms, welcome, workflow } from "./pages.js";

export async function renderEstimateProposalPdf(input: EstimatePdfInput & { proposal: EstimateProposalMetadata }, options: { logoSvg?: Buffer } = {}): Promise<Buffer> {
  const proposal = estimateProposalSchema.parse(input.proposal);
  const source = { ...input, proposal };
  const totals = proposalTotals(source), groups = proposalGroups(source);
  const pdf = new ProposalDocument(await loadProposalAssets(options.logoSvg), proposal, source.lead.clientName);
  cover(pdf, source);
  welcome(pdf, source, totals.total);
  scope(pdf, groups);
  details(pdf, groups);
  investment(pdf, source, groups, totals);
  payments(pdf, source, totals.total);
  workflow(pdf, source);
  exclusions(pdf, source);
  terms(pdf, source);
  acceptance(pdf, source, totals.total);
  return pdf.finish();
}

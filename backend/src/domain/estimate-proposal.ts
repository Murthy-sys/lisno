import { z } from "zod";
import { readProjectNumber } from "./project-number.js";
import type { EstimateProposalMetadata, EstimateProposalTerms, ProposalPaymentStage } from "../../../shared/estimation/estimateProposal.js";

export type { EstimateProposalMetadata, EstimateProposalTerms, ProposalPaymentStage } from "../../../shared/estimation/estimateProposal.js";

const text = z.string().trim().min(1).max(2000);
const shortText = z.string().trim().min(1).max(200);
const section = z.object({ id: shortText, title: shortText, body: text }).strict();
const paymentStage = z.object({ id: shortText, title: shortText, trigger: text, description: text,
  basisPoints: z.number().int().positive().max(10_000) }).strict();
const termsSchema = z.object({
  designWorkingDays: z.number().int().positive().max(1000),
  executionWorkingDays: z.number().int().positive().max(1000),
  paymentDueWorkingDays: z.number().int().positive().max(365),
  validityDays: z.number().int().positive().max(365),
  paymentStages: z.array(paymentStage).length(5),
  clauses: z.array(section).min(1).max(16),
  materials: z.array(z.object({ area: shortText, specification: text }).strict()).min(1).max(16),
  exclusions: z.array(section).min(1).max(16),
  workflow: z.array(z.object({ id: shortText, title: shortText, timing: shortText,
    steps: z.array(text).min(1).max(8) }).strict()).length(4),
  changeReasons: z.array(section).min(1).max(8),
  company: z.object({ name: shortText, phone: shortText, email: z.string().email().max(200),
    website: shortText, social: shortText, studioAddress: text }).strict()
}).strict();

export const estimateProposalSchema = z.object({
  templateVersion: z.literal("lisno-proposal-v1"), defaultsVersion: z.literal(1),
  issuedAt: z.string().datetime({ offset: true }), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: shortText, preparedBy: shortText, signatoryName: shortText, terms: termsSchema
}).strict().superRefine((proposal, context) => {
  const stages = proposal.terms.paymentStages;
  if (stages.reduce((sum, stage) => sum + stage.basisPoints, 0) !== 10_000 || new Set(stages.map(stage => stage.id)).size !== stages.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["terms", "paymentStages"], message: "Payment stages must have unique identities and total 100%." });
  }
  const canCheckValidity = Number.isFinite(Date.parse(proposal.issuedAt)) && Number.isInteger(proposal.terms.validityDays) &&
    proposal.terms.validityDays >= 1 && proposal.terms.validityDays <= 365;
  if (canCheckValidity && proposal.validUntil !== proposalValidityDate(proposal.issuedAt, proposal.terms.validityDays)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "Validity must match the issue date and frozen validity period." });
  }
  for (const key of ["clauses", "exclusions", "workflow", "changeReasons"] as const) {
    const rows = proposal.terms[key];
    if (new Set(rows.map(row => row.id)).size !== rows.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["terms", key], message: "Section identities must be unique." });
  }
});

// Version 1 is retained for historical documents. Change defaults by adding a version,
// never by reinterpreting the terms already stored in a published snapshot.
const defaults: EstimateProposalTerms = {
  designWorkingDays: 21, executionWorkingDays: 60, paymentDueWorkingDays: 3, validityDays: 15,
  paymentStages: [
    { id: "booking", title: "Booking advance", trigger: "On signing the agreement", description: "Confirms your project and assigns your design team.", basisPoints: 1000 },
    { id: "production", title: "Production drawings", trigger: "On sign-off of all production drawings", description: "Lets us order materials, hardware and custom parts.", basisPoints: 4000 },
    { id: "pre_delivery", title: "Pre-delivery", trigger: "Before materials are sent to site", description: "Delivery is scheduled once this is received.", basisPoints: 2500 },
    { id: "woodwork", title: "Woodwork delivery", trigger: "On delivery of woodwork, before installation", description: "Usually falls 3-4 days after stage 03.", basisPoints: 2000 },
    { id: "final", title: "Final stage", trigger: "Before shutter fixing", description: "Before profile shutter delivery, deep cleaning of units and debris cleaning.", basisPoints: 500 }
  ],
  clauses: [
    { id: "scope", title: "Scope", body: "This estimate covers the scope discussed and approved. Any addition, removal or change is re-quoted at standard rates." },
    { id: "price", title: "Price & discount", body: "The project price applies to the full scope only. If items are removed, pricing is recalculated at actual rates. Any agreed discount cannot be moved to other items and depends on payments arriving on schedule." },
    { id: "payments", title: "Payments", body: "Each payment is due within 3 working days of its milestone. Late payments may pause work and move the timeline." },
    { id: "validity", title: "Validity", body: "This estimate is valid until the date shown. After that, rates may be revised to current material and labour costs." },
    { id: "warranty", title: "Warranty", body: "For items we supply: manufacturer warranty plus our installation warranty. For items you supply: our installation warranty only." },
    { id: "lights", title: "Lights & fixtures", body: "If you supply lights or fixtures, fixing is charged at a fixed labour rate per fitting. Removed items cannot be swapped for others at the discounted rate." },
    { id: "hardware", title: "Hardware", body: "Hinges and drawer channels are included where specified. Handles, organisers, special fittings and mechanisms are extra unless listed. Hardware needed later because of design or site changes is added only with your approval." },
    { id: "changes", title: "Changes after sign-off", body: "Changes need new drawings and fresh orders (most finishes have 15-30 day lead times), so the timeline moves by the time those take." }
  ],
  materials: [
    { area: "Dry areas", specification: "MR-grade plywood, Greenply" },
    { area: "Wet areas (kitchen, utility)", specification: "BWP plywood, Greenply" },
    { area: "Hinges", specification: "Hettich soft-close throughout" },
    { area: "Wardrobe drawers", specification: "Hettich Quadro channels" },
    { area: "Laminates", specification: "Premium branded only" },
    { area: "Internals", specification: "High-quality laminate finish" }
  ],
  exclusions: [
    { id: "handles", title: "Handles & knobs", body: "Handles and knobs for non-kitchen units, unless expressly listed. You buy them; we fix them where agreed." },
    { id: "granite", title: "Granite", body: "Countertop supply and installation, including cutting, edge polishing and sink and hob cut-outs. We coordinate the measurements." },
    { id: "plumbing", title: "Sink & plumbing", body: "Kitchen sink supply and all plumbing connections, by your plumber." },
    { id: "appliances", title: "Appliances", body: "Hob, chimney, oven and microwave, supplied and installed by you. We provide the carpentry cut-outs where specified." },
    { id: "dado", title: "Dado tiles", body: "Supplied by you; fixing can be done by the granite fabricator." },
    { id: "electrical", title: "Electrical", body: "Wiring, points, switches and light fittings. Grooves for kitchen and wardrobes are included only where listed; we can suggest vendors." },
    { id: "ceilings", title: "Ceilings & walls", body: "False ceiling, painting, wallpaper and wall treatments, except items expressly included in the detailed estimate." },
    { id: "civil", title: "Civil & bathrooms", body: "Civil work, flooring, plumbing and bathroom fittings." },
    { id: "furniture", title: "Furniture & decor", body: "Loose furniture (beds, sofa, dining), curtains, blinds, rugs and decor." },
    { id: "extras", title: "Additional features", body: "Ledges, back panels and other additional features unless expressly listed in the approved scope." },
    { id: "building", title: "Society & building", body: "Permissions, lift booking and deposits." },
    { id: "other", title: "Anything else", body: "Work beyond this estimate is quoted separately for your approval." }
  ],
  workflow: [
    { id: "design", title: "Design", timing: "21 working days", steps: ["Site measurement and detailed brief", "Concept and mood board: materials and palette", "2D layouts and furniture plan", "3D visuals of every room", "Material, finish and fixture selection"] },
    { id: "selection", title: "Selection & sign-off", timing: "Paced by your approvals", steps: ["Final design presentation", "Material samples approved", "Production drawings signed", "Estimate updated to the final design"] },
    { id: "execution", title: "Execution", timing: "60 working days", steps: ["Site preparation and protection", "Factory production of all woodwork", "Delivery and installation", "Weekly progress updates"] },
    { id: "handover", title: "Handover", timing: "Completion", steps: ["Snag walkthrough with you", "All snags closed", "Warranty documents handed over", "Completion certificate"] }
  ],
  changeReasons: [
    { id: "materials", title: "Material lead time", body: "Most finishes and fittings take 15-30 days to arrive once ordered." },
    { id: "drawings", title: "New drawings", body: "A change means revised drawings, approvals and an updated estimate." },
    { id: "vendors", title: "Vendor slots", body: "Specialist teams are booked in sequence and may need rescheduling." },
    { id: "sequence", title: "Site sequence", body: "Work in progress has to be paused, checked and re-planned." }
  ],
  company: { name: "Lisno India Pvt Ltd", phone: "+91 98800 05076", email: "info@lisno.co.in", website: "lisno.co.in", social: "@lisnoindia",
    studioAddress: "3rd Floor, Varthur-Sarjapur Road, opp. Greenwood High School, Chikkavaderapura, Bengaluru 560087" }
};

export function proposalValidityDate(issuedAt: string | Date, days: number): string {
  const instant = new Date(issuedAt);
  if (!Number.isFinite(instant.getTime()) || !Number.isInteger(days) || days < 1 || days > 365) throw new TypeError("Invalid proposal validity period.");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const part = (type: string) => Number(parts.find(value => value.type === type)!.value);
  const expiry = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + days));
  return expiry.toISOString().slice(0, 10);
}

export function createEstimateProposal(input: { issuedAt: Date; projectNumber?: string | null; estimateId: string; preparedBy?: string | null }): EstimateProposalMetadata {
  const projectNumber = readProjectNumber(input.projectNumber);
  return estimateProposalSchema.parse({
    templateVersion: "lisno-proposal-v1", defaultsVersion: 1,
    issuedAt: input.issuedAt.toISOString(), validUntil: proposalValidityDate(input.issuedAt, defaults.validityDays),
    reference: projectNumber ?? input.estimateId, preparedBy: input.preparedBy?.trim() || "Team Lisno",
    signatoryName: "Authorized signatory", terms: structuredClone(defaults)
  });
}

export function readEstimateProposal(value: unknown): EstimateProposalMetadata | null {
  const result = estimateProposalSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function proposalPayments(totalPaise: number, stages: readonly ProposalPaymentStage[]): Array<ProposalPaymentStage & { amountPaise: number }> {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0 || stages.length !== 5 ||
    stages.some(stage => !Number.isSafeInteger(stage.basisPoints) || stage.basisPoints <= 0 || stage.basisPoints > 10_000) ||
    stages.reduce((sum, stage) => sum + stage.basisPoints, 0) !== 10_000) throw new TypeError("Invalid proposal payment basis.");
  let remaining = totalPaise;
  return stages.map((stage, index) => {
    // Whole paise only. The final stage receives the sub-paise allocation remainder.
    const amountPaise = index === stages.length - 1 ? remaining : Number(BigInt(totalPaise) * BigInt(stage.basisPoints) / 10_000n);
    remaining -= amountPaise;
    return { ...stage, amountPaise };
  });
}

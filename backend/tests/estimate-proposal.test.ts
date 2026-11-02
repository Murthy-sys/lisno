import { describe, expect, it } from "vitest";
import { createEstimateProposal, estimateProposalSchema, proposalPayments, proposalValidityDate, readEstimateProposal } from "../src/domain/estimate-proposal.js";

const create = () => createEstimateProposal({ issuedAt: new Date("2026-10-25T06:24:17.000Z"), estimateId: "estimate-a", projectNumber: "Lisno000076", preparedBy: "Project team" });

describe("frozen estimate proposal defaults", () => {
  it("uses the actual reference/issue date and approved commercial defaults", () => {
    const proposal = create();
    expect(proposal).toMatchObject({ templateVersion: "lisno-proposal-v1", defaultsVersion: 1, reference: "Lisno000076",
      issuedAt: "2026-10-25T06:24:17.000Z", validUntil: "2026-11-09", preparedBy: "Project team", signatoryName: "Authorized signatory",
      terms: { designWorkingDays: 21, executionWorkingDays: 60, validityDays: 15, paymentDueWorkingDays: 3 } });
    expect(proposal.terms.paymentStages.map(stage => stage.basisPoints)).toEqual([1000, 4000, 2500, 2000, 500]);
    expect(JSON.stringify(proposal)).not.toMatch(/Winny|E076|5,65,000|58517|25 October/);
    expect(proposal.terms.materials.map(row => row.specification)).toContain("Hettich Quadro channels");
  });

  it("keeps separate estimates and future defaults independent of returned object mutations", () => {
    const first = create();
    (first.terms.paymentStages[0] as { basisPoints: number }).basisPoints = 9000;
    const second = createEstimateProposal({ issuedAt: new Date("2026-12-22T12:00:00Z"), estimateId: "estimate-b", projectNumber: "Lisno000199" });
    expect(second.reference).toBe("Lisno000199");
    expect(second.validUntil).toBe("2027-01-06");
    expect(second.preparedBy).toBe("Team Lisno");
    expect(second.terms.paymentStages[0].basisPoints).toBe(1000);
    expect(create().terms.paymentStages[0].basisPoints).toBe(1000);
  });

  it("uses an honest estimate reference for legacy projects and rejects malformed canonical numbers", () => {
    expect(createEstimateProposal({ issuedAt: new Date("2026-11-02T00:00:00Z"), estimateId: "legacy-estimate", preparedBy: " " }).reference).toBe("legacy-estimate");
    expect(() => createEstimateProposal({ issuedAt: new Date(), estimateId: "estimate-a", projectNumber: "Lisno0" })).toThrow();
  });

  it.each([
    ["2026-12-31T18:29:59Z", 15, "2027-01-15"],
    ["2026-12-31T18:30:00Z", 15, "2027-01-16"],
    ["2028-02-14T19:00:00Z", 15, "2028-03-01"]
  ])("uses the India calendar at %s", (instant, days, expected) => {
    expect(proposalValidityDate(instant, days)).toBe(expected);
  });

  it.each([
    { templateVersion: "future" }, { defaultsVersion: 2 }, { issuedAt: "bad-date" },
    { validUntil: "2026-02-30" }, { validUntil: "2026-11-10" }, { reference: "" },
    { terms: { ...create().terms, validityDays: -1 } },
    { terms: { ...create().terms, paymentStages: create().terms.paymentStages.slice(1) } },
    { terms: { ...create().terms, paymentStages: create().terms.paymentStages.map((stage, index) => index ? stage : { ...stage, basisPoints: 2000 }) } },
    { terms: { ...create().terms, paymentStages: create().terms.paymentStages.map(stage => ({ ...stage, id: "same" })) } },
    { extraPrivateValue: "must not be silently stripped" }
  ])("rejects invalid explicit metadata without reverting to legacy: %j", change => {
    expect(readEstimateProposal({ ...create(), ...change })).toBeNull();
    expect(estimateProposalSchema.safeParse({ ...create(), ...change }).success).toBe(false);
  });
});

describe("proposal payment amounts", () => {
  it("calculates the five reference percentages against actual payable totals", () => {
    expect(proposalPayments(56_500_000, create().terms.paymentStages).map(stage => stage.amountPaise)).toEqual([5_650_000, 22_600_000, 14_125_000, 11_300_000, 2_825_000]);
    expect(proposalPayments(14308, create().terms.paymentStages).map(stage => stage.amountPaise)).toEqual([1430, 5723, 3577, 2861, 717]);
  });

  it.each([0, 1, 2, 5, 19, 101, 1_234_567, Number.MAX_SAFE_INTEGER])("reconciles %s paise exactly without floating point", total => {
    const stages = proposalPayments(total, create().terms.paymentStages);
    expect(stages.every(stage => Number.isSafeInteger(stage.amountPaise) && stage.amountPaise >= 0)).toBe(true);
    expect(stages.reduce((sum, stage) => BigInt(stage.amountPaise) + sum, 0n)).toBe(BigInt(total));
    expect(stages[4].amountPaise).toBe(total - stages.slice(0, 4).reduce((sum, stage) => sum + stage.amountPaise, 0));
  });

  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid payable totals %s", value => {
    expect(() => proposalPayments(value, create().terms.paymentStages)).toThrow();
  });
});

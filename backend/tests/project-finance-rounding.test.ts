import { describe, expect, it } from "vitest";
import { projectFinanceBaseline } from "../src/domain/project-finance.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectFinanceBaselineRevisionModel } from "../src/models/ProjectFinanceBaselineRevision.js";
import { effectiveProjectFinanceBucket } from "../src/services/project-finance.service.js";

const first = { subtotalRupees: 121.25, gstRupees: 21.83, totalRupees: 143,
  subtotalPaise: 12_125, gstPaise: 2_183, totalPaise: 14_300, roundOffPaise: -8 };
const second = { subtotalRupees: 70.03, gstRupees: 12.61, totalRupees: 83,
  subtotalPaise: 7_003, gstPaise: 1_261, totalPaise: 8_300, roundOffPaise: 36 };

function bucket(money = first) {
  return new ProjectFinanceBucketModel({ _id: "rounding-bucket", projectId: "rounding-project",
    estimateId: "rounding-estimate", estimateVersion: 3, createdById: "finance-admin",
    ...projectFinanceBaseline(money) });
}

describe("approved estimate total round-off", () => {
  it("carries both signs across unequal projects without changing revenue, GST or reserves", async () => {
    const a = projectFinanceBaseline(first);
    const b = projectFinanceBaseline(second);
    expect(a).toMatchObject({ approvedSubtotalPaise: 12_125, approvedGstPaise: 2_183,
      approvedContractTotalPaise: 14_300, approvedRoundOffPaise: -8, targetProfitPaise: 2_425, costBudgetPaise: 9_700 });
    expect(b).toMatchObject({ approvedSubtotalPaise: 7_003, approvedGstPaise: 1_261,
      approvedContractTotalPaise: 8_300, approvedRoundOffPaise: 36, targetProfitPaise: 1_401, costBudgetPaise: 5_602 });
    await expect(bucket(first).validate()).resolves.toBeUndefined();
    await expect(bucket(second).validate()).resolves.toBeUndefined();
  });

  it("keeps exactly fifty paise rounded down and explicit zero distinct from legacy absence", () => {
    expect(projectFinanceBaseline({ subtotalRupees: 125, gstRupees: 22.5, totalRupees: 147,
      subtotalPaise: 12_500, gstPaise: 2_250, totalPaise: 14_700, roundOffPaise: -50
    }).approvedRoundOffPaise).toBe(-50);
    const legacy = projectFinanceBaseline({ ...first, totalRupees: 143.08, totalPaise: 14_308, roundOffPaise: undefined });
    expect(legacy).not.toHaveProperty("approvedRoundOffPaise");
    const exact = projectFinanceBaseline({ subtotalRupees: 100, gstRupees: 18, totalRupees: 118,
      subtotalPaise: 10_000, gstPaise: 1_800, totalPaise: 11_800, roundOffPaise: 0 });
    expect(exact).toHaveProperty("approvedRoundOffPaise", 0);
  });

  it.each([undefined, null, "-8", -7, -8.5, -51, 50])("rejects invalid approved adjustment %s", (roundOffPaise) => {
    expect(() => projectFinanceBaseline({ ...first, roundOffPaise } as never)).toThrow(/subtotal and GST/);
  });

  it("validates both stored bucket and immutable revision round-off", async () => {
    const invalidBucket = bucket();
    invalidBucket.set("approvedRoundOffPaise", -7);
    await expect(invalidBucket.validate()).rejects.toThrow(/subtotal and GST/);
    const source = { ...projectFinanceBaseline(first), revisionId: "revision-rounded", phase: "pre",
      estimateId: "estimate-rounded", estimateVersion: 3, estimateReviewRoundId: "round-rounded",
      approvedAt: new Date("2026-11-08T00:00:00Z"), approvedById: "client-rounded" };
    const revision = new ProjectFinanceBaselineRevisionModel({ _id: "revision-rounded", projectId: "project-rounded", source });
    await expect(revision.validate()).resolves.toBeUndefined();
    expect(revision.toObject().source.approvedRoundOffPaise).toBe(-8);
    const invalidRevision = new ProjectFinanceBaselineRevisionModel({ _id: "revision-bad", projectId: "project-rounded",
      source: { ...source, approvedRoundOffPaise: 8 } });
    await expect(invalidRevision.validate()).rejects.toThrow(/subtotal and GST/);
  });

  it("never inherits initial adjustment when an effective legacy revision omits it", () => {
    const initial = projectFinanceBaseline(first);
    const legacy = projectFinanceBaseline({ ...second, totalRupees: 82.64, totalPaise: 8_264, roundOffPaise: undefined });
    const stored = { ...initial, effectiveBaseline: legacy };
    expect(effectiveProjectFinanceBucket(stored)).not.toHaveProperty("approvedRoundOffPaise");
    expect(stored.approvedRoundOffPaise).toBe(-8);
    expect(effectiveProjectFinanceBucket({ ...initial, effectiveBaseline: projectFinanceBaseline(second) }))
      .toMatchObject({ approvedRoundOffPaise: 36, approvedContractTotalPaise: 8_300, originalApprovedContractTotalPaise: 14_300 });
  });
});

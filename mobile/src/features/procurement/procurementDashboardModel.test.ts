import { filterProcurementProjects, parseProcurementDashboardProjects, procurementGalleryProjects, procurementPortfolioSelectedTotal, procurementSourceLabels } from "./procurementDashboardModel";

function project(projectId: string, projectName: string, estimate: number, spend: number) {
  return {
    projectId, projectName, estimateId: `estimate-${projectId}`, estimateVersion: 3,
    sections: [{
      id: `section-${projectId}`, estimatedAmountPaise: estimate, actualSpendPaise: spend,
      items: [{
        key: `line-${projectId}`, estimatedAmountPaise: estimate, actualSpendPaise: spend,
        expenses: spend ? [{ id: `expense-${projectId}`, projectId, sourceSectionId: `section-${projectId}`,
          sourceLineItemKey: `line-${projectId}`, type: "direct_spend", expenseClass: "procurement",
          status: "posted", amountPaise: spend }] : []
      }]
    }]
  };
}

describe("Procurement Dashboard project totals", () => {
  it("keeps two unequal project identities and exact paise totals separate", () => {
    expect(parseProcurementDashboardProjects([
      project("p-first", "First Project", 20_000_000, 5_000_000),
      project("p-second", "Second Project", 12_500_000, 1_500_000)
    ])).toMatchObject([
      { projectId: "p-first", projectName: "First Project", estimateVersion: 3,
        selectedSectionCount: 1, selectedValuePaise: 20_000_000, recordedSpendPaise: 5_000_000,
        remainingValuePaise: 15_000_000 },
      { projectId: "p-second", projectName: "Second Project", estimateVersion: 3,
        selectedSectionCount: 1, selectedValuePaise: 12_500_000, recordedSpendPaise: 1_500_000,
        remainingValuePaise: 11_000_000 }
    ]);
  });

  it("does not show fabricated totals for duplicate identities, unsafe amounts, or mismatched spend", () => {
    const valid = project("p-first", "First Project", 20_000_000, 5_000_000);
    expect(parseProcurementDashboardProjects([valid, valid])).toBeNull();
    expect(parseProcurementDashboardProjects([{ ...valid, sections: [{ ...valid.sections[0], estimatedAmountPaise: Number.MAX_SAFE_INTEGER + 1 }] }])).toBeNull();
    expect(parseProcurementDashboardProjects([{ ...valid, sections: [{ ...valid.sections[0], actualSpendPaise: 4_000_000 }] }])).toBeNull();
    expect(parseProcurementDashboardProjects([{ ...valid, sections: [{ ...valid.sections[0], items: [{ ...valid.sections[0]!.items[0], expenses: [] }] }] }])).toBeNull();
  });

  it("excludes unselected zero-budget sections while rejecting purchases against them", () => {
    const valid = project("p-first", "First Project", 20_000_000, 5_000_000);
    const noBudget = { id: "section-zero", estimatedAmountPaise: 0, actualSpendPaise: 0,
      items: [{ key: "line-zero", estimatedAmountPaise: 0, actualSpendPaise: 0, expenses: [] }] };
    expect(parseProcurementDashboardProjects([{ ...valid, sections: [...valid.sections, noBudget] }])?.[0]?.selectedSectionCount).toBe(1);
    expect(parseProcurementDashboardProjects([{ ...valid, sections: [...valid.sections, { ...noBudget, actualSpendPaise: 100 }] }])).toBeNull();
  });
});


describe("Procurement gallery source and scope", () => {
  const parsed = () => parseProcurementDashboardProjects([
    { ...project("p-first", "First Project", 20_000_000, 5_000_000), taskStatus: "open" },
    { ...project("p-second", "Second Project", 12_500_000, 1_500_000), taskStatus: "in_progress" }
  ])!;

  it("sums unequal projects exactly without returning an unsafe portfolio value", () => {
    expect(procurementPortfolioSelectedTotal(parsed())).toBe(32_500_000);
    const maximum = parseProcurementDashboardProjects([project("large", "Large", Number.MAX_SAFE_INTEGER, 0)])!;
    expect(procurementPortfolioSelectedTotal([...maximum, ...parsed()])).toBeNull();
    expect(procurementPortfolioSelectedTotal([])).toBe(0);
  });

  it.each([
    ["approved_pre", "pre", "Pre-estimate approved"],
    ["released_post", "post", "Post-estimate preparation"],
    ["approved_final", "post", "Final estimate approved"]
  ] as const)("labels %s only when source identity and phase match", (kind, phase, label) => {
    const base = project("p-first", "First Project", 20_000_000, 5_000_000);
    const source = { workflowVersion: 2, kind, phase, estimateId: base.estimateId, estimateVersion: base.estimateVersion,
      estimateReviewRoundId: kind === "released_post" ? null : "round-a", sourceSnapshotId: "snapshot-a", sourceDigest: "digest-a" };
    const result = parseProcurementDashboardProjects([{ ...base, preparationSource: source }])![0]!;
    expect(procurementSourceLabels[result.sourceKind]).toBe(label);
    for (const replacement of [undefined, { ...source, estimateId: "unrelated" }, { ...source, estimateVersion: 2 },
      { ...source, sourceSnapshotId: undefined }, { ...source, phase: kind === "approved_pre" ? "post" : "pre" }]) {
      expect(parseProcurementDashboardProjects([{ ...base, preparationSource: replacement }])![0]!.sourceKind).toBe("unknown");
    }
  });

  it("keeps absent or unsupported statuses unavailable without inventing Design approval", () => {
    const result = parseProcurementDashboardProjects([{ ...project("p", "Project", 100, 0), taskStatus: "active", openedAt: "not-a-date" }])![0]!;
    expect(result.taskStatus).toBe("unknown");
    expect(result.openedDate).toBeNull();
    expect(procurementSourceLabels[result.sourceKind]).toBe("Approval source unavailable");
  });

  it("joins by stable ID and filters assigned projects only when preparation status is known", () => {
    const assigned = [
      { id: "p-first", name: "Duplicate renamed detail", status: "active" as const, subtitle: null, dateLabel: null },
      { id: "p-third", name: "First Project", status: "active" as const, subtitle: "Villa", dateLabel: null }
    ];
    const entries = procurementGalleryProjects(parsed(), assigned);
    expect(entries.map((entry) => entry.id)).toEqual(["p-first", "p-second", "p-third"]);
    expect(entries[0]!.kind).toBe("prepared");
    expect(filterProcurementProjects(entries, " first ", "all", true).map((entry) => entry.id)).toEqual(["p-first", "p-third"]);
    expect(filterProcurementProjects(entries, "", "in_progress", true).map((entry) => entry.id)).toEqual(["p-second"]);
    expect(filterProcurementProjects(entries, "", "awaiting_preparation", true).map((entry) => entry.id)).toEqual(["p-third"]);
    expect(filterProcurementProjects(entries, "", "awaiting_preparation", false)).toEqual([]);
  });
});

import { parseProcurementDashboardProjects } from "./procurementDashboardModel";

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
    ])).toEqual([
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

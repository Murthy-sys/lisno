import type { FinanceLedgerEntry, ProcurementProject } from "../../api/types";
import { createProcurementGroupFixture, postedExpense } from "./enterpriseProcurementData";

function expense(projectId: string, sectionId: string, key: string, amountPaise: number): FinanceLedgerEntry {
  return { ...postedExpense, id: `gallery-expense-${projectId}`, bucketId: `gallery-bucket-${projectId}`,
    projectId, sourceSectionId: sectionId, sourceLineItemKey: key, amountPaise,
    sourceSectionLabel: "Approved finishes", sourceLineItemLabel: "Approved interior works",
    supportingDocument: null, idempotencyKey: `gallery-purchase-${projectId}` };
}

function singleLineProject(input: {
  id: string; name: string; status: ProcurementProject["taskStatus"]; clientName: string | null;
  selectedPaise: number; spentPaise: number; version: number;
}): ProcurementProject {
  const key = `${input.id}:approved-line`;
  return {
    taskId: `task-${input.id}`, taskVersion: 1, taskStatus: input.status,
    taskProgress: input.status === "completed" ? 100 : 0,
    openedAt: "2026-09-29T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z",
    projectId: input.id, projectName: input.name, clientName: input.clientName,
    estimateId: `estimate-${input.id}`, estimateVersion: input.version,
    sections: [{ id: "FIN", label: "Approved finishes", estimatedAmountPaise: input.selectedPaise,
      actualSpendPaise: input.spentPaise,
      items: [{ key, catalogueId: "finish-main-line", roomName: "Bedroom", specification: "Approved interior works",
        unit: "lot", quantity: 1, estimatedAmountPaise: input.selectedPaise, actualSpendPaise: input.spentPaise,
        expenses: input.spentPaise ? [expense(input.id, "FIN", key, input.spentPaise)] : [] }] }]
  };
}

/** Synthetic amounts intentionally unequal; the first project's keys also match the mixed-mode overview. */
export function createProcurementGalleryFixture(large = false): ProcurementProject[] {
  const groups = createProcurementGroupFixture();
  const projects: ProcurementProject[] = [{
    taskId: "task-one", taskVersion: 2, taskStatus: "in_progress", taskProgress: 40,
    openedAt: "2026-10-02T09:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z",
    projectId: "project-one", projectName: "Aurora Villa", clientName: "Asha Rao",
    estimateId: "estimate-one", estimateVersion: 4,
    sections: groups.details.map((basket, index) => ({ id: basket.id, label: basket.name,
      estimatedAmountPaise: basket.approvedEstimatePaise, actualSpendPaise: index === 0 ? 125_000 : 0,
      items: [
        ...basket.lines.map((line, lineIndex) => ({ key: line.sourceLineItemKey,
          catalogueId: line.mainLineId ?? line.sourceLineItemKey, roomName: line.roomName,
          specification: line.mainLineName, unit: line.approvedUnit, quantity: Number(line.approvedQuantity),
          estimatedAmountPaise: line.approvedAmountPaise!, actualSpendPaise: index === 0 && lineIndex === 0 ? 125_000 : 0,
          expenses: index === 0 && lineIndex === 0 ? [expense("project-one", basket.id, line.sourceLineItemKey, 125_000)] : [] })),
        { key: `zero:${basket.id}`, catalogueId: "zero-allowance", roomName: "Living Room",
          specification: "Zero-value provisional allowance", unit: "lot", quantity: 1,
          estimatedAmountPaise: 0, actualSpendPaise: 0, expenses: [] }
      ]
    }))
  }, singleLineProject({ id: "project-gallery-north",
    name: "Northern Courtyard Residence and Upper Floor Renovation", status: "open",
    clientName: "Dev Mehta and Kavya Mehta", selectedPaise: large ? 123_456_789_012 : 8_500_000,
    spentPaise: large ? 123_456_789_012 : 8_500_000, version: 17
  }), singleLineProject({ id: "project-gallery-cedar", name: "Cedar Studio", status: "completed",
    clientName: null, selectedPaise: 8_000, spentPaise: 12_500, version: 1 })];
  return projects;
}

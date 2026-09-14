// Synthetic records reused from features/procurement/ProcurementWorkspace.test.tsx. No runtime test imports.
import type {
  FinanceLedgerEntry,
  ProcurementProject
} from "../../api/types";

export const receiptDocument = {
  id: "document-one",
  originalFilename: "carpentry-receipt.png",
  mimeType: "image/png" as const,
  sizeBytes: 1_240,
  createdAt: "2026-08-26T10:00:00.000Z"
};

export const postedExpense: FinanceLedgerEntry = {
  id: "entry-one",
  bucketId: "bucket-one",
  projectId: "project-one",
  type: "direct_spend",
  expenseClass: "procurement",
  category: "Carpentry",
  amountPaise: 125_000,
  incurredAt: "2026-08-25T00:00:00.000Z",
  description: "Living room wardrobe plywood",
  vendor: "Timber House",
  reference: "INV-125",
  sourceSectionId: "CA",
  sourceLineItemKey: "living-room:CA01",
  sourceSectionLabel: "Carpentry",
  sourceLineItemLabel: "Wardrobe plywood and laminate · Living Room",
  supportingDocument: receiptDocument,
  idempotencyKey: "purchase-one",
  status: "posted",
  version: 1,
  createdById: "procurement-user",
  voidedAt: null,
  voidedById: null,
  voidReason: null,
  createdAt: "2026-08-26T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z"
};

export const procurementProject: ProcurementProject = {
  taskId: "task-one",
  taskVersion: 2,
  taskStatus: "in_progress",
  taskProgress: 40,
  openedAt: "2026-08-24T09:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z",
  projectId: "project-one",
  projectName: "Aurora Villa",
  estimateId: "estimate-one",
  estimateVersion: 4,
  sections: [
    {
      id: "CA",
      label: "Carpentry",
      estimatedAmountPaise: 300_000,
      actualSpendPaise: 125_000,
      items: [
        {
          key: "living-room:CA01",
          catalogueId: "CA01",
          roomName: "Living Room",
          specification: "Wardrobe plywood and laminate",
          unit: "sq ft",
          quantity: 80,
          estimatedAmountPaise: 250_000,
          actualSpendPaise: 125_000,
          expenses: [postedExpense]
        },
        {
          key: "bedroom:CA02",
          catalogueId: "CA02",
          roomName: "Bedroom",
          specification: "Bedside table",
          unit: "nos",
          quantity: 2,
          estimatedAmountPaise: 50_000,
          actualSpendPaise: 0,
          expenses: []
        },
        {
          key: "living-room:CA00",
          catalogueId: "CA00",
          roomName: "Living Room",
          specification: "Zero-value provisional allowance",
          unit: "lot",
          quantity: 1,
          estimatedAmountPaise: 0,
          actualSpendPaise: 0,
          expenses: []
        }
      ]
    },
    {
      id: "EL",
      label: "Electrical",
      estimatedAmountPaise: 75_000,
      actualSpendPaise: 0,
      items: [
        {
          key: "living-room:EL01",
          catalogueId: "EL01",
          roomName: "Living Room",
          specification: "Modular switch set",
          unit: "set",
          quantity: 3,
          estimatedAmountPaise: 75_000,
          actualSpendPaise: 0,
          expenses: []
        }
      ]
    },
    {
      id: "PA",
      label: "Painting",
      estimatedAmountPaise: 0,
      actualSpendPaise: 0,
      items: [
        {
          key: "bedroom:PA01",
          catalogueId: "PA01",
          roomName: "Bedroom",
          specification: "Zero-value paint allowance",
          unit: "lot",
          quantity: 1,
          estimatedAmountPaise: 0,
          actualSpendPaise: 0,
          expenses: []
        }
      ]
    }
  ]
};

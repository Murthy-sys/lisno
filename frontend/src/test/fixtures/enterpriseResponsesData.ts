// Synthetic records reused from features/admin/ClientResponseTaskDetailPage.test.tsx. No runtime test imports.
import type { PermissionCode } from "../../api/authorization-contract";

import type { EstimateClientResponseTaskDetail } from "../../api/types";

export const pendingDetail: EstimateClientResponseTaskDetail = {
  id: "round-1",
  version: 3,
  sendGeneration: 2,
  project: { id: "project-1", name: "Aurora Villa" },
  client: { name: "Priya Shah", email: "priya@example.com" },
  estimate: { id: "estimate-1", version: 4, total: 1416 },
  assignedAdmin: { id: "admin-1", name: "Meera Admin" },
  deliveryStatus: "sent",
  deliveryAttemptCount: 1,
  deliveryAttemptedAt: "2026-08-23T10:00:01.000Z",
  deliveredAt: "2026-08-23T10:00:02.000Z",
  status: "pending",
  decision: null,
  proofAvailable: false,
  createdAt: "2026-08-23T10:00:00.000Z",
  estimateSnapshot: {
    clientName: "Priya Shah",
    projectName: "Aurora Villa",
    location: "Bengaluru",
    propertyType: "Villa",
    lineItems: [
      {
        catalogueId: "FC01",
        roomName: "Living Room",
        specification: "Premium finish",
        unit: "sqft",
        rate: 120,
        quantity: 10,
        included: true,
        amount: 1200
      },
      {
        catalogueId: "EL02",
        roomName: "Kitchen",
        specification: "Pendant lights",
        unit: "each",
        rate: 600,
        quantity: 2,
        included: false,
        amount: 1200
      }
    ],
    subtotal: 1200,
    gst: 216,
    total: 1416
  },
  pdf: {
    filename: "estimate-v4.pdf",
    mimeType: "application/pdf",
    byteSize: 2048,
    sha256: "a".repeat(64)
  },
  decisionSource: null,
  decisionNote: null,
  decidedAt: null
};

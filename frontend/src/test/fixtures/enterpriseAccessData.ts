// Synthetic records reused from features/access/AccessRequestInboxPage.test.tsx. No runtime test imports.
import type { ProjectAccessGrant, ReviewAccessRequest } from "../../api/types";

export const reviewRow: ReviewAccessRequest = {
  id: "request-1",
  projectId: "project-aurora-villa",
  module: "design" as const,
  reason: "Need access",
  status: "pending" as const,
  decisionReason: null,
  reviewedAt: null,
  version: 2,
  createdAt: "2026-08-17T10:00:00.000Z",
  updatedAt: "2026-08-17T10:00:00.000Z",
  requester: { id: "designer-1", name: "Arun Designer", email: "arun@lisno.example", role: "designer" as const, active: true },
  project: { id: "project-aurora-villa", resolved: true, name: "Aurora Villa" },
  reviewerId: null,
  activeGrant: null
};

export const activeGrant: ProjectAccessGrant = {
  id: "grant-1",
  projectId: "project-aurora-villa",
  userId: "designer-1",
  module: "design" as const,
  source: "access_request" as const,
  accessRequestId: "request-1",
  grantedById: "super-admin-1",
  active: true,
  grantedAt: "2026-08-17T11:00:00.000Z",
  revokedAt: null,
  revokedById: null,
  revocationReason: null,
  version: 1,
  createdAt: "2026-08-17T11:00:00.000Z",
  updatedAt: "2026-08-17T11:00:00.000Z"
};

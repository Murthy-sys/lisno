import { apiClient } from "../../api/client";

export interface EstimateRequirement {
  id: string;
  projectId: string;
  phase: "pre" | "post";
  mainBasketId: string;
  mainLineId?: string | null;
  roomId: string | null;
  text: string;
  authorId: string;
  version: number;
  status: "open" | "included" | "declined" | "superseded" | "withdrawn";
  lineItemIds: string[];
  reason: string;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  canEdit: boolean;
}

export interface EstimateRequirementsDetail {
  projectId: string;
  requirementsVersion: number;
  estimateVersion: number | null;
  phase: "pre" | "post";
  editingAllowed: boolean;
  editingBlockReason: "review_pending" | "closed" | null;
  canResolve: boolean;
  requirements: EstimateRequirement[];
  mainBaskets: Array<{ id: string; name: string }>;
  mainLines?: Array<{ id: string; name: string; mainBasketId: string; subBasketId: string | null; subBasketName: string | null }>;
  rooms: Array<{ id: string; label: string }>;
  indicativeTotalPaise: number | null;
  pricingComplete: boolean;
}

export interface CreateEstimateRequirementInput {
  mainBasketId: string;
  mainLineId?: string | null;
  roomId?: string | null;
  text: string;
  expectedRequirementsVersion: number;
  idempotencyKey: string;
}

export interface UpdateEstimateRequirementInput {
  expectedRequirementsVersion: number;
  expectedVersion: number;
  mainBasketId?: string;
  mainLineId?: string | null;
  roomId?: string | null;
  text?: string;
  withdraw?: boolean;
}

export interface ResolveEstimateRequirementInput {
  expectedRequirementsVersion: number;
  expectedVersion: number;
  status: "included" | "declined" | "superseded";
  lineItemIds: string[];
  reason: string;
  supersededById?: string;
}

export const estimateRequirementsKeys = {
  all: ["estimate-requirements"] as const,
  detail: (projectId: string) => ["estimate-requirements", projectId] as const
};

const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/estimate-requirements`;
export const getEstimateRequirements = (projectId: string) =>
  apiClient.get<EstimateRequirementsDetail>(path(projectId));

export const createEstimateRequirement = (projectId: string, input: CreateEstimateRequirementInput) =>
  apiClient.post<EstimateRequirementsDetail>(path(projectId), {
    mainBasketId: input.mainBasketId,
    ...(input.mainLineId === undefined ? {} : { mainLineId: input.mainLineId }),
    roomId: input.roomId ?? null,
    text: input.text,
    expectedRequirementsVersion: input.expectedRequirementsVersion,
    idempotencyKey: input.idempotencyKey
  });

export const updateEstimateRequirement = (projectId: string, requirementId: string, input: UpdateEstimateRequirementInput) =>
  apiClient.patch<EstimateRequirementsDetail>(`${path(projectId)}/${encodeURIComponent(requirementId)}`, {
    expectedRequirementsVersion: input.expectedRequirementsVersion,
    expectedVersion: input.expectedVersion,
    ...(input.mainBasketId === undefined ? {} : { mainBasketId: input.mainBasketId }),
    ...(input.mainLineId === undefined ? {} : { mainLineId: input.mainLineId }),
    ...(input.roomId === undefined ? {} : { roomId: input.roomId }),
    ...(input.text === undefined ? {} : { text: input.text }),
    ...(input.withdraw === undefined ? {} : { withdraw: input.withdraw })
  });

export const resolveEstimateRequirement = (projectId: string, requirementId: string, input: ResolveEstimateRequirementInput) =>
  apiClient.post<EstimateRequirementsDetail>(`${path(projectId)}/${encodeURIComponent(requirementId)}/resolve`, input);

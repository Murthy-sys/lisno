import type { EstimateQueueItem } from "./estimateWorkflowApi";

export const clientEstimateWorkflowVersion = (estimate: EstimateQueueItem) =>
  estimate.workflowVersion ?? estimate.estimation?.workflowVersion ?? estimate.publishedReview?.workflowVersion;

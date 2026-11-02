import type { ReactNode } from "react";
import type { EstimateRevisionDetail, EstimateRevisionSummary } from "./estimateRevisionsApi";

export interface EstimateRevisionNavigationProps {
  items: readonly EstimateRevisionSummary[];
  selectedRevisionId: string | null;
  onSelectRevision: (revisionId: string) => void;
  onSelectCurrent: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  disabled?: boolean;
}

export interface EstimateRevisionViewProps {
  revision: EstimateRevisionDetail;
  view: "builder" | "summary" | "proposal";
  activeRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  navigation?: ReactNode;
}

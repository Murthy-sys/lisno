import { X } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { NoticeBanner } from "../../components/ui/NoticeBanner";

export interface KnowledgeSafetyNoticeProps {
  /* Only the index offers dismissal, and only for the current visit: this is a
     safety notice, so the workspace and reusable-values pages keep it fixed. */
  readonly onDismiss?: () => void;
}

export function KnowledgeSafetyNotice({ onDismiss }: KnowledgeSafetyNoticeProps = {}) {
  return (
    <NoticeBanner
      tone="info"
      label="Knowledge base isolation notice"
      action={
        onDismiss ? (
          <Button
            variant="quiet"
            className="knowledge-notice-dismiss"
            aria-label="Dismiss notice"
            title="Dismiss notice"
            leadingIcon={<X />}
            onClick={onDismiss}
          />
        ) : undefined
      }
    >
      Configuration updates apply to current selections. Published estimates and
      approvals keep their recorded values.
    </NoticeBanner>
  );
}

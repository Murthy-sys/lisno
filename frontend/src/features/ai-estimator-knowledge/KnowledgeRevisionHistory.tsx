import {
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  History,
  RefreshCw,
  type LucideIcon
} from "lucide-react";

import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { StateContent } from "../../components/ui/PageState";
import { Surface } from "../../components/ui/Surface";
import { KnowledgeCardHeading } from "./KnowledgeCardHeading";
import {
  KNOWLEDGE_REVISION_STATUS_LABELS,
  formatKnowledgeDateTime
} from "./knowledgePresentation";
import type { KnowledgeHistoryEntry, KnowledgeRevisionStatus } from "./knowledgeTypes";

export interface KnowledgeRevisionHistoryProps {
  readonly entries: readonly KnowledgeHistoryEntry[] | undefined;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: Error | null;
  readonly onRetry: () => void;
}

/*
 * The status is always stated in words by the pill; the leading icon and the
 * pill's glyph and tone only reinforce it, so both icons stay decorative.
 */
const REVISION_STATUS_PRESENTATION = {
  draft: { entryIcon: RefreshCw, statusIcon: CircleDot, tone: "warning" },
  active: { entryIcon: CheckCircle2, statusIcon: CheckCircle2, tone: "success" },
  superseded: { entryIcon: History, statusIcon: Circle, tone: "neutral" }
} as const satisfies Readonly<Record<KnowledgeRevisionStatus, {
  readonly entryIcon: LucideIcon;
  readonly statusIcon: LucideIcon;
  readonly tone: "warning" | "success" | "neutral";
}>>;

export function KnowledgeRevisionHistory({
  entries,
  loading,
  refreshing,
  error,
  onRetry
}: KnowledgeRevisionHistoryProps) {
  const hasEntries = Boolean(entries?.length);

  return (
    <Surface
      as="section"
      className="knowledge-history knowledge-workspace-history-rail"
      aria-labelledby="knowledge-history-title"
      aria-busy={refreshing || undefined}
    >
      <KnowledgeCardHeading
        icon={<Clock />}
        titleId="knowledge-history-title"
        title="Revision history"
        description="Activated revisions remain immutable."
      />
      {loading && !entries ? (
        <StateContent
          state="loading"
          message="Loading revision history…"
          statusLabel="Revision history status"
        />
      ) : error && !hasEntries ? (
        <InlineMessage
          tone="error"
          role="alert"
          action={<Button variant="secondary" onClick={onRetry}>Try again</Button>}
        >
          {error.message}
        </InlineMessage>
      ) : (
        <>
          {error ? (
            <InlineMessage
              tone="warning"
              action={<Button variant="secondary" onClick={onRetry}>Try again</Button>}
            >
              Revision history could not be refreshed. The last loaded revisions remain visible.
            </InlineMessage>
          ) : null}
          {hasEntries ? (
            <ol>
              {entries!.map((entry) => {
                const { entryIcon: EntryIcon, statusIcon: StatusIcon, tone } =
                  REVISION_STATUS_PRESENTATION[entry.status];
                return (
                  <li
                    key={entry.id}
                    className={`knowledge-history__entry knowledge-history__entry--${entry.status}`}
                  >
                    <span className="knowledge-history__entry-icon" aria-hidden="true">
                      <EntryIcon />
                    </span>
                    <div className="knowledge-history__entry-body">
                      <div className="knowledge-history__entry-heading">
                        <strong>Revision {entry.revisionNumber}</strong>
                        <span className={`ui-status ui-status--${tone} knowledge-history__status`}>
                          <StatusIcon aria-hidden="true" />
                          {KNOWLEDGE_REVISION_STATUS_LABELS[entry.status]}
                        </span>
                      </div>
                      <span className="knowledge-history__meta">
                        Updated {formatKnowledgeDateTime(entry.updatedAt)}
                      </span>
                      <span className="knowledge-history__meta">
                        {entry.completeness.percentage}% complete
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>No revision history is available.</p>
          )}
        </>
      )}
    </Surface>
  );
}

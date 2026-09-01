import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { StateContent } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { formatKnowledgeDateTime } from "./knowledgePresentation";
import type { KnowledgeHistoryEntry } from "./knowledgeTypes";

export interface KnowledgeRevisionHistoryProps {
  readonly entries: readonly KnowledgeHistoryEntry[] | undefined;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: Error | null;
  readonly onRetry: () => void;
}

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
      <div className="knowledge-section-heading">
        <div>
          <h2 id="knowledge-history-title">Revision history</h2>
          <p>Activated revisions remain immutable.</p>
        </div>
      </div>
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
              {entries!.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>Revision {entry.revisionNumber}</strong>
                    <StatusBadge
                      label={entry.status}
                      tone={entry.status === "active" ? "success" : entry.status === "draft" ? "warning" : "neutral"}
                    />
                  </div>
                  <span>
                    Updated {formatKnowledgeDateTime(entry.updatedAt)} · {entry.completeness.percentage}% complete
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p>No revision history is available.</p>
          )}
        </>
      )}
    </Surface>
  );
}

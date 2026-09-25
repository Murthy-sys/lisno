import { Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Surface } from "../../components/ui/Surface";
import { formatKnowledgeRelativeTime } from "./knowledgeLastSaved";
import { formatKnowledgeDateTime } from "./knowledgePresentation";
import type { KnowledgeItemDetail } from "./knowledgeTypes";

/** The page-level save of the active tab, shown in the bar beside completeness. */
export interface KnowledgeWorkspaceSaveCommand {
  readonly sectionLabel: string;
  readonly editable: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly saveError: string | null;
  /** Server `updatedAt` of the tab's latest author save, or null when unknown. */
  readonly lastSavedAt: string | null;
  readonly onSave: () => void;
}

export interface KnowledgeWorkspaceStatusProps {
  readonly item: KnowledgeItemDetail;
  /** Present only on tabs that save through the page and have a revision. */
  readonly command?: KnowledgeWorkspaceSaveCommand;
}

const LAST_SAVED_REFRESH_MS = 30_000;

/*
 * One bar for the two things an author acts on while editing: how complete the
 * configuration is and whether the active tab's changes are saved. Revision
 * numbers and activation readiness stay out of it - Revision history names the
 * revision, and the activation dialog lists blockers where they can be fixed.
 *
 * Tabs that save through the page (Overview, Mode, Recommendation &
 * Exclusions) pass a `command`; Quality keeps its own save, so the bar shows
 * completeness alone there and whenever there is no revision.
 */
export function KnowledgeWorkspaceStatus({ item, command }: KnowledgeWorkspaceStatusProps) {
  const percentage = item.completeness.percentage;

  return (
    <Surface
      as="section"
      className="knowledge-workspace-status"
      variant="subtle"
      aria-label="Workspace status"
    >
      <div className="knowledge-workspace-status__completeness">
        <span className="knowledge-workspace-status__label">Configuration completeness</span>
        <strong className="knowledge-workspace-status__percentage">{percentage}%</strong>
        <ProgressBar
          value={percentage}
          label="Configuration completeness"
          valueText={`${percentage}% complete`}
        />
      </div>
      {command ? <KnowledgeWorkspaceSaveCommands {...command} /> : null}
    </Surface>
  );
}

function KnowledgeWorkspaceSaveCommands({
  sectionLabel,
  editable,
  dirty,
  saving,
  saveError,
  lastSavedAt,
  onSave
}: KnowledgeWorkspaceSaveCommand) {
  /* The live region announces changes of state only; the refreshing
     "Last saved" wording sits outside it so a tick is never announced. */
  const status = !editable
    ? "Read-only revision"
    : saving
      ? `Saving ${sectionLabel}…`
      : saveError
        ? "Save failed. Review the message below and try again."
        : dirty
          ? "Unsaved changes"
          : "All changes saved";
  const settled = editable && !saving && !saveError && !dirty;
  const shownSavedAt = settled && lastSavedAt !== null && Number.isFinite(Date.parse(lastSavedAt))
    ? lastSavedAt
    : null;
  const now = useRelativeTimeClock(shownSavedAt);
  const relative = shownSavedAt === null ? null : formatKnowledgeRelativeTime(shownSavedAt, now);
  const lastSaved = shownSavedAt !== null && relative !== null
    ? { at: shownSavedAt, relative }
    : null;

  return (
    <div
      className="knowledge-workspace-status__commands"
      role="group"
      aria-label={`${sectionLabel} commands`}
    >
      {/* The same live element in every state: it only swaps to visually hidden
          while the visible "Last saved" wording stands in for it. */}
      <span
        className={lastSaved ? "sr-only" : "knowledge-workspace-status__state"}
        role="status"
      >
        {status}
      </span>
      {lastSaved ? (
        <span className="knowledge-workspace-status__last-saved">
          Last saved{" "}
          <time dateTime={lastSaved.at} title={formatKnowledgeDateTime(lastSaved.at)}>
            {lastSaved.relative}
          </time>
        </span>
      ) : null}
      {editable ? (
        <Button
          className="knowledge-workspace-status__save"
          leadingIcon={<Save />}
          busy={saving}
          busyLabel={`Saving ${sectionLabel}…`}
          disabled={!dirty}
          onClick={onSave}
        >
          {saving ? `Saving ${sectionLabel}…` : `Save ${sectionLabel}`}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The current time for the visible "Last saved" wording. It restarts from the
 * real clock whenever the shown save time changes or reappears, and ticks every
 * 30 seconds only while one is shown.
 */
function useRelativeTimeClock(shownSavedAt: string | null): number {
  const [clock, setClock] = useState(() => ({ savedAt: shownSavedAt, now: Date.now() }));
  if (clock.savedAt !== shownSavedAt) {
    // Adjusting state while rendering, so a fresh save never paints stale wording.
    setClock({ savedAt: shownSavedAt, now: Date.now() });
  }

  useEffect(() => {
    if (shownSavedAt === null) return undefined;
    const timer = window.setInterval(() => {
      setClock((current) => ({ ...current, now: Date.now() }));
    }, LAST_SAVED_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [shownSavedAt]);

  return clock.now;
}

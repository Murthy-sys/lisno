import { Button } from "../../components/ui/Button";
import { Field, Select } from "../../components/ui/Field";
import type {
  KnowledgeMaster,
  KnowledgePrioritySemanticTier
} from "./knowledgeTypes";

const PRIORITY_TIER_ORDER = [
  "non_negotiable",
  "high",
  "medium",
  "low"
] as const satisfies readonly KnowledgePrioritySemanticTier[];

export interface KnowledgePriorityCatalogState {
  readonly status: "loading" | "ready" | "error";
  readonly refreshing?: boolean;
  readonly errorMessage?: string;
  readonly refreshErrorMessage?: string;
  readonly onRetry?: () => void;
}

export interface KnowledgePrioritySectionState {
  readonly status: "loading" | "ready" | "error";
  readonly onRetry?: () => void;
}

export interface KnowledgePriorityEditorProps {
  readonly priorityId: string;
  readonly priorities: readonly KnowledgeMaster[];
  readonly catalogState: KnowledgePriorityCatalogState;
  readonly sectionState: KnowledgePrioritySectionState;
  readonly readOnly: boolean;
  readonly saving: boolean;
  readonly dirty: boolean;
  readonly error?: string;
  readonly onChange: (priorityId: string) => void;
}

export function KnowledgePriorityEditor({
  priorityId,
  priorities,
  catalogState,
  sectionState,
  readOnly,
  saving,
  dirty,
  error,
  onChange
}: KnowledgePriorityEditorProps) {
  const canonicalOptions = PRIORITY_TIER_ORDER.flatMap((semanticTier) => {
    const priority = priorities.find((candidate) =>
      candidate.masterType === "priorities"
      && candidate.semanticTier === semanticTier
      && candidate.status === "active"
    );
    return priority ? [priority] : [];
  });
  const selected = priorities.find(({ id }) => id === priorityId);
  const selectedIsCanonical = canonicalOptions.some(({ id }) => id === priorityId);
  const hasAvailableOptions = canonicalOptions.length === PRIORITY_TIER_ORDER.length;
  const stateMessageIds: string[] = [];
  const disabled = readOnly
    || saving
    || sectionState.status !== "ready"
    || catalogState.status !== "ready"
    || !hasAvailableOptions;

  if (sectionState.status !== "ready") stateMessageIds.push("knowledge-priority-section-state");
  if (catalogState.status !== "ready" || !hasAvailableOptions) {
    stateMessageIds.push("knowledge-priority-catalog-state");
  }
  if (catalogState.refreshing || catalogState.refreshErrorMessage) {
    stateMessageIds.push("knowledge-priority-stale-state");
  }

  return (
    <section
      className="knowledge-priority-editor"
      aria-labelledby="knowledge-priority-heading"
    >
      <div className="knowledge-priority-editor__heading">
        <h3 id="knowledge-priority-heading">Priority</h3>
        {readOnly ? (
          <span className="knowledge-readonly-label">Read-only revision</span>
        ) : dirty ? (
          <span className="knowledge-priority-editor__dirty">
            {saving ? "Saving…" : "Unsaved changes"}
          </span>
        ) : null}
      </div>

      <Field
        id="knowledge-main-line-priority"
        label="Priority"
        hint="Set the priority for this Main Line so the estimator can identify it. Applies to all Specifications."
        error={error}
        describedBy={stateMessageIds.join(" ") || undefined}
      >
        {(props) => (
          <Select
            {...props}
            value={priorityId}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{readOnly ? "Not configured" : "Select priority"}</option>
            {priorityId && !selectedIsCanonical ? (
              <option value={priorityId} disabled>
                {selected?.name.trim() || "Unavailable priority"}
              </option>
            ) : null}
            {canonicalOptions.map((priority) => (
              <option key={priority.id} value={priority.id}>{priority.name}</option>
            ))}
          </Select>
        )}
      </Field>

      {sectionState.status === "loading" ? (
        <p id="knowledge-priority-section-state" className="knowledge-priority-editor__state" role="status">
          Loading saved Priority…
        </p>
      ) : sectionState.status === "error" ? (
        <div id="knowledge-priority-section-state" className="knowledge-priority-editor__state" role="alert">
          <span>Priority configuration could not be loaded.</span>
          {sectionState.onRetry ? (
            <Button type="button" size="compact" variant="quiet" onClick={sectionState.onRetry}>
              Retry Priority
            </Button>
          ) : null}
        </div>
      ) : null}

      {catalogState.status === "loading" ? (
        <p id="knowledge-priority-catalog-state" className="knowledge-priority-editor__state" role="status">
          Loading Priority options…
        </p>
      ) : catalogState.status === "error" ? (
        <div id="knowledge-priority-catalog-state" className="knowledge-priority-editor__state" role="alert">
          <span>Priority options could not be loaded.</span>
          {catalogState.onRetry ? (
            <Button type="button" size="compact" variant="quiet" onClick={catalogState.onRetry}>
              Retry Priority
            </Button>
          ) : null}
        </div>
      ) : !hasAvailableOptions ? (
        <p id="knowledge-priority-catalog-state" className="knowledge-priority-editor__state" role="status">
          No Priority options are configured.
        </p>
      ) : null}

      {catalogState.refreshing || catalogState.refreshErrorMessage ? (
        <p id="knowledge-priority-stale-state" className="knowledge-priority-editor__state" role="status">
          Priority options may be out of date.
        </p>
      ) : null}
    </section>
  );
}

import { Save } from "lucide-react";

import { Button } from "../../components/ui/Button";

export interface KnowledgeSectionCommandBarProps {
  readonly sectionLabel: string;
  readonly versionLabel: string;
  readonly editable: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly saveError: string | null;
  readonly inlineSaveInactive?: boolean;
  readonly onSave: () => void;
}

export function KnowledgeSectionCommandBar({
  sectionLabel,
  versionLabel,
  editable,
  dirty,
  saving,
  saveError,
  inlineSaveInactive = false,
  onSave
}: KnowledgeSectionCommandBarProps) {
  const status = !editable
    ? "Read-only revision"
    : saving
      ? `Saving ${sectionLabel}…`
      : saveError
        ? "Save failed. Review the message below and try again."
        : dirty
          ? "Unsaved changes"
          : "All changes saved";

  return (
    <div className="knowledge-section-command-bar" aria-label={`${sectionLabel} commands`}>
      <div className="knowledge-section-command-bar__context">
        <span className="knowledge-section-command-bar__label">{sectionLabel}</span>
        <span className="knowledge-section-command-bar__version">{versionLabel}</span>
      </div>
      <span className="knowledge-section-command-bar__status" role="status">
        {status}
      </span>
      {editable ? (
        <Button
          className="knowledge-section-command-bar__save"
          leadingIcon={<Save />}
          busy={saving}
          busyLabel={`Saving ${sectionLabel}…`}
          disabled={inlineSaveInactive || !dirty}
          aria-hidden={inlineSaveInactive || undefined}
          tabIndex={inlineSaveInactive ? -1 : undefined}
          style={inlineSaveInactive ? { visibility: "hidden" } : undefined}
          onClick={onSave}
        >
          {saving ? `Saving ${sectionLabel}…` : `Save ${sectionLabel}`}
        </Button>
      ) : null}
    </div>
  );
}

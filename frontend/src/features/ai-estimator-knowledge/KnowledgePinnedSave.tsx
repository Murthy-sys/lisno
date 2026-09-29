import { Save } from "lucide-react";
import { useLayoutEffect, useState, type RefObject } from "react";

import { Button } from "../../components/ui/Button";

export interface KnowledgePinnedSaveCommand {
  readonly sectionLabel: string;
  readonly editable: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly onSave: () => void;
}

/** Follow the active inline Save button without changing its scroll geometry. */
export function useKnowledgePinnedSave(
  workspaceRef: RefObject<HTMLDivElement | null>,
  inlineSelector: string | null,
  sourceKey: string
): boolean {
  const [pinned, setPinned] = useState(false);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    const topbar = workspace?.closest(".ui-app-shell")?.querySelector<HTMLElement>(".workspace-topbar");
    if (!workspace || !topbar || !inlineSelector) {
      setPinned(false);
      return;
    }
    let frame = 0;
    const measure = () => {
      const inline = workspace.querySelector<HTMLElement>(inlineSelector);
      const next = Boolean(inline && inline.getBoundingClientRect().bottom <= topbar.getBoundingClientRect().bottom);
      setPinned((current) => current === next ? current : next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(topbar);
    const inline = workspace.querySelector<HTMLElement>(inlineSelector);
    if (inline) observer?.observe(inline);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [workspaceRef, inlineSelector, sourceKey]);

  return pinned;
}

export function KnowledgePinnedSave({ command }: { readonly command: KnowledgePinnedSaveCommand }) {
  if (!command.editable) return null;
  const label = `${command.saving ? "Saving" : "Save"} ${command.sectionLabel}${command.saving ? "…" : ""}`;
  return <Button
    className="knowledge-pinned-save"
    leadingIcon={<Save />}
    aria-label={label}
    busy={command.saving}
    busyLabel={`Saving ${command.sectionLabel}…`}
    disabled={!command.dirty}
    onClick={command.onSave}
  ><span className="knowledge-pinned-save__label">{label}</span></Button>;
}

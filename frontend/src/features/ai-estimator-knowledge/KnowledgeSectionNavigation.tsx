import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode
} from "react";

import { Field, Select } from "../../components/ui/Field";
import { KNOWLEDGE_WORKSPACE_SECTION_LABELS } from "./knowledgePresentation";
import {
  KNOWLEDGE_WORKSPACE_SECTION_KEYS,
  type KnowledgeWorkspaceSectionKey
} from "./knowledgeWorkspaceSections";

export interface KnowledgeSectionNavigationProps {
  readonly activeSection: KnowledgeWorkspaceSectionKey;
  readonly onSectionChange: (section: KnowledgeWorkspaceSectionKey) => void;
  readonly children: ReactNode;
  readonly disabledSections?: readonly KnowledgeWorkspaceSectionKey[];
  readonly panelBusy?: boolean;
}

export function KnowledgeSectionNavigation({
  activeSection,
  onSectionChange,
  children,
  disabledSections = [],
  panelBusy = false
}: KnowledgeSectionNavigationProps) {
  const id = useId().replace(/:/g, "");
  const tabRefs = useRef(
    new Map<KnowledgeWorkspaceSectionKey, HTMLButtonElement>()
  );
  const pendingFocusRef = useRef<KnowledgeWorkspaceSectionKey | null>(null);
  const enabledSections = useMemo(
    () =>
      KNOWLEDGE_WORKSPACE_SECTION_KEYS.filter(
        (section) => !disabledSections.includes(section)
      ),
    [disabledSections]
  );
  const activeTabId = `${id}-${activeSection}-tab`;
  const panelId = `${id}-panel`;

  useEffect(() => {
    if (pendingFocusRef.current !== activeSection) return;
    pendingFocusRef.current = null;
    tabRefs.current.get(activeSection)?.focus();
  }, [activeSection]);

  function requestSelection(section: KnowledgeWorkspaceSectionKey) {
    if (section === activeSection) {
      tabRefs.current.get(section)?.focus();
      return;
    }
    pendingFocusRef.current = section;
    onSectionChange(section);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    focusedSection: KnowledgeWorkspaceSectionKey
  ) {
    if (!enabledSections.length) return;
    const currentIndex = enabledSections.indexOf(focusedSection);
    if (currentIndex < 0) return;
    let nextSection: KnowledgeWorkspaceSectionKey | undefined;

    if (event.key === "ArrowRight") {
      nextSection = enabledSections[(currentIndex + 1) % enabledSections.length];
    } else if (event.key === "ArrowLeft") {
      nextSection =
        enabledSections[
          (currentIndex - 1 + enabledSections.length) % enabledSections.length
        ];
    } else if (event.key === "Home") {
      nextSection = enabledSections[0];
    } else if (event.key === "End") {
      nextSection = enabledSections[enabledSections.length - 1];
    }

    if (!nextSection) return;
    event.preventDefault();
    requestSelection(nextSection);
  }

  return (
    <div className="knowledge-section-navigation">
      <div className="knowledge-section-tabs-shell">
        <div
          className="knowledge-section-tabs"
          role="tablist"
          aria-label="Configuration sections"
        >
          {KNOWLEDGE_WORKSPACE_SECTION_KEYS.map((section) => {
            const selected = section === activeSection;
            const disabled = disabledSections.includes(section);
            return (
              <button
                key={section}
                ref={(node) => {
                  if (node) tabRefs.current.set(section, node);
                  else tabRefs.current.delete(section);
                }}
                id={`${id}-${section}-tab`}
                className="knowledge-section-tab"
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                disabled={disabled}
                onMouseDown={(event) => {
                  if (section !== activeSection) event.preventDefault();
                }}
                onClick={() => requestSelection(section)}
                onKeyDown={(event) => handleKeyDown(event, section)}
              >
                {KNOWLEDGE_WORKSPACE_SECTION_LABELS[section]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="knowledge-section-select">
        <Field id={`${id}-section-select`} label="Configuration section">
          {(controlProps) => (
            <Select
              {...controlProps}
              value={activeSection}
              onChange={(event) =>
                onSectionChange(
                  event.target.value as KnowledgeWorkspaceSectionKey
                )
              }
            >
              {KNOWLEDGE_WORKSPACE_SECTION_KEYS.map((section) => (
                <option
                  key={section}
                  value={section}
                  disabled={disabledSections.includes(section)}
                >
                  {KNOWLEDGE_WORKSPACE_SECTION_LABELS[section]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <section
        id={panelId}
        className="knowledge-section-panel"
        role="tabpanel"
        aria-labelledby={activeTabId}
        aria-busy={panelBusy || undefined}
        tabIndex={0}
      >
        {children}
      </section>
    </div>
  );
}

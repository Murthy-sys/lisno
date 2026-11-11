import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode
} from "react";

import { Field, Select } from "../../components/ui/Field";
import {
  KNOWLEDGE_WORKSPACE_TAB_LABELS,
  knowledgeWorkspaceSectionsForTiers,
  type KnowledgeWorkspaceTabKey
} from "./knowledgeWorkspaceSections";

export interface KnowledgeSectionNavigationProps {
  readonly activeSection: KnowledgeWorkspaceTabKey;
  readonly onSectionChange: (section: KnowledgeWorkspaceTabKey) => void;
  readonly children: ReactNode;
  readonly disabledSections?: readonly KnowledgeWorkspaceTabKey[];
  readonly sections?: readonly KnowledgeWorkspaceTabKey[];
  readonly panelBusy?: boolean;
  readonly navigationLabel?: string;
  readonly selectLabel?: string;
  readonly sectionLabels?: Partial<Record<KnowledgeWorkspaceTabKey, string>>;
  readonly className?: string;
  readonly showNavigation?: boolean;
  readonly onActiveSectionActivate?: () => void;
  readonly onClearSelection?: () => void;
  readonly variant?: "tabs" | "radios";
}

export function KnowledgeSectionNavigation({
  activeSection,
  onSectionChange,
  children,
  disabledSections = [],
  sections = knowledgeWorkspaceSectionsForTiers(["signature"]),
  panelBusy = false,
  navigationLabel = "Configuration sections",
  selectLabel = "Configuration section",
  sectionLabels = {},
  className = "",
  showNavigation = true,
  onActiveSectionActivate,
  onClearSelection,
  variant = "tabs"
}: KnowledgeSectionNavigationProps) {
  const id = useId().replace(/:/g, "");
  const tabRefs = useRef(
    new Map<KnowledgeWorkspaceTabKey, HTMLButtonElement | HTMLInputElement>()
  );
  const pendingFocusRef = useRef<KnowledgeWorkspaceTabKey | null>(null);
  const enabledSections = useMemo(
    () =>
      sections.filter(
        (section) => !disabledSections.includes(section)
      ),
    [disabledSections, sections]
  );
  const activeTabId = `${id}-${activeSection}-tab`;
  const panelId = `${id}-panel`;
  const hasActiveSection = sections.includes(activeSection);
  const focusableSection = hasActiveSection ? activeSection : enabledSections[0];

  useEffect(() => {
    if (pendingFocusRef.current !== activeSection) return;
    pendingFocusRef.current = null;
    tabRefs.current.get(activeSection)?.focus();
  }, [activeSection]);

  function requestSelection(section: KnowledgeWorkspaceTabKey) {
    if (section === activeSection) {
      tabRefs.current.get(section)?.focus();
      onActiveSectionActivate?.();
      return;
    }
    pendingFocusRef.current = section;
    if (variant === "radios") tabRefs.current.get(activeSection)?.focus();
    onSectionChange(section);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLElement>,
    focusedSection: KnowledgeWorkspaceTabKey
  ) {
    if (variant === "radios" && event.key === " " && focusedSection === activeSection && onClearSelection) {
      event.preventDefault();
      onClearSelection();
      return;
    }
    if (!enabledSections.length) return;
    const currentIndex = enabledSections.indexOf(focusedSection);
    if (currentIndex < 0) return;
    let nextSection: KnowledgeWorkspaceTabKey | undefined;

    if (event.key === "ArrowRight" || variant === "radios" && event.key === "ArrowDown") {
      nextSection = enabledSections[(currentIndex + 1) % enabledSections.length];
    } else if (event.key === "ArrowLeft" || variant === "radios" && event.key === "ArrowUp") {
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
    <div className={`knowledge-section-navigation${className ? ` ${className}` : ""}`}>
      {showNavigation ? variant === "radios" ? <fieldset className="knowledge-mode-radio-group" role="radiogroup" aria-label={navigationLabel}>
        {sections.map(section => <label key={section} className="knowledge-mode-radio-option">
          <input type="radio" name={`${id}-mode`} value={section} checked={section === activeSection}
            ref={node => { if (node) tabRefs.current.set(section, node); else tabRefs.current.delete(section); }}
            aria-controls={panelId} disabled={disabledSections.includes(section)} tabIndex={section === focusableSection ? 0 : -1}
            onClick={() => { if (section === activeSection) onClearSelection?.(); }}
            onChange={event => { if (event.target.checked) requestSelection(section); }}
            onKeyDown={event => handleKeyDown(event, section)} />
          <span id={`${id}-${section}-label`}>{sectionLabels[section] ?? KNOWLEDGE_WORKSPACE_TAB_LABELS[section]}</span>
        </label>)}
      </fieldset> : <>
      <div className="knowledge-section-tabs-shell">
        <div
          className="knowledge-section-tabs"
          role="tablist"
          aria-label={navigationLabel}
        >
          {sections.map((section) => {
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
                tabIndex={section === focusableSection ? 0 : -1}
                disabled={disabled}
                onMouseDown={(event) => {
                  if (section !== activeSection) event.preventDefault();
                }}
                onClick={() => requestSelection(section)}
                onKeyDown={(event) => handleKeyDown(event, section)}
              >
                {sectionLabels[section] ?? KNOWLEDGE_WORKSPACE_TAB_LABELS[section]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="knowledge-section-select">
        <Field id={`${id}-section-select`} label={selectLabel}>
          {(controlProps) => (
            <Select
              {...controlProps}
              value={hasActiveSection ? activeSection : ""}
              onChange={(event) =>
                onSectionChange(
                  event.target.value as KnowledgeWorkspaceTabKey
                )
              }
            >
              {!hasActiveSection ? <option value="" disabled>Choose a tier</option> : null}
              {sections.map((section) => (
                <option
                  key={section}
                  value={section}
                  disabled={disabledSections.includes(section)}
                >
                  {sectionLabels[section] ?? KNOWLEDGE_WORKSPACE_TAB_LABELS[section]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {onActiveSectionActivate ? <button type="button" className="ui-button ui-button--secondary knowledge-section-select__return"
          aria-label={`Return to ${sectionLabels[activeSection] ?? KNOWLEDGE_WORKSPACE_TAB_LABELS[activeSection]}`}
          onClick={onActiveSectionActivate}>{sectionLabels[activeSection] ?? KNOWLEDGE_WORKSPACE_TAB_LABELS[activeSection]}</button> : null}
      </div>
      </> : null}

      <section
        id={panelId}
        className="knowledge-section-panel"
        role={showNavigation && hasActiveSection ? variant === "radios" ? "region" : "tabpanel" : undefined}
        aria-labelledby={showNavigation && hasActiveSection ? variant === "radios" ? `${id}-${activeSection}-label` : activeTabId : undefined}
        aria-busy={panelBusy || undefined}
        tabIndex={0}
      >
        {children}
      </section>
    </div>
  );
}

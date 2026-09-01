import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

import type { KnowledgeMaster } from "./knowledgeTypes";

export interface KnowledgeSurfaceMultiSelectProps {
  readonly selectedIds: readonly string[];
  readonly masters: readonly KnowledgeMaster[];
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly onChange: (selectedIds: readonly string[]) => void;
}

interface SurfaceOption {
  readonly id: string;
  readonly label: string;
  readonly statusLabel: string | null;
  readonly selected: boolean;
  readonly unavailable: boolean;
}

export function KnowledgeSurfaceMultiSelect({
  selectedIds,
  masters,
  disabled = false,
  readOnly = false,
  onChange
}: KnowledgeSurfaceMultiSelectProps) {
  const generatedId = useId().replaceAll(":", "");
  const labelId = `${generatedId}-label`;
  const summaryId = `${generatedId}-summary`;
  const listboxId = `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const orderedMasters = useMemo(() => orderUniqueMasters(masters), [masters]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const knownIds = useMemo(
    () => new Set(orderedMasters.map(({ id }) => id)),
    [orderedMasters]
  );
  const options = useMemo<readonly SurfaceOption[]>(() => {
    const available = orderedMasters
      .filter(({ id, status }) => status === "active" || selectedSet.has(id))
      .map((master) => ({
        id: master.id,
        label: master.name,
        statusLabel: master.status === "active" ? null : statusLabel(master.status),
        selected: selectedSet.has(master.id),
        unavailable: false
      }));
    const unresolved = unique(selectedIds)
      .filter((id) => !knownIds.has(id))
      .map((id) => ({
        id,
        label: "Unavailable value",
        statusLabel: null,
        selected: true,
        unavailable: true
      }));

    return [...available, ...unresolved];
  }, [knownIds, orderedMasters, selectedIds, selectedSet]);
  const interactiveOptionIds = useMemo(
    () => options.filter(({ unavailable }) => !unavailable).map(({ id }) => id),
    [options]
  );
  const selectedSummary = useMemo(() => {
    const selectedNames = orderedMasters
      .filter(({ id }) => selectedSet.has(id))
      .map(({ name }) => name);
    const unresolvedCount = unique(selectedIds).filter((id) => !knownIds.has(id)).length;
    const unresolvedLabels = Array.from(
      { length: unresolvedCount },
      () => "Unavailable value"
    );
    const labels = [...selectedNames, ...unresolvedLabels];

    return labels.length > 0 ? labels.join(", ") : "Not configured";
  }, [knownIds, orderedMasters, selectedIds, selectedSet]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || readOnly) return;

    const nextActiveId =
      activeId && interactiveOptionIds.includes(activeId)
        ? activeId
        : interactiveOptionIds[0] ?? null;
    if (nextActiveId !== activeId) setActiveId(nextActiveId);
    if (nextActiveId) optionRefs.current.get(nextActiveId)?.focus();
  }, [activeId, interactiveOptionIds, open, readOnly]);

  function openList(preferred: "selected" | "first" | "last" = "selected") {
    if (disabled) return;

    const firstSelectedId = options.find(
      ({ id, selected, unavailable }) => selected && !unavailable && interactiveOptionIds.includes(id)
    )?.id;
    const nextActiveId =
      preferred === "last"
        ? interactiveOptionIds.at(-1) ?? null
        : preferred === "first"
          ? interactiveOptionIds[0] ?? null
          : firstSelectedId ?? interactiveOptionIds[0] ?? null;
    setOpen(true);
    setActiveId(nextActiveId);
  }

  function closeList({ returnFocus = false } = {}) {
    setOpen(false);
    setActiveId(null);
    if (returnFocus) triggerRef.current?.focus();
  }

  function toggle(id: string) {
    if (disabled || readOnly) return;

    const next = new Set(unique(selectedIds));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(orderSelectedIds(next, orderedMasters, selectedIds));
  }

  function moveActive(direction: 1 | -1) {
    if (interactiveOptionIds.length === 0) return;

    const currentIndex = activeId ? interactiveOptionIds.indexOf(activeId) : -1;
    const nextIndex =
      currentIndex < 0
        ? direction === 1 ? 0 : interactiveOptionIds.length - 1
        : (currentIndex + direction + interactiveOptionIds.length) % interactiveOptionIds.length;
    const nextId = interactiveOptionIds[nextIndex]!;
    setActiveId(nextId);
    optionRefs.current.get(nextId)?.focus();
  }

  function handleOptionKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    option: SurfaceOption
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const firstId = interactiveOptionIds[0];
      if (firstId) {
        setActiveId(firstId);
        optionRefs.current.get(firstId)?.focus();
      }
    } else if (event.key === "End") {
      event.preventDefault();
      const lastId = interactiveOptionIds.at(-1);
      if (lastId) {
        setActiveId(lastId);
        optionRefs.current.get(lastId)?.focus();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeList({ returnFocus: true });
    } else if ((event.key === "Enter" || event.key === " ") && readOnly) {
      event.preventDefault();
    } else if ((event.key === "Enter" || event.key === " ") && !option.unavailable) {
      event.preventDefault();
      toggle(option.id);
    }
  }

  return (
    <div
      ref={rootRef}
      className="knowledge-surface-multiselect"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeList();
        }
      }}
    >
      <span id={labelId} className="knowledge-surface-multiselect__label">
        Surfaces
      </span>
      <button
        ref={triggerRef}
        id={`${generatedId}-trigger`}
        type="button"
        className="knowledge-surface-multiselect__trigger"
        aria-labelledby={labelId}
        aria-describedby={summaryId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) closeList();
          else openList();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openList("first");
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openList("last");
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            closeList();
          }
        }}
      >
        <span id={summaryId} className="knowledge-surface-multiselect__summary">
          {selectedSummary}
        </span>
        <span className="knowledge-surface-multiselect__indicator" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="knowledge-surface-multiselect__popup">
          {options.length > 0 ? (
            <div
              id={listboxId}
              className="knowledge-surface-multiselect__listbox"
              role="listbox"
              aria-label="Surface options"
              aria-multiselectable="true"
              aria-readonly={readOnly || undefined}
            >
              {options.map((option, index) => {
                const optionId = `${listboxId}-option-${index}`;
                const optionLabel = option.statusLabel
                  ? `${option.label} (${option.statusLabel})`
                  : option.label;

                return (
                  <button
                    key={option.id}
                    ref={(node) => {
                      if (node) optionRefs.current.set(option.id, node);
                      else optionRefs.current.delete(option.id);
                    }}
                    id={optionId}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    className="knowledge-surface-multiselect__option"
                    aria-label={optionLabel}
                    aria-selected={option.selected}
                    aria-disabled={readOnly || option.unavailable || undefined}
                    data-active={activeId === option.id || undefined}
                    onClick={() => {
                      if (!option.unavailable) toggle(option.id);
                    }}
                    onKeyDown={(event) => handleOptionKeyDown(event, option)}
                  >
                    <span className="knowledge-surface-multiselect__check" aria-hidden="true">
                      {option.selected ? "✓" : ""}
                    </span>
                    <span className="knowledge-surface-multiselect__option-label">
                      {option.label}
                      {option.statusLabel ? (
                        <span className="knowledge-surface-multiselect__option-status">
                          {` (${option.statusLabel})`}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p
              id={listboxId}
              className="knowledge-surface-multiselect__empty"
              role="status"
            >
              No Surface options available.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function orderUniqueMasters(masters: readonly KnowledgeMaster[]) {
  const ordered = [...masters].sort((left, right) =>
    left.displayOrder - right.displayOrder ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
  const seen = new Set<string>();

  return ordered.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function orderSelectedIds(
  selected: ReadonlySet<string>,
  orderedMasters: readonly KnowledgeMaster[],
  previousSelectedIds: readonly string[]
) {
  const known = orderedMasters
    .filter(({ id }) => selected.has(id))
    .map(({ id }) => id);
  const knownIds = new Set(orderedMasters.map(({ id }) => id));
  const unresolved = unique(previousSelectedIds).filter(
    (id) => selected.has(id) && !knownIds.has(id)
  );

  return [...known, ...unresolved];
}

function statusLabel(status: KnowledgeMaster["status"]) {
  return status === "archived" ? "Archived" : "Inactive";
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

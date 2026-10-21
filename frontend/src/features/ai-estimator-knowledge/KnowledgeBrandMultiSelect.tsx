import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { FieldControlProps } from "../../components/ui/Field";
import "./knowledge-brand-multiselect.css";

export interface KnowledgeBrandChoice {
  readonly id: string;
  readonly name: string;
}

interface KnowledgeBrandMultiSelectProps extends FieldControlProps {
  readonly brands: readonly KnowledgeBrandChoice[];
  readonly selectedIds: readonly string[];
  readonly readOnly: boolean;
  readonly addDisabled: boolean;
  readonly addLabel: string;
  readonly onChange: (ids: readonly string[]) => void;
  readonly onAdd: (trigger: HTMLElement) => void;
  readonly onEdit: (id: string, trigger: HTMLElement) => void;
}

/** Local Pricing brands have no master lifecycle. Keep this picker inside its panel's focus scope. */
export const KnowledgeBrandMultiSelect = forwardRef<HTMLButtonElement, KnowledgeBrandMultiSelectProps>(
  function KnowledgeBrandMultiSelect({ id, brands, selectedIds, readOnly, addDisabled, addLabel, onChange, onAdd, onEdit, ...field }, forwardedRef) {
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const optionRefs = useRef(new Map<string, HTMLButtonElement>());
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [activeId, setActiveId] = useState<string | null>(null);
    useImperativeHandle(forwardedRef, () => triggerRef.current!, []);

    const selected = new Set(selectedIds);
    const labelFor = (brandId: string) => brands.find((brand) => brand.id === brandId)?.name ?? "Unavailable Brand";
    const options = useMemo(() => {
      const term = search.trim().toLocaleLowerCase();
      const known = brands.filter((brand) => !term || brand.name.toLocaleLowerCase().includes(term));
      const unavailable = [...new Set(selectedIds)].filter((brandId) => !brands.some((brand) => brand.id === brandId));
      return [
        { key: "clear", id: null, name: "Not configured" },
        ...[...known, ...unavailable.map((brandId) => ({ id: brandId, name: "Unavailable Brand" }))]
          .map((brand) => ({ ...brand, key: `brand:${brand.id}` }))
      ];
    }, [brands, search, selectedIds]);
    const optionIds = options.map((option) => option.key);
    const selectedBrands = [...new Set(selectedIds)].flatMap((brandId) => {
      const brand = brands.find((entry) => entry.id === brandId);
      return brand ? [brand] : [];
    });

    function close(returnFocus = false) {
      setOpen(false);
      setSearch("");
      setActiveId(null);
      if (returnFocus) triggerRef.current?.focus();
    }

    useEffect(() => {
      if (!readOnly) return;
      if (open || (rootRef.current?.contains(document.activeElement) && document.activeElement !== triggerRef.current)) {
        rootRef.current?.focus();
      }
      setOpen(false);
      setSearch("");
      setActiveId(null);
    }, [readOnly]);

    useEffect(() => {
      if (!open) return;
      const outside = (event: PointerEvent) => {
        if (!rootRef.current?.contains(event.target as Node)) {
          setOpen(false);
          setSearch("");
          setActiveId(null);
        }
      };
      document.addEventListener("pointerdown", outside);
      return () => document.removeEventListener("pointerdown", outside);
    }, [open]);

    useEffect(() => {
      if (!open || readOnly) return;
      if (activeId === null) searchRef.current?.focus();
      else {
        const option = optionRefs.current.get(activeId);
        if (option) option.focus();
        else { setActiveId(null); searchRef.current?.focus(); }
      }
    }, [activeId, open, options, readOnly]);

    function toggle(brandId: string | null) {
      if (readOnly) return;
      if (brandId === null) { onChange([]); return; }
      onChange(selected.has(brandId) ? selectedIds.filter((entry) => entry !== brandId) : [...selectedIds, brandId]);
    }

    function move(direction: 1 | -1) {
      if (!optionIds.length) return;
      const current = activeId === null ? -1 : optionIds.indexOf(activeId);
      setActiveId(optionIds[current < 0 ? direction === 1 ? 0 : optionIds.length - 1 : (current + direction + optionIds.length) % optionIds.length]!);
    }

    return (
      <div
        ref={rootRef}
        tabIndex={-1}
        role="group"
        aria-label="Brand selection"
        className="knowledge-brand-multiselect"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
        }}
        onKeyDown={(event) => {
          if (open && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          }
        }}
      >
        <button
          {...field}
          ref={triggerRef}
          id={id}
          type="button"
          className="ui-control ui-select knowledge-brand-multiselect__trigger"
          aria-haspopup="listbox"
          aria-controls={open ? `${id}-options` : undefined}
          aria-expanded={open}
          aria-describedby={[field["aria-describedby"], `${id}-value`].filter(Boolean).join(" ")}
          disabled={readOnly}
          onClick={() => {
            if (open) close();
            else { setOpen(true); setActiveId(null); }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveId((event.key === "ArrowDown" ? optionIds[0] : optionIds.at(-1)) ?? null);
            }
          }}
        >
          <span id={`${id}-value`}>{selectedIds.length ? selectedIds.map(labelFor).join(", ") : "Not configured"}</span>
        </button>

        {open && !readOnly ? (
          <div className="knowledge-brand-multiselect__popup">
            <label className="knowledge-brand-multiselect__search">
              <span>Search brands</span>
              <input
                ref={searchRef}
                className="ui-control ui-input"
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setActiveId(null); }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    move(event.key === "ArrowDown" ? 1 : -1);
                  }
                }}
              />
            </label>
            <div id={`${id}-options`} role="listbox" aria-label="Brand options" aria-multiselectable="true" className="knowledge-brand-multiselect__options">
              {options.map((brand, index) => (
                <button
                  key={brand.key}
                  ref={(node) => { if (node) optionRefs.current.set(brand.key, node); else optionRefs.current.delete(brand.key); }}
                  type="button"
                  role="option"
                  aria-selected={brand.id === null ? selectedIds.length === 0 : selected.has(brand.id)}
                  tabIndex={activeId === brand.key || (activeId === null && index === 0) ? 0 : -1}
                  className="knowledge-brand-multiselect__option"
                  onFocus={() => setActiveId(brand.key)}
                  onClick={() => { setActiveId(brand.key); toggle(brand.id); }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      move(event.key === "ArrowDown" ? 1 : -1);
                    } else if (event.key === "Home" || event.key === "End") {
                      event.preventDefault();
                      setActiveId((event.key === "Home" ? optionIds[0] : optionIds.at(-1)) ?? null);
                    } else if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      toggle(brand.id);
                    }
                  }}
                >
                  <span className="knowledge-brand-multiselect__check" aria-hidden="true">{(brand.id === null ? selectedIds.length === 0 : selected.has(brand.id)) ? "✓" : ""}</span>
                  <span>{brand.name}</span>
                </button>
              ))}
            </div>
            {options.length === 1 ? <p role="status" className="knowledge-brand-multiselect__empty">{search.trim() ? "No brands match your search." : "No brands have been added."}</p> : null}
            <div className="knowledge-brand-multiselect__actions">
              {selectedBrands.map((brand) => (
                <button
                  key={brand.id}
                  type="button"
                  className="knowledge-brand-multiselect__action"
                  aria-label={selectedIds.length === 1 ? `Edit selected brand ${brand.name}` : undefined}
                  onClick={() => {
                    const trigger = triggerRef.current;
                    close(true);
                    if (trigger) onEdit(brand.id, trigger);
                  }}
                >{selectedIds.length === 1 ? "Edit selected brand" : `Edit ${brand.name}`}</button>
              ))}
              <button
                type="button"
                className="knowledge-brand-multiselect__action"
                disabled={addDisabled}
                onClick={() => {
                  const trigger = triggerRef.current;
                  close(true);
                  if (trigger) onAdd(trigger);
                }}
              >{addLabel}</button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
);

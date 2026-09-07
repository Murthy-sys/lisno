import { useEffect, useId, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { Checkbox, Field, Input } from "../../components/ui/Field";
import {
  MAX_PMC_SCOPE_ITEMS,
  createPmcScopeItem,
  normalizePmcScopeName,
  type KnowledgePmcScopeItem,
  type KnowledgePmcScopeList
} from "./knowledgePmcScope";

interface Props {
  readonly list: KnowledgePmcScopeList;
  readonly items: readonly KnowledgePmcScopeItem[];
  readonly readOnly: boolean;
  readonly onChange: (items: readonly KnowledgePmcScopeItem[]) => void;
}

export function KnowledgePmcScopeChecklist({ list, items, readOnly, onChange }: Props) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const singular = list === "inclusions" ? "Inclusion" : "Exclusion";
  const title = list === "inclusions" ? "Inclusions" : "Exclusions";
  const atLimit = items.length >= MAX_PMC_SCOPE_ITEMS;

  useEffect(() => {
    if (adding) {
      inputRef.current?.focus();
    } else if (restoreFocus.current) {
      addButtonRef.current?.focus();
      restoreFocus.current = false;
    }
  }, [adding]);

  function closeEditor() {
    setAdding(false);
    setName("");
    setError(undefined);
    restoreFocus.current = true;
  }

  function addItem() {
    if (readOnly || atLimit) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(`Enter an ${singular.toLowerCase()} name.`);
      return;
    }
    if (items.some((item) => normalizePmcScopeName(item.name) === normalizePmcScopeName(trimmed))) {
      setError(`This ${singular.toLowerCase()} already exists.`);
      return;
    }
    onChange([...items, createPmcScopeItem(list, trimmed)]);
    closeEditor();
  }

  return (
    <fieldset className="knowledge-pmc-scope__list">
      <legend>{title}</legend>
      <div className="knowledge-pmc-scope__items">
        {items.map((item) => (
          <label key={item.id}>
            <Checkbox
              checked={item.selected}
              disabled={readOnly}
              onChange={(event) => onChange(items.map((entry) => entry.id === item.id
                ? { ...entry, selected: event.target.checked }
                : entry))}
            />
            <span>{item.name}</span>
          </label>
        ))}
      </div>
      {!readOnly ? (
        <div className="knowledge-pmc-scope__add">
          {adding ? (
            <>
              <Field id={`${id}-name`} label={`${singular} name`} error={error}>
                {(props) => (
                  <Input
                    {...props}
                    ref={inputRef}
                    value={name}
                    maxLength={240}
                    disabled={atLimit}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError(undefined);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addItem();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        closeEditor();
                      }
                    }}
                  />
                )}
              </Field>
              <div className="knowledge-pmc-scope__actions">
                <Button type="button" variant="quiet" onClick={closeEditor}>Cancel</Button>
                <Button type="button" disabled={atLimit} onClick={addItem}>Save</Button>
              </div>
            </>
          ) : (
            <Button ref={addButtonRef} type="button" variant="secondary" disabled={atLimit} onClick={() => setAdding(true)}>
              Add {singular}
            </Button>
          )}
          {atLimit ? <p>Maximum {MAX_PMC_SCOPE_ITEMS} {list} reached.</p> : null}
        </div>
      ) : null}
    </fieldset>
  );
}

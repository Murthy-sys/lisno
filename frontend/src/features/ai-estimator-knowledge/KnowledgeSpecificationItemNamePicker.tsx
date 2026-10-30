import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Checkbox, Field, Input, type FieldControlProps } from "../../components/ui/Field";
import {
  collectSpecificationItemNames,
  matchSpecificationItemNames,
  normalizeSpecificationItemName,
  sanitizeSpecificationItemName
} from "../../../../shared/knowledge/knowledgeSpecificationItemNames";
import type { KnowledgeSpecificationItemNameLookup } from "./knowledgeEditorDataSource";
import "./knowledge-specification-item-name-picker.css";

interface Props extends FieldControlProps {
  readonly value: string;
  readonly draftNames: readonly string[];
  readonly otherRowNames: readonly string[];
  readonly lookup: KnowledgeSpecificationItemNameLookup;
  readonly readOnly: boolean;
  readonly onChange: (name: string) => void;
}

/** Search is only discovery; selection and Add item update the existing Mode draft. */
export const KnowledgeSpecificationItemNamePicker = forwardRef<HTMLButtonElement, Props>(
  function KnowledgeSpecificationItemNamePicker({ id, value, draftNames, otherRowNames, lookup, readOnly, onChange, required: _required, ...field }, forwardedRef) {
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const candidateRef = useRef<HTMLInputElement>(null);
    const optionRefs = useRef(new Map<string, HTMLButtonElement>());
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [activeName, setActiveName] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [candidate, setCandidate] = useState("");
    const [confirmation, setConfirmation] = useState<string | null>(null);
    useImperativeHandle(forwardedRef, () => triggerRef.current!, []);

    const searchKey = normalizeSpecificationItemName(search);
    // Keep request length tied to the entered value; NFKC can expand a valid name.
    const debouncedSearch = useDebouncedValue(search);
    const listParams = { search: debouncedSearch, limit: 20 };
    const catalog = useInfiniteQuery({
      queryKey: lookup.queryKey(listParams),
      initialPageParam: 0,
      queryFn: ({ pageParam, signal }) => lookup.list({ ...listParams, offset: pageParam }, { signal }),
      getNextPageParam: (page) => page.pagination.hasMore ? page.pagination.offset + page.pagination.limit : undefined,
      enabled: open && !readOnly && search === debouncedSearch,
      staleTime: 0,
      retry: false
    });
    const cleanCandidate = sanitizeSpecificationItemName(candidate);
    const debouncedCandidate = useDebouncedValue(cleanCandidate);
    const checkParams = { checkName: debouncedCandidate ?? "", limit: 1 };
    const checked = useQuery({
      queryKey: lookup.queryKey(checkParams),
      queryFn: ({ signal }) => lookup.list(checkParams, { signal }),
      enabled: adding && !readOnly && cleanCandidate !== null && cleanCandidate === debouncedCandidate,
      staleTime: 0,
      retry: false
    });
    const conflicts = useMemo(() => new Set(otherRowNames.map(normalizeSpecificationItemName)), [otherRowNames]);
    const options = useMemo(() => mergeSavedAndDraftNames(
      catalog.data?.pages.flatMap((page) => page.items.map((item) => item.name)) ?? [], draftNames
    ).filter((item) => !searchKey || normalizeSpecificationItemName(item.name).includes(searchKey)), [catalog.data, draftNames, searchKey]);
    const matches = useMemo(() => matchSpecificationItemNames(mergeSavedAndDraftNames([
      ...(checked.data?.exactMatch ? [checked.data.exactMatch.name] : []),
      ...(checked.data?.similarItems.map((item) => item.name) ?? [])
    ], draftNames), cleanCandidate ?? ""), [checked.data, cleanCandidate, draftNames]);
    const checkReady = cleanCandidate !== null && cleanCandidate === debouncedCandidate && checked.isSuccess && !checked.isFetching;
    const catalogPending = catalog.isPending || search !== debouncedSearch;
    const candidateConflict = cleanCandidate !== null && conflicts.has(normalizeSpecificationItemName(cleanCandidate));
    const confirmationKey = JSON.stringify([cleanCandidate, matches.similarItems]);
    const mustConfirm = !matches.exactMatch && matches.similarItems.length > 0;
    const canAdd = !readOnly && checkReady && !matches.exactMatch && !candidateConflict && (!mustConfirm || confirmation === confirmationKey);
    const availableOptions = options.filter((item) => !conflicts.has(normalizeSpecificationItemName(item.name)));

    function close(returnFocus = false) {
      setOpen(false);
      setSearch("");
      setActiveName(null);
      if (returnFocus) triggerRef.current?.focus();
    }

    function select(name: string) {
      if (readOnly || conflicts.has(normalizeSpecificationItemName(name))) return;
      onChange(name);
      setAdding(false);
      close(true);
    }

    function move(direction: 1 | -1) {
      if (!availableOptions.length || catalog.isError || catalogPending) return;
      const index = availableOptions.findIndex((item) => item.name === activeName);
      setActiveName(availableOptions[index < 0 ? direction === 1 ? 0 : availableOptions.length - 1 : (index + direction + availableOptions.length) % availableOptions.length]!.name);
    }

    function add(event: FormEvent) {
      event.preventDefault();
      if (canAdd && cleanCandidate) select(cleanCandidate);
    }

    function focusSearch() {
      setActiveName(null);
      searchRef.current?.focus();
    }

    useEffect(() => {
      if (readOnly) { setOpen(false); setAdding(false); setSearch(""); setActiveName(null); }
    }, [readOnly]);
    useEffect(() => {
      if (!open || readOnly) return;
      if (activeName === null) searchRef.current?.focus();
      else optionRefs.current.get(activeName)?.focus();
    }, [activeName, open, readOnly]);
    useEffect(() => {
      if (open && activeName !== null && !options.some((item) => item.name === activeName)) setActiveName(null);
    }, [activeName, open, options]);
    useEffect(() => {
      if (!open) return;
      const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) close(); };
      document.addEventListener("pointerdown", outside);
      return () => document.removeEventListener("pointerdown", outside);
    }, [open]);

    return (
      <div ref={rootRef} className="knowledge-item-name-picker" onBlur={(event) => {
        // Async controls can become disabled or disappear without focus leaving
        // the picker intentionally. Outside pointer and keyboard moves still close it.
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
      }} onKeyDown={(event) => {
        if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
      }}>
        <button {...field} ref={triggerRef} id={id} type="button" className="ui-control ui-select knowledge-item-name-picker__trigger"
          aria-haspopup="listbox" aria-controls={open && !catalogPending && !catalog.isError ? `${id}-options` : undefined} aria-expanded={open} disabled={readOnly}
          onClick={() => { if (open) close(); else { setOpen(true); setActiveName(null); } }}
          onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActiveName(null); } }}>
          {value || "Select item"}
        </button>
        {open && !readOnly ? <div className="knowledge-item-name-picker__popup">
          <label className="knowledge-item-name-picker__search"><span>Search items</span>
            <Input ref={searchRef} type="search" maxLength={240} value={search}
              onChange={(event) => { setSearch(event.target.value); setActiveName(null); }}
              onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); } }} />
          </label>
          {catalogPending ? <p role="status">Loading items…</p> : catalog.isError ? <div role="alert">
            <p>{lookupError(catalog.error)}</p><Button type="button" variant="secondary" onClick={() => { focusSearch(); void catalog.refetch(); }}>Retry items</Button>
          </div> : <>
            {catalog.isFetching && !catalog.isFetchingNextPage ? <p role="status">Refreshing items…</p> : null}
            <div id={`${id}-options`} role="listbox" aria-label="Item options" className="knowledge-item-name-picker__options">
              {options.map((item) => {
                const conflict = conflicts.has(normalizeSpecificationItemName(item.name));
                return <button key={normalizeSpecificationItemName(item.name)} ref={(element) => { if (element) optionRefs.current.set(item.name, element); else optionRefs.current.delete(item.name); }}
                  type="button" role="option" aria-selected={normalizeSpecificationItemName(value) === normalizeSpecificationItemName(item.name)}
                  disabled={conflict || (catalog.isFetching && !catalog.isFetchingNextPage)} tabIndex={activeName === item.name || (activeName === null && availableOptions[0]?.name === item.name) ? 0 : -1}
                  className="knowledge-item-name-picker__option" onFocus={() => setActiveName(item.name)} onClick={() => select(item.name)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); }
                    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); setActiveName((event.key === "Home" ? availableOptions[0] : availableOptions.at(-1))?.name ?? null); }
                  }}>
                  <span>{item.name}</span>{conflict ? <small>Already included</small> : null}
                </button>;
              })}
            </div>
            {!options.length ? <p role="status">{searchKey ? "No items match your search." : "No saved items yet."}</p> : null}
            {catalog.hasNextPage ? <Button type="button" variant="secondary" busy={catalog.isFetchingNextPage} onClick={() => { focusSearch(); void catalog.fetchNextPage(); }}>Load more items</Button> : null}
          </>}
          <div className="knowledge-item-name-picker__actions"><Button type="button" variant="secondary" disabled={catalog.isError || catalogPending || catalog.isFetching}
            onClick={() => { setCandidate(search); setConfirmation(null); close(true); setAdding(true); }}>Add item</Button></div>
        </div> : null}
        {adding && !readOnly ? <Dialog title="Add item" eyebrow="Specifications" onClose={() => setAdding(false)} initialFocusRef={candidateRef} returnFocusRef={triggerRef}>
          <form className="ui-dialog__form knowledge-dialog-form" onSubmit={add} noValidate>
            <div className="ui-dialog__body knowledge-dialog-body knowledge-item-name-picker__add">
              <Field id={`${id}-new-name`} label="Item name" required error={candidate && !cleanCandidate ? "Enter an item name of up to 240 characters." : undefined}>
                {(props) => <Input {...props} ref={candidateRef} value={candidate} maxLength={240} autoComplete="off" onChange={(event) => { setCandidate(event.target.value); setConfirmation(null); }} />}
              </Field>
              {cleanCandidate && (checked.isPending || checked.isFetching || cleanCandidate !== debouncedCandidate) ? <p role="status">Checking saved items…</p> : null}
              {cleanCandidate && checked.isError ? <div role="alert"><p>{lookupError(checked.error)}</p><Button type="button" variant="secondary" onClick={() => void checked.refetch()}>Retry check</Button></div> : null}
              {checkReady ? <>
                {candidateConflict ? <p role="alert">This item is already included in this Mode.</p> : matches.exactMatch ? <div><p>This item already exists.</p><Button type="button" variant="secondary" onClick={() => select(matches.exactMatch!.name)}>Select {matches.exactMatch.name}</Button></div> : null}
                {mustConfirm ? <div><p>Similar items</p><div className="knowledge-item-name-picker__matches">
                  {matches.similarItems.map((item) => <Button key={item.name} type="button" variant="secondary" disabled={conflicts.has(normalizeSpecificationItemName(item.name))} onClick={() => select(item.name)}>{item.name}{conflicts.has(normalizeSpecificationItemName(item.name)) ? " (already included)" : ""}</Button>)}
                </div><label className="knowledge-item-name-picker__confirmation"><Checkbox checked={confirmation === confirmationKey} onChange={(event) => setConfirmation(event.target.checked ? confirmationKey : null)} />Use “{cleanCandidate}” as a different item</label></div> : null}
              </> : null}
            </div>
            <div className="ui-dialog__actions knowledge-dialog-actions"><Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={!canAdd}>Add and select</Button></div>
          </form>
        </Dialog> : null}
      </div>
    );
  }
);

function lookupError(error: unknown): string {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
    ? "You no longer have access to the saved item list."
    : "The saved item list could not load. Retry to continue.";
}

function mergeSavedAndDraftNames(savedNames: readonly string[], draftNames: readonly string[]) {
  const saved = collectSpecificationItemNames(savedNames);
  const savedKeys = new Set(saved.map((item) => normalizeSpecificationItemName(item.name)));
  return collectSpecificationItemNames([
    ...saved.map((item) => item.name),
    ...draftNames.filter((name) => !savedKeys.has(normalizeSpecificationItemName(name)))
  ]);
}

function useDebouncedValue<T>(value: T): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), 200);
    return () => window.clearTimeout(timer);
  }, [value]);
  return settled;
}

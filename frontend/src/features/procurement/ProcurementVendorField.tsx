import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import type { ProcurementVendorReference } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { SearchCombobox } from "../../components/ui/SearchCombobox";
import { syncKnowledgeMasterMutation } from "../ai-estimator-knowledge/knowledgeMutationSync";
import { createProcurementVendor, getProcurementVendors, projectProcurementKeys } from "./projectProcurementApi";
import { procurementError } from "./procurementPresentation";

interface Props {
  value: ProcurementVendorReference | null;
  onChange: (value: ProcurementVendorReference | null) => void;
  error?: string;
  onBusyChange: (busy: boolean) => void;
  onUnresolvedChange: (unresolved: boolean) => void;
}

export function ProcurementVendorField({ value, onChange, error, onBusyChange, onUnresolvedChange }: Props) {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.vendors.read");
  const canCreate = hasFrontendPermission(auth.authorization, "procurement.vendors.create");
  const queryClient = useQueryClient();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const newVendorRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(value?.name ?? "");
  const [debounced, setDebounced] = useState("");
  const [adding, setAdding] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [nameError, setNameError] = useState("");
  const [notice, setNotice] = useState("");
  const lookup = value && query === value.name ? "" : query;
  const normalizedLookup = lookup.normalize("NFKC").trim().replace(/\s+/gu, " ").slice(0, 100);
  const isDebouncing = normalizedLookup !== debounced;
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(normalizedLookup), 250);
    return () => window.clearTimeout(timer);
  }, [normalizedLookup]);
  useEffect(() => {
    onUnresolvedChange(Boolean((query.trim() && !value) || (adding && vendorName.trim())));
  }, [adding, onUnresolvedChange, query, value, vendorName]);
  const vendors = useInfiniteQuery({
    queryKey: projectProcurementKeys.vendorSearch(debounced),
    queryFn: ({ pageParam, signal }) => getProcurementVendors(debounced, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (page) => page.offset + page.limit < page.total ? page.offset + page.limit : undefined,
    enabled: canRead,
    staleTime: 30_000
  });
  const lookupLoading = isDebouncing || vendors.isPending || (vendors.isFetching && !vendors.isFetchingNextPage);
  const optionsUnavailable = lookupLoading || vendors.isError;
  // Keyboard navigation must never use results for an earlier search, even while
  // the combobox's loading state hides its popup options.
  const options = optionsUnavailable ? [] : vendors.data?.pages.flatMap((page) => page.items) ?? [];
  const create = useMutation({
    mutationFn: createProcurementVendor,
    onSuccess: async (vendor) => {
      onChange(vendor);
      setQuery(vendor.name);
      setAdding(false);
      setVendorName("");
      setNotice(`${vendor.name} is selected and saved for future projects.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectProcurementKeys.vendors }),
        syncKnowledgeMasterMutation(queryClient, "vendors")
      ]);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    onSettled: () => onBusyChange(false)
  });

  function saveVendor() {
    const name = vendorName.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!name || name.length > 200) {
      setNameError("Enter a vendor name of up to 200 characters.");
      newVendorRef.current?.focus();
      return;
    }
    onBusyChange(true);
    create.mutate(name);
  }

  return <div className="project-procurement-vendor" onKeyDownCapture={(event) => {
    if (event.target === inputRef.current && event.key === "Enter" && optionsUnavailable) {
      event.preventDefault();
      event.stopPropagation();
    }
  }}>
    {canRead ? <SearchCombobox<ProcurementVendorReference>
      label="Vendor" placeholder="Search saved vendors" value={value}
      onChange={(selected) => { onChange(selected); setNotice(""); }}
      query={query} onQueryChange={(next) => setQuery(next.slice(0, 200))}
      items={options} itemKey={(vendor) => vendor.id} itemLabel={(vendor) => vendor.name}
      renderItem={(vendor) => <span>{vendor.name}</span>}
      loading={lookupLoading}
      error={vendors.isError ? procurementError(vendors.error, "Vendors could not be loaded.") : undefined}
      onRetry={() => void vendors.refetch()} invalid={Boolean(error)} inputRef={inputRef}
      describedBy={`${id}-hint${error ? ` ${id}-error` : ""}`}
    /> : <p>You do not have permission to search vendors.{value ? ` Current vendor: ${value.name}.` : ""}</p>}
    <p id={`${id}-hint`} className="ui-field__hint">Optional. Saved vendors are available across projects.</p>
    {error ? <p id={`${id}-error`} className="ui-field__error">{error}</p> : null}
    {value && value.status !== "active" ? <InlineMessage tone="warning">The current vendor is {value.status}. You can retain it, clear it or choose an active vendor.</InlineMessage> : null}
    <div className="project-procurement-vendor__actions">
      {canRead && !isDebouncing && vendors.hasNextPage ? <Button variant="quiet" size="compact" busy={vendors.isFetchingNextPage} disabled={lookupLoading} busyLabel="Loading…" onClick={() => void vendors.fetchNextPage()}>Load more vendors</Button> : null}
      {value || query ? <Button variant="quiet" size="compact" onClick={() => { onChange(null); setQuery(""); setNotice(""); }}>Clear vendor</Button> : null}
      {canCreate && !adding ? <Button variant="secondary" size="compact" onClick={() => {
        setAdding(true); setVendorName(value ? "" : query); setNameError(""); create.reset(); setNotice("");
        requestAnimationFrame(() => newVendorRef.current?.focus());
      }}>Add vendor</Button> : null}
    </div>
    {adding ? <div className="project-procurement-vendor__create">
      <Field id={`${id}-name`} label="New vendor name" error={nameError}>
        {(props) => <Input {...props} ref={newVendorRef} value={vendorName} maxLength={200} onChange={(event) => { setVendorName(event.target.value); setNameError(""); create.reset(); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveVendor(); } }} />}
      </Field>
      <p className="ui-field__hint">Saving adds this vendor for future projects, even if you cancel this item.</p>
      {create.isError ? <InlineMessage tone="error">{procurementError(create.error, "The vendor could not be saved. Try again.")}</InlineMessage> : null}
      <div className="project-procurement-vendor__actions">
        <Button variant="secondary" size="compact" busy={create.isPending} busyLabel="Saving vendor…" onClick={saveVendor}>Save vendor</Button>
        <Button variant="quiet" size="compact" disabled={create.isPending} onClick={() => { setAdding(false); setVendorName(""); }}>Cancel vendor</Button>
      </div>
    </div> : null}
    {notice ? <p role="status" className="ui-field__hint">{notice}</p> : null}
  </div>;
}

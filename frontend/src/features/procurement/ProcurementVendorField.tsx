import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import type { ProcurementVendorOption, ProcurementVendorReference } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { SearchCombobox } from "../../components/ui/SearchCombobox";
import { syncKnowledgeMasterMutation } from "../ai-estimator-knowledge/knowledgeMutationSync";
import { createProcurementVendor, getActiveProcurementVendors, getProcurementVendors, projectProcurementKeys } from "./projectProcurementApi";
import { procurementError } from "./procurementPresentation";
import { ProcurementSuggestedVendors } from "./ProcurementSuggestedVendors";

interface Props {
  variant?: "search" | "active-select";
  projectId?: string;
  required?: boolean;
  suggestionsDisabled?: boolean;
  value: ProcurementVendorReference | null;
  onChange: (value: ProcurementVendorReference | null) => void;
  error?: string;
  onBusyChange: (busy: boolean) => void;
  onUnresolvedChange: (unresolved: boolean) => void;
}

export function ProcurementVendorField(props: Props) {
  return props.variant === "active-select" ? <ActiveVendorDropdown {...props} /> : <SearchVendorField {...props} />;
}

function ActiveVendorDropdown({ value, onChange, error, onBusyChange, onUnresolvedChange, required = false }: Props) {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.vendors.read");
  const role = auth.user?.role ?? auth.authorization?.role;
  const directoryPath = role === "super_admin" ? "/admin/procurement/vendors"
    : role === "procurement" ? "/procurement/vendors" : null;
  const canOpenDirectory = Boolean(directoryPath && hasFrontendPermission(auth.authorization, "procurement.vendor_directory.read"));
  const id = useId();
  const vendors = useInfiniteQuery({
    queryKey: projectProcurementKeys.activeVendorOptions,
    queryFn: ({ pageParam, signal }) => getActiveProcurementVendors(pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (page) => page.items.length && page.offset + page.items.length < page.total ? page.offset + page.items.length : undefined,
    enabled: canRead,
    staleTime: 30_000
  });
  useEffect(() => {
    onBusyChange(false);
    onUnresolvedChange(false);
  }, [onBusyChange, onUnresolvedChange]);
  // The endpoint filters before pagination. Retain this guard so a bad or stale
  // response cannot expose an unavailable vendor as a new assignment.
  const options = vendors.data?.pages.flatMap((page) => page.items)
    .filter((vendor) => vendor.status === "active" && vendor.assignable !== false) ?? [];
  const currentIsOption = Boolean(value && options.some((option) => option.id === value.id));
  const hasInactiveCurrent = Boolean(value && value.status !== "active");
  const hasUnlistedActiveCurrent = Boolean(value && value.status === "active" && !currentIsOption);

  return <div className="project-procurement-vendor">
    {canRead ? <Field id={`${id}-select`} label="Vendor" required={required} error={error}
      hint={required ? "Choose an active vendor from the directory." : "Optional. Only active vendors are available for new selection."}>
      {(field) => <Select {...field} value={currentIsOption || hasUnlistedActiveCurrent ? value!.id : ""}
        disabled={vendors.isPending || vendors.isError}
        onFocus={() => { if (!vendors.isFetching) void vendors.refetch(); }}
        onChange={(event) => {
          const selected = options.find((option) => option.id === event.target.value);
          if (selected) onChange(selected);
        }}>
        <option value="">{hasInactiveCurrent ? `Keep current vendor: ${value!.name}` : "Select an active vendor"}</option>
        {hasUnlistedActiveCurrent ? <option value={value!.id} disabled>Current vendor: {value!.name} (retained)</option> : null}
        {options.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
      </Select>}
    </Field> : <p>You do not have permission to view active vendors.{value ? ` Current vendor: ${value.name}.` : ""}</p>}
    {hasInactiveCurrent ? <InlineMessage tone="warning">Current vendor: {value!.name} ({value!.status}). This assignment is retained until you explicitly clear it or choose an active vendor.</InlineMessage> : null}
    {canRead && vendors.isPending ? <p role="status" className="ui-field__hint">Loading active vendors…</p> : null}
    {canRead && vendors.isError ? <InlineMessage tone="error" action={<Button variant="secondary" size="compact" onClick={() => void vendors.refetch()}>Retry vendors</Button>}>{procurementError(vendors.error, "Active vendors could not be loaded.")}</InlineMessage> : null}
    {canRead && vendors.isSuccess && vendors.data.pages[0]?.total === 0 ? <p className="ui-field__hint">No active vendors are available. Activate a vendor in the directory first.</p> : null}
    <div className="project-procurement-vendor__actions">
      {canRead && vendors.hasNextPage ? <Button variant="quiet" size="compact" busy={vendors.isFetchingNextPage} disabled={vendors.isFetchingNextPage} busyLabel="Loading…" onClick={() => void vendors.fetchNextPage()}>Load more vendors</Button> : null}
      {value ? <Button variant="quiet" size="compact" onClick={() => onChange(null)}>Clear vendor</Button> : null}
      {directoryPath && canOpenDirectory ? <a className="project-procurement-vendor__directory-link" href={directoryPath} target="_blank" rel="noopener noreferrer">Manage vendors (opens in new tab)</a> : null}
    </div>
  </div>;
}

function SearchVendorField({ value, onChange, error, onBusyChange, onUnresolvedChange, projectId, required = false, suggestionsDisabled = false }: Props) {
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
      if (vendor.status === "active") {
        onChange(vendor);
        setQuery(vendor.name);
        setNotice(`${vendor.name} is selected and saved for future projects.`);
      } else {
        // Candidate vendors are saved for onboarding, but cannot be assigned to this item.
        setQuery(vendor.name);
        setNotice(`${vendor.name} was added as Under Review. Submit the Vendor KPI and rate the Procurement KPI in Procurement > Vendors before assigning new work.`);
      }
      setAdding(false);
      setVendorName("");
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
    {projectId && canRead && hasFrontendPermission(auth.authorization, "procurement.vendor_suggestions.read") ? <ProcurementSuggestedVendors key={projectId} projectId={projectId} disabled={suggestionsDisabled || adding} onSelect={(selected) => { onChange(selected); setQuery(selected.name); setNotice(`${selected.name} selected.`); }} /> : null}
    {canRead ? <SearchCombobox<ProcurementVendorReference>
      label="Vendor" placeholder="Search saved vendors" value={value} required={required}
      onChange={(selected) => { onChange(selected); setNotice(""); }}
      query={query} onQueryChange={(next) => setQuery(next.slice(0, 200))}
      items={options} itemKey={(vendor) => vendor.id} itemLabel={(vendor) => vendor.name}
      itemDisabled={(vendor) => vendor.status !== "active" || ("assignable" in vendor && vendor.assignable === false)}
      renderItem={(vendor) => <span className="project-procurement-vendor__option"><strong>{vendor.name}</strong><small>{vendor.status === "active" ? "Ready to assign" : vendor.status === "inactive" ? "Inactive · reactivate in Procurement > Vendors" : missingReadiness(vendor)}</small></span>}
      loading={lookupLoading}
      error={vendors.isError ? procurementError(vendors.error, "Vendors could not be loaded.") : undefined}
      onRetry={() => void vendors.refetch()} invalid={Boolean(error)} inputRef={inputRef}
      describedBy={`${id}-hint${error ? ` ${id}-error` : ""}`}
    /> : <p>You do not have permission to search vendors.{value ? ` Current vendor: ${value.name}.` : ""}</p>}
    <p id={`${id}-hint`} className="ui-field__hint">{required ? "Choose an active vendor from the shared directory." : "Optional. Saved vendors are available across projects."}</p>
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
      <p className="ui-field__hint">Saving adds a candidate to the vendor directory. Both KPIs are needed for activation. Unverified vendors remain subject to the ₹50,000 allocation cap.</p>
      {create.isError ? <InlineMessage tone="error">{procurementError(create.error, "The vendor could not be saved. Try again.")}</InlineMessage> : null}
      <div className="project-procurement-vendor__actions">
        <Button variant="secondary" size="compact" busy={create.isPending} busyLabel="Saving vendor…" onClick={saveVendor}>Save vendor</Button>
        <Button variant="quiet" size="compact" disabled={create.isPending} onClick={() => { setAdding(false); setVendorName(""); }}>Cancel vendor</Button>
      </div>
    </div> : null}
    {notice ? <p role="status" className="ui-field__hint">{notice}</p> : null}
  </div>;
}

function missingReadiness(vendor: ProcurementVendorReference): string {
  const readiness = (vendor as ProcurementVendorOption).readiness;
  if (!readiness) return "Under review · complete both KPIs in Procurement > Vendors";
  const missing = [
    !readiness.vendorSelfKpiComplete && "Vendor KPI",
    !readiness.procurementKpiComplete && "Procurement KPI"
  ].filter(Boolean);
  return missing.length ? `Under review · complete ${missing.join(" and ")} in Procurement > Vendors` : "Under review · refresh vendor status in Procurement > Vendors";
}

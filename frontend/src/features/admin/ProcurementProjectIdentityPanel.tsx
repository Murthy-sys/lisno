import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { AdminDetailSection } from "./AdminDetailSection";
import { adminProjectKeys } from "./adminProjectsApi";
import {
  getProcurementProjectIdentity, getProgramManagerOptions,
  procurementProjectIdentityKeys, updateProcurementProjectIdentity,
  type ProcurementProjectIdentity
} from "./procurementProjectIdentityApi";

function IdentityEditor({ identity }: { identity: ProcurementProjectIdentity }) {
  const client = useQueryClient();
  const [editingVersion, setEditingVersion] = useState(identity.version);
  const [cityName, setCityName] = useState(identity.city?.name ?? "");
  const [programManagerId, setProgramManagerId] = useState(identity.programManagerId ?? "");
  const [managerSearch, setManagerSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const staleDraft = editingVersion !== identity.version;
  function loadLatestIdentity() {
    setCityName(identity.city?.name ?? "");
    setProgramManagerId(identity.programManagerId ?? "");
    setEditingVersion(identity.version);
  }
  const managers = useQuery({
    queryKey: procurementProjectIdentityKeys.managers(submittedSearch),
    queryFn: ({ signal }) => getProgramManagerOptions(submittedSearch, signal)
  });
  const update = useMutation({
    mutationFn: () => updateProcurementProjectIdentity(identity.projectId, {
      expectedVersion: editingVersion,
      cityName: cityName.trim() || null,
      programManagerId: programManagerId || null
    }),
    onSuccess: async (saved) => {
      setEditingVersion(saved.version);
      client.setQueryData(procurementProjectIdentityKeys.detail(identity.projectId), saved);
      await client.invalidateQueries({ queryKey: adminProjectKeys.all });
    }
  });
  const selectedManagerVisible = managers.data?.items.some(manager => manager.id === programManagerId) ?? false;
  return <div className="admin-project-reference__detail-groups">
    <p>Confirm the project city for vendor search and assign the Program Manager who reviews work orders above ₹50,000.</p>
    {staleDraft ? <p role="alert">Procurement project details changed while you were editing. <button type="button" onClick={loadLatestIdentity}>Load latest details</button></p> : null}
    <form onSubmit={(event) => { event.preventDefault(); if (!staleDraft) update.mutate(); }}>
      <Field id="procurement-project-city" label="Project city" hint="City groups vendor results; it does not change vendor eligibility or pricing.">
        {(control) => <Input {...control} value={cityName} maxLength={120} disabled={update.isPending}
          onChange={(event) => setCityName(event.target.value)} placeholder="Enter city" />}
      </Field>
      <div className="admin-design-assignment__form">
        <Field id="program-manager-search" label="Search active Program Managers">
          {(control) => <Input {...control} value={managerSearch} maxLength={120}
            onChange={(event) => setManagerSearch(event.target.value)} placeholder="Name or email" />}
        </Field>
        <Button type="button" onClick={() => setSubmittedSearch(managerSearch.trim())}>Search</Button>
      </div>
      <Field id="procurement-program-manager" label="Program Manager" hint="A current project assignment is required for work orders over ₹50,000.">
        {(control) => <Select {...control} value={programManagerId} disabled={managers.isPending || update.isPending}
          onChange={(event) => setProgramManagerId(event.target.value)}>
          <option value="">Unassigned</option>
          {programManagerId && !selectedManagerVisible ? <option value={programManagerId}>Current assignment · {programManagerId}</option> : null}
          {managers.data?.items.map(manager => <option key={manager.id} value={manager.id}>{manager.name} · {manager.email}</option>)}
        </Select>}
      </Field>
      {managers.isError ? <p role="alert">Program Managers could not be loaded. Search again.</p> : null}
      {update.isError ? <p role="alert">{update.error instanceof ApiError ? update.error.message : "The project identity could not be saved."}</p> : null}
      {update.isSuccess ? <p role="status">Procurement project details saved.</p> : null}
      <Button type="submit" disabled={staleDraft} busy={update.isPending} busyLabel="Saving…">Save procurement details</Button>
    </form>
  </div>;
}

export function ProcurementProjectIdentityPanel({ projectId }: { projectId: string }) {
  const identity = useQuery({ queryKey: procurementProjectIdentityKeys.detail(projectId),
    queryFn: ({ signal }) => getProcurementProjectIdentity(projectId, signal) });
  return <AdminDetailSection icon={<span aria-hidden="true">PM</span>} tone="cool"
    title="Procurement project details" subtitle="Project city and Program Manager approval assignment">
    {identity.isPending ? <p>Loading procurement details…</p> : identity.isError ?
      <p role="alert">Procurement details could not be loaded. <button type="button" onClick={() => void identity.refetch()}>Retry</button></p> :
      <IdentityEditor identity={identity.data} />}
  </AdminDetailSection>;
}

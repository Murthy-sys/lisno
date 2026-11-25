import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { AdminDetailSection } from "./AdminDetailSection";
import { refreshProjectManagerAssignment } from "./projectManagerAssignmentCache";
import {
  getProcurementProjectIdentity, getProgramManagerOptions,
  procurementProjectIdentityKeys, updateProcurementProjectIdentity,
  type ProcurementProjectIdentity
} from "./procurementProjectIdentityApi";

function IdentityEditor({ identity, assignmentOnly }: { identity: ProcurementProjectIdentity; assignmentOnly: boolean }) {
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
  const searchedManagers = useQuery({
    queryKey: procurementProjectIdentityKeys.managers(submittedSearch),
    queryFn: ({ signal }) => getProgramManagerOptions(submittedSearch, signal),
    enabled: !assignmentOnly
  });
  const managerPages = useInfiniteQuery({
    queryKey: procurementProjectIdentityKeys.managerPages,
    queryFn: ({ signal, pageParam }) => getProgramManagerOptions("", signal, pageParam),
    initialPageParam: 0,
    getNextPageParam: last => {
      const next = last.offset + last.limit;
      return last.items.length > 0 && next > last.offset && next < last.total ? next : undefined;
    },
    enabled: assignmentOnly
  });
  const managers = assignmentOnly ? managerPages : searchedManagers;
  const options = assignmentOnly
    ? [...new Map((managerPages.data?.pages.flatMap(page => page.items) ?? []).map(manager => [manager.id, manager])).values()]
    : searchedManagers.data?.items ?? [];
  const update = useMutation({
    mutationFn: () => updateProcurementProjectIdentity(identity.projectId, {
      expectedVersion: editingVersion,
      ...(!assignmentOnly ? { cityName: cityName.trim() || null } : {}),
      programManagerId: programManagerId || null
    }),
    onSuccess: async (saved) => {
      setEditingVersion(saved.version);
      client.setQueryData(procurementProjectIdentityKeys.detail(identity.projectId), saved);
      await refreshProjectManagerAssignment(client);
    }
  });
  const selectedManagerVisible = options.some(manager => manager.id === programManagerId);
  const assignmentChanged = programManagerId !== (identity.programManagerId ?? "");
  const assignmentValid = programManagerId === "" || selectedManagerVisible;
  const canSave = !staleDraft && !update.isPending && (!assignmentOnly ||
    assignmentChanged && assignmentValid && !managers.isPending && !managers.isFetching && !managers.isError);
  return <div className="project-people-identity">
    <p>Assign the Project Manager responsible for coordination and site execution. Procurement has a separate assignment under Procurement.</p>
    {staleDraft ? <p role="alert">Project Manager details changed while you were editing. <button type="button" onClick={loadLatestIdentity}>Load latest details</button></p> : null}
    <form onSubmit={(event) => { event.preventDefault(); if (canSave) update.mutate(); }}>
      {!assignmentOnly ? <div className="admin-design-assignment__form">
        <Field id="program-manager-search" label="Search active Project Managers">
          {(control) => <Input {...control} value={managerSearch} maxLength={120}
            onChange={(event) => setManagerSearch(event.target.value)} placeholder="Name or email" />}
        </Field>
        <Button type="button" onClick={() => setSubmittedSearch(managerSearch.trim())}>Search</Button>
      </div> : null}
      <Field id="procurement-program-manager" label="Project Manager" hint="This owner is shared with site execution. Work-order decisions remain subject to the reviewer recorded on each issued approval.">
        {(control) => <Select {...control} value={programManagerId} disabled={managers.isPending || update.isPending}
          onChange={(event) => setProgramManagerId(event.target.value)}>
          <option value="">Unassigned</option>
          {programManagerId && !selectedManagerVisible ? <option value={programManagerId} disabled={assignmentOnly}>Current assignment · {programManagerId}</option> : null}
          {options.map(manager => <option key={manager.id} value={manager.id}>{manager.name} · {manager.email}</option>)}
        </Select>}
      </Field>
      {!assignmentOnly ? <Field id="procurement-project-city" label="Project city" hint="City groups vendor results; it does not change vendor eligibility or pricing.">
        {(control) => <Input {...control} value={cityName} maxLength={120} disabled={update.isPending}
          onChange={(event) => setCityName(event.target.value)} placeholder="Enter city" />}
      </Field> : null}
      {assignmentOnly && managerPages.hasNextPage ? <Button type="button" variant="secondary"
        disabled={managerPages.isFetching || update.isPending} busy={managerPages.isFetchingNextPage} busyLabel="Loading more Project Managers…"
        onClick={() => void managerPages.fetchNextPage()}>
        {managerPages.isFetchNextPageError ? "Retry more Project Managers" : "Load more Project Managers"}
      </Button> : null}
      {managers.isError ? assignmentOnly ? <div role="alert">
        <p>{managerPages.isFetchNextPageError ? "More Project Managers could not be loaded. Your selection has been kept." : "Project Managers could not be loaded. Retry before saving an assignment."}</p>
        {!managerPages.isFetchNextPageError ? <Button type="button" variant="secondary" disabled={managerPages.isFetching}
          onClick={() => void managerPages.refetch()}>Retry Project Managers</Button> : null}
      </div> : <p role="alert">Project Managers could not be loaded. Search again.</p> : null}
      {update.isError ? <p role="alert">{update.error instanceof ApiError ? update.error.message : "The project identity could not be saved."}</p> : null}
      {update.isSuccess ? <p role="status">{assignmentOnly ? "Project Manager saved." : "Project Manager and city saved."}</p> : null}
      <Button type="submit" disabled={!canSave} busy={update.isPending} busyLabel="Saving…">{assignmentOnly ? "Save Project Manager" : "Save Project Manager & city"}</Button>
    </form>
  </div>;
}

export function ProcurementProjectIdentityPanel({ projectId, defaultOpen = false, assignmentOnly = false }: { projectId: string; defaultOpen?: boolean; assignmentOnly?: boolean }) {
  const identity = useQuery({ queryKey: procurementProjectIdentityKeys.detail(projectId),
    queryFn: ({ signal }) => getProcurementProjectIdentity(projectId, signal) });
  return <AdminDetailSection icon={<span aria-hidden="true">PM</span>} tone="cool"
    title={assignmentOnly ? "Project Manager" : "Project Manager & city"} subtitle={assignmentOnly ? "Project coordination and site execution" : "Project coordination, site execution and vendor-search city"} defaultOpen={defaultOpen}>
    {identity.isPending ? <p>Loading Project Manager details…</p> : identity.isError ?
      <p role="alert">Project Manager details could not be loaded. <button type="button" onClick={() => void identity.refetch()}>Retry</button></p> :
      <IdentityEditor key={`${projectId}:${assignmentOnly}`} identity={identity.data} assignmentOnly={assignmentOnly} />}
  </AdminDetailSection>;
}

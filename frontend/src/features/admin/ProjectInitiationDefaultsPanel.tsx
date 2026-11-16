import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { SearchCombobox } from "../../components/ui/SearchCombobox";
import { getProgramManagerOptions } from "./procurementProjectIdentityApi";
import { projectInitiationDefaultsKeys, projectInitiationDefaultsQuery, updateProjectInitiationDefaults } from "./projectInitiationDefaultsApi";

export function ProjectInitiationDefaultsPanel({ actorId, onClose }: { actorId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const defaults = useQuery(projectInitiationDefaultsQuery(actorId));
  const [selection, setSelection] = useState<{ id: string; name: string } | null>();
  const [search, setSearch] = useState<string>();
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = defaults.data?.status === "ready" ? defaults.data.projectManager : null;
  const selected = selection === undefined ? current : selection;
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search?.trim() ?? ""), search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [search]);
  const managers = useQuery({
    queryKey: [...projectInitiationDefaultsKeys.detail(actorId), "manager-options", debouncedSearch],
    queryFn: ({ signal }) => getProgramManagerOptions(debouncedSearch, signal),
    retry: false
  });
  const mutation = useMutation({
    mutationFn: updateProjectInitiationDefaults,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectInitiationDefaultsKeys.all });
      feedback.success({ title: "Project defaults saved", message: "New projects will use the selected Project Manager." });
      onClose();
    },
    onError: (cause) => {
      setError(cause instanceof ApiError ? cause.message : "Project defaults could not be saved. Refresh and try again.");
      void defaults.refetch();
    }
  });
  const ready = defaults.isSuccess && !defaults.isFetching && !defaults.isError;
  const disabled = !ready || !selected || managers.isPending || managers.isFetching || managers.isError || mutation.isPending;
  const dirty = search !== undefined || selection !== undefined && selection?.id !== current?.id;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || !selected || !defaults.data) return;
    setError(null);
    mutation.mutate({ expectedVersion: defaults.data.version, projectManagerId: selected.id });
  };
  return <ContextPanel title="Project defaults" eyebrow="Project administration"
    description="Choose the Project Manager assigned automatically to new projects. Existing project assignments stay unchanged."
    onClose={onClose} busy={mutation.isPending} dirty={dirty} className="administration-context-panel"
    footer={({ requestClose }) => <div className="modal-form__actions admin-project-form__actions">
      <Button variant="destructive-outline" disabled={mutation.isPending} onClick={requestClose}>Cancel</Button>
      <Button type="submit" form="project-initiation-defaults-form" disabled={disabled} busy={mutation.isPending} busyLabel="Saving…">Save defaults</Button>
    </div>}>
    <form id="project-initiation-defaults-form" className="modal-form" onSubmit={submit}>
      {defaults.isPending || defaults.isFetching ? <p role="status">Loading project defaults…</p> : null}
      {defaults.isError ? <div className="form-alert" role="alert">
        <p>We couldn't load project defaults.</p>
        <Button variant="secondary" onClick={() => void defaults.refetch()}>Retry project defaults</Button>
      </div> : null}
      {ready ? <p className="ui-field__hint">{current ? `Current default: ${current.name}` : defaults.data.status === "unconfigured" ? "No default Project Manager is configured." : "The configured Project Manager is unavailable. Select an active Project Manager."}</p> : null}
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      <fieldset className="admin-project-form__estimator" disabled={mutation.isPending || !ready}>
        <SearchCombobox<{ id: string; name: string; email?: string }> label="Default Project Manager" name="projectManagerId" placeholder="Search and select Project Manager"
          value={selected} query={search ?? current?.name ?? ""} onQueryChange={setSearch}
          onChange={setSelection} items={managers.data?.items ?? []} itemKey={item => item.id} itemLabel={item => item.name}
          renderItem={item => <span className="admin-project-form__estimator-option"><strong>{item.name}</strong><span>{item.email}</span></span>}
          loading={managers.isPending || managers.isFetching}
          error={managers.isError ? "We couldn't load Project Managers." : undefined}
          onRetry={() => void managers.refetch()} required />
      </fieldset>
    </form>
  </ContextPanel>;
}

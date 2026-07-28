import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiClient } from "../../api/client";
import type {
  CreateProjectInput,
  ManagerOption,
  Project,
  PublicUser
} from "../../api/types";
import { Dialog } from "../../components/ui/Dialog";
import { SearchCombobox } from "../../components/ui/SearchCombobox";
import { designerKeys, searchManagers } from "./designerApi";

interface ProjectForm {
  name: string;
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  clientAddress: string;
  assignedDesignerIds: string;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
}

const initialForm = (userId: string): ProjectForm => ({
  name: "",
  clientName: "",
  clientEmail: "",
  clientMobile: "",
  clientAddress: "",
  assignedDesignerIds: userId,
  location: "",
  plannedStartAt: "",
  plannedEndAt: ""
});

export function ProjectCreateDialog({
  user,
  onClose,
  onCreated
}: {
  user: PublicUser;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProjectForm>(() => initialForm(user.id));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedManager, setSelectedManager] = useState<ManagerOption | null>(null);
  const [managerQuery, setManagerQuery] = useState("");
  const [debouncedManagerQuery, setDebouncedManagerQuery] = useState("");
  const controlRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const normalized = managerQuery.trim().toLowerCase();
    if (!normalized) {
      setDebouncedManagerQuery("");
      return;
    }
    const timeout = window.setTimeout(() => setDebouncedManagerQuery(normalized), 300);
    return () => window.clearTimeout(timeout);
  }, [managerQuery]);

  const managersQuery = useQuery({
    queryKey: designerKeys.managers(debouncedManagerQuery),
    queryFn: () => searchManagers(debouncedManagerQuery)
  });

  useEffect(() => {
    const firstField = Object.keys(fieldErrors)[0];
    if (firstField) controlRefs.current[firstField]?.focus();
  }, [fieldErrors]);

  const mutation = useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiClient.post<Project>("/projects", input),
    onError: (createError) => {
      if (createError instanceof ApiError && createError.fields) {
        setFieldErrors(createError.fields);
        setError(Object.values(createError.fields)[0] ?? createError.message);
      } else {
        setError(
          createError instanceof Error
            ? createError.message
            : "The project could not be created."
        );
      }
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: designerKeys.projects() });
      onCreated(project);
      onClose();
    }
  });

  const update = (field: keyof ProjectForm, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const assigned = Array.from(
      new Set(
        form.assignedDesignerIds
          .split(/[\s,]+/)
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );
    if (!assigned.includes(user.id)) assigned.unshift(user.id);
    if (
      !form.name.trim() ||
      !form.clientName.trim() ||
      !form.clientEmail.trim() ||
      !form.clientMobile.trim() ||
      !form.clientAddress.trim() ||
      !selectedManager ||
      !form.location.trim() ||
      !form.plannedStartAt ||
      !form.plannedEndAt
    ) {
      setError("Complete every required project, client, team, and schedule field.");
      return;
    }
    const start = new Date(form.plannedStartAt);
    const end = new Date(form.plannedEndAt);
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
      setError("Enter valid project start and end dates.");
      return;
    }
    if (end < start) {
      setError("Project end must follow its start.");
      return;
    }

    mutation.mutate({
      name: form.name.trim(),
      clientName: form.clientName.trim(),
      clientEmail: form.clientEmail.trim(),
      clientMobile: form.clientMobile.trim(),
      clientAddress: form.clientAddress.trim(),
      managerId: selectedManager.id,
      assignedDesignerIds: assigned,
      location: form.location.trim(),
      plannedStartAt: start.toISOString(),
      plannedEndAt: end.toISOString()
    });
  };

  return (
    <Dialog
      title="Create project"
      description="Set the client, assigned team, location, and delivery window."
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form className="modal-form project-form" onSubmit={submit}>
        {error ? <div className="form-alert" role="alert">{error}</div> : null}
        <FormField
          label="Project name"
          value={form.name}
          onChange={(value) => update("name", value)}
          required
          error={fieldErrors.name}
          inputRef={(element) => { controlRefs.current.name = element; }}
        />
        <FormField
          label="Location"
          value={form.location}
          onChange={(value) => update("location", value)}
          required
          error={fieldErrors.location}
          inputRef={(element) => { controlRefs.current.location = element; }}
        />
        <FormField
          label="Client name"
          value={form.clientName}
          onChange={(value) => update("clientName", value)}
          required
          error={fieldErrors.clientName}
          inputRef={(element) => { controlRefs.current.clientName = element; }}
        />
        <FormField
          label="Client email"
          type="email"
          value={form.clientEmail}
          onChange={(value) => update("clientEmail", value)}
          required
          error={fieldErrors.clientEmail}
          inputRef={(element) => { controlRefs.current.clientEmail = element; }}
        />
        <FormField
          label="Client mobile"
          value={form.clientMobile}
          onChange={(value) => update("clientMobile", value)}
          required
          error={fieldErrors.clientMobile}
          inputRef={(element) => { controlRefs.current.clientMobile = element; }}
        />
        <FormField
          label="Client address"
          value={form.clientAddress}
          onChange={(value) => update("clientAddress", value)}
          required
          error={fieldErrors.clientAddress}
          inputRef={(element) => { controlRefs.current.clientAddress = element; }}
        />
        <div className="field">
          <SearchCombobox
            label="Project manager"
            name="managerId"
            value={selectedManager}
            onChange={setSelectedManager}
            query={managerQuery}
            onQueryChange={setManagerQuery}
            items={managersQuery.data?.items ?? []}
            itemKey={(manager) => manager.id}
            itemLabel={(manager) => manager.name}
            renderItem={(manager) => (
              <span className="manager-option">
                <strong>{manager.name}</strong>
                <small>{manager.email}{manager.mobile ? ` · ${manager.mobile}` : ""}</small>
              </span>
            )}
            loading={managersQuery.isPending}
            error={managersQuery.isError ? "Managers are unavailable." : undefined}
            onRetry={() => void managersQuery.refetch()}
            required
            invalid={Boolean(fieldErrors.managerId)}
            describedBy={
              fieldErrors.managerId ? "project-manager-error" : undefined
            }
            inputRef={(element) => { controlRefs.current.managerId = element; }}
          />
          {fieldErrors.managerId ? (
            <p id="project-manager-error" className="field__error">
              {fieldErrors.managerId}
            </p>
          ) : null}
        </div>
        <FormField
          label="Assigned designer IDs"
          value={form.assignedDesignerIds}
          onChange={(value) => update("assignedDesignerIds", value)}
          placeholder="e.g. user-designer-ananya, user-designer-kabir"
          help={`Comma-separated. Your ID (${user.id}) is always included.`}
          required
          error={fieldErrors.assignedDesignerIds}
          inputRef={(element) => { controlRefs.current.assignedDesignerIds = element; }}
        />
        <FormField
          label="Planned start"
          type="datetime-local"
          value={form.plannedStartAt}
          onChange={(value) => update("plannedStartAt", value)}
          required
          error={fieldErrors.plannedStartAt}
          inputRef={(element) => { controlRefs.current.plannedStartAt = element; }}
        />
        <FormField
          label="Planned end"
          type="datetime-local"
          value={form.plannedEndAt}
          onChange={(value) => update("plannedEndAt", value)}
          required
          error={fieldErrors.plannedEndAt}
          inputRef={(element) => { controlRefs.current.plannedEndAt = element; }}
        />

        <div className="modal-form__actions project-form__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  help,
  required = false,
  error,
  inputRef
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  error?: string;
  inputRef?: (element: HTMLInputElement | null) => void;
}) {
  const id = `project-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        name={label.replace(/\s+([a-z])/g, (_, letter: string) => letter.toUpperCase()).replace(/^./, (letter) => letter.toLowerCase())}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={[help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
        ref={inputRef}
      />
      {help ? <small id={`${id}-help`}>{help}</small> : null}
      {error ? <p id={`${id}-error`} className="field__error">{error}</p> : null}
    </div>
  );
}

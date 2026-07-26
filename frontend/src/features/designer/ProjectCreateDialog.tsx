import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiClient } from "../../api/client";
import type {
  CreateProjectInput,
  Project,
  PublicUser
} from "../../api/types";
import { Dialog } from "../../components/ui/Dialog";
import { designerKeys } from "./designerApi";

interface ProjectForm {
  name: string;
  clientId: string;
  managerId: string;
  assignedDesignerIds: string;
  location: string;
  plannedStartAt: string;
  plannedEndAt: string;
}

const initialForm = (userId: string): ProjectForm => ({
  name: "",
  clientId: "",
  managerId: "",
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

  const mutation = useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiClient.post<Project>("/projects", input),
    onError: (createError) => {
      if (createError instanceof ApiError && createError.fields) {
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
      !form.clientId.trim() ||
      !form.managerId.trim() ||
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
      clientId: form.clientId.trim(),
      managerId: form.managerId.trim(),
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
        />
        <FormField
          label="Location"
          value={form.location}
          onChange={(value) => update("location", value)}
        />
        <FormField
          label="Client ID"
          value={form.clientId}
          onChange={(value) => update("clientId", value)}
          placeholder="e.g. user-client-aurora"
          help="Use an authorized client account ID. Demo: user-client-aurora."
        />
        <FormField
          label="Manager ID"
          value={form.managerId}
          onChange={(value) => update("managerId", value)}
          placeholder="e.g. user-manager-aarav"
          help="The manager must lead the assigned design team. Demo: user-manager-aarav."
        />
        <FormField
          label="Assigned designer IDs"
          value={form.assignedDesignerIds}
          onChange={(value) => update("assignedDesignerIds", value)}
          placeholder="e.g. user-designer-ananya, user-designer-kabir"
          help={`Comma-separated. Your ID (${user.id}) is always included.`}
        />
        <FormField
          label="Planned start"
          type="datetime-local"
          value={form.plannedStartAt}
          onChange={(value) => update("plannedStartAt", value)}
        />
        <FormField
          label="Planned end"
          type="datetime-local"
          value={form.plannedEndAt}
          onChange={(value) => update("plannedEndAt", value)}
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
  help
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  help?: string;
}) {
  const id = `project-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={help ? `${id}-help` : undefined}
      />
      {help ? <small id={`${id}-help`}>{help}</small> : null}
    </div>
  );
}

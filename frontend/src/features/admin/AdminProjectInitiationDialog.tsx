import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";

import { ApiError } from "../../api/client";
import type {
  EstimatorOption,
  InitiateAdminProjectInput,
  InitiatedAdminProjectSummary
} from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { SearchCombobox } from "../../components/ui/SearchCombobox";
import {
  adminProjectKeys,
  getEstimatorOptions,
  getSalesManagerOptions,
  initiateAdminProject
} from "./adminProjectsApi";
import { leadKeys } from "../leads/leadsApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";

interface ProjectInitiationForm {
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  projectName: string;
  location: string;
  propertyType: string;
  budgetMin: string;
  budgetMax: string;
  nextAction: string;
  nextActionAt: string;
}

const emptyForm: ProjectInitiationForm = {
  clientName: "",
  clientEmail: "",
  clientMobile: "",
  projectName: "",
  location: "",
  propertyType: "",
  budgetMin: "",
  budgetMax: "",
  nextAction: "",
  nextActionAt: ""
};

const fields = [
  ["clientName", "Client name", "text", "Enter client name"],
  ["clientEmail", "Client email", "email", "example@email.com"],
  ["clientMobile", "Mobile", "text", "Enter mobile number"],
  ["projectName", "Project / property name", "text", "Enter project / property name"],
  ["location", "Location", "text", "Enter location"],
  ["propertyType", "Property type", "text", "Enter property type"],
  ["budgetMin", "Minimum budget", "number", "Enter minimum budget"],
  ["budgetMax", "Maximum budget", "number", "Enter maximum budget"],
  ["nextAction", "Next action", "text", "Enter next action"],
  ["nextActionAt", "Next action date", "datetime-local", undefined]
] as const satisfies ReadonlyArray<readonly [keyof ProjectInitiationForm, string, string, string | undefined]>;

function validate(
  form: ProjectInitiationForm,
  selectedAssignee: EstimatorOption | null,
  assignmentField: "estimatorId" | "salesManagerId",
  assignmentLabel: string
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, label] of fields) {
    if (!form[key].trim()) errors[key] = `${label} is required.`;
  }
  const minimum = Number(form.budgetMin);
  const maximum = Number(form.budgetMax);
  if (form.budgetMin.trim() && (!Number.isFinite(minimum) || minimum < 0)) {
    errors.budgetMin = "Minimum budget must be a non-negative number.";
  }
  if (form.budgetMax.trim() && (!Number.isFinite(maximum) || maximum < 0)) {
    errors.budgetMax = "Maximum budget must be a non-negative number.";
  } else if (
    Number.isFinite(minimum) &&
    minimum >= 0 &&
    Number.isFinite(maximum) &&
    maximum < minimum
  ) {
    errors.budgetMax = "Maximum budget must be at least the minimum budget.";
  }
  if (form.nextActionAt.trim() && Number.isNaN(new Date(form.nextActionAt).getTime())) {
    errors.nextActionAt = "Next action date must be valid.";
  }
  if (!selectedAssignee) {
    errors[assignmentField] = `Select an active ${assignmentLabel} user.`;
  }
  return errors;
}

export function AdminProjectInitiationDialog({
  onClose,
  onCreated,
  assignmentMode = "estimator"
}: {
  onClose: () => void;
  onCreated: (project: InitiatedAdminProjectSummary) => void;
  assignmentMode?: "estimator" | "sales-manager";
}) {
  const selectsSalesManager = assignmentMode === "sales-manager";
  const assignmentField = selectsSalesManager ? "salesManagerId" : "estimatorId";
  const assignmentLabel = selectsSalesManager ? "Sales Manager" : "Sales";
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [form, setForm] = useState<ProjectInitiationForm>(emptyForm);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [debouncedAssigneeSearch, setDebouncedAssigneeSearch] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState<EstimatorOption | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const submissionStarted = useRef(false);

  useEffect(() => {
    const normalized = assigneeSearch.trim();
    const timer = window.setTimeout(
      () => setDebouncedAssigneeSearch(normalized),
      normalized ? 300 : 0
    );
    return () => window.clearTimeout(timer);
  }, [assigneeSearch]);

  const assigneePagination = { limit: 20, offset: 0 } as const;
  const assigneesQuery = useQuery({
    queryKey: (selectsSalesManager ? adminProjectKeys.salesManagers : adminProjectKeys.estimators)(
      debouncedAssigneeSearch,
      assigneePagination
    ),
    queryFn: () =>
      (selectsSalesManager ? getSalesManagerOptions : getEstimatorOptions)(debouncedAssigneeSearch, assigneePagination)
  });

  const focusFirst = (errors: Record<string, string>) => {
    const firstKey = Object.keys(errors).find((key) => refs.current[key]);
    if (firstKey) window.setTimeout(() => refs.current[firstKey]?.focus(), 0);
  };

  const mutation = useMutation({
    mutationFn: initiateAdminProject,
    onSuccess: async (project) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminProjectKeys.all }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
        queryClient.invalidateQueries({ queryKey: leadKeys.all })
      ]);
      feedback.success({
        title: "Project initiated",
        message: selectsSalesManager
          ? "Your lead is ready with the selected Sales Manager."
          : "The Sales handoff is ready."
      });
      onClose();
      onCreated(project);
    },
    onError: (cause) => {
      submissionStarted.current = false;
      const errors = cause instanceof ApiError && cause.fields ? cause.fields : {};
      setFieldErrors(errors);
      setSubmissionError(
        cause instanceof ApiError ? cause.message : "The project could not be initiated."
      );
      focusFirst(errors);
    }
  });

  const update = (key: keyof ProjectInitiationForm) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
      setFieldErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionStarted.current || mutation.isPending) return;
    setSubmissionError(null);
    const errors = validate(form, selectedAssignee, assignmentField, assignmentLabel);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirst(errors);
      return;
    }
    if (!selectedAssignee) return;

    const input: InitiateAdminProjectInput = {
      clientName: form.clientName.trim(),
      clientEmail: form.clientEmail.trim(),
      clientMobile: form.clientMobile.trim(),
      projectName: form.projectName.trim(),
      location: form.location.trim(),
      propertyType: form.propertyType.trim(),
      budgetMin: Number(form.budgetMin),
      budgetMax: Number(form.budgetMax),
      nextAction: form.nextAction.trim(),
      nextActionAt: new Date(form.nextActionAt).toISOString(),
      ...(selectsSalesManager
        ? { salesManagerId: selectedAssignee.id }
        : { estimatorId: selectedAssignee.id })
    };
    submissionStarted.current = true;
    mutation.mutate(input);
  };

  const assigneeErrorId = `admin-project-${assignmentField}-error`;
  const assigneeLookupError = assigneesQuery.error instanceof ApiError
    ? assigneesQuery.error.message
    : assigneesQuery.isError
      ? `We couldn't load ${assignmentLabel} options.`
      : undefined;
  const submitDisabled =
    mutation.isPending ||
    assigneesQuery.isPending ||
    assigneesQuery.isFetching ||
    assigneesQuery.isError ||
    !selectedAssignee;

  return (
    <Dialog
      eyebrow="Project administration"
      title="Initiate project"
      description={selectsSalesManager
        ? "Create your project and select the Sales Manager who will oversee it. The six-stage design workflow is included."
        : "Create the project now and hand its lead to Sales. The six-stage design workflow is included."}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form className="modal-form admin-project-form" onSubmit={submit} noValidate>
        {submissionError ? <div className="form-alert admin-project-form__alert" role="alert">{submissionError}</div> : null}
        {fields.map(([key, label, type, placeholder]) => (
          <Field
            key={key}
            id={`admin-project-${key}`}
            label={label}
            required
            error={fieldErrors[key]}
          >
            {(controlProps) => (
              <div className="admin-project-form__control">
                <Input
                  {...controlProps}
                  ref={(node) => { refs.current[key] = node; }}
                  name={key}
                  type={type}
                  placeholder={placeholder}
                  min={key === "budgetMin" || key === "budgetMax" ? 0 : undefined}
                  step={key === "budgetMin" || key === "budgetMax" ? "any" : undefined}
                  value={form[key]}
                  onChange={update(key)}
                />
                <span className="admin-project-form__control-icon" data-field={key} aria-hidden="true" />
              </div>
            )}
          </Field>
        ))}
        <div className="admin-project-form__estimator">
          <SearchCombobox
            label={assignmentLabel}
            name={assignmentField}
            placeholder={selectsSalesManager ? "Search and select Sales Manager" : "Search and select Sales"}
            value={selectedAssignee}
            onChange={(option) => {
              setSelectedAssignee(option);
              if (option) {
                setFieldErrors((current) => {
                  if (!current[assignmentField]) return current;
                  const next = { ...current };
                  delete next[assignmentField];
                  return next;
                });
              }
            }}
            query={assigneeSearch}
            onQueryChange={setAssigneeSearch}
            items={assigneesQuery.data?.items ?? []}
            itemKey={(option) => option.id}
            itemLabel={(option) => option.name}
            renderItem={(option) => (
              <span className="admin-project-form__estimator-option">
                <strong>{option.name}</strong>
                <span>{option.email}{option.title ? ` · ${option.title}` : ""}</span>
              </span>
            )}
            loading={assigneesQuery.isPending || assigneesQuery.isFetching}
            error={assigneeLookupError}
            onRetry={() => void assigneesQuery.refetch()}
            required
            invalid={Boolean(fieldErrors[assignmentField])}
            describedBy={fieldErrors[assignmentField] ? assigneeErrorId : undefined}
            inputRef={(node) => { refs.current[assignmentField] = node; }}
          />
          {fieldErrors[assignmentField] ? (
            <p className="ui-field__error" id={assigneeErrorId}>{fieldErrors[assignmentField]}</p>
          ) : !selectedAssignee ? (
            <p className="ui-field__hint">Pick an option from the list — Initiate project stays disabled until {selectsSalesManager ? "a Sales Manager" : "a Sales user"} is selected.</p>
          ) : null}
        </div>
        <div className="modal-form__actions admin-project-form__actions">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" busy={mutation.isPending} busyLabel="Initiating…" disabled={submitDisabled}>Initiate project</Button>
        </div>
      </form>
    </Dialog>
  );
}

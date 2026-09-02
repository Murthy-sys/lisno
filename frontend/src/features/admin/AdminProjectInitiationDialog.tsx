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
  AdminProjectSummary,
  EstimatorOption,
  InitiateAdminProjectInput
} from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { SearchCombobox } from "../../components/ui/SearchCombobox";
import {
  adminProjectKeys,
  getEstimatorOptions,
  initiateAdminProject
} from "./adminProjectsApi";
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
  selectedEstimator: EstimatorOption | null
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
  if (!selectedEstimator) {
    errors.estimatorId = "Select an active Estimator/Sales user.";
  }
  return errors;
}

export function AdminProjectInitiationDialog({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (project: AdminProjectSummary) => void;
}) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [form, setForm] = useState<ProjectInitiationForm>(emptyForm);
  const [estimatorQuery, setEstimatorQuery] = useState("");
  const [debouncedEstimatorQuery, setDebouncedEstimatorQuery] = useState("");
  const [selectedEstimator, setSelectedEstimator] = useState<EstimatorOption | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const submissionStarted = useRef(false);

  useEffect(() => {
    const normalized = estimatorQuery.trim();
    const timer = window.setTimeout(
      () => setDebouncedEstimatorQuery(normalized),
      normalized ? 300 : 0
    );
    return () => window.clearTimeout(timer);
  }, [estimatorQuery]);

  const estimatorPagination = { limit: 20, offset: 0 } as const;
  const estimatorsQuery = useQuery({
    queryKey: adminProjectKeys.estimators(
      debouncedEstimatorQuery,
      estimatorPagination
    ),
    queryFn: () =>
      getEstimatorOptions(debouncedEstimatorQuery, estimatorPagination)
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
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
      feedback.success({
        title: "Project initiated",
        message: "The Estimator/Sales handoff is ready."
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
    const errors = validate(form, selectedEstimator);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirst(errors);
      return;
    }
    if (!selectedEstimator) return;

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
      estimatorId: selectedEstimator.id
    };
    submissionStarted.current = true;
    mutation.mutate(input);
  };

  const estimatorErrorId = "admin-project-estimator-error";
  const estimatorLookupError = estimatorsQuery.error instanceof ApiError
    ? estimatorsQuery.error.message
    : estimatorsQuery.isError
      ? "We couldn't load Estimator/Sales options."
      : undefined;
  const submitDisabled =
    mutation.isPending ||
    estimatorsQuery.isPending ||
    estimatorsQuery.isFetching ||
    estimatorsQuery.isError ||
    !selectedEstimator;

  return (
    <Dialog
      eyebrow="Project administration"
      title="Initiate project"
      description="Create the project now and hand its lead to Estimator/Sales."
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
            )}
          </Field>
        ))}
        <div className="admin-project-form__estimator">
          <SearchCombobox
            label="Estimator/Sales"
            name="estimatorId"
            placeholder="Search and select estimator / sales"
            value={selectedEstimator}
            onChange={(option) => {
              setSelectedEstimator(option);
              if (option) {
                setFieldErrors((current) => {
                  if (!current.estimatorId) return current;
                  const next = { ...current };
                  delete next.estimatorId;
                  return next;
                });
              }
            }}
            query={estimatorQuery}
            onQueryChange={setEstimatorQuery}
            items={estimatorsQuery.data?.items ?? []}
            itemKey={(option) => option.id}
            itemLabel={(option) => option.name}
            renderItem={(option) => (
              <span className="admin-project-form__estimator-option">
                <strong>{option.name}</strong>
                <span>{option.email}{option.title ? ` · ${option.title}` : ""}</span>
              </span>
            )}
            loading={estimatorsQuery.isPending || estimatorsQuery.isFetching}
            error={estimatorLookupError}
            onRetry={() => void estimatorsQuery.refetch()}
            required
            invalid={Boolean(fieldErrors.estimatorId)}
            describedBy={fieldErrors.estimatorId ? estimatorErrorId : undefined}
            inputRef={(node) => { refs.current.estimatorId = node; }}
          />
          {fieldErrors.estimatorId ? (
            <p className="ui-field__error" id={estimatorErrorId}>{fieldErrors.estimatorId}</p>
          ) : !selectedEstimator ? (
            <p className="ui-field__hint">Pick an option from the list — Initiate project stays disabled until an Estimator/Sales is selected.</p>
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

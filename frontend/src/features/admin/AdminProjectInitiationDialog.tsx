import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";

import {
  DEFAULT_PROJECT_NEXT_ACTION,
  NATIVE_PLACE_MAX_LENGTH,
  TENTATIVE_BUDGET_MAX_LENGTH,
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_LANGUAGE_OPTIONS,
  isProjectCalendarDate,
  type ProjectCategory,
  type ProjectLanguage
} from "../../../../shared/projects/projectInitiation";
import { ProjectLanguageMultiSelect } from "./ProjectLanguageMultiSelect";
import { ApiError } from "../../api/client";
import { projectClientInvitationKeys } from "../../auth/projectClientInvitationsApi";
import type {
  EstimatorOption,
  InitiatedAdminProjectSummary
} from "../../api/types";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Select } from "../../components/ui/Field";
import { SearchCombobox } from "../../components/ui/SearchCombobox";
import {
  adminProjectKeys,
  getEstimatorOptions,
  initiateAdminProject,
  type ProjectInitiationInput
} from "./adminProjectsApi";
import { leadKeys } from "../leads/leadsApi";
import { dashboardKeys } from "./dashboard/superAdminDashboardApi";
import { propertyTypes } from "../leads/propertyTypes";
import { NextActionDateTime } from "./NextActionDateTime";
import { projectInitiationDefaultsQuery } from "./projectInitiationDefaultsApi";
import { ProjectInitiationDefaultsPanel } from "./ProjectInitiationDefaultsPanel";

interface ProjectInitiationForm {
  clientName: string;
  clientEmail: string;
  clientMobile: string;
  nativePlace: string;
  languagesKnown: ProjectLanguage[];
  preferredLanguage: ProjectLanguage | "";
  tentativeBudget: string;
  closureTentativeDate: string;
  category: ProjectCategory | "";
  projectName: string;
  cityName: string;
  propertyType: string;
  source: string;
  otherSource: string;
  nextAction: string;
  nextActionAt: string;
}

const emptyForm: ProjectInitiationForm = {
  clientName: "",
  clientEmail: "",
  clientMobile: "",
  nativePlace: "",
  languagesKnown: [],
  preferredLanguage: "",
  tentativeBudget: "",
  closureTentativeDate: "",
  category: "",
  projectName: "",
  cityName: "",
  propertyType: "",
  source: "",
  otherSource: "",
  nextAction: DEFAULT_PROJECT_NEXT_ACTION,
  nextActionAt: ""
};

const sourceOptions = [
  "Instagram", "Facebook", "YouTube", "Google Search", "Google Maps", "Website",
  "Existing customer", "Customer referral", "Architect / designer referral",
  "Builder / broker referral", "Walk-in", "Exhibition / event", "Other"
] as const;

function resolvedSource(form: ProjectInitiationForm) {
  return (form.source === "Other" ? form.otherSource : form.source).trim();
}

const fields = [
  ["clientName", "Client name", "text", "Enter client name"],
  ["clientEmail", "Client email", "email", "example@email.com"],
  ["clientMobile", "Mobile", "text", "Enter mobile number"],
  ["nativePlace", "Native", "text", "Enter hometown / native place"],
  ["languagesKnown", "Languages Known", "select", undefined],
  ["preferredLanguage", "Most Preferred Language", "select", undefined],
  ["projectName", "Project / property name", "text", "Enter project / property name"],
  ["cityName", "Project city", "text", "Enter city for vendor matching"],
  ["propertyType", "Property type", "text", "Enter property type"],
  ["category", "Category", "select", undefined],
  ["tentativeBudget", "Tentative Budget", "text", "e.g. ₹15–20 lakh"],
  ["closureTentativeDate", "Closure Tentative Date", "date", undefined],
  ["source", "Source", "text", undefined],
  ["nextAction", "Next action", "text", undefined],
  ["nextActionAt", "Next action date", "date", undefined]
] as const satisfies ReadonlyArray<readonly [keyof ProjectInitiationForm, string, string, string | undefined]>;

const requiredFields = new Set<keyof ProjectInitiationForm>([
  "clientName", "clientEmail", "clientMobile", "projectName", "propertyType", "nextActionAt"
]);

type TextFormKey = Exclude<keyof ProjectInitiationForm, "languagesKnown">;

function validate(
  form: ProjectInitiationForm,
  selectedAssignee: EstimatorOption | null,
  assignmentField: "estimatorId" | "salesManagerId",
  assignmentLabel: string,
  requiresAssignee: boolean
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, label] of fields) {
    if (!requiredFields.has(key) || key === "languagesKnown") continue;
    if (!form[key].trim()) errors[key] = `${label} is required.`;
  }
  const source = resolvedSource(form);
  if (form.source === "Other" && !source) errors.source = "Other source is required.";
  if (source.length > 200) errors.source = "Source must be 200 characters or fewer.";
  if (form.nativePlace.trim().length > NATIVE_PLACE_MAX_LENGTH) errors.nativePlace = `Native must be ${NATIVE_PLACE_MAX_LENGTH} characters or fewer.`;
  if (form.tentativeBudget.trim().length > TENTATIVE_BUDGET_MAX_LENGTH) errors.tentativeBudget = `Tentative Budget must be ${TENTATIVE_BUDGET_MAX_LENGTH} characters or fewer.`;
  if (form.nextActionAt && !isProjectCalendarDate(form.nextActionAt)) errors.nextActionAt = "Next action date must be valid.";
  if (form.closureTentativeDate && !isProjectCalendarDate(form.closureTentativeDate)) errors.closureTentativeDate = "Closure Tentative Date must be valid.";
  if (requiresAssignee && !selectedAssignee) {
    errors[assignmentField] = `Select an active ${assignmentLabel} user.`;
  }
  return errors;
}

export function AdminProjectInitiationDialog({
  onClose,
  onCreated,
  actorId,
  canManageDefaults = false,
  assignmentMode = "estimator"
}: {
  onClose: () => void;
  actorId: string;
  canManageDefaults?: boolean;
  onCreated: (project: InitiatedAdminProjectSummary) => void;
  assignmentMode?: "estimator" | "sales-manager";
}) {
  const salesInitiated = assignmentMode === "sales-manager";
  const assignmentField = "estimatorId";
  const assignmentLabel = "Sales";
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [form, setForm] = useState<ProjectInitiationForm>(emptyForm);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [debouncedAssigneeSearch, setDebouncedAssigneeSearch] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState<EstimatorOption | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null>>({});
  const submissionStarted = useRef(false);
  const initiationKey = useRef<string | null>(null);
  const attemptedManagerName = useRef("");
  const [retryInput, setRetryInput] = useState<ProjectInitiationInput | null>(null);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [returnToDefaults, setReturnToDefaults] = useState(false);
  const defaultsAction = useRef<HTMLButtonElement>(null);
  const defaultsQuery = useQuery(projectInitiationDefaultsQuery(actorId));
  const defaultReady = defaultsQuery.isSuccess && !defaultsQuery.isFetching && !defaultsQuery.isError && defaultsQuery.data.status === "ready";
  const controlsLocked = Boolean(retryInput);
  const closeDefaults = () => {
    setReturnToDefaults(true);
    setDefaultsOpen(false);
  };

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
    queryKey: adminProjectKeys.estimators(debouncedAssigneeSearch, assigneePagination),
    queryFn: () => getEstimatorOptions(debouncedAssigneeSearch, assigneePagination),
    enabled: !salesInitiated
  });

  const focusFirst = (errors: Record<string, string>) => {
    // Mutation errors arrive before pending controls have been enabled again.
    window.setTimeout(() => {
      const firstKey = Object.keys(errors)
        .map((key) => key === "source" && form.source === "Other" ? "otherSource" : key)
        .find((key) => refs.current[key] && !refs.current[key]?.disabled);
      if (firstKey) refs.current[firstKey]?.focus();
    }, 0);
  };

  const mutation = useMutation({
    mutationFn: initiateAdminProject,
    onSuccess: async (project) => {
      if (project.clientInvitation) {
        queryClient.setQueryData(projectClientInvitationKeys.detail(project.id), project.clientInvitation);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminProjectKeys.all }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
        queryClient.invalidateQueries({ queryKey: leadKeys.all })
      ]);
      feedback.success({
        title: "Project initiated",
        message: project.clientInvitation?.status === "linked"
          ? "Your project is ready. The existing client already has access; no invitation is needed."
          : project.clientInvitation && ["not_issued", "delivery_failed"].includes(project.clientInvitation.status)
          ? "Your project is ready. Check the client invitation status to send or retry the invitation."
          : salesInitiated
          ? "Your lead is ready with the default Project Manager."
          : "The Sales handoff is ready."
      });
      onClose();
      onCreated(project);
    },
    onError: (cause, attemptedInput) => {
      const uncertain = !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500;
      setRetryInput(uncertain ? attemptedInput : null);
      if (!uncertain) initiationKey.current = null;
      if (cause instanceof ApiError && cause.code.startsWith("PROJECT_INITIATION_DEFAULT_")) void defaultsQuery.refetch();
      submissionStarted.current = false;
      const errors = cause instanceof ApiError && cause.fields ? cause.fields : {};
      setFieldErrors(errors);
      setSubmissionError(
        cause instanceof ApiError ? cause.message : "The project could not be initiated."
      );
      focusFirst(errors);
    }
  });

  const updateValue = <K extends keyof ProjectInitiationForm>(key: K, value: ProjectInitiationForm[K]) => {
    const errorKey = key === "otherSource" ? "source" : key;
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[errorKey]) return current;
      const next = { ...current };
      delete next[errorKey];
      return next;
    });
  };

  const update = (key: TextFormKey) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => updateValue(key, event.target.value as ProjectInitiationForm[typeof key]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionStarted.current || mutation.isPending) return;
    if (retryInput) {
      submissionStarted.current = true;
      setSubmissionError(null);
      mutation.mutate(retryInput);
      return;
    }
    if (!defaultReady || (!salesInitiated && (assigneesQuery.isPending || assigneesQuery.isFetching || assigneesQuery.isError))) return;
    setSubmissionError(null);
    const errors = validate(form, selectedAssignee, assignmentField, assignmentLabel, !salesInitiated);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirst(errors);
      return;
    }
    if (!salesInitiated && !selectedAssignee || defaultsQuery.data?.status !== "ready") return;

    const source = resolvedSource(form);
    initiationKey.current ??= crypto.randomUUID();
    const input: ProjectInitiationInput = {
      initiationKey: initiationKey.current,
      projectManagerDefaultVersion: defaultsQuery.data.version,
      clientName: form.clientName.trim(),
      clientEmail: form.clientEmail.trim(),
      clientMobile: form.clientMobile.trim(),
      projectName: form.projectName.trim(),
      ...(form.cityName.trim() ? { cityName: form.cityName.trim() } : {}),
      propertyType: form.propertyType.trim(),
      ...(source ? { source } : {}),
      nativePlace: form.nativePlace.trim() || null,
      tentativeBudget: form.tentativeBudget.trim() || null,
      closureTentativeDate: form.closureTentativeDate || null,
      category: form.category || null,
      languagesKnown: form.languagesKnown,
      preferredLanguage: form.preferredLanguage || null,
      nextAction: DEFAULT_PROJECT_NEXT_ACTION,
      // The initiation form collects a local calendar date; the API stores a timestamp.
      nextActionAt: new Date(`${form.nextActionAt}T00:00:00`).toISOString(),
      ...(salesInitiated ? {} : { estimatorId: selectedAssignee!.id })
    };
    attemptedManagerName.current = defaultsQuery.data.projectManager.name;
    submissionStarted.current = true;
    mutation.mutate(input);
  };

  const assigneeErrorId = `admin-project-${assignmentField}-error`;
  const assigneeLookupError = assigneesQuery.error instanceof ApiError
    ? assigneesQuery.error.message
    : assigneesQuery.isError
      ? `We couldn't load ${assignmentLabel} options.`
      : undefined;
  const submitDisabled = mutation.isPending || !retryInput && (!defaultReady ||
    !salesInitiated && (assigneesQuery.isPending || assigneesQuery.isFetching || assigneesQuery.isError || !selectedAssignee));
  const defaultMessage = retryInput ? "This is the Project Manager used by the previous request."
    : defaultsQuery.isError
    ? "We couldn't load the default Project Manager."
    : defaultsQuery.isPending || defaultsQuery.isFetching ? "Loading the default Project Manager…"
    : defaultsQuery.data?.status === "unconfigured" ? "Ask Super Admin to configure the default Project Manager before creating a project."
    : defaultsQuery.data?.status === "unavailable" ? "The default Project Manager is unavailable. Ask Super Admin to update Project defaults."
    : "Assigned automatically from project defaults.";

  return (
    <>
    <ContextPanel
      open={!defaultsOpen}
      initialFocusRef={returnToDefaults ? defaultsAction : undefined}
      eyebrow="Project administration"
      title="Initiate project"
      description={salesInitiated
        ? "Create your project with the default Project Manager. The six-stage design workflow is included."
        : "Create the project now and hand its lead to Sales. The six-stage design workflow is included."}
      onClose={onClose}
      busy={mutation.isPending}
      width="wide"
      dirty={Object.entries(form).some(([key, value]) => Array.isArray(value) ? value.length > 0 : value !== emptyForm[key as keyof ProjectInitiationForm]) || selectedAssignee !== null || assigneeSearch.length > 0}
      className="administration-context-panel"
      footer={({ requestClose }) => (
        <div className="modal-form__actions admin-project-form__actions">
          <Button variant="destructive-outline" onClick={requestClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" form="admin-project-initiation-form" busy={mutation.isPending} busyLabel="Initiating…" disabled={submitDisabled}>{retryInput ? "Retry initiation" : "Initiate project"}</Button>
        </div>
      )}
    >
      <form id="admin-project-initiation-form" className="modal-form admin-project-form" onSubmit={submit} noValidate>
        {submissionError ? <div className="form-alert admin-project-form__alert" role="alert">{submissionError}</div> : null}
        {retryInput ? <p className="ui-field__hint admin-project-form__wide" role="status">The previous request may have completed. Retry initiation to recover its result before changing this form.</p> : null}
        {fields.map(([key, label, type, placeholder]) => (
          <Fragment key={key}>
            <Field
              className={key === "clientName" || key === "nativePlace" || key === "projectName" || key === "closureTentativeDate" || key === "source" || key === "nextAction" || key === "nextActionAt" ? "admin-project-form__wide" : undefined}
              id={`admin-project-${key}`}
              label={label}
              required={requiredFields.has(key)}
              hint={key === "source" ? "How did the client hear about Lisno?" : undefined}
              error={key === "source" && form.source === "Other" ? undefined : fieldErrors[key]}
            >
              {(controlProps) => (
                <div className="admin-project-form__control">
                  {key === "languagesKnown" ? <ProjectLanguageMultiSelect {...controlProps}
                    value={form.languagesKnown} onChange={(value) => updateValue(key, value)}
                    inputRef={(node) => { refs.current[key] = node; }} disabled={mutation.isPending || controlsLocked}
                  /> : key === "preferredLanguage" ? <Select {...controlProps}
                    ref={(node) => { refs.current[key] = node; }} name={key}
                    value={form.preferredLanguage} onChange={update(key)} disabled={mutation.isPending || controlsLocked}>
                    <option value="">Select preferred language</option>
                    {PROJECT_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select> : key === "category" ? <Select {...controlProps}
                    ref={(node) => { refs.current[key] = node; }} name={key}
                    value={form.category} onChange={update(key)} disabled={mutation.isPending || controlsLocked}>
                    <option value="">Select category</option>
                    {PROJECT_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select> : key === "propertyType" ? <Select {...controlProps}
                    ref={(node) => { refs.current[key] = node; }} name={key}
                    value={form.propertyType} onChange={update(key)} disabled={mutation.isPending || controlsLocked}>
                    <option value="">Select property type</option>
                    {propertyTypes.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select> : key === "source" ? <Select {...controlProps}
                    ref={(node) => { refs.current[key] = node; }} name={key}
                    value={form.source} onChange={update(key)} disabled={mutation.isPending || controlsLocked}>
                    <option value="">Select source</option>
                    {sourceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select> : key === "nextActionAt" || key === "closureTentativeDate" ? <NextActionDateTime {...controlProps}
                    calendarLabel={key === "closureTentativeDate" ? "Choose closure tentative date" : undefined}
                    clearable={key === "closureTentativeDate"}
                    value={form[key]} onChange={(value) => updateValue(key, value)}
                    inputRef={(node) => { refs.current[key] = node; }} disabled={mutation.isPending || controlsLocked}
                  /> : <Input
                    {...controlProps}
                    ref={(node) => { refs.current[key] = node; }}
                    name={key}
                    type={type}
                    placeholder={placeholder}
                    disabled={mutation.isPending || controlsLocked || key === "nextAction"}
                    maxLength={key === "nativePlace" ? NATIVE_PLACE_MAX_LENGTH : key === "tentativeBudget" ? TENTATIVE_BUDGET_MAX_LENGTH : undefined}
                    value={form[key]}
                    onChange={key === "nextAction" ? undefined : update(key)}
                  />}
                </div>
              )}
            </Field>
            {key === "source" && form.source === "Other" ? (
              <Field className="admin-project-form__wide" id="admin-project-otherSource"
                label="Other source" required error={fieldErrors.source}>
                {(controlProps) => (
                  <Input {...controlProps} ref={(node) => { refs.current.otherSource = node; }}
                    name="otherSource" value={form.otherSource} onChange={update("otherSource")}
                    placeholder="Enter source" maxLength={200} disabled={mutation.isPending || controlsLocked} />
                )}
              </Field>
            ) : null}
          </Fragment>
        ))}
        <Field className="admin-project-form__wide" id="admin-project-projectManager" label="Project Manager"
          hint={<span role={defaultsQuery.isError ? "alert" : defaultsQuery.isPending || defaultsQuery.isFetching ? "status" : undefined}>{defaultMessage}</span>}>
          {(controlProps) => <Input {...controlProps} disabled value={retryInput ? attemptedManagerName.current : defaultsQuery.isError ? "" : defaultsQuery.data?.status === "ready" ? defaultsQuery.data.projectManager.name : ""} placeholder="Project Manager unavailable" />}
        </Field>
        {defaultsQuery.isError ? <div className="admin-project-form__wide"><Button variant="secondary" onClick={() => void defaultsQuery.refetch()}>Retry Project Manager</Button></div> : null}
        {canManageDefaults ? <div className="admin-project-form__wide"><Button ref={defaultsAction} variant="secondary" disabled={mutation.isPending || controlsLocked} onClick={() => setDefaultsOpen(true)}>Project defaults</Button></div> : null}
        {!salesInitiated ? <fieldset className="admin-project-form__estimator" disabled={mutation.isPending || controlsLocked}>
          <SearchCombobox
            label={assignmentLabel}
            name={assignmentField}
            placeholder="Search and select Sales"
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
            <p className="ui-field__hint">Pick an option from the list. Initiate project stays disabled until a Sales user is selected.</p>
          ) : null}
        </fieldset> : null}
      </form>
    </ContextPanel>
    {defaultsOpen ? <ProjectInitiationDefaultsPanel actorId={actorId} onClose={closeDefaults} /> : null}
    </>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CircleDollarSign,
  Landmark,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  UsersRound,
  WalletCards
} from "lucide-react";
import { useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

import { ApiError } from "../../api/client";
import type { ProjectFinanceBucket } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import {
  getProjectFinanceBucket,
  getProjectFinanceEntries,
  postProjectFinanceEntry,
  projectFinanceKeys
} from "./projectFinanceApi";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});
const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC"
});

export function ProjectFinancePanel({
  projectId,
  enabled = true,
  title = "Finance bucket"
}: {
  projectId: string;
  enabled?: boolean;
  title?: string;
}) {
  const auth = useAuth();
  const canCreate = hasFrontendPermission(auth.authorization, "finance.entry.create");
  const bucket = useQuery({
    queryKey: projectFinanceKeys.bucket(projectId),
    queryFn: () => getProjectFinanceBucket(projectId),
    enabled
  });
  const entries = useQuery({
    queryKey: projectFinanceKeys.entries(projectId),
    queryFn: () => getProjectFinanceEntries(projectId),
    enabled
  });

  return (
    <Surface
      as="section"
      className="project-finance-panel"
      aria-labelledby={`project-finance-${projectId}`}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Project financial details</p>
          <h2 id={`project-finance-${projectId}`}>{bucket.data ? `${bucket.data.projectName} finance` : title}</h2>
        </div>
        {bucket.data ? (
          <StatusBadge
            tone={bucket.data.overBudget ? "danger" : bucket.data.status === "open" ? "success" : "info"}
            label={bucket.data.overBudget ? "Over cost budget" : bucket.data.status.replaceAll("_", " ")}
          />
        ) : null}
      </div>

      {!enabled ? (
        <p>The finance bucket opens when the design plan is approved.</p>
      ) : bucket.isPending || entries.isPending ? (
        <PageState state="loading" message="Loading project finance…" />
      ) : bucket.isError || entries.isError ? (
        <PageState
          state="error"
          message={financeError(bucket.error ?? entries.error)}
          action={{
            label: "Try again",
            onAction: () => void Promise.all([bucket.refetch(), entries.refetch()])
          }}
        />
      ) : bucket.data ? (
        <>
          <ProjectFinanceHero bucket={bucket.data} />
          <FinanceKpis bucket={bucket.data} />
          <div className="project-finance-panel__details">
            <dl>
              <div><dt>Client-approved value (incl. GST)</dt><dd>{formatPaise(bucket.data.approvedContractTotalPaise)}</dd></div>
              <div><dt>GST included (18%)</dt><dd>{formatPaise(bucket.data.approvedGstPaise)}</dd></div>
              <div><dt>Net approved revenue (excl. GST)</dt><dd>{formatPaise(bucket.data.approvedSubtotalPaise)}</dd></div>
              <div><dt>Profit margin policy</dt><dd>{formatBps(bucket.data.targetMarginBps)}</dd></div>
              <div><dt>Cost budget consumed</dt><dd>{formatPercentage(bucket.data.recordedCostPaise, bucket.data.costBudgetPaise)}</dd></div>
              <div><dt>Design plan baseline</dt><dd>Version {bucket.data.designPlanVersion}</dd></div>
              <div><dt>Project deadline</dt><dd>{date.format(new Date(bucket.data.deadlineAt))}</dd></div>
              <div><dt>Schedule position</dt><dd>{deadlineLabel(bucket.data)}</dd></div>
            </dl>
          </div>
          {canCreate && bucket.data.status === "open" ? (
            <FinanceEntryForm key={projectId} projectId={projectId} />
          ) : null}
          <FinanceEntries entries={entries.data?.items ?? []} />
        </>
      ) : null}
    </Surface>
  );
}

export function FinanceKpis({
  bucket
}: {
  bucket: {
    approvedContractTotalPaise: number;
    approvedGstPaise: number;
    approvedSubtotalPaise: number;
    targetProfitPaise: number;
    costBudgetPaise: number;
    procurementCostPaise: number;
    employeePaymentPaise: number;
    otherExpensePaise: number;
    directSpendPaise: number;
    overheadPaise: number;
    recordedCostPaise: number;
    remainingBudgetPaise: number;
  };
}) {
  const cards: FinanceKpiCard[] = [
    { label: "Client-approved value (incl. GST)", value: bucket.approvedContractTotalPaise, icon: <Landmark />, note: "Approved estimate total payable by the client" },
    { label: "GST included (18%)", value: bucket.approvedGstPaise, icon: <ReceiptText />, note: "Tax excluded before revenue is budgeted" },
    { label: "Net approved revenue (excl. GST)", value: bucket.approvedSubtotalPaise, icon: <CircleDollarSign />, note: "Client-approved value less GST" },
    { label: "Reserved profit target (20%)", value: bucket.targetProfitPaise, icon: <TrendingUp />, note: "Fixed at 20% of net approved revenue", tone: "violet" },
    { label: "Project cost budget (80%)", value: bucket.costBudgetPaise, icon: <WalletCards />, note: "Net revenue less the reserved profit target", tone: "violet" },
    { label: "Procurement expenses", value: bucket.procurementCostPaise, icon: <ShoppingCart />, note: "Recorded materials and vendor costs" },
    { label: "Employee payments", value: bucket.employeePaymentPaise, icon: <UsersRound />, note: "Recorded project team payments" },
    { label: "Other project expenses", value: bucket.otherExpensePaise, icon: <ReceiptText />, note: "Recorded direct costs outside procurement and payroll" },
    { label: "Overheads", value: bucket.overheadPaise, icon: <BriefcaseBusiness />, note: "Recorded operating costs allocated to projects", tone: bucket.overheadPaise > 0 ? "amber" : undefined },
    { label: "Total recorded expenses", value: bucket.recordedCostPaise, icon: <ReceiptText />, note: "Procurement + employees + other expenses + overheads", tone: bucket.recordedCostPaise > bucket.costBudgetPaise ? "red" : undefined },
    { label: bucket.remainingBudgetPaise < 0 ? "Cost budget overrun" : "Remaining cost budget", value: Math.abs(bucket.remainingBudgetPaise), icon: <WalletCards />, note: "Project cost budget less all recorded expenses", tone: bucket.remainingBudgetPaise < 0 ? "red" : "green" }
  ];
  return (
    <div className="finance-kpis" aria-label="Finance summary">
      {cards.map((card) => (
        <article key={card.label} className={`finance-kpi${card.tone ? ` finance-kpi--${card.tone}` : ""}`}>
          <span className="finance-kpi__icon" aria-hidden="true">{card.icon}</span>
          <span>{card.label}</span>
          <strong>{formatPaise(card.value)}</strong>
          <small>{card.note}</small>
        </article>
      ))}
    </div>
  );
}

interface FinanceKpiCard {
  label: string;
  value: number;
  icon: ReactNode;
  note: string;
  tone?: "green" | "amber" | "red" | "violet";
}

function ProjectFinanceHero({ bucket }: { bucket: ProjectFinanceBucket }) {
  const budgetHealthy = bucket.remainingBudgetPaise >= 0;
  return (
    <section className="project-finance-hero" aria-labelledby={`project-finance-position-${bucket.projectId}`}>
      <div className="project-finance-hero__copy">
        <p className="eyebrow">Approved commercial baseline</p>
        <h3 id={`project-finance-position-${bucket.projectId}`}>{formatPaise(bucket.approvedContractTotalPaise)}</h3>
        <p>Client-approved value including GST. After GST, 20% of net revenue is reserved for profit and the remaining 80% becomes the project cost budget.</p>
        <div className="project-finance-equation" aria-label="Project cost budget calculation">
          <span><small>Project cost budget</small><strong>{formatPaise(bucket.costBudgetPaise)}</strong></span>
          <i aria-hidden="true">−</i>
          <span><small>Recorded project expenses</small><strong>{formatPaise(bucket.recordedCostPaise)}</strong></span>
          <i aria-hidden="true">=</i>
          <span className={budgetHealthy ? "is-healthy" : "is-risk"}>
            <small>{budgetHealthy ? "Remaining cost budget" : "Cost budget overrun"}</small>
            <strong>{formatPaise(Math.abs(bucket.remainingBudgetPaise))}</strong>
          </span>
        </div>
        <p className={`finance-margin-note ${budgetHealthy ? "finance-margin-note--healthy" : "finance-margin-note--risk"}`}>
          <strong>{formatBps(bucket.targetMarginBps)} target margin {budgetHealthy ? "reserved" : "at risk"}</strong>
          <span>
            {budgetHealthy
              ? ` · ${formatPaise(bucket.targetProfitPaise)} is reserved before project spending.`
              : ` · Costs exceed the project budget by ${formatPaise(Math.abs(bucket.remainingBudgetPaise))}.`}
          </span>
        </p>
      </div>
      <FinanceLiquidGauge
        availablePaise={bucket.remainingBudgetPaise}
        totalPaise={bucket.costBudgetPaise}
        label="Remaining project cost budget"
        size="large"
      />
    </section>
  );
}

export function FinanceLiquidGauge({
  availablePaise,
  totalPaise,
  label,
  size = "compact"
}: {
  availablePaise: number;
  totalPaise: number;
  label: string;
  size?: "compact" | "large";
}) {
  const percentage = totalPaise > 0
    ? Math.max(0, Math.min(100, (availablePaise / totalPaise) * 100))
    : 0;
  const tone = availablePaise < 0 ? "danger" : percentage <= 25 ? "warning" : "healthy";
  const style = { "--finance-liquid-level": `${percentage}%` } as CSSProperties;
  const displayValue = availablePaise < 0
    ? `${formatPaise(Math.abs(availablePaise))} over`
    : formatPaise(availablePaise);
  const accessibleValue = availablePaise < 0
    ? `${formatPaise(Math.abs(availablePaise))} over the ${formatPaise(totalPaise)} cost budget`
    : `${displayValue} of ${formatPaise(totalPaise)} available`;

  return (
    <div className={`finance-liquid finance-liquid--${size} finance-liquid--${tone}`}>
      <div
        className="finance-liquid__vessel"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
        aria-valuetext={accessibleValue}
        style={style}
      >
        <div className="finance-liquid__fill" aria-hidden="true">
          <span className="finance-liquid__wave finance-liquid__wave--one" />
          <span className="finance-liquid__wave finance-liquid__wave--two" />
          <span className="finance-liquid__bubble finance-liquid__bubble--one" />
          <span className="finance-liquid__bubble finance-liquid__bubble--two" />
          <span className="finance-liquid__bubble finance-liquid__bubble--three" />
        </div>
        <div className="finance-liquid__value">
          <span>{availablePaise < 0 ? "Budget overrun" : label}</span>
          <strong>{displayValue}</strong>
          <small>{availablePaise < 0 ? "Cost budget exceeded" : `${Math.round(percentage)}% of cost budget available`}</small>
        </div>
      </div>
    </div>
  );
}

function FinanceEntryForm({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const idempotencyKey = useRef(financeRequestKey());
  const [type, setType] = useState<"direct_spend" | "overhead">("direct_spend");
  const [expenseClass, setExpenseClass] = useState<"procurement" | "employee_payment" | "other">("procurement");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [validation, setValidation] = useState("");
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof postProjectFinanceEntry>[1]) =>
      postProjectFinanceEntry(projectId, input),
    onSuccess: async () => {
      idempotencyKey.current = financeRequestKey();
      setCategory("");
      setAmount("");
      setDescription("");
      setVendor("");
      setReference("");
      await Promise.all([
        client.invalidateQueries({ queryKey: projectFinanceKeys.bucket(projectId) }),
        client.invalidateQueries({ queryKey: projectFinanceKeys.entries(projectId) }),
        client.invalidateQueries({ queryKey: projectFinanceKeys.projects })
      ]);
    }
  });
  const updateDraft = (update: () => void) => {
    update();
    idempotencyKey.current = financeRequestKey();
    setValidation("");
    if (!mutation.isPending) mutation.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const rupees = Number(amount);
    if (!category.trim() || !description.trim() || !Number.isFinite(rupees) || rupees <= 0) {
      setValidation("Enter a category, description, and positive amount.");
      return;
    }
    const amountPaise = Math.round(rupees * 100);
    if (!Number.isSafeInteger(amountPaise)) {
      setValidation("The amount is too large.");
      return;
    }
    setValidation("");
    const entry = {
      category: category.trim(),
      amountPaise,
      incurredAt: `${incurredAt}T00:00:00.000Z`,
      description: description.trim(),
      ...(vendor.trim() ? { vendor: vendor.trim() } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      idempotencyKey: idempotencyKey.current
    };
    mutation.mutate(type === "direct_spend"
      ? { ...entry, type, expenseClass }
      : { ...entry, type });
  };

  return (
    <form className="finance-entry-form" onSubmit={submit} noValidate>
      <div className="section-heading">
        <div><h3>Record project cost</h3><p>Posted entries remain in the financial ledger.</p></div>
      </div>
      <div className="finance-entry-form__grid">
        <Field id={`finance-entry-type-${projectId}`} label="Cost type" required>
          {(props) => <Select {...props} value={type} onChange={(event) => updateDraft(() => setType(event.target.value as typeof type))}><option value="direct_spend">Direct spending</option><option value="overhead">Overhead</option></Select>}
        </Field>
        {type === "direct_spend" ? (
          <Field id={`finance-entry-class-${projectId}`} label="Expense class" hint="Used for accurate portfolio reporting." required>
            {(props) => <Select {...props} value={expenseClass} onChange={(event) => updateDraft(() => setExpenseClass(event.target.value as typeof expenseClass))}><option value="procurement">Procurement cost</option><option value="employee_payment">Employee payment</option><option value="other">Other project expense</option></Select>}
          </Field>
        ) : null}
        <Field id={`finance-entry-category-${projectId}`} label="Category" required>
          {(props) => <Input {...props} value={category} onChange={(event) => updateDraft(() => setCategory(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-amount-${projectId}`} label="Amount (INR)" required>
          {(props) => <Input {...props} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => updateDraft(() => setAmount(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-date-${projectId}`} label="Incurred date" required>
          {(props) => <Input {...props} type="date" value={incurredAt} onChange={(event) => updateDraft(() => setIncurredAt(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-vendor-${projectId}`} label="Vendor / payee">
          {(props) => <Input {...props} value={vendor} onChange={(event) => updateDraft(() => setVendor(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-reference-${projectId}`} label="Invoice / reference">
          {(props) => <Input {...props} value={reference} onChange={(event) => updateDraft(() => setReference(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-description-${projectId}`} className="finance-entry-form__description" label="Description" required>
          {(props) => <Textarea {...props} rows={3} value={description} onChange={(event) => updateDraft(() => setDescription(event.target.value))} />}
        </Field>
      </div>
      {validation || mutation.isError ? <p role="alert">{validation || financeError(mutation.error)}</p> : null}
      {mutation.isSuccess ? <p role="status">Project cost recorded.</p> : null}
      <Button type="submit" busy={mutation.isPending} busyLabel="Recording…">Record cost</Button>
    </form>
  );
}

function FinanceEntries({ entries }: { entries: Array<{
  id: string;
  type: "direct_spend" | "overhead";
  expenseClass: "procurement" | "employee_payment" | "other" | null;
  category: string;
  amountPaise: number;
  incurredAt: string;
  description: string;
  vendor: string | null;
  reference: string | null;
  status: "posted" | "voided";
}> }) {
  return (
    <section className="finance-entries" aria-labelledby="finance-entries-title">
      <div className="section-heading"><div><h3 id="finance-entries-title">Spending and overhead ledger</h3></div><span>{entries.length} entries</span></div>
      {entries.length === 0 ? <p className="inline-empty">No project costs have been recorded.</p> : (
        <div className="finance-entries__list">
          {entries.map((entry) => (
            <article key={entry.id} className="finance-entry">
              <div><strong>{entry.category}</strong><span>{financeEntryLabel(entry)} · {date.format(new Date(entry.incurredAt))}</span></div>
              <strong>{formatPaise(entry.amountPaise)}</strong>
              <p>{entry.description}</p>
              {entry.vendor || entry.reference ? <small>{[entry.vendor, entry.reference].filter(Boolean).join(" · ")}</small> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function financeEntryLabel(entry: { type: "direct_spend" | "overhead"; expenseClass: "procurement" | "employee_payment" | "other" | null }) {
  if (entry.type === "overhead") return "Overhead";
  if (entry.expenseClass === "procurement") return "Procurement cost";
  if (entry.expenseClass === "employee_payment") return "Employee payment";
  return "Other project expense";
}

function deadlineLabel(bucket: Pick<ProjectFinanceBucket, "deadlineStatus" | "overdueDays" | "overdueTaskCount">) {
  switch (bucket.deadlineStatus) {
    case "overdue":
      return `${bucket.overdueDays} days late · ${bucket.overdueTaskCount} overdue ${bucket.overdueTaskCount === 1 ? "task" : "tasks"}`;
    case "completed_late":
      return "Completed after deadline";
    case "completed_on_time":
      return "Completed on time";
    case "completed_date_unknown":
      return "Completion date unavailable";
    case "on_track":
      return bucket.overdueTaskCount > 0
        ? `On track · ${bucket.overdueTaskCount} overdue ${bucket.overdueTaskCount === 1 ? "task" : "tasks"}`
        : "On track";
  }
}

export function formatPaise(value: number) {
  return money.format(value / 100);
}

export function formatBps(value: number | null) {
  return value === null ? "Not available" : `${(value / 100).toFixed(2)}%`;
}

function formatPercentage(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.max(0, (value / total) * 100).toFixed(1)}%`;
}

function financeError(error: unknown) {
  return error instanceof ApiError ? error.message : "Project finance could not be loaded.";
}

function financeRequestKey() {
  return globalThis.crypto?.randomUUID?.() ?? `finance-${Date.now()}-${Math.random()}`;
}

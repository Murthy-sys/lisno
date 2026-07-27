import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../api/client";
import type {
  CreateFloorInput,
  CreateStageInput,
  CreateTaskInput,
  DesignStageType
} from "../../api/types";
import { Dialog } from "../../components/ui/Dialog";
import {
  createFloor,
  createStage,
  createTask,
  designerKeys
} from "./designerApi";

export type StructureAction =
  | { kind: "floor"; projectId: string; nextOrder: number }
  | {
      kind: "stage";
      projectId: string;
      floorId: string;
      nextOrder: number;
    }
  | {
      kind: "task";
      projectId: string;
      stageId: string;
      assignedDesignerIds: string[];
      nextOrder: number;
    };

interface StructureForm {
  name: string;
  number: string;
  type: DesignStageType;
  title: string;
  ownerId: string;
  order: string;
  plannedStartAt: string;
  plannedEndAt: string;
  originalDeadlineAt: string;
  plannedEffort: string;
}

const stageTypes: Array<{ value: DesignStageType; label: string }> = [
  { value: "internal_kickoff", label: "Internal kickoff" },
  { value: "client_kickoff", label: "Client kickoff" },
  { value: "key_collection", label: "Key collection" },
  { value: "site_measurement", label: "Site measurement" },
  { value: "concept_mood_board", label: "Concept and mood board" },
  { value: "floor_plan", label: "Floor plan" },
  { value: "client_revisions", label: "Client revisions" },
  { value: "final_approval", label: "Final approval" },
  { value: "design_handoff", label: "Design handoff" }
];

function initialForm(action: StructureAction): StructureForm {
  return {
    name: "",
    number: "",
    type: "internal_kickoff",
    title: "",
    ownerId:
      action.kind === "task" ? (action.assignedDesignerIds[0] ?? "") : "",
    order: String(action.nextOrder),
    plannedStartAt: "",
    plannedEndAt: "",
    originalDeadlineAt: "",
    plannedEffort: ""
  };
}

export function ProjectStructureDialog({
  action,
  onClose,
  onCreated
}: {
  action: StructureAction;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => initialForm(action));
  const [error, setError] = useState<string | null>(null);
  const title =
    action.kind === "floor"
      ? "Add floor"
      : action.kind === "stage"
        ? "Add stage"
        : "Add task";

  const mutation = useMutation({
    mutationFn: async () => {
      if (action.kind === "floor") {
        return createFloor(action.projectId, floorInput(form));
      }
      if (action.kind === "stage") {
        return createStage(action.floorId, stageInput(form));
      }
      return createTask(action.stageId, taskInput(form));
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError && mutationError.fields
          ? (Object.values(mutationError.fields)[0] ?? mutationError.message)
          : mutationError instanceof Error
            ? mutationError.message
            : `${title} could not be completed.`
      );
    },
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({
        queryKey: designerKeys.project(action.projectId)
      });
      const label =
        "title" in record
          ? record.title
          : "number" in record
            ? record.name
            : record.name;
      onCreated(`${label} was added.`);
      onClose();
    }
  });

  const update = (field: keyof StructureForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (action.kind === "floor") floorInput(form);
      else if (action.kind === "stage") stageInput(form);
      else taskInput(form);
      mutation.mutate();
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Complete every required field."
      );
    }
  };

  return (
    <Dialog
      title={title}
      description="Add the next part of this project's delivery structure."
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form className="modal-form project-form" onSubmit={submit}>
        {error ? <div className="form-alert" role="alert">{error}</div> : null}
        {action.kind === "floor" ? (
          <>
            <Field label="Floor name" value={form.name} onChange={(value) => update("name", value)} />
            <Field label="Floor number" value={form.number} onChange={(value) => update("number", value)} />
            <Field label="Floor order" type="number" value={form.order} onChange={(value) => update("order", value)} />
            <Field label="Planned start" type="datetime-local" value={form.plannedStartAt} onChange={(value) => update("plannedStartAt", value)} />
            <Field label="Planned end" type="datetime-local" value={form.plannedEndAt} onChange={(value) => update("plannedEndAt", value)} />
          </>
        ) : null}
        {action.kind === "stage" ? (
          <>
            <Field label="Stage name" value={form.name} onChange={(value) => update("name", value)} />
            <label className="field">
              <span>Stage type</span>
              <select value={form.type} onChange={(event) => update("type", event.target.value)}>
                {stageTypes.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <Field label="Stage order" type="number" value={form.order} onChange={(value) => update("order", value)} />
          </>
        ) : null}
        {action.kind === "task" ? (
          <>
            <Field label="Task title" value={form.title} onChange={(value) => update("title", value)} />
            <label className="field">
              <span>Task owner</span>
              <select value={form.ownerId} onChange={(event) => update("ownerId", event.target.value)}>
                {action.assignedDesignerIds.map((designerId) => (
                  <option key={designerId} value={designerId}>{designerId}</option>
                ))}
              </select>
            </label>
            <Field label="Task order" type="number" value={form.order} onChange={(value) => update("order", value)} />
            <Field label="Planned start" type="datetime-local" value={form.plannedStartAt} onChange={(value) => update("plannedStartAt", value)} />
            <Field label="Original deadline" type="datetime-local" value={form.originalDeadlineAt} onChange={(value) => update("originalDeadlineAt", value)} />
            <Field label="Planned effort" type="number" value={form.plannedEffort} onChange={(value) => update("plannedEffort", value)} />
          </>
        ) : null}
        <div className="modal-form__actions project-form__actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : `Create ${action.kind}`}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function floorInput(form: StructureForm): CreateFloorInput {
  const order = positiveOrder(form.order);
  const start = iso(form.plannedStartAt, "Enter a valid planned start.");
  const end = iso(form.plannedEndAt, "Enter a valid planned end.");
  if (!form.name.trim() || !form.number.trim()) {
    throw new Error("Enter a floor name and number.");
  }
  if (end < start) throw new Error("Planned end must follow planned start.");
  return {
    name: form.name.trim(),
    number: form.number.trim(),
    order,
    plannedStartAt: start,
    plannedEndAt: end
  };
}

function stageInput(form: StructureForm): CreateStageInput {
  if (!form.name.trim()) throw new Error("Enter a stage name.");
  return {
    name: form.name.trim(),
    type: form.type,
    order: positiveOrder(form.order)
  };
}

function taskInput(form: StructureForm): CreateTaskInput {
  if (!form.title.trim() || !form.ownerId) {
    throw new Error("Enter a task title and owner.");
  }
  const start = iso(form.plannedStartAt, "Enter a valid planned start.");
  const deadline = iso(
    form.originalDeadlineAt,
    "Enter a valid original deadline."
  );
  if (deadline < start) {
    throw new Error("Original deadline must follow planned start.");
  }
  const effort = form.plannedEffort ? Number(form.plannedEffort) : undefined;
  if (effort !== undefined && (!Number.isFinite(effort) || effort <= 0)) {
    throw new Error("Planned effort must be greater than zero.");
  }
  return {
    title: form.title.trim(),
    ownerId: form.ownerId,
    order: positiveOrder(form.order),
    plannedStartAt: start,
    originalDeadlineAt: deadline,
    ...(effort === undefined ? {} : { plannedEffort: effort })
  };
}

function positiveOrder(value: string): number {
  const order = Number(value);
  if (!Number.isInteger(order) || order < 0) {
    throw new Error("Order must be a whole number of zero or more.");
  }
  return order;
}

function iso(value: string, message: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.valueOf())) throw new Error(message);
  return date.toISOString();
}

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = `structure-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? 1 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

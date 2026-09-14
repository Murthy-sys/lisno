import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import "../../styles/estimator-dashboard.css";
import { createLead, leadKeys } from "./leadsApi";

const empty = { clientName: "", clientEmail: "", clientMobile: "", projectName: "", location: "", propertyType: "", budgetMin: "", budgetMax: "", source: "", nextAction: "", nextActionAt: "" };
export function LeadCreateDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState(empty); const [error, setError] = useState<string | null>(null); const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: () => createLead({ ...form, budgetMin: Number(form.budgetMin), budgetMax: Number(form.budgetMax), nextActionAt: new Date(form.nextActionAt).toISOString() }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: leadKeys.all }); onClose(); }, onError: (cause) => setError(cause instanceof ApiError ? cause.message : "Lead could not be saved.") });
  const submit = (event: FormEvent) => { event.preventDefault(); setError(null); if (Object.values(form).some((value) => !value.trim())) { setError("Complete every required field."); return; } if (Number(form.budgetMax) < Number(form.budgetMin)) { setError("Maximum budget must be at least the minimum budget."); return; } mutation.mutate(); };
  const dirty = Object.entries(form).some(([key, value]) => value !== empty[key as keyof typeof empty]);
  return <ContextPanel title="New lead" description="Capture the essentials now; you can add estimate details later." onClose={onClose} busy={mutation.isPending} dirty={dirty} width="wide">{({ requestClose }) => <form className="lead-create-form" onSubmit={submit}>
    {error ? <div className="form-alert" role="alert">{error}</div> : null}
    <div className="lead-create-form__fields">{Object.entries(form).map(([key, value]) => <Field id={`new-lead-${key}`} label={label(key)} required key={key}>{(props) => <Input {...props} disabled={mutation.isPending} type={key.includes("budget") ? "number" : key === "nextActionAt" ? "datetime-local" : key === "clientEmail" ? "email" : "text"} value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />}</Field>)}</div>
    <div className="modal-form__actions"><Button variant="secondary" disabled={mutation.isPending} onClick={requestClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save lead"}</Button></div>
  </form>}</ContextPanel>;
}
function label(key: string) { return ({ clientName: "Client name", clientEmail: "Client email", clientMobile: "Mobile", projectName: "Project / property name", location: "Location", propertyType: "Property type", budgetMin: "Minimum budget", budgetMax: "Maximum budget", source: "Lead source", nextAction: "Next action", nextActionAt: "Next action date" } as Record<string, string>)[key]; }

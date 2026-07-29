import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { Dialog } from "../../components/ui/Dialog";
import { createLead, leadKeys } from "./leadsApi";

const empty = { clientName: "", clientEmail: "", clientMobile: "", projectName: "", location: "", propertyType: "", budgetMin: "", budgetMax: "", source: "", nextAction: "", nextActionAt: "" };
export function LeadCreateDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState(empty); const [error, setError] = useState<string | null>(null); const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: () => createLead({ ...form, budgetMin: Number(form.budgetMin), budgetMax: Number(form.budgetMax), nextActionAt: new Date(form.nextActionAt).toISOString() }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: leadKeys.all }); onClose(); }, onError: (cause) => setError(cause instanceof ApiError ? cause.message : "Lead could not be saved.") });
  const submit = (event: FormEvent) => { event.preventDefault(); setError(null); if (Object.values(form).some((value) => !value.trim())) { setError("Complete every required field."); return; } if (Number(form.budgetMax) < Number(form.budgetMin)) { setError("Maximum budget must be at least the minimum budget."); return; } mutation.mutate(); };
  return <Dialog title="New lead" description="Capture the essentials now; you can add estimate details later." onClose={onClose} busy={mutation.isPending}><form className="modal-form project-form" onSubmit={submit}>{error ? <div className="form-alert" role="alert">{error}</div> : null}{Object.entries(form).map(([key, value]) => <label className="field" key={key}><span>{label(key)}</span><input required={true} type={key.includes("budget") ? "number" : key === "nextActionAt" ? "datetime-local" : key === "clientEmail" ? "email" : "text"} value={value} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<div className="modal-form__actions project-form__actions"><button type="button" className="button button--secondary" onClick={onClose}>Cancel</button><button className="button button--primary" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save lead"}</button></div></form></Dialog>;
}
function label(key: string) { return ({ clientName: "Client name", clientEmail: "Client email", clientMobile: "Mobile", projectName: "Project / property name", location: "Location", propertyType: "Property type", budgetMin: "Minimum budget", budgetMax: "Maximum budget", source: "Lead source", nextAction: "Next action", nextActionAt: "Next action date" } as Record<string, string>)[key]; }

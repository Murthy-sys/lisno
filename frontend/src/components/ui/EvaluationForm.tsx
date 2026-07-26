import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import type { Evaluation } from "../../api/types";

export function EvaluationForm({ subjectUserId, queryKey, revision }: { subjectUserId: string; queryKey: readonly unknown[]; revision?: Evaluation }) {
  const client = useQueryClient();
  const [score, setScore] = useState("80");
  const [comments, setComments] = useState("");
  const [periodStartAt, setPeriodStartAt] = useState("2026-01-01T00:00");
  const [periodEndAt, setPeriodEndAt] = useState("2026-12-31T23:59");
  const [isCorrection, setIsCorrection] = useState(false);
  const mutation = useMutation({
    mutationFn: () => apiClient.post<Evaluation>("/evaluations", { subjectUserId, periodStartAt: new Date(periodStartAt).toISOString(), periodEndAt: new Date(periodEndAt).toISOString(), score: Number(score), comments, ...(isCorrection && revision ? { revisionOf: revision.id } : {}) }),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey }), client.invalidateQueries({ queryKey: ["management"] })])
  });
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  return <form className="evaluation-form" onSubmit={submit}>
    <h3>Evaluation</h3>
    {revision ? <label><input type="checkbox" checked={isCorrection} onChange={(event) => { const correcting = event.target.checked; setIsCorrection(correcting); if (correcting) { setPeriodStartAt(revision.periodStartAt.slice(0, 16)); setPeriodEndAt(revision.periodEndAt.slice(0, 16)); } }} /> Correct the latest evaluation (uses its period)</label> : null}
    <label>Period start<input aria-label="Evaluation period start" type="datetime-local" required value={periodStartAt} onChange={(e) => setPeriodStartAt(e.target.value)} /></label>
    <label>Period end<input aria-label="Evaluation period end" type="datetime-local" required value={periodEndAt} onChange={(e) => setPeriodEndAt(e.target.value)} /></label>
    <label>Score<input aria-label="Evaluation score" type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} /></label>
    <label>Comments<textarea aria-label="Evaluation comments" required value={comments} onChange={(e) => setComments(e.target.value)} /></label>
    {mutation.isError ? <p role="alert">Evaluation could not be saved.</p> : null}
    <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save evaluation"}</button>
  </form>;
}

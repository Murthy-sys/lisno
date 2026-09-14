import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import type { Evaluation } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "./Button";
import { Input, Select, Textarea } from "./Field";

export function EvaluationForm({ subjectUserId, queryKey, revisionCandidates = [] }: { subjectUserId: string; queryKey: readonly unknown[]; revisionCandidates?: Evaluation[] }) {
  const client = useQueryClient();
  const auth = useAuth();
  const [score, setScore] = useState("80");
  const [comments, setComments] = useState("");
  const [periodStartAt, setPeriodStartAt] = useState("2026-01-01T00:00");
  const [periodEndAt, setPeriodEndAt] = useState("2026-12-31T23:59");
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const candidates = revisionCandidates.filter((evaluation) => evaluation.evaluatorUserId === auth.user?.id && evaluation.evaluatorRole === auth.user?.role);
  const revision = candidates.find((evaluation) => evaluation.id === revisionId);
  const mutation = useMutation({
    mutationFn: () => apiClient.post<Evaluation>("/evaluations", { subjectUserId, periodStartAt: revision?.periodStartAt ?? new Date(periodStartAt).toISOString(), periodEndAt: revision?.periodEndAt ?? new Date(periodEndAt).toISOString(), score: Number(score), comments, ...(revision ? { revisionOf: revision.id } : {}) }),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey }), client.invalidateQueries({ queryKey: ["management"] })])
  });
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  return <form className="evaluation-form" onSubmit={submit}>
    <header className="evaluation-form__heading"><h3>Evaluation</h3><p>Your assessment is recorded separately from the calculated KPI.</p></header>
    {candidates.length ? <label className="evaluation-form__revision">Correct a previous evaluation<Select aria-label="Evaluation to correct" value={revisionId ?? ""} onChange={(event) => setRevisionId(event.target.value || null)}><option value="">Create a new evaluation</option>{candidates.map((evaluation) => <option key={evaluation.id} value={evaluation.id}>{evaluation.periodStartAt} – {evaluation.periodEndAt} · {evaluation.score}</option>)}</Select></label> : null}
    <label>Period start<Input aria-label="Evaluation period start" disabled={Boolean(revision)} type="datetime-local" required value={revision ? revision.periodStartAt.slice(0, 16) : periodStartAt} onChange={(e) => setPeriodStartAt(e.target.value)} /></label>
    <label>Period end<Input aria-label="Evaluation period end" disabled={Boolean(revision)} type="datetime-local" required value={revision ? revision.periodEndAt.slice(0, 16) : periodEndAt} onChange={(e) => setPeriodEndAt(e.target.value)} /></label>
    <label>Score<Input aria-label="Evaluation score" type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} /></label>
    <label className="evaluation-form__comments">Comments<Textarea aria-label="Evaluation comments" required value={comments} onChange={(e) => setComments(e.target.value)} /></label>
    {mutation.isError ? <p role="alert">Evaluation could not be saved.</p> : null}
    <Button type="submit" busy={mutation.isPending}>Save evaluation</Button>
  </form>;
}

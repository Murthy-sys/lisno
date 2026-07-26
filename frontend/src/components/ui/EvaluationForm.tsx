import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import type { Evaluation } from "../../api/types";

export function EvaluationForm({ subjectUserId, queryKey }: { subjectUserId: string; queryKey: readonly unknown[] }) {
  const client = useQueryClient();
  const [score, setScore] = useState("80");
  const [comments, setComments] = useState("");
  const mutation = useMutation({
    mutationFn: () => apiClient.post<Evaluation>("/evaluations", { subjectUserId, periodStartAt: "2026-01-01T00:00:00.000Z", periodEndAt: "2026-12-31T23:59:59.999Z", score: Number(score), comments }),
    onSuccess: () => void client.invalidateQueries({ queryKey })
  });
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  return <form className="evaluation-form" onSubmit={submit}>
    <h3>Evaluation</h3>
    <label>Score<input aria-label="Evaluation score" type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} /></label>
    <label>Comments<textarea aria-label="Evaluation comments" required value={comments} onChange={(e) => setComments(e.target.value)} /></label>
    {mutation.isError ? <p role="alert">Evaluation could not be saved.</p> : null}
    <button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save evaluation"}</button>
  </form>;
}

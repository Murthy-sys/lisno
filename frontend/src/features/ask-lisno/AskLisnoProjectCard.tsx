import { useId } from "react";
import { LisnoChatMark } from "../messages/LisnoChatMark";
import type { AskLisnoResponse } from "./askLisnoApi";

const PROJECT_FACT_IDS = ["project-stage", "project-status"] as const;

export function getAskLisnoProjectSummary(response: AskLisnoResponse) {
  const project = response.resolution?.project;
  if (response.answer.kind !== "status" || response.resolution?.state !== "resolved"
    || !project || !project.id || project.id !== response.projectId || !project.name.trim()) return null;

  const facts = PROJECT_FACT_IDS.flatMap(id => {
    const fact = response.answer.facts.find(candidate => candidate.id === id
      && candidate.source.id === project.id && candidate.label.trim() && candidate.value.trim());
    return fact ? [fact] : [];
  });
  if (!facts.length) return null;
  return {project, facts};
}

export function AskLisnoProjectCard({ response }: { response: AskLisnoResponse }) {
  const headingId = useId();
  const summary = getAskLisnoProjectSummary(response);
  if (!summary) return null;
  const {project, facts} = summary;

  return <section className="ask-lisno-project-card" aria-labelledby={headingId}>
    <div className="ask-lisno-project-card__identity">
      <div className="ask-lisno-project-card__art" aria-hidden="true"><LisnoChatMark /></div>
      <h3 className="ask-lisno-project-card__name" id={headingId}>{project.name}</h3>
    </div>
    <dl className="ask-lisno-project-card__facts">
      {facts.map(fact => <div key={fact.id}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
    </dl>
  </section>;
}

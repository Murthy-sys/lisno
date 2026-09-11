import { useId } from "react";

import { StatusBadge } from "../../components/ui/StatusBadge";
import type { DesignWorkflowStage } from "./projectWorkflowApi";

type StageInstructions = NonNullable<DesignWorkflowStage["instructions"]>;

function InstructionList({ items }: { items: string[] }) {
  return <ul className="workflow-requirements__list">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>;
}

export function WorkflowStageRequirements({ instructions, compact = false }: { instructions: StageInstructions; compact?: boolean }) {
  const id = useId();
  if (compact) {
    const target = instructions.sla.enabled ? instructions.sla.bands[0]?.description : undefined;
    return <section className="workflow-requirements workflow-requirements--compact" aria-labelledby={`${id}-heading`}>
      <h5 id={`${id}-heading`} className="sr-only">Stage requirements</h5>
      <dl className="workflow-requirements__facts workflow-requirements__facts--essentials">
        <div><dt>Owner</dt><dd>{instructions.owner}</dd></div>
        <div><dt>Starts</dt><dd>{instructions.start}</dd></div>
        {target ? <div><dt>Target</dt><dd>{target}</dd></div> : null}
        <div><dt>To complete</dt><dd><InstructionList items={instructions.completion} /></dd></div>
      </dl>
    </section>;
  }
  return (
    <section className="workflow-requirements" aria-labelledby={`${id}-heading`}>
      <header className="workflow-requirements__heading">
        <h5 id={`${id}-heading`}>Stage requirements</h5>
        {instructions.objective ? <p>{instructions.objective}</p> : null}
      </header>

      <dl className="workflow-requirements__facts">
        <div><dt>Responsible owner</dt><dd>{instructions.owner}</dd></div>
        <div><dt>Trigger</dt><dd>{instructions.trigger}</dd></div>
        <div><dt>Start condition</dt><dd>{instructions.start}</dd></div>
        <div><dt>Completion requirements</dt><dd><InstructionList items={instructions.completion} /></dd></div>
      </dl>

      <section className="workflow-requirements__timing" aria-labelledby={`${id}-timing`}>
        <div className="workflow-requirements__group-heading">
          <h6 id={`${id}-timing`}>Service levels and clock rules</h6>
          <StatusBadge label={instructions.sla.enabled ? "SLA applies" : "SLA disabled"} tone="neutral" />
        </div>
        {instructions.sla.bands.length ? (
          <ul className="workflow-requirements__bands" aria-label="Service level bands">
            {instructions.sla.bands.map((band, index) => (
              <li key={`${index}-${band.label}`} data-tone={band.tone}>
                <StatusBadge label={band.label} tone={band.tone} />
                <p>{band.description}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <dl className="workflow-requirements__facts workflow-requirements__facts--clock">
          {instructions.sla.clockOwner ? <div><dt>Clock attributed to</dt><dd>{instructions.sla.clockOwner}</dd></div> : null}
          <div><dt>Clock rule</dt><dd>{instructions.sla.clockRule}</dd></div>
          <div><dt>Pause rule</dt><dd>{instructions.sla.pauseRule}</dd></div>
        </dl>
      </section>

      <div className="workflow-requirements__guidance">
        {instructions.dependencies.length ? <section aria-labelledby={`${id}-dependencies`}><h6 id={`${id}-dependencies`}>Required dependencies</h6><InstructionList items={instructions.dependencies} /></section> : null}
        {instructions.clientExperience.length || instructions.clientMessage ? (
          <section aria-labelledby={`${id}-client`}>
            <h6 id={`${id}-client`}>Client guidance</h6>
            {instructions.clientExperience.length ? <InstructionList items={instructions.clientExperience} /> : null}
            {instructions.clientMessage ? <blockquote className="workflow-requirements__message"><span>Message for the client</span><p>{instructions.clientMessage}</p></blockquote> : null}
          </section>
        ) : null}
        {instructions.managerReminders.length ? <section aria-labelledby={`${id}-reminders`}><h6 id={`${id}-reminders`}>Manager reminders</h6><InstructionList items={instructions.managerReminders} /></section> : null}
        {instructions.requirements.length ? <section aria-labelledby={`${id}-additional`}><h6 id={`${id}-additional`}>Additional requirements</h6><InstructionList items={instructions.requirements} /></section> : null}
      </div>
    </section>
  );
}

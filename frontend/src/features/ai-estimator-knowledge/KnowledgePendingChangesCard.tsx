import { useId, useState } from "react";

import { Button } from "../../components/ui/Button";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import type { KnowledgePendingChangeEntry, KnowledgePendingChangesSnapshot } from "./knowledgePendingChanges";

const CHANGE_LABELS: Record<KnowledgePendingChangeEntry["kind"], string> = {
  added: "Added", updated: "Updated", removed: "Removed", reordered: "Order changed"
};

interface Props {
  readonly snapshot: KnowledgePendingChangesSnapshot;
  readonly sectionLabel: string;
  readonly saving?: boolean;
}

export function KnowledgePendingChangesCard(props: Props) {
  return <PendingChangesContent key={props.snapshot.sourceKey} {...props} />;
}

function PendingChangesContent({ snapshot, sectionLabel, saving = false }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const groups = snapshot.groups.filter((group) => group.entries.length > 0);
  const total = groups.reduce((count, group) => count + group.entries.length, 0);
  if (!total) return null;
  let remaining = expanded ? total : 4;

  return <Surface as="section" className="knowledge-pending-changes" aria-labelledby={`${id}-title`}>
    <div className="knowledge-pending-changes__heading">
      <h2 id={`${id}-title`}>Now requesting</h2>
      <StatusBadge label={saving ? "Saving…" : "Unsaved"} tone="warning" />
    </div>
    <p className="knowledge-pending-changes__context">{sectionLabel}</p>
    <p className="knowledge-pending-changes__help">Only changes from this editing session are shown.</p>
    <div id={`${id}-entries`} className="knowledge-pending-changes__groups">
      {groups.map((group) => {
        const entries = group.entries.slice(0, remaining);
        remaining -= entries.length;
        if (!entries.length) return null;
        return <div className="knowledge-pending-changes__group" key={group.key}>
          <h3>{group.label}</h3>
          <ul>
            {entries.map((entry) => <li key={entry.key} className="knowledge-pending-changes__entry">
              <div className="knowledge-pending-changes__entry-heading">
                <h4>{entry.title}</h4>
                <span className="knowledge-pending-changes__kind">{CHANGE_LABELS[entry.kind]}</span>
              </div>
              {entry.incomplete ? <span className="knowledge-pending-changes__incomplete">Incomplete</span> : null}
              {entry.fields.length > 0 ? <dl>
                {entry.fields.map((field) => <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{field.cleared ? <span className="knowledge-pending-changes__cleared">Cleared</span>
                    : <ChangedValue key={`${entry.key}-${field.key}`} label={`${entry.title}: ${field.label}`} value={field.value} />}</dd>
                </div>)}
              </dl> : null}
            </li>)}
          </ul>
        </div>;
      })}
    </div>
    {total > 4 ? <Button type="button" variant="quiet" size="compact" className="knowledge-pending-changes__disclosure"
      aria-expanded={expanded} aria-controls={`${id}-entries`} onClick={() => setExpanded((value) => !value)}>
      {expanded ? "Show fewer changes" : `Show all ${total} changes`}
    </Button> : null}
  </Surface>;
}

function ChangedValue({ label, value }: { readonly label: string; readonly value: string }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const long = value.length > 160;
  return <>
    <span id={id}>{long && !expanded ? `${value.slice(0, 160)}…` : value}</span>
    {long ? <button type="button" className="knowledge-pending-changes__text-toggle" aria-controls={id}
      aria-expanded={expanded} aria-label={`${expanded ? "Show less" : "Show full value"}: ${label}`}
      onClick={() => setExpanded((current) => !current)}>{expanded ? "Show less" : "Show full value"}</button> : null}
  </>;
}

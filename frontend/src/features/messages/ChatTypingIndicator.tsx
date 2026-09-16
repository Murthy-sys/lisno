export interface ChatTypingPerson { userId: string; name: string }

export function chatTypingLabel(people: readonly ChatTypingPerson[]) {
  if (!people.length) return "";
  if (people.length === 1) return `${people[0].name} is typing…`;
  if (people.length === 2) return `${people[0].name} and ${people[1].name} are typing…`;
  return `${people[0].name}, ${people[1].name} and ${people.length - 2} ${people.length === 3 ? "other" : "others"} are typing…`;
}

export function ChatTypingIndicator({ people }: { people: readonly ChatTypingPerson[] }) {
  const label = chatTypingLabel(people);
  const fullLabel = people.length > 2 ? `${people.map(person => person.name).join(", ")} are typing…` : label;
  return <div className="project-chat-typing" role="status" aria-live="polite" aria-atomic="true">
    {label ? <><span className="project-chat-typing__dots" aria-hidden="true"><i /><i /><i /></span><span className="project-chat-typing__label" aria-hidden="true" title={fullLabel}>{label}</span><span className="sr-only">{fullLabel}</span></> : null}
  </div>;
}

import { useId, useRef, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Field";

const groups = {
  Faces: [["😀", "grinning face"], ["😊", "smiling face"], ["😂", "tears of joy"], ["🙂", "slightly smiling"], ["😉", "wink"], ["😍", "heart eyes"], ["🤔", "thinking"], ["😅", "nervous smile"], ["😮", "surprised"], ["😔", "sad"], ["😎", "sunglasses"], ["🥳", "celebration"]],
  Gestures: [["👍", "thumbs up"], ["👎", "thumbs down"], ["👏", "clapping"], ["🙏", "thank you folded hands"], ["👋", "waving hello"], ["🤝", "handshake agreement"], ["💪", "strong"], ["✌️", "victory"], ["👌", "okay"], ["🙌", "raised hands"]],
  Work: [["✅", "check done"], ["❌", "cross no"], ["⚠️", "warning"], ["📍", "location"], ["📅", "calendar"], ["📋", "checklist"], ["📝", "note"], ["📎", "attachment"], ["🏠", "house"], ["🔧", "wrench repair"], ["💡", "light idea"], ["🚧", "construction"], ["📐", "ruler design"], ["🔌", "electric plug"]],
  Other: [["❤️", "red heart"], ["💚", "green heart"], ["🎉", "party celebration"], ["✨", "sparkles"], ["⭐", "star"], ["🌟", "glowing star"], ["🔥", "fire"], ["☀️", "sun"], ["🌧️", "rain"], ["☕", "coffee"], ["🌱", "seedling"], ["🎂", "cake"]]
};
export function ChatEmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const grid = useRef<HTMLDivElement>(null);
  const emojis = Object.entries(groups).filter(([name]) => category === "All" || category === name).flatMap(([, values]) => values).filter(([, name]) => name.includes(search.toLowerCase()));
  return <Dialog title="Choose an emoji" eyebrow="Project discussion" onClose={onClose}><div className="project-chat-form">
    <Field id={`${id}-search`} label="Search emojis">{props => <Input {...props} value={search} onChange={event => setSearch(event.target.value)} />}</Field>
    <Field id={`${id}-category`} label="Emoji category">{props => <Select {...props} value={category} onChange={event => setCategory(event.target.value)}>{["All", ...Object.keys(groups)].map(name => <option key={name}>{name}</option>)}</Select>}</Field>
    <div ref={grid} className="project-chat-emojis" role="group" aria-label="Emojis" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const buttons = [...grid.current!.querySelectorAll("button")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0 || !buttons.length) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 }[event.key] ?? 0)));
      buttons[next]?.focus();
    }}>{emojis.map(([emoji, name]) => <button type="button" key={name} aria-label={name} onClick={() => onSelect(emoji)}>{emoji}</button>)}</div>
    {!emojis.length ? <p role="status">No matching emojis. You can also use your keyboard's emoji picker.</p> : null}
  </div></Dialog>;
}

import { Plus, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode
} from "react";

import { Button } from "../../components/ui/Button";
import { IconButton } from "../../components/ui/IconButton";

export interface KnowledgeRepeaterItem {
  readonly id: string;
}

export interface KnowledgeRepeaterProps<TItem extends KnowledgeRepeaterItem> {
  readonly label: string;
  readonly addLabel: string;
  readonly items: readonly TItem[];
  readonly renderItem: (item: TItem, index: number) => ReactNode;
  readonly onAdd: () => void;
  readonly onRemove: (itemId: string) => void;
  readonly onMove?: (itemId: string, direction: "up" | "down") => void;
  readonly emptyMessage?: string;
  readonly disabled?: boolean;
}

export function KnowledgeRepeater<TItem extends KnowledgeRepeaterItem>({
  label,
  addLabel,
  items,
  renderItem,
  onAdd,
  onRemove,
  onMove,
  emptyMessage = "No entries have been added.",
  disabled = false
}: KnowledgeRepeaterProps<TItem>) {
  const titleId = useId();
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const previousItems = useRef(items);
  const pendingFocusIndex = useRef<number | null>(null);

  useEffect(() => {
    const previous = previousItems.current;
    if (items.length > previous.length) {
      rowRefs.current.get(items[items.length - 1]?.id ?? "")?.focus();
    } else if (items.length < previous.length) {
      const index = Math.min(
        pendingFocusIndex.current ?? items.length - 1,
        items.length - 1
      );
      if (index >= 0) rowRefs.current.get(items[index].id)?.focus();
      else addButtonRef.current?.focus();
    }
    pendingFocusIndex.current = null;
    previousItems.current = items;
  }, [items]);

  function removeItem(item: TItem, index: number) {
    pendingFocusIndex.current = index;
    onRemove(item.id);
  }

  return (
    <section className="knowledge-repeater" aria-labelledby={titleId}>
      <div className="knowledge-repeater__header">
        <h3 id={titleId}>{label}</h3>
        <Button
          ref={addButtonRef}
          size="compact"
          variant="secondary"
          leadingIcon={<Plus />}
          onClick={onAdd}
          disabled={disabled}
        >
          {addLabel}
        </Button>
      </div>

      {items.length ? (
        <ol className="knowledge-repeater__list">
          {items.map((item, index) => (
            <li key={item.id}>
              <div
                ref={(node) => {
                  if (node) rowRefs.current.set(item.id, node);
                  else rowRefs.current.delete(item.id);
                }}
                className="knowledge-repeater__row"
                tabIndex={-1}
              >
                <div className="knowledge-repeater__content">
                  {renderItem(item, index)}
                </div>
                <div className="knowledge-repeater__actions">
                  {onMove ? (
                    <>
                      <IconButton
                        label={`Move ${label} entry ${index + 1} up`}
                        icon={<ArrowUp aria-hidden="true" />}
                        variant="quiet"
                        disabled={disabled || index === 0}
                        onClick={() => onMove(item.id, "up")}
                      />
                      <IconButton
                        label={`Move ${label} entry ${index + 1} down`}
                        icon={<ArrowDown aria-hidden="true" />}
                        variant="quiet"
                        disabled={disabled || index === items.length - 1}
                        onClick={() => onMove(item.id, "down")}
                      />
                    </>
                  ) : null}
                  <IconButton
                    label={`Remove ${label} entry ${index + 1}`}
                    icon={<Trash2 aria-hidden="true" />}
                    variant="destructive-outline"
                    disabled={disabled}
                    onClick={() => removeItem(item, index)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="knowledge-repeater__empty">{emptyMessage}</p>
      )}
    </section>
  );
}

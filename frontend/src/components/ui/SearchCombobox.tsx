import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref
} from "react";

export function SearchCombobox<T>({
  label,
  name,
  value,
  onChange,
  query,
  onQueryChange,
  items,
  itemKey,
  itemLabel,
  renderItem,
  loading = false,
  error,
  onRetry,
  required = false,
  inputRef
}: {
  label: string;
  name?: string;
  value: T | null;
  onChange: (value: T | null) => void;
  query: string;
  onQueryChange: (query: string) => void;
  items: T[];
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  required?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const generatedId = useId();
  const inputId = `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedKey = value ? itemKey(value) : undefined;
  const activeItem = activeIndex >= 0 && activeIndex < items.length
    ? items[activeIndex]
    : null;
  const showListbox = open && !loading && !error && items.length > 0;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex((current) => current >= items.length ? -1 : current);
  }, [items]);

  const select = (item: T) => {
    onChange(item);
    onQueryChange(itemLabel(item));
    setOpen(false);
    setActiveIndex(-1);
  };

  const openList = () => {
    setOpen(true);
    setActiveIndex((current) => {
      if (current >= 0 && current < items.length) return current;
      const selectedIndex = selectedKey
        ? items.findIndex((item) => itemKey(item) === selectedKey)
        : -1;
      return selectedIndex;
    });
  };

  return (
    <div className="search-combobox" ref={rootRef}>
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        role="combobox"
        type="text"
        autoComplete="off"
        value={query}
        required={required}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={showListbox ? listboxId : undefined}
        aria-activedescendant={
          showListbox && activeItem ? `${listboxId}-${itemKey(activeItem)}` : undefined
        }
        onFocus={openList}
        onClick={openList}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) openList();
            setActiveIndex((current) => Math.min(Math.max(current + 1, 0), items.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) openList();
            setActiveIndex((current) => current < 0 ? items.length - 1 : Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open && activeItem) {
            event.preventDefault();
            select(activeItem);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
      />
      {open ? (
        <div className="search-combobox__popup">
          {loading ? (
            <p className="search-combobox__status" role="status">Loading options…</p>
          ) : null}
          {!loading && error ? (
            <div className="search-combobox__error" role="alert">
              <span>{error}</span>
              {onRetry ? <button type="button" onClick={onRetry}>Try again</button> : null}
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <p className="search-combobox__status" role="status">No options found.</p>
          ) : null}
          {showListbox ? (
            <div id={listboxId} role="listbox" aria-label={`${label} options`}>
              {items.map((item, index) => {
                const key = itemKey(item);
                return (
                  <button
                    key={key}
                    id={`${listboxId}-${key}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={key === selectedKey}
                    className={index === activeIndex ? "is-active" : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => select(item)}
                  >
                    {renderItem(item)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

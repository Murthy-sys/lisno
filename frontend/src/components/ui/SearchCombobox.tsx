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
  placeholder,
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
  invalid = false,
  describedBy,
  inputRef
}: {
  label: string;
  name?: string;
  placeholder?: string;
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
  invalid?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const generatedId = useId();
  const inputId = `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const selectedKey = value ? itemKey(value) : undefined;
  const activeIndex = activeKey
    ? items.findIndex((item) => itemKey(item) === activeKey)
    : -1;
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null;
  const showListbox = open && !loading && !error && items.length > 0;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setActiveKey((current) =>
      current && items.some((item) => itemKey(item) === current)
        ? current
        : null
    );
  }, [items, itemKey]);

  const select = (item: T) => {
    onChange(item);
    onQueryChange(itemLabel(item));
    setOpen(false);
    setActiveKey(null);
  };

  const openList = () => {
    setOpen(true);
    setActiveKey((current) => {
      if (current && items.some((item) => itemKey(item) === current)) {
        return current;
      }
      return selectedKey && items.some((item) => itemKey(item) === selectedKey)
        ? selectedKey
        : null;
    });
  };

  const moveActive = (direction: 1 | -1) => {
    if (items.length === 0) {
      setActiveKey(null);
      return;
    }
    const nextIndex =
      direction === 1
        ? Math.min(Math.max(activeIndex + 1, 0), items.length - 1)
        : activeIndex < 0
          ? items.length - 1
          : Math.max(activeIndex - 1, 0);
    setActiveKey(itemKey(items[nextIndex]!));
  };

  return (
    <div className="search-combobox" ref={rootRef}>
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        placeholder={placeholder}
        role="combobox"
        type="text"
        autoComplete="off"
        value={query}
        required={required}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-controls={showListbox ? listboxId : undefined}
        aria-activedescendant={
          showListbox && activeItem ? `${listboxId}-${itemKey(activeItem)}` : undefined
        }
        onFocus={openList}
        onClick={openList}
        onChange={(event) => {
          const nextQuery = event.target.value;
          if (value && nextQuery !== itemLabel(value)) onChange(null);
          onQueryChange(nextQuery);
          setOpen(true);
          setActiveKey(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) openList();
            moveActive(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) openList();
            moveActive(-1);
          } else if (event.key === "Enter" && open && activeItem) {
            event.preventDefault();
            select(activeItem);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActiveKey(null);
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
              {items.map((item) => {
                const key = itemKey(item);
                return (
                  <button
                    key={key}
                    id={`${listboxId}-${key}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={key === selectedKey}
                    className={key === activeKey ? "is-active" : undefined}
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

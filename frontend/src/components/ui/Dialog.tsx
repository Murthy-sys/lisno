import {
  useEffect,
  useId,
  useRef,
  type ReactNode
} from "react";
import { X } from "lucide-react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

let bodyScrollLockOwners = 0;
let bodyOverflowBeforeFirstLock = "";

function acquireBodyScrollLock() {
  if (bodyScrollLockOwners === 0) {
    bodyOverflowBeforeFirstLock = document.body.style.overflow;
  }
  bodyScrollLockOwners += 1;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyScrollLockOwners = Math.max(0, bodyScrollLockOwners - 1);
    if (bodyScrollLockOwners === 0) {
      document.body.style.overflow = bodyOverflowBeforeFirstLock;
      bodyOverflowBeforeFirstLock = "";
    }
  };
}

export function Dialog({
  title,
  eyebrow = "Designer workflow",
  description,
  onClose,
  children,
  busy = false,
  role = "dialog",
  contentInert = false,
  showCloseButton = true
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
  contentInert?: boolean;
  showCloseButton?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const releaseBodyScrollLock = acquireBodyScrollLock();

    const focusFirst = window.setTimeout(() => {
      const initial = dialogRef.current?.querySelector<HTMLElement>(
        "[data-dialog-initial-focus]"
      );
      (initial ?? dialogRef.current?.querySelector<HTMLElement>(focusableSelector))
        ?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusFirst);
      document.removeEventListener("keydown", handleKeyDown);
      releaseBodyScrollLock();
      restoreFocusRef.current?.focus();
    };
  }, []);

  return (
    <div className="modal-layer">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={`Close ${title}`}
        onClick={onClose}
        disabled={busy}
      />
      <div
        ref={dialogRef}
        className="modal"
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        inert={contentInert ? true : undefined}
      >
        <header className="modal__header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          {showCloseButton ? (
            <button
              type="button"
              className="icon-button"
              aria-label={`Close ${title}`}
              onClick={onClose}
              disabled={busy}
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}

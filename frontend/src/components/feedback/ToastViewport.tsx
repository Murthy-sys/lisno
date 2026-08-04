import { forwardRef } from "react";
import { X } from "lucide-react";

import { IconButton } from "../ui/IconButton";

export interface SuccessToast {
  id: string;
  title: string;
  message?: string;
  focusOrigin: HTMLElement | null;
}

interface ToastViewportProps {
  toasts: SuccessToast[];
  onDismiss: (id: string) => void;
}

export const ToastViewport = forwardRef<HTMLElement, ToastViewportProps>(
  function ToastViewport({ toasts, onDismiss }, ref) {
    return (
      <section
        ref={ref}
        className="ui-toast-viewport"
        aria-label="Notifications"
        tabIndex={-1}
      >
        {toasts.map((toast) => (
          <article className="ui-toast" data-feedback-id={toast.id} key={toast.id}>
            <div className="ui-toast__copy">
              <h2 className="ui-toast__title">{toast.title}</h2>
              {toast.message ? <p className="ui-toast__message">{toast.message}</p> : null}
            </div>
            <IconButton
              className="ui-toast__dismiss"
              label={`Dismiss ${toast.title}`}
              icon={<X aria-hidden="true" />}
              variant="quiet"
              onClick={() => onDismiss(toast.id)}
            />
          </article>
        ))}
      </section>
    );
  }
);

import { X } from "lucide-react";

import { IconButton } from "../ui/IconButton";

export interface SuccessToast {
  id: string;
  title: string;
  message?: string;
}

export function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: SuccessToast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <section className="ui-toast-viewport" aria-label="Notifications">
      {toasts.map((toast) => (
        <article className="ui-toast" key={toast.id}>
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

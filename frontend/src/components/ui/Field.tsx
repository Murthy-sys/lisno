import { CircleAlert } from "lucide-react";
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export interface FieldControlProps {
  id: string;
  required?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

export interface FieldProps {
  id: string;
  className?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  describedBy?: string;
  required?: boolean;
  children: (controlProps: FieldControlProps) => ReactNode;
}

function joinIds(...ids: Array<string | undefined>) {
  const joined = ids.filter(Boolean).join(" ");

  return joined || undefined;
}

function classNames(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Field({
  id,
  className,
  label,
  hint,
  error,
  describedBy,
  required,
  children,
}: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const controlProps: FieldControlProps = {
    id,
    required: required || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": joinIds(hint ? hintId : undefined, error ? errorId : undefined, describedBy),
  };

  return (
    <div className={classNames("ui-field", className)}>
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {required ? <span className="ui-field__required" aria-hidden="true">*</span> : null}
      </label>
      {children(controlProps)}
      {hint ? <p className="ui-field__hint" id={hintId}>{hint}</p> : null}
      {error ? (
        <p className="ui-field__error" id={errorId}>
          <CircleAlert className="ui-field__error-icon" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={classNames("ui-control", "ui-input", className)} {...rest} />;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={classNames("ui-control", "ui-select", className)} {...rest} />;
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={classNames("ui-control", "ui-textarea", className)} {...rest} />;
});

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={classNames("ui-checkbox", className)}
      {...rest}
    />
  );
});

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type="radio"
      className={classNames("ui-radio", className)}
      {...rest}
    />
  );
});

export type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(function FileInput(
  { className, ...rest },
  ref
) {
  return <input ref={ref} type="file" className={classNames("ui-control", "ui-file-input", className)} {...rest} />;
});

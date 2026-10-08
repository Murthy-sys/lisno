import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { createVendorBasketRequest, vendorBasketRequestKeys } from "./vendorBasketRequestApi";
import { procurementError, procurementRequestKey } from "./procurementPresentation";

function normalizeName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function VendorBasketRequestDialog({ vendorName, vendorId, activeBasketNames, disabled = false, onVendorNameChange, onClose, onSent, onBusyChange }: {
  vendorName: string;
  vendorId?: string | null;
  activeBasketNames: readonly string[];
  disabled?: boolean;
  onVendorNameChange: (name: string) => void;
  onClose: () => void;
  onSent: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const client = useQueryClient();
  const vendorInput = useRef<HTMLInputElement>(null);
  const proposedInput = useRef<HTMLInputElement>(null);
  const initialFocus = useRef(vendorName.trim() ? proposedInput : vendorInput).current;
  const [proposedName, setProposedName] = useState("");
  const [validation, setValidation] = useState<{ vendorName?: string; proposedName?: string }>({});
  const submission = useRef(false);
  const command = useRef<{ vendorId: string | null; vendorName: string; proposedName: string; idempotencyKey: string } | null>(null);
  const request = useMutation({
    mutationFn: createVendorBasketRequest,
    onSuccess: async () => {
      command.current = null;
      await client.invalidateQueries({ queryKey: vendorBasketRequestKeys.mine });
      onSent();
    },
    onSettled: () => { submission.current = false; }
  });
  const pending = request.isPending;
  // Keep the containing vendor drawer from closing while the request is in flight.
  useEffect(() => { onBusyChange(pending); return () => onBusyChange(false); }, [onBusyChange, pending]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || pending || submission.current) return;
    const name = proposedName.trim().replace(/\s+/gu, " ");
    const vendor = vendorName.trim();
    if (!vendor) { setValidation({ vendorName: "Enter a vendor name." }); vendorInput.current?.focus(); return; }
    if (!name) { setValidation({ proposedName: "Enter a Main Basket name." }); proposedInput.current?.focus(); return; }
    if (activeBasketNames.some((current) => normalizeName(current) === normalizeName(name))) {
      setValidation({ proposedName: "This Main Basket is already in Configuration. Select it from the list." });
      proposedInput.current?.focus();
      return;
    }
    setValidation({});
    if (!command.current || command.current.vendorName !== vendor || command.current.vendorId !== (vendorId ?? null) || command.current.proposedName !== name) {
      command.current = { vendorId: vendorId ?? null, vendorName: vendor, proposedName: name, idempotencyKey: procurementRequestKey() };
    }
    submission.current = true;
    request.mutate(command.current);
  }

  function resetRequest() {
    setValidation({});
    request.reset();
    command.current = null;
  }
  function close() {
    if (!pending && !submission.current) onClose();
  }
  const fieldErrors = request.error instanceof ApiError ? request.error.fields : undefined;
  return <Dialog title="Request Main Basket" eyebrow="Vendor classification" description="Send a new Main Basket request to Super Admin. It will appear in Configuration after approval." busy={pending} onClose={close} initialFocusRef={initialFocus}>
    <form className="vendor-profile__basket-request" noValidate onSubmit={submit}>
      <Field id={`${id}-vendor`} label="Vendor name" required={!vendorId} error={validation.vendorName || fieldErrors?.vendorName} hint={vendorId ? "Saved vendor" : "Updates Entity Name in the vendor form. The vendor is not saved yet."}>
        {(props) => <Input {...props} ref={vendorInput} value={vendorName} maxLength={240} readOnly={Boolean(vendorId)} disabled={disabled || pending} onChange={(event) => {
          if (vendorId || disabled || pending || submission.current) return;
          onVendorNameChange(event.target.value);
          resetRequest();
        }} />}
      </Field>
      <Field id={`${id}-name`} label="New Main Basket name" required error={validation.proposedName || fieldErrors?.proposedName}>
        {(props) => <Input {...props} ref={proposedInput} maxLength={240} value={proposedName} disabled={disabled || pending} onChange={(event) => {
          if (disabled || pending || submission.current) return;
          setProposedName(event.target.value);
          resetRequest();
        }} />}
      </Field>
      {request.isError ? <InlineMessage tone="error" role="alert">{procurementError(request.error, "The request could not be sent. Your entries are preserved; retry.")}</InlineMessage> : null}
      <div className="vendor-profile__basket-request-actions">
        <Button variant="secondary" disabled={pending} onClick={close}>Cancel</Button>
        <Button type="submit" busy={pending} disabled={disabled || !vendorName.trim() || !proposedName.trim() || pending}>Send request</Button>
      </div>
    </form>
  </Dialog>;
}

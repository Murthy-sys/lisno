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

export function VendorBasketRequestDialog({ vendorName, vendorId, activeBasketNames, onClose, onSent, onBusyChange }: {
  vendorName: string;
  vendorId?: string | null;
  activeBasketNames: readonly string[];
  onClose: () => void;
  onSent: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const client = useQueryClient();
  const proposedInput = useRef<HTMLInputElement>(null);
  const [proposedName, setProposedName] = useState("");
  const [validation, setValidation] = useState("");
  const command = useRef<{ vendorId: string | null; vendorName: string; proposedName: string; idempotencyKey: string } | null>(null);
  const request = useMutation({
    mutationFn: createVendorBasketRequest,
    onSuccess: async () => {
      command.current = null;
      await client.invalidateQueries({ queryKey: vendorBasketRequestKeys.mine });
      onSent();
    }
  });
  const pending = request.isPending;
  // Keep the containing vendor drawer from closing while the request is in flight.
  useEffect(() => { onBusyChange(pending); return () => onBusyChange(false); }, [onBusyChange, pending]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    const name = proposedName.trim().replace(/\s+/gu, " ");
    const vendor = vendorName.trim();
    if (!vendor) { setValidation("Enter the vendor name in the form first."); return; }
    if (!name) { setValidation("Enter a Main Basket name."); proposedInput.current?.focus(); return; }
    if (activeBasketNames.some((current) => normalizeName(current) === normalizeName(name))) {
      setValidation("This Main Basket is already in Configuration. Select it from the list.");
      proposedInput.current?.focus();
      return;
    }
    setValidation("");
    if (!command.current || command.current.vendorName !== vendor || command.current.vendorId !== (vendorId ?? null) || command.current.proposedName !== name) {
      command.current = { vendorId: vendorId ?? null, vendorName: vendor, proposedName: name, idempotencyKey: procurementRequestKey() };
    }
    request.mutate(command.current);
  }

  const error = validation || (request.error instanceof ApiError ? request.error.fields?.proposedName : undefined);
  return <Dialog title="Request Main Basket" eyebrow="Vendor classification" description="Send a new Main Basket request to Super Admin. It will appear in Configuration after approval." busy={pending} onClose={onClose} initialFocusRef={proposedInput}>
    <form className="vendor-profile__basket-request" noValidate onSubmit={submit}>
      <Field id={`${id}-vendor`} label="Vendor name" hint={!vendorName.trim() ? "Enter the vendor name in the form first." : vendorId ? "Saved vendor" : "Entered name, vendor not yet saved"}>
        {(props) => <Input {...props} value={vendorName} readOnly />}
      </Field>
      <Field id={`${id}-name`} label="New Main Basket name" required error={error}>
        {(props) => <Input {...props} ref={proposedInput} maxLength={240} value={proposedName} disabled={pending} onChange={(event) => { setProposedName(event.target.value); setValidation(""); request.reset(); command.current = null; }} />}
      </Field>
      {request.isError ? <InlineMessage tone="error" role="alert">{procurementError(request.error, "The request could not be sent. Your entries are preserved; retry.")}</InlineMessage> : null}
      <div className="vendor-profile__basket-request-actions">
        <Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="submit" busy={pending} disabled={!vendorName.trim() || !proposedName.trim() || pending}>Send request</Button>
      </div>
    </form>
  </Dialog>;
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { procurementRequestKey } from "../procurement/procurementPresentation";
import { useBasketNotifications } from "../notifications/BasketNotifications";
import { createConfigurationSubBasketRequest, vendorBasketRequestKeys, type CreateConfigurationSubBasketRequestInput, type VendorBasketRequest } from "../procurement/vendorBasketRequestApi";

interface Props {
  readonly basketId: string;
  readonly basketName: string;
  readonly onClose: () => void;
  readonly onRequested: (request: VendorBasketRequest) => void;
}

export function KnowledgeSubBasketRequestPanel(props: Props) {
  const auth = useAuth();
  return <RequestSession key={`${auth.user?.id ?? "anonymous"}:${props.basketId}`} {...props} />;
}

function RequestSession({ basketId, basketName, onClose, onRequested }: Props) {
  const auth = useAuth();
  const notifications = useBasketNotifications();
  const client = useQueryClient();
  const id = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [command, setCommand] = useState<CreateConfigurationSubBasketRequestInput | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const allowed = auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.create");
  const mutation = useMutation({
    mutationFn: createConfigurationSubBasketRequest,
    onSuccess: request => {
      if (!mounted.current) return;
      void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.review });
      notifications?.refresh();
      onRequested(request);
    },
    onSettled: () => { submitting.current = false; }
  });
  const definiteFailure = mutation.error instanceof ApiError && mutation.error.status >= 400 && mutation.error.status < 500 && mutation.error.status !== 408;
  const denied = mutation.error instanceof ApiError && [401, 403].includes(mutation.error.status);
  const frozen = Boolean(command) || mutation.isPending || mutation.isSuccess || !allowed || denied;
  const cleanName = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const cleanDescription = description.normalize("NFKC").trim();
  const nameError = !cleanName ? "Enter a Sub-Basket name." : cleanName.length > 240 ? "Use at most 240 characters." : undefined;
  const descriptionError = !cleanDescription ? "Describe the Sub-Basket." : cleanDescription.length > 4000 ? "Use at most 4000 characters." : undefined;
  const fields = mutation.error instanceof ApiError ? mutation.error.fields : undefined;

  function submit(event: FormEvent) {
    event.preventDefault(); event.stopPropagation();
    if (!allowed || denied || submitting.current || mutation.isSuccess) return;
    setAttempted(true);
    if (!command && (nameError || descriptionError)) return;
    const next = command ?? { basketId, name: cleanName, description: cleanDescription, idempotencyKey: procurementRequestKey() };
    submitting.current = true;
    setCommand(next);
    mutation.mutate(next);
  }

  return <ContextPanel title="Request Sub-Basket" eyebrow="Configuration" description="Submit the missing Sub-Basket for approval. It becomes available in the catalog after approval."
    onClose={onClose} busy={mutation.isPending} dirty={!mutation.isSuccess && Boolean(name || description || command)} initialFocusRef={nameInput} width="medium" className="knowledge-context-panel">
    {({ requestClose }) => <form className="knowledge-dialog-form" noValidate onSubmit={submit}>
      <div className="knowledge-dialog-body">
        <p>Main Basket: <strong>{basketName}</strong></p>
        {!allowed || denied ? <InlineMessage tone="error" role="alert">You do not have permission to submit this request.</InlineMessage> : null}
        <Field id={`${id}-name`} label="Sub-Basket name" required error={fields?.name ?? (attempted ? nameError : undefined)}>
          {props => <Input {...props} ref={nameInput} value={name} maxLength={240} disabled={frozen} onChange={event => setName(event.target.value)} />}
        </Field>
        <Field id={`${id}-description`} label="Description" required error={fields?.description ?? (attempted ? descriptionError : undefined)}>
          {props => <Textarea {...props} value={description} maxLength={4000} rows={4} disabled={frozen} onChange={event => setDescription(event.target.value)} />}
        </Field>
        {mutation.isSuccess ? <InlineMessage tone={mutation.data.status === "rejected" ? "warning" : "success"} role="status">{mutation.data.status === "pending"
          ? "Request submitted. The Sub-Basket is pending approval and has not been added to the catalog."
          : mutation.data.status === "fulfilled" ? "This request has already been approved. Refresh the catalog to select the Sub-Basket."
          : `This request was rejected.${mutation.data.reason ? ` ${mutation.data.reason}` : ""}`}</InlineMessage> : null}
        {mutation.isError ? <InlineMessage tone="error" role="alert">{mutation.error instanceof ApiError ? mutation.error.message : "The request could not be confirmed. Retry the same request to confirm its saved result."}</InlineMessage> : null}
        {mutation.isError && command && !definiteFailure ? <p>Your entries are preserved. Retrying will not submit a duplicate request.</p> : null}
      </div>
      <div className="knowledge-dialog-actions">
        <Button variant="secondary" disabled={mutation.isPending} onClick={requestClose}>{mutation.isSuccess ? "Done" : "Cancel"}</Button>
        {definiteFailure && !denied ? <Button variant="secondary" onClick={() => { setCommand(null); mutation.reset(); }}>Edit request</Button> : null}
        {!mutation.isSuccess ? <Button type="submit" busy={mutation.isPending} disabled={!allowed || denied || (!command && (!cleanName || !cleanDescription))}>{mutation.isError ? "Retry request" : "Submit for approval"}</Button> : null}
      </div>
    </form>}
  </ContextPanel>;
}

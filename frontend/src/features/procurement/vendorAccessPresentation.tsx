import { ApiError } from "../../api/client";
import type { VendorAccessAction, VendorAccessDelivery, VendorAccessInvitation, VendorDeliveryReadiness, VendorLoginAccess } from "./vendorLoginAccessApi";

export const vendorAccessActionLabels: Record<VendorAccessAction, string> = {
  send_invitation: "Send invitation", resend_invitation: "Resend invitation", send_work_notification: "Send work notification"
};
const deliveryLabels: Record<VendorAccessDelivery["state"], string> = {
  not_requested: "Email not requested", queued: "Email queued", sending: "Email sending", sent: "Email sent", failed: "Email failed",
  delivery_unavailable: "Email unavailable", intervention_required: "Staff action required", cancelled: "Delivery cancelled"
};
const accessLabels: Record<VendorLoginAccess["access"], string> = {
  unknown: "Access not yet confirmed", setup_pending: "Password setup pending", active: "Account active", blocked: "Access blocked"
};
const reasons: Record<string, string> = {
  DELIVERY_PAUSED: "Vendor email delivery is paused. Ask Super Admin to enable delivery before sending.",
  DELIVERY_UNAVAILABLE: "Vendor email delivery is unavailable. Ask Super Admin to check the email service.",
  VENDOR_CONTACT_INVALID: "Update and save the vendor representative name, email and mobile before sending.",
  VENDOR_CONTACT_CHANGED: "The saved vendor contact has changed. Refresh access before sending.",
  VENDOR_ACCOUNT_AMBIGUOUS: "More than one account is bound to this vendor. Super Admin must resolve the account binding.",
  VENDOR_ACCOUNT_UNAVAILABLE: "The vendor account is inactive or ineligible. Super Admin must review its access.",
  VENDOR_UNAVAILABLE: "This vendor is unavailable. Review its current status before sending.",
  VENDOR_EMAIL_CONFLICT: "The saved email belongs to another account. Super Admin must review the account binding.",
  DEMO_EXTERNAL_DELIVERY_BLOCKED: "Email delivery is disabled for this demonstration account. Use an eligible saved vendor contact.",
  INVITATION_STAFF_ACTION_REQUIRED: "This invitation needs Super Admin review before it can be sent or resent.",
  MANUAL_SEND_REQUIRED: "This order needs an explicit send request. Use the available action to contact the vendor.",
  DELIVERY_ACKNOWLEDGEMENT_UNCERTAIN: "The email provider response was not confirmed. Check delivery with Super Admin before sending again.",
  INVITATION_UNAVAILABLE: "The invitation is no longer available. Refresh access and ask Super Admin to review its status.",
  INVITATION_NOT_ACTIONABLE: "The invitation cannot be sent in its current state. Refresh access to review the available action.",
  VERSION_CONFLICT: "Access status changed. Refresh access before sending again.",
  TOO_MANY_ATTEMPTS: "The delivery retry limit was reached. Ask Super Admin to check delivery before trying again.",
  IDEMPOTENCY_CONFLICT: "This request no longer matches its saved command. Refresh access before starting a new request.",
  ISSUED_WORK_UNAVAILABLE: "This issued work is no longer available for delivery.",
  INVITATION_DELIVERY_FAILED: "The password setup email could not be delivered. Check the saved contact and delivery service before retrying.",
  VENDOR_DELIVERY_FAILED: "The email could not be delivered. Check delivery availability before retrying.",
  INVITATION_CONFLICT: "An incompatible invitation exists. Super Admin must review it before a new invitation can be sent.",
  INVITATION_MANAGED_ELSEWHERE: "This invitation is managed by Super Admin. Ask Super Admin to review or resend it.",
  EMAIL_ALREADY_IN_USE: "This email belongs to another account. Super Admin must review the account binding.",
  INVITATION_COOLDOWN: "A recent invitation is still within the resend cooldown. Refresh access when the cooldown ends.",
  DELIVERY_IN_PROGRESS: "A delivery request is already in progress. Its status will update automatically."
};
export const accessDenied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);
export const uncertainAccessCommand = (error: unknown) => !(error instanceof ApiError) || error.status >= 500 || error.status === 408;
export function accessCommandError(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return "Access status changed. Review the refreshed status before sending again.";
  if (error instanceof ApiError && error.status === 429) return "Too many requests. Wait before trying again.";
  if (error instanceof ApiError && reasons[error.code]) return reasons[error.code];
  return uncertainAccessCommand(error)
    ? "The delivery request could not be confirmed. Retry the same request or refresh access to check its status."
    : "The delivery request could not be accepted. Refresh access and review the current status.";
}
export function deliveryNotice(delivery: VendorAccessDelivery) {
  if (delivery.state === "sent") return "Email sent. Password setup is confirmed separately.";
  if (delivery.state === "queued" || delivery.state === "sending") return "Email queued. Delivery status will update after processing.";
  return "Request recorded. Review the delivery status below.";
}
function AccessTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>;
}
export function VendorReadinessMessage({ readiness }: { readiness: VendorDeliveryReadiness }) {
  return readiness.state === "ready" ? null : <p className="vendor-access__availability" role="status">{readiness.state === "paused" ? reasons.DELIVERY_PAUSED : reasons.DELIVERY_UNAVAILABLE}</p>;
}
export function VendorAccessStatus({ access, delivery, invitation, blockedReasonCode }: {
  access: VendorLoginAccess["access"]; delivery: VendorAccessDelivery; invitation: VendorAccessInvitation | null; blockedReasonCode: string | null;
}) {
  const codes = [...new Set([blockedReasonCode, delivery.failureCode].filter((value): value is string => Boolean(value)))];
  return <div className="vendor-access__state">
    <strong>{accessLabels[access]}</strong><span>{deliveryLabels[delivery.state]}</span>
    {delivery.sentAt ? <small>Last sent <AccessTime value={delivery.sentAt} /></small> : delivery.updatedAt ? <small>Last updated <AccessTime value={delivery.updatedAt} /></small> : null}
    {invitation && ["pending", "expired"].includes(invitation.status) && access !== "active" ? <small>{invitation.status === "expired" ? "Setup link expired" : "Setup link expires"} <AccessTime value={invitation.expiresAt} /></small> : null}
    {delivery.cooldownUntil ? <small>Next send available after <AccessTime value={delivery.cooldownUntil} />. Refresh access to check availability.</small> : null}
    {codes.map(code => <p key={code}>{reasons[code] ?? "Vendor access needs staff attention. Review the saved contact and ask Super Admin to check the account or invitation."}</p>)}
    {delivery.state === "sent" && access !== "active" ? <small>Sent confirms email delivery acceptance, not password setup.</small> : null}
  </div>;
}

import { BadgeCheck, Boxes, Building2, CircleX, FileText, Hammer, IdCard, IndianRupee, Mail, MapPin, Package, Phone, ShieldCheck, User, UserRound, Users } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Checkbox, Field, Input, Radio, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PanelSection } from "../../components/ui/PanelSection";
import { normalizeExecutionTypes, VENDOR_TEXT_FIELDS, type VendorDraft, type VendorTextField } from "./vendorProfileDraft";

type VendorOptionDetails = Readonly<Record<string, { icon: ReactNode; caption: string }>>;
const VENDOR_TYPE_DETAILS: VendorOptionDetails = { execution: { icon: <Hammer aria-hidden="true" />, caption: "Labour or material + labour for project execution." }, supplier: { icon: <Package aria-hidden="true" />, caption: "Supplies materials, products or services." } };
const SUPPLIER_DETAILS: VendorOptionDetails = { yes: { icon: <BadgeCheck aria-hidden="true" />, caption: "Registered supplier." }, no: { icon: <CircleX aria-hidden="true" />, caption: "Not a supplier." } };
const EXECUTION_TYPE_DETAILS = { labor: { icon: <User aria-hidden="true" />, caption: "Skilled or unskilled labour." }, material_labour: { icon: <Boxes aria-hidden="true" />, caption: "Both materials and labour." } };
const TEXT_FIELD_ICONS: Readonly<Record<VendorTextField, ReactNode>> = {
  nameOfRepresentative: <User aria-hidden="true" />, position: <UserRound aria-hidden="true" />, reference: <FileText aria-hidden="true" />,
  workProfile: <FileText aria-hidden="true" />, email: <Mail aria-hidden="true" />, phoneNumber: <Phone aria-hidden="true" />, address: <MapPin aria-hidden="true" />,
  aadhar: <IdCard aria-hidden="true" />, pan: <IdCard aria-hidden="true" />, currentAddress: <MapPin aria-hidden="true" />
};
const TEXT_FIELD_PLACEHOLDERS: Readonly<Record<VendorTextField, string>> = {
  nameOfRepresentative: "Enter representative name", position: "E.g. Owner, Manager, Partner", reference: "E.g. Previous projects, clients, recommendations",
  workProfile: "Describe the vendor's work profile, expertise, and services offered…", email: "vendor@example.com", phoneNumber: "Enter phone number", address: "Enter complete address",
  aadhar: "Enter 12 digit AADHAR number", pan: "Enter PAN number (e.g. ABCDE1234F)", currentAddress: "Enter current address"
};

export function VendorRadioGroup({ label, value, options = [["yes", "Yes"], ["no", "No"]], onChange, error, variant = "inline", details }: {
  label: string; value: string; options?: readonly (readonly [string, string])[]; onChange: (value: string) => void; error?: string;
  variant?: "inline" | "cards"; details?: VendorOptionDetails;
}) {
  const id = useId();
  return <fieldset className={variant === "cards" ? "vendor-profile__radio-group vendor-profile__radio-group--cards" : "vendor-profile__radio-group"} aria-describedby={error ? `${id}-error` : undefined}>
    <legend>{label} <span aria-hidden="true">*</span></legend>
    {variant === "cards" ? <div className="vendor-profile__options">{options.map(([key, text]) => <div key={key} className="vendor-profile__option"><label className="vendor-profile__option-label"><Radio name={id} value={key} checked={value === key} required aria-invalid={Boolean(error) || undefined} onChange={() => onChange(key)} /><span className="vendor-profile__option-title">{text}</span></label>{details?.[key] ? <span className="vendor-profile__option-meta"><span className="vendor-profile__option-icon" aria-hidden="true">{details[key].icon}</span><span className="vendor-profile__option-caption">{details[key].caption}</span></span> : null}</div>)}</div>
      : <div>{options.map(([key, text]) => <label key={key}><Radio name={id} value={key} checked={value === key} required aria-invalid={Boolean(error) || undefined} onChange={() => onChange(key)} />{text}</label>)}</div>}
    {error ? <p id={`${id}-error`} className="ui-field__error">{error}</p> : null}
  </fieldset>;
}

export function VendorProfileFields({ draft, errors, existing, onChange }: {
  draft: VendorDraft; errors: Record<string, string>; existing: boolean; onChange: <K extends keyof VendorDraft>(key: K, value: VendorDraft[K]) => void;
}) {
  const id = useId();
  function text(key: VendorTextField, multiline = false) {
    const maxLength = multiline ? 4000 : key === "email" ? 320 : key === "phoneNumber" ? 64 : 240;
    return <Field key={key} id={`${id}-${key}`} label={VENDOR_TEXT_FIELDS[key]} required error={errors[key]}>
      {(props) => <><div className={multiline ? "vendor-profile__adorned vendor-profile__adorned--multiline" : "vendor-profile__adorned"}><span className="vendor-profile__adorned-icon" aria-hidden="true">{TEXT_FIELD_ICONS[key]}</span>
        {multiline ? <Textarea {...props} value={draft[key]} maxLength={maxLength} rows={3} onChange={(event) => onChange(key, event.target.value)} placeholder={TEXT_FIELD_PLACEHOLDERS[key]} /> : <Input {...props} type={key === "email" ? "email" : key === "phoneNumber" ? "tel" : "text"} value={draft[key]} maxLength={key === "aadhar" ? 20 : key === "pan" ? 10 : maxLength} autoComplete="off" onChange={(event) => onChange(key, event.target.value)} placeholder={TEXT_FIELD_PLACEHOLDERS[key]} />}
      </div>{key === "workProfile" ? <p className="vendor-profile__counter" aria-hidden="true">{draft.workProfile.length}/4000</p> : null}</>}
    </Field>;
  }
  function yesNo(key: "supplier" | "gstRegistered" | "msmeRegistered" | "currentAddressVerifiedPhysically", label: string, details?: VendorOptionDetails) {
    return <VendorRadioGroup label={label} value={draft[key]} error={errors[key]} onChange={(value) => onChange(key, value as "yes" | "no")} variant={details ? "cards" : "inline"} details={details} />;
  }
  return <>
    <PanelSection className="vendor-profile__section vendor-profile__section--classification" icon={<Users aria-hidden="true" />} title="Vendor Classification" description="Select vendor type and category to define their role in projects."><div className="vendor-profile__classification">
      <VendorRadioGroup label="Vendor Type" value={draft.vendorType} options={[["execution", "Execution"], ["supplier", "Supplier"]]} error={errors.vendorType} onChange={(value) => onChange("vendorType", value as VendorDraft["vendorType"])} variant="cards" details={VENDOR_TYPE_DETAILS} />
      {draft.vendorType === "execution" ? <fieldset className="vendor-profile__radio-group vendor-profile__radio-group--cards" aria-describedby={`${id}-execution-hint${errors.executionType ? ` ${id}-execution-error` : ""}`}>
        <legend>Execution Type <span aria-hidden="true">*</span></legend>
        <p id={`${id}-execution-hint`} className="vendor-procurement__muted">Select at least one. Both options can be selected.</p>
        <div className="vendor-profile__options">{([["labor", "Labor"], ["material_labour", "Material + Labour"]] as const).map(([value, label]) => <div key={value} className="vendor-profile__option"><label className="vendor-profile__option-label">
          <Checkbox name={`${id}-execution`} value={value} checked={draft.executionType.includes(value)} aria-invalid={Boolean(errors.executionType) || undefined} aria-describedby={`${id}-execution-hint${errors.executionType ? ` ${id}-execution-error` : ""}`} onChange={(event) => onChange("executionType", normalizeExecutionTypes(event.target.checked ? [...draft.executionType, value] : draft.executionType.filter((selection) => selection !== value)))} />
          <span className="vendor-profile__option-title">{label}</span>
        </label><span className="vendor-profile__option-meta"><span className="vendor-profile__option-icon" aria-hidden="true">{EXECUTION_TYPE_DETAILS[value].icon}</span><span className="vendor-profile__option-caption">{EXECUTION_TYPE_DETAILS[value].caption}</span></span></div>)}</div>
        {errors.executionType ? <p id={`${id}-execution-error`} className="ui-field__error">{errors.executionType}</p> : null}
      </fieldset> : null}
      {draft.vendorType === "supplier" ? yesNo("supplier", "Supplier", SUPPLIER_DETAILS) : null}
    </div></PanelSection>
    <PanelSection className="vendor-profile__section vendor-profile__section--information" icon={<FileText aria-hidden="true" />} title="Vendor Information" description="Basic details about the vendor and their business.">
      <div className="vendor-profile__grid">
        <Field id={`${id}-name`} label="Entity Name" required error={errors.name}>{(props) => <div className="vendor-profile__adorned"><span className="vendor-profile__adorned-icon" aria-hidden="true"><Building2 aria-hidden="true" /></span><Input {...props} value={draft.name} maxLength={240} onChange={(event) => onChange("name", event.target.value)} placeholder="Enter entity or company name" /></div>}</Field>
        {text("nameOfRepresentative")}{text("position")}
        {existing ? <Field id={`${id}-status`} label="Status">{(props) => <Select {...props} value={draft.status} onChange={(event) => onChange("status", event.target.value as VendorDraft["status"])}><option value="active">Active</option><option value="inactive">Inactive</option></Select>}</Field> : null}
        {yesNo("gstRegistered", "GST Registered")}{yesNo("msmeRegistered", "MSME Registered")}
        <Field id={`${id}-self`} label="Turnover (Self Declared) (INR)" required error={errors.turnoverSelfDeclaredPaise}>{(props) => <div className="vendor-profile__adorned"><span className="vendor-profile__adorned-icon" aria-hidden="true"><IndianRupee aria-hidden="true" /></span><Input {...props} inputMode="decimal" maxLength={20} value={draft.turnoverSelfDeclared} onChange={(event) => onChange("turnoverSelfDeclared", event.target.value)} placeholder="Enter self declared turnover" /></div>}</Field>
        <Field id={`${id}-verified`} label="Turnover (Verified) (INR)" hint={draft.turnoverVerified.trim() ? "Recorded separately from self-declared turnover." : "NA. Leave blank when verified turnover is not available."} error={errors.turnoverVerifiedPaise}>{(props) => <div className="vendor-profile__adorned"><span className="vendor-profile__adorned-icon" aria-hidden="true"><IndianRupee aria-hidden="true" /></span><Input {...props} inputMode="decimal" placeholder="NA" maxLength={20} value={draft.turnoverVerified} onChange={(event) => onChange("turnoverVerified", event.target.value)} /></div>}</Field>
        {text("reference")}
      </div>
      {text("workProfile", true)}
      <Field id={`${id}-description`} label="Directory description" hint="Optional summary visible in existing vendor configuration.">{(props) => <Textarea {...props} rows={2} maxLength={4000} value={draft.description} onChange={(event) => onChange("description", event.target.value)} />}</Field>
    </PanelSection>
    <PanelSection className="vendor-profile__section vendor-profile__section--contact" icon={<Phone aria-hidden="true" />} title="Contact Information" description="Communication and address details."><div className="vendor-profile__grid">{text("email")}{text("phoneNumber")}</div>{text("address", true)}</PanelSection>
    <PanelSection className="vendor-profile__section vendor-profile__section--identity" icon={<ShieldCheck aria-hidden="true" />} title="Identity & Verification" description="Government identification details.">
      <div className="vendor-profile__grid">{text("aadhar")}{text("pan")}</div>{text("currentAddress", true)}
      {yesNo("currentAddressVerifiedPhysically", "Current Address Verified Physically")}
      {draft.currentAddressVerifiedPhysically === "no" ? <InlineMessage tone="warning"><strong>More than ₹50K work allocation won't be possible.</strong><p>The limit applies to recorded commitments across all projects.</p></InlineMessage> : draft.currentAddressVerifiedPhysically === "" ? <p className="vendor-procurement__muted">Physical verification is incomplete. This vendor remains subject to the allocation limit.</p> : null}
    </PanelSection>
  </>;
}

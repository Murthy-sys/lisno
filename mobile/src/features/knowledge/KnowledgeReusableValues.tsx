import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import type { KnowledgeCreateMasterInput, KnowledgeTaxVersionInput } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeMaster, KnowledgeMasterType } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import { Button, Field, StateView } from "../../ui/primitives";
import { allKnowledgePages, type KnowledgeMobileContext } from "./knowledgeRuntime";
import { KnowledgeCard, KnowledgeChoice, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles as s } from "./knowledgeUi";
import { KnowledgeVendorEditor } from "./KnowledgeVendorEditor";
import { catalogError, closeCatalogDraft } from "./knowledgeCatalogForms";

const TYPES = [{ value: "uoms", label: "UOMs" }, { value: "vendors", label: "Vendors" }, { value: "taxes", label: "Taxes" }, { value: "priorities", label: "Priorities" }, { value: "surfaces", label: "Surfaces" }] as const;
const SINGULAR = { uoms: "UOM", vendors: "Vendor", taxes: "Tax", priorities: "Priority", surfaces: "Surface", modes: "Mode" };

export function KnowledgeReusableValues({ context, onClose }: { readonly context: KnowledgeMobileContext; readonly onClose: () => void }) {
  const [type, setType] = useState<KnowledgeMasterType>("uoms");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<KnowledgeMaster | "new" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<KnowledgeMaster | null>(null);
  const values = useQuery({ queryKey: context.key("masters", type, "management"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeMasters(type, { ...page, includeArchived: true })), enabled: context.ready && context.canRead });
  const visible = (values.data ?? []).filter(value => (!status ? value.status !== "archived" : value.status === status) && `${value.name} ${value.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <KnowledgeModal title="Reusable values" onClose={onClose}>
    <KnowledgeSelect label="Reusable value category" value={type} options={TYPES} allowEmpty={false} onChange={value => { setType(value as KnowledgeMasterType); setSearch(""); setStatus(""); setEditor(null); setArchiveTarget(null); }} />
    <Field label={`Search ${SINGULAR[type]}`} value={search} onChangeText={setSearch} />
    <KnowledgeSelect label="Status" value={status} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "archived", label: "Archived" }]} placeholder="All current" onChange={setStatus} />
    {context.canCreate ? <Button label={`Add ${SINGULAR[type]}`} onPress={() => setEditor("new")} /> : null}
    {values.isPending ? <KnowledgeText>Loading reusable values…</KnowledgeText> : null}
    {values.isError ? <StateView title="Reusable values unavailable" message={catalogError(values.error)} actionLabel="Retry reusable values" onAction={() => void values.refetch()} /> : null}
    {visible.map(value => <KnowledgeCard title={value.name} key={value.id}>
      <KnowledgeText>{value.code} · {value.status}</KnowledgeText>
      {value.description ? <KnowledgeText>{value.description}</KnowledgeText> : null}
      {type === "uoms" ? <KnowledgeText>Quantity decimal places: {value.decimalScale ?? 0}</KnowledgeText> : null}
      {value.taxVersions?.map(version => <KnowledgeText key={version.id}>Tax version {version.versionNumber}: {version.rateBps / 100}% · {version.treatment} · {version.status} · {version.applicability} · From {version.effectiveFrom}{version.effectiveTo ? ` to ${version.effectiveTo}` : ""}</KnowledgeText>)}
      <View style={s.row}>{type === "vendors" ? <Button label={`View ${value.name}`} variant="secondary" onPress={() => setEditor(value)} /> : null}{context.canUpdate && value.status !== "archived" && type !== "vendors" ? <Button label={`Edit ${value.name}`} variant="secondary" onPress={() => setEditor(value)} /> : null}
        {context.canLifecycle && value.status !== "archived" ? <Button label={`Archive ${value.name}`} variant="danger" onPress={() => setArchiveTarget(value)} /> : null}</View>
    </KnowledgeCard>)}
    {values.isSuccess && !visible.length ? <KnowledgeText>No reusable values match.</KnowledgeText> : null}
    {editor ? type === "vendors" ? <KnowledgeVendorEditor context={context} {...(editor === "new" ? {} : { existing: editor })} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void values.refetch(); }} /> : <KnowledgeReusableEditor context={context} type={type} {...(editor === "new" ? {} : { existing: editor })} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void values.refetch(); }} /> : null}
    {archiveTarget ? <KnowledgeArchiveValue context={context} type={type} target={archiveTarget} onClose={() => setArchiveTarget(null)} onSaved={() => { setArchiveTarget(null); void values.refetch(); }} /> : null}
  </KnowledgeModal>;
}

export function KnowledgeReusableEditor({ context, type, existing, onClose, onSaved }: { readonly context: KnowledgeMobileContext; readonly type: KnowledgeMasterType; readonly existing?: KnowledgeMaster; readonly onClose: () => void; readonly onSaved: (value: KnowledgeMaster) => void }) {
  const [code, setCode] = useState(existing?.code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [order, setOrder] = useState(String(existing?.displayOrder ?? 0));
  const [status, setStatus] = useState(existing?.status === "inactive" ? "inactive" : "active");
  const [scale, setScale] = useState(String(existing?.decimalScale ?? 0));
  const [appendTax, setAppendTax] = useState(!existing && type === "taxes");
  const [rate, setRate] = useState("");
  const [treatment, setTreatment] = useState("exclusive");
  const [applicability, setApplicability] = useState("");
  const [taxStatus, setTaxStatus] = useState("draft");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [conflict, setConflict] = useState(false);
  const date = (value: string) => { const parsed = new Date(value); return value.trim() && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; };
  const effectiveFrom = date(from);
  const effectiveTo = to.trim() ? date(to) : null;
  const taxValid = !appendTax || (type === "taxes" && rate.trim() !== "" && Number.isSafeInteger(Number(rate)) && Number(rate) >= 0 && Number(rate) <= 100000 && applicability.trim() && effectiveFrom && (!to.trim() || (effectiveTo && effectiveTo > effectiveFrom)));
  const canWrite = context.ready && context.canRead && (existing ? context.canUpdate : context.canCreate);
  const valid = canWrite && type !== "vendors" && !conflict && name.trim() && (type === "surfaces" || code.trim()) && Number.isSafeInteger(Number(order)) && Number(order) >= 0 && (type !== "uoms" || [0, 1, 2, 3].includes(Number(scale))) && taxValid;
  const mutation = useMutation({ mutationFn: async () => {
    if (!valid) throw new Error("Review the reusable value fields before saving.");
    if (type === "surfaces") return existing ? context.api.updateKnowledgeSurface(existing.id, { expectedVersion: existing.version, name: name.trim(), description: description.trim() || null, status: status as "active" | "inactive" }) : context.api.createKnowledgeSurface({ name: name.trim(), description: description.trim() || null });
    const taxVersion: KnowledgeTaxVersionInput | undefined = appendTax && effectiveFrom ? { rateBps: Number(rate), treatment: treatment as "exclusive" | "inclusive", applicability: applicability.trim(), effectiveFrom, effectiveTo, status: taxStatus as "draft" | "active" | "inactive" } : undefined;
    const input: KnowledgeCreateMasterInput = { code: code.trim(), name: name.trim(), description: description.trim() || null, ...(type === "uoms" ? { decimalScale: Number(scale) } : {}), ...(taxVersion ? { taxVersion } : {}) };
    return existing ? context.api.updateKnowledgeMaster(type, existing.id, { ...input, expectedVersion: existing.version, displayOrder: Number(order), status: status as "active" | "inactive" }) : context.api.createKnowledgeMaster(type, input);
  }, retry: false, onSuccess: async value => { await context.refresh(); onSaved(value); }, onError: error => { if (error instanceof ApiError && error.code === "VERSION_CONFLICT") setConflict(true); } });
  const dirty = code !== (existing?.code ?? "") || name !== (existing?.name ?? "") || description !== (existing?.description ?? "") || order !== String(existing?.displayOrder ?? 0) || status !== (existing?.status === "inactive" ? "inactive" : "active") || scale !== String(existing?.decimalScale ?? 0) || appendTax !== (!existing && type === "taxes") || Boolean(rate || applicability || from || to) || treatment !== "exclusive" || taxStatus !== "draft";
  const disabled = mutation.isPending || conflict;
  return <KnowledgeModal title={`${existing ? "Edit" : "Add"} ${SINGULAR[type]}`} onClose={() => closeCatalogDraft(dirty, onClose)} busy={mutation.isPending}>
    {type !== "surfaces" ? <Field label="Code" value={code} onChangeText={setCode} maxLength={64} editable={!disabled} /> : null}
    <Field label="Name" value={name} onChangeText={setName} maxLength={240} editable={!disabled} />
    <Field label="Description" value={description} onChangeText={setDescription} multiline maxLength={4000} editable={!disabled} />
    {existing && type !== "surfaces" ? <Field label="Display order" value={order} onChangeText={setOrder} keyboardType="number-pad" editable={!disabled} /> : null}
    {existing ? <KnowledgeSelect label="Status" value={status} onChange={setStatus} disabled={disabled} allowEmpty={false} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /> : null}
    {type === "uoms" ? <KnowledgeSelect label="Quantity decimal places" value={scale} onChange={setScale} disabled={disabled} allowEmpty={false} options={[0, 1, 2, 3].map(value => ({ value: String(value), label: String(value) }))} /> : null}
    {type === "taxes" ? <KnowledgeCard title="Tax version">
      {existing ? <KnowledgeChoice label="Append a new tax version" multiple selected={appendTax} onPress={() => setAppendTax(!appendTax)} disabled={disabled} /> : null}
      {appendTax ? <>
        <Field label="Rate (basis points)" value={rate} onChangeText={setRate} keyboardType="number-pad" editable={!disabled} />
        <KnowledgeText>1800 basis points is 18%. Existing tax versions remain unchanged.</KnowledgeText>
        <KnowledgeSelect label="Treatment" value={treatment} onChange={setTreatment} allowEmpty={false} disabled={disabled} options={[{ value: "exclusive", label: "Exclusive" }, { value: "inclusive", label: "Inclusive" }]} />
        <Field label="Applicability" value={applicability} onChangeText={setApplicability} editable={!disabled} />
        <KnowledgeSelect label="Version status" value={taxStatus} onChange={setTaxStatus} disabled={disabled} allowEmpty={false} options={[{ value: "draft", label: "Draft" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
        <Field label="Effective from (YYYY-MM-DD HH:mm)" value={from} onChangeText={setFrom} editable={!disabled} />
        <Field label="Effective to (optional)" value={to} onChangeText={setTo} editable={!disabled} />
        {to.trim() && (!effectiveTo || (effectiveFrom && effectiveTo <= effectiveFrom)) ? <KnowledgeText error>The end date must be after the start date.</KnowledgeText> : null}
      </> : <KnowledgeText>Existing tax-version details remain unchanged.</KnowledgeText>}
    </KnowledgeCard> : null}
    {mutation.isError ? <KnowledgeText error>{catalogError(mutation.error)}</KnowledgeText> : null}
    <Button label={existing ? "Save changes" : `Add ${SINGULAR[type]}`} loading={mutation.isPending} disabled={!valid} onPress={() => mutation.mutate()} />
  </KnowledgeModal>;
}

function KnowledgeArchiveValue({ context, type, target, onClose, onSaved }: { readonly context: KnowledgeMobileContext; readonly type: KnowledgeMasterType; readonly target: KnowledgeMaster; readonly onClose: () => void; readonly onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState(false);
  const mutation = useMutation({ mutationFn: () => context.api.archiveKnowledgeMaster(type, target.id, { expectedVersion: target.version, reason: reason.trim() }), retry: false, onSuccess: async () => { await context.refresh(); onSaved(); }, onError: error => { if (error instanceof ApiError && error.code === "VERSION_CONFLICT") setConflict(true); } });
  return <KnowledgeModal title={`Archive ${target.name}`} busy={mutation.isPending} onClose={onClose}>
    <KnowledgeText>This value will no longer be available for new selections. Existing references are retained.</KnowledgeText>
    <Field label="Reason for archiving" value={reason} onChangeText={setReason} maxLength={4000} multiline editable={!mutation.isPending && !conflict} />
    {mutation.isError ? <KnowledgeText error>{catalogError(mutation.error)}</KnowledgeText> : null}
    <Button label="Archive value" variant="danger" loading={mutation.isPending} disabled={!context.ready || !context.canRead || !context.canLifecycle || !reason.trim() || conflict} onPress={() => mutation.mutate()} />
  </KnowledgeModal>;
}

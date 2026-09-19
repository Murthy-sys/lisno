import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field, StateView } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { extractRecords, recordId, recordSubtitle, recordTitle } from "../workspace/recordPresentation";
import { createIdempotencyKey, parseInrToPaise } from "./money";

type EntryType = "direct_spend" | "overhead";
type ExpenseClass = "employee_payment" | "other";

function Choice<T extends string>({ label, value, selected, onSelect }: { readonly label: string; readonly value: T; readonly selected: boolean; readonly onSelect: (value: T) => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onSelect(value)} style={[styles.choice, selected ? styles.choiceSelected : null]}>
      <Text style={[styles.choiceText, selected ? styles.choiceTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FinanceWorkspace({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const canRead = session.authorization.permissions.includes("finance.entry.read");
  const canCreate = session.authorization.permissions.includes("finance.entry.create");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EntryType>("direct_spend");
  const [expenseClass, setExpenseClass] = useState<ExpenseClass>("employee_payment");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(today);
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const idempotencyKey = useRef(createIdempotencyKey());
  const entriesEndpoint = `/finance/projects/${encodeURIComponent(projectId)}/entries?limit=100&offset=0`;
  const entries = useQuery({
    queryKey: privateQueryKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "finance-ledger", projectId),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<unknown>(entriesEndpoint, { signal }),
    enabled: canRead
  });

  const resetRequestIdentity = () => {
    idempotencyKey.current = createIdempotencyKey();
    setValidation(null);
    if (!mutation.isPending) mutation.reset();
  };
  const mutation = useMutation({
    mutationFn: async () => {
      const amountPaise = parseInrToPaise(amount);
      if (!category.trim() || !description.trim() || amountPaise === null) {
        throw new Error("VALIDATION");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(incurredAt) || Number.isNaN(Date.parse(`${incurredAt}T00:00:00.000Z`))) {
        throw new Error("DATE_VALIDATION");
      }
      const base = {
        category: category.trim(), amountPaise, incurredAt: `${incurredAt}T00:00:00.000Z`, description: description.trim(),
        ...(vendor.trim() ? { vendor: vendor.trim() } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}),
        idempotencyKey: idempotencyKey.current
      };
      return context.runtime.api.authenticated.post(`/finance/projects/${encodeURIComponent(projectId)}/entries`, type === "direct_spend" ? { ...base, type, expenseClass } : { ...base, type });
    },
    onSuccess: async () => {
      idempotencyKey.current = createIdempotencyKey();
      setOpen(false); setCategory(""); setAmount(""); setDescription(""); setVendor(""); setReference(""); setValidation(null);
      await invalidate("finance-entry-changed");
    },
    onError: (cause) => {
      if (cause instanceof Error && cause.message === "VALIDATION") setValidation("Enter a category, description, and positive INR amount with up to two decimal places.");
      else if (cause instanceof Error && cause.message === "DATE_VALIDATION") setValidation("Enter the incurred date as YYYY-MM-DD.");
      else if (cause instanceof ApiError && cause.status === 409) setValidation("This entry may already have been recorded. Refresh the ledger before retrying with the same request identity.");
      else setValidation("The cost could not be confirmed. You can retry safely with the same request identity.");
    }
  });

  const ledger = extractRecords(entries.data);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={styles.title}>Project costs</Text>
        <Text style={styles.copy}>Ledger values come directly from the approved project finance service.</Text>
      </View>
      {canCreate && !open ? <Button label="Record project cost" onPress={() => setOpen(true)} /> : null}
      {open ? (
        <View style={styles.form}>
          <Text accessibilityRole="header" style={styles.formTitle}>Record project cost</Text>
          <View accessibilityRole="radiogroup" style={styles.choices}>
            <Choice label="Direct spending" value="direct_spend" selected={type === "direct_spend"} onSelect={(value) => { setType(value); resetRequestIdentity(); }} />
            <Choice label="Overhead" value="overhead" selected={type === "overhead"} onSelect={(value) => { setType(value); resetRequestIdentity(); }} />
          </View>
          {type === "direct_spend" ? (
            <View accessibilityRole="radiogroup" style={styles.choices}>
              <Choice label="Employee payment" value="employee_payment" selected={expenseClass === "employee_payment"} onSelect={(value) => { setExpenseClass(value); resetRequestIdentity(); }} />
              <Choice label="Other expense" value="other" selected={expenseClass === "other"} onSelect={(value) => { setExpenseClass(value); resetRequestIdentity(); }} />
            </View>
          ) : null}
          <Field label="Category" value={category} onChangeText={(value) => { setCategory(value); resetRequestIdentity(); }} />
          <Field label="Amount (INR)" value={amount} onChangeText={(value) => { setAmount(value); resetRequestIdentity(); }} keyboardType="decimal-pad" />
          <Field label="Incurred date (YYYY-MM-DD)" value={incurredAt} onChangeText={(value) => { setIncurredAt(value); resetRequestIdentity(); }} autoCapitalize="none" />
          <Field label="Description" value={description} onChangeText={(value) => { setDescription(value); resetRequestIdentity(); }} multiline />
          <Field label="Vendor (optional)" value={vendor} onChangeText={(value) => { setVendor(value); resetRequestIdentity(); }} />
          <Field label="Reference (optional)" value={reference} onChangeText={(value) => { setReference(value); resetRequestIdentity(); }} />
          {validation ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{validation}</Text> : null}
          <View style={styles.actions}>
            <View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={() => { setOpen(false); setValidation(null); }} /></View>
            <View style={styles.action}><Button label="Record cost" loading={mutation.isPending} onPress={() => mutation.mutate()} /></View>
          </View>
        </View>
      ) : null}
      {canRead && entries.isPending ? <Text style={styles.copy}>Loading ledger…</Text> : null}
      {canRead && entries.isError ? <StateView tone="error" title="Ledger unavailable" message="Project totals remain visible, but ledger entries could not be loaded." actionLabel="Retry" onAction={() => void entries.refetch()} /> : null}
      {canRead && !entries.isPending && !entries.isError && ledger.length === 0 ? <Text style={styles.copy}>No project costs have been recorded.</Text> : null}
      {ledger.map((entry, index) => <View key={recordId(entry) ?? `ledger-${index}`} style={styles.entry}><Text style={styles.entryTitle}>{recordTitle(entry, index)}</Text>{recordSubtitle(entry) ? <Text style={styles.copy}>{recordSubtitle(entry)}</Text> : null}</View>)}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md }, sectionHeading: { gap: spacing.xs }, title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  form: { borderRadius: radii.surface, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm },
  formTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radii.control, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  choiceSelected: { backgroundColor: colors.midnight, borderColor: colors.midnight }, choiceText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13 }, choiceTextSelected: { color: colors.surface },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }, actions: { flexDirection: "row", gap: spacing.sm }, action: { flex: 1 },
  entry: { minHeight: 58, padding: spacing.md, borderRadius: radii.control, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, entryTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 }
});

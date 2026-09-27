import { createContext, useContext, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";

export const knowledgeStyles = StyleSheet.create({
  screen: { padding: spacing.md, paddingBottom: spacing.huge, gap: spacing.md, backgroundColor: colors.canvas },
  stack: { gap: spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  column: { flex: 1, minWidth: 140, gap: spacing.sm },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18 },
  subtitle: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14 },
  text: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20 },
  choice: { minHeight: 44, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.sm, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: spacing.sm },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  disabled: { opacity: .55 },
  select: { minHeight: 48, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  divider: { height: 1, backgroundColor: colors.border },
  modal: { flex: 1, backgroundColor: colors.canvas },
  modalHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border }
});

const DetailDensity = createContext(false);
export function KnowledgeDetailProvider({ children }: { readonly children: ReactNode }) {
  return <DetailDensity.Provider value>{children}</DetailDensity.Provider>;
}
export const knowledgeDetailStyles = StyleSheet.create({
  ...knowledgeStyles,
  screen: { ...knowledgeStyles.screen, padding: 12, paddingBottom: 16, gap: 10 },
  stack: { gap: 8 },
  row: { ...knowledgeStyles.row, gap: 8 },
  column: { flex: 1, minWidth: 118, gap: 8 },
  card: { ...knowledgeStyles.card, padding: 10, gap: 8, borderRadius: 6 },
  title: { ...knowledgeStyles.title, fontSize: 14, lineHeight: 20 },
  subtitle: { ...knowledgeStyles.subtitle, fontSize: 12, lineHeight: 17 },
  text: { ...knowledgeStyles.text, fontSize: 12, lineHeight: 18 },
  error: { ...knowledgeStyles.error, fontSize: 12, lineHeight: 18 },
  choice: { ...knowledgeStyles.choice, minHeight: 44, padding: 8, gap: 7, borderRadius: 5 },
  select: { ...knowledgeStyles.select, minHeight: 44, padding: 9, gap: 6, borderRadius: 5 },
  modalHeading: { ...knowledgeStyles.modalHeading, padding: 10, gap: 8 },
  summaryRow: { ...knowledgeStyles.summaryRow, paddingVertical: 5, gap: 8, borderBottomWidth: 0 }
});
function useKnowledgeStyles() { return useContext(DetailDensity) ? knowledgeDetailStyles : knowledgeStyles; }

export function KnowledgeCard({ title, children, actions }: { readonly title?: string; readonly children: ReactNode; readonly actions?: ReactNode }) {
  const knowledgeStyles = useKnowledgeStyles();
  return <View style={knowledgeStyles.card}>{title ? <View style={knowledgeStyles.row}><Text accessibilityRole="header" style={[knowledgeStyles.title, { flex: 1 }]}>{title}</Text>{actions}</View> : null}{children}</View>;
}

export function KnowledgeText({ children, error = false }: { readonly children: ReactNode; readonly error?: boolean }) {
  const knowledgeStyles = useKnowledgeStyles();
  return <Text accessibilityLiveRegion={error ? "assertive" : "none"} style={error ? knowledgeStyles.error : knowledgeStyles.text}>{children}</Text>;
}

export function KnowledgeChoice({ label, accessibilityLabel = label, selected, onPress, disabled = false, multiple = false, variant = "button" }: { readonly label: string; readonly accessibilityLabel?: string; readonly selected: boolean; readonly onPress: () => void; readonly disabled?: boolean; readonly multiple?: boolean; readonly variant?: "button" | "row" }) {
  const knowledgeStyles = useKnowledgeStyles();
  const compact = useContext(DetailDensity);
  return <Pressable accessibilityRole={multiple ? "checkbox" : "radio"} accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[knowledgeStyles.choice, selected && knowledgeStyles.selected, variant === "row" && { justifyContent: "flex-start", borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 12, paddingVertical: 10 }, disabled && knowledgeStyles.disabled]}>
    {compact ? <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 18, height: 18, borderWidth: 1.5, borderColor: selected ? colors.primary : colors.borderStrong, borderRadius: multiple ? 3 : 9, backgroundColor: selected ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>{selected ? multiple ? <Svg width={12} height={12} viewBox="0 0 16 16"><Path d="m3 8 3 3 7-7" fill="none" stroke={colors.primaryInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primaryInk }} /> : null}</View> : <Text aria-hidden style={knowledgeStyles.subtitle}>{selected ? (multiple ? "☑" : "●") : (multiple ? "□" : "○")}</Text>}<Text style={[knowledgeStyles.subtitle, { flexShrink: 1 }]}>{label}</Text>
  </Pressable>;
}

export interface KnowledgeOption { readonly value: string; readonly label: string; readonly disabled?: boolean }

export function KnowledgeSelect({ label, value, options, onChange, disabled = false, placeholder = "Not configured", allowEmpty = true }: { readonly label: string; readonly value: string; readonly options: readonly KnowledgeOption[]; readonly onChange: (value: string) => void; readonly disabled?: boolean; readonly placeholder?: string; readonly allowEmpty?: boolean }) {
  const knowledgeStyles = useKnowledgeStyles();
  const compact = useContext(DetailDensity);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find(option => option.value === value);
  const visible = options.filter(option => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <View style={knowledgeStyles.stack}>
    <Text style={knowledgeStyles.subtitle}>{label}</Text>
    <Pressable accessibilityRole="combobox" accessibilityLabel={label} accessibilityValue={{ text: selected?.label ?? (value ? "Unavailable saved value" : placeholder) }} accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => { setSearch(""); setOpen(true); }} style={[knowledgeStyles.select, disabled && knowledgeStyles.disabled]}>
      <Text style={[knowledgeStyles.text, { flex: 1 }]}>{selected?.label ?? (value ? "Unavailable saved value" : placeholder)}</Text><Text aria-hidden style={knowledgeStyles.text}>▾</Text>
    </Pressable>
    {open ? <KnowledgeModal title={label} onClose={() => setOpen(false)}>
      <Field compact={compact} label={`Search ${label}`} value={search} onChangeText={setSearch} />
      {allowEmpty ? <KnowledgeChoice label={placeholder} selected={!value} onPress={() => { onChange(""); setOpen(false); }} /> : null}
      {visible.map(option => <KnowledgeChoice key={option.value} label={option.label} selected={option.value === value} disabled={option.disabled === true} onPress={() => { onChange(option.value); setOpen(false); }} />)}
      {!visible.length ? <KnowledgeText>No options match.</KnowledgeText> : null}
    </KnowledgeModal> : null}
  </View>;
}

export function KnowledgeModal({ title, children, onClose, busy = false }: { readonly title: string; readonly children: ReactNode; readonly onClose: () => void; readonly busy?: boolean }) {
  const knowledgeStyles = useKnowledgeStyles();
  const compact = useContext(DetailDensity);
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) onClose(); }} presentationStyle="pageSheet"><SafeAreaView style={knowledgeStyles.modal}>
    <View style={knowledgeStyles.modalHeading}><Text accessibilityRole="header" style={[knowledgeStyles.title, { flex: 1 }]}>{title}</Text><Button size={compact ? "compact" : "default"} label="Close" variant="quiet" disabled={busy} onPress={onClose} /></View>
    <ScrollView contentContainerStyle={knowledgeStyles.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </SafeAreaView></Modal>;
}

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii, spacing } from "../../ui/tokens";
import type { PresentedConversationTotals } from "./chatModel";
import type { ConversationListFilter } from "./chatQueryKeys";

interface FilterDefinition {
  readonly value: ConversationListFilter;
  readonly label: string;
  readonly total: keyof PresentedConversationTotals | null;
  readonly countColor: string;
}

const FILTERS: readonly FilterDefinition[] = Object.freeze([
  { value: "all", label: "All", total: null, countColor: colors.primary },
  { value: "unread", label: "Unread", total: "unread", countColor: colors.primary },
  { value: "critical", label: "Critical", total: "critical", countColor: colors.danger },
  { value: "important", label: "Important", total: "important", countColor: colors.warning }
]);

function countText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export interface ConversationFiltersProps {
  readonly value: ConversationListFilter;
  /** Server-authored list-wide totals; counts stay hidden when absent or zero. */
  readonly totals?: PresentedConversationTotals | null;
  readonly disabled?: boolean;
  readonly onChange: (filter: ConversationListFilter) => void;
}

export function ConversationFilters({ value, totals = null, disabled = false, onChange }: ConversationFiltersProps) {
  return (
    <ScrollView
      accessibilityLabel="Conversation filters"
      accessibilityRole="tablist"
      contentContainerStyle={styles.content}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      testID="conversation-filters"
    >
      {FILTERS.map((filter) => {
        const selected = filter.value === value;
        const count = filter.total && totals ? totals[filter.total] : 0;
        const visibleCount = count > 0 ? countText(count) : null;
        return (
          <Pressable
            accessibilityLabel={visibleCount ? `${filter.label}, ${count}` : filter.label}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            hitSlop={{ top: 4, bottom: 4 }}
            key={filter.value}
            onPress={() => {
              if (!selected) onChange(filter.value);
            }}
            style={({ pressed }) => [
              styles.chip,
              selected ? styles.chipSelected : null,
              pressed && !selected ? styles.chipPressed : null
            ]}
            testID={`conversation-filter-${filter.value}`}
          >
            <Text numberOfLines={1} style={[styles.label, selected ? styles.labelSelected : null]}>{filter.label}</Text>
            {visibleCount ? (
              <View style={[styles.count, { backgroundColor: filter.countColor }]}>
                <Text style={styles.countText}>{visibleCount}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0 },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted
  },
  chipSelected: { backgroundColor: colors.primarySoft },
  chipPressed: { backgroundColor: colors.border },
  label: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  labelSelected: { color: colors.primary, fontFamily: fonts.semibold },
  count: {
    minWidth: 20,
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: radii.pill
  },
  countText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16 }
});

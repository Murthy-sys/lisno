import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Ellipse, Line, LinearGradient, Rect, Stop } from "react-native-svg";

import { dashboardColors as color, dashboardTypography as type } from "../dashboardTheme";
import type { FinanceActivityChartData } from "./executive";

/** One common signed scale for every date, including dates outside the viewport. */
export function financeCylinderScale(data: FinanceActivityChartData, height: number) {
  const values = data.points.flatMap((point) => point.available && point.valuePaise !== null && Number.isFinite(point.valuePaise) ? [point.valuePaise] : []);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = maximum - minimum || 1;
  const top = 30;
  const bottom = height - 12;
  const zero = minimum === 0 && maximum === 0 ? bottom : top + maximum / range * (bottom - top);
  return {
    minimum, maximum, zero,
    endpoint: (paise: number) => zero - paise / range * (bottom - top)
  };
}

export function financeCylinderLabel(paise: number): string {
  const rupees = paise / 100;
  const amount = Math.abs(rupees);
  const sign = paise < 0 ? "−" : "";
  if (amount >= 10_000_000) return `${sign}₹${(amount / 10_000_000).toFixed(1)}Cr`;
  if (amount >= 100_000) return `${sign}₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000) return `${sign}₹${(amount / 1_000).toFixed(1)}k`;
  return `${sign}₹${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export function FinanceCylinderChart({ data, selectedDayId, onSelectDay, height = 240 }: {
  readonly data: FinanceActivityChartData;
  readonly selectedDayId?: string | undefined;
  readonly onSelectDay?: ((id: string) => void) | undefined;
  readonly height?: number | undefined;
}) {
  const { width, fontScale } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(Math.max(240, width - 72));
  const scroll = useRef<ScrollView>(null);
  const instance = useId().replace(/[^a-zA-Z0-9]/g, "");
  const columnWidth = Math.max(72, Math.min(112, 78 * fontScale));
  const plotHeight = Math.max(140, height - 60);
  const scale = financeCylinderScale(data, plotHeight);
  const selectedIndex = Math.max(0, selectedDayId ? data.points.findIndex((point) => point.id === selectedDayId) : data.points.length - 1);
  const revealSelected = useCallback(() => {
    scroll.current?.scrollTo({ x: Math.max(0, (selectedIndex + 0.5) * columnWidth - viewportWidth / 2), animated: false });
  }, [columnWidth, selectedIndex, viewportWidth]);
  useEffect(revealSelected, [revealSelected, data.points.length]);

  return (
    <View style={styles.chart} testID="dashboard-finance-activity-chart">
      <Text style={styles.hint}>Daily recorded cost · Swipe dates</Text>
      <ScrollView ref={scroll} horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}
        onContentSizeChange={revealSelected} onLayout={({ nativeEvent }) => setViewportWidth(nativeEvent.layout.width)}
        accessibilityLabel="Daily recorded costs by UTC date" contentContainerStyle={styles.columns}>
        {data.points.map((point, index) => {
          const available = point.available && point.valuePaise !== null && Number.isFinite(point.valuePaise);
          const value = available ? point.valuePaise! : 0;
          const selected = index === selectedIndex;
          const endpoint = scale.endpoint(value);
          const bodyY = Math.min(scale.zero, endpoint);
          const bodyHeight = Math.abs(endpoint - scale.zero);
          const gradient = `${instance}cylinder${index}`;
          const negative = value < 0;
          const edge = negative ? "#8a6742" : selected ? "#294433" : "#678775";
          const light = negative ? "#dfc9a8" : selected ? "#6b9277" : "#c4d4c8";
          const dateLabel = `${point.date.slice(8, 10)}/${point.date.slice(5, 7)}`;
          return (
            <Pressable key={point.id} accessibilityRole="button"
              accessibilityLabel={`${point.date} UTC. Recorded cost ${point.displayValue}${available ? "" : `. ${point.unavailableReason ?? "Authoritative source unavailable"}`}`}
              accessibilityState={{ selected, disabled: !onSelectDay }} disabled={!onSelectDay}
              onPress={() => onSelectDay?.(point.id)} style={({ pressed }) => [styles.column, { width: columnWidth }, pressed ? styles.pressed : null]}>
              <View style={{ width: columnWidth, height: plotHeight }}>
              <Text style={[styles.amount, { top: Math.max(0, bodyY - (available ? 25 : 38)) }, selected ? styles.selectedText : null]}>{available ? financeCylinderLabel(value) : "Not available"}</Text>
              <Svg accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                width={columnWidth} height={plotHeight} viewBox={`0 0 ${columnWidth} ${plotHeight}`}>
                <Defs>
                  <LinearGradient id={gradient} x1="0%" y1="0%" x2="100%" y2="0%">
                    <Stop offset="0" stopColor={edge} /><Stop offset="0.3" stopColor={light} /><Stop offset="0.64" stopColor={edge} /><Stop offset="1" stopColor={edge} />
                  </LinearGradient>
                </Defs>
                <Line x1={0} x2={columnWidth} y1={scale.zero} y2={scale.zero} stroke={color.stageEdge} strokeWidth={1} />
                {available && value !== 0 ? <>
                  <Rect testID={`finance-cylinder-body-${index}`} x={columnWidth / 2 - 18} y={bodyY}
                    width={36} height={bodyHeight} fill={`url(#${gradient})`} />
                  <Ellipse cx={columnWidth / 2} cy={Math.max(scale.zero, endpoint)} rx={18} ry={5} fill={edge} />
                  <Ellipse cx={columnWidth / 2} cy={bodyY} rx={18} ry={5} fill={light} stroke={edge} strokeWidth={0.5} />
                </> : available ? (
                  <Ellipse testID={`finance-cylinder-zero-${index}`} cx={columnWidth / 2} cy={scale.zero} rx={18} ry={3} fill={color.sageSoft} stroke={color.stageEdge} strokeWidth={1} />
                ) : <Line x1={columnWidth / 2 - 13} x2={columnWidth / 2 + 13} y1={scale.zero - 4} y2={scale.zero - 4} stroke={color.textMuted} strokeDasharray="3 4" />}
              </Svg>
              </View>
              <View style={[styles.datePill, selected ? styles.selectedDate : null]}>
                <Text style={[styles.date, selected ? styles.selectedText : null]}>{dateLabel}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {data.points.length === 0 ? <Text style={styles.empty}>No daily finance values are available.</Text> : null}
      <Text style={styles.caption}>UTC dates · Select a day for its exact amount below.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { paddingTop: 4, paddingBottom: 8, gap: 6 },
  hint: { fontFamily: type.regular, fontSize: 11, color: color.textMuted, paddingHorizontal: 18 },
  columns: { paddingHorizontal: 12, alignItems: "stretch" },
  column: { minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "flex-end", paddingVertical: 5 },
  amount: { position: "absolute", left: 0, right: 0, zIndex: 1, paddingHorizontal: 3, textAlign: "center", fontFamily: type.medium, fontSize: 11, lineHeight: 16, color: color.textMuted },
  datePill: { minHeight: 28, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  selectedDate: { backgroundColor: color.sageSoft, borderColor: color.sage },
  date: { fontFamily: type.regular, fontSize: 11, lineHeight: 17, color: color.textMuted },
  selectedText: { color: color.text, fontFamily: type.semibold },
  caption: { paddingHorizontal: 18, fontFamily: type.regular, fontSize: 10, lineHeight: 15, color: color.textMuted },
  empty: { padding: 18, fontFamily: type.regular, fontSize: 13, color: color.textMuted },
  pressed: { opacity: 0.75 }
});

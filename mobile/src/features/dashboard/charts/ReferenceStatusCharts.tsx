import React, { useId, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

import { dashboardColors as color, dashboardTypography as type } from "../dashboardTheme";
import {
  buildCostGaugeModel,
  buildProjectLandscapeModel,
  gaugeArcPath,
  gaugePoint,
  landscapeHillPath
} from "./referenceStatusGeometry";
import type { StageDatum } from "./types";

export interface ReferenceStatusChartProps {
  readonly values: readonly StageDatum[];
  readonly centerDisplay: string;
  readonly height?: number | undefined;
}

const forest = "#39764F";
const forestDeep = "#25472F";
const stageColors = ["#A4ACA5", forest, "#C4A56C", "#7BA4C1"] as const;
const costNeutralColors = ["#A4ACA5", "#9BA7AF", "#C4A56C", "#7BA4C1"] as const;

function PortfolioGlyph() {
  return (
    <Svg accessibilityElementsHidden importantForAccessibility="no-hide-descendants" height={22} viewBox="0 0 24 24" width={22}>
      <Path d="M3 20V13H6V20H3ZM10 20V8H13V20H10ZM17 20V3H20V20H17Z" fill="none" stroke={forest} strokeWidth={1.5} />
    </Svg>
  );
}

export function ProjectStatusLandscape({ values, centerDisplay, height = 220 }: ReferenceStatusChartProps) {
  const model = buildProjectLandscapeModel(values, centerDisplay);
  const gradientPrefix = `project-hill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const graphHeight = Math.max(110, Math.min(170, height * 0.55));
  return (
    <View style={styles.landscape} testID="dashboard-lifecycle-chart">
      <View style={styles.totalRow}>
        <View accessible accessibilityLabel={`Total projects: ${centerDisplay}`} style={styles.totalChip}>
          <Svg accessibilityElementsHidden importantForAccessibility="no-hide-descendants" height={14} viewBox="0 0 20 20" width={14}>
            <Path d="M3 7L10 3L17 7L10 11L3 7ZM3 11L10 15L17 11M3 15L10 19L17 15" fill="none" stroke={color.textMuted} strokeWidth={1.3} strokeLinejoin="round" />
          </Svg>
          <Text style={styles.totalText}>Total {centerDisplay}</Text>
        </View>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
        <Svg height={graphHeight} preserveAspectRatio="none" viewBox="0 0 360 130" width="100%">
          <Defs>
            {stageColors.map((fill, index) => (
              <LinearGradient id={`${gradientPrefix}-${index}`} key={fill} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={fill} stopOpacity={0.88} />
                <Stop offset="0.58" stopColor={fill} stopOpacity={0.5} />
                <Stop offset="1" stopColor={fill} stopOpacity={0.16} />
              </LinearGradient>
            ))}
          </Defs>
          {[0, 2, 3, 1].map((index) => {
            const stage = model.stages[index]!;
            const center = 45 + index * 90;
            const peak = stage.heightRatio * 91;
            const fill = stageColors[index]!;
            return (
              <G key={stage.id}>
                {peak > 0 ? (
                  <>
                    <Path d={landscapeHillPath(center, 118, peak)} fill={`url(#${gradientPrefix}-${index})`} testID={`project-hill-${stage.id}`} />
                    <Path d={landscapeHillPath(center, 118, peak * 0.7, 81)} fill={fill} opacity={0.18} />
                    <Path d={landscapeHillPath(center, 118, peak * 0.42, 88)} fill={fill} opacity={0.16} />
                    <Circle cx={center} cy={118 - peak} r={4} fill={fill} stroke={color.stage} strokeWidth={1.5} />
                    <SvgText fill={color.text} fontFamily={type.medium} fontSize={13} textAnchor="middle" x={center} y={108 - peak}>{stage.displayValue}</SvgText>
                  </>
                ) : null}
                {stage.value === null ? (
                  <Line stroke={fill} strokeDasharray="3 4" strokeWidth={1.5} x1={center - 32} x2={center + 32} y1={118} y2={118} />
                ) : null}
              </G>
            );
          })}
          <Line stroke={color.stageEdge} strokeWidth={1} x1={0} x2={360} y1={119} y2={119} />
        </Svg>
      </View>
      <View style={styles.stageLabels}>
        {model.stages.map((stage) => (
          <View accessible accessibilityLabel={`${stage.label}: ${stage.displayValue}`} key={stage.id} style={styles.stageLabel} testID={`project-status-${stage.id}`}>
            <Text style={styles.stageName}>{stage.label}</Text>
            <Text style={[styles.stageValue, stage.value === null ? styles.unavailableValue : null]}>{stage.displayValue}</Text>
          </View>
        ))}
      </View>
      <View style={styles.insight}>
        <PortfolioGlyph />
        <View style={styles.insightText}>
          <Text style={styles.insightTitle}>{model.title}</Text>
          <Text style={styles.insightDetail}>{model.detail}</Text>
        </View>
      </View>
    </View>
  );
}

export function CostCompositionGauge({ values, centerDisplay, height = 220 }: ReferenceStatusChartProps) {
  const model = buildCostGaugeModel(values, centerDisplay);
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const availableWidth = measuredWidth ?? width - 72;
  const currencyCenter = centerDisplay.includes("₹");
  const longAmount = currencyCenter && centerDisplay.length > 12;
  const stacked = availableWidth < 290 || fontScale > 1.25 || longAmount;
  const gaugeSize = stacked ? Math.min(longAmount ? 320 : 248, Math.max(190, availableWidth)) : 156;
  const gradientId = `cost-gauge-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const percent = model.share === null ? null : new Intl.NumberFormat("en-IN", {
    style: "percent", maximumFractionDigits: 1
  }).format(model.share);
  const shareLabel = model.largest ? `${model.largest.label}${model.tied ? " · joint largest" : " · largest share"}` : "Share unavailable";
  return (
    <View
      onLayout={(event) => {
        if (event.nativeEvent.layout.width > 0) setMeasuredWidth(event.nativeEvent.layout.width);
      }}
      style={[styles.costRoot, { minHeight: height }]}
      testID="dashboard-cost-composition-chart"
    >
      <View style={[styles.costLayout, stacked ? styles.costLayoutStacked : null]} testID="cost-gauge-layout">
        <View
          accessible
          accessibilityLabel={`Recorded cost: ${centerDisplay}. ${percent ? `${shareLabel}: ${percent}.` : model.reason}`}
          style={[styles.gauge, { width: gaugeSize, height: gaugeSize }]}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg height="100%" viewBox="0 0 180 180" width="100%">
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
                  <Stop offset="0" stopColor={forestDeep} />
                  <Stop offset="0.6" stopColor={forest} />
                  <Stop offset="1" stopColor="#719A7E" />
                </LinearGradient>
              </Defs>
              <Path d={gaugeArcPath(1)} fill="none" stroke={color.canvasDeep} strokeLinecap="round" strokeWidth={10} />
              {Array.from({ length: 55 }, (_, index) => {
                const angle = 135 + index * 5;
                const outer = gaugePoint(angle, 63);
                const inner = gaugePoint(angle, index % 9 === 0 ? 55 : 58);
                return <Line key={index} stroke="#AEB6AC" strokeOpacity={0.85} strokeWidth={index % 9 === 0 ? 1.5 : 0.8} x1={inner.x} x2={outer.x} y1={inner.y} y2={outer.y} />;
              })}
              {model.share !== null && model.share > 0 ? (
                <Path d={gaugeArcPath(model.share)} fill="none" stroke={`url(#${gradientId})`} strokeLinecap="round" strokeWidth={10} testID="cost-gauge-share-arc" />
              ) : null}
            </Svg>
          </View>
          <View style={[styles.gaugeCenter, { width: gaugeSize * (longAmount ? 0.62 : 0.56) }]}>
            <Text
              adjustsFontSizeToFit={currencyCenter}
              minimumFontScale={0.8}
              numberOfLines={currencyCenter ? 1 : undefined}
              style={[styles.gaugeValue, currencyCenter ? styles.gaugeCurrency : null]}
            >{centerDisplay}</Text>
            <Text style={styles.gaugeCaption}>RECORDED COST</Text>
            {percent ? <Text style={styles.gaugePercent}>{percent}</Text> : null}
          </View>
          {model.share !== null ? (
            <View style={styles.gaugeScale} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={styles.scaleLabel}>0%</Text>
              <Text style={styles.scaleLabel}>100%</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.costLegend}>
          {model.stages.map((stage, index) => {
            const dominant = model.largest?.value === stage.value && model.share !== null;
            return (
              <View
                accessible
                accessibilityLabel={`${stage.label}: ${stage.displayValue}`}
                key={stage.id}
                style={[styles.costLegendRow, dominant ? styles.costLegendRowDominant : null]}
                testID={`cost-legend-${stage.id}`}
              >
                <View style={[styles.legendDot, { backgroundColor: dominant ? forest : costNeutralColors[index] }]} />
                <View style={styles.costLegendText}>
                  <Text style={styles.costLabel}>{stage.label}</Text>
                  <Text style={[styles.costValue, stage.value === null ? styles.unavailableValue : null]}>{stage.displayValue}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <Text style={styles.costExplanation}>
        {percent ? `${percent} ${shareLabel.toLowerCase()}` : model.reason}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  landscape: { gap: 2 },
  totalRow: { alignItems: "flex-end" },
  totalChip: { alignItems: "center", flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: color.stageEdge, borderRadius: 9, backgroundColor: color.stage },
  totalText: { color: color.text, fontFamily: type.medium, fontSize: 11, lineHeight: 17 },
  stageLabels: { flexDirection: "row", alignItems: "flex-start" },
  stageLabel: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 2, gap: 4 },
  stageName: { color: color.textMuted, fontFamily: type.regular, fontSize: 11, lineHeight: 17, textAlign: "center" },
  stageValue: { color: color.text, fontFamily: type.medium, fontSize: 13, lineHeight: 19, textAlign: "center" },
  unavailableValue: { color: color.textMuted, fontFamily: type.regular, fontSize: 11, lineHeight: 17 },
  insight: { alignItems: "center", flexDirection: "row", gap: 12, marginTop: 18, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: color.sageSoft },
  insightText: { flex: 1, minWidth: 0, gap: 3 },
  insightTitle: { color: color.text, fontFamily: type.medium, fontSize: 12, lineHeight: 18 },
  insightDetail: { color: color.textMuted, fontFamily: type.regular, fontSize: 11, lineHeight: 17 },
  costRoot: { gap: 10, justifyContent: "center" },
  costLayout: { flexDirection: "row", alignItems: "center", gap: 10 },
  costLayoutStacked: { flexDirection: "column", alignItems: "center" },
  gauge: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
  gaugeCenter: { alignItems: "center", gap: 3 },
  gaugeValue: { color: color.text, fontFamily: type.semibold, fontSize: 18, lineHeight: 24, textAlign: "center" },
  gaugeCurrency: { width: "100%", fontSize: 14, lineHeight: 20 },
  gaugeCaption: { color: color.textMuted, fontFamily: type.medium, fontSize: 8, lineHeight: 12, textAlign: "center" },
  gaugePercent: { color: forest, fontFamily: type.semibold, fontSize: 14, lineHeight: 21, marginTop: 4 },
  gaugeScale: { position: "absolute", bottom: 8, left: 25, right: 25, flexDirection: "row", justifyContent: "space-between" },
  scaleLabel: { color: color.textMuted, fontFamily: type.regular, fontSize: 9, lineHeight: 14 },
  costLegend: { flex: 1, alignSelf: "stretch", minWidth: 0, gap: 7 },
  costLegendRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 9, backgroundColor: color.canvas, paddingHorizontal: 10, paddingVertical: 8 },
  costLegendRowDominant: { backgroundColor: color.sageSoft },
  legendDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  costLegendText: { flex: 1, minWidth: 0, gap: 2 },
  costLabel: { color: color.textMuted, fontFamily: type.regular, fontSize: 11, lineHeight: 17 },
  costValue: { color: color.text, fontFamily: type.medium, fontSize: 12, lineHeight: 18 },
  costExplanation: { color: color.textMuted, fontFamily: type.regular, fontSize: 11, lineHeight: 17, textAlign: "center" }
});

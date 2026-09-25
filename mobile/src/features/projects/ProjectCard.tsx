import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { colors, fonts } from "../../ui/tokens";
import { projectStatusLabels, type ProjectItem, type ProjectStatus } from "./projectsModel";

export const statusColors: Record<ProjectStatus, { ink: string; background: string; dot: string }> = {
  active: { ink: "#25633d", background: "#e8f2e6", dot: "#369650" },
  planning: { ink: colors.inkMuted, background: colors.surfaceMuted, dot: "#889882" },
  on_hold: { ink: "#805a21", background: "#f6eddd", dot: "#c79a55" },
  completed: { ink: "#335e78", background: "#e8f0f5", dot: "#638ba6" },
  unknown: { ink: colors.inkMuted, background: colors.surfaceMuted, dot: colors.borderStrong }
};

function PhotoPlaceholder() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.photo}>
      <Svg width="100%" height="100%" viewBox="0 0 110 150" preserveAspectRatio="xMidYMid slice">
        <Rect width={110} height={150} fill="#e7e8dc" />
        <Path d="M0 114L110 81V150H0Z" fill="#d6dac9" />
        <Path d="M16 41L88 23V115L16 132Z" fill="#f4f1e6" />
        <Path d="M16 41L88 23L98 28L27 47Z" fill="#c6cbb9" />
        <Path d="M27 47L98 28V121L27 139Z" fill="#e2ddce" />
        <Path d="M44 124V74C44 51 77 45 77 67V115Z" fill="#8e9c81" />
        <Path d="M51 122V75C51 59 71 52 71 69V116Z" fill="#bbc5ab" />
        <Path d="M16 132L88 114L104 123L32 143Z" fill="#c5c4b3" />
        <Path d="M16 138L88 120L104 129L32 149Z" fill="#d4d1c0" />
        <Path d="M84 106V76M84 91L76 82M84 96L94 85" fill="none" stroke="#6d8065" strokeWidth={1.5} />
        <Circle cx={77} cy={79} r={7} fill="#a4b196" /><Circle cx={88} cy={75} r={8} fill="#93a487" /><Circle cx={94} cy={86} r={6} fill="#adbaa0" />
        <Path d="M77 103H92L89 116H80Z" fill="#a9a38b" />
      </Svg>
      <View style={styles.photoLabel}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.photoLabelText}>No photo</Text></View>
    </View>
  );
}

export function ProjectCard({ project, onPress }: { readonly project: ProjectItem; readonly onPress: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.3;
  const tone = statusColors[project.status];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${project.name}. ${projectStatusLabels[project.status]}.${project.subtitle ? ` ${project.subtitle}.` : ""}${project.dateLabel ? ` ${project.dateLabel}.` : ""} Project photo and phase are not available.`}
      onPress={onPress} style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}>
      <View style={[styles.photoSlot, compact ? styles.photoSlotCompact : null]}><PhotoPlaceholder /></View>
      <View style={styles.content}>
        <View style={[styles.titleRow, compact ? styles.titleRowCompact : null]}>
          <View style={styles.titleCopy}>
            <Text style={styles.name}>{project.name}</Text>
            {project.subtitle ? <Text style={styles.subtitle}>{project.subtitle}</Text> : null}
          </View>
          <View style={[styles.badge, { backgroundColor: tone.background }]}>
            <View style={[styles.badgeDot, { backgroundColor: tone.dot }]} />
            <Text style={[styles.badgeLabel, { color: tone.ink }]}>{projectStatusLabels[project.status]}</Text>
          </View>
        </View>
        <View style={styles.phaseSection}>
          <View style={styles.phaseSteps} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.phaseLine} />
            {["Design", "Execution", "Handover"].map((label) => (
              <View key={label} style={styles.phaseStep}>
                <View style={styles.phaseDot} /><Text style={styles.phaseLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.phaseUnavailable}>Phase not available</Text>
        </View>
        {project.dateLabel ? <View style={styles.dateRow}>
          <Svg width={14} height={14} viewBox="0 0 20 20" accessible={false}><Rect x={3} y={5} width={14} height={12} rx={1} fill="none" stroke={colors.inkMuted} strokeWidth={1.2} /><Path d="M3 9H17M6 3V7M14 3V7M6 12H8M11 12H13" stroke={colors.inkMuted} strokeWidth={1.2} /></Svg>
          <Text style={styles.date}>{project.dateLabel}</Text>
        </View> : null}
      </View>
      <Svg accessibilityElementsHidden importantForAccessibility="no-hide-descendants" width={14} height={22} viewBox="0 0 14 22" style={styles.chevron}><Path d="M4 6L9 11L4 16" fill="none" stroke={colors.inkMuted} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "stretch", gap: 12, padding: 5, paddingRight: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, minHeight: 150 },
  photoSlot: { width: 96, minHeight: 140 },
  photoSlotCompact: { width: 64 },
  photo: { flex: 1, overflow: "hidden", borderRadius: 10, backgroundColor: colors.surfaceMuted },
  photoLabel: { position: "absolute", left: 5, right: 5, bottom: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: "rgba(246,244,236,0.94)", alignItems: "center" },
  photoLabelText: { fontFamily: fonts.medium, fontSize: 9, lineHeight: 14, color: colors.inkMuted },
  content: { flex: 1, minWidth: 0, paddingVertical: 10, gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: 5 },
  titleRowCompact: { flexDirection: "column" },
  titleCopy: { flex: 1, minWidth: 90 },
  name: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.ink },
  subtitle: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 16, color: colors.inkMuted },
  badge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, flexShrink: 1 },
  badgeDot: { height: 6, width: 6, borderRadius: 3 },
  badgeLabel: { fontFamily: fonts.medium, fontSize: 9, lineHeight: 14, flexShrink: 1 },
  phaseSection: { gap: 4 },
  phaseSteps: { flexDirection: "row", paddingTop: 1, position: "relative" },
  phaseLine: { position: "absolute", top: 6, left: "12%", right: "12%", height: 1, backgroundColor: colors.border },
  phaseStep: { flex: 1, alignItems: "center", gap: 4 },
  phaseDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  phaseLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 8, lineHeight: 13, textAlign: "center" },
  phaseUnavailable: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 9, lineHeight: 14 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  date: { flex: 1, color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 9, lineHeight: 14 },
  chevron: { alignSelf: "center", marginLeft: -6 },
  pressed: { opacity: 0.72 }
});

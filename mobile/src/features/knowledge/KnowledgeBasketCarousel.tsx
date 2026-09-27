import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { priorityDisplay, sectionSummary, unitLabel, type CatalogState } from "../../../../shared/knowledge/knowledgeIndexPresentation";
import type { KnowledgeItemListItem, KnowledgeMaster } from "../../../../shared/knowledge/knowledgeTypes";
import { colors, fonts } from "../../ui/tokens";

export interface KnowledgeMenuAnchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly trigger?: View;
}

interface KnowledgeBasketCarouselProps {
  readonly basketId: string;
  readonly name: string;
  readonly items: readonly KnowledgeItemListItem[];
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onOpenItem: (id: string) => void;
  readonly onItemMenu: (item: KnowledgeItemListItem, anchor: KnowledgeMenuAnchor) => void;
  readonly onBasketMenu?: (anchor: KnowledgeMenuAnchor) => void;
  readonly uoms: readonly KnowledgeMaster[];
  readonly priorities: readonly KnowledgeMaster[];
  readonly catalogState: CatalogState;
  readonly isLoading?: boolean;
}

const CARD_WIDTH = 136;
const CARD_GAP = 8;
const TRACK_INSET = 12;
// The catalog API has no item image field. This bundled room is decorative artwork.
const DECORATIVE_ROOM = require("../../../assets/brand/project-detail-interior.jpg");

function Icon({ name, size = 18 }: { readonly name: "stack" | "down" | "previous" | "next" | "more"; readonly size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden accessible={false}>
    {name === "stack" ? <><Path d="m3 7 9-5 9 5-9 5-9-5Z" /><Path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></> : null}
    {name === "down" ? <Path d="m7 10 5 5 5-5" /> : null}
    {name === "previous" ? <Path d="m14 7-5 5 5 5" /> : null}
    {name === "next" ? <Path d="m10 7 5 5-5 5" /> : null}
    {name === "more" ? <><Circle cx="12" cy="5" r="1" fill={colors.ink} stroke="none" /><Circle cx="12" cy="12" r="1" fill={colors.ink} stroke="none" /><Circle cx="12" cy="19" r="1" fill={colors.ink} stroke="none" /></> : null}
  </Svg>;
}

function MenuTrigger({ label, onOpen, compact = false }: { readonly label: string; readonly onOpen: (anchor: KnowledgeMenuAnchor) => void; readonly compact?: boolean }) {
  const ref = useRef<View>(null);
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens actions" onPress={() => {
    const trigger = ref.current;
    if (!trigger) return;
    trigger.measureInWindow((x, y, width, height) => onOpen({ x, y, width, height, trigger }));
  }} style={compact ? s.itemMenu : s.basketMenu}>
    <Icon name="more" size={compact ? 14 : 17} />
  </Pressable>;
}

function ItemCard({ item, onOpen, onMenu, uoms, priorities, catalogState }: {
  readonly item: KnowledgeItemListItem;
  readonly onOpen: (id: string) => void;
  readonly onMenu: KnowledgeBasketCarouselProps["onItemMenu"];
  readonly uoms: readonly KnowledgeMaster[];
  readonly priorities: readonly KnowledgeMaster[];
  readonly catalogState: CatalogState;
}) {
  const sections = sectionSummary(item.completeness);
  const unit = unitLabel(item.uomId, uoms, catalogState);
  const priority = priorityDisplay(item.priorityId, priorities, catalogState).label;
  const temporary = item.itemType === "temporary";
  const state = [item.status, item.subBasketName].filter(Boolean).join(" · ");
  const percentage = item.completeness.percentage;
  const details = [temporary ? `Temporary item${item.completionRequired ? ", must be completed" : ""}` : null, state, `${percentage}% complete`, sections ? `${sections.complete}/${sections.applicable} sections` : null, unit, priority].filter(Boolean).join(". ");
  return <View style={s.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.mainLineName}`} accessibilityHint={details} onPress={() => onOpen(item.mainLineId)} style={s.cardContent}>
      <Image source={DECORATIVE_ROOM} accessible={false} accessibilityIgnoresInvertColors resizeMode="cover" style={s.thumbnail} />
      <Text numberOfLines={2} style={s.itemTitle}>{item.mainLineName}</Text>
      {temporary ? <View style={s.temporary}><Text numberOfLines={1} style={s.temporaryLabel}>Temporary</Text></View> : <Text numberOfLines={1} style={s.itemState}>{state}</Text>}
      <View style={s.progressRow}>
        <View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.min(100, Math.max(0, percentage))}%` }]} /></View>
        <Text style={s.percentage}>{percentage}%</Text>
      </View>
      <Text numberOfLines={1} style={s.metadata}>{sections ? `${sections.complete}/${sections.applicable} · ` : ""}{unit}</Text>
    </Pressable>
    <MenuTrigger label={`Actions for ${item.mainLineName}`} compact onOpen={anchor => onMenu(item, anchor)} />
  </View>;
}

function nearestOffset(offsets: readonly number[], x: number) {
  return offsets.reduce((closest, value, index) => Math.abs(value - x) < Math.abs(offsets[closest]! - x) ? index : closest, 0);
}

export function KnowledgeBasketCarousel({ basketId, name, items, expanded, onToggle, onOpenItem, onItemMenu, onBasketMenu, uoms, priorities, catalogState, isLoading = false }: KnowledgeBasketCarouselProps) {
  const track = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const [width, setWidth] = useState(0);
  const [position, setPosition] = useState(0);
  const contentWidth = items.length ? TRACK_INSET * 2 + items.length * CARD_WIDTH + (items.length - 1) * CARD_GAP : 0;
  const maxScroll = width > 0 ? Math.max(0, contentWidth - width) : 0;
  const offsets = useMemo(() => {
    const result = [0];
    for (let x = CARD_WIDTH + CARD_GAP; x < maxScroll; x += CARD_WIDTH + CARD_GAP) result.push(x);
    if (maxScroll > 0) result.push(maxScroll);
    return result;
  }, [maxScroll]);
  useEffect(() => {
    const next = Math.min(scrollX.current, maxScroll);
    scrollX.current = next;
    setPosition(nearestOffset(offsets, next));
    track.current?.scrollTo({ x: next, animated: false });
  }, [maxScroll, offsets, expanded]);
  const moveTo = (index: number) => {
    const clamped = Math.max(0, Math.min(offsets.length - 1, index));
    const x = offsets[clamped]!;
    scrollX.current = x;
    setPosition(clamped);
    track.current?.scrollTo({ x, animated: false });
  };
  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.current = Math.max(0, Math.min(maxScroll, nativeEvent.contentOffset.x));
    setPosition(nearestOffset(offsets, scrollX.current));
  };
  return <View style={s.basket}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${name}`} accessibilityHint={`${items.length} ${items.length === 1 ? "item" : "items"} on this page`} accessibilityState={{ expanded }} onPress={onToggle} style={s.heading}>
        <Icon name={expanded ? "down" : "next"} size={16} />
        <Icon name="stack" size={19} />
        <Text numberOfLines={1} style={s.name}>{name}</Text>
        <Text style={s.count}>{items.length} {items.length === 1 ? "item" : "items"}</Text>
      </Pressable>
      {onBasketMenu ? <MenuTrigger label={`Actions for ${name}`} onOpen={onBasketMenu} /> : null}
    </View>
    {expanded ? items.length ? <>
      <View style={s.carousel}>
        <ScrollView ref={track} testID={`basket-carousel-${basketId}`} horizontal showsHorizontalScrollIndicator={false} onLayout={event => setWidth(event.nativeEvent.layout.width)} onScroll={onScroll} scrollEventThrottle={32} snapToOffsets={offsets} decelerationRate="fast" contentContainerStyle={s.track}>
          {items.map(item => <ItemCard key={item.mainLineId} item={item} onOpen={onOpenItem} onMenu={onItemMenu} uoms={uoms} priorities={priorities} catalogState={catalogState} />)}
        </ScrollView>
        {offsets.length > 1 ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Previous items in ${name}`} accessibilityState={{ disabled: position === 0 }} disabled={position === 0} onPress={() => moveTo(position - 1)} style={[s.arrow, s.previous, position === 0 && s.disabled]}><View style={s.arrowCircle}><Icon name="previous" size={16} /></View></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Next items in ${name}`} accessibilityState={{ disabled: position === offsets.length - 1 }} disabled={position === offsets.length - 1} onPress={() => moveTo(position + 1)} style={[s.arrow, s.next, position === offsets.length - 1 && s.disabled]}><View style={s.arrowCircle}><Icon name="next" size={16} /></View></Pressable>
        </> : null}
      </View>
      <View accessible accessibilityLabel={`${name}, carousel position ${position + 1} of ${offsets.length}`} style={s.pagination}>
        {offsets.map((offset, index) => <View key={offset} style={[s.dot, index === position && s.activeDot]} />)}
      </View>
    </> : <Text style={s.empty}>{isLoading ? "Loading items…" : "No items on this page."}</Text> : null}
  </View>;
}

const s = StyleSheet.create({
  basket: { marginHorizontal: -8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  heading: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 10, minHeight: 44 },
  name: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.ink },
  count: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 16, color: colors.inkMuted, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.surfaceMuted, borderRadius: 4 },
  basketMenu: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  carousel: { position: "relative" },
  track: { paddingHorizontal: TRACK_INSET, gap: CARD_GAP, paddingBottom: 4 },
  card: { width: CARD_WIDTH, minHeight: 170, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 5 },
  cardContent: { padding: 8, flex: 1 },
  thumbnail: { width: "100%", height: 66, borderRadius: 3, marginBottom: 7 },
  itemTitle: { fontFamily: fonts.semibold, fontSize: 11.5, lineHeight: 16, minHeight: 32, paddingRight: 38, color: colors.ink },
  itemMenu: { position: "absolute", top: 76, right: 0, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  itemState: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 15, color: colors.inkMuted, marginTop: 1 },
  temporary: { alignSelf: "flex-start", maxWidth: "100%", marginTop: 1, paddingHorizontal: 4, borderRadius: 2, backgroundColor: colors.surfaceMuted },
  temporaryLabel: { fontFamily: fonts.medium, fontSize: 9, lineHeight: 15, color: colors.ink },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  progressTrack: { flex: 1, height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: colors.primary },
  percentage: { fontFamily: fonts.regular, fontSize: 9, lineHeight: 14, color: colors.inkMuted },
  metadata: { fontFamily: fonts.regular, fontSize: 9.5, lineHeight: 15, marginTop: 3, color: colors.inkMuted },
  arrow: { position: "absolute", top: 46, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  previous: { left: 0 },
  next: { right: 0 },
  arrowCircle: { width: 23, height: 23, borderRadius: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.42 },
  pagination: { minHeight: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border },
  activeDot: { width: 13, backgroundColor: colors.primary },
  empty: { paddingHorizontal: 20, paddingBottom: 14, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, color: colors.inkMuted }
});

import { useCallback, useEffect, useRef } from "react";
import * as ReactNative from "react-native";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle
} from "react-native";

import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { ChatIcon, type ChatIconName } from "./ChatIcon";
import { chatColors } from "./chatTheme";

export type AttachmentOptionSource = "photo" | "camera" | "file";

export interface AttachmentOptionsSheetProps {
  readonly visible: boolean;
  readonly compact: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly busySource?: AttachmentOptionSource | null;
  readonly photoAvailable?: boolean;
  readonly cameraAvailable?: boolean;
  readonly fileAvailable?: boolean;
  readonly onRequestClose: () => void;
  readonly onChoosePhoto: () => void;
  readonly onTakePhoto: () => void;
  readonly onChooseFile: () => void;
  readonly onRestoreFocus?: () => void;
}

interface AttachmentOption {
  readonly source: AttachmentOptionSource;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly icon: ChatIconName;
  readonly iconColor: string;
  readonly iconBackgroundColor: string;
}

const options: readonly AttachmentOption[] = Object.freeze([
  {
    source: "photo",
    label: "Photo",
    accessibilityLabel: "Choose a photo",
    icon: "photo",
    iconColor: colors.violet,
    iconBackgroundColor: colors.violetSoft
  },
  {
    source: "camera",
    label: "Camera",
    accessibilityLabel: "Take a photo",
    icon: "camera",
    iconColor: chatColors.greenStrong,
    iconBackgroundColor: colors.successSoft
  },
  {
    source: "file",
    label: "File",
    accessibilityLabel: "Choose a file",
    icon: "file",
    iconColor: colors.info,
    iconBackgroundColor: colors.infoSoft
  }
]);

/**
 * Presentation-only attachment source chooser. Capability and upload decisions
 * stay in the composer; this surface only reports the selected source.
 */
export function AttachmentOptionsSheet({
  visible,
  compact,
  disabled = false,
  busy = false,
  busySource = null,
  photoAvailable = true,
  cameraAvailable = true,
  fileAvailable = true,
  onRequestClose,
  onChoosePhoto,
  onTakePhoto,
  onChooseFile,
  onRestoreFocus
}: AttachmentOptionsSheetProps) {
  const { fontScale, width } = useWindowDimensions();
  const reflowActions = width < 320 || fontScale >= 2;
  const photoAction = useRef<View>(null);
  const wasVisible = useRef(visible);
  const focusRequest = useRef<number | null>(null);
  const availability: Readonly<Record<AttachmentOptionSource, boolean>> = {
    photo: photoAvailable,
    camera: cameraAvailable,
    file: fileAvailable
  };
  const callbacks: Readonly<Record<AttachmentOptionSource, () => void>> = {
    photo: onChoosePhoto,
    camera: onTakePhoto,
    file: onChooseFile
  };

  const focusPhoto = useCallback(() => {
    if (focusRequest.current !== null) cancelAnimationFrame(focusRequest.current);
    focusRequest.current = requestAnimationFrame(() => {
      focusRequest.current = null;
      const handle = ReactNative.findNodeHandle(photoAction.current);
      if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }, []);

  useEffect(() => () => {
    if (focusRequest.current !== null) cancelAnimationFrame(focusRequest.current);
  }, []);

  useEffect(() => {
    const restore = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (restore) onRestoreFocus?.();
  }, [onRestoreFocus, visible]);

  useEffect(() => {
    if (visible && !compact) {
      focusPhoto();
      return;
    }
    if (focusRequest.current !== null) {
      cancelAnimationFrame(focusRequest.current);
      focusRequest.current = null;
    }
  }, [compact, focusPhoto, visible]);

  const panel = (
    <View
      accessibilityLabel="Attachment options"
      accessibilityViewIsModal={compact}
      style={[styles.panel, compact ? styles.panelCompact : styles.panelExpanded]}
      testID="attachment-options-panel"
    >
      <View
        style={[styles.actions, reflowActions ? styles.actionsReflow : null]}
        testID="attachment-options-actions"
      >
        {options.map((option) => {
          const available = availability[option.source];
          const optionBusy = busy && (!busySource || busySource === option.source);
          const optionDisabled = disabled || busy || !available;
          const actionStyle: ViewStyle = { backgroundColor: option.iconBackgroundColor };
          return (
            <Pressable
              key={option.source}
              accessibilityHint={available ? undefined : `${option.label} is unavailable for this conversation.`}
              accessibilityLabel={option.accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ busy: optionBusy, disabled: optionDisabled }}
              disabled={optionDisabled}
              onPress={callbacks[option.source]}
              ref={option.source === "photo" ? photoAction : undefined}
              style={({ pressed }) => [
                styles.action,
                reflowActions ? styles.actionReflow : null,
                optionDisabled ? styles.actionDisabled : null,
                pressed ? styles.actionPressed : null
              ]}
            >
              <View style={[styles.iconWell, actionStyle]}>
                {optionBusy
                  ? <ActivityIndicator color={option.iconColor} size="small" />
                  : <ChatIcon color={option.iconColor} name={option.icon} size={25} />}
              </View>
              <Text style={styles.actionLabel}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {busy ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>Opening your device picker…</Text>
      ) : null}
    </View>
  );

  if (!compact) {
    if (!visible) return null;
    return (
      <View pointerEvents="box-none" style={styles.expandedAnchor} testID="attachment-options-expanded-anchor">
        {panel}
        <Pressable
          accessible={false}
          onPress={onRequestClose}
          style={styles.expandedOutsidePress}
          testID="attachment-options-expanded-outside-press"
        />
      </View>
    );
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={onRequestClose}
      onShow={focusPhoto}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={[styles.overlay, styles.overlayCompact]}>
        <Pressable
          accessibilityLabel="Close attachment options"
          accessibilityRole="button"
          onPress={onRequestClose}
          style={styles.backdrop}
        />
        {panel}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  overlayCompact: {
    paddingHorizontal: spacing.xs,
    paddingBottom: 76
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(17, 27, 33, 0.42)"
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: chatColors.border,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    shadowColor: chatColors.ink,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12
  },
  panelCompact: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    borderRadius: 18
  },
  panelExpanded: {
    width: "100%",
    maxWidth: 320,
    flexShrink: 1,
    borderRadius: radii.surface
  },
  expandedAnchor: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    zIndex: 20
  },
  expandedOutsidePress: {
    minWidth: 48,
    flex: 1,
    alignSelf: "stretch"
  },
  actions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.xxs
  },
  actionsReflow: {
    flexDirection: "column"
  },
  action: {
    minWidth: 80,
    minHeight: 72,
    flexBasis: 80,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    borderRadius: radii.control
  },
  actionReflow: {
    width: "100%",
    minWidth: 48,
    minHeight: 48,
    flexBasis: "auto",
    flexGrow: 0,
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs
  },
  actionDisabled: {
    opacity: 0.46
  },
  actionPressed: {
    backgroundColor: colors.surfaceMuted
  },
  iconWell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center"
  },
  actionLabel: {
    color: chatColors.ink,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    flexShrink: 1
  },
  status: {
    color: chatColors.muted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center"
  }
});

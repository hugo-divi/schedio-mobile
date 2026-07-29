import { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../theme/tokens';

const font = tokens.typography.families.inter;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Past this much drag (or a fast enough flick) the sheet commits to closing.
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

/**
 * The sheet every home-screen modal sits in: dimmed backdrop, rounded top,
 * grab handle, slide-up entrance, and drag-down-to-dismiss.
 *
 * The drag is bound to the handle area rather than the whole sheet, so it never
 * competes with a ScrollView or a horizontal chip list inside the content.
 *
 * Pass `title`/`subtitle` for the standard heading, or render your own header
 * in `children` and leave them out.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  avoidKeyboard = false,
}) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    if (!visible) return;
    // Modal mounts its content on open, so start from off-screen every time.
    translateY.value = SCREEN_HEIGHT;
    translateY.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [visible, translateY]);

  // Animate out, then let the parent unmount us.
  const dismiss = useCallback(() => {
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onClose)();
      }
    );
  }, [onClose, translateY]);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      // Downward only — dragging up shouldn't lift the sheet off its edge.
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldClose =
        event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
      if (shouldClose) {
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 200, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(onClose)();
          }
        );
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 240 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const sheet = (
    <Pressable onPress={() => {}}>
      <Animated.View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }, sheetStyle]}>
        <GestureDetector gesture={pan}>
          {/* Padded so the 4px bar isn't the whole target */}
          <View style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
        </GestureDetector>

        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </Animated.View>
    </Pressable>
  );

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={dismiss}>
      <Pressable style={styles.overlay} onPress={dismiss}>
        {avoidKeyboard ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardView}
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
      </Pressable>
    </Modal>
  );
}

/** Small caps label above a field or group. */
export function FieldLabel({ children, style }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export const sheetStyles = StyleSheet.create({
  /** Helper text under a field; turns red via `helperError`. */
  helper: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 8,
  },
  helperError: {
    color: tokens.colors.danger,
  },
  /** Side-by-side footer buttons. */
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
    borderTopLeftRadius: tokens.radius.sheet,
    borderTopRightRadius: tokens.radius.sheet,
    paddingHorizontal: 24,
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 16,
    marginHorizontal: -24,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 22,
    color: tokens.colors.textPrimary,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginBottom: 6,
  },
});

export default BottomSheet;

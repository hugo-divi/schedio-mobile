import { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Keyboard,
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
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../theme/tokens';

const font = tokens.typography.families.inter;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Tall sheets (the event form with its calendar open, the rank ladder) must
// stay reachable without pushing the buttons off-screen.
const MAX_SHEET_HEIGHT = SCREEN_HEIGHT * 0.88;

// Past this much drag (or a fast enough flick) the sheet commits to closing.
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

// RN's Modal renders in its own native window, which doesn't reliably inherit
// the activity's keyboard-resize behavior — KeyboardAvoidingView alone does
// nothing inside it on Android. Tracking the keyboard directly and nudging
// the sheet up ourselves works regardless of that.
const KEYBOARD_SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const KEYBOARD_HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

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
export function BottomSheet({ visible, onClose, title, subtitle, children }) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const keyboardShift = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    // Modal mounts its content on open, so start from off-screen every time.
    translateY.value = SCREEN_HEIGHT;
    translateY.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    keyboardShift.value = 0;
  }, [visible, translateY, keyboardShift]);

  // Shifts the sheet up by however much the keyboard actually overlaps it —
  // insets.bottom is padding the sheet already reserves, so only the part of
  // the keyboard beyond that needs to be compensated for.
  useEffect(() => {
    if (!visible) return;

    const onShow = (event) => {
      const height = event?.endCoordinates?.height ?? 0;
      const overlap = Math.max(0, height - insets.bottom);
      keyboardShift.value = withTiming(-overlap, {
        duration: event?.duration || 220,
        easing: Easing.out(Easing.cubic),
      });
    };
    const onHide = (event) => {
      keyboardShift.value = withTiming(0, {
        duration: event?.duration || 200,
        easing: Easing.out(Easing.cubic),
      });
    };

    const showSub = Keyboard.addListener(KEYBOARD_SHOW_EVENT, onShow);
    const hideSub = Keyboard.addListener(KEYBOARD_HIDE_EVENT, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, insets.bottom, keyboardShift]);

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
    transform: [{ translateY: translateY.value + keyboardShift.value }],
  }));

  const sheet = (
    <Pressable onPress={() => {}}>
      <Animated.View style={[styles.sheet, sheetStyle]}>
        <GestureDetector gesture={pan}>
          {/* Padded so the 4px bar isn't the whole target */}
          <View style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
        </GestureDetector>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {children}
        </ScrollView>
      </Animated.View>
    </Pressable>
  );

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={dismiss}>
      {/* RN's Modal renders in its own view hierarchy, outside the root
          GestureHandlerRootView, so gestures inside it need their own. */}
      <GestureHandlerRootView style={styles.flex}>
        <Pressable style={styles.overlay} onPress={dismiss}>
          {sheet}
        </Pressable>
      </GestureHandlerRootView>
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
  flex: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
    borderTopLeftRadius: tokens.radius.sheet,
    borderTopRightRadius: tokens.radius.sheet,
    maxHeight: MAX_SHEET_HEIGHT,
  },
  scroll: {
    // Keeps the sheet as short as its content until it hits the cap.
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  // The Pan gesture is bound to this area alone (see the comment above), so
  // its size *is* the drag-to-dismiss target — padded well past the 4px bar
  // itself rather than just enough to not look cramped.
  handleArea: {
    paddingTop: 20,
    paddingBottom: 28,
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

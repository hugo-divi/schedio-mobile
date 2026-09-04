import { useCallback, useEffect, useRef, useState } from 'react';
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
 * The drag is bound to the handle + title/subtitle block rather than the whole
 * sheet, so it never competes with a ScrollView or a horizontal chip list
 * inside the content. That block used to be just the 4px handle bar's own
 * small hit area — too small to find by feel, forcing a drag to start from a
 * very precise, very high spot on a tall sheet. Folding the title in gives a
 * much larger, still-safe target, since title/subtitle are never interactive.
 *
 * Pass `title`/`subtitle` for the standard heading, or render your own header
 * in `children` and leave them out — that header won't be draggable, only the
 * handle will.
 */
export function BottomSheet({ visible, onClose, title, subtitle, children }) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const keyboardShift = useSharedValue(0);
  // Extra scroll room added under the content when the sheet is too tall to be
  // lifted clear of the keyboard on its own (see the keyboard effect below).
  const [keyboardPad, setKeyboardPad] = useState(0);
  // Set by the sheet's onLayout so the keyboard-avoidance effect below knows
  // how tall the actual (possibly short) sheet is, not just the screen.
  const sheetHeightRef = useRef(0);
  // Where the inner ScrollView is. Written from its onScroll and read by the
  // content drag below, which must not fight the scroll.
  const scrollAtTop = useSharedValue(true);
  // Decided once per gesture, in onBegin, rather than continuously: if it were
  // re-evaluated mid-drag, scrolling up to the top and carrying on would make
  // the sheet jump by however far the finger had already travelled.
  const contentDragArmed = useSharedValue(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    // Modal mounts its content on open, so start from off-screen every time.
    translateY.value = SCREEN_HEIGHT;
    translateY.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    keyboardShift.value = 0;
    setKeyboardPad(0);
    // A sheet reopened after being scrolled down would otherwise start with
    // the content drag disarmed until the first scroll event.
    scrollAtTop.value = true;
  }, [visible, translateY, keyboardShift, scrollAtTop]);

  // Shifts the sheet up by however much the keyboard actually overlaps it —
  // insets.bottom is padding the sheet already reserves, so only the part of
  // the keyboard beyond that needs to be compensated for.
  //
  // Capped so a short sheet (e.g. the subject editor, just a couple of fields)
  // never gets pushed past a comfortable top margin — uncapped, shifting by the
  // full keyboard height crowded the title right up against the status bar on
  // sheets much shorter than the keyboard is tall.
  //
  // Whatever overlap the cap leaves uncovered is added as scroll room under the
  // content instead, so a tall sheet (the new-exam form, the subject editor
  // with all its fields) can still scroll its lower fields and its action
  // buttons above the keyboard. A short sheet lifts fully, so this stays 0 and
  // nothing about it changes.
  useEffect(() => {
    if (!visible) return;

    const onShow = (event) => {
      const height = event?.endCoordinates?.height ?? 0;
      const overlap = Math.max(0, height - insets.bottom);
      const safeTop = insets.top + 24;
      const maxRise = Math.max(0, SCREEN_HEIGHT - sheetHeightRef.current - safeTop);
      const clampedOverlap = Math.min(overlap, maxRise);
      keyboardShift.value = withTiming(-clampedOverlap, {
        duration: event?.duration || 220,
        easing: Easing.out(Easing.cubic),
      });
      setKeyboardPad(Math.max(0, overlap - clampedOverlap));
    };
    const onHide = (event) => {
      keyboardShift.value = withTiming(0, {
        duration: event?.duration || 200,
        easing: Easing.out(Easing.cubic),
      });
      setKeyboardPad(0);
    };

    const showSub = Keyboard.addListener(KEYBOARD_SHOW_EVENT, onShow);
    const hideSub = Keyboard.addListener(KEYBOARD_HIDE_EVENT, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
    // insets.bottom/insets.top deliberately left out of the deps: Android's
    // edge-to-edge safe-area recalculates them while the IME is open, and
    // depending on them re-ran this effect mid-keyboard-session — detaching
    // and reattaching the listeners, with a real chance of missing whichever
    // show/hide event lands in that gap. The insets at the moment the sheet
    // opens are what this needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, keyboardShift]);

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

  const settle = (event) => {
    'worklet';
    const shouldClose = event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
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
  };

  // The handle and title: always draggable, whatever the content is doing.
  const pan = Gesture.Pan()
    .onUpdate((event) => {
      // Downward only — dragging up shouldn't lift the sheet off its edge.
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd(settle);

  /**
   * The same drag, but from anywhere in the content — the handle alone was a
   * thin strip at the very top of a sheet that can be most of the screen, so
   * closing one meant reaching for it every time.
   *
   * It only arms when the content is already scrolled to the top, so a list
   * still scrolls normally and only starts dragging the sheet once there's
   * nothing left to scroll. Running simultaneously with the ScrollView (rather
   * than blocking it) keeps that handover from feeling like a fight, and the
   * horizontal fail-offset leaves the chip rows inside some sheets alone.
   */
  const contentPan = Gesture.Pan()
    .activeOffsetY(14)
    .failOffsetX([-16, 16])
    .simultaneousWithExternalGesture(scrollRef)
    .onBegin(() => {
      contentDragArmed.value = scrollAtTop.value;
    })
    .onUpdate((event) => {
      if (!contentDragArmed.value) return;
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (!contentDragArmed.value) return;
      settle(event);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + keyboardShift.value }],
  }));

  const sheet = (
    <Pressable onPress={() => {}}>
      <Animated.View
        style={[styles.sheet, sheetStyle]}
        onLayout={(event) => {
          sheetHeightRef.current = event.nativeEvent.layout.height;
        }}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.header}>
            {/* Padded so the 4px bar isn't the whole target */}
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </GestureDetector>

        <GestureDetector gesture={contentPan}>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: 24 + insets.bottom + keyboardPad },
            ]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={(event) => {
              scrollAtTop.value = event.nativeEvent.contentOffset.y <= 0;
            }}
          >
            {children}
          </ScrollView>
        </GestureDetector>
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
  // The Pan gesture is bound to this block (see the comment above), so its
  // size *is* the drag-to-dismiss target. Same horizontal padding as
  // scrollContent so title/subtitle stay aligned with the body now that
  // they've moved out of the ScrollView.
  header: {
    paddingHorizontal: 24,
  },
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

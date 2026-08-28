import { useEffect } from 'react';
import { View, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { ScrollView } from 'react-native-gesture-handler';
import { tokens } from '../../theme/tokens';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Mirrors `tabBarStyle.height` in app/dashboard/_layout.js. Exported so the
 * layout and every sheet that has to clear the bar read the same number
 * instead of each hard-coding 85.
 */
export const TAB_BAR_HEIGHT = 85;
export const TAB_BAR_PADDING_BOTTOM = 25;

/**
 * Where the raised "+" sits, measured from the bottom of the screen.
 *
 * Tab items centre in the bar's content box (height minus its bottom padding),
 * and the button is then lifted clear of the bar. Derived rather than typed as
 * a magic number so changing the bar's height moves the button with it.
 */
export const FAB_SIZE = 52;
export const FAB_LIFT = 20;
export const FAB_BOTTOM =
  TAB_BAR_PADDING_BOTTOM + (TAB_BAR_HEIGHT - TAB_BAR_PADDING_BOTTOM) / 2 + FAB_LIFT - FAB_SIZE / 2;

/**
 * A sheet that stops above the tab bar instead of covering it.
 *
 * `BottomSheet` is built on React Native's `Modal`, which draws into its own
 * native window on top of everything — so it can never leave the tab bar or
 * the centre button visible, no matter how it's styled. That isn't a styling
 * choice to undo; it's why the quick-actions sheet swallowed the whole bottom
 * of the app. This one is an ordinary absolutely-positioned View inside the
 * tabs layout, so the bar stays lit and the "+" stays where it was.
 *
 * `bottomOffset` is how much room to leave at the bottom — the tab bar's
 * height. The scrim stops at the same line for the same reason.
 *
 * Being outside `Modal` also means the keyboard behaves natively here: the
 * manual keyboard tracking `BottomSheet` needs is only necessary because a
 * Modal doesn't inherit the activity's resize behaviour.
 */
export default function InlineSheet({ visible, onClose, bottomOffset = 0, children }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = visible
      ? withSpring(1, { damping: 22, stiffness: 240, mass: 0.7 })
      : withTiming(0, { duration: 180, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  }, [visible, progress]);

  // Translated by a fixed large distance rather than by measured height: the
  // sheet's content changes between views (five actions, a note field, a grade
  // form) and re-measuring mid-animation made it jump.
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (SCREEN_HEIGHT * 0.6) }],
    opacity: progress.value === 0 ? 0 : 1,
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.55 }));

  // No early return on a closed sheet: unmounting would need `progress.value`
  // read during render, which Reanimated warns about, and it would cut the
  // closing animation short anyway. `pointerEvents` is what makes it inert.
  return (
    <>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.scrim, { bottom: bottomOffset }, scrimStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
      </Animated.View>

      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.sheet, { bottom: bottomOffset }, sheetStyle]}
      >
        <View style={styles.grab} />
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.body}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Capped so a tall view (the grade form with the keyboard up) can never
    // grow into a full-screen takeover — the point of this sheet is that the
    // app stays visible behind it.
    //
    // Raised from 0.6: the six quick actions didn't fit, so the main view
    // opened already scrollable. A sheet you have to scroll to see the last
    // option hides it, and the scroll fights the swipe-down anyone expects
    // from the grab handle. A quarter of the screen plus the tab bar is still
    // plenty to keep the app present behind it.
    maxHeight: SCREEN_HEIGHT * 0.75,
    backgroundColor: tokens.colors.background,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
    borderTopLeftRadius: tokens.radius.sheet,
    borderTopRightRadius: tokens.radius.sheet,
    paddingTop: 10,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.borderDefault,
    alignSelf: 'center',
    marginBottom: 12,
  },
  body: {
    paddingHorizontal: 20,
    // Clears the raised "+" that overlaps this sheet's bottom edge, so the
    // last action is never sitting underneath it. The button's top edge lands
    // ~16px inside the sheet, so this has room to spare at 32.
    paddingBottom: 32,
  },
});

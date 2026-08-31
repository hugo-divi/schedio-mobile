import { useEffect } from 'react';
import { View, Text, Image, Platform, AccessibilityInfo, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';

const font = tokens.typography.families.inter;
const MARK = require('../assets/images/schedio-mark-white.png');

/**
 * The beat between finishing registration and the first onboarding question.
 *
 * Deliberately *not* `SchedioLogoReveal`. That one draws the mark stroke by
 * stroke and bursts, and takes close to four seconds — it is the signature
 * moment of the Estudiar screen and reusing it here would both spend four
 * seconds of a student's patience before the first question and dilute the one
 * place it means something. This is a different, shorter gesture built from the
 * same mark: it arrives, it settles, it gets out of the way.
 *
 * It earns its place because the time is not invented. Registration has just
 * written the user document, and `loadOnboarding` runs on mount — the screen
 * had a blank moment here anyway. This fills it with an assertion instead of
 * with nothing, so the flow opens by saying something rather than by asking.
 *
 * Only ever shown on a genuine first entry (see the `intro` flag in
 * app/onboarding.js). Someone resuming a half-finished onboarding wants their
 * next question, not a title card.
 */

const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** When the arrival ends and the exit begins. The whole beat lands at about
 *  1,64 s — long enough to read as deliberate, short enough that nobody feels
 *  they waited. `onDone` fires off the fade's own callback rather than a
 *  parallel timer, so the questions never appear over a mark still leaving. */
const HOLD_AT = 1120;

/** How far the mark rises as it shrinks. Not a measured hand-off into the
 *  progress bar: pinning to the header's real coordinates would mean measuring
 *  a view that has not mounted yet, and the read — one object moving up and
 *  out of the way as the header takes its place — survives without it. */
const LIFT = 132;

export default function OnboardingIntro({ onDone }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.55);
  const lift = useSharedValue(0);
  const word = useSharedValue(0);

  useEffect(() => {
    let timer = null;
    let cancelled = false;

    const finish = () => {
      if (!cancelled) onDone();
    };

    const run = () => {
      // Arrive.
      opacity.value = withTiming(1, { duration: 520, easing: EASE });
      scale.value = withSpring(1, { damping: 12, stiffness: 130, mass: 0.7 });
      word.value = withDelay(420, withTiming(1, { duration: 420, easing: EASE }));

      // Settle out of the way. The wordmark goes first so the mark is alone
      // for the shrink — two things leaving at once reads as a dismissal
      // rather than as a hand-off.
      word.value = withDelay(HOLD_AT, withTiming(0, { duration: 220, easing: EASE }));
      scale.value = withDelay(HOLD_AT, withTiming(0.35, { duration: 440, easing: EASE }));
      lift.value = withDelay(HOLD_AT, withTiming(-LIFT, { duration: 460, easing: EASE }));
      opacity.value = withDelay(
        HOLD_AT + 120,
        withTiming(0, { duration: 380, easing: EASE }, (done) => {
          if (done) runOnJS(finish)();
        })
      );

      if (Platform.OS !== 'web') {
        timer = setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }, HOLD_AT);
      }
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        // Someone who has asked the OS to cut animations does not want a title
        // card either — they get the first question straight away.
        if (reduce) finish();
        else run();
      })
      .catch(() => {
        if (!cancelled) run();
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Runs once: the animation owns the whole lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }, { scale: scale.value }],
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: (1 - word.value) * 8 }],
  }));

  return (
    <View
      style={styles.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={markStyle}>
        <Image source={MARK} style={styles.mark} resizeMode="contain" />
      </Animated.View>
      <Animated.View style={[styles.wordWrap, wordStyle]}>
        <Text style={styles.word}>Schedio</Text>
      </Animated.View>
    </View>
  );
}

// Fixed height under the mark rather than a margin that grows and shrinks with
// the wordmark: the mark has to stay put while the word fades, or the whole
// thing drifts a few pixels at exactly the moment it is meant to look settled.
const WORD_BLOCK = 44;

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  mark: { width: 96, height: 96 },
  wordWrap: { height: WORD_BLOCK, justifyContent: 'center' },
  word: {
    fontFamily: font.bold,
    fontSize: 19,
    letterSpacing: -0.2,
    color: tokens.colors.textPrimary,
  },
});

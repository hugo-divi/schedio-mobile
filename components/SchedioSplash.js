import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '../theme/tokens';

const MARK_WHITE = require('../assets/images/schedio-mark-white.png');

// The mark ships at 511x488; every size below is derived from that ratio so the
// glyph never distorts, whatever width the screen gives it.
const MARK_W = 511;
const MARK_H = 488;

/**
 * Width of the mark, in dp.
 *
 * MUST stay equal to `imageWidth` in app.json's `expo-splash-screen` plugin
 * config — that is the whole point of it being a fixed number rather than a
 * share of the screen's width. The native splash draws its icon at an absolute
 * dp size, so a proportional mark here would line up on one phone width and be
 * visibly wrong on every other, and the handover between the two would show as
 * the mark jumping size. Change one, change the other.
 */
const MARK_SIZE = 52;

const EASE = Easing.bezier(...tokens.animations.primary);
const EASE_OUT = Easing.out(Easing.cubic);
// The exit accelerates instead of easing out — it is leaving, not arriving.
const EASE_IN = Easing.bezier(0.4, 0, 1, 1);

/**
 * Phase timings, in ms from the opening pose.
 *
 * The recorded design ran its three acts strictly in series — mark, then beam,
 * then wordmark — which cost 3.1s before anything overlapped. These are the
 * same three acts with the dead air taken out: the beam starts climbing while
 * the mark is still rising, and the wordmark fades in while the beam is still
 * collapsing. Nothing was removed from the choreography, only unstacked.
 */
const LOGO_IN_MS = 450;
const BEAM_AT = 100;
const BEAM_RISE_MS = 550;
const BEAM_FADE_MS = 180;
const GLOW_AT = 550;
const GLOW_MS = 300;
const BEAM_OUT_AT = 650;
const BEAM_OUT_MS = 350;
const WORD_AT = 800;
const WORD_MS = 500;

/** The floor: the splash never leaves before the choreography has landed. */
export const INTRO_MS = 1300;
/** Reduced-motion floor — nothing moves, so there is nothing to wait for. */
const INTRO_REDUCED_MS = 400;
export const EXIT_MS = 260;

/**
 * After the intro the halo keeps dimming very slowly, which is what makes an
 * elastic hold possible: the frame is never actually static, so waiting on a
 * slow sign-in doesn't read as a freeze.
 */
const GLOW_SETTLE_MS = 2500;
const GLOW_SETTLE_TO = 0.72;

/**
 * Hard cap on the hold. `app/index.js` gives up on the auth listener after 5s
 * and routes anyway, so this sits just past that: it exists only so the splash
 * can never be the thing that hangs, not as a timing anyone should hit.
 */
const MAX_HOLD_MS = 6000;

/** Gap between the bottom of the mark and the tip of the beam. */
const BEAM_GAP = 10;
const BEAM_W = 1.5;
const DIVIDER_W = 32;

/**
 * The Schedio splash: a light climbs from the bottom of the screen, gathers at
 * the mark, and flattens into the wordmark's rule.
 *
 * Three things about how this is driven matter more than the animation itself.
 *
 * The mark never fades in. It opens at the dead centre of the screen — which is
 * exactly where the native splash's icon sits — and rises from there into its
 * resting place above the wordmark. That makes the handover from the native
 * splash a continuation rather than a cut, which is why `onShown` waits for the
 * opening pose to be laid out before the native one is allowed to lift. The
 * rise is measured, not a constant: it is whatever distance the settled column
 * puts between the mark's centre and the centre of the screen.
 *
 * It runs *alongside* startup rather than after it. `app/index.js` resolves the
 * route while this plays and reports it through `ready`; the splash holds on
 * its settled frame until both are done. A warm launch therefore costs the
 * intro and nothing more, and a cold one hides the wait inside the hold instead
 * of adding to it.
 *
 * And it leaves the way it arrived: the whole group keeps travelling up by that
 * same rise, so the piece reads as one vector — something climbs from below,
 * gathers at the mark, and carries on past it into the app.
 */
export default function SchedioSplash({ ready, onShown, onFinish }) {
  const { width, height } = useWindowDimensions();

  const markH = Math.round((MARK_SIZE * MARK_H) / MARK_W);
  const glowSize = Math.round(width * 0.62);

  // Resolved before anything starts: `null` means we don't know yet, and a few
  // milliseconds of the native splash is cheaper than starting a motion the
  // student asked the OS not to show them.
  const [reduced, setReduced] = useState(null);
  /**
   * `rise` — how far the mark travels — and `beamH` — how far the light climbs.
   * Both are measured rather than derived, because they depend on the column's
   * height, which depends on how the wordmark's font actually lays out.
   */
  const [metrics, setMetrics] = useState(null);
  const [introDone, setIntroDone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const logoIn = useSharedValue(0);
  const beam = useSharedValue(0);
  const beamFade = useSharedValue(0);
  const glow = useSharedValue(0);
  const divider = useSharedValue(0);
  const word = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => !cancelled && setReduced(on))
      // An accessibility query has no business blocking startup; assume motion
      // is fine rather than sitting on a native splash that never lifts.
      .catch(() => !cancelled && setReduced(false));
    const fallback = setTimeout(() => !cancelled && setReduced(false), 150);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, []);

  const onMeasure = useCallback(
    (e) => {
      const { y } = e.nativeEvent.layout;
      setMetrics({
        rise: Math.max(0, Math.round(height / 2 - (y + markH / 2))),
        beamH: Math.max(0, Math.round(height - (y + markH) - BEAM_GAP)),
      });
    },
    [height, markH]
  );

  useEffect(() => {
    if (reduced === null || metrics === null) return;

    // Only now: the opening pose is laid out, so the native splash lifts onto a
    // frame that already matches it.
    if (onShown) onShown();

    if (reduced) {
      // Straight to the settled frame. The beam is skipped outright — it is a
      // full-screen travelling element, exactly what reduced motion is for.
      logoIn.value = 1;
      glow.value = GLOW_SETTLE_TO;
      divider.value = 1;
      word.value = 1;
    } else {
      logoIn.value = withTiming(1, { duration: LOGO_IN_MS, easing: EASE_OUT });

      // Rise then collapse, as one sequence. Two separate assignments to the
      // same shared value would not queue — the second would simply cancel the
      // first, and the beam would never climb.
      beam.value = withDelay(
        BEAM_AT,
        withSequence(
          withTiming(1, { duration: BEAM_RISE_MS, easing: EASE_OUT }),
          withTiming(0, { duration: BEAM_OUT_MS, easing: EASE })
        )
      );
      beamFade.value = withDelay(
        BEAM_AT,
        withSequence(
          withTiming(1, { duration: BEAM_FADE_MS, easing: EASE }),
          withDelay(
            BEAM_OUT_AT - BEAM_AT - BEAM_FADE_MS,
            withTiming(0, { duration: BEAM_OUT_MS - 60, easing: EASE })
          )
        )
      );

      // The halo blooms as the beam lands, not before — the arrival is the beat.
      glow.value = withDelay(
        GLOW_AT,
        withTiming(1, { duration: GLOW_MS, easing: EASE }, (finished) => {
          if (finished) {
            glow.value = withTiming(GLOW_SETTLE_TO, {
              duration: GLOW_SETTLE_MS,
              easing: Easing.linear,
            });
          }
        })
      );

      // The vertical light collapses as the horizontal rule opens, so the beam
      // reads as flattening into the divider rather than being swapped for it.
      divider.value = withDelay(
        BEAM_OUT_AT,
        withTiming(1, { duration: BEAM_OUT_MS, easing: EASE })
      );

      word.value = withDelay(WORD_AT, withTiming(1, { duration: WORD_MS, easing: EASE }));
    }

    const floor = setTimeout(() => setIntroDone(true), reduced ? INTRO_REDUCED_MS : INTRO_MS);
    return () => clearTimeout(floor);
    // `onShown` is deliberately not a dependency: it fires once, on the frame
    // the opening pose exists, and re-running this would restart the intro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, metrics, logoIn, beam, beamFade, glow, divider, word]);

  // The elastic half of the hold: leave as soon as the route is known, but
  // never before the choreography has landed.
  useEffect(() => {
    if (introDone && ready) setLeaving(true);
  }, [introDone, ready]);

  useEffect(() => {
    const cap = setTimeout(() => setLeaving(true), MAX_HOLD_MS);
    return () => clearTimeout(cap);
  }, []);

  const finish = useCallback(() => onFinish && onFinish(), [onFinish]);

  useEffect(() => {
    if (!leaving) return;
    exit.value = withTiming(1, { duration: EXIT_MS, easing: EASE_IN }, (finished) => {
      if (finished) runOnJS(finish)();
    });
  }, [leaving, exit, finish]);

  const rise = metrics ? metrics.rise : 0;

  const rootStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.value,
    // Under reduced motion the exit is a fade and nothing else.
    transform: [{ translateY: reduced ? 0 : -rise * exit.value }],
  }));

  // No opacity here on purpose: the mark is already on screen, handed over from
  // the native splash. Fading it in would read as a blink at launch.
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduced ? 0 : rise * (1 - logoIn.value) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, glow.value),
    transform: [{ scale: 0.62 + 0.38 * Math.min(1, glow.value) }],
  }));

  const beamStyle = useAnimatedStyle(() => ({
    opacity: beamFade.value,
    transform: [{ scaleY: beam.value }],
  }));

  const dividerStyle = useAnimatedStyle(() => ({
    opacity: divider.value,
    transform: [{ scaleX: divider.value }],
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: reduced ? 0 : 6 * (1 - word.value) }],
  }));

  return (
    <Animated.View style={[styles.root, rootStyle]}>
      {!reduced && metrics !== null && (
        <Animated.View
          pointerEvents="none"
          style={[styles.beam, { height: metrics.beamH, width: BEAM_W }, beamStyle]}
        >
          {/* Brightest at the head, so the light reads as climbing rather than
              as a line that simply got longer. */}
          <LinearGradient
            colors={['transparent', tokens.colors.accent]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      <View style={styles.column} onLayout={onMeasure}>
        <Animated.View style={[{ width: MARK_SIZE, height: markH }, logoStyle]}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glow,
              {
                width: glowSize,
                height: glowSize,
                left: (MARK_SIZE - glowSize) / 2,
                top: (markH - glowSize) / 2,
              },
              glowStyle,
            ]}
          >
            <Svg width={glowSize} height={glowSize}>
              <Defs>
                <RadialGradient id="schedio-splash-glow" cx="50%" cy="50%" r="50%">
                  {/* The accent at the alpha `accentSoftBg` already uses, so the
                      halo lands on the same blue as the rest of the app. */}
                  <Stop offset="0" stopColor={tokens.colors.accent} stopOpacity="0.16" />
                  <Stop offset="0.45" stopColor={tokens.colors.accent} stopOpacity="0.07" />
                  <Stop offset="1" stopColor={tokens.colors.accent} stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Rect
                x={0}
                y={0}
                width={glowSize}
                height={glowSize}
                fill="url(#schedio-splash-glow)"
              />
            </Svg>
          </Animated.View>

          <Image
            source={MARK_WHITE}
            style={{ width: MARK_SIZE, height: markH }}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Both of these hold their space from the first frame. They only fade
            in — if they mounted late the mark would shift as the column grew,
            and `rise` is measured off exactly this layout. */}
        <Animated.View style={[styles.divider, dividerStyle]} />
        <Animated.Text style={[styles.word, wordStyle]}>SCHEDIO</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    alignItems: 'center',
  },
  beam: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    // Grows out of the bottom edge rather than out of its own middle.
    transformOrigin: 'bottom',
  },
  glow: {
    position: 'absolute',
  },
  divider: {
    width: DIVIDER_W,
    height: 1,
    marginTop: tokens.spacing.s8,
    backgroundColor: tokens.colors.border,
  },
  word: {
    marginTop: tokens.spacing.lg,
    fontFamily: tokens.typography.families.inter.medium,
    fontSize: tokens.typography.meta.size,
    letterSpacing: 5,
    color: tokens.colors.textSecondary,
  },
});

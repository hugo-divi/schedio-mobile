import { useEffect, useMemo, useState } from 'react';
import { View, Text, Platform, AccessibilityInfo, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';

const font = tokens.typography.families.inter;

/**
 * The beat between "how do you handle your tasks?" and the estimated grade.
 *
 * The estimate itself (`estimatePotential`) is synchronous and lands in
 * milliseconds, so the wait is staged — which is fine, and is the point: seeing
 * the work happen is what makes the number feel earned rather than pulled out
 * of nowhere. What keeps it honest is the wording. Each line names a thing the
 * app is genuinely doing with an answer the student just gave; nothing here
 * claims to consult experts or compare thousands of cases, which on a product
 * aimed at teenagers would stop being flavour and start being a false claim.
 *
 * The lines accumulate rather than replace one another, each keeping a tick
 * once it is done. A single line that swaps every 1.2 s reads as one vague
 * thing changing its mind; a list that fills in reads as four things getting
 * done — which is what is actually happening, and what earns the number.
 *
 * Two of them name figures the student gave minutes ago. That is the whole
 * difference between this and a fake loading bar: if a line would read
 * identically for somebody else, it has no business being here.
 *
 * Deliberately not a step: no progress bar, no "Paso X de 8", no way back.
 * It is a transition between steps 4 and 5, and counting it would make the
 * flow read as nine steps instead of eight.
 */

const DURATION = 3500;

/**
 * One segment per line. The bar climbs while a sub-calculation "runs" and then
 * sits at its milestone until the next line starts, so the three stops mean
 * three real steps instead of one decorative slide.
 */
const SEGMENTS = [
  { at: 0, to: 26, lead: 'Leyendo tus ' },
  { at: 875, to: 52, lead: 'Ajustando el temario a ' },
  { at: 1750, to: 78, lead: 'Analizando tu ', strong: 'constancia al repasar' },
  { at: 2625, to: 100, lead: 'Midiendo ', strong: 'cuánto dejas para el final' },
];

/** Share of each segment spent moving; the remainder is the pause. */
const MOVE = 0.8;

/** Beat at 100% before handing over — the number landing and the estimate card
 * appearing in the same frame reads as a glitch rather than as a result. */
const SETTLE = 320;

const bezier = (x1, y1, x2, y2) => {
  const curve = (t, a, b) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
  return (x) => {
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const slope = 3 * x1 * (1 - t) * (1 - 3 * t) + 3 * x2 * t * (2 - 3 * t) + 3 * t * t;
      if (Math.abs(slope) < 1e-6) break;
      t -= (curve(t, x1, x2) - x) / slope;
    }
    return curve(Math.min(1, Math.max(0, t)), y1, y2);
  };
};

/**
 * The counter gets its own curve rather than the Schedio bezier. That one is
 * built for UI transitions — over a segment this long it dumps most of the rise
 * in the first fifth and then crawls, which reads as a stall, not as work.
 */
const count = bezier(0.36, 0.06, 0.28, 1);

const progressAt = (elapsed) => {
  let i = 0;
  while (i < SEGMENTS.length - 1 && elapsed >= SEGMENTS[i + 1].at) i += 1;

  const from = i === 0 ? 0 : SEGMENTS[i - 1].to;
  const start = SEGMENTS[i].at;
  const end = i === SEGMENTS.length - 1 ? DURATION : SEGMENTS[i + 1].at;
  const p = (elapsed - start) / (end - start);

  return from + (SEGMENTS[i].to - from) * count(Math.min(1, Math.max(0, p) / MOVE));
};

/** The dot on the line currently running. Breathing rather than spinning: a
 *  spinner would claim network work is happening, and none is. */
function ActiveDot() {
  const breath = useSharedValue(0.4);

  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: 620 }), -1, true);
  }, [breath]);

  const style = useAnimatedStyle(() => ({ opacity: breath.value }));

  return <Animated.View style={[styles.dot, style]} />;
}

export default function OnboardingCalc({ onDone, subjectCount, levelLabel }) {
  const [pct, setPct] = useState(0);
  const [line, setLine] = useState(0);

  /** The two personalised lines. Both fall back to wording that is still true
   *  when the figure is missing, rather than printing "undefined asignaturas"
   *  at the one moment the student is being asked to trust the number. */
  const lines = useMemo(
    () =>
      SEGMENTS.map((seg, i) => {
        if (i === 0) {
          return subjectCount
            ? { ...seg, strong: `${subjectCount} asignaturas` }
            : { at: seg.at, to: seg.to, lead: 'Leyendo ', strong: 'tus asignaturas' };
        }
        if (i === 1) {
          return levelLabel
            ? { ...seg, strong: levelLabel }
            : { at: seg.at, to: seg.to, lead: 'Ajustando ', strong: 'el temario a tu curso' };
        }
        return seg;
      }),
    [subjectCount, levelLabel]
  );

  useEffect(() => {
    let frame = null;
    let timer = null;
    let cancelled = false;

    const handOver = () => {
      if (cancelled) return;
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      // Ticks the last line too — otherwise the one that closes the run is
      // the only one that never gets its check.
      setLine(SEGMENTS.length);
      timer = setTimeout(() => {
        if (!cancelled) onDone();
      }, SETTLE);
    };

    const run = () => {
      let start = null;
      let shown = 0;

      const step = (now) => {
        if (cancelled) return;
        if (start === null) start = now;

        const elapsed = now - start;
        setPct(Math.round(progressAt(elapsed)));

        // No tick on the first line: `goNext` has just fired one for the tap
        // that got us here, and two in a row reads as a stutter.
        if (shown < SEGMENTS.length - 1 && elapsed >= SEGMENTS[shown + 1].at) {
          shown += 1;
          setLine(shown);
          if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        }

        if (elapsed < DURATION) {
          frame = requestAnimationFrame(step);
        } else {
          handOver();
        }
      };

      frame = requestAnimationFrame(step);
    };

    // Someone who has asked the OS to cut animations does not want a staged
    // wait either — they get the result and move on.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          setPct(100);
          handOver();
          return;
        }
        run();
      })
      .catch(() => {
        if (!cancelled) run();
      });

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [onDone]);

  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel={`Calculando tu estimación. ${pct} por ciento.`}
    >
      <View style={styles.numberRow}>
        <Text style={styles.pct}>{pct}</Text>
        <Text style={styles.sign}>%</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>

      <View style={styles.list}>
        {lines.map((item, i) =>
          i <= line ? (
            <Animated.View key={item.lead} entering={FadeInDown.duration(240)} style={styles.row}>
              <View style={[styles.mark, i < line && styles.markDone]}>
                {i < line ? (
                  <Check size={10} color={tokens.colors.accent} strokeWidth={3.4} />
                ) : (
                  <ActiveDot />
                )}
              </View>
              <Text style={[styles.rowText, i < line && styles.rowTextDone]}>
                {item.lead}
                <Text style={styles.rowStrong}>{item.strong}</Text>
              </Text>
            </Animated.View>
          ) : null
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  numberRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pct: {
    fontFamily: tokens.typography.families.display,
    fontSize: 92,
    lineHeight: 96,
    color: tokens.colors.textPrimary,
  },
  sign: {
    fontFamily: tokens.typography.families.display,
    fontSize: 40,
    lineHeight: 52,
    color: tokens.colors.textSecondary,
    marginLeft: 3,
  },
  track: {
    width: 168,
    height: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    marginTop: 26,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },
  // Fixed height for the four rows so the block above never shifts as they
  // fill in — the percentage sliding upwards mid-count reads as a glitch.
  list: { marginTop: 30, minHeight: 132, width: 260, gap: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mark: {
    width: 17,
    height: 17,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDone: {
    borderColor: tokens.colors.accent,
    backgroundColor: tokens.colors.accentSoftBg,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },
  rowText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
  },
  rowTextDone: { color: tokens.colors.textPrimary },
  rowStrong: { fontFamily: font.semibold, color: tokens.colors.textPrimary },
});

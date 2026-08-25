import { useEffect, useState } from 'react';
import { View, Text, Platform, AccessibilityInfo, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

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
 * Deliberately not a step: no progress bar, no "Paso X de 7", no way back.
 * It is a transition between steps 4 and 5, and counting it would make the
 * flow read as eight steps instead of seven.
 */

const DURATION = 3500;

/**
 * One segment per line. The bar climbs while a sub-calculation "runs" and then
 * sits at its milestone until the next line starts, so the three stops mean
 * three real steps instead of one decorative slide.
 */
const SEGMENTS = [
  { at: 0, to: 34, lead: 'Cruzando tu ', strong: 'nivel de organización' },
  { at: 1200, to: 71, lead: 'Calculando tu ', strong: 'frecuencia de repaso' },
  { at: 2400, to: 100, lead: 'Estimando tu ', strong: 'margen de mejora' },
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

export default function OnboardingCalc({ onDone }) {
  const [pct, setPct] = useState(0);
  const [line, setLine] = useState(0);

  useEffect(() => {
    let frame = null;
    let timer = null;
    let cancelled = false;

    const handOver = () => {
      if (cancelled) return;
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
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
          setLine(SEGMENTS.length - 1);
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

  const current = SEGMENTS[line];

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

      <Text style={styles.caption}>
        {current.lead}
        <Text style={styles.captionStrong}>{current.strong}</Text>…
      </Text>
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
  caption: {
    marginTop: 30,
    minHeight: 40,
    maxWidth: 240,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  captionStrong: { fontFamily: font.medium, color: tokens.colors.textPrimary },
});

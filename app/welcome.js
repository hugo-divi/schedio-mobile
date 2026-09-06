import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { tokens } from '../theme/tokens';
import useAuthStore from '../store/authStore';
import Button from '../components/ui/Button';

const font = tokens.typography.families.inter;
const TOTAL = 3;

// Subject tones come straight from the closed palette in tokens.js — these
// stand in for a real student's subjects, so they must read as the same
// vocabulary the app uses everywhere else.
const S = tokens.colors.subjects;

/**
 * Height of the art area. Fixed on purpose: the headline sits directly under
 * it, and a stage that resized per page would make the whole carousel jump
 * every time the student swiped.
 */
const STAGE_H = 220;

/** Horizontal inset of the stage from the screen edges. */
const STAGE_INSET = 18;

/** Where the plan rows land, measured from the stage's own top-left. */
const ROW_X = 32;
const ROW_Y = [44, 82, 120];

/**
 * The five subjects, and the two lives each one leads.
 *
 * `chaos` is where it floats before the student swipes — `fx` is a fraction of
 * the stage width rather than a pixel offset, so the scatter holds its shape
 * from a 320dp phone to a tablet. `row` is the plan row it becomes, or null
 * for the two that step aside.
 *
 * `drift` is its own oscillation period. They are deliberately all different
 * and none is a multiple of another: with a shared period the five would
 * breathe in unison and the whole thing would read as one animation instead
 * of as five things nobody has tidied up.
 */
const CHIPS = [
  {
    key: 'mates',
    name: 'Mates',
    color: S.mates,
    duration: '45 min',
    row: 0,
    drift: 6000,
    chaos: { fx: 0.01, y: 4, rot: -8 },
  },
  {
    key: 'historia',
    name: 'Historia',
    color: S.historia,
    duration: '30 min',
    tag: '3 días',
    row: null,
    drift: 7100,
    chaos: { fx: 0.34, y: 38, rot: 6 },
  },
  {
    key: 'ingles',
    name: 'Inglés',
    color: S.ingles,
    duration: '20 min',
    row: 2,
    drift: 5400,
    chaos: { fx: 0.08, y: 84, rot: 4 },
  },
  {
    key: 'quimica',
    name: 'Química',
    color: S.quimica,
    duration: '30 min',
    row: 1,
    drift: 6700,
    chaos: { fx: 0.44, y: 118, rot: -7 },
  },
  {
    key: 'lengua',
    name: 'Lengua',
    sub: 'apuntes sueltos',
    color: S.lengua,
    duration: '25 min',
    row: null,
    drift: 7600,
    chaos: { fx: 0.12, y: 144, rot: -10 },
  },
];

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One subject, from scattered chip to plan row and back.
 *
 * Driven by `progress` — the scroll offset in pages, not a timer — so the
 * transformation follows the finger and can be held half-done. That is the
 * whole argument for building this in Reanimated instead of shipping a video:
 * the student can watch chaos turn into a plan at their own speed, and undo it
 * by swiping back.
 */
function Chip({ item, progress, stageW, reduceMotion }) {
  const drift = useSharedValue(0);
  // Measured rather than assumed: the chip is auto-width in chaos (the tag on
  // Historia makes it wider than the rest) and full-width as a row, and there
  // is no animating to or from `auto`.
  const [naturalW, setNaturalW] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    drift.value = withRepeat(
      withTiming(1, { duration: item.drift, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [drift, item.drift, reduceMotion]);

  const rowW = Math.max(0, stageW - ROW_X * 2);
  const isRow = item.row !== null;

  const style = useAnimatedStyle(() => {
    // Only the first swipe transforms anything; pages 2→3 swap the whole
    // layer, so anything past 1 is clamped.
    const p = Math.min(1, Math.max(0, progress.value));

    const fromX = item.chaos.fx * stageW;
    const toX = isRow ? ROW_X : stageW * 0.26;
    const toY = isRow ? ROW_Y[item.row] : 100;

    // Fades out as it settles, so the drift cannot keep nudging a chip that is
    // supposed to have come to rest.
    const d = drift.value * (1 - p);

    return {
      opacity: isRow ? 1 : interpolate(p, [0, 0.55], [1, 0], Extrapolation.CLAMP),
      width: naturalW ? interpolate(p, [0, 1], [naturalW, isRow ? rowW : naturalW]) : undefined,
      transform: [
        { translateX: interpolate(p, [0, 1], [fromX, toX]) + d * 5 },
        { translateY: interpolate(p, [0, 1], [item.chaos.y, toY]) - d * 7 },
        { rotate: `${interpolate(p, [0, 1], [item.chaos.rot, 0]) + d * 1.6}deg` },
        { scale: isRow ? 1 : interpolate(p, [0, 1], [1, 0.86]) },
      ],
    };
  });

  // The shadow is the one concession to depth in this screen — see the note on
  // `chipShadow` in the stylesheet. It only makes sense while the chip floats.
  const shadowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(Math.min(1, progress.value), [0, 1], [0.34, 0], Extrapolation.CLAMP),
    elevation: interpolate(Math.min(1, progress.value), [0, 1], [7, 0], Extrapolation.CLAMP),
  }));

  const metaStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.min(1, progress.value), [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const tagStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.min(1, progress.value), [0, 0.4], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[styles.slot, style]}>
      <Animated.View
        style={[styles.chip, styles.chipShadow, shadowStyle]}
        onLayout={(e) => {
          if (!naturalW) setNaturalW(e.nativeEvent.layout.width);
        }}
      >
        <View style={[styles.chipDot, { backgroundColor: item.color }]} />
        <View style={{ minWidth: 0 }}>
          <Text style={styles.chipName}>{item.name}</Text>
          {item.sub ? <Text style={styles.chipSub}>{item.sub}</Text> : null}
        </View>
        {item.tag ? (
          <Animated.View style={[styles.chipTag, tagStyle]}>
            <Text style={styles.chipTagText}>{item.tag}</Text>
          </Animated.View>
        ) : null}
        {/* Absolutely placed so it contributes nothing to the natural width —
            otherwise every chip would be as wide as its hidden duration while
            it is still supposed to be a loose label. */}
        <Animated.Text style={[styles.chipDuration, metaStyle]}>{item.duration}</Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

/** One of the five days before the exam, filling as the plan comes together. */
function BurnSegment({ progress, order }) {
  const style = useAnimatedStyle(() => {
    // Staggered against the swipe itself, so the days fill as the plan lands
    // rather than all at once when it arrives.
    const at = 0.72 + order * 0.08;
    return {
      transform: [
        { scaleX: interpolate(progress.value, [at, at + 0.1], [0, 1], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <View style={styles.burnSeg}>
      <Animated.View style={[styles.burnFill, style]} />
    </View>
  );
}

/** A number that climbs when its page arrives. */
function CountUp({ to, active, style, reduceMotion }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!active) {
      setShown(0);
      return undefined;
    }
    if (reduceMotion) {
      setShown(to);
      return undefined;
    }

    let frame = null;
    let snap = null;
    let cancelled = false;
    let start = null;
    const DUR = 900;

    const land = () => {
      if (!cancelled) setShown(to);
    };
    const step = (now) => {
      if (cancelled) return;
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / DUR);
      setShown(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
      else land();
    };
    frame = requestAnimationFrame(step);
    // rAF stops being delivered in the background and resumes with a fresh
    // clock; without this the number could sit frozen part-way up.
    snap = setTimeout(land, DUR + 120);

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      if (snap) clearTimeout(snap);
    };
  }, [to, active, reduceMotion]);

  return <Text style={style}>{shown}</Text>;
}

/** A subject's progress bar on the closing page. */
function ResultBar({ name, value, active, delay }) {
  const grow = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      grow.value = 0;
      return;
    }
    // Staggered so the three bars read as a list filling in rather than as one
    // block appearing — same reason the calc screen ticks its lines in order.
    grow.value = withDelay(
      delay,
      withTiming(value, { duration: 720, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })
    );
  }, [active, value, grow, delay]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));

  return (
    <View style={styles.resBar}>
      <Text style={styles.resName} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.resTrack}>
        <Animated.View style={[styles.resFill, style]} />
      </View>
    </View>
  );
}

function Bullet({ children }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletIcon}>
        <Check size={11} color={tokens.colors.accent} strokeWidth={2.5} />
      </View>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

// ── Copy pages ──────────────────────────────────────────────────────────────

function ProblemCopy() {
  return (
    <>
      <Text style={styles.title}>Demasiadas asignaturas, ningún plan</Text>
      <Text style={styles.lead}>
        Exámenes que se acumulan y apuntes por todos lados. Lo difícil no es estudiar: es saber por
        dónde empezar.
      </Text>
      <View style={styles.tally}>
        <Text style={styles.tallyItem}>
          <Text style={styles.tallyNumber}>6 </Text>asignaturas
        </Text>
        <View style={styles.tallySep} />
        <Text style={styles.tallyItem}>
          <Text style={styles.tallyNumber}>2 </Text>exámenes esta semana
        </Text>
      </View>
    </>
  );
}

function MechanismCopy() {
  return (
    <>
      <Text style={styles.title}>Schedio te dice qué estudiar cada día</Text>
      <Text style={styles.lead}>
        A partir de tus asignaturas y tus exámenes reales, arma tu plan día a día. No una lista
        genérica: el tuyo.
      </Text>
    </>
  );
}

function OutcomeCopy() {
  return (
    <>
      <Text style={styles.title}>Todo tu curso, en una sola pantalla</Text>
      <Text style={styles.leadStrong}>Así de simple puede ser tu día a día.</Text>
      <View style={styles.bullets}>
        <Bullet>Plan de estudio automático, cada día</Bullet>
        <Bullet>Avisos antes de cada examen</Bullet>
        <Bullet>Tu racha, para no dejarlo a medias</Bullet>
      </View>
    </>
  );
}

const COPY = [ProblemCopy, MechanismCopy, OutcomeCopy];

// ── Screen ──────────────────────────────────────────────────────────────────

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroller = useRef(null);

  // `start=outcome` opens on the closing screen for a guest who has already
  // been through the pitch once (see services/welcome.js); `from=login` means
  // the student asked for it from the login screen rather than being routed
  // here, which changes how they get back out.
  const { start, from } = useLocalSearchParams();
  const startAtOutcome = start === 'outcome';
  const fromLogin = from === 'login';

  const initialIndex = startAtOutcome ? TOTAL - 1 : 0;
  const [index, setIndex] = useState(initialIndex);
  const [reduceMotion, setReduceMotion] = useState(false);

  const user = useAuthStore((state) => state.user);

  const stageW = Math.max(0, width - STAGE_INSET * 2);

  /**
   * Scroll offset in pages: 0 on the problem, 1 on the plan, 2 on the result.
   * Everything in the stage reads from this rather than from `index`, which is
   * why the transformation follows the finger instead of firing after the fact.
   */
  const progress = useSharedValue(initialIndex);
  const onScroll = useAnimatedScrollHandler((event) => {
    if (width > 0) progress.value = event.contentOffset.x / width;
  });

  // Drives `index` off the same continuous value the stage animation already
  // reads, instead of `onMomentumScrollEnd` — react-native-web approximates
  // momentum-end with a debounce on the browser's own `scroll` event, and it
  // doesn't reliably fire for a `scrollTo()` triggered by the "Siguiente"
  // button (only for an actual swipe/trackpad gesture). Left to that alone,
  // `index` stayed at 0 on web forever: the footer segments never filled in,
  // and `goNext` kept thinking page 1 was still current, scrolling sideways
  // instead of ever reaching the register/login step.
  useAnimatedReaction(
    () => Math.round(progress.value),
    (current, previous) => {
      if (current !== previous && current >= 0 && current < TOTAL) {
        runOnJS(setIndex)(current);
      }
    }
  );

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduceMotion(!!value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Defensive: app/index.js only routes here once it knows there is no
  // session, but if one ever materialises while the carousel is open, an
  // account holder must not be left sitting in a pre-account intro.
  // store/authStore.js records the device as having had an account on that
  // same event, so nothing needs recording here.
  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  /**
   * Leaving without registering. Nothing is recorded: "Saltar" means "not
   * now", not "never again" — the launch counter in services/welcome.js is
   * what decides whether the pitch comes back, and it was already spent by
   * the launch that opened this screen.
   */
  const exitToLogin = useCallback(() => {
    // Opened from login with a push, so there is a login screen underneath to
    // return to. Replacing instead would stack a second copy of it.
    if (fromLogin) router.back();
    else router.replace('/login');
  }, [fromLogin, router]);

  // Always a replace, both entry paths included: from login the stack becomes
  // [login, register], so the back gesture still lands somewhere sensible.
  const goRegister = useCallback(() => router.replace('/register'), [router]);

  const goNext = () => {
    if (index >= TOTAL - 1) {
      goRegister();
      return;
    }
    scroller.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  const isLast = index === TOTAL - 1;

  // The skip control normally retires on the last page, where "Crear cuenta"
  // takes over. When the carousel *opens* on that page there is no earlier
  // page to have used it, so it has to stay: otherwise the only ways out are
  // registering or a link addressed to people who already have an account.
  const showSkip = !isLast || startAtOutcome;

  // Android ignores `contentOffset` on a paging ScrollView often enough that
  // it cannot be the only mechanism — landing on page 1 when we asked for
  // page 3 would silently undo the whole decay. The ref keeps the correction
  // to the first layout, so it can never fight a swipe in progress.
  const didInitScroll = useRef(false);
  const initScroll = () => {
    if (didInitScroll.current || !initialIndex || !width) return;
    didInitScroll.current = true;
    scroller.current?.scrollTo({ x: initialIndex * width, animated: false });
    progress.value = initialIndex;
  };

  // ── Stage layers ──
  const planFrameStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 0.9], [0, 1], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(progress.value, [0.35, 0.9], [0.97, 1], Extrapolation.CLAMP) },
    ],
  }));

  const layerAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [1, 1.55], [1, 0], Extrapolation.CLAMP),
  }));

  const layerBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [1.2, 1.9], [0, 1], Extrapolation.CLAMP),
  }));

  // The streak is the only figure with a pulse of its own: it is the one that
  // measures constancy, so a heartbeat means something on it and nowhere else.
  const beat = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion || !isLast) {
      beat.value = 1;
      return;
    }
    beat.value = withRepeat(
      withTiming(1.07, { duration: 950, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [beat, isLast, reduceMotion]);
  const beatStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {/* Kept mounted rather than conditionally rendered: the header has to
            hold its height, or the paged area below it would resize mid-swipe. */}
        <TouchableOpacity
          onPress={exitToLogin}
          disabled={!showSkip}
          style={{ opacity: showSkip ? 1 : 0 }}
          accessibilityRole="button"
          accessibilityLabel={fromLogin ? 'Cerrar la presentación' : 'Saltar la presentación'}
          accessibilityElementsHidden={!showSkip}
          importantForAccessibility={showSkip ? 'auto' : 'no-hide-descendants'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.skip}>{fromLogin ? 'Cerrar' : 'Saltar'}</Text>
        </TouchableOpacity>
      </View>

      {/* The art sits outside the pager and reads the scroll offset directly.
          Paging it alongside the copy would mean three separate illustrations
          again — the point is that it is one thing being rearranged. */}
      <View style={[styles.stage, { height: STAGE_H, marginHorizontal: STAGE_INSET }]}>
        <Animated.View style={[StyleSheet.absoluteFill, layerAStyle]} pointerEvents="none">
          <Animated.View style={[styles.planFrame, planFrameStyle]}>
            <View style={styles.planHead}>
              <Text style={styles.overline}>HOY</Text>
              <Text style={styles.planCount}>3 sesiones</Text>
            </View>
            <View style={styles.burn}>
              <View style={styles.burnRow}>
                <Text style={styles.burnLabel}>Examen de Química</Text>
                <Text style={styles.burnDays}>en 5 días</Text>
              </View>
              <View style={styles.burnTrack}>
                <BurnSegment progress={progress} order={0} />
                <BurnSegment progress={progress} order={1} />
                <BurnSegment progress={progress} order={2} />
                <View style={styles.burnSeg} />
                <View style={styles.burnSeg} />
              </View>
            </View>
          </Animated.View>

          {CHIPS.map((item) => (
            <Chip
              key={item.key}
              item={item}
              progress={progress}
              stageW={stageW}
              reduceMotion={reduceMotion}
            />
          ))}
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, layerBStyle]} pointerEvents="none">
          <View style={styles.resCard}>
            <View style={styles.resStats}>
              <View style={styles.resStat}>
                <CountUp
                  to={6}
                  active={isLast}
                  reduceMotion={reduceMotion}
                  style={styles.resValue}
                />
                <Text style={styles.resLabel}>Asignaturas</Text>
              </View>
              <View style={styles.resStat}>
                <CountUp
                  to={4}
                  active={isLast}
                  reduceMotion={reduceMotion}
                  style={[styles.resValue, { color: tokens.colors.accent }]}
                />
                <Text style={styles.resLabel}>Días al examen</Text>
              </View>
              <View style={styles.resStat}>
                <Animated.View style={beatStyle}>
                  <CountUp
                    to={7}
                    active={isLast}
                    reduceMotion={reduceMotion}
                    style={[styles.resValue, { color: tokens.colors.premiumText }]}
                  />
                </Animated.View>
                <Text style={styles.resLabel}>Racha</Text>
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <ResultBar name="Matemáticas" value={0.7} active={isLast} delay={0} />
              <ResultBar name="Tecnología" value={0.45} active={isLast} delay={120} />
              <ResultBar name="Filosofía" value={0.85} active={isLast} delay={240} />
            </View>
          </View>
        </Animated.View>
      </View>

      <Animated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: initialIndex * width, y: 0 }}
        onLayout={initScroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.flex}
      >
        {COPY.map((Page, i) => (
          <ScrollView
            key={i}
            style={{ width }}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
          >
            <Page />
          </ScrollView>
        ))}
      </Animated.ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        {/* Segments rather than dots: they say how much is left, which dots
            never do, and they read as chapters. */}
        <View style={styles.segs}>
          {COPY.map((_, i) => (
            <View key={i} style={[styles.seg, i <= index && styles.segOn]} />
          ))}
        </View>

        {/* No trailing arrow: the shared Button renders its `icon` before the
            label, and a leading arrow on "Siguiente" reads backwards. The rest
            of the app's primary actions are label-only anyway. */}
        <Button title={isLast ? 'Crear cuenta' : 'Siguiente'} fullWidth onPress={goNext} />

        {/* Held in the layout on every page so the button above never shifts
            when the last one adds its two lines. */}
        <View
          style={[styles.tail, !isLast && styles.tailHidden]}
          pointerEvents={isLast ? 'auto' : 'none'}
        >
          <Text style={styles.reassure}>Gratis, sin tarjeta.</Text>
          <View style={styles.secondary}>
            <Text style={styles.secondaryText}>¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={exitToLogin} disabled={!isLast}>
              <Text style={styles.secondaryLink}>Inicia sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  skip: { fontFamily: font.medium, fontSize: 14, color: tokens.colors.textSecondary },

  stage: { position: 'relative' },
  page: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20, flexGrow: 1 },

  // ── Chips ──
  slot: { position: 'absolute', top: 0, left: 0 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  /**
   * The one place the flat language gives ground, and only here: this screen
   * is pre-account marketing and the chips have to read as loose objects
   * rather than as rows already in a list. Low, wide and nearly black — no
   * gradient, no glass, and it fades to nothing the moment they settle into
   * the plan, where the app's own flat vocabulary takes over again.
   */
  chipShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
  },
  chipDot: { width: 8, height: 8, borderRadius: tokens.radius.pill },
  chipName: { fontFamily: font.medium, fontSize: 13, color: tokens.colors.textPrimary },
  chipSub: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: tokens.colors.textSecondary,
    marginTop: 1,
  },
  // No soft-danger fill exists in the design system, so this is a bordered
  // pill with danger-coloured text rather than an invented tint.
  chipTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  chipTagText: { fontFamily: font.semibold, fontSize: 10, color: tokens.colors.danger },
  chipDuration: {
    position: 'absolute',
    right: 13,
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },

  // ── Plan frame ──
  planFrame: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 16,
    bottom: 12,
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderTopWidth: 2,
    borderTopColor: tokens.colors.accent,
    borderRadius: tokens.radius.card,
  },
  planHead: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  overline: {
    fontFamily: font.semibold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: tokens.colors.textSecondary,
  },
  planCount: { fontFamily: font.medium, fontSize: 11, color: tokens.colors.textSecondary },

  burn: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  burnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 7,
  },
  burnLabel: { fontFamily: font.regular, fontSize: 10.5, color: tokens.colors.textSecondary },
  burnDays: { fontFamily: font.semibold, fontSize: 10.5, color: tokens.colors.textPrimary },
  burnTrack: { flexDirection: 'row', gap: 4 },
  burnSeg: {
    flex: 1,
    height: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  // Accent, not a subject tone: these are plan days, and Química is a row
  // right above — reusing its green would collide two different meanings.
  burnFill: {
    flex: 1,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    transform: [{ scaleX: 0 }],
    // Grows from the left rather than from the middle.
    transformOrigin: 'left',
  },

  // ── Result card ──
  resCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 14,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderTopWidth: 2,
    borderTopColor: tokens.colors.accent,
    borderRadius: tokens.radius.card,
    padding: 18,
  },
  // Even columns rather than flex-with-dividers: the dividers cost enough of
  // the inner width that "Días al examen" clipped.
  resStats: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  resStat: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  resValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 27,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
  },
  resLabel: {
    fontFamily: font.medium,
    fontSize: 10,
    color: tokens.colors.textSecondary,
    marginTop: 5,
  },
  resBar: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  resName: {
    width: 82,
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textPrimary,
  },
  resTrack: {
    flex: 1,
    height: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  resFill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    transformOrigin: 'left',
  },

  // ── Copy ──
  title: {
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 29,
    color: tokens.colors.textPrimary,
    marginBottom: 8,
  },
  lead: {
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
  },
  leadStrong: {
    fontFamily: font.medium,
    fontSize: 15.5,
    lineHeight: 22,
    color: tokens.colors.textPrimary,
  },

  tally: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  tallyItem: { fontFamily: font.regular, fontSize: 12, color: tokens.colors.textSecondary },
  tallyNumber: {
    fontFamily: tokens.typography.families.display,
    fontSize: 18,
    color: tokens.colors.textPrimary,
  },
  tallySep: { width: 1, height: 20, backgroundColor: tokens.colors.borderDefault },

  bullets: { gap: 10, marginTop: 18 },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletIcon: {
    width: 20,
    height: 20,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  segs: { flexDirection: 'row', gap: 5, alignSelf: 'stretch' },
  seg: {
    flex: 1,
    height: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
  },
  segOn: { backgroundColor: tokens.colors.accent },

  tail: { alignItems: 'center', gap: 10 },
  tailHidden: { opacity: 0 },
  reassure: { fontFamily: font.regular, fontSize: 12, color: tokens.colors.textSecondary },
  secondary: { flexDirection: 'row', alignItems: 'center' },
  secondaryText: { fontFamily: font.regular, fontSize: 13, color: tokens.colors.textSecondary },
  secondaryLink: { fontFamily: font.semibold, fontSize: 13, color: tokens.colors.accent },
});

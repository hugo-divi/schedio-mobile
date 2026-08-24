import { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  Mask,
  Path,
  Rect,
  Circle,
  RadialGradient,
  Stop,
  Image as SvgImage,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { tokens } from '../theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const MARK_WHITE = require('../assets/images/schedio-mark-white.png');
const MARK = require('../assets/images/schedio-mark.png');

/**
 * Centreline of the mark, traced in the PNG's own 511x488 space — lifted from
 * the `SLogo` component in the design system's Study.html so the geometry
 * matches the mock. The order is the stroke order of the logo: top-left tip,
 * down the zigzag to the foot, back up, ending at the base of the arrowhead.
 */
const LOGO_W = 511;
const LOGO_H = 488;
const LOGO_PATH = [
  [262, 82],
  [131, 210],
  [238, 300],
  [134, 393],
  [240, 412],
  [352, 297],
  [263, 212],
  [308, 167],
];
const LOGO_BRUSH = 76;
const ARROW_ORIGIN = [308, 167];
const ARROW_R = 150;
// Last slice of the timeline, spent shooting the arrowhead out of the corner.
const ARROW_SHARE = 0.18;
const DRAW_SHARE = 1 - ARROW_SHARE;

const SEGMENTS = LOGO_PATH.slice(1).map(([x, y], i) =>
  Math.hypot(x - LOGO_PATH[i][0], y - LOGO_PATH[i][1])
);
const PATH_LENGTH = SEGMENTS.reduce((a, b) => a + b, 0);
const PATH_D = LOGO_PATH.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('');

/**
 * Phase timings, in ms from mount. Exported so the screen can match them.
 *
 * The draw used to run 2100 ms, which with the settle put roughly 3.2 seconds
 * between finishing a session and seeing what you earned. Wonderful once,
 * furniture by the twentieth time — and this plays after *every* session. The
 * stroke reads the same at 1500 with the pacing below; what it loses is the
 * stretch in the middle where nothing was happening except waiting.
 */
export const DRAW_MS = 1500;
export const BURST_MS = 700;
const SETTLE_DELAY = 420;
const SETTLE_MS = 680;

// Past this point in the burst the flash is bright enough to hide the swap from
// the animated stroke to the flat mark underneath.
const SWAP_AT = 0.35;

const SPARKS = Array.from({ length: 12 }, (_, i) => ({
  key: i,
  angle: i * 30 - 20,
  distance: 72 + (i % 4) * 26,
  duration: 520 + (i % 5) * 90,
  white: i % 3 === 0,
}));

/**
 * Where the corners fall, **on the timeline** rather than along the path.
 *
 * Those are two different scales: the stroke occupies only the first
 * DRAW_SHARE of the timeline, the arrowhead the rest, so a vertex at 93% of
 * the path arrives at 93% × DRAW_SHARE of the animation. Scaling here means
 * the worklets below can compare against `ease`'s output directly, without
 * walking the segment list on every frame.
 */
const CORNERS = SEGMENTS.reduce((acc, len) => {
  acc.push((acc[acc.length - 1] ?? 0) + len / PATH_LENGTH);
  return acc;
}, [])
  .slice(0, -1)
  .map((fraction) => fraction * DRAW_SHARE);

/**
 * Pace along the stroke.
 *
 * The old curve was linear for the first 82% and then eased the tail. Constant
 * speed through seven corners is what made it read as a progress bar being
 * filled rather than a mark being drawn: a pen accelerates down a straight and
 * slows as it turns. This keeps the same total duration but redistributes it —
 * a gentle brake at each vertex, paid back on the runs between them.
 *
 * The dash offset and the comet head both read this same function, so they
 * stay welded together however the pacing changes.
 */
const CORNER_REACH = 0.055;
const CORNER_BRAKE = 0.42;

function ease(raw) {
  'worklet';
  // The tail used to be `pow(x, 0.7)`, whose slope at x=0 is infinite: right
  // where the stroke hands over to the arrowhead the pace jumped, then dragged.
  // `x + x² - x³` reaches the same place and still eases to a stop, but leaves
  // the previous section at exactly the speed it arrived — no lurch at the seam.
  let eased = raw;
  if (raw >= DRAW_SHARE) {
    const x = (raw - DRAW_SHARE) / ARROW_SHARE;
    eased = DRAW_SHARE + (x + x * x - x * x * x) * ARROW_SHARE;
  }

  // Slow down near each corner by pulling progress back towards it, then
  // let go once past it.
  let adjusted = eased;
  for (let i = 0; i < CORNERS.length; i++) {
    const d = eased - CORNERS[i];
    if (d > -CORNER_REACH && d < CORNER_REACH) {
      const near = 1 - Math.abs(d) / CORNER_REACH;
      adjusted -= d * near * near * CORNER_BRAKE;
    }
  }
  return Math.min(1, Math.max(0, adjusted));
}

/** How fast the tip is moving at `p`, 0-1ish. Drives the comet's brightness. */
function speedAt(p) {
  'worklet';
  let nearest = 1;
  for (let i = 0; i < CORNERS.length; i++) {
    const d = Math.abs(p - CORNERS[i]);
    if (d < nearest) nearest = d;
  }
  return Math.min(1, nearest / CORNER_REACH);
}

/** Where the brush tip is at `p`, in the logo's own coordinate space. */
function tipAt(p, path, segments, total) {
  'worklet';
  if (p <= DRAW_SHARE) {
    const target = (p / DRAW_SHARE) * total;
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      if (acc + segments[i] < target) {
        acc += segments[i];
        continue;
      }
      const f = segments[i] === 0 ? 0 : (target - acc) / segments[i];
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * f,
        path[i][1] + (path[i + 1][1] - path[i][1]) * f,
      ];
    }
  }
  // Along the arrowhead, which leaves the corner at 45°.
  const ap = Math.min(1, Math.max(0, (p - DRAW_SHARE) / ARROW_SHARE));
  const d = ap * ARROW_R * 0.707;
  return [ARROW_ORIGIN[0] + d, ARROW_ORIGIN[1] - d];
}

/** One expanding ring of the burst. `burst` runs 0 → 1 over BURST_MS. */
function BurstRing({ burst, from, delay, duration, style }) {
  const animated = useAnimatedStyle(() => {
    const raw = (burst.value * BURST_MS - delay) / duration;
    const b = Math.min(1, Math.max(0, raw));
    return {
      opacity: raw <= 0 || b >= 1 ? 0 : interpolate(b, [0, 1], [from, 0]),
      transform: [{ scale: interpolate(b, [0, 1], [0.12, 1]) }],
    };
  });

  return <Animated.View style={[styles.ring, style, animated]} />;
}

/** One particle thrown out of the arrowhead. */
function Spark({ burst, spark }) {
  const animated = useAnimatedStyle(() => {
    const b = Math.min(1, Math.max(0, (burst.value * BURST_MS) / spark.duration));
    return {
      opacity: burst.value <= 0 || b >= 1 ? 0 : 1 - b,
      transform: [
        { rotate: `${spark.angle}deg` },
        { translateX: interpolate(b, [0, 1], [4, spark.distance]) },
        { scale: interpolate(b, [0, 1], [1, 0.2]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.spark,
        { backgroundColor: spark.white ? '#FFFFFF' : tokens.colors.accent },
        animated,
      ]}
    />
  );
}

/**
 * Draws the Schedio mark on, bursts, and settles into place.
 *
 * The reveal is the design's canvas trick rebuilt in SVG: a thick brush stroke
 * grows along the mark's centreline and masks the logo itself, so what appears
 * is always the real silhouette rather than a fat polyline. Once the stroke is
 * done it hands over to a plain tinted image — the SVG only exists to animate.
 *
 * `onBurst` is the cue for the screen-wide flash; `onSettled` the cue to bring
 * in the rest of the summary.
 */
export default function SchedioLogoReveal({ size = 140, drop = 290, onBurst, onSettled }) {
  // 0 → 1 across the draw. Linear here; the design's ease is applied inside the
  // worklets so the brush and the comet stay in step.
  const t = useSharedValue(0);
  const burst = useSharedValue(0);
  const scale = useSharedValue(1.35);
  const shift = useSharedValue(drop);

  const height = (size * LOGO_H) / LOGO_W;

  useEffect(() => {
    t.value = withTiming(1, { duration: DRAW_MS, easing: Easing.linear });

    // Pop on the last frame of the draw, then fall back into place.
    // 1.9 was close to doubling the mark and then shrinking it by more than
    // half to settle, which read as the logo falling away rather than landing.
    scale.value = withDelay(
      DRAW_MS,
      withTiming(1.62, { duration: 180, easing: Easing.out(Easing.cubic) })
    );
    burst.value = withDelay(DRAW_MS, withTiming(1, { duration: BURST_MS, easing: Easing.linear }));

    const flash = setTimeout(() => onBurst && onBurst(), DRAW_MS);
    const settle = setTimeout(() => {
      scale.value = withSpring(0.82, { damping: 16, stiffness: 130 });
      shift.value = withTiming(
        0,
        { duration: SETTLE_MS, easing: Easing.bezier(0.22, 0.61, 0.36, 1) },
        (finished) => {
          if (finished && onSettled) runOnJS(onSettled)();
        }
      );
    }, DRAW_MS + SETTLE_DELAY);

    return () => {
      clearTimeout(flash);
      clearTimeout(settle);
    };
  }, [t, scale, shift, burst, onBurst, onSettled]);

  const brushProps = useAnimatedProps(() => {
    const drawn = Math.min(ease(t.value) / DRAW_SHARE, 1);
    return { strokeDashoffset: PATH_LENGTH * (1 - drawn) };
  });

  const arrowProps = useAnimatedProps(() => {
    const ap = Math.min(1, Math.max(0, (ease(t.value) - DRAW_SHARE) / ARROW_SHARE));
    return { width: ap <= 0 ? 0 : 70 + ap * ARROW_R };
  });

  // Comet head: unclipped light at the leading edge, so the stroke reads as
  // being drawn rather than uncovered.
  const cometProps = useAnimatedProps(() => {
    const p = ease(t.value);
    const [x, y] = tipAt(p, LOGO_PATH, SEGMENTS, PATH_LENGTH);
    // Brighter and larger on the runs, dimmer into the corners — light behaves
    // that way, and it's what sells the pacing above as deliberate rather than
    // as the animation stuttering. Fades out over the last stretch instead of
    // being cut on the final frame, which was a visible pop.
    const speed = speedAt(p);
    const tail = p > 0.94 ? 1 - (p - 0.94) / 0.06 : 1;
    return {
      cx: x,
      cy: y,
      r: 34 + speed * 16,
      opacity: Math.max(0, tail) * (0.55 + speed * 0.45),
    };
  });

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: shift.value }, { scale: scale.value }],
  }));

  const tracedStyle = useAnimatedStyle(() => ({ opacity: burst.value < SWAP_AT ? 1 : 0 }));
  const settledStyle = useAnimatedStyle(() => ({ opacity: burst.value < SWAP_AT ? 0 : 1 }));

  return (
    <Animated.View style={[{ width: size, height }, styles.wrap, markStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, tracedStyle]}>
        <Svg width={size} height={height} viewBox={`0 0 ${LOGO_W} ${LOGO_H}`}>
          <Defs>
            <Mask id="schedio-trace">
              <AnimatedPath
                d={PATH_D}
                stroke="#FFFFFF"
                strokeWidth={LOGO_BRUSH}
                strokeLinejoin="round"
                strokeLinecap="butt"
                fill="none"
                strokeDasharray={PATH_LENGTH}
                animatedProps={brushProps}
              />
              <AnimatedRect
                x={-70}
                y={-260}
                height={520}
                fill="#FFFFFF"
                transform={`translate(${ARROW_ORIGIN[0]}, ${ARROW_ORIGIN[1]}) rotate(-45)`}
                animatedProps={arrowProps}
              />
            </Mask>
            <RadialGradient id="schedio-comet" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
              <Stop offset="0.28" stopColor="#FFFFFF" stopOpacity="0.42" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          <SvgImage
            href={MARK_WHITE}
            x={0}
            y={0}
            width={LOGO_W}
            height={LOGO_H}
            mask="url(#schedio-trace)"
          />
          <AnimatedCircle fill="url(#schedio-comet)" animatedProps={cometProps} />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, settledStyle]}>
        {/* The mark ships black-on-transparent, so it gets tinted rather than
            shipped a second time in the accent colour. */}
        <Image
          source={MARK}
          style={{ width: size, height, tintColor: tokens.colors.accent }}
          resizeMode="contain"
        />
      </Animated.View>

      {/* The burst is centred on the arrowhead, not on the box. */}
      <View
        pointerEvents="none"
        style={[styles.burstAnchor, { left: (110 / 140) * size, top: (23 / 140) * size }]}
      >
        <BurstRing burst={burst} from={0.85} delay={0} duration={700} style={styles.ringOuter} />
        <BurstRing burst={burst} from={0.9} delay={90} duration={560} style={styles.ringInner} />
        {SPARKS.map((spark) => (
          <Spark key={spark.key} burst={burst} spark={spark} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstAnchor: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
  },
  ringOuter: {
    width: 300,
    height: 300,
    marginLeft: -150,
    marginTop: -150,
    borderWidth: 2,
    borderColor: tokens.colors.accent,
  },
  ringInner: {
    width: 220,
    height: 220,
    marginLeft: -110,
    marginTop: -110,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  spark: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

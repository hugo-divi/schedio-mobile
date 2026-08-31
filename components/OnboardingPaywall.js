import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

import { tokens } from '../theme/tokens';
import { getOfferings, purchasePackage } from '../services/revenuecat';
import useAuthStore from '../store/authStore';
import { PremiumBadge } from './ui/Chip';

const font = tokens.typography.families.inter;

/**
 * Prime, offered once between steps 5 and 6 of the onboarding.
 *
 * It sits right after the estimated grade because that is the moment the
 * student most wants what the app is selling, and *before* the last two steps
 * rather than after them on purpose: notifications and the first exam are what
 * actually decide whether anyone comes back tomorrow, so declining must never
 * cost them that. Whoever says no here still finishes the flow intact.
 *
 * The screen is built to be refusable. "Continuar con la versión gratuita" is
 * a real button at the same height as the gold one rather than a grey link
 * hiding at the bottom; the copy says outright that the free tier is enough;
 * there is no countdown, no expiring discount and no step counter, since
 * anything that reads as "Paso 6 de 8" reads as compulsory.
 *
 * ─── On the motion ───
 *
 * The screen opens by carrying the student's own result across: the estimate
 * they were just reading collapses into the strip at the top, and the offer
 * assembles underneath it. That makes Prime read as the continuation of what
 * they earned rather than as an interruption of it.
 *
 * What deliberately does NOT move: the price, the gold badge and the buy
 * button. And there is no haptic anywhere on this screen. Motion here is only
 * allowed to carry information forward or to reduce uncertainty — on the one
 * screen that asks for money, anything that merely sparkles reads as pressure,
 * and a buzz as the offer lands is the phone elbowing you.
 */

/** The system bezier, as a Reanimated easing. */
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** The strip's start and end heights — it arrives as a card and settles. */
const STRIP_FROM = 148;
const STRIP_TO = 58;

const BULLETS = [
  'Materias y Mochila ampliadas',
  'Vista de Plan completa, hasta un mes por delante',
  'Exporta tus notas y exámenes en PDF',
];

/** Last-resort label, matching app/plus.js. Only ever shown if RevenueCat is
 * unreachable — and the CTA refuses the sale in that case rather than
 * charging against a price we could not confirm. */
const FALLBACK_PRICE = '4,99 €';

/**
 * One piece of the offer, arriving in turn. Staggered rather than all at once
 * so the order can mean something: what it is, what it does, what it costs.
 * The price is last on purpose — it lands after they have read what it buys.
 */
function Reveal({ delay, still, style, children }) {
  const shown = useSharedValue(still ? 1 : 0);

  useEffect(() => {
    if (still) {
      shown.value = 1;
      return;
    }
    shown.value = withDelay(delay, withTiming(1, { duration: 340, easing: EASE }));
  }, [delay, shown, still]);

  const animated = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 10 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

export default function OnboardingPaywall({ target, current, range, onContinueFree, onPurchased }) {
  const insets = useSafeAreaInsets();
  const setIsPrime = useAuthStore((state) => state.setIsPrime);

  const [offerings, setOfferings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!cancelled && reduce) setStill(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The estimate card, collapsing into the strip. Not a measured hand-off from
   * step 5 — the paywall is a full-screen overlay and the card it continues is
   * already unmounted — but it starts at a card's height and settles to a
   * strip's, which is the part the eye actually reads as "the same thing".
   */
  const stripH = useSharedValue(STRIP_FROM);
  const stripRow = useSharedValue(0);

  useEffect(() => {
    if (still) {
      stripH.value = STRIP_TO;
      stripRow.value = 1;
      return;
    }
    stripH.value = withTiming(STRIP_TO, { duration: 460, easing: EASE });
    stripRow.value = withDelay(180, withTiming(1, { duration: 300, easing: EASE }));
  }, [still, stripH, stripRow]);

  const stripStyle = useAnimatedStyle(() => ({ height: stripH.value }));
  const stripRowStyle = useAnimatedStyle(() => ({ opacity: stripRow.value }));

  const hasRange = Array.isArray(range) && range.length === 2 && current != null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let data = null;
      try {
        data = await getOfferings();
      } catch {
        // Falls through: the screen still renders and still lets them leave.
      }
      if (!cancelled) {
        setOfferings(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pack = offerings?.monthly || offerings?.current?.monthly || null;
  const price = pack?.product?.priceString || FALLBACK_PRICE;

  const buy = async () => {
    if (!pack) {
      Alert.alert(
        'No disponible',
        'No se ha podido cargar el plan. Puedes seguir gratis y activar Prime más tarde desde tu perfil.'
      );
      return;
    }

    setPurchasing(true);
    const result = await purchasePackage(pack);
    setPurchasing(false);

    if (result) {
      // Optimistic only. The entitlement lives in RevenueCat and is re-read on
      // every auth change — never mirrored into Firestore, where a
      // client-writable flag would let anyone grant themselves Prime.
      setIsPrime(true);
      onPurchased();
    } else if (result === false) {
      // `null` means they closed the native sheet themselves, which needs no
      // comment. `false` is a real failure and silence there looks like a bug.
      Alert.alert(
        'No se pudo completar la compra',
        'Ha habido un problema procesando el pago. Comprueba tu método de pago en Google Play e inténtalo de nuevo.'
      );
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Their own number, carried over from step 5. Rendered only when we
            actually have it — a strip that said "— → —" would be worse than
            no strip at all. */}
        {hasRange ? (
          <Animated.View style={[styles.strip, stripStyle]}>
            <Animated.View style={[styles.stripRow, stripRowStyle]}>
              <Text style={styles.stripNow}>{current}</Text>
              <Text style={styles.stripArrow}>→</Text>
              <Text style={styles.stripTo}>
                {range[0]} – {range[1]}
              </Text>
              <Text style={styles.stripCap}>Tu margen</Text>
            </Animated.View>
          </Animated.View>
        ) : null}

        <Reveal delay={380} still={still}>
          <PremiumBadge>Schedio Prime</PremiumBadge>
        </Reveal>

        <Reveal delay={450} still={still}>
          <Text style={styles.title}>Tu plan para llegar a {target} ya está montado</Text>
          <Text style={styles.lead}>
            Puedes seguir gratis con todo lo esencial. Prime solo amplía los límites cuando se te
            queden cortos.
          </Text>
        </Reveal>

        <Reveal delay={520} still={still} style={styles.bullets}>
          {BULLETS.map((item) => (
            <View key={item} style={styles.bullet}>
              <Check size={16} color={tokens.colors.premiumText} strokeWidth={2.5} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </Reveal>

        {/* The price does not animate in itself — only its container fades
            into place. Nothing on this row scales, pulses or shines. */}
        <Reveal delay={590} still={still} style={styles.plan}>
          <View style={styles.planInfo}>
            <Text style={styles.planName}>Schedio Prime</Text>
            <Text style={styles.planSub}>Cancela cuando quieras</Text>
          </View>
          <View>
            {loading ? (
              <ActivityIndicator color={tokens.colors.premiumText} />
            ) : (
              <>
                <Text style={styles.planPrice}>{price}</Text>
                <Text style={styles.planPer}>al mes</Text>
              </>
            )}
          </View>
        </Reveal>
      </ScrollView>

      {/* Outside the ScrollView, so buying and declining are both on screen at
          once without anyone having to scroll for either. They arrive together
          and at the same speed: whichever appeared first would be the one the
          screen was nudging towards. */}
      <Reveal
        delay={620}
        still={still}
        style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={buy}
          disabled={purchasing || loading}
          accessibilityRole="button"
          style={[styles.cta, (purchasing || loading) && styles.ctaOff]}
        >
          {purchasing ? (
            <ActivityIndicator color={tokens.colors.bgBase} />
          ) : (
            <Text style={styles.ctaText}>Empezar con Prime</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onContinueFree}
          disabled={purchasing}
          accessibilityRole="button"
          style={styles.ghost}
        >
          <Text style={styles.ghostText}>Continuar con la versión gratuita</Text>
        </TouchableOpacity>

        <Text style={styles.footNote}>
          Suscripción mensual con renovación automática. Cancela cuando quieras desde Google Play.
        </Text>
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.background,
  },
  content: { paddingHorizontal: 24, paddingBottom: 24 },

  /**
   * The strip the estimate card becomes. Bordered in the accent rather than
   * the gold: this is still their result, not part of the offer — the gold
   * starts below it, with the badge.
   */
  strip: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
    backgroundColor: tokens.colors.surfaceCard,
    overflow: 'hidden',
  },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stripNow: {
    fontFamily: tokens.typography.families.display,
    fontSize: 26,
    color: tokens.colors.textSecondary,
  },
  stripArrow: { fontFamily: font.regular, fontSize: 15, color: tokens.colors.textDisabled },
  // trendUp, the same tone step 5 used for the projection. A semantic
  // exception, and the projection is exactly what it is for.
  stripTo: {
    fontFamily: tokens.typography.families.display,
    fontSize: 26,
    color: tokens.colors.trendUp,
  },
  stripCap: {
    marginLeft: 'auto',
    fontFamily: font.semibold,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
  },

  title: {
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 30,
    color: tokens.colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  lead: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
    marginBottom: 24,
  },

  bullets: { gap: 12, marginBottom: 24 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textPrimary,
  },

  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    borderColor: tokens.colors.premiumBorder,
    backgroundColor: tokens.colors.premiumBg,
  },
  planInfo: { flex: 1, minWidth: 0 },
  planName: { fontFamily: font.semibold, fontSize: 15, color: tokens.colors.textPrimary },
  planSub: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  planPrice: {
    fontFamily: font.bold,
    fontSize: 16,
    color: tokens.colors.textPrimary,
    textAlign: 'right',
  },
  planPer: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    textAlign: 'right',
    marginTop: 1,
  },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  /* Both buttons are the same height on purpose: the free exit has to be as
     easy to hit as the paid one, not a link the eye has to hunt for. */
  cta: {
    height: 48,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.premiumText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { opacity: 0.6 },
  ctaText: { fontFamily: font.semibold, fontSize: 15, color: tokens.colors.bgBase },
  ghost: {
    height: 48,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { fontFamily: font.medium, fontSize: 15, color: tokens.colors.textPrimary },
  footNote: {
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 16,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
});

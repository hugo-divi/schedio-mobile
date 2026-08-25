import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
 */

const BULLETS = [
  'Materias y Mochila ampliadas',
  'Vista de Plan completa, hasta un mes por delante',
  'Exporta tus notas y exámenes en PDF',
];

/** Last-resort label, matching app/plus.js. Only ever shown if RevenueCat is
 * unreachable — and the CTA refuses the sale in that case rather than
 * charging against a price we could not confirm. */
const FALLBACK_PRICE = '4,99 €';

export default function OnboardingPaywall({ target, onContinueFree, onPurchased }) {
  const insets = useSafeAreaInsets();
  const setIsPrime = useAuthStore((state) => state.setIsPrime);

  const [offerings, setOfferings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

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
        <PremiumBadge>Schedio Prime</PremiumBadge>

        <Text style={styles.title}>Tu plan para llegar a {target} ya está montado</Text>
        <Text style={styles.lead}>
          Puedes seguir gratis con todo lo esencial. Prime solo amplía los límites cuando se te
          queden cortos.
        </Text>

        <View style={styles.bullets}>
          {BULLETS.map((item) => (
            <View key={item} style={styles.bullet}>
              <Check size={16} color={tokens.colors.premiumText} strokeWidth={2.5} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.plan}>
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
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
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

        <Text style={styles.footNote}>Cancela cuando quieras desde Google Play</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.background,
  },
  content: { paddingHorizontal: 24, paddingBottom: 24 },

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

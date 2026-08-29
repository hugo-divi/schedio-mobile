import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, X, Check, Star } from 'lucide-react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import { tokens } from '../theme/tokens';
import { getOfferings, purchasePackage } from '../services/revenuecat';
import useAuthStore from '../store/authStore';
import usePrimeIntentStore, { PRIME_INTENTS } from '../store/primeIntentStore';
import { Button } from '../components/ui/Button';
import { PremiumBadge } from '../components/ui/Chip';

const font = tokens.typography.families.inter;

// What's actually shipped this round — keep in sync with the real gates in
// userStore/permissions/plans.js. Widget and trimester live only in the
// "Próximamente" note below, not as rows here, until they're real.
const COMPARE_ROWS = [
  { label: 'Mochila ampliada', note: 'Free limita las subidas semanales a la Mochila' },
  { label: 'Más materias', note: 'Free hasta 8 · Prime hasta 20' },
  { label: 'Vista de Plan completa', note: 'Free muestra 1–2 semanas; Prime, el mes completo' },
  { label: 'Exportar datos', note: 'Notas y exámenes en PDF', freeIncluded: false },
];

const BULLETS = [
  'Materias y Mochila ampliadas',
  'Vista de Plan completa, hasta un mes por delante',
  'Exporta tus notas y exámenes en PDF',
];

/**
 * The thank-you screen speaks to whatever the student was blocked on when the
 * paywall interrupted them (see store/primeIntentStore.js), so the first thing
 * they read after paying is the thing they actually paid for — and the button
 * takes them back into that exact action instead of dropping them anywhere.
 */
const THANKS_BY_REASON = {
  [PRIME_INTENTS.SUBJECTS]: {
    title: 'Ya puedes añadir todas tus materias',
    bullets: ['Hasta 20 materias, cada una con su propio color', ...BULLETS.slice(1)],
    cta: 'Añadir la materia',
  },
  [PRIME_INTENTS.MOCHILA]: {
    title: 'Ya puedes guardar muchos más apuntes',
    bullets: ['15 subidas por semana en tu Mochila', ...BULLETS.slice(1)],
    cta: 'Subir el archivo',
  },
};

const THANKS_DEFAULT = {
  title: '¡Bienvenido a Schedio Prime!',
  bullets: BULLETS,
  cta: 'Empezar',
};

/**
 * Placeholder for the testimonial carousel that used to sit here. Those quotes
 * were written by us and attributed to students who don't exist — on the one
 * screen where money changes hands, which is where invented endorsements stop
 * being copy and become a misleading commercial practice. Real quotes from
 * real subscribers go back in this slot, in the old carousel, once there are
 * any; until then this holds the same space with claims we can actually back.
 *
 * Note the middle line describes what the planner does, not a grade it
 * promises: "mejora tus notas" would be the same unbackable claim in a
 * different shape.
 */
const GUARANTEES = [
  'Cancela cuando quieras, desde Google Play',
  'Te dice qué estudiar cada día para llegar mejor a cada examen',
  'Tus apuntes y tus datos siguen siendo tuyos',
];

function CompareRow({ label, note, freeIncluded = true, index }) {
  return (
    <View style={[styles.row, index % 2 === 1 && styles.rowAlt]}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel}>{label}</Text>
        {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      </View>
      <View style={styles.rowCell}>
        {freeIncluded ? (
          <Check size={18} color={tokens.colors.trendUp} />
        ) : (
          <Text style={styles.rowDash}>—</Text>
        )}
      </View>
      <View style={styles.rowCell}>
        <Star size={16} color={tokens.colors.accent} fill={tokens.colors.accent} />
      </View>
    </View>
  );
}

/** The gold-filled CTA is unique to the paywall — not the shared Button's territory. */
function PrimeButton({ title, onPress, loading, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[styles.primeButton, (disabled || loading) && { opacity: 0.6 }]}
    >
      {loading ? (
        <ActivityIndicator color={tokens.colors.bgBase} />
      ) : (
        <Text style={styles.primeButtonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

function Guarantees() {
  return (
    <View style={styles.guarantees}>
      {GUARANTEES.map((line) => (
        <View key={line} style={styles.guarantee}>
          <Check size={15} color={tokens.colors.trendUp} />
          <Text style={styles.guaranteeText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

export default function SchedioPlusScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setIsPrime } = useAuthStore();
  const reason = usePrimeIntentStore((state) => state.reason);
  const thanks = THANKS_BY_REASON[reason] ?? THANKS_DEFAULT;
  const [step, setStep] = useState('compare'); // 'compare' | 'plan' | 'success'
  const [offerings, setOfferings] = useState(null);
  const [offeringsLoading, setOfferingsLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  // Flagged on the way out rather than at purchase time on purpose: the screen
  // that was interrupted reopens its sheet as soon as the intent is fulfilled,
  // and doing that at purchase time would stack it under a paywall the student
  // is still reading. This fires when the route leaves navigation state — the
  // start of the dismissal animation, not the end — so the sheet is already
  // there as the paywall slides away, which is what we want. It covers both
  // exits, the thank-you button and the swipe-down, so a student who swipes
  // away after paying is resumed just the same.
  // Leaving without buying drops the intent instead: otherwise an abandoned
  // visit would leave one lying around, and the next purchase — made from
  // Ajustes, say — would thank the student for the wrong thing and reopen a
  // sheet they had walked away from.
  const purchased = useRef(false);
  useEffect(() => {
    const { fulfilIntent, clearIntent } = usePrimeIntentStore.getState();
    return () => (purchased.current ? fulfilIntent() : clearIntent());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let data = null;
      try {
        data = await getOfferings();
      } catch {
        // fall through to the placeholder below
      }
      if (!cancelled) {
        setOfferings(data || { monthly: { product: { priceString: '4,99 €' } } });
        setOfferingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const price =
    offerings?.monthly?.product?.priceString ||
    offerings?.current?.monthly?.product?.priceString ||
    '4,99 €';

  const handlePurchase = async () => {
    const pack = offerings?.monthly || offerings?.current?.monthly;
    if (!pack) {
      Alert.alert(
        'No disponible',
        'No se encontró el plan mensual. Inténtalo de nuevo en unos segundos.'
      );
      return;
    }
    setPurchasing(true);
    const result = await purchasePackage(pack);
    setPurchasing(false);

    if (result) {
      // Optimistic UI only. The entitlement itself lives in RevenueCat and is
      // re-read via checkEntitlements() on every auth change — deliberately NOT
      // mirrored into Firestore, since a client-writable flag would let anyone
      // grant themselves Prime.
      setIsPrime(true);
      purchased.current = true;
      setStep('success');
    } else if (result === false) {
      // `null` means the student closed the purchase sheet themselves —
      // nothing to say. `false` is a real failure (declined card, network,
      // billing unavailable) and silence there just looks like a broken button.
      Alert.alert(
        'No se pudo completar la compra',
        'Ha habido un problema procesando el pago. Comprueba tu método de pago en Google Play e inténtalo de nuevo.'
      );
    }
  };

  if (step === 'success') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          style={styles.successScroll}
          contentContainerStyle={styles.successBody}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={ZoomIn.duration(420)} style={styles.successIconCircle}>
            <Check size={36} color={tokens.colors.premiumText} strokeWidth={2.5} />
          </Animated.View>
          <PremiumBadge>Prime</PremiumBadge>
          <Text style={styles.successTitle}>{thanks.title}</Text>
          <Text style={styles.successSubtitle}>
            Gracias por confiar en Schedio. Tu suscripción ya está activa — seguimos justo donde lo
            dejaste.
          </Text>

          <View style={styles.successUnlocked}>
            <Text style={styles.successUnlockedTitle}>Qué has desbloqueado</Text>
            <View style={styles.bulletList}>
              {thanks.bullets.map((bullet) => (
                <View key={bullet} style={styles.bullet}>
                  <View style={styles.bulletIcon}>
                    <Star
                      size={11}
                      color={tokens.colors.premiumText}
                      fill={tokens.colors.premiumText}
                    />
                  </View>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.planFooter, { paddingBottom: 16 + insets.bottom }]}>
          <PrimeButton title={thanks.cta} onPress={() => router.back()} />
        </View>

        <ConfettiCannon count={160} origin={{ x: -10, y: 0 }} fadeOut />
      </View>
    );
  }

  if (step === 'plan') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.planHeader}>
          <TouchableOpacity
            onPress={() => setStep('compare')}
            style={styles.iconBtn}
            accessibilityLabel="Volver"
          >
            <ChevronLeft size={22} color={tokens.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.planScroll}
          contentContainerStyle={styles.planBody}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.planHead}>
            <PremiumBadge>Prime</PremiumBadge>
            <Text style={styles.planTitle}>Schedio Prime</Text>
            <Text style={styles.planSubtitle}>Un solo plan, todo incluido</Text>
          </View>

          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              {offeringsLoading ? (
                <ActivityIndicator color={tokens.colors.textPrimary} />
              ) : (
                <>
                  <Text style={styles.priceValue}>{price}</Text>
                  <Text style={styles.priceUnit}>/ mes</Text>
                </>
              )}
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.bulletList}>
              {BULLETS.map((bullet) => (
                <View key={bullet} style={styles.bullet}>
                  <View style={styles.bulletIcon}>
                    <Star
                      size={11}
                      color={tokens.colors.premiumText}
                      fill={tokens.colors.premiumText}
                    />
                  </View>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          </View>

          <Guarantees />

          <View style={styles.planCta}>
            <PrimeButton
              title="Suscríbete ahora"
              onPress={handlePurchase}
              loading={purchasing}
              disabled={offeringsLoading}
            />
            {/* Play exige que el precio, la periodicidad y el carácter
                recurrente estén dichos antes de pagar — no solo implicados
                por el "/ mes" de arriba. */}
            <Text style={styles.cancelNote}>
              Suscripción mensual con renovación automática. Cancela cuando quieras desde Google
              Play.
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.planFooter, { paddingBottom: 16 + insets.bottom }]}>
          <Button
            title="Volver a Free"
            variant="secondary"
            fullWidth
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.compareHeader}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconBtn}
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.compareTitle}>Elige tu plan</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconBtn}
          accessibilityLabel="Cerrar"
        >
          <X size={20} color={tokens.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* A fixed View here (no scroll) let the row list run under the footer
          on a short screen or with larger system font settings — the same
          overlap `planScroll` below was built to avoid. Same fix, same
          reasoning: scroll instead of overlapping compareFooter. */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.compareColumnHead}>
          <View style={{ flex: 1 }} />
          <Text style={styles.compareColumnLabel}>Free</Text>
          <View style={styles.rowCell}>
            <PremiumBadge>Prime</PremiumBadge>
          </View>
        </View>

        {COMPARE_ROWS.map((row, i) => (
          <CompareRow key={row.label} {...row} index={i} />
        ))}

        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonLabel}>Próximamente</Text>
          <Text style={styles.comingSoonText}>
            Coach IA y vista de trimestre — incluidos con Prime en cuanto estén listos. El widget de
            inicio en Android llegará gratis para todos; Prime añadirá el tamaño grande.
          </Text>
        </View>

        <Text style={styles.independentNote}>
          Schedio lo hace un equipo pequeño e independiente — tu suscripción nos ayuda a seguir
          mejorando la app para estudiantes.
        </Text>
      </ScrollView>

      <View style={[styles.compareFooter, { paddingBottom: 16 + insets.bottom }]}>
        <PrimeButton title="Suscríbete a Prime" onPress={() => setStep('plan')} />
        <Button
          title="Continuar en Free"
          variant="secondary"
          fullWidth
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgBase,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Compare screen
  compareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  compareTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 17,
    color: tokens.colors.textPrimary,
  },
  compareColumnHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 8,
  },
  compareColumnLabel: {
    width: 64,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
  },
  rowAlt: {
    backgroundColor: tokens.colors.surfaceCard,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },
  rowNote: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
    color: tokens.colors.textSecondary,
  },
  rowCell: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDash: {
    fontSize: 14,
    color: tokens.colors.textSecondary,
  },
  comingSoon: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.colors.borderDefault,
    gap: 4,
  },
  comingSoonLabel: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  comingSoonText: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textPrimary,
  },
  independentNote: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  compareFooter: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // Plan screen
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  // The ScrollView itself takes the space between header and footer; its
  // contentContainerStyle grows to fill (and centers within) that space when
  // short, and scrolls instead of overlapping planFooter when it doesn't fit
  // — small screens, a longer guarantee line, or larger system font settings.
  planScroll: {
    flex: 1,
  },
  planBody: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 18,
  },
  planHead: {
    alignItems: 'center',
    gap: 8,
  },
  planTitle: {
    fontFamily: font.semibold,
    fontSize: 20,
    color: tokens.colors.premiumText,
  },
  planSubtitle: {
    fontFamily: font.regular,
    fontSize: 14,
    color: tokens.colors.textSecondary,
  },
  priceCard: {
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.premiumBorder,
    borderRadius: tokens.radius.card,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minHeight: 52,
    justifyContent: 'center',
  },
  priceValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 56,
    lineHeight: 60,
    color: tokens.colors.textPrimary,
  },
  priceUnit: {
    fontFamily: font.medium,
    fontSize: 15,
    color: tokens.colors.textSecondary,
  },
  priceDivider: {
    width: '100%',
    height: 1,
    backgroundColor: tokens.colors.borderDefault,
  },
  bulletList: {
    width: '100%',
    gap: 10,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.premiumBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textPrimary,
  },
  guarantees: {
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    padding: 14,
    gap: 10,
  },
  guarantee: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guaranteeText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textPrimary,
  },
  planCta: {
    alignItems: 'center',
    gap: 10,
  },
  cancelNote: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  planFooter: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
  },

  // Success screen
  successScroll: {
    flex: 1,
  },
  successBody: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    gap: 14,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.colors.premiumBg,
    borderWidth: 1,
    borderColor: tokens.colors.premiumBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  successTitle: {
    fontFamily: font.bold,
    fontSize: 22,
    lineHeight: 28,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  successUnlocked: {
    width: '100%',
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.premiumBorder,
    borderRadius: tokens.radius.card,
    padding: 18,
    marginTop: 8,
    gap: 12,
  },
  successUnlockedTitle: {
    fontFamily: font.semibold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: tokens.colors.textSecondary,
  },

  // Shared premium CTA
  primeButton: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: tokens.radius.btn,
    backgroundColor: tokens.colors.premiumText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primeButtonText: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.bgBase,
  },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  BookOpen,
  Brain,
  Check,
  Cpu,
  FlaskConical,
  Flame,
  Globe,
  Landmark,
  TrendingUp,
} from 'lucide-react-native';

import { tokens } from '../theme/tokens';
import { markWelcomeSeen } from '../services/welcome';
import useAuthStore from '../store/authStore';
import Button from '../components/ui/Button';

const font = tokens.typography.families.inter;
const TOTAL = 3;

// Subject tones come straight from the closed palette in tokens.js — these
// stand in for a real student's subjects, so they must read as the same
// vocabulary the app uses everywhere else.
const S = tokens.colors.subjects;

// ── Pieces ──────────────────────────────────────────────────────────────────

/** A subject chip as it appears scattered across the first screen. */
function SubjectChip({ icon: Icon, color, label, sub, tag, style }) {
  return (
    <View style={[styles.chip, style]}>
      <Icon size={18} color={color} strokeWidth={1.6} />
      <View style={{ minWidth: 0 }}>
        <Text style={styles.chipLabel}>{label}</Text>
        {sub ? <Text style={styles.chipSub}>{sub}</Text> : null}
      </View>
      {tag ? (
        <View style={styles.urgencyTag}>
          <Text style={styles.urgencyText}>{tag}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PlanRow({ icon: Icon, color, name, duration, last }) {
  return (
    <View style={[styles.planRow, last && styles.planRowLast]}>
      <Icon size={18} color={color} strokeWidth={1.6} />
      <Text style={styles.planSubject}>{name}</Text>
      <Text style={styles.planDuration}>{duration}</Text>
    </View>
  );
}

function Stat({ value, label, tone }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statValueRow}>
        {tone === 'premium' ? (
          <Flame
            size={17}
            color={tokens.colors.premiumText}
            fill={tokens.colors.premiumText}
            strokeWidth={1.2}
          />
        ) : null}
        <Text
          style={[
            styles.statValue,
            tone === 'accent' && { color: tokens.colors.accent },
            tone === 'premium' && { color: tokens.colors.premiumText },
          ]}
        >
          {value}
        </Text>
      </View>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ProgressRow({ icon: Icon, color, name, percent }) {
  return (
    <View style={styles.dashRow}>
      <Icon size={18} color={color} strokeWidth={1.6} />
      <Text style={styles.dashSubject} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.dashBar}>
        <View style={[styles.dashBarFill, { width: `${percent}%` }]} />
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

// ── Pages ───────────────────────────────────────────────────────────────────

function ProblemPage() {
  return (
    <>
      <View style={styles.scatter}>
        <SubjectChip
          icon={TrendingUp}
          color={S.mates}
          label="Mates"
          style={{ top: 6, left: 0, transform: [{ rotate: '-8deg' }] }}
        />
        <SubjectChip
          icon={Landmark}
          color={S.historia}
          label="Historia"
          tag="3 días"
          style={{ top: 52, right: 0, transform: [{ rotate: '6deg' }] }}
        />
        <SubjectChip
          icon={Globe}
          color={S.ingles}
          label="Inglés"
          style={{ top: 124, left: 32, transform: [{ rotate: '4deg' }] }}
        />
        <SubjectChip
          icon={FlaskConical}
          color={S.quimica}
          label="Química"
          style={{ top: 170, right: 12, transform: [{ rotate: '-7deg' }] }}
        />
        <SubjectChip
          icon={BookOpen}
          color={S.lengua}
          label="Lengua"
          sub="apuntes sueltos"
          style={{ top: 228, left: 68, transform: [{ rotate: '-10deg' }] }}
        />
      </View>

      <View style={styles.tally}>
        <Text style={styles.tallyItem}>
          <Text style={styles.tallyNumber}>6 </Text>asignaturas
        </Text>
        <View style={styles.tallySep} />
        <Text style={styles.tallyItem}>
          <Text style={styles.tallyNumber}>2 </Text>exámenes esta semana
        </Text>
      </View>

      <Text style={styles.title}>Demasiadas asignaturas, ningún plan</Text>
      <Text style={styles.lead}>
        Exámenes que se acumulan, temas sueltos, apuntes por todos lados. Sabes que tienes que
        estudiar — lo difícil es saber por dónde empezar cada día.
      </Text>
    </>
  );
}

function MechanismPage() {
  return (
    <>
      <View style={styles.centredArt}>
        <View style={styles.planCard}>
          <View style={styles.planHead}>
            <Text style={styles.overline}>HOY</Text>
            <Text style={styles.planCount}>3 sesiones</Text>
          </View>

          <PlanRow icon={TrendingUp} color={S.mates} name="Mates" duration="45 min" />
          <PlanRow icon={FlaskConical} color={S.quimica} name="Química" duration="30 min" />
          <PlanRow icon={Globe} color={S.ingles} name="Inglés" duration="20 min" last />

          {/* The plan is paced against a real exam date, not a flat to-do
              list — the filled days are the ones already planned. */}
          <View style={styles.burndown}>
            <View style={styles.burndownHead}>
              <Text style={styles.burndownLabel}>Examen de Química</Text>
              <Text style={styles.burndownDays}>en 5 días</Text>
            </View>
            <View style={styles.burndownTrack}>
              {[true, true, true, false, false].map((filled, i) => (
                <View key={i} style={styles.burndownSeg}>
                  {filled ? <View style={styles.burndownSegFill} /> : null}
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.autoTag}>
          <Check size={13} color={tokens.colors.accent} strokeWidth={2.5} />
          <Text style={styles.autoTagText}>Generado para ti</Text>
        </View>
      </View>

      <Text style={styles.title}>Schedio te dice qué estudiar cada día</Text>
      <Text style={styles.lead}>
        A partir de tus asignaturas y tus exámenes reales, Schedio arma un plan día a día — no una
        lista genérica: el tuyo.
      </Text>
    </>
  );
}

function OutcomePage() {
  return (
    <>
      <View style={styles.centredArt}>
        <View style={styles.dashCard}>
          <View style={styles.dashStats}>
            <Stat value="6" label="Asignaturas" />
            <Stat value="4" label="Días al examen" tone="accent" />
            <Stat value="7" label="Racha" tone="premium" />
          </View>

          <View style={{ gap: 14 }}>
            <ProgressRow icon={TrendingUp} color={S.mates} name="Matemáticas" percent={70} />
            <ProgressRow icon={Cpu} color={S.tecno} name="Tecnología" percent={45} />
            <ProgressRow icon={Brain} color={S.filosofia} name="Filosofía" percent={85} />
          </View>
        </View>
      </View>

      <Text style={styles.title}>Todo tu curso académico, en una única pantalla</Text>
      <Text style={styles.leadStrong}>Así de simple puede ser tu día a día.</Text>

      <View style={styles.bullets}>
        <Bullet>Plan de estudio automático, cada día</Bullet>
        <Bullet>Avisos antes de cada examen</Bullet>
        <Bullet>Tu racha, para no dejarlo a medias</Bullet>
      </View>
    </>
  );
}

const PAGES = [ProblemPage, MechanismPage, OutcomePage];

// ── Screen ──────────────────────────────────────────────────────────────────

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroller = useRef(null);
  const [index, setIndex] = useState(0);

  const user = useAuthStore((state) => state.user);

  // Defensive: app/index.js only routes here once it knows there is no
  // session, but if one ever materialises while the carousel is open, an
  // account holder must not be left sitting in a pre-account intro.
  useEffect(() => {
    if (user) {
      markWelcomeSeen();
      router.replace('/');
    }
  }, [user, router]);

  /** Every way out of the carousel marks it seen — it must never come back. */
  const leaveTo = useCallback(
    async (path) => {
      await markWelcomeSeen();
      router.replace(path);
    },
    [router]
  );

  const goNext = () => {
    if (index >= TOTAL - 1) {
      leaveTo('/register');
      return;
    }
    scroller.current?.scrollTo({ x: (index + 1) * width, animated: true });
  };

  const isLast = index === TOTAL - 1;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {/* Kept mounted rather than conditionally rendered: the header has to
            hold its height, or the paged area below it would resize mid-swipe. */}
        <TouchableOpacity
          onPress={() => leaveTo('/login')}
          disabled={isLast}
          style={{ opacity: isLast ? 0 : 1 }}
          accessibilityRole="button"
          accessibilityLabel="Saltar la presentación"
          accessibilityElementsHidden={isLast}
          importantForAccessibility={isLast ? 'no-hide-descendants' : 'auto'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.skip}>Saltar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={styles.flex}
      >
        {PAGES.map((Page, i) => (
          <ScrollView
            key={i}
            style={{ width }}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
          >
            {/* Remounting on activation replays the entrance for the page the
                student just landed on, instead of firing all three at start-up
                while two of them are off-screen. */}
            <Animated.View
              key={index === i ? `on-${i}` : `off-${i}`}
              entering={index === i ? FadeInDown.duration(280) : undefined}
            >
              <Page />
            </Animated.View>
          </ScrollView>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots}>
          {PAGES.map((_, i) => (
            <View key={i} style={[styles.dot, index === i && styles.dotActive]} />
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
          <Animated.Text entering={FadeIn.duration(200)} style={styles.reassure}>
            Gratis, sin tarjeta.
          </Animated.Text>
          <View style={styles.secondary}>
            <Text style={styles.secondaryText}>¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={() => leaveTo('/login')} disabled={!isLast}>
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

  page: { paddingHorizontal: 24, paddingBottom: 24, flexGrow: 1 },

  // ── Screen 1 ──
  scatter: { height: 296, marginTop: 8 },
  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipLabel: { fontFamily: font.medium, fontSize: 13, color: tokens.colors.textPrimary },
  chipSub: {
    fontFamily: font.regular,
    fontSize: 11,
    color: tokens.colors.textSecondary,
    marginTop: 1,
  },
  // No soft-danger fill exists in the design system, so this is a bordered
  // pill with danger-coloured text rather than an invented tint.
  urgencyTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  urgencyText: { fontFamily: font.semibold, fontSize: 11, color: tokens.colors.danger },

  tally: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
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

  // ── Screens 2 & 3 ──
  centredArt: {
    height: 296,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  planCard: {
    width: 280,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderTopWidth: 2,
    borderTopColor: tokens.colors.accent,
    borderRadius: tokens.radius.card,
    padding: 20,
  },
  planHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  overline: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: tokens.colors.textSecondary,
  },
  planCount: { fontFamily: font.medium, fontSize: 12, color: tokens.colors.textSecondary },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  planRowLast: { borderBottomWidth: 0 },
  planSubject: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },
  planDuration: { fontFamily: font.regular, fontSize: 13, color: tokens.colors.textSecondary },

  burndown: {
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  burndownHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  burndownLabel: { fontFamily: font.medium, fontSize: 12, color: tokens.colors.textSecondary },
  burndownDays: { fontFamily: font.semibold, fontSize: 12, color: tokens.colors.textPrimary },
  burndownTrack: { flexDirection: 'row', gap: 4 },
  burndownSeg: {
    flex: 1,
    height: 5,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  // Accent, not a subject tone: these are plan days, and Química is a row
  // right above — reusing its green would collide two different meanings.
  burndownSegFill: {
    flex: 1,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },

  autoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
  },
  autoTagText: { fontFamily: font.semibold, fontSize: 11, color: tokens.colors.accent },

  dashCard: {
    width: '100%',
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderTopWidth: 2,
    borderTopColor: tokens.colors.accent,
    borderRadius: tokens.radius.card,
    padding: 20,
  },
  // Even columns rather than flex-with-dividers: the dividers cost enough of
  // the inner width that "Días al examen" clipped.
  dashStats: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  stat: { flex: 1, minWidth: 0, gap: 4 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 28,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
  },
  statLabel: { fontFamily: font.medium, fontSize: 11, color: tokens.colors.textSecondary },

  dashRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dashSubject: {
    width: 92,
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textPrimary,
  },
  dashBar: {
    flex: 1,
    height: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
    overflow: 'hidden',
  },
  dashBarFill: {
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },

  // ── Copy ──
  title: {
    fontFamily: font.bold,
    fontSize: 26,
    lineHeight: 31,
    color: tokens.colors.textPrimary,
    marginTop: 22,
    marginBottom: 8,
  },
  lead: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
  },
  leadStrong: {
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 22,
    color: tokens.colors.textPrimary,
  },

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
    gap: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
  },
  dotActive: { width: 20, backgroundColor: tokens.colors.accent },

  tail: { alignItems: 'center', gap: 10 },
  tailHidden: { opacity: 0 },
  reassure: { fontFamily: font.regular, fontSize: 12, color: tokens.colors.textSecondary },
  secondary: { flexDirection: 'row', alignItems: 'center' },
  secondaryText: { fontFamily: font.regular, fontSize: 13, color: tokens.colors.textSecondary },
  secondaryLink: { fontFamily: font.semibold, fontSize: 13, color: tokens.colors.accent },
});

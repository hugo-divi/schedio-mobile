import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Info, Flame, Moon, LifeBuoy, Snowflake } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import useUserStore from '../../store/userStore';
import { auth } from '../../services/firebase';
import {
  checkDailyStreak,
  setFreeDays as persistFreeDays,
  spendJoker,
  sanitizeFreeDays,
  MAX_FREE_DAYS,
  MAX_REST_PER_WEEK,
} from '../../services/streaks';
import { getUpcomingExams } from '../../services/exams';
import StreakDetail from '../../components/StreakDetail';
import BottomSheet from '../../components/ui/BottomSheet';

const font = tokens.typography.families.inter;

/**
 * The streak detail, as its own screen rather than the bottom sheet it used to
 * be — same content, but it gets the whole viewport and the back gesture.
 *
 * It reads its own streak document instead of being handed one. Inicio used to
 * pass the numbers down as props, which a pushed screen can't receive; going to
 * the source also means the figures here are current rather than whatever the
 * home screen last fetched.
 *
 * Carga también los exámenes que vienen, porque la racha ya no depende solo de
 * lo que estudiaste: sin exámenes por delante no hay plan, y sin plan la racha
 * se congela en vez de romperse. Eso lo decide `hasPlan`, y se pasa desde aquí
 * para que `services/streaks.js` no tenga que saber nada de exámenes.
 */
export default function StreakScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;

  const sessionHistory = useUserStore((state) => state.sessionHistory);
  const [streak, setStreak] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const upcoming = await getUpcomingExams(user.uid, 20);
      setStreak(await checkDailyStreak(user.uid, { hasPlan: (upcoming || []).length > 0 }));
    } catch (error) {
      console.warn('Could not load the streak', error);
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
    if (user?.uid && (sessionHistory || []).length === 0) {
      useUserStore.getState().loadSessionHistory(user.uid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const freeDays = sanitizeFreeDays(streak?.freeDays);

  /**
   * Se pinta el cambio antes de que Firestore conteste y se revierte si falla:
   * marcar un día libre es un interruptor, y un interruptor que tarda medio
   * segundo en moverse se siente roto.
   */
  const toggleFreeDay = async (index) => {
    if (!user?.uid || !streak) return;
    const isOn = freeDays.includes(index);
    if (!isOn && freeDays.length >= MAX_FREE_DAYS) {
      Alert.alert(
        'Ya tienes tus días libres',
        `Puedes marcar hasta ${MAX_FREE_DAYS} días. Quita uno para marcar otro.`
      );
      return;
    }
    const next = isOn ? freeDays.filter((d) => d !== index) : [...freeDays, index];
    const previous = streak;
    setStreak({ ...streak, freeDays: next });
    try {
      await persistFreeDays(user.uid, next);
      await load();
    } catch {
      setStreak(previous);
      Alert.alert('Error', 'No se pudieron guardar tus días libres.');
    }
  };

  const useJoker = async () => {
    if (!user?.uid) return;
    try {
      const result = await spendJoker(user.uid);
      if (!result) {
        Alert.alert('No quedan comodines', 'Vuelven a estar disponibles el lunes.');
        return;
      }
      await load();
    } catch {
      Alert.alert('Error', 'No se pudo usar el comodín.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tu racha</Text>
        <TouchableOpacity
          onPress={() => setInfoOpen(true)}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Cómo funciona tu racha"
        >
          <Info size={20} color={tokens.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <StreakDetail
          currentStreak={streak?.currentStreak || 0}
          maxStreak={streak?.maxStreak || 0}
          studyHistory={sessionHistory || []}
          dailyActivity={streak?.dailyActivity || 0}
          restDays={streak?.restDays || []}
          restRemaining={streak?.restRemaining ?? MAX_REST_PER_WEEK}
          freeDays={freeDays}
          frozen={streak?.frozen ?? false}
          onToggleFreeDay={toggleFreeDay}
          onSpendJoker={useJoker}
          onStartSession={() => router.replace('/dashboard/study')}
        />
      </ScrollView>

      {/* Las cuatro situaciones, explicadas de una vez. La de vacaciones sobre
          todo: sin esto, la primera racha congelada parece un fallo. */}
      <BottomSheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Cómo funciona tu racha"
      >
        <Text style={styles.infoLede}>
          Mide constancia cuando hay algo que hacer, no que abras la app todos los días.
        </Text>

        <InfoRow
          icon={<Flame size={15} color={tokens.colors.background} />}
          style={styles.iconSolid}
          title="Día con plan"
          body="Estudias lo que toca y la racha sube. Si no puedes, gastas un comodín y no la pierdes."
        />
        <InfoRow
          icon={<Moon size={15} color={tokens.colors.accent} />}
          style={styles.iconAccent}
          title="Tu día libre"
          body="Sábado y domingo por defecto, y los cambias cuando quieras. El plan no te pide nada, así que no cuentan ni a favor ni en contra."
        />
        <InfoRow
          icon={<LifeBuoy size={15} color={tokens.colors.premiumText} />}
          style={styles.iconGold}
          title="Comodín"
          body={`${MAX_REST_PER_WEEK} por semana para lo imprevisto. Los gastas tú tocando «Hoy no puedo», y vuelven cada lunes.`}
        />
        <InfoRow
          icon={<Snowflake size={15} color={tokens.colors.textSecondary} />}
          style={styles.iconMute}
          title="Vacaciones"
          body="Sin exámenes no hay plan, y sin plan la racha se congela. Vuelves en enero con tus días intactos: no hay que activar ni desactivar nada."
        />
      </BottomSheet>
    </View>
  );
}

function InfoRow({ icon, style, title, body }) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, style]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 17,
    color: tokens.colors.textPrimary,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  infoLede: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconSolid: {
    backgroundColor: tokens.colors.accent,
    borderColor: tokens.colors.accent,
  },
  iconAccent: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  iconGold: {
    backgroundColor: 'rgba(212, 169, 76, 0.12)',
    borderColor: 'rgba(212, 169, 76, 0.3)',
  },
  iconMute: {
    backgroundColor: 'transparent',
    borderColor: tokens.colors.borderDefault,
  },
  infoTitle: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textPrimary,
  },
  infoBody: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
    marginTop: 3,
  },
});

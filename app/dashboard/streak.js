import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import useUserStore from '../../store/userStore';
import { auth } from '../../services/firebase';
import { checkDailyStreak } from '../../services/streaks';
import StreakDetail from '../../components/StreakDetail';

const font = tokens.typography.families.inter;

/**
 * The streak detail, as its own screen rather than the bottom sheet it used to
 * be — same content, but it gets the whole viewport and the back gesture.
 *
 * It reads its own streak document instead of being handed one. Inicio used to
 * pass the numbers down as props, which a pushed screen can't receive; going to
 * the source also means the figures here are current rather than whatever the
 * home screen last fetched.
 */
export default function StreakScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;

  const sessionHistory = useUserStore((state) => state.sessionHistory);
  const [streak, setStreak] = useState(null);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    try {
      setStreak(await checkDailyStreak(user.uid));
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tu racha</Text>
        <View style={styles.back} />
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
          restRemaining={streak?.restRemaining ?? 0}
          onStartSession={() => router.replace('/dashboard/study')}
          onDone={() => router.back()}
        />
      </ScrollView>
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
  back: {
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
});

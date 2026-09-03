import { Tabs, useRouter, usePathname } from 'expo-router';
import { Home, Plus, Map as MapIcon, User, BookOpen } from 'lucide-react-native';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import React, { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  interpolateColor,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { FAB_SIZE, FAB_BOTTOM, TAB_BAR_STYLE } from '../../components/ui/InlineSheet';
import { tokens } from '../../theme/tokens';
import QuickActionsModal from '../../components/QuickActionsModal';
import EventModal from '../../components/EventModal';
import UploadModal from '../../components/UploadModal';
import useUserStore from '../../store/userStore';
import useAuthStore from '../../store/authStore';
import usePrimeIntentStore, { PRIME_INTENTS, PRIME_ORIGINS } from '../../store/primeIntentStore';
import useSessionStore from '../../store/sessionStore';
import { auth } from '../../services/firebase';

/**
 * One tab. Only the selected one carries its name, inside a pill.
 *
 * The pill isn't a new visual language: `accentSoftBg` on `accentSoftBorder`
 * is already how the app says "selected" everywhere else — subject chips, the
 * rhythm options, the acquisition chips in onboarding. This applies that rule
 * to the bar rather than inventing one for it.
 *
 * Labels on the other three are dropped because four of them competing at once
 * is most of the noise down here, and one visible name is enough to stay
 * oriented — a map icon does not read as "Plan" on anyone's first day.
 */
function PillTab({ icon: Icon, label, onPress, onLongPress, ...rest }) {
  const pathname = usePathname();

  /*
   * Focus, read three ways, because getting it wrong is silent.
   *
   * React Navigation 7 hands a custom `tabBarButton` its focus as
   * `'aria-selected'`; v6 used `accessibilityState.selected`. Reading only the
   * old name left `focused` undefined on every tab forever — no pill, no
   * accent, no label, not even on the tab you were standing on, and nothing
   * anywhere said so.
   *
   * The `href` comparison is the net under that. It only runs when neither
   * prop is there, which today means never; if a future version renames the
   * flag again, the bar keeps lighting the right tab instead of quietly going
   * dark. `href` is part of the documented props and is the tab's own route.
   */
  const flagged = rest['aria-selected'] ?? rest.accessibilityState?.selected;
  const focused = flagged ?? (rest.href ? pathname === rest.href : false);

  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    // The spring the central "+" already uses, so the bar moves like the rest
    // of the app rather than in a dialect of its own.
    progress.value = withSpring(focused ? 1 : 0, { damping: 18, stiffness: 260, mass: 0.6 });
  }, [focused, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(41, 121, 255, 0)', tokens.colors.accentSoftBg]
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(41, 121, 255, 0)', tokens.colors.accentSoftBorder]
    ),
  }));

  return (
    <Pressable
      onPress={(event) => {
        if (!focused && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress?.(event);
      }}
      onLongPress={onLongPress}
      style={styles.tabSlot}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      // The name is always announced even when it isn't drawn, so dropping the
      // labels costs sighted users some clutter and screen-reader users nothing.
      accessibilityLabel={label}
    >
      {/* LinearTransition is what makes the pill grow into the label rather
          than snap around it the frame the text mounts. */}
      <Animated.View style={[styles.tabPill, pillStyle]} layout={LinearTransition.duration(220)}>
        <Icon
          size={22}
          color={focused ? tokens.colors.accent : tokens.colors.textDisabled}
          strokeWidth={focused ? 2.5 : 2}
        />
        {focused ? (
          <Animated.Text entering={FadeIn.duration(160)} style={styles.tabLabel} numberOfLines={1}>
            {label}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export default function DashboardLayout() {
  // Selector form on purpose: this component is the parent of every tab, so a
  // whole-store subscription re-rendered all of them (and the three modals
  // below) on any unrelated write.
  const subjects = useUserStore((state) => state.subjects);

  /**
   * Nothing guarded this route. Reaching it directly — a widget's deep link,
   * a notification — with no session landed on an empty dashboard instead of
   * the login screen. Sends them through `/`, which is the one screen that
   * knows where an account should actually go.
   *
   * Waits for `authResolved` rather than just `!user`: on a cold start from a
   * deep link the listener hasn't reported yet, and bouncing on that would
   * throw out a perfectly good restored session.
   */
  const router = useRouter();
  const authedUser = useAuthStore((state) => state.user);
  const authResolved = useAuthStore((state) => state.authResolved);
  useEffect(() => {
    if (authResolved && !authedUser) router.replace('/');
  }, [authResolved, authedUser, router]);
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  // Reopens the upload sheet after a Prime purchase that the weekly upload
  // limit triggered from here — the sheet has to close to show the paywall,
  // and without this the student would have to find the button and pick the
  // file again immediately after paying.
  const primeReason = usePrimeIntentStore((state) => state.reason);
  const primeOrigin = usePrimeIntentStore((state) => state.origin);
  const primeFulfilled = usePrimeIntentStore((state) => state.fulfilled);
  useEffect(() => {
    if (
      primeReason === PRIME_INTENTS.MOCHILA &&
      primeOrigin === PRIME_ORIGINS.QUICK_ACTIONS &&
      primeFulfilled
    ) {
      usePrimeIntentStore.getState().clearIntent();
      setUploadModalVisible(true);
    }
  }, [primeReason, primeOrigin, primeFulfilled]);

  const screenOptions = React.useMemo(
    () => ({
      headerShown: false,
      // Stops the tabs that aren't on screen from re-rendering. Without it
      // every store write redrew Perfil and Plan in the background.
      freezeOnBlur: true,
      sceneContainerStyle: {
        backgroundColor: tokens.colors.background,
      },
      tabBarStyle: TAB_BAR_STYLE,
      tabBarActiveTintColor: tokens.colors.accent,
      tabBarInactiveTintColor: tokens.colors.textDisabled,
      // Every tab draws itself through PillTab now, icon and name together —
      // the built-in label would sit underneath it as a second copy.
      tabBarShowLabel: false,
      tabBarItemStyle: {
        justifyContent: 'center',
        alignItems: 'center',
      },
    }),
    []
  );

  const handleSaveExam = async (examData) => {
    const { createExam } = await import('../../services/exams');
    const user = auth.currentUser;
    if (!user) return;
    // Drop `id` (always null when creating) so it isn't stored as a field.
    const fields = { ...examData };
    delete fields.id;
    await createExam({
      ...fields,
      userId: user.uid,
      completed: false,
    });
    // Signal global refresh
    useUserStore.getState().triggerExamRefresh();
  };

  // Drives both the icon's rotation and which way the press goes.
  const fabProgress = useSharedValue(0);
  useEffect(() => {
    fabProgress.value = withSpring(quickActionsVisible ? 1 : 0, {
      damping: 18,
      stiffness: 260,
      mass: 0.6,
    });
  }, [quickActionsVisible, fabProgress]);

  const fabIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${fabProgress.value * 45}deg` }],
  }));

  /**
   * Entrada y salida del "+".
   *
   * Antes se montaba y desmontaba en seco (`sessionActive ? null : …`), así que
   * al empezar una sesión el botón desaparecía de golpe y al terminarla volvía
   * a aparecer de golpe. Ahora sigue montado y se anima:
   *
   *  · al volver, entra con el mismo muelle que ya usan la píldora de la
   *    pestaña activa y la rotación del icono — está poco amortiguado (ζ≈0,72),
   *    así que se pasa un pelo de tamaño y se asienta, que es lo que hace que
   *    se lea como que "vuelve" en vez de aparecer;
   *  · al irse, no rebota: sale con la curva y la duración estándar del
   *    sistema, más corta, porque una salida lenta estorba a lo que viene
   *    detrás (la pantalla de sesión).
   *
   * La rotación del icono es independiente y no se toca: se compone con esta
   * porque vive en la vista de dentro.
   */
  const fabPresence = useSharedValue(sessionActive ? 0 : 1);
  useEffect(() => {
    fabPresence.value = sessionActive
      ? withTiming(0, { duration: 180, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })
      : withSpring(1, { damping: 18, stiffness: 260, mass: 0.6 });
  }, [sessionActive, fabPresence]);

  const fabPresenceStyle = useAnimatedStyle(() => ({
    // El muelle se pasa de 1; la opacidad hay que recortarla, la escala no
    // (ese pequeño exceso es justo el rebote que se busca).
    opacity: Math.min(1, fabPresence.value),
    transform: [{ scale: 0.6 + fabPresence.value * 0.4 }],
  }));

  const toggleQuickActions = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuickActionsVisible((open) => !open);
  };

  /**
   * Estudiar hides the tab bar once the timer is running, but this button is
   * not in the tab bar — it floats over everything from here — so it stayed
   * put, offering a way out of the one screen built not to have one.
   */
  const sessionActive = useSessionStore((state) => state.sessionActive);

  // A session can be started from the quick-actions sheet itself, which would
  // otherwise be left open over the timer with no button left to close it.
  useEffect(() => {
    if (sessionActive) setQuickActionsVisible(false);
  }, [sessionActive]);

  /**
   * Changing tab closes the sheet. It is anchored to the tab bar and belongs
   * to no tab in particular, so leaving it open across a switch left it
   * hovering over a screen the student had deliberately moved to — and the
   * "+" underneath it had already rotated back to a plus, so the way out
   * wasn't obvious either.
   */
  const pathname = usePathname();
  useEffect(() => {
    setQuickActionsVisible(false);
  }, [pathname]);

  return (
    <View style={styles.root}>
      <Tabs screenOptions={screenOptions}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Inicio',
            tabBarButton: (props) => <PillTab {...props} icon={Home} label="Inicio" />,
          }}
        />
        <Tabs.Screen
          name="study"
          options={{
            title: 'Clase',
            // The one tab that must keep running while it isn't on screen: it
            // owns the session timer.
            freezeOnBlur: false,
            tabBarButton: (props) => <PillTab {...props} icon={BookOpen} label="Clase" />,
          }}
        />
        {/* Center FAB Button */}
        <Tabs.Screen
          name="session_redirect"
          options={{
            title: '',
            // Just a gap now. The real button is rendered at the end of this
            // component instead, so it paints *after* the quick-actions sheet
            // and stays on top of it — inside the tab bar it would be drawn
            // first and the sheet would cover it.
            tabBarButton: () => <View style={{ width: FAB_SIZE }} />,
            tabBarIcon: () => null,
          }}
          // No tabPress listener any more: the slot is an inert spacer, so
          // nothing can press it. Opening is the floating button's job.
        />
        <Tabs.Screen
          name="plans"
          options={{
            title: 'Plan',
            tabBarButton: (props) => <PillTab {...props} icon={MapIcon} label="Plan" />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Perfil',
            tabBarButton: (props) => <PillTab {...props} icon={User} label="Perfil" />,
          }}
        />
        {/* Hidden screens */}
        <Tabs.Screen name="ranks" options={{ href: null }} />
        <Tabs.Screen name="analysis" options={{ href: null }} />
        <Tabs.Screen name="streak" options={{ href: null }} />
        <Tabs.Screen name="history" options={{ href: null }} />
      </Tabs>

      <QuickActionsModal
        visible={quickActionsVisible}
        onClose={() => setQuickActionsVisible(false)}
        onAddExam={() => setEventModalVisible(true)}
        onAddFile={() => setUploadModalVisible(true)}
      />

      {/* Last child on purpose: it has to paint over the sheet above, the way
          the "+" sits on the sheet's top edge rather than under it. */}
      {/* Durante la sesión el botón sigue montado pero es invisible: hay que
          quitarlo de los toques y del lector de pantalla a mano, porque
          Estudiar se construyó a propósito sin salida. */}
      <Animated.View
        style={[styles.fabSlot, fabPresenceStyle]}
        pointerEvents={sessionActive ? 'none' : 'auto'}
        accessibilityElementsHidden={sessionActive}
        importantForAccessibility={sessionActive ? 'no-hide-descendants' : 'auto'}
      >
        <Pressable
          onPress={toggleQuickActions}
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.92 }] }]}
          accessibilityRole="button"
          accessibilityLabel={quickActionsVisible ? 'Cerrar acciones rápidas' : 'Acciones rápidas'}
        >
          <Animated.View style={fabIconStyle}>
            <Plus size={28} color="#FFFFFF" strokeWidth={3} />
          </Animated.View>
        </Pressable>
      </Animated.View>

      <EventModal
        visible={eventModalVisible}
        onClose={() => setEventModalVisible(false)}
        selectedDate={new Date()}
        onSave={handleSaveExam}
        subjects={subjects}
      />

      <UploadModal
        visible={uploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
        intentOrigin={PRIME_ORIGINS.QUICK_ACTIONS}
        subjects={subjects}
        onUploadSuccess={(fileData) => {
          // This used to only log: the file reached Storage and then never got
          // a Firestore row, so it never showed up in the Mochila.
          const uid = auth.currentUser?.uid;
          if (uid) useUserStore.getState().addResource(uid, fileData);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  tabLabel: {
    fontFamily: tokens.typography.families.inter.semibold,
    fontSize: 12,
    color: tokens.colors.textPrimary,
  },
  // El sitio que ocupa el botón, separado de su aspecto: la escala de entrada
  // y salida va aquí, para que el `scale: 0.92` de la pulsación siga viviendo
  // en el Pressable sin que uno pise al otro.
  fabSlot: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: FAB_BOTTOM,
    width: FAB_SIZE,
    height: FAB_SIZE,
  },
  fab: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // No elevation: the redesign is flat, and this was the last drop shadow
    // left in the tab bar. The accent fill is already the loudest thing there.
    borderWidth: 3,
    borderColor: tokens.colors.background,
  },
});

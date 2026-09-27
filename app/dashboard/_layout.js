import { Tabs, useRouter, usePathname } from 'expo-router';
import { Home, Plus, Map as MapIcon, User, BookOpen } from 'lucide-react-native';
import { View, StyleSheet, Pressable, Platform, useWindowDimensions } from 'react-native';
import React, { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolateColor,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { TAB_BAR_STYLE } from '../../components/ui/InlineSheet';
import {
  SIDE_MARGIN,
  PLUS_SIZE,
  plusLeft,
  tabGap,
  plusBottomOffset,
} from '../../services/tabBarLayout';
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
 * El único muelle de la barra. Lo usan el color de la píldora activa, el
 * ensanchado de esa píldora, el recolocado de las otras tres y la rotación del
 * "+" — un solo movimiento para todo lo que pasa aquí abajo.
 *
 * Está poco amortiguado a propósito (ζ≈0,72): se pasa un pelo de su meta y se
 * asienta, que es lo que hace que se lea como algo que responde en vez de algo
 * que se coloca. Comprobado con la física real de Reanimated en
 * scripts/check-fab-springs.mjs.
 */
const BAR_SPRING = { damping: 18, stiffness: 260, mass: 0.6 };

/**
 * El muelle de lo que se mueve de sitio: el ancho de la píldora que se abre y
 * el recolocado de las otras tres.
 *
 * Misma rigidez y misma masa que `BAR_SPRING` — o sea, misma frecuencia y
 * mismo tiempo de llegada, se leen como el mismo movimiento. Lo único que
 * cambia es el amortiguamiento, y por un motivo concreto: `BAR_SPRING` está
 * poco amortiguado (ζ≈0,72) y se pasa un 3,8% de su meta antes de asentarse.
 * En un color eso no se ve; en la POSICIÓN de los iconos vecinos sí — se van
 * un pelo más a la derecha de donde acaban y vuelven, y eso se lee como un
 * tirón, no como un rebote.
 *
 * Con `damping: 25` sale ζ = 25/(2·√(260·0,6)) = 1,0008. Reanimated elige la
 * rama por `zeta < 1 ? underDamped : criticallyDamped` (comprobado en
 * animation/spring/spring.js del paquete instalado), así que a partir de 1
 * entra por la fórmula críticamente amortiguada, que por construcción no
 * puede pasarse de la meta. No es que rebote poco: es que no rebota.
 */
const BAR_LAYOUT_SPRING = { damping: 25, stiffness: 260, mass: 0.6 };

/**
 * Ese muelle en la forma que quiere `layout`. `LinearTransition` hereda de
 * `ComplexAnimationBuilder` (comprobado en el paquete instalado), así que
 * `.springify()` cambia su `withTiming` interno por un `withSpring` con esta
 * configuración — no es una curva parecida, es la misma.
 */
const BAR_LAYOUT = LinearTransition.springify()
  .damping(BAR_LAYOUT_SPRING.damping)
  .stiffness(BAR_LAYOUT_SPRING.stiffness)
  .mass(BAR_LAYOUT_SPRING.mass);

/**
 * La única excepción a `BAR_SPRING`: el "+" al irse durante una sesión. Sigue
 * siendo un muelle (no una curva de tiempo, que es lo que era y lo que hacía
 * que salir se sintiera mecánico al lado de entrar), pero más amortiguado
 * (ζ≈0,89) para quitarse rápido de en medio sin rebotar sobre la pantalla de
 * sesión que viene detrás.
 */
const FAB_EXIT_SPRING = { damping: 24, stiffness: 300, mass: 0.6 };

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
 *
 * `focused` arrives as a plain boolean now, computed once by `CustomTabBar`
 * from `state.index` — unambiguous, because it owns the same array it reads
 * the index from. It used to be inferred here from whatever React Navigation
 * happened to hand a custom `tabBarButton` (`'aria-selected'` in v7,
 * `accessibilityState.selected` in v6, a `pathname` comparison as a last
 * resort) — three fallbacks for one boolean, and if a future version renamed
 * the prop again, every tab would go dark with nothing to say so. Rendering
 * the pills directly from `CustomTabBar` removes the need to guess at all.
 */
function PillTab({ icon: Icon, label, focused, onPress, onLongPress }) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    // The spring the "+" already uses, so the bar moves like the rest of the
    // app rather than in a dialect of its own.
    progress.value = withSpring(focused ? 1 : 0, BAR_SPRING);
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
      {/* `layout` es lo que hace que la píldora se abra hasta la etiqueta en
          vez de dar un salto el fotograma en que monta el texto. Va con el
          mismo muelle que el color de arriba y que la rotación del "+": antes
          era `LinearTransition.duration(220)`, una curva de tiempo corriendo a
          la vez que un muelle sobre el mismo gesto, y esa mezcla de dos
          movimientos distintos era justo lo que se veía como "raro" al cambiar
          de pestaña. Ahora todo lo que se mueve aquí se mueve igual. */}
      <Animated.View style={[styles.tabPill, pillStyle]} layout={BAR_LAYOUT}>
        <Icon
          size={22}
          color={focused ? tokens.colors.accent : tokens.colors.textDisabled}
          strokeWidth={focused ? 2.5 : 2}
        />
        {focused ? (
          <Animated.Text
            entering={FadeIn.duration(180)}
            // Sale más rápido de lo que entra a propósito: la píldora se cierra
            // sobre el texto, así que si el texto tardase lo mismo se le vería
            // aplastarse contra el borde. Yéndose antes, la píldora se cierra
            // sobre un hueco ya vacío.
            exiting={FadeOut.duration(110)}
            style={styles.tabLabel}
            numberOfLines={1}
          >
            {label}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

// Las cuatro pestañas reales, en orden de pantalla. `session_redirect` ya no
// aparece aquí — dejó de ser un carril inerte reservando hueco en el centro
// (ver el "+" más abajo) y no le queda ningún papel en la barra.
const REAL_TABS = [
  { name: 'index', icon: Home, label: 'Inicio' },
  { name: 'study', icon: BookOpen, label: 'Clase' },
  { name: 'plans', icon: MapIcon, label: 'Plan' },
  { name: 'profile', icon: User, label: 'Perfil' },
];

/**
 * La barra, a medida.
 *
 * React Navigation reparte por defecto sus carriles a partes iguales
 * (`styles.bottomItem = { flex: 1 }` en su propio código — comprobado en el
 * paquete instalado, no supuesto) salvo que cada pantalla diga lo contrario.
 * Con solo mover el "+" de sitio eso ya no alcanzaba: la etiqueta más ancha
 * ("Clase", 32,6px reales) necesita más sitio del que le tocaría en un
 * quinto — o incluso un cuarto — del ancho de la pantalla en la mayoría de
 * móviles Android reales. `services/tabBarLayout.js` tiene la aritmética
 * completa y `scripts/check-tab-bar.mjs` la comprueba en los siete anchos que
 * ya se han usado en esta conversación.
 *
 * Por eso esta barra no delega en `tabBarButton` por pantalla: dibuja las
 * cuatro píldoras ella misma, a su ancho de contenido, separadas por el hueco
 * que `tabGap()` reparte — nunca estiradas a un carril que no les pertenece,
 * pero tampoco apelotonadas dejando media barra vacía.
 */
function CustomTabBar({ state, descriptors, navigation }) {
  // El hueco entre pestañas sale del ancho real de la pantalla: es lo que
  // sobra del carril una vez colocadas las cuatro píldoras en su peor caso.
  // Así el grupo llena la barra en cualquier móvil en vez de dejar una zona
  // muerta, y la separación con el "+" se queda fija (ver tabBarLayout.js).
  //
  // Se calcula contra el peor caso, no contra la pestaña activa: si dependiera
  // de la activa, los huecos cambiarían de tamaño al cambiar de pantalla y se
  // recolocaría el grupo entero cada vez.
  const { width } = useWindowDimensions();
  const gap = tabGap(width);

  // El estilo de la barra puede venir de la pantalla activa —
  // app/dashboard/study.js le pone `display:'none'` mientras corre el
  // cronómetro. Con la barra por defecto de React Navigation eso ocurría
  // solo; con una barra propia hay que leerlo a mano, porque
  // `tabBar({state, descriptors, navigation, insets})` no trae el estilo ya
  // aplicado (comprobado en el código de `BottomTabView`, no supuesto).
  const focusedRoute = state.routes[state.index];
  const barStyle = descriptors[focusedRoute.key]?.options?.tabBarStyle || TAB_BAR_STYLE;

  return (
    <View style={[barStyle, styles.barRow, { gap }]}>
      {REAL_TABS.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const routeIndex = state.routes.indexOf(route);
        const focused = state.index === routeIndex;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <PillTab
            key={route.key}
            icon={tab.icon}
            label={tab.label}
            focused={focused}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </View>
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
  // El "+" vive fuera de <Tabs> (ver abajo), así que se coloca a mano en vez
  // de heredar el reparto de la barra: necesita el ancho real de la pantalla
  // para anclarse a su borde derecho.
  const { width: screenWidth } = useWindowDimensions();
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
      // `tabBarStyle` sigue siendo real: es lo que `CustomTabBar` lee como
      // estilo por defecto de la barra, y lo que app/dashboard/study.js
      // sobrescribe con `display:'none'` mientras corre el cronómetro.
      //
      // `tabBarActiveTintColor`/`tabBarInactiveTintColor`/`tabBarShowLabel`/
      // `tabBarItemStyle` se quitaron: eran para la barra por defecto de
      // React Navigation, que ya no se usa — `CustomTabBar` dibuja las
      // píldoras ella misma y no los lee.
      tabBarStyle: TAB_BAR_STYLE,
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

  /**
   * Estudiar hides the tab bar once the timer is running, but this button is
   * not in the tab bar — it floats over everything from here — so it stayed
   * put, offering a way out of the one screen built not to have one.
   *
   * Se lee aquí arriba, y no junto al resto de efectos del "+", porque
   * `fabPresence` (más abajo) lo usa para su valor inicial. Estaba declarado
   * después: un `const` leído antes de su declaración es un `ReferenceError`
   * en ejecución, así que el dashboard reventaba al montarse. Metro no lo
   * detecta — empaqueta sin quejarse y falla al abrir la app.
   */
  const sessionActive = useSessionStore((state) => state.sessionActive);

  // Drives both the icon's rotation and which way the press goes.
  const fabProgress = useSharedValue(0);
  useEffect(() => {
    fabProgress.value = withSpring(quickActionsVisible ? 1 : 0, BAR_SPRING);
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
   *  · al irse, era una curva lineal (`withTiming`) contra un muelle en la
   *    entrada — la misma asimetría que tenía el sheet de acciones rápidas
   *    antes de arreglarla: entrar se sentía vivo, salir se sentía mecánico al
   *    lado. Ahora también es un muelle, algo más amortiguado (ζ≈0,89) para
   *    seguir siendo rápido y no estorbar a la pantalla de sesión que viene
   *    detrás, pero sin dejar de ser el mismo tipo de movimiento que la entrada.
   *
   * La rotación del icono es independiente y no se toca: se compone con esta
   * porque vive en la vista de dentro.
   */
  const fabPresence = useSharedValue(sessionActive ? 0 : 1);
  useEffect(() => {
    fabPresence.value = sessionActive ? withSpring(0, FAB_EXIT_SPRING) : withSpring(1, BAR_SPRING);
  }, [sessionActive, fabPresence]);

  const fabPresenceStyle = useAnimatedStyle(() => ({
    // Los dos muelles se pasan de su meta un poco (comprobado con la física
    // real de Reanimated en scripts/check-fab-springs.mjs: entrar se pasa de
    // 1, salir se pasa de 0 hacia negativo) — recortado a los dos lados por
    // igual. La escala no hace falta recortarla: ese pequeño exceso es justo
    // el rebote que se busca, y por abajo el exceso de "salir" es tan
    // pequeño (~0,002) que no se nota.
    opacity: Math.max(0, Math.min(1, fabPresence.value)),
    transform: [{ scale: 0.6 + fabPresence.value * 0.4 }],
  }));

  const toggleQuickActions = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuickActionsVisible((open) => !open);
  };

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
      <Tabs screenOptions={screenOptions} tabBar={(props) => <CustomTabBar {...props} />}>
        {/* `options` ya no lleva `tabBarButton`: CustomTabBar dibuja las
            cuatro píldoras directamente (ver REAL_TABS más arriba), así que
            estas pantallas solo necesitan su `title` — sigue siendo lo que
            lee `descriptors[...].options.title` en cualquier sitio que lo
            use (p. ej. la cabecera antes de que `headerShown:false` la
            oculte, o un lector de pantalla). */}
        <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
        <Tabs.Screen
          name="study"
          options={{
            title: 'Clase',
            // The one tab that must keep running while it isn't on screen: it
            // owns the session timer.
            freezeOnBlur: false,
          }}
        />
        <Tabs.Screen name="plans" options={{ title: 'Plan' }} />
        <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
        {/* session_redirect ya no está: era un carril inerte reservando
            hueco en el centro para el "+" de antes. El "+" ya no vive dentro
            de esta lista — es un hermano fuera de <Tabs>, ver más abajo — así
            que no le queda ningún papel. La ruta sigue existiendo en
            app/dashboard/session_redirect.js por si algo la enlaza todavía,
            simplemente no aparece en la barra. */}
        {/* Hidden screens */}
        <Tabs.Screen name="ranks" options={{ href: null }} />
        <Tabs.Screen name="pau" options={{ href: null }} />
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

      {/* Sigue siendo un hermano fuera de <Tabs>, no una pestaña más — pero ya
          no por el sheet (en línea, ya no se le monta encima: el sheet para
          exactamente en el borde superior de la barra y el "+" no sobresale
          de ella). Sigue siendo necesario por lo de siempre: study.js oculta
          la barra entera (`tabBarStyle:{display:'none'}`) mientras corre el
          cronómetro, y este botón tiene que sobrevivir a eso — es la única
          salida de esa pantalla. */}
      {/* Durante la sesión el botón sigue montado pero es invisible: hay que
          quitarlo de los toques y del lector de pantalla a mano, porque
          Estudiar se construyó a propósito sin salida. */}
      <Animated.View
        style={[styles.fabSlot, { left: plusLeft(screenWidth) }, fabPresenceStyle]}
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
            <Plus size={22} color="#FFFFFF" strokeWidth={2.5} />
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
  // Ya no `flex:1`: las cuatro pestañas dejaron de repartirse en carriles
  // iguales y pasaron a ocupar su ancho natural, empaquetadas por
  // `CustomTabBar` — es lo que deja hueco de verdad para el + sin estirar
  // cada pestaña más de lo que su propio contenido pide.
  tabSlot: {
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
    // Con `flexShrink:0` en la etiqueta, esto es lo que la deja asomar a
    // medida que la píldora se abre. Sin los dos, el texto se comprimía dentro
    // de una píldora que todavía estaba creciendo y `numberOfLines={1}` lo
    // recortaba con puntos suspensivos fotograma a fotograma — "Cl…", "Clas…",
    // "Clase" — que es lo que se veía como entrecortado.
    overflow: 'hidden',
  },
  tabLabel: {
    fontFamily: tokens.typography.families.inter.semibold,
    fontSize: 12,
    color: tokens.colors.textPrimary,
    // Nunca se comprime: o cabe entera o la tapa el borde de la píldora. Ver
    // el `overflow` de arriba — los dos van juntos.
    flexShrink: 0,
  },
  // La barra a medida: fila simple, anclada a la izquierda con su margen. El
  // `gap` no está aquí — lo pone CustomTabBar a partir del ancho de la
  // pantalla, que es lo que hace que las cuatro llenen la barra en vez de
  // apelotonarse. Nada de paddingRight reservando hueco para el "+": es un
  // hermano aparte (más abajo), y services/tabBarLayout.js garantiza con
  // aritmética real que el grupo, en su peor caso, nunca llega a tocarlo.
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SIDE_MARGIN,
  },
  // El sitio que ocupa el botón, separado de su aspecto: la escala de entrada
  // y salida va aquí, para que el `scale: 0.92` de la pulsación siga viviendo
  // en el Pressable sin que uno pise al otro.
  //
  // Antes `alignSelf:'center'` lo centraba y `FAB_BOTTOM` lo elevaba por
  // encima de la barra (52dp, con un aro de recorte de 3dp para separarlo
  // visualmente del fondo que tapaba). Ahora vive dentro de la propia franja
  // de la barra, a la misma altura que cualquier píldora, y anclado al borde
  // derecho — el `left` real lo pone el componente con `plusLeft(ancho)`,
  // porque depende de la pantalla. Lo que fija la distancia con las pestañas
  // no es este anclaje sino el reparto del hueco entre ellas: ver `tabGap()`
  // en services/tabBarLayout.js.
  fabSlot: {
    position: 'absolute',
    bottom: plusBottomOffset(),
    width: PLUS_SIZE,
    height: PLUS_SIZE,
  },
  fab: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

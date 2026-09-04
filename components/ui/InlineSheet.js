import { useEffect } from 'react';
import { View, Pressable, StyleSheet, Dimensions, Keyboard, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { ScrollView } from 'react-native-gesture-handler';
import { tokens } from '../../theme/tokens';
import { TAB_BAR_HEIGHT, TAB_BAR_PADDING_BOTTOM } from '../../services/tabBarLayout';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const KEYBOARD_SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const KEYBOARD_HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

// Los números en sí viven en services/tabBarLayout.js — puro, sin React
// Native, para que scripts/check-tab-bar.mjs los pueda comprobar de verdad.
// Reexportados aquí porque QuickActionsModal y GuidedTour ya los importaban
// desde este fichero.
export { TAB_BAR_HEIGHT, TAB_BAR_PADDING_BOTTOM };

/**
 * El aspecto de la barra, en un solo sitio.
 *
 * Estaba escrito entero dos veces: en `screenOptions` del layout y otra vez en
 * app/dashboard/study.js, que rehace `tabBarStyle` al salir del cronómetro
 * porque durante la sesión la esconde. Las dos copias tenían que coincidir
 * exactamente o la barra daba un salto al volver, y nada lo garantizaba.
 */
export const TAB_BAR_STYLE = {
  height: TAB_BAR_HEIGHT,
  paddingBottom: TAB_BAR_PADDING_BOTTOM,
  backgroundColor: tokens.colors.surfaceCard,
  elevation: 0,
  // Separador de un pelo en vez de sombra: el rediseño es plano.
  borderTopWidth: 1,
  borderTopColor: tokens.colors.borderDefault,
  shadowColor: 'transparent',
  shadowOpacity: 0,
};

/**
 * A sheet that stops above the tab bar instead of covering it.
 *
 * `BottomSheet` is built on React Native's `Modal`, which draws into its own
 * native window on top of everything — so it can never leave the tab bar or
 * the centre button visible, no matter how it's styled. That isn't a styling
 * choice to undo; it's why the quick-actions sheet swallowed the whole bottom
 * of the app. This one is an ordinary absolutely-positioned View inside the
 * tabs layout, so the bar stays lit and the "+" stays where it was.
 *
 * `bottomOffset` is how much room to leave at the bottom — the tab bar's
 * height. The scrim stops at the same line for the same reason.
 *
 * The keyboard is tracked by hand and the sheet lifted over it, the same as
 * `BottomSheet`: this used to lean on the activity's resize, but Expo's
 * edge-to-edge stops that resize from reaching the JS layout.
 */
export default function InlineSheet({ visible, onClose, bottomOffset = 0, children }) {
  const progress = useSharedValue(0);
  // The sheet is an ordinary in-activity View, so it was left to rely on the
  // activity's own keyboard resize. Under Expo's edge-to-edge that resize no
  // longer shrinks the JS layout, so the keyboard covered the note and grade
  // fields. Tracking it directly and lifting the sheet — the same thing
  // BottomSheet does — works regardless of that.
  const keyboardShift = useSharedValue(0);

  useEffect(() => {
    // Antes el cierre usaba `withTiming` (una curva lineal) contra un muelle
    // en la apertura — la asimetría se notaba: abrir se sentía orgánico,
    // cerrar se sentía mecánico al lado. Ahora las dos direcciones son el
    // mismo tipo de movimiento; el cierre lleva más amortiguación y rigidez
    // para seguir siendo rápido y decidido, no para parecer un rebote.
    progress.value = visible
      ? withSpring(1, { damping: 22, stiffness: 240, mass: 0.7 })
      : withSpring(0, { damping: 28, stiffness: 300, mass: 0.7 });
  }, [visible, progress]);

  useEffect(() => {
    if (!visible) return;

    const onShow = (event) => {
      const height = event?.endCoordinates?.height ?? 0;
      // The sheet already sits `bottomOffset` (the tab bar) above the screen
      // edge, and the keyboard covers that bar — only the overlap beyond it
      // needs compensating.
      const overlap = Math.max(0, height - bottomOffset);
      keyboardShift.value = withTiming(-overlap, {
        duration: event?.duration || 220,
        easing: Easing.out(Easing.cubic),
      });
    };
    const onHide = (event) => {
      keyboardShift.value = withTiming(0, {
        duration: event?.duration || 200,
        easing: Easing.out(Easing.cubic),
      });
    };

    const showSub = Keyboard.addListener(KEYBOARD_SHOW_EVENT, onShow);
    const hideSub = Keyboard.addListener(KEYBOARD_HIDE_EVENT, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, bottomOffset, keyboardShift]);

  // Translated by a fixed large distance rather than by measured height: the
  // sheet's content changes between views (five actions, a note field, a grade
  // form) and re-measuring mid-animation made it jump.
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (SCREEN_HEIGHT * 0.6) + keyboardShift.value }],
    opacity: progress.value === 0 ? 0 : 1,
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.55 }));

  // No early return on a closed sheet: unmounting would need `progress.value`
  // read during render, which Reanimated warns about, and it would cut the
  // closing animation short anyway. `pointerEvents` is what makes it inert.
  return (
    <>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.scrim, { bottom: bottomOffset }, scrimStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
      </Animated.View>

      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.sheet, { bottom: bottomOffset }, sheetStyle]}
      >
        <View style={styles.grab} />
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.body}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Capped so a tall view (the grade form with the keyboard up) can never
    // grow into a full-screen takeover — the point of this sheet is that the
    // app stays visible behind it.
    //
    // Raised from 0.6: the six quick actions didn't fit, so the main view
    // opened already scrollable. A sheet you have to scroll to see the last
    // option hides it, and the scroll fights the swipe-down anyone expects
    // from the grab handle. A quarter of the screen plus the tab bar is still
    // plenty to keep the app present behind it.
    maxHeight: SCREEN_HEIGHT * 0.75,
    backgroundColor: tokens.colors.background,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
    borderTopLeftRadius: tokens.radius.sheet,
    borderTopRightRadius: tokens.radius.sheet,
    paddingTop: 10,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.borderDefault,
    alignSelf: 'center',
    marginBottom: 12,
  },
  body: {
    paddingHorizontal: 20,
    // Era 32: compensaba el "+" elevado, que sobresalía por encima de la
    // barra y se montaba sobre el borde inferior del sheet. En línea ya no
    // sobresale por ningún lado — este es aire de cortesía para la última
    // fila, a juego con el paddingHorizontal.
    paddingBottom: 20,
  },
});

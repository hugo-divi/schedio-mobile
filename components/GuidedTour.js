import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react-native';
import Svg, { Defs, Mask, Rect as SvgRect } from 'react-native-svg';
import { tokens } from '../theme/tokens';
import { buildSteps, cardTopFor } from '../services/tour';
import { TAB_BAR_HEIGHT } from './ui/InlineSheet';

const font = tokens.typography.families.inter;

const GuidedTour = ({
  onComplete,
  tourRefs = {},
  hasPendingExams = false,
  onboardingGoalName = null,
}) => {
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [maskRect, setMaskRect] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // El inicializador de useState corre una sola vez: los pasos quedan fijados
  // con los datos que había al abrir el tour y ya no cambian de longitud.
  const [steps] = useState(() => buildSteps({ hasPendingExams, onboardingGoalName }));

  // Se lee en cada render, no al importar el modulo: antes era
  // `Dimensions.get('window')` a nivel de fichero, capturado una sola vez, asi
  // que rotar el movil o abrir pantalla dividida dejaba todas las posiciones
  // calculadas sobre un alto que ya no era el de la pantalla.
  const { width, height } = useWindowDimensions();
  const [cardHeight, setCardHeight] = useState(0);

  // Toda la aritmetica vive en services/tour.js para poder comprobarla en Node
  // (scripts/check-tour.mjs); aqui solo se le pasan las medidas del momento.
  const cardTop = useMemo(
    () => cardTopFor({ maskRect, cardHeight, screenHeight: height, tabBarHeight: TAB_BAR_HEIGHT }),
    [maskRect, cardHeight, height]
  );

  const isLastStep = step === steps.length - 1;

  const runFadeIn = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start(() => setIsTransitioning(false));
  };

  /**
   * Los `setTimeout` que quedasen vivos al cerrar el tour seguian corriendo y
   * llamaban a `setMaskRect` / `setIsTransitioning` sobre un componente ya
   * desmontado. Se guardan aqui para poder cancelarlos.
   */
  const timers = useRef([]);
  const later = (fn, ms) => {
    timers.current.push(setTimeout(fn, ms));
  };

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    []
  );

  const performStepLogic = (currentStepConfig) => {
    // Ya no se hace `router.push('/dashboard')`. El tour se renderiza desde
    // Inicio, o sea que la pantalla ya es esa: cada push apilaba otra entrada
    // identica y, tras seis pasos, hacian falta seis toques del boton atras de
    // Android para salir del dashboard.
    const target = currentStepConfig.refKey ? tourRefs[currentStepConfig.refKey]?.current : null;
    const scroller = tourRefs.scrollViewRef?.current;

    // Paso sin resaltado, o con un ref que aun no esta montado: solo se
    // oscurece la pantalla.
    if (!target || !scroller) {
      setMaskRect(null);
      runFadeIn();
      return;
    }

    // El encadenado es: dejar que el layout se asiente (100 ms), medir donde
    // esta el elemento dentro del scroll, desplazarse hasta el, esperar a que
    // ese desplazamiento termine (400 ms) y recien entonces medirlo en
    // coordenadas de pantalla, que es lo que necesita la mascara.
    later(() => {
      target.measureLayout(
        scroller,
        (x, y) => {
          scroller.scrollTo({ y: Math.max(0, y - 100), animated: true });
          later(() => {
            const current = tourRefs[currentStepConfig.refKey]?.current;
            if (!current) {
              setMaskRect(null);
              runFadeIn();
              return;
            }
            current.measure((fx, fy, w, h, px, py) => {
              setMaskRect({ x: px, y: py, width: w, height: h });
              runFadeIn();
            });
          }, 400);
        },
        () => {
          // measureLayout fallando dejaba el paso sin resaltado y sin rastro.
          // Sigue sin resaltado, porque no hay nada mejor que hacer, pero al
          // menos queda constancia de por que.
          console.warn('GuidedTour: no se pudo medir', currentStepConfig.refKey);
          setMaskRect(null);
          runFadeIn();
        }
      );
    }, 100);
  };

  useEffect(() => {
    if (step === 0) performStepLogic(steps[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Cambio de paso: se desvanece, se mueve el indice y se recoloca. */
  const goToStep = (nextIndex) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextIndex);
      performStepLogic(steps[nextIndex]);
    });
  };

  const handleNext = () => {
    if (isTransitioning) return;
    if (isLastStep) {
      onComplete();
      return;
    }
    goToStep(step + 1);
  };

  // Volver atras: lo mismo que pediste para el mini onboarding de Planes.
  // Saltarse un paso sin querer dejaba de tener arreglo.
  const handleBack = () => {
    if (step > 0) goToStep(step - 1);
  };

  // Antes esto se ramificaba por `steps[step].route`, que ya no existe en
  // ningun paso: la rama "clara" no se pintaba nunca.
  const dimOpacity = Platform.OS === 'web' ? 0.75 : 0.65;

  return (
    // `onRequestClose` es obligatorio en Android para que el boton atras
    // fisico haga algo. Sin el, durante el tour no respondia a nada.
    <Modal transparent visible animationType="fade" onRequestClose={onComplete}>
      <View style={StyleSheet.absoluteFill}>
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="spotlight">
              <SvgRect x="0" y="0" width="100%" height="100%" fill="white" />
              {maskRect && (
                <SvgRect
                  x={maskRect.x - 8}
                  y={maskRect.y - 8}
                  width={maskRect.width + 16}
                  height={maskRect.height + 16}
                  fill="black"
                  rx={16}
                  ry={16}
                />
              )}
            </Mask>
          </Defs>
          <SvgRect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`rgba(6, 7, 13, ${dimOpacity})`}
            mask="url(#spotlight)"
          />
          {maskRect && (
            <SvgRect
              x={maskRect.x - 8}
              y={maskRect.y - 8}
              width={maskRect.width + 16}
              height={maskRect.height + 16}
              fill="transparent"
              stroke={tokens.colors.accent}
              strokeWidth="2"
              rx={16}
              ry={16}
            />
          )}
        </Svg>

        <Animated.View
          style={[styles.contentContainer, { opacity: fadeAnim, top: cardTop, width: width - 48 }]}
        >
          <View
            style={styles.card}
            onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
          >
            <View style={styles.header}>
              <View style={styles.badge}>
                <Sparkles size={16} color={tokens.colors.accent} strokeWidth={2} />
              </View>
              <TouchableOpacity
                onPress={onComplete}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Cerrar el tour"
              >
                <X size={20} color={tokens.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.title}>{steps[step].title}</Text>
            <Text style={styles.text}>{steps[step].content}</Text>

            <View style={styles.footer}>
              {/* Se reserva el hueco en el primer paso en vez de esconder el
                  boton, para que los puntos no salten de sitio al avanzar. */}
              <TouchableOpacity
                style={[styles.backBtn, step === 0 && styles.backBtnHidden]}
                onPress={handleBack}
                disabled={step === 0}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Paso anterior"
              >
                <ChevronLeft size={20} color={tokens.colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.dots}>
                {steps.map((stepConfig, i) => (
                  <View key={stepConfig.key} style={[styles.dot, i === step && styles.activeDot]} />
                ))}
              </View>

              <TouchableOpacity
                style={styles.nextBtn}
                onPress={handleNext}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.nextBtnText}>{isLastStep ? 'Entendido' : 'Siguiente'}</Text>
                <ChevronRight size={18} color="#FFFFFF" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default GuidedTour;

const styles = StyleSheet.create({
  contentContainer: {
    // `top` y `width` llegan en linea: dependen de la pantalla y del elemento
    // resaltado, asi que no pueden vivir en una hoja de estilos estatica.
    alignSelf: 'center',
    position: 'absolute',
    zIndex: 100,
  },
  card: {
    padding: 20,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  badge: {
    width: 30,
    height: 30,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: font.bold,
    fontSize: 19,
    color: tokens.colors.textPrimary,
    marginBottom: 8,
  },
  text: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    marginBottom: 22,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnHidden: {
    opacity: 0,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.borderDefault,
  },
  activeDot: {
    width: 16,
    backgroundColor: tokens.colors.accent,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: tokens.colors.accent,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: tokens.radius.btn,
  },
  nextBtnText: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: '#FFFFFF',
  },
});

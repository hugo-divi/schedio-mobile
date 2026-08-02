import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { ChevronRight, X, Sparkles } from 'lucide-react-native';
import Svg, { Defs, Mask, Rect as SvgRect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { tokens } from '../theme/tokens';

const { width, height } = Dimensions.get('window');
const font = tokens.typography.families.inter;

/**
 * Coach marks over the real app, in the flat design language — no more
 * GlassCard blur, which was the last screen still drawing it. Content
 * rewritten against the app as it stands now: the stats strip opens the rank
 * ladder rather than a modal that no longer exists, the calendar section
 * covers exams and tasks together, and the central "+" button, the Mochila
 * tab and the profile's real analysis — none of which existed when this tour
 * was last written — each get their own step.
 */
const GuidedTour = ({ onComplete, tourRefs = {}, hasPendingExams = false }) => {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [maskRect, setMaskRect] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const baseSteps = [
    {
      title: 'Bienvenido a Schedio',
      content: 'Un minuto y ya sabes moverte. Empezamos por tu pantalla de Inicio.',
      position: { top: height * 0.35 },
      refKey: null,
    },
    {
      title: 'Racha, nivel y media',
      content:
        'Cada sesión de estudio suma XP y mantiene viva tu racha. Toca tu nivel para ver el camino completo hasta el siguiente rango.',
      position: { top: height * 0.62 },
      refKey: 'statsStripRef',
    },
    {
      title: 'Tu día, resumido',
      content:
        'Una sugerencia pensada para hoy, y un botón para empezar a estudiar sin más vueltas.',
      position: { top: height * 0.62 },
      refKey: 'heroCardRef',
    },
  ];

  if (hasPendingExams) {
    baseSteps.push({
      title: 'Por calificar',
      content: 'Pon nota a los exámenes que ya has hecho: es lo que alimenta tu media.',
      position: { top: height * 0.1 },
      refKey: 'pendingSectionRef',
    });
  }

  baseSteps.push({
    title: 'Tu calendario',
    content:
      'El mes de un vistazo, con lo próximo justo debajo. Mantén pulsado un examen para editarlo, o tócalo para verlo en tu plan.',
    position: { top: height * 0.1 },
    refKey: 'calendarSectionRef',
  });

  baseSteps.push({
    title: 'El botón del centro',
    content:
      'Añadir un examen, calificar uno, apuntar algo rápido, subir un archivo a tu mochila o empezar a estudiar — todo a un toque, desde cualquier pantalla.',
    position: { top: height * 0.3 },
    refKey: null,
  });

  baseSteps.push(
    {
      title: 'Estudiar con foco',
      content: 'Elige materia y tiempo, y el cronómetro se encarga. Cada sesión suma XP.',
      position: { top: height * 0.15 },
      refKey: null,
      route: '/dashboard/study',
    },
    {
      title: 'Plan y Mochila',
      content:
        'Tu semana repartida por materia y prioridad. En la pestaña Mochila guardas apuntes y archivos, agrupados por materia.',
      position: { top: height * 0.15 },
      refKey: null,
      route: '/dashboard/plans',
    },
    {
      title: 'Tu perfil',
      content:
        'Nivel, materias con su color, apuntes rápidos y un análisis real de tus hábitos de estudio. El engranaje de arriba lleva a Ajustes.',
      position: { top: height * 0.15 },
      refKey: null,
      route: '/dashboard/profile',
    }
  );

  const steps = baseSteps;
  const isLastStep = step === steps.length - 1;

  const runFadeIn = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start(() => setIsTransitioning(false));
  };

  const performStepLogic = (currentStepConfig) => {
    if (currentStepConfig.route) {
      setMaskRect(null);
      router.push(currentStepConfig.route);
      setTimeout(runFadeIn, 300);
      return;
    }

    if (
      currentStepConfig.refKey &&
      tourRefs[currentStepConfig.refKey]?.current &&
      tourRefs.scrollViewRef?.current
    ) {
      router.push('/dashboard');
      setTimeout(() => {
        tourRefs[currentStepConfig.refKey].current.measureLayout(
          tourRefs.scrollViewRef.current,
          (x, y, w, h) => {
            tourRefs.scrollViewRef.current.scrollTo({ y: Math.max(0, y - 100), animated: true });
            setTimeout(() => {
              if (tourRefs[currentStepConfig.refKey]?.current) {
                tourRefs[currentStepConfig.refKey].current.measure((fx, fy, w2, h2, px, py) => {
                  setMaskRect({ x: px, y: py, width: w2, height: h2 });
                  runFadeIn();
                });
              }
            }, 400);
          },
          () => {
            setMaskRect(null);
            runFadeIn();
          }
        );
      }, 100);
    } else {
      router.push('/dashboard');
      setMaskRect(null);
      runFadeIn();
    }
  };

  useEffect(() => {
    if (step === 0) performStepLogic(steps[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNext = () => {
    if (isTransitioning) return;

    if (!isLastStep) {
      setIsTransitioning(true);
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setStep(step + 1);
        performStepLogic(steps[step + 1]);
      });
    } else {
      router.push('/dashboard');
      onComplete();
    }
  };

  const dimOpacity = steps[step].route
    ? Platform.OS === 'web'
      ? 0.55
      : 0.4
    : Platform.OS === 'web'
      ? 0.75
      : 0.65;

  return (
    <Modal transparent visible animationType="fade">
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
          style={[styles.contentContainer, { opacity: fadeAnim }, steps[step].position]}
        >
          <View style={styles.card}>
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
              <View style={styles.dots}>
                {steps.map((_, i) => (
                  <View key={i} style={[styles.dot, i === step && styles.activeDot]} />
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
    width: width - 48,
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

import React, { useState, useEffect, useRef } from 'react';
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
import { GlassCard } from './GlassView';

const { width, height } = Dimensions.get('window');

const GuidedTour = ({ onComplete, tourRefs = {}, hasPendingExams = false }) => {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [maskRect, setMaskRect] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const baseSteps = [
    {
      title: '¡Bienvenido a Schedio! 🚀',
      content:
        'Tu nuevo aliado para dominar tus estudios. Vamos a darte un minitour rápido por tus herramientas.',
      position: { top: height * 0.3 },
      refKey: null,
    },
    {
      title: 'El Hub de Control 🧠',
      content: 'Aquí verás la sugerencia de nuestra IA para hoy, y arriba tu racha y tu nivel.',
      position: { top: height * 0.65 },
      refKey: 'heroCardRef',
    },
  ];

  if (hasPendingExams) {
    baseSteps.push({
      title: 'Pendientes de Calificar ✍️',
      content: 'Asegúrate de poner nota a los exámenes que ya pasaron para calcular tu media.',
      position: { top: height * 0.1 },
      refKey: 'pendingSectionRef',
    });
  }

  // Calendar and upcoming exams now share one card, so this is a single step.
  baseSteps.push({
    title: 'Tu Calendario 🗓️',
    content:
      'Tu mes de un vistazo, con los próximos exámenes justo debajo. Mantén pulsado un examen para editarlo.',
    position: { top: height * 0.1 },
    refKey: 'calendarSectionRef',
  });

  baseSteps.push(
    {
      title: 'Estudiar con Foco ⚡',
      content:
        'Inicia sesiones de estudio enfocadas. Aquí ganarás XP y mantendrás viva tu racha estudiando al menos 5 minutos al día.',
      position: { top: height * 0.15 },
      refKey: null,
      route: '/dashboard/study',
    },
    {
      title: 'Tus Planes 🗺️',
      content:
        'Aquí Schedio crea automáticamente un plan de estudio diario para cada uno de tus exámenes basado en su dificultad y fecha.',
      position: { top: height * 0.15 },
      refKey: null,
      route: '/dashboard/plans',
    },
    {
      title: 'Tu Perfil 👤',
      content: 'Revisa tu nivel, elige los colores de tus asignaturas y ajusta tus preferencias.',
      position: { top: height * 0.15 },
      refKey: null,
      route: '/dashboard/profile',
    }
  );

  const steps = baseSteps;

  const performStepLogic = (currentStepConfig) => {
    // If it navigates
    if (currentStepConfig.route) {
      setMaskRect(null);
      router.push(currentStepConfig.route);
      // Animate in after a short delay for navigation
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setIsTransitioning(false));
      }, 300);
      return;
    }

    // If it scrolls on Dashboard
    if (
      currentStepConfig.refKey &&
      tourRefs[currentStepConfig.refKey]?.current &&
      tourRefs.scrollViewRef?.current
    ) {
      router.push('/dashboard'); // Ensure we are on dashboard
      setTimeout(() => {
        tourRefs[currentStepConfig.refKey].current.measureLayout(
          tourRefs.scrollViewRef.current,
          (x, y, w, h) => {
            // Scroll it into view (with a little offset)
            tourRefs.scrollViewRef.current.scrollTo({ y: Math.max(0, y - 100), animated: true });

            // Wait for scroll animation to finish before measuring absolute position
            setTimeout(() => {
              if (tourRefs[currentStepConfig.refKey]?.current) {
                tourRefs[currentStepConfig.refKey].current.measure(
                  (fx, fy, width, height, px, py) => {
                    setMaskRect({ x: px, y: py, width, height });
                    Animated.timing(fadeAnim, {
                      toValue: 1,
                      duration: 400,
                      useNativeDriver: true,
                    }).start(() => setIsTransitioning(false));
                  }
                );
              }
            }, 400); // Wait 400ms for scrolling to settle
          },
          () => {
            // fallback if measure fails
            setMaskRect(null);
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }).start(() => setIsTransitioning(false));
          }
        );
      }, 100);
    } else {
      // General step (no specific ref)
      router.push('/dashboard'); // Ensure we are on dashboard
      setMaskRect(null);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setIsTransitioning(false));
    }
  };

  useEffect(() => {
    // Initial setup for first step
    if (step === 0) {
      performStepLogic(steps[0]);
    }
  }, []);

  const handleNext = () => {
    if (isTransitioning) return;

    if (step < steps.length - 1) {
      setIsTransitioning(true);
      // Fade out current content
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // Once faded out, change step and perform new logic
        setStep(step + 1);
        performStepLogic(steps[step + 1]);
      });
    } else {
      // End of tour
      router.push('/dashboard');
      onComplete();
    }
  };

  return (
    <Modal transparent visible={true} animationType="fade">
      <View style={StyleSheet.absoluteFill}>
        {/* SVG Spotlight Overlay */}
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
            fill={
              steps[step].route
                ? Platform.OS === 'web'
                  ? 'rgba(0,0,0,0.6)'
                  : 'rgba(0,0,0,0.4)'
                : Platform.OS === 'web'
                  ? 'rgba(0,0,0,0.85)'
                  : 'rgba(0,0,0,0.75)'
            }
            mask="url(#spotlight)"
          />

          {/* Add a subtle glowing border around the cutout */}
          {maskRect && (
            <SvgRect
              x={maskRect.x - 8}
              y={maskRect.y - 8}
              width={maskRect.width + 16}
              height={maskRect.height + 16}
              fill="transparent"
              stroke={tokens.colors.primary}
              strokeWidth="2"
              rx={16}
              ry={16}
            />
          )}
        </Svg>

        <Animated.View
          style={[
            styles.contentContainer,
            { opacity: fadeAnim },
            // Conditional positioning based on step configuration
            steps[step].position,
          ]}
        >
          <GlassCard style={styles.card}>
            <View style={styles.header}>
              <Sparkles size={24} color={tokens.colors.primary} />
              <TouchableOpacity onPress={onComplete}>
                <X size={24} color={tokens.colors.textSecondary} />
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

              <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
                <Text style={styles.nextBtnText}>
                  {step === steps.length - 1 ? '¡Entendido!' : 'Siguiente'}
                </Text>
                <ChevronRight size={20} color="#000" />
              </TouchableOpacity>
            </View>
          </GlassCard>
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
    padding: 24,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 12,
  },
  text: {
    fontSize: 16,
    color: tokens.colors.textSecondary,
    lineHeight: 24,
    marginBottom: 32,
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
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  activeDot: {
    width: 14,
    backgroundColor: tokens.colors.primary,
  },
  nextBtn: {
    backgroundColor: tokens.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 4,
  },
  nextBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

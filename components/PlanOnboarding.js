import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInRight, FadeIn } from 'react-native-reanimated';
import { ChevronLeft, ArrowRight, Flame, Target, Check } from 'lucide-react-native';

import { tokens } from '../theme/tokens';
import { PLAN_QUESTIONS } from '../services/planProfile';
import Button from './ui/Button';

const font = tokens.typography.families.inter;

/**
 * La primera entrada a Planes.
 *
 * Tres preguntas y dos envíos, y **el orden importa**: las preguntas van
 * primero, así que si el alumno lo abandona en el paso 4 el algoritmo ya tiene
 * todo lo que necesita. Los pasos que lo mandan fuera de aquí — a la racha y a
 * sus materias — van al final y los dos llevan "Ahora no", porque quien sale
 * del flujo muchas veces no vuelve.
 *
 * Cada pregunta sustituye una constante que era igual para todo el mundo; el
 * mapeo y su porqué están en services/planProfile.js, aparte para poder
 * comprobarlo en Node (scripts/check-plan-profile.mjs).
 */
export default function PlanOnboarding({ onFinish, onOpenStreak, onOpenSubjects }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});

  const total = PLAN_QUESTIONS.length + 2;
  const isQuestion = step < PLAN_QUESTIONS.length;
  const question = isQuestion ? PLAN_QUESTIONS[step] : null;
  const picked = question ? answers[question.key] : null;

  const back = () => setStep((s) => Math.max(0, s - 1));

  /**
   * Se guarda al terminar la última pregunta, no al final del flujo: los dos
   * pasos que quedan mandan al alumno a otra pantalla, y desde allí puede no
   * volver. Lo que mueve el algoritmo ya está a salvo antes de que exista esa
   * posibilidad.
   */
  const answerAndAdvance = () => {
    const next = step + 1;
    if (next === PLAN_QUESTIONS.length) onFinish?.(answers, { done: false });
    setStep(next);
  };

  const pick = (index) => setAnswers((prev) => ({ ...prev, [question.key]: index }));

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.head}>
        {step > 0 && step < total ? (
          <TouchableOpacity
            onPress={back}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Atrás"
          >
            <ChevronLeft size={20} color={tokens.colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
        <View style={styles.dots}>
          {Array.from({ length: total }, (_, i) => (
            <View
              key={i}
              style={[styles.dot, i === step && styles.dotOn, i < step && styles.dotPast]}
            />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {isQuestion ? (
          <Animated.View key={step} entering={FadeInRight.duration(280)}>
            <Text style={styles.kicker}>
              {step + 1} DE {total}
            </Text>
            <Text style={styles.question}>{question.question}</Text>
            <Text style={styles.hint}>{question.hint}</Text>

            <View style={styles.options}>
              {question.options.map((option, index) => {
                const on = picked === index;
                return (
                  <TouchableOpacity
                    key={option.label}
                    onPress={() => pick(index)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.option, on && styles.optionOn]}
                  >
                    <View style={[styles.radio, on && styles.radioOn]}>
                      {on ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    {option.note ? (
                      <Text style={[styles.optionNote, on && styles.optionNoteOn]}>
                        {option.note}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        ) : step === PLAN_QUESTIONS.length ? (
          <Animated.View key="racha" entering={FadeInRight.duration(280)}>
            <Text style={styles.kicker}>
              {step + 1} DE {total}
            </Text>
            <Text style={styles.question}>Tu racha</Text>
            <Text style={styles.hint}>Antes de empezar, echa un vistazo a cómo funciona.</Text>

            <View style={styles.handoff}>
              <View style={[styles.handoffIcon, styles.tintAccent]}>
                <Flame size={17} color={tokens.colors.accent} />
              </View>
              <Text style={styles.handoffTitle}>Elige tus días libres</Text>
              {/* Ojo con esta copia: el planificador ya NO salta ningún día.
                  Los días libres solo deciden que no pase nada si ese día no
                  cumples — decirle aquí que el plan no le pondrá sesiones sería
                  mentirle, y lo vería al día siguiente. */}
              <Text style={styles.handoffBody}>
                El plan te seguirá proponiendo tareas esos días por si quieres adelantar, pero no
                cuentan para la racha: si no las haces, no pasa nada. Por defecto son{' '}
                <Text style={styles.handoffStrong}>sábado y domingo</Text>, y los cambias cuando
                quieras.
              </Text>
            </View>
          </Animated.View>
        ) : step === PLAN_QUESTIONS.length + 1 ? (
          <Animated.View key="nota" entering={FadeInRight.duration(280)}>
            <Text style={styles.kicker}>
              {step + 1} DE {total}
            </Text>
            <Text style={styles.question}>¿Qué nota quieres sacar?</Text>
            <Text style={styles.hint}>
              En cada asignatura. No es lo mismo aprobar que ir a por un nueve.
            </Text>

            <View style={styles.handoff}>
              <View style={[styles.handoffIcon, styles.tintGold]}>
                <Target size={17} color={tokens.colors.premiumText} />
              </View>
              <Text style={styles.handoffTitle}>
                Está en <Text style={styles.handoffGold}>Perfil → Materias</Text>
              </Text>
              <Text style={styles.handoffBody}>
                Abre cada asignatura y mueve el deslizador hasta la nota que quieres. El plan
                reparte el tiempo según lo lejos que estés: si te conformas con aprobar Filosofía,
                deja de pedirte trabajo como si fueras a por matrícula.
                {'\n\n'}
                <Text style={styles.handoffStrong}>Puedes cambiarlo durante el curso</Text>: en
                octubre nadie sabe lo que le va a costar Física.
              </Text>
            </View>
          </Animated.View>
        ) : (
          <Animated.View key="fin" entering={FadeIn.duration(320)} style={styles.done}>
            <View style={styles.doneRing}>
              <Check size={30} color={tokens.colors.accent} strokeWidth={2.5} />
            </View>
            <Text style={styles.doneBig}>Listo</Text>
            <Text style={styles.doneTitle}>Tu plan ya está ajustado a ti</Text>
            <Text style={styles.doneBody}>
              Puedes cambiar cualquiera de estas respuestas en tu perfil cuando quieras.
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
        {isQuestion ? (
          <Button
            title="Siguiente"
            fullWidth
            disabled={picked === undefined || picked === null}
            onPress={answerAndAdvance}
            icon={<ArrowRight size={16} color="#FFFFFF" />}
          />
        ) : step === PLAN_QUESTIONS.length ? (
          <>
            <Button
              title="Ver cómo funciona"
              fullWidth
              // Avanza ANTES de salir: la pantalla de racha se apila encima,
              // asi que al volver atras se cae aqui otra vez. Dejandolo ya en
              // el paso siguiente, volver continua el flujo en vez de repetir
              // el mismo envio.
              onPress={() => {
                setStep(step + 1);
                onOpenStreak?.();
              }}
              icon={<ArrowRight size={16} color="#FFFFFF" />}
            />
            <SkipLink label="Ahora no" onPress={() => setStep(step + 1)} />
          </>
        ) : step === PLAN_QUESTIONS.length + 1 ? (
          <>
            <Button
              title="Ir a mis materias"
              fullWidth
              onPress={() => onOpenSubjects?.()}
              icon={<ArrowRight size={16} color="#FFFFFF" />}
            />
            <SkipLink label="Ahora no" onPress={() => setStep(step + 1)} />
          </>
        ) : (
          <Button
            title="Ver mi plan"
            fullWidth
            onPress={() => onFinish?.(answers, { done: true })}
            icon={<ArrowRight size={16} color="#FFFFFF" />}
          />
        )}
      </View>
    </View>
  );
}

function SkipLink({ label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.skip} accessibilityRole="button">
      <Text style={styles.skipText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  backButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flex: 1,
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    flex: 1,
    height: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.surfaceHover,
  },
  dotOn: {
    backgroundColor: tokens.colors.accent,
  },
  dotPast: {
    backgroundColor: tokens.colors.textDisabled,
  },
  body: {
    paddingHorizontal: 20,
    flexGrow: 1,
  },

  kicker: {
    fontFamily: font.semibold,
    fontSize: 10,
    letterSpacing: 1.1,
    color: tokens.colors.accent,
    marginBottom: 9,
  },
  question: {
    fontFamily: font.semibold,
    fontSize: 21,
    lineHeight: 27,
    color: tokens.colors.textPrimary,
    marginBottom: 7,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
    marginBottom: 20,
  },

  options: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionOn: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: tokens.colors.textDisabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: tokens.colors.accent,
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accent,
  },
  optionLabel: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 14,
    color: tokens.colors.textPrimary,
  },
  optionNote: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: tokens.colors.textDisabled,
  },
  optionNoteOn: {
    color: tokens.colors.accent,
  },

  handoff: {
    backgroundColor: tokens.colors.surfaceCard,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    padding: 16,
  },
  handoffIcon: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },
  tintAccent: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  tintGold: {
    backgroundColor: 'rgba(212, 169, 76, 0.12)',
    borderColor: 'rgba(212, 169, 76, 0.3)',
  },
  handoffTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    marginBottom: 6,
  },
  handoffGold: {
    color: tokens.colors.premiumText,
  },
  handoffBody: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
  },
  handoffStrong: {
    fontFamily: font.medium,
    color: tokens.colors.textPrimary,
  },

  done: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  doneRing: {
    width: 74,
    height: 74,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1.5,
    borderColor: tokens.colors.accentSoftBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  doneBig: {
    fontFamily: tokens.typography.families.display,
    fontSize: 44,
    lineHeight: 46,
    color: tokens.colors.accent,
  },
  doneTitle: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: tokens.colors.textPrimary,
  },
  doneBody: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },

  foot: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 4,
  },
  skip: {
    alignItems: 'center',
    paddingVertical: 11,
  },
  skipText: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: tokens.colors.textDisabled,
    textDecorationLine: 'underline',
  },
});

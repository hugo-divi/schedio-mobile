import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { tokens } from '../theme/tokens';
import Card from './ui/Card';
import { Emoji } from './ui/Emoji';
import {
  RHYTHMS,
  RHYTHM_LABELS,
  RHYTHM_ORDER,
  WORK_BOUNDS,
  REST_BOUNDS,
  BLOCK_BOUNDS,
  CONTINUO_BOUNDS,
  isCyclic,
  sessionTotals,
} from '../services/studyRhythm';

const font = tokens.typography.families.inter;

/** Moved here from study.js unchanged, emoji and all: Continuo is the rhythm
 *  that behaves exactly like the screen always did, down to this line. The
 *  cyclic modes drop it — their card is already carrying two sliders, a
 *  counter and a total. */
const sessionPhrase = (mins) => {
  if (mins < 30) return { emoji: 'relievedFace', label: 'Estudio de chill' };
  if (mins < 45) return { emoji: 'bullseye', label: 'Alto foco' };
  if (mins < 60) return { emoji: 'brain', label: 'Deep work' };
  return { emoji: 'highVoltage', label: 'Modo Schedio activado' };
};

const humanMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
};

const clockAfter = (minutes) => {
  const end = new Date(Date.now() + minutes * 60000);
  return `${end.getHours()}:${end.getMinutes().toString().padStart(2, '0')}`;
};

/** Fired into place one after another. The header stays put and the four
 *  options arrive behind it, which reads as the list coming out of the header
 *  rather than a panel appearing somewhere else. */
function Option({ label, selected, index, onPress }) {
  return (
    <Animated.View style={styles.optionWrap} entering={FadeIn.delay(index * 45).duration(220)}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        style={[styles.option, selected && styles.optionOn]}
      >
        <Text style={[styles.optionText, selected && styles.optionTextOn]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ValueSlider({ label, value, unit, min, max, step, rest, onChange }) {
  return (
    <View>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, rest && styles.valueRest]}>{value}</Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={(next) => onChange(Math.round(next))}
        minimumTrackTintColor={rest ? tokens.colors.textSecondary : tokens.colors.accent}
        maximumTrackTintColor={tokens.colors.borderDefault}
        thumbTintColor={rest ? tokens.colors.textSecondary : tokens.colors.accent}
      />
    </View>
  );
}

/**
 * Picks the rhythm, and shapes it.
 *
 * Only the *picker* collapses, never the sliders. Choosing a different rhythm
 * is the rare path; nudging your own minutes is the common one, and making
 * that cost an extra tap would be backwards. Collapsed, the header doubles as
 * the summary — and it shows the numbers, so a student's own routine reads as
 * itself (`30 · 10 ×3`) instead of hiding behind the word "Personalizado".
 */
export default function RhythmPicker({ mode, rhythm, onModeChange, onRhythmChange, startOpen }) {
  const [open, setOpen] = useState(!!startOpen);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);

  const chevron = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    // Same spring the central "+" uses in app/dashboard/_layout.js, so the
    // motion vocabulary stays one vocabulary.
    chevron.value = withSpring(open ? 1 : 0, { damping: 18, stiffness: 260, mass: 0.6 });
  }, [open, chevron]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value * 180}deg` }],
  }));

  const cyclic = isCyclic(mode);
  const preset = RHYTHMS[mode] || RHYTHMS.continuo;
  const { workMinutes, elapsedMinutes } = sessionTotals(
    cyclic ? rhythm : { ...rhythm, rest: 0, blocks: 1 }
  );

  const tap = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  };

  const choose = (next) => {
    tap();
    onModeChange(next);
    setOpen(false);
    setExplaining(false);
  };

  const summary = cyclic
    ? `${rhythm.work} · ${rhythm.rest} ×${rhythm.blocks}`
    : `${rhythm.work} min`;

  return (
    <Card padding={20}>
      <View style={styles.headRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            tap();
            setOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Ritmo: ${RHYTHM_LABELS[mode]}. Tocar para cambiar.`}
        >
          <Text style={styles.headName}>{RHYTHM_LABELS[mode]}</Text>
        </TouchableOpacity>

        {/* Only this rhythm carries one, and it sits beside the name because
            that is what it explains — at the far end it would read as help for
            the whole card. */}
        {preset.explain ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              tap();
              setExplaining((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel="Por qué este ritmo"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.info, explaining && styles.infoOn]}
          >
            <Text style={[styles.infoText, explaining && styles.infoTextOn]}>?</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            tap();
            setOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel="Cambiar ritmo"
          style={styles.headTail}
        >
          <Text style={styles.headNums}>{summary}</Text>
          <Animated.View style={chevronStyle}>
            <ChevronDown size={15} color={tokens.colors.textDisabled} strokeWidth={2} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {open ? (
        <View style={styles.options}>
          {RHYTHM_ORDER.map((key, index) => (
            <Option
              key={key}
              index={index}
              label={RHYTHM_LABELS[key]}
              selected={key === mode}
              onPress={() => choose(key)}
            />
          ))}
        </View>
      ) : null}

      {explaining ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.explain}>
          <Text style={styles.explainText}>
            <Text style={styles.explainStrong}>Nuestro ritmo, inspirado en el 52 · 17.</Text> En
            2014 DeskTime miró qué hacían distinto sus usuarios más productivos: trabajaban unos 52
            minutos seguidos y descansaban 17 de verdad, levantándose.
          </Text>
          <Text style={[styles.explainText, { marginTop: 8 }]}>
            Lo adoptamos porque mucha gente no aguanta que le corten cada 25 minutos, pero tampoco
            una hora del tirón.
          </Text>
        </Animated.View>
      ) : null}

      <View style={styles.divider} />

      <ValueSlider
        label={cyclic ? 'Trabajo' : 'Tiempo de sesión'}
        value={rhythm.work}
        unit="min"
        min={cyclic ? WORK_BOUNDS.min : CONTINUO_BOUNDS.min}
        max={cyclic ? WORK_BOUNDS.max : CONTINUO_BOUNDS.max}
        // Cyclic steps by one: at five, neither 52 nor 17 is reachable.
        step={cyclic ? 1 : CONTINUO_BOUNDS.step}
        onChange={(work) => onRhythmChange({ work })}
      />

      {cyclic ? (
        <>
          <View style={styles.divider} />
          <ValueSlider
            label="Descanso"
            value={rhythm.rest}
            unit="min"
            min={REST_BOUNDS.min}
            max={REST_BOUNDS.max}
            step={1}
            rest
            onChange={(rest) => onRhythmChange({ rest })}
          />

          <View style={styles.divider} />
          <View style={styles.blocksRow}>
            <Text style={styles.blocksLabel}>Bloques</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={rhythm.blocks <= BLOCK_BOUNDS.min}
                onPress={() => {
                  tap();
                  onRhythmChange({ blocks: rhythm.blocks - 1 });
                }}
                accessibilityLabel="Un bloque menos"
                style={[styles.stepBtn, rhythm.blocks <= BLOCK_BOUNDS.min && styles.stepBtnOff]}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{rhythm.blocks}</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={rhythm.blocks >= BLOCK_BOUNDS.max}
                onPress={() => {
                  tap();
                  onRhythmChange({ blocks: rhythm.blocks + 1 });
                }}
                accessibilityLabel="Un bloque más"
                style={[styles.stepBtn, rhythm.blocks >= BLOCK_BOUNDS.max && styles.stepBtnOff]}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.phraseRow}>
          <Emoji name={sessionPhrase(rhythm.work).emoji} size={15} />
          <Text style={styles.phrase}>{sessionPhrase(rhythm.work).label}</Text>
        </View>
      )}

      {/* One line rather than three separate figures: the wall-clock total is
          already inside "terminas a las". What matters is that the studying
          number and the clock number are visibly different. */}
      <Text style={styles.ends}>
        <Text style={styles.endsStrong}>{humanMinutes(workMinutes)}</Text> de estudio · terminas a
        las <Text style={styles.endsStrong}>{clockAfter(elapsedMinutes)}</Text>
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headName: { fontFamily: font.semibold, fontSize: 15, color: tokens.colors.textPrimary },
  headTail: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  headNums: { fontFamily: font.semibold, fontSize: 13, color: tokens.colors.textSecondary },

  info: {
    width: 22,
    height: 22,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoOn: {
    borderColor: tokens.colors.accentSoftBorder,
    backgroundColor: tokens.colors.accentSoftBg,
  },
  infoText: { fontFamily: font.semibold, fontSize: 11, color: tokens.colors.textSecondary },
  infoTextOn: { color: tokens.colors.accent },

  options: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 8 },
  optionWrap: { width: '48%', flexGrow: 1 },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceHover,
    alignItems: 'center',
  },
  optionOn: {
    borderColor: tokens.colors.accentSoftBorder,
    backgroundColor: tokens.colors.accentSoftBg,
  },
  optionText: { fontFamily: font.medium, fontSize: 13, color: tokens.colors.textSecondary },
  optionTextOn: { fontFamily: font.semibold, color: tokens.colors.textPrimary },

  explain: {
    marginTop: 14,
    padding: 14,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceHover,
  },
  explainText: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
  },
  explainStrong: { fontFamily: font.semibold, color: tokens.colors.textPrimary },

  divider: { height: 1, backgroundColor: tokens.colors.borderDefault, marginVertical: 16 },

  sliderLabel: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  value: {
    fontFamily: tokens.typography.families.display,
    fontSize: 44,
    letterSpacing: 0.5,
    color: tokens.colors.textPrimary,
  },
  valueRest: { color: tokens.colors.textSecondary },
  unit: { fontFamily: font.semibold, fontSize: 15, color: tokens.colors.textSecondary },
  slider: { width: '100%', height: 40 },

  phraseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  phrase: { fontFamily: font.semibold, fontSize: 13, color: tokens.colors.textSecondary },

  blocksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blocksLabel: { fontFamily: font.semibold, fontSize: 13, color: tokens.colors.textPrimary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: { opacity: 0.35 },
  stepBtnText: { fontFamily: font.medium, fontSize: 18, color: tokens.colors.textPrimary },
  stepValue: {
    minWidth: 34,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 17,
    color: tokens.colors.textPrimary,
  },

  ends: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  endsStrong: { fontFamily: font.semibold, color: tokens.colors.textPrimary },
});

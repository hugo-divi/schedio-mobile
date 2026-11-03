import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';
import { Toggle } from './ui/Toggle';
import useUserStore from '../store/userStore';
import useAuthStore from '../store/authStore';
import { getUpcomingExams } from '../services/exams';
import {
  DEFAULT_TIME,
  ensurePushReady,
  previewDailyReminder,
  saveDailyReminder,
  shiftTime,
  suggestReminderTime,
} from '../services/dailyReminder';

const font = tokens.typography.families.inter;
const QUICK_TIMES = ['16:00', '17:00', '18:00', '19:00', '20:00'];

/**
 * Turning the daily plan reminder on, and saying plainly what it will do.
 *
 * The rules are written out here, not buried: one push a day at this time,
 * only if something of the plan is left, quiet on free days, paused if
 * ignored. A reminder the student understands is one they keep — and the
 * preview shows today's actual sentence, built by the same code the server
 * runs (functions/dailyReminder.js).
 */
export default function DailyReminderSheet({ visible, onClose }) {
  const user = useAuthStore((state) => state.user);
  const saved = useUserStore((state) => state.profile?.dailyReminder);
  const sessions = useUserStore((state) => state.sessionHistory);
  const microplans = useUserStore((state) => state.microplans);
  const subjects = useUserStore((state) => state.subjects);
  const stats = useUserStore((state) => state.stats);

  const suggested = useMemo(() => suggestReminderTime(sessions), [sessions]);
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [includeFreeDays, setIncludeFreeDays] = useState(false);
  const [exams, setExams] = useState([]);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);

  // Every opening starts from what is saved — or, the first time, on and at
  // the suggested time, since opening this is already saying "yes".
  useEffect(() => {
    if (!visible) return;
    setEnabled(saved ? saved.enabled : true);
    setTime(saved?.time || suggested);
    setIncludeFreeDays(!!saved?.includeFreeDays);
    setProblem(null);
  }, [visible, saved, suggested]);

  useEffect(() => {
    if (!visible || !user?.uid) return;
    let cancelled = false;
    getUpcomingExams(user.uid, 20)
      .then((list) => {
        if (cancelled) return;
        setExams(
          (list || []).map((exam) => ({
            ...exam,
            subjectName: subjects.find((s) => s.id === exam.subjectId)?.name,
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, user?.uid, subjects]);

  const preview = useMemo(
    () => previewDailyReminder({ microplans, exams, stats, includeFreeDays }),
    [microplans, exams, stats, includeFreeDays]
  );

  const save = async () => {
    if (!user?.uid) return;
    setSaving(true);
    setProblem(null);
    try {
      if (enabled) {
        const ready = await ensurePushReady(user.uid);
        if (ready === 'install') {
          setProblem(
            'En iPhone, primero añade Schedio a tu pantalla de inicio (Compartir → "Añadir a pantalla de inicio") y ábrelo desde ahí.'
          );
          return;
        }
        if (ready === 'denied') {
          setProblem(
            'Las notificaciones están desactivadas para Schedio. Actívalas en los ajustes del móvil y vuelve a intentarlo.'
          );
          return;
        }
      }
      await saveDailyReminder(user.uid, { enabled, time, includeFreeDays });
      onClose();
    } catch {
      setProblem('No se ha podido guardar. Comprueba tu conexión y vuelve a probar.');
    } finally {
      setSaving(false);
    }
  };

  const times = QUICK_TIMES.includes(suggested) ? QUICK_TIMES : [suggested, ...QUICK_TIMES];

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Recordatorio diario"
      subtitle="Una vez al día, a tu hora, con lo que te toca estudiar."
    >
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Activado</Text>
        <Toggle value={enabled} onValueChange={setEnabled} />
      </View>

      <View
        style={[styles.block, !enabled && styles.dimmed]}
        pointerEvents={enabled ? 'auto' : 'none'}
      >
        <View style={styles.timeRow}>
          <TouchableOpacity
            onPress={() => setTime((t) => shiftTime(t, -1))}
            style={styles.step}
            accessibilityRole="button"
            accessibilityLabel="Un cuarto de hora antes"
          >
            <Minus size={18} color={tokens.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.time} accessibilityLabel={`A las ${time}`}>
            {time}
          </Text>
          <TouchableOpacity
            onPress={() => setTime((t) => shiftTime(t, 1))}
            style={styles.step}
            accessibilityRole="button"
            accessibilityLabel="Un cuarto de hora después"
          >
            <Plus size={18} color={tokens.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.chips}>
          {times.map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => setTime(option)}
              style={[styles.chip, time === option && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: time === option }}
            >
              <Text style={[styles.chipText, time === option && styles.chipTextOn]}>
                {option}
                {option === suggested ? ' · tu hora' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.toggleLabel}>También en mis días libres</Text>
            <Text style={styles.toggleHint}>Los avisos de examen llegan siempre.</Text>
          </View>
          <Toggle value={includeFreeDays} onValueChange={setIncludeFreeDays} />
        </View>

        <Text style={styles.label}>Así te llegaría hoy</Text>
        <View style={styles.preview}>
          <View style={styles.previewHead}>
            <View style={styles.previewIcon}>
              <Image
                source={require('../assets/images/schedio-mark.png')}
                style={styles.previewMark}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.previewApp}>Schedio · {time}</Text>
          </View>
          {preview.title ? <Text style={styles.previewTitle}>{preview.title}</Text> : null}
          <Text style={styles.previewBody}>{preview.body}</Text>
        </View>

        <Text style={styles.label}>Cómo funciona</Text>
        <View style={styles.rules}>
          {[
            'Solo si te queda algo del plan ese día. Si ya lo has hecho, no te escribo.',
            'Una sola notificación al día: si tienes un examen a 1 o 3 días, va en esa misma.',
            'Los domingos, si no queda nada, te cuento cómo ha ido la semana.',
            'Si dejas de abrir la app varios días, paro hasta que vuelvas.',
          ].map((rule) => (
            <View key={rule} style={styles.rule}>
              <View style={styles.ruleDot} />
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>
      </View>

      {problem ? <Text style={styles.problem}>{problem}</Text> : null}

      <Button title="Guardar" fullWidth loading={saving} onPress={save} style={{ marginTop: 16 }} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 4 },
  dimmed: { opacity: 0.4 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  toggleLabel: { fontFamily: font.medium, fontSize: 15, color: tokens.colors.textPrimary },
  toggleHint: {
    fontFamily: font.regular,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    marginTop: 4,
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    fontFamily: tokens.typography.families.display,
    fontSize: 48,
    letterSpacing: 1,
    color: tokens.colors.textPrimary,
    minWidth: 130,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  chipOn: { borderColor: tokens.colors.accent, backgroundColor: tokens.colors.accentSoftBg },
  chipText: { fontFamily: font.medium, fontSize: 13, color: tokens.colors.textSecondary },
  chipTextOn: { color: tokens.colors.accent },
  label: {
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.colors.textSecondary,
    marginTop: 14,
    marginBottom: 8,
  },
  preview: {
    padding: 14,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.colors.surfaceHover,
    gap: 4,
  },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  previewIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewMark: { width: 14, height: 14 },
  previewApp: { fontFamily: font.medium, fontSize: 12, color: tokens.colors.textSecondary },
  previewTitle: { fontFamily: font.semibold, fontSize: 15, color: tokens.colors.textPrimary },
  previewBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 19,
    color: tokens.colors.textPrimary,
  },
  rules: { gap: 8 },
  rule: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  ruleDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: tokens.colors.accent,
    marginTop: 7,
  },
  ruleText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
  },
  problem: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.danger,
    marginTop: 12,
  },
});

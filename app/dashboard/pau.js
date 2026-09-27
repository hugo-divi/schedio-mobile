import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import Slider from '@react-native-community/slider';

import { tokens } from '../../theme/tokens';
import useUserStore from '../../store/userStore';
import { showsPau } from '../../services/pau';
import {
  DEFAULT_WEIGHT,
  WEIGHTING_MIN_MARK,
  buildExamRows,
  computeMarks,
  cooficialFor,
  improvableSubjects,
  neededPauAverage,
} from '../../services/pauGrades';
import Card from '../../components/ui/Card';
import { OverlineLabel } from '../../components/ui/SectionTitle';

const font = tokens.typography.families.inter;

const one = (value) => Number(value).toFixed(1).replace('.', ',');
const two = (value) => Number(value).toFixed(2).replace('.', ',');
/** Tres decimales, como expresa la nota el decreto (art. 15.1): el estudiante
 *  que compare esto con su papeleta de junio tiene que ver el mismo número. */
const three = (value) => Number(value).toFixed(3).replace('.', ',');

/** Las ponderaciones que ofrecen casi todas las universidades. */
const WEIGHTS = [0.1, 0.2];

/**
 * Una nota que se ajusta. Deslizador y no campo numérico por lo mismo que en
 * Perfil → Materias: aquí hay hasta siete, y siete teclados numéricos seguidos
 * no los rellena nadie.
 */
function MarkRow({ name, source, value, onChange, accessibilityLabel }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
        </Text>
        {source ? <Text style={styles.rowSource}>{source}</Text> : null}
        <Text style={styles.rowValue}>{one(value)}</Text>
      </View>
      <Slider
        minimumValue={0}
        maximumValue={10}
        step={0.1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={tokens.colors.accent}
        maximumTrackTintColor={tokens.colors.surfaceHover}
        thumbTintColor={tokens.colors.accent}
        accessibilityLabel={accessibilityLabel || name}
      />
    </View>
  );
}

/**
 * La calculadora de la nota de la PAU.
 *
 * Llega ya rellenada con lo que la app sabe —la nota que dio en el onboarding,
 * su media actual y los objetivos que puso en Perfil → Materias—, y cada fila
 * dice de dónde sale su número. Nada se pregunta dos veces: si quiere cambiar
 * un objetivo para siempre, el sitio sigue siendo sus materias.
 *
 * No guarda nada. Es una cuenta, no un dato: lo que el estudiante mueva aquí
 * son suposiciones sobre junio, y convertirlas en estado sería inventarle un
 * segundo sitio donde vive su objetivo.
 */
export default function PauCalculator() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const profile = useUserStore((state) => state.profile);
  const subjects = useUserStore((state) => state.subjects);

  const applies = showsPau(profile);
  const region = profile?.region || null;
  const cooficialName = cooficialFor(region);

  // Nadie debería llegar aquí sin la casilla marcada, pero la ruta existe y un
  // enlace viejo o el historial pueden traer a cualquiera.
  useEffect(() => {
    if (profile && !applies) router.replace('/dashboard/profile');
  }, [profile, applies, router]);

  const fallback = profile?.averageGrade > 0 ? profile.averageGrade : 6;

  const [first, setFirst] = useState(() => Number(profile?.grade) || fallback);
  const [second, setSecond] = useState(fallback);
  const [cooficial, setCooficial] = useState(false);
  const [weight, setWeight] = useState(DEFAULT_WEIGHT);
  const [mode, setMode] = useState('nota');
  const [target, setTarget] = useState(10.5);

  const baseRows = useMemo(
    () => buildExamRows({ subjects, region, includeCooficial: cooficial, fallback }),
    [subjects, region, cooficial, fallback]
  );
  // Los ajustes del estudiante viven aparte de las filas calculadas, por
  // nombre: así añadir o quitar la lengua cooficial no borra lo que ya había
  // movido en las otras.
  const [edited, setEdited] = useState({});
  const rows = baseRows.map((row) => ({ ...row, mark: edited[row.name] ?? row.mark }));

  const extras = useMemo(() => improvableSubjects(subjects, rows), [subjects, rows]);
  const [extraName, setExtraName] = useState(null);
  const extra = extras.find((s) => s.name === extraName) || null;
  const extraMark = extra ? (edited[extra.name] ?? (Number(extra.targetGrade) || fallback)) : null;

  const marks = computeMarks({ first, second, rows, extraMark, weight });
  const needed = neededPauAverage({ target, first, second, extraMark, weight });

  if (!applies) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} strokeWidth={1.75} />
        </TouchableOpacity>
        <Text style={styles.title}>Tu nota PAU</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.segment} accessibilityRole="tablist">
          {[
            ['nota', 'Mi nota'],
            ['necesito', '¿Qué necesito?'],
          ].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setMode(key)}
              style={[styles.segmentItem, mode === key && styles.segmentItemOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === key }}
            >
              <Text style={[styles.segmentText, mode === key && styles.segmentTextOn]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'necesito' ? (
          <Card padding={16}>
            <View style={styles.blockHead}>
              <OverlineLabel>Nota que quieres</OverlineLabel>
              <Text style={styles.blockSum}>{one(target)}</Text>
            </View>
            <Slider
              minimumValue={5}
              maximumValue={14}
              step={0.1}
              value={target}
              onValueChange={setTarget}
              minimumTrackTintColor={tokens.colors.accent}
              maximumTrackTintColor={tokens.colors.surfaceHover}
              thumbTintColor={tokens.colors.accent}
              accessibilityLabel="Nota de admisión que quieres"
            />
            <Text style={styles.needText}>
              {needed > 10
                ? `Con estas notas no se llega solo con la PAU: harían falta ${two(needed)} de media. Sube la materia con la que mejoras nota, o elige una que pondere más.`
                : needed <= marks.pauAvg
                  ? `Necesitas ${two(Math.max(needed, 4))} de media en la fase de acceso. Con tus objetivos ya llegas: vas por ${two(marks.pauAvg)}.`
                  : `Necesitas ${two(needed)} de media en la fase de acceso. Con tus objetivos vas por ${two(marks.pauAvg)}: te faltan ${two(needed - marks.pauAvg)} puntos.`}
            </Text>
          </Card>
        ) : null}

        <Card padding={16}>
          <View style={styles.blockHead}>
            <OverlineLabel>Bachillerato</OverlineLabel>
            <Text style={styles.blockSum}>{two(marks.bachAvg)}</Text>
          </View>
          <MarkRow name="Media de 1º" source="onboarding" value={first} onChange={setFirst} />
          <MarkRow name="Media de 2º" source="tu media" value={second} onChange={setSecond} />
        </Card>

        <Card padding={16}>
          <View style={styles.blockHead}>
            <OverlineLabel>Fase de acceso</OverlineLabel>
            <Text style={styles.blockSum}>{two(marks.pauAvg)}</Text>
          </View>

          {/* Solo donde hay lengua cooficial, y nunca marcada sola: en Navarra
              el euskera lo es en parte del territorio, y el estudiante es quien
              sabe si se examina. */}
          {cooficialName ? (
            <TouchableOpacity
              onPress={() => setCooficial((prev) => !prev)}
              style={styles.check}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: cooficial }}
            >
              <View style={[styles.checkBox, cooficial && styles.checkBoxOn]}>
                {cooficial ? <Check size={11} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.checkText, cooficial && styles.checkTextOn]}>
                Me examino también de {cooficialName.replace(' II', '').toLowerCase()}
              </Text>
            </TouchableOpacity>
          ) : null}

          {rows.map((row) => (
            <MarkRow
              key={row.name}
              name={row.name}
              source={row.source === 'objetivo' ? 'objetivo' : null}
              value={row.mark}
              onChange={(value) => setEdited((prev) => ({ ...prev, [row.name]: value }))}
            />
          ))}
        </Card>

        <Card padding={16}>
          <View style={styles.blockHead}>
            <OverlineLabel>Para subir nota</OverlineLabel>
            {extra ? <Text style={styles.blockSum}>{one(extraMark)}</Text> : null}
          </View>
          <Text style={styles.blockHint}>
            Una materia. Se pueden hacer más, pero casi todo el mundo va a por una.
          </Text>

          <View style={styles.chips}>
            {extras.map((subject) => {
              const on = subject.name === extraName;
              return (
                <TouchableOpacity
                  key={subject.id || subject.name}
                  onPress={() => setExtraName(on ? null : subject.name)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{subject.name}</Text>
                </TouchableOpacity>
              );
            })}
            {extras.length === 0 ? (
              <Text style={styles.blockHint}>
                No te quedan materias libres: las que tienes ya están en la fase de acceso.
              </Text>
            ) : null}
          </View>

          {extra ? (
            <>
              <MarkRow
                name={extra.name}
                source={extra.targetGrade ? 'objetivo' : null}
                value={extraMark}
                onChange={(value) => setEdited((prev) => ({ ...prev, [extra.name]: value }))}
              />
              <View style={styles.weights}>
                <Text style={styles.weightLabel}>Pondera</Text>
                {WEIGHTS.map((value) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setWeight(value)}
                    style={[styles.weight, weight === value && styles.weightOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: weight === value }}
                  >
                    <Text
                      style={[styles.weightText, weight === value && styles.weightTextOn]}
                    >{`0,${value * 10}`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* La ley ya no fija las ponderaciones: desde 2025 las publica
                  cada universidad al empezar el curso (art. 22). */}
              <Text style={styles.blockHint}>Compruébalo en tu universidad.</Text>
            </>
          ) : null}
        </Card>

        <View style={styles.result}>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Nota de acceso</Text>
            <Text style={styles.resultValue}>{three(marks.access)}</Text>
          </View>
          <View style={[styles.resultRow, styles.resultRowSecond]}>
            <Text style={styles.resultLabel}>Nota de admisión</Text>
            <Text style={[styles.resultValue, styles.resultValueBig]}>
              {three(marks.admission)}
            </Text>
          </View>

          <View style={styles.badges}>
            <View style={[styles.badge, !marks.meetsPau && styles.badgeBad]}>
              <Text style={[styles.badgeText, !marks.meetsPau && styles.badgeTextBad]}>
                {marks.meetsPau ? '✓' : '✕'} PAU {two(marks.pauAvg)} · mínimo 4
              </Text>
            </View>
            <View style={[styles.badge, !marks.meetsAccess && styles.badgeBad]}>
              <Text style={[styles.badgeText, !marks.meetsAccess && styles.badgeTextBad]}>
                {marks.meetsAccess ? '✓' : '✕'} Acceso · mínimo 5
              </Text>
            </View>
            {extra && !marks.extraCounts ? (
              <View style={[styles.badge, styles.badgeBad]}>
                <Text style={[styles.badgeText, styles.badgeTextBad]}>
                  {extra.name} no pondera: menos de {WEIGHTING_MIN_MARK}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.foot}>
          Una estimación con tus objetivos, no una predicción. La media de Bachillerato es
          aproximada: la de verdad sale de todas las materias de los dos cursos.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  back: { padding: 6 },
  title: { fontFamily: font.bold, fontSize: 20, color: tokens.colors.textPrimary },
  content: { paddingHorizontal: 20, gap: 12 },

  segment: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: tokens.radius.btn,
    alignItems: 'center',
  },
  segmentItemOn: { backgroundColor: tokens.colors.surfaceHover },
  segmentText: { fontFamily: font.semibold, fontSize: 13, color: tokens.colors.textSecondary },
  segmentTextOn: { color: tokens.colors.textPrimary },

  blockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  blockSum: {
    fontFamily: tokens.typography.families.display,
    fontSize: 22,
    color: tokens.colors.textPrimary,
  },
  blockHint: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },

  row: { marginTop: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.medium,
    fontSize: 13.5,
    color: tokens.colors.textPrimary,
  },
  rowSource: {
    fontFamily: font.semibold,
    fontSize: 9.5,
    color: tokens.colors.textSecondary,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  rowValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 19,
    color: tokens.colors.textPrimary,
    minWidth: 38,
    textAlign: 'right',
  },

  check: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: tokens.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: tokens.colors.accent, borderColor: tokens.colors.accent },
  checkText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 12.5,
    color: tokens.colors.textSecondary,
  },
  checkTextOn: { color: tokens.colors.textPrimary },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  chip: {
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { borderColor: tokens.colors.accent, backgroundColor: tokens.colors.accentSoftBg },
  chipText: { fontFamily: font.medium, fontSize: 12.5, color: tokens.colors.textSecondary },
  chipTextOn: { color: tokens.colors.textPrimary },

  weights: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  weightLabel: { fontFamily: font.regular, fontSize: 12, color: tokens.colors.textSecondary },
  weight: {
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  weightOn: { borderColor: tokens.colors.accent, backgroundColor: tokens.colors.accentSoftBg },
  weightText: { fontFamily: font.medium, fontSize: 12.5, color: tokens.colors.textSecondary },
  weightTextOn: { color: tokens.colors.textPrimary },

  result: {
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
    borderRadius: tokens.radius.card,
    padding: 16,
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  resultRowSecond: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
  },
  resultLabel: { fontFamily: font.regular, fontSize: 13, color: tokens.colors.textSecondary },
  resultValue: {
    fontFamily: tokens.typography.families.display,
    fontSize: 30,
    color: tokens.colors.textPrimary,
  },
  resultValueBig: { fontSize: 38, color: tokens.colors.trendUp },

  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  badge: {
    borderWidth: 1,
    borderColor: tokens.colors.trendUp,
    backgroundColor: 'transparent',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeBad: { borderColor: tokens.colors.danger },
  badgeText: { fontFamily: font.semibold, fontSize: 10.5, color: tokens.colors.trendUp },
  badgeTextBad: { color: tokens.colors.danger },

  needText: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: tokens.colors.textSecondary,
    marginTop: 8,
  },
  foot: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 16,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
});
